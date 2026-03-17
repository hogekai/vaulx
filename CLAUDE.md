# vaulx

Agent wallet MCP server. Gives Claude Code (or any MCP client) its own EVM wallet for testnet transactions. Supports EOA, browser (MetaMask), smart account (ERC-4337), and session key modes.

(lynq: ../lynq)

## Concept

Two transports, one process: MCP tools/resources over stdio for Claude Code, plus a `node:http` REST API on localhost:18420 for elicitation hook auto-payments. Shared state (signer, policy guard, tx log) is assembled in `index.ts` and passed via closures — no singletons.

## Rules

- **ESM only.** `"type": "module"` in package.json.
- **stderr for all diagnostics.** `console.error` only — stdout is reserved for MCP stdio transport.
- **Shared state via closure, not globals.** `index.ts` creates signer/guard/txLog/store and passes them to MCP handlers and HTTP routes as arguments.
- **Policy guard reads, tx log writes.** Guard checks daily spend from store. Only after successful send does txLog update the counter. Prevents phantom accounting on failures.
- **NonceManager resets on failure.** Tracks pending nonce in memory for rapid sends. On tx failure, resets and re-fetches from chain. (EOA mode only)
- **HTTP binds to 127.0.0.1 only.** Never exposed externally.
- **Hook is plain JS.** `hooks/handle-payment.js` — no build step, uses Node 18+ native fetch.
- **agentPayment compat.** `send_transaction` accepts both `to`/`recipient` and `value`/`amount` aliases. Response includes `proof: { type: "tx_hash", value: hash }` for agentPayment passthrough.

## Stack

TypeScript strict · ESM · lynq · viem · permissionless · zod

## Dependencies

`@lynq/lynq`, `@lynq/store-sqlite`, `better-sqlite3`, `permissionless`, `viem`, `zod`

## Wallet Modes

| Mode | WALLET_MODE | Key Required | Gas |
|------|-------------|-------------|-----|
| EOA | `env` | `PRIVATE_KEY` | Self-funded |
| Browser | `browser` | MetaMask | Self-funded |
| Smart Account | `smart-account` | `PRIVATE_KEY` + `PIMLICO_API_KEY` | Paymaster sponsored |
| Session Key | `session-key` | `SESSION_KEY` + `SMART_ACCOUNT_ADDRESS` + `PIMLICO_API_KEY` | Paymaster sponsored |

## Structure

