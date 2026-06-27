# DustLift

Wallet cleanup and swap assistant for Base: scan ERC-20 dust and scam leftovers, batch-convert sellable dust to ETH, swap Base assets, and view wallet activity rank.

## Features

- Wallet scan: Blockscout token balances + DefiLlama USD pricing
- Dust filter: configurable USD threshold
- Scam filtering: Blockscout flags + curated deny list + hide/report
- Sellability check: 0x liquidity check; skips tokens with no usable output
- Batch sweep: EIP-5792 `wallet_sendCalls` when supported
- Sequential fallback: works in wallets without batch support
- Swap: ETH to token and token to ETH via 0x
- Creator commission: 0x integrator fee on successful swaps
- Base activity: local Base wallet activity plus optional Dune leaderboard data

## Setup

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect for external browsers |
| `NEXT_PUBLIC_APP_URL` | Production URL for OG tags and Base.dev |
| `ZEROX_API_KEY` | 0x quotes and swap execution |
| `FEE_RECIPIENT` | Creator wallet, server-side fee recipient |
| `NEXT_PUBLIC_FEE_RECIPIENT` | Same creator wallet, shown in UI |
| `FEE_BPS` | Fee rate in basis points, 75 = 0.75% |
| `DUNE_API_KEY` | Optional Dune API key for activity leaderboard |
| `DUNE_BASE_ACTIVITY_QUERY_ID` | Optional Dune query id for Base activity rank |
| `DUNE_BASE_ACTIVITY_LIMIT` | Optional latest-result row limit, default 1000 |

## Commission Model

Each 0x quote includes integrator parameters:

- `swapFeeRecipient`: creator wallet
- `swapFeeBps`: fee rate
- `swapFeeToken`: swap output token

Fees are collected on-chain by 0x at settlement. No custom smart contract is required.

## Dune Activity Query

The activity panel works without Dune by showing local Base wallet data from Blockscout. For global rank, add a Dune query whose latest results include wallet rows with flexible column names such as:

- `wallet` or `address`
- `rank` or `activity_rank`
- `score` or `activity_score`
- `tx_count`
- `active_days`
- `active_wallets`
- `total_wallets`
- `guild_tasks` or `guild_score`

Then add `DUNE_API_KEY` and `DUNE_BASE_ACTIVITY_QUERY_ID` in Vercel.

## Deploy To Vercel

1. Push repo to GitHub.
2. Import in Vercel as a Next.js project.
3. Set all env vars from `.env.example`.
4. Deploy, copy the production URL into `NEXT_PUBLIC_APP_URL`, and redeploy.

## Publish On Base App

1. Go to `base.dev` and create a project.
2. Use:
   - Name: DustLift
   - Tagline: Turn wallet dust into ETH on Base
   - Category: DeFi
   - Primary URL: your Vercel URL
3. Upload icon and screenshots.
4. Add builder code when the Base.dev project is ready.

## Disclaimer

This tool executes real on-chain swaps. Always review wallet prompts before signing. Not financial advice.
