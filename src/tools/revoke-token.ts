import type { MCPServer, ToolContext } from "@lynq/lynq";
import { encodeFunctionData, erc20Abi } from "viem";
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

interface RevokeTokenCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
	tokenRegistry: TokenRegistry;
}

export function registerRevokeToken(server: MCPServer, ctx: RevokeTokenCtx) {
	server.tool(
		"revoke_token",
		{
			description: "Revoke a token approval (ERC20 allowance to 0 / SPL delegate revocation).",
			input: z.object({
				spender: z.string().describe("Spender/delegate address to revoke"),
				token: z.string().describe("Token symbol (e.g. 'USDC')"),
				chainId: z.union([z.string(), z.number()]).optional().describe("Chain ID or network alias"),
				network: z.string().optional().describe("Network alias (e.g. 'base-sepolia')"),
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

				if (isSolanaChain(chainId)) {
					return await revokeSplDelegate(ctx, c, chainId, token, spender);
				}

				const data = encodeFunctionData({
					abi: erc20Abi,
					functionName: "approve",
					args: [spender as `0x${string}`, 0n],
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

				return c.json({ ...result, spender, token: token.symbol, revoked: true });
			} catch (e) {
				if (e instanceof VaulxError) return c.error(`[${e.code}] ${e.message}`);
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}

async function revokeSplDelegate(
	ctx: RevokeTokenCtx,
	c: ToolContext,
	chainId: string,
	token: TokenEntry,
	spender: string,
) {
	const { PublicKey, Transaction, Keypair } = await import("@solana/web3.js");
	const { createRevokeInstruction, getAssociatedTokenAddress } = await import("@solana/spl-token");
	const bs58 = await import("bs58");

	const connection = ctx.chainManager.getConnection(chainId);
	const signer = await ctx.chainManager.getSigner(chainId);
	const fromAddress = await signer.getAddress();
	const fromPubkey = new PublicKey(fromAddress);
	const mintPubkey = new PublicKey(token.address);

	// Policy check (uses "approve" operation — revoke is a subset)
	const check = await ctx.policyGuard.check("approve", {
		to: spender,
		chainId,
		token: token.symbol,
	});
	if (!check.ok) {
		throw new VaulxError(check.reason, "POLICY_VIOLATION");
	}

	// SPL revoke removes the delegate from the token account
	// (SPL accounts can only have one delegate at a time)
	const ownerAta = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
	const tx = new Transaction().add(createRevokeInstruction(ownerAta, fromPubkey));

	const keypair = Keypair.fromSecretKey(bs58.default.decode(getSolanaPrivateKey()));
	tx.feePayer = fromPubkey;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
	tx.sign(keypair);
	const sig = await connection.sendRawTransaction(tx.serialize());

	await ctx.txLog.record({
		hash: sig,
		chainId,
		to: spender,
		value: "0",
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
		revoked: true,
	});
}
