import fs from "node:fs";
import path from "node:path";

/**
 * Read a wallet's .env file and apply to process.env.
 * Overwrites existing values (unlike startup which preserves).
 */
export function loadWalletEnv(walletDir: string): void {
	const envPath = path.join(walletDir, ".env");
	if (!fs.existsSync(envPath)) {
		throw new Error(`.env not found: ${envPath}`);
	}

	const content = fs.readFileSync(envPath, "utf-8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();
		process.env[key] = value;
	}
}

/**
 * Ensure PRIVATE_KEY is available.
 * If not in process.env after .env load, try OS keychain.
 */
export async function ensurePrivateKey(walletName: string): Promise<void> {
	if (process.env.PRIVATE_KEY) return;
	if (process.env.WALLET_MODE === "browser") return;

	try {
		const { loadFromKeychain } = await import("../cli/keychain.js");
		const key = await loadFromKeychain(walletName);
		if (key) {
			process.env.PRIVATE_KEY = key;
		}
	} catch {
		// keychain unavailable
	}

	if (!process.env.PRIVATE_KEY && process.env.WALLET_MODE !== "browser") {
		throw new Error(`No PRIVATE_KEY for wallet "${walletName}"`);
	}
}
