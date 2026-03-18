import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, NETWORK_ALIASES } from "../config.js";
import { addressBox } from "./qr.js";
import { askWithDefault, close, select } from "./prompts.js";
import { isAlreadyRegistered, registerHook, registerMCP } from "./register.js";
import { isKeychainAvailable, saveToKeychain } from "./keychain.js";
import {
	createWalletDir,
	loadConfig,
	migrateIfNeeded,
	saveConfig,
	validateWalletName,
	walletExists,
} from "./wallet-manager.js";

export interface InitOptions {
	name?: string;
	chain?: string;
	nonInteractive?: boolean;
	maxPerTx?: string;
	maxPerDay?: string;
}

const CHAIN_CHOICES = [
	{ label: "Base Sepolia (84532) — recommended", value: "84532" },
	{ label: "Sepolia (11155111)", value: "11155111" },
	{ label: "Base (8453)", value: "8453" },
	{ label: "Ethereum (1)", value: "1" },
];

export async function init(options: InitOptions = {}): Promise<void> {
	migrateIfNeeded();

	const walletName = options.name ?? "default";
	validateWalletName(walletName);

	console.error(`\nvaulx — Agent Wallet Setup (${walletName})\n`);

	// 1. Chain selection
	let chainId: number;
	if (options.chain) {
		chainId = NETWORK_ALIASES[options.chain] ?? Number(options.chain);
	} else if (options.nonInteractive) {
		chainId = 84532;
	} else {
		const selected = await select("Chain:", CHAIN_CHOICES);
		chainId = Number(selected);
	}

	const chain = CHAINS[chainId];
	if (!chain) {
		console.error(`❌ Unknown chain: ${chainId}`);
		process.exit(1);
	}

	// 2. Policy
	let maxPerTxWei: string;
	let maxPerDayWei: string;

	if (options.nonInteractive) {
		maxPerTxWei = options.maxPerTx ?? "100000000000000000";
		maxPerDayWei = options.maxPerDay ?? "500000000000000000";
	} else {
		const txInput = await askWithDefault("Max per transaction (ETH)", "0.1");
		const dayInput = await askWithDefault("Daily limit (ETH)", "0.5");
		maxPerTxWei = ethToWei(txInput);
		maxPerDayWei = ethToWei(dayInput);
	}

	// 3. Overwrite check
	if (walletExists(walletName) && !options.nonInteractive) {
		const overwrite = await askWithDefault(
			`Wallet "${walletName}" already exists. Overwrite? (y/N)`,
			"N",
		);
		if (overwrite.toLowerCase() !== "y") {
			console.error("Aborted.");
			close();
			process.exit(0);
		}
	}

	// 4. Generate wallet
	console.error("Generating wallet...\n");
	const privateKey = `0x${crypto.randomBytes(32).toString("hex")}` as `0x${string}`;
	const account = privateKeyToAccount(privateKey);
	const address = account.address;
	const authToken = crypto.randomUUID();
	const port = 18420;

	// 5. Store private key (keychain or file)
	const config = loadConfig();
	let keyStorage = config.keyStorage;

	if (keyStorage === "keychain") {
		const stored = await saveToKeychain(walletName, privateKey);
		if (!stored) {
			if (isKeychainAvailable()) {
				console.error("  ⚠️  Keychain save failed, falling back to file storage");
			} else {
				console.error("  ⚠️  Keychain unavailable, falling back to file storage");
			}
			keyStorage = "file";
		} else {
			console.error("  ✔ Stored private key in system keychain\n");
		}
	}

	// 6. Create wallet directory
	const wDir = createWalletDir(walletName);

	// 7. Write .env
	const envPath = path.join(wDir, ".env");
	fs.writeFileSync(
		envPath,
		buildEnvFile({
			privateKey: keyStorage === "file" ? privateKey : undefined,
			address,
			chainId,
			chain,
			authToken,
			port,
			walletName,
			wDir,
			keyStorage,
		}),
		{ mode: 0o600 },
	);

	// 7. Write wallet-policy.json
	const policyPath = path.join(wDir, "wallet-policy.json");
	const policyExists = fs.existsSync(policyPath);
	if (!policyExists) {
		fs.writeFileSync(policyPath, buildPolicyFile(maxPerTxWei, maxPerDayWei));
	}

	// 8. Display result
	const isTestnet = chainId === 84532 || chainId === 11155111;

	console.error("✔ Agent wallet created\n");
	console.error(addressBox(address, `${chain.name} (${chainId})`, "env"));
	console.error("");
	console.error(`  ${envPath} written (chmod 600)`);
	console.error(`  ${policyPath} ${policyExists ? "already exists" : "written"}`);
	console.error("");

	// 9. Set active + register
	if (walletName !== config.active && !options.nonInteractive) {
		const setActive = await askWithDefault(
			`Set "${walletName}" as active wallet? (Y/n)`,
			"Y",
		);
		if (setActive.toLowerCase() !== "n") {
			config.active = walletName;
			saveConfig(config);
		}
	} else if (options.nonInteractive || !walletExists(config.active)) {
		config.active = walletName;
		saveConfig(config);
	}

	const regOpts = { chainId, authToken, port, walletName: config.active };
	const existing = isAlreadyRegistered();

	if (!options.nonInteractive) {
		const mcpLabel = existing.mcp ? "Re-register" : "Register";
		const regMCP = await askWithDefault(`${mcpLabel} vaulx in Claude Code? (Y/n)`, "Y");
		if (regMCP.toLowerCase() !== "n") {
			registerMCP(regOpts);
			console.error("  ✔ Added to ~/.mcp.json (global MCP)");
		}

		const hookLabel = existing.hook ? "Re-register" : "Enable";
		const regHook = await askWithDefault(`${hookLabel} auto-payment hook? (Y/n)`, "Y");
		if (regHook.toLowerCase() !== "n") {
			registerHook(regOpts);
			console.error("  ✔ Added Elicitation hook to ~/.claude/settings.json");
		}
	} else {
		registerMCP(regOpts);
		registerHook(regOpts);
		console.error("  ✔ Registered MCP + hook");
	}

	// 10. Warnings
	console.error("");
	if (keyStorage === "keychain") {
		console.error("  ✔ Private key stored in OS keychain (not on disk)");
	} else {
		console.error(`  ⚠️  Private key stored in ${envPath} (chmod 600)`);
	}
	console.error("     ~/.mcp.json contains the .env path only — no secrets.");
	console.error(`     Do NOT share ${envPath}.`);
	console.error("");

	// 11. Next steps
	console.error("  Next steps:");
	if (isTestnet) {
		console.error("  1. Fund this address:");
		if (chainId === 84532) {
			console.error("     • Faucet: https://www.alchemy.com/faucets/base-sepolia");
		} else if (chainId === 11155111) {
			console.error("     • Faucet: https://www.alchemy.com/faucets/ethereum-sepolia");
		}
		console.error(`     • Or send testnet ETH to ${address}`);
	} else {
		console.error(`  1. Send ETH to ${address}`);
		console.error("     ⚠️  Mainnet — use small amounts only");
	}
	console.error("  2. Restart Claude Code — vaulx will auto-connect.");
	console.error("");

	close();
}

