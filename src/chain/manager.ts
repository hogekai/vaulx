import type { PublicClient } from "viem";
import { getPublicClient } from "../client.js";
import { CHAINS, type ChainConfig, DEFAULT_CHAIN_ID, WALLET_MODE } from "../config.js";
import { createSignerForChain } from "../signer/factory.js";
import type { Signer } from "../signer/types.js";

export interface ChainManager {
	chains(): (ChainConfig & { chainId: number })[];
	defaultChainId: number;
	getPublicClient(chainId: number): PublicClient;
	getSigner(chainId: number): Promise<Signer>;
}

export function createChainManager(): ChainManager {
	const clientCache = new Map<number, PublicClient>();
	const signerCache = new Map<number, Signer>();

	// For env/browser modes, one signer handles all chains
	let sharedSigner: Signer | null = null;

	async function getOrCreateSigner(chainId: number): Promise<Signer> {
		// env and browser signers are chain-agnostic
		if (WALLET_MODE === "env" || WALLET_MODE === "browser") {
			if (!sharedSigner) {
				sharedSigner = await createSignerForChain(chainId);
			}
			return sharedSigner;
		}

		// smart-account and session-key need per-chain instances
		const cached = signerCache.get(chainId);
		if (cached) return cached;

		const signer = await createSignerForChain(chainId);
		signerCache.set(chainId, signer);
		return signer;
	}

	return {
		defaultChainId: DEFAULT_CHAIN_ID,

		chains() {
			return Object.entries(CHAINS).map(([id, config]) => ({
				...config,
				chainId: Number(id),
			}));
		},

		getPublicClient(chainId: number): PublicClient {
			const cached = clientCache.get(chainId);
			if (cached) return cached;
			const client = getPublicClient(chainId);
			clientCache.set(chainId, client);
			return client;
		},

		async getSigner(chainId: number): Promise<Signer> {
			return getOrCreateSigner(chainId);
		},
	};
}
