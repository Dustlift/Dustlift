"use client";

import { encodeFunctionData, erc20Abi } from "viem";
import {
  useAccount,
  useCapabilities,
  usePublicClient,
  useSendCalls,
  useSendTransaction,
  useWriteContract,
} from "wagmi";
import { BASE_CHAIN_ID, MAX_BATCH_CALLS } from "@/lib/constants";
import type { BatchCall, SwapQuote, TokenBalance } from "@/lib/types";

export type SweepProgress = {
  current: number;
  total: number;
  token?: string;
  status:
    | "idle"
    | "batching"
    | "approving"
    | "swapping"
    | "done"
    | "error";
  message?: string;
  mode?: "batch" | "sequential";
};

async function fetchQuotes(
  address: string,
  tokens: TokenBalance[],
): Promise<(SwapQuote | null)[]> {
  const res = await fetch("/api/batch-quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taker: address,
      tokens: tokens.map((t) => ({
        sellToken: t.address,
        sellAmount: t.balance.toString(),
      })),
    }),
  });

  const data = (await res.json()) as {
    quotes?: (SwapQuote | null)[];
    error?: string;
  };

  if (!res.ok) throw new Error(data.error ?? "Batch quote failed");
  return data.quotes ?? [];
}

function chunkCalls(calls: BatchCall[], size: number): BatchCall[][] {
  const chunks: BatchCall[][] = [];
  for (let i = 0; i < calls.length; i += size) {
    chunks.push(calls.slice(i, i + size));
  }
  return chunks;
}

export function useSweep() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { sendCallsAsync } = useSendCalls();
  const { data: capabilities } = useCapabilities({ account: address });

  const supportsBatch =
    Boolean(chainId) &&
    Boolean(
      capabilities?.[chainId!]?.atomic?.status === "supported" ||
        capabilities?.[chainId!]?.atomic?.status === "ready",
    );

  async function buildCalls(
    tokens: TokenBalance[],
    quotes: (SwapQuote | null)[],
  ): Promise<BatchCall[]> {
    if (!address || !publicClient) return [];

    const calls: BatchCall[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const quote = quotes[i];
      if (!quote) continue;

      if (quote.allowanceTarget) {
        const allowance = await publicClient.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, quote.allowanceTarget],
        });

        if (allowance < token.balance) {
          calls.push({
            to: token.address,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [quote.allowanceTarget, token.balance],
            }),
          });
        }
      }

      calls.push({
        to: quote.to,
        data: quote.data,
        value: BigInt(quote.value),
      });
    }

    return calls;
  }

  async function sweepSequential(
    tokens: TokenBalance[],
    onProgress: (p: SweepProgress) => void,
  ) {
    if (!address || !publicClient) return;

    let completed = 0;

    for (const token of tokens) {
      onProgress({
        current: completed,
        total: tokens.length,
        token: token.symbol,
        status: "swapping",
        mode: "sequential",
      });

      const quoteRes = await fetch(
        `/api/quote?sellToken=${token.address}&sellAmount=${token.balance.toString()}&taker=${address}`,
      );
      const quote = (await quoteRes.json()) as SwapQuote & { error?: string };
      if (!quoteRes.ok) throw new Error(quote.error ?? "Quote failed");

      if (quote.allowanceTarget) {
        onProgress({
          current: completed,
          total: tokens.length,
          token: token.symbol,
          status: "approving",
          mode: "sequential",
        });

        const allowance = await publicClient.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, quote.allowanceTarget],
        });

        if (allowance < token.balance) {
          const approveHash = await writeContractAsync({
            address: token.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [quote.allowanceTarget, token.balance],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      const hash = await sendTransactionAsync({
        to: quote.to,
        data: quote.data,
        value: BigInt(quote.value),
      });
      await publicClient.waitForTransactionReceipt({ hash });
      completed += 1;
    }

    onProgress({
      current: tokens.length,
      total: tokens.length,
      status: "done",
      mode: "sequential",
    });
  }

  async function sweepBatch(
    tokens: TokenBalance[],
    onProgress: (p: SweepProgress) => void,
  ) {
    if (!address) return;

    onProgress({
      current: 0,
      total: tokens.length,
      status: "batching",
      mode: "batch",
      message: "Preparing batch quotes...",
    });

    const quotes = await fetchQuotes(address, tokens);
    const calls = await buildCalls(tokens, quotes);

    if (calls.length === 0) {
      throw new Error("No valid swap calls generated");
    }

    const batches = chunkCalls(calls, MAX_BATCH_CALLS);

    onProgress({
      current: 0,
      total: batches.length,
      status: "batching",
      mode: "batch",
      message: `${batches.length} batch confirmation(s) - fewer signatures than one-by-one`,
    });

    for (let i = 0; i < batches.length; i++) {
      await sendCallsAsync({
        calls: batches[i].map((c) => ({
          to: c.to,
          data: c.data,
          value: c.value,
        })),
      });
    }

    onProgress({
      current: batches.length,
      total: batches.length,
      status: "done",
      mode: "batch",
    });
  }

  async function sweep(
    tokens: TokenBalance[],
    onProgress: (p: SweepProgress) => void,
  ) {
    if (!address || !publicClient || tokens.length === 0) return;
    if (chainId !== BASE_CHAIN_ID) {
      throw new Error("Please switch to Base before sweeping tokens.");
    }

    onProgress({
      current: 0,
      total: tokens.length,
      status: "swapping",
    });

    try {
      if (supportsBatch && tokens.length > 1) {
        await sweepBatch(tokens, onProgress);
      } else {
        await sweepSequential(tokens, onProgress);
      }
    } catch (err) {
      if (supportsBatch && tokens.length > 1) {
        onProgress({
          current: 0,
          total: tokens.length,
          status: "swapping",
          mode: "sequential",
          message: "Batch unavailable - falling back to sequential swaps...",
        });
        await sweepSequential(tokens, onProgress);
        return;
      }

      onProgress({
        current: 0,
        total: tokens.length,
        status: "error",
        message: err instanceof Error ? err.message : "Sweep failed",
      });
      throw err;
    }
  }

  return { sweep, supportsBatch };
}

