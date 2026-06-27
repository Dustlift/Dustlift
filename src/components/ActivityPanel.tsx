"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

type LocalActivity = {
  txCount: number;
  tokenTransferCount: number | null;
  sampledTxCount: number;
  activeDays: number;
  firstSeen: string | null;
  lastSeen: string | null;
  score: number;
};

type DuneActivity = {
  configured: boolean;
  rowFound: boolean;
  address?: string | null;
  rank?: number | null;
  score?: number | null;
  txCount?: number | null;
  nativeVolumeEth?: number | null;
  contractCount?: number | null;
  gasFeeEth?: number | null;
  activeDays?: number | null;
  activeMonths?: number | null;
  firstActivity?: string | null;
  percentile?: number | null;
  totalWallets?: number | null;
  activeWallets?: number | null;
  guildTasks?: number | null;
  label?: string | null;
};

type GuildBadge = {
  id: string;
  name: string;
  type: string;
  imageUrl?: string | null;
  status: "unlocked" | "locked" | "check";
  reason: string;
};

type GuildActivity = {
  configured: boolean;
  url: string;
  memberCount: number | null;
  badges: GuildBadge[];
};

type ActivityResponse = {
  local: LocalActivity;
  dune: DuneActivity;
  guild: GuildActivity;
  error?: string;
};

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "--";
  const normalized = value > 1 ? value : value * 100;
  return `${normalized.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}%`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatEth(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "--";
  return `${formatNumber(value)} ETH`;
}

export function ActivityPanel() {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeWalletRatio = useMemo(() => {
    const active = data?.dune.activeWallets;
    const total = data?.dune.totalWallets;
    if (!active || !total) return null;
    return active / total;
  }, [data]);

  const loadActivity = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/activity?address=${address}`);
      const next = (await res.json()) as ActivityResponse;
      if (!res.ok) throw new Error(next.error ?? "Activity lookup failed");
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activity lookup failed");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    const timeout = window.setTimeout(() => {
      void loadActivity();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [address, loadActivity]);

  return (
    <section className="border-t border-[#2a332c] pt-8">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#6b7a6d]">
            Base Activity
          </p>
          <h2 className="font-serif text-2xl italic text-[#e8e4dc]">
            Wallet rank
          </h2>
        </div>
        {isConnected && (
          <button
            type="button"
            onClick={loadActivity}
            disabled={loading}
            className="rounded-xl border border-[#3d4a3f] px-4 py-2 text-sm text-[#c5cdc6] hover:bg-[#1a211c] disabled:opacity-50"
          >
            {loading ? "Checking..." : "Refresh"}
          </button>
        )}
      </div>

      {!isConnected && (
        <div className="rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/80 p-5 text-sm text-[#8a9a8c]">
          Connect wallet to see Base activity.
        </div>
      )}

      {isConnected && (
        <div className="grid gap-3 sm:grid-cols-3">
          <ActivityStat
            label="Base rank"
            value={
              data?.dune.rowFound && data.dune.rank
                ? `#${formatNumber(data.dune.rank)}`
                : data?.dune.configured
                  ? "Outside sample"
                  : "Dune pending"
            }
          />
          <ActivityStat
            label="Native volume"
            value={formatEth(data?.dune.nativeVolumeEth)}
          />
          <ActivityStat
            label="Contracts"
            value={formatNumber(data?.dune.contractCount)}
          />
          <ActivityStat
            label="Base tx"
            value={formatNumber(data?.dune.txCount ?? data?.local.txCount)}
          />
          <ActivityStat
            label="Gas paid"
            value={formatEth(data?.dune.gasFeeEth)}
          />
          <ActivityStat
            label="Active months"
            value={formatNumber(data?.dune.activeMonths)}
          />
          <ActivityStat
            label="Active days"
            value={formatNumber(data?.dune.activeDays ?? data?.local.activeDays)}
          />
          <ActivityStat
            label="First activity"
            value={formatDate(data?.dune.firstActivity ?? data?.local.firstSeen)}
          />
          <ActivityStat
            label="Active wallet share"
            value={formatPercent(activeWalletRatio)}
          />
        </div>
      )}

      {data?.dune.configured && !data.dune.rowFound && (
        <p className="mt-3 text-xs text-[#8a9a8c]">
          Address was not found in the saved Dune result. Increase the Dune
          result limit or use a query that returns the connected address row.
        </p>
      )}

      {data?.guild && (
        <section className="mt-6 rounded-2xl border border-[#3d4a3f]/50 bg-[#141a16]/70 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-serif text-xl italic text-[#e8e4dc]">
                Base Guild badges
              </h3>
              <p className="text-xs text-[#6b7a6d]">
                {data.guild.memberCount
                  ? `${formatNumber(data.guild.memberCount)} Guild members`
                  : "Guild badge data"}
              </p>
            </div>
            <a
              href={data.guild.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[#6b8f71] hover:underline"
            >
              Open Guild
            </a>
          </div>

          {data.guild.badges.length > 0 ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {data.guild.badges.map((badge) => (
                <BadgeRow key={badge.id} badge={badge} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#8a9a8c]">
              Guild badges could not be loaded right now.
            </p>
          )}
        </section>
      )}

      {data?.local && (
        <div className="mt-3 grid gap-3 text-xs text-[#6b7a6d] sm:grid-cols-3">
          <p>Last seen: {formatDate(data.local.lastSeen)}</p>
          <p>Sampled tx: {formatNumber(data.local.sampledTxCount)}</p>
          <p>Local score: {formatNumber(data.local.score)}</p>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </section>
  );
}

function ActivityStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#3d4a3f]/50 bg-[#141a16]/80 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">{label}</p>
      <p className="mt-1 text-lg font-medium text-[#e8e4dc]">{value}</p>
    </div>
  );
}

function BadgeRow({ badge }: { badge: GuildBadge }) {
  const statusClass =
    badge.status === "unlocked"
      ? "border-[#6b8f71]/50 bg-[#1f2a21] text-[#a8d5ad]"
      : badge.status === "locked"
        ? "border-[#3d4a3f]/50 bg-[#101611] text-[#8a9a8c]"
        : "border-amber-900/40 bg-amber-950/10 text-amber-200/90";
  const label =
    badge.status === "unlocked"
      ? "Unlocked"
      : badge.status === "locked"
        ? "Locked"
        : "Check";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#2a332c] bg-[#101611]/80 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#e8e4dc]">
          {badge.name}
        </p>
        <p className="truncate text-xs text-[#6b7a6d]">{badge.reason}</p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${statusClass}`}
      >
        {label}
      </span>
    </div>
  );
}
