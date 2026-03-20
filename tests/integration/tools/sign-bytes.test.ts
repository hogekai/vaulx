import { Keypair } from "@solana/web3.js";
import { afterAll, describe, expect, test } from "vitest";
import { registerSignBytes } from "../../../src/tools/sign-bytes.js";
import { setupToolTest, type ToolTestContext } from "../../mocks/tool-test-helper.js";

describe("sign_bytes tool", () => {
	let ctx: ToolTestContext;

	afterAll(async () => {
		await ctx?.client.close();
	});

	test("sign base64-encoded bytes", async () => {
		const keypair = Keypair.generate();
		ctx = await setupToolTest(registerSignBytes, {
			signer: { solanaKeypair: keypair, address: keypair.publicKey.toBase58() },
			defaultChainId: "solana-devnet",
		});

		const input = Buffer.from("hello world").toString("base64");
		const result = await ctx.client.callTool("sign_bytes", { message: input });
		expect(result.isError).toBeFalsy();

		const data = JSON.parse((result.content as any[])[0].text);
		expect(data.signature).toBeTruthy();
		expect(data.publicKey).toBe(keypair.publicKey.toBase58());

		// Verify signature is valid
		const nacl = await import("tweetnacl");
		const sigBytes = Buffer.from(data.signature, "base64");
		expect(sigBytes.length).toBe(64);
		const valid = nacl.sign.detached.verify(
			Buffer.from("hello world"),
			sigBytes,
			keypair.publicKey.toBytes(),
		);
		expect(valid).toBe(true);
	});

	test("sign hex-encoded bytes", async () => {
		const keypair = Keypair.generate();
		ctx = await setupToolTest(registerSignBytes, {
			signer: { solanaKeypair: keypair, address: keypair.publicKey.toBase58() },
			defaultChainId: "solana-devnet",
		});

		const input = Buffer.from("deadbeef", "hex").toString("hex");
		const result = await ctx.client.callTool("sign_bytes", {
			message: input,
			encoding: "hex",
		});
		expect(result.isError).toBeFalsy();

		const data = JSON.parse((result.content as any[])[0].text);
		expect(data.signature).toBeTruthy();
		expect(Buffer.from(data.signature, "base64").length).toBe(64);
	});

	test("empty message → error", async () => {
		const keypair = Keypair.generate();
		ctx = await setupToolTest(registerSignBytes, {
			signer: { solanaKeypair: keypair, address: keypair.publicKey.toBase58() },
			defaultChainId: "solana-devnet",
		});

		const result = await ctx.client.callTool("sign_bytes", { message: "" });
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("Empty message");
	});

	test("EVM chain → UNSUPPORTED_OPERATION", async () => {
		ctx = await setupToolTest(registerSignBytes);

		const input = Buffer.from("test").toString("base64");
		const result = await ctx.client.callTool("sign_bytes", { message: input });
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("UNSUPPORTED_OPERATION");
	});

	test("sign operation not allowed → POLICY_VIOLATION", async () => {
		const keypair = Keypair.generate();
		ctx = await setupToolTest(registerSignBytes, {
			signer: { solanaKeypair: keypair, address: keypair.publicKey.toBase58() },
			defaultChainId: "solana-devnet",
			policy: { allowedOperations: ["send"] },
		});

		const input = Buffer.from("test").toString("base64");
		const result = await ctx.client.callTool("sign_bytes", { message: input });
		expect(result.isError).toBeTruthy();
		const text = (result.content as any[])[0]?.text ?? "";
		expect(text).toContain("POLICY_VIOLATION");
	});
});
