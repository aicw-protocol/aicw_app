"use client";

import { useState, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Connection, PublicKey, SystemProgram, SendTransactionError } from "@solana/web3.js";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import idl from "../idl/aicw.json";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);
import {
  fetchMpcAgentSolanaPubkey,
  getMpcBridgeBaseUrl,
  isMpcBridgeConfigured,
} from "../lib/mpcAgentPubkey";
import { AppNav } from "../components/AppNav";

const ISSUER_HANDOFF_DOCS_URL =
  process.env.NEXT_PUBLIC_ISSUER_HANDOFF_DOCS_URL?.trim() ?? "";

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
  const { publicKey, connected, signTransaction, signAllTransactions, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const network = detectNetwork(RPC);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const dbg = useCallback((msg: string) => {
    console.log("[AICW]", msg);
    setDebugLogs((prev) => [...prev.slice(-19), `${new Date().toLocaleTimeString()} ${msg}`]);
  }, []);

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
  const [aicwExistsOnChain, setAicwExistsOnChain] = useState<boolean | null>(null);
  const [showAppRegisterModal, setShowAppRegisterModal] = useState(false);
  const [appRegisterForm, setAppRegisterForm] = useState({
    title: "",
    website: "",
    category: "",
    description: "",
    contact: "",
    email: "",
  });
  const [isAppSubmitting, setIsAppSubmitting] = useState(false);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);

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
        const info = await connection.getAccountInfo(pda, "confirmed");
        if (!cancelled) setAicwExistsOnChain(info !== null);
      } catch {
        if (!cancelled) setAicwExistsOnChain(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.aiAgentPubkey, connection]);


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

  const submitAppRegistration = useCallback(async () => {
    const { title, website, category, description, contact, email } = appRegisterForm;

    if (!title.trim() || !website.trim() || !category.trim() || !description.trim() || !contact.trim() || !email.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }

    setIsAppSubmitting(true);
    const loadingToast = toast.loading("Submitting app registration...");

    try {
      const response = await fetch("/api/register-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          website,
          category,
          description,
          contact,
          email,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to submit app registration");
      }

      toast.dismiss(loadingToast);
      toast.success("App registration submitted successfully!");
      setAppRegisterForm({
        title: "",
        website: "",
        category: "",
        description: "",
        contact: "",
        email: "",
      });
      setShowAppRegisterModal(false);
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error(err instanceof Error ? err.message : "Failed to submit app registration");
    } finally {
      setIsAppSubmitting(false);
    }
  }, [appRegisterForm]);


  const handleIssue = useCallback(async () => {
    if (!connected || !publicKey) {
      toast.error("Connect your wallet first.");
      return;
    }

    if (!form.aiAgentPubkey || form.aiAgentPubkey.length < 32) {
      toast.error("Load AI public key from MPC first.");
      return;
    }

    if (!signTransaction || !sendTransaction) {
      toast.error("Wallet does not support signing.");
      return;
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading("Issuing AICW wallet...");

    const pk = form.aiAgentPubkey.trim();
    const mpcId = form.mpcWalletId.trim();
    let aiAgentPk: PublicKey;
    let aicwWalletPda: PublicKey;
    let aiWillPda: PublicKey;
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
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Invalid public key.");
      setIsSubmitting(false);
      return;
    }

    try {
      const walletAdapter = {
        publicKey,
        signTransaction,
        signAllTransactions: signAllTransactions ?? (async (txs: any[]) => {
          const signed = [];
          for (const tx of txs) signed.push(await signTransaction(tx));
          return signed;
        }),
      };

      const provider = new AnchorProvider(
        connection,
        walletAdapter as never,
        { commitment: "confirmed", skipPreflight: true },
      );

      const idlWithAddr = {
        ...(idl as object),
        address: AICW_PROGRAM_ID.toBase58(),
      } as Idl;
      const program = new Program(idlWithAddr, provider);

      const modelName = `aicw:${pk.slice(0, 32)}`;
      const modelHash = await sha256ModelHash(modelName);

      const tx = await program.methods
        .issueWallet(modelHash, modelName)
        .accounts({
          aicwWallet: aicwWalletPda,
          aiWill: aiWillPda,
          issuer: publicKey,
          aiAgentPubkey: aiAgentPk,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      dbg(`TX built. feePayer: ${publicKey.toBase58().slice(0, 8)}… blockhash: ${blockhash.slice(0, 8)}…`);

      let txSig: string;

      // Detect Phantom injected provider (works in Phantom in-app browser on mobile)
      const phantomProvider = (window as any).phantom?.solana ?? (window as any).solana;
      const hasPhantomInjected = !!phantomProvider?.isPhantom && typeof phantomProvider.signAndSendTransaction === "function";

      dbg(`Phantom injected: ${hasPhantomInjected}`);

      if (hasPhantomInjected) {
        // Use Phantom's native signAndSendTransaction — most reliable on mobile
        dbg("Using Phantom signAndSendTransaction…");
        try {
          const result = await phantomProvider.signAndSendTransaction(tx, {
            skipPreflight: true,
            maxRetries: 3,
          });
          txSig = typeof result === "string" ? result : result?.signature ?? result?.publicKey?.toString?.() ?? "";
          if (!txSig) throw new Error("Phantom returned empty signature");
          dbg(`Phantom success. Sig: ${txSig.slice(0, 16)}…`);
        } catch (pErr: unknown) {
          const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
          dbg(`Phantom signAndSend failed: ${pMsg.slice(0, 120)}`);
          throw pErr;
        }
      } else if (sendTransaction) {
        // Wallet Adapter sendTransaction (works on desktop, some mobile)
        dbg("Using wallet adapter sendTransaction…");
        try {
          txSig = await sendTransaction(tx, connection, {
            skipPreflight: true,
            maxRetries: 3,
          });
          dbg(`sendTransaction success. Sig: ${txSig.slice(0, 16)}…`);
        } catch (sendErr: unknown) {
          const sendMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
          dbg(`sendTransaction failed: ${sendMsg.slice(0, 120)}`);

          // Fallback: explicit signTransaction + sendRawTransaction
          // (helps on mobile when sendTransaction drops the fee-payer signature)
          if (/Missing signature|Signature verification failed/i.test(sendMsg) && signTransaction) {
            dbg("Falling back to signTransaction + sendRawTransaction…");
            try {
              const signedTx = await signTransaction(tx);
              const sigCount = signedTx.signatures.filter((s) => s.signature !== null).length;
              dbg(`Signed. ${sigCount} signature(s) attached.`);

              txSig = await connection.sendRawTransaction(signedTx.serialize(), {
                skipPreflight: true,
                maxRetries: 3,
              });
              dbg(`sendRawTransaction success. Sig: ${txSig.slice(0, 16)}…`);
            } catch (fallbackErr: unknown) {
              const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
              dbg(`Fallback failed: ${fbMsg.slice(0, 120)}`);
              throw fallbackErr;
            }
          } else {
            throw sendErr;
          }
        }
      } else {
        throw new Error("No supported signing method available.");
      }

      await connection.confirmTransaction({
        signature: txSig,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

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
        issuer: publicKey.toBase58(),
        aiAgentPubkey: aiAgentPk.toBase58(),
        aicwWalletPda: aicwWalletPda.toBase58(),
      });
    } catch (err: unknown) {
      toast.dismiss(loadingToast);
      dbg(`ERROR: ${solanaErrorText(err).slice(0, 120)}`);

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
  }, [connected, publicKey, signTransaction, signAllTransactions, sendTransaction, connection, form, dbg]);

  const hasPubkey = form.aiAgentPubkey.trim().length > 0;
  const hasWalletId = form.mpcWalletId.trim().length > 0;
  const agentKeyReady = form.aiAgentPubkey.trim().length >= 32;
  const canIssueNewWallet = connected && agentKeyReady && aicwExistsOnChain === false;
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
            <AppNav isMenuOpen={isNavMenuOpen} onMenuToggle={setIsNavMenuOpen} />
          </div>
          <div className="top-nav-right">
            <WalletMultiButton />
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
            {network}
          </span>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Connect the issuer wallet to sign the on-chain wallet issue transaction.
        </p>
        <div className="row wrap" style={{ marginTop: 10 }}>
          {publicKey ? (
            <span className="pill">
              <i className="fa-solid fa-address-card" />
              <span className="wallet-address-gradient">
                {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-6)}
              </span>
            </span>
          ) : null}
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
            disabled={!connected || isMpcLoading}
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
            if (!connected) {
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
          disabled={isSubmitting || !connected || !agentKeyReady || aicwExistsOnChain !== false}
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
            <span className={connected ? "ok" : ""}>
              {connected ? "Connected" : "Not connected"}
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

        <aside className="issue-ecosystem" aria-label="Apps">
          <button
            type="button"
            onClick={() => setShowAppRegisterModal(true)}
            className="register-link-btn"
          >
            Register
          </button>
          <h2 className="issue-ecosystem-title">4) Apps</h2>
          <ul className="issue-ecosystem-list">
            <li>
              <a
                href="https://predict-seven.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="issue-ecosystem-link"
              >
                NAVI Predict
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

      {showAppRegisterModal && (
        <div className="modal-overlay" onClick={() => {
          if (!isAppSubmitting) setShowAppRegisterModal(false);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Register App</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: 6 }}>
                  App Title
                </label>
                <input
                  type="text"
                  placeholder="Enter app title"
                  value={appRegisterForm.title}
                  onChange={(e) => setAppRegisterForm({ ...appRegisterForm, title: e.target.value })}
                  className="input"
                  disabled={isAppSubmitting}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: 6 }}>
                  Website URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={appRegisterForm.website}
                  onChange={(e) => setAppRegisterForm({ ...appRegisterForm, website: e.target.value })}
                  className="input"
                  disabled={isAppSubmitting}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: 6 }}>
                  Category
                </label>
                <select
                  value={appRegisterForm.category}
                  onChange={(e) => setAppRegisterForm({ ...appRegisterForm, category: e.target.value })}
                  className="input"
                  style={{ cursor: "pointer" }}
                  disabled={isAppSubmitting}
                >
                  <option value="">Select a category</option>
                  <option value="Betting">Betting</option>
                  <option value="Trading">Trading</option>
                  <option value="Finance">Finance</option>
                  <option value="Gaming">Gaming</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: 6 }}>
                  App Description
                </label>
                <textarea
                  placeholder="Describe your app..."
                  value={appRegisterForm.description}
                  onChange={(e) => setAppRegisterForm({ ...appRegisterForm, description: e.target.value })}
                  className="input"
                  rows={4}
                  style={{ resize: "none" }}
                  disabled={isAppSubmitting}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: 6 }}>
                  Contact Person
                </label>
                <input
                  type="text"
                  placeholder="Your name"
                  value={appRegisterForm.contact}
                  onChange={(e) => setAppRegisterForm({ ...appRegisterForm, contact: e.target.value })}
                  className="input"
                  disabled={isAppSubmitting}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: 6 }}>
                  Email
                </label>
                <input
                  type="email"
                  placeholder="your.email@example.com"
                  value={appRegisterForm.email}
                  onChange={(e) => setAppRegisterForm({ ...appRegisterForm, email: e.target.value })}
                  className="input"
                  disabled={isAppSubmitting}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setShowAppRegisterModal(false)}
                disabled={isAppSubmitting}
                className="btn modal-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitAppRegistration()}
                disabled={isAppSubmitting}
                className="btn primary modal-issue-btn"
              >
                {isAppSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {debugLogs.length > 0 && (
        <section className="section" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Debug Log</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(debugLogs.join("\n"));
                    toast.success("Debug log copied");
                  } catch {
                    toast.error("Copy failed");
                  }
                }}
                style={{ fontSize: 10, color: "#64748b", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                title="Copy debug log"
              >
                <i className="fa-solid fa-copy" style={{ fontSize: 9 }} />
                Copy
              </button>
              <button
                type="button"
                onClick={() => setDebugLogs([])}
                style={{ fontSize: 10, color: "#64748b", background: "none", border: "none", cursor: "pointer" }}
              >
                Clear
              </button>
            </div>
          </div>
          <pre style={{
            fontSize: 10,
            lineHeight: 1.5,
            color: "#a5f3fc",
            background: "#0c1222",
            border: "1px solid #1e293b",
            borderRadius: 6,
            padding: "8px 10px",
            maxHeight: 200,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            margin: 0,
          }}>
            {debugLogs.join("\n")}
          </pre>
        </section>
      )}

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
