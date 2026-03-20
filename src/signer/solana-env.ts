import {
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	sendAndConfirmTransaction,
	Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { getRpcUrl, getSolanaPrivateKey } from "../config.js";
import type { Signer, TxParams } from "./types.js";

export function createSolanaEnvSigner(chainId: string): Signer {
	const secretKeyStr = getSolanaPrivateKey();
	if (!secretKeyStr) {
		throw new Error("SOLANA_PRIVATE_KEY environment variable is required for Solana chains");
	}

	const secretKey = bs58.decode(secretKeyStr);
	const keypair = Keypair.fromSecretKey(secretKey);
	const connection = new Connection(getRpcUrl(chainId));

	return {
		mode: "env",
		hasPaymaster: false,

		async getAddress() {
			return keypair.publicKey.toBase58();
		},

		async sendTransaction(params: TxParams) {
			const tx = new Transaction().add(
				SystemProgram.transfer({
					fromPubkey: keypair.publicKey,
					toPubkey: new PublicKey(params.to),
					lamports: params.value,
				}),
			);

			const sig = await sendAndConfirmTransaction(connection, tx, [keypair]);
			return sig;
		},

		async signMessage(message: string) {
			const nacl = await import("tweetnacl");
			const encoded = new TextEncoder().encode(message);
			const signature = nacl.sign.detached(encoded, keypair.secretKey);
			return bs58.encode(signature);
		},

		async getBalance(_chainId: string) {
			return BigInt(await connection.getBalance(keypair.publicKey));
		},

		async signRawBytes(message: Uint8Array): Promise<Uint8Array> {
			const nacl = await import("tweetnacl");
			return nacl.sign.detached(message, keypair.secretKey);
		},

		getSolanaKeypair() {
			return keypair;
		},
	};
}
