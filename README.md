# Base DustLift

Titan-style wallet cleanup for **Base**: scan ERC-20 dust and scam tokens, batch-convert to ETH, revoke approvals, and earn integrator fees.

## Features

- **Wallet scan** â€” Blockscout token balances + DefiLlama USD pricing
- **Dust filter** â€” configurable USD threshold (default $5)
- **Scam detection** â€” Blockscout flags + curated deny list + hide/report
- **Smart filter** â€” 0x liquidity check; skips honeypots and unprofitable swaps
- **Batch sweep** â€” EIP-5792 `wallet_sendCalls` when supported (Coinbase Smart Wallet, Base App)
- **Sequential fallback** â€” works in any wallet if batch is unavailable
- **Approval revoke** â€” scan & revoke via Blockscout + Revoke.cash link
- **Creator commission** â€” 0x integrator fee (`swapFeeRecipient`) on every swap

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
| `FEE_RECIPIENT` | Your wallet â€” receives commission (server) |
| `NEXT_PUBLIC_FEE_RECIPIENT` | Same wallet â€” shown in UI |
| `FEE_BPS` | Fee rate in basis points (75 = 0.75%) |

```bash
npm run dev
```

## Commission model

Each swap quote includes 0x integrator parameters:

- `swapFeeRecipient` â†’ your creator wallet
- `swapFeeBps` â†’ e.g. 75 (0.75%)
- `swapFeeToken` â†’ ETH (deducted from swap output)

Fees are collected on-chain automatically by 0x at settlement â€” no custom smart contract needed.

## Deploy to Vercel

1. Push repo to GitHub
2. Import in [Vercel](https://vercel.com) â†’ Framework: Next.js
3. Set all env vars from `.env.example`
4. Deploy â€” copy production URL into `NEXT_PUBLIC_APP_URL` and redeploy

## Publish on Base App (base.dev)

Base App now uses **standard web apps** (no Farcaster manifest required).

1. Go to [base.dev](https://base.dev) â†’ create a project
2. Complete metadata:
   - **Name:** Base DustLift
   - **Tagline:** Turn wallet dust into ETH on Base
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
       â”‚
       â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     Blockscout          â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Next.js frontend â”‚ â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚ Tokens +    â”‚
â”‚  wagmi + viem     â”‚                         â”‚ Approvals   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     0x Swap API         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  /api/scan       â”‚     + integrator fee    â”‚ ETH output  â”‚
â”‚  /api/batch-quoteâ”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º â”‚ + commissionâ”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## Roadmap (done)

- [x] Batch swaps via EIP-5792 with sequential fallback
- [x] Scam token list + hide/report
- [x] Approval scan + revoke
- [x] 0x integrator commission
- [x] Base App wallet connectors

## Disclaimer

This tool executes real on-chain swaps. Always review transactions in your wallet. Not financial advice.

