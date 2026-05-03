import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import idl from "../idl/aicw.json";

export const AICW_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

export const AICW_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_AICW_PROGRAM_ID ?? "9RUEw4jcMi8xcGf3tJRCAdzUzLuhEurts8Z2QQLsRbaV",
);

export function getAicwConnection(): Connection {
  return new Connection(AICW_RPC, "confirmed");
}

/** Read-only Anchor program (no signing). */
export function getReadOnlyAicwProgram(connection: Connection): Program {
  const wallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: async (tx: unknown) => tx,
    signAllTransactions: async (txs: unknown[]) => txs,
  };
  const provider = new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
  const idlWithAddr = { ...(idl as object), address: AICW_PROGRAM_ID.toBase58() } as Idl;
  return new Program(idlWithAddr, provider);
}

export function findAiWillPda(aicwWallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("will"), aicwWallet.toBuffer()], AICW_PROGRAM_ID);
}
