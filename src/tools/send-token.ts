import type { MCPServer } from "@lynq/lynq";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { resolveChainId, getChain, DEFAULT_CHAIN_ID } from "../config.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
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
      input: z
        .object({
          to: z.string().optional().describe("Recipient address (0x...)"),
          recipient: z
            .string()
            .optional()
            .describe("Alias for 'to' (agentPayment compat)"),
          value: z
            .string()
            .optional()
            .describe("Amount in token units (e.g. '10' for 10 USDC)"),
          amount: z
            .string()
            .optional()
            .describe("Alias for 'value' (agentPayment compat)"),
          token: z.string().describe("Token symbol (e.g. 'USDC')"),
          chainId: z
            .union([z.string(), z.number()])
            .optional()
            .describe("Chain ID or network alias"),
          network: z
            .string()
            .optional()
            .describe("Network alias (e.g. 'base-sepolia')"),
        })
        .refine((d) => d.to || d.recipient, "to or recipient required")
        .refine((d) => d.value || d.amount, "value or amount required"),
    },
    async (args, c) => {
      const to = (args.to || args.recipient) as `0x${string}`;
      const tokenAmount = args.value || args.amount!;
      const chainId = resolveChainId(
        args.chainId ?? args.network ?? DEFAULT_CHAIN_ID,
      );
      const signer = await ctx.chainManager.getSigner(chainId);

      const token = ctx.tokenRegistry.resolve(chainId, args.token);
      if (!token) {
        return c.error(
          `Token "${args.token}" not found on chain ${chainId}. Check supported tokens.`,
        );
      }

      const rawAmount = parseUnits(tokenAmount, token.decimals);

      // Check native balance for gas (skip with paymaster)
      if (!signer.hasPaymaster) {
        const balance = await signer.getBalance(chainId);
        if (balance === 0n) {
          return c.error(
            "No native token balance for gas. Deposit ETH first.",
          );
        }
      }

      const check = await ctx.policyGuard.check("send", {
        value: rawAmount,
        to,
        chainId,
        token: args.token.toUpperCase(),
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
        operation: "send_token",
        timestamp: new Date().toISOString(),
        status: "sent",
      });

      const chain = getChain(chainId);
      return c.json({
        hash,
        chainId,
        token: token.symbol,
        amount: tokenAmount,
        explorer: chain.blockExplorer
          ? `${chain.blockExplorer}/tx/${hash}`
          : undefined,
        proof: { type: "tx_hash", value: hash },
      });
    },
  );
}
