import { BLOCKSCOUT_BASE, ETH_ADDRESS } from "./constants";
import { isScamAddress, getKnownScamReason } from "./scam";
import type { TokenBalance } from "./types";

type BlockscoutTokenItem = {
  token?: {
    address_hash?: string;
    symbol?: string | null;
    name?: string | null;
    decimals?: string | null;
    is_scam?: boolean | null;
    icon_url?: string | null;
    icon?: string | null;
  };
  value?: string | null;
};

type BlockscoutAddress = {
  coin_balance?: string | null;
};

type RawToken = Omit<
  TokenBalance,
  | "usdPrice"
  | "usdValue"
  | "marketCapUsd"
  | "liquidityUsd"
  | "isTrusted"
  | "trustReason"
  | "isDust"
  | "isSwappable"
>;

type TokenMarketData = {
  priceUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
};

type DexScreenerPair = {
  chainId?: string;
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  baseToken?: { address?: string };
  quoteToken?: { address?: string };
};

const MIN_TRUSTED_MARKET_CAP_USD = 1_000_000;
const MIN_TRUSTED_LIQUIDITY_USD = 10_000;
const ALWAYS_TRUSTED_BASE_TOKENS = new Set([
  ETH_ADDRESS.toLowerCase(),
  "0x4200000000000000000000000000000000000006", // WETH
  "0x833589fcd6edb6e08f4c7c32d4f71b54bdA02913".toLowerCase(), // USDC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", // EURC
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", // cbBTC
  "0x940181a94a35a4569e4529a3cdfb74e38fd98631", // AERO
]);

export async function fetchWalletTokens(
  walletAddress: string,
): Promise<RawToken[]> {
  const url = `${BLOCKSCOUT_BASE}/addresses/${walletAddress}/token-balances`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`Blockscout error: ${res.status}`);
  }

  const data = (await res.json()) as
    | BlockscoutTokenItem[]
    | { items?: BlockscoutTokenItem[] };
  const items = Array.isArray(data) ? data : data.items ?? [];

  const erc20Tokens = items
    .filter((item) => {
      const addr = item.token?.address_hash;
      const value = item.value;
      return addr && value && BigInt(value) > 0n;
    })
    .map((item) => {
      const decimals = Number(item.token?.decimals ?? 18);
      const balance = BigInt(item.value!);
      const balanceFormatted = Number(balance) / 10 ** decimals;

      const addr = item.token!.address_hash!.toLowerCase() as `0x${string}`;
      const blockscoutScam = item.token?.is_scam ?? false;
      const isScam = isScamAddress(addr, blockscoutScam);

      return {
        address: addr,
        symbol: item.token?.symbol?.trim() || "???",
        name: item.token?.name?.trim() || "Unknown Token",
        decimals,
        iconUrl: item.token?.icon_url ?? item.token?.icon ?? null,
        balance,
        balanceFormatted,
        isScam,
        scamReason: isScam
          ? getKnownScamReason(addr) ??
            (blockscoutScam ? "Flagged by Blockscout" : "Known scam token")
          : undefined,
      };
    });

  const nativeEth = await fetchNativeEth(walletAddress);
  return nativeEth ? [nativeEth, ...erc20Tokens] : erc20Tokens;
}

