import type { ServerResponse } from "node:http";
import { DEFAULT_CHAIN_ID } from "../../config.js";
import type { BrowserSignerState } from "../../signer/browser.js";
import type { Signer } from "../../signer/types.js";
import { depositPage } from "../deposit.js";
import { htmlResponse, jsonResponse } from "../error.js";
import type { WalletContext } from "../routes.js";

function getBrowserState(signer: Signer): BrowserSignerState | null {
	if (signer.mode === "browser" && "state" in signer) {
		return (signer as Signer & { state: BrowserSignerState }).state;
	}
	return null;
}

export async function handlePublicRoutes(
	method: string,
	path: string,
	res: ServerResponse,
	ctx: WalletContext,
): Promise<boolean> {
	// Health check
	if (method === "GET" && path === "/health") {
		const defaultSigner = await ctx.chainManager.getSigner(ctx.chainManager.defaultChainId);
		const address =
			defaultSigner.mode === "browser"
				? (getBrowserState(defaultSigner)?.connectedAddress ?? null)
				: await defaultSigner.getAddress();
		jsonResponse(res, 200, { status: "ok", address });
		return true;
	}

	// Deposit page
	if (method === "GET" && path === "/deposit") {
		const defaultSigner = await ctx.chainManager.getSigner(ctx.chainManager.defaultChainId);
		const address =
			defaultSigner.mode === "browser"
				? (getBrowserState(defaultSigner)?.connectedAddress ?? "Not connected")
				: await defaultSigner.getAddress();
		htmlResponse(res, depositPage(address, DEFAULT_CHAIN_ID));
		return true;
	}

	return false;
}
