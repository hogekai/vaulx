import type { Connection } from "@solana/web3.js";
import type { PublicClient } from "viem";
import type { ChainManager } from "../../src/chain/manager.js";
import type { Signer } from "../../src/signer/types.js";
import { createMockSigner, type MockSignerOptions } from "./signer.js";

export interface MockChainManagerOptions {
	signer?: MockSignerOptions;
	defaultChainId?: string;
}

export function createMockChainManager(
	signerOrOpts?: MockSignerOptions | MockChainManagerOptions,
): ChainManager & { signer: Signer } {
	// Support both old (MockSignerOptions) and new (MockChainManagerOptions) signatures
	const opts: MockChainManagerOptions =
		signerOrOpts && "signer" in signerOrOpts
			? (signerOrOpts as MockChainManagerOptions)
			: { signer: signerOrOpts as MockSignerOptions | undefined };

	const signer = createMockSigner(opts.signer);
	const chainId = opts.defaultChainId ?? "84532";

	return {
		signer,
		defaultChainId: chainId,

		chains() {
			return [
				{
					chainId: "84532",
					name: "base-sepolia",
					rpc: "https://sepolia.base.org",
					nativeCurrency: { symbol: "ETH", decimals: 18 },
					blockExplorer: "https://sepolia.basescan.org",
				},
			];
		},

		getPublicClient(_chainId: string): PublicClient {
			return {
				waitForTransactionReceipt: async () => ({ status: "success" }),
				getBalance: async () => opts.signer?.balance ?? 1_000_000_000_000_000_000n,
				readContract: async () => 0n,
				estimateGas: async () => 21000n,
				getGasPrice: async () => 1_000_000_000n,
				getTransactionCount: async () => 0,
			} as unknown as PublicClient;
		},

		getConnection(_chainId: string): Connection {
			return {
				getLatestBlockhash: async () => ({
					blockhash: "mock-blockhash",
					lastValidBlockHeight: 100,
				}),
				getBalance: async () => opts.signer?.balance ?? 1_000_000_000,
				sendRawTransaction: async () => "mock-sig",
			} as unknown as Connection;
		},

		reset() {},

		async getSigner(_chainId: string): Promise<Signer> {
			return signer;
		},
	};
}
