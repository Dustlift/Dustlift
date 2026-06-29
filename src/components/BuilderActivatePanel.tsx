"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";
import { formatEther, isAddress, toHex } from "viem";
import { BASE_CHAIN_ID } from "@/lib/constants";
import { truncateAddress } from "@/lib/format";

const x402Data = toHex("x402:dustlift:agent-payment:v1");
const DEFAULT_X402_PAYMENT_WEI = 1_000_000_000_000n; // 0.000001 ETH

function getPaymentRecipient(): `0x${string}` | null {
  const value =
    process.env.NEXT_PUBLIC_X402_PAYMENT_RECIPIENT ??
    process.env.NEXT_PUBLIC_BUILDER_ACTIVATION_RECIPIENT ??
    process.env.NEXT_PUBLIC_FEE_RECIPIENT ??
    "";

  return isAddress(value) ? (value.toLowerCase() as `0x${string}`) : null;
}

function getPaymentValue(): bigint {
  const value = process.env.NEXT_PUBLIC_X402_PAYMENT_WEI ?? "";

  try {
    return value ? BigInt(value) : DEFAULT_X402_PAYMENT_WEI;
  } catch {
    return DEFAULT_X402_PAYMENT_WEI;
  }
}

export function BuilderActivatePanel() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();

  const recipient = useMemo(() => getPaymentRecipient(), []);
  const paymentValue = useMemo(() => getPaymentValue(), []);
  const builderCode = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE;

  const [status, setStatus] = useState<
    "idle" | "switching" | "sending" | "unlocking" | "done" | "error"
  >("idle");
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resourceReady, setResourceReady] = useState(false);

  async function payForAgentResource() {
    setError(null);
    setResourceReady(false);

    if (!recipient) {
      setStatus("error");
      setError("x402 payment recipient is not configured.");
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
        data: x402Data,
        value: paymentValue,
      });
      setHash(txHash);
      await publicClient?.waitForTransactionReceipt({ hash: txHash });

      setStatus("unlocking");
      if (address) {
        await fetch(`/api/activity?address=${address}`);
      }
      setResourceReady(true);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "x402 payment failed");
    }
  }

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-[#3d4a3f]/60 bg-[#1a211c]/80 p-8 text-center">
        <p className="text-lg text-[#c5cdc6]">
          Connect your wallet to run the x402 payment flow.
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/90 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#6b8f71]">
            x402 payment flow
          </p>
          <h2 className="font-serif text-2xl italic text-[#e8e4dc]">
            Agent calls, pays, receives
          </h2>
          <div className="mt-3 max-w-xl space-y-2 text-sm text-[#a8b0a4]">
            <p>x402 is not a token. It is an AI + API + onchain payment pattern.</p>
            <p>The swap agent prepares intent. This payment unlocks the data/API side.</p>
            <p>No subscription. No user API key. Direct payment flow.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={payForAgentResource}
          disabled={
            status === "switching" ||
            status === "sending" ||
            status === "unlocking"
          }
          className="rounded-xl bg-[#e8e4dc] px-5 py-3 text-sm font-semibold text-[#0f1410] transition hover:bg-white disabled:opacity-50"
        >
          {status === "switching" && "Switching..."}
          {status === "sending" && "Paying..."}
          {status === "unlocking" && "Unlocking..."}
          {status !== "switching" &&
            status !== "sending" &&
            status !== "unlocking" &&
            (chainId === BASE_CHAIN_ID ? "Pay & Unlock" : "Switch to Base")}
        </button>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <StatusItem label="Wallet" value={truncateAddress(address ?? "")} />
        <StatusItem
          label="Payment"
          value={`${formatEther(paymentValue)} ETH`}
        />
        <StatusItem
          label="Recipient"
          value={recipient ? truncateAddress(recipient) : "Missing"}
        />
        <StatusItem
          label="Builder code"
          value={builderCode ? "Ready" : "Pending"}
        />
      </div>

      <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-4">
        <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">
          Resource
        </p>
        <p className="mt-1 text-[#e8e4dc]">Agent-ready Base data package</p>
        <p className="mt-2 text-sm text-[#8a9a8c]">
          The same pattern can gate quote enrichment, wallet scoring, Guild
          checks, or any agent-readable API response behind a Base payment.
        </p>
      </div>

      {hash && (
        <a
          href={`https://basescan.org/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[#6b8f71] hover:underline"
        >
          View x402 payment transaction
        </a>
      )}

      {resourceReady && (
        <p className="text-sm text-[#6b8f71]">
          Payment confirmed. Activity and Guild data are unlocked below.
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
