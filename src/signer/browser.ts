import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { platform } from "node:os";
import { getPublicClient } from "../client.js";
import type { Signer, TxParams } from "./types.js";

export interface PendingTx {
  params: TxParams;
  resolve: (hash: `0x${string}`) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

export interface PendingSign {
  message: string;
  resolve: (signature: `0x${string}`) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

export interface PendingConnect {
  resolve: (address: `0x${string}`) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

export interface BrowserSignerState {
  pendingTxs: Map<string, PendingTx>;
  pendingSigns: Map<string, PendingSign>;
  pendingConnects: Map<string, PendingConnect>;
  connectedAddress: `0x${string}` | null;
}

const TIMEOUT_MS = 120_000;

function openBrowser(url: string) {
  const os = platform();
  const cmd =
    os === "darwin" ? "open" : os === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`);
}

export function createBrowserSigner(port: number): Signer & {
  state: BrowserSignerState;
} {
  const state: BrowserSignerState = {
    pendingTxs: new Map(),
    pendingSigns: new Map(),
    pendingConnects: new Map(),
    connectedAddress: null,
  };

  return {
    mode: "browser" as const,
    hasPaymaster: false,
    state,

    async getAddress(): Promise<`0x${string}`> {
      if (state.connectedAddress) return state.connectedAddress;

      const nonce = randomUUID();
      openBrowser(`http://127.0.0.1:${port}/connect/${nonce}`);

      return new Promise<`0x${string}`>((resolve, reject) => {
        state.pendingConnects.set(nonce, {
          resolve: (address) => {
            state.connectedAddress = address;
            resolve(address);
          },
          reject,
          createdAt: Date.now(),
        });

        setTimeout(() => {
          if (state.pendingConnects.has(nonce)) {
            state.pendingConnects.delete(nonce);
            reject(new Error("Wallet connection timed out (120s)"));
          }
        }, TIMEOUT_MS);
      });
    },

    async sendTransaction(params: TxParams): Promise<`0x${string}`> {
      const nonce = randomUUID();
      openBrowser(`http://127.0.0.1:${port}/confirm/${nonce}`);

      return new Promise<`0x${string}`>((resolve, reject) => {
        state.pendingTxs.set(nonce, {
          params,
          resolve,
          reject,
          createdAt: Date.now(),
        });

        setTimeout(() => {
          if (state.pendingTxs.has(nonce)) {
            state.pendingTxs.delete(nonce);
            reject(new Error("Transaction confirmation timed out (120s)"));
          }
        }, TIMEOUT_MS);
      });
    },

    async signMessage(message: string): Promise<`0x${string}`> {
      const nonce = randomUUID();
      openBrowser(`http://127.0.0.1:${port}/sign/${nonce}`);

      return new Promise<`0x${string}`>((resolve, reject) => {
        state.pendingSigns.set(nonce, {
          message,
          resolve,
          reject,
          createdAt: Date.now(),
        });

        setTimeout(() => {
          if (state.pendingSigns.has(nonce)) {
            state.pendingSigns.delete(nonce);
            reject(new Error("Message signing timed out (120s)"));
          }
        }, TIMEOUT_MS);
      });
    },

    async getBalance(chainId: number): Promise<bigint> {
      const address = await this.getAddress();
      const client = getPublicClient(chainId);
      return client.getBalance({ address });
    },
  };
}
