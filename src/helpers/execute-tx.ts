import type { ChainManager } from "../chain/manager.js";
import { getChain } from "../config.js";
import { VaulxError } from "../errors.js";
import type { PolicyCheckParams, PolicyGuard } from "../guard/policy-guard.js";
import { trackReceipt } from "../log/receipt-tracker.js";
import type { TxLog } from "../log/tx-log.js";
import type { Signer, TxParams } from "../signer/types.js";

export interface ExecuteTxInput {
	operation: string;
	txParams: TxParams;
	token: string;
	/** Extra params for policy check (e.g. slippage) */
	policyExtra?: Partial<PolicyCheckParams>;
}

export interface ExecuteTxDeps {
	signer: Signer;
	policyGuard: PolicyGuard;
	txLog: TxLog;
	chainManager: ChainManager;
}

export interface ExecuteTxResult {
	hash: `0x${string}`;
	chainId: number;
	explorer?: string;
	proof: { type: "tx_hash"; value: string };
}

export async function executeTx(
	input: ExecuteTxInput,
	deps: ExecuteTxDeps,
): Promise<ExecuteTxResult> {
	const { operation, txParams, token, policyExtra } = input;
	const { signer, policyGuard, txLog, chainManager } = deps;

	// 1. Policy check
	const check = await policyGuard.check(operation, {
		value: txParams.value,
		to: txParams.to,
		chainId: txParams.chainId,
		token,
		...policyExtra,
	});
	if (!check.ok) {
		throw new VaulxError(check.reason, "POLICY_VIOLATION", {
			operation,
			to: txParams.to,
			value: txParams.value.toString(),
			chainId: txParams.chainId,
		});
	}

	// 2. Duplicate check
	const dup = await txLog.isDuplicate({
		to: txParams.to,
		value: txParams.value.toString(),
		chainId: txParams.chainId,
	});
	if (dup) {
		throw new VaulxError("Duplicate transaction detected (same params within 10s)", "TX_FAILED");
	}

	// 3. Send
	let hash: `0x${string}`;
	try {
		hash = await signer.sendTransaction(txParams);
	} catch (e) {
		throw new VaulxError(e instanceof Error ? e.message : "Transaction failed", "TX_FAILED", {
			operation,
			to: txParams.to,
			chainId: txParams.chainId,
		});
	}

	// 3. Log
	await txLog.record({
		hash,
		chainId: txParams.chainId,
		to: txParams.to,
		value: txParams.value.toString(),
		token,
		operation,
		timestamp: new Date().toISOString(),
		status: "sent",
	});

	// 5. Track receipt (fire-and-forget)
	trackReceipt(hash, txParams.chainId, { chainManager, txLog });

	// 6. Result
	const chain = getChain(txParams.chainId);
	return {
		hash,
		chainId: txParams.chainId,
		explorer: chain.blockExplorer ? `${chain.blockExplorer}/tx/${hash}` : undefined,
		proof: { type: "tx_hash", value: hash },
	};
}
