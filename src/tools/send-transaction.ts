import type { MCPServer } from "@lynq/lynq";
import { formatEther, parseEther } from "viem";
import { z } from "zod";
import {
  resolveChainId,
  getChain,
  DEFAULT_CHAIN_ID,
} from "../config.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import type { TxLog } from "../log/tx-log.js";
import type { Signer } from "../signer/types.js";

interface SendTransactionCtx {
  signer: Signer;
  policyGuard: PolicyGuard;
  txLog: TxLog;
}

export function registerSendTransaction(
  server: MCPServer,
  ctx: SendTransactionCtx,
) {
  server.tool(
    "send_transaction",
    {
      description:
        "Send native token (ETH) on an EVM testnet. Returns tx hash and explorer link.",
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
            .describe("Amount in ETH (e.g. '0.01')"),
          amount: z
            .string()
            .optional()
            .describe("Alias for 'value' (agentPayment compat)"),
          chainId: z
            .union([z.string(), z.number()])
            .optional()
            .describe("Chain ID or network alias"),
          network: z
            .string()
            .optional()
            .describe("Network alias (e.g. 'base-sepolia')"),
          token: z.string().default("ETH").describe("Token symbol"),
        })
        .refine((d) => d.to || d.recipient, "to or recipient required")
        .refine((d) => d.value || d.amount, "value or amount required"),
    },
    async (args, c) => {
      // 1. Normalize params
      const to = (args.to || args.recipient) as `0x${string}`;
      const ethValue = args.value || args.amount!;
      const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);
      const value = parseEther(ethValue);

      // 2. Check balance for gas
      const balance = await ctx.signer.getBalance(chainId);
      if (balance < value) {
        return c.error(
          `Insufficient balance. Have: ${formatEther(balance)} ETH, Need: ${ethValue} ETH`,
        );
      }

      // 3. Policy check
      const check = await ctx.policyGuard.check("send", {
        value,
        to,
        chainId,
      });
      if (!check.ok) {
        return c.error(`Policy rejected: ${check.reason}`);
      }

      // 4. Send transaction
      const hash = await ctx.signer.sendTransaction({
        to,
        value,
        chainId,
      });

      // 5. Log
      await ctx.txLog.record({
        hash,
        chainId,
        to,
        value: value.toString(),
        token: args.token,
        operation: "send",
        timestamp: new Date().toISOString(),
        status: "sent",
      });

      // 6. Return proof-compatible response
      const chain = getChain(chainId);
      return c.json({
        hash,
        chainId,
        explorer: chain.blockExplorer
          ? `${chain.blockExplorer}/tx/${hash}`
          : undefined,
        proof: { type: "tx_hash", value: hash },
      });
    },
  );
}
