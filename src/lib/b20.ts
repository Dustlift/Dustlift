import { keccak256, stringToHex } from "viem";

export const B20_FACTORY_ADDRESS =
  "0xB20f000000000000000000000000000000000000" as const;

export const B20_ACTIVATION_REGISTRY_ADDRESS =
  "0x8453000000000000000000000000000000000001" as const;

export const B20_POLICY_REGISTRY_ADDRESS =
  "0x8453000000000000000000000000000000000002" as const;

export const B20_ASSET_FEATURE_ID = keccak256(stringToHex("base.b20_asset"));
export const B20_STABLECOIN_FEATURE_ID = keccak256(
  stringToHex("base.b20_stablecoin"),
);

export const b20ActivationRegistryAbi = [
  {
    type: "function",
    name: "isActivated",
    stateMutability: "view",
    inputs: [{ name: "feature", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
