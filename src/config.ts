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
  const envRpc = process.env.RPC_URL;
  if (envRpc && chainId === DEFAULT_CHAIN_ID) return envRpc;
  return getChain(chainId).rpc;
}

export const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;
export const DEFAULT_CHAIN_ID = Number(process.env.DEFAULT_CHAIN_ID) || 84532;
export const WALLET_PORT = Number(process.env.WALLET_PORT) || 18420;
export const WALLET_AUTH_TOKEN = process.env.WALLET_AUTH_TOKEN || "";
export const WALLET_POLICY = process.env.WALLET_POLICY || "";
export const WITHDRAW_TO = process.env.WITHDRAW_TO as `0x${string}` | undefined;
