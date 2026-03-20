import {
	getBundlerUrl,
	getPaymasterUrl,
	getPimlicoApiKey,
	getPrivateKey,
	getSessionKey,
	getSmartAccountAddress,
	getWalletMode,
	isSolanaChain,
	WALLET_PORT,
} from "../config.js";
import { createBrowserSigner } from "./browser.js";
import { createEnvSigner } from "./env.js";
import { createSessionKeySigner } from "./session-key.js";
import { createSmartAccountSigner } from "./smart-account.js";
import type { Signer } from "./types.js";

export async function createSignerForChain(chainId: string): Promise<Signer> {
	if (isSolanaChain(chainId)) {
		const { createSolanaEnvSigner } = await import("./solana-env.js");
		return createSolanaEnvSigner(chainId);
	}

	const mode = getWalletMode();
	switch (mode) {
		case "env":
			return createEnvSigner();
		case "browser":
			return createBrowserSigner(WALLET_PORT);
		case "smart-account": {
			const privateKey = getPrivateKey();
			if (!privateKey) throw new Error("PRIVATE_KEY required for smart-account mode");
			const pimlicoKey = getPimlicoApiKey();
			return createSmartAccountSigner({
				ownerPrivateKey: privateKey,
				chainId,
				bundlerUrl: getBundlerUrl(chainId),
				paymasterUrl: pimlicoKey ? getPaymasterUrl(chainId) : undefined,
			});
		}
		case "session-key": {
			const sessionKey = getSessionKey();
			if (!sessionKey) throw new Error("SESSION_KEY required for session-key mode");
			const smartAccountAddress = getSmartAccountAddress();
			if (!smartAccountAddress)
				throw new Error("SMART_ACCOUNT_ADDRESS required for session-key mode");
			const pimlicoKey = getPimlicoApiKey();
			return createSessionKeySigner({
				sessionKey,
				smartAccountAddress,
				chainId,
				bundlerUrl: getBundlerUrl(chainId),
				paymasterUrl: pimlicoKey ? getPaymasterUrl(chainId) : undefined,
			});
		}
	}
}
