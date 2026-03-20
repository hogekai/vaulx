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
}
