import type { MCPServer } from "@lynq/lynq";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { DEFAULT_CHAIN_ID, resolveChainId } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { executeTx } from "../helpers/execute-tx.js";
import { validateAddress } from "../helpers/validate.js";
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
			try {
				const spender = validateAddress(args.spender);
				const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);
				const signer = await ctx.chainManager.getSigner(chainId);

				const token = ctx.tokenRegistry.resolve(chainId, args.token);
				if (!token) {
					throw new VaulxError(
						`Token "${args.token}" not found on chain ${chainId}`,
						"UNKNOWN_TOKEN",
					);
				}

				// Tool-specific: determine amount — never infinite
				let rawAmount: bigint;
				if (args.amount) {
					rawAmount = parseUnits(args.amount, token.decimals);
				} else if (ctx.policyGuard.policy.maxApproveAmount) {
					rawAmount = BigInt(ctx.policyGuard.policy.maxApproveAmount);
				} else {
					rawAmount = BigInt(ctx.policyGuard.policy.maxPerTx) * 10n;
				}

				// Tool-specific: encode approve
				const data = encodeFunctionData({
					abi: erc20Abi,
					functionName: "approve",
					args: [spender, rawAmount],
				});

				const result = await executeTx(
					{
						operation: "approve",
						txParams: { to: token.address, value: 0n, chainId, data },
						token: token.symbol,
					},
					{
						signer,
						policyGuard: ctx.policyGuard,
						txLog: ctx.txLog,
						chainManager: ctx.chainManager,
					},
				);

				return c.json({
					...result,
					spender,
					token: token.symbol,
					amount: args.amount ?? "policy default",
				});
			} catch (e) {
				if (e instanceof VaulxError) {
					return c.error(`[${e.code}] ${e.message}`);
				}
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}
