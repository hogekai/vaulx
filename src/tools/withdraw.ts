import type { MCPServer, ToolContext } from "@lynq/lynq";
import {
	encodeFunctionData,
	erc20Abi,
	formatEther,
	formatUnits,
	parseEther,
	parseUnits,
} from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { DEFAULT_CHAIN_ID, resolveChainId, WITHDRAW_TO } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { executeTx } from "../helpers/execute-tx.js";
import { validateAddress } from "../helpers/validate.js";
import type { TxLog } from "../log/tx-log.js";
import type { Signer } from "../signer/types.js";
import type { TokenRegistry } from "../token/registry.js";

interface WithdrawCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
	tokenRegistry: TokenRegistry;
}

export function registerWithdraw(server: MCPServer, ctx: WithdrawCtx) {
	server.tool(
		"withdraw",
		{
			description:
				"Withdraw tokens from the agent wallet. Defaults to full balance if amount is omitted.",
			input: z.object({
				to: z.string().optional().describe("Recipient address. Defaults to WITHDRAW_TO env var."),
				token: z.string().default("ETH").describe("Token symbol"),
				amount: z.string().optional().describe("Amount to withdraw. Omit for full balance."),
				chainId: z.union([z.string(), z.number()]).optional().describe("Chain ID or network alias"),
				network: z.string().optional().describe("Network alias (e.g. 'base-sepolia')"),
			}),
		},
		async (args, c) => {
			try {
				const to = validateAddress(args.to ?? WITHDRAW_TO ?? "");
				const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);
				const signer = await ctx.chainManager.getSigner(chainId);
				const isNative = args.token.toUpperCase() === "ETH";

				if (isNative) {
					return await withdrawNative(ctx, signer, c, to, chainId, args.amount);
				}
				return await withdrawToken(ctx, signer, c, to, chainId, args.token, args.amount);
			} catch (e) {
				if (e instanceof VaulxError) {
					return c.error(`[${e.code}] ${e.message}`);
				}
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}

async function withdrawNative(
	ctx: WithdrawCtx,
	signer: Signer,
	c: ToolContext,
	to: `0x${string}`,
	chainId: number,
	amount?: string,
) {
	const balance = await signer.getBalance(chainId);

	let value: bigint;
	if (amount) {
		value = parseEther(amount);
		if (value > balance) {
			throw new VaulxError(
				`Insufficient balance. Have: ${formatEther(balance)} ETH, Need: ${amount} ETH`,
				"INSUFFICIENT_BALANCE",
			);
		}
	} else if (signer.hasPaymaster) {
		value = balance;
		if (value === 0n) {
			throw new VaulxError("No ETH balance to withdraw.", "INSUFFICIENT_BALANCE");
		}
	} else {
		// Full balance: estimate gas and reserve buffer
		const address = await signer.getAddress();
		const pub = ctx.chainManager.getPublicClient(chainId);
		const gasEstimate = await pub.estimateGas({
			account: address,
			to,
			value: balance,
		});
		const gasPrice = await pub.getGasPrice();
		const gasCost = gasEstimate * gasPrice;
		const buffer = gasCost / 10n;
		value = balance - gasCost - buffer;

		if (value <= 0n) {
			throw new VaulxError(
				`Balance too low to cover gas. Balance: ${formatEther(balance)} ETH`,
				"INSUFFICIENT_GAS",
			);
		}
	}

	const result = await executeTx(
		{
			operation: "withdraw",
			txParams: { to, value, chainId },
			token: "ETH",
		},
		{ signer, policyGuard: ctx.policyGuard, txLog: ctx.txLog, chainManager: ctx.chainManager },
	);

	return c.json({ ...result, amount: formatEther(value), token: "ETH" });
}

async function withdrawToken(
	ctx: WithdrawCtx,
	signer: Signer,
	c: ToolContext,
	to: `0x${string}`,
	chainId: number,
	tokenSymbol: string,
	amount?: string,
) {
	const token = ctx.tokenRegistry.resolve(chainId, tokenSymbol);
	if (!token) {
		throw new VaulxError(`Token "${tokenSymbol}" not found on chain ${chainId}`, "UNKNOWN_TOKEN");
	}

	// Gas check for ERC20
	if (!signer.hasPaymaster) {
		const ethBalance = await signer.getBalance(chainId);
		if (ethBalance === 0n) {
			throw new VaulxError("No native token balance for gas.", "INSUFFICIENT_GAS");
		}
	}

	const address = await signer.getAddress();
	const pub = ctx.chainManager.getPublicClient(chainId);

	let rawAmount: bigint;
	if (amount) {
		rawAmount = parseUnits(amount, token.decimals);
	} else {
		// Full balance
		const balanceData = await pub.readContract({
			address: token.address,
			abi: erc20Abi,
			functionName: "balanceOf",
			args: [address],
		});
		rawAmount = balanceData as bigint;

		if (rawAmount === 0n) {
			throw new VaulxError(`No ${token.symbol} balance to withdraw.`, "INSUFFICIENT_BALANCE");
		}
	}

	const data = encodeFunctionData({
		abi: erc20Abi,
		functionName: "transfer",
		args: [to, rawAmount],
	});

	const result = await executeTx(
		{
			operation: "withdraw",
			txParams: { to: token.address, value: 0n, chainId, data },
			token: token.symbol,
		},
		{ signer, policyGuard: ctx.policyGuard, txLog: ctx.txLog, chainManager: ctx.chainManager },
	);

	return c.json({
		...result,
		amount: formatUnits(rawAmount, token.decimals),
		token: token.symbol,
	});
}
