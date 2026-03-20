import type { MCPServer, ToolContext } from "@lynq/lynq";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { DEFAULT_CHAIN_ID, getChain, getSolanaPrivateKey, isSolanaChain, resolveChainId } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { executeTx } from "../helpers/execute-tx.js";
import { validateAddress } from "../helpers/validate.js";
import { trackReceipt } from "../log/receipt-tracker.js";
import type { TxLog } from "../log/tx-log.js";
import type { TokenEntry, TokenRegistry } from "../token/registry.js";

interface ApproveTokenCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
	tokenRegistry: TokenRegistry;
}

export function registerApproveToken(server: MCPServer, ctx: ApproveTokenCtx) {
	server.tool(
		"approve_token",
		{
			description: "Approve a spender to transfer tokens (ERC20 approve / SPL delegate). Never uses infinite approval.",
			input: z.object({
				spender: z.string().describe("Spender/delegate address"),
				token: z.string().describe("Token symbol (e.g. 'USDC')"),
				amount: z
					.string()
					.optional()
					.describe("Amount to approve in token units. Defaults to policy maxApproveAmount."),
				chainId: z.union([z.string(), z.number()]).optional().describe("Chain ID or network alias"),
				network: z.string().optional().describe("Network alias (e.g. 'base')"),
			}),
		},
		async (args, c) => {
			try {
				const chainId = resolveChainId(args.chainId ?? args.network ?? DEFAULT_CHAIN_ID);
				const spender = validateAddress(args.spender, chainId);
				const signer = await ctx.chainManager.getSigner(chainId);

				const token = ctx.tokenRegistry.resolve(chainId, args.token);
				if (!token) {
					throw new VaulxError(
						`Token "${args.token}" not found on chain ${chainId}`,
						"UNKNOWN_TOKEN",
					);
				}

				// Determine amount — never infinite
				let rawAmount: bigint;
				if (args.amount) {
					rawAmount = isSolanaChain(chainId)
						? BigInt(Math.round(parseFloat(args.amount) * 10 ** token.decimals))
						: parseUnits(args.amount, token.decimals);
				} else if (ctx.policyGuard.policy.maxApproveAmount) {
					rawAmount = BigInt(ctx.policyGuard.policy.maxApproveAmount);
				} else {
					rawAmount = BigInt(ctx.policyGuard.policy.maxPerTx) * 10n;
				}

				if (isSolanaChain(chainId)) {
					return await approveSplDelegate(ctx, c, chainId, token, spender, rawAmount);
				}

				// EVM: encode approve
				const data = encodeFunctionData({
					abi: erc20Abi,
					functionName: "approve",
					args: [spender as `0x${string}`, rawAmount],
				});

				const result = await executeTx(
					{
						operation: "approve",
						txParams: { to: token.address, value: 0n, chainId, data },
						token: token.symbol,
					},
					{
						signer,
						policyGuard: ctx.policyGuard,
						txLog: ctx.txLog,
						chainManager: ctx.chainManager,
					},
				);

				return c.json({
					...result,
					spender,
					token: token.symbol,
					amount: args.amount ?? "policy default",
				});
			} catch (e) {
				if (e instanceof VaulxError) {
					return c.error(`[${e.code}] ${e.message}`);
				}
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}

async function approveSplDelegate(
	ctx: ApproveTokenCtx,
	c: ToolContext,
	chainId: string,
	token: TokenEntry,
	spender: string,
	rawAmount: bigint,
) {
	const { PublicKey, Transaction, Keypair } = await import("@solana/web3.js");
	const { createApproveInstruction, getAssociatedTokenAddress } = await import("@solana/spl-token");
	const bs58 = await import("bs58");

	const connection = ctx.chainManager.getConnection(chainId);
	const signer = await ctx.chainManager.getSigner(chainId);
	const fromAddress = await signer.getAddress();
	const fromPubkey = new PublicKey(fromAddress);
	const delegatePubkey = new PublicKey(spender);
	const mintPubkey = new PublicKey(token.address);

	// Policy check
	const check = await ctx.policyGuard.check("approve", {
		value: rawAmount,
		to: spender,
		chainId,
		token: token.symbol,
	});
	if (!check.ok) {
		throw new VaulxError(check.reason, "POLICY_VIOLATION");
	}

	const ownerAta = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
	const tx = new Transaction().add(
		createApproveInstruction(ownerAta, delegatePubkey, fromPubkey, rawAmount),
	);

	const keypair = Keypair.fromSecretKey(bs58.default.decode(getSolanaPrivateKey()));
	tx.feePayer = fromPubkey;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
	tx.sign(keypair);
	const sig = await connection.sendRawTransaction(tx.serialize());

	await ctx.txLog.record({
		hash: sig,
		chainId,
		to: spender,
		value: rawAmount.toString(),
		token: token.symbol,
		operation: "approve",
		timestamp: new Date().toISOString(),
		status: "sent",
	});

	trackReceipt(sig, chainId, { chainManager: ctx.chainManager, txLog: ctx.txLog });

	const chain = getChain(chainId);
	return c.json({
		hash: sig,
		chainId,
		explorer: chain.blockExplorer ? `${chain.blockExplorer}/tx/${sig}` : undefined,
		proof: { type: "tx_hash", value: sig },
		spender,
		token: token.symbol,
		amount: rawAmount.toString(),
	});
}
