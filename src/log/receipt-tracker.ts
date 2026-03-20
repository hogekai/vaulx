import type { ChainManager } from "../chain/manager.js";
import { isSolanaChain } from "../config.js";
import type { TxLog } from "./tx-log.js";

interface ReceiptTrackerDeps {
	chainManager: ChainManager;
	txLog: TxLog;
}

/**
 * Fire-and-forget receipt polling. Callers should NOT await this.
 * Updates TxLog status to "confirmed" or "failed" once receipt is available.
 */
export function trackReceipt(hash: string, chainId: string, deps: ReceiptTrackerDeps): void {
	const run = async () => {
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
			console.error(`[vaulx] Tx ${hash.slice(0, 10)}... receipt tracking failed`);
		}
	};

	run().catch(() => {});
}
