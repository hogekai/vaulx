import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

let _token: string | null = null;

export function getAuthToken(): string {
	if (!_token) {
		_token = process.env.WALLET_AUTH_TOKEN || randomUUID();
		if (!process.env.WALLET_AUTH_TOKEN) {
			console.error(`[vaulx] Generated auth token: ${_token}`);
		}
	}
	return _token;
}

/** Reset cached token — for testing only. */
export function _resetAuthToken(): void {
	_token = null;
}

export function validateAuth(req: IncomingMessage): boolean {
	const header = req.headers.authorization;
	return header === `Bearer ${getAuthToken()}`;
}
