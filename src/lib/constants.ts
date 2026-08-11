export const BASE_CHAIN_ID = 8453;

/** Tokens below this USD value are considered dust */
export const DEFAULT_DUST_THRESHOLD_USD = 5;

/** Rough gas estimate per ERC-20 swap on Base (units) */
export const ESTIMATED_SWAP_GAS = 180_000n;

/** Max calls per EIP-5792 batch (wallet limit safety) */
export const MAX_BATCH_CALLS = 20;

/** Native ETH placeholder for 0x API */
export const ETH_ADDRESS =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export const WETH_BASE =
  "0x4200000000000000000000000000000000000006" as const;

export const USDC_BASE =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export const BLOCKSCOUT_BASE = "https://base.blockscout.com/api/v2";

export const ZEROX_BASE_URL = "https://api.0x.org";

export const REVOKE_CASH_BASE = "https://revoke.cash/address";

/** Default integrator fee: 75 bps = 0.75% */
export const DEFAULT_FEE_BPS = 75;

export const APP_NAME = "DustLift";
export const APP_TAGLINE = "Create and launch B20 tokens on Base in minutes";
export const APP_CATEGORY = "Launchpad";
