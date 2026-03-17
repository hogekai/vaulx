import {
	getBundlerUrl,
	getPaymasterUrl,
	PIMLICO_API_KEY,
	PRIVATE_KEY,
	SESSION_KEY,
	SMART_ACCOUNT_ADDRESS,
	WALLET_MODE,
	WALLET_PORT,
} from "../config.js";
import { createBrowserSigner } from "./browser.js";
import { createEnvSigner } from "./env.js";
import { createSessionKeySigner } from "./session-key.js";
import { createSmartAccountSigner } from "./smart-account.js";
import type { Signer } from "./types.js";

export async function createSignerForChain(chainId: number): Promise<Signer> {
	switch (WALLET_MODE) {
		case "env":
			return createEnvSigner();
		case "browser":
			return createBrowserSigner(WALLET_PORT);
		case "smart-account":
			if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY required for smart-account mode");
			return createSmartAccountSigner({
				ownerPrivateKey: PRIVATE_KEY,
				chainId,
				bundlerUrl: getBundlerUrl(chainId),
				paymasterUrl: PIMLICO_API_KEY ? getPaymasterUrl(chainId) : undefined,
			});
		case "session-key":
			if (!SESSION_KEY) throw new Error("SESSION_KEY required for session-key mode");
			if (!SMART_ACCOUNT_ADDRESS)
				throw new Error("SMART_ACCOUNT_ADDRESS required for session-key mode");
			return createSessionKeySigner({
				sessionKey: SESSION_KEY,
				smartAccountAddress: SMART_ACCOUNT_ADDRESS,
				chainId,
				bundlerUrl: getBundlerUrl(chainId),
				paymasterUrl: PIMLICO_API_KEY ? getPaymasterUrl(chainId) : undefined,
			});
	}
}
