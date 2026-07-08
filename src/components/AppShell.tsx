"use client";

import { useState } from "react";
import { DustScanner } from "@/components/DustScanner";
import { ActivityPanel } from "@/components/ActivityPanel";
import { BuilderActivatePanel } from "@/components/BuilderActivatePanel";
import { B20LaunchWizard } from "@/components/B20LaunchWizard";
import { SwapPanel } from "@/components/SwapPanel";
import { WalletStatus } from "@/components/WalletStatus";

type Tab = "dust" | "swap" | "launch" | "builder";

export function AppShell() {
  const [tab, setTab] = useState<Tab>("dust");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[#8a9a8c]">
            Base Network - Base App ready
          </p>
          <h1 className="font-serif text-4xl italic text-[#e8e4dc]">
            DustLift
          </h1>
          <p className="mt-2 max-w-md text-[#a8b0a4]">
            Scan dust, let an agent prepare Base swaps, unlock activity data,
            and launch B20 community tokens from the same Base home.
          </p>
        </div>
        <WalletStatus />
      </header>

      <nav className="flex flex-wrap gap-2 rounded-xl border border-[#3d4a3f]/60 bg-[#141a16]/80 p-1">
        {(
          [
            ["dust", "Dust -> ETH"],
            ["swap", "Agent Swap"],
            ["launch", "B20 Launch"],
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
      <ActivityPanel />
    </div>
  );
}
