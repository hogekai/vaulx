import type { IncomingMessage } from "node:http";
import { beforeEach, describe, expect, test } from "vitest";
import { _resetAuthToken, getAuthToken, validateAuth } from "../../src/http/auth.js";

describe("HTTP Auth", () => {
	beforeEach(() => {
		_resetAuthToken();
	});

	test("getAuthToken: uses WALLET_AUTH_TOKEN env when set", () => {
		process.env.WALLET_AUTH_TOKEN = "test-secret-123";
		const token = getAuthToken();
		expect(token).toBe("test-secret-123");
		delete process.env.WALLET_AUTH_TOKEN;
	});

	test("getAuthToken: auto-generates when env not set", () => {
		delete process.env.WALLET_AUTH_TOKEN;
		const token = getAuthToken();
		expect(token).toBeTruthy();
		expect(token.length).toBeGreaterThan(0);
	});

	test("getAuthToken: returns same value on repeated calls", () => {
		delete process.env.WALLET_AUTH_TOKEN;
		const first = getAuthToken();
		const second = getAuthToken();
		expect(first).toBe(second);
	});

	test("validateAuth: correct Bearer token → true", () => {
		process.env.WALLET_AUTH_TOKEN = "secret-abc";
		const req = { headers: { authorization: "Bearer secret-abc" } } as unknown as IncomingMessage;
		expect(validateAuth(req)).toBe(true);
		delete process.env.WALLET_AUTH_TOKEN;
	});

	test("validateAuth: wrong token → false", () => {
		process.env.WALLET_AUTH_TOKEN = "secret-abc";
		const req = { headers: { authorization: "Bearer wrong" } } as unknown as IncomingMessage;
		expect(validateAuth(req)).toBe(false);
		delete process.env.WALLET_AUTH_TOKEN;
	});

	test("validateAuth: missing header → false", () => {
		process.env.WALLET_AUTH_TOKEN = "secret-abc";
		const req = { headers: {} } as unknown as IncomingMessage;
		expect(validateAuth(req)).toBe(false);
		delete process.env.WALLET_AUTH_TOKEN;
	});

	test("validateAuth: malformed header → false", () => {
		process.env.WALLET_AUTH_TOKEN = "secret-abc";
		const req = { headers: { authorization: "Basicsecret-abc" } } as unknown as IncomingMessage;
		expect(validateAuth(req)).toBe(false);
		delete process.env.WALLET_AUTH_TOKEN;
	});
});
