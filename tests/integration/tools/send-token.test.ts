import { afterAll, describe, expect, test } from "vitest";
import { registerSendToken } from "../../../src/tools/send-token.js";
import { setupToolTest, type ToolTestContext } from "../../mocks/tool-test-helper.js";

const VALID_ADDR = "0x1234567890abcdef1234567890abcdef12345678";

describe("send_token tool", () => {
	let ctx: ToolTestContext;

	afterAll(async () => {
		await ctx?.client.close();
	});

	test("successful ERC20 send", async () => {
		ctx = await setupToolTest(registerSendToken);
		const result = await ctx.client.callTool("send_token", {
			to: VALID_ADDR,
			value: "10",
			token: "USDC",
		});
		expect(result.isError).toBeFalsy();
		const text = (result.content as any[])[0]?.text;
		const data = JSON.parse(text);
		expect(data.hash).toMatch(/^0x/);
	});

	test("unknown token → UNKNOWN_TOKEN", async () => {
		ctx = await setupToolTest(registerSendToken);
		const result = await ctx.client.callTool("send_token", {
			to: VALID_ADDR,
			value: "10",
			token: "FAKE_TOKEN_XYZ",
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("UNKNOWN_TOKEN");
	});

	test("missing to → error", async () => {
		ctx = await setupToolTest(registerSendToken);
		const result = await ctx.client.callTool("send_token", {
			value: "10",
			token: "USDC",
		});
		expect(result.isError).toBeTruthy();
	});

	test("agentPayment aliases work", async () => {
		ctx = await setupToolTest(registerSendToken);
		const result = await ctx.client.callTool("send_token", {
			recipient: VALID_ADDR,
			amount: "10",
			token: "USDC",
		});
		expect(result.isError).toBeFalsy();
	});

	test("token amount enforced by policy (not raw tx value)", async () => {
		// maxPerTx = 5 USDC (in 6 decimals = 5000000)
		// Sending 10 USDC should be rejected even though on-chain ETH value is 0
		ctx = await setupToolTest(registerSendToken, {
			policy: { maxPerTx: "5000000" },
		});
		const result = await ctx.client.callTool("send_token", {
			to: VALID_ADDR,
			value: "10",
			token: "USDC",
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("POLICY_VIOLATION");
	});
});
