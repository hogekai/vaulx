import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MCPServer } from "@lynq/lynq";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import type { ChainManager } from "../chain/manager.js";
import {
	createWalletDir,
	listWallets,
	loadConfig,
	migrateIfNeeded,
	saveConfig,
	walletDir,
	walletExists,
} from "../cli/wallet-manager.js";
import { CHAINS, isSolanaChain, resolveChainId } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import { ensurePrivateKey, loadWalletEnv } from "../helpers/wallet-env.js";
import { loadPolicy } from "../policy.js";

interface WalletManagementCtx {
	chainManager: ChainManager;
	policyGuard: PolicyGuard;
}

export function registerWalletManagement(server: MCPServer, ctx: WalletManagementCtx) {
	// --- list_wallets ---
	server.tool(
		"list_wallets",
		{
			description: "List all vaulx wallets with addresses and active status.",
			input: z.object({}),
		},
		async (_args, c) => {
			try {
				migrateIfNeeded();
				const config = loadConfig();
				const wallets = listWallets();

				const result = wallets.map((w) => ({
					name: w.name,
					evmAddress: w.address ?? null,
					solanaAddress: w.solanaAddress ?? null,
					defaultChainId: w.chainId ?? null,
					chain: w.chainId ? (CHAINS[w.chainId]?.name ?? null) : null,
					active: w.name === config.active,
				}));

				return c.json({ wallets: result, active: config.active });
			} catch (e) {
				if (e instanceof VaulxError) return c.error(`[${e.code}] ${e.message}`);
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);

	// --- switch_wallet ---
	server.tool(
		"switch_wallet",
		{
			description:
				"Switch the active wallet. Hot-swaps signer without restart. All subsequent operations use the new wallet.",
			input: z.object({
				name: z.string().describe("Wallet name to switch to"),
			}),
		},
		async (args, c) => {
			try {
				const { name } = args;
				migrateIfNeeded();

				if (!walletExists(name)) {
					throw new VaulxError(
						`Wallet "${name}" does not exist. Use list_wallets to see available wallets.`,
						"CONFIG_ERROR",
					);
				}

				// 1. Update config
				const config = loadConfig();
				config.active = name;
				saveConfig(config);

				// 2. Load new wallet's .env into process.env
				const wDir = walletDir(name);
				loadWalletEnv(wDir);

				// 3. Keychain fallback for private key
				await ensurePrivateKey(name);

				// 4. Reload policy
				const newPolicy = loadPolicy();
				ctx.policyGuard.reload(newPolicy);

				// 5. Reset signer cache — next getSigner() creates fresh
				ctx.chainManager.reset();

				// 6. Verify new signer works and collect addresses
				const defaultSigner = await ctx.chainManager.getSigner(ctx.chainManager.defaultChainId);
				const defaultAddress = await defaultSigner.getAddress();

				let evmAddress: string | null = null;
				let solanaAddress: string | null = null;
				try {
					const evmSigner = await ctx.chainManager.getSigner("84532");
					evmAddress = await evmSigner.getAddress();
				} catch {
					/* no EVM key */
				}
				try {
					const solSigner = await ctx.chainManager.getSigner("solana-devnet");
					solanaAddress = await solSigner.getAddress();
				} catch {
					/* no Solana key */
				}

				return c.json({
					switched: true,
					wallet: name,
					address: defaultAddress,
					evmAddress,
					solanaAddress,
					mode: defaultSigner.mode,
					chainId: ctx.chainManager.defaultChainId,
				});
			} catch (e) {
				if (e instanceof VaulxError) return c.error(`[${e.code}] ${e.message}`);
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);

	// --- create_wallet ---
	server.tool(
		"create_wallet",
		{
			description:
				"Create a new agent wallet. Generates private key, stores in keychain (or file), and optionally switches to it.",
			input: z.object({
				name: z.string().describe("Wallet name (lowercase alphanumeric + hyphens, 1-32 chars)"),
				chainId: z
					.union([z.string(), z.number()])
					.default("84532")
					.describe("Chain ID or network alias"),
				switchTo: z.boolean().default(true).describe("Switch to this wallet after creation"),
			}),
		},
		async (args, c) => {
			try {
				const { name, switchTo } = args;
				const chainId = resolveChainId(args.chainId);
				migrateIfNeeded();

				// Validate name
				if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(name)) {
					throw new VaulxError(
						"Invalid wallet name. Use lowercase alphanumeric + hyphens, 1-32 chars.",
						"CONFIG_ERROR",
					);
				}

				if (walletExists(name)) {
					throw new VaulxError(`Wallet "${name}" already exists.`, "CONFIG_ERROR");
				}

				const chain = CHAINS[chainId];
				if (!chain) {
					throw new VaulxError(`Unknown chain: ${chainId}`, "UNKNOWN_CHAIN");
				}

				// Generate both EVM + Solana keys
				const evmPrivateKey = `0x${crypto.randomBytes(32).toString("hex")}`;
				const evmAccount = privateKeyToAccount(evmPrivateKey as `0x${string}`);
				const evmAddress = evmAccount.address;

				const { Keypair } = await import("@solana/web3.js");
				const bs58 = await import("bs58");
				const solanaKeypair = Keypair.generate();
				const solanaPrivateKey = bs58.default.encode(solanaKeypair.secretKey);
				const solanaAddress = solanaKeypair.publicKey.toBase58();

				const authToken = crypto.randomUUID();
				const port = 18420;

				// Create wallet dir
				const wDir = createWalletDir(name);

				// Store keys in keychain or file
				const config = loadConfig();
				let keyStored: "keychain" | "file" = "file";
				if (config.keyStorage === "keychain") {
					try {
						const { isKeychainAvailable, saveAllToKeychain } = await import("../cli/keychain.js");
						if (isKeychainAvailable()) {
							const saved = await saveAllToKeychain(name, evmPrivateKey, solanaPrivateKey);
							if (saved) keyStored = "keychain";
						}
					} catch {
						// keychain unavailable
					}
				}

				// Write .env
				const isSolana = isSolanaChain(chainId);
				const rpcEnvName = isSolana ? "SOLANA_RPC_URL" : "RPC_URL";
				const evmKeyLine = keyStored === "file" ? `PRIVATE_KEY=${evmPrivateKey}\n` : "";
				const solKeyLine = keyStored === "file" ? `SOLANA_PRIVATE_KEY=${solanaPrivateKey}\n` : "";
				const envContent = `# vaulx agent wallet — generated by create_wallet
# Do NOT share this file or commit it to git

${evmKeyLine}${solKeyLine}WALLET_ADDRESS=${evmAddress}
SOLANA_WALLET_ADDRESS=${solanaAddress}
VAULX_WALLET_NAME=${name}
WALLET_MODE=env
DEFAULT_CHAIN_ID=${chainId}
${rpcEnvName}=${chain.rpc}
WALLET_POLICY=${path.join(wDir, "wallet-policy.json")}
WALLET_PORT=${port}
WALLET_AUTH_TOKEN=${authToken}
WALLET_STORE=sqlite
WALLET_DB=${path.join(wDir, "vaulx.db")}
`;

				fs.writeFileSync(path.join(wDir, ".env"), envContent, { mode: 0o600 });

				// Write default policy
				const policyContent = `${JSON.stringify(
					{
						maxPerTx: "100000000000000000",
						maxPerDay: "500000000000000000",
						allowedTokens: ["ETH", "SOL"],
						allowedOperations: ["send", "send_token", "sign", "withdraw"],
						allowedRecipients: [],
						blockedRecipients: [],
					},
					null,
					"\t",
				)}\n`;
				fs.writeFileSync(path.join(wDir, "wallet-policy.json"), policyContent);

				// Switch if requested
				if (switchTo) {
					config.active = name;
					saveConfig(config);
					loadWalletEnv(wDir);
					await ensurePrivateKey(name);
					ctx.policyGuard.reload(loadPolicy());
					ctx.chainManager.reset();
				}

				return c.json({
					created: true,
					wallet: name,
					evmAddress,
					solanaAddress,
					defaultChainId: chainId,
					chain: chain.name,
					keyStorage: keyStored,
					active: switchTo,
				});
			} catch (e) {
				if (e instanceof VaulxError) return c.error(`[${e.code}] ${e.message}`);
				return c.error(`[SIGNER_ERROR] ${e instanceof Error ? e.message : "Unknown error"}`);
			}
		},
	);
}
