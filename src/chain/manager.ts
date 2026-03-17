import type { PublicClient } from "viem";
import { getPublicClient } from "../client.js";
import {
  CHAINS,
  type ChainConfig,
  DEFAULT_CHAIN_ID,
  WALLET_MODE,
  PRIVATE_KEY,
  WALLET_PORT,
  PIMLICO_API_KEY,
  SESSION_KEY,
  SMART_ACCOUNT_ADDRESS,
  getBundlerUrl,
  getPaymasterUrl,
} from "../config.js";
import type { Signer } from "../signer/types.js";
import { createEnvSigner } from "../signer/env.js";
import { createBrowserSigner } from "../signer/browser.js";
import { createSmartAccountSigner } from "../signer/smart-account.js";
import { createSessionKeySigner } from "../signer/session-key.js";

export interface ChainManager {
  chains(): ChainConfig[];
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
        sharedSigner =
          WALLET_MODE === "browser"
            ? createBrowserSigner(WALLET_PORT)
            : createEnvSigner();
      }
      return sharedSigner;
    }

    // smart-account and session-key need per-chain instances
    const cached = signerCache.get(chainId);
    if (cached) return cached;

    let signer: Signer;
    if (WALLET_MODE === "smart-account") {
      if (!PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY required for smart-account mode");
      }
      signer = await createSmartAccountSigner({
        ownerPrivateKey: PRIVATE_KEY,
        chainId,
        bundlerUrl: getBundlerUrl(chainId),
        paymasterUrl: PIMLICO_API_KEY
          ? getPaymasterUrl(chainId)
          : undefined,
      });
    } else {
      // session-key
      if (!SESSION_KEY) {
        throw new Error("SESSION_KEY required for session-key mode");
      }
      if (!SMART_ACCOUNT_ADDRESS) {
        throw new Error(
          "SMART_ACCOUNT_ADDRESS required for session-key mode",
        );
      }
      signer = await createSessionKeySigner({
        sessionKey: SESSION_KEY,
        smartAccountAddress: SMART_ACCOUNT_ADDRESS,
        chainId,
        bundlerUrl: getBundlerUrl(chainId),
        paymasterUrl: PIMLICO_API_KEY
          ? getPaymasterUrl(chainId)
          : undefined,
      });
    }

    signerCache.set(chainId, signer);
    return signer;
  }

  return {
    defaultChainId: DEFAULT_CHAIN_ID,

    chains(): ChainConfig[] {
      return Object.entries(CHAINS).map(([id, config]) => ({
        ...config,
        chainId: Number(id),
      })) as any;
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
