import type { ServerResponse } from "node:http";
import type { VaulxError } from "../errors.js";

export function jsonResponse(res: ServerResponse, status: number, data: unknown) {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(data));
}

export function htmlResponse(res: ServerResponse, html: string) {
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	res.end(html);
}

export function errorResponse(res: ServerResponse, error: VaulxError, status = 400) {
	jsonResponse(res, status, {
		error: error.code,
		message: error.message,
		details: error.details,
	});
}
