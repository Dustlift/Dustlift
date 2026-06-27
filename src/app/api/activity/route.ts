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
  rank: ["rank_tx", "rank", "activity_rank", "wallet_rank", "base_rank"],
  score: ["score", "activity_score", "builder_score", "base_score"],
  txCount: ["tx_count", "transactions", "total_tx", "txs", "base_tx_count"],
  nativeVolumeEth: ["native_volume_eth", "native_volume", "volume_eth"],
  contractCount: ["contract_count", "contracts", "unique_contracts"],
  gasFeeEth: ["gasfee_eth", "gas_fee_eth", "gas_spent_eth"],
  activeDays: ["active_days", "days_active", "base_active_days"],
  activeMonths: ["active_months", "months_active"],
  percentile: ["percentile", "top_percent", "activity_percentile"],
  totalWallets: ["total_wallets", "wallet_count", "base_wallets"],
  activeWallets: ["active_wallets", "active_wallet_count"],
  guildTasks: ["guild_tasks", "guild_completed", "guild_score", "guild_level"],
};

const ADDRESS_KEYS = ["wallet", "address", "user", "account", "tx_from"];
const GUILD_BASE_URL = "https://guild.xyz/base";
const GUILD_BASE_API = "https://api.guild.xyz/v2/guilds/base?include=roles";

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

function readDateString(
  obj: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!obj) return null;
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
    const guild = await fetchGuildBadges(dune, local);

    return NextResponse.json({ address, local, dune, guild });
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

  const target = address.toLowerCase();
  const filteredRow = await fetchDuneRowByAddress(queryId, apiKey, target);
  const rows = filteredRow ? [] : await fetchDuneRows(queryId, apiKey);
  const row =
    filteredRow ??
    rows.find((item) =>
      ADDRESS_KEYS.some((key) =>
        String(item[key] ?? "").toLowerCase() === target,
      ),
    ) ?? null;

  const statsRow = row ?? rows[0] ?? {};

  return {
    configured: true,
    queryId,
    rowFound: Boolean(row),
    address: row ? readString(row, ADDRESS_KEYS) : null,
    rank: row ? readNumber(row, NUMBER_KEYS.rank) : null,
    score: row ? readNumber(row, NUMBER_KEYS.score) : null,
    txCount: row ? readNumber(row, NUMBER_KEYS.txCount) : null,
    nativeVolumeEth: row ? readNumber(row, NUMBER_KEYS.nativeVolumeEth) : null,
    contractCount: row ? readNumber(row, NUMBER_KEYS.contractCount) : null,
    gasFeeEth: row ? readNumber(row, NUMBER_KEYS.gasFeeEth) : null,
    activeDays: row ? readNumber(row, NUMBER_KEYS.activeDays) : null,
    activeMonths: row ? readNumber(row, NUMBER_KEYS.activeMonths) : null,
    firstActivity: readDateString(row, [
      "first_activity",
      "first_seen",
      "first_tx",
      "created_at",
    ]),
    percentile: row ? readNumber(row, NUMBER_KEYS.percentile) : null,
    totalWallets: row
      ? readNumber(row, NUMBER_KEYS.totalWallets)
      : readNumber(statsRow, NUMBER_KEYS.totalWallets),
    activeWallets: row
      ? readNumber(row, NUMBER_KEYS.activeWallets)
      : readNumber(statsRow, NUMBER_KEYS.activeWallets),
    guildTasks: row ? readNumber(row, NUMBER_KEYS.guildTasks) : null,
    label: row ? readString(row, ["label", "tier", "guild_tier"]) : null,
    lastUpdated: new Date().toISOString(),
  };
}

async function fetchDuneRowByAddress(
  queryId: string,
  apiKey: string,
  address: string,
): Promise<DuneRow | null> {
  for (const key of ADDRESS_KEYS) {
    const rows = await fetchDuneRows(queryId, apiKey, {
      limit: 1,
      filters: `${key} = '${address}'`,
    });
    if (rows.length > 0) return rows[0];
  }
  return null;
}

async function fetchDuneRows(
  queryId: string,
  apiKey: string,
  options: { limit?: number; offset?: number; filters?: string } = {},
): Promise<DuneRow[]> {
  const search = new URLSearchParams({
    limit: String(options.limit ?? process.env.DUNE_BASE_ACTIVITY_LIMIT ?? "1000"),
    allow_partial_results: "true",
  });
  if (options.offset != null) search.set("offset", String(options.offset));
  if (options.filters) search.set("filters", options.filters);

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

type GuildReward = {
  id?: string;
  type?: string;
  ui?: {
    displayName?: string;
    imageUrl?: string;
    imgUrl?: string;
  };
  data?: {
    roleId?: string;
  };
};

type GuildResponse = {
  name?: string;
  urlName?: string;
  memberCount?: number;
  rewards?: GuildReward[];
};

type ActivityMetrics = {
  txCount?: number | null;
  contractCount?: number | null;
  activeDays?: number | null;
};

function isPublicGuildReward(name: string): boolean {
  const lower = name.toLowerCase();
  return !(
    lower.includes("hidden") ||
    lower.includes("admin") ||
    lower.includes("retired") ||
    lower.includes("test") ||
    lower.includes("deleted")
  );
}

function getTransactionThreshold(name: string): number | null {
  const match = name.match(/Based:\s*([\d,]+)\s*transactions/i);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

function classifyGuildBadge(
  name: string,
  metrics: ActivityMetrics,
): { status: "unlocked" | "locked" | "check"; reason: string } {
  const txCount = metrics.txCount ?? 0;
  const threshold = getTransactionThreshold(name);

  if (threshold != null) {
    return txCount >= threshold
      ? { status: "unlocked", reason: `${threshold}+ Base tx` }
      : { status: "locked", reason: `${threshold}+ Base tx needed` };
  }

  if (["Connected", "Based", "Onchain"].includes(name)) {
    return txCount > 0
      ? { status: "unlocked", reason: "Base activity found" }
      : { status: "locked", reason: "No Base tx found" };
  }

  return {
    status: "check",
    reason: "Check on Guild",
  };
}

async function fetchGuildBadges(
  dune: ActivityMetrics,
  local: ActivityMetrics,
) {
  const metrics = {
    txCount: dune.txCount ?? local.txCount,
    contractCount: dune.contractCount ?? local.contractCount,
    activeDays: dune.activeDays ?? local.activeDays,
  };

  const res = await fetch(GUILD_BASE_API, {
    headers: { accept: "application/json" },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    return {
      configured: false,
      url: GUILD_BASE_URL,
      memberCount: null,
      badges: [],
    };
  }

  const guild = (await res.json()) as GuildResponse;
  const rewards = guild.rewards ?? [];

  const badges = rewards
    .map((reward) => {
      const name = reward.ui?.displayName?.trim() ?? "";
      if (!name || !isPublicGuildReward(name)) return null;
      const status = classifyGuildBadge(name, metrics);
      return {
        id: reward.id ?? reward.data?.roleId ?? name,
        name,
        type: reward.type ?? "GUILD",
        imageUrl: reward.ui?.imageUrl ?? reward.ui?.imgUrl ?? null,
        ...status,
      };
    })
    .filter((badge): badge is NonNullable<typeof badge> => badge != null)
    .sort((a, b) => {
      const order = { unlocked: 0, locked: 1, check: 2 };
      return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
    })
    .slice(0, 24);

  return {
    configured: true,
    url: GUILD_BASE_URL,
    memberCount: guild.memberCount ?? null,
    badges,
  };
}
