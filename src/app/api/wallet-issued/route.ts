import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import {
  notifyDropService,
  type WalletIssuedPayload,
} from "../../../lib/notifyWalletIssued";

const RPC =
  process.env.SOLANA_RPC_URL?.trim() ||
  process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() ||
  "https://api.devnet.solana.com";

const PROGRAM_ID =
  process.env.NEXT_PUBLIC_AICW_PROGRAM_ID?.trim() ||
  "9RUEw4jcMi8xcGf3tJRCAdzUzLuhEurts8Z2QQLsRbaV";

function isBase58Pubkey(s: string): boolean {
  try {
    const pk = new PublicKey(s);
    return pk.toBase58() === s;
  } catch {
    return false;
  }
}

function parseBody(body: unknown): WalletIssuedPayload | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const txSignature = typeof o.txSignature === "string" ? o.txSignature.trim() : "";
  const aicwWalletPda =
    typeof o.aicwWalletPda === "string" ? o.aicwWalletPda.trim() : "";
  const aiAgentPubkey =
    typeof o.aiAgentPubkey === "string" ? o.aiAgentPubkey.trim() : "";
  const issuerPubkey =
    typeof o.issuerPubkey === "string" ? o.issuerPubkey.trim() : "";
  const mpcWalletId =
    typeof o.mpcWalletId === "string" ? o.mpcWalletId.trim() : undefined;

  if (
    !txSignature ||
    !aicwWalletPda ||
    !aiAgentPubkey ||
    !issuerPubkey ||
    !isBase58Pubkey(aicwWalletPda) ||
    !isBase58Pubkey(aiAgentPubkey) ||
    !isBase58Pubkey(issuerPubkey)
  ) {
    return null;
  }

  return { txSignature, aicwWalletPda, aiAgentPubkey, issuerPubkey, mpcWalletId };
}

/** Verify AICWallet PDA exists and is owned by the AICW program. */
async function verifyWalletOnChain(aicwWalletPda: string): Promise<boolean> {
  try {
    const connection = new Connection(RPC, "confirmed");
    const info = await connection.getAccountInfo(new PublicKey(aicwWalletPda));
    if (!info) return false;
    return info.owner.equals(new PublicKey(PROGRAM_ID));
  } catch (e) {
    console.error("[AICW] wallet-issued on-chain verify failed:", e);
    return false;
  }
}

/**
 * Called by Issue Wallet UI after a confirmed `issue_wallet` transaction.
 * Forwards the event to aicw_drop for 0.1 SOL funding.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = parseBody(body);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid payload: txSignature, aicwWalletPda, aiAgentPubkey, issuerPubkey required" },
        { status: 400 },
      );
    }

    const onChain = await verifyWalletOnChain(payload.aicwWalletPda);
    if (!onChain) {
      return NextResponse.json(
        { error: "AICWallet PDA not found on-chain or wrong program owner" },
        { status: 404 },
      );
    }

    const drop = await notifyDropService(payload);
    if (!drop.ok) {
      return NextResponse.json(
        {
          message: "Wallet recorded; drop service unavailable or failed",
          dropNotified: false,
          dropError: drop.error,
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      message: "Wallet issued event sent to drop service",
      dropNotified: true,
    });
  } catch (error) {
    console.error("[AICW] wallet-issued API error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
