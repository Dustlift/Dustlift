import Link from "next/link";
import { truncateAddress } from "@/lib/format";

type TokenPageProps = {
  params: Promise<{
    address: string;
  }>;
};

export default async function TokenPage({ params }: TokenPageProps) {
  const { address } = await params;
  const symbol = address.slice(2, 6).toUpperCase() || "B20";

  return (
    <main className="flex flex-1 flex-col px-6 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#6b8f71]">
              DustLift B20 token
            </p>
            <h1 className="mt-2 font-serif text-4xl italic text-[#e8e4dc]">
              ${symbol}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#a8b0a4]">
              This token page is ready for DustLift launches. When the B20 factory
              is connected, live metadata, creator info, and pool data can load here.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-[#3d4a3f] bg-[#141a16] px-5 py-3 text-sm font-semibold text-[#c5cdc6] transition hover:bg-[#1a211c]"
          >
            Back to DustLift
          </Link>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/90 p-5">
            <div className="flex items-start gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-[#3d4a3f] bg-[#203124] font-serif text-2xl italic text-[#e8e4dc]">
                {symbol.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="text-xl font-semibold text-[#e8e4dc]">
                  B20 Token
                </p>
                <p className="text-sm text-[#6b8f71]">{truncateAddress(address)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Network" value="Base" />
              <Info label="Status" value="DustLift page ready" />
              <Info label="Pool" value="Pending live data" />
              <Info label="Standard" value="B20" />
            </div>
          </div>

          <div id="trade" className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-[#6b7a6d]">
              Trade / pool
            </p>
            <h2 className="mt-1 font-serif text-2xl italic text-[#e8e4dc]">
              Pool view is prepared
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#a8b0a4]">
              DustLift can show the token here as soon as the live launch contract
              and pool data source are connected. Until then, this page avoids
              showing fake trading numbers.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={`https://basescan.org/token/${address}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-[#e8e4dc] px-5 py-3 text-sm font-semibold text-[#0f1410] transition hover:bg-white"
              >
                Open BaseScan
              </a>
              <Link
                href="/#launch"
                className="inline-flex items-center justify-center rounded-xl border border-[#3d4a3f] bg-[#141a16] px-5 py-3 text-sm font-semibold text-[#c5cdc6] transition hover:bg-[#1a211c]"
              >
                Launch another token
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">{label}</p>
      <p className="mt-1 text-[#c5cdc6]">{value}</p>
    </div>
  );
}
