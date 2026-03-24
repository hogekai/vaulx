import type { IncomingMessage, ServerResponse } from "node:http";
import { formatEther, formatUnits, parseEther } from "viem";
import { getChain, isSolanaChain, resolveChainId } from "../../config.js";
import { VaulxError } from "../../errors.js";
import { executeTx } from "../../helpers/execute-tx.js";
import { validateAddress, validateAmount } from "../../helpers/validate.js";
import { errorResponse, jsonResponse } from "../error.js";
import type { WalletContext } from "../routes.js";

function parseBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString()));
			} catch {
				reject(new Error("Invalid JSON body"));
			}
		});
		req.on("error", reject);
	});
}

export async function handleApiRoutes(
	method: string,
	path: string,
	req: IncomingMessage,
	res: ServerResponse,
	ctx: WalletContext,
): Promise<boolean> {
	// GET /address
	if (method === "GET" && path === "/address") {
		const signer = await ctx.chainManager.getSigner(ctx.chainManager.defaultChainId);
		jsonResponse(res, 200, { address: await signer.getAddress() });
		return true;
	}

	// GET /balance/:chainId
	const balanceMatch = path.match(/^\/balance\/(.+)$/);
	if (method === "GET" && balanceMatch) {
		const chainId = balanceMatch[1];
		try {
			const chain = getChain(chainId);
			const signer = await ctx.chainManager.getSigner(chainId);
			const balance = await signer.getBalance(chainId);
			const formatted = isSolanaChain(chainId) ? formatUnits(balance, 9) : formatEther(balance);
			jsonResponse(res, 200, {
				chainId,
				network: chain.name,
				balance: formatted,
				symbol: chain.nativeCurrency.symbol,
			});
		} catch (err) {
			jsonResponse(res, 400, {
				error: err instanceof Error ? err.message : String(err),
			});
		}
		return true;
	}

	// POST /api/send-transaction
	if (method === "POST" && path === "/api/send-transaction") {
		try {
			const body = (await parseBody(req)) as Record<string, unknown>;

			const chainId = resolveChainId((body.chainId ?? body.network) as string | number | undefined);
			const chain = getChain(chainId);
			const to = validateAddress((body.to ?? body.recipient) as string, chainId);
			const amountStr = validateAmount((body.value ?? body.amount) as string, "value");
			const nativeSymbol = chain.nativeCurrency.symbol;
			const token = ((body.token as string) ?? nativeSymbol).toUpperCase();

			let value: bigint;
			if (isSolanaChain(chainId)) {
				const { parseTokenUnits } = await import("../../helpers/validate.js");
				value = parseTokenUnits(amountStr, 9);
			} else {
				value = parseEther(amountStr);
			}

			const txSigner = await ctx.chainManager.getSigner(chainId);

			// Balance check (skip with paymaster)
			if (!txSigner.hasPaymaster) {
				const balance = await txSigner.getBalance(chainId);
				if (balance < value) {
					const formatted = isSolanaChain(chainId) ? formatUnits(balance, 9) : formatEther(balance);
					throw new VaulxError(
						`Have: ${formatted} ${nativeSymbol}, Need: ${amountStr} ${nativeSymbol}`,
						"INSUFFICIENT_BALANCE",
					);
				}
			}

			const result = await executeTx(
				{ operation: "send", txParams: { to, value, chainId }, token },
				{
					signer: txSigner,
					policyGuard: ctx.policyGuard,
					txLog: ctx.txLog,
					chainManager: ctx.chainManager,
				},
			);

			jsonResponse(res, 200, result);
		} catch (e) {
			if (e instanceof VaulxError) {
				errorResponse(res, e, e.code === "POLICY_VIOLATION" ? 403 : 400);
			} else {
				jsonResponse(res, 500, {
					error: "SIGNER_ERROR",
					message: e instanceof Error ? e.message : String(e),
				});
			}
		}
		return true;
	}

	// POST /api/sign-bytes
	if (method === "POST" && path === "/api/sign-bytes") {
		try {
			const body = (await parseBody(req)) as Record<string, unknown>;
			const message = body.message as string;
			if (!message) {
				jsonResponse(res, 400, { error: "Missing message" });
				return true;
			}

			const chainId = ctx.chainManager.defaultChainId;
			if (!isSolanaChain(chainId)) {
				jsonResponse(res, 500, { error: "sign_bytes is only available on Solana chains" });
				return true;
			}

			const signer = await ctx.chainManager.getSigner(chainId);
			if (!signer.signRawBytes) {
				jsonResponse(res, 500, { error: "Current signer does not support raw byte signing" });
				return true;
			}

			const encoding = (body.encoding as string) ?? "base64";
			const messageBytes =
				encoding === "hex" ? Buffer.from(message, "hex") : Buffer.from(message, "base64");

			if (messageBytes.length === 0) {
				jsonResponse(res, 400, { error: "Empty message" });
				return true;
			}

			const signature = await signer.signRawBytes(messageBytes);
			const publicKey = await signer.getAddress();

			jsonResponse(res, 200, {
				signature: Buffer.from(signature).toString("base64"),
				publicKey,
			});
		} catch (e) {
			jsonResponse(res, 500, {
				error: e instanceof Error ? e.message : String(e),
			});
		}
		return true;
	}

	// POST /api/sign-and-send-raw-transaction
	if (method === "POST" && path === "/api/sign-and-send-raw-transaction") {
		try {
			const body = (await parseBody(req)) as Record<string, unknown>;
			const transaction = body.transaction as string;
			if (!transaction) {
				jsonResponse(res, 400, { error: "Missing transaction" });
				return true;
			}

			const chainId =
				resolveChainId(body.chainId as string | undefined) ?? ctx.chainManager.defaultChainId;
			if (!isSolanaChain(chainId)) {
				jsonResponse(res, 500, {
					error: "sign_and_send_raw_transaction is only available on Solana chains",
				});
				return true;
			}

			const signer = await ctx.chainManager.getSigner(chainId);
			if (!signer.getSolanaKeypair) {
				jsonResponse(res, 500, {
					error: "Current signer does not support raw transaction signing",
				});
				return true;
			}

			const txBytes = Buffer.from(transaction, "base64");
			const { Transaction, sendAndConfirmTransaction } = await import("@solana/web3.js");

			let tx: InstanceType<typeof Transaction>;
			try {
				tx = Transaction.from(txBytes);
			} catch (e) {
				jsonResponse(res, 400, {
					error: `Invalid transaction bytes: ${e instanceof Error ? e.message : e}`,
				});
				return true;
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

			jsonResponse(res, 200, { signature: sig, status: "confirmed" });
		} catch (e) {
			if (e instanceof VaulxError) {
				errorResponse(res, e, e.code === "POLICY_VIOLATION" ? 403 : 400);
			} else {
				jsonResponse(res, 500, {
					error: "TX_FAILED",
					message: e instanceof Error ? e.message : String(e),
				});
			}
		}
		return true;
	}

	return false;
}
