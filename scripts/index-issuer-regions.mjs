/**
 * Build-time indexer: PDA -> ISO country from on-chain issuance memo (aicw-reg:XX).
 * Output: public/issuer-regions.json (served to all Explorer users on GitHub Pages).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "public", "issuer-regions.json");
const IDL_PATH = path.join(ROOT, "src", "idl", "aicw.json");

const ISSUER_REGION_MEMO_PREFIX = "aicw-reg:";
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_AICW_PROGRAM_ID || "9RUEw4jcMi8xcGf3tJRCAdzUzLuhEurts8Z2QQLsRbaV",
);

function isIso(code) {
  return /^[A-Z]{2}$/.test(code);
}

function parseMemoText(text) {
  if (!text.startsWith(ISSUER_REGION_MEMO_PREFIX)) return null;
  const code = text.slice(ISSUER_REGION_MEMO_PREFIX.length).trim().toUpperCase();
  return isIso(code) ? code : null;
}

function parseRegionFromInstruction(ix) {
  if (ix.parsed && typeof ix.parsed === "string") {
    return parseMemoText(ix.parsed);
  }
  if (
    ix.parsed &&
    typeof ix.parsed === "object" &&
    ix.parsed.info &&
    typeof ix.parsed.info === "string"
  ) {
    return parseMemoText(ix.parsed.info);
  }
  if (ix.data && typeof ix.data === "string") {
    try {
      const text = Buffer.from(ix.data, "base64").toString("utf8");
      return parseMemoText(text);
    } catch {
      return null;
    }
  }
  return null;
}

function scanInstructions(list) {
  for (const ix of list) {
    if (!ix.programId.equals(MEMO_PROGRAM_ID)) continue;
    const code = parseRegionFromInstruction(ix);
    if (code) return code;
  }
  return null;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, retries = 5) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/429|too many requests/i.test(msg) || i === retries) throw e;
      await sleep(500 * 2 ** i + Math.floor(Math.random() * 200));
    }
  }
  throw last;
}

async function fetchRegionFromChain(connection, aicwPda) {
  const pk = new PublicKey(aicwPda);
  const sigs = await withRetry(() =>
    connection.getSignaturesForAddress(pk, { limit: 100 }),
  );
  if (!sigs.length) return null;

  const ordered = [...sigs].reverse();
  const maxScan = Math.min(ordered.length, 8);

  for (let i = 0; i < maxScan; i++) {
    const signature = ordered[i]?.signature;
    if (!signature) continue;
    const tx = await withRetry(() =>
      connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      }),
    );
    if (!tx) continue;

    const top = scanInstructions(tx.transaction.message.instructions);
    if (top) return top;
    for (const inner of tx.meta?.innerInstructions ?? []) {
      const code = scanInstructions(inner.instructions);
      if (code) return code;
    }
    await sleep(120);
  }
  return null;
}

function loadExisting() {
  try {
    const raw = fs.readFileSync(OUT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out = {};
    for (const [pda, code] of Object.entries(parsed)) {
      const upper = String(code).toUpperCase();
      if (isIso(upper)) out[pda] = upper;
    }
    return out;
  } catch {
    return {};
  }
}

async function main() {
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const connection = new Connection(RPC, "confirmed");
  const wallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(
    { ...idl, address: PROGRAM_ID.toBase58() },
    provider,
  );

  const accounts = await withRetry(() => program.account.aicWallet.all());
  const merged = loadExisting();
  let added = 0;
  let scanned = 0;

  console.log(`[index-issuer-regions] ${accounts.length} AICW wallets on ${RPC}`);

  for (const { publicKey } of accounts) {
    const pda = publicKey.toBase58();
    if (merged[pda]) {
      scanned++;
      continue;
    }
    const code = await fetchRegionFromChain(connection, pda);
    scanned++;
    if (code) {
      merged[pda] = code;
      added++;
      console.log(`  + ${pda.slice(0, 8)}… -> ${code}`);
    }
    await sleep(280);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(
    `[index-issuer-regions] wrote ${Object.keys(merged).length} entries (${added} new), scanned ${scanned}`,
  );
}

main().catch((err) => {
  console.error("[index-issuer-regions] failed:", err);
  process.exit(1);
});
