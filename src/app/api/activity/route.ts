import { NextRequest, NextResponse } from "next/server";
import { BLOCKSCOUT_BASE } from "@/lib/constants";

type BlockscoutAddress = Record<string, unknown>;

type BlockscoutTransaction = {
  timestamp?: string | null;
  from?: { hash?: string | null } | null;
  to?: { hash?: string | null } | null;
};

type DuneRow = Record<string, unknown>;

const NUMBER_KEYS = {
  rank: ["rank", "activity_rank", "wallet_rank", "base_rank"],
  score: ["score", "activity_score", "builder_score", "base_score"],
  txCount: ["tx_count", "transactions", "total_tx", "txs", "base_tx_count"],
  activeDays: ["active_days", "days_active", "base_active_days"],
  percentile: ["percentile", "top_percent", "activity_percentile"],
  totalWallets: ["total_wallets", "wallet_count", "base_wallets"],
  activeWallets: ["active_wallets", "active_wallet_count"],
  guildTasks: ["guild_tasks", "guild_completed", "guild_score", "guild_level"],
};

const ADDRESS_KEYS = ["wallet", "address", "user", "account", "tx_from"];

function readNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function readString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function daysBetween(start: number, end: number): number {
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const [local, dune] = await Promise.all([
      fetchLocalActivity(address),
      fetchDuneActivity(address),
    ]);

    return NextResponse.json({ address, local, dune });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Activity lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchLocalActivity(address: string) {
  const [profile, txData] = await Promise.all([
    fetch(`${BLOCKSCOUT_BASE}/addresses/${address}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 },
    }),
    fetch(`${BLOCKSCOUT_BASE}/addresses/${address}/transactions`, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 },
    }),
  ]);

  const profileJson = profile.ok
    ? ((await profile.json()) as BlockscoutAddress)
    : {};
  const txJson = txData.ok
    ? ((await txData.json()) as { items?: BlockscoutTransaction[] })
    : {};

  const items = txJson.items ?? [];
  const timestamps = items
    .map((tx) => parseTimestamp(tx.timestamp))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);

  const uniqueDays = new Set(
    timestamps.map((time) => new Date(time).toISOString().slice(0, 10)),
  );
  const firstSeen = timestamps[0] ?? null;
  const lastSeen = timestamps[timestamps.length - 1] ?? null;
  const ageDays =
    firstSeen && lastSeen ? daysBetween(firstSeen, Date.now()) : null;

  const txCount =
    readNumber(profileJson, [
      "transactions_count",
      "transaction_count",
      "tx_count",
      "transactions",
    ]) ?? items.length;
  const tokenTransferCount = readNumber(profileJson, [
    "token_transfers_count",
    "token_transfer_count",
  ]);
  const activeDays = Math.max(uniqueDays.size, ageDays ? Math.min(ageDays, 1) : 0);
  const score = Math.round(
    txCount * 1.5 + activeDays * 8 + (tokenTransferCount ?? 0) * 0.25,
  );

  return {
    txCount,
    tokenTransferCount,
    sampledTxCount: items.length,
    activeDays,
    firstSeen: firstSeen ? new Date(firstSeen).toISOString() : null,
    lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
    score,
  };
}

async function fetchDuneActivity(address: string) {
  const apiKey = process.env.DUNE_API_KEY;
  const queryId = process.env.DUNE_BASE_ACTIVITY_QUERY_ID;

  if (!apiKey || !queryId) {
    return {
      configured: false,
      rowFound: false,
    };
  }

  const rows = await fetchDuneRows(queryId, apiKey);
  const target = address.toLowerCase();
  const row =
    rows.find((item) =>
      ADDRESS_KEYS.some((key) =>
        String(item[key] ?? "").toLowerCase().includes(target),
      ),
    ) ?? null;

  return {
    configured: true,
    queryId,
    rowFound: Boolean(row),
    rank: row ? readNumber(row, NUMBER_KEYS.rank) : null,
    score: row ? readNumber(row, NUMBER_KEYS.score) : null,
    txCount: row ? readNumber(row, NUMBER_KEYS.txCount) : null,
    activeDays: row ? readNumber(row, NUMBER_KEYS.activeDays) : null,
    percentile: row ? readNumber(row, NUMBER_KEYS.percentile) : null,
    totalWallets: row
      ? readNumber(row, NUMBER_KEYS.totalWallets)
      : readNumber(rows[0] ?? {}, NUMBER_KEYS.totalWallets),
    activeWallets: row
      ? readNumber(row, NUMBER_KEYS.activeWallets)
      : readNumber(rows[0] ?? {}, NUMBER_KEYS.activeWallets),
    guildTasks: row ? readNumber(row, NUMBER_KEYS.guildTasks) : null,
    label: row ? readString(row, ["label", "tier", "guild_tier"]) : null,
    lastUpdated: new Date().toISOString(),
  };
}

async function fetchDuneRows(queryId: string, apiKey: string): Promise<DuneRow[]> {
  const search = new URLSearchParams({
    limit: process.env.DUNE_BASE_ACTIVITY_LIMIT ?? "1000",
    allow_partial_results: "true",
  });

  const res = await fetch(
    `https://api.dune.com/api/v1/query/${queryId}/results?${search.toString()}`,
    {
      headers: {
        "X-Dune-Api-Key": apiKey,
      },
      next: { revalidate: 300 },
    },
  );

  if (!res.ok) return [];

  const data = (await res.json()) as {
    result?: { rows?: DuneRow[] };
  };

  return data.result?.rows ?? [];
}
