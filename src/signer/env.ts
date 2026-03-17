import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base, mainnet, sepolia } from "viem/chains";
import { PRIVATE_KEY, getRpcUrl } from "../config.js";
import type { Signer, TxParams } from "./types.js";

const VIEM_CHAINS: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  84532: baseSepolia,
  11155111: sepolia,
};

function getViemChain(chainId: number): Chain {
  const chain = VIEM_CHAINS[chainId];
  if (!chain) throw new Error(`No viem chain for chainId ${chainId}`);
  return chain;
}

class NonceManager {
  private pending: bigint | null = null;

  async next(
    address: `0x${string}`,
    getCount: () => Promise<number>,
  ): Promise<number> {
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

  function getPublicClient(chainId: number) {
    return createPublicClient({
      chain: getViemChain(chainId),
      transport: http(getRpcUrl(chainId)),
    });
  }

  function getWalletClient(chainId: number) {
    return createWalletClient({
      account,
      chain: getViemChain(chainId),
      transport: http(getRpcUrl(chainId)),
    });
  }

  return {
    address: account.address,

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
