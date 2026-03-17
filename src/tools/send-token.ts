import type { MCPServer } from "@lynq/lynq";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { DEFAULT_CHAIN_ID, resolveChainId } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { executeTx } from "../helpers/execute-tx.js";
import { validateAddress, validateAmount } from "../helpers/validate.js";
import type { TxLog } from "../log/tx-log.js";
import type { TokenRegistry } from "../token/registry.js";

interface SendTokenCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
	tokenRegistry: TokenRegistry;
}

export function registerSendToken(server: MCPServer, ctx: SendTokenCtx) {
	server.tool(
		"send_token",
		{
			description:
				"Send an ERC20 token (e.g. USDC) on an EVM chain. Returns tx hash and explorer link.",
			input: z.object({
				to: z.string().optional().describe("Recipient address (0x...)"),
				recipient: z.string().optional().describe("Alias for 'to' (agentPayment compat)"),
				value: z.string().optional().describe("Amount in token units (e.g. '10' for 10 USDC)"),
				amount: z.string().optional().describe("Alias for 'value' (agentPayment compat)"),
				token: z.string().describe("Token symbol (e.g. 'USDC')"),
				chainId: z
					.union([z.string(), z.number()])
					.optional()
					.describe("Chain ID or network alias"),
				network: z.string().optional().describe("Network alias (e.g. 'base-sepolia')"),
			}),
		},
		async (args, c) => {
			try {
				const rawTo = args.to || args.recipient;
				if (!rawTo) return c.error("[VALIDATION] to or recipient required");
				const rawValue = args.value || args.amount;
				if (!rawValue) return c.error("[VALIDATION] value or amount required");
				const to = validateAddress(rawTo);
				const tokenAmount = validateAmount(rawValue, "value");
				const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);
				const signer = await ctx.chainManager.getSigner(chainId);

				// Tool-specific: resolve token
				const token = ctx.tokenRegistry.resolve(chainId, args.token);
				if (!token) {
					throw new VaulxError(
						`Token "${args.token}" not found on chain ${chainId}`,
						"UNKNOWN_TOKEN",
					);
				}

				const rawAmount = parseUnits(tokenAmount, token.decimals);

				// Tool-specific: gas check for ERC20 (need native for gas)
				if (!signer.hasPaymaster) {
					const balance = await signer.getBalance(chainId);
					if (balance === 0n) {
						throw new VaulxError(
							"No native token balance for gas. Deposit ETH first.",
							"INSUFFICIENT_GAS",
						);
					}
				}

				// Tool-specific: encode ERC20 transfer
				const data = encodeFunctionData({
					abi: erc20Abi,
					functionName: "transfer",
					args: [to, rawAmount],
				});

				const result = await executeTx(
					{
						operation: "send_token",
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

				return c.json({ ...result, token: token.symbol, amount: tokenAmount });
			} catch (e) {
				if (e instanceof VaulxError) {
					return c.error(`[${e.code}] ${e.message}`);
				}
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}
