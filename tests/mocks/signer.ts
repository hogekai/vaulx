import type { Keypair } from "@solana/web3.js";
import type { Signer, TxParams } from "../../src/signer/types.js";

export interface MockSignerOptions {
	address?: string;
	balance?: bigint;
	mode?: Signer["mode"];
	hasPaymaster?: boolean;
	sendError?: Error;
	calls?: TxParams[];
	/** Enable signRawBytes support (for Solana mock) */
	solanaKeypair?: Keypair;
}

const DEFAULT_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

export function createMockSigner(options: MockSignerOptions = {}): Signer {
	const calls = options.calls ?? [];
	let _callCount = 0;

	const signer: Signer = {
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

		async getBalance(_chainId: string) {
			return options.balance ?? 1_000_000_000_000_000_000n;
		},
	};

	if (options.solanaKeypair) {
		signer.signRawBytes = async (message: Uint8Array): Promise<Uint8Array> => {
			const nacl = await import("tweetnacl");
			return nacl.sign.detached(message, options.solanaKeypair!.secretKey);
		};
		signer.getSolanaKeypair = () => options.solanaKeypair!;
	}

	return signer;
}
