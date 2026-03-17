import { createSmartAccountClient } from "permissionless";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getPublicClient, getViemChain } from "../client.js";
import { getBundlerUrl, getPaymasterUrl } from "../config.js";

interface SessionKeyResult {
	sessionKey: `0x${string}`;
	sessionAddress: `0x${string}`;
	smartAccountAddress: `0x${string}`;
}

export async function createSessionKey(
	ownerPrivateKey: `0x${string}`,
	smartAccountAddress: `0x${string}`,
	chainId: number,
): Promise<SessionKeyResult> {
	const owner = privateKeyToAccount(ownerPrivateKey);
	const chain = getViemChain(chainId);
	const publicClient = getPublicClient(chainId);
	const bundlerUrl = getBundlerUrl(chainId);
	const paymasterUrl = getPaymasterUrl(chainId);

	// Generate new session keypair
	const sessionPrivateKey = generatePrivateKey();
	const sessionAccount = privateKeyToAccount(sessionPrivateKey);

	console.error(`\nSession key address: ${sessionAccount.address}`);

	const pimlicoClient = createPimlicoClient({
		transport: http(bundlerUrl),
		chain,
	});

	const kernelAccount = await toKernelSmartAccount({
		client: publicClient,
		owners: [owner],
		address: smartAccountAddress,
		version: "0.3.1",
	});

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

	// TODO: Install Smart Sessions validator module and register session key
	// This requires the Smart Sessions module contract addresses and ABI encoding
	// which depend on the specific deployment of the ERC-7579 module registry.
	//
	// For now, session-key mode uses the session private key as the Kernel owner key.
	// Full on-chain session key registration will be added when Smart Sessions
	// module addresses are finalized for target testnets.

	console.error("Session key generated.");
	console.error(
		"Note: On-chain session key registration pending Smart Sessions module deployment.",
	);

	return {
		sessionKey: sessionPrivateKey,
		sessionAddress: sessionAccount.address,
		smartAccountAddress,
	};
}
