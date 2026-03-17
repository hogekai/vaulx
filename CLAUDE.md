# vaulx

Agent wallet MCP server. Gives Claude Code (or any MCP client) its own EVM wallet for testnet transactions.

## Concept

Two transports, one process: MCP tools/resources over stdio for Claude Code, plus a `node:http` REST API on localhost:18420 for elicitation hook auto-payments. Shared state (signer, policy guard, tx log) is assembled in `index.ts` and passed via closures — no singletons.

## Rules

- **3 dependencies only.** `@lynq/lynq`, `viem`, `zod`. No exceptions.
- **ESM only.** `"type": "module"` in package.json.
- **stderr for all diagnostics.** `console.error` only — stdout is reserved for MCP stdio transport.
- **Shared state via closure, not globals.** `index.ts` creates signer/guard/txLog/store and passes them to MCP handlers and HTTP routes as arguments.
- **Policy guard reads, tx log writes.** Guard checks daily spend from store. Only after successful send does txLog update the counter. Prevents phantom accounting on failures.
- **NonceManager resets on failure.** Tracks pending nonce in memory for rapid sends. On tx failure, resets and re-fetches from chain.
- **HTTP binds to 127.0.0.1 only.** Never exposed externally.
- **Hook is plain JS.** `hooks/handle-payment.js` — no build step, uses Node 18+ native fetch.
- **agentPayment compat.** `send_transaction` accepts both `to`/`recipient` and `value`/`amount` aliases. Response includes `proof: { type: "tx_hash", value: hash }` for agentPayment passthrough.

## Stack

TypeScript strict · ESM · lynq · viem · zod

## Structure

```
src/
├── index.ts                — Entry: wires everything, starts stdio + HTTP
├── config.ts               — Chains, env vars, NETWORK_ALIASES, resolveChainId()
├── policy.ts               — SpendingPolicy zod schema, loadPolicy()
├── signer/
│   ├── types.ts            — Signer interface, TxParams
│   └── env.ts              — EnvSigner: privateKeyToAccount + NonceManager
├── guard/
│   └── policy-guard.ts     — PolicyGuard.check(): maxPerTx, maxPerDay, maxTotal, recipient lists
├── log/
│   └── tx-log.ts           — TxRecord, record() + list() via memoryStore
├── tools/
│   └── send-transaction.ts — MCP tool: normalize → gas check → policy → sign → log → respond
├── resources/
│   ├── address.ts          — wallet://address
│   ├── balance.ts          — wallet://balance/{chainId}
│   └── transactions.ts     — wallet://transactions
└── http/
    ├── server.ts           — node:http on 127.0.0.1:18420
    ├── auth.ts             — Bearer token (env or auto-generated)
    ├── routes.ts           — REST dispatcher: /health, /address, /balance/:chainId, /api/send-transaction, /deposit
    └── deposit.ts          — Deposit page HTML
hooks/
└── handle-payment.js       — Elicitation hook: detects [x-lynq-payment:{...}] → calls HTTP API
```

## Env vars

| Variable | Required | Default |
|----------|----------|---------|
| `PRIVATE_KEY` | Yes | — |
| `DEFAULT_CHAIN_ID` | No | 84532 (Base Sepolia) |
| `RPC_URL` | No | Public RPC |
| `WALLET_PORT` | No | 18420 |
| `WALLET_AUTH_TOKEN` | No | Auto-generated |
| `WALLET_POLICY` | No | Built-in defaults |
| `WITHDRAW_TO` | No | — |

## Supported chains

ethereum (1), base (8453), base-sepolia (84532), sepolia (11155111)

## Dev

```bash
npm run dev          # tsx src/index.ts
npm run build        # tsc
npm start            # node dist/index.js
```
