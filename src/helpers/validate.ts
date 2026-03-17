import { VaulxError } from "../errors.js";

/** Validate 0x-prefixed 40 hex char address. Checksum validation is left to viem. */
export function validateAddress(input: string): `0x${string}` {
	if (!/^0x[0-9a-fA-F]{40}$/.test(input)) {
		throw new VaulxError(`Invalid address: ${input}`, "CONFIG_ERROR", { address: input });
	}
	return input as `0x${string}`;
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
