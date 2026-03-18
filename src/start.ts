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

// Keychain fallback: if no PRIVATE_KEY after .env load, try OS keychain
if (!process.env.PRIVATE_KEY && process.env.WALLET_MODE !== "browser") {
	const walletName = process.env.VAULX_WALLET_NAME ?? "default";
	try {
		const { loadFromKeychain } = await import("./cli/keychain.js");
		const key = await loadFromKeychain(walletName);
		if (key) {
			process.env.PRIVATE_KEY = key;
		}
	} catch {
		// Keychain module not available or failed — let index.ts handle missing key
	}
}

// Start main server
await import("./index.js");