```
src/
├── index.ts                — Entry: wires everything, starts stdio + HTTP
├── config.ts               — Chains, env vars, token registry, Pimlico URL helpers
├── client.ts               — Shared getPublicClient(), getViemChain()
├── policy.ts               — SpendingPolicy zod schema, loadPolicy()
├── signer/
│   ├── types.ts            — Signer interface (mode, hasPaymaster, getAddress, sendTransaction, signMessage, getBalance)
│   ├── env.ts              — EnvSigner: privateKeyToAccount + NonceManager
│   ├── browser.ts          — BrowserSigner: MetaMask confirmation via localhost pages
│   ├── smart-account.ts    — SmartAccountSigner: Kernel + Pimlico bundler/paymaster
│   ├── session-key.ts      — SessionKeySigner: session key → smart account
│   └── factory.ts          — createSignerForChain(): mode-based signer factory
├── errors.ts               — VaulxError class with typed error codes
├── helpers/
│   ├── execute-tx.ts       — executeTx(): policy check → send → log → result
│   └── validate.ts         — validateAddress(), validateAmount()
├── guard/
│   └── policy-guard.ts     — PolicyGuard.check(): maxPerTx, maxPerDay, maxTotal, recipient lists, token check
├── log/
│   ├── tx-log.ts           — TxRecord, record/list/recent/byChain/isDuplicate/updateStatus/pending
│   └── receipt-tracker.ts  — Background receipt polling (fire-and-forget)
├── token/
│   └── registry.ts         — TokenRegistry: resolve/list/resolveByAddress
├── chain/
│   └── manager.ts          — ChainManager: multi-chain signer/client creation
├── tools/
│   ├── send-transaction.ts — MCP tool: native ETH send
│   ├── send-token.ts       — MCP tool: ERC20 send (encodeFunctionData)
│   ├── sign-message.ts     — MCP tool: message signing
│   ├── approve-token.ts    — MCP tool: ERC20 approve (never infinite)
│   ├── revoke-token.ts     — MCP tool: revoke ERC20 approval (approve 0)
│   ├── swap-token.ts       — MCP tool: Uniswap V3 swap (conditional)
│   ├── withdraw.ts         — MCP tool: withdraw native/ERC20 (full balance support)
│   ├── get-address.ts      — MCP tool: wallet address + mode
│   ├── get-balance.ts      — MCP tool: native + ERC20 balances
│   ├── get-transactions.ts — MCP tool: tx history (with optional limit)
│   └── get-spending.ts     — MCP tool: daily/total spend + remaining limits
├── resources/
│   ├── address.ts          — wallet://address
│   ├── balance.ts          — wallet://balance (default chain), wallet://balance/{chainId}
│   ├── tokens.ts           — wallet://tokens, wallet://balance/{chainId}/{token}, wallet://allowance, wallet://balances (default chain + by chain)
│   ├── transactions.ts     — wallet://transactions
│   ├── spending.ts         — wallet://spending (daily/total spend + limits)
│   ├── policy.ts           — wallet://policy (current policy config)
│   └── chains.ts           — wallet://chains
├── http/
│   ├── server.ts           — node:http on 127.0.0.1:18420
│   ├── auth.ts             — Bearer token (env or auto-generated)
│   ├── routes.ts           — REST dispatcher (delegates to handlers/)
│   ├── error.ts            — jsonResponse, htmlResponse, errorResponse helpers
│   ├── deposit.ts          — Deposit page HTML (MetaMask + faucets)
│   ├── handlers/
│   │   ├── pages.ts        — /health, /deposit
│   │   ├── browser.ts      — /connect, /confirm, /sign nonce routes
│   │   └── api.ts          — /address, /balance, /api/send-transaction
│   └── pages/
│       ├── connect.ts      — Wallet connection page
│       ├── confirm.ts      — TX confirmation page
│       └── sign.ts         — Message signing page
├── cli/
│   ├── index.ts            — CLI entry: `vaulx setup`
│   ├── prompts.ts          — readline helpers
│   ├── deploy.ts           — Smart account deployment
│   └── session.ts          — Session key creation
hooks/
└── handle-payment.js       — Elicitation hook: detects [x-lynq-payment:{...}] → calls HTTP API
```

## Env vars

| Variable | Required | Default |
|----------|----------|---------|
| `PRIVATE_KEY` | env/smart-account modes | — |
| `DEFAULT_CHAIN_ID` | No | 84532 (Base Sepolia) |
| `RPC_URL` | No | Public RPC |
| `WALLET_PORT` | No | 18420 |
| `WALLET_AUTH_TOKEN` | No | Auto-generated |
| `WALLET_POLICY` | No | Built-in defaults |
| `WITHDRAW_TO` | No | — |
| `WALLET_MODE` | No | `env` |
| `WALLET_STORE` | No | `sqlite` |
| `WALLET_DB` | No | `./vaulx.db` |
| `PIMLICO_API_KEY` | smart-account/session-key modes | — |
| `SMART_ACCOUNT_ADDRESS` | session-key mode | — |
| `SESSION_KEY` | session-key mode | — |
| `BUNDLER_URL` | No | Auto from Pimlico |
| `PAYMASTER_URL` | No | Auto from Pimlico |

## Supported chains

ethereum (1), base (8453), base-sepolia (84532), sepolia (11155111)

## Dev

```bash
npm run dev          # tsx src/index.ts
npm run build        # tsc
npm start            # node dist/index.js
npm run setup        # tsx src/cli/index.ts setup
```
