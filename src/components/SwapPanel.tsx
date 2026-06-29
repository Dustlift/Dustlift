"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { erc20Abi, formatUnits, parseEther, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { BASE_CHAIN_ID, ETH_ADDRESS, WETH_BASE } from "@/lib/constants";
import { formatTokenAmount, formatUsd } from "@/lib/format";
import type { ScanSummary, SwapQuote, TokenBalance } from "@/lib/types";

type Address = `0x${string}`;

type SerializedToken = Omit<TokenBalance, "balance"> & { balance: string };

type ScanResponse = {
  tokens: SerializedToken[];
  summary: ScanSummary;
  hasZeroX: boolean;
  error?: string;
};

type Status =
  | "idle"
  | "loading"
  | "quoting"
  | "approving"
  | "swapping"
  | "done"
  | "error";

type TokenOption = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance?: bigint;
  usdPrice?: number | null;
  usdValue?: number | null;
  iconUrl?: string | null;
  isNative?: boolean;
};

type AgentSwapResponse = {
  sellToken?: AgentToken;
  buyToken?: AgentToken;
  amount?: string | null;
  useMax?: boolean;
  summary?: string;
  error?: string;
};

type AgentToken = {
  address: Address;
  symbol: string;
};

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const AERO_BASE = "0x940181a94A35A4569E4529A3CDfB74e38FD98631" as const;
const CBBTC_BASE = "0xcbB7C0000aB88B473b1f5aFD9ef808440eed33Bf" as const;
const DAI_BASE = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" as const;
const EURC_BASE = "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42" as const;

const ETH_GAS_RESERVE = parseEther("0.0002");

const POPULAR_BASE_TOKENS: TokenOption[] = [
  {
    address: USDC_BASE,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    balance: 0n,
  },
  {
    address: WETH_BASE,
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    balance: 0n,
  },
  {
    address: AERO_BASE,
    symbol: "AERO",
    name: "Aerodrome",
    decimals: 18,
    balance: 0n,
  },
  {
    address: CBBTC_BASE,
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    decimals: 8,
    balance: 0n,
  },
  {
    address: DAI_BASE,
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    balance: 0n,
  },
  {
    address: EURC_BASE,
    symbol: "EURC",
    name: "EURC",
    decimals: 6,
    balance: 0n,
  },
];

function normalizeDecimal(value: string): string {
  return value.trim().replace(",", ".");
}

function sameTokenAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function mergeTokenOptions(options: TokenOption[]): TokenOption[] {
  const map = new Map<string, TokenOption>();

  for (const option of options) {
    const key = option.address.toLowerCase();
    const current = map.get(key);

    if (!current) {
      map.set(key, option);
      continue;
    }

    map.set(key, {
      ...current,
      ...option,
      balance:
        option.balance != null && option.balance > 0n
          ? option.balance
          : (current.balance ?? option.balance),
      iconUrl: option.iconUrl ?? current.iconUrl,
      usdPrice: option.usdPrice ?? current.usdPrice,
      usdValue: option.usdValue ?? current.usdValue,
      isNative: current.isNative || option.isNative,
    });
  }

  return Array.from(map.values());
}

function isDecimalInput(value: string): boolean {
  return /^\d*\.?\d*$/.test(value);
}

function buildQuoteKey(
  owner: string,
  sell: TokenOption,
  buy: TokenOption,
  parsedAmount: bigint,
): string {
  return [
    owner.toLowerCase(),
    sell.address.toLowerCase(),
    buy.address.toLowerCase(),
    parsedAmount.toString(),
  ].join(":");
}

