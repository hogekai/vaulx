import type { MCPServer } from "@lynq/lynq";
import { z } from "zod";
import type { PolicyGuard } from "../guard/policy-guard.js";
import type { Signer } from "../signer/types.js";

interface SignMessageCtx {
  signer: Signer;
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
      // Policy check — only operation + expiry
      const check = await ctx.policyGuard.check("sign", {});
      if (!check.ok) {
        return c.error(`Policy rejected: ${check.reason}`);
      }

      const signature = await ctx.signer.signMessage(args.message);
      const address = await ctx.signer.getAddress();

      return c.json({
        signature,
        address,
        message: args.message,
      });
    },
  );
}
