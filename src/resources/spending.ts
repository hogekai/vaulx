import type { MCPServer, Store } from "@lynq/lynq";
import type { ChainManager } from "../chain/manager.js";
import type { PolicyGuard } from "../guard/policy-guard.js";

interface SpendingCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	store: Store;
}

export function registerSpendingResource(server: MCPServer, ctx: SpendingCtx) {
	server.resource(
		"wallet://spending",
		{
			name: "Spending Status",
			description: "Current daily/total spend and remaining limits",
			mimeType: "application/json",
		},
		async () => {
			const policy = ctx.policyGuard.policy;
			const today = new Date().toISOString().slice(0, 10);
			const dailyKey = `daily:${ctx.chainManager.defaultChainId}:${today}`;
			const dailySpent = BigInt((await ctx.store.get<string>(dailyKey)) ?? "0");
			const totalKey = `total-spent:${ctx.chainManager.defaultChainId}`;
			const totalSpent = BigInt((await ctx.store.get<string>(totalKey)) ?? "0");

			return {
				text: JSON.stringify({
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
					policy: { expiresAt: policy.expiresAt || null },
				}),
			};
		},
	);
}
