"use client";

import { useMemo, useState } from "react";
import { erc20Abi, formatUnits, isAddress, parseUnits } from "viem";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/constants";
import type { SwapQuote } from "@/lib/types";

type TokenMeta = {
  symbol: string;
  decimals: number;
};

type Status = "idle" | "loading" | "approving" | "swapping" | "done" | "error";

export function SwapPanel() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [tokenAddress, setTokenAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validToken = isAddress(tokenAddress);
  const sellAmount = useMemo(() => {
    if (!meta || !amount || Number(amount) <= 0) return null;
    try {
      return parseUnits(amount, meta.decimals);
    } catch {
      return null;
    }
  }, [amount, meta]);

  const expectedEth = quote
    ? `${Number(formatUnits(BigInt(quote.buyAmount), 18)).toFixed(6)} ETH`
    : "--";

  async function loadTokenMeta() {
    if (!validToken || !publicClient) return null;

    const token = tokenAddress.toLowerCase() as `0x${string}`;
    const [decimals, symbol] = await Promise.all([
      publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "decimals",
      }),
      publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "symbol",
      }),
    ]);

    const next = {
      decimals: Number(decimals),
      symbol: String(symbol),
    };
    setMeta(next);
    return next;
  }

  async function fetchQuote() {
    if (!address) return;
    setError(null);
    setHash(null);
    setQuote(null);
    setStatus("loading");

    try {
      const tokenMeta = meta ?? (await loadTokenMeta());
      if (!tokenMeta) throw new Error("Enter a valid ERC-20 token address.");

      const parsedAmount = parseUnits(amount, tokenMeta.decimals);
      if (parsedAmount <= 0n) throw new Error("Enter a token amount.");

      const res = await fetch(
        `/api/quote?sellToken=${tokenAddress}&sellAmount=${parsedAmount.toString()}&taker=${address}`,
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
    if (!address || !publicClient || !quote || !sellAmount) return;
    setError(null);

    try {
      if (chainId !== BASE_CHAIN_ID) {
        await switchChainAsync({ chainId: BASE_CHAIN_ID });
        return;
      }

      const token = tokenAddress.toLowerCase() as `0x${string}`;

      if (quote.allowanceTarget) {
        const allowance = await publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, quote.allowanceTarget],
        });

        if (allowance < sellAmount) {
          setStatus("approving");
          const approveHash = await writeContractAsync({
            address: token,
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
    <section className="flex flex-col gap-5 rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/90 p-5">
      <div>
        <h2 className="font-serif text-2xl italic text-[#e8e4dc]">
          Swap to ETH
        </h2>
        <p className="mt-2 text-sm text-[#a8b0a4]">
          Swap any sellable ERC-20 token on Base into ETH. DustLift fee is
          included through the 0x quote.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr]">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-[#8a9a8c]">Token contract</span>
          <input
            value={tokenAddress}
            onChange={(e) => {
              setTokenAddress(e.target.value.trim());
              setMeta(null);
              setQuote(null);
            }}
            placeholder="0x..."
            className="rounded-xl border border-[#3d4a3f] bg-[#101611] px-4 py-3 text-[#e8e4dc] outline-none focus:border-[#6b8f71]"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-[#8a9a8c]">Amount</span>
          <input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setQuote(null);
            }}
            inputMode="decimal"
            placeholder="0.0"
            className="rounded-xl border border-[#3d4a3f] bg-[#101611] px-4 py-3 text-[#e8e4dc] outline-none focus:border-[#6b8f71]"
          />
        </label>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <Info label="Token" value={meta?.symbol ?? (validToken ? "Ready" : "--")} />
        <Info label="Expected ETH" value={expectedEth} />
        <Info label="Route" value="0x on Base" />
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

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={fetchQuote}
          disabled={!validToken || !amount || status === "loading"}
          className="rounded-xl border border-[#6b8f71]/50 px-5 py-3 text-sm font-semibold text-[#c5cdc6] hover:bg-[#1a211c] disabled:opacity-50"
        >
          {status === "loading" ? "Getting quote..." : "Get quote"}
        </button>
        <button
          type="button"
          onClick={executeSwap}
          disabled={!quote || status === "approving" || status === "swapping"}
          className="rounded-xl bg-[#e8e4dc] px-5 py-3 text-sm font-semibold text-[#0f1410] transition hover:bg-white disabled:opacity-50"
        >
          {status === "approving" && "Approving..."}
          {status === "swapping" && "Swapping..."}
          {status !== "approving" && status !== "swapping" && "Swap to ETH"}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">{label}</p>
      <p className="mt-1 text-[#c5cdc6]">{value}</p>
    </div>
  );
}
