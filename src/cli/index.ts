#!/usr/bin/env node

import { ask, askWithDefault, confirm, close } from "./prompts.js";
import { deploySmartAccount } from "./deploy.js";
import { createSessionKey } from "./session.js";
import {
  PRIVATE_KEY,
  DEFAULT_CHAIN_ID,
  PIMLICO_API_KEY,
  CHAINS,
} from "../config.js";

async function setup() {
  console.error("vaulx setup\n");

  // 1. Private key
  let privateKey = PRIVATE_KEY;
  if (!privateKey) {
    const key = await ask("Owner private key (0x...): ");
    if (!key.startsWith("0x")) {
      console.error("Invalid private key format.");
      process.exit(1);
    }
    privateKey = key as `0x${string}`;
  } else {
    console.error("Using PRIVATE_KEY from environment.");
  }

  // 2. API key
  if (!PIMLICO_API_KEY) {
    console.error(
      "\nPIMLICO_API_KEY not set. Get one free at https://dashboard.pimlico.io",
    );
    process.exit(1);
  }

  // 3. Chain
  const chainNames = Object.entries(CHAINS)
    .map(([id, c]) => `${c.name} (${id})`)
    .join(", ");
  const chainInput = await askWithDefault(
    `\nChain? ${chainNames}`,
    String(DEFAULT_CHAIN_ID),
  );
  const chainId = Number(chainInput);
  if (!CHAINS[chainId]) {
    console.error(`Unsupported chain: ${chainId}`);
    process.exit(1);
  }

  // 4. Deploy smart account
  if (await confirm("\nDeploy smart account?")) {
    const result = await deploySmartAccount(privateKey, chainId);

    // 5. Session key
    if (await confirm("\nCreate session key?")) {
      const session = await createSessionKey(
        privateKey,
        result.smartAccountAddress,
        chainId,
      );

      console.error("\n--- Environment Variables ---\n");
      console.log(`WALLET_MODE=session-key`);
      console.log(`SMART_ACCOUNT_ADDRESS=${result.smartAccountAddress}`);
      console.log(`SESSION_KEY=${session.sessionKey}`);
      console.log(`PIMLICO_API_KEY=${PIMLICO_API_KEY}`);
      console.log(`DEFAULT_CHAIN_ID=${chainId}`);
    } else {
      console.error("\n--- Environment Variables ---\n");
      console.log(`WALLET_MODE=smart-account`);
      console.log(`SMART_ACCOUNT_ADDRESS=${result.smartAccountAddress}`);
      console.log(`PIMLICO_API_KEY=${PIMLICO_API_KEY}`);
      console.log(`DEFAULT_CHAIN_ID=${chainId}`);
    }
  }

  close();
}

const command = process.argv[2];

switch (command) {
  case "setup":
    await setup();
    break;
  default:
    console.error("Usage: vaulx setup");
    process.exit(1);
}
