export interface TxParams {
  to: `0x${string}`;
  value: bigint;
  chainId: number;
  data?: `0x${string}`;
}

export interface Signer {
  readonly mode: "env" | "browser" | "smart-account" | "session-key";
  readonly hasPaymaster: boolean;
  getAddress(): Promise<`0x${string}`>;
  sendTransaction(params: TxParams): Promise<`0x${string}`>;
  signMessage(message: string): Promise<`0x${string}`>;
  getBalance(chainId: number): Promise<bigint>;
}
