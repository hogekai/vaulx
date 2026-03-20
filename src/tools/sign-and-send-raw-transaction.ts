import type { MCPServer } from "@lynq/lynq";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import { isSolanaChain } from "../config.js";
import { VaulxError } from "../errors.js";
import type { TxLog } from "../log/tx-log.js";

interface SignAndSendRawTxCtx {
	chainManager: ChainManager;
	txLog: TxLog;
}

export function registerSignAndSendRawTransaction(
	server: MCPServer,
	ctx: SignAndSendRawTxCtx,
) {
	server.tool(
		"sign_and_send_raw_transaction",
		{
			description:
				"Sign a serialized Solana transaction as fee payer and submit to network.",
			input: z.object({
				transaction: z
					.string()
					.describe("Base64 encoded serialized Solana Transaction"),
				chainId: z
					.string()
					.optional()
					.describe("Solana chain (default: current chain)"),
			}),
		},
		async (args, c) => {
			try {
				const chainId = args.chainId ?? ctx.chainManager.defaultChainId;
				if (!isSolanaChain(chainId)) {
					throw new VaulxError(
						"sign_and_send_raw_transaction is only available on Solana chains",
						"UNSUPPORTED_OPERATION",
					);
				}

				const signer = await ctx.chainManager.getSigner(chainId);
				if (!signer.getSolanaKeypair) {
					throw new VaulxError(
						"Current signer does not support raw transaction signing",
						"UNSUPPORTED_OPERATION",
					);
				}

				const txBytes = Buffer.from(args.transaction, "base64");

				const { Transaction, sendAndConfirmTransaction } = await import(
					"@solana/web3.js"
				);

				let tx: InstanceType<typeof Transaction>;
				try {
					tx = Transaction.from(txBytes);
				} catch (e) {
					throw new VaulxError(
						`Invalid transaction bytes: ${e instanceof Error ? e.message : e}`,
						"TX_FAILED",
					);
				}

				const keypair = signer.getSolanaKeypair();
				const connection = ctx.chainManager.getConnection(chainId);

				if (!tx.feePayer) {
					tx.feePayer = keypair.publicKey;
				}

				if (!tx.recentBlockhash) {
					const { blockhash } = await connection.getLatestBlockhash();
					tx.recentBlockhash = blockhash;
				}

				const sig = await sendAndConfirmTransaction(connection, tx, [keypair], {
					commitment: "confirmed",
				});

				await ctx.txLog.record({
					hash: sig,
					chainId,
					to: "program",
					value: "0",
					token: "SOL",
					operation: "raw_transaction",
					timestamp: new Date().toISOString(),
					status: "confirmed",
				});

				return c.json({ signature: sig, status: "confirmed" });
			} catch (e) {
				if (e instanceof VaulxError) {
					return c.error(`[${e.code}] ${e.message}`);
				}
				return c.error(`[TX_FAILED] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}
