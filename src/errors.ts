export type VaulxErrorCode =
	| "INSUFFICIENT_BALANCE"
	| "INSUFFICIENT_GAS"
	| "POLICY_VIOLATION"
	| "POLICY_EXPIRED"
	| "UNKNOWN_TOKEN"
	| "UNKNOWN_CHAIN"
	| "UNSUPPORTED_OPERATION"
	| "SIGNER_ERROR"
	| "TX_FAILED"
	| "TX_TIMEOUT"
	| "TX_REVERTED"
	| "NONCE_ERROR"
	| "AUTH_FAILED"
	| "CONFIG_ERROR"
	| "SESSION_EXPIRED"
	| "APPROVAL_EXCEEDED"
	| "SLIPPAGE_EXCEEDED"
	| "RPC_ERROR"
	| "BUNDLER_ERROR"
	| "EXPLORER_ERROR";

export class VaulxError extends Error {
	constructor(
		message: string,
		public readonly code: VaulxErrorCode,
		public readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "VaulxError";
	}
}
