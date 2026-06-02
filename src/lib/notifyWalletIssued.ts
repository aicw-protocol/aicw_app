/**
 * Server-side: forward confirmed wallet issuance to aicw_drop service.
 */

export type WalletIssuedPayload = {
  txSignature: string;
  aicwWalletPda: string;
  aiAgentPubkey: string;
  issuerPubkey: string;
  mpcWalletId?: string;
};

export async function notifyDropService(
  payload: WalletIssuedPayload,
): Promise<{ ok: boolean; error?: string }> {
  const base = process.env.AICW_DROP_SERVICE_URL?.trim();
  if (!base) {
    console.warn("[AICW] AICW_DROP_SERVICE_URL unset — skip drop notify");
    return { ok: false, error: "AICW_DROP_SERVICE_URL not configured" };
  }

  const secret = process.env.AICW_DROP_WEBHOOK_SECRET?.trim();
  const url = `${base.replace(/\/$/, "")}/api/wallet-issued`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-AICW-Drop-Secret": secret } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text();
    let data: { message?: string; error?: string } = {};
    try {
      data = JSON.parse(text) as { message?: string; error?: string };
    } catch {
      data = { message: text };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: data.error || data.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[AICW] drop notify failed:", msg);
    return { ok: false, error: msg };
  }
}
