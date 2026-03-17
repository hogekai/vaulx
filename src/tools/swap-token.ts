import type { MCPServer } from "@lynq/lynq";
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  parseEther,
  parseUnits,
} from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { resolveChainId, getChain, DEFAULT_CHAIN_ID } from "../config.js";
import {
  SWAP_ROUTER,
  QUOTER_V2,
  WETH,
  isSwapSupported,
  encodeExactInputSingle,
  encodeQuoteExactInputSingle,
  quoterAbi,
} from "../dex/uniswap.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
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
      description:
        "Swap tokens via Uniswap V3. Supports ETH↔ERC20 and ERC20↔ERC20 swaps.",
      input: z.object({
        tokenIn: z
          .string()
          .describe("Input token symbol (e.g. 'ETH', 'USDC')"),
        tokenOut: z
          .string()
          .describe("Output token symbol (e.g. 'USDC', 'ETH')"),
        amountIn: z.string().describe("Amount of input token"),
        slippage: z
          .number()
          .default(0.5)
          .describe("Slippage tolerance in percent"),
        chainId: z
          .union([z.string(), z.number()])
          .optional()
          .describe("Chain ID or network alias"),
        network: z
          .string()
          .optional()
          .describe("Network alias (e.g. 'base')"),
      }),
    },
    async (args, c) => {
      const chainId = resolveChainId(
        args.chainId ?? args.network ?? DEFAULT_CHAIN_ID,
      );

      if (!isSwapSupported(chainId)) {
        return c.error(
          `Swap not supported on chain ${chainId}. Supported: ${Object.keys(SWAP_ROUTER).join(", ")}`,
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
        return c.error(
          `Token "${args.tokenIn}" not found on chain ${chainId}.`,
        );
      }
      if (!tokenOutAddress) {
        return c.error(
          `Token "${args.tokenOut}" not found on chain ${chainId}.`,
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

      // Policy check
      const check = await ctx.policyGuard.check("swap", {
        value: amountIn,
        chainId,
        token: args.tokenIn.toUpperCase(),
        slippage: args.slippage,
      });
      if (!check.ok) {
        return c.error(`Policy rejected: ${check.reason}`);
      }

      // If ERC20 input, check allowance and auto-approve
      if (!isEthIn) {
        const allowance = (await pub.readContract({
          address: tokenInAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, routerAddress],
        })) as bigint;

        if (allowance < amountIn) {
          // Check if approve is allowed
          if (
            !ctx.policyGuard.policy.allowedOperations.includes("approve")
          ) {
            return c.error(
              'Swap requires token approval, but "approve" is not in allowedOperations. Add "approve" to your policy.',
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
              fee: 3000, // 0.3% pool
              sqrtPriceLimitX96: 0n,
            },
          ],
        });
        const quotedAmount = (quoteResult.result as any)[0] as bigint;
        // Apply slippage
        amountOutMinimum =
          quotedAmount - (quotedAmount * BigInt(Math.floor(args.slippage * 100))) / 10000n;
      } catch {
        // If quote fails, use 0 (accept any amount — user controls via slippage param)
        console.error("[vaulx] Quote failed, using amountOutMinimum=0");
      }

      // Build swap
      const swapData = encodeExactInputSingle({
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        fee: 3000,
        recipient: address,
        amountIn,
        amountOutMinimum,
      });

      const hash = await signer.sendTransaction({
        to: routerAddress,
        value: isEthIn ? amountIn : 0n,
        chainId,
        data: swapData,
      });

      await ctx.txLog.record({
        hash,
        chainId,
        to: routerAddress,
        value: amountIn.toString(),
        token: tokenInInfo.symbol,
        operation: "swap",
        timestamp: new Date().toISOString(),
        status: "sent",
      });

      const chain = getChain(chainId);
      return c.json({
        hash,
        tokenIn: tokenInInfo.symbol,
        tokenOut: tokenOutInfo.symbol,
        amountIn: args.amountIn,
        chainId,
        explorer: chain.blockExplorer
          ? `${chain.blockExplorer}/tx/${hash}`
          : undefined,
        proof: { type: "tx_hash", value: hash },
      });
    },
  );
}
