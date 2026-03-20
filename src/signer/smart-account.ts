import { createSmartAccountClient } from "permissionless";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getPublicClient, getViemChain } from "../client.js";
import type { Signer, TxParams } from "./types.js";

interface SmartAccountSignerConfig {
	ownerPrivateKey: `0x${string}`;
	chainId: string;
	bundlerUrl: string;
	paymasterUrl?: string;
}

export async function createSmartAccountSigner(config: SmartAccountSignerConfig): Promise<Signer> {
	const owner = privateKeyToAccount(config.ownerPrivateKey);
	const chain = getViemChain(config.chainId);

	const publicClient = getPublicClient(config.chainId);

	const pimlicoClient = createPimlicoClient({
		transport: http(config.bundlerUrl),
		chain,
	});

	const kernelAccount = await toKernelSmartAccount({
		client: publicClient,
		owners: [owner],
		version: "0.3.1",
	});

	const smartAccountClient = createSmartAccountClient({
		account: kernelAccount,
		chain,
		bundlerTransport: http(config.bundlerUrl),
		paymaster: config.paymasterUrl
			? createPimlicoClient({
					transport: http(config.paymasterUrl),
					chain,
				})
			: undefined,
		userOperation: {
			estimateFeesPerGas: async () => {
				return (await pimlicoClient.getUserOperationGasPrice()).fast;
			},
		},
	});

	const accountAddress = kernelAccount.address;

	return {
		mode: "smart-account",
		hasPaymaster: !!config.paymasterUrl,

		async getAddress() {
			return accountAddress;
		},

		async sendTransaction(params: TxParams) {
			const hash = await smartAccountClient.sendTransaction({
				to: params.to as `0x${string}`,
				value: params.value,
				data: (params.data ?? "0x") as `0x${string}`,
				chain,
			});
			return hash;
		},

		async signMessage(message: string) {
			return kernelAccount.signMessage({ message });
		},

		async getBalance(chainId: string) {
			const client = getPublicClient(chainId);
			return client.getBalance({ address: accountAddress });
		},
	};
}
