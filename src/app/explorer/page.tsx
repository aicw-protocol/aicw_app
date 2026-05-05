"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { AppNav } from "../../components/AppNav";

const githubUrl = "https://github.com/aicw-protocol/aicw";
const twitterUrl = "https://x.com/AICW_Protocol";
import {
  EXPLORER_PAGE_SIZE,
  aicwEntryMatchesQuery,
  compareAicwEntries,
  deathCountdown,
  formatUnix,
  hydrateExplorerPage,
  formatBeneficiariesTooltip,
  lamportsToSol,
  loadAicwWalletEntriesSorted,
  refreshExplorerRow,
  type AicwWalletEntry,
  type ExplorerListSortKey,
  type ExplorerRow,
} from "../../lib/explorerData";

const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
const AICW_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_AICW_PROGRAM_ID || "9RUEw4jcMi8xcGf3tJRCAdzUzLuhEurts8Z2QQLsRbaV"
);
const EXECUTE_WILL_DISCRIMINATOR = Buffer.from([167, 64, 178, 63, 233, 123, 165, 124]);

function shortPk(s: string): string {
  if (s.length <= 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function volumeSol(volLamportsStr: string): number {
  try {
    return Number(volLamportsStr) / 1e9;
  } catch {
    return 0;
  }
}

/** Same condition as the Execute button in the Dth column. */
function rowShowsExecuteButton(row: ExplorerRow): boolean {
  return deathCountdown(row.lastHeartbeatUnix, row.deathTimeoutSeconds, row.willExecuted) === "Dead";
}

function SortHeader({
  abbrev,
  tooltip,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  abbrev: string;
  tooltip: string;
  sortKey: ExplorerListSortKey;
  activeKey: ExplorerListSortKey;
  dir: 1 | -1;
  onSort: (k: ExplorerListSortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th scope="col" className={`explorer-th-sort ${className || ""}`} title={tooltip}>
      <button
        type="button"
        className="explorer-sort-btn"
        title={tooltip}
        aria-label={tooltip}
        onClick={() => onSort(sortKey)}
      >
        {abbrev}
        {active ? (dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
}

function StaticTh({ abbrev, tooltip, className }: { abbrev: string; tooltip: string; className?: string }) {
  return (
    <th scope="col" className={`explorer-th-static ${className || ""}`} title={tooltip}>
      {abbrev}
    </th>
  );
}

export default function ExplorerPage() {
  const [coreEntries, setCoreEntries] = useState<AicwWalletEntry[]>([]);
  const [pageRows, setPageRows] = useState<ExplorerRow[]>([]);
  const [loadingCore, setLoadingCore] = useState(true);
  const [hydratingPage, setHydratingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ExplorerListSortKey>("createdAtUnix");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(1);
  const [refreshingPdas, setRefreshingPdas] = useState<Set<string>>(new Set());
  const [executingPdas, setExecutingPdas] = useState<Set<string>>(new Set());
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [dthExecuteFirst, setDthExecuteFirst] = useState(false);

  const loadCore = useCallback(async () => {
    setLoadingCore(true);
    setError(null);
    setCoreEntries([]);
    setPageRows([]);
    try {
      const data = await loadAicwWalletEntriesSorted();
      setCoreEntries(data);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wallets");
      toast.error("Failed to load wallet list");
    } finally {
      setLoadingCore(false);
    }
  }, []);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const onSort = useCallback(
    (k: ExplorerListSortKey) => {
      if (k === sortKey) {
        setSortDir((d) => (d === 1 ? -1 : 1));
      } else {
        setSortKey(k);
        setSortDir(1);
      }
      setPage(1);
    },
    [sortKey],
  );

  const filteredSorted = useMemo(() => {
    const filtered = coreEntries.filter((e) => aicwEntryMatchesQuery(e, query));
    const copy = [...filtered];
    copy.sort((a, b) => compareAicwEntries(a, b, sortKey, sortDir));
    return copy;
  }, [coreEntries, query, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / EXPLORER_PAGE_SIZE));
  const pageClamped = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (page !== pageClamped) setPage(pageClamped);
  }, [page, pageClamped]);

  const pageSlice = useMemo(
    () =>
      filteredSorted.slice(
        (pageClamped - 1) * EXPLORER_PAGE_SIZE,
        pageClamped * EXPLORER_PAGE_SIZE,
      ),
    [filteredSorted, pageClamped],
  );

  useEffect(() => {
    if (loadingCore) return;
    if (pageSlice.length === 0) {
      setPageRows([]);
      return;
    }
    let cancelled = false;
    setHydratingPage(true);
    void hydrateExplorerPage(pageSlice)
      .then((rows) => {
        if (!cancelled) setPageRows(rows);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load this page from RPC");
          setPageRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setHydratingPage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadingCore, pageSlice]);

  useEffect(() => {
    setDthExecuteFirst(false);
  }, [pageClamped, query, sortKey, sortDir]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPageRows((prev) => [...prev]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const displayRows = useMemo(() => {
    if (!dthExecuteFirst) return pageRows;
    const withIdx = pageRows.map((r, i) => ({ r, i }));
    withIdx.sort((a, b) => {
      const ae = rowShowsExecuteButton(a.r) ? 1 : 0;
      const be = rowShowsExecuteButton(b.r) ? 1 : 0;
      if (be !== ae) return be - ae;
      return a.i - b.i;
    });
    return withIdx.map((x) => x.r);
  }, [pageRows, dthExecuteFirst]);

  const onRefreshRow = useCallback(async (aicwPda: string) => {
    setRefreshingPdas((s) => new Set(s).add(aicwPda));
    try {
      const updated = await refreshExplorerRow(aicwPda);
      if (!updated) {
        toast.error("Refresh failed for this row");
        return;
      }
      setPageRows((prev) => prev.map((r) => (r.aicwPda === aicwPda ? updated : r)));
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshingPdas((s) => {
        const n = new Set(s);
        n.delete(aicwPda);
        return n;
      });
    }
  }, []);

  const copyAiPublicKey = useCallback(async (fullKey: string) => {
    try {
      await navigator.clipboard.writeText(fullKey);
      toast.success("AI public key copied");
    } catch {
      toast.error("Copy failed");
    }
  }, []);

  const onExecuteWill = useCallback(async (row: ExplorerRow) => {
    const aicwPda = row.aicwPda;
    const aiAgentPubkey = row.aiAgentPubkey;
    setExecutingPdas((s) => new Set(s).add(aicwPda));
    const loadingToast = toast.loading("Executing will via MPC Bridge…");

    try {
      const mpcBridgeUrl = process.env.NEXT_PUBLIC_MPC_BRIDGE_URL?.trim();
      if (!mpcBridgeUrl) {
        toast.dismiss(loadingToast);
        toast.error("MPC Bridge URL not configured. Set NEXT_PUBLIC_MPC_BRIDGE_URL.");
        return;
      }

      const beneficiaries = row.willBeneficiaries;
      if (!beneficiaries.length) {
        toast.dismiss(loadingToast);
        toast.error("No beneficiaries on chain for this will; cannot execute.");
        return;
      }

      console.log("[AICW] Calling MPC Bridge /execute-will for AI:", aiAgentPubkey);

      const response = await fetch(`${mpcBridgeUrl}/v1/mpc/execute-will`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiAgentPubkey,
          clientId: `execute-will-${Date.now()}`,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.dismiss(loadingToast);
        console.error("[AICW] execute_will failed:", result);
        toast.error(typeof result === "string" ? result : result.message || result.error || "Execute will failed");
        return;
      }

      console.log("[AICW] execute_will result:", result);

      // Check transfer results
      const transfers = result.transfers || [];
      const successCount = transfers.filter((t: { success?: boolean }) => t.success).length;
      const failCount = transfers.length - successCount;

      if (successCount === 0) {
        toast.dismiss(loadingToast);
        if (transfers.length === 0) {
          toast.error("No transfers were executed.");
        } else {
          toast.error(`All ${failCount} transfers failed.`);
        }
        return;
      }

      // Mark will as executed on-chain via Phantom signature
      try {
        const phantom = (window as unknown as { solana?: { isPhantom?: boolean; connect: () => Promise<{ publicKey: PublicKey }>; signTransaction: <T>(tx: T) => Promise<T> } }).solana;
        if (phantom?.isPhantom) {
          const resp = await phantom.connect();
          const executorPk = resp.publicKey;
          const aicwWalletPda = new PublicKey(aicwPda);
          const [aiWillPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("will"), aicwWalletPda.toBuffer()],
            AICW_PROGRAM_ID,
          );

          const ix = new TransactionInstruction({
            programId: AICW_PROGRAM_ID,
            keys: [
              { pubkey: executorPk, isSigner: true, isWritable: true },
              { pubkey: aicwWalletPda, isSigner: false, isWritable: true },
              { pubkey: aiWillPda, isSigner: false, isWritable: true },
              ...beneficiaries.map((b) => ({
                pubkey: b.pubkey,
                isSigner: false,
                isWritable: true,
              })),
            ],
            data: EXECUTE_WILL_DISCRIMINATOR,
          });

          const connection = new Connection(SOLANA_RPC, "confirmed");
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
          const messageV0 = new TransactionMessage({
            payerKey: executorPk,
            recentBlockhash: blockhash,
            instructions: [ix],
          }).compileToV0Message();
          const tx = new VersionedTransaction(messageV0);
          const signedTx = await phantom.signTransaction(tx);
          const sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false });
          await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
          console.log("[AICW] on-chain execute_will marked:", sig);
        }
      } catch (e) {
        console.warn("[AICW] Failed to mark will as executed on-chain (non-critical):", e);
      }

      toast.dismiss(loadingToast);

      if (failCount === 0) {
        toast.success(`Will executed! ${successCount} transfer(s) completed.`);
      } else {
        toast.success(`Partial success: ${successCount}/${transfers.length} transfers completed.`);
      }

      // Open Solscan for first successful transfer
      const firstSuccess = transfers.find((t: { success?: boolean; signature?: string }) => t.success && t.signature);
      if (firstSuccess?.signature) {
        window.open(`https://solscan.io/tx/${firstSuccess.signature}?cluster=devnet`, "_blank");
      }

      void onRefreshRow(aicwPda);
    } catch (err) {
      toast.dismiss(loadingToast);
      console.error("[AICW] execute_will failed:", err);
      toast.error(err instanceof Error ? err.message : "Execute will failed");
    } finally {
      setExecutingPdas((s) => {
        const n = new Set(s);
        n.delete(aicwPda);
        return n;
      });
    }
  }, [onRefreshRow]);

  return (
    <div className="app-shell explorer-shell">
      <header className="top-nav">
        <div className="top-nav-inner">
          <div className="top-nav-left">
            <Link href="/" className="brand brand-link">
              <div className="brand-title">
                AICW <span className="brand-chain">ON SOLANA</span>
              </div>
            </Link>
          </div>
          <div className="top-nav-center">
            <AppNav isMenuOpen={isNavMenuOpen} onMenuToggle={setIsNavMenuOpen} />
          </div>
          <div className="top-nav-right">
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => setIsNavMenuOpen(!isNavMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={isNavMenuOpen}
            >
              <i className={`fa-solid ${isNavMenuOpen ? "fa-times" : "fa-bars"}`} />
            </button>
          </div>
        </div>
      </header>

      <section className="hero">
        <h1>Explorer</h1>
        <p>
          Read-only overview of issued AI agent wallets: issuance records, balances, wills,
          heartbeats, and on-chain activity in one place.
        </p>
      </section>

      <section className="section explorer-toolbar">
        <div className="explorer-search-row">
          <label className="explorer-search-label" htmlFor="explorer-q">
            Search
          </label>
          <input
            id="explorer-q"
            type="search"
            className="explorer-search-input"
            placeholder="AI key, issuer, PDA, tx counts, volume, created unix…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        {error ? <p className="explorer-error">{error}</p> : null}
        {!loadingCore && !error ? (
          <p className="muted explorer-count">
            {filteredSorted.length} wallet{filteredSorted.length === 1 ? "" : "s"} — page{" "}
            {pageClamped}/{totalPages} ({EXPLORER_PAGE_SIZE} per page)
          </p>
        ) : null}
      </section>

      <section className="section explorer-table-wrap">
        {loadingCore ? (
          <p className="muted">Loading wallet accounts (one program query)…</p>
        ) : (
          <>
            {hydratingPage ? (
              <p className="muted" style={{ marginBottom: 8 }}>
                Loading will + balances for this page…
              </p>
            ) : null}
            <div className="explorer-pager row" style={{ marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn"
                disabled={pageClamped <= 1 || hydratingPage}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="muted" style={{ alignSelf: "center" }}>
                Page {pageClamped} / {totalPages}
              </span>
              <button
                type="button"
                className="btn"
                disabled={pageClamped >= totalPages || hydratingPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
            <div className="explorer-table-scroll">
              <table className="explorer-table">
                <thead>
                  <tr>
                    <SortHeader
                      abbrev="AI PK"
                      tooltip="AI Public Key — the AI agent’s Solana pubkey. Click the cell below to copy the full address."
                      sortKey="aiAgentPubkey"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                    />
                    <StaticTh
                      abbrev="Bal"
                      tooltip="Balance (SOL) — loaded with this page only. Column sort: use Iss / Tx / Vol / Created headers."
                    />
                    <StaticTh
                      abbrev="Ben"
                      tooltip="Will beneficiaries — loaded with this page only."
                      className="mobile-hide"
                    />
                    <StaticTh abbrev="W+" tooltip="Will activated (AIWill) — per-page load." className="mobile-hide" />
                    <StaticTh abbrev="Wx" tooltip="Will executed — per-page load." className="mobile-hide" />
                    <StaticTh abbrev="HB" tooltip="Last heartbeat — per-page load." className="mobile-hide" />
                    <SortHeader
                      abbrev="Iss"
                      tooltip="Issuer — human wallet pubkey that signed issuance."
                      sortKey="issuerPubkey"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="mobile-hide"
                    />
                    <SortHeader
                      abbrev="Tx#"
                      tooltip="Total Transactions — total transaction count on the AICWallet account."
                      sortKey="totalTransactions"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="mobile-hide"
                    />
                    <SortHeader
                      abbrev="Vol"
                      tooltip="Total Volume (SOL) — cumulative transfer volume from total_volume (lamports as SOL)."
                      sortKey="totalVolumeLamports"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="mobile-hide"
                    />
                    <SortHeader
                      abbrev="D+"
                      tooltip="Decisions Made — approved AI decision count."
                      sortKey="decisionsMade"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="mobile-hide"
                    />
                    <SortHeader
                      abbrev="D-"
                      tooltip="Decisions Rejected — rejected AI decision count."
                      sortKey="decisionsRejected"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="mobile-hide"
                    />
                    <SortHeader
                      abbrev="Crt"
                      tooltip="Created At — wallet account creation time (UTC). Default: newest first."
                      sortKey="createdAtUnix"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="mobile-hide"
                    />
                    <th scope="col" className="explorer-th-sort">
                      <button
                        type="button"
                        className="explorer-sort-btn"
                        title="Click: move rows with Execute (dead, will not executed) to the top of this page. Click again: restore row order."
                        aria-label="Sort death column by Execute rows first"
                        onClick={() => setDthExecuteFirst((v) => !v)}
                      >
                        Dth
                        {dthExecuteFirst ? " ▲" : ""}
                      </button>
                    </th>
                    <StaticTh abbrev="St" tooltip="Alive or Dead. Wallets whose will was executed still show Dead here (muted gray)." />
                    <th scope="col" className="explorer-th-action mobile-hide" title="Refresh — re-fetch this row from the RPC.">
                      <span className="explorer-th-icon" aria-hidden="true">
                        <i className="fa-solid fa-arrows-rotate" />
                      </span>
                      <span className="visually-hidden">Refresh</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => (
                    <tr
                      key={row.aicwPda}
                      className={
                        row.status === "Dead" || row.status === "Executed"
                          ? "explorer-row--dimmed"
                          : undefined
                      }
                    >
                      <td>
                        <button
                          type="button"
                          className="explorer-pk-copy explorer-mono"
                          title={`${row.aiAgentPubkey} — click to copy`}
                          onClick={() => void copyAiPublicKey(row.aiAgentPubkey)}
                        >
                          {shortPk(row.aiAgentPubkey)}
                        </button>
                      </td>
                      <td className="explorer-num">{lamportsToSol(row.balanceLamports)}</td>
                      <td
                        className="explorer-benef mobile-hide"
                        title={formatBeneficiariesTooltip(row.willBeneficiaries)}
                      >
                        {row.beneficiariesText}
                      </td>
                      <td className="mobile-hide">{row.willActivated ? "Yes" : "No"}</td>
                      <td className="mobile-hide">{row.willExecuted ? "Yes" : "No"}</td>
                      <td className="explorer-ts mobile-hide">{formatUnix(row.lastHeartbeatUnix)}</td>
                      <td className="mobile-hide">
                        <span className="explorer-mono" title={row.issuerPubkey}>
                          {shortPk(row.issuerPubkey)}
                        </span>
                      </td>
                      <td className="explorer-num mobile-hide">{row.totalTransactions}</td>
                      <td className="explorer-num mobile-hide">{volumeSol(row.totalVolumeLamports).toFixed(6)}</td>
                      <td className="explorer-num mobile-hide">{row.decisionsMade}</td>
                      <td className="explorer-num mobile-hide">{row.decisionsRejected}</td>
                      <td className="explorer-ts mobile-hide">{formatUnix(row.createdAtUnix)}</td>
                      <td className="explorer-num">
                        {(() => {
                          const dth = deathCountdown(row.lastHeartbeatUnix, row.deathTimeoutSeconds, row.willExecuted);
                          if (dth === "Dead" && (row.willActivated || row.status !== "Dead")) {
                            return (
                              <button
                                type="button"
                                className="explorer-exec-btn"
                                title="Execute will for this AI wallet"
                                disabled={executingPdas.has(row.aicwPda)}
                                onClick={() => void onExecuteWill(row)}
                              >
                                {executingPdas.has(row.aicwPda) ? "…" : "Execute"}
                              </button>
                            );
                          }
                          return dth;
                        })()}
                      </td>
                      <td>
                        {(() => {
                          const dth = deathCountdown(row.lastHeartbeatUnix, row.deathTimeoutSeconds, row.willExecuted);
                          if (row.willExecuted) {
                            return <span className="explorer-badge explorer-badge--dead-executed">Dead</span>;
                          }
                          if (dth === "Dead") {
                            if (!row.willActivated) {
                              return <span className="explorer-badge explorer-badge--dead-executed">Dead</span>;
                            }
                            return <span className="explorer-badge explorer-badge--dead">Dead</span>;
                          }
                          return (
                            <span className={`explorer-badge explorer-badge--${row.status.toLowerCase()}`}>
                              {row.status}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="mobile-hide">
                        <button
                          type="button"
                          className="explorer-icon-btn"
                          title={
                            row.willExecuted
                              ? "Will executed — refresh not available"
                              : row.status === "Dead"
                                ? "Status Dead — refresh not available"
                                : "Re-fetch this row from the RPC"
                          }
                          aria-label="Refresh row"
                          disabled={
                            row.willExecuted || row.status === "Dead" || refreshingPdas.has(row.aicwPda)
                          }
                          onClick={() => void onRefreshRow(row.aicwPda)}
                        >
                          <i
                            className={`fa-solid fa-arrows-rotate${refreshingPdas.has(row.aicwPda) ? " fa-spin" : ""}`}
                            aria-hidden="true"
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!pageRows.length && !hydratingPage ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  {filteredSorted.length === 0
                    ? "No wallets match your search."
                    : "No rows on this page."}
                </p>
              ) : null}
            </div>
          </>
        )}
      </section>

      <footer className="site-footer">
        <div className="footer-content">
          <div className="footer-social">
            <a
              className="footer-icon-link"
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              title="GitHub"
            >
              <i className="fa-brands fa-github" />
            </a>
            <a
              className="footer-icon-link"
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Twitter"
              title="Twitter"
            >
              <i className="fa-brands fa-twitter" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
