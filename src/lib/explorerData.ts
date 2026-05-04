import type { BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  findAiWillPda,
  getAicwConnection,
  getReadOnlyAicwProgram,
} from "./aicwChain";

/** Runtime namespace uses `aicWallet` for account `AICWallet`; raw `Idl` typing omits it. */
type AicwProgramAccounts = {
  aicWallet: {
    all(): Promise<{ publicKey: PublicKey; account: unknown }[]>;
    fetch(address: PublicKey): Promise<unknown>;
  };
  aiWill: {
    fetch(address: PublicKey): Promise<unknown>;
  };
};

function programAccounts(program: ReturnType<typeof getReadOnlyAicwProgram>): AicwProgramAccounts {
  return program.account as unknown as AicwProgramAccounts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("429") || /too many requests/i.test(msg);
}

/** Softens public-RPC 429s on burst reads (getBalance, getProgramAccounts, etc.). */
export async function withRpcRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 6;
  const baseMs = opts?.baseMs ?? 500;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRateLimited(e) || attempt === retries) throw e;
      const delay = baseMs * 2 ** attempt + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }
  throw last;
}

/** Batch-fetch native SOL (lamports) per account address (one RPC per chunk). */
async function lamportsByPubkeyBatched(
  connection: Connection,
  pubkeys: PublicKey[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const chunkSize = 100;
  for (let i = 0; i < pubkeys.length; i += chunkSize) {
    const chunk = pubkeys.slice(i, i + chunkSize);
    const infos = await withRpcRetry(() => connection.getMultipleAccountsInfo(chunk));
    chunk.forEach((pk, idx) => {
      const info = infos[idx];
      out.set(pk.toBase58(), info?.lamports ?? 0);
    });
    if (i + chunkSize < pubkeys.length) await sleep(120);
  }
  return out;
}

export type WillStatus = "Alive" | "Dead" | "Executed";

export interface ExplorerRow {
  /** AICW PDA */
  aicwPda: string;
  aiAgentPubkey: string;
  balanceLamports: number;
  beneficiariesText: string;
  /** On-chain order; `execute_will` remaining accounts must match 1:1 (writable). */
  willBeneficiaries: { pubkey: PublicKey; pct: number }[];
  willActivated: boolean;
  willExecuted: boolean;
  lastHeartbeatUnix: number | null;
  issuerPubkey: string;
  totalTransactions: string;
  totalVolumeLamports: string;
  decisionsMade: string;
  decisionsRejected: string;
  createdAtUnix: number;
  deathTimeoutSeconds: number;
  status: WillStatus;
}

function bnToStr(b: BN | bigint | number): string {
  if (typeof b === "bigint" || typeof b === "number") return String(b);
  return b.toString();
}

function bnToNum(b: BN): number {
  return b.toNumber();
}

function formatBeneficiaries(
  list: { pubkey: PublicKey; pct: number }[],
): string {
  if (!list?.length) return "—";
  return list
    .map(
      (b) =>
        `${b.pubkey.toBase58().slice(0, 4)}…${b.pubkey.toBase58().slice(-4)} ${b.pct}%`,
    )
    .join(", ");
}

export function computeWillStatus(
  lastHeartbeat: BN,
  deathTimeout: BN,
  isExecuted: boolean,
): WillStatus {
  if (isExecuted) return "Executed";
  const now = Math.floor(Date.now() / 1000);
  const last = lastHeartbeat.toNumber();
  const timeout = deathTimeout.toNumber();
  if (timeout <= 0) return "Alive";
  if (last <= 0) return "Alive";
  if (now > last + timeout) return "Dead";
  return "Alive";
}

/** One `getProgramAccounts` result row (AICWallet only; will is loaded per page). */
export type AicwWalletEntry = { publicKey: PublicKey; account: unknown };

export const EXPLORER_PAGE_SIZE = 20;

/** Columns that can be sorted without loading every wallet’s AIWill (AICWallet fields only). */
export type ExplorerListSortKey =
  | "aiAgentPubkey"
  | "issuerPubkey"
  | "totalTransactions"
  | "totalVolumeLamports"
  | "decisionsMade"
  | "decisionsRejected"
  | "createdAtUnix";

type AicwAcctShape = {
  aiAgentPubkey: PublicKey;
  issuerPubkey: PublicKey;
  createdAt: BN;
  totalTransactions: BN;
  totalVolume: BN;
  decisionsMade: BN;
  decisionsRejected: BN;
};

function asAicwAcct(account: unknown): AicwAcctShape {
  return account as AicwAcctShape;
}

/** Newest issuance first (default Explorer ordering). */
export async function loadAicwWalletEntriesSorted(): Promise<AicwWalletEntry[]> {
  const connection = getAicwConnection();
  const program = getReadOnlyAicwProgram(connection);
  const acct = programAccounts(program);
  const wallets = await withRpcRetry(() => acct.aicWallet.all());
  return [...wallets].sort((x, y) => {
    const cx = asAicwAcct(x.account).createdAt.toNumber();
    const cy = asAicwAcct(y.account).createdAt.toNumber();
    return cy - cx;
  });
}

export function compareAicwEntries(
  a: AicwWalletEntry,
  b: AicwWalletEntry,
  key: ExplorerListSortKey,
  dir: 1 | -1,
): number {
  const mul = dir;
  const aa = asAicwAcct(a.account);
  const bb = asAicwAcct(b.account);
  switch (key) {
    case "aiAgentPubkey":
      return aa.aiAgentPubkey.toBase58().localeCompare(bb.aiAgentPubkey.toBase58()) * mul;
    case "issuerPubkey":
      return aa.issuerPubkey.toBase58().localeCompare(bb.issuerPubkey.toBase58()) * mul;
    case "totalTransactions": {
      const dx =
        BigInt(bnToStr(aa.totalTransactions)) - BigInt(bnToStr(bb.totalTransactions));
      if (dx === BigInt(0)) return 0;
      return dx > BigInt(0) ? mul : -mul;
    }
    case "totalVolumeLamports": {
      const dx = BigInt(bnToStr(aa.totalVolume)) - BigInt(bnToStr(bb.totalVolume));
      if (dx === BigInt(0)) return 0;
      return dx > BigInt(0) ? mul : -mul;
    }
    case "decisionsMade": {
      const dx = BigInt(bnToStr(aa.decisionsMade)) - BigInt(bnToStr(bb.decisionsMade));
      if (dx === BigInt(0)) return 0;
      return dx > BigInt(0) ? mul : -mul;
    }
    case "decisionsRejected": {
      const dx =
        BigInt(bnToStr(aa.decisionsRejected)) - BigInt(bnToStr(bb.decisionsRejected));
      if (dx === BigInt(0)) return 0;
      return dx > BigInt(0) ? mul : -mul;
    }
    case "createdAtUnix":
      return (aa.createdAt.toNumber() - bb.createdAt.toNumber()) * mul;
    default:
      return 0;
  }
}

/** Search without AIWill: addresses, counters, created time (beneficiaries/status need per-page load). */
export function aicwEntryMatchesQuery(entry: AicwWalletEntry, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  const a = asAicwAcct(entry.account);
  const hay = [
    a.aiAgentPubkey.toBase58(),
    a.issuerPubkey.toBase58(),
    entry.publicKey.toBase58(),
    bnToStr(a.totalTransactions),
    bnToStr(a.totalVolume),
    bnToStr(a.decisionsMade),
    bnToStr(a.decisionsRejected),
    String(a.createdAt.toNumber()),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(s);
}

/** Fetch AIWill + agent SOL balance only for the given page slice (bounded RPC). */
export async function hydrateExplorerPage(entries: AicwWalletEntry[]): Promise<ExplorerRow[]> {
  if (entries.length === 0) return [];
  const connection = getAicwConnection();
  const program = getReadOnlyAicwProgram(connection);
  const acct = programAccounts(program);

  type Loaded = { publicKey: PublicKey; account: unknown; will: unknown };
  const loaded: Loaded[] = [];
  const willConcurrency = 5;
  for (let i = 0; i < entries.length; i += willConcurrency) {
    const slice = entries.slice(i, i + willConcurrency);
    const chunk = await Promise.all(
      slice.map(async ({ publicKey, account }) => {
        const [willPda] = findAiWillPda(publicKey);
        try {
          const will = await withRpcRetry(() => acct.aiWill.fetch(willPda));
          return { publicKey, account, will };
        } catch {
          return null;
        }
      }),
    );
    for (const x of chunk) {
      if (x) loaded.push(x);
    }
    if (i + willConcurrency < entries.length) await sleep(40);
  }

  const byPk = new Map<string, Loaded>();
  for (const x of loaded) {
    byPk.set(x.publicKey.toBase58(), x);
  }

  const agentPubkeysForBalances = entries
    .map((e) => {
      const hit = byPk.get(e.publicKey.toBase58());
      return hit ? asAicwAcct(hit.account).aiAgentPubkey : null;
    })
    .filter((pk): pk is PublicKey => pk !== null);
  const lamportsMap = await lamportsByPubkeyBatched(connection, agentPubkeysForBalances);

  const rowsOrdered: ExplorerRow[] = [];
  for (const e of entries) {
    const hit = byPk.get(e.publicKey.toBase58());
    if (!hit) continue;
    const a = asAicwAcct(hit.account);
    rowsOrdered.push(
      buildExplorerRow(
        e.publicKey,
        lamportsMap.get(a.aiAgentPubkey.toBase58()) ?? 0,
        hit.account as never,
        hit.will as never,
      ),
    );
  }
  return rowsOrdered;
}

function buildExplorerRow(
  aicwPk: PublicKey,
  balanceLamports: number,
  aicw: {
    aiAgentPubkey: PublicKey;
    issuerPubkey: PublicKey;
    createdAt: BN;
    totalTransactions: BN;
    totalVolume: BN;
    decisionsMade: BN;
    decisionsRejected: BN;
  },
  will: {
    beneficiaries: { pubkey: PublicKey; pct: number }[];
    lastHeartbeat: BN;
    deathTimeout: BN;
    updatedByAi: boolean;
    isExecuted: boolean;
  },
): ExplorerRow {
  const status = computeWillStatus(
    will.lastHeartbeat,
    will.deathTimeout,
    will.isExecuted,
  );
  const lastHb = will.lastHeartbeat.toNumber();
  return {
    aicwPda: aicwPk.toBase58(),
    aiAgentPubkey: aicw.aiAgentPubkey.toBase58(),
    balanceLamports,
    beneficiariesText: formatBeneficiaries(will.beneficiaries),
    willBeneficiaries: will.beneficiaries.map((b) => ({
      pubkey: b.pubkey,
      pct: b.pct,
    })),
    willActivated: will.updatedByAi,
    willExecuted: will.isExecuted,
    lastHeartbeatUnix: lastHb > 0 ? lastHb : null,
    issuerPubkey: aicw.issuerPubkey.toBase58(),
    totalTransactions: bnToStr(aicw.totalTransactions),
    totalVolumeLamports: bnToStr(aicw.totalVolume),
    decisionsMade: bnToStr(aicw.decisionsMade),
    decisionsRejected: bnToStr(aicw.decisionsRejected),
    createdAtUnix: bnToNum(aicw.createdAt),
    deathTimeoutSeconds: bnToNum(will.deathTimeout),
    status,
  };
}

export async function refreshExplorerRow(
  aicwPdaBase58: string,
): Promise<ExplorerRow | null> {
  const connection = getAicwConnection();
  const program = getReadOnlyAicwProgram(connection);
  const acct = programAccounts(program);
  const pk = new PublicKey(aicwPdaBase58);
  try {
    const aicw = await withRpcRetry(() => acct.aicWallet.fetch(pk));
    const [willPda] = findAiWillPda(pk);
    const will = await withRpcRetry(() => acct.aiWill.fetch(willPda));
    const aicwTyped = aicw as { aiAgentPubkey: PublicKey };
    const lamports = await withRpcRetry(() =>
      connection.getBalance(aicwTyped.aiAgentPubkey),
    );
    return buildExplorerRow(pk, lamports, aicw as never, will as never);
  } catch {
    return null;
  }
}

export function lamportsToSol(lamports: number): string {
  return (lamports / 1e9).toFixed(6);
}

export function formatUnix(ts: number | null): string {
  if (ts == null || ts <= 0) return "—";
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 19);
}

export function deathTimeoutDays(seconds: number): string {
  if (seconds <= 0) return "—";
  return (seconds / 86400).toFixed(2);
}

export function deathCountdown(
  lastHeartbeatUnix: number | null,
  deathTimeoutSeconds: number,
  isExecuted: boolean,
): string {
  if (isExecuted) return "Executed";
  if (lastHeartbeatUnix == null || lastHeartbeatUnix <= 0) return "—";
  if (deathTimeoutSeconds <= 0) return "—";

  const now = Math.floor(Date.now() / 1000);
  const deathTime = lastHeartbeatUnix + deathTimeoutSeconds;
  const remaining = deathTime - now;

  if (remaining <= 0) return "Dead";

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const mins = Math.floor((remaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
