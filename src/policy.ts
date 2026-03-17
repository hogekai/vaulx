import { readFileSync } from "node:fs";
import { z } from "zod";
import { WALLET_POLICY } from "./config.js";

const SpendingPolicySchema = z.object({
  maxPerTx: z.string(),
  maxPerDay: z.string().optional(),
  maxTotal: z.string().optional(),
  allowedTokens: z.array(z.string()).default(["ETH"]),
  allowedRecipients: z.array(z.string()).optional(),
  blockedRecipients: z.array(z.string()).optional(),
  allowedOperations: z.array(z.string()).default(["send", "sign"]),
  maxApproveAmount: z.string().optional(),
  expiresAt: z.string().optional(),
  allowedChains: z.array(z.number()).optional(),
  maxSlippage: z.number().optional(),
  allowedSwapTokens: z.array(z.string()).optional(),
});

export type SpendingPolicy = z.infer<typeof SpendingPolicySchema>;

export function loadPolicy(): SpendingPolicy {
  if (WALLET_POLICY) {
    const raw = readFileSync(WALLET_POLICY, "utf-8");
    return SpendingPolicySchema.parse(JSON.parse(raw));
  }

  return SpendingPolicySchema.parse({
    maxPerTx: "100000000000000000", // 0.1 ETH
    maxPerDay: "500000000000000000", // 0.5 ETH
    allowedTokens: ["ETH"],
    allowedOperations: ["send", "sign", "withdraw"],
  });
}
