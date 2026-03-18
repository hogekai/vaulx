import type { Signer, TxParams } from "../../src/signer/types.js";

export interface MockSignerOptions {
	address?: `0x${string}`;
	balance?: bigint;
	mode?: Signer["mode"];
	hasPaymaster?: boolean;
	sendError?: Error;
	calls?: TxParams[];
}

const DEFAULT_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

export function createMockSigner(options: MockSignerOptions = {}): Signer {
	const calls = options.calls ?? [];
	let _callCount = 0;

	return {
		mode: options.mode ?? "env",
		hasPaymaster: options.hasPaymaster ?? false,

		async getAddress() {
			return options.address ?? DEFAULT_ADDRESS;
		},

		async sendTransaction(params: TxParams) {
			calls.push(params);
			_callCount++;
			if (options.sendError) throw options.sendError;
			return `0x${"ab".repeat(32)}` as `0x${string}`;
		},

		async signMessage(_message: string) {
			return `0x${"cd".repeat(65)}` as `0x${string}`;
		},

		async getBalance(_chainId: number) {
			return options.balance ?? 1_000_000_000_000_000_000n;
		},
	};
}
