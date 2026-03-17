import type { IncomingMessage, ServerResponse } from "node:http";
import { formatEther } from "viem";
import { getChain } from "../../config.js";
import type { BrowserSignerState } from "../../signer/browser.js";
import type { Signer } from "../../signer/types.js";
import { htmlResponse, jsonResponse } from "../error.js";
import { confirmPage } from "../pages/confirm.js";
import { connectPage } from "../pages/connect.js";
import { signPage } from "../pages/sign.js";
import type { WalletContext } from "../routes.js";

function getBrowserState(signer: Signer): BrowserSignerState | null {
	if (signer.mode === "browser" && "state" in signer) {
		return (signer as Signer & { state: BrowserSignerState }).state;
	}
	return null;
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

export async function handleBrowserRoutes(
	method: string,
	path: string,
	req: IncomingMessage,
	res: ServerResponse,
	ctx: WalletContext,
): Promise<boolean> {
	const defaultSigner = await ctx.chainManager.getSigner(ctx.chainManager.defaultChainId);
	const browserState = getBrowserState(defaultSigner);

	// GET /connect/:nonce
	const connectMatch = path.match(/^\/connect\/([a-f0-9-]+)$/);
	if (method === "GET" && connectMatch) {
		htmlResponse(res, connectPage(connectMatch[1]));
		return true;
	}

	// POST /api/connect/:nonce
	const apiConnectMatch = path.match(/^\/api\/connect\/([a-f0-9-]+)$/);
	if (method === "POST" && apiConnectMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return true;
		}
		const nonce = apiConnectMatch[1];
		const pending = browserState.pendingConnects.get(nonce);
		if (!pending) {
			jsonResponse(res, 404, { error: "Connection request not found or expired" });
			return true;
		}
		const body = (await parseBody(req)) as { address: string };
		browserState.pendingConnects.delete(nonce);
		pending.resolve(body.address as `0x${string}`);
		jsonResponse(res, 200, { ok: true });
		return true;
	}

	// GET /confirm/:nonce
	const confirmMatch = path.match(/^\/confirm\/([a-f0-9-]+)$/);
	if (method === "GET" && confirmMatch) {
		htmlResponse(res, confirmPage(confirmMatch[1]));
		return true;
	}

	// GET /api/pending/:nonce
	const pendingMatch = path.match(/^\/api\/pending\/([a-f0-9-]+)$/);
	if (method === "GET" && pendingMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return true;
		}
		const nonce = pendingMatch[1];
		const pending = browserState.pendingTxs.get(nonce);
		if (!pending) {
			jsonResponse(res, 404, { error: "Transaction not found or expired" });
			return true;
		}
		const chain = getChain(pending.params.chainId);
		jsonResponse(res, 200, {
			to: pending.params.to,
			value: pending.params.value.toString(),
			displayValue: `${formatEther(pending.params.value)} ETH`,
			chainId: pending.params.chainId,
			chainName: chain.name,
			data: pending.params.data ?? null,
		});
		return true;
	}

	// POST /api/confirm/:nonce
	const apiConfirmMatch = path.match(/^\/api\/confirm\/([a-f0-9-]+)$/);
	if (method === "POST" && apiConfirmMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return true;
		}
		const nonce = apiConfirmMatch[1];
		const pending = browserState.pendingTxs.get(nonce);
		if (!pending) {
			jsonResponse(res, 404, { error: "Transaction not found or expired" });
			return true;
		}
		const body = (await parseBody(req)) as { hash: string };
		browserState.pendingTxs.delete(nonce);
		pending.resolve(body.hash as `0x${string}`);
		jsonResponse(res, 200, { ok: true });
		return true;
	}

	// POST /api/reject/:nonce
	const apiRejectMatch = path.match(/^\/api\/reject\/([a-f0-9-]+)$/);
	if (method === "POST" && apiRejectMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return true;
		}
		const nonce = apiRejectMatch[1];
		const pendingTx = browserState.pendingTxs.get(nonce);
		if (pendingTx) {
			browserState.pendingTxs.delete(nonce);
			pendingTx.reject(new Error("Transaction rejected by user"));
			jsonResponse(res, 200, { ok: true });
			return true;
		}
		const pendingSign = browserState.pendingSigns.get(nonce);
		if (pendingSign) {
			browserState.pendingSigns.delete(nonce);
			pendingSign.reject(new Error("Signing rejected by user"));
			jsonResponse(res, 200, { ok: true });
			return true;
		}
		jsonResponse(res, 404, { error: "Request not found or expired" });
		return true;
	}

	// GET /sign/:nonce
	const signMatch = path.match(/^\/sign\/([a-f0-9-]+)$/);
	if (method === "GET" && signMatch) {
		htmlResponse(res, signPage(signMatch[1]));
		return true;
	}

	// GET /api/pending-sign/:nonce
	const pendingSignMatch = path.match(/^\/api\/pending-sign\/([a-f0-9-]+)$/);
	if (method === "GET" && pendingSignMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return true;
		}
		const nonce = pendingSignMatch[1];
		const pending = browserState.pendingSigns.get(nonce);
		if (!pending) {
			jsonResponse(res, 404, { error: "Sign request not found or expired" });
			return true;
		}
		jsonResponse(res, 200, { message: pending.message });
		return true;
	}

	// POST /api/sign/:nonce
	const apiSignMatch = path.match(/^\/api\/sign\/([a-f0-9-]+)$/);
	if (method === "POST" && apiSignMatch) {
		if (!browserState) {
			jsonResponse(res, 400, { error: "Not in browser mode" });
			return true;
		}
		const nonce = apiSignMatch[1];
		const pending = browserState.pendingSigns.get(nonce);
		if (!pending) {
			jsonResponse(res, 404, { error: "Sign request not found or expired" });
			return true;
		}
		const body = (await parseBody(req)) as { signature: string };
		browserState.pendingSigns.delete(nonce);
		pending.resolve(body.signature as `0x${string}`);
		jsonResponse(res, 200, { ok: true });
		return true;
	}

	return false;
}
