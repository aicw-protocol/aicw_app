/** Client: notify server after confirmed issue_wallet (forwards to aicw_drop). */

export type WalletIssuedClientPayload = {
  txSignature: string;
  aicwWalletPda: string;
  aiAgentPubkey: string;
  issuerPubkey: string;
  mpcWalletId?: string;
};

export async function requestWalletDrop(
  payload: WalletIssuedClientPayload,
): Promise<void> {
  const base =
    process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";
  const res = await fetch(`${base}/api/wallet-issued`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn("[AICW] wallet-issued API:", res.status, text);
  }
}
