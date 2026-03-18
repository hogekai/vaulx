import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";

// Set override BEFORE importing register (which imports wallet-manager)
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaulx-reg-"));
process.env.VAULX_HOME_OVERRIDE = path.join(tempDir, ".vaulx");

const { registerMCP, registerHook, isAlreadyRegistered } = await import(
	"../../../src/cli/register.js"
);

afterAll(() => {
	delete process.env.VAULX_HOME_OVERRIDE;
	fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("CLI register", () => {
	test("registerMCP: creates .mcp.json with vaulx entry", () => {
		registerMCP({ chainId: 84532, authToken: "tok", port: 18420, walletName: "default" });

		const mcpJson = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf-8"));
		expect(mcpJson.mcpServers.vaulx).toBeDefined();
		expect(mcpJson.mcpServers.vaulx.env.VAULX_ENV_FILE).toContain("wallets/default/.env");
		expect(mcpJson.mcpServers.vaulx.env.VAULX_WALLET_NAME).toBe("default");
		// No PRIVATE_KEY in MCP config
		expect(mcpJson.mcpServers.vaulx.env.PRIVATE_KEY).toBeUndefined();
	});

	test("registerMCP: preserves existing servers", () => {
		const mcpPath = path.join(tempDir, ".mcp.json");
		fs.writeFileSync(
			mcpPath,
			JSON.stringify({
				mcpServers: { other: { command: "node", args: ["other.js"] } },
			}),
		);

		registerMCP({ chainId: 84532, authToken: "tok", port: 18420, walletName: "default" });

		const mcpJson = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
		expect(mcpJson.mcpServers.other).toBeDefined();
		expect(mcpJson.mcpServers.vaulx).toBeDefined();
	});

	test("registerHook: creates Elicitation hook in settings.json", () => {
		registerHook({ chainId: 84532, authToken: "tok", port: 18420, walletName: "default" });

		const settingsPath = path.join(tempDir, ".claude", "settings.json");
		expect(fs.existsSync(settingsPath)).toBe(true);
		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
		expect(settings.hooks.Elicitation).toHaveLength(1);
		expect(settings.hooks.Elicitation[0].hooks[0].command).toContain("handle-payment.js");
		expect(settings.hooks.Elicitation[0].hooks[0].command).toContain("WALLET_TOKEN=tok");
	});

	test("registerHook: replaces existing vaulx hook (not duplicate)", () => {
		registerHook({ chainId: 84532, authToken: "old-tok", port: 18420, walletName: "default" });
		registerHook({ chainId: 84532, authToken: "new-tok", port: 18420, walletName: "default" });

		const settingsPath = path.join(tempDir, ".claude", "settings.json");
		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
		expect(settings.hooks.Elicitation).toHaveLength(1);
		expect(settings.hooks.Elicitation[0].hooks[0].command).toContain("new-tok");
	});

	test("isAlreadyRegistered: detects MCP + hook", () => {
		// Clean slate
		const mcpPath = path.join(tempDir, ".mcp.json");
		const settingsPath = path.join(tempDir, ".claude", "settings.json");
		if (fs.existsSync(mcpPath)) fs.unlinkSync(mcpPath);
		if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);

		expect(isAlreadyRegistered()).toEqual({ mcp: false, hook: false });

		registerMCP({ chainId: 84532, authToken: "tok", port: 18420, walletName: "default" });
		expect(isAlreadyRegistered().mcp).toBe(true);

		registerHook({ chainId: 84532, authToken: "tok", port: 18420, walletName: "default" });
		expect(isAlreadyRegistered().hook).toBe(true);
	});
});
