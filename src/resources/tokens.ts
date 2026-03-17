import type { MCPServer } from "@lynq/lynq";
import { erc20Abi, formatEther, formatUnits } from "viem";
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

	// Token allowance check
	server.resource(
		"wallet://allowance/{chainId}/{token}/{spender}",
		{
			name: "Token Allowance",
			description: "Remaining ERC20 approval for a spender",
			mimeType: "application/json",
		},
		async (uri) => {
			const parts = uri.split("/");
			const spender = parts[parts.length - 1] as `0x${string}`;
			const symbol = parts[parts.length - 2];
			const chainId = Number(parts[parts.length - 3]);

			const token = tokenRegistry.resolve(chainId, symbol);
			if (!token) {
				return { text: JSON.stringify({ error: `Unknown token: ${symbol}` }) };
			}

			const signer = await chainManager.getSigner(chainId);
			const address = await signer.getAddress();
			const pub = chainManager.getPublicClient(chainId);

			const allowance = await pub.readContract({
				address: token.address,
				abi: erc20Abi,
				functionName: "allowance",
				args: [address, spender],
			});

			return {
				text: JSON.stringify({
					owner: address,
					spender,
					token: token.symbol,
					allowance: formatUnits(allowance, token.decimals),
					raw: allowance.toString(),
					chainId,
				}),
			};
		},
	);

	// All balances for a chain (native + registered ERC20s)
	server.resource(
		"wallet://balances/{chainId}",
		{
			name: "All Balances",
			description: "Native + all registered ERC20 token balances on a chain",
			mimeType: "application/json",
		},
		async (uri) => {
			const parts = uri.split("/");
			const chainId = Number(parts[parts.length - 1]);

			const signer = await chainManager.getSigner(chainId);
			const address = await signer.getAddress();
			const pub = chainManager.getPublicClient(chainId);

			const nativeBalance = await signer.getBalance(chainId);
			const balances: Array<{
				symbol: string;
				name: string;
				balance: string;
				raw: string;
				type: "native" | "erc20";
			}> = [
				{
					symbol: "ETH",
					name: "Ether",
					balance: formatEther(nativeBalance),
					raw: nativeBalance.toString(),
					type: "native",
				},
			];

			const tokens = tokenRegistry.list(chainId);
			for (const token of tokens) {
				try {
					const bal = await pub.readContract({
						address: token.address,
						abi: erc20Abi,
						functionName: "balanceOf",
						args: [address],
					});
					balances.push({
						symbol: token.symbol,
						name: token.name,
						balance: formatUnits(bal, token.decimals),
						raw: bal.toString(),
						type: "erc20",
					});
				} catch {
					// Contract call failed — skip token
				}
			}

			return {
				text: JSON.stringify({ chainId, address, balances }),
			};
		},
	);
}
