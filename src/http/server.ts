import { createServer } from "node:http";
import { WALLET_PORT } from "../config.js";
import type { WalletContext } from "./routes.js";
import { handleRequest } from "./routes.js";

export function startHttpServer(ctx: WalletContext): Promise<void> {
	return new Promise((resolve) => {
		function tryListen() {
			const httpServer = createServer((req, res) => {
				handleRequest(req, res, ctx).catch((err) => {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: String(err) }));
				});
			});

			httpServer.on("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "EADDRINUSE") {
					console.error(
						`[vaulx] Port ${WALLET_PORT} in use — will retry when it becomes available.`,
					);
					// Poll every 5s until the port is free
					const interval = setInterval(() => {
						const probe = createServer();
						probe.once("error", () => {
							/* still in use */
						});
						probe.once("listening", () => {
							probe.close(() => {
								clearInterval(interval);
								tryListen();
							});
						});
						probe.listen(WALLET_PORT, "127.0.0.1");
					}, 5000);
					resolve();
				} else {
					throw err;
				}
			});

			httpServer.listen(WALLET_PORT, "127.0.0.1", () => {
				console.error(`[vaulx] HTTP server listening on http://127.0.0.1:${WALLET_PORT}`);
				resolve();
			});
		}

		tryListen();
	});
}
