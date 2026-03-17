import type { MCPServer } from "@lynq/lynq";
import type { TxLog } from "../log/tx-log.js";

export function registerTransactionsResource(
  server: MCPServer,
  txLog: TxLog,
) {
  server.resource("wallet://transactions", {
    name: "Transaction History",
    description: "All transactions sent by this wallet",
    mimeType: "application/json",
  }, async () => {
    const records = await txLog.list();
    return { text: JSON.stringify(records) };
  });
}
