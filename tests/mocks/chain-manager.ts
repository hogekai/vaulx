import type { PublicClient } from "viem";
import type { ChainManager } from "../../src/chain/manager.js";
import type { Signer } from "../../src/signer/types.js";
import { createMockSigner, type MockSignerOptions } from "./signer.js";

export function createMockChainManager(
	signerOpts?: MockSignerOptions,
): ChainManager & { signer: Signer } {
	const signer = createMockSigner(signerOpts);

	return {
		signer,
		defaultChainId: 84532,

		chains() {
			return [
				{
					chainId: 84532,
					name: "base-sepolia",
					rpc: "https://sepolia.base.org",
					nativeCurrency: { symbol: "ETH", decimals: 18 },
					blockExplorer: "https://sepolia.basescan.org",
				},
			];
		},

		getPublicClient(_chainId: number): PublicClient {
			return {
				waitForTransactionReceipt: async () => ({ status: "success" }),
				getBalance: async () => signerOpts?.balance ?? 1_000_000_000_000_000_000n,
				readContract: async () => 0n,
				estimateGas: async () => 21000n,
				getGasPrice: async () => 1_000_000_000n,
				getTransactionCount: async () => 0,
			} as unknown as PublicClient;
		},

		async getSigner(_chainId: number): Promise<Signer> {
			return signer;
		},
	};
}
