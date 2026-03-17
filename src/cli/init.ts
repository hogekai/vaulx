import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, NETWORK_ALIASES } from "../config.js";
import { addressBox } from "./qr.js";
import { askWithDefault, close, select } from "./prompts.js";
import { isAlreadyRegistered, registerHook, registerMCP } from "./register.js";

interface InitOptions {
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
	console.error("\nvaulx — Agent Wallet Setup\n");

	// 1. チェーン選択
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

	// 2. ポリシー設定
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

	// 3. 秘密鍵生成
	console.error("Generating wallet...\n");
	const privateKey = `0x${crypto.randomBytes(32).toString("hex")}` as `0x${string}`;
	const account = privateKeyToAccount(privateKey);
	const address = account.address;
	const authToken = crypto.randomUUID();
	const port = 18420;
	const vaulxDir = process.cwd();

	// 4. .env 書き出し（秘密鍵はここだけ）
	const envPath = path.join(vaulxDir, ".env");
	if (fs.existsSync(envPath) && !options.nonInteractive) {
		const overwrite = await askWithDefault(".env already exists. Overwrite? (y/N)", "N");
		if (overwrite.toLowerCase() !== "y") {
			console.error("Aborted.");
			close();
			process.exit(0);
		}
	}

	fs.writeFileSync(envPath, buildEnvFile(privateKey, chainId, chain, authToken, port), {
		mode: 0o600,
	});

	// 5. wallet-policy.json
	const policyPath = path.join(vaulxDir, "wallet-policy.json");
	const policyExists = fs.existsSync(policyPath);
	if (!policyExists) {
		fs.writeFileSync(policyPath, buildPolicyFile(maxPerTxWei, maxPerDayWei));
	}

	// 6. 結果表示
	const isTestnet = chainId === 84532 || chainId === 11155111;

	console.error("✔ Agent wallet created\n");
	console.error(addressBox(address, `${chain.name} (${chainId})`, "env"));
	console.error("");
	console.error("  .env written (chmod 600)");
	console.error(`  wallet-policy.json ${policyExists ? "already exists" : "written"}`);
	console.error("");

	// 7. Claude Code 登録（秘密鍵は渡さない）
	const regOpts = { vaulxDir, chainId, authToken, port };
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

	// 8. 警告
	console.error("");
	console.error("  ⚠️  Private key stored in .env (chmod 600)");
	console.error("     ~/.mcp.json contains the .env path only — no secrets.");
	console.error("     Do NOT share .env or commit it to git.");
	console.error("");

	// 9. Next steps
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

function buildEnvFile(
	privateKey: string,
	chainId: number,
	chain: { rpc: string },
	authToken: string,
	port: number,
): string {
	return `# vaulx agent wallet — generated by 'vaulx init'
# ⚠️  Do NOT share this file or commit it to git

PRIVATE_KEY=${privateKey}
WALLET_MODE=env
DEFAULT_CHAIN_ID=${chainId}
RPC_URL=${chain.rpc}
WALLET_POLICY=./wallet-policy.json
WALLET_PORT=${port}
WALLET_AUTH_TOKEN=${authToken}
WALLET_STORE=sqlite
WALLET_DB=./vaulx.db
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
