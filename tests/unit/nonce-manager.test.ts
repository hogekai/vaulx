import { describe, expect, test } from "vitest";
import { NonceManager } from "../../src/signer/env.js";

const ADDR = "0x1111111111111111111111111111111111111111" as `0x${string}`;

describe("NonceManager", () => {
	test("first call fetches from chain", async () => {
		const nm = new NonceManager();
		const nonce = await nm.next(ADDR, async () => 5);
		expect(nonce).toBe(5);
	});

	test("subsequent calls increment without fetching", async () => {
		const nm = new NonceManager();
		let fetchCount = 0;
		const getCount = async () => {
			fetchCount++;
			return 5;
		};

		await nm.next(ADDR, getCount); // 5
		const second = await nm.next(ADDR, getCount); // 6
		const third = await nm.next(ADDR, getCount); // 7

		expect(second).toBe(6);
		expect(third).toBe(7);
		expect(fetchCount).toBe(1);
	});

	test("reset causes re-fetch on next call", async () => {
		const nm = new NonceManager();
		let fetchCount = 0;
		const getCount = async () => {
			fetchCount++;
			return 10;
		};

		await nm.next(ADDR, getCount);
		nm.reset();
		const afterReset = await nm.next(ADDR, getCount);

		expect(afterReset).toBe(10);
		expect(fetchCount).toBe(2);
	});

	test("sequential calls get sequential nonces", async () => {
		const nm = new NonceManager();
		const getCount = async () => 0;

		const first = await nm.next(ADDR, getCount);
		const second = await nm.next(ADDR, getCount);
		const third = await nm.next(ADDR, getCount);

		expect(first).toBe(0);
		expect(second).toBe(1);
		expect(third).toBe(2);
	});
});
