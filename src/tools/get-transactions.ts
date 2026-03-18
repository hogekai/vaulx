import type { MCPServer } from "@lynq/lynq";
import { z } from "zod";
import type { TxLog } from "../log/tx-log.js";

export function registerGetTransactions(server: MCPServer, txLog: TxLog) {
	server.tool(
		"get_transactions",
		{
			description: "Get transaction history. Returns recent transactions sent by this wallet.",
			input: z.object({
				limit: z
					.number()
					.optional()
					.describe("Number of recent transactions to return (default: all)"),
			}),
		},
		async (args, c) => {
			const records = args.limit ? await txLog.recent(args.limit) : await txLog.list();
			return c.json({ count: records.length, transactions: records });
		},
	);
}
