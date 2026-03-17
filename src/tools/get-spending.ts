import type { MCPServer, Store } from "@lynq/lynq";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import type { PolicyGuard } from "../guard/policy-guard.js";

interface GetSpendingCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	store: Store;
}

export function registerGetSpending(server: MCPServer, ctx: GetSpendingCtx) {
	server.tool(
		"get_spending",
		{
			description: "Get current spending status: daily/total spend and remaining limits.",
			input: z.object({}),
		},
		async (_args, c) => {
			const policy = ctx.policyGuard.policy;
			const today = new Date().toISOString().slice(0, 10);
			const dailyKey = `daily:${ctx.chainManager.defaultChainId}:${today}`;
			const dailySpent = BigInt((await ctx.store.get<string>(dailyKey)) ?? "0");
			const totalSpent = BigInt((await ctx.store.get<string>("total-spent")) ?? "0");

			return c.json({
				daily: {
					spent: dailySpent.toString(),
					limit: policy.maxPerDay ?? "unlimited",
					remaining: policy.maxPerDay
						? (BigInt(policy.maxPerDay) - dailySpent).toString()
						: "unlimited",
				},
				total: {
					spent: totalSpent.toString(),
					limit: policy.maxTotal ?? "unlimited",
					remaining: policy.maxTotal
						? (BigInt(policy.maxTotal) - totalSpent).toString()
						: "unlimited",
				},
				perTx: { limit: policy.maxPerTx },
			});
		},
	);
}
