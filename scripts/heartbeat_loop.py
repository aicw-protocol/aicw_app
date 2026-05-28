"""Send AICW heartbeat every N seconds (env-driven)."""
import base64
import os
import struct
import sys
import time

import requests
from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.message import MessageV0, to_bytes_versioned
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import VersionedTransaction

RPC = os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com")
BRIDGE = os.environ.get("MPC_BRIDGE_URL", "").rstrip("/")
MPC_WALLET_ID = os.environ.get("MPC_WALLET_ID", "")
AI_AGENT_PUBKEY = Pubkey.from_string(os.environ["AI_AGENT_PUBKEY"])
PROGRAM_ID = Pubkey.from_string(
    os.environ.get("AICW_PROGRAM_ID", "9RUEw4jcMi8xcGf3tJRCAdzUzLuhEurts8Z2QQLsRbaV")
)
INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL_SECONDS", "300"))
NETWORK = os.environ.get("MPC_SOLANA_NETWORK", "solana-devnet")


def rpc(method: str, params: list):
    r = requests.post(
        RPC,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        timeout=60,
    )
    r.raise_for_status()
    j = r.json()
    if "error" in j:
        raise RuntimeError(j["error"])
    return j["result"]


def aicw_wallet_pda(ai_agent: Pubkey) -> Pubkey:
    return Pubkey.find_program_address([b"aicw", bytes(ai_agent)], PROGRAM_ID)[0]


def ai_will_pda(aicw_wallet: Pubkey) -> Pubkey:
    return Pubkey.find_program_address([b"will", bytes(aicw_wallet)], PROGRAM_ID)[0]


def latest_blockhash() -> Hash:
    bh = rpc("getLatestBlockhash", [{"commitment": "confirmed"}])["value"]["blockhash"]
    return Hash.from_string(bh)


def sign_and_send(ai_agent: Pubkey, instructions: list[Instruction]) -> str:
    bh = latest_blockhash()
    msg = MessageV0.try_compile(
        payer=ai_agent,
        instructions=instructions,
        address_lookup_table_accounts=[],
        recent_blockhash=bh,
    )
    msg_bytes = to_bytes_versioned(msg)
    body = {
        "clientId": "heartbeat-loop",
        "walletId": MPC_WALLET_ID,
        "messageBytesB64": base64.b64encode(msg_bytes).decode("ascii"),
        "networkCode": NETWORK,
        "aiAgentPubkey": str(ai_agent),
    }
    r = requests.post(
        f"{BRIDGE}/v1/mpc/sign-solana-message",
        json=body,
        timeout=120,
        headers={"ngrok-skip-browser-warning": "1"},
    )
    if not r.ok:
        raise RuntimeError(f"Bridge {r.status_code}: {r.text[:400]}")
    sig_b64 = r.json()["signatureB64"]
    sig = Signature.from_bytes(base64.b64decode(sig_b64))
    vtx = VersionedTransaction.populate(msg, [sig])
    raw = base64.b64encode(bytes(vtx)).decode("ascii")
    return rpc(
        "sendTransaction",
        [
            raw,
            {
                "encoding": "base64",
                "skipPreflight": False,
                "preflightCommitment": "confirmed",
            },
        ],
    )


def ix_heartbeat(ai_agent: Pubkey) -> Instruction:
    aicw = aicw_wallet_pda(ai_agent)
    will = ai_will_pda(aicw)
    disc = bytes([202, 104, 56, 6, 240, 170, 63, 134])
    return Instruction(
        program_id=PROGRAM_ID,
        data=disc,
        accounts=[
            AccountMeta(pubkey=aicw, is_signer=False, is_writable=True),
            AccountMeta(pubkey=will, is_signer=False, is_writable=True),
            AccountMeta(pubkey=ai_agent, is_signer=True, is_writable=True),
        ],
    )


def main():
    if not BRIDGE or not MPC_WALLET_ID:
        print("Set MPC_BRIDGE_URL and MPC_WALLET_ID", file=sys.stderr)
        sys.exit(1)
    print(f"Heartbeat every {INTERVAL}s for {AI_AGENT_PUBKEY}", flush=True)
    while True:
        try:
            sig = sign_and_send(AI_AGENT_PUBKEY, [ix_heartbeat(AI_AGENT_PUBKEY)])
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] heartbeat ok: {sig}", flush=True)
        except Exception as e:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] heartbeat failed: {e}", flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
