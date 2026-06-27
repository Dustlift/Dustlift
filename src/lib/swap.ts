import { BASE_CHAIN_ID, ETH_ADDRESS, ZEROX_BASE_URL } from "./constants";
import { getFeeConfig } from "./fees";
import type { SwapQuote } from "./types";

type QuoteParams = {
  sellToken: string;
  sellAmount: string;
  takerAddress: string;
  slippageBps?: number;
};

function buildSearchParams(params: QuoteParams): URLSearchParams {
  const search = new URLSearchParams({
    chainId: String(BASE_CHAIN_ID),
    sellToken: params.sellToken,
    buyToken: ETH_ADDRESS,
    sellAmount: params.sellAmount,
    taker: params.takerAddress,
    slippageBps: String(params.slippageBps ?? 100),
  });

  const fee = getFeeConfig();
  if (fee.enabled && fee.recipient) {
    search.set("swapFeeRecipient", fee.recipient);
    search.set("swapFeeBps", String(fee.bps));
    search.set("swapFeeToken", ETH_ADDRESS);
  }

  return search;
}

function parseQuoteResponse(data: Record<string, unknown>): SwapQuote {
  const tx = data.transaction as Record<string, string> | undefined;
  const fees = data.fees as Record<string, unknown> | undefined;
  const integratorFee = fees?.integratorFee as
    | { amount?: string; token?: string }
    | undefined;

  return {
    buyAmount: String(data.buyAmount ?? "0"),
    sellAmount: String(data.sellAmount ?? "0"),
    estimatedGas: tx?.gas ?? String(data.estimatedGas ?? "180000"),
    to: tx?.to as `0x${string}`,
    data: tx?.data as `0x${string}`,
    value: tx?.value ?? "0",
    allowanceTarget: data.allowanceTarget as `0x${string}` | undefined,
    feeAmount: integratorFee?.amount,
  };
}

export async function fetchSwapQuote(
  params: QuoteParams,
): Promise<SwapQuote | null> {
  const apiKey = process.env.ZEROX_API_KEY;
  if (!apiKey) return null;

  const search = buildSearchParams(params);

  const res = await fetch(
    `${ZEROX_BASE_URL}/swap/allowance-holder/quote?${search}`,
    {
      headers: {
        "0x-api-key": apiKey,
        "0x-version": "v2",
      },
    },
  );

  if (!res.ok) return null;

  const data = (await res.json()) as Record<string, unknown>;
  return parseQuoteResponse(data);
}

export async function fetchSwapPrice(params: QuoteParams): Promise<{
  buyAmount: string;
  estimatedGas: string;
} | null> {
  const apiKey = process.env.ZEROX_API_KEY;
  if (!apiKey) return null;

  const search = buildSearchParams(params);
  search.delete("slippageBps");

  const res = await fetch(
    `${ZEROX_BASE_URL}/swap/allowance-holder/price?${search}`,
    {
      headers: {
        "0x-api-key": apiKey,
        "0x-version": "v2",
      },
    },
  );

  if (!res.ok) return null;

  const data = (await res.json()) as Record<string, unknown>;
  const tx = data.transaction as Record<string, string> | undefined;

  return {
    buyAmount: String(data.buyAmount ?? "0"),
    estimatedGas: tx?.gas ?? String(data.estimatedGas ?? "180000"),
  };
}

export async function fetchBatchQuotes(
  takerAddress: string,
  tokens: { sellToken: string; sellAmount: string }[],
): Promise<(SwapQuote | null)[]> {
  return Promise.all(
    tokens.map((t) =>
      fetchSwapQuote({
        sellToken: t.sellToken,
        sellAmount: t.sellAmount,
        takerAddress,
      }),
    ),
  );
}
