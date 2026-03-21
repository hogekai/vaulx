export interface ChainConfig {
	name: string;
	rpc: string;
	nativeCurrency: { symbol: string; decimals: number };
	blockExplorer?: string;
}

export const CHAINS: Record<string, ChainConfig> = {
	"1": {
		name: "ethereum",
		rpc: "https://eth.llamarpc.com",
		nativeCurrency: { symbol: "ETH", decimals: 18 },
		blockExplorer: "https://etherscan.io",
	},
	"8453": {
		name: "base",
		rpc: "https://mainnet.base.org",
		nativeCurrency: { symbol: "ETH", decimals: 18 },
		blockExplorer: "https://basescan.org",
	},
	"84532": {
		name: "base-sepolia",
		rpc: "https://sepolia.base.org",
		nativeCurrency: { symbol: "ETH", decimals: 18 },
		blockExplorer: "https://sepolia.basescan.org",
	},
	"11155111": {
		name: "sepolia",
		rpc: "https://rpc.sepolia.org",
		nativeCurrency: { symbol: "ETH", decimals: 18 },
		blockExplorer: "https://sepolia.etherscan.io",
	},
	solana: {
		name: "solana",
		rpc: "https://api.mainnet-beta.solana.com",
		nativeCurrency: { symbol: "SOL", decimals: 9 },
		blockExplorer: "https://explorer.solana.com",
	},
	"solana-devnet": {
		name: "solana-devnet",
		rpc: "https://api.devnet.solana.com",
		nativeCurrency: { symbol: "SOL", decimals: 9 },
		blockExplorer: "https://explorer.solana.com/?cluster=devnet",
	},
};

export const NETWORK_ALIASES: Record<string, string> = {
	ethereum: "1",
	base: "8453",
	"base-sepolia": "84532",
	sepolia: "11155111",
	solana: "solana",
	"solana-devnet": "solana-devnet",
};

export function resolveChainId(input: string | number | undefined): string {
	if (input === undefined) return getDefaultChainId();
	const s = String(input);
	const alias = NETWORK_ALIASES[s];
	if (alias !== undefined) return alias;
	// If it's already a known chain key, return as-is
	if (CHAINS[s]) return s;
	throw new Error(`Unknown chain: ${input}`);
}

export function getChain(chainId: string): ChainConfig {
	const chain = CHAINS[chainId];
	if (!chain) throw new Error(`Unsupported chain: ${chainId}`);
	return chain;
}

export function getRpcUrl(chainId: string): string {
	const perChain = process.env[`RPC_URL_${chainId}`];
	if (perChain) return perChain;
	if (isSolanaChain(chainId)) {
		const solRpc = process.env.SOLANA_RPC_URL;
		if (solRpc && chainId === getDefaultChainId()) return solRpc;
	} else {
		const envRpc = process.env.RPC_URL;
		if (envRpc && chainId === getDefaultChainId()) return envRpc;
	}
	return getChain(chainId).rpc;
}

/** Convert string chainId to numeric (for EVM libraries like viem). Throws for non-numeric chains. */
export function numericChainId(chainId: string): number {
	const n = Number.parseInt(chainId, 10);
	if (Number.isNaN(n)) throw new Error(`Chain ${chainId} has no numeric ID (not an EVM chain)`);
	return n;
}

export function isSolanaChain(chainId: string): boolean {
	return chainId.startsWith("solana");
}

// Pimlico chain name mapping
const PIMLICO_CHAINS: Record<string, string> = {
	"1": "ethereum",
	"8453": "base",
	"84532": "base-sepolia",
	"11155111": "sepolia",
};

export function getPimlicoUrl(chainId: string): string {
	if (!PIMLICO_API_KEY) {
		throw new Error("PIMLICO_API_KEY required for smart account mode");
	}
	const chainName = PIMLICO_CHAINS[chainId];
	if (!chainName) {
		throw new Error(`Pimlico does not support chain ${chainId}`);
	}
	return `https://api.pimlico.io/v2/${chainName}/rpc?apikey=${PIMLICO_API_KEY}`;
}

