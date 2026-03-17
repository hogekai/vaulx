export interface ChainConfig {
  name: string;
  rpc: string;
  nativeCurrency: { symbol: string; decimals: number };
  blockExplorer?: string;
}

export const CHAINS: Record<number, ChainConfig> = {
  1: {
    name: "ethereum",
    rpc: "https://eth.llamarpc.com",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    blockExplorer: "https://etherscan.io",
  },
  8453: {
    name: "base",
    rpc: "https://mainnet.base.org",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    blockExplorer: "https://basescan.org",
  },
  84532: {
    name: "base-sepolia",
    rpc: "https://sepolia.base.org",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    blockExplorer: "https://sepolia.basescan.org",
  },
  11155111: {
    name: "sepolia",
    rpc: "https://rpc.sepolia.org",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    blockExplorer: "https://sepolia.etherscan.io",
  },
};

export const NETWORK_ALIASES: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  "base-sepolia": 84532,
  sepolia: 11155111,
};

export function resolveChainId(input: string | number | undefined): number {
  if (input === undefined) return DEFAULT_CHAIN_ID;
  if (typeof input === "number") return input;
  const alias = NETWORK_ALIASES[input];
  if (alias !== undefined) return alias;
  const parsed = Number(input);
  if (!Number.isNaN(parsed)) return parsed;
  throw new Error(`Unknown chain: ${input}`);
}

export function getChain(chainId: number): ChainConfig {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`);
  return chain;
}

export function getRpcUrl(chainId: number): string {
  const perChain = process.env[`RPC_URL_${chainId}`];
  if (perChain) return perChain;
  const envRpc = process.env.RPC_URL;
  if (envRpc && chainId === DEFAULT_CHAIN_ID) return envRpc;
  return getChain(chainId).rpc;
}

// Pimlico chain name mapping
const PIMLICO_CHAINS: Record<number, string> = {
  1: "ethereum",
  8453: "base",
  84532: "base-sepolia",
  11155111: "sepolia",
};

export function getPimlicoUrl(chainId: number): string {
  if (!PIMLICO_API_KEY) {
    throw new Error("PIMLICO_API_KEY required for smart account mode");
  }
  const chainName = PIMLICO_CHAINS[chainId];
  if (!chainName) {
    throw new Error(`Pimlico does not support chainId ${chainId}`);
  }
  return `https://api.pimlico.io/v2/${chainName}/rpc?apikey=${PIMLICO_API_KEY}`;
}

export function getBundlerUrl(chainId: number): string {
  return BUNDLER_URL || getPimlicoUrl(chainId);
}

export function getPaymasterUrl(chainId: number): string {
  return PAYMASTER_URL || getPimlicoUrl(chainId);
}

// Environment variables
export const PRIVATE_KEY = process.env.PRIVATE_KEY as
  | `0x${string}`
  | undefined;
export const DEFAULT_CHAIN_ID = Number(process.env.DEFAULT_CHAIN_ID) || 84532;
export const WALLET_PORT = Number(process.env.WALLET_PORT) || 18420;
export const WALLET_AUTH_TOKEN = process.env.WALLET_AUTH_TOKEN || "";
export const WALLET_POLICY = process.env.WALLET_POLICY || "";
export const WITHDRAW_TO = process.env.WITHDRAW_TO as
  | `0x${string}`
  | undefined;
export const WALLET_MODE = (process.env.WALLET_MODE || "env") as
  | "env"
  | "browser"
  | "smart-account"
  | "session-key";
export const WALLET_STORE = (process.env.WALLET_STORE || "sqlite") as
  | "memory"
  | "sqlite";
export const WALLET_DB = process.env.WALLET_DB || "./vaulx.db";
export const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY || "";
export const SMART_ACCOUNT_ADDRESS = process.env.SMART_ACCOUNT_ADDRESS as
  | `0x${string}`
  | undefined;
export const SESSION_KEY = process.env.SESSION_KEY as
  | `0x${string}`
  | undefined;
export const BUNDLER_URL = process.env.BUNDLER_URL || "";
export const PAYMASTER_URL = process.env.PAYMASTER_URL || "";
export const CUSTOM_TOKENS = process.env.CUSTOM_TOKENS || "";
export const ENABLE_SWAP = process.env.ENABLE_SWAP === "true";
