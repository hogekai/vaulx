import { createMCPServer, memoryStore } from "@lynq/lynq";
import { sqliteStore } from "@lynq/store-sqlite";
import Database from "better-sqlite3";
import { createChainManager } from "./chain/manager.js";
import { TokenRegistry } from "./token/registry.js";
import { loadPolicy } from "./policy.js";
import { createPolicyGuard } from "./guard/policy-guard.js";
import { createTxLog } from "./log/tx-log.js";
import { registerAddressResource } from "./resources/address.js";
import { registerBalanceResource } from "./resources/balance.js";
import { registerTransactionsResource } from "./resources/transactions.js";
import { registerChainsResource } from "./resources/chains.js";
import { registerTokenResources } from "./resources/tokens.js";
import { registerSendTransaction } from "./tools/send-transaction.js";
import { registerSendToken } from "./tools/send-token.js";
import { registerSignMessage } from "./tools/sign-message.js";
import { registerWithdraw } from "./tools/withdraw.js";
import { registerApproveToken } from "./tools/approve-token.js";
import { registerSwapToken } from "./tools/swap-token.js";
import { startHttpServer } from "./http/server.js";
import {
  WALLET_STORE,
  WALLET_DB,
  CUSTOM_TOKENS,
  ENABLE_SWAP,
} from "./config.js";

// Store
const store =
  WALLET_STORE === "memory"
    ? memoryStore()
    : sqliteStore({ db: new Database(WALLET_DB) });

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

// Tools
const toolCtx = { chainManager, policyGuard, txLog, tokenRegistry };
registerSendTransaction(server, toolCtx);
registerSendToken(server, toolCtx);
registerSignMessage(server, { chainManager, policyGuard });
registerWithdraw(server, toolCtx);
registerApproveToken(server, toolCtx);

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

// Start both transports
await Promise.all([
  server.stdio(),
  startHttpServer({ chainManager, policyGuard, txLog }),
]);
