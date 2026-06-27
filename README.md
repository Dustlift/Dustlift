# Base Dust Sweep

Titan-style wallet cleanup for **Base**: scan ERC-20 dust and scam tokens, batch-convert to ETH, revoke approvals, and earn integrator fees.

## Features

- **Wallet scan** — Blockscout token balances + DefiLlama USD pricing
- **Dust filter** — configurable USD threshold (default $5)
- **Scam detection** — Blockscout flags + curated deny list + hide/report
- **Smart filter** — 0x liquidity check; skips honeypots and unprofitable swaps
- **Batch sweep** — EIP-5792 `wallet_sendCalls` when supported (Coinbase Smart Wallet, Base App)
- **Sequential fallback** — works in any wallet if batch is unavailable
- **Approval revoke** — scan & revoke via Blockscout + Revoke.cash link
- **Creator commission** — 0x integrator fee (`swapFeeRecipient`) on every swap

## Setup

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect (external browsers) |
| `NEXT_PUBLIC_APP_URL` | Production URL for OG tags & Base.dev |
| `ZEROX_API_KEY` | Swap quotes & execution |
| `FEE_RECIPIENT` | Your wallet — receives commission (server) |
| `NEXT_PUBLIC_FEE_RECIPIENT` | Same wallet — shown in UI |
| `FEE_BPS` | Fee rate in basis points (75 = 0.75%) |

```bash
npm run dev
```

## Commission model

Each swap quote includes 0x integrator parameters:

- `swapFeeRecipient` → your creator wallet
- `swapFeeBps` → e.g. 75 (0.75%)
- `swapFeeToken` → ETH (deducted from swap output)

Fees are collected on-chain automatically by 0x at settlement — no custom smart contract needed.

## Deploy to Vercel

1. Push repo to GitHub
2. Import in [Vercel](https://vercel.com) → Framework: Next.js
3. Set all env vars from `.env.example`
4. Deploy — copy production URL into `NEXT_PUBLIC_APP_URL` and redeploy

## Publish on Base App (base.dev)

Base App now uses **standard web apps** (no Farcaster manifest required).

1. Go to [base.dev](https://base.dev) → create a project
2. Complete metadata:
   - **Name:** Base Dust Sweep
   - **Tagline:** Convert dust tokens to ETH on Base
   - **Category:** DeFi
   - **Primary URL:** your Vercel URL (`NEXT_PUBLIC_APP_URL`)
   - **Icon & screenshots:** upload from `/public`
   - **Builder code:** from your Base.dev profile
3. App works in Base App in-app browser via `injected` + `@base-org/account` wallet connectors
4. Users discover your app through Base.dev search & builder code

Checklist: [Base App migration guide](https://docs.base.org/apps/guides/migrate-to-standard-web-app)

## Architecture

```
User wallet (Base App / MetaMask / Coinbase Wallet)
       │
       ▼
┌──────────────────┐     Blockscout          ┌─────────────┐
│  Next.js frontend │ ◄────────────────────── │ Tokens +    │
│  wagmi + viem     │                         │ Approvals   │
└────────┬─────────┘                         └─────────────┘
         │
         ▼
┌──────────────────┐     0x Swap API         ┌─────────────┐
│  /api/scan       │     + integrator fee    │ ETH output  │
│  /api/batch-quote│ ──────────────────────► │ + commission│
└──────────────────┘                         └─────────────┘
```

## Roadmap (done)

- [x] Batch swaps via EIP-5792 with sequential fallback
- [x] Scam token list + hide/report
- [x] Approval scan + revoke
- [x] 0x integrator commission
- [x] Base App wallet connectors

## Disclaimer

This tool executes real on-chain swaps. Always review transactions in your wallet. Not financial advice.
