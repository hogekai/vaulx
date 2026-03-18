import type { MCPServer } from "@lynq/lynq";
import { formatEther } from "viem";
import type { ChainManager } from "../chain/manager.js";
import { getChain } from "../config.js";

export function registerBalanceResource(server: MCPServer, chainManager: ChainManager) {
	const handler = async (uri: string) => {
		const parts = uri.split("/");
		const chainIdStr = parts[parts.length - 1];
		const chainId =
			chainIdStr && chainIdStr !== "balance" ? Number(chainIdStr) : chainManager.defaultChainId;
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
	};

	// Fixed URI for default chain (shows up in resources/list)
	server.resource(
		"wallet://balance",
		{
			name: "Wallet Balance",
			description: "Native token balance on the default chain",
			mimeType: "application/json",
		},
		handler,
	);

	// Template URI for specific chain
	server.resource(
		"wallet://balance/{chainId}",
		{
			name: "Wallet Balance (by chain)",
			description: "Native token balance on a given chain",
			mimeType: "application/json",
		},
		handler,
	);
}
