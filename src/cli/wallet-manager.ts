import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const VAULX_HOME = process.env.VAULX_HOME_OVERRIDE ?? path.join(os.homedir(), ".vaulx");
const CONFIG_PATH = path.join(VAULX_HOME, "config.json");
const WALLETS_DIR = path.join(VAULX_HOME, "wallets");

export interface VaulxConfig {
	active: string;
	keyStorage: "keychain" | "file";
}

export interface WalletInfo {
	name: string;
	dir: string;
	address?: string;
	solanaAddress?: string;
	chainId?: string;
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function validateWalletName(name: string): void {
	if (!NAME_RE.test(name)) {
		console.error(`❌ Invalid wallet name: "${name}"`);
		console.error("   Use lowercase alphanumeric + hyphens, 1-32 chars.");
		process.exit(1);
	}
}

export function loadConfig(): VaulxConfig {
	if (fs.existsSync(CONFIG_PATH)) {
		try {
			return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
		} catch {
			/* fall through */
		}
	}
	return { active: "default", keyStorage: "keychain" };
}

export function saveConfig(config: VaulxConfig): void {
	if (!fs.existsSync(VAULX_HOME)) {
		fs.mkdirSync(VAULX_HOME, { recursive: true });
	}
	fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, "\t")}\n`);
}

export function walletDir(name: string): string {
	return path.join(WALLETS_DIR, name);
}

export function activeWalletDir(): string {
	return walletDir(loadConfig().active);
}

export function walletExists(name: string): boolean {
	return fs.existsSync(walletDir(name));
}

export function listWallets(): WalletInfo[] {
	if (!fs.existsSync(WALLETS_DIR)) return [];

	return fs
		.readdirSync(WALLETS_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => {
			const dir = path.join(WALLETS_DIR, d.name);
			const envPath = path.join(dir, ".env");
			let address: string | undefined;
			let solanaAddress: string | undefined;
			let chainId: string | undefined;

			if (fs.existsSync(envPath)) {
				const content = fs.readFileSync(envPath, "utf-8");
				const addrMatch = content.match(/^WALLET_ADDRESS=(.+)$/m);
				if (addrMatch) address = addrMatch[1].trim();
				const solAddrMatch = content.match(/^SOLANA_WALLET_ADDRESS=(.+)$/m);
				if (solAddrMatch) solanaAddress = solAddrMatch[1].trim();
				const chainMatch = content.match(/^DEFAULT_CHAIN_ID=(.+)$/m);
				if (chainMatch) chainId = chainMatch[1].trim();
			}

			return { name: d.name, dir, address, solanaAddress, chainId };
		});
}

export function createWalletDir(name: string): string {
	const dir = walletDir(name);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

export function deleteWallet(name: string): void {
	const dir = walletDir(name);
	if (!fs.existsSync(dir)) {
		throw new Error(`Wallet "${name}" does not exist`);
	}
	fs.rmSync(dir, { recursive: true, force: true });

	const config = loadConfig();
	if (config.active === name) {
		config.active = "default";
		saveConfig(config);
	}
}

/**
 * Migrate old flat ~/.vaulx/.env layout to wallets/default/.
 * Called from init() and list before accessing wallets.
 */
export function migrateIfNeeded(): void {
	const oldEnv = path.join(VAULX_HOME, ".env");
	const newDir = walletDir("default");

	if (!fs.existsSync(oldEnv) || fs.existsSync(newDir)) return;

	console.error("[vaulx] Migrating to multi-wallet format...");
	fs.mkdirSync(newDir, { recursive: true });

	// Move .env
	fs.renameSync(oldEnv, path.join(newDir, ".env"));

	// Move wallet-policy.json
	const oldPolicy = path.join(VAULX_HOME, "wallet-policy.json");
	if (fs.existsSync(oldPolicy)) {
		fs.renameSync(oldPolicy, path.join(newDir, "wallet-policy.json"));
	}

	// Move vaulx.db
	const oldDb = path.join(VAULX_HOME, "vaulx.db");
	if (fs.existsSync(oldDb)) {
		fs.renameSync(oldDb, path.join(newDir, "vaulx.db"));
	}

	// Derive WALLET_ADDRESS from PRIVATE_KEY in migrated .env
	const envPath = path.join(newDir, ".env");
	const envContent = fs.readFileSync(envPath, "utf-8");
	if (!envContent.includes("WALLET_ADDRESS=")) {
		const keyMatch = envContent.match(/^PRIVATE_KEY=(0x[0-9a-fA-F]+)$/m);
		if (keyMatch) {
			// Append address + wallet name without importing viem (lazy derive later)
			// For migration, we skip address derivation — list will show "???" until re-init
			fs.appendFileSync(envPath, "VAULX_WALLET_NAME=default\n");
		}
	}

	// Update WALLET_POLICY and WALLET_DB paths in .env
	let updated = fs.readFileSync(envPath, "utf-8");
	updated = updated.replace(
		/^WALLET_POLICY=.+$/m,
		`WALLET_POLICY=${path.join(newDir, "wallet-policy.json")}`,
	);
	updated = updated.replace(/^WALLET_DB=.+$/m, `WALLET_DB=${path.join(newDir, "vaulx.db")}`);
	fs.writeFileSync(envPath, updated);

	saveConfig({ active: "default", keyStorage: "file" });

	console.error("[vaulx] Migration complete → ~/.vaulx/wallets/default/");
}
