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
export const MINT_ROLE = keccak256(stringToHex("MINT_ROLE"));

export const b20ActivationRegistryAbi = [
  {
    type: "function",
    name: "isActivated",
    stateMutability: "view",
    inputs: [{ name: "feature", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const b20FactoryAbi = [
  {
    type: "function",
    name: "createB20",
    stateMutability: "payable",
    inputs: [
      { name: "variant", type: "uint8" },
      { name: "salt", type: "bytes32" },
      { name: "params", type: "bytes" },
      { name: "initCalls", type: "bytes[]" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
  {
    type: "function",
    name: "getB20Address",
    stateMutability: "view",
    inputs: [
      { name: "variant", type: "uint8" },
      { name: "sender", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const b20AssetAbi = [
  {
    type: "function",
    name: "grantRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateSupplyCap",
    stateMutability: "nonpayable",
    inputs: [{ name: "newSupplyCap", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "batchMint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipients", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;
