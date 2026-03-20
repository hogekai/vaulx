import type { MCPServer } from "@lynq/lynq";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { formatEther, formatUnits, parseEther } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { getChain, isSolanaChain, resolveChainId } from "../config.js";
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
			description:
				"Send native token (ETH/SOL) on a supported chain. Returns tx hash and explorer link.",
			input: z.object({
				to: z.string().optional().describe("Recipient address"),
				recipient: z.string().optional().describe("Alias for 'to' (agentPayment compat)"),
				value: z.string().optional().describe("Amount in native token units (e.g. '0.01')"),
				amount: z.string().optional().describe("Alias for 'value' (agentPayment compat)"),
				chainId: z.union([z.string(), z.number()]).optional().describe("Chain ID or network alias"),
				network: z
					.string()
					.optional()
					.describe("Network alias (e.g. 'base-sepolia', 'solana-devnet')"),
				token: z.string().optional().describe("Token symbol (defaults to chain native)"),
			}),
		},
		async (args, c) => {
			try {
				const rawTo = args.to || args.recipient;
				if (!rawTo) return c.error("[VALIDATION] to or recipient required");
				const rawValue = args.value || args.amount;
				if (!rawValue) return c.error("[VALIDATION] value or amount required");
				const chainId = resolveChainId(args.chainId ?? args.network);
				const chain = getChain(chainId);
				const to = validateAddress(rawTo, chainId);
				const amountStr = validateAmount(rawValue, "value");
				const nativeSymbol = chain.nativeCurrency.symbol;
				const token = args.token?.toUpperCase() ?? nativeSymbol;

				let value: bigint;
				if (isSolanaChain(chainId)) {
					value = BigInt(Math.round(parseFloat(amountStr) * LAMPORTS_PER_SOL));
				} else {
					value = parseEther(amountStr);
				}

				const signer = await ctx.chainManager.getSigner(chainId);

				// Balance check
				if (!signer.hasPaymaster) {
					const balance = await signer.getBalance(chainId);
					if (balance < value) {
						const formatted = isSolanaChain(chainId)
							? formatUnits(balance, 9)
							: formatEther(balance);
						return c.error(
							`[INSUFFICIENT_BALANCE] Have: ${formatted} ${nativeSymbol}, Need: ${amountStr} ${nativeSymbol}`,
						);
					}
				}

				const result = await executeTx(
					{
						operation: "send",
						txParams: { to, value, chainId },
						token,
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
