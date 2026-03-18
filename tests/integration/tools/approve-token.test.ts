import { afterAll, describe, expect, test } from "vitest";
import { registerApproveToken } from "../../../src/tools/approve-token.js";
import { setupToolTest, type ToolTestContext } from "../../mocks/tool-test-helper.js";

const SPENDER = "0x1234567890abcdef1234567890abcdef12345678";

describe("approve_token tool", () => {
	let ctx: ToolTestContext;

	afterAll(async () => {
		await ctx?.client.close();
	});

	test("approve with explicit amount", async () => {
		ctx = await setupToolTest(registerApproveToken);
		const result = await ctx.client.callTool("approve_token", {
			spender: SPENDER,
			token: "USDC",
			amount: "100",
		});
		expect(result.isError).toBeFalsy();
		const text = (result.content as any[])[0]?.text;
		const data = JSON.parse(text);
		expect(data.hash).toMatch(/^0x/);
	});

	test("approve without amount uses policy default", async () => {
		ctx = await setupToolTest(registerApproveToken);
		const result = await ctx.client.callTool("approve_token", {
			spender: SPENDER,
			token: "USDC",
		});
		expect(result.isError).toBeFalsy();
	});

	test("unknown token → UNKNOWN_TOKEN", async () => {
		ctx = await setupToolTest(registerApproveToken);
		const result = await ctx.client.callTool("approve_token", {
			spender: SPENDER,
			token: "FAKE_XYZ",
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("UNKNOWN_TOKEN");
	});

	test("operation not allowed → POLICY_VIOLATION", async () => {
		ctx = await setupToolTest(registerApproveToken, {
			policy: { allowedOperations: ["send"] },
		});
		const result = await ctx.client.callTool("approve_token", {
			spender: SPENDER,
			token: "USDC",
			amount: "10",
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("POLICY_VIOLATION");
	});
});
