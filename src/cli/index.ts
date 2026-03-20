#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { CHAINS, DEFAULT_CHAIN_ID, PIMLICO_API_KEY, PRIVATE_KEY } from "../config.js";
import { deploySmartAccount } from "./deploy.js";
import { init } from "./init.js";
import { deleteFromKeychain } from "./keychain.js";
import { ask, askWithDefault, close, confirm, select } from "./prompts.js";
import { registerHook, registerMCP } from "./register.js";
import { createSessionKey } from "./session.js";
import {
	deleteWallet,
	listWallets,
	loadConfig,
	migrateIfNeeded,
	saveConfig,
	walletDir,
	walletExists,
} from "./wallet-manager.js";

async function setup() {
	console.error("vaulx setup\n");

	// 1. Private key
	let privateKey = PRIVATE_KEY;
	if (!privateKey) {
		const key = await ask("Owner private key (0x...): ");
		if (!key.startsWith("0x")) {
			console.error("Invalid private key format.");
			process.exit(1);
		}
		privateKey = key as `0x${string}`;
	} else {
		console.error("Using PRIVATE_KEY from environment.");
	}

	// 2. API key
	if (!PIMLICO_API_KEY) {
		console.error("\nPIMLICO_API_KEY not set. Get one free at https://dashboard.pimlico.io");
		process.exit(1);
	}

	// 3. Chain
	const chainNames = Object.entries(CHAINS)
		.map(([id, c]) => `${c.name} (${id})`)
		.join(", ");
	const chainInput = await askWithDefault(`\nChain? ${chainNames}`, DEFAULT_CHAIN_ID);
	const chainId = chainInput;
	if (!CHAINS[chainId]) {
		console.error(`Unsupported chain: ${chainId}`);
		process.exit(1);
	}

	// 4. Deploy smart account
	if (await confirm("\nDeploy smart account?")) {
		const result = await deploySmartAccount(privateKey, chainId);

		// 5. Session key
		if (await confirm("\nCreate session key?")) {
			const session = await createSessionKey(privateKey, result.smartAccountAddress, chainId);

			console.error("\n--- Environment Variables ---\n");
			console.log(`WALLET_MODE=session-key`);
			console.log(`SMART_ACCOUNT_ADDRESS=${result.smartAccountAddress}`);
			console.log(`SESSION_KEY=${session.sessionKey}`);
			console.log(`PIMLICO_API_KEY=${PIMLICO_API_KEY}`);
			console.log(`DEFAULT_CHAIN_ID=${chainId}`);
		} else {
			console.error("\n--- Environment Variables ---\n");
			console.log(`WALLET_MODE=smart-account`);
			console.log(`SMART_ACCOUNT_ADDRESS=${result.smartAccountAddress}`);
			console.log(`PIMLICO_API_KEY=${PIMLICO_API_KEY}`);
			console.log(`DEFAULT_CHAIN_ID=${chainId}`);
		}
	}

	close();
}

async function listCommand(): Promise<void> {
	migrateIfNeeded();
	const config = loadConfig();
	const wallets = listWallets();

	if (wallets.length === 0) {
		console.error("No wallets. Run: vaulx init");
		process.exit(0);
	}

	console.error("\n  Wallets:");
	for (const w of wallets) {
		const marker = w.name === config.active ? "●" : " ";
		const addr = w.address ? `${w.address.slice(0, 6)}...${w.address.slice(-4)}` : "???";
		const chainName = w.chainId ? (CHAINS[w.chainId]?.name ?? String(w.chainId)) : "???";
		console.error(`  ${marker} ${w.name.padEnd(15)} ${addr}   ${chainName}`);
	}
	console.error(`\n  ● = active\n`);
}

async function switchCommand(name: string | undefined): Promise<void> {
	if (!name) {
		if (process.stdin.isTTY) {
			migrateIfNeeded();
			const wallets = listWallets();
			if (wallets.length === 0) {
				console.error("No wallets. Run: vaulx init");
				process.exit(1);
			}
			const options = wallets.map((w) => ({
				label: `${w.name} ${w.address ? `(${w.address.slice(0, 8)}...)` : ""}`,
				value: w.name,
			}));
			name = await select("Switch to:", options);
		} else {
			console.error("Usage: vaulx switch <wallet-name>");
			process.exit(1);
		}
	}
	if (!walletExists(name)) {
		console.error(`❌ Wallet "${name}" does not exist`);
		console.error(`Run: vaulx init --name ${name}`);
		process.exit(1);
	}

	const config = loadConfig();
	config.active = name;
	saveConfig(config);

	// Read .env to re-register MCP + hook
	const wDir = walletDir(name);
	const envContent = fs.readFileSync(path.join(wDir, ".env"), "utf-8");
	const chainId = envContent.match(/DEFAULT_CHAIN_ID=(.+)/)?.[1]?.trim() ?? "84532";
	const authToken = envContent.match(/WALLET_AUTH_TOKEN=(.+)/)?.[1]?.trim() ?? "";
	const port = Number(envContent.match(/WALLET_PORT=(\d+)/)?.[1] ?? "18420");

	registerMCP({ chainId, authToken, port, walletName: name });
	registerHook({ chainId, authToken, port, walletName: name });

	console.error(`✔ Switched to "${name}"`);
	console.error("  Restart Claude Code to apply.");
}

