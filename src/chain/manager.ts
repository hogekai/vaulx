import { Connection } from "@solana/web3.js";
import type { PublicClient } from "viem";
import { getPublicClient } from "../client.js";
import {
	CHAINS,
	type ChainConfig,
	getDefaultChainId,
	getRpcUrl,
	getWalletMode,
	isSolanaChain,
} from "../config.js";
import { createSignerForChain } from "../signer/factory.js";
import type { Signer } from "../signer/types.js";

export interface ChainManager {
	chains(): (ChainConfig & { chainId: string })[];
	defaultChainId: string;
	getPublicClient(chainId: string): PublicClient;
	getConnection(chainId: string): Connection;
	getSigner(chainId: string): Promise<Signer>;
	/** Clear all cached signers. Next getSigner() creates fresh. */
	reset(): void;
}

export function createChainManager(): ChainManager {
	const clientCache = new Map<string, PublicClient>();
	const connectionCache = new Map<string, Connection>();
	const signerCache = new Map<string, Signer>();

	// For env/browser modes, one signer handles all chains (per family)
	let sharedEvmSigner: Signer | null = null;
	let sharedSolanaSigner: Signer | null = null;

	async function getOrCreateSigner(chainId: string): Promise<Signer> {
		if (isSolanaChain(chainId)) {
			if (!sharedSolanaSigner) {
				sharedSolanaSigner = await createSignerForChain(chainId);
			}
			return sharedSolanaSigner;
		}

		const mode = getWalletMode();

		// env and browser signers are chain-agnostic
		if (mode === "env" || mode === "browser") {
			if (!sharedEvmSigner) {
				sharedEvmSigner = await createSignerForChain(chainId);
			}
			return sharedEvmSigner;
		}

		// smart-account and session-key need per-chain instances
		const cached = signerCache.get(chainId);
		if (cached) return cached;

		const signer = await createSignerForChain(chainId);
		signerCache.set(chainId, signer);
		return signer;
	}

	return {
		get defaultChainId() {
			return getDefaultChainId();
		},

		chains() {
			return Object.entries(CHAINS).map(([id, config]) => ({
				...config,
				chainId: id,
			}));
		},

		getPublicClient(chainId: string): PublicClient {
			if (isSolanaChain(chainId)) {
				throw new Error(`getPublicClient() is not available for Solana chain ${chainId}. Use getConnection() instead.`);
			}
			const cached = clientCache.get(chainId);
			if (cached) return cached;
			const client = getPublicClient(chainId);
			clientCache.set(chainId, client);
			return client;
		},

		getConnection(chainId: string): Connection {
			if (!isSolanaChain(chainId)) {
				throw new Error(`getConnection() is not available for EVM chain ${chainId}. Use getPublicClient() instead.`);
			}
			const cached = connectionCache.get(chainId);
			if (cached) return cached;
			const connection = new Connection(getRpcUrl(chainId));
			connectionCache.set(chainId, connection);
			return connection;
		},

		async getSigner(chainId: string): Promise<Signer> {
			return getOrCreateSigner(chainId);
		},

		reset(): void {
			signerCache.clear();
			clientCache.clear();
			connectionCache.clear();
			sharedEvmSigner = null;
			sharedSolanaSigner = null;
		},
	};
}
