# @vaulx/vaulx

Agent wallet MCP server for EVM chains. Gives Claude Code (or any MCP client) its own wallet — send ETH, check balances, auto-pay via elicitation hooks.

## Quick Start

```bash
npx @vaulx/vaulx init
```

This will:
1. Generate a new wallet (private key stored in `~/.vaulx/.env`, chmod 600)
2. Create a spending policy (`~/.vaulx/wallet-policy.json`)
3. Register the MCP server in `~/.mcp.json` (no secrets — only the `.env` path)
4. Register the auto-payment hook in `~/.claude/settings.json`

Then restart Claude Code — vaulx will auto-connect.

## Fund Your Wallet

After `init`, fund the address shown:

- **Base Sepolia**: https://www.alchemy.com/faucets/base-sepolia
- **Sepolia**: https://www.alchemy.com/faucets/ethereum-sepolia

## MCP Tools

| Tool | Description |
|------|-------------|
| `send_transaction` | Send native ETH |
| `send_token` | Send ERC20 tokens |
| `approve_token` | Approve ERC20 spending (never infinite) |
| `revoke_token` | Revoke ERC20 approval |
| `sign_message` | Sign a message |
| `withdraw` | Withdraw native/ERC20 (full balance support) |
| `get_address` | Wallet address + mode |
| `get_balance` | Native + ERC20 balances |
| `get_transactions` | Transaction history |
| `get_spending` | Daily/total spend + remaining limits |

## MCP Resources

| URI | Description |
|-----|-------------|
| `wallet://address` | Wallet address |
| `wallet://balance` | Balance (default chain) |
| `wallet://balance/{chainId}` | Balance on specific chain |
| `wallet://tokens` | Known tokens |
| `wallet://transactions` | Transaction history |
| `wallet://spending` | Spend limits + usage |
| `wallet://policy` | Current policy config |
| `wallet://chains` | Supported chains |
| `wallet://allowance` | ERC20 allowances |
| `wallet://balances` | All balances |

## HTTP API

Runs on `http://127.0.0.1:18420` alongside the MCP server.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/deposit` | No | Deposit page with faucet links |
| GET | `/address` | Yes | Wallet address |
| GET | `/balance/:chainId` | Yes | Balance |
| POST | `/api/send-transaction` | Yes | Send transaction |

Auth: `Authorization: Bearer {WALLET_AUTH_TOKEN}`.

## Spending Policy

Set via `vaulx init` prompts, or edit `~/.vaulx/wallet-policy.json` directly.

| Field | Description |
|-------|-------------|
| `maxPerTx` | Max wei per transaction |
| `maxPerDay` | Daily spend limit |
| `maxTotal` | Lifetime spend limit |
| `allowedTokens` | Allowed token symbols |
| `allowedRecipients` | Whitelist (empty = no restriction) |
| `blockedRecipients` | Blacklist |
| `allowedOperations` | `send`, `send_token`, `sign`, `withdraw` |
| `expiresAt` | Policy expiry (ISO 8601) |

Default: 0.1 ETH per tx, 0.5 ETH per day.

## Supported Chains

| Chain | ID | Alias |
|-------|----|-------|
| Ethereum | 1 | `ethereum` |
| Base | 8453 | `base` |
| Base Sepolia | 84532 | `base-sepolia` |
| Sepolia | 11155111 | `sepolia` |

## Advanced: Smart Account Mode

```bash
npx @vaulx/vaulx setup
```

Deploys an ERC-4337 smart account with Pimlico paymaster (gas-sponsored). Requires `PIMLICO_API_KEY`.

## Security

- Private key is stored only in `~/.vaulx/.env` (chmod 600)
- `~/.mcp.json` contains the file path, not the key itself
- HTTP server binds to `127.0.0.1` only
- Spending policy enforces per-tx, daily, and total limits
