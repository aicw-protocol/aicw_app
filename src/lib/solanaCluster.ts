export type SolanaCluster = "devnet" | "mainnet-beta" | "testnet" | "localnet";

export const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() ?? "https://api.devnet.solana.com";

export function getSolanaCluster(): SolanaCluster {
  const explicit = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim().toLowerCase();
  if (explicit === "mainnet" || explicit === "mainnet-beta") return "mainnet-beta";
  if (explicit === "devnet") return "devnet";
  if (explicit === "testnet") return "testnet";
  if (explicit === "localnet") return "localnet";

  const url = SOLANA_RPC.toLowerCase();
  if (url.includes("devnet")) return "devnet";
  if (url.includes("testnet")) return "testnet";
  if (url.includes("mainnet")) return "mainnet-beta";
  if (url.includes("localhost") || url.includes("127.0.0.1")) return "localnet";
  return "devnet";
}

export function getClusterLabel(cluster: SolanaCluster = getSolanaCluster()): string {
  switch (cluster) {
    case "mainnet-beta":
      return "Mainnet";
    case "devnet":
      return "Devnet";
    case "testnet":
      return "Testnet";
    case "localnet":
      return "Localnet";
    default:
      return "Custom";
  }
}

/** Solscan cluster query param (omit on mainnet). */
export function solscanClusterParam(
  cluster: SolanaCluster = getSolanaCluster(),
): string {
  if (cluster === "mainnet-beta") return "";
  if (cluster === "localnet") return "devnet";
  return cluster;
}

export function solscanTxUrl(
  signature: string,
  cluster: SolanaCluster = getSolanaCluster(),
): string {
  const param = solscanClusterParam(cluster);
  const base = `https://solscan.io/tx/${signature}`;
  return param ? `${base}?cluster=${param}` : base;
}

export function getMpcNetworkCode(
  cluster: SolanaCluster = getSolanaCluster(),
): string {
  return cluster === "mainnet-beta" ? "solana-mainnet" : "solana-devnet";
}

export function isMainnet(cluster: SolanaCluster = getSolanaCluster()): boolean {
  return cluster === "mainnet-beta";
}
