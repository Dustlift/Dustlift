export type TokenBalance = {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  balanceFormatted: number;
  usdPrice: number | null;
  usdValue: number | null;
  isDust: boolean;
  isSwappable: boolean;
  isScam: boolean;
  scamReason?: string;
  swapBlockedReason?: string;
};

export type SwapQuote = {
  buyAmount: string;
  sellAmount: string;
  estimatedGas: string;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  allowanceTarget?: `0x${string}`;
  feeAmount?: string;
};

export type ScanSummary = {
  totalTokens: number;
  dustTokens: number;
  scamTokens: number;
  swappableDustUsd: number;
  unsellableCount: number;
};

export type BatchCall = {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
};

export type PublicAppConfig = {
  fee: {
    enabled: boolean;
    percentLabel: string;
    recipient: `0x${string}` | null;
  };
  appUrl: string;
  appName: string;
};
