/** Client: notify aicw_drop after confirmed issue_wallet (static export has no API routes). */

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
  const dropBase = process.env.NEXT_PUBLIC_AICW_DROP_SERVICE_URL?.trim();
  if (!dropBase) {
    console.warn("[AICW] NEXT_PUBLIC_AICW_DROP_SERVICE_URL unset — skip drop");
    return;
  }

  const url = `${dropBase.replace(/\/$/, "")}/api/wallet-issued`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn("[AICW] drop service:", res.status, text);
  }
}
