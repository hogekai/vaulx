import type { MCPServer } from "@lynq/lynq";
import { erc20Abi, formatEther, formatUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { DEFAULT_CHAIN_ID, getChain, resolveChainId } from "../config.js";
import type { TokenRegistry } from "../token/registry.js";

interface GetBalanceCtx {
	chainManager: ChainManager;
	tokenRegistry: TokenRegistry;
}

export function registerGetBalance(server: MCPServer, ctx: GetBalanceCtx) {
	server.tool(
		"get_balance",
		{
			description:
				"Get wallet balance. Returns native token (ETH) and all registered ERC20 token balances.",
			input: z.object({
				chainId: z
					.union([z.string(), z.number()])
					.optional()
					.describe("Chain ID or network alias (default: Base Sepolia)"),
				network: z.string().optional().describe("Network alias (e.g. 'base-sepolia')"),
			}),
		},
		async (args, c) => {
			const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);
			const chain = getChain(chainId);
			const signer = await ctx.chainManager.getSigner(chainId);
			const address = await signer.getAddress();
			const pub = ctx.chainManager.getPublicClient(chainId);

			const nativeBalance = await signer.getBalance(chainId);
			const balances: Array<{
				symbol: string;
				name: string;
				balance: string;
				type: "native" | "erc20";
			}> = [
				{
					symbol: chain.nativeCurrency.symbol,
					name: "Ether",
					balance: formatEther(nativeBalance),
					type: "native",
				},
			];

			const tokens = ctx.tokenRegistry.list(chainId);
			for (const token of tokens) {
				try {
					const bal = await pub.readContract({
						address: token.address,
						abi: erc20Abi,
						functionName: "balanceOf",
						args: [address],
					});
					if (bal > 0n) {
						balances.push({
							symbol: token.symbol,
							name: token.name,
							balance: formatUnits(bal, token.decimals),
							type: "erc20",
						});
					}
				} catch {
					// Contract call failed — skip token
				}
			}

			return c.json({ chainId, network: chain.name, address, balances });
		},
	);
}
