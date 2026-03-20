import type { MCPServer, ToolContext } from "@lynq/lynq";
import { encodeFunctionData, erc20Abi, parseEther, parseUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import {
	DEFAULT_CHAIN_ID,
	getChain,
	getSolanaPrivateKey,
	isSolanaChain,
	resolveChainId,
} from "../config.js";
import {
	encodeExactInputSingle,
	isSwapSupported,
	QUOTER_V2,
	quoterAbi,
	SWAP_ROUTER,
	WETH,
} from "../dex/uniswap.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { executeTx } from "../helpers/execute-tx.js";
import { trackReceipt } from "../log/receipt-tracker.js";
import type { TxLog } from "../log/tx-log.js";
import type { TokenRegistry } from "../token/registry.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUPITER_API = "https://quote-api.jup.ag/v6";

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
			description:
				"Swap tokens via Uniswap V3 (EVM) or Jupiter (Solana). Supports native↔token and token↔token swaps.",
			input: z.object({
				tokenIn: z.string().describe("Input token symbol (e.g. 'ETH', 'SOL', 'USDC')"),
				tokenOut: z.string().describe("Output token symbol (e.g. 'USDC', 'ETH', 'SOL')"),
				amountIn: z.string().describe("Amount of input token"),
				slippage: z.number().default(0.5).describe("Slippage tolerance in percent"),
				chainId: z.union([z.string(), z.number()]).optional().describe("Chain ID or network alias"),
				network: z.string().optional().describe("Network alias (e.g. 'base', 'solana')"),
			}),
		},
		async (args, c) => {
			try {
				const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);

				if (isSolanaChain(chainId)) {
					return await swapSolanaJupiter(ctx, c, args, chainId);
				}

				if (!isSwapSupported(chainId)) {
					throw new VaulxError(
						`Swap not supported on chain ${chainId}. Supported: ${Object.keys(SWAP_ROUTER).join(", ")}, solana, solana-devnet`,
						"UNSUPPORTED_OPERATION",
					);
				}

				return await swapEvmUniswap(ctx, c, args, chainId);
			} catch (e) {
				if (e instanceof VaulxError) {
					return c.error(`[${e.code}] ${e.message}`);
				}
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}

// --- EVM Uniswap V3 ---