async function fetchNativeEth(walletAddress: string): Promise<RawToken | null> {
  const res = await fetch(`${BLOCKSCOUT_BASE}/addresses/${walletAddress}`, {
    headers: { accept: "application/json" },
    next: { revalidate: 30 },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as BlockscoutAddress;
  const balance = BigInt(data.coin_balance ?? "0");
  if (balance <= 0n) return null;

  return {
    address: ETH_ADDRESS,
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    iconUrl: null,
    isNative: true,
    balance,
    balanceFormatted: Number(balance) / 1e18,
    isScam: false,
  };
}

export async function fetchTokenPrices(
  addresses: string[],
): Promise<Record<string, number>> {
  if (addresses.length === 0) return {};

  const normalized = addresses.map((a) => a.toLowerCase());
  const ethKey = ETH_ADDRESS.toLowerCase();
  const coins = [
    ...normalized
      .filter((a) => a !== ethKey)
      .map((a) => `base:${a}`),
    ...(normalized.includes(ethKey) ? ["coingecko:ethereum"] : []),
  ].join(",");
  const res = await fetch(`https://coins.llama.fi/prices/current/${coins}`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) return {};

  const data = (await res.json()) as {
    coins?: Record<string, { price?: number }>;
  };

  const prices: Record<string, number> = {};
  for (const [key, val] of Object.entries(data.coins ?? {})) {
    const addr =
      key.toLowerCase() === "coingecko:ethereum"
        ? ethKey
        : key.replace(/^base:/i, "").toLowerCase();
    if (val.price != null) prices[addr] = val.price;
  }
  return prices;
}

export async function fetchTokenMarketData(
  addresses: string[],
): Promise<Record<string, TokenMarketData>> {
  const unique = [
    ...new Set(
      addresses
        .map((address) => address.toLowerCase())
        .filter((address) => address !== ETH_ADDRESS.toLowerCase()),
    ),
  ];
  if (unique.length === 0) return {};

  const result: Record<string, TokenMarketData> = {};
  const chunkSize = 25;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
      { next: { revalidate: 300 } },
    );

    if (!res.ok) continue;

    const data = (await res.json()) as { pairs?: DexScreenerPair[] };

    for (const pair of data.pairs ?? []) {
      if (pair.chainId?.toLowerCase() !== "base") continue;

      const pairAddresses = [
        pair.baseToken?.address?.toLowerCase(),
        pair.quoteToken?.address?.toLowerCase(),
      ].filter(Boolean) as string[];
      const matched = pairAddresses.find((address) => chunk.includes(address));
      if (!matched) continue;

      const next = {
        priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
        marketCapUsd: pair.marketCap ?? pair.fdv ?? null,
        liquidityUsd: pair.liquidity?.usd ?? null,
      };
      const current = result[matched];
      if (!current || (next.liquidityUsd ?? 0) > (current.liquidityUsd ?? 0)) {
        result[matched] = next;
      }
    }
  }

  return result;
}

export function enrichTokensWithPricing(
  tokens: RawToken[],
  prices: Record<string, number>,
  marketData: Record<string, TokenMarketData>,
  dustThresholdUsd: number,
): TokenBalance[] {
  return tokens.map((token) => {
    const market = marketData[token.address.toLowerCase()];
    const usdPrice =
      prices[token.address.toLowerCase()] ?? market?.priceUsd ?? null;
    const usdValue =
      usdPrice != null ? token.balanceFormatted * usdPrice : null;
    const isDust = token.isNative
      ? false
      : usdValue != null
        ? usdValue < dustThresholdUsd
        : true;

    const trust = getTrust(token, usdPrice, market);

    return {
      ...token,
      usdPrice,
      usdValue,
      marketCapUsd: market?.marketCapUsd ?? null,
      liquidityUsd: market?.liquidityUsd ?? null,
      isTrusted: trust.isTrusted,
      trustReason: trust.reason,
      isDust,
      isSwappable: false,
    };
  });
}

function getTrust(
  token: RawToken,
  usdPrice: number | null,
  market?: TokenMarketData,
): { isTrusted: boolean; reason?: string } {
  if (token.isNative) return { isTrusted: true };
  if (token.isScam) return { isTrusted: false, reason: "Flagged as scam" };
  if (ALWAYS_TRUSTED_BASE_TOKENS.has(token.address.toLowerCase())) {
    return { isTrusted: true, reason: "Core Base token" };
  }
  if (!hasCleanMetadata(token)) {
    return { isTrusted: false, reason: "Unverified token metadata" };
  }
  if (usdPrice == null) {
    return { isTrusted: false, reason: "No trusted price source" };
  }

  const marketCap = market?.marketCapUsd ?? 0;
  const liquidity = market?.liquidityUsd ?? 0;

  if (marketCap >= MIN_TRUSTED_MARKET_CAP_USD) {
    return { isTrusted: true, reason: "Market cap filter passed" };
  }
  if (liquidity >= MIN_TRUSTED_LIQUIDITY_USD) {
    return { isTrusted: true, reason: "Liquidity filter passed" };
  }

  return { isTrusted: false, reason: "Low market cap or liquidity" };
}

function hasCleanMetadata(token: RawToken): boolean {
  const text = `${token.symbol} ${token.name}`.toLowerCase();
  if (!token.symbol || token.symbol === "???") return false;
  if (token.name === "Unknown Token") return false;
  if (/https?:|www\.|claim|airdrop|reward|voucher|visit|bonus|\.com/.test(text)) {
    return false;
  }
  return /^[a-zA-Z0-9.$+\-_\s()]{1,64}$/.test(`${token.symbol} ${token.name}`);
}
