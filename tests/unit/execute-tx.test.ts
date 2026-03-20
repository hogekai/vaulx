import { memoryStore } from "@lynq/lynq";
import { beforeEach, describe, expect, test } from "vitest";
import type { ChainManager } from "../../src/chain/manager.js";
import { VaulxError } from "../../src/errors.js";
import { createPolicyGuard } from "../../src/guard/policy-guard.js";
import { executeTx } from "../../src/helpers/execute-tx.js";
import { createTxLog } from "../../src/log/tx-log.js";
import type { SpendingPolicy } from "../../src/policy.js";
import type { Signer, TxParams } from "../../src/signer/types.js";

// Minimal mock — trackReceipt calls getPublicClient but it's fire-and-forget so errors are swallowed
const mockChainManager = {
	getPublicClient: () => ({
		waitForTransactionReceipt: async () => ({ status: "success" }),
	}),
} as unknown as ChainManager;

function mockSigner(overrides: Partial<Signer> = {}): Signer {
	return {
		mode: "env",
		hasPaymaster: false,
		getAddress: async () => "0x1111111111111111111111111111111111111111" as `0x${string}`,
		sendTransaction: async () => "0xhash" as `0x${string}`,
		signMessage: async () => "0xsig" as `0x${string}`,
		getBalance: async () => 1000000000000000000n,
		...overrides,
	};
}

function defaultPolicy(overrides: Partial<SpendingPolicy> = {}): SpendingPolicy {
	return {
		maxPerTx: "1000000000000000000",
		allowedTokens: ["ETH"],
		allowedOperations: ["send"],
		...overrides,
	} as SpendingPolicy;
}

