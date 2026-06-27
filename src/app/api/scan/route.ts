import { NextRequest, NextResponse } from "next/server";
import { getKnownScamAddresses, getKnownScamReason } from "@/lib/scam";
import { DEFAULT_DUST_THRESHOLD_USD } from "@/lib/constants";
import {
  enrichTokensWithPricing,
  fetchTokenPrices,
  fetchWalletTokens,
} from "@/lib/tokens";
import { fetchSwapPrice } from "@/lib/swap";
import { getPublicFeeConfig } from "@/lib/fees";
import type { ScanSummary, TokenBalance } from "@/lib/types";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const threshold = Number(
    request.nextUrl.searchParams.get("threshold") ?? DEFAULT_DUST_THRESHOLD_USD,
  );
  const checkSwaps = request.nextUrl.searchParams.get("swaps") !== "false";

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const rawTokens = await fetchWalletTokens(address);
    const prices = await fetchTokenPrices(rawTokens.map((t) => t.address));
    let tokens = enrichTokensWithPricing(rawTokens, prices, threshold);

    const knownScams = getKnownScamAddresses();
    const scanRoute = tokens.map((t) => {
      const isKnownScam = knownScams.has(t.address);
      if (!isKnownScam || t.isScam) return t;
      return {
        ...t,
        isScam: true,
        scamReason: getKnownScamReason(t.address) ?? t.scamReason,
      };
    });
    tokens = scanRoute;

    const hasZeroX = Boolean(process.env.ZEROX_API_KEY);
    if (hasZeroX && checkSwaps) {
      tokens = await markSwappableTokens(tokens, address);
    } else {
      tokens = tokens.map((t) => ({
        ...t,
        isSwappable: false,
        swapBlockedReason: t.isScam
          ? "Flagged as scam"
          : !checkSwaps
            ? undefined
            : t.isDust
              ? "0x API key missing - add ZEROX_API_KEY to enable swaps"
              : undefined,
      }));
    }

    const summary: ScanSummary = {
      totalTokens: tokens.length,
      dustTokens: tokens.filter((t) => t.isDust).length,
      scamTokens: tokens.filter((t) => t.isScam).length,
      swappableDustUsd: tokens
        .filter((t) => t.isDust && t.isSwappable)
        .reduce((sum, t) => sum + (t.usdValue ?? 0), 0),
      unsellableCount: tokens.filter((t) => t.isDust && !t.isSwappable).length,
    };

    return NextResponse.json({
      tokens: tokens.map(serializeToken),
      summary,
      hasZeroX,
      fee: getPublicFeeConfig(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function markSwappableTokens(
  tokens: TokenBalance[],
  takerAddress: string,
): Promise<TokenBalance[]> {
  const dustTokens = tokens.filter((t) => t.isDust && !t.isScam && !t.isNative);

  const results = await Promise.all(
    dustTokens.map(async (token) => {
      const price = await fetchSwapPrice({
        sellToken: token.address,
        sellAmount: token.balance.toString(),
        takerAddress,
      });

      if (!price) {
        return {
          ...token,
          isSwappable: false,
          swapBlockedReason: "No liquidity or honeypot",
        };
      }

      const ethOut = Number(price.buyAmount) / 1e18;
      const gasEth = (Number(price.estimatedGas) * 0.01) / 1e9;
      const profitable = ethOut > gasEth * 2;

      return {
        ...token,
        isSwappable: profitable,
        swapBlockedReason: profitable
          ? undefined
          : "Swap value lower than estimated gas",
      };
    }),
  );

  const resultMap = new Map(results.map((t) => [t.address, t]));
  return tokens.map((t) => {
    if (t.isScam) {
      return {
        ...t,
        isSwappable: false,
        swapBlockedReason: t.scamReason ?? "Flagged as scam",
      };
    }
    return resultMap.get(t.address) ?? t;
  });
}

function serializeToken(token: TokenBalance) {
  return {
    ...token,
    balance: token.balance.toString(),
  };
}

