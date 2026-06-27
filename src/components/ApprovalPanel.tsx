"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { erc20Abi } from "viem";
import { REVOKE_CASH_BASE } from "@/lib/constants";
import { formatTokenAmount, truncateAddress } from "@/lib/format";

type SerializedApproval = {
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  tokenName: string;
  spenderAddress: `0x${string}`;
  spenderName?: string;
  value: string;
  unlimited: boolean;
};

export function ApprovalPanel() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [approvals, setApprovals] = useState<SerializedApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadApprovals = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/approvals?address=${address}`);
      const data = (await res.json()) as {
        approvals?: SerializedApproval[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load approvals");
      setApprovals(data.approvals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!isConnected) return;
    const timeout = window.setTimeout(() => {
      void loadApprovals();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isConnected, loadApprovals]);

  async function revokeApproval(approval: SerializedApproval) {
    if (!address || !publicClient) return;

    const key = `${approval.tokenAddress}-${approval.spenderAddress}`;
    setRevoking(key);
    setError(null);

    try {
      const hash = await writeContractAsync({
        address: approval.tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [approval.spenderAddress, 0n],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setApprovals((prev) =>
        prev.filter(
          (a) =>
            !(
              a.tokenAddress === approval.tokenAddress &&
              a.spenderAddress === approval.spenderAddress
            ),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setRevoking(null);
    }
  }

  if (!isConnected) {
    return (
      <p className="rounded-2xl border border-[#3d4a3f]/60 bg-[#1a211c]/80 p-8 text-center text-[#a8b0a4]">
        Connect your wallet to scan token approvals.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl italic text-[#d4cfc4]">
            Token approvals
          </h2>
          <p className="text-sm text-[#8a9a8c]">
            Revoke stale spend permissions — same idea as Revoke.cash, built in.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadApprovals}
            disabled={loading}
            className="rounded-xl border border-[#3d4a3f] px-4 py-2 text-sm text-[#c5cdc6] hover:bg-[#1a211c]"
          >
            {loading ? "Scanning…" : "Rescan"}
          </button>
          {address && (
            <a
              href={`${REVOKE_CASH_BASE}/${address}?chainId=8453`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-[#3d4a3f] px-4 py-2 text-sm text-[#6b8f71] hover:bg-[#1a211c]"
            >
              Open Revoke.cash ↗
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-red-300">
          {error}
        </div>
      )}

      {approvals.length === 0 && !loading ? (
        <p className="text-center text-[#8a9a8c]">
          No active token approvals found.
        </p>
      ) : (
        <ul className="divide-y divide-[#2a332c] overflow-hidden rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/90">
          {approvals.map((approval) => {
            const key = `${approval.tokenAddress}-${approval.spenderAddress}`;
            return (
              <li
                key={key}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[#e8e4dc]">
                    {approval.tokenSymbol}
                  </p>
                  <p className="text-xs text-[#6b7a6d]">
                    Spender:{" "}
                    {approval.spenderName ??
                      truncateAddress(approval.spenderAddress)}
                  </p>
                  <p className="text-xs text-[#6b7a6d]">
                    Allowance:{" "}
                    {approval.unlimited
                      ? "Unlimited"
                      : formatTokenAmount(
                          BigInt(approval.value),
                          18,
                        )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revokeApproval(approval)}
                  disabled={revoking === key}
                  className="rounded-lg border border-red-900/40 px-4 py-2 text-sm text-red-300 hover:bg-red-950/20 disabled:opacity-50"
                >
                  {revoking === key ? "Revoking…" : "Revoke"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
