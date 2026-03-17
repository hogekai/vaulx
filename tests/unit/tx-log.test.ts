import { memoryStore } from "@lynq/lynq";
import { beforeEach, describe, expect, test } from "vitest";
import { createTxLog, type TxLog, type TxRecord } from "../../src/log/tx-log.js";

function makeTx(overrides: Partial<TxRecord> = {}): TxRecord {
	return {
		hash: "0xabc",
		chainId: 84532,
		to: "0x1234567890abcdef1234567890abcdef12345678",
		value: "100000000000000000",
		token: "ETH",
		operation: "send",
		timestamp: new Date().toISOString(),
		status: "sent",
		...overrides,
	};
}

describe("TxLog", () => {
	let store: ReturnType<typeof memoryStore>;
	let txLog: TxLog;

	beforeEach(() => {
		store = memoryStore();
		txLog = createTxLog(store);
	});

	test("record and list", async () => {
		await txLog.record(makeTx());
		const list = await txLog.list();
		expect(list).toHaveLength(1);
		expect(list[0].hash).toBe("0xabc");
	});

	test("record updates daily counter", async () => {
		const tx = makeTx();
		await txLog.record(tx);
		const day = tx.timestamp.slice(0, 10);
		const daily = await store.get<string>(`daily:84532:${day}`);
		expect(daily).toBe("100000000000000000");
	});

	test("record updates total counter", async () => {
		await txLog.record(makeTx());
		const total = await store.get<string>("total-spent");
		expect(total).toBe("100000000000000000");
	});

	test("multiple records accumulate", async () => {
		await txLog.record(makeTx());
		await txLog.record(makeTx({ hash: "0xdef" }));
		const list = await txLog.list();
		expect(list).toHaveLength(2);
		const total = await store.get<string>("total-spent");
		expect(total).toBe("200000000000000000");
	});

	test("recent returns last n", async () => {
		await txLog.record(makeTx({ hash: "0x1" }));
		await txLog.record(makeTx({ hash: "0x2" }));
		await txLog.record(makeTx({ hash: "0x3" }));
		const recent = await txLog.recent(2);
		expect(recent).toHaveLength(2);
		expect(recent[0].hash).toBe("0x2");
		expect(recent[1].hash).toBe("0x3");
	});

	test("byChain filters correctly", async () => {
		await txLog.record(makeTx({ chainId: 84532 }));
		await txLog.record(makeTx({ chainId: 1, hash: "0xdef" }));
		const filtered = await txLog.byChain(84532);
		expect(filtered).toHaveLength(1);
	});

	test("byOperation filters correctly", async () => {
		await txLog.record(makeTx({ operation: "send" }));
		await txLog.record(makeTx({ operation: "swap", hash: "0xdef" }));
		const filtered = await txLog.byOperation("swap");
		expect(filtered).toHaveLength(1);
		expect(filtered[0].hash).toBe("0xdef");
	});

	test("isDuplicate: same params within 10s → true", async () => {
		await txLog.record(makeTx());
		const dup = await txLog.isDuplicate({
			to: "0x1234567890abcdef1234567890abcdef12345678",
			value: "100000000000000000",
			chainId: 84532,
		});
		expect(dup).toBe(true);
	});

	test("isDuplicate: different to → false", async () => {
		await txLog.record(makeTx());
		const dup = await txLog.isDuplicate({
			to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			value: "100000000000000000",
			chainId: 84532,
		});
		expect(dup).toBe(false);
	});

	test("isDuplicate: different value → false", async () => {
		await txLog.record(makeTx());
		const dup = await txLog.isDuplicate({
			to: "0x1234567890abcdef1234567890abcdef12345678",
			value: "200000000000000000",
			chainId: 84532,
		});
		expect(dup).toBe(false);
	});

	test("updateStatus: sent → confirmed", async () => {
		await txLog.record(makeTx({ hash: "0xupdate" }));
		await txLog.updateStatus("0xupdate", "confirmed");
		const all = await txLog.list();
		expect(all[0].status).toBe("confirmed");
	});

	test("updateStatus: non-existent hash → noop", async () => {
		await txLog.updateStatus("0xnonexistent", "failed");
		const all = await txLog.list();
		expect(all).toHaveLength(0);
	});

	test("pending: returns only sent", async () => {
		await txLog.record(makeTx({ hash: "0x1" }));
		await txLog.record(makeTx({ hash: "0x2" }));
		await txLog.updateStatus("0x1", "confirmed");
		const pending = await txLog.pending();
		expect(pending).toHaveLength(1);
		expect(pending[0].hash).toBe("0x2");
	});

	test("isDuplicate: old tx (>10s) → false", async () => {
		const oldTimestamp = new Date(Date.now() - 15_000).toISOString();
		await txLog.record(makeTx({ timestamp: oldTimestamp }));
		const dup = await txLog.isDuplicate({
			to: "0x1234567890abcdef1234567890abcdef12345678",
			value: "100000000000000000",
			chainId: 84532,
		});
		expect(dup).toBe(false);
	});
});
