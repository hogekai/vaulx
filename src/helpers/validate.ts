import { isSolanaChain } from "../config.js";
import { VaulxError } from "../errors.js";

/** Validate address for the given chain. EVM: 0x + 40 hex. Solana: Base58. */
export function validateAddress(input: string, chainId?: string): string {
	if (chainId && isSolanaChain(chainId)) {
		// Base58 check: 32-44 characters, valid Base58 alphabet (no 0, O, I, l)
		if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input)) {
			throw new VaulxError(`Invalid Solana address: ${input}`, "CONFIG_ERROR", { address: input });
		}
		return input;
	}
	// EVM: 0x-prefixed 40 hex char address
	if (!/^0x[0-9a-fA-F]{40}$/.test(input)) {
		throw new VaulxError(`Invalid address: ${input}`, "CONFIG_ERROR", { address: input });
	}
	return input;
}

/** Validate numeric string is non-empty, non-negative, non-zero. */
export function validateAmount(input: string, label = "amount"): string {
	if (!input || input.trim() === "") {
		throw new VaulxError(`${label} is empty`, "CONFIG_ERROR");
	}
	const n = Number(input);
	if (Number.isNaN(n) || n < 0) {
		throw new VaulxError(
			`Invalid ${label}: ${input} (must be non-negative number)`,
			"CONFIG_ERROR",
			{
				value: input,
			},
		);
	}
	if (n === 0) {
		throw new VaulxError(`${label} is zero`, "POLICY_VIOLATION");
	}
	return input;
}
