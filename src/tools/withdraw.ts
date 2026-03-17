import type { MCPServer } from "@lynq/lynq";
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
import { DEFAULT_CHAIN_ID, getChain, resolveChainId, WITHDRAW_TO } from "../config.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import type { TxLog } from "../log/tx-log.js";
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
			const to = (args.to as `0x${string}`) ?? WITHDRAW_TO;
			if (!to) {
				return c.error("No recipient specified and WITHDRAW_TO env var is not set.");
			}

			const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);
			const signer = await ctx.chainManager.getSigner(chainId);
			const isNative = args.token.toUpperCase() === "ETH";

			if (isNative) {
				return withdrawNative(ctx, signer, c, to, chainId, args.amount);
			} else {
				return withdrawToken(ctx, signer, c, to, chainId, args.token, args.amount);
			}
		},
	);
}

async function withdrawNative(
	ctx: WithdrawCtx,
	signer: Awaited<ReturnType<ChainManager["getSigner"]>>,
	c: any,
	to: `0x${string}`,
	chainId: number,
	amount?: string,
) {
	const balance = await signer.getBalance(chainId);

	let value: bigint;
	if (amount) {
		value = parseEther(amount);
		if (value > balance) {
			return c.error(
				`Insufficient balance. Have: ${formatEther(balance)} ETH, Need: ${amount} ETH`,
			);
		}
	} else if (signer.hasPaymaster) {
		value = balance;
		if (value === 0n) {
			return c.error("No ETH balance to withdraw.");
		}
	} else {
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
			return c.error(`Balance too low to cover gas. Balance: ${formatEther(balance)} ETH`);
		}
	}

	const check = await ctx.policyGuard.check("withdraw", {
		value,
		to,
		chainId,
		token: "ETH",
	});
	if (!check.ok) {
		return c.error(`Policy rejected: ${check.reason}`);
	}

	const hash = await signer.sendTransaction({ to, value, chainId });

	await ctx.txLog.record({
		hash,
		chainId,
		to,
		value: value.toString(),
		token: "ETH",
		operation: "withdraw",
		timestamp: new Date().toISOString(),
		status: "sent",
	});

	const chain = getChain(chainId);
	return c.json({
		hash,
		chainId,
		amount: formatEther(value),
		token: "ETH",
		explorer: chain.blockExplorer ? `${chain.blockExplorer}/tx/${hash}` : undefined,
		proof: { type: "tx_hash", value: hash },
	});
}

async function withdrawToken(
	ctx: WithdrawCtx,
	signer: Awaited<ReturnType<ChainManager["getSigner"]>>,
	c: any,
	to: `0x${string}`,
	chainId: number,
	tokenSymbol: string,
	amount?: string,
) {
	const token = ctx.tokenRegistry.resolve(chainId, tokenSymbol);
	if (!token) {
		return c.error(`Token "${tokenSymbol}" not found on chain ${chainId}.`);
	}

	if (!signer.hasPaymaster) {
		const ethBalance = await signer.getBalance(chainId);
		if (ethBalance === 0n) {
			return c.error("No native token balance for gas.");
		}
	}

	const address = await signer.getAddress();
	const pub = ctx.chainManager.getPublicClient(chainId);

	let rawAmount: bigint;
	if (amount) {
		rawAmount = parseUnits(amount, token.decimals);
	} else {
		const balanceData = await pub.readContract({
			address: token.address,
			abi: erc20Abi,
			functionName: "balanceOf",
			args: [address],
		});
		rawAmount = balanceData as bigint;

		if (rawAmount === 0n) {
			return c.error(`No ${token.symbol} balance to withdraw.`);
		}
	}

	const check = await ctx.policyGuard.check("withdraw", {
		value: rawAmount,
		to,
		chainId,
		token: token.symbol,
	});
	if (!check.ok) {
		return c.error(`Policy rejected: ${check.reason}`);
	}

	const data = encodeFunctionData({
		abi: erc20Abi,
		functionName: "transfer",
		args: [to, rawAmount],
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
		to,
		value: rawAmount.toString(),
		token: token.symbol,
		operation: "withdraw",
		timestamp: new Date().toISOString(),
		status: "sent",
	});

	const chain = getChain(chainId);
	return c.json({
		hash,
		chainId,
		amount: formatUnits(rawAmount, token.decimals),
		token: token.symbol,
		explorer: chain.blockExplorer ? `${chain.blockExplorer}/tx/${hash}` : undefined,
		proof: { type: "tx_hash", value: hash },
	});
}
