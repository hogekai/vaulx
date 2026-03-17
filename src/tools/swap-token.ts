import type { MCPServer } from "@lynq/lynq";
import { encodeFunctionData, erc20Abi, parseEther, parseUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { DEFAULT_CHAIN_ID, resolveChainId } from "../config.js";
import { VaulxError } from "../errors.js";
import {
	encodeExactInputSingle,
	isSwapSupported,
	QUOTER_V2,
	quoterAbi,
	SWAP_ROUTER,
	WETH,
} from "../dex/uniswap.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { executeTx } from "../helpers/execute-tx.js";
import type { TxLog } from "../log/tx-log.js";
import type { TokenRegistry } from "../token/registry.js";

interface SwapTokenCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
	tokenRegistry: TokenRegistry;
}

export function registerSwapToken(server: MCPServer, ctx: SwapTokenCtx) {
	server.tool(
		"swap_token",
		{
			description: "Swap tokens via Uniswap V3. Supports ETH↔ERC20 and ERC20↔ERC20 swaps.",
			input: z.object({
				tokenIn: z.string().describe("Input token symbol (e.g. 'ETH', 'USDC')"),
				tokenOut: z.string().describe("Output token symbol (e.g. 'USDC', 'ETH')"),
				amountIn: z.string().describe("Amount of input token"),
				slippage: z.number().default(0.5).describe("Slippage tolerance in percent"),
				chainId: z.union([z.string(), z.number()]).optional().describe("Chain ID or network alias"),
				network: z.string().optional().describe("Network alias (e.g. 'base')"),
			}),
		},
		async (args, c) => {
			try {
				const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);

				if (!isSwapSupported(chainId)) {
					throw new VaulxError(
						`Swap not supported on chain ${chainId}. Supported: ${Object.keys(SWAP_ROUTER).join(", ")}`,
						"UNSUPPORTED_OPERATION",
					);
				}

				const signer = await ctx.chainManager.getSigner(chainId);
				const pub = ctx.chainManager.getPublicClient(chainId);
				const address = await signer.getAddress();
				const routerAddress = SWAP_ROUTER[chainId];
				const quoterAddress = QUOTER_V2[chainId];
				const wethAddress = WETH[chainId];

				// Resolve tokens
				const isEthIn = args.tokenIn.toUpperCase() === "ETH";
				const isEthOut = args.tokenOut.toUpperCase() === "ETH";

				const tokenInAddress = isEthIn
					? wethAddress
					: ctx.tokenRegistry.resolve(chainId, args.tokenIn)?.address;
				const tokenOutAddress = isEthOut
					? wethAddress
					: ctx.tokenRegistry.resolve(chainId, args.tokenOut)?.address;

				if (!tokenInAddress) {
					throw new VaulxError(
						`Token "${args.tokenIn}" not found on chain ${chainId}`,
						"UNKNOWN_TOKEN",
					);
				}
				if (!tokenOutAddress) {
					throw new VaulxError(
						`Token "${args.tokenOut}" not found on chain ${chainId}`,
						"UNKNOWN_TOKEN",
					);
				}

				const tokenInInfo = isEthIn
					? { decimals: 18, symbol: "ETH" }
					: ctx.tokenRegistry.resolve(chainId, args.tokenIn)!;
				const tokenOutInfo = isEthOut
					? { decimals: 18, symbol: "ETH" }
					: ctx.tokenRegistry.resolve(chainId, args.tokenOut)!;

				const amountIn = isEthIn
					? parseEther(args.amountIn)
					: parseUnits(args.amountIn, tokenInInfo.decimals);

				// If ERC20 input, check allowance and auto-approve
				if (!isEthIn) {
					const allowance = (await pub.readContract({
						address: tokenInAddress,
						abi: erc20Abi,
						functionName: "allowance",
						args: [address, routerAddress],
					})) as bigint;

					if (allowance < amountIn) {
						if (!ctx.policyGuard.policy.allowedOperations.includes("approve")) {
							throw new VaulxError(
								'Swap requires token approval, but "approve" is not in allowedOperations.',
								"POLICY_VIOLATION",
							);
						}

						const approveData = encodeFunctionData({
							abi: erc20Abi,
							functionName: "approve",
							args: [routerAddress, amountIn],
						});

						await signer.sendTransaction({
							to: tokenInAddress,
							value: 0n,
							chainId,
							data: approveData,
						});
					}
				}

				// Get quote for amountOutMinimum
				let amountOutMinimum = 0n;
				try {
					const quoteResult = await pub.simulateContract({
						address: quoterAddress,
						abi: quoterAbi,
						functionName: "quoteExactInputSingle",
						args: [
							{
								tokenIn: tokenInAddress,
								tokenOut: tokenOutAddress,
								amountIn,
								fee: 3000,
								sqrtPriceLimitX96: 0n,
							},
						],
					});
					const quotedAmount = (quoteResult.result as readonly bigint[])[0];
					amountOutMinimum =
						quotedAmount -
						(quotedAmount * BigInt(Math.floor(args.slippage * 100))) / 10000n;
				} catch {
					console.error("[vaulx] Quote failed, using amountOutMinimum=0");
				}

				// Build swap calldata
				const swapData = encodeExactInputSingle({
					tokenIn: tokenInAddress,
					tokenOut: tokenOutAddress,
					fee: 3000,
					recipient: address,
					amountIn,
					amountOutMinimum,
				});

				const result = await executeTx(
					{
						operation: "swap",
						txParams: {
							to: routerAddress,
							value: isEthIn ? amountIn : 0n,
							chainId,
							data: swapData,
						},
						token: tokenInInfo.symbol,
						policyExtra: { slippage: args.slippage },
					},
					{ signer, policyGuard: ctx.policyGuard, txLog: ctx.txLog },
				);

				return c.json({
					...result,
					tokenIn: tokenInInfo.symbol,
					tokenOut: tokenOutInfo.symbol,
					amountIn: args.amountIn,
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
