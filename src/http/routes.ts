import type { IncomingMessage, ServerResponse } from "node:http";
import type { ChainManager } from "../chain/manager.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import type { TxLog } from "../log/tx-log.js";
import { validateAuth } from "./auth.js";
import { jsonResponse } from "./error.js";
import { handleApiRoutes } from "./handlers/api.js";
import { handleBrowserRoutes } from "./handlers/browser.js";
import { handlePublicRoutes } from "./handlers/pages.js";

export interface WalletContext {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
	txLog: TxLog;
}

export async function handleRequest(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: WalletContext,
): Promise<void> {
	const url = new URL(req.url ?? "/", "http://localhost");
	const path = url.pathname;
	const method = req.method ?? "GET";

	// Public routes (no auth)
	if (await handlePublicRoutes(method, path, res, ctx)) return;

	// Browser mode routes (nonce-protected, no auth)
	if (await handleBrowserRoutes(method, path, req, res, ctx)) return;

	// Auth required
	if (!validateAuth(req)) {
		jsonResponse(res, 401, { error: "Unauthorized" });
		return;
	}

	// API routes
	if (await handleApiRoutes(method, path, req, res, ctx)) return;

	// 404
	jsonResponse(res, 404, { error: "Not found" });
}
