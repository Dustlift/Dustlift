"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import { useBalance } from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/constants";

function shortAddress(address?: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEth(value?: bigint, decimals = 18): string {
  if (value == null) return "-- ETH";
  const parsed = Number(formatUnits(value, decimals));
  if (!Number.isFinite(parsed)) return "-- ETH";
  if (parsed === 0) return "0 ETH";
  if (parsed < 0.0001) return "<0.0001 ETH";
  return `${parsed.toFixed(4)} ETH`;
}

export function WalletStatus() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            aria-hidden={!ready}
            className={!ready ? "opacity-0" : undefined}
          >
            {connected ? (
              <ConnectedWallet
                address={account.address}
                chainName={chain.name ?? "Base"}
                wrongNetwork={Boolean(chain.unsupported)}
                onAccountClick={openAccountModal}
                onChainClick={openChainModal}
              />
            ) : (
              <button
                type="button"
                onClick={openConnectModal}
                className="rounded-xl bg-[#6b8f71] px-5 py-3 text-sm font-semibold text-[#0f1410] transition hover:bg-[#7fa385]"
              >
                Connect Base wallet
              </button>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

function ConnectedWallet({
  address,
  chainName,
  wrongNetwork,
  onAccountClick,
  onChainClick,
}: {
  address: string;
  chainName: string;
  wrongNetwork: boolean;
  onAccountClick: () => void;
  onChainClick: () => void;
}) {
  const { data: balance } = useBalance({
    address: address as `0x${string}`,
    chainId: BASE_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={onChainClick}
        className="rounded-xl border border-[#3d4a3f] bg-[#141a16] px-3 py-2 text-sm text-[#c5cdc6] hover:bg-[#1a211c]"
      >
        {wrongNetwork ? "Switch to Base" : chainName}
      </button>
      <button
        type="button"
        onClick={onAccountClick}
        className="rounded-xl bg-[#1a211c] px-3 py-2 text-sm text-[#e8e4dc] hover:bg-[#202a23]"
      >
        <span className="mr-2 text-[#6b8f71]">
          {formatEth(balance?.value, balance?.decimals)}
        </span>
        {shortAddress(address)}
      </button>
    </div>
  );
}
