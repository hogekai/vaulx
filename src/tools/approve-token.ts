import type { MCPServer } from "@lynq/lynq";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { DEFAULT_CHAIN_ID, getChain, resolveChainId } from "../config.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import type { TxLog } from "../log/tx-log.js";
import type { TokenRegistry } from "../token/registry.js";

interface ApproveTokenCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
	tokenRegistry: TokenRegistry;
}

export function registerApproveToken(server: MCPServer, ctx: ApproveTokenCtx) {
	server.tool(
		"approve_token",
		{
			description: "Approve a spender to transfer ERC20 tokens. Never uses infinite approval.",
			input: z.object({
				spender: z.string().describe("Spender contract address (0x...)"),
				token: z.string().describe("Token symbol (e.g. 'USDC')"),
				amount: z
					.string()
					.optional()
					.describe("Amount to approve in token units. Defaults to policy maxApproveAmount."),
				chainId: z.union([z.string(), z.number()]).optional().describe("Chain ID or network alias"),
				network: z.string().optional().describe("Network alias (e.g. 'base')"),
			}),
		},
		async (args, c) => {
			const spender = args.spender as `0x${string}`;
			const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);
			const signer = await ctx.chainManager.getSigner(chainId);

			const token = ctx.tokenRegistry.resolve(chainId, args.token);
			if (!token) {
				return c.error(`Token "${args.token}" not found on chain ${chainId}.`);
			}

			// Determine amount — never infinite
			let rawAmount: bigint;
			if (args.amount) {
				rawAmount = parseUnits(args.amount, token.decimals);
			} else if (ctx.policyGuard.policy.maxApproveAmount) {
				rawAmount = BigInt(ctx.policyGuard.policy.maxApproveAmount);
			} else {
				// Default: maxPerTx * 10
				rawAmount = BigInt(ctx.policyGuard.policy.maxPerTx) * 10n;
			}

			// Policy check
			const check = await ctx.policyGuard.check("approve", {
				value: rawAmount,
				to: spender,
				chainId,
				token: args.token.toUpperCase(),
			});
			if (!check.ok) {
				return c.error(`Policy rejected: ${check.reason}`);
			}

			const data = encodeFunctionData({
				abi: erc20Abi,
				functionName: "approve",
				args: [spender, rawAmount],
			});

			const hash = await signer.sendTransaction({
				to: token.address,
				value: 0n,
				chainId,
				data,
			});

			await ctx.txLog.record({
				hash,
				chainId,
				to: spender,
				value: rawAmount.toString(),
				token: token.symbol,
				operation: "approve",
				timestamp: new Date().toISOString(),
				status: "sent",
			});

			const chain = getChain(chainId);
			return c.json({
				hash,
				spender,
				token: token.symbol,
				amount: args.amount ?? "policy default",
				chainId,
				explorer: chain.blockExplorer ? `${chain.blockExplorer}/tx/${hash}` : undefined,
			});
		},
	);
}
