import { memoryStore } from "@lynq/lynq";
import { beforeEach, describe, expect, test } from "vitest";
import { VaulxError } from "../../src/errors.js";
import { createPolicyGuard } from "../../src/guard/policy-guard.js";
import { executeTx } from "../../src/helpers/execute-tx.js";
import { createTxLog } from "../../src/log/tx-log.js";
import type { SpendingPolicy } from "../../src/policy.js";
import type { ChainManager } from "../../src/chain/manager.js";
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
});
