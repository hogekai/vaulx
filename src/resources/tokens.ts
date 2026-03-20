import type { MCPServer } from "@lynq/lynq";
import { erc20Abi, formatEther, formatUnits } from "viem";
import type { ChainManager } from "../chain/manager.js";
import { getChain, isSolanaChain } from "../config.js";
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
			const chainId = parts[parts.length - 1];
			return { text: JSON.stringify(tokenRegistry.list(chainId)) };
		},
	);

	// Token balance
	server.resource(
		"wallet://balance/{chainId}/{token}",
		{
			name: "Token Balance",
			description: "Token balance on a given chain",
			mimeType: "application/json",
		},
		async (uri) => {
			const parts = uri.split("/");
			const symbol = parts[parts.length - 1];
			const chainId = parts[parts.length - 2];

			const token = tokenRegistry.resolve(chainId, symbol);
			if (!token) {
				return {
					text: JSON.stringify({ error: `Unknown token: ${symbol}` }),
				};
			}

			const signer = await chainManager.getSigner(chainId);
			const address = await signer.getAddress();

			if (isSolanaChain(chainId)) {
				try {
					const { PublicKey } = await import("@solana/web3.js");
					const { getAccount, getAssociatedTokenAddress } = await import("@solana/spl-token");
					const connection = chainManager.getConnection(chainId);
					const ata = await getAssociatedTokenAddress(
						new PublicKey(token.address),
						new PublicKey(address),
					);
					const account = await getAccount(connection, ata);
					return {
						text: JSON.stringify({
							symbol: token.symbol,
							name: token.name,
							balance: formatUnits(account.amount, token.decimals),
							raw: account.amount.toString(),
							chainId,
						}),
					};
				} catch {
					return {
						text: JSON.stringify({
							symbol: token.symbol,
							name: token.name,
							balance: "0",
							raw: "0",
							chainId,
						}),
					};
				}
			}

			const pub = chainManager.getPublicClient(chainId);
			const balance = await pub.readContract({
				address: token.address as `0x${string}`,
				abi: erc20Abi,
				functionName: "balanceOf",
				args: [address as `0x${string}`],
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

	// Token allowance check (EVM only)
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
			const chainId = parts[parts.length - 3];

			if (isSolanaChain(chainId)) {
				return { text: JSON.stringify({ error: "Allowances not applicable on Solana" }) };
			}

			const token = tokenRegistry.resolve(chainId, symbol);
			if (!token) {
				return { text: JSON.stringify({ error: `Unknown token: ${symbol}` }) };
			}

			const signer = await chainManager.getSigner(chainId);
			const address = await signer.getAddress();
			const pub = chainManager.getPublicClient(chainId);

			const allowance = await pub.readContract({
				address: token.address as `0x${string}`,
				abi: erc20Abi,
				functionName: "allowance",
				args: [address as `0x${string}`, spender],
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

	// All balances — shared handler
	const balancesHandler = async (uri: string) => {
		const parts = uri.split("/");
		const last = parts[parts.length - 1];
		const chainId = last && last !== "balances" ? last : chainManager.defaultChainId;
		const chain = getChain(chainId);

		const signer = await chainManager.getSigner(chainId);
		const address = await signer.getAddress();

		const nativeBalance = await signer.getBalance(chainId);
		const nativeFormatted = isSolanaChain(chainId)
			? formatUnits(nativeBalance, 9)
			: formatEther(nativeBalance);

		const balances: Array<{
			symbol: string;
			name: string;
			balance: string;
			raw: string;
			type: "native" | "token";
		}> = [
			{
				symbol: chain.nativeCurrency.symbol,
				name: chain.nativeCurrency.symbol,
				balance: nativeFormatted,
				raw: nativeBalance.toString(),
				type: "native",
			},
		];

		const tokens = tokenRegistry.list(chainId);

		if (isSolanaChain(chainId)) {
			try {
				const { PublicKey } = await import("@solana/web3.js");
				const { getAccount, getAssociatedTokenAddress } = await import("@solana/spl-token");
				const connection = chainManager.getConnection(chainId);
				const ownerPubkey = new PublicKey(address);

				for (const token of tokens) {
					try {
						const ata = await getAssociatedTokenAddress(new PublicKey(token.address), ownerPubkey);
						const account = await getAccount(connection, ata);
						balances.push({
							symbol: token.symbol,
							name: token.name,
							balance: formatUnits(account.amount, token.decimals),
							raw: account.amount.toString(),
							type: "token",
						});
					} catch {
						// Token account doesn't exist
					}
				}
			} catch {
				// Solana imports failed
			}
		} else {
			const pub = chainManager.getPublicClient(chainId);
			for (const token of tokens) {
				try {
					const bal = await pub.readContract({
						address: token.address as `0x${string}`,
						abi: erc20Abi,
						functionName: "balanceOf",
						args: [address as `0x${string}`],
					});
					balances.push({
						symbol: token.symbol,
						name: token.name,
						balance: formatUnits(bal, token.decimals),
						raw: bal.toString(),
						type: "token",
					});
				} catch {
					// Contract call failed — skip token
				}
			}
		}

		return {
			text: JSON.stringify({ chainId, address, balances }),
		};
	};

	server.resource(
		"wallet://balances",
		{
			name: "All Balances",
			description: "Native + all registered token balances on the default chain",
			mimeType: "application/json",
		},
		balancesHandler,
	);

	server.resource(
		"wallet://balances/{chainId}",
		{
			name: "All Balances (by chain)",
			description: "Native + all registered token balances on a given chain",
			mimeType: "application/json",
		},
		balancesHandler,
	);
}
