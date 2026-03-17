import { createServer } from "node:http";
import { WALLET_PORT } from "../config.js";
import type { WalletContext } from "./routes.js";
import { handleRequest } from "./routes.js";

export function startHttpServer(ctx: WalletContext): Promise<void> {
	return new Promise((resolve) => {
		const httpServer = createServer((req, res) => {
			handleRequest(req, res, ctx).catch((err) => {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: String(err) }));
			});
		});

		httpServer.listen(WALLET_PORT, "127.0.0.1", () => {
			console.error(`[vaulx] HTTP server listening on http://127.0.0.1:${WALLET_PORT}`);
			resolve();
		});
	});
}
