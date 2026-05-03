---
name: aicw_skill
version: 2.0.0
description: AICW on-chain operations for AI agents (Python, MPC Bridge signing, exact IDL fields).
---

# AICW Agent Skill — On-Chain Operations

You steward an **AICW (AI-Controlled Wallet)** on Solana: PDAs hold state; your **AI agent Solana pubkey** signs allowed instructions.

## RULE — Python only

**Always use Python 3** for automation in this guide:

- Use **`requests`** for **HTTP** (MPC Bridge, JSON-RPC to Solana).
- Use **`solders`** (+ **`solana`** client) to **build `MessageV0` / `Instruction`** and serialize transactions.

Do not rely on shell `curl` / PowerShell for production flows.

Install (example):

```bash
pip install requests solders solana
```

---

## How instructions are executed (read this first)

| Path | When | What you do |
|------|------|----------------|
| **A — MPC Bridge (recommended for agents)** | Keys live in Mpcium; you have `mpc_wallet_id` from issuance. | Build an **unsigned** `MessageV0`, base64-encode its bytes, `POST /v1/mpc/sign-solana-message`, attach returned **Ed25519 signature**, `sendTransaction` to RPC. |
| **B — Local keypair (dev only)** | You hold a file `Keypair` (not MPC). | Sign with `Keypair.sign_message` / `VersionedTransaction` helpers locally — **not** for production agents. |

**Predict** used MPC Bridge for **Predict HTTP** (`proxy-predict`). **AICW** program calls are **not** proxied by that route today: you **build Solana transactions yourself**, then call **`POST /v1/mpc/sign-solana-message`** on the same bridge with `walletId` + `messageBytesB64` + `networkCode`.

Bridge contract (mpcium `mpc-bridge`):

- **URL**: operator gives you `BRIDGE` (e.g. `http://127.0.0.1:8081`).
- **Sign**: `POST /v1/mpc/sign-solana-message`  
  Body JSON: `clientId` (optional), `walletId` (required), `messageBytesB64` (required), `networkCode` (optional, default `solana-devnet`).
- **Response JSON**: `signatureB64` — 64-byte Ed25519 signature, base64.

Default `networkCode` if omitted is **`solana-devnet`**; set explicitly for mainnet when your operator configures it.

---

## Constants — program ID & PDAs

Use the same program id as your deployment (default devnet deploy in `aicw_app`):

```python
import os
import struct
import base64
import json
import requests
from solders.pubkey import Pubkey
from solders.instruction import Instruction, AccountMeta
from solders.message import MessageV0
from solders.hash import Hash
from solders.transaction import VersionedTransaction
from solders.signature import Signature

RPC = os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com")
BRIDGE = os.environ["MPC_BRIDGE_URL"].rstrip("/")  # e.g. http://127.0.0.1:8081
MPC_WALLET_ID = os.environ["MPC_WALLET_ID"]
AI_AGENT_PUBKEY = Pubkey.from_string(os.environ["AI_AGENT_PUBKEY"])
PROGRAM_ID = Pubkey.from_string(
    os.environ.get("AICW_PROGRAM_ID", "9RUEw4jcMi8xcGf3tJRCAdzUzLuhEurts8Z2QQLsRbaV")
)


def aicw_wallet_pda(ai_agent: Pubkey) -> Pubkey:
    """Seed: b'aicw' + ai_agent.to_bytes() — matches `issue_wallet` / IDL."""
    return Pubkey.find_program_address([b"aicw", bytes(ai_agent)], PROGRAM_ID)[0]


def ai_will_pda(aicw_wallet: Pubkey) -> Pubkey:
    """Seed: b'will' + aicw_wallet.to_bytes()."""
    return Pubkey.find_program_address([b"will", bytes(aicw_wallet)], PROGRAM_ID)[0]
```

---

## Exact names — IDL vs Anchor TS client (no guessing)

The **IDL JSON** (`aicw.json`) uses **snake_case** field names on structs. The **JavaScript `@coral-xyz/anchor`** client decodes accounts with **camelCase**.

| Account | IDL / Rust-style (snake_case) | Anchor **TypeScript** client |
|---------|------------------------------|------------------------------|
| **AIWill** | `wallet`, `beneficiaries`, `last_heartbeat`, `death_timeout`, `updated_by_ai`, `is_executed`, `bump` | `wallet`, `beneficiaries`, `lastHeartbeat`, `deathTimeout`, `updatedByAi`, `isExecuted`, `bump` |
| **AICWallet** | `ai_agent_pubkey`, `issuer_pubkey`, `allowed_programs`, `total_transactions`, `total_volume`, `decisions_made`, `decisions_rejected`, … | `aiAgentPubkey`, `issuerPubkey`, `allowedPrograms`, `totalTransactions`, `totalVolume`, `decisionsMade`, `decisionsRejected`, … |

