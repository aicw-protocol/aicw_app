/** Client: request devnet SOL drop after confirmed issue_wallet (static export → drop URL). */

export type WalletIssuedClientPayload = {
  txSignature: string;
  aicwWalletPda: string;
  aiAgentPubkey: string;
  issuerPubkey: string;
  mpcWalletId?: string;
};

function dropPostUrl(): string | null {
  const publicDrop = process.env.NEXT_PUBLIC_AICW_DROP_URL?.trim();
  if (publicDrop) {
    return `${publicDrop.replace(/\/$/, "")}/api/wallet-issued`;
  }
  return null;
}

export async function requestWalletDrop(
  payload: WalletIssuedClientPayload,
): Promise<void> {
  const dropUrl = dropPostUrl();
  if (!dropUrl) {
    console.warn(
      "[AICW] NEXT_PUBLIC_AICW_DROP_URL unset — skip drop (static export has no /api/wallet-issued)",
    );
    return;
  }

  const res = await fetch(dropUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn("[AICW] drop service:", res.status, text);
  }
}
