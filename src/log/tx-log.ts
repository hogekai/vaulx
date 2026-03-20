import type { Store } from "@lynq/lynq";

export interface TxRecord {
	hash: string;
	chainId: string;
	to: string;
	value: string;
	token: string;
	operation: string;
	timestamp: string;
	status: "sent" | "confirmed" | "failed";
}

export interface TxLog {
	record(tx: TxRecord): Promise<void>;
	list(): Promise<TxRecord[]>;
	recent(n: number): Promise<TxRecord[]>;
	byChain(chainId: string): Promise<TxRecord[]>;
	byOperation(operation: string): Promise<TxRecord[]>;
	/** Check if same to/value/chainId tx was sent within 10 seconds */
	isDuplicate(params: { to: string; value: string; chainId: string }): Promise<boolean>;
	/** Update tx status by hash */
	updateStatus(hash: string, status: TxRecord["status"]): Promise<void>;
	/** Return txs with status "sent" */
	pending(): Promise<TxRecord[]>;
}

export function createTxLog(store: Store): TxLog {
	return {
		async record(tx: TxRecord): Promise<void> {
			// Append to tx list
			const list = (await store.get<TxRecord[]>("tx-log")) ?? [];
			list.push(tx);
			await store.set("tx-log", list);

			// Update daily spend counter
			const day = tx.timestamp.slice(0, 10);
			const dailyKey = `daily:${tx.chainId}:${day}`;
			const current = BigInt((await store.get<string>(dailyKey)) ?? "0");
			await store.set(dailyKey, (current + BigInt(tx.value)).toString());

			// Update total spend counter (per chain)
			const totalKey = `total-spent:${tx.chainId}`;
			const total = BigInt((await store.get<string>(totalKey)) ?? "0");
			await store.set(totalKey, (total + BigInt(tx.value)).toString());
		},

		async list(): Promise<TxRecord[]> {
			return (await store.get<TxRecord[]>("tx-log")) ?? [];
		},

		async recent(n: number): Promise<TxRecord[]> {
			const all = await this.list();
			return all.slice(-n);
		},

		async byChain(chainId: string): Promise<TxRecord[]> {
			const all = await this.list();
			return all.filter((tx) => tx.chainId === chainId);
		},

		async byOperation(operation: string): Promise<TxRecord[]> {
			const all = await this.list();
			return all.filter((tx) => tx.operation === operation);
		},

		async updateStatus(hash: string, status: TxRecord["status"]): Promise<void> {
			const all = (await store.get<TxRecord[]>("tx-log")) ?? [];
			const idx = all.findIndex((tx) => tx.hash === hash);
			if (idx !== -1) {
				all[idx].status = status;
				await store.set("tx-log", all);
			}
		},

		async pending(): Promise<TxRecord[]> {
			const all = await this.list();
			return all.filter((tx) => tx.status === "sent");
		},

		async isDuplicate(params: { to: string; value: string; chainId: string }): Promise<boolean> {
			const all = await this.list();
			const now = Date.now();
			return all.some(
				(tx) =>
					tx.to === params.to &&
					tx.value === params.value &&
					tx.chainId === params.chainId &&
					now - new Date(tx.timestamp).getTime() < 10_000,
			);
		},
	};
}
