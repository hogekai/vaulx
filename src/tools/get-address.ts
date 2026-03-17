import type { MCPServer } from "@lynq/lynq";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";

export function registerGetAddress(server: MCPServer, chainManager: ChainManager) {
	server.tool(
		"get_address",
		{
			description: "Get the wallet address managed by this server.",
			input: z.object({}),
		},
		async (_args, c) => {
			const signer = await chainManager.getSigner(chainManager.defaultChainId);
			const address = await signer.getAddress();
			return c.json({ address, mode: signer.mode });
		},
	);
}
