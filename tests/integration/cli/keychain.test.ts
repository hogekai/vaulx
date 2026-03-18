import { describe, expect, test } from "vitest";
import {
	deleteFromKeychain,
	isKeychainAvailable,
	loadFromKeychain,
	saveToKeychain,
} from "../../../src/cli/keychain.js";

const available = isKeychainAvailable();

describe.skipIf(!available)("Keychain (platform-specific)", () => {
	const testName = `vaulx-test-${Date.now()}`;

	test("isKeychainAvailable returns true", () => {
		expect(isKeychainAvailable()).toBe(true);
	});

	test("save → load → delete lifecycle", async () => {
		const secret = `0xtest_${Date.now()}`;

		const saved = await saveToKeychain(testName, secret);
		expect(saved).toBe(true);

		const loaded = await loadFromKeychain(testName);
		expect(loaded).toBe(secret);

		await deleteFromKeychain(testName);

		const afterDelete = await loadFromKeychain(testName);
		expect(afterDelete).toBeNull();
	});

	test("loadFromKeychain: non-existent → null", async () => {
		const result = await loadFromKeychain(`vaulx-nonexistent-${Date.now()}`);
		expect(result).toBeNull();
	});

	test("deleteFromKeychain: non-existent → no throw", async () => {
		await deleteFromKeychain(`vaulx-nonexistent-${Date.now()}`);
	});
});

describe.skipIf(available)("Keychain (unavailable platform)", () => {
	test("isKeychainAvailable returns false", () => {
		expect(isKeychainAvailable()).toBe(false);
	});

	test("saveToKeychain returns false", async () => {
		expect(await saveToKeychain("test", "0xkey")).toBe(false);
	});

	test("loadFromKeychain returns null", async () => {
		expect(await loadFromKeychain("test")).toBeNull();
	});
});
