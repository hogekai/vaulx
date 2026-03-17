import type { MCPServer } from "@lynq/lynq";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import type { PolicyGuard } from "../guard/policy-guard.js";

interface SignMessageCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
}

export function registerSignMessage(server: MCPServer, ctx: SignMessageCtx) {
	server.tool(
		"sign_message",
		{
			description:
				"Sign an arbitrary message with the wallet's private key. Returns the signature.",
			input: z.object({
				message: z.string().describe("The message to sign"),
			}),
		},
		async (args, c) => {
			const check = await ctx.policyGuard.check("sign", {});
			if (!check.ok) {
				return c.error(`Policy rejected: ${check.reason}`);
			}

			const signer = await ctx.chainManager.getSigner(ctx.chainManager.defaultChainId);
			const signature = await signer.signMessage(args.message);
			const address = await signer.getAddress();

			return c.json({
				signature,
				address,
				message: args.message,
			});
		},
	);
}
