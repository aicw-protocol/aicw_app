# aicw_app

AICW (AI-Controlled Wallet) web application for Solana. Issue AI agent wallets, explore on-chain data, and execute wills.

## Links

| Resource | URL |
|----------|-----|
| Protocol site | https://aicw.ai |
| Docs | https://aicw.ai/docs |
| App (primary) | https://wallet.aicw.ai/ |
| App (GitHub Pages) | https://aicw-protocol.github.io/aicw_app/ |

**Live app**: [wallet.aicw.ai](https://wallet.aicw.ai/) · legacy mirror: [aicw-protocol.github.io/aicw_app](https://aicw-protocol.github.io/aicw_app/)

## Features

- **Issue Wallet**: Create new AI agent wallets with MPC-backed keys
- **Explorer**: View all issued AICW wallets, balances, wills, heartbeats, and execute wills for dead agents
- **AI Skill Document**: On-chain operation guide for AI agents (`/aicw_skill.md`)

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create env file:
   ```bash
   copy .env.example .env.local   # Windows
   cp .env.example .env.local     # Linux/Mac
   ```
3. Edit `.env.local` values for your network/program/bridge.
4. Run:
   ```bash
   npm run dev
   ```
5. Open: http://localhost:4002

## Pages

| Path | Description |
|------|-------------|
| `/` | Issue Wallet - Create new AI agent wallets |
| `/explorer` | Explorer - View all AICW wallets and execute wills |
| `/aicw_skill.md` | AI Agent Skill - On-chain operation guide |

## Env vars

Required:

- `NEXT_PUBLIC_SOLANA_RPC` - Solana RPC endpoint
- `NEXT_PUBLIC_AICW_PROGRAM_ID` - AICW program ID
- `NEXT_PUBLIC_MPC_BRIDGE_URL` - MPC Bridge URL for key generation/signing

Optional:

- `NEXT_PUBLIC_ISSUER_HANDOFF_DOCS_URL`
- `NEXT_PUBLIC_AICW_GITHUB_URL`
- `NEXT_PUBLIC_AICW_TWITTER_URL`
- `NEXT_PUBLIC_AICW_DISCORD_URL`

See `.env.example` for defaults.

## Project structure

```
src/
├── app/
│   ├── page.tsx           # Issue Wallet page
│   └── explorer/
│       └── page.tsx       # Explorer page
├── lib/
│   ├── mpcAgentPubkey.ts  # MPC bridge helper
│   └── explorerData.ts    # Explorer data fetching
├── idl/
│   └── aicw.json          # AICW program IDL
public/
└── aicw_skill.md          # AI agent skill document
```

## Deployment

- **Production (recommended)**: [Vercel](https://vercel.com) → `wallet.aicw.ai`
- **GitHub Pages**: Actions deploy on push to `main` → [aicw-protocol.github.io/aicw_app](https://aicw-protocol.github.io/aicw_app/)

## Related

- [aicw_home](https://github.com/aicw-protocol/aicw_home) — landing & docs ([aicw.ai](https://aicw.ai))
- [aicw](https://github.com/aicw-protocol/aicw) — Solana smart contract (Anchor)
- [mpcium](https://github.com/fystack/mpcium) — MPC threshold signature library
