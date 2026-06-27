# Base App Deployment Guide

## 1. Environment variables (production)

Set these in Vercel → Settings → Environment Variables:

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
ZEROX_API_KEY=...
FEE_RECIPIENT=0xYourWallet
NEXT_PUBLIC_FEE_RECIPIENT=0xYourWallet
FEE_BPS=75
```

**Important:** `FEE_RECIPIENT` must be your creator wallet. Fees arrive in ETH automatically on each successful swap.

## 2. Deploy

```bash
npm install --legacy-peer-deps
npm run build
```

Or connect GitHub repo to Vercel (uses `vercel.json` with `--legacy-peer-deps`).

After first deploy, update `NEXT_PUBLIC_APP_URL` to the real domain and redeploy.

## 3. Register on Base.dev

1. Visit https://base.dev
2. Create account → New Project
3. Fill metadata:
   | Field | Value |
   |---|---|
   | Name | Base Dust Sweep |
   | Tagline | Convert dust tokens to ETH on Base |
   | Description | Scan wallet for dust & scam tokens, batch-convert to ETH, revoke approvals |
   | Category | DeFi |
   | Primary URL | Your Vercel URL |
   | Icon | 1024×1024 PNG (add to `/public/icon.png`) |
   | Screenshots | 2–3 mobile screenshots of the app |

4. Add your **builder code** so users can find the app
5. Submit for discovery (if review is required)

## 4. Test in Base App

1. Open Base App on mobile
2. Navigate to your app URL or search by name
3. Connect wallet (injected provider works automatically)
4. Run a small test sweep with 1–2 dust tokens

## 5. Commission verification

After a test swap, check your creator wallet on [BaseScan](https://basescan.org) for incoming ETH from the 0x settlement. Fee amount ≈ `FEE_BPS / 10000 × swap output`.

## 6. Add known scam tokens

Edit `src/data/known-scams-base.json`:

```json
[
  {
    "address": "0xScamTokenAddress",
    "reason": "Phishing airdrop token"
  }
]
```

Redeploy after updating the list.
