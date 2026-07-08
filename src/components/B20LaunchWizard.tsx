"use client";

import { useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  keccak256,
  parseUnits,
  stringToHex,
  zeroAddress,
} from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  B20_ACTIVATION_REGISTRY_ADDRESS,
  B20_ASSET_FEATURE_ID,
  B20_FACTORY_ADDRESS,
  B20_POLICY_REGISTRY_ADDRESS,
  MINT_ROLE,
  b20AssetAbi,
  b20ActivationRegistryAbi,
  b20FactoryAbi,
} from "@/lib/b20";
import { BASE_CHAIN_ID, USDC_BASE } from "@/lib/constants";
import { truncateAddress } from "@/lib/format";

type LaunchStep = 0 | 1 | 2 | 3 | 4 | 5;
type LaunchStatus = "idle" | "checking" | "waiting" | "ready" | "error";
type CreatedToken = {
  address: `0x${string}`;
  hash: `0x${string}`;
};

type TokenForm = {
  name: string;
  symbol: string;
  supply: string;
  description: string;
  logoUrl: string;
  logoFileName: string;
  website: string;
  x: string;
  telegram: string;
  pairToken: "ETH" | "USDC";
  visibleInPool: boolean;
  communityListed: boolean;
};

type UpcomingToken = {
  name: string;
  symbol: string;
  creator: string;
  status: string;
};

const launchWindowText = "8 July 2026, 21:00 Turkey time";
const b20LaunchFeeUsdc = 500_000n;
const steps = ["Start", "Details", "Logo & links", "Preview", "Wallet", "Ready"] as const;

const initialForm: TokenForm = {
  name: "",
  symbol: "",
  supply: "1000000000",
  description: "",
  logoUrl: "",
  logoFileName: "",
  website: "",
  x: "",
  telegram: "",
  pairToken: "ETH",
  visibleInPool: true,
  communityListed: true,
};

const upcomingTokens: UpcomingToken[] = [
  { name: "Base Morning", symbol: "MORN", creator: "0x6f21...91ac", status: "Waiting for B20" },
  { name: "Dust Club", symbol: "DUSTC", creator: "0x2c44...7d20", status: "Draft ready" },
  { name: "Builder Spark", symbol: "SPRK", creator: "0x91bd...038a", status: "Launch queue" },
];

function normalizeSymbol(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
}

function formatSupply(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

function shortAddress(address?: string) {
  return address ? truncateAddress(address) : "Not connected";
}

function getLogoInitial(symbol: string, name: string) {
  return (symbol || name || "B").slice(0, 1).toUpperCase();
}

async function resizeLogoFile(file: File): Promise<string> {
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    throw new Error("Logo icin sadece PNG veya JPG dosyasi yukleyebilirsin.");
  }

  if (file.size > 6 * 1024 * 1024) {
    throw new Error("Logo dosyasi en fazla 6 MB olabilir.");
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Logo gorseli okunamadi."));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Logo dosyasi okunamadi."));
    reader.readAsDataURL(file);
  });

  const size = 800;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Logo islenemedi. Farkli bir PNG veya JPG dene.");
  }

  context.fillStyle = "#101611";
  context.fillRect(0, 0, size, size);

  const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - cropSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - cropSize) / 2);

  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    size,
    size,
  );

  return canvas.toDataURL("image/png");
}

