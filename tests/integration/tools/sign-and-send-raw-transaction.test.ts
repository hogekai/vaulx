import { Keypair } from "@solana/web3.js";
import { afterAll, describe, expect, test } from "vitest";
import { registerSignAndSendRawTransaction } from "../../../src/tools/sign-and-send-raw-transaction.js";
import { setupToolTest, type ToolTestContext } from "../../mocks/tool-test-helper.js";

describe("sign_and_send_raw_transaction tool", () => {
	let ctx: ToolTestContext;

	afterAll(async () => {
		await ctx?.client.close();
	});

	test("EVM chain → UNSUPPORTED_OPERATION", async () => {
		ctx = await setupToolTest(registerSignAndSendRawTransaction);

		const result = await ctx.client.callTool("sign_and_send_raw_transaction", {
			transaction: Buffer.from("fake").toString("base64"),
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("UNSUPPORTED_OPERATION");
	});

	test("invalid transaction bytes → error", async () => {
		const keypair = Keypair.generate();
		ctx = await setupToolTest(registerSignAndSendRawTransaction, {
			signer: { solanaKeypair: keypair, address: keypair.publicKey.toBase58() },
			defaultChainId: "solana-devnet",
		});

		const result = await ctx.client.callTool("sign_and_send_raw_transaction", {
			transaction: Buffer.from("not-a-valid-transaction").toString("base64"),
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("Invalid transaction bytes");
	});

	test("signer without getSolanaKeypair → UNSUPPORTED_OPERATION", async () => {
		ctx = await setupToolTest(registerSignAndSendRawTransaction, {
			// No solanaKeypair → signer won't have getSolanaKeypair
			defaultChainId: "solana-devnet",
		});

		const result = await ctx.client.callTool("sign_and_send_raw_transaction", {
			transaction: Buffer.from("test").toString("base64"),
		});
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("UNSUPPORTED_OPERATION");
	});
});
