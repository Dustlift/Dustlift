import { NextRequest, NextResponse } from "next/server";
import { formatEther, parseEther } from "viem";
import { BLOCKSCOUT_BASE } from "@/lib/constants";

type BlockscoutAddress = Record<string, unknown>;

type BlockscoutTransaction = {
  timestamp?: string | null;
  from?: { hash?: string | null } | null;
  to?: { hash?: string | null } | null;
  value?: unknown;
  fee?: unknown;
  transaction_fee?: unknown;
  tx_fee?: unknown;
  gas_fee?: unknown;
  gas_used?: unknown;
  gas_price?: unknown;
  gasUsed?: unknown;
  gasPrice?: unknown;
};

type BlockscoutTransactionsResponse = {
  items?: BlockscoutTransaction[];
  next_page_params?: Record<string, string | number | boolean | null> | null;
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
const DEFAULT_DUNE_PAGE_SIZE = 1000;
const DEFAULT_DUNE_MAX_PAGES = 0;
const DEFAULT_BLOCKSCOUT_TX_PAGES = 12;
const BASE_GUILD_BADGE_GROUPS = new Map<string, string>([
  ["connected", "Home"],
  ["based", "Home"],
  ["captcha verified", "Home"],
  ["onchain", "Onchain"],
  ["coinbase onchain verified", "Onchain"],
  ["based: 10 transactions", "Onchain"],
  ["based: 50 transactions", "Onchain"],
  ["based: 100 transactions", "Onchain"],
  ["based: 1,000 transactions", "Onchain"],
  ["base guild pin", "Onchain"],
  ["base learn newcomer", "Onchain"],
  ["base learn acolyte", "Onchain"],
  ["base learn consul", "Onchain"],
  ["base learn prefect", "Onchain"],
  ["base learn supreme", "Onchain"],
  ["based developer", "Builders & Founders"],
  ["based caster", "Creators & Voices"],
  ["base redditor", "Creators & Voices"],
  ["base maxi", "Creators & Voices"],
  ["true early believers", "It's Time to PRED"],
]);

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

function sameAddress(value: unknown, address: string): boolean {
  return String(value ?? "").toLowerCase() === address.toLowerCase();
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function daysBetween(start: number, end: number): number {
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readWeiAmount(value: unknown): bigint | null {
  if (value == null) return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string") {
    const clean = value.trim().replace(/,/g, "");
    if (!clean) return null;
    if (/^\d+$/.test(clean)) return BigInt(clean);
    if (/^\d*\.\d+$/.test(clean)) {
      try {
        return parseEther(clean);
      } catch {
        return null;
      }
    }
    return null;
  }

  if (isRecord(value)) {
    for (const key of ["value", "wei", "amount", "raw"]) {
      const parsed = readWeiAmount(value[key]);
      if (parsed != null) return parsed;
    }
  }

  return null;
}

function weiToEthNumber(value: bigint): number {
  return Number(formatEther(value));
}

function readTransactionValueWei(tx: BlockscoutTransaction): bigint {
  return readWeiAmount(tx.value) ?? 0n;
}

function readTransactionFeeWei(tx: BlockscoutTransaction): bigint {
  for (const key of ["fee", "transaction_fee", "tx_fee", "gas_fee"] as const) {
    const parsed = readWeiAmount(tx[key]);
    if (parsed != null) return parsed;
  }

  const gasUsed = readWeiAmount(tx.gas_used ?? tx.gasUsed);
  const gasPrice = readWeiAmount(tx.gas_price ?? tx.gasPrice);

  if (gasUsed != null && gasPrice != null) {
    return gasUsed * gasPrice;
  }

  return 0n;
}

function sumNativeVolumeWei(items: BlockscoutTransaction[]): bigint {
  return items.reduce(
    (total, tx) => total + readTransactionValueWei(tx),
    0n,
  );
}

function sumFeeWei(items: BlockscoutTransaction[], address: string): bigint {
  return items.reduce((total, tx) => {
    if (!sameAddress(tx.from?.hash, address)) return total;
    return total + readTransactionFeeWei(tx);
  }, 0n);
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
    const guild = await fetchGuildBadges();

    return NextResponse.json({ address, local, dune, guild });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Activity lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchLocalActivity(address: string) {
  const [profile, items] = await Promise.all([
    fetch(`${BLOCKSCOUT_BASE}/addresses/${address}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 },
    }),
    fetchBlockscoutTransactions(address),
  ]);

  const profileJson = profile.ok
    ? ((await profile.json()) as BlockscoutAddress)
    : {};
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
  const contractCount = new Set(
    items
      .map((tx) => tx.to?.hash?.toLowerCase())
      .filter((hash): hash is string => Boolean(hash)),
  ).size;
  const nativeVolumeEth = weiToEthNumber(sumNativeVolumeWei(items));
  const gasFeeEth = weiToEthNumber(sumFeeWei(items, address));
  const activeDays = Math.max(uniqueDays.size, ageDays ? Math.min(ageDays, 1) : 0);
  const score = Math.round(
    txCount * 1.5 + activeDays * 8 + (tokenTransferCount ?? 0) * 0.25,
  );

  return {
    txCount,
    tokenTransferCount,
    contractCount,
    nativeVolumeEth,
    gasFeeEth,
    sampledTxCount: items.length,
    activeDays,
    firstSeen: firstSeen ? new Date(firstSeen).toISOString() : null,
    lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
    score,
  };
}

async function fetchBlockscoutTransactions(
  address: string,
): Promise<BlockscoutTransaction[]> {
  const maxPages = Number(
    process.env.BLOCKSCOUT_ACTIVITY_TX_PAGES ?? DEFAULT_BLOCKSCOUT_TX_PAGES,
  );
  const items: BlockscoutTransaction[] = [];
  let nextParams: BlockscoutTransactionsResponse["next_page_params"] = null;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${BLOCKSCOUT_BASE}/addresses/${address}/transactions`);
    if (nextParams) {
      for (const [key, value] of Object.entries(nextParams)) {
        if (value != null) url.searchParams.set(key, String(value));
      }
    }

    const res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) break;

    const data = (await res.json()) as BlockscoutTransactionsResponse;
    items.push(...(data.items ?? []));
    nextParams = data.next_page_params ?? null;
    if (!nextParams) break;
  }

  return items;
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
  const pagedRow = filteredRow
    ? { row: filteredRow, pagesScanned: 0, rowsScanned: 0, complete: true }
    : await findDuneRowByPaging(queryId, apiKey, target);
  const rows =
    filteredRow || pagedRow.row ? [] : await fetchDuneRows(queryId, apiKey);
  const row =
    filteredRow ??
    pagedRow.row ??
    rows.find((item) =>
      ADDRESS_KEYS.some((key) =>
        sameAddress(item[key], target),
      ),
    ) ?? null;

  const statsRow = row ?? rows[0] ?? {};

  return {
    configured: true,
    queryId,
    rowFound: Boolean(row),
    pagesScanned: pagedRow.pagesScanned,
    rowsScanned: pagedRow.rowsScanned,
    searchComplete: pagedRow.complete,
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
    const filters = [
      `${key} = '${address}'`,
      `${key} = ${address}`,
      `lower(${key}) = '${address}'`,
    ];

    for (const filter of filters) {
      const rows = await fetchDuneRows(queryId, apiKey, {
        limit: 1,
        filters: filter,
      });
      const exact = rows.find((row) =>
        ADDRESS_KEYS.some((addressKey) => sameAddress(row[addressKey], address)),
      );
      if (exact) return exact;
      if (rows.length > 0 && !ADDRESS_KEYS.some((addressKey) => addressKey in rows[0])) {
        return rows[0];
      }
    }
  }
  return null;
}

async function findDuneRowByPaging(
  queryId: string,
  apiKey: string,
  address: string,
): Promise<{
  row: DuneRow | null;
  pagesScanned: number;
  rowsScanned: number;
  complete: boolean;
}> {
  const limit = Number(
    process.env.DUNE_BASE_ACTIVITY_PAGE_SIZE ?? DEFAULT_DUNE_PAGE_SIZE,
  );
  const maxPages = Number(
    process.env.DUNE_BASE_ACTIVITY_MAX_PAGES ?? DEFAULT_DUNE_MAX_PAGES,
  );
  let rowsScanned = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const rows = await fetchDuneRows(queryId, apiKey, {
      limit,
      offset: page * limit,
    });
    rowsScanned += rows.length;

    const row = rows.find((item) =>
      ADDRESS_KEYS.some((key) => sameAddress(item[key], address)),
    );
    if (row) {
      return {
        row,
        pagesScanned: page + 1,
        rowsScanned,
        complete: true,
      };
    }

    if (rows.length < limit) {
      return {
        row: null,
        pagesScanned: page + 1,
        rowsScanned,
        complete: true,
      };
    }
  }

  return {
    row: null,
    pagesScanned: maxPages,
    rowsScanned,
    complete: false,
  };
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

function getBaseGuildBadgeGroup(name: string): string | null {
  return BASE_GUILD_BADGE_GROUPS.get(name.toLowerCase()) ?? null;
}

async function fetchGuildBadges() {
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
      const group = getBaseGuildBadgeGroup(name);
      if (!group) return null;
      return {
        id: reward.id ?? reward.data?.roleId ?? name,
        name,
        type: reward.type ?? "GUILD",
        imageUrl: reward.ui?.imageUrl ?? reward.ui?.imgUrl ?? null,
        reason: `${group} badge`,
      };
    })
    .filter((badge): badge is NonNullable<typeof badge> => badge != null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    configured: true,
    url: GUILD_BASE_URL,
    memberCount: guild.memberCount ?? null,
    badges,
  };
}
