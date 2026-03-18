import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getPublicClient, getViemChain } from "../client.js";
import { getRpcUrl, PRIVATE_KEY } from "../config.js";
import type { Signer, TxParams } from "./types.js";

export class NonceManager {
	private pending: bigint | null = null;

	async next(_address: `0x${string}`, getCount: () => Promise<number>): Promise<number> {
		if (this.pending !== null) {
			this.pending += 1n;
			return Number(this.pending);
		}
		const nonce = await getCount();
		this.pending = BigInt(nonce);
		return Number(this.pending);
	}

	reset() {
		this.pending = null;
	}
}

export function createEnvSigner(): Signer {
	if (!PRIVATE_KEY) {
		throw new Error("PRIVATE_KEY environment variable is required");
	}

	const account = privateKeyToAccount(PRIVATE_KEY);
	const nonces = new NonceManager();

	function getWalletClient(chainId: number) {
		return createWalletClient({
			account,
			chain: getViemChain(chainId),
			transport: http(getRpcUrl(chainId)),
		});
	}

	return {
		mode: "env" as const,
		hasPaymaster: false,

		async getAddress(): Promise<`0x${string}`> {
			return account.address;
		},

		async sendTransaction(params: TxParams): Promise<`0x${string}`> {
			const pub = getPublicClient(params.chainId);
			const wallet = getWalletClient(params.chainId);

			const nonce = await nonces.next(account.address, () =>
				pub.getTransactionCount({
					address: account.address,
					blockTag: "pending",
				}),
			);
			try {
				const hash = await wallet.sendTransaction({
					to: params.to,
					value: params.value,
					data: params.data,
					nonce,
					chain: getViemChain(params.chainId),
				});
				return hash;
			} catch (err) {
				nonces.reset();
				throw err;
			}
		},

		async signMessage(message: string): Promise<`0x${string}`> {
			return account.signMessage({ message });
		},

		async getBalance(chainId: number): Promise<bigint> {
			const client = getPublicClient(chainId);
			return client.getBalance({ address: account.address });
		},
	};
}
