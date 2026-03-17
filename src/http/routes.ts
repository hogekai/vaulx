import type { IncomingMessage, ServerResponse } from "node:http";
import { formatEther, parseEther } from "viem";
import type { ChainManager } from "../chain/manager.js";
import { DEFAULT_CHAIN_ID, getChain, resolveChainId } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { executeTx } from "../helpers/execute-tx.js";
import { validateAddress, validateAmount } from "../helpers/validate.js";
import type { TxLog } from "../log/tx-log.js";
import type { BrowserSignerState } from "../signer/browser.js";
import type { Signer } from "../signer/types.js";
import { validateAuth } from "./auth.js";
import { depositPage } from "./deposit.js";
import { confirmPage } from "./pages/confirm.js";
import { connectPage } from "./pages/connect.js";
import { signPage } from "./pages/sign.js";

export interface WalletContext {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
}

function jsonResponse(res: ServerResponse, status: number, data: unknown) {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(data));
}

function htmlResponse(res: ServerResponse, html: string) {
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(html);
}

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

async function getDefaultSigner(ctx: WalletContext): Promise<Signer> {
	return ctx.chainManager.getSigner(ctx.chainManager.defaultChainId);
}

function getBrowserState(signer: Signer): BrowserSignerState | null {
	if (signer.mode === "browser" && "state" in signer) {
		return (signer as any).state as BrowserSignerState;
	}
	return null;
}

