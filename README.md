# vaulx

Agent wallet MCP server for EVM testnets.

Claude Code (or any MCP client) gets its own wallet — send testnet ETH, check balances, auto-pay via elicitation hooks.

## Setup

```bash
npm install
```

Create `.env` (see [.env.example](.env.example)):

```bash
PRIVATE_KEY=0x...            # wallet private key
DEFAULT_CHAIN_ID=84532       # Base Sepolia
```

## Run

```bash
# dev
PRIVATE_KEY=0x... npm run dev

# production
npm run build && PRIVATE_KEY=0x... npm start
```

## Connect to Claude Code

```bash
claude mcp add vaulx -- npx tsx /path/to/vaulx/src/index.ts
```

Environment variables can be passed via MCP config:

```json
{
  "mcpServers": {
    "vaulx": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/vaulx",
      "env": {
        "PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

## MCP Tools

### `send_transaction`

Send native token (ETH) on a testnet.

| Param | Type | Description |
|-------|------|-------------|
| `to` / `recipient` | string | Recipient address |
| `value` / `amount` | string | Amount in ETH (e.g. `"0.01"`) |
| `chainId` / `network` | string \| number | Chain ID or alias (`base-sepolia`, `sepolia`) |
| `token` | string | Token symbol (default: `ETH`) |

Returns `{ hash, chainId, explorer, proof }`.

## MCP Resources

| URI | Description |
|-----|-------------|
| `wallet://address` | Wallet address |
| `wallet://balance/{chainId}` | Native token balance |
| `wallet://transactions` | Transaction history |

## HTTP API

Runs on `http://127.0.0.1:18420` alongside the MCP server.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/deposit` | No | Deposit page with faucet links |
| GET | `/address` | Yes | Wallet address |
| GET | `/balance/:chainId` | Yes | Balance |
| POST | `/api/send-transaction` | Yes | Send transaction (same params as MCP tool) |

Auth: `Authorization: Bearer {WALLET_AUTH_TOKEN}`. Token is auto-generated on startup if not set.

## Elicitation Hook

Auto-pays `agentPayment()` requests from other MCP servers.

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "Elicitation": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "WALLET_URL=http://localhost:18420 WALLET_TOKEN=$VAULX_AUTH_TOKEN node ./hooks/handle-payment.js"
      }]
    }]
  }
}
```

## Spending Policy

Set `WALLET_POLICY=./wallet-policy.json` to enforce limits. See [wallet-policy.example.json](wallet-policy.example.json).

| Field | Description |
|-------|-------------|
| `maxPerTx` | Max wei per transaction |
| `maxPerDay` | Daily spend limit |
| `maxTotal` | Lifetime spend limit |
| `allowedTokens` | Allowed token symbols |
| `allowedRecipients` | Whitelist (empty = no restriction) |
| `blockedRecipients` | Blacklist |
| `allowedOperations` | `send`, `sign`, `withdraw` |
| `expiresAt` | Policy expiry (ISO 8601) |

Default policy: 0.1 ETH per tx, 0.5 ETH per day.

## Supported Chains

| Chain | ID | Alias |
|-------|----|-------|
| Ethereum | 1 | `ethereum` |
| Base | 8453 | `base` |
| Base Sepolia | 84532 | `base-sepolia` |
| Sepolia | 11155111 | `sepolia` |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | Yes | — | Wallet private key |
| `DEFAULT_CHAIN_ID` | No | `84532` | Default chain |
| `RPC_URL` | No | Public RPC | RPC endpoint for default chain |
| `WALLET_PORT` | No | `18420` | HTTP server port |
| `WALLET_AUTH_TOKEN` | No | Auto-generated | HTTP auth token |
| `WALLET_POLICY` | No | Built-in defaults | Policy JSON file path |
| `WITHDRAW_TO` | No | — | Default withdraw address |
