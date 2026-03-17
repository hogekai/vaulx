import type { IncomingMessage, ServerResponse } from "node:http";
import { formatEther, parseEther } from "viem";
import { resolveChainId, getChain, DEFAULT_CHAIN_ID } from "../config.js";
import type { PolicyGuard } from "../guard/policy-guard.js";
import type { TxLog } from "../log/tx-log.js";
import type { Signer } from "../signer/types.js";
import { validateAuth } from "./auth.js";
import { depositPage } from "./deposit.js";

export interface WalletContext {
  signer: Signer;
  policyGuard: PolicyGuard;
  txLog: TxLog;
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown,
) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function htmlResponse(res: ServerResponse, html: string) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WalletContext,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  // Health check — no auth
  if (method === "GET" && path === "/health") {
    jsonResponse(res, 200, {
      status: "ok",
      address: ctx.signer.address,
    });
    return;
  }

  // Deposit page — no auth
  if (method === "GET" && path === "/deposit") {
    htmlResponse(res, depositPage(ctx.signer.address, DEFAULT_CHAIN_ID));
    return;
  }

  // All other routes require auth
  if (!validateAuth(req)) {
    jsonResponse(res, 401, { error: "Unauthorized" });
    return;
  }

  // GET /address
  if (method === "GET" && path === "/address") {
    jsonResponse(res, 200, { address: ctx.signer.address });
    return;
  }

  // GET /balance/:chainId
  const balanceMatch = path.match(/^\/balance\/(\d+)$/);
  if (method === "GET" && balanceMatch) {
    const chainId = Number(balanceMatch[1]);
    try {
      const chain = getChain(chainId);
      const balance = await ctx.signer.getBalance(chainId);
      jsonResponse(res, 200, {
        chainId,
        network: chain.name,
        balance: formatEther(balance),
        symbol: chain.nativeCurrency.symbol,
      });
    } catch (err) {
      jsonResponse(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  // POST /api/send-transaction
  if (method === "POST" && path === "/api/send-transaction") {
    try {
      const body = (await parseBody(req)) as Record<string, unknown>;

      const to = ((body.to ?? body.recipient) as string) as `0x${string}`;
      const ethValue = (body.value ?? body.amount) as string;
      if (!to || !ethValue) {
        jsonResponse(res, 400, {
          error: "Missing required fields: to/recipient, value/amount",
        });
        return;
      }

      const chainId = resolveChainId(
        (body.chainId ?? body.network ?? DEFAULT_CHAIN_ID) as
          | string
          | number,
      );
      const value = parseEther(ethValue);
      const token = (body.token as string) ?? "ETH";

      // Balance check
      const balance = await ctx.signer.getBalance(chainId);
      if (balance < value) {
        jsonResponse(res, 400, {
          error: `Insufficient balance. Have: ${formatEther(balance)} ETH, Need: ${ethValue} ETH`,
        });
        return;
      }

      // Policy check
      const check = await ctx.policyGuard.check("send", {
        value,
        to,
        chainId,
      });
      if (!check.ok) {
        jsonResponse(res, 403, {
          error: `Policy rejected: ${check.reason}`,
        });
        return;
      }

      // Send
      const hash = await ctx.signer.sendTransaction({
        to,
        value,
        chainId,
      });

      // Log
      await ctx.txLog.record({
        hash,
        chainId,
        to,
        value: value.toString(),
        token,
        operation: "send",
        timestamp: new Date().toISOString(),
        status: "sent",
      });

      const chain = getChain(chainId);
      jsonResponse(res, 200, {
        hash,
        chainId,
        explorer: chain.blockExplorer
          ? `${chain.blockExplorer}/tx/${hash}`
          : undefined,
        proof: { type: "tx_hash", value: hash },
      });
    } catch (err) {
      jsonResponse(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  // 404
  jsonResponse(res, 404, { error: "Not found" });
}
