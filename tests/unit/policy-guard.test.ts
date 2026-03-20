import { memoryStore } from "@lynq/lynq";
import { beforeEach, describe, expect, test } from "vitest";
import { createPolicyGuard, type PolicyGuard } from "../../src/guard/policy-guard.js";
import type { SpendingPolicy } from "../../src/policy.js";

function defaultPolicy(overrides: Partial<SpendingPolicy> = {}): SpendingPolicy {
	return {
		maxPerTx: "100000000000000000", // 0.1 ETH
		maxPerDay: "500000000000000000", // 0.5 ETH
		maxTotal: "10000000000000000000", // 10 ETH
		allowedTokens: ["ETH", "USDC"],
		allowedOperations: ["send", "send_token", "approve", "swap", "withdraw", "sign"],
		allowedRecipients: [],
		blockedRecipients: [],
		...overrides,
	} as SpendingPolicy;
}

describe("PolicyGuard", () => {
	let store: ReturnType<typeof memoryStore>;
	let guard: PolicyGuard;

	beforeEach(() => {
		store = memoryStore();
		guard = createPolicyGuard(defaultPolicy(), store);
	});

	// --- maxPerTx ---
	test("maxPerTx: exactly at limit → ok", async () => {
		const r = await guard.check("send", { value: 100000000000000000n, chainId: "84532" });
		expect(r.ok).toBe(true);
	});

	test("maxPerTx: 1 wei over → rejected", async () => {
		const r = await guard.check("send", { value: 100000000000000001n, chainId: "84532" });
		expect(r.ok).toBe(false);
	});

	// --- maxPerDay ---
	test("maxPerDay: cumulative exceeds → rejected", async () => {
		// Simulate existing spend
		const today = new Date().toISOString().slice(0, 10);
		await store.set(`daily:84532:${today}`, "400000000000000000"); // 0.4 ETH

		const r = await guard.check("send", {
			value: 100000000000000001n, // 0.1+ ETH → total 0.5+ ETH
			chainId: "84532",
		});
		expect(r.ok).toBe(false);
	});

	test("maxPerDay: exactly at limit → ok", async () => {
		const today = new Date().toISOString().slice(0, 10);
		await store.set(`daily:84532:${today}`, "400000000000000000");

		const r = await guard.check("send", {
			value: 100000000000000000n, // exactly 0.1 ETH → total 0.5 ETH
			chainId: "84532",
		});
		expect(r.ok).toBe(true);
	});

	// --- maxTotal ---
	test("maxTotal: cumulative exceeds → rejected", async () => {
		await store.set("total-spent:84532", "9999999999999999999"); // just under 10 ETH

		const r = await guard.check("send", { value: 2n, chainId: "84532" });
		expect(r.ok).toBe(false);
	});

	// --- allowedTokens ---
	test("allowedTokens: allowed → ok", async () => {
		const r = await guard.check("send", { token: "ETH" });
		expect(r.ok).toBe(true);
	});

	test("allowedTokens: not allowed → rejected", async () => {
		const r = await guard.check("send", { token: "DAI" });
		expect(r.ok).toBe(false);
	});

	test("allowedTokens: case insensitive → ok", async () => {
		const r = await guard.check("send", { token: "usdc" });
		expect(r.ok).toBe(true);
	});

	test("allowedTokens: mixed case → ok", async () => {
		const r = await guard.check("send", { token: "Usdc" });
		expect(r.ok).toBe(true);
	});

	// --- allowedRecipients ---
	test("allowedRecipients: in list → ok", () => {
		const g = createPolicyGuard(
			defaultPolicy({
				allowedRecipients: ["0x1234567890abcdef1234567890abcdef12345678"],
			}),
			store,
		);
		return g
			.check("send", { to: "0x1234567890abcdef1234567890abcdef12345678" })
			.then((r) => expect(r.ok).toBe(true));
	});

	test("allowedRecipients: not in list → rejected", () => {
		const g = createPolicyGuard(
			defaultPolicy({
				allowedRecipients: ["0x1234567890abcdef1234567890abcdef12345678"],
			}),
			store,
		);
		return g
			.check("send", { to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })
			.then((r) => expect(r.ok).toBe(false));
	});

	test("allowedRecipients: case insensitive", () => {
		const g = createPolicyGuard(
			defaultPolicy({
				allowedRecipients: ["0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
			}),
			store,
		);
		return g
			.check("send", { to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })
			.then((r) => expect(r.ok).toBe(true));
	});

	// --- blockedRecipients ---
	test("blockedRecipients: blocked → rejected", () => {
		const g = createPolicyGuard(
			defaultPolicy({
				blockedRecipients: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
			}),
			store,
		);
		return g
			.check("send", { to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })
			.then((r) => expect(r.ok).toBe(false));
	});

	test("blockedRecipients: blocked takes priority over allowed", () => {
		const addr = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const g = createPolicyGuard(
			defaultPolicy({
				allowedRecipients: [addr],
				blockedRecipients: [addr],
			}),
			store,
		);
		return g.check("send", { to: addr }).then((r) => expect(r.ok).toBe(false));
	});

	// --- allowedOperations ---
	test("allowedOperations: allowed → ok", async () => {
		const r = await guard.check("send", {});
		expect(r.ok).toBe(true);
	});

	test("allowedOperations: not allowed → rejected", async () => {
		const r = await guard.check("unknown_op", {});
		expect(r.ok).toBe(false);
	});

	// --- maxApproveAmount ---
	test("maxApproveAmount: within limit → ok", async () => {
		const g = createPolicyGuard(defaultPolicy({ maxApproveAmount: "1000000000000000000" }), store);
		const r = await g.check("approve", { value: 1000000000000000000n });
		expect(r.ok).toBe(true);
	});

	test("maxApproveAmount: over limit → rejected", async () => {
		const g = createPolicyGuard(defaultPolicy({ maxApproveAmount: "1000000000000000000" }), store);
		const r = await g.check("approve", { value: 1000000000000000001n });
		expect(r.ok).toBe(false);
	});

	// --- expiresAt ---
	test("expiresAt: valid → ok", async () => {
		const future = new Date(Date.now() + 86400000).toISOString();
		const g = createPolicyGuard(defaultPolicy({ expiresAt: future }), store);
		const r = await g.check("send", {});
		expect(r.ok).toBe(true);
	});

	test("expiresAt: expired → rejected", async () => {
		const past = new Date(Date.now() - 1000).toISOString();
		const g = createPolicyGuard(defaultPolicy({ expiresAt: past }), store);
		const r = await g.check("send", {});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toContain("expired");
	});

	// --- allowedChains ---
	test("allowedChains: allowed → ok", async () => {
		const g = createPolicyGuard(defaultPolicy({ allowedChains: ["84532", "11155111"] }), store);
		const r = await g.check("send", { chainId: "84532" });
		expect(r.ok).toBe(true);
	});

	test("allowedChains: not allowed → rejected", async () => {
		const g = createPolicyGuard(defaultPolicy({ allowedChains: ["84532"] }), store);
		const r = await g.check("send", { chainId: "1" });
		expect(r.ok).toBe(false);
	});

	test("allowedChains: not set → all allowed", async () => {
		const r = await guard.check("send", { chainId: "1" });
		expect(r.ok).toBe(true);
	});

	// --- maxSlippage ---
	test("maxSlippage: within limit → ok", async () => {
		const g = createPolicyGuard(defaultPolicy({ maxSlippage: 1.0 }), store);
		const r = await g.check("swap", { slippage: 0.5 });
		expect(r.ok).toBe(true);
	});

	test("maxSlippage: over limit → rejected", async () => {
		const g = createPolicyGuard(defaultPolicy({ maxSlippage: 1.0 }), store);
		const r = await g.check("swap", { slippage: 1.5 });
		expect(r.ok).toBe(false);
	});

	// --- Edge cases ---
	test("value 0 passes policy (validateAmount catches this upstream)", async () => {
		const r = await guard.check("send", { value: 0n, chainId: "84532" });
		expect(r.ok).toBe(true);
	});
});
