import { createMCPServer, memoryStore } from "@lynq/lynq";
import { createTestClient, type TestClient } from "@lynq/lynq/test";
import { createPolicyGuard } from "../../src/guard/policy-guard.js";
import { createTxLog } from "../../src/log/tx-log.js";
import type { SpendingPolicy } from "../../src/policy.js";
import { TokenRegistry } from "../../src/token/registry.js";
import { createMockChainManager } from "./chain-manager.js";
import type { MockSignerOptions } from "./signer.js";

export interface ToolTestContext {
	client: TestClient;
	store: ReturnType<typeof memoryStore>;
}

export async function setupToolTest(
	registerFn: (server: any, ctx: any) => void,
	opts?: {
		policy?: Partial<SpendingPolicy>;
		signer?: MockSignerOptions;
		defaultChainId?: string;
	},
): Promise<ToolTestContext> {
	const store = memoryStore();
	const chainManager = createMockChainManager(
		opts?.defaultChainId
			? { signer: opts.signer, defaultChainId: opts.defaultChainId }
			: opts?.signer,
	);
	const policyGuard = createPolicyGuard(
		{
			maxPerTx: "1000000000000000000",
			maxPerDay: "10000000000000000000",
			allowedTokens: ["ETH", "USDC", "USDT", "DAI", "WETH"],
			allowedOperations: ["send", "send_token", "approve", "swap", "withdraw", "sign"],
			allowedRecipients: [],
			blockedRecipients: [],
			...(opts?.policy ?? {}),
		} as SpendingPolicy,
		store,
	);
	const txLog = createTxLog(store);
	const tokenRegistry = new TokenRegistry();

	const server = createMCPServer({ name: "test", version: "0.0.0", store });

	registerFn(server, { chainManager, policyGuard, txLog, tokenRegistry });

	const client = await createTestClient(server);

	return { client, store };
}