export function B20LaunchWizard() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { data: balance } = useBalance({
    address,
    chainId: BASE_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });
  const { data: usdcBalance } = useReadContract({
    address: USDC_BASE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: BASE_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });
  const {
    data: b20AssetActivated,
    isError: activationCheckFailed,
    isLoading: activationChecking,
  } = useReadContract({
    address: B20_ACTIVATION_REGISTRY_ADDRESS,
    abi: b20ActivationRegistryAbi,
    functionName: "isActivated",
    args: [B20_ASSET_FEATURE_ID],
    chainId: BASE_CHAIN_ID,
    query: { refetchInterval: 30_000 },
  });

  const [step, setStep] = useState<LaunchStep>(0);
  const [form, setForm] = useState<TokenForm>(initialForm);
  const [status, setStatus] = useState<LaunchStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [showLaunchOptions, setShowLaunchOptions] = useState(false);

  const b20FeeRecipient = useMemo(() => {
    const recipient = (
      process.env.NEXT_PUBLIC_B20_LAUNCH_FEE_RECIPIENT ??
      process.env.NEXT_PUBLIC_FEE_RECIPIENT ??
      ""
    ).toLowerCase();

    return /^0x[a-f0-9]{40}$/.test(recipient)
      ? (recipient as `0x${string}`)
      : null;
  }, []);

  const tokenName = form.name.trim();
  const tokenSymbol = normalizeSymbol(form.symbol);
  const tokenSupply = formatSupply(form.supply);
  const canContinueDetails = Boolean(tokenName && tokenSymbol && tokenSupply);
  const isBase = chainId === BASE_CHAIN_ID;
  const ethValue = balance ? Number(formatUnits(balance.value, balance.decimals)) : 0;
  const hasEthForNetwork = Boolean(balance && balance.value > 0n);
  const hasLaunchFeeUsdc = typeof usdcBalance === "bigint" && usdcBalance >= b20LaunchFeeUsdc;
  const b20LaunchEnabled = b20AssetActivated === true;
  const activationStatusText = activationChecking
    ? "Checking Activation Registry"
    : b20LaunchEnabled
      ? "B20 creation enabled"
      : activationCheckFailed
        ? "Activation check unavailable"
        : "Waiting for Base activation";

  const visibleTokens = useMemo(() => {
    if (!draftSaved || !tokenName || !tokenSymbol) return upcomingTokens;
    return [
      { name: tokenName, symbol: tokenSymbol, creator: shortAddress(address), status: "Your draft" },
      ...upcomingTokens,
    ];
  }, [address, draftSaved, tokenName, tokenSymbol]);

  function updateForm<K extends keyof TokenForm>(key: K, value: TokenForm[K]) {
    setDraftSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleLogoUpload(file?: File) {
    setLogoError(null);
    if (!file) return;

    try {
      const logoDataUrl = await resizeLogoFile(file);
      setDraftSaved(false);
      setForm((current) => ({
        ...current,
        logoUrl: logoDataUrl,
        logoFileName: file.name,
      }));
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : "Logo yuklenemedi.");
    }
  }

  function goNext() {
    setMessage(null);
    setStep((current) => Math.min(current + 1, 5) as LaunchStep);
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
          : "Base agina gecis tamamlanamadi. Cuzdanini kontrol et.",
      );
    }
  }

  async function prepareForLaunch() {
    setMessage(null);
    setStatus("checking");

    if (!canContinueDetails) {
      setStatus("error");
      setMessage("Token adi, sembol ve toplam arz alanlarini doldur.");
      setStep(1);
      return;
    }

    if (!isConnected) {
      setStatus("error");
      setMessage("Gercek B20 token olusturmak icin once cuzdanini baglaman gerekecek.");
      setStep(4);
      return;
    }

    if (!isBase) {
      setStatus("idle");
      await handleSwitchBase();
      return;
    }

    setDraftSaved(true);

    if (activationChecking) {
      setStatus("waiting");
      setMessage("Activation Registry kontrol ediliyor. B20 aktif oldugunda bu buton gercek olusturma akisina gececek.");
      return;
    }

    if (!b20LaunchEnabled) {
      setStatus("waiting");
      setMessage(
        activationCheckFailed
          ? "Activation Registry su an okunamadi. Bilgilerin hazir; biraz sonra tekrar dene."
          : "Activation Registry henuz base.b20_asset icin aktif donmuyor. Bilgilerin hazir; aktif oldugunda ayni formdan Create B20 Token butonunu kullanacaksin.",
      );
      return;
    }

    if (!hasEthForNetwork) {
      setStatus("error");
      setMessage("Cuzdaninda Base islemini onaylamak icin yeterli ETH gorunmuyor. Biraz ETH ekledikten sonra tekrar dene.");
      return;
    }

    if (!b20FeeRecipient) {
      setStatus("error");
      setMessage("DustLift fee cuzdani ayarlanmamis. NEXT_PUBLIC_B20_LAUNCH_FEE_RECIPIENT veya NEXT_PUBLIC_FEE_RECIPIENT eklenmeli.");
      return;
    }

    if (!hasLaunchFeeUsdc) {
      setStatus("error");
      setMessage("Token olusturmak icin cuzdaninda 0.5 USDC DustLift fee bulunmali.");
      return;
    }

    if (!address || !publicClient) {
      setStatus("error");
      setMessage("Cuzdan baglantisi okunamadi. Sayfayi yenileyip tekrar dene.");
      return;
    }

    setStatus("waiting");
    setMessage("Cuzdaninda once 0.5 USDC DustLift fee onayi aciliyor...");

    try {
      const feeHash = await writeContractAsync({
        address: USDC_BASE,
        abi: erc20Abi,
        functionName: "transfer",
        args: [b20FeeRecipient, b20LaunchFeeUsdc],
        chainId: BASE_CHAIN_ID,
      });

      await publicClient.waitForTransactionReceipt({ hash: feeHash });
      setMessage("Fee alindi. Simdi B20 token olusturma onayi aciliyor...");

      const decimals = 18;
      const supply = parseUnits(form.supply || "0", decimals);
      const salt = keccak256(
        stringToHex(`${address}:${tokenName}:${tokenSymbol}:${Date.now()}`),
      );
      const params = encodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              { name: "version", type: "uint8" },
              { name: "name", type: "string" },
              { name: "symbol", type: "string" },
              { name: "initialAdmin", type: "address" },
              { name: "decimals", type: "uint8" },
            ],
          },
        ],
        [
          {
            version: 1,
            name: tokenName,
            symbol: tokenSymbol,
            initialAdmin: address,
            decimals,
          },
        ],
      );
      const initCalls = [
        encodeFunctionData({
          abi: b20AssetAbi,
          functionName: "grantRole",
          args: [MINT_ROLE, address],
        }),
        encodeFunctionData({
          abi: b20AssetAbi,
          functionName: "updateSupplyCap",
          args: [supply],
        }),
        encodeFunctionData({
          abi: b20AssetAbi,
          functionName: "batchMint",
          args: [[address], [supply]],
        }),
      ];

      const predictedAddress = await publicClient.readContract({
        address: B20_FACTORY_ADDRESS,
        abi: b20FactoryAbi,
        functionName: "getB20Address",
        args: [0, address, salt],
      });
      const hash = await writeContractAsync({
        address: B20_FACTORY_ADDRESS,
        abi: b20FactoryAbi,
        functionName: "createB20",
        args: [0, salt, params, initCalls],
        chainId: BASE_CHAIN_ID,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setCreatedToken({ address: predictedAddress, hash });
      setDraftSaved(true);
      setStatus("ready");
      setMessage("B20 token olusturuldu. Token adresi ve BaseScan linki hazir.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "B20 token olusturma islemi tamamlanamadi.",
      );
    }
  }

  return (
    <section id="launch" className="flex flex-col gap-5 rounded-2xl border border-[#3d4a3f]/60 bg-[#141a16]/90 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#6b8f71]">B20 Launch Wizard</p>
          <h2 className="font-serif text-3xl italic text-[#e8e4dc]">
            Prepare your B20 token before launch opens.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a8b0a4]">
            Enter the same details you will use after activation. DustLift will not create a demo token now; the real Create B20 Token action opens when Base Activation Registry returns active.
          </p>
        </div>
        <div className="rounded-xl border border-[#6b8f71]/50 bg-[#122017] px-4 py-3 text-sm text-[#c5cdc6]">
          <p className="text-xs uppercase tracking-wide text-[#79e0a2]">Activation status</p>
          <p className="mt-1">{activationStatusText}</p>
          <p className="mt-1 text-xs text-[#8a9a8c]">Target: {launchWindowText}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-6">
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

      <div className="grid gap-3 text-xs text-[#8a9a8c] sm:grid-cols-3">
        <RegistryCard label="Factory" value={B20_FACTORY_ADDRESS} />
        <RegistryCard label="Activation Registry" value={B20_ACTIVATION_REGISTRY_ADDRESS} />
        <RegistryCard label="Policy Registry" value={B20_POLICY_REGISTRY_ADDRESS} />
      </div>

      {step === 0 && (
        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5">
            <p className="text-sm font-semibold text-[#6b8f71]">
              B20 tokenini dakikalar icinde olustur, DustLift&apos;te listele ve toplulugunu baslat.
            </p>
            <h3 className="mt-4 font-serif text-4xl italic text-[#e8e4dc]">Get launch-ready now.</h3>
            <p className="mt-3 text-sm leading-6 text-[#a8b0a4]">
              Fill in your token name, symbol, supply, logo, and social links now. After activation, return here and press Create B20 Token to launch with your wallet.
            </p>
            <button type="button" onClick={goNext} className="mt-6 rounded-xl bg-[#e8e4dc] px-5 py-3 text-sm font-semibold text-[#0f1410] transition hover:bg-white">
              Prepare token details
            </button>
          </div>
          <UpcomingTokenList tokens={visibleTokens} compact />
        </div>
      )}

      {step === 1 && (
        <StepPanel title="Token details" kicker="Use these after activation">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Token name">
              <input value={form.name} onChange={(event) => updateForm("name", event.target.value.slice(0, 64))} className="input-surface" placeholder="Dust Friends" />
            </Field>
            <Field label="Symbol">
              <input value={tokenSymbol} onChange={(event) => updateForm("symbol", normalizeSymbol(event.target.value))} className="input-surface" placeholder="DUST" />
            </Field>
            <Field label="Total supply">
              <input value={form.supply} onChange={(event) => updateForm("supply", event.target.value.replace(/[^0-9]/g, "").slice(0, 18))} className="input-surface" inputMode="numeric" placeholder="1000000000" />
            </Field>
            <div className="rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3 text-sm text-[#8a9a8c]">
              <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">Decimals</p>
              <p className="mt-1 text-[#c5cdc6]">Set automatically: 18</p>
            </div>
          </div>
          <Field label="Description">
            <textarea value={form.description} onChange={(event) => updateForm("description", event.target.value.slice(0, 220))} className="input-surface min-h-28 resize-none" placeholder="What is this token for?" />
          </Field>
          <WizardActions onBack={goBack} onNext={goNext} nextDisabled={!canContinueDetails} />
        </StepPanel>
      )}

      {step === 2 && (
        <StepPanel title="Logo and links" kicker="Optional">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-xl border border-[#2a332c] bg-[#101611] p-4 sm:col-span-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <LogoMark logoUrl={form.logoUrl} symbol={form.symbol} name={form.name} />
                <div className="flex flex-1 flex-col gap-2">
                  <p className="text-sm font-semibold text-[#c5cdc6]">
                    Logo upload
                  </p>
                  <p className="text-xs leading-5 text-[#8a9a8c]">
                    PNG veya JPG yukle. DustLift gorseli otomatik 800x800 kare
                    logoya cevirir.
                  </p>
                  <label className="inline-flex w-fit cursor-pointer items-center justify-center rounded-xl border border-[#3d4a3f] bg-[#141a16] px-4 py-2 text-sm font-semibold text-[#c5cdc6] transition hover:bg-[#1a211c]">
                    Choose PNG/JPG
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(event) => handleLogoUpload(event.target.files?.[0])}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
              {form.logoFileName && (
                <p className="text-xs text-[#79e0a2]">
                  Logo ready: {form.logoFileName} converted to 800x800 PNG
                </p>
              )}
              {logoError && <Notice tone="error">{logoError}</Notice>}
              <Field label="Logo URL">
                <input
                  value={form.logoUrl.startsWith("data:") ? "Uploaded local logo (800x800)" : form.logoUrl}
                  onChange={(event) =>
                    updateForm("logoUrl", event.target.value === "Uploaded local logo (800x800)" ? form.logoUrl : event.target.value)
                  }
                  className="input-surface"
                  placeholder="https://... or upload PNG/JPG above"
                  readOnly={form.logoUrl.startsWith("data:")}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#c5cdc6]">Links (optional)</p>
                  <p className="mt-1 text-xs text-[#8a9a8c]">
                    Website, X ve Telegram alanlari bos birakilabilir.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Website">
                  <input value={form.website} onChange={(event) => updateForm("website", event.target.value)} className="input-surface" placeholder="https://yourproject.xyz" />
                </Field>
                <Field label="X">
                  <input value={form.x} onChange={(event) => updateForm("x", event.target.value)} className="input-surface" placeholder="https://x.com/yourproject" />
                </Field>
                <Field label="Telegram">
                  <input value={form.telegram} onChange={(event) => updateForm("telegram", event.target.value)} className="input-surface" placeholder="https://t.me/yourproject" />
                </Field>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowLaunchOptions((current) => !current)}
              className="secondary-button w-fit"
            >
              {showLaunchOptions ? "Hide launch options" : "Launch options"}
            </button>
            {showLaunchOptions && (
              <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-4">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-[#c5cdc6]">Launch options</p>
                  <p className="mt-1 text-xs text-[#8a9a8c]">
                    These choices control how the token appears inside DustLift after the real B20 launch.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#2a332c] bg-[#141a16] p-4 sm:col-span-2">
                    <p className="text-sm font-semibold text-[#c5cdc6]">Trade pair</p>
                    <p className="mt-1 text-xs leading-5 text-[#8a9a8c]">
                      Pick how DustLift should prepare the token page and pool display after launch. This does not create a fake pool before B20 is active.
                    </p>
                    <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-[#2a332c]">
                      {(["ETH", "USDC"] as const).map((pair) => (
                        <button
                          key={pair}
                          type="button"
                          onClick={() => updateForm("pairToken", pair)}
                          className={`px-4 py-3 text-sm font-semibold transition ${
                            form.pairToken === pair
                              ? "bg-[#6b8f71] text-[#0f1410]"
                              : "bg-[#101611] text-[#c5cdc6] hover:bg-[#182019]"
                          }`}
                        >
                          {pair}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ToggleRow checked={form.visibleInPool} label="Show in DustLift pool after launch" onChange={(value) => updateForm("visibleInPool", value)} />
                  <ToggleRow checked={form.communityListed} label="List as community token" onChange={(value) => updateForm("communityListed", value)} />
                </div>
                <Notice tone="info">
                  Pool creation, locked liquidity and price discovery will be connected only when the related DustLift pool contract flow is live.
                </Notice>
              </div>
            )}
          </div>
          <WizardActions onBack={goBack} onNext={goNext} />
        </StepPanel>
      )}

      {step === 3 && (
        <StepPanel title="Preview" kicker="No demo token will be created">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <TokenPreview form={form} />
            <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5 text-sm leading-6 text-[#a8b0a4]">
              <p className="font-semibold text-[#e8e4dc]">After activation</p>
              <p className="mt-2">You will come back to this screen, connect your Base wallet, and press Create B20 Token.</p>
              <p className="mt-2">Only then will DustLift send the real B20 creation transaction and show the real token address.</p>
            </div>
          </div>
          <WizardActions onBack={goBack} onNext={goNext} nextLabel="Looks ready" />
        </StepPanel>
      )}

      {step === 4 && (
        <StepPanel title="Wallet check" kicker="For the real launch action">
          <div className="grid gap-3 sm:grid-cols-4">
            <CheckCard label="Wallet" value={isConnected ? shortAddress(address) : "Not connected"} ok={isConnected} />
            <CheckCard label="Base network" value={isBase ? "Ready" : "Switch needed"} ok={isBase} />
            <CheckCard label="ETH for network" value={hasEthForNetwork ? `${ethValue.toFixed(5)} ETH` : "Needed after activation"} ok={hasEthForNetwork || !b20LaunchEnabled} />
            <CheckCard label="DustLift fee" value={hasLaunchFeeUsdc ? "0.5 USDC ready" : "0.5 USDC"} ok={hasLaunchFeeUsdc || !b20LaunchEnabled} />
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
            <button type="button" onClick={goNext} className="secondary-button">
              Continue to launch button
            </button>
          </div>
          <WizardActions onBack={goBack} hideNext />
        </StepPanel>
      )}

      {step === 5 && (
        <StepPanel title="Create B20 Token" kicker={b20LaunchEnabled ? "Registry active" : "Waiting for registry"}>
          <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5">
            <p className="text-sm text-[#c5cdc6]">
              {b20LaunchEnabled
                ? "Activation Registry says B20 Asset creation is open. Your wallet will show two confirmations: 0.5 USDC DustLift fee, then createB20."
                : "This button is shown now so users know exactly what to do after activation. It does not create a demo token before B20 is active."}
            </p>
            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <StatusLine active label="1/3 Details prepared" />
              <StatusLine active={isConnected} label="2/3 Wallet ready" />
              <StatusLine active={b20LaunchEnabled} label="3/3 Registry active" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={prepareForLaunch} disabled={status === "checking" || status === "waiting"} className={`${b20LaunchEnabled ? "primary-button" : "secondary-button"} disabled:opacity-50`}>
              {status === "checking" ? "Checking..." : status === "waiting" ? "Processing..." : "Create B20 Token"}
            </button>
            <button type="button" onClick={goBack} className="secondary-button">
              Back
            </button>
          </div>
          {!b20LaunchEnabled && (
            <Notice tone="info">
              Activation Registry is not active for base.b20_asset yet. Until then, this screen only prepares the launch details.
            </Notice>
          )}
          {message && <Notice tone={status === "error" ? "error" : "info"}>{message}</Notice>}
          {createdToken && (
            <div className="rounded-2xl border border-[#6b8f71]/50 bg-[#122017] p-4 text-sm text-[#c5cdc6]">
              <p className="font-semibold text-[#79e0a2]">B20 token live</p>
              <p className="mt-2 break-all">Token: {createdToken.address}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`https://basescan.org/token/${createdToken.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="primary-button"
                >
                  Open BaseScan
                </a>
                <a
                  href={`/token/${createdToken.address}`}
                  className="secondary-button"
                >
                  DustLift token page
                </a>
              </div>
            </div>
          )}
        </StepPanel>
      )}

      <UpcomingTokenList tokens={visibleTokens} />
    </section>
  );
}

function RegistryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3">
      <p className="uppercase tracking-wide text-[#6b7a6d]">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] text-[#c5cdc6]">{value}</p>
    </div>
  );
}

function StepPanel({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
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
  return <label className="flex flex-col gap-2 text-sm font-semibold text-[#c5cdc6]">{label}{children}</label>;
}

function WizardActions({ onBack, onNext, nextDisabled, nextLabel = "Continue", hideNext = false }: { onBack: () => void; onNext?: () => void; nextDisabled?: boolean; nextLabel?: string; hideNext?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={onBack} className="secondary-button">Back</button>
      {!hideNext && onNext && <button type="button" onClick={onNext} disabled={nextDisabled} className="primary-button disabled:opacity-50">{nextLabel}</button>}
    </div>
  );
}

function ToggleRow({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3 text-sm text-[#c5cdc6]">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[#6b8f71]" />
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
        <StatusPill label="Trade pair" value={form.pairToken} />
        <StatusPill label="Pool after launch" value={form.visibleInPool ? "Visible" : "Hidden"} />
        <StatusPill label="Listing" value={form.communityListed ? "Community" : "Private"} />
      </div>
      <p className="mt-5 text-sm leading-6 text-[#a8b0a4]">{form.description.trim() || "Token description will appear here."}</p>
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
  return <div className={`rounded-xl border px-4 py-3 ${active ? "border-[#6b8f71]/70 bg-[#122017] text-[#79e0a2]" : "border-[#2a332c] bg-[#141a16] text-[#8a9a8c]"}`}>{label}</div>;
}

function Notice({ tone, children }: { tone: "info" | "error"; children: React.ReactNode }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tone === "error" ? "border-red-900/50 bg-red-950/30 text-red-300" : "border-[#3d4a3f] bg-[#141a16] text-[#c5cdc6]"}`}>{children}</div>;
}

function UpcomingTokenList({ tokens, compact = false }: { tokens: UpcomingToken[]; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#2a332c] bg-[#101611] p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#6b8f71]">Launch queue</p>
          <h3 className="mt-1 font-serif text-2xl italic text-[#e8e4dc]">B20 drafts getting ready</h3>
        </div>
        <span className="rounded-full border border-[#6b8f71]/50 bg-[#122017] px-3 py-1 text-xs font-semibold text-[#79e0a2]">Soon</span>
      </div>
      <div className={`mt-4 grid gap-3 ${compact ? "" : "lg:grid-cols-3"}`}>
        {tokens.slice(0, compact ? 3 : 6).map((token) => <UpcomingTokenCard key={`${token.symbol}-${token.creator}`} token={token} small={compact} />)}
      </div>
    </div>
  );
}

function UpcomingTokenCard({ token, small = false }: { token: UpcomingToken; small?: boolean }) {
  return (
    <div className="rounded-xl border border-[#3d4a3f]/60 bg-[#141a16] p-4">
      <div className="flex items-start gap-3">
        <LogoMark logoUrl="" symbol={token.symbol} name={token.name} small />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[#e8e4dc]">{token.name}</p>
          <p className="text-sm text-[#6b8f71]">${token.symbol}</p>
        </div>
      </div>
      {!small && <p className="mt-3 text-sm text-[#8a9a8c]">Ready to launch when B20 creation opens.</p>}
      <div className="mt-4 grid gap-2 text-xs text-[#8a9a8c]">
        <div className="flex justify-between gap-3"><span>Creator</span><span className="text-[#c5cdc6]">{token.creator}</span></div>
        <div className="flex justify-between gap-3"><span>Status</span><span className="text-[#c5cdc6]">{token.status}</span></div>
      </div>
    </div>
  );
}

function LogoMark({ logoUrl, symbol, name, small = false }: { logoUrl: string; symbol: string; name: string; small?: boolean }) {
  const size = small ? "size-10" : "size-16";
  const initial = getLogoInitial(normalizeSymbol(symbol), name);

  if (logoUrl.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl.trim()} alt="" className={`${size} rounded-xl border border-[#3d4a3f] object-cover`} />
    );
  }

  return <div className={`${size} flex shrink-0 items-center justify-center rounded-xl border border-[#3d4a3f] bg-[#203124] font-serif text-2xl italic text-[#e8e4dc]`}>{initial}</div>;
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2a332c] bg-[#101611] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#6b7a6d]">{label}</p>
      <p className="mt-1 truncate text-[#c5cdc6]">{value}</p>
    </div>
  );
}

