import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { getMpcBridgeBaseUrl } from "./mpcAgentPubkey";
import { getMpcNetworkCode } from "./solanaCluster";

const MIN_AI_AGENT_FEE_LAMPORTS = 5000;

export type MpcSignSendParams = {
  connection: Connection;
  aiAgentPubkey: PublicKey;
  mpcWalletId: string;
  instructions: TransactionInstruction[];
  clientId?: string;
};

export async function mpcSignAndSendVersioned(
  params: MpcSignSendParams,
): Promise<string> {
  const bridge = getMpcBridgeBaseUrl();
  if (!bridge) {
    throw new Error("MPC Bridge URL not configured (NEXT_PUBLIC_MPC_BRIDGE_URL).");
  }
  const walletId = params.mpcWalletId.trim();
  if (!walletId) {
    throw new Error("MPC wallet ID is required.");
  }

  const agentBalance = await params.connection.getBalance(params.aiAgentPubkey);
  if (agentBalance < MIN_AI_AGENT_FEE_LAMPORTS) {
    throw new Error(
      `AI agent pubkey needs SOL for network fee (have ${agentBalance} lamports, need ≥ ${MIN_AI_AGENT_FEE_LAMPORTS}).`,
    );
  }

  const { blockhash, lastValidBlockHeight } = await params.connection.getLatestBlockhash("confirmed");
  const messageV0 = new TransactionMessage({
    payerKey: params.aiAgentPubkey,
    recentBlockhash: blockhash,
    instructions: params.instructions,
  }).compileToV0Message();
  const messageBytes = messageV0.serialize();

  const response = await fetch(`${bridge.replace(/\/$/, "")}/v1/mpc/sign-solana-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: params.clientId ?? `aicw-app-${Date.now()}`,
      walletId,
      messageBytesB64: Buffer.from(messageBytes).toString("base64"),
      networkCode: getMpcNetworkCode(),
      aiAgentPubkey: params.aiAgentPubkey.toBase58(),
    }),
  });

  const text = (await response.text()).trim();
  if (!response.ok) {
    throw new Error(text || `Bridge HTTP ${response.status}`);
  }

  let signatureB64: string;
  try {
    const data = JSON.parse(text) as { signatureB64?: string };
    if (!data.signatureB64) {
      throw new Error("missing signatureB64");
    }
    signatureB64 = data.signatureB64;
  } catch {
    throw new Error(text || "Invalid bridge response");
  }

  const sigBytes = Buffer.from(signatureB64, "base64");
  if (sigBytes.length !== 64) {
    throw new Error("Bridge returned invalid signature length");
  }

  const vtx = new VersionedTransaction(messageV0, [sigBytes]);
  const sig = await params.connection.sendRawTransaction(vtx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await params.connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}