describe("executeTx", () => {
	let store: ReturnType<typeof memoryStore>;

	beforeEach(() => {
		store = memoryStore();
	});

	test("successful execution", async () => {
		const policyGuard = createPolicyGuard(defaultPolicy(), store);
		const txLog = createTxLog(store);
		const signer = mockSigner();

		const result = await executeTx(
			{
				operation: "send",
				txParams: {
					to: "0x1234567890abcdef1234567890abcdef12345678",
					value: 100000000000000000n,
					chainId: 84532,
				},
				token: "ETH",
			},
			{ signer, policyGuard, txLog, chainManager: mockChainManager },
		);

		expect(result.hash).toBe("0xhash");
		expect(result.chainId).toBe(84532);
		expect(result.proof.type).toBe("tx_hash");
		expect(result.explorer).toContain("basescan");
	});

	test("records to txLog", async () => {
		const policyGuard = createPolicyGuard(defaultPolicy(), store);
		const txLog = createTxLog(store);

		await executeTx(
			{
				operation: "send",
				txParams: {
					to: "0x1234567890abcdef1234567890abcdef12345678",
					value: 100000000000000000n,
					chainId: 84532,
				},
				token: "ETH",
			},
			{ signer: mockSigner(), policyGuard, txLog, chainManager: mockChainManager },
		);

		const list = await txLog.list();
		expect(list).toHaveLength(1);
		expect(list[0].operation).toBe("send");
	});

	test("policy rejection throws POLICY_VIOLATION", async () => {
		const policyGuard = createPolicyGuard(defaultPolicy({ allowedOperations: [] }), store);
		const txLog = createTxLog(store);

		await expect(
			executeTx(
				{
					operation: "send",
					txParams: {
						to: "0x1234567890abcdef1234567890abcdef12345678",
						value: 1n,
						chainId: 84532,
					},
					token: "ETH",
				},
				{ signer: mockSigner(), policyGuard, txLog, chainManager: mockChainManager },
			),
		).rejects.toThrow(VaulxError);

		try {
			await executeTx(
				{
					operation: "send",
					txParams: {
						to: "0x1234567890abcdef1234567890abcdef12345678",
						value: 1n,
						chainId: 84532,
					},
					token: "ETH",
				},
				{ signer: mockSigner(), policyGuard, txLog, chainManager: mockChainManager },
			);
		} catch (e) {
			expect((e as VaulxError).code).toBe("POLICY_VIOLATION");
		}
	});

	test("signer failure throws TX_FAILED", async () => {
		const policyGuard = createPolicyGuard(defaultPolicy(), store);
		const txLog = createTxLog(store);
		const failSigner = mockSigner({
			sendTransaction: async () => {
				throw new Error("nonce too low");
			},
		});

		try {
			await executeTx(
				{
					operation: "send",
					txParams: {
						to: "0x1234567890abcdef1234567890abcdef12345678",
						value: 1n,
						chainId: 84532,
					},
					token: "ETH",
				},
				{ signer: failSigner, policyGuard, txLog, chainManager: mockChainManager },
			);
		} catch (e) {
			expect((e as VaulxError).code).toBe("TX_FAILED");
			expect((e as VaulxError).message).toContain("nonce too low");
		}
	});

	test("duplicate transaction throws TX_FAILED", async () => {
		const policyGuard = createPolicyGuard(defaultPolicy(), store);
		const txLog = createTxLog(store);
		const signer = mockSigner();
		const params: TxParams = {
			to: "0x1234567890abcdef1234567890abcdef12345678",
			value: 100000000000000000n,
			chainId: 84532,
		};

		// First call succeeds
		await executeTx(
			{ operation: "send", txParams: params, token: "ETH" },
			{ signer, policyGuard, txLog, chainManager: mockChainManager },
		);

		// Second call with same params should be duplicate
		try {
			await executeTx(
				{ operation: "send", txParams: params, token: "ETH" },
				{ signer, policyGuard, txLog, chainManager: mockChainManager },
			);
			expect.fail("Should have thrown");
		} catch (e) {
			expect((e as VaulxError).code).toBe("TX_FAILED");
			expect((e as VaulxError).message).toContain("Duplicate");
		}
	});

	test("tx lock prevents concurrent calls from bypassing daily limit", async () => {
		// maxPerDay allows exactly 2 txs of 0.3 ETH each (total 0.6 ETH)
		const maxPerDay = "600000000000000000"; // 0.6 ETH
		const policyGuard = createPolicyGuard(defaultPolicy({ maxPerDay }), store);
		const txLog = createTxLog(store);

		// Slow signer that yields the event loop (simulates async RPC)
		let sendCount = 0;
		const slowSigner = mockSigner({
			sendTransaction: async () => {
				sendCount++;
				await new Promise((r) => setTimeout(r, 10));
				return `0x${sendCount.toString().padStart(64, "0")}` as `0x${string}`;
			},
		});

		const txA = {
			to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			value: 300000000000000000n, // 0.3 ETH
			chainId: "84532",
		};
		const txB = {
			to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			value: 300000000000000000n, // 0.3 ETH
			chainId: "84532",
		};
		const txC = {
			to: "0xcccccccccccccccccccccccccccccccccccccccc",
			value: 300000000000000000n, // 0.3 ETH — should exceed daily limit
			chainId: "84532",
		};

		const deps = { signer: slowSigner, policyGuard, txLog, chainManager: mockChainManager };

		// Fire 3 concurrent txs — without lock, all 3 would see daily=0 and pass
		const results = await Promise.allSettled([
			executeTx({ operation: "send", txParams: txA, token: "ETH" }, deps),
			executeTx({ operation: "send", txParams: txB, token: "ETH" }, deps),
			executeTx({ operation: "send", txParams: txC, token: "ETH" }, deps),
		]);

		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");

		// With lock: 2 should succeed, 1 should be rejected (daily limit)
		expect(fulfilled).toHaveLength(2);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason.code).toBe("POLICY_VIOLATION");
	});

	test("policyExtra overrides txParams for policy check", async () => {
		// maxPerTx = 0.5 ETH — ERC20 transfer has value=0 on-chain
		const policyGuard = createPolicyGuard(
			defaultPolicy({
				maxPerTx: "500000000000000000",
				allowedOperations: ["send_token"],
				allowedTokens: ["ETH", "USDC"],
			}),
			store,
		);
		const txLog = createTxLog(store);

		// Without policyExtra, value=0n passes any limit
		// With policyExtra: { value: 1 ETH }, should exceed maxPerTx
		try {
			await executeTx(
				{
					operation: "send_token",
					txParams: {
						to: "0x1234567890abcdef1234567890abcdef12345678",
						value: 0n,
						chainId: "84532",
					},
					token: "USDC",
					policyExtra: { value: 1000000000000000000n }, // 1 ETH > 0.5 ETH limit
				},
				{ signer: mockSigner(), policyGuard, txLog, chainManager: mockChainManager },
			);
			expect.fail("Should have thrown");
		} catch (e) {
			expect((e as VaulxError).code).toBe("POLICY_VIOLATION");
			expect((e as VaulxError).message).toContain("per-tx limit");
		}
	});
});
