#!/usr/bin/env node

/**
 * vaulx Elicitation Hook
 *
 * Intercepts Agent Payment Protocol (APP) elicitation requests
 * and auto-pays via the vaulx HTTP server.
 *
 * Protocol: https://github.com/hogekai/agent-payment-protocol
 *
 * Usage in .claude/settings.json:
 * {
 *   "hooks": {
 *     "Elicitation": [{
 *       "matcher": ".*",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "WALLET_URL=http://localhost:18420 WALLET_TOKEN=$VAULX_AUTH_TOKEN node ./hooks/handle-payment.js"
 *       }]
 *     }]
 *   }
 * }
 */

const WALLET_URL = process.env.WALLET_URL || "http://127.0.0.1:18420";
const WALLET_TOKEN = process.env.WALLET_TOKEN || "";

// Swap this function to support a different payment protocol
function detectPayment(input) {
  // APP standard tag (preferred)
  let match = input.message?.match(/\[x-agent-payment:(\{[^}]+\})\]/);
  // Legacy lynq tag (deprecated, remove in next major)
  if (!match) match = input.message?.match(/\[x-lynq-payment:(\{[^}]+\})\]/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

// Read stdin
let input = "";
process.stdin.setEncoding("utf-8");
for await (const chunk of process.stdin) {
  input += chunk;
}

try {
  const data = JSON.parse(input);
  const payment = detectPayment(data);

  if (!payment) {
    process.exit(0);
  }

  const { recipient, amount, token, network } = payment;

  console.error(
    `[vaulx] Payment requested: ${amount} ${token ?? "ETH"} to ${recipient} on ${network ?? "base-sepolia"}`,
  );

  const res = await fetch(`${WALLET_URL}/api/send-transaction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WALLET_TOKEN}`,
    },
    body: JSON.stringify({
      recipient,
      amount,
      token: token ?? "ETH",
      network: network ?? "base-sepolia",
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error(`[vaulx] Payment failed: ${err.error}`);
    process.exit(2);
  }

  const { proof } = await res.json();

  console.error(`[vaulx] Payment sent: ${proof.value}`);

  // Return proof to Claude Code via elicitation hook protocol
  const response = {
    hookSpecificOutput: {
      hookEventName: "Elicitation",
      action: "accept",
      content: proof,
    },
  };

  console.log(JSON.stringify(response));
} catch (err) {
  console.error(`[vaulx] Error: ${err.message}`);
  process.exit(2);
}
