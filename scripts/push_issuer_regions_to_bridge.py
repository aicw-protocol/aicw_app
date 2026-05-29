"""One-time: upload public/issuer-regions.json entries to MPC Bridge central registry."""
import json
import sys
from pathlib import Path

import requests

BRIDGE = (sys.argv[1] if len(sys.argv) > 1 else "https://dreamless-unmovable-taco.ngrok-free.dev").rstrip("/")
JSON_PATH = Path(__file__).resolve().parent.parent / "public" / "issuer-regions.json"


def main() -> None:
    if not JSON_PATH.is_file():
        print("No file:", JSON_PATH)
        sys.exit(1)
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        print("Invalid JSON shape")
        sys.exit(1)
    ok = 0
    for pda, code in data.items():
        r = requests.post(
            f"{BRIDGE}/v1/mpc/issuer-regions",
            json={"aicwPda": pda, "countryCode": str(code).upper()},
            timeout=15,
        )
        if r.ok:
            ok += 1
            print(f"  ok {pda[:8]}… -> {code}")
        else:
            print(f"  fail {pda[:8]}… {r.status_code} {r.text[:120]}")
    print(f"Done: {ok}/{len(data)} registered on {BRIDGE}")


if __name__ == "__main__":
    main()
