"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { closeWalletAndReclaimRent } from "../lib/closeWallet";
import { loadMpcWalletIdForAgent } from "../lib/mpcWalletStorage";
import { solscanTxUrl } from "../lib/solanaCluster";

type ReclaimRentModalProps = {
  open: boolean;
  aiAgentPubkey: string;
  issuerPubkey: string;
  aicwPda?: string;
  initialMpcWalletId?: string;
  onClose: () => void;
  onSuccess?: () => void;
};

export function ReclaimRentModal({
  open,
  aiAgentPubkey,
  issuerPubkey,
  aicwPda,
  initialMpcWalletId,
  onClose,
  onSuccess,
}: ReclaimRentModalProps) {
  const [mpcWalletId, setMpcWalletId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const stored = loadMpcWalletIdForAgent(aiAgentPubkey);
    setMpcWalletId((initialMpcWalletId ?? stored).trim());
  }, [open, aiAgentPubkey, initialMpcWalletId]);

  if (!open) return null;

  const onConfirm = async () => {
    const id = mpcWalletId.trim();
    if (!id) {
      toast.error("Enter the MPC wallet ID from issuance.");
      return;
    }
    setBusy(true);
    const loading = toast.loading("Closing wallet and reclaiming rent…");
    try {
      const sig = await closeWalletAndReclaimRent({
        aiAgentPubkey,
        issuerPubkey,
        mpcWalletId: id,
        aicwPda,
      });
      toast.dismiss(loading);
      toast.success("Rent reclaimed (~0.0064 SOL to your issuer wallet).");
      window.open(solscanTxUrl(sig), "_blank");
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.dismiss(loading);
      toast.error(e instanceof Error ? e.message : "Reclaim failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Close wallet &amp; reclaim rent</h3>
        <p className="modal-success-notice">
          Closes the AICWallet and AIWill accounts. About <strong>0.0064 SOL</strong> in account rent
          (plus any remaining PDA balance) returns to your issuer wallet. Requires MPC signing (AI
          agent key) plus a small network fee on the AI agent pubkey.
        </p>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Works regardless of prior transfers, rejects, will updates, or betting. DecisionLog account
          rent is separate and not reclaimed. On-chain program must include <code>close_wallet</code>.
        </p>
        <div className="modal-success-field">
          <span className="modal-key-name">MPC wallet ID</span>
          <input
            className="input"
            value={mpcWalletId}
            onChange={(e) => setMpcWalletId(e.target.value)}
            placeholder="UUID from issuance dialog"
            disabled={busy}
            autoComplete="off"
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn modal-cancel-btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary modal-issue-btn" disabled={busy} onClick={() => void onConfirm()}>
            {busy ? "Closing…" : "Close wallet"}
          </button>
        </div>
      </div>
    </div>
  );
}
