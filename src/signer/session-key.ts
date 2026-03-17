import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSmartAccountClient } from "permissionless";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { getViemChain, getPublicClient } from "../client.js";
import type { Signer, TxParams } from "./types.js";

interface SessionKeySignerConfig {
  sessionKey: `0x${string}`;
  smartAccountAddress: `0x${string}`;
  chainId: number;
  bundlerUrl: string;
  paymasterUrl?: string;
}

export async function createSessionKeySigner(
  config: SessionKeySignerConfig,
): Promise<Signer> {
  const sessionOwner = privateKeyToAccount(config.sessionKey);
  const chain = getViemChain(config.chainId);

  const publicClient = getPublicClient(config.chainId);

  const pimlicoClient = createPimlicoClient({
    transport: http(config.bundlerUrl),
    chain,
  });

  // Use existing deployed smart account with session key as signer
  const kernelAccount = await toKernelSmartAccount({
    client: publicClient,
    owners: [sessionOwner],
    address: config.smartAccountAddress,
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

  return {
    mode: "session-key" as const,
    hasPaymaster: !!config.paymasterUrl,

    async getAddress(): Promise<`0x${string}`> {
      return config.smartAccountAddress;
    },

    async sendTransaction(params: TxParams): Promise<`0x${string}`> {
      // Session key limits are enforced on-chain by the validator module.
      // If limits are exceeded, the UserOp will revert at EntryPoint.
      const hash = await smartAccountClient.sendTransaction({
        to: params.to,
        value: params.value,
        data: params.data ?? "0x",
        chain,
      });
      return hash;
    },

    async signMessage(message: string): Promise<`0x${string}`> {
      return kernelAccount.signMessage({ message });
    },

    async getBalance(chainId: number): Promise<bigint> {
      const client = getPublicClient(chainId);
      return client.getBalance({ address: config.smartAccountAddress });
    },
  };
}
