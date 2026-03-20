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
import { getChain, isSolanaChain, resolveChainId, WITHDRAW_TO } from "../config.js";
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
				token: z.string().optional().describe("Token symbol (defaults to chain native)"),
				amount: z.string().optional().describe("Amount to withdraw. Omit for full balance."),
				chainId: z.union([z.string(), z.number()]).optional().describe("Chain ID or network alias"),
				network: z.string().optional().describe("Network alias (e.g. 'base-sepolia')"),
			}),
		},
		async (args, c) => {
			try {
				const chainId = resolveChainId(args.chainId ?? args.network);
				const chain = getChain(chainId);
				const to = validateAddress(args.to ?? WITHDRAW_TO ?? "", chainId);
				const signer = await ctx.chainManager.getSigner(chainId);
				const nativeSymbol = chain.nativeCurrency.symbol;
				const tokenSymbol = args.token?.toUpperCase() ?? nativeSymbol;
				const isNative = tokenSymbol === nativeSymbol;

				if (isNative) {
					return await withdrawNative(ctx, signer, c, to, chainId, args.amount);
				}

				if (isSolanaChain(chainId)) {
					return await withdrawSplToken(ctx, signer, c, to, chainId, tokenSymbol, args.amount);
				}
				return await withdrawEvmToken(ctx, signer, c, to, chainId, tokenSymbol, args.amount);
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
	to: string,
	chainId: string,
	amount?: string,
) {
	const chain = getChain(chainId);
	const balance = await signer.getBalance(chainId);
	const symbol = chain.nativeCurrency.symbol;
	const decimals = chain.nativeCurrency.decimals;
	const isSolana = isSolanaChain(chainId);

	const formatBalance = (v: bigint) =>
		isSolana ? formatUnits(v, 9) : formatEther(v);

	let value: bigint;
	if (amount) {
		value = isSolana
			? BigInt(Math.round(parseFloat(amount) * 10 ** decimals))
			: parseEther(amount);
		if (value > balance) {
			throw new VaulxError(
				`Insufficient balance. Have: ${formatBalance(balance)} ${symbol}, Need: ${amount} ${symbol}`,
				"INSUFFICIENT_BALANCE",
			);
		}
	} else if (signer.hasPaymaster || isSolana) {
		// Solana: leave rent-exempt minimum (~0.00089 SOL)
		if (isSolana) {
			const rentExempt = 890_880n; // ~0.00089 SOL
			value = balance > rentExempt ? balance - rentExempt : 0n;
		} else {
			value = balance;
		}
		if (value === 0n) {
			throw new VaulxError(`No ${symbol} balance to withdraw.`, "INSUFFICIENT_BALANCE");
		}
	} else {
		// EVM: estimate gas and reserve buffer
		const address = await signer.getAddress();
		const pub = ctx.chainManager.getPublicClient(chainId);
		const gasEstimate = await pub.estimateGas({
			account: address as `0x${string}`,
			to: to as `0x${string}`,
			value: balance,
		});
		const gasPrice = await pub.getGasPrice();
		const gasCost = gasEstimate * gasPrice;
		const buffer = gasCost / 10n;
		value = balance - gasCost - buffer;

		if (value <= 0n) {
			throw new VaulxError(
				`Balance too low to cover gas. Balance: ${formatBalance(balance)} ${symbol}`,
				"INSUFFICIENT_GAS",
			);
		}
	}

	const result = await executeTx(
		{
			operation: "withdraw",
			txParams: { to, value, chainId },
			token: symbol,
		},
		{ signer, policyGuard: ctx.policyGuard, txLog: ctx.txLog, chainManager: ctx.chainManager },
	);

	return c.json({ ...result, amount: formatBalance(value), token: symbol });
}

async function withdrawEvmToken(
	ctx: WithdrawCtx,
	signer: Signer,
	c: ToolContext,
	to: string,
	chainId: string,
	tokenSymbol: string,
	amount?: string,
) {
	const token = ctx.tokenRegistry.resolve(chainId, tokenSymbol);
	if (!token) {
		throw new VaulxError(`Token "${tokenSymbol}" not found on chain ${chainId}`, "UNKNOWN_TOKEN");
	}

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
		const balanceData = await pub.readContract({
			address: token.address as `0x${string}`,
			abi: erc20Abi,
			functionName: "balanceOf",
			args: [address as `0x${string}`],
		});
		rawAmount = balanceData as bigint;
		if (rawAmount === 0n) {
			throw new VaulxError(`No ${token.symbol} balance to withdraw.`, "INSUFFICIENT_BALANCE");
		}
	}

	const data = encodeFunctionData({
		abi: erc20Abi,
		functionName: "transfer",
		args: [to as `0x${string}`, rawAmount],
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

async function withdrawSplToken(
	ctx: WithdrawCtx,
	signer: Signer,
	c: ToolContext,
	to: string,
	chainId: string,
	tokenSymbol: string,
	amount?: string,
): Promise<never> {
	const token = ctx.tokenRegistry.resolve(chainId, tokenSymbol);
	if (!token) {
		throw new VaulxError(`Token "${tokenSymbol}" not found on chain ${chainId}`, "UNKNOWN_TOKEN");
	}

	// SPL token withdrawal not yet supported
	throw new VaulxError(
		"SPL token withdrawal is not yet supported. Use send_token instead.",
		"UNSUPPORTED_OPERATION",
	);
}

// Ensure TypeScript doesn't infer void return from withdrawSplToken
// since the function always throws.
