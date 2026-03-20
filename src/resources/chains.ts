import type { MCPServer } from "@lynq/lynq";
import { CHAINS } from "../config.js";

export function registerChainsResource(server: MCPServer) {
	server.resource(
		"wallet://chains",
		{
			name: "Supported Chains",
			description: "List of supported chains",
			mimeType: "application/json",
		},
		async () => ({
			text: JSON.stringify(
				Object.entries(CHAINS).map(([id, config]) => ({
					chainId: id,
					name: config.name,
					symbol: config.nativeCurrency.symbol,
					blockExplorer: config.blockExplorer,
				})),
			),
		}),
	);
}
