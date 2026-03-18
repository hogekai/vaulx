import { execSync } from "node:child_process";
import os from "node:os";

const SERVICE_NAME = "vaulx-wallet";

/**
 * Save private key to OS keychain.
 * macOS: Keychain Access (security command)
 * Linux: libsecret / GNOME Keyring (secret-tool)
 * Returns false if keychain is unavailable or save failed.
 */
export async function saveToKeychain(walletName: string, privateKey: string): Promise<boolean> {
	const platform = os.platform();

	try {
		if (platform === "darwin") {
			// Delete existing entry if present (update)
			try {
				execSync(
					`security delete-generic-password -s "${SERVICE_NAME}" -a "${walletName}" 2>/dev/null`,
					{ stdio: "ignore" },
				);
			} catch {
				/* entry doesn't exist yet */
			}

			execSync(
				`security add-generic-password -s "${SERVICE_NAME}" -a "${walletName}" -w "${privateKey}"`,
				{ stdio: "ignore" },
			);
			return true;
		}

		if (platform === "linux") {
			try {
				execSync("which secret-tool", { stdio: "ignore" });
			} catch {
				return false;
			}

			execSync(
				`echo -n "${privateKey}" | secret-tool store --label="vaulx: ${walletName}" service "${SERVICE_NAME}" wallet "${walletName}"`,
				{ stdio: "ignore" },
			);
			return true;
		}

		return false;
	} catch {
		return false;
	}
}

/**
 * Load private key from OS keychain.
 * Returns null if not found or keychain unavailable.
 */
export async function loadFromKeychain(walletName: string): Promise<string | null> {
	const platform = os.platform();

	try {
		if (platform === "darwin") {
			const result = execSync(
				`security find-generic-password -s "${SERVICE_NAME}" -a "${walletName}" -w`,
				{ encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] },
			);
			return result.trim() || null;
		}

		if (platform === "linux") {
			try {
				execSync("which secret-tool", { stdio: "ignore" });
			} catch {
				return null;
			}

			const result = execSync(
				`secret-tool lookup service "${SERVICE_NAME}" wallet "${walletName}"`,
				{ encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] },
			);
			return result.trim() || null;
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Delete private key from OS keychain.
 */
export async function deleteFromKeychain(walletName: string): Promise<void> {
	const platform = os.platform();

	try {
		if (platform === "darwin") {
			execSync(`security delete-generic-password -s "${SERVICE_NAME}" -a "${walletName}"`, {
				stdio: "ignore",
			});
		} else if (platform === "linux") {
			execSync(`secret-tool clear service "${SERVICE_NAME}" wallet "${walletName}"`, {
				stdio: "ignore",
			});
		}
	} catch {
		/* entry doesn't exist or keychain unavailable */
	}
}

/**
 * Check if OS keychain is available.
 */
export function isKeychainAvailable(): boolean {
	const platform = os.platform();
	try {
		if (platform === "darwin") {
			execSync("security help 2>&1", { stdio: "ignore" });
			return true;
		}
		if (platform === "linux") {
			execSync("which secret-tool", { stdio: "ignore" });
			return true;
		}
		return false;
	} catch {
		return false;
	}
}
