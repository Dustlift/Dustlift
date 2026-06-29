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
const AGENT_IDENTITY_INIT_CODE = "0x6001600c60003960016000f300" as const;

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

function buildAgentIdentityData(metadata: Record<string, unknown>): `0x${string}` {
  const encodedMetadata = toHex(JSON.stringify(metadata));
  return `${AGENT_IDENTITY_INIT_CODE}${encodedMetadata.slice(2)}`;
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
  const [deployStatus, setDeployStatus] = useState<
    "idle" | "switching" | "deploying" | "done" | "error"
  >("idle");
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [deployHash, setDeployHash] = useState<`0x${string}` | null>(null);
  const [deployedAddress, setDeployedAddress] = useState<`0x${string}` | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [resourceReady, setResourceReady] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentEndpoints, setAgentEndpoints] = useState("");
  const [agentLogoUrl, setAgentLogoUrl] = useState("");
  const [agentSupportsX402, setAgentSupportsX402] = useState(true);

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

  async function deployAgentIdentity() {
    setDeployError(null);
    setDeployedAddress(null);

    const name = agentName.trim();
    if (!name) {
      setDeployStatus("error");
      setDeployError("Agent name is required.");
      return;
    }

    if (chainId !== BASE_CHAIN_ID) {
      setDeployStatus("switching");
      await switchChainAsync({ chainId: BASE_CHAIN_ID });
      setDeployStatus("idle");
      return;
    }

    setDeployStatus("deploying");
    try {
      const endpoints = agentEndpoints
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 5);
      const deployData = buildAgentIdentityData({
        standard: "erc-8004-style",
        createdVia: "DustLift",
        name,
        description: agentDescription.trim(),
        endpoints,
        logo: agentLogoUrl.trim(),
        supportsX402: agentSupportsX402,
        createdAt: new Date().toISOString(),
      });
      const txHash = await sendTransactionAsync({
        data: deployData,
        value: 0n,
      });
      setDeployHash(txHash);
      const receipt = await publicClient?.waitForTransactionReceipt({
        hash: txHash,
      });
      setDeployedAddress(receipt?.contractAddress ?? null);
      setDeployStatus("done");
    } catch (err) {
      setDeployStatus("error");
      setDeployError(
        err instanceof Error ? err.message : "Agent identity deploy failed",
      );
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

      <div className="grid gap-4 rounded-2xl border border-[#2a332c] bg-[#101611] p-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full border border-[#2dbf72]/50 bg-[#123321] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#79e0a2]">
              ERC-8004 style on Base
            </span>
            <h3 className="mt-4 font-serif text-2xl italic text-[#e8e4dc]">
              Deploy Your Agent Identity
            </h3>
            <p className="mt-2 text-sm text-[#8a9a8c]">
              Create a small Base identity marker for any agent or service you
              want to publish. You control the metadata.
            </p>
          </div>

          <div className="rounded-xl border border-[#3d4a3f]/60 bg-[#141a16] p-4">
            <p className="text-sm font-semibold text-[#e8e4dc]">
              {agentName.trim() || "Agent Name"}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-[#8a9a8c]">
              {agentDescription.trim() || "Your agent description will appear here."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#8a9a8c]">
              <StatusPill label="Network" value="Base" />
              <StatusPill
                label="x402"
                value={agentSupportsX402 ? "Supported" : "Off"}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-[#6b7a6d]">
            Agent name
          </label>
          <input
            value={agentName}
            onChange={(event) => setAgentName(event.target.value)}
            maxLength={80}
            className="rounded-xl border border-[#3d4a3f] bg-[#141a16] px-4 py-3 text-sm text-[#e8e4dc] outline-none placeholder:text-[#6b7a6d]"
            placeholder="BaseHub Research Agent"
          />

          <label className="text-xs font-semibold uppercase tracking-wide text-[#6b7a6d]">
            Description
          </label>
          <textarea
            value={agentDescription}
            onChange={(event) => setAgentDescription(event.target.value)}
            maxLength={240}
            rows={3}
            className="resize-none rounded-xl border border-[#3d4a3f] bg-[#141a16] px-4 py-3 text-sm text-[#e8e4dc] outline-none placeholder:text-[#6b7a6d]"
            placeholder="What does this agent do?"
          />

          <label className="text-xs font-semibold uppercase tracking-wide text-[#6b7a6d]">
            Service endpoints
          </label>
          <textarea
            value={agentEndpoints}
            onChange={(event) => setAgentEndpoints(event.target.value)}
            rows={3}
            className="resize-none rounded-xl border border-[#3d4a3f] bg-[#141a16] px-4 py-3 text-sm text-[#e8e4dc] outline-none placeholder:text-[#6b7a6d]"
            placeholder="https://agent.example.com&#10;https://agent.example.com/.well-known/agent-card.json"
          />

          <label className="text-xs font-semibold uppercase tracking-wide text-[#6b7a6d]">
            Agent logo URL
          </label>
          <input
            value={agentLogoUrl}
            onChange={(event) => setAgentLogoUrl(event.target.value)}
            className="rounded-xl border border-[#3d4a3f] bg-[#141a16] px-4 py-3 text-sm text-[#e8e4dc] outline-none placeholder:text-[#6b7a6d]"
            placeholder="https://example.com/logo.png"
          />

          <label className="flex items-center gap-2 text-sm text-[#c5cdc6]">
            <input
              type="checkbox"
              checked={agentSupportsX402}
              onChange={(event) => setAgentSupportsX402(event.target.checked)}
              className="size-4 accent-[#6b8f71]"
            />
            Supports x402 payments
          </label>

          <button
            type="button"
            onClick={deployAgentIdentity}
            disabled={
              deployStatus === "switching" || deployStatus === "deploying"
            }
            className="rounded-xl border border-[#6b8f71]/50 bg-[#122017] px-5 py-3 text-sm font-semibold text-[#c5cdc6] transition hover:bg-[#1a211c] disabled:opacity-50"
          >
            {deployStatus === "switching" && "Switching..."}
            {deployStatus === "deploying" && "Deploying identity..."}
            {deployStatus !== "switching" &&
              deployStatus !== "deploying" &&
              (chainId === BASE_CHAIN_ID
                ? "Stage 1: Deploy Agent Identity"
                : "Switch to Base")}
          </button>
        </div>
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

      {deployHash && (
        <a
          href={`https://basescan.org/tx/${deployHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[#6b8f71] hover:underline"
        >
          View contract deploy transaction
        </a>
      )}

      {resourceReady && (
        <p className="text-sm text-[#6b8f71]">
          Payment confirmed. Activity and Guild data are unlocked below.
        </p>
      )}

      {deployedAddress && (
        <p className="text-sm text-[#6b8f71]">
          Agent identity deployed: {truncateAddress(deployedAddress)}
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {deployError && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {deployError}
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

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#2a332c] bg-[#101611] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#6b7a6d]">
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold text-[#c5cdc6]">{value}</p>
    </div>
  );
}
