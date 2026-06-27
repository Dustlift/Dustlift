import { DEFAULT_FEE_BPS } from "./constants";

export type FeeConfig = {
  recipient: `0x${string}` | null;
  bps: number;
  enabled: boolean;
  percentLabel: string;
};

export function getFeeConfig(): FeeConfig {
  const recipient = (
    process.env.FEE_RECIPIENT ??
    process.env.NEXT_PUBLIC_FEE_RECIPIENT ??
    ""
  ).toLowerCase();

  const bps = Number(process.env.FEE_BPS ?? DEFAULT_FEE_BPS);
  const validRecipient = /^0x[a-f0-9]{40}$/.test(recipient)
    ? (recipient as `0x${string}`)
    : null;

  const safeBps = Number.isFinite(bps) && bps > 0 && bps <= 1000 ? bps : 0;

  return {
    recipient: validRecipient,
    bps: safeBps,
    enabled: Boolean(validRecipient && safeBps > 0),
    percentLabel: `${(safeBps / 100).toFixed(2)}%`,
  };
}

export function getPublicFeeConfig(): Pick<
  FeeConfig,
  "enabled" | "percentLabel" | "recipient"
> {
  const config = getFeeConfig();
  const publicRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT?.toLowerCase();
  const recipient =
    publicRecipient && /^0x[a-f0-9]{40}$/.test(publicRecipient)
      ? (publicRecipient as `0x${string}`)
      : config.recipient;

  return {
    recipient,
    enabled: config.enabled,
    percentLabel: config.percentLabel,
  };
}
