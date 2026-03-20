import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, isSolanaChain, NETWORK_ALIASES, resolveChainId } from "../config.js";
import { isKeychainAvailable, saveToKeychain } from "./keychain.js";
import { askWithDefault, close, select } from "./prompts.js";
import { addressBox } from "./qr.js";
import { isAlreadyRegistered, registerHook, registerMCP } from "./register.js";
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
	{ label: "Solana Devnet", value: "solana-devnet" },
	{ label: "Base (8453)", value: "8453" },
	{ label: "Ethereum (1)", value: "1" },
	{ label: "Solana", value: "solana" },
];

export async function init(options: InitOptions = {}): Promise<void> {
	migrateIfNeeded();

	const walletName = options.name ?? "default";
	validateWalletName(walletName);

	console.error(`\nvaulx — Agent Wallet Setup (${walletName})\n`);

	// 1. Chain selection
	let chainId: string;
	if (options.chain) {
		chainId = resolveChainId(options.chain);
	} else if (options.nonInteractive) {
		chainId = "84532";
	} else {
		chainId = await select("Chain:", CHAIN_CHOICES);
	}

	const chain = CHAINS[chainId];
	if (!chain) {
		console.error(`❌ Unknown chain: ${chainId}`);
		process.exit(1);
	}

	const isSolana = isSolanaChain(chainId);

	// 2. Policy
	let maxPerTxRaw: string;
	let maxPerDayRaw: string;

	if (options.nonInteractive) {
		maxPerTxRaw = options.maxPerTx ?? (isSolana ? "1000000000" : "100000000000000000");
		maxPerDayRaw = options.maxPerDay ?? (isSolana ? "5000000000" : "500000000000000000");
	} else {
		const nativeSymbol = chain.nativeCurrency.symbol;
		const txInput = await askWithDefault(
			`Max per transaction (${nativeSymbol})`,
			isSolana ? "1" : "0.1",
		);
		const dayInput = await askWithDefault(`Daily limit (${nativeSymbol})`, isSolana ? "5" : "0.5");
		if (isSolana) {
			maxPerTxRaw = solToLamports(txInput);
			maxPerDayRaw = solToLamports(dayInput);
		} else {
			maxPerTxRaw = ethToWei(txInput);
			maxPerDayRaw = ethToWei(dayInput);
		}
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

	let privateKey: string;
	let address: string;
	if (isSolana) {
		const { Keypair } = await import("@solana/web3.js");
		const bs58 = await import("bs58");
		const keypair = Keypair.generate();
		privateKey = bs58.default.encode(keypair.secretKey);
		address = keypair.publicKey.toBase58();
	} else {
		privateKey = `0x${crypto.randomBytes(32).toString("hex")}`;
		const account = privateKeyToAccount(privateKey as `0x${string}`);
		address = account.address;
	}

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
			isSolana,
		}),
		{ mode: 0o600 },
	);

	// 7. Write wallet-policy.json
	const policyPath = path.join(wDir, "wallet-policy.json");
	const policyExists = fs.existsSync(policyPath);
	if (!policyExists) {
		fs.writeFileSync(
			policyPath,
			buildPolicyFile(maxPerTxRaw, maxPerDayRaw, chain.nativeCurrency.symbol),
		);
	}

	// 8. Display result
	const isTestnet = chainId === "84532" || chainId === "11155111" || chainId === "solana-devnet";

	console.error("✔ Agent wallet created\n");
	console.error(addressBox(address, `${chain.name} (${chainId})`, "env"));
	console.error("");
	console.error(`  ${envPath} written (chmod 600)`);
	console.error(`  ${policyPath} ${policyExists ? "already exists" : "written"}`);
	console.error("");

	// 9. Set active + register
	if (walletName !== config.active && !options.nonInteractive) {
		const setActive = await askWithDefault(`Set "${walletName}" as active wallet? (Y/n)`, "Y");
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
	const nativeSymbol = chain.nativeCurrency.symbol;
	console.error("  Next steps:");
	if (isTestnet) {
		console.error("  1. Fund this address:");
		if (chainId === "84532") {
			console.error("     • Faucet: https://www.alchemy.com/faucets/base-sepolia");
		} else if (chainId === "11155111") {
			console.error("     • Faucet: https://www.alchemy.com/faucets/ethereum-sepolia");
		} else if (chainId === "solana-devnet") {
			console.error("     • Faucet: https://faucet.solana.com");
		}
		console.error(`     • Or send testnet ${nativeSymbol} to ${address}`);
	} else {
		console.error(`  1. Send ${nativeSymbol} to ${address}`);
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

function solToLamports(sol: string): string {
	const [whole = "0", frac = ""] = sol.split(".");
	const padded = frac.padEnd(9, "0").slice(0, 9);
	return (BigInt(whole) * 10n ** 9n + BigInt(padded)).toString();
}

interface EnvFileOptions {
	privateKey?: string;
	address: string;
	chainId: string;
	chain: { rpc: string };
	authToken: string;
	port: number;
	walletName: string;
	wDir: string;
	keyStorage: "keychain" | "file";
	isSolana: boolean;
}

function buildEnvFile(opts: EnvFileOptions): string {
	const keyEnvName = opts.isSolana ? "SOLANA_PRIVATE_KEY" : "PRIVATE_KEY";
	const keyLine = opts.privateKey ? `${keyEnvName}=${opts.privateKey}\n` : "";
	const rpcEnvName = opts.isSolana ? "SOLANA_RPC_URL" : "RPC_URL";
	return `# vaulx agent wallet — generated by 'vaulx init'
# ⚠️  Do NOT share this file or commit it to git

${keyLine}WALLET_ADDRESS=${opts.address}
VAULX_WALLET_NAME=${opts.walletName}
WALLET_MODE=env
DEFAULT_CHAIN_ID=${opts.chainId}
${rpcEnvName}=${opts.chain.rpc}
WALLET_POLICY=${path.join(opts.wDir, "wallet-policy.json")}
WALLET_PORT=${opts.port}
WALLET_AUTH_TOKEN=${opts.authToken}
WALLET_STORE=sqlite
WALLET_DB=${path.join(opts.wDir, "vaulx.db")}
`;
}

function buildPolicyFile(maxPerTx: string, maxPerDay: string, nativeSymbol: string): string {
	return `${JSON.stringify(
		{
			maxPerTx,
			maxPerDay,
			allowedTokens: [nativeSymbol],
			allowedOperations: ["send", "send_token", "sign", "withdraw"],
			allowedRecipients: [],
			blockedRecipients: [],
		},
		null,
		"\t",
	)}\n`;
}
