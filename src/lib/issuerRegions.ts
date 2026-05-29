import {
  Connection,
  PublicKey,
  TransactionInstruction,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { appBasePath } from "./appBasePath";

export const ISSUER_REGION_MEMO_PREFIX = "aicw-reg:";
export const ISSUER_REGIONS_STORAGE_KEY = "aicw_issuer_regions_v1";
/** SPL Memo program (devnet/mainnet). */
export const MEMO_PROGRAM_ID_STR = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

function memoProgramId(): PublicKey {
  return new PublicKey(MEMO_PROGRAM_ID_STR);
}

function isIsoCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code);
}

export function countryCodeToFlagEmoji(code: string | null | undefined): string {
  if (!code || !isIsoCountryCode(code.toUpperCase())) return "—";
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...[...upper].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)),
  );
}

/** PNG flag URL (Windows and some browsers render flag emoji as two-letter codes). */
export function countryCodeToFlagImageUrl(code: string | null | undefined): string | null {
  if (!code || !isIsoCountryCode(code.toUpperCase())) return null;
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

export function countryDisplayName(code: string | null | undefined): string {
  if (!code || !isIsoCountryCode(code.toUpperCase())) return "Unknown region";
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ??
      code.toUpperCase()
    );
  } catch {
    return code.toUpperCase();
  }
}

export function buildRegionMemoInstruction(
  signer: PublicKey,
  countryCode: string,
): TransactionInstruction {
  const code = countryCode.toUpperCase().slice(0, 2);
  return new TransactionInstruction({
    programId: memoProgramId(),
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(`${ISSUER_REGION_MEMO_PREFIX}${code}`, "utf8"),
  });
}

function parseRegionFromMemoText(text: string): string | null {
  if (!text.startsWith(ISSUER_REGION_MEMO_PREFIX)) return null;
  const code = text.slice(ISSUER_REGION_MEMO_PREFIX.length).trim().toUpperCase();
  return isIsoCountryCode(code) ? code : null;
}

function parseRegionFromInstruction(
  ix: ParsedInstruction | PartiallyDecodedInstruction,
): string | null {
  if ("parsed" in ix) {
    if (typeof ix.parsed === "string") {
      return parseRegionFromMemoText(ix.parsed);
    }
    if (
      ix.parsed &&
      typeof ix.parsed === "object" &&
      "info" in ix.parsed &&
      typeof (ix.parsed as { info?: unknown }).info === "string"
    ) {
      return parseRegionFromMemoText((ix.parsed as { info: string }).info);
    }
  }
  if ("data" in ix && typeof ix.data === "string") {
    try {
      const text = Buffer.from(ix.data, "base64").toString("utf8");
      return parseRegionFromMemoText(text);
    } catch {
      return null;
    }
  }
  return null;
}

export function readCachedIssuerRegions(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ISSUER_REGIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [pda, code] of Object.entries(parsed)) {
      if (isIsoCountryCode(String(code).toUpperCase())) {
        out[pda] = String(code).toUpperCase();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function cacheIssuerRegion(aicwPda: string, countryCode: string): void {
  if (typeof window === "undefined") return;
  const code = countryCode.toUpperCase().slice(0, 2);
  if (!isIsoCountryCode(code)) return;
  const prev = readCachedIssuerRegions();
  prev[aicwPda] = code;
  window.localStorage.setItem(ISSUER_REGIONS_STORAGE_KEY, JSON.stringify(prev));
}

function mpcBridgeBase(): string {
  return (process.env.NEXT_PUBLIC_MPC_BRIDGE_URL || "").trim().replace(/\/$/, "");
}

/** Central registry on MPC Bridge (all browsers / machines). */
export async function loadBridgeIssuerRegions(): Promise<Record<string, string>> {
  const base = mpcBridgeBase();
  if (!base) return {};
  try {
    const res = await fetch(`${base}/v1/mpc/issuer-regions`, { cache: "no-store" });
    if (!res.ok) return {};
    const json = (await res.json()) as { regions?: Record<string, string> };
    const parsed = json.regions ?? {};
    const out: Record<string, string> = {};
    for (const [pda, code] of Object.entries(parsed)) {
      if (isIsoCountryCode(String(code).toUpperCase())) {
        out[pda] = String(code).toUpperCase();
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Static JSON (build-time index) + Bridge registry. */
export async function loadAllSharedIssuerRegions(): Promise<Record<string, string>> {
  const [staticMap, bridgeMap] = await Promise.all([
    loadStaticIssuerRegions(),
    loadBridgeIssuerRegions(),
  ]);
  return { ...staticMap, ...bridgeMap };
}

export async function loadStaticIssuerRegions(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  try {
    const res = await fetch(`${appBasePath()}/issuer-regions.json`, {
      cache: "no-store",
    });
    if (!res.ok) return {};
    const parsed = (await res.json()) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [pda, code] of Object.entries(parsed)) {
      if (isIsoCountryCode(String(code).toUpperCase())) {
        out[pda] = String(code).toUpperCase();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function fetchVisitorCountryCode(): Promise<string | null> {
  try {
    const res = await fetch("https://api.country.is/", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { country?: string };
      const code = data.country?.toUpperCase();
      if (code && isIsoCountryCode(code)) return code;
    }
  } catch {
    // fall through
  }

  try {
    const res = await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
      cache: "no-store",
    });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/^loc=([A-Z]{2})$/m);
      if (match && isIsoCountryCode(match[1])) return match[1];
    }
  } catch {
    // fall through
  }

  return null;
}

function scanMemoInstructions(
  list: (ParsedInstruction | PartiallyDecodedInstruction)[],
): string | null {
  for (const ix of list) {
    if (ix.programId.equals(memoProgramId())) {
      const code = parseRegionFromInstruction(ix);
      if (code) return code;
    }
  }
  return null;
}

export async function fetchIssuerRegionFromChain(
  connection: Connection,
  aicwPda: string,
): Promise<string | null> {
  const pk = new PublicKey(aicwPda);
  const sigs = await connection.getSignaturesForAddress(pk, { limit: 100 });
  if (!sigs.length) return null;

  const ordered = [...sigs].reverse();
  const maxScan = Math.min(ordered.length, 8);

  for (let i = 0; i < maxScan; i++) {
    const signature = ordered[i]?.signature;
    if (!signature) continue;

    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!tx) continue;

    const top = scanMemoInstructions(tx.transaction.message.instructions);
    if (top) return top;

    for (const inner of tx.meta?.innerInstructions ?? []) {
      const code = scanMemoInstructions(inner.instructions);
      if (code) return code;
    }
  }

  return null;
}

/** Register PDA→country on MPC Bridge so every Explorer client sees the flag. */
export async function persistIssuerRegionShared(
  aicwPda: string,
  countryCode: string,
): Promise<boolean> {
  cacheIssuerRegion(aicwPda, countryCode);
  const code = countryCode.toUpperCase().slice(0, 2);
  if (!isIsoCountryCode(code)) return false;

  const base = mpcBridgeBase();
  if (!base) return false;

  try {
    const res = await fetch(`${base}/v1/mpc/issuer-regions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aicwPda, countryCode: code }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
