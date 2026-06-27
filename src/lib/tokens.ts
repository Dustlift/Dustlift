import { BLOCKSCOUT_BASE } from "./constants";
import { isScamAddress, getKnownScamReason } from "./scam";
import type { TokenBalance } from "./types";

type BlockscoutTokenItem = {
  token?: {
    address_hash?: string;
    symbol?: string | null;
    name?: string | null;
    decimals?: string | null;
    is_scam?: boolean | null;
  };
  value?: string | null;
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

  const data = (await res.json()) as { items?: BlockscoutTokenItem[] };
  const items = data.items ?? [];

  return items
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
        balance,
        balanceFormatted,
        isScam,
        scamReason: isScam
          ? getKnownScamReason(addr) ??
            (blockscoutScam ? "Flagged by Blockscout" : "Known scam token")
          : undefined,
      };
    });
}

export async function fetchTokenPrices(
  addresses: string[],
): Promise<Record<string, number>> {
  if (addresses.length === 0) return {};

  const coins = addresses.map((a) => `base:${a}`).join(",");
  const res = await fetch(`https://coins.llama.fi/prices/current/${coins}`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) return {};

  const data = (await res.json()) as {
    coins?: Record<string, { price?: number }>;
  };

  const prices: Record<string, number> = {};
  for (const [key, val] of Object.entries(data.coins ?? {})) {
    const addr = key.replace(/^base:/i, "").toLowerCase();
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
    const usdPrice = prices[token.address] ?? null;
    const usdValue =
      usdPrice != null ? token.balanceFormatted * usdPrice : null;
    const isDust = usdValue != null ? usdValue < dustThresholdUsd : true;

    return {
      ...token,
      usdPrice,
      usdValue,
      isDust,
      isSwappable: false,
    };
  });
}
