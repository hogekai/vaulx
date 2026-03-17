import type { Store } from "@lynq/lynq";

export interface TxRecord {
  hash: string;
  chainId: number;
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

      // Update total spend counter
      const total = BigInt(
        (await store.get<string>("total-spent")) ?? "0",
      );
      await store.set("total-spent", (total + BigInt(tx.value)).toString());
    },

    async list(): Promise<TxRecord[]> {
      return (await store.get<TxRecord[]>("tx-log")) ?? [];
    },
  };
}
