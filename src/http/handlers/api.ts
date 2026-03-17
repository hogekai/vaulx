import type { IncomingMessage, ServerResponse } from "node:http";
import { formatEther, parseEther } from "viem";
import { DEFAULT_CHAIN_ID, getChain, resolveChainId } from "../../config.js";
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
	const balanceMatch = path.match(/^\/balance\/(\d+)$/);
	if (method === "GET" && balanceMatch) {
		const chainId = Number(balanceMatch[1]);
		try {
			const chain = getChain(chainId);
			const signer = await ctx.chainManager.getSigner(chainId);
			const balance = await signer.getBalance(chainId);
			jsonResponse(res, 200, {
				chainId,
				network: chain.name,
				balance: formatEther(balance),
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

			const to = validateAddress((body.to ?? body.recipient) as string);
			const ethValue = validateAmount((body.value ?? body.amount) as string, "value");
			const chainId = resolveChainId(
				(body.chainId ?? body.network ?? DEFAULT_CHAIN_ID) as string | number,
			);
			const value = parseEther(ethValue);
			const token = ((body.token as string) ?? "ETH").toUpperCase();
			const txSigner = await ctx.chainManager.getSigner(chainId);

			// Balance check (skip with paymaster)
			if (!txSigner.hasPaymaster) {
				const balance = await txSigner.getBalance(chainId);
				if (balance < value) {
					throw new VaulxError(
						`Have: ${formatEther(balance)} ETH, Need: ${ethValue} ETH`,
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

	return false;
}