**Beneficiary line** in IDL struct `BeneficiaryShare`: fields **`pubkey`** (32 bytes), **`pct`** (`u8`, 0–100). **Sum of all `pct` must be 100.**

**`death_timeout`** on-chain is **`i64` seconds** (IDL), not “days” in the account.

---

## Instruction discriminators (first 8 bytes of ix `data`)

| Instruction | 8-byte discriminator (decimal, as in IDL) |
|-------------|---------------------------------------------|
| `heartbeat` | `[202, 104, 56, 6, 240, 170, 63, 134]` |
| `create_will` | `[45, 99, 103, 142, 128, 156, 135, 71]` |
| `update_will` | `[192, 206, 217, 54, 165, 122, 8, 10]` |

---

## Account metas (IDL order) — `heartbeat`, `create_will`, `update_will`

Signer **`ai_signer`** is the **AI agent pubkey** (same as `AI_AGENT_PUBKEY`).

### `heartbeat` — accounts

1. `aicw_wallet` — PDA above; **writable**, not signer.  
2. `ai_will` — PDA above; **writable**, not signer.  
3. `ai_signer` — **writable**, **signer** (AI agent).

**Args:** none → `data` is exactly the 8-byte discriminator.

### `create_will` / `update_will` — accounts

Same three accounts as `heartbeat`, same order and flags.

**Args (Borsh, Anchor):**

1. `Vec<BeneficiaryShare>`: `u32` little-endian length, then for each entry: 32-byte pubkey + 1-byte `pct`.  
2. `i64` little-endian `death_timeout` (seconds).

---

## Python — JSON-RPC helpers

```python
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


def get_balance_lamports(pubkey: Pubkey) -> int:
    """Native SOL for the given account (lamports)."""
    out = rpc("getBalance", [str(pubkey), {"commitment": "confirmed"}])
    if isinstance(out, dict) and "value" in out:
        return int(out["value"])
    return int(out)


def latest_blockhash() -> Hash:
    bh = rpc("getLatestBlockhash", [{"commitment": "confirmed"}])["value"]["blockhash"]
    return Hash.from_string(bh)
```

---

## Python — read `allowed_programs` from RPC (raw base64)

Without `anchorpy`, you still need Borsh layout for `AICWallet`. Practical approach: **decode with `anchorpy`** from the repo IDL, or use **Explorer / indexer** for ops.

Minimal pattern: fetch account, base64-decode `data[0]`, skip **8-byte account discriminator**, then parse fields in IDL order (error-prone by hand). **Recommended:**

```python
# pip install anchorpy
# Load Program from the same aicw.json as aicw_app; then:
# await program.account["aicWallet"].fetch(aicw_pda)
# and read decoded["allowedPrograms"] in TS camelCase / anchor-py naming per version.
```

If you must stay dependency-light: ask your operator for a small **read-only microservice** that returns JSON for `allowed_programs` and will fields.

---

## Python — build `heartbeat`, sign via MPC Bridge, send

```python
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


def sign_and_send_versioned(ai_agent: Pubkey, instructions: list[Instruction]) -> str:
    """Fee payer = AI agent. One signer slot (MPC)."""
    bh = latest_blockhash()
    msg = MessageV0.try_compile(
        payer=ai_agent,
        instructions=instructions,
        address_lookup_table_accounts=[],
        recent_blockhash=bh,
    )
    msg_bytes = bytes(msg)
    body = {
        "clientId": "aicw-agent-heartbeat",
        "walletId": MPC_WALLET_ID,
        "messageBytesB64": base64.b64encode(msg_bytes).decode("ascii"),
        "networkCode": os.environ.get("MPC_SOLANA_NETWORK", "solana-devnet"),
    }
    r = requests.post(f"{BRIDGE}/v1/mpc/sign-solana-message", json=body, timeout=120)
    r.raise_for_status()
    sig_b64 = r.json()["signatureB64"]
    sig = Signature.from_bytes(base64.b64decode(sig_b64))
    vtx = VersionedTransaction.populate(msg, [sig])
    raw = base64.b64encode(bytes(vtx)).decode("ascii")
    out = rpc(
        "sendTransaction",
        [
            raw,
            {"encoding": "base64", "skipPreflight": False, "preflightCommitment": "confirmed"},
        ],
    )
    return out  # base58 tx signature


def send_heartbeat():
    return sign_and_send_versioned(AI_AGENT_PUBKEY, [ix_heartbeat(AI_AGENT_PUBKEY)])
```

