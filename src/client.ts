import { type Chain, createPublicClient, http, type PublicClient } from "viem";
import { base, baseSepolia, mainnet, sepolia } from "viem/chains";
import { getRpcUrl, numericChainId } from "./config.js";

const VIEM_CHAINS: Record<number, Chain> = {
	1: mainnet,
	8453: base,
	84532: baseSepolia,
	11155111: sepolia,
};

export function getViemChain(chainId: string): Chain {
	const n = numericChainId(chainId);
	const chain = VIEM_CHAINS[n];
	if (!chain) throw new Error(`No viem chain for chainId ${chainId}`);
	return chain;
}

export function getPublicClient(chainId: string): PublicClient {
	return createPublicClient({
		chain: getViemChain(chainId),
		transport: http(getRpcUrl(chainId)),
	});
}
