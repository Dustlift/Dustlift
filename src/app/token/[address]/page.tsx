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
              DustLift B20 launch page
            </p>
            <h1 className="mt-2 font-serif text-4xl italic text-[#e8e4dc]">
              B20 page prepared
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#a8b0a4]">
              This route is ready for real B20 tokens after the update. It does
              not claim that a token exists before the live B20 factory returns a
              real token address.
            </p>
          </div>
          <Link
            href="/#launch"
            className="inline-flex items-center justify-center rounded-xl border border-[#3d4a3f] bg-[#141a16] px-5 py-3 text-sm font-semibold text-[#c5cdc6] transition hover:bg-[#1a211c]"
          >
            Back to B20 Launch
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
                  Awaiting live B20 address
                </p>
                <p className="text-sm text-[#6b8f71]">{truncateAddress(address)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Network" value="Base" />
              <Info label="Status" value="Prepared for update" />
              <Info label="Pool" value="Opens after real launch" />
              <Info label="Standard" value="B20" />
            </div>
          </div>

          <div id="trade" className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-[#6b7a6d]">
              After the update
            </p>
            <h2 className="mt-1 font-serif text-2xl italic text-[#e8e4dc]">
              Real token data will appear here
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#a8b0a4]">
              Once B20 creation is connected, DustLift will use the real contract
              address, BaseScan link, pool status, and trade view. Until then,
              the launch flow stays in preparation mode.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/#launch"
                className="inline-flex items-center justify-center rounded-xl bg-[#e8e4dc] px-5 py-3 text-sm font-semibold text-[#0f1410] transition hover:bg-white"
              >
                Prepare B20 token
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