export async function handleRequest(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: WalletContext,
): Promise<void> {
	const url = new URL(req.url ?? "/", "http://localhost");
	const path = url.pathname;
	const method = req.method ?? "GET";

	// Health check — no auth
	if (method === "GET" && path === "/health") {
		const defaultSigner = await getDefaultSigner(ctx);
		const address =
			defaultSigner.mode === "browser"
				? (getBrowserState(defaultSigner)?.connectedAddress ?? null)
				: await defaultSigner.getAddress();
		jsonResponse(res, 200, { status: "ok", address });
		return;
	}

	// Deposit page — no auth
	if (method === "GET" && path === "/deposit") {
		const defaultSigner = await getDefaultSigner(ctx);
		const address =
			defaultSigner.mode === "browser"
				? (getBrowserState(defaultSigner)?.connectedAddress ?? "Not connected")
				: await defaultSigner.getAddress();
		htmlResponse(res, depositPage(address, DEFAULT_CHAIN_ID));
		return;
	}

	// --- Browser mode routes (no auth, nonce-protected) ---
	const defaultSigner = await getDefaultSigner(ctx);
	const browserState = getBrowserState(defaultSigner);

	// GET /connect/:nonce
	const connectMatch = path.match(/^\/connect\/([a-f0-9-]+)$/);
	if (method === "GET" && connectMatch) {
		htmlResponse(res, connectPage(connectMatch[1]));
		return;
	}

	// POST /api/connect/:nonce
	const apiConnectMatch = path.match(/^\/api\/connect\/([a-f0-9-]+)$/);
	if (method === "POST" && apiConnectMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return;
		}
		const nonce = apiConnectMatch[1];
		const pending = browserState.pendingConnects.get(nonce);
		if (!pending) {
			jsonResponse(res, 404, { error: "Connection request not found or expired" });
			return;
		}
		const body = (await parseBody(req)) as { address: string };
		browserState.pendingConnects.delete(nonce);
		pending.resolve(body.address as `0x${string}`);
		jsonResponse(res, 200, { ok: true });
		return;
	}

	// GET /confirm/:nonce
	const confirmMatch = path.match(/^\/confirm\/([a-f0-9-]+)$/);
	if (method === "GET" && confirmMatch) {
		htmlResponse(res, confirmPage(confirmMatch[1]));
		return;
	}

	// GET /api/pending/:nonce
	const pendingMatch = path.match(/^\/api\/pending\/([a-f0-9-]+)$/);
	if (method === "GET" && pendingMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return;
		}
		const nonce = pendingMatch[1];
		const pending = browserState.pendingTxs.get(nonce);
		if (!pending) {
			jsonResponse(res, 404, { error: "Transaction not found or expired" });
			return;
		}
		const chain = getChain(pending.params.chainId);
		jsonResponse(res, 200, {
			to: pending.params.to,
			value: pending.params.value.toString(),
			displayValue: formatEther(pending.params.value) + " ETH",
			chainId: pending.params.chainId,
			chainName: chain.name,
			data: pending.params.data ?? null,
		});
		return;
	}

	// POST /api/confirm/:nonce
	const apiConfirmMatch = path.match(/^\/api\/confirm\/([a-f0-9-]+)$/);
	if (method === "POST" && apiConfirmMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return;
		}
		const nonce = apiConfirmMatch[1];
		const pending = browserState.pendingTxs.get(nonce);
		if (!pending) {
			jsonResponse(res, 404, { error: "Transaction not found or expired" });
			return;
		}
		const body = (await parseBody(req)) as { hash: string };
		browserState.pendingTxs.delete(nonce);
		pending.resolve(body.hash as `0x${string}`);
		jsonResponse(res, 200, { ok: true });
		return;
	}

	// POST /api/reject/:nonce
	const apiRejectMatch = path.match(/^\/api\/reject\/([a-f0-9-]+)$/);
	if (method === "POST" && apiRejectMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return;
		}
		const nonce = apiRejectMatch[1];
		// Check both pending tx and pending sign
		const pendingTx = browserState.pendingTxs.get(nonce);
		if (pendingTx) {
			browserState.pendingTxs.delete(nonce);
			pendingTx.reject(new Error("Transaction rejected by user"));
			jsonResponse(res, 200, { ok: true });
			return;
		}
		const pendingSign = browserState.pendingSigns.get(nonce);
		if (pendingSign) {
			browserState.pendingSigns.delete(nonce);
			pendingSign.reject(new Error("Signing rejected by user"));
			jsonResponse(res, 200, { ok: true });
			return;
		}
		jsonResponse(res, 404, { error: "Request not found or expired" });
		return;
	}

	// GET /sign/:nonce
	const signMatch = path.match(/^\/sign\/([a-f0-9-]+)$/);
	if (method === "GET" && signMatch) {
		htmlResponse(res, signPage(signMatch[1]));
		return;
	}

	// GET /api/pending-sign/:nonce
	const pendingSignMatch = path.match(/^\/api\/pending-sign\/([a-f0-9-]+)$/);
	if (method === "GET" && pendingSignMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return;
		}
		const nonce = pendingSignMatch[1];
		const pending = browserState.pendingSigns.get(nonce);
		if (!pending) {
			jsonResponse(res, 404, { error: "Sign request not found or expired" });
			return;
		}
		jsonResponse(res, 200, { message: pending.message });
		return;
	}

	// POST /api/sign/:nonce
	const apiSignMatch = path.match(/^\/api\/sign\/([a-f0-9-]+)$/);
	if (method === "POST" && apiSignMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return;
		}
		const nonce = apiSignMatch[1];
		const pending = browserState.pendingSigns.get(nonce);
		if (!pending) {
			jsonResponse(res, 404, { error: "Sign request not found or expired" });
			return;
		}
		const body = (await parseBody(req)) as { signature: string };
		browserState.pendingSigns.delete(nonce);
		pending.resolve(body.signature as `0x${string}`);
		jsonResponse(res, 200, { ok: true });
		return;
	}

	// --- Authenticated routes ---
	if (!validateAuth(req)) {
		jsonResponse(res, 401, { error: "Unauthorized" });
		return;
	}

	// GET /address
	if (method === "GET" && path === "/address") {
		const addrSigner = await getDefaultSigner(ctx);
		jsonResponse(res, 200, { address: await addrSigner.getAddress() });
		return;
	}

	// GET /balance/:chainId
	const balanceMatch = path.match(/^\/balance\/(\d+)$/);
	if (method === "GET" && balanceMatch) {
		const chainId = Number(balanceMatch[1]);
		try {
			const chain = getChain(chainId);
			const balSigner = await ctx.chainManager.getSigner(chainId);
			const balance = await balSigner.getBalance(chainId);
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
		return;
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
				{ signer: txSigner, policyGuard: ctx.policyGuard, txLog: ctx.txLog },
			);

			jsonResponse(res, 200, result);
		} catch (e) {
			if (e instanceof VaulxError) {
				const status = e.code === "POLICY_VIOLATION" ? 403 : 400;
				jsonResponse(res, status, {
					error: e.code,
					message: e.message,
					details: e.details,
				});
			} else {
				jsonResponse(res, 500, {
					error: "SIGNER_ERROR",
					message: e instanceof Error ? e.message : String(e),
				});
			}
		}
		return;
	}

	// 404
	jsonResponse(res, 404, { error: "Not found" });
}
