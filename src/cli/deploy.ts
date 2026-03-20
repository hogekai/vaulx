import { createSmartAccountClient } from "permissionless";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getPublicClient, getViemChain } from "../client.js";
import { getBundlerUrl, getPaymasterUrl } from "../config.js";

interface DeployResult {
	smartAccountAddress: `0x${string}`;
	ownerAddress: `0x${string}`;
	chainId: string;
	deployed: boolean;
}

export async function deploySmartAccount(
	privateKey: `0x${string}`,
	chainId: string,
): Promise<DeployResult> {
	const owner = privateKeyToAccount(privateKey);
	const chain = getViemChain(chainId);
	const publicClient = getPublicClient(chainId);
	const bundlerUrl = getBundlerUrl(chainId);
	const paymasterUrl = getPaymasterUrl(chainId);

	console.error(`\nOwner EOA: ${owner.address}`);
	console.error(`Chain: ${chain.name} (${chainId})`);

	const pimlicoClient = createPimlicoClient({
		transport: http(bundlerUrl),
		chain,
	});

	const kernelAccount = await toKernelSmartAccount({
		client: publicClient,
		owners: [owner],
		version: "0.3.1",
	});

	console.error(`Smart account address: ${kernelAccount.address}`);

	// Check if already deployed
	const code = await publicClient.getCode({ address: kernelAccount.address });
	if (code && code !== "0x") {
		console.error("Smart account already deployed.");
		return {
			smartAccountAddress: kernelAccount.address,
			ownerAddress: owner.address,
			chainId,
			deployed: false,
		};
	}

	console.error("Deploying smart account...");

	const smartAccountClient = createSmartAccountClient({
		account: kernelAccount,
		chain,
		bundlerTransport: http(bundlerUrl),
		paymaster: createPimlicoClient({
			transport: http(paymasterUrl),
			chain,
		}),
		userOperation: {
			estimateFeesPerGas: async () => {
				return (await pimlicoClient.getUserOperationGasPrice()).fast;
			},
		},
	});

	// Send empty tx to self to trigger initCode deployment
	// Paymaster sponsors gas on testnet
	const hash = await smartAccountClient.sendTransaction({
		to: kernelAccount.address,
		value: 0n,
		data: "0x",
		chain,
	});

	console.error(`Deploy tx: ${hash}`);
	console.error("Smart account deployed successfully!");

	return {
		smartAccountAddress: kernelAccount.address,
		ownerAddress: owner.address,
		chainId,
		deployed: true,
	};
}
