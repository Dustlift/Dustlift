"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { DustScanner } from "@/components/DustScanner";
import { ApprovalPanel } from "@/components/ApprovalPanel";
import { BuilderActivatePanel } from "@/components/BuilderActivatePanel";

type Tab = "dust" | "builder" | "approvals";

export function AppShell() {
  const [tab, setTab] = useState<Tab>("dust");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[#8a9a8c]">
            Base Network - Base App ready
          </p>
          <h1 className="font-serif text-4xl italic text-[#e8e4dc]">
            DustLift
          </h1>
          <p className="mt-2 max-w-md text-[#a8b0a4]">
            Scan dust &amp; scam leftovers, batch-convert to ETH, revoke stale
            approvals.
          </p>
        </div>
        <ConnectButton />
      </header>

      <nav className="flex gap-2 rounded-xl border border-[#3d4a3f]/60 bg-[#141a16]/80 p-1">
        {(
          [
            ["dust", "Dust -> ETH"],
            ["builder", "Builder"],
            ["approvals", "Approvals"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
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
      {tab === "builder" && <BuilderActivatePanel />}
      {tab === "approvals" && <ApprovalPanel />}
    </div>
  );
}


