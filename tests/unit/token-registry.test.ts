import { describe, expect, test } from "vitest";
import { TokenRegistry } from "../../src/token/registry.js";

describe("TokenRegistry", () => {
	const reg = new TokenRegistry();

	// --- resolve ---
	test("resolve: known token on known chain", () => {
		const token = reg.resolve(1, "USDC");
		expect(token).not.toBeNull();
		expect(token!.decimals).toBe(6);
		expect(token!.address).toMatch(/^0x/);
	});

	test("resolve: case insensitive symbol", () => {
		expect(reg.resolve(1, "usdc")).toEqual(reg.resolve(1, "USDC"));
		expect(reg.resolve(1, "Usdc")).toEqual(reg.resolve(1, "USDC"));
	});

	test("resolve: unknown token → null", () => {
		expect(reg.resolve(1, "FAKE_TOKEN_XYZ")).toBeNull();
	});

	test("resolve: unknown chain → null", () => {
		expect(reg.resolve(99999, "USDC")).toBeNull();
	});

	// --- resolveByAddress ---
	test("resolveByAddress: known address", () => {
		const token = reg.resolve(1, "USDC")!;
		const found = reg.resolveByAddress(1, token.address);
		expect(found).not.toBeNull();
		expect(found!.symbol).toBe("USDC");
	});

	test("resolveByAddress: case insensitive address", () => {
		const token = reg.resolve(1, "USDC")!;
		const found = reg.resolveByAddress(1, token.address.toLowerCase() as `0x${string}`);
		expect(found).not.toBeNull();
	});

	test("resolveByAddress: unknown address → null", () => {
		expect(reg.resolveByAddress(1, "0x0000000000000000000000000000000000000000")).toBeNull();
	});

	// --- list ---
	test("list: returns tokens for chain", () => {
		const tokens = reg.list(1);
		expect(tokens.length).toBeGreaterThanOrEqual(1);
		expect(tokens.map((t) => t.symbol)).toContain("USDC");
	});

	test("list: unknown chain → empty array", () => {
		expect(reg.list(99999)).toEqual([]);
	});

	// --- cross-chain coverage ---
	test("USDC exists on all supported chains", () => {
		for (const chainId of [1, 8453, 84532, 11155111]) {
			const token = reg.resolve(chainId, "USDC");
			expect(token, `USDC missing on chain ${chainId}`).not.toBeNull();
			expect(token!.decimals).toBe(6);
		}
	});

	test("addresses do not collide within a chain", () => {
		for (const chainId of [1, 8453]) {
			const tokens = reg.list(chainId);
			const seen = new Set<string>();
			for (const t of tokens) {
				const lower = t.address.toLowerCase();
				expect(seen.has(lower), `Duplicate address on chain ${chainId}: ${t.symbol}`).toBe(false);
				seen.add(lower);
			}
		}
	});

	test("custom tokens file: invalid path → no crash", () => {
		const custom = new TokenRegistry("/nonexistent/path.json");
		expect(custom.resolve(1, "USDC")).not.toBeNull();
	});
});
