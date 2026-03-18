import { afterAll, describe, expect, test } from "vitest";
import { registerRevokeToken } from "../../../src/tools/revoke-token.js";
import { setupToolTest, type ToolTestContext } from "../../mocks/tool-test-helper.js";

const SPENDER = "0x1234567890abcdef1234567890abcdef12345678";

describe("revoke_token tool", () => {
	let ctx: ToolTestContext;

	afterAll(async () => {
		await ctx?.client.close();
	});

	test("successful revocation", async () => {
		ctx = await setupToolTest(registerRevokeToken);
		const result = await ctx.client.callTool("revoke_token", {
			spender: SPENDER,
			token: "USDC",
		});
		expect(result.isError).toBeFalsy();
		const text = (result.content as any[])[0]?.text;
		const data = JSON.parse(text);
		expect(data.hash).toMatch(/^0x/);
		expect(data.revoked).toBe(true);
	});

	test("unknown token → UNKNOWN_TOKEN", async () => {
		ctx = await setupToolTest(registerRevokeToken);
		const result = await ctx.client.callTool("revoke_token", {
			spender: SPENDER,
			token: "FAKE_XYZ",
		});
		expect(result.isError).toBeTruthy();
	});

	test("invalid spender address → error", async () => {
		ctx = await setupToolTest(registerRevokeToken);
		const result = await ctx.client.callTool("revoke_token", {
			spender: "bad-address",
			token: "USDC",
		});
		expect(result.isError).toBeTruthy();
	});
});