async function swapEvmUniswap(
	ctx: SwapTokenCtx,
	c: ToolContext,
	args: { tokenIn: string; tokenOut: string; amountIn: string; slippage: number },
	chainId: string,
) {
	const signer = await ctx.chainManager.getSigner(chainId);
	const pub = ctx.chainManager.getPublicClient(chainId);
	const address = await signer.getAddress();
	const routerAddress = SWAP_ROUTER[chainId];
	const quoterAddress = QUOTER_V2[chainId];
	const wethAddress = WETH[chainId];

	const isEthIn = args.tokenIn.toUpperCase() === "ETH";
	const isEthOut = args.tokenOut.toUpperCase() === "ETH";

	const tokenInAddress = (
		isEthIn ? wethAddress : ctx.tokenRegistry.resolve(chainId, args.tokenIn)?.address
	) as `0x${string}` | undefined;
	const tokenOutAddress = (
		isEthOut ? wethAddress : ctx.tokenRegistry.resolve(chainId, args.tokenOut)?.address
	) as `0x${string}` | undefined;

	if (!tokenInAddress) {
		throw new VaulxError(`Token "${args.tokenIn}" not found on chain ${chainId}`, "UNKNOWN_TOKEN");
	}
	if (!tokenOutAddress) {
		throw new VaulxError(`Token "${args.tokenOut}" not found on chain ${chainId}`, "UNKNOWN_TOKEN");
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

	// Auto-approve if needed — routed through executeTx for policy + logging
	if (!isEthIn) {
		const allowance = (await pub.readContract({
			address: tokenInAddress!,
			abi: erc20Abi,
			functionName: "allowance",
			args: [address as `0x${string}`, routerAddress],
		})) as bigint;

		if (allowance < amountIn) {
			const approveData = encodeFunctionData({
				abi: erc20Abi,
				functionName: "approve",
				args: [routerAddress, amountIn],
			});
			await executeTx(
				{
					operation: "approve",
					txParams: { to: tokenInAddress, value: 0n, chainId, data: approveData },
					token: tokenInInfo.symbol,
					policyExtra: { value: amountIn },
				},
				{
					signer,
					policyGuard: ctx.policyGuard,
					txLog: ctx.txLog,
					chainManager: ctx.chainManager,
				},
			);
		}
	}

	// Quote — abort if it fails (never swap with amountOutMinimum=0)
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
	const amountOutMinimum =
		quotedAmount - (quotedAmount * BigInt(Math.floor(args.slippage * 100))) / 10000n;

	const swapData = encodeExactInputSingle({
		tokenIn: tokenInAddress!,
		tokenOut: tokenOutAddress!,
		fee: 3000,
		recipient: address as `0x${string}`,
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
		{
			signer,
			policyGuard: ctx.policyGuard,
			txLog: ctx.txLog,
			chainManager: ctx.chainManager,
		},
	);

	return c.json({
		...result,
		tokenIn: tokenInInfo.symbol,
		tokenOut: tokenOutInfo.symbol,
		amountIn: args.amountIn,
	});
}

// --- Solana Jupiter ---

async function swapSolanaJupiter(
	ctx: SwapTokenCtx,
	c: ToolContext,
	args: { tokenIn: string; tokenOut: string; amountIn: string; slippage: number },
	chainId: string,
) {
	const { PublicKey, VersionedTransaction, Keypair } = await import("@solana/web3.js");
	const bs58 = await import("bs58");

	const connection = ctx.chainManager.getConnection(chainId);
	const signer = await ctx.chainManager.getSigner(chainId);
	const fromAddress = await signer.getAddress();

	// Resolve mints
	const isSolIn = args.tokenIn.toUpperCase() === "SOL";
	const isSolOut = args.tokenOut.toUpperCase() === "SOL";

	const inputMint = isSolIn ? SOL_MINT : ctx.tokenRegistry.resolve(chainId, args.tokenIn)?.address;
	const outputMint = isSolOut
		? SOL_MINT
		: ctx.tokenRegistry.resolve(chainId, args.tokenOut)?.address;

	if (!inputMint) {
		throw new VaulxError(`Token "${args.tokenIn}" not found on chain ${chainId}`, "UNKNOWN_TOKEN");
	}
	if (!outputMint) {
		throw new VaulxError(`Token "${args.tokenOut}" not found on chain ${chainId}`, "UNKNOWN_TOKEN");
	}

	const tokenInInfo = isSolIn
		? { decimals: 9, symbol: "SOL" }
		: ctx.tokenRegistry.resolve(chainId, args.tokenIn)!;
	const tokenOutInfo = isSolOut
		? { decimals: 9, symbol: "SOL" }
		: ctx.tokenRegistry.resolve(chainId, args.tokenOut)!;

	const { parseTokenUnits } = await import("../helpers/validate.js");
	const amountIn = parseTokenUnits(args.amountIn, tokenInInfo.decimals);

	// Policy check
	const check = await ctx.policyGuard.check("swap", {
		value: amountIn,
		chainId,
		token: tokenInInfo.symbol,
		slippage: args.slippage,
	});
	if (!check.ok) {
		throw new VaulxError(check.reason, "POLICY_VIOLATION");
	}

	// Duplicate check
	const dup = await ctx.txLog.isDuplicate({
		to: "jupiter",
		value: amountIn.toString(),
		chainId,
	});
	if (dup) {
		throw new VaulxError("Duplicate swap detected (same params within 10s)", "TX_FAILED");
	}

	// Jupiter Quote
	const slippageBps = Math.floor(args.slippage * 100);
	const quoteUrl = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountIn}&slippageBps=${slippageBps}`;
	const quoteRes = await fetch(quoteUrl);
	if (!quoteRes.ok) {
		throw new VaulxError(`Jupiter quote failed: HTTP ${quoteRes.status}`, "TX_FAILED");
	}
	const quoteData = await quoteRes.json();
	if (quoteData.error) {
		throw new VaulxError(`Jupiter quote error: ${quoteData.error}`, "TX_FAILED");
	}

	// Jupiter Swap
	const swapRes = await fetch(`${JUPITER_API}/swap`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			quoteResponse: quoteData,
			userPublicKey: fromAddress,
			wrapAndUnwrapSol: true,
		}),
	});
	if (!swapRes.ok) {
		throw new VaulxError(`Jupiter swap failed: HTTP ${swapRes.status}`, "TX_FAILED");
	}
	const swapData = await swapRes.json();
	if (swapData.error) {
		throw new VaulxError(`Jupiter swap error: ${swapData.error}`, "TX_FAILED");
	}

	// Deserialize, sign, send
	const txBuf = Buffer.from(swapData.swapTransaction, "base64");
	const versionedTx = VersionedTransaction.deserialize(txBuf);
	const keypair = Keypair.fromSecretKey(bs58.default.decode(getSolanaPrivateKey()));
	versionedTx.sign([keypair]);
	const sig = await connection.sendRawTransaction(versionedTx.serialize());

	// Log + track
	await ctx.txLog.record({
		hash: sig,
		chainId,
		to: "jupiter",
		value: amountIn.toString(),
		token: tokenInInfo.symbol,
		operation: "swap",
		timestamp: new Date().toISOString(),
		status: "sent",
	});

	trackReceipt(sig, chainId, { chainManager: ctx.chainManager, txLog: ctx.txLog });

	const chain = getChain(chainId);
	return c.json({
		hash: sig,
		chainId,
		explorer: chain.blockExplorer ? `${chain.blockExplorer}/tx/${sig}` : undefined,
		proof: { type: "tx_hash", value: sig },
		tokenIn: tokenInInfo.symbol,
		tokenOut: tokenOutInfo.symbol,
		amountIn: args.amountIn,
	});
}
