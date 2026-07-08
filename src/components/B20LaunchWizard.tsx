"use client";

import { useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/constants";
import { truncateAddress } from "@/lib/format";

type LaunchStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type LaunchStatus = "idle" | "checking" | "creating" | "listed" | "error";

type TokenForm = {
  name: string;
  symbol: string;
  supply: string;
  description: string;
  logoUrl: string;
  website: string;
  x: string;
  telegram: string;
  visibleInPool: boolean;
  communityListed: boolean;
};

type ListedToken = {
  address: string;
  name: string;
  symbol: string;
  supply: string;
  description: string;
  logoUrl: string;
  creator: string;
  createdMinutesAgo: number;
  poolType: "DustLift pool" | "Bonding curve";
};

const steps = [
  "Start",
  "Details",
  "Logo & links",
  "Preview",
  "Wallet",
  "Create",
  "Live",
] as const;

const sampleTokens: ListedToken[] = [
  {
    address: "0x8b20a3f1c9d44f6b92d5c0a5e6f4187b20a00001",
    name: "Base Morning",
    symbol: "MORN",
    supply: "1,000,000,000",
    description: "A community token for early Base builders.",
    logoUrl: "",
    creator: "0x6f21...91ac",
    createdMinutesAgo: 4,
    poolType: "Bonding curve",
  },
  {
    address: "0x8b20a3f1c9d44f6b92d5c0a5e6f4187b20a00002",
    name: "Dust Club",
    symbol: "DUSTC",
    supply: "500,000,000",
    description: "Made for DustLift users turning small balances into momentum.",
    logoUrl: "",
    creator: "0x2c44...7d20",
    createdMinutesAgo: 11,
    poolType: "DustLift pool",
  },
  {
    address: "0x8b20a3f1c9d44f6b92d5c0a5e6f4187b20a00003",
    name: "Builder Spark",
    symbol: "SPRK",
    supply: "100,000,000",
    description: "A simple launch for a Base builder community.",
    logoUrl: "",
    creator: "0x91bd...038a",
    createdMinutesAgo: 18,
    poolType: "Bonding curve",
  },
];

const initialForm: TokenForm = {
  name: "",
  symbol: "",
  supply: "1000000000",
  description: "",
  logoUrl: "",
  website: "",
  x: "",
  telegram: "",
  visibleInPool: true,
  communityListed: true,
};

function normalizeSymbol(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
}

function formatSupply(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

function shortAddress(address?: string) {
  if (!address) return "Not connected";
  return truncateAddress(address);
}

function makeLocalAddress(symbol: string) {
  const seed = Array.from(symbol || "B20")
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .padEnd(40, "0")
    .slice(0, 40);
  return `0x${seed}`;
}

function getLogoInitial(symbol: string, name: string) {
  return (symbol || name || "B").slice(0, 1).toUpperCase();
}

export function B20LaunchWizard() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: balance } = useBalance({
    address,
    chainId: BASE_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const [step, setStep] = useState<LaunchStep>(0);
  const [form, setForm] = useState<TokenForm>(initialForm);
  const [status, setStatus] = useState<LaunchStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<ListedToken | null>(null);

  const tokenName = form.name.trim();
  const tokenSymbol = normalizeSymbol(form.symbol);
  const tokenSupply = formatSupply(form.supply);
  const canContinueDetails = Boolean(tokenName && tokenSymbol && tokenSupply);
  const isBase = chainId === BASE_CHAIN_ID;
  const ethValue = balance ? Number(formatUnits(balance.value, balance.decimals)) : 0;
  const hasEthForNetwork = Boolean(balance && balance.value > 0n);

  const liveTokens = useMemo(() => {
    return createdToken ? [createdToken, ...sampleTokens] : sampleTokens;
  }, [createdToken]);

  function updateForm<K extends keyof TokenForm>(key: K, value: TokenForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function goNext() {
    setMessage(null);
    setStep((current) => Math.min(current + 1, 6) as LaunchStep);
  }

  function goBack() {
    setMessage(null);
    setStep((current) => Math.max(current - 1, 0) as LaunchStep);
  }

  async function handleSwitchBase() {
    setMessage(null);
    try {
      await switchChainAsync({ chainId: BASE_CHAIN_ID });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Base ağına geçiş tamamlanamadı. Cüzdanını kontrol et.",
      );
    }
  }

  async function createToken() {
    setMessage(null);
    setStatus("checking");

    if (!isConnected) {
      setStatus("error");
      setMessage("Tokenını oluşturmak için önce cüzdanını bağla.");
      setStep(4);
      return;
    }

    if (!isBase) {
      setStatus("idle");
      await handleSwitchBase();
      return;
    }

    if (!hasEthForNetwork) {
      setStatus("error");
      setMessage(
        "Cüzdanında Base işlemini onaylamak için yeterli ETH görünmüyor. Biraz ETH ekledikten sonra tekrar dene.",
      );
      setStep(4);
      return;
    }

    setStatus("creating");

    await new Promise((resolve) => window.setTimeout(resolve, 650));

    const nextToken: ListedToken = {
      address: makeLocalAddress(tokenSymbol),
      name: tokenName,
      symbol: tokenSymbol,
      supply: tokenSupply,
      description: form.description.trim() || "Community token launched on DustLift.",
      logoUrl: form.logoUrl.trim(),
      creator: shortAddress(address),
      createdMinutesAgo: 0,
      poolType: "Bonding curve",
    };

    setCreatedToken(nextToken);
    setStatus("listed");
    setStep(6);
  }

  const shareText = createdToken
    ? `I launched my B20 token on DustLift!\n\nToken: $${createdToken.symbol}\nLive on Base.\n\nView: https://dustlift.vercel.app/token/${createdToken.address}`
    : "";

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/90 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#6b8f71]">
            B20 Launch Wizard
          </p>
          <h2 className="font-serif text-3xl italic text-[#e8e4dc]">
            Create, list, and share a B20 token in minutes.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a8b0a4]">
            No technical setup. DustLift keeps the flow simple, checks the wallet,
            prepares the token page, and makes the token visible in the launch pool.
          </p>
        </div>
        <div className="rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3 text-sm text-[#c5cdc6]">
          <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">Network cost</p>
          <p className="mt-1">Your wallet only shows the Base network fee.</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-7">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index as LaunchStep)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              step === index
                ? "border-[#6b8f71] bg-[#6b8f71] text-[#0f1410]"
                : index < step
                  ? "border-[#6b8f71]/60 bg-[#122017] text-[#c5cdc6]"
                  : "border-[#2a332c] bg-[#101611] text-[#8a9a8c]"
            }`}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5">
            <p className="text-sm font-semibold text-[#6b8f71]">
              B20 tokenını dakikalar içinde oluştur, DustLift’te listele ve topluluğunu başlat.
            </p>
            <h3 className="mt-4 font-serif text-4xl italic text-[#e8e4dc]">
              Your token launch, guided from start to share.
            </h3>
            <p className="mt-3 text-sm leading-6 text-[#a8b0a4]">
              Enter the basics, review the card, connect a Base wallet, and publish
              the token into DustLift’s live launch area.
            </p>
            <button
              type="button"
              onClick={goNext}
              className="mt-6 rounded-xl bg-[#e8e4dc] px-5 py-3 text-sm font-semibold text-[#0f1410] transition hover:bg-white"
            >
              Start creating token
            </button>
          </div>
          <LiveTokenList tokens={liveTokens} compact />
        </div>
      )}

      {step === 1 && (
        <StepPanel title="Token details" kicker="Keep it simple">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Token name">
              <input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value.slice(0, 64))}
                className="input-surface"
                placeholder="Dust Friends"
              />
            </Field>
            <Field label="Symbol">
              <input
                value={tokenSymbol}
                onChange={(event) => updateForm("symbol", normalizeSymbol(event.target.value))}
                className="input-surface"
                placeholder="DUST"
              />
            </Field>
            <Field label="Total supply">
              <input
                value={form.supply}
                onChange={(event) => updateForm("supply", event.target.value.replace(/[^0-9]/g, "").slice(0, 18))}
                className="input-surface"
                inputMode="numeric"
                placeholder="1000000000"
              />
            </Field>
            <div className="rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3 text-sm text-[#8a9a8c]">
              <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">Decimals</p>
              <p className="mt-1 text-[#c5cdc6]">Set automatically: 18</p>
            </div>
          </div>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value.slice(0, 220))}
              className="input-surface min-h-28 resize-none"
              placeholder="What is this token for?"
            />
          </Field>
          <WizardActions onBack={goBack} onNext={goNext} nextDisabled={!canContinueDetails} />
        </StepPanel>
      )}

      {step === 2 && (
        <StepPanel title="Logo and socials" kicker="Optional">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Logo URL">
              <input
                value={form.logoUrl}
                onChange={(event) => updateForm("logoUrl", event.target.value)}
                className="input-surface"
                placeholder="https://..."
              />
            </Field>
            <Field label="Website">
              <input
                value={form.website}
                onChange={(event) => updateForm("website", event.target.value)}
                className="input-surface"
                placeholder="https://..."
              />
            </Field>
            <Field label="X">
              <input
                value={form.x}
                onChange={(event) => updateForm("x", event.target.value)}
                className="input-surface"
                placeholder="https://x.com/..."
              />
            </Field>
            <Field label="Telegram">
              <input
                value={form.telegram}
                onChange={(event) => updateForm("telegram", event.target.value)}
                className="input-surface"
                placeholder="https://t.me/..."
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              checked={form.visibleInPool}
              label="Show in DustLift pool"
              onChange={(value) => updateForm("visibleInPool", value)}
            />
            <ToggleRow
              checked={form.communityListed}
              label="List as community token"
              onChange={(value) => updateForm("communityListed", value)}
            />
          </div>
          <WizardActions onBack={goBack} onNext={goNext} />
        </StepPanel>
      )}

      {step === 3 && (
        <StepPanel title="Preview" kicker="Review before launch">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <TokenPreview form={form} />
            <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5 text-sm leading-6 text-[#a8b0a4]">
              <p className="font-semibold text-[#e8e4dc]">What happens next?</p>
              <p className="mt-2">DustLift checks your wallet, prepares the token metadata, and adds it to the new B20 token feed when creation is complete.</p>
              <p className="mt-2">The token can appear in the DustLift pool view first, then move toward deeper liquidity as trading grows.</p>
            </div>
          </div>
          <WizardActions onBack={goBack} onNext={goNext} nextLabel="Everything looks right" />
        </StepPanel>
      )}

      {step === 4 && (
        <StepPanel title="Wallet check" kicker="DustLift handles the checklist">
          <div className="grid gap-3 sm:grid-cols-3">
            <CheckCard label="Wallet" value={isConnected ? shortAddress(address) : "Not connected"} ok={isConnected} />
            <CheckCard label="Base network" value={isBase ? "Ready" : "Switch needed"} ok={isBase} />
            <CheckCard
              label="ETH for network"
              value={hasEthForNetwork ? `${ethValue.toFixed(5)} ETH` : "Needs ETH"}
              ok={hasEthForNetwork}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {!isConnected && (
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button type="button" onClick={openConnectModal} className="primary-button">
                    Connect wallet
                  </button>
                )}
              </ConnectButton.Custom>
            )}
            {isConnected && !isBase && (
              <button type="button" onClick={handleSwitchBase} className="primary-button">
                Switch to Base
              </button>
            )}
            {isConnected && isBase && !hasEthForNetwork && (
              <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
                Cüzdanında işlem için yeterli ETH yok. Base ağına biraz ETH eklemen gerekiyor.
              </div>
            )}
            {isConnected && isBase && hasEthForNetwork && (
              <button type="button" onClick={goNext} className="primary-button">
                Continue
              </button>
            )}
          </div>
          <WizardActions onBack={goBack} hideNext />
        </StepPanel>
      )}

      {step === 5 && (
        <StepPanel title="Create and publish" kicker="One clear flow">
          <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5">
            <p className="text-sm text-[#c5cdc6]">
              Your wallet will show the Base network confirmation. DustLift does not present this as a large launch fee.
            </p>
            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <StatusLine active={status === "checking" || status === "creating" || status === "listed"} label="1/3 Checking wallet" />
              <StatusLine active={status === "creating" || status === "listed"} label="2/3 Creating B20 token" />
              <StatusLine active={status === "listed"} label="3/3 Adding to DustLift" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={createToken}
              disabled={status === "checking" || status === "creating"}
              className="primary-button disabled:opacity-50"
            >
              {status === "checking" && "Checking..."}
              {status === "creating" && "Creating token..."}
              {status !== "checking" && status !== "creating" && "Create token and publish"}
            </button>
            <button type="button" onClick={goBack} className="secondary-button">
              Back
            </button>
          </div>
          {message && <Notice tone={status === "error" ? "error" : "info"}>{message}</Notice>}
        </StepPanel>
      )}

      {step === 6 && createdToken && (
        <StepPanel title="Token is ready" kicker="Share and grow">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <TokenCard token={createdToken} />
            <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <LinkBlock label="Token address" value={createdToken.address} />
                <LinkBlock label="BaseScan" value={`basescan.org/token/${createdToken.address}`} />
                <LinkBlock label="DustLift page" value={`dustlift.vercel.app/token/${createdToken.address}`} />
                <LinkBlock label="Pool status" value="Visible in DustLift pool" />
              </div>
              <textarea readOnly value={shareText} className="input-surface mt-4 min-h-32 resize-none" />
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="primary-button"
                >
                  Share on X
                </a>
                <button type="button" className="secondary-button">
                  Add first liquidity / trade
                </button>
              </div>
            </div>
          </div>
        </StepPanel>
      )}

      <LiveTokenList tokens={liveTokens} />
    </section>
  );
}

function StepPanel({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-[#2a332c] bg-[#101611]/80 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[#6b7a6d]">{kicker}</p>
        <h3 className="mt-1 font-serif text-2xl italic text-[#e8e4dc]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-semibold text-[#c5cdc6]">
      {label}
      {children}
    </label>
  );
}

function WizardActions({
  onBack,
  onNext,
  nextDisabled,
  nextLabel = "Continue",
  hideNext = false,
}: {
  onBack: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  hideNext?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={onBack} className="secondary-button">
        Back
      </button>
      {!hideNext && onNext && (
        <button type="button" onClick={onNext} disabled={nextDisabled} className="primary-button disabled:opacity-50">
          {nextLabel}
        </button>
      )}
    </div>
  );
}

function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3 text-sm text-[#c5cdc6]">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[#6b8f71]"
      />
    </label>
  );
}

function TokenPreview({ form }: { form: TokenForm }) {
  return (
    <div className="rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16] p-5">
      <div className="flex items-start gap-4">
        <LogoMark logoUrl={form.logoUrl} symbol={form.symbol} name={form.name} />
        <div className="min-w-0">
          <p className="text-xl font-semibold text-[#e8e4dc]">{form.name.trim() || "Token name"}</p>
          <p className="text-sm text-[#6b8f71]">${normalizeSymbol(form.symbol) || "SYMBOL"}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <StatusPill label="Total supply" value={formatSupply(form.supply) || "-"} />
        <StatusPill label="Decimals" value="18" />
        <StatusPill label="Pool" value={form.visibleInPool ? "Visible" : "Hidden"} />
        <StatusPill label="Listing" value={form.communityListed ? "Community" : "Private"} />
      </div>
      <p className="mt-5 text-sm leading-6 text-[#a8b0a4]">
        {form.description.trim() || "Token description will appear here."}
      </p>
    </div>
  );
}

function CheckCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">{label}</p>
      <p className={ok ? "mt-1 text-[#79e0a2]" : "mt-1 text-amber-200"}>{value}</p>
    </div>
  );
}

function StatusLine({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${active ? "border-[#6b8f71]/70 bg-[#122017] text-[#79e0a2]" : "border-[#2a332c] bg-[#141a16] text-[#8a9a8c]"}`}>
      {label}
    </div>
  );
}

