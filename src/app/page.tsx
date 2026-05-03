"use client";

import { useState, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { Connection, PublicKey, SystemProgram, SendTransactionError } from "@solana/web3.js";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import idl from "../idl/aicw.json";
import {
  fetchMpcAgentSolanaPubkey,
  getMpcBridgeBaseUrl,
  isMpcBridgeConfigured,
} from "../lib/mpcAgentPubkey";
import { AppNav } from "../components/AppNav";

const ISSUER_HANDOFF_DOCS_URL =
  process.env.NEXT_PUBLIC_ISSUER_HANDOFF_DOCS_URL?.trim() ?? "";

/** Full URL to `aicw_skill.md` for the issuance copy bundle (agent handoff). */
const AICW_SKILL_MD_URL =
  process.env.NEXT_PUBLIC_AICW_SKILL_MD_URL?.trim() ??
  (process.env.NODE_ENV === "production"
    ? "https://aicw-protocol.github.io/aicw_app/aicw_skill.md"
    : "http://localhost:4002/aicw_skill.md");

const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
const AICW_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_AICW_PROGRAM_ID ??
    "9RUEw4jcMi8xcGf3tJRCAdzUzLuhEurts8Z2QQLsRbaV",
);

async function sha256ModelHash(modelName: string): Promise<number[]> {
  const data = new TextEncoder().encode(modelName.trim());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf));
}

interface WalletState {
  connected: boolean;
  publicKey: string | null;
  network?: string;
}

interface IssueForm {
  aiAgentPubkey: string;
  mpcWalletId: string;
}

function detectNetwork(rpcUrl: string): string {
  const url = rpcUrl.toLowerCase();
  if (url.includes("devnet")) return "Devnet";
  if (url.includes("testnet")) return "Testnet";
  if (url.includes("mainnet")) return "Mainnet";
  if (url.includes("localhost") || url.includes("127.0.0.1")) return "Localnet";
  return "Custom";
}

/** Rich console output for Anchor / web3 send failures (often wrapped in Proxy). */
function logIssueWalletFailure(err: unknown, connection: Connection) {
  console.groupCollapsed("[AICW] Issue wallet failed — expand for details");
  console.error(err);
  const maybe = err as SendTransactionError | { logs?: string[]; message?: string };
  if (err instanceof SendTransactionError) {
    const te = err.transactionError;
    console.error("[AICW] Summary:", te.message);
    if (te.logs?.length) {
      console.error("[AICW] Program logs:\n" + te.logs.join("\n"));
    } else {
      void err.getLogs(connection).then((logs) => {
        if (logs?.length) console.error("[AICW] Program logs:\n" + logs.join("\n"));
      });
    }
  } else if (Array.isArray(maybe.logs) && maybe.logs.length) {
    console.error("[AICW] Program logs:\n" + maybe.logs.join("\n"));
  } else if (typeof maybe.message === "string") {
    console.error("[AICW] Message:", maybe.message);
  }
  console.groupEnd();
}

function solanaErrorText(err: unknown): string {
  if (err instanceof SendTransactionError) {
    const txMsg = (err as unknown as { transactionMessage?: string }).transactionMessage;
    return [err.message, txMsg].filter((s): s is string => typeof s === "string" && s.length > 0).join(" ");
  }
  if (err instanceof Error) return err.message;
  return String(err ?? "");
}

/** Same tx bytes were sent twice; the first submit usually landed on-chain. */
function isAlreadyProcessedTransactionError(err: unknown): boolean {
  return /already been processed/i.test(solanaErrorText(err));
}

function formatIssueWalletError(err: unknown): string {
  const raw = solanaErrorText(err);
  if (/already been processed/i.test(raw)) {
    return "This transaction was already submitted (it may have succeeded). Check your wallet or Explorer.";
  }
  if (/already in use/i.test(raw)) {
    return "This AI public key already has a wallet on this network.";
  }
  if (/User rejected|user rejected|rejected the request/i.test(raw)) {
    return "Signature request was cancelled.";
  }
  if (/Insufficient|insufficient lamports|insufficient funds/i.test(raw)) {
    return "Not enough SOL for fees or account rent.";
  }
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length > 160) {
    return "Could not issue wallet. Open the browser console (F12) for details.";
  }
  return `Could not issue wallet: ${oneLine}`;
}

