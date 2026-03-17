import { readFileSync } from "node:fs";

export interface TokenEntry {
	address: `0x${string}`;
	decimals: number;
	symbol: string;
	name: string;
}

const BUILTIN_TOKENS: Record<number, Record<string, TokenEntry>> = {
	1: {
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
	8453: {
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
	84532: {
		USDC: {
			address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
			decimals: 6,
			symbol: "USDC",
			name: "USD Coin",
		},
	},
	11155111: {
		USDC: {
			address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
			decimals: 6,
			symbol: "USDC",
			name: "USD Coin",
		},
	},
};

export class TokenRegistry {
	private tokens: Record<number, Record<string, TokenEntry>>;

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

	resolve(chainId: number, symbol: string): TokenEntry | null {
		return this.tokens[chainId]?.[symbol.toUpperCase()] ?? null;
	}

	resolveByAddress(chainId: number, address: `0x${string}`): TokenEntry | null {
		const entries = this.tokens[chainId];
		if (!entries) return null;
		const lower = address.toLowerCase();
		return Object.values(entries).find((t) => t.address.toLowerCase() === lower) ?? null;
	}

	list(chainId: number): TokenEntry[] {
		return Object.values(this.tokens[chainId] ?? {});
	}

	private merge(custom: Record<string, Record<string, Omit<TokenEntry, "symbol">>>) {
		for (const [chainIdStr, tokens] of Object.entries(custom)) {
			const chainId = Number(chainIdStr);
			if (!this.tokens[chainId]) this.tokens[chainId] = {};
			for (const [symbol, entry] of Object.entries(tokens)) {
				this.tokens[chainId][symbol.toUpperCase()] = {
					...entry,
					symbol: symbol.toUpperCase(),
				} as TokenEntry;
			}
		}
	}
}
