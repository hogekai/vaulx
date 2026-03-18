import { afterAll, describe, expect, test } from "vitest";
import { registerSignMessage } from "../../../src/tools/sign-message.js";
import { setupToolTest, type ToolTestContext } from "../../mocks/tool-test-helper.js";

describe("sign_message tool", () => {
	let ctx: ToolTestContext;

	afterAll(async () => {
		await ctx?.client.close();
	});

	test("successful message signing", async () => {
		ctx = await setupToolTest(registerSignMessage);
		const result = await ctx.client.callTool("sign_message", {
			message: "Hello, world!",
		});
		expect(result.isError).toBeFalsy();
		const text = (result.content as any[])[0]?.text;
		const data = JSON.parse(text);
		expect(data.signature).toMatch(/^0x/);
		expect(data.address).toMatch(/^0x/);
	});

	test("sign operation not allowed → POLICY_VIOLATION", async () => {
		ctx = await setupToolTest(registerSignMessage, {
			policy: { allowedOperations: ["send"] },
		});
		const result = await ctx.client.callTool("sign_message", {
			message: "blocked",
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("POLICY_VIOLATION");
	});
});
