import type { ChainManager } from "../chain/manager.js";
import { isSolanaChain } from "../config.js";
import type { TxLog } from "./tx-log.js";

interface ReceiptTrackerDeps {
	chainManager: ChainManager;
	txLog: TxLog;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5_000, 15_000, 30_000];

/**
 * Fire-and-forget receipt polling with retry.
 * Callers should NOT await this.
 * Updates TxLog status to "confirmed" or "failed" once receipt is available.
 */
export function trackReceipt(hash: string, chainId: string, deps: ReceiptTrackerDeps): void {
	const attempt = async (retryCount: number): Promise<void> => {
		try {
			if (isSolanaChain(chainId)) {
				const connection = deps.chainManager.getConnection(chainId);
				const result = await connection.confirmTransaction(hash, "confirmed");
				const status = result.value.err ? "failed" : "confirmed";
				await deps.txLog.updateStatus(hash, status);
				console.error(`[vaulx] Tx ${hash.slice(0, 10)}... → ${status}`);
			} else {
				const client = deps.chainManager.getPublicClient(chainId);
				const receipt = await client.waitForTransactionReceipt({
					hash: hash as `0x${string}`,
					timeout: 120_000,
					pollingInterval: 3_000,
				});
				const status = receipt.status === "success" ? "confirmed" : "failed";
				await deps.txLog.updateStatus(hash, status);
				console.error(`[vaulx] Tx ${hash.slice(0, 10)}... → ${status}`);
			}
		} catch {
			if (retryCount < MAX_RETRIES) {
				const delay = RETRY_DELAYS[retryCount];
				console.error(
					`[vaulx] Tx ${hash.slice(0, 10)}... receipt tracking failed, retry ${retryCount + 1}/${MAX_RETRIES} in ${delay / 1000}s`,
				);
				await new Promise((r) => setTimeout(r, delay));
				return attempt(retryCount + 1);
			}
			console.error(
				`[vaulx] Tx ${hash.slice(0, 10)}... receipt tracking failed after ${MAX_RETRIES} retries`,
			);
		}
	};

	attempt(0).catch(() => {});
}
