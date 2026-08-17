import { PublicKey } from "@solana/web3.js";
import {
  AICW_PROGRAM_ID,
  findAiWillPda,
  getAicwConnection,
  getReadOnlyAicwProgram,
} from "./aicwChain";
import { canReclaimWalletRent } from "./explorerData";
import { mpcSignAndSendVersioned } from "./mpcSignSolana";

type AicwWalletAccount = {
  issuerPubkey: PublicKey;
  totalTransactions: { toNumber(): number };
  decisionsMade: { toNumber(): number };
};

type AiWillAccount = {
  isExecuted: boolean;
};

export type CloseWalletParams = {
  aiAgentPubkey: string;
  issuerPubkey: string;
  mpcWalletId: string;
  aicwPda?: string;
};

export function canReclaimWalletRentAsIssuer(
  row: {
    issuerPubkey: string;
    totalTransactions: string;
    decisionsMade: string;
    willExecuted: boolean;
  },
  connectedIssuer: string | null | undefined,
): boolean {
  if (!connectedIssuer) return false;
  if (connectedIssuer !== row.issuerPubkey) return false;
  return canReclaimWalletRent(row);
}

export async function closeWalletAndReclaimRent(params: CloseWalletParams): Promise<string> {
  const aiAgentPk = new PublicKey(params.aiAgentPubkey);
  const issuerPk = new PublicKey(params.issuerPubkey);
  const aicwWalletPda =
    params.aicwPda != null && params.aicwPda.length > 0
      ? new PublicKey(params.aicwPda)
      : PublicKey.findProgramAddressSync([Buffer.from("aicw"), aiAgentPk.toBuffer()], AICW_PROGRAM_ID)[0];
  const [aiWillPda] = findAiWillPda(aicwWalletPda);

  const connection = getAicwConnection();
  const program = getReadOnlyAicwProgram(connection);
  const accounts = program.account as unknown as {
    aicWallet: { fetch(address: PublicKey): Promise<AicwWalletAccount> };
    aiWill: { fetch(address: PublicKey): Promise<AiWillAccount> };
  };

  const walletAccount = await accounts.aicWallet.fetch(aicwWalletPda);
  if (walletAccount.issuerPubkey.toBase58() !== issuerPk.toBase58()) {
    throw new Error("Connected wallet is not the issuer for this AICW wallet.");
  }
  if (Number(walletAccount.totalTransactions) > 0 || Number(walletAccount.decisionsMade) > 0) {
    throw new Error("Wallet has on-chain activity and cannot be closed.");
  }

  const willAccount = await accounts.aiWill.fetch(aiWillPda);
  if (willAccount.isExecuted) {
    throw new Error("Will already executed; wallet cannot be closed.");
  }

  const ix = await program.methods
    .closeWallet()
    .accounts({
      aicwWallet: aicwWalletPda,
      aiWill: aiWillPda,
      aiSigner: aiAgentPk,
      rentRecipient: issuerPk,
    })
    .instruction();

  return mpcSignAndSendVersioned({
    connection,
    aiAgentPubkey: aiAgentPk,
    mpcWalletId: params.mpcWalletId,
    instructions: [ix],
    clientId: `close-wallet-${Date.now()}`,
  });
}
