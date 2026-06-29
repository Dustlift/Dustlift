import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  base as baseWallet,
  coinbaseWallet,
  injectedWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, cookieStorage, createStorage } from "wagmi";
import { base } from "wagmi/chains";
import { isHex, stringToHex } from "viem";
import { APP_NAME } from "@/lib/constants";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID";
const builderCode = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE?.trim();
const dataSuffix = builderCode
  ? isHex(builderCode)
    ? builderCode
    : stringToHex(builderCode)
  : undefined;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Base",
      wallets: [
        baseWallet,
        injectedWallet,
        coinbaseWallet,
        walletConnectWallet,
      ],
    },
  ],
  {
    appName: APP_NAME,
    projectId,
  },
);

export const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  dataSuffix,
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [base.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
