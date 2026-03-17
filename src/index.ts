import { createMCPServer, memoryStore } from "@lynq/lynq";
import { createEnvSigner } from "./signer/env.js";
import { loadPolicy } from "./policy.js";
import { createPolicyGuard } from "./guard/policy-guard.js";
import { createTxLog } from "./log/tx-log.js";
import { registerAddressResource } from "./resources/address.js";
import { registerBalanceResource } from "./resources/balance.js";
import { registerTransactionsResource } from "./resources/transactions.js";
import { registerSendTransaction } from "./tools/send-transaction.js";

const store = memoryStore();
const signer = createEnvSigner();
const policy = loadPolicy();
const policyGuard = createPolicyGuard(policy, store);
const txLog = createTxLog(store);

const server = createMCPServer({
  name: "vaulx",
  version: "0.1.0",
  store,
});

// Resources
registerAddressResource(server, signer);
registerBalanceResource(server, signer);
registerTransactionsResource(server, txLog);

// Tools
registerSendTransaction(server, { signer, policyGuard, txLog });

console.error(`[vaulx] Wallet address: ${signer.address}`);

await server.stdio();