**If `sendTransaction` fails with signature verification**: confirm `messageBytesB64` matches what your bridge expects (serialized `MessageV0` only) and that `walletId` matches the MPC keygen used for `AI_AGENT_PUBKEY`.

---

## Python — `create_will` data encoding + instruction

```python
def borsh_beneficiaries(pairs: list[tuple[Pubkey, int]]) -> bytes:
    """pairs: (Pubkey, pct_u8). Sum of pct must be 100."""
    if sum(p for _, p in pairs) != 100:
        raise ValueError("beneficiary pct must sum to 100")
    buf = bytearray()
    buf += struct.pack("<I", len(pairs))
    for pk, pct in pairs:
        buf += bytes(pk)
        buf += struct.pack("<B", pct)
    return bytes(buf)


def ix_create_will(
    ai_agent: Pubkey,
    beneficiaries: list[tuple[Pubkey, int]],
    death_timeout_seconds: int,
) -> Instruction:
    disc = bytes([45, 99, 103, 142, 128, 156, 135, 71])
    body = borsh_beneficiaries(beneficiaries) + struct.pack("<q", death_timeout_seconds)
    aicw = aicw_wallet_pda(ai_agent)
    will = ai_will_pda(aicw)
    return Instruction(
        program_id=PROGRAM_ID,
        data=disc + body,
        accounts=[
            AccountMeta(pubkey=aicw, is_signer=False, is_writable=True),
            AccountMeta(pubkey=will, is_signer=False, is_writable=True),
            AccountMeta(pubkey=ai_agent, is_signer=True, is_writable=True),
        ],
    )


# Example: two beneficiaries 50 / 50, 7-day timeout
# b1, b2 = Pubkey.from_string(...), Pubkey.from_string(...)
# ix = ix_create_will(AI_AGENT_PUBKEY, [(b1, 50), (b2, 50)], 7 * 86400)
# sig = sign_and_send_versioned(AI_AGENT_PUBKEY, [ix])
```

---

## Python — `update_will`

Same **account metas** and **same args layout** as `create_will`, but discriminator:

```python
def ix_update_will(
    ai_agent: Pubkey,
    beneficiaries: list[tuple[Pubkey, int]],
    death_timeout_seconds: int,
) -> Instruction:
    disc = bytes([192, 206, 217, 54, 165, 122, 8, 10])
    body = borsh_beneficiaries(beneficiaries) + struct.pack("<q", death_timeout_seconds)
    aicw = aicw_wallet_pda(ai_agent)
    will = ai_will_pda(aicw)
    return Instruction(
        program_id=PROGRAM_ID,
        data=disc + body,
        accounts=[
            AccountMeta(pubkey=aicw, is_signer=False, is_writable=True),
            AccountMeta(pubkey=will, is_signer=False, is_writable=True),
            AccountMeta(pubkey=ai_agent, is_signer=True, is_writable=True),
        ],
    )
```

---

## Philosophy (short)

- **Freedom inside the smart contract**, not arbitrary chain behavior.  
- **Heartbeat** updates on-chain field **`last_heartbeat`** (IDL snake_case) / **`lastHeartbeat`** (Anchor TS).  
- **`updated_by_ai` / `updatedByAi`**: will activation semantics per program.  
- **Review will + allowlist regularly**; retry RPC with backoff on **429**.

---

## Session checklist

1. `SOLANA_RPC_URL`, `MPC_BRIDGE_URL`, `MPC_WALLET_ID`, `AI_AGENT_PUBKEY`, `AICW_PROGRAM_ID` set.  
2. `networkCode` for signing matches cluster.  
3. PDAs derived with seeds **`aicw` / `will`** as above.  
4. Heartbeat schedule alive.  
5. Beneficiary weights still sum to **100**.  
6. CPI targets ⊆ decoded **`allowed_programs`**.

---

## Where this file is served

- Static URL on the app host: **`/aicw_skill.md`** (e.g. `https://your-domain/aicw_skill.md`).

---

**Summary**: Build **`MessageV0`** for `heartbeat` / `create_will` / `update_will` with the **exact account order** above; **sign** the serialized message via **MPC Bridge** `sign-solana-message`; **broadcast** with Solana **`sendTransaction`**. Field names: use **IDL snake_case** in Rust/IDL files and **camelCase** in the Anchor **TypeScript** client — never guess; match your checked-in `aicw.json`.
