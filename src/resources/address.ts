import type { MCPServer } from "@lynq/lynq";
import type { ChainManager } from "../chain/manager.js";

export function registerAddressResource(
  server: MCPServer,
  chainManager: ChainManager,
) {
  server.resource(
    "wallet://address",
    {
      name: "Wallet Address",
      description: "The wallet address managed by this server",
      mimeType: "text/plain",
    },
    async () => {
      const signer = await chainManager.getSigner(
        chainManager.defaultChainId,
      );
      return { text: await signer.getAddress() };
    },
  );
}
