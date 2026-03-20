import {
	BASESCAN_API_KEY,
	ETHERSCAN_API_KEY,
	EXPLORER_API_KEY,
	numericChainId,
} from "../config.js";
import { VaulxError } from "../errors.js";

const EXPLORER_API_URLS: Record<string, string> = {
	"1": "https://api.etherscan.io/api",
	"8453": "https://api.basescan.org/api",
	"84532": "https://api-sepolia.basescan.org/api",
	"11155111": "https://api-sepolia.etherscan.io/api",
};

const BASESCAN_CHAINS = new Set(["8453", "84532"]);

export function getExplorerApiUrl(chainId: string): string {
	const url = EXPLORER_API_URLS[chainId];
	if (!url) throw new VaulxError(`No explorer API for chain ${chainId}`, "EXPLORER_ERROR");
	return url;
}

export function getExplorerApiKey(chainId: string): string {
	const perChain = process.env[`ETHERSCAN_API_KEY_${chainId}`];
	if (perChain) return perChain;
	if (BASESCAN_CHAINS.has(chainId) && BASESCAN_API_KEY) return BASESCAN_API_KEY;
	if (!BASESCAN_CHAINS.has(chainId) && ETHERSCAN_API_KEY) return ETHERSCAN_API_KEY;
	return EXPLORER_API_KEY;
}

export interface ExplorerResponse<T> {
	status: string;
	message: string;
	result: T;
}

export async function fetchExplorerApi<T>(
	chainId: string,
	params: Record<string, string>,
): Promise<T> {
	const base = getExplorerApiUrl(chainId);
	const apikey = getExplorerApiKey(chainId);
	const url = new URL(base);
	for (const [k, v] of Object.entries(params)) {
		url.searchParams.set(k, v);
	}
	if (apikey) url.searchParams.set("apikey", apikey);

	const res = await fetch(url.toString());
	if (!res.ok) {
		throw new VaulxError(`Explorer API HTTP ${res.status}`, "EXPLORER_ERROR", {
			chainId,
			status: res.status,
		});
	}

	const json = (await res.json()) as ExplorerResponse<T>;
	if (json.status !== "1" && json.message !== "No transactions found") {
		const msg = typeof json.result === "string" ? json.result : json.message;
		throw new VaulxError(`Explorer API error: ${msg}`, "EXPLORER_ERROR", {
			chainId,
			message: json.message,
		});
	}

	return json.result;
}
