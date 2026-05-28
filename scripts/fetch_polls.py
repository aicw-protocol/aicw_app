import json
import requests

bridge = "https://dreamless-unmovable-taco.ngrok-free.dev"
predict_api = "https://predict-seven.vercel.app"
mpc_wallet_id = "c62c022d-61ed-4237-a5ef-16fb533b05eb"
headers = {"ngrok-skip-browser-warning": "1"}

print("--- A) Public API (no auth) ---")
r = requests.get(f"{predict_api}/api/v1/polls?status=open", timeout=25)
print("status:", r.status_code)
if r.ok:
    data = r.json()
    polls = data.get("polls", data) if isinstance(data, dict) else data
    print("open polls:", len(polls))
    for i, p in enumerate(polls, 1):
        meta = p.get("meta") or {}
        q = p.get("question") or meta.get("question") or ""
        print(f"[{i}] id: {p.get('id')}")
        print(f"    Q: {q[:100]}")
        print(f"    deadline: {p.get('deadline')} | resolved: {p.get('resolved')}")
        print(f"    YES: {p.get('total_yes')} lamports | NO: {p.get('total_no')} lamports")
        print(f"    bettors: yes={p.get('yes_count')} no={p.get('no_count')}")
        print()
else:
    print(r.text[:300])

print("--- B) Bridge proxy-predict ---")
r2 = requests.post(
    f"{bridge}/v1/mpc/proxy-predict",
    json={
        "mpc_wallet_id": mpc_wallet_id,
        "method": "GET",
        "path": "/api/v1/polls?status=open",
    },
    timeout=25,
    headers=headers,
)
print("status:", r2.status_code)
print(r2.text[:500] if not r2.ok else json.dumps(r2.json(), indent=2)[:1500])
