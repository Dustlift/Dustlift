"use client";

import { useState } from "react";
import { DustScanner } from "@/components/DustScanner";
import { BuilderActivatePanel } from "@/components/BuilderActivatePanel";
import { B20LaunchWizard } from "@/components/B20LaunchWizard";
import { SwapPanel } from "@/components/SwapPanel";
import { WalletStatus } from "@/components/WalletStatus";

type Tab = "dust" | "swap" | "launch" | "builder";

export function AppShell() {
  const [tab, setTab] = useState<Tab>("launch");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[#8a9a8c]">
            Base-native B20 launchpad
          </p>
          <h1 className="font-serif text-4xl italic text-[#e8e4dc]">
            DustLift
          </h1>
          <p className="mt-2 max-w-xl text-[#a8b0a4]">
            Create, customize, and launch B20 tokens on Base in minutes.
            DustLift makes new asset creation accessible without complex
            deployment infrastructure.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[#c5cdc6]">
            <span className="rounded-full border border-[#3d4a3f] bg-[#141a16] px-3 py-1">
              Create B20 tokens
            </span>
            <span className="rounded-full border border-[#3d4a3f] bg-[#141a16] px-3 py-1">
              Add logo and socials
            </span>
            <span className="rounded-full border border-[#3d4a3f] bg-[#141a16] px-3 py-1">
              Launch on Base
            </span>
          </div>
        </div>
        <WalletStatus />
      </header>

      <nav className="flex flex-wrap gap-2 rounded-xl border border-[#3d4a3f]/60 bg-[#141a16]/80 p-1">
        {(
          [
            ["launch", "B20 Launch"],
            ["dust", "Dust -> ETH"],
            ["swap", "Agent Swap"],
            ["builder", "x402"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-w-32 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? "bg-[#6b8f71] text-[#0f1410]"
                : "text-[#a8b0a4] hover:text-[#e8e4dc]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "dust" && <DustScanner />}
      {tab === "swap" && <SwapPanel />}
      {tab === "launch" && <B20LaunchWizard />}
      {tab === "builder" && <BuilderActivatePanel />}
    </div>
  );
}
