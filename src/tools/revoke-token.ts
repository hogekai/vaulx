import type { MCPServer } from "@lynq/lynq";
import { encodeFunctionData, erc20Abi } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { DEFAULT_CHAIN_ID, resolveChainId } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { executeTx } from "../helpers/execute-tx.js";
import { validateAddress } from "../helpers/validate.js";
import type { TxLog } from "../log/tx-log.js";
import type { TokenRegistry } from "../token/registry.js";

interface RevokeTokenCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
	tokenRegistry: TokenRegistry;
}

export function registerRevokeToken(server: MCPServer, ctx: RevokeTokenCtx) {
	server.tool(
		"revoke_token",
		{
			description: "Revoke a token approval by setting allowance to 0.",
			input: z.object({
				spender: z.string().describe("Spender contract address to revoke (0x...)"),
				token: z.string().describe("Token symbol (e.g. 'USDC')"),
				chainId: z.union([z.string(), z.number()]).optional().describe("Chain ID or network alias"),
				network: z.string().optional().describe("Network alias (e.g. 'base-sepolia')"),
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

				const data = encodeFunctionData({
					abi: erc20Abi,
					functionName: "approve",
					args: [spender, 0n],
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

				return c.json({ ...result, spender, token: token.symbol, revoked: true });
			} catch (e) {
				if (e instanceof VaulxError) return c.error(`[${e.code}] ${e.message}`);
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}
