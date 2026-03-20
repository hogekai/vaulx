# Changelog

## [0.7.1] - 2026-03-20

### Fixed
- Add async mutex to `executeTx` preventing concurrent policy check bypass via interleaved awaits
- Abort EVM swap on quote failure instead of proceeding with `amountOutMinimum=0` (MEV protection)
- Route swap auto-approve through `executeTx` for proper policy check, logging, and duplicate detection
- Pass actual token amount to policy check in ERC20 `send_token` and `withdraw` (was passing `0n`)
- Add duplicate detection to Solana SPL send and Jupiter swap paths
- Add retry with backoff to receipt tracking (was silently swallowing all errors)
- Replace float-based Solana amount parsing with string-based `parseTokenUnits` to avoid precision loss

### Changed
- `withdraw` tool now requires explicit `fullBalance: true` flag when omitting amount
- Agent Payment Protocol link updated to `agentprotocols` GitHub org

## [0.7.0] - 2026-03-20

### Added
- Solana chain support (mainnet + devnet) alongside existing EVM chains
- Solana signer (`solana-env.ts`): Ed25519 keypair, SOL transfer, message signing
- SPL token support: send, approve (delegate), revoke, balance queries
- Jupiter DEX integration for Solana token swaps (quote + swap API, VersionedTransaction)
- Solana address validation (Base58) in `validateAddress()`
- `chainOverrides` in spending policy for per-chain limits (e.g. different maxPerTx for SOL vs ETH)
- `SOLANA_PRIVATE_KEY`, `SOLANA_RPC_URL` environment variables
- Solana Devnet faucet link in CLI init and deposit page
- SPL token registry entries (USDC, USDT on solana/solana-devnet)

### Changed
- Chain ID unified as string across codebase: EVM uses `"84532"`, Solana uses `"solana-devnet"`
- Signer interface generalized: `0x${string}` types → `string` for chain-agnostic compatibility
- `ChainManager` gains `getConnection()` for Solana RPC alongside `getPublicClient()` for EVM
- `total-spent` store key changed to per-chain (`total-spent:{chainId}`) to prevent cross-chain unit mixing
- Tool descriptions updated to reflect multi-chain support
- README and CLAUDE.md updated with Solana docs, chain matrix, and architecture notes

## [0.6.0] - 2026-03-20

### Added
- MCP wallet management tools: `list_wallets`, `switch_wallet`, `create_wallet` — manage wallets directly from Claude Code
- Interactive CLI menu when running `vaulx` without arguments

### Changed
- Adopt Agent Payment Protocol (APP): discovery tag changed from `x-lynq-payment` to `x-agent-payment` (legacy tag still detected for backward compatibility)
- Docs updated to reference APP spec throughout (README, CLAUDE.md)

## [0.5.2] - 2026-03-18

### Changed
- `/release` command now automates tag push and GitHub Release creation

### Fixed
- Add `repository` field to package.json for npm provenance verification

## [0.5.0] - 2026-03-18

### Added
- Multi-wallet support with `vaulx init/list/switch/delete/active` CLI commands
- OS keychain integration for private key storage (macOS Keychain / Linux secret-tool)
- `get_onchain_history` tool for block explorer transaction history
- Comprehensive test suite (unit + integration) with testability refactors
- npm publish workflow (GitHub Release → CI → npm publish with provenance)

### Changed
- Package renamed to `@vaulx/vaulx`
- Wallet state moved to `~/.vaulx/` for global sharing
- Comments and docs switched from Japanese to English
- Upgraded `@lynq/lynq` to 0.12.0

### Fixed
- Keychain save hang caused by `-T ""` flag in MCP server context

## [0.4.0]

### Added
- `revoke_token` tool to reset ERC20 approvals to zero
- `wallet://allowance` and `wallet://balances` resources
- Transaction receipt tracking with background status updates
- Spending/policy resources and signer factory extraction
- Read-only tools, Zod schema serialization fix, hardened HTTP startup

### Changed
- Unified all tools with `executeTx`, `VaulxError`, and input validation
- Extended TxLog with duplicate check, split HTTP routes into handlers
- Added CI workflow and cleaned lint warnings to zero

## [0.3.0]

### Added
- Smart account (ERC-4337), session key, and multi-chain support
- Token registry and DeFi tools (swap via Uniswap V3)
- ERC20 tools (`send_token`, `approve_token`), browser wallet mode, SQLite persistence

## [0.2.0]

### Added
- HTTP layer for elicitation hook auto-payments
- `handle-payment.js` hook for `[x-lynq-payment:{...}]` detection

## [0.1.0]

### Added
- Initial release: EOA wallet signer, `send_transaction`, MCP stdio transport