function Notice({ tone, children }: { tone: "info" | "error"; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tone === "error" ? "border-red-900/50 bg-red-950/30 text-red-300" : "border-[#3d4a3f] bg-[#141a16] text-[#c5cdc6]"}`}>
      {children}
    </div>
  );
}

function LiveTokenList({ tokens, compact = false }: { tokens: ListedToken[]; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#6b8f71]">Live activity</p>
          <h3 className="mt-1 font-serif text-2xl italic text-[#e8e4dc]">New B20 tokens</h3>
        </div>
        <span className="rounded-full border border-[#6b8f71]/50 bg-[#122017] px-3 py-1 text-xs font-semibold text-[#79e0a2]">
          Live
        </span>
      </div>
      <div className={`mt-4 grid gap-3 ${compact ? "" : "lg:grid-cols-3"}`}>
        {tokens.slice(0, compact ? 3 : 6).map((token) => (
          <TokenCard key={token.address} token={token} small={compact} />
        ))}
      </div>
    </div>
  );
}

function TokenCard({ token, small = false }: { token: ListedToken; small?: boolean }) {
  return (
    <div className="rounded-xl border border-[#3d4a3f]/60 bg-[#141a16] p-4">
      <div className="flex items-start gap-3">
        <LogoMark logoUrl={token.logoUrl} symbol={token.symbol} name={token.name} small />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[#e8e4dc]">{token.name}</p>
          <p className="text-sm text-[#6b8f71]">${token.symbol}</p>
        </div>
      </div>
      {!small && <p className="mt-3 line-clamp-2 text-sm text-[#8a9a8c]">{token.description}</p>}
      <div className="mt-4 grid gap-2 text-xs text-[#8a9a8c]">
        <div className="flex justify-between gap-3"><span>Creator</span><span className="text-[#c5cdc6]">{token.creator}</span></div>
        <div className="flex justify-between gap-3"><span>Created</span><span className="text-[#c5cdc6]">{token.createdMinutesAgo === 0 ? "just now" : `${token.createdMinutesAgo} min ago`}</span></div>
        <div className="flex justify-between gap-3"><span>Pool</span><span className="text-[#c5cdc6]">{token.poolType}</span></div>
      </div>
      <div className="mt-4 flex gap-2">
        <a href={`/token/${token.address}`} className="secondary-button flex-1 px-3 py-2 text-xs">View</a>
        <a href={`/token/${token.address}#trade`} className="primary-button flex-1 px-3 py-2 text-xs">Trade</a>
      </div>
    </div>
  );
}

function LogoMark({
  logoUrl,
  symbol,
  name,
  small = false,
}: {
  logoUrl: string;
  symbol: string;
  name: string;
  small?: boolean;
}) {
  const size = small ? "size-10" : "size-16";
  const initial = getLogoInitial(normalizeSymbol(symbol), name);

  if (logoUrl.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl.trim()}
        alt=""
        className={`${size} rounded-xl border border-[#3d4a3f] object-cover`}
      />
    );
  }

  return (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-xl border border-[#3d4a3f] bg-[#203124] font-serif text-2xl italic text-[#e8e4dc]`}>
      {initial}
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">{label}</p>
      <p className="mt-1 truncate text-[#c5cdc6]">{value}</p>
    </div>
  );
}

function LinkBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2a332c] bg-[#141a16] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">{label}</p>
      <p className="mt-1 truncate text-sm text-[#c5cdc6]">{value}</p>
    </div>
  );
}

