import type { MCPServer } from "@lynq/lynq";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { isSolanaChain, resolveChainId } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { executeTx } from "../helpers/execute-tx.js";
import { validateAddress, validateAmount } from "../helpers/validate.js";
import type { TxLog } from "../log/tx-log.js";
import type { TokenRegistry } from "../token/registry.js";

interface SendTokenCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
	tokenRegistry: TokenRegistry;
}

export function registerSendToken(server: MCPServer, ctx: SendTokenCtx) {
	server.tool(
		"send_token",
		{
			description:
				"Send a token (ERC20 or SPL) on a supported chain. Returns tx hash and explorer link.",
			input: z.object({
				to: z.string().optional().describe("Recipient address"),
				recipient: z.string().optional().describe("Alias for 'to' (agentPayment compat)"),
				value: z.string().optional().describe("Amount in token units (e.g. '10' for 10 USDC)"),
				amount: z.string().optional().describe("Alias for 'value' (agentPayment compat)"),
				token: z.string().describe("Token symbol (e.g. 'USDC')"),
				chainId: z.union([z.string(), z.number()]).optional().describe("Chain ID or network alias"),
				network: z
					.string()
					.optional()
					.describe("Network alias (e.g. 'base-sepolia', 'solana-devnet')"),
			}),
		},
		async (args, c) => {
			try {
				const rawTo = args.to || args.recipient;
				if (!rawTo) return c.error("[VALIDATION] to or recipient required");
				const rawValue = args.value || args.amount;
				if (!rawValue) return c.error("[VALIDATION] value or amount required");
				const chainId = resolveChainId(args.chainId ?? args.network);
				const to = validateAddress(rawTo, chainId);
				const tokenAmount = validateAmount(rawValue, "value");
				const signer = await ctx.chainManager.getSigner(chainId);

				const token = ctx.tokenRegistry.resolve(chainId, args.token);
				if (!token) {
					throw new VaulxError(
						`Token "${args.token}" not found on chain ${chainId}`,
						"UNKNOWN_TOKEN",
					);
				}

				if (isSolanaChain(chainId)) {
					return await sendSplToken(ctx, signer, c, to, chainId, token, tokenAmount);
				}

				const rawAmount = parseUnits(tokenAmount, token.decimals);

				// Gas check for ERC20
				if (!signer.hasPaymaster) {
					const balance = await signer.getBalance(chainId);
					if (balance === 0n) {
						throw new VaulxError(
							"No native token balance for gas. Deposit ETH first.",
							"INSUFFICIENT_GAS",
						);
					}
				}

				const data = encodeFunctionData({
					abi: erc20Abi,
					functionName: "transfer",
					args: [to as `0x${string}`, rawAmount],
				});

				const result = await executeTx(
					{
						operation: "send_token",
						txParams: { to: token.address, value: 0n, chainId, data },
						token: token.symbol,
						policyExtra: { value: rawAmount, to },
					},
					{
						signer,
						policyGuard: ctx.policyGuard,
						txLog: ctx.txLog,
						chainManager: ctx.chainManager,
					},
				);

				return c.json({ ...result, token: token.symbol, amount: tokenAmount });
			} catch (e) {
				if (e instanceof VaulxError) {
					return c.error(`[${e.code}] ${e.message}`);
				}
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}

async function sendSplToken(
	ctx: SendTokenCtx,
	signer: import("../signer/types.js").Signer,
	c: import("@lynq/lynq").ToolContext,
	to: string,
	chainId: string,
	token: import("../token/registry.js").TokenEntry,
	tokenAmount: string,
) {
	const { PublicKey, Transaction } = await import("@solana/web3.js");
	const {
		createTransferInstruction,
		getAssociatedTokenAddress,
		createAssociatedTokenAccountInstruction,
		getAccount,
	} = await import("@solana/spl-token");

	const connection = ctx.chainManager.getConnection(chainId);
	const fromAddress = await signer.getAddress();
	const fromPubkey = new PublicKey(fromAddress);
	const toPubkey = new PublicKey(to);
	const mintPubkey = new PublicKey(token.address);
	const { parseTokenUnits } = await import("../helpers/validate.js");
	const rawAmount = parseTokenUnits(tokenAmount, token.decimals);

	// Get or create ATAs
	const fromAta = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
	const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey);

	// Policy check
	const check = await ctx.policyGuard.check("send_token", {
		value: rawAmount,
		to,
		chainId,
		token: token.symbol,
	});
	if (!check.ok) {
		throw new VaulxError(check.reason, "POLICY_VIOLATION");
	}

	// Duplicate check
	const dup = await ctx.txLog.isDuplicate({
		to,
		value: rawAmount.toString(),
		chainId,
	});
	if (dup) {
		throw new VaulxError("Duplicate transaction detected (same params within 10s)", "TX_FAILED");
	}

	// Build transaction: create recipient ATA if needed, then transfer
	const tx = new Transaction();

	try {
		await getAccount(connection, toAta);
	} catch {
		// ATA doesn't exist — create it
		tx.add(createAssociatedTokenAccountInstruction(fromPubkey, toAta, toPubkey, mintPubkey));
	}

	tx.add(createTransferInstruction(fromAta, toAta, fromPubkey, rawAmount));

	// We need to sign and send via the Solana signer
	// The signer.sendTransaction expects TxParams with to/value/chainId
	// For SPL transfers, we encode the transaction as a special case
	const { Keypair } = await import("@solana/web3.js");
	const { getSolanaPrivateKey } = await import("../config.js");
	const bs58 = await import("bs58");
	const secretKey = bs58.default.decode(getSolanaPrivateKey());
	const keypair = Keypair.fromSecretKey(secretKey);

	tx.feePayer = fromPubkey;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
	tx.sign(keypair);

	const sig = await connection.sendRawTransaction(tx.serialize());

	// Log the transaction
	await ctx.txLog.record({
		hash: sig,
		chainId,
		to,
		value: rawAmount.toString(),
		token: token.symbol,
		operation: "send_token",
		timestamp: new Date().toISOString(),
		status: "sent",
	});

	// Track receipt
	const { trackReceipt } = await import("../log/receipt-tracker.js");
	trackReceipt(sig, chainId, { chainManager: ctx.chainManager, txLog: ctx.txLog });

	const { getChain } = await import("../config.js");
	const chain = getChain(chainId);

	return c.json({
		hash: sig,
		chainId,
		explorer: chain.blockExplorer ? `${chain.blockExplorer}/tx/${sig}` : undefined,
		proof: { type: "tx_hash", value: sig },
		token: token.symbol,
		amount: tokenAmount,
	});
}