export function SwapPanel() {
  const { address, chainId, isConnected } = useAccount();
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: BASE_CHAIN_ID,
  });
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [sellAddress, setSellAddress] = useState<Address>(ETH_ADDRESS);
  const [buyAddress, setBuyAddress] = useState<Address>(USDC_BASE);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteKey, setQuoteKey] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coreBalances, setCoreBalances] = useState<Record<string, bigint>>({});
  const [agentPrompt, setAgentPrompt] = useState("0.001 ETH ile USDC al");
  const [agentStatus, setAgentStatus] = useState<
    "idle" | "thinking" | "done" | "error"
  >("idle");
  const [agentMessage, setAgentMessage] = useState<string | null>(null);

  const ethToken = useMemo<TokenOption>(
    () => ({
      address: ETH_ADDRESS,
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
      balance: ethBalance?.value ?? 0n,
      isNative: true,
    }),
    [ethBalance?.value],
  );

  const walletTokenOptions = useMemo<TokenOption[]>(
    () =>
      tokens
        .map((token) => ({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          balance: token.balance,
          usdPrice: token.usdPrice,
          usdValue: token.usdValue,
          iconUrl: token.iconUrl,
          isNative: false,
        }))
        .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0)),
    [tokens],
  );

  const popularTokenOptions = useMemo(
    () =>
      POPULAR_BASE_TOKENS.map((token) => ({
        ...token,
        balance:
          coreBalances[token.address.toLowerCase()] ?? token.balance ?? 0n,
      })),
    [coreBalances],
  );

  const sellOptions = useMemo(
    () => mergeTokenOptions([ethToken, ...walletTokenOptions, ...popularTokenOptions]),
    [ethToken, popularTokenOptions, walletTokenOptions],
  );

  const buyOptions = useMemo(
    () => mergeTokenOptions([ethToken, ...popularTokenOptions, ...walletTokenOptions]),
    [ethToken, popularTokenOptions, walletTokenOptions],
  );

  const agentTokens = useMemo(
    () =>
      mergeTokenOptions([...sellOptions, ...buyOptions]).map((token) => ({
        address: token.address,
        symbol: token.symbol,
      })),
    [buyOptions, sellOptions],
  );

  const selectedSell = useMemo(
    () =>
      sellOptions.find((token) => sameTokenAddress(token.address, sellAddress)) ??
      null,
    [sellAddress, sellOptions],
  );

  const selectedBuy = useMemo(
    () =>
      buyOptions.find((token) => sameTokenAddress(token.address, buyAddress)) ??
      null,
    [buyAddress, buyOptions],
  );

  const sellAmount = useMemo(() => {
    if (!selectedSell) return null;
    const normalized = normalizeDecimal(amount);
    if (!normalized || Number(normalized) <= 0) return null;

    try {
      const parsed = parseUnits(normalized, selectedSell.decimals);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [amount, selectedSell]);

  const spendableBalance = useMemo(() => {
    if (!selectedSell?.balance) return 0n;
    if (!selectedSell.isNative) return selectedSell.balance;
    return selectedSell.balance > ETH_GAS_RESERVE
      ? selectedSell.balance - ETH_GAS_RESERVE
      : 0n;
  }, [selectedSell]);

  const maxAmount = selectedSell
    ? formatUnits(spendableBalance, selectedSell.decimals)
    : "0";

  const samePair =
    selectedSell && selectedBuy
      ? sameTokenAddress(selectedSell.address, selectedBuy.address)
      : false;
  const currentQuoteKey = useMemo(() => {
    if (!address || !selectedSell || !selectedBuy || !sellAmount) return "";
    return [
      address.toLowerCase(),
      selectedSell.address.toLowerCase(),
      selectedBuy.address.toLowerCase(),
      sellAmount.toString(),
    ].join(":");
  }, [address, selectedBuy, selectedSell, sellAmount]);
  const hasEnoughBalance = sellAmount != null && spendableBalance >= sellAmount;
  const canQuote = Boolean(
    address && selectedSell && selectedBuy && sellAmount && !samePair && hasEnoughBalance,
  );
  const quoteMatchesCurrentTrade = Boolean(
    quote && currentQuoteKey && quoteKey === currentQuoteKey,
  );

  const expectedBuy =
    status === "quoting"
      ? "Calculating..."
      : quote && selectedBuy
        ? `${formatTokenAmount(BigInt(quote.buyAmount), selectedBuy.decimals, 6)} ${
            selectedBuy.symbol
          }`
        : "0";

  const validationMessage = samePair
    ? "Choose two different tokens."
    : sellAmount && !hasEnoughBalance
      ? "Insufficient balance."
      : null;

  function getSpendableBalanceFor(option: TokenOption): bigint {
    if (!option.balance) return 0n;
    if (!option.isNative) return option.balance;
    return option.balance > ETH_GAS_RESERVE ? option.balance - ETH_GAS_RESERVE : 0n;
  }

  const resetTradeState = useCallback(() => {
    setQuote(null);
    setQuoteKey("");
    setHash(null);
    setError(null);
    setStatus((current) => (current === "done" || current === "error" ? "idle" : current));
  }, []);

  const refreshCoreBalances = useCallback(async () => {
    if (!address || !publicClient) return;

    const entries = await Promise.all(
      POPULAR_BASE_TOKENS.map(async (token) => {
        try {
          const balance = await publicClient.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          });
          return [token.address.toLowerCase(), balance] as const;
        } catch {
          return [token.address.toLowerCase(), 0n] as const;
        }
      }),
    );

    setCoreBalances(Object.fromEntries(entries));
  }, [address, publicClient]);

  const loadTokens = useCallback(
    async (quiet = false) => {
      if (!address) return;
      if (!quiet) setStatus("loading");
      setError(null);

      try {
        const res = await fetch(
          `/api/scan?address=${address}&threshold=1000000000&swaps=false`,
        );
        const data = (await res.json()) as ScanResponse;
        if (!res.ok) throw new Error(data.error ?? "Token scan failed");

        const parsed = data.tokens
          .map((token) => ({ ...token, balance: BigInt(token.balance) }))
          .filter(
            (token) =>
              token.isTrusted &&
              !token.isNative &&
              !token.isScam &&
              token.balance > 0n,
          );

        setTokens(parsed);
        if (!quiet) setStatus("idle");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Token scan failed");
      }
    },
    [address],
  );

  useEffect(() => {
    if (!address) return;
    const timeout = window.setTimeout(() => {
      void loadTokens(true);
      void refreshCoreBalances();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [address, loadTokens, refreshCoreBalances]);

  const fetchQuoteForTrade = useCallback(async (
    sell: TokenOption,
    buy: TokenOption,
    parsedAmount: bigint,
  ): Promise<SwapQuote> => {
    if (!address) throw new Error("Wallet not connected.");

    setError(null);
    setHash(null);
    setQuote(null);
    setQuoteKey("");
    setStatus("quoting");

    const requestQuoteKey = buildQuoteKey(address, sell, buy, parsedAmount);
    const search = new URLSearchParams({
      sellToken: sell.address,
      buyToken: buy.address,
      sellAmount: parsedAmount.toString(),
      taker: address,
    });
    const res = await fetch(`/api/quote?${search.toString()}`);
    const data = (await res.json()) as SwapQuote & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "No quote available");

    setQuote(data);
    setQuoteKey(requestQuoteKey);
    setStatus("idle");
    return data;
  }, [address]);

  const fetchQuote = useCallback(async () => {
    if (!address || !selectedSell || !selectedBuy || !sellAmount || !canQuote) {
      return;
    }

    try {
      await fetchQuoteForTrade(selectedSell, selectedBuy, sellAmount);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Quote failed");
    }
  }, [address, canQuote, fetchQuoteForTrade, selectedBuy, selectedSell, sellAmount]);

  useEffect(() => {
    if (!canQuote) return;

    const timeout = window.setTimeout(() => {
      void fetchQuote();
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [canQuote, fetchQuote]);

  function handleAmountChange(value: string) {
    const normalized = value.replace(",", ".");
    if (!isDecimalInput(normalized)) return;
    setAmount(normalized);
    resetTradeState();
  }

  function handleSellChange(value: Address) {
    setSellAddress(value);
    if (sameTokenAddress(value, buyAddress)) {
      setBuyAddress(sameTokenAddress(value, ETH_ADDRESS) ? USDC_BASE : ETH_ADDRESS);
    }
    setAmount("");
    resetTradeState();
  }

  function handleBuyChange(value: Address) {
    setBuyAddress(value);
    resetTradeState();
  }

  function swapDirection() {
    setSellAddress(buyAddress);
    setBuyAddress(sellAddress);
    setAmount("");
    resetTradeState();
  }

  async function runAgentSwap(command?: string) {
    const prompt = (command ?? agentPrompt).trim();
    if (!prompt) return;

    setAgentStatus("thinking");
    setAgentMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/agent-swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          tokens: agentTokens,
        }),
      });
      const data = (await res.json()) as AgentSwapResponse;
      if (!res.ok) throw new Error(data.error ?? "Agent could not parse command");

      const nextSell = sellOptions.find(
        (token) =>
          data.sellToken &&
          sameTokenAddress(token.address, data.sellToken.address),
      );
      const nextBuy = buyOptions.find(
        (token) =>
          data.buyToken &&
          sameTokenAddress(token.address, data.buyToken.address),
      );

      if (!nextSell || !nextBuy) {
        throw new Error("Agent selected a token that is not available.");
      }

      const nextAmount = data.useMax
        ? formatUnits(getSpendableBalanceFor(nextSell), nextSell.decimals)
        : (data.amount ?? "");
      const parsedAmount = parseUnits(nextAmount, nextSell.decimals);
      const balance = getSpendableBalanceFor(nextSell);

      if (parsedAmount <= 0n) {
        throw new Error("Agent amount is zero.");
      }

      if (balance < parsedAmount) {
        throw new Error(`Insufficient ${nextSell.symbol} balance.`);
      }

      setSellAddress(nextSell.address);
      setBuyAddress(nextBuy.address);
      setAmount(nextAmount);
      resetTradeState();
      setAgentPrompt(prompt);
      setAgentMessage(
        `Agent prepared: ${data.summary ?? `${nextAmount} ${nextSell.symbol} -> ${nextBuy.symbol}`}. Opening wallet approval now.`,
      );
      const agentQuote = await fetchQuoteForTrade(nextSell, nextBuy, parsedAmount);
      await executeQuotedSwap(agentQuote, nextSell, parsedAmount);
      setAgentStatus("done");
      setAgentMessage(
        `Agent swap complete: ${data.summary ?? `${nextAmount} ${nextSell.symbol} -> ${nextBuy.symbol}`}.`,
      );
    } catch (err) {
      setAgentStatus("error");
      setAgentMessage(
        err instanceof Error ? err.message : "Agent command failed",
      );
    }
  }

  async function executeQuotedSwap(
    swapQuote: SwapQuote,
    sell: TokenOption,
    parsedAmount: bigint,
  ) {
    if (!address || !publicClient) {
      throw new Error("Wallet client is not ready.");
    }

    if (chainId !== BASE_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_CHAIN_ID });
    }

    if (!sell.isNative) {
      if (!swapQuote.allowanceTarget) {
        throw new Error("Approval target is missing from the quote.");
      }

      const allowance = await publicClient.readContract({
        address: sell.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, swapQuote.allowanceTarget],
      });

      if (allowance < parsedAmount) {
        setStatus("approving");
        const approveHash = await writeContractAsync({
          address: sell.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [swapQuote.allowanceTarget, parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
    }

    setStatus("swapping");
    const txHash = await sendTransactionAsync({
      to: swapQuote.to,
      data: swapQuote.data,
      value: BigInt(swapQuote.value),
    });
    setHash(txHash);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    await Promise.all([loadTokens(true), refreshCoreBalances(), refetchEthBalance()]);
    setStatus("done");
  }

  async function executeSwap() {
    if (
      !address ||
      !publicClient ||
      !quote ||
      !quoteMatchesCurrentTrade ||
      !sellAmount ||
      !selectedSell ||
      !selectedBuy ||
      !canQuote
    ) {
      return;
    }
    setError(null);

    try {
      await executeQuotedSwap(quote, selectedSell, sellAmount);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Swap failed");
    }
  }

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-[#3d4a3f]/60 bg-[#1a211c]/80 p-8 text-center">
        <p className="text-lg text-[#c5cdc6]">
          Connect your wallet to swap Base assets.
        </p>
      </div>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runAgentSwap();
        }}
        className="rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/95 p-4"
      >
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#6b8f71]">
              AI agent swap
            </p>
            <p className="mt-1 text-sm text-[#8a9a8c]">
              Tell the agent what to swap. It prepares the route and opens your
              wallet; you still approve the final transaction.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              value={agentPrompt}
              onChange={(event) => setAgentPrompt(event.target.value)}
              placeholder="0.001 ETH ile USDC al"
              className="min-w-0 flex-1 rounded-xl border border-[#3d4a3f] bg-[#101611] px-4 py-3 text-sm text-[#e8e4dc] outline-none placeholder:text-[#6b7a6d]"
            />
            <button
              type="submit"
              disabled={
                agentStatus === "thinking" ||
                status === "quoting" ||
                status === "approving" ||
                status === "swapping"
              }
              className="rounded-xl bg-[#6b8f71] px-4 py-3 text-sm font-semibold text-[#0f1410] transition hover:bg-[#7fa385] disabled:opacity-50"
            >
              {agentStatus === "thinking" ? "Thinking..." : "Agent Swap"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {["0.001 ETH ile USDC al", "Max USDC sat ETH al", "0.01 ETH ile AERO al"].map(
              (example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setAgentPrompt(example);
                    void runAgentSwap(example);
                  }}
                  className="rounded-full border border-[#3d4a3f] px-3 py-1 text-xs text-[#a8b0a4] hover:bg-[#1a211c]"
                >
                  {example}
                </button>
              ),
            )}
          </div>
          {agentMessage && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                agentStatus === "error"
                  ? "border-red-900/50 bg-red-950/30 text-red-300"
                  : "border-[#6b8f71]/40 bg-[#1f2a21]/60 text-[#a8d5ad]"
              }`}
            >
              {agentMessage}
            </div>
          )}
        </div>
      </form>

      <div className="rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/95 p-4">
        <label className="text-sm text-[#8a9a8c]">Sell</label>
        <div className="mt-2 flex items-center gap-3">
          <input
            value={amount}
            onChange={(event) => handleAmountChange(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="min-w-0 flex-1 bg-transparent text-4xl text-[#e8e4dc] outline-none placeholder:text-[#6b7a6d]"
          />
          <div className="flex flex-col items-end gap-2">
            <select
              value={sellAddress}
              onChange={(event) => handleSellChange(event.target.value as Address)}
              className="max-w-40 rounded-full border border-[#3d4a3f] bg-[#1a211c] px-3 py-2 text-sm font-semibold text-[#e8e4dc] outline-none"
            >
              {sellOptions.map((token) => (
                <option key={token.address} value={token.address}>
                  {token.symbol}
                </option>
              ))}
            </select>
            {selectedSell && (
              <button
                type="button"
                onClick={() => {
                  setAmount(maxAmount);
                  resetTradeState();
                }}
                disabled={spendableBalance === 0n}
                className="text-xs text-[#6b8f71] hover:underline disabled:opacity-50"
              >
                Max {formatTokenAmount(spendableBalance, selectedSell.decimals, 4)}
              </button>
            )}
          </div>
        </div>
        {selectedSell && (
          <p className="mt-2 text-xs text-[#6b7a6d]">
            {selectedSell.name} - Balance{" "}
            {formatTokenAmount(selectedSell.balance ?? 0n, selectedSell.decimals, 6)}
            {selectedSell.usdValue != null ? ` - ${formatUsd(selectedSell.usdValue)}` : ""}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={swapDirection}
        className="mx-auto -my-1 flex size-11 items-center justify-center rounded-xl border border-[#3d4a3f] bg-[#101611] text-xl font-semibold text-[#e8e4dc] hover:bg-[#1a211c]"
        aria-label="Switch swap direction"
      >
        v
      </button>

      <div className="rounded-2xl border border-[#2a332c]/80 bg-[#101611]/95 p-4">
        <label className="text-sm text-[#8a9a8c]">Buy</label>
        <div className="mt-2 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-4xl text-[#e8e4dc]">{expectedBuy}</p>
          <select
            value={buyAddress}
            onChange={(event) => handleBuyChange(event.target.value as Address)}
            className="max-w-40 rounded-full border border-[#3d4a3f] bg-[#1a211c] px-3 py-2 text-sm font-semibold text-[#e8e4dc] outline-none"
          >
            {buyOptions.map((token) => (
              <option
                key={token.address}
                value={token.address}
                disabled={sameTokenAddress(token.address, sellAddress)}
              >
                {token.symbol}
              </option>
            ))}
          </select>
        </div>
        {selectedBuy && (
          <p className="mt-2 text-xs text-[#6b7a6d]">{selectedBuy.name}</p>
        )}
      </div>

      {(validationMessage || error) && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {validationMessage ?? error}
        </div>
      )}

      {selectedSell && !selectedSell.isNative && quoteMatchesCurrentTrade && sellAmount && (
        <div className="rounded-xl border border-[#3d4a3f]/60 bg-[#1a211c]/70 px-4 py-3 text-xs text-[#8a9a8c]">
          Approval cap: {formatTokenAmount(sellAmount, selectedSell.decimals, 6)}{" "}
          {selectedSell.symbol}
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
          onClick={canQuote ? fetchQuote : () => loadTokens(false)}
          disabled={status === "loading" || status === "quoting"}
          className="rounded-2xl border border-[#6b8f71]/50 px-5 py-4 text-sm font-semibold text-[#c5cdc6] hover:bg-[#1a211c] disabled:opacity-50"
        >
          {status === "loading" && "Loading tokens..."}
          {status === "quoting" && "Getting quote..."}
          {status !== "loading" &&
            status !== "quoting" &&
            (canQuote ? "Refresh quote" : "Refresh tokens")}
        </button>
        <button
          type="button"
          onClick={executeSwap}
          disabled={
            !quoteMatchesCurrentTrade ||
            status === "approving" ||
            status === "swapping" ||
            !canQuote
          }
          className="rounded-2xl bg-[#e8e4dc] px-5 py-4 text-sm font-semibold text-[#0f1410] transition hover:bg-white disabled:opacity-50"
        >
          {status === "approving" && "Approving exact cap..."}
          {status === "swapping" && "Swapping..."}
          {status !== "approving" && status !== "swapping" && "Start"}
        </button>
      </div>

      {status === "done" && (
        <p className="text-sm text-[#6b8f71]">
          Swap complete. Assets were sent to your connected wallet.
        </p>
      )}
    </section>
  );
}
