import { formatUnits } from "viem";

export function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value < 0.01) return "< $0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatTokenAmount(
  balance: bigint,
  decimals: number,
  maxFractionDigits = 6,
): string {
  const n = Number(formatUnits(balance, decimals));
  if (n === 0) return "0";
  if (n < 0.000001) return "<0.000001";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits });
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortenSymbol(symbol: string, max = 12): string {
  return symbol.length > max ? `${symbol.slice(0, max)}…` : symbol;
}
