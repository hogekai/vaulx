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
 * Ensure private keys are available (EVM and/or Solana).
 * If not in process.env after .env load, try OS keychain.
 */
export async function ensurePrivateKey(walletName: string): Promise<void> {
	if (process.env.WALLET_MODE === "browser") return;

	// Already have both keys
	if (process.env.PRIVATE_KEY && process.env.SOLANA_PRIVATE_KEY) return;

	try {
		const { loadAllFromKeychain } = await import("../cli/keychain.js");
		const keys = await loadAllFromKeychain(walletName);
		if (keys.evm && !process.env.PRIVATE_KEY) {
			process.env.PRIVATE_KEY = keys.evm;
		}
		if (keys.solana && !process.env.SOLANA_PRIVATE_KEY) {
			process.env.SOLANA_PRIVATE_KEY = keys.solana;
		}
	} catch {
		// keychain unavailable
	}

	if (!process.env.PRIVATE_KEY && !process.env.SOLANA_PRIVATE_KEY) {
		throw new Error(`No keys found for wallet "${walletName}"`);
	}
}
