import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WALLET_AUTH_TOKEN } from "../config.js";

export const AUTH_TOKEN = WALLET_AUTH_TOKEN || randomUUID();

if (!WALLET_AUTH_TOKEN) {
	console.error(`[vaulx] Generated auth token: ${AUTH_TOKEN}`);
}

export function validateAuth(req: IncomingMessage): boolean {
	const header = req.headers.authorization;
	return header === `Bearer ${AUTH_TOKEN}`;
}
