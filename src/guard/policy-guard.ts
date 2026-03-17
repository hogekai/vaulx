import type { Store } from "@lynq/lynq";
import type { SpendingPolicy } from "../policy.js";

export interface PolicyGuard {
  check(
    operation: string,
    params: { value: bigint; to: `0x${string}`; chainId: number },
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
}

export function createPolicyGuard(
  policy: SpendingPolicy,
  store: Store,
): PolicyGuard {
  return {
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

      // Check blocked recipients
      const to = params.to.toLowerCase();
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

      // Check per-tx limit
      const maxPerTx = BigInt(policy.maxPerTx);
      if (params.value > maxPerTx) {
        return {
          ok: false,
          reason: `Exceeds per-tx limit: ${params.value} > ${maxPerTx}`,
        };
      }

      // Check daily limit
      if (policy.maxPerDay) {
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

      return { ok: true };
    },
  };
}
