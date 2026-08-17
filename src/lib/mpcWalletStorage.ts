const PREFIX = "aicw:mpc:";

export function saveMpcWalletIdForAgent(aiAgentPubkey: string, mpcWalletId: string): void {
  if (!aiAgentPubkey.trim() || !mpcWalletId.trim()) return;
  try {
    localStorage.setItem(`${PREFIX}${aiAgentPubkey.trim()}`, mpcWalletId.trim());
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadMpcWalletIdForAgent(aiAgentPubkey: string): string {
  if (!aiAgentPubkey.trim()) return "";
  try {
    return localStorage.getItem(`${PREFIX}${aiAgentPubkey.trim()}`) ?? "";
  } catch {
    return "";
  }
}
