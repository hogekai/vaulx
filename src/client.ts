import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { baseSepolia, base, mainnet, sepolia } from "viem/chains";
import { getRpcUrl } from "./config.js";

const VIEM_CHAINS: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  84532: baseSepolia,
  11155111: sepolia,
};

export function getViemChain(chainId: number): Chain {
  const chain = VIEM_CHAINS[chainId];
  if (!chain) throw new Error(`No viem chain for chainId ${chainId}`);
  return chain;
}

export function getPublicClient(chainId: number): PublicClient {
  return createPublicClient({
    chain: getViemChain(chainId),
    transport: http(getRpcUrl(chainId)),
  });
}