// --- Helpers ---

function ethToWei(eth: string): string {
	const [whole = "0", frac = ""] = eth.split(".");
	const padded = frac.padEnd(18, "0").slice(0, 18);
	return (BigInt(whole) * 10n ** 18n + BigInt(padded)).toString();
}

interface EnvFileOptions {
	privateKey?: string;
	address: string;
	chainId: number;
	chain: { rpc: string };
	authToken: string;
	port: number;
	walletName: string;
	wDir: string;
	keyStorage: "keychain" | "file";
}

function buildEnvFile(opts: EnvFileOptions): string {
	const keyLine = opts.privateKey ? `PRIVATE_KEY=${opts.privateKey}\n` : "";
	return `# vaulx agent wallet — generated by 'vaulx init'
# ⚠️  Do NOT share this file or commit it to git

${keyLine}WALLET_ADDRESS=${opts.address}
VAULX_WALLET_NAME=${opts.walletName}
WALLET_MODE=env
DEFAULT_CHAIN_ID=${opts.chainId}
RPC_URL=${opts.chain.rpc}
WALLET_POLICY=${path.join(opts.wDir, "wallet-policy.json")}
WALLET_PORT=${opts.port}
WALLET_AUTH_TOKEN=${opts.authToken}
WALLET_STORE=sqlite
WALLET_DB=${path.join(opts.wDir, "vaulx.db")}
`;
}

function buildPolicyFile(maxPerTx: string, maxPerDay: string): string {
	return (
		JSON.stringify(
			{
				maxPerTx,
				maxPerDay,
				allowedTokens: ["ETH"],
				allowedOperations: ["send", "send_token", "sign", "withdraw"],
				allowedRecipients: [],
				blockedRecipients: [],
			},
			null,
			"\t",
		) + "\n"
	);
}
