# aicw_app

Standalone Issue Wallet page extracted from the Predict dashboard.

## Quick start

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `copy .env.example .env.local` (Windows PowerShell/cmd)
3. Edit `.env.local` values for your network/program/bridge.
4. Run:
   - `npm run dev`
5. Open:
   - `http://localhost:4002`

## Env vars

Required:

- `NEXT_PUBLIC_SOLANA_RPC`
- `NEXT_PUBLIC_AICW_PROGRAM_ID`
- `NEXT_PUBLIC_MPC_BRIDGE_URL`

Optional:

- `NEXT_PUBLIC_ISSUER_HANDOFF_DOCS_URL`
- `NEXT_PUBLIC_AICW_GITHUB_URL`
- `NEXT_PUBLIC_AICW_TWITTER_URL`
- `NEXT_PUBLIC_AICW_DISCORD_URL`

See `.env.example` for defaults.

## Files

- `src/app/page.tsx`: standalone Issue Wallet UI
- `src/lib/mpcAgentPubkey.ts`: MPC bridge helper
- `src/idl/aicw.json`: minimal IDL for `issue_wallet`

## Notes

This page is app-agnostic and does not call Predict APIs.
