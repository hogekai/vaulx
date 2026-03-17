import type { Store } from "@lynq/lynq";
import type { SpendingPolicy } from "../policy.js";

export interface PolicyCheckParams {
  value?: bigint;
  to?: `0x${string}`;
  chainId?: number;
  token?: string;
  slippage?: number;
}

export interface PolicyGuard {
  check(
    operation: string,
    params: PolicyCheckParams,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  policy: SpendingPolicy;
}

export function createPolicyGuard(
  policy: SpendingPolicy,
  store: Store,
): PolicyGuard {
  return {
    policy,

    async check(operation, params) {
      // Check expiry
      if (policy.expiresAt) {
        const expiry = new Date(policy.expiresAt);
        if (Date.now() > expiry.getTime()) {
          return { ok: false, reason: "Policy expired" };
        }
      }

      // Check operation allowed
      if (!policy.allowedOperations.includes(operation)) {
        return {
          ok: false,
          reason: `Operation "${operation}" not allowed. Allowed: ${policy.allowedOperations.join(", ")}`,
        };
      }

      // Check allowed chains
      if (
        params.chainId !== undefined &&
        policy.allowedChains &&
        policy.allowedChains.length > 0 &&
        !policy.allowedChains.includes(params.chainId)
      ) {
        return {
          ok: false,
          reason: `Chain ${params.chainId} not allowed. Allowed: ${policy.allowedChains.join(", ")}`,
        };
      }

      // Check token allowed
      if (params.token && !policy.allowedTokens.includes(params.token)) {
        return {
          ok: false,
          reason: `Token "${params.token}" not allowed. Allowed: ${policy.allowedTokens.join(", ")}`,
        };
      }

      // Check slippage (for swap operations)
      if (
        params.slippage !== undefined &&
        policy.maxSlippage !== undefined &&
        params.slippage > policy.maxSlippage
      ) {
        return {
          ok: false,
          reason: `Slippage ${params.slippage}% exceeds max ${policy.maxSlippage}%`,
        };
      }

      // Check approve amount
      if (operation === "approve" && params.value !== undefined && policy.maxApproveAmount) {
        const maxApprove = BigInt(policy.maxApproveAmount);
        if (params.value > maxApprove) {
          return {
            ok: false,
            reason: `Approve amount exceeds maxApproveAmount: ${params.value} > ${maxApprove}`,
          };
        }
      }

      // Recipient and value checks only apply when provided
      if (params.to) {
        const to = params.to.toLowerCase();

        // Check blocked recipients
        if (policy.blockedRecipients?.some((r) => r.toLowerCase() === to)) {
          return { ok: false, reason: `Recipient ${params.to} is blocked` };
        }

        // Check allowed recipients (if set)
        if (
          policy.allowedRecipients &&
          policy.allowedRecipients.length > 0 &&
          !policy.allowedRecipients.some((r) => r.toLowerCase() === to)
        ) {
          return {
            ok: false,
            reason: `Recipient ${params.to} not in allowed list`,
          };
        }
      }

      if (params.value !== undefined && operation !== "approve") {
        // Check per-tx limit
        const maxPerTx = BigInt(policy.maxPerTx);
        if (params.value > maxPerTx) {
          return {
            ok: false,
            reason: `Exceeds per-tx limit: ${params.value} > ${maxPerTx}`,
          };
        }

        // Check daily limit
        if (policy.maxPerDay && params.chainId !== undefined) {
          const maxPerDay = BigInt(policy.maxPerDay);
          const today = new Date().toISOString().slice(0, 10);
          const dailyKey = `daily:${params.chainId}:${today}`;
          const current = BigInt(
            (await store.get<string>(dailyKey)) ?? "0",
          );
          if (current + params.value > maxPerDay) {
            return {
              ok: false,
              reason: `Exceeds daily limit: ${current + params.value} > ${maxPerDay}`,
            };
          }
        }

        // Check total limit
        if (policy.maxTotal) {
          const maxTotal = BigInt(policy.maxTotal);
          const total = BigInt(
            (await store.get<string>("total-spent")) ?? "0",
          );
          if (total + params.value > maxTotal) {
            return {
              ok: false,
              reason: `Exceeds total limit: ${total + params.value} > ${maxTotal}`,
            };
          }
        }
      }

      return { ok: true };
    },
  };
}
