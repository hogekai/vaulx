import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Set VAULX_HOME_OVERRIDE BEFORE importing wallet-manager
// The module reads this env var at load time
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaulx-wm-"));
process.env.VAULX_HOME_OVERRIDE = path.join(tempDir, ".vaulx");

// Now import — module will use our override
const {
	VAULX_HOME,
	createWalletDir,
	deleteWallet,
	listWallets,
	loadConfig,
	migrateIfNeeded,
	saveConfig,
	validateWalletName,
	walletDir,
	walletExists,
} = await import("../../src/cli/wallet-manager.js");

afterAll(() => {
	delete process.env.VAULX_HOME_OVERRIDE;
	fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("WalletManager", () => {
	test("VAULX_HOME uses override", () => {
		expect(VAULX_HOME).toBe(path.join(tempDir, ".vaulx"));
	});

	test("loadConfig: no file → defaults", () => {
		const config = loadConfig();
		expect(config.active).toBe("default");
		expect(config.keyStorage).toBe("keychain");
	});

	test("saveConfig + loadConfig: round-trip", () => {
		saveConfig({ active: "roundtrip", keyStorage: "file" });
		const config = loadConfig();
		expect(config.active).toBe("roundtrip");
		expect(config.keyStorage).toBe("file");
		// Reset for other tests
		saveConfig({ active: "default", keyStorage: "keychain" });
	});

	test("createWalletDir: creates nested directory", () => {
		const dir = createWalletDir("create-test");
		expect(fs.existsSync(dir)).toBe(true);
		fs.rmSync(dir, { recursive: true });
	});

	test("walletExists: false before create, true after", () => {
		expect(walletExists("existence-test")).toBe(false);
		createWalletDir("existence-test");
		expect(walletExists("existence-test")).toBe(true);
		fs.rmSync(walletDir("existence-test"), { recursive: true });
	});

	test("listWallets: empty when no wallets dir", () => {
		// WALLETS_DIR doesn't exist yet → empty
		const walletsDir = path.join(VAULX_HOME, "wallets");
		const existed = fs.existsSync(walletsDir);
		if (existed) {
			// If previous tests created it, remove temporarily
			const backup = walletsDir + ".bak";
			fs.renameSync(walletsDir, backup);
			expect(listWallets()).toEqual([]);
			fs.renameSync(backup, walletsDir);
		} else {
			expect(listWallets()).toEqual([]);
		}
	});

	test("listWallets: reads WALLET_ADDRESS from .env", () => {
		createWalletDir("list-test");
		fs.writeFileSync(
			path.join(walletDir("list-test"), ".env"),
			"WALLET_ADDRESS=0xABCD\nDEFAULT_CHAIN_ID=84532\n",
		);

		const wallets = listWallets();
		const found = wallets.find((w) => w.name === "list-test");
		expect(found).toBeDefined();
		expect(found!.address).toBe("0xABCD");
		expect(found!.chainId).toBe(84532);

		fs.rmSync(walletDir("list-test"), { recursive: true });
	});

	test("deleteWallet: removes directory", () => {
		createWalletDir("delete-test");
		deleteWallet("delete-test");
		expect(walletExists("delete-test")).toBe(false);
	});

	test("deleteWallet: resets active to default", () => {
		createWalletDir("active-del");
		saveConfig({ active: "active-del", keyStorage: "file" });
		deleteWallet("active-del");
		expect(loadConfig().active).toBe("default");
	});

	test("deleteWallet: non-existent → throws", () => {
		expect(() => deleteWallet("ghost-wallet")).toThrow();
	});

	test("migrateIfNeeded: old layout → wallets/default/", () => {
		// Ensure clean state
		const defaultDir = walletDir("default");
		if (fs.existsSync(defaultDir)) fs.rmSync(defaultDir, { recursive: true });

		// Create old-style flat layout
		fs.mkdirSync(VAULX_HOME, { recursive: true });
		fs.writeFileSync(
			path.join(VAULX_HOME, ".env"),
			"PRIVATE_KEY=0xabc\nDEFAULT_CHAIN_ID=84532\n",
		);
		fs.writeFileSync(path.join(VAULX_HOME, "wallet-policy.json"), '{"maxPerTx":"100"}');

		migrateIfNeeded();

		expect(fs.existsSync(path.join(VAULX_HOME, ".env"))).toBe(false);
		expect(walletExists("default")).toBe(true);
		expect(fs.existsSync(path.join(defaultDir, ".env"))).toBe(true);

		fs.rmSync(defaultDir, { recursive: true });
	});

	test("migrateIfNeeded: already migrated → noop", () => {
		const defaultDir = walletDir("default");
		createWalletDir("default");
		fs.writeFileSync(path.join(defaultDir, ".env"), "EXISTING=1\n");
		fs.mkdirSync(VAULX_HOME, { recursive: true });
		fs.writeFileSync(path.join(VAULX_HOME, ".env"), "OLD=1\n");

		migrateIfNeeded();

		// Old file still there
		expect(fs.existsSync(path.join(VAULX_HOME, ".env"))).toBe(true);
		const content = fs.readFileSync(path.join(defaultDir, ".env"), "utf-8");
		expect(content).toContain("EXISTING=1");

		fs.rmSync(defaultDir, { recursive: true });
		fs.unlinkSync(path.join(VAULX_HOME, ".env"));
	});

	test("validateWalletName: valid names pass", () => {
		validateWalletName("default");
		validateWalletName("my-wallet-1");
		validateWalletName("a");
	});
});
