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
  "usdPrice" | "usdValue" | "isDust" | "isSwappable"
>;

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

export function enrichTokensWithPricing(
  tokens: RawToken[],
  prices: Record<string, number>,
  dustThresholdUsd: number,
): TokenBalance[] {
  return tokens.map((token) => {
    const usdPrice = prices[token.address.toLowerCase()] ?? null;
    const usdValue =
      usdPrice != null ? token.balanceFormatted * usdPrice : null;
    const isDust = token.isNative
      ? false
      : usdValue != null
        ? usdValue < dustThresholdUsd
        : true;

    return {
      ...token,
      usdPrice,
      usdValue,
      isDust,
      isSwappable: false,
    };
  });
}
