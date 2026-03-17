import { createMCPServer, memoryStore } from "@lynq/lynq";
import { sqliteStore } from "@lynq/store-sqlite";
import Database from "better-sqlite3";
import { createEnvSigner } from "./signer/env.js";
import { createBrowserSigner } from "./signer/browser.js";
import { loadPolicy } from "./policy.js";
import { createPolicyGuard } from "./guard/policy-guard.js";
import { createTxLog } from "./log/tx-log.js";
import { registerAddressResource } from "./resources/address.js";
import { registerBalanceResource } from "./resources/balance.js";
import { registerTransactionsResource } from "./resources/transactions.js";
import { registerSendTransaction } from "./tools/send-transaction.js";
import { registerSendToken } from "./tools/send-token.js";
import { registerSignMessage } from "./tools/sign-message.js";
import { registerWithdraw } from "./tools/withdraw.js";
import { startHttpServer } from "./http/server.js";
import {
  WALLET_MODE,
  WALLET_STORE,
  WALLET_DB,
  WALLET_PORT,
} from "./config.js";

// Store
const store =
  WALLET_STORE === "memory"
    ? memoryStore()
    : sqliteStore({ db: new Database(WALLET_DB) });

// Signer
const signer =
  WALLET_MODE === "browser"
    ? createBrowserSigner(WALLET_PORT)
    : createEnvSigner();

const policy = loadPolicy();
const policyGuard = createPolicyGuard(policy, store);
const txLog = createTxLog(store);

const server = createMCPServer({
  name: "vaulx",
  version: "0.2.0",
  store,
});

// Resources
registerAddressResource(server, signer);
registerBalanceResource(server, signer);
registerTransactionsResource(server, txLog);

// Tools
const toolCtx = { signer, policyGuard, txLog };
registerSendTransaction(server, toolCtx);
registerSendToken(server, toolCtx);
registerSignMessage(server, { signer, policyGuard });
registerWithdraw(server, toolCtx);

if (signer.mode === "env") {
  console.error(`[vaulx] Wallet address: ${await signer.getAddress()}`);
} else {
  console.error(`[vaulx] Browser mode — connect wallet via /connect`);
}

// Start both transports
await Promise.all([
  server.stdio(),
  startHttpServer({ signer, policyGuard, txLog }),
]);
