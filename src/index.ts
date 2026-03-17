import { createMCPServer, memoryStore } from "@lynq/lynq";
import { sqliteStore } from "@lynq/store-sqlite";
import Database from "better-sqlite3";
import { createChainManager } from "./chain/manager.js";
import { CUSTOM_TOKENS, ENABLE_SWAP, validateConfig, WALLET_DB, WALLET_STORE } from "./config.js";
import { createPolicyGuard } from "./guard/policy-guard.js";
import { startHttpServer } from "./http/server.js";
import { createTxLog } from "./log/tx-log.js";
import { loadPolicy } from "./policy.js";
import { registerAddressResource } from "./resources/address.js";
import { registerBalanceResource } from "./resources/balance.js";
import { registerChainsResource } from "./resources/chains.js";
import { registerPolicyResource } from "./resources/policy.js";
import { registerSpendingResource } from "./resources/spending.js";
import { registerTokenResources } from "./resources/tokens.js";
import { registerTransactionsResource } from "./resources/transactions.js";
import { TokenRegistry } from "./token/registry.js";
import { registerApproveToken } from "./tools/approve-token.js";
import { registerRevokeToken } from "./tools/revoke-token.js";
import { registerSendToken } from "./tools/send-token.js";
import { registerSendTransaction } from "./tools/send-transaction.js";
import { registerSignMessage } from "./tools/sign-message.js";
import { registerSwapToken } from "./tools/swap-token.js";
import { registerWithdraw } from "./tools/withdraw.js";

validateConfig();

// Store
const store =
	WALLET_STORE === "memory" ? memoryStore() : sqliteStore({ db: new Database(WALLET_DB) });

// Chain manager (handles multi-chain signer creation)
const chainManager = createChainManager();

// Token registry
const tokenRegistry = new TokenRegistry(CUSTOM_TOKENS || undefined);

const policy = loadPolicy();
const policyGuard = createPolicyGuard(policy, store);
const txLog = createTxLog(store);

const server = createMCPServer({
	name: "vaulx",
	version: "0.4.0",
	store,
});

// Resources
registerAddressResource(server, chainManager);
registerBalanceResource(server, chainManager);
registerTransactionsResource(server, txLog);
registerChainsResource(server);
registerTokenResources(server, chainManager, tokenRegistry);
registerSpendingResource(server, { chainManager, policyGuard, store });
registerPolicyResource(server, policyGuard);

// Tools
const toolCtx = { chainManager, policyGuard, txLog, tokenRegistry };
registerSendTransaction(server, toolCtx);
registerSendToken(server, toolCtx);
registerSignMessage(server, { chainManager, policyGuard });
registerWithdraw(server, toolCtx);
registerApproveToken(server, toolCtx);
registerRevokeToken(server, toolCtx);

if (ENABLE_SWAP) {
	registerSwapToken(server, toolCtx);
	console.error("[vaulx] Swap tool enabled");
}

// Startup logging
const defaultSigner = await chainManager.getSigner(chainManager.defaultChainId);
const address = await defaultSigner.getAddress();
switch (defaultSigner.mode) {
	case "env":
		console.error(`[vaulx] Wallet address: ${address}`);
		break;
	case "browser":
		console.error(`[vaulx] Browser mode — connect wallet via /connect`);
		break;
	case "smart-account":
		console.error(`[vaulx] Smart account: ${address}`);
		if (defaultSigner.hasPaymaster) {
			console.error(`[vaulx] Paymaster enabled — gas sponsored`);
		}
		break;
	case "session-key":
		console.error(`[vaulx] Session key → smart account: ${address}`);
		if (defaultSigner.hasPaymaster) {
			console.error(`[vaulx] Paymaster enabled — gas sponsored`);
		}
		break;
}

// Security warnings
if (defaultSigner.mode === "session-key") {
	console.error(
		"\u26a0\ufe0f  session-key mode: owner-level permissions (on-chain restriction NOT active)",
	);
	console.error("   SpendingPolicy is software-only. Do NOT use with real funds.");
}

const TESTNET_CHAINS = new Set([84532, 11155111]);
if (!TESTNET_CHAINS.has(chainManager.defaultChainId)) {
	console.error("\u26a0\ufe0f  Mainnet detected. vaulx has NOT been security audited.");
}

// Start both transports
await Promise.all([server.stdio(), startHttpServer({ chainManager, policyGuard, txLog })]);