export function getBundlerUrl(chainId: string): string {
	return BUNDLER_URL || getPimlicoUrl(chainId);
}

export function getPaymasterUrl(chainId: string): string {
	return PAYMASTER_URL || getPimlicoUrl(chainId);
}

// Environment variables
export const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;
export const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY || "";
export const DEFAULT_CHAIN_ID = process.env.DEFAULT_CHAIN_ID || "84532";
export const WALLET_PORT = Number(process.env.WALLET_PORT) || 18420;
export const WALLET_AUTH_TOKEN = process.env.WALLET_AUTH_TOKEN || "";
export const WALLET_POLICY = process.env.WALLET_POLICY || "";
export const WITHDRAW_TO = process.env.WITHDRAW_TO as `0x${string}` | undefined;
export const WALLET_MODE = (process.env.WALLET_MODE || "env") as
	| "env"
	| "browser"
	| "smart-account"
	| "session-key";
export const WALLET_STORE = (process.env.WALLET_STORE || "sqlite") as "memory" | "sqlite";
export const WALLET_DB = process.env.WALLET_DB || "./vaulx.db";
export const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY || "";
export const SMART_ACCOUNT_ADDRESS = process.env.SMART_ACCOUNT_ADDRESS as `0x${string}` | undefined;
export const SESSION_KEY = process.env.SESSION_KEY as `0x${string}` | undefined;
export const BUNDLER_URL = process.env.BUNDLER_URL || "";
export const PAYMASTER_URL = process.env.PAYMASTER_URL || "";
export const CUSTOM_TOKENS = process.env.CUSTOM_TOKENS || "";
export const ENABLE_SWAP = process.env.ENABLE_SWAP === "true";
export const EXPLORER_API_KEY = process.env.EXPLORER_API_KEY || "";
export const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
export const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

// Dynamic getters — read process.env at call time (for hot-swap after wallet switch)
export function getWalletMode() {
	return (process.env.WALLET_MODE || "env") as "env" | "browser" | "smart-account" | "session-key";
}
export function getPrivateKey() {
	return process.env.PRIVATE_KEY as `0x${string}` | undefined;
}
export function getDefaultChainId(): string {
	return process.env.DEFAULT_CHAIN_ID || "84532";
}
export function getSessionKey() {
	return process.env.SESSION_KEY as `0x${string}` | undefined;
}
export function getSmartAccountAddress() {
	return process.env.SMART_ACCOUNT_ADDRESS as `0x${string}` | undefined;
}
export function getPimlicoApiKey() {
	return process.env.PIMLICO_API_KEY || "";
}
export function getSolanaPrivateKey() {
	return process.env.SOLANA_PRIVATE_KEY || "";
}

export function validateConfig(): void {
	const errors: string[] = [];

	if (WALLET_MODE === "env" && !PRIVATE_KEY && !process.env.SOLANA_PRIVATE_KEY) {
		errors.push("At least one of PRIVATE_KEY or SOLANA_PRIVATE_KEY is required for env mode");
	}
	if (WALLET_MODE === "smart-account" && !PRIVATE_KEY) {
		errors.push("PRIVATE_KEY is required for smart-account mode");
	}
	if ((WALLET_MODE === "smart-account" || WALLET_MODE === "session-key") && !PIMLICO_API_KEY) {
		errors.push(`PIMLICO_API_KEY is required for ${WALLET_MODE} mode`);
	}
	if (WALLET_MODE === "session-key" && !SESSION_KEY) {
		errors.push("SESSION_KEY is required for session-key mode");
	}
	if (WALLET_MODE === "session-key" && !SMART_ACCOUNT_ADDRESS) {
		errors.push("SMART_ACCOUNT_ADDRESS is required for session-key mode");
	}

	if (errors.length > 0) {
		for (const e of errors) console.error(`\u274c ${e}`);
		process.exit(1);
	}
}
