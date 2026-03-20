# @vaulx/vaulx

Agent wallet MCP server implementing the [Agent Payment Protocol](https://github.com/agentprotocols/agent-payment-protocol). Gives Claude Code (or any MCP client) its own wallet — send ETH/SOL, swap tokens, check balances, auto-pay via APP-compliant elicitation hooks.

Supports EVM chains (Ethereum, Base, Sepolia) and Solana (mainnet, devnet).

## Quick Start

```bash
npx @vaulx/vaulx init
```

This will:
1. Generate a new wallet (private key stored in OS keychain or `~/.vaulx/wallets/default/.env`)
2. Create a spending policy (`~/.vaulx/wallets/default/wallet-policy.json`)
3. Register the MCP server in `~/.mcp.json` (no secrets — only the `.env` path)
4. Register the auto-payment hook in `~/.claude/settings.json`

Then restart Claude Code — vaulx will auto-connect.

### Solana Wallet

```bash
npx @vaulx/vaulx init --chain solana-devnet
```

Generates a Solana keypair (Ed25519) and stores it as `SOLANA_PRIVATE_KEY`.

## Supported Chains

| Chain | ID | Alias | Native |
|-------|----|-------|--------|
| Ethereum | `1` | `ethereum` | ETH |
| Base | `8453` | `base` | ETH |
| Base Sepolia | `84532` | `base-sepolia` | ETH |
| Sepolia | `11155111` | `sepolia` | ETH |
| Solana | `solana` | `solana` | SOL |
| Solana Devnet | `solana-devnet` | `solana-devnet` | SOL |

## Multi-Wallet

Create and manage multiple isolated wallets:

```bash
npx @vaulx/vaulx init --name defi       # Create named wallet
npx @vaulx/vaulx init --name sol --chain solana-devnet  # Solana wallet
npx @vaulx/vaulx list                   # List all wallets
npx @vaulx/vaulx switch defi            # Switch active wallet
npx @vaulx/vaulx active                 # Show active wallet
npx @vaulx/vaulx delete defi            # Delete wallet
```

Each wallet has its own `.env`, spending policy, and transaction database under `~/.vaulx/wallets/{name}/`.

### Interactive Mode

Run `vaulx` without arguments to get an interactive menu:

```bash
npx @vaulx/vaulx

# vaulx — Agent Wallet Manager
#
# ? What do you want to do?
#   1. Create new wallet (init)
#   2. List wallets
#   3. Switch wallet
#   ...
```

### MCP Wallet Management

Manage wallets directly from Claude Code — no terminal needed:

| Tool | Description |
|------|-------------|
| `list_wallets` | List all wallets with addresses and active status |
| `switch_wallet` | Hot-swap active wallet (no server restart) |
| `create_wallet` | Generate a new wallet and optionally switch to it |

## Fund Your Wallet

After `init`, fund the address shown:

**EVM Testnets:**
- **Base Sepolia**: https://www.alchemy.com/faucets/base-sepolia
- **Sepolia**: https://www.alchemy.com/faucets/ethereum-sepolia

**Solana Devnet:**
- https://faucet.solana.com

## MCP Tools

| Tool | Description | EVM | Solana |
|------|-------------|-----|--------|
| `send_transaction` | Send native token (ETH/SOL) | ✓ | ✓ |
| `send_token` | Send tokens (ERC20/SPL) | ✓ | ✓ |
| `approve_token` | Approve spending (ERC20 approve / SPL delegate) | ✓ | ✓ |
| `revoke_token` | Revoke approval (ERC20 / SPL delegate) | ✓ | ✓ |
| `swap_token` | Swap tokens (Uniswap V3 / Jupiter) | ✓ | ✓ |
| `sign_message` | Sign a message | ✓ | ✓ |
| `withdraw` | Withdraw native/tokens (full balance support) | ✓ | ✓ |
| `get_address` | Wallet address + mode | ✓ | ✓ |
| `get_balance` | Native + token balances | ✓ | ✓ |
| `get_transactions` | Transaction history | ✓ | ✓ |
| `get_spending` | Daily/total spend + remaining limits | ✓ | ✓ |
| `list_wallets` | List all wallets with active status | ✓ | ✓ |
| `switch_wallet` | Hot-swap active wallet (no restart) | ✓ | ✓ |
| `create_wallet` | Generate new wallet | ✓ | ✓ |

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
| `wallet://allowance` | Token allowances |
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

Conforms to the [Agent Payment Protocol Spending Policy](https://github.com/agentprotocols/agent-payment-protocol/blob/main/spec.md#5-spending-policy) schema. Set via `vaulx init` prompts, or edit `~/.vaulx/wallets/{name}/wallet-policy.json` directly.

| Field | Description |
|-------|-------------|
| `maxPerTx` | Max per transaction (smallest unit: wei/lamports) |
| `maxPerDay` | Daily spend limit |
| `maxTotal` | Lifetime spend limit |
| `allowedTokens` | Allowed token symbols (e.g. `["ETH"]`, `["SOL", "USDC"]`) |
| `allowedRecipients` | Whitelist (empty = no restriction) |
| `blockedRecipients` | Blacklist |
| `allowedOperations` | `send`, `send_token`, `sign`, `withdraw`, `approve`, `swap` |
| `expiresAt` | Policy expiry (ISO 8601) |
| `chainOverrides` | Per-chain policy overrides (see below) |

Default: 0.1 ETH per tx, 0.5 ETH per day (EVM). Solana init defaults to 1 SOL per tx, 5 SOL per day.

### Chain-specific Policy Overrides

Use `chainOverrides` to set different limits per chain:

```json
{
  "maxPerTx": "100000000000000000",
  "allowedTokens": ["ETH"],
  "chainOverrides": {
    "solana-devnet": {
      "maxPerTx": "1000000000",
      "allowedTokens": ["SOL", "USDC"]
    }
  }
}
```

## Advanced: Smart Account Mode

```bash
npx @vaulx/vaulx setup
```

Deploys an ERC-4337 smart account with Pimlico paymaster (gas-sponsored). Requires `PIMLICO_API_KEY`. EVM only.

## Auto-Payment Hook

`hooks/handle-payment.js` is a Claude Code elicitation hook that implements the [Agent Payment Protocol](https://github.com/agentprotocols/agent-payment-protocol). When a server requests payment via the `[x-agent-payment:{...}]` discovery tag, vaulx automatically detects the request, evaluates the spending policy, and pays on behalf of the agent.

Compatible with any MCP server that issues APP-compliant payment requests, including [lynq](https://github.com/hogekai/lynq)'s `agentPayment()` middleware. The legacy `[x-lynq-payment:{...}]` tag is still detected for backward compatibility.

> **Extensibility:** Payment detection is isolated in `detectPayment()` (`hooks/handle-payment.js`). To support a non-APP payment protocol, swap this single function.

## Security

- Private key is stored in OS keychain (macOS Keychain / Linux libsecret) by default
- Falls back to `~/.vaulx/wallets/{name}/.env` (chmod 600) when keychain is unavailable
- `~/.mcp.json` contains the file path, not the key itself
- HTTP server binds to `127.0.0.1` only
- Spending policy enforces per-tx, daily, and total limits
