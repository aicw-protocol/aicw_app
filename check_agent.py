import requests
import json

RPC = "https://api.devnet.solana.com"
AGENT = "GrhsZvYoM69Dtnp5xtgESqULSLVB3WsonRCc345rZtqS"
AICW_PDA = "3FEuB7TBo9diXiXrnhr3SPrqMFgndkRfkHZzsaKYEkTD"
AI_WILL_PDA = "CrqyNeR9V6bnYNHi2XdBKMAs7wqahRcRqDk6xYGsnMqp"
PROGRAM_ID = "9RUEw4jcMi8xcGf3tJRCAdzUzLuhEurts8Z2QQLsRbaV"

def rpc(method, params):
    r = requests.post(RPC, json={"jsonrpc":"2.0","id":1,"method":method,"params":params})
    return r.json()

print("=== AI Agent Pubkey Balance ===")
r = rpc("getBalance", [AGENT, {"commitment":"confirmed"}])
print(f"Balance: {r.get('result',{}).get('value','?')} lamports")
print()

print("=== AICW Wallet PDA ===")
r = rpc("getAccountInfo", [AICW_PDA, {"encoding":"base64","commitment":"confirmed"}])
val = r.get('result',{}).get('value')
if val is None:
    print("Account does NOT exist on devnet")
else:
    print(f"EXISTS. Owner: {val.get('owner')}")
    print(f"Lamports: {val.get('lamports')}")
    print(f"Data length: {len(val.get('data',['',''])[0])} (base64)")
print()

print("=== AI Will PDA ===")
r = rpc("getAccountInfo", [AI_WILL_PDA, {"encoding":"base64","commitment":"confirmed"}])
val = r.get('result',{}).get('value')
if val is None:
    print("Account does NOT exist on devnet")
else:
    print(f"EXISTS. Owner: {val.get('owner')}")
    print(f"Lamports: {val.get('lamports')}")
print()

print("=== Transactions on AI agent ===")
r = rpc("getSignaturesForAddress", [AGENT, {"limit": 5}])
sigs = r.get('result',[])
for s in sigs[:5]:
    print(f"  {s.get('signature')[:30]}... slot={s.get('slot')} err={s.get('err')}")
print()

print("=== Transactions on AICW PDA ===")
r = rpc("getSignaturesForAddress", [AICW_PDA, {"limit": 5}])
sigs = r.get('result',[])
if not sigs:
    print("No transactions on this PDA")
for s in sigs[:5]:
    print(f"  {s.get('signature')[:30]}... slot={s.get('slot')} err={s.get('err')}")
print()

print("=== Program ID check ===")
r = rpc("getAccountInfo", [PROGRAM_ID, {"encoding":"base64","commitment":"confirmed"}])
val = r.get('result',{}).get('value')
if val is None:
    print("Program does NOT exist on devnet")
else:
    print(f"Program exists. Executable: {val.get('executable')}")
