import type { MCPServer } from "@lynq/lynq";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { isSolanaChain } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";

interface SignBytesCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
}

export function registerSignBytes(server: MCPServer, ctx: SignBytesCtx) {
	server.tool(
		"sign_bytes",
		{
			description:
				"Sign arbitrary bytes with the wallet's Ed25519 keypair (Solana only). Input is base64-encoded by default.",
			input: z.object({
				message: z.string().describe("The bytes to sign (base64 or hex encoded)"),
				encoding: z
					.enum(["base64", "hex"])
					.optional()
					.describe("Input encoding (default: base64)"),
			}),
		},
		async (args, c) => {
			try {
				const check = await ctx.policyGuard.check("sign", {});
				if (!check.ok) {
					throw new VaulxError(check.reason, "POLICY_VIOLATION");
				}

				const chainId = ctx.chainManager.defaultChainId;
				if (!isSolanaChain(chainId)) {
					throw new VaulxError(
						"sign_bytes is only available on Solana chains",
						"UNSUPPORTED_OPERATION",
					);
				}

				const signer = await ctx.chainManager.getSigner(chainId);
				if (!signer.signRawBytes) {
					throw new VaulxError(
						"Current signer does not support raw byte signing",
						"UNSUPPORTED_OPERATION",
					);
				}

				const encoding = args.encoding ?? "base64";
				const messageBytes =
					encoding === "hex"
						? Buffer.from(args.message, "hex")
						: Buffer.from(args.message, "base64");

				if (messageBytes.length === 0) {
					throw new VaulxError("Empty message", "SIGNER_ERROR");
				}

				const signature = await signer.signRawBytes(messageBytes);
				const publicKey = await signer.getAddress();

				return c.json({
					signature: Buffer.from(signature).toString("base64"),
					publicKey,
				});
			} catch (e) {
				if (e instanceof VaulxError) {
					return c.error(`[${e.code}] ${e.message}`);
				}
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}
