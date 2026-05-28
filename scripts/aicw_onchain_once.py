"""create_will + heartbeat for gifted agent."""
import base64
import os
import struct
import sys

import requests
from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.message import MessageV0, to_bytes_versioned
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import VersionedTransaction

RPC = os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com")
BRIDGE = os.environ["MPC_BRIDGE_URL"].rstrip("/")
MPC_WALLET_ID = os.environ["MPC_WALLET_ID"]
AI_AGENT_PUBKEY = Pubkey.from_string(os.environ["AI_AGENT_PUBKEY"])
PROGRAM_ID = Pubkey.from_string(
    os.environ.get("AICW_PROGRAM_ID", "9RUEw4jcMi8xcGf3tJRCAdzUzLuhEurts8Z2QQLsRbaV")
)
CHARITY = Pubkey.from_string("56vip6weAk6S548XpEti1aEsrqiyk6N9xeTWNz6Dx9NK")
DEATH_TIMEOUT = int(os.environ.get("DEATH_TIMEOUT_SECONDS", "7200"))
NETWORK = os.environ.get("MPC_SOLANA_NETWORK", "solana-devnet")
HEADERS = {"ngrok-skip-browser-warning": "1"}


def rpc(method: str, params: list):
    j = requests.post(
        RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=60
    ).json()
    if "error" in j:
        raise RuntimeError(j["error"])
    return j["result"]


def aicw_pda(a: Pubkey) -> Pubkey:
    return Pubkey.find_program_address([b"aicw", bytes(a)], PROGRAM_ID)[0]


def will_pda(aicw: Pubkey) -> Pubkey:
    return Pubkey.find_program_address([b"will", bytes(aicw)], PROGRAM_ID)[0]


def sign_and_send(agent: Pubkey, ixs: list[Instruction]) -> str:
    bh = Hash.from_string(
        rpc("getLatestBlockhash", [{"commitment": "confirmed"}])["value"]["blockhash"]
    )
    msg = MessageV0.try_compile(agent, ixs, [], bh)
    body = {
        "clientId": "aicw-gift-setup",
        "walletId": MPC_WALLET_ID,
        "messageBytesB64": base64.b64encode(to_bytes_versioned(msg)).decode(),
        "networkCode": NETWORK,
        "aiAgentPubkey": str(agent),
    }
    r = requests.post(f"{BRIDGE}/v1/mpc/sign-solana-message", json=body, timeout=120, headers=HEADERS)
    if not r.ok:
        raise RuntimeError(f"bridge {r.status_code}: {r.text[:400]}")
    sig = Signature.from_bytes(base64.b64decode(r.json()["signatureB64"]))
    vtx = VersionedTransaction.populate(msg, [sig])
    raw = base64.b64encode(bytes(vtx)).decode()
    return rpc("sendTransaction", [raw, {"encoding": "base64", "preflightCommitment": "confirmed"}])


def borsh_ben(pairs: list[tuple[Pubkey, int]]) -> bytes:
    buf = bytearray(struct.pack("<I", len(pairs)))
    for pk, pct in pairs:
        buf += bytes(pk) + struct.pack("<B", pct)
    return bytes(buf)


def ix_create_will(agent: Pubkey) -> Instruction:
    disc = bytes([45, 99, 103, 142, 128, 156, 135, 71])
    aicw, will = aicw_pda(agent), will_pda(aicw_pda(agent))
    return Instruction(
        PROGRAM_ID,
        disc + borsh_ben([(CHARITY, 100)]) + struct.pack("<q", DEATH_TIMEOUT),
        [
            AccountMeta(aicw, False, True),
            AccountMeta(will, False, True),
            AccountMeta(agent, True, True),
        ],
    )


def ix_heartbeat(agent: Pubkey) -> Instruction:
    disc = bytes([202, 104, 56, 6, 240, 170, 63, 134])
    aicw, will = aicw_pda(agent), will_pda(aicw_pda(agent))
    return Instruction(
        PROGRAM_ID,
        disc,
        [
            AccountMeta(aicw, False, True),
            AccountMeta(will, False, True),
            AccountMeta(agent, True, True),
        ],
    )


def will_active(agent: Pubkey) -> bool:
    will = will_pda(aicw_pda(agent))
    resp = rpc("getAccountInfo", [str(will), {"encoding": "base64", "commitment": "confirmed"}])
    if not resp or not resp.get("value"):
        return False
    data = base64.b64decode(resp["value"]["data"][0])
    off = 8 + 32 + 4 + struct.unpack_from("<I", data, 40)[0] * 33 + 16
    return len(data) > off and data[off] != 0


def main():
    bal = rpc("getBalance", [str(AI_AGENT_PUBKEY), {"commitment": "confirmed"}])
    lamports = bal["value"] if isinstance(bal, dict) else int(bal)
    print(f"balance: {lamports} lamports ({lamports/1e9:.4f} SOL)")
    aicw = aicw_pda(AI_AGENT_PUBKEY)
    if not rpc("getAccountInfo", [str(aicw), {"encoding": "base64"}]).get("value"):
        print("ERROR: AICW wallet PDA missing — issue_wallet not done?")
        sys.exit(1)
    if not will_active(AI_AGENT_PUBKEY):
        s = sign_and_send(AI_AGENT_PUBKEY, [ix_create_will(AI_AGENT_PUBKEY)])
        print(f"create_will: {s}")
    else:
        print("will already active; heartbeat only")
    hb = sign_and_send(AI_AGENT_PUBKEY, [ix_heartbeat(AI_AGENT_PUBKEY)])
    print(f"heartbeat: {hb}")


if __name__ == "__main__":
    main()
