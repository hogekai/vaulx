import type { MCPServer } from "@lynq/lynq";
import type { Signer } from "../signer/types.js";

export function registerAddressResource(server: MCPServer, signer: Signer) {
  server.resource("wallet://address", {
    name: "Wallet Address",
    description: "The wallet address managed by this server",
    mimeType: "text/plain",
  }, async () => ({
    text: await signer.getAddress(),
  }));
}
