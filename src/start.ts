import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Resolve .env file: explicit VAULX_ENV_FILE > active wallet from config.json
let envFile = process.env.VAULX_ENV_FILE;

if (!envFile) {
	// Dev mode fallback: read ~/.vaulx/config.json to find active wallet
	const configPath = path.join(os.homedir(), ".vaulx", "config.json");
	if (fs.existsSync(configPath)) {
		try {
			const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
			const name = cfg.active || "default";
			const resolved = path.join(os.homedir(), ".vaulx", "wallets", name, ".env");
			if (fs.existsSync(resolved)) {
				envFile = resolved;
			}
		} catch {
			/* ignore */
		}
	}
}

if (envFile) {
	if (!fs.existsSync(envFile)) {
		console.error(`❌ .env file not found: ${envFile}`);
		process.exit(1);
	}
	const content = fs.readFileSync(envFile, "utf-8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();
		// .env values don't override (MCP env takes precedence)
		if (!process.env[key]) {
			process.env[key] = value;
		}
	}
}

// Keychain fallback: load missing keys from OS keychain
if (process.env.WALLET_MODE !== "browser" && (!process.env.PRIVATE_KEY || !process.env.SOLANA_PRIVATE_KEY)) {
	const walletName = process.env.VAULX_WALLET_NAME ?? "default";
	try {
		const { loadAllFromKeychain } = await import("./cli/keychain.js");
		const keys = await loadAllFromKeychain(walletName);
		if (keys.evm && !process.env.PRIVATE_KEY) {
			process.env.PRIVATE_KEY = keys.evm;
		}
		if (keys.solana && !process.env.SOLANA_PRIVATE_KEY) {
			process.env.SOLANA_PRIVATE_KEY = keys.solana;
		}
	} catch (e) {
		console.error(`[vaulx] Keychain fallback failed: ${e instanceof Error ? e.message : e}`);
	}
}

// Start main server
await import("./index.js");
