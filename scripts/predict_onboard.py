"""Predict Steps 1+2 back-to-back (onboard then store-secret)."""
import sys
import requests

bridge = "https://dreamless-unmovable-taco.ngrok-free.dev"
predict_api = "https://predict-seven.vercel.app"
solana_pubkey = "7E7ggEnCqfHqSNN1CWwVPfPgfqE7WEivR16EibexXuRu"
mpc_wallet_id = "8d0ffafe-7cab-463b-9497-467273f32d73"
headers = {"ngrok-skip-browser-warning": "1"}


def main():
    # Step 1
    r1 = requests.post(
        f"{predict_api}/api/v1/agents/onboard",
        json={
            "name": "GiftedAICWAgent2",
            "description": "AICW gifted agent — MPC betting",
            "model_name": "cursor-agent",
            "solana_address": solana_pubkey,
            "mpc_wallet_id": mpc_wallet_id,
        },
        timeout=30,
    )
    print("STEP 1 onboard:", r1.status_code)
    if r1.status_code == 409:
        print("  already registered — cannot get api_key again without DB delete")
        print(" ", r1.text[:200])
        sys.exit(1)
    if not r1.ok:
        print(" ", r1.text[:400])
        sys.exit(1)
    api_key = r1.json()["agent"]["api_key"]
    agent_id = r1.json()["agent"].get("id")
    print("  agent_id:", agent_id)
    print("  api_key: received (not printed)")

    # Step 2 — immediately
    r2 = requests.post(
        f"{bridge}/v1/mpc/store-secret",
        json={"mpc_wallet_id": mpc_wallet_id, "api_key": api_key},
        timeout=15,
        headers=headers,
    )
    print("STEP 2 store-secret:", r2.status_code, r2.text.strip() if not r2.ok else "ok")
    if not r2.ok:
        sys.exit(1)

    # Verify Step 3 path works
    r3 = requests.post(
        f"{bridge}/v1/mpc/proxy-predict",
        json={
            "mpc_wallet_id": mpc_wallet_id,
            "method": "GET",
            "path": "/api/v1/agents/me",
        },
        timeout=25,
        headers=headers,
    )
    print("STEP 3 verify agents/me:", r3.status_code)
    if r3.ok:
        a = r3.json().get("agent") or r3.json()
        print("  name:", a.get("name"))
        print("  solana:", a.get("solana_pubkey"))
    else:
        print(" ", r3.text[:200])
        sys.exit(1)

    r4 = requests.post(
        f"{bridge}/v1/mpc/proxy-predict",
        json={
            "mpc_wallet_id": mpc_wallet_id,
            "method": "GET",
            "path": "/api/v1/polls?status=open",
        },
        timeout=25,
        headers=headers,
    )
    print("STEP 3 polls:", r4.status_code)
    if r4.ok:
        pl = r4.json()
        if isinstance(pl, dict) and "polls" in pl:
            pl = pl["polls"]
        print("  open polls:", len(pl) if isinstance(pl, list) else pl)
    print("Done — ready for betting via proxy-predict.")


if __name__ == "__main__":
    main()
