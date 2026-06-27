import { AppShell } from "@/components/AppShell";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col px-6 py-12 sm:px-10 sm:py-16">
      <AppShell />
      <footer className="mx-auto mt-16 w-full max-w-3xl border-t border-[#2a332c] pt-6 text-center text-xs text-[#6b7a6d]">
        Non-custodial · Base mainnet · Swaps via 0x · Token data via Blockscout
        &amp; DefiLlama
      </footer>
    </main>
  );
}
