import { describe, expect, test } from "vitest";
import { resolveChainId } from "../../src/config.js";

describe("resolveChainId", () => {
	test("number passthrough", () => {
		expect(resolveChainId(84532)).toBe(84532);
	});

	test("string number", () => {
		expect(resolveChainId("84532")).toBe(84532);
	});

	test("alias: base-sepolia", () => {
		expect(resolveChainId("base-sepolia")).toBe(84532);
	});

	test("alias: sepolia", () => {
		expect(resolveChainId("sepolia")).toBe(11155111);
	});

	test("alias: ethereum", () => {
		expect(resolveChainId("ethereum")).toBe(1);
	});

	test("alias: base", () => {
		expect(resolveChainId("base")).toBe(8453);
	});

	test("undefined returns default", () => {
		expect(resolveChainId(undefined)).toBe(84532);
	});

	test("unknown string throws", () => {
		expect(() => resolveChainId("unknown-chain")).toThrow("Unknown chain");
	});
});
