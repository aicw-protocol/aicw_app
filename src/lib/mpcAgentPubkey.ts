import { PublicKey } from "@solana/web3.js";

export type MpcAgentPubkeyResponse = {
  solanaPubkeyBase58: string;
  walletId?: string;
};

function eddsaBase64ToSolanaBase58(eddsaB64: string): string {
  const bin = atob(eddsaB64.trim());
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  if (raw.length !== 32) {
    throw new Error("Ed25519 public key must be 32 bytes");
  }
  return new PublicKey(raw).toBase58();
}

export async function fetchMpcAgentSolanaPubkey(
  bridgeBaseUrl: string,
  options?: { clientId?: string; signal?: AbortSignal },
): Promise<MpcAgentPubkeyResponse> {
  const base = bridgeBaseUrl.replace(/\/$/, "");
  const clientId =
    options?.clientId ?? `issuer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const res = await fetch(`${base}/v1/mpc/ai-agent-pubkey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
    signal: options?.signal,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Bridge HTTP ${res.status}`);
  }

  const j = (await res.json()) as Record<string, unknown>;

  if (typeof j.solanaAddress === "string" && j.solanaAddress.length >= 32) {
    new PublicKey(j.solanaAddress);
    return { solanaPubkeyBase58: j.solanaAddress, walletId: j.walletId as string | undefined };
  }
  if (typeof j.aiAgentPubkey === "string" && j.aiAgentPubkey.length >= 32) {
    new PublicKey(j.aiAgentPubkey);
    return { solanaPubkeyBase58: j.aiAgentPubkey, walletId: j.walletId as string | undefined };
  }

  const b64 =
    (typeof j.eddsaPubKey === "string" && j.eddsaPubKey) ||
    (typeof j.eddsa_pub_key === "string" && j.eddsa_pub_key);
  if (b64) {
    return {
      solanaPubkeyBase58: eddsaBase64ToSolanaBase58(b64),
      walletId: typeof j.walletId === "string" ? j.walletId : (j.wallet_id as string | undefined),
    };
  }

  throw new Error("Bridge: expected solanaAddress, aiAgentPubkey, or eddsaPubKey (base64)");
}

export function isMpcBridgeConfigured(): boolean {
  const u = process.env.NEXT_PUBLIC_MPC_BRIDGE_URL?.trim();
  return !!u;
}

export function getMpcBridgeBaseUrl(): string {
  return process.env.NEXT_PUBLIC_MPC_BRIDGE_URL?.trim() ?? "";
}

export async function isMpcBridgeReachable(
  bridgeBaseUrl: string,
  options?: { signal?: AbortSignal },
): Promise<boolean> {
  const base = bridgeBaseUrl.replace(/\/$/, "");
  if (!base) return false;
  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      signal: options?.signal,
    });
    return res.ok;
  } catch {
    return false;
  }
}
