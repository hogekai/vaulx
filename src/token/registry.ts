import { readFileSync } from "node:fs";
import { isSolanaChain } from "../config.js";

export interface TokenEntry {
	address: string;
	decimals: number;
	symbol: string;
	name: string;
}

const BUILTIN_TOKENS: Record<string, Record<string, TokenEntry>> = {
	"1": {
		USDC: {
			address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
			decimals: 6,
			symbol: "USDC",
			name: "USD Coin",
		},
		USDT: {
			address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
			decimals: 6,
			symbol: "USDT",
			name: "Tether USD",
		},
		DAI: {
			address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
			decimals: 18,
			symbol: "DAI",
			name: "Dai",
		},
		WETH: {
			address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
			decimals: 18,
			symbol: "WETH",
			name: "Wrapped Ether",
		},
	},
	"8453": {
		USDC: {
			address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			decimals: 6,
			symbol: "USDC",
			name: "USD Coin",
		},
		USDT: {
			address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
			decimals: 6,
			symbol: "USDT",
			name: "Tether USD",
		},
		DAI: {
			address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
			decimals: 18,
			symbol: "DAI",
			name: "Dai",
		},
		WETH: {
			address: "0x4200000000000000000000000000000000000006",
			decimals: 18,
			symbol: "WETH",
			name: "Wrapped Ether",
		},
	},
	"84532": {
		USDC: {
			address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
			decimals: 6,
			symbol: "USDC",
			name: "USD Coin",
		},
	},
	"11155111": {
		USDC: {
			address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
			decimals: 6,
			symbol: "USDC",
			name: "USD Coin",
		},
	},
	"solana-devnet": {
		USDC: {
			address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
			decimals: 6,
			symbol: "USDC",
			name: "USD Coin",
		},
	},
	solana: {
		USDC: {
			address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
			decimals: 6,
			symbol: "USDC",
			name: "USD Coin",
		},
		USDT: {
			address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
			decimals: 6,
			symbol: "USDT",
			name: "Tether USD",
		},
	},
};

export class TokenRegistry {
	private tokens: Record<string, Record<string, TokenEntry>>;

	constructor(customTokensPath?: string) {
		this.tokens = structuredClone(BUILTIN_TOKENS);
		if (customTokensPath) {
			try {
				const custom = JSON.parse(readFileSync(customTokensPath, "utf-8"));
				this.merge(custom);
			} catch (err) {
				console.error(
					`[vaulx] Failed to load custom tokens: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	resolve(chainId: string, symbol: string): TokenEntry | null {
		return this.tokens[chainId]?.[symbol.toUpperCase()] ?? null;
	}

	resolveByAddress(chainId: string, address: string): TokenEntry | null {
		const entries = this.tokens[chainId];
		if (!entries) return null;
		if (isSolanaChain(chainId)) {
			// Solana addresses are case-sensitive (Base58)
			return Object.values(entries).find((t) => t.address === address) ?? null;
		}
		// EVM addresses are case-insensitive
		const lower = address.toLowerCase();
		return Object.values(entries).find((t) => t.address.toLowerCase() === lower) ?? null;
	}

	list(chainId: string): TokenEntry[] {
		return Object.values(this.tokens[chainId] ?? {});
	}

	private merge(custom: Record<string, Record<string, Omit<TokenEntry, "symbol">>>) {
		for (const [chainIdStr, tokens] of Object.entries(custom)) {
			if (!this.tokens[chainIdStr]) this.tokens[chainIdStr] = {};
			for (const [symbol, entry] of Object.entries(tokens)) {
				this.tokens[chainIdStr][symbol.toUpperCase()] = {
					...entry,
					symbol: symbol.toUpperCase(),
				} as TokenEntry;
			}
		}
	}
}
