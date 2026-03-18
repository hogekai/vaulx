import { afterEach, describe, expect, test } from "vitest";
import { getExplorerApiKey, getExplorerApiUrl } from "../../src/explorer/api.js";

describe("Explorer API", () => {
	afterEach(() => {
		delete process.env.ETHERSCAN_API_KEY_1;
		delete process.env.ETHERSCAN_API_KEY_84532;
	});

	test("getExplorerApiUrl: supported chains return correct URLs", () => {
		expect(getExplorerApiUrl(1)).toContain("etherscan.io");
		expect(getExplorerApiUrl(8453)).toContain("basescan.org");
		expect(getExplorerApiUrl(84532)).toContain("sepolia.basescan.org");
		expect(getExplorerApiUrl(11155111)).toContain("sepolia.etherscan.io");
	});

	test("getExplorerApiUrl: unsupported chain → throws", () => {
		expect(() => getExplorerApiUrl(99999)).toThrow();
	});

	test("getExplorerApiKey: per-chain env takes priority", () => {
		process.env.ETHERSCAN_API_KEY_1 = "per-chain-key";
		expect(getExplorerApiKey(1)).toBe("per-chain-key");
	});

	test("getExplorerApiKey: returns string (may be empty) for any chain", () => {
		const key = getExplorerApiKey(84532);
		expect(typeof key).toBe("string");
	});
});
