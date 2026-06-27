"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { DEFAULT_DUST_THRESHOLD_USD } from "@/lib/constants";
import { formatTokenAmount, formatUsd, shortenSymbol } from "@/lib/format";
import {
  getHiddenTokens,
  hideToken,
  reportScamToken,
  unhideToken,
} from "@/lib/scam";
import type { ScanSummary, TokenBalance } from "@/lib/types";
import { useSweep, type SweepProgress } from "@/hooks/useSweep";

type SerializedToken = Omit<TokenBalance, "balance"> & { balance: string };

type ScanResponse = {
  tokens: SerializedToken[];
  summary: ScanSummary;
  hasZeroX: boolean;
  fee?: { enabled: boolean };
};

type AppConfig = {
  fee: { enabled: boolean; percentLabel: string };
};

export function DustScanner() {
  const { address, isConnected } = useAccount();
  const { sweep, supportsBatch } = useSweep();

  const [threshold, setThreshold] = useState(DEFAULT_DUST_THRESHOLD_USD);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [hasZeroX, setHasZeroX] = useState(false);
  const [feeEnabled, setFeeEnabled] = useState(false);
  const [feeLabel, setFeeLabel] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SweepProgress>({
    current: 0,
    total: 0,
    status: "idle",
  });

  useEffect(() => {
    queueMicrotask(() => setHidden(getHiddenTokens()));
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: AppConfig) => {
        setFeeEnabled(data.fee.enabled);
        setFeeLabel(data.fee.percentLabel);
      })
      .catch(() => undefined);
  }, []);

  const visibleTokens = useMemo(
    () =>
      tokens.filter((t) => showHidden || !hidden.has(t.address.toLowerCase())),
    [tokens, hidden, showHidden],
  );

  const dustTokens = useMemo(
    () => visibleTokens.filter((t) => t.isDust),
    [visibleTokens],
  );

  const scamTokens = useMemo(
    () => visibleTokens.filter((t) => t.isScam),
    [visibleTokens],
  );

  const swappableSelected = useMemo(
    () => dustTokens.filter((t) => selected.has(t.address) && t.isSwappable),
    [dustTokens, selected],
  );

  const estimatedRecovery = useMemo(
    () => swappableSelected.reduce((sum, t) => sum + (t.usdValue ?? 0), 0),
    [swappableSelected],
  );

  const scanWallet = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/scan?address=${address}&threshold=${threshold}`,
      );
      const data = (await res.json()) as ScanResponse & { error?: string };

      if (!res.ok) throw new Error(data.error ?? "Scan failed");

      const parsed: TokenBalance[] = data.tokens.map((t) => ({
        ...t,
        balance: BigInt(t.balance),
      }));

      setTokens(parsed);
      setSummary(data.summary);
      setHasZeroX(data.hasZeroX);
      if (data.fee) setFeeEnabled(data.fee.enabled);

      const autoSelect = new Set(
        parsed
          .filter((t) => t.isDust && t.isSwappable && !t.isScam)
          .map((t) => t.address),
      );
      setSelected(autoSelect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [address, threshold]);

  const toggleToken = (addr: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      return next;
    });
  };

  const selectAllSwappable = () => {
    setSelected(
      new Set(
        dustTokens.filter((t) => t.isSwappable).map((t) => t.address),
      ),
    );
  };

  const handleHide = (addr: string) => {
    hideToken(addr);
    setHidden(getHiddenTokens());
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(addr);
      return next;
    });
  };

  const handleReportScam = (token: TokenBalance) => {
    reportScamToken(token.address, token.scamReason ?? "User reported");
    setHidden(getHiddenTokens());
  };

  const sweepSelected = async () => {
    if (swappableSelected.length === 0) return;
    setError(null);

    try {
      await sweep(swappableSelected, setProgress);
      await scanWallet();
    } catch {
      /* progress already set */
    }
  };

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-[#3d4a3f]/60 bg-[#1a211c]/80 p-10 text-center">
        <p className="text-lg text-[#c5cdc6]">
          Connect your wallet on Base to scan for dust tokens.
        </p>
        <p className="mt-2 text-sm text-[#8a9a8c]">
          Works in Base App, Coinbase Wallet, MetaMask, and other Base wallets.
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-[#8a9a8c]">
            Dust threshold (tokens below this USD value)
          </span>
          <input
            type="number"
            min={0.01}
            step={0.5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="rounded-xl border border-[#3d4a3f] bg-[#141a16] px-4 py-3 text-[#e8e4dc] outline-none focus:border-[#6b8f71]"
          />
        </label>
        <button
          type="button"
          onClick={scanWallet}
          disabled={loading}
          className="rounded-xl bg-[#6b8f71] px-6 py-3 font-medium text-[#0f1410] transition hover:bg-[#7fa385] disabled:opacity-50"
        >
          {loading ? "Scanning..." : "Scan wallet"}
        </button>
      </section>

      {feeEnabled && feeLabel && (
        <p className="text-xs text-[#8a9a8c]">
          Platform fee: {feeLabel} per swap (paid in ETH via 0x integrator fee)
        </p>
      )}

      {supportsBatch && (
        <p className="text-xs text-[#6b8f71]">
          Batch mode available: selected approves and swaps can be bundled in
          fewer confirmations.
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-red-300">
          {error}
        </div>
      )}

      {summary && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Total tokens" value={String(summary.totalTokens)} />
          <Stat label="Dust found" value={String(summary.dustTokens)} />
          <Stat label="Scam flagged" value={String(summary.scamTokens)} />
          <Stat label="Recoverable" value={formatUsd(summary.swappableDustUsd)} />
          <Stat label="Unsellable" value={String(summary.unsellableCount)} />
        </section>
      )}

      {!hasZeroX && tokens.length > 0 && (
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/90">
          Add <code className="text-amber-100">ZEROX_API_KEY</code> to enable
          swaps and commission collection.
        </div>
      )}

      {hidden.size > 0 && (
        <label className="flex items-center gap-2 text-sm text-[#8a9a8c]">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            className="accent-[#6b8f71]"
          />
          Show {hidden.size} hidden token{hidden.size > 1 ? "s" : ""}
        </label>
      )}

      {scamTokens.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-xl italic text-[#d4cfc4]">
            Scam tokens
          </h2>
          <ul className="divide-y divide-[#2a332c] overflow-hidden rounded-2xl border border-red-900/30 bg-[#141a16]/90">
            {scamTokens.map((token) => (
              <TokenRow
                key={token.address}
                token={token}
                selected={false}
                onToggle={() => undefined}
                onHide={() => handleHide(token.address)}
                onReport={() => handleReportScam(token)}
                onUnhide={
                  hidden.has(token.address)
                    ? () => {
                        unhideToken(token.address);
                        setHidden(getHiddenTokens());
                      }
                    : undefined
                }
                disabled
                variant="scam"
              />
            ))}
          </ul>
        </section>
      )}

      {dustTokens.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl italic text-[#d4cfc4]">
              Dust tokens
            </h2>
            <button
              type="button"
              onClick={selectAllSwappable}
              className="text-sm text-[#6b8f71] hover:underline"
            >
              Select all swappable
            </button>
          </div>

          <ul className="divide-y divide-[#2a332c] overflow-hidden rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/90">
            {dustTokens.map((token) => (
              <TokenRow
                key={token.address}
                token={token}
                selected={selected.has(token.address)}
                onToggle={() => toggleToken(token.address)}
                onHide={() => handleHide(token.address)}
                onReport={() => handleReportScam(token)}
                disabled={!token.isSwappable}
              />
            ))}
          </ul>
        </section>
      )}

      {tokens.length > 0 && dustTokens.length === 0 && (
        <p className="text-center text-[#8a9a8c]">
          No dust tokens found below ${threshold}.
        </p>
      )}

      {swappableSelected.length > 0 && hasZeroX && (
        <section className="sticky bottom-4 rounded-2xl border border-[#6b8f71]/40 bg-[#1a211c]/95 p-5 shadow-xl backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-[#8a9a8c]">
                {swappableSelected.length} token
                {swappableSelected.length > 1 ? "s" : ""} selected
              </p>
              <p className="text-xl text-[#e8e4dc]">
                ~{formatUsd(estimatedRecovery)} to ETH
              </p>
              <p className="text-xs text-[#8a9a8c]">
                ETH is paid back to your connected wallet. DustLift fee is taken
                from each successful 0x swap.
              </p>
              {progress.status !== "idle" && progress.status !== "done" && (
                <p className="text-sm text-[#6b8f71]">
                  {progress.status === "batching" && progress.message}
                  {progress.status === "approving" && "Approving..."}
                  {progress.status === "swapping" &&
                    (progress.mode === "batch"
                      ? progress.message
                      : `Swapping ${progress.token} (${progress.current + 1}/${progress.total})`)}
                  {progress.status === "error" && progress.message}
                </p>
              )}
              {progress.status === "done" && (
                <p className="text-sm text-[#6b8f71]">Sweep complete!</p>
              )}
            </div>
            <button
              type="button"
              onClick={sweepSelected}
              disabled={
                progress.status === "approving" ||
                progress.status === "swapping" ||
                progress.status === "batching"
              }
              className="rounded-xl bg-[#e8e4dc] px-8 py-3 font-semibold text-[#0f1410] transition hover:bg-white disabled:opacity-50"
            >
              Convert selected to ETH
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function TokenRow({
  token,
  selected,
  onToggle,
  onHide,
  onReport,
  onUnhide,
  disabled,
  variant = "dust",
}: {
  token: TokenBalance;
  selected: boolean;
  onToggle: () => void;
  onHide: () => void;
  onReport: () => void;
  onUnhide?: () => void;
  disabled?: boolean;
  variant?: "dust" | "scam";
}) {
  return (
    <li className="flex items-center gap-4 px-4 py-3 hover:bg-[#1a211c]/80">
      {variant === "dust" && (
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          className="size-4 accent-[#6b8f71]"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[#e8e4dc]">
            {shortenSymbol(token.symbol)}
          </span>
          {token.isScam && (
            <span className="rounded-full bg-red-950/50 px-2 py-0.5 text-xs text-red-300">
              scam
            </span>
          )}
          {variant === "dust" && !token.isSwappable && (
            <span className="rounded-full bg-[#2a332c] px-2 py-0.5 text-xs text-[#8a9a8c]">
              unsellable
            </span>
          )}
        </div>
        <p className="truncate text-xs text-[#6b7a6d]">{token.name}</p>
        {token.swapBlockedReason && (
          <p className="text-xs text-[#8a7060]">{token.swapBlockedReason}</p>
        )}
        {token.scamReason && (
          <p className="text-xs text-red-300/80">{token.scamReason}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right text-sm">
          <p className="text-[#c5cdc6]">
            {formatTokenAmount(token.balance, token.decimals)}
          </p>
          <p className="text-[#6b8f71]">{formatUsd(token.usdValue)}</p>
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onHide}
            className="text-xs text-[#8a9a8c] hover:text-[#e8e4dc]"
          >
            Hide
          </button>
          {!token.isScam && (
            <button
              type="button"
              onClick={onReport}
              className="text-xs text-red-400/80 hover:text-red-300"
            >
              Report
            </button>
          )}
          {onUnhide && (
            <button
              type="button"
              onClick={onUnhide}
              className="text-xs text-[#6b8f71] hover:underline"
            >
              Unhide
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#3d4a3f]/50 bg-[#141a16]/80 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">{label}</p>
      <p className="mt-1 text-lg font-medium text-[#e8e4dc]">{value}</p>
    </div>
  );
}


