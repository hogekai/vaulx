import { afterAll, describe, expect, test } from "vitest";
import { registerWithdraw } from "../../../src/tools/withdraw.js";
import { setupToolTest, type ToolTestContext } from "../../mocks/tool-test-helper.js";

const VALID_ADDR = "0x1234567890abcdef1234567890abcdef12345678";

describe("withdraw tool", () => {
	let ctx: ToolTestContext;

	afterAll(async () => {
		await ctx?.client.close();
	});

	test("withdraw specific amount", async () => {
		ctx = await setupToolTest(registerWithdraw);
		const result = await ctx.client.callTool("withdraw", {
			to: VALID_ADDR,
			amount: "0.01",
		});
		expect(result.isError).toBeFalsy();
		const text = (result.content as any[])[0]?.text;
		const data = JSON.parse(text);
		expect(data.hash).toMatch(/^0x/);
	});

	test("withdraw without 'to' and no WITHDRAW_TO → error", async () => {
		// Ensure WITHDRAW_TO is not set
		const orig = process.env.WITHDRAW_TO;
		delete process.env.WITHDRAW_TO;

		ctx = await setupToolTest(registerWithdraw);
		const result = await ctx.client.callTool("withdraw", {
			amount: "0.01",
		});
		expect(result.isError).toBeTruthy();

		if (orig) process.env.WITHDRAW_TO = orig;
	});

	test("zero balance → error", async () => {
		ctx = await setupToolTest(registerWithdraw, {
			signer: { balance: 0n },
		});
		const result = await ctx.client.callTool("withdraw", {
			to: VALID_ADDR,
		});
		expect(result.isError).toBeTruthy();
	});

	test("withdraw operation not allowed → POLICY_VIOLATION", async () => {
		ctx = await setupToolTest(registerWithdraw, {
			policy: { allowedOperations: ["send"] },
		});
		const result = await ctx.client.callTool("withdraw", {
			to: VALID_ADDR,
			amount: "0.001",
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("POLICY_VIOLATION");
	});
});
