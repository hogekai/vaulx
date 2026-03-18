import type { MCPServer } from "@lynq/lynq";
import { formatEther, formatUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { resolveChainId } from "../config.js";
import { fetchExplorerApi } from "../explorer/api.js";

interface NormalTx {
	hash: string;
	from: string;
	to: string;
	value: string;
	input: string;
	timeStamp: string;
	blockNumber: string;
	isError: string;
}

interface TokenTx {
	hash: string;
	from: string;
	to: string;
	value: string;
	tokenSymbol: string;
	tokenDecimal: string;
	contractAddress: string;
	timeStamp: string;
	blockNumber: string;
}

interface UnifiedTx {
	hash: string;
	type: "native" | "erc20";
	direction: "in" | "out" | "self";
	from: string;
	to: string;
	value: string;
	token: string;
	tokenAddress?: string;
	timestamp: number;
	blockNumber: number;
	status: "success" | "failed";
}

function getDirection(from: string, to: string, wallet: string): "in" | "out" | "self" {
	const w = wallet.toLowerCase();
	const isFrom = from.toLowerCase() === w;
	const isTo = to.toLowerCase() === w;
	if (isFrom && isTo) return "self";
	if (isFrom) return "out";
	return "in";
}

export function registerGetOnchainHistory(server: MCPServer, ctx: { chainManager: ChainManager }) {
	server.tool(
		"get_onchain_history",
		{
			description:
				"Get on-chain transaction history from block explorer. Includes incoming, outgoing, and ERC20 token transfers.",
			input: z.object({
				chain: z
					.union([z.string(), z.number()])
					.optional()
					.describe("Chain ID or network alias (default: default chain)"),
				limit: z
					.number()
					.min(1)
					.max(100)
					.optional()
					.describe("Max transactions to return (default: 25)"),
				page: z.number().min(1).optional().describe("Page number (default: 1)"),
			}),
		},
		async (args, c) => {
			const chainId = resolveChainId(args.chain);
			const limit = args.limit ?? 25;
			const page = args.page ?? 1;

			const signer = await ctx.chainManager.getSigner(chainId);
			const address = await signer.getAddress();

			const commonParams = {
				module: "account",
				address,
				startblock: "0",
				endblock: "99999999",
				page: String(page),
				offset: String(limit),
				sort: "desc",
			};

			const [normalTxs, tokenTxs] = await Promise.allSettled([
				fetchExplorerApi<NormalTx[]>(chainId, { ...commonParams, action: "txlist" }),
				fetchExplorerApi<TokenTx[]>(chainId, { ...commonParams, action: "tokentx" }),
			]);

			const normals = normalTxs.status === "fulfilled" ? normalTxs.value : [];
			const tokens = tokenTxs.status === "fulfilled" ? tokenTxs.value : [];

			// Ensure arrays (API returns empty string on "No transactions found")
			const normalArr = Array.isArray(normals) ? normals : [];
			const tokenArr = Array.isArray(tokens) ? tokens : [];

			const unified: UnifiedTx[] = [];

			for (const tx of normalArr) {
				// Skip pure contract calls with no ETH transfer
				if (tx.value === "0" && tx.input !== "0x") continue;
				unified.push({
					hash: tx.hash,
					type: "native",
					direction: getDirection(tx.from, tx.to, address),
					from: tx.from,
					to: tx.to,
					value: formatEther(BigInt(tx.value)),
					token: "ETH",
					timestamp: Number(tx.timeStamp),
					blockNumber: Number(tx.blockNumber),
					status: tx.isError === "0" ? "success" : "failed",
				});
			}

			for (const tx of tokenArr) {
				unified.push({
					hash: tx.hash,
					type: "erc20",
					direction: getDirection(tx.from, tx.to, address),
					from: tx.from,
					to: tx.to,
					value: formatUnits(BigInt(tx.value), Number(tx.tokenDecimal)),
					token: tx.tokenSymbol,
					tokenAddress: tx.contractAddress,
					timestamp: Number(tx.timeStamp),
					blockNumber: Number(tx.blockNumber),
					status: "success",
				});
			}

			unified.sort((a, b) => b.timestamp - a.timestamp || a.hash.localeCompare(b.hash));
			const sliced = unified.slice(0, limit);

			const warnings: string[] = [];
			if (normalTxs.status === "rejected") {
				warnings.push(`Normal TX fetch failed: ${normalTxs.reason}`);
			}
			if (tokenTxs.status === "rejected") {
				warnings.push(`Token TX fetch failed: ${tokenTxs.reason}`);
			}

			return c.json({
				chainId,
				address,
				transactions: sliced,
				page,
				hasMore: normalArr.length === limit || tokenArr.length === limit,
				...(warnings.length > 0 ? { warnings } : {}),
			});
		},
	);
}
