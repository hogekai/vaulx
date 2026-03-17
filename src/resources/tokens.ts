import type { MCPServer } from "@lynq/lynq";
import { erc20Abi, formatUnits } from "viem";
import type { ChainManager } from "../chain/manager.js";
import type { TokenRegistry } from "../token/registry.js";

export function registerTokenResources(
  server: MCPServer,
  chainManager: ChainManager,
  tokenRegistry: TokenRegistry,
) {
  // Token list for a chain
  server.resource(
    "wallet://tokens/{chainId}",
    {
      name: "Token Registry",
      description: "List of known tokens on a given chain",
      mimeType: "application/json",
    },
    async (uri) => {
      const parts = uri.split("/");
      const chainId = Number(parts[parts.length - 1]);
      return { text: JSON.stringify(tokenRegistry.list(chainId)) };
    },
  );

  // ERC20 token balance
  server.resource(
    "wallet://balance/{chainId}/{token}",
    {
      name: "Token Balance",
      description: "ERC20 token balance on a given chain",
      mimeType: "application/json",
    },
    async (uri) => {
      const parts = uri.split("/");
      const symbol = parts[parts.length - 1];
      const chainId = Number(parts[parts.length - 2]);

      const token = tokenRegistry.resolve(chainId, symbol);
      if (!token) {
        return {
          text: JSON.stringify({ error: `Unknown token: ${symbol}` }),
        };
      }

      const signer = await chainManager.getSigner(chainId);
      const address = await signer.getAddress();
      const pub = chainManager.getPublicClient(chainId);

      const balance = await pub.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });

      return {
        text: JSON.stringify({
          symbol: token.symbol,
          name: token.name,
          balance: formatUnits(balance, token.decimals),
          raw: balance.toString(),
          chainId,
        }),
      };
    },
  );
}
