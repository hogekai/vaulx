# Changelog

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
