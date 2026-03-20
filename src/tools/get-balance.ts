import type { MCPServer } from "@lynq/lynq";
import { erc20Abi, formatEther, formatUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { getChain, isSolanaChain, resolveChainId } from "../config.js";
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
				"Get wallet balance. Returns native token and all registered token balances.",
			input: z.object({
				chainId: z
					.union([z.string(), z.number()])
					.optional()
					.describe("Chain ID or network alias"),
				network: z.string().optional().describe("Network alias (e.g. 'base-sepolia', 'solana-devnet')"),
			}),
		},
		async (args, c) => {
			const chainId = resolveChainId(args.chainId ?? args.network);
			const chain = getChain(chainId);
			const signer = await ctx.chainManager.getSigner(chainId);
			const address = await signer.getAddress();

			const nativeBalance = await signer.getBalance(chainId);
			const nativeFormatted = isSolanaChain(chainId)
				? formatUnits(nativeBalance, 9)
				: formatEther(nativeBalance);

			const balances: Array<{
				symbol: string;
				name: string;
				balance: string;
				type: "native" | "token";
			}> = [
				{
					symbol: chain.nativeCurrency.symbol,
					name: chain.nativeCurrency.symbol,
					balance: nativeFormatted,
					type: "native",
				},
			];

			const tokens = ctx.tokenRegistry.list(chainId);

			if (isSolanaChain(chainId)) {
				// SPL token balances via Solana RPC
				try {
					const { PublicKey } = await import("@solana/web3.js");
					const { getAccount, getAssociatedTokenAddress } = await import("@solana/spl-token");
					const connection = ctx.chainManager.getConnection(chainId);
					const ownerPubkey = new PublicKey(address);

					for (const token of tokens) {
						try {
							const mintPubkey = new PublicKey(token.address);
							const ata = await getAssociatedTokenAddress(mintPubkey, ownerPubkey);
							const account = await getAccount(connection, ata);
							const bal = account.amount;
							if (bal > 0n) {
								balances.push({
									symbol: token.symbol,
									name: token.name,
									balance: formatUnits(bal, token.decimals),
									type: "token",
								});
							}
						} catch {
							// Token account doesn't exist or other error — skip
						}
					}
				} catch {
					// Solana imports failed — skip token balances
				}
			} else {
				// ERC20 token balances via viem
				const pub = ctx.chainManager.getPublicClient(chainId);
				for (const token of tokens) {
					try {
						const bal = await pub.readContract({
							address: token.address as `0x${string}`,
							abi: erc20Abi,
							functionName: "balanceOf",
							args: [address as `0x${string}`],
						});
						if ((bal as bigint) > 0n) {
							balances.push({
								symbol: token.symbol,
								name: token.name,
								balance: formatUnits(bal as bigint, token.decimals),
								type: "token",
							});
						}
					} catch {
						// Contract call failed — skip token
					}
				}
			}

			return c.json({ chainId, network: chain.name, address, balances });
		},
	);
}