export default function AicwIssuerPage() {
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    publicKey: null,
    network: detectNetwork(RPC),
  });

  const [form, setForm] = useState<IssueForm>({
    aiAgentPubkey: "",
    mpcWalletId: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMpcLoading, setIsMpcLoading] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState<{
    txSig: string;
    aiPubkey: string;
    mpcWalletId: string;
  } | null>(null);
  const [successCopied, setSuccessCopied] = useState(false);
  /** null = not checked yet for current pubkey; true = AICW PDA already exists */
  const [aicwExistsOnChain, setAicwExistsOnChain] = useState<boolean | null>(null);

  useEffect(() => {
    const s = form.aiAgentPubkey.trim();
    if (s.length < 32) {
      setAicwExistsOnChain(null);
      return;
    }
    let cancelled = false;
    setAicwExistsOnChain(null);
    (async () => {
      try {
        const aiAgentPk = new PublicKey(s);
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from("aicw"), aiAgentPk.toBuffer()],
          AICW_PROGRAM_ID,
        );
        const conn = new Connection(RPC, "confirmed");
        const info = await conn.getAccountInfo(pda, "confirmed");
        if (!cancelled) setAicwExistsOnChain(info !== null);
      } catch {
        if (!cancelled) setAicwExistsOnChain(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.aiAgentPubkey]);

  const connectWallet = useCallback(async () => {
    try {
      const phantom = (window as any).solana;
      if (!phantom?.isPhantom) {
        toast.error("Phantom wallet not found. Please install it first.");
        return;
      }
      const resp = await phantom.connect();
      setWallet({
        connected: true,
        publicKey: resp.publicKey.toString(),
        network: detectNetwork(RPC),
      });
      toast.success("Wallet connected!");
    } catch {
      toast.error("Failed to connect wallet.");
    }
  }, []);

  const fillAgentPubkeyFromMpc = useCallback(async () => {
    if (!isMpcBridgeConfigured()) {
      toast.error("MPC bridge URL missing. Set NEXT_PUBLIC_MPC_BRIDGE_URL in .env.");
      return;
    }
    setIsMpcLoading(true);
    const t = toast.loading("Loading AI public key from MPC...");
    try {
      const { solanaPubkeyBase58, walletId } = await fetchMpcAgentSolanaPubkey(
        getMpcBridgeBaseUrl(),
        { clientId: `issuer-ui-${Date.now()}` },
      );
      setForm((f) => ({
        ...f,
        aiAgentPubkey: solanaPubkeyBase58,
        mpcWalletId: (walletId ?? "").trim(),
      }));
      toast.dismiss(t);
      const extra = walletId ? " (walletId saved)" : "";
      toast.success(`AI public key loaded${extra}`);
    } catch (e: unknown) {
      toast.dismiss(t);
      toast.error(e instanceof Error ? e.message : "MPC bridge request failed.");
    } finally {
      setIsMpcLoading(false);
    }
  }, []);

  const copySuccessBundle = useCallback(async () => {
    if (!issueSuccess) return;
    const mpcId = issueSuccess.mpcWalletId.trim();
    const payload = `-----
AI PUBLIC KEY : ${issueSuccess.aiPubkey}
MPC wallet ID : ${mpcId}

Read ${AICW_SKILL_MD_URL}
`;
    try {
      await navigator.clipboard.writeText(payload);
      setSuccessCopied(true);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }, [issueSuccess]);

  const disconnectWallet = useCallback(async () => {
    try {
      const phantom = (window as any).solana;
      if (phantom) await phantom.disconnect();
    } catch {
      // noop
    }
    setWallet({ connected: false, publicKey: null, network: detectNetwork(RPC) });
    toast("Wallet disconnected.");
  }, []);

  const handleIssue = useCallback(async () => {
    if (!wallet.connected) {
      toast.error("Connect your wallet first.");
      return;
    }

    if (!form.aiAgentPubkey || form.aiAgentPubkey.length < 32) {
      toast.error("Load AI public key from MPC first.");
      return;
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading("Issuing AICW wallet...");
    const connection = new Connection(RPC, "confirmed");

    const pk = form.aiAgentPubkey.trim();
    const mpcId = form.mpcWalletId.trim();
    let aiAgentPk: PublicKey;
    let aicwWalletPda: PublicKey;
    let aiWillPda: PublicKey;
    let issuerPk: PublicKey;
    try {
      aiAgentPk = new PublicKey(pk);
      [aicwWalletPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("aicw"), aiAgentPk.toBuffer()],
        AICW_PROGRAM_ID,
      );
      [aiWillPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("will"), aicwWalletPda.toBuffer()],
        AICW_PROGRAM_ID,
      );
      issuerPk = new PublicKey(wallet.publicKey!);
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Invalid public key.");
      setIsSubmitting(false);
      return;
    }

    try {
      const phantom = (window as any).solana;
      if (!phantom?.isPhantom) {
        throw new Error("Phantom not available");
      }

      const walletAdapter = {
        publicKey: issuerPk,
        signTransaction: async (tx: Parameters<typeof phantom.signTransaction>[0]) =>
          phantom.signTransaction(tx),
        signAllTransactions: async (
          txs: Parameters<typeof phantom.signTransaction>[0][],
        ) => {
          if (typeof phantom.signAllTransactions === "function") {
            return phantom.signAllTransactions(txs);
          }
          for (const tx of txs) {
            await phantom.signTransaction(tx);
          }
          return txs;
        },
      };

      const provider = new AnchorProvider(
        connection,
        walletAdapter as never,
        { commitment: "confirmed" },
      );

      const idlWithAddr = {
        ...(idl as object),
        address: AICW_PROGRAM_ID.toBase58(),
      } as Idl;
      const program = new Program(idlWithAddr, provider);

      const modelName = `aicw:${pk.slice(0, 32)}`;
      const modelHash = await sha256ModelHash(modelName);

      const txSig = await program.methods
        .issueWallet(modelHash, modelName)
        .accounts({
          aicwWallet: aicwWalletPda,
          aiWill: aiWillPda,
          issuer: issuerPk,
          aiAgentPubkey: aiAgentPk,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setIssueSuccess({
        txSig,
        aiPubkey: pk,
        mpcWalletId: mpcId,
      });
      setSuccessCopied(false);
      setShowSuccessModal(true);

      setForm({
        aiAgentPubkey: "",
        mpcWalletId: "",
      });

      toast.dismiss(loadingToast);
      console.log("[AICW] Issue AICW Wallet success", {
        txSig,
        issuer: issuerPk.toBase58(),
        aiAgentPubkey: aiAgentPk.toBase58(),
        aicwWalletPda: aicwWalletPda.toBase58(),
      });
    } catch (err: unknown) {
      toast.dismiss(loadingToast);

      if (isAlreadyProcessedTransactionError(err)) {
        try {
          const sigs = await connection.getSignaturesForAddress(aicwWalletPda, {
            limit: 1,
          });
          const recoveredSig = sigs[0]?.signature;
          if (recoveredSig) {
            setIssueSuccess({
              txSig: recoveredSig,
              aiPubkey: pk,
              mpcWalletId: mpcId,
            });
            setSuccessCopied(false);
            setShowSuccessModal(true);
            setForm({
              aiAgentPubkey: "",
              mpcWalletId: "",
            });
            toast.success("Transaction was already confirmed — showing details.");
            return;
          }
        } catch {
          // fall through to generic error
        }
      }

      logIssueWalletFailure(err, connection);
      toast.error(formatIssueWalletError(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [wallet, form]);

  const hasPubkey = form.aiAgentPubkey.trim().length > 0;
  const hasWalletId = form.mpcWalletId.trim().length > 0;
  const agentKeyReady = form.aiAgentPubkey.trim().length >= 32;
  const canIssueNewWallet = wallet.connected && agentKeyReady && aicwExistsOnChain === false;
  const githubUrl = "https://github.com/aicw-protocol/aicw";
  const twitterUrl = "https://x.com/AICW_Protocol";

  return (
    <div className="app-shell issue-shell">
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
            <AppNav />
          </div>
          <div className="top-nav-right nav-icons">
            <a
              className="icon-link"
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              title="GitHub"
            >
              <i className="fa-brands fa-github" />
            </a>
            <a
              className="icon-link"
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
      </header>

      <div className="issue-layout">
        <div className="issue-layout-main">
      <section className="hero">
        <h1 className="hero-title">
          <span className="hero-title-main">AICW</span>{" "}
          <span className="hero-title-sub">AI-Controlled Wallet Standard</span>
        </h1>
        <p>Give your AI its own wallet. No human override. Ever.</p>
      </section>

      <section className="section">
        <div className="row" style={{ alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>1) Connect Wallet</h2>
          <span
            style={{
              fontSize: "13px",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              marginLeft: "auto",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "#10b981",
                display: "inline-block",
              }}
            />
            {wallet.network}
          </span>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Connect the issuer wallet to sign the on-chain wallet issue transaction.
        </p>
        <div className="row wrap" style={{ marginTop: 10 }}>
          {wallet.publicKey ? (
            <span className="pill">
              <i className="fa-solid fa-address-card" />
              <span className="wallet-address-gradient">
                {wallet.publicKey.slice(0, 8)}...{wallet.publicKey.slice(-6)}
              </span>
            </span>
          ) : null}
          <span className="spacer" />
          {wallet.connected ? (
            <button type="button" onClick={disconnectWallet} className="btn fixed-action-btn">
              Disconnect
            </button>
          ) : (
            <button type="button" onClick={connectWallet} className="btn fixed-action-btn">
              Connect Wallet
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <h2>2) Load from MPC</h2>
        <p className="muted">
          Fetches the AI signing key and wallet id from your MPC bridge. Values are not shown
          here; after a successful issue, they appear in the success dialog for you to copy.
        </p>
        <div className="row wrap" style={{ marginTop: 14, alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={fillAgentPubkeyFromMpc}
            disabled={!wallet.connected || isMpcLoading}
            className="btn fixed-action-btn"
          >
            {isMpcLoading ? "Loading..." : "Load from MPC"}
          </button>
          {agentKeyReady && aicwExistsOnChain === true ? (
            <span className="pill warn-pill" title="This AI public key already has an AICW wallet on this network.">
              <i className="fa-solid fa-circle-exclamation" />
              Already on-chain
            </span>
          ) : agentKeyReady && aicwExistsOnChain === null ? (
            <span className="pill muted-pill">
              <i className="fa-solid fa-spinner fa-spin" />
              Checking on-chain…
            </span>
          ) : agentKeyReady && aicwExistsOnChain === false ? (
            <span className="pill ok-pill">
              <i className="fa-solid fa-check" />
              Ready to issue
            </span>
          ) : hasPubkey ? (
            <span className="pill muted-pill">Invalid AI public key length</span>
          ) : (
            <span className="pill muted-pill">Not loaded</span>
          )}
        </div>
      </section>

      <section className="section">
        <h2>3) Issue AICW Wallet</h2>
        {ISSUER_HANDOFF_DOCS_URL ? (
          <p className="muted" style={{ marginBottom: 12 }}>
            <a href={ISSUER_HANDOFF_DOCS_URL} target="_blank" rel="noopener noreferrer">
              Open handoff documentation
            </a>
          </p>
        ) : null}
        {aicwExistsOnChain === true ? (
          <p className="muted" style={{ marginBottom: 12 }}>
            This AI public key already has a wallet here. Use a different MPC identity, or open{" "}
            <Link href="/explorer">Explorer</Link> to inspect it.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (!wallet.connected) {
              toast.error("Connect your wallet first.");
              return;
            }
            if (!agentKeyReady) {
              toast.error("Load AI public key from MPC first.");
              return;
            }
            if (aicwExistsOnChain !== false) {
              if (aicwExistsOnChain === true) {
                toast.error("This AI public key already has a wallet on this network.");
              } else {
                toast.error("Wait for the on-chain check to finish.");
              }
              return;
            }
            setShowIssueModal(true);
          }}
          disabled={isSubmitting || !wallet.connected || !agentKeyReady || aicwExistsOnChain !== false}
          title={
            aicwExistsOnChain === true
              ? "This AI public key already has an AICW wallet on this network."
              : aicwExistsOnChain === null && agentKeyReady
                ? "Checking on-chain…"
                : undefined
          }
          className="btn primary"
        >
          Issue AICW Wallet
        </button>
      </section>

      <section className="section">
        <h2>Status</h2>
        <div className="status-list">
          <p>
            Wallet:{" "}
            <span className={wallet.connected ? "ok" : ""}>
              {wallet.connected ? "Connected" : "Not connected"}
            </span>
          </p>
          <p>
            AI public key:{" "}
            <span
              className={
                !hasPubkey || !agentKeyReady
                  ? ""
                  : aicwExistsOnChain === false
                    ? "ok"
                    : aicwExistsOnChain === true
                      ? "warn"
                      : ""
              }
            >
              {!hasPubkey
                ? "Missing"
                : !agentKeyReady
                  ? "Invalid"
                  : aicwExistsOnChain === null
                    ? "Checking…"
                    : aicwExistsOnChain
                      ? "Already on-chain"
                      : "Ready"}
            </span>
          </p>
          <p>
            MPC wallet ID:{" "}
            <span className={hasWalletId ? "ok" : ""}>
              {hasWalletId ? "Present" : "Not from MPC (optional)"}
            </span>
          </p>
        </div>
      </section>
        </div>

        <aside className="issue-ecosystem" aria-label="Ecosystem">
          <h2 className="issue-ecosystem-title">Ecosystem</h2>
          <ul className="issue-ecosystem-list">
            <li>
              <a
                href="https://predict.com"
                target="_blank"
                rel="noopener noreferrer"
                className="issue-ecosystem-link"
              >
                Predict.com
              </a>
              <span className="issue-ecosystem-desc"> — AI-powered prediction betting app</span>
            </li>
          </ul>
        </aside>
      </div>

      {showIssueModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!isSubmitting) setShowIssueModal(false);
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Wallet issuance</h3>

            <div className="modal-cost-box">
              <p className="modal-cost-label">Account creation + network fee (estimate)</p>
              <div className="modal-cost-row">
                <span>AICWallet account rent</span>
                <span>~0.004 SOL</span>
              </div>
              <div className="modal-cost-row">
                <span>AIWill account rent</span>
                <span>~0.005 SOL</span>
              </div>
              <div className="modal-cost-row">
                <span>Network fee</span>
                <span>~0.000005 SOL</span>
              </div>
              <div className="modal-cost-row modal-cost-total">
                <span>Total</span>
                <span>~0.009 SOL</span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setShowIssueModal(false)}
                disabled={isSubmitting}
                className="btn modal-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowIssueModal(false);
                  void handleIssue();
                }}
                disabled={isSubmitting || !canIssueNewWallet}
                className="btn primary modal-issue-btn"
              >
                {isSubmitting ? "Issuing..." : "Issue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && issueSuccess && (
        <div className="modal-overlay" onClick={() => {}}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Issuance succeeded</h3>

            <p className="modal-success-notice">
              Pass the AI public key and MPC wallet ID below to your AI agent. They are required
              for the agent to use this wallet.
            </p>

            <div className="modal-success-field">
              <span className="modal-key-name">AI public key</span>
              <pre className="modal-success-value terminal-value">{issueSuccess.aiPubkey}</pre>
            </div>
            <div className="modal-success-field">
              <span className="modal-key-name">MPC wallet ID</span>
              <pre className="modal-success-value terminal-value">{issueSuccess.mpcWalletId || "—"}</pre>
            </div>

            <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0, wordBreak: "break-all" }}>
              Clipboard will include: <strong>Read {AICW_SKILL_MD_URL}</strong>
            </p>

            <button
              type="button"
              onClick={() => void copySuccessBundle()}
              className="btn modal-copy-btn"
              title={`Copies keys and: Read ${AICW_SKILL_MD_URL}`}
            >
              <i className={`fa-solid ${successCopied ? "fa-check" : "fa-copy"}`} style={{ marginRight: 6 }} />
              {successCopied ? "Copied" : `Copy (+ Read skill)`}
            </button>

            <button
              type="button"
              className="btn primary"
              style={{ width: "100%", marginTop: 12 }}
              disabled={!successCopied}
              onClick={() => {
                setShowSuccessModal(false);
                setIssueSuccess(null);
                setSuccessCopied(false);
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
