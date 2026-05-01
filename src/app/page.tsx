"use client";

import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import idl from "../idl/aicw.json";
import {
  fetchMpcAgentSolanaPubkey,
  getMpcBridgeBaseUrl,
  isMpcBridgeConfigured,
} from "../lib/mpcAgentPubkey";

const ISSUER_HANDOFF_DOCS_URL =
  process.env.NEXT_PUBLIC_ISSUER_HANDOFF_DOCS_URL?.trim() ?? "";

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
  if (url.includes('devnet')) return 'Devnet';
  if (url.includes('testnet')) return 'Testnet';
  if (url.includes('mainnet')) return 'Mainnet';
  if (url.includes('localhost') || url.includes('127.0.0.1')) return 'Localnet';
  return 'Custom';
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
    const payload = `AI PUBLIC KEY : ${issueSuccess.aiPubkey}\nMPC wallet ID : ${issueSuccess.mpcWalletId}`;
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
    setWallet({ connected: false, publicKey: null });
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

    try {
      const phantom = (window as any).solana;
      if (!phantom?.isPhantom) {
        throw new Error("Phantom not available");
      }

      const pk = form.aiAgentPubkey.trim();
      const aiAgentPk = new PublicKey(pk);
      const [aicwWalletPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("aicw"), aiAgentPk.toBuffer()],
        AICW_PROGRAM_ID,
      );
      const [aiWillPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("will"), aicwWalletPda.toBuffer()],
        AICW_PROGRAM_ID,
      );

      const connection = new Connection(RPC, "confirmed");
      const issuerPk = new PublicKey(wallet.publicKey!);

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

      const mpcId = form.mpcWalletId.trim();
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
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error(`Failed: ${err.message ?? "Unknown error"}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [wallet, form]);

  const hasPubkey = form.aiAgentPubkey.trim().length > 0;
  const hasWalletId = form.mpcWalletId.trim().length > 0;
  const discordUrl = process.env.NEXT_PUBLIC_AICW_DISCORD_URL?.trim() || "#";
  const githubUrl = "https://github.com/aicw-protocol/aicw";
  const twitterUrl = "https://x.com/AICW_Protocol";

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="top-nav-inner">
          <div className="brand">
            <div className="brand-title">
              AICW <span className="brand-chain">ON SOLANA</span>
            </div>
          </div>

          <div className="nav-icons">
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
            <a
              className="icon-link"
              href={discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              title="Discord"
            >
              <i className="fa-brands fa-discord" />
            </a>
          </div>
        </div>
      </header>

      <section className="hero">
        <h1>Issue Wallet</h1>
        <p>
          Connect your wallet, load credentials from MPC, then issue on-chain.
          After issuance succeeds, copy the AI public key and MPC wallet ID from
          the success dialog and hand them to your AI agent.
        </p>
      </section>

      <section className="section">
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0 }}>1) Connect Wallet</h2>
          <span style={{ 
            fontSize: '13px', 
            color: '#10b981', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6,
            whiteSpace: 'nowrap',
            marginLeft: 'auto'
          }}>
            <span style={{ 
              width: 6, 
              height: 6, 
              borderRadius: '50%', 
              backgroundColor: '#10b981',
              display: 'inline-block'
            }} />
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
            <button onClick={disconnectWallet} className="btn fixed-action-btn">
              Disconnect
            </button>
          ) : (
            <button onClick={connectWallet} className="btn fixed-action-btn">
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
          {hasPubkey ? (
            <span className="pill ok-pill">
              <i className="fa-solid fa-check" />
              Ready to issue
            </span>
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
        <button
          onClick={() => {
            if (!wallet.connected) {
              toast.error("Connect your wallet first.");
              return;
            }
            if (!form.aiAgentPubkey || form.aiAgentPubkey.length < 32) {
              toast.error("Load AI public key from MPC first.");
              return;
            }
            setShowIssueModal(true);
          }}
          disabled={isSubmitting || !wallet.connected}
          className="btn primary"
        >
          Issue AICW Wallet
        </button>
      </section>

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
                disabled={isSubmitting}
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

            <button type="button" onClick={() => void copySuccessBundle()} className="btn modal-copy-btn">
              <i className={`fa-solid ${successCopied ? "fa-check" : "fa-copy"}`} style={{ marginRight: 6 }} />
              {successCopied ? "Copied" : "Copy"}
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
            <span className={hasPubkey ? "ok" : ""}>
              {hasPubkey ? "Ready" : "Missing"}
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
  );
}
