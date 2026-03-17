import type { MCPServer } from "@lynq/lynq";
import { formatEther } from "viem";
import { getChain, DEFAULT_CHAIN_ID } from "../config.js";
import type { ChainManager } from "../chain/manager.js";

export function registerBalanceResource(
  server: MCPServer,
  chainManager: ChainManager,
) {
  server.resource(
    "wallet://balance/{chainId}",
    {
      name: "Wallet Balance",
      description: "Native token balance on a given chain",
      mimeType: "application/json",
    },
    async (uri) => {
      const parts = uri.split("/");
      const chainIdStr = parts[parts.length - 1];
      const chainId = chainIdStr ? Number(chainIdStr) : DEFAULT_CHAIN_ID;
      const chain = getChain(chainId);
      const signer = await chainManager.getSigner(chainId);
      const balance = await signer.getBalance(chainId);
      return {
        text: JSON.stringify({
          chainId,
          network: chain.name,
          balance: formatEther(balance),
          symbol: chain.nativeCurrency.symbol,
        }),
      };
    },
  );
}
