# Base App Deployment Guide

## 1. Environment Variables

Set these in Vercel -> Settings -> Environment Variables:

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
ZEROX_API_KEY=...
FEE_RECIPIENT=0xYourWallet
NEXT_PUBLIC_FEE_RECIPIENT=0xYourWallet
FEE_BPS=75
DUNE_API_KEY=
DUNE_BASE_ACTIVITY_QUERY_ID=
DUNE_BASE_ACTIVITY_LIMIT=1000
```

`DUNE_API_KEY` and `DUNE_BASE_ACTIVITY_QUERY_ID` are optional. Without them, the activity panel still shows local Base wallet activity from Blockscout.

## 2. Deploy

```bash
npm install --legacy-peer-deps
npm run build
```

Or connect the GitHub repo to Vercel. After first deploy, update `NEXT_PUBLIC_APP_URL` to the real domain and redeploy.

## 3. Register On Base.dev

1. Visit https://base.dev
2. Create account -> New Project
3. Fill metadata:

| Field | Value |
|---|---|
| Name | DustLift |
| Tagline | Turn wallet dust into ETH on Base |
| Description | Scan wallet dust, batch-convert sellable tokens to ETH, swap Base assets, and view activity rank |
| Category | DeFi |
| Primary URL | Your Vercel URL |
| Icon | 1024x1024 PNG |
| Screenshots | 2-3 mobile screenshots |

4. Add your builder code when available.
5. Submit for discovery if review is required.

## 4. Test In Base App

1. Open Base App on mobile.
2. Navigate to your app URL or search by name.
3. Connect wallet.
4. Run a tiny ETH -> USDC swap.
5. Run a tiny dust -> ETH sweep if sellable dust is found.

## 5. Commission Verification

After a test swap, check your creator wallet on BaseScan for incoming 0x settlement fee. Fee amount is approximately `FEE_BPS / 10000 * swap output`.

## 6. Dune Activity Query

For global rank, create or reuse a Dune query whose latest result rows include wallet-level Base activity. Recommended columns:

- `wallet`
- `rank`
- `score`
- `tx_count`
- `active_days`
- `active_wallets`
- `total_wallets`
- `guild_tasks`

Add the query id to `DUNE_BASE_ACTIVITY_QUERY_ID` in Vercel.
