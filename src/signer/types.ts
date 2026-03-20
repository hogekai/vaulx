export interface TxParams {
	to: string;
	value: bigint;
	chainId: string;
	data?: string;
}

export interface Signer {
	readonly mode: string;
	readonly hasPaymaster: boolean;
	getAddress(): Promise<string>;
	sendTransaction(params: TxParams): Promise<string>;
	signMessage(message: string): Promise<string>;
	getBalance(chainId: string): Promise<bigint>;
	/** Sign raw bytes with Ed25519. Solana only. */
	signRawBytes?(message: Uint8Array): Promise<Uint8Array>;
	/** Get the underlying Solana Keypair. Solana only. */
	getSolanaKeypair?(): import("@solana/web3.js").Keypair;
}
