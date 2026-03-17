import type { MCPServer } from "@lynq/lynq";
import { formatEther, parseEther } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { DEFAULT_CHAIN_ID, resolveChainId } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { executeTx } from "../helpers/execute-tx.js";
import { validateAddress, validateAmount } from "../helpers/validate.js";
import type { TxLog } from "../log/tx-log.js";

interface SendTransactionCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
}

export function registerSendTransaction(server: MCPServer, ctx: SendTransactionCtx) {
	server.tool(
		"send_transaction",
		{
			description: "Send native token (ETH) on an EVM chain. Returns tx hash and explorer link.",
			input: z
				.object({
					to: z.string().optional().describe("Recipient address (0x...)"),
					recipient: z.string().optional().describe("Alias for 'to' (agentPayment compat)"),
					value: z.string().optional().describe("Amount in ETH (e.g. '0.01')"),
					amount: z.string().optional().describe("Alias for 'value' (agentPayment compat)"),
					chainId: z
						.union([z.string(), z.number()])
						.optional()
						.describe("Chain ID or network alias"),
					network: z.string().optional().describe("Network alias (e.g. 'base-sepolia')"),
					token: z.string().default("ETH").describe("Token symbol"),
				})
				.refine((d) => d.to || d.recipient, "to or recipient required")
				.refine((d) => d.value || d.amount, "value or amount required"),
		},
		async (args, c) => {
			try {
				const to = validateAddress((args.to || args.recipient)!);
				const ethValue = validateAmount((args.value || args.amount)!, "value");
				const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);
				const value = parseEther(ethValue);
				const signer = await ctx.chainManager.getSigner(chainId);

				// Gas check (tool-specific: native token, check full balance)
				if (!signer.hasPaymaster) {
					const balance = await signer.getBalance(chainId);
					if (balance < value) {
						return c.error(
							`[INSUFFICIENT_BALANCE] Have: ${formatEther(balance)} ETH, Need: ${ethValue} ETH`,
						);
					}
				}

				const result = await executeTx(
					{
						operation: "send",
						txParams: { to, value, chainId },
						token: args.token.toUpperCase(),
					},
					{
						signer,
						policyGuard: ctx.policyGuard,
						txLog: ctx.txLog,
						chainManager: ctx.chainManager,
					},
				);

				return c.json(result);
			} catch (e) {
				if (e instanceof VaulxError) {
					return c.error(`[${e.code}] ${e.message}`);
				}
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}