async function deleteCommand(name: string | undefined): Promise<void> {
	if (!name) {
		if (process.stdin.isTTY) {
			migrateIfNeeded();
			const wallets = listWallets().filter((w) => w.name !== "default");
			if (wallets.length === 0) {
				console.error("No wallets to delete (default cannot be deleted).");
				close();
				process.exit(0);
			}
			const options = wallets.map((w) => ({
				label: `${w.name} ${w.address ? `(${w.address.slice(0, 8)}...)` : ""}`,
				value: w.name,
			}));
			name = await select("Delete:", options);
		} else {
			console.error("Usage: vaulx delete <wallet-name>");
			process.exit(1);
		}
	}
	if (name === "default") {
		console.error("❌ Cannot delete the default wallet");
		process.exit(1);
	}
	if (!walletExists(name)) {
		console.error(`❌ Wallet "${name}" does not exist`);
		process.exit(1);
	}

	const answer = await askWithDefault(`Delete wallet "${name}"? This cannot be undone. (y/N)`, "N");
	if (answer.toLowerCase() !== "y") {
		console.error("Aborted.");
		close();
		process.exit(0);
	}

	// Clean up keychain entry if present
	const config = loadConfig();
	if (config.keyStorage === "keychain") {
		await deleteFromKeychain(name);
	}

	deleteWallet(name);
	console.error(`✔ Wallet "${name}" deleted`);

	// deleteWallet resets active to "default" if this was active
	if (config.active === name) {
		console.error('  Switched to "default"');
	}
	close();
}

function getFlag(name: string): string | undefined {
	const idx = process.argv.indexOf(name);
	return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

function hasFlag(name: string): boolean {
	return process.argv.includes(name);
}

const command = process.argv[2];

switch (command) {
	case "init":
		await init({
			name: getFlag("--name"),
			chain: getFlag("--chain"),
			nonInteractive: hasFlag("--non-interactive"),
			maxPerTx: getFlag("--max-per-tx"),
			maxPerDay: getFlag("--max-per-day"),
		});
		break;
	case "setup":
		await setup();
		break;
	case "list":
		await listCommand();
		break;
	case "switch":
		await switchCommand(process.argv[3]);
		break;
	case "delete":
		await deleteCommand(process.argv[3]);
		break;
	case "active": {
		migrateIfNeeded();
		const config = loadConfig();
		console.error(`Active wallet: ${config.active}`);
		break;
	}
	default:
		if (process.stdin.isTTY) {
			await interactiveMenu();
		} else {
			console.error("Usage: vaulx <command>\n");
			console.error("Commands:");
			console.error("  init [--name <n>]  Create a new wallet");
			console.error("  list               List all wallets");
			console.error("  switch <name>      Switch active wallet");
			console.error("  delete <name>      Delete a wallet");
			console.error("  active             Show active wallet");
			console.error("  setup              Deploy smart account (advanced)");
			process.exit(1);
		}
}

async function interactiveMenu(): Promise<void> {
	console.error("\nvaulx — Agent Wallet Manager\n");

	const MENU = [
		{ label: "Create new wallet (init)", value: "init" },
		{ label: "List wallets", value: "list" },
		{ label: "Switch wallet", value: "switch" },
		{ label: "Delete wallet", value: "delete" },
		{ label: "Show active wallet", value: "active" },
		{ label: "Deploy smart account (setup)", value: "setup" },
	];

	const choice = await select("What do you want to do?", MENU);

	switch (choice) {
		case "init":
			await init({});
			break;
		case "list":
			await listCommand();
			break;
		case "switch":
			await switchCommand(undefined);
			break;
		case "delete":
			await deleteCommand(undefined);
			break;
		case "active": {
			migrateIfNeeded();
			const config = loadConfig();
			console.error(`Active wallet: ${config.active}`);
			break;
		}
		case "setup":
			await setup();
			break;
	}
	close();
}
