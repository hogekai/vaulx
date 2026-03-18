import { afterAll, describe, expect, test } from "vitest";
import { registerSendTransaction } from "../../../src/tools/send-transaction.js";
import { setupToolTest, type ToolTestContext } from "../../mocks/tool-test-helper.js";

const VALID_ADDR = "0x1234567890abcdef1234567890abcdef12345678";

describe("send_transaction tool", () => {
	let ctx: ToolTestContext;

	afterAll(async () => {
		await ctx?.client.close();
	});

	test("successful send with 'to' and 'value'", async () => {
		ctx = await setupToolTest(registerSendTransaction);
		const result = await ctx.client.callTool("send_transaction", {
			to: VALID_ADDR,
			value: "0.001",
		});
		expect(result.isError).toBeFalsy();
		const text = (result.content as any[])[0]?.text;
		const data = JSON.parse(text);
		expect(data.hash).toMatch(/^0x/);
		expect(data.proof.type).toBe("tx_hash");
		expect(data.chainId).toBe(84532);
	});

	test("agentPayment aliases: 'recipient' and 'amount'", async () => {
		ctx = await setupToolTest(registerSendTransaction);
		const result = await ctx.client.callTool("send_transaction", {
			recipient: VALID_ADDR,
			amount: "0.001",
		});
		expect(result.isError).toBeFalsy();
	});

	test("missing 'to' and 'recipient' → error", async () => {
		ctx = await setupToolTest(registerSendTransaction);
		const result = await ctx.client.callTool("send_transaction", {
			value: "0.001",
		});
		expect(result.isError).toBeTruthy();
	});

	test("missing 'value' and 'amount' → error", async () => {
		ctx = await setupToolTest(registerSendTransaction);
		const result = await ctx.client.callTool("send_transaction", {
			to: VALID_ADDR,
		});
		expect(result.isError).toBeTruthy();
	});

	test("invalid address → error", async () => {
		ctx = await setupToolTest(registerSendTransaction);
		const result = await ctx.client.callTool("send_transaction", {
			to: "not-an-address",
			value: "0.001",
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("CONFIG_ERROR");
	});

	test("exceeds maxPerTx → POLICY_VIOLATION", async () => {
		ctx = await setupToolTest(registerSendTransaction, {
			policy: { maxPerTx: "1000000000000000" }, // 0.001 ETH
		});
		const result = await ctx.client.callTool("send_transaction", {
			to: VALID_ADDR,
			value: "0.01",
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("POLICY_VIOLATION");
	});

	test("insufficient balance → INSUFFICIENT_BALANCE", async () => {
		ctx = await setupToolTest(registerSendTransaction, {
			signer: { balance: 0n },
		});
		const result = await ctx.client.callTool("send_transaction", {
			to: VALID_ADDR,
			value: "0.001",
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("INSUFFICIENT_BALANCE");
	});

	test("paymaster skips balance check", async () => {
		ctx = await setupToolTest(registerSendTransaction, {
			signer: { balance: 0n, hasPaymaster: true },
		});
		const result = await ctx.client.callTool("send_transaction", {
			to: VALID_ADDR,
			value: "0.001",
		});
		expect(result.isError).toBeFalsy();
	});

	test("signer failure → TX_FAILED", async () => {
		ctx = await setupToolTest(registerSendTransaction, {
			signer: { sendError: new Error("nonce too low") },
		});
		const result = await ctx.client.callTool("send_transaction", {
			to: VALID_ADDR,
			value: "0.001",
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("TX_FAILED");
	});
});
