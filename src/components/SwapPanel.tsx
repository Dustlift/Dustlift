"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/constants";
import { formatTokenAmount, formatUsd } from "@/lib/format";
import type { ScanSummary, SwapQuote, TokenBalance } from "@/lib/types";

type SerializedToken = Omit<TokenBalance, "balance"> & { balance: string };

type ScanResponse = {
  tokens: SerializedToken[];
  summary: ScanSummary;
  hasZeroX: boolean;
  error?: string;
};

type Status = "idle" | "loading" | "quoting" | "approving" | "swapping" | "done" | "error";

export function SwapPanel() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedToken = useMemo(
    () => tokens.find((token) => token.address === selectedAddress) ?? null,
    [selectedAddress, tokens],
  );

  const sellAmount = useMemo(() => {
    if (!selectedToken || !amount || Number(amount) <= 0) return null;
    try {
      return parseUnits(amount, selectedToken.decimals);
    } catch {
      return null;
    }
  }, [amount, selectedToken]);

  const expectedEth = quote
    ? `${Number(formatUnits(BigInt(quote.buyAmount), 18)).toFixed(6)} ETH`
    : "0";

  const loadTokens = useCallback(async () => {
    if (!address) return;
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch(
        `/api/scan?address=${address}&threshold=1000000000&swaps=false`,
      );
      const data = (await res.json()) as ScanResponse;
      if (!res.ok) throw new Error(data.error ?? "Token scan failed");

      const parsed = data.tokens
        .map((token) => ({ ...token, balance: BigInt(token.balance) }))
        .filter((token) => !token.isNative && !token.isScam);

      setTokens(parsed);
      setSelectedAddress((current) => current || parsed[0]?.address || "");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Token scan failed");
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    const timeout = window.setTimeout(() => {
      void loadTokens();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [address, loadTokens]);

  async function fetchQuote() {
    if (!address || !selectedToken || !sellAmount) return;
    setError(null);
    setHash(null);
    setQuote(null);
    setStatus("quoting");

    try {
      const res = await fetch(
        `/api/quote?sellToken=${selectedToken.address}&sellAmount=${sellAmount.toString()}&taker=${address}`,
      );
      const data = (await res.json()) as SwapQuote & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No quote available");

      setQuote(data);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Quote failed");
    }
  }

  async function executeSwap() {
    if (!address || !publicClient || !quote || !sellAmount || !selectedToken) {
      return;
    }
    setError(null);

    try {
      if (chainId !== BASE_CHAIN_ID) {
        await switchChainAsync({ chainId: BASE_CHAIN_ID });
        return;
      }

      if (quote.allowanceTarget) {
        const allowance = await publicClient.readContract({
          address: selectedToken.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, quote.allowanceTarget],
        });

        if (allowance < sellAmount) {
          setStatus("approving");
          const approveHash = await writeContractAsync({
            address: selectedToken.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [quote.allowanceTarget, sellAmount],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      setStatus("swapping");
      const txHash = await sendTransactionAsync({
        to: quote.to,
        data: quote.data,
        value: BigInt(quote.value),
      });
      setHash(txHash);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      setStatus("done");
      await loadTokens();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Swap failed");
    }
  }

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-[#3d4a3f]/60 bg-[#1a211c]/80 p-8 text-center">
        <p className="text-lg text-[#c5cdc6]">
          Connect your wallet to swap ERC-20 tokens into ETH.
        </p>
      </div>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/95 p-4">
        <label className="text-sm text-[#8a9a8c]">Sell</label>
        <div className="mt-2 flex items-center gap-3">
          <input
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setQuote(null);
            }}
            inputMode="decimal"
            placeholder="0"
            className="min-w-0 flex-1 bg-transparent text-4xl text-[#e8e4dc] outline-none placeholder:text-[#6b7a6d]"
          />
          <div className="flex flex-col items-end gap-2">
            <select
              value={selectedAddress}
              onChange={(event) => {
                setSelectedAddress(event.target.value);
                setAmount("");
                setQuote(null);
              }}
              className="max-w-40 rounded-full border border-[#3d4a3f] bg-[#1a211c] px-3 py-2 text-sm font-semibold text-[#e8e4dc] outline-none"
            >
              {tokens.length === 0 ? (
                <option value="">Select token</option>
              ) : (
                tokens.map((token) => (
                  <option key={token.address} value={token.address}>
                    {token.symbol}
                  </option>
                ))
              )}
            </select>
            {selectedToken && (
              <button
                type="button"
                onClick={() => {
                  setAmount(formatUnits(selectedToken.balance, selectedToken.decimals));
                  setQuote(null);
                }}
                className="text-xs text-[#6b8f71] hover:underline"
              >
                Max {formatTokenAmount(selectedToken.balance, selectedToken.decimals, 4)}
              </button>
            )}
          </div>
        </div>
        {selectedToken && (
          <p className="mt-2 text-xs text-[#6b7a6d]">
            {selectedToken.name} - {formatUsd(selectedToken.usdValue)}
          </p>
        )}
      </div>

      <div className="mx-auto -my-1 flex size-11 items-center justify-center rounded-xl border border-[#3d4a3f] bg-[#101611] text-2xl text-[#e8e4dc]">
        v
      </div>

      <div className="rounded-2xl border border-[#2a332c]/80 bg-[#101611]/95 p-4">
        <label className="text-sm text-[#8a9a8c]">Buy</label>
        <div className="mt-2 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-4xl text-[#e8e4dc]">{expectedEth}</p>
          <div className="rounded-full border border-[#3d4a3f] bg-[#1a211c] px-4 py-2 text-sm font-semibold text-[#e8e4dc]">
            ETH
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {hash && (
        <a
          href={`https://basescan.org/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[#6b8f71] hover:underline"
        >
          View swap transaction
        </a>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={tokens.length === 0 ? loadTokens : fetchQuote}
          disabled={
            status === "loading" ||
            status === "quoting" ||
            (tokens.length > 0 && (!selectedToken || !sellAmount))
          }
          className="rounded-2xl border border-[#6b8f71]/50 px-5 py-4 text-sm font-semibold text-[#c5cdc6] hover:bg-[#1a211c] disabled:opacity-50"
        >
          {status === "loading" && "Loading tokens..."}
          {status === "quoting" && "Getting quote..."}
          {status !== "loading" &&
            status !== "quoting" &&
            (tokens.length === 0 ? "Load wallet tokens" : "Get quote")}
        </button>
        <button
          type="button"
          onClick={executeSwap}
          disabled={!quote || status === "approving" || status === "swapping"}
          className="rounded-2xl bg-[#e8e4dc] px-5 py-4 text-sm font-semibold text-[#0f1410] transition hover:bg-white disabled:opacity-50"
        >
          {status === "approving" && "Approving..."}
          {status === "swapping" && "Swapping..."}
          {status !== "approving" && status !== "swapping" && "Start"}
        </button>
      </div>

      {status === "done" && (
        <p className="text-sm text-[#6b8f71]">
          Swap complete. ETH was sent to your connected wallet.
        </p>
      )}
    </section>
  );
}
