"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";
import { isAddress, toHex } from "viem";
import { BASE_CHAIN_ID } from "@/lib/constants";
import { truncateAddress } from "@/lib/format";

const activationData = toHex("x402:dustlift:builder-activate:v1");

function getActivationRecipient(): `0x${string}` | null {
  const value =
    process.env.NEXT_PUBLIC_BUILDER_ACTIVATION_RECIPIENT ??
    process.env.NEXT_PUBLIC_FEE_RECIPIENT ??
    "";

  return isAddress(value) ? (value.toLowerCase() as `0x${string}`) : null;
}

export function BuilderActivatePanel() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();

  const recipient = useMemo(() => getActivationRecipient(), []);
  const builderCode = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE;

  const [status, setStatus] = useState<
    "idle" | "switching" | "sending" | "done" | "error"
  >("idle");
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function activateBuilder() {
    setError(null);

    if (!recipient) {
      setStatus("error");
      setError("Activation recipient is not configured.");
      return;
    }

    if (chainId !== BASE_CHAIN_ID) {
      setStatus("switching");
      await switchChainAsync({ chainId: BASE_CHAIN_ID });
      setStatus("idle");
      return;
    }

    setStatus("sending");
    try {
      const txHash = await sendTransactionAsync({
        to: recipient,
        data: activationData,
        value: 0n,
      });
      setHash(txHash);
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Activation failed");
    }
  }

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-[#3d4a3f]/60 bg-[#1a211c]/80 p-8 text-center">
        <p className="text-lg text-[#c5cdc6]">
          Connect your wallet to activate builder activity.
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/90 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#6b8f71]">
            Base x402
          </p>
          <h2 className="font-serif text-2xl italic text-[#e8e4dc]">
            Builder Activate
          </h2>
          <p className="mt-2 max-w-xl text-sm text-[#a8b0a4]">
            Sends a 0 ETH Base transaction with DustLift activation data. You
            only pay network gas.
          </p>
        </div>
        <button
          type="button"
          onClick={activateBuilder}
          disabled={status === "switching" || status === "sending"}
          className="rounded-xl bg-[#e8e4dc] px-5 py-3 text-sm font-semibold text-[#0f1410] transition hover:bg-white disabled:opacity-50"
        >
          {status === "switching" && "Switching..."}
          {status === "sending" && "Sending..."}
          {status !== "switching" &&
            status !== "sending" &&
            (chainId === BASE_CHAIN_ID ? "Activate Builder" : "Switch to Base")}
        </button>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <StatusItem label="Wallet" value={truncateAddress(address ?? "")} />
        <StatusItem
          label="Recipient"
          value={recipient ? truncateAddress(recipient) : "Missing"}
        />
        <StatusItem
          label="Builder code"
          value={builderCode ? "Ready" : "Pending"}
        />
      </div>

      {hash && (
        <a
          href={`https://basescan.org/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[#6b8f71] hover:underline"
        >
          View activation transaction
        </a>
      )}

      {status === "done" && (
        <p className="text-sm text-[#6b8f71]">
          Builder activation transaction confirmed.
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </section>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">{label}</p>
      <p className="mt-1 text-[#c5cdc6]">{value}</p>
    </div>
  );
}
