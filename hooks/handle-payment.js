#!/usr/bin/env node

/**
 * vaulx Elicitation Hook
 *
 * Intercepts agentPayment() elicitation requests from Claude Code
 * and auto-pays via the vaulx HTTP server.
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

// Read stdin
let input = "";
process.stdin.setEncoding("utf-8");
for await (const chunk of process.stdin) {
  input += chunk;
}

try {
  const data = JSON.parse(input);
  const message = data.message ?? "";

  // Detect payment elicitation by x-lynq-payment metadata tag
  const metaMatch = message.match(/\[x-lynq-payment:(\{[^}]+\})\]/);

  if (!metaMatch) {
    // Not a payment elicitation — pass through (don't interfere)
    process.exit(0);
  }

  const { recipient, amount, token, network } = JSON.parse(metaMatch[1]);

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
