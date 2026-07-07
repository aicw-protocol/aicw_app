/**
 * Node referral integration for wallet issuance.
 * 
 * When a user issues an AICW wallet, a referral node is selected
 * to receive the node fee (0.001 SOL).
 */

const NODE_WEB_API_URL = process.env.NEXT_PUBLIC_NODE_WEB_API_URL?.trim() || "";

export interface ReferralNodeInfo {
  available: boolean;
  nodeId?: string;
  ownerWallet?: string;
  feeSol: number;
  feeLamports: number;
  activeNodeCount?: number;
  reason?: string;
}

/**
 * Fetch a referral node for wallet issuance.
 * Returns info about the selected node or indicates if none available.
 */
export async function selectReferralNode(): Promise<ReferralNodeInfo> {
  if (!NODE_WEB_API_URL) {
    console.log("[Referral] NODE_WEB_API_URL not configured, skipping referral");
    return {
      available: false,
      feeSol: 0.001,
      feeLamports: 1_000_000,
      reason: "not_configured",
    };
  }

  try {
    const res = await fetch(`${NODE_WEB_API_URL}/api/referral/select`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[Referral] Select API failed:", res.status);
      return {
        available: false,
        feeSol: 0.001,
        feeLamports: 1_000_000,
        reason: "api_error",
      };
    }

    const data = await res.json();
    return {
      available: data.available ?? false,
      nodeId: data.nodeId,
      ownerWallet: data.ownerWallet,
      feeSol: data.feeSol ?? 0.001,
      feeLamports: data.feeLamports ?? 1_000_000,
      activeNodeCount: data.activeNodeCount,
      reason: data.reason,
    };
  } catch (error) {
    console.error("[Referral] Failed to select referral node:", error);
    return {
      available: false,
      feeSol: 0.001,
      feeLamports: 1_000_000,
      reason: "network_error",
    };
  }
}

/**
 * Record a successful wallet issuance with a referral node.
 * Call this after the wallet issuance transaction is confirmed.
 */
export async function recordWalletOpen(input: {
  nodeId: string;
  txSignature: string;
  aicwWalletPda: string;
  issuerPubkey: string;
}): Promise<boolean> {
  if (!NODE_WEB_API_URL) {
    console.log("[Referral] NODE_WEB_API_URL not configured, skipping record");
    return false;
  }

  try {
    const res = await fetch(`${NODE_WEB_API_URL}/api/referral/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: input.nodeId,
        txSignature: input.txSignature,
        aicwWalletPda: input.aicwWalletPda,
        issuerPubkey: input.issuerPubkey,
      }),
    });

    if (!res.ok) {
      console.error("[Referral] Record API failed:", res.status);
      return false;
    }

    const data = await res.json();
    console.log("[Referral] Recorded wallet open:", data);
    return data.recorded ?? false;
  } catch (error) {
    console.error("[Referral] Failed to record wallet open:", error);
    return false;
  }
}

/**
 * Check if node referral is configured and available.
 */
export function isReferralConfigured(): boolean {
  return !!NODE_WEB_API_URL;
}
