# vaulx

Agent wallet MCP server. Gives Claude Code (or any MCP client) its own wallet for EVM and Solana chains. Supports EOA, browser (MetaMask), smart account (ERC-4337), and session key modes on EVM; env mode on Solana.

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
- **APP compat.** `send_transaction` accepts both `to`/`recipient` and `value`/`amount` aliases. Response includes `proof: { type: "tx_hash", value: hash }` for Agent Payment Protocol passthrough.
- **Chain ID is string.** EVM chains use numeric strings (`"84532"`), Solana uses cluster names (`"solana-devnet"`). `isSolanaChain(chainId)` checks prefix. EVM libs get numeric IDs via `numericChainId()`.
- **Solana tools use dynamic imports.** `@solana/web3.js` and `@solana/spl-token` are imported at call time to avoid loading when unused. Pattern: build Transaction → sign with Keypair → `connection.sendRawTransaction()` → `txLog.record()` → `trackReceipt()`.
- **Jupiter for Solana swaps.** REST API at `https://quote-api.jup.ag/v6` — no API key. Returns VersionedTransaction to sign and send.

## Protocol

vaulx implements the Agent Payment Protocol (APP).
See: https://github.com/hogekai/agent-payment-protocol

- Discovery tag: `[x-agent-payment:{...}]` (legacy `[x-lynq-payment:{...}]` also detected)
- Payment proof format: `{ type: "tx_hash" | "signature", value: "0x..." }`
- Spending policy: `wallet-policy.json` conforms to APP SpendingPolicy schema

## Stack

TypeScript strict · ESM · lynq · viem · permissionless · @solana/web3.js · @solana/spl-token · zod

## Dependencies

`@lynq/lynq`, `@lynq/store-sqlite`, `better-sqlite3`, `permissionless`, `viem`, `@solana/web3.js`, `@solana/spl-token`, `bs58`, `tweetnacl`, `zod`

## Wallet Modes

| Mode | WALLET_MODE | Key Required | Gas | Chains |
|------|-------------|-------------|-----|--------|
| EOA | `env` | `PRIVATE_KEY` | Self-funded | EVM |
| Browser | `browser` | MetaMask | Self-funded | EVM |
| Smart Account | `smart-account` | `PRIVATE_KEY` + `PIMLICO_API_KEY` | Paymaster sponsored | EVM |
| Session Key | `session-key` | `SESSION_KEY` + `SMART_ACCOUNT_ADDRESS` + `PIMLICO_API_KEY` | Paymaster sponsored | EVM |
| Solana EOA | `env` | `SOLANA_PRIVATE_KEY` | Self-funded | Solana |

## Structure

```
src/
├── index.ts                — Entry: wires everything, starts stdio + HTTP
├── config.ts               — Chains, env vars, token registry, Pimlico URL helpers
├── client.ts               — Shared getPublicClient(), getViemChain()
├── policy.ts               — SpendingPolicy zod schema, loadPolicy()
├── signer/
│   ├── types.ts            — Signer interface (mode, hasPaymaster, getAddress, sendTransaction, signMessage, getBalance)
│   ├── env.ts              — EnvSigner: privateKeyToAccount + NonceManager (EVM)
│   ├── solana-env.ts       — SolanaEnvSigner: Keypair + SystemProgram.transfer
│   ├── browser.ts          — BrowserSigner: MetaMask confirmation via localhost pages
│   ├── smart-account.ts    — SmartAccountSigner: Kernel + Pimlico bundler/paymaster
│   ├── session-key.ts      — SessionKeySigner: session key → smart account
│   └── factory.ts          — createSignerForChain(): mode-based signer factory (routes Solana/EVM)
├── errors.ts               — VaulxError class with typed error codes
├── helpers/
│   ├── execute-tx.ts       — executeTx(): policy check → send → log → result
│   └── validate.ts         — validateAddress(input, chainId?), validateAmount()
├── guard/
│   └── policy-guard.ts     — PolicyGuard.check(): maxPerTx, maxPerDay, maxTotal, recipient lists, token check
├── log/
│   ├── tx-log.ts           — TxRecord, record/list/recent/byChain/isDuplicate/updateStatus/pending
│   └── receipt-tracker.ts  — Background receipt polling (fire-and-forget)
├── token/
│   └── registry.ts         — TokenRegistry: resolve/list/resolveByAddress
├── chain/
│   └── manager.ts          — ChainManager: multi-chain signer/client/connection creation
├── tools/
│   ├── send-transaction.ts — MCP tool: native send (ETH/SOL)
│   ├── send-token.ts       — MCP tool: token send (ERC20/SPL)
│   ├── sign-message.ts     — MCP tool: message signing
│   ├── approve-token.ts    — MCP tool: token approve (ERC20 approve / SPL delegate)
│   ├── revoke-token.ts     — MCP tool: revoke approval (ERC20 / SPL delegate)
│   ├── swap-token.ts       — MCP tool: token swap (Uniswap V3 / Jupiter)
│   ├── withdraw.ts         — MCP tool: withdraw native/tokens (full balance support)
│   ├── get-address.ts      — MCP tool: wallet address + mode
│   ├── get-balance.ts      — MCP tool: native + token balances
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
│   ├── index.ts            — CLI entry: init/list/switch/delete/active/setup
│   ├── init.ts             — Wallet creation (--name, keychain, wallets/ dirs)
│   ├── wallet-manager.ts   — config.json CRUD, wallet dirs, migration
│   ├── keychain.ts         — OS keychain save/load/delete (macOS + Linux)
│   ├── register.ts         — MCP + hook registration (wallet-aware paths)
│   ├── prompts.ts          — readline helpers
│   ├── qr.ts               — Address display box
│   ├── deploy.ts           — Smart account deployment
│   └── session.ts          — Session key creation
hooks/
└── handle-payment.js       — Elicitation hook: detects [x-agent-payment:{...}] → calls HTTP API
```

## Env vars

| Variable | Required | Default |
|----------|----------|---------|
| `PRIVATE_KEY` | env/smart-account modes (EVM) | — |
| `SOLANA_PRIVATE_KEY` | Solana env mode | — |
| `DEFAULT_CHAIN_ID` | No | `84532` (Base Sepolia) |
| `RPC_URL` | No | Public RPC (EVM) |
| `SOLANA_RPC_URL` | No | Public RPC (Solana) |
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
| `WALLET_ADDRESS` | No | Set by `vaulx init` |
| `VAULX_WALLET_NAME` | No | Set by `vaulx init` |

## Multi-Wallet

Each wallet lives in `~/.vaulx/wallets/{name}/` with its own `.env`, `wallet-policy.json`, and `vaulx.db`. The active wallet is tracked in `~/.vaulx/config.json`:

```json
{ "active": "default", "keyStorage": "keychain" }
```

`keyStorage` controls where private keys are stored: `"keychain"` (OS keychain, default) or `"file"` (.env fallback).

### CLI

```bash
vaulx init [--name <n>]    # Create wallet (default: "default")
vaulx list                 # List all wallets
vaulx switch <name>        # Switch active wallet
vaulx delete <name>        # Delete wallet (not "default")
vaulx active               # Show active wallet name
vaulx setup                # Deploy smart account (advanced)
```

## Supported chains

EVM: ethereum (1), base (8453), base-sepolia (84532), sepolia (11155111)
Solana: solana, solana-devnet

## Dev

```bash
npm run dev          # tsx src/index.ts
npm run build        # tsc
npm start            # node dist/index.js
npm run setup        # tsx src/cli/index.ts setup
```
