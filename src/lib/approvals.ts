import { BLOCKSCOUT_BASE } from "./constants";

export type TokenApproval = {
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  tokenName: string;
  spenderAddress: `0x${string}`;
  spenderName?: string;
  value: bigint;
  unlimited: boolean;
};

type BlockscoutApprovalItem = {
  token?: {
    address_hash?: string;
    symbol?: string | null;
    name?: string | null;
    decimals?: string | null;
  };
  spender?: {
    address_hash?: string;
    name?: string | null;
    is_contract?: boolean;
  };
  value?: string | null;
};

export async function fetchWalletApprovals(
  walletAddress: string,
): Promise<TokenApproval[]> {
  const url = `${BLOCKSCOUT_BASE}/addresses/${walletAddress}/token-approvals`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`Blockscout approvals error: ${res.status}`);
  }

  const data = (await res.json()) as { items?: BlockscoutApprovalItem[] };
  const items = data.items ?? [];

  return items
    .filter(
      (item) =>
        item.token?.address_hash &&
        item.spender?.address_hash &&
        item.value &&
        BigInt(item.value) > 0n,
    )
    .map((item) => {
      const value = BigInt(item.value!);
      const maxUint = 2n ** 256n - 1n;
      const unlimited = value > maxUint / 2n;

      return {
        tokenAddress: item.token!.address_hash!.toLowerCase() as `0x${string}`,
        tokenSymbol: item.token?.symbol?.trim() || "???",
        tokenName: item.token?.name?.trim() || "Unknown",
        spenderAddress: item.spender!.address_hash!.toLowerCase() as `0x${string}`,
        spenderName: item.spender?.name ?? undefined,
        value,
        unlimited,
      };
    });
}
