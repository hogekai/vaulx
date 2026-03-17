import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface RegisterOptions {
	vaulxDir: string;
	chainId: number;
	authToken: string;
	port: number;
}

/**
 * ~/.mcp.json に vaulx を登録
 * 秘密鍵は入れない。.env ファイルパスだけ渡す。
 */
export function registerMCP(options: RegisterOptions): void {
	const mcpJsonPath = path.join(os.homedir(), ".mcp.json");

	let config: Record<string, unknown> = {};
	if (fs.existsSync(mcpJsonPath)) {
		try {
			config = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
		} catch {
			config = {};
		}
	}

	const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>;

	mcpServers.vaulx = {
		type: "stdio",
		command: path.join(options.vaulxDir, "node_modules", ".bin", "tsx"),
		args: [path.join(options.vaulxDir, "src", "start.ts")],
		env: {
			VAULX_ENV_FILE: path.join(options.vaulxDir, ".env"),
			WALLET_PORT: String(options.port),
			WALLET_AUTH_TOKEN: options.authToken,
		},
	};

	config.mcpServers = mcpServers;
	fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, "\t") + "\n");
}

/**
 * ~/.claude/settings.json に Elicitation フックを登録
 */
export function registerHook(options: RegisterOptions): void {
	const settingsDir = path.join(os.homedir(), ".claude");
	const settingsPath = path.join(settingsDir, "settings.json");

	if (!fs.existsSync(settingsDir)) {
		fs.mkdirSync(settingsDir, { recursive: true });
	}

	let settings: Record<string, unknown> = {};
	if (fs.existsSync(settingsPath)) {
		try {
			settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
		} catch {
			settings = {};
		}
	}

	const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
	if (!hooks.Elicitation) hooks.Elicitation = [];

	const hookCommand = [
		`WALLET_URL=http://127.0.0.1:${options.port}`,
		`WALLET_TOKEN=${options.authToken}`,
		`node ${path.join(options.vaulxDir, "hooks", "handle-payment.js")}`,
	].join(" ");

	const elicitations = hooks.Elicitation as Array<Record<string, unknown>>;
	const existingIdx = elicitations.findIndex((h) => {
		const innerHooks = h.hooks as Array<Record<string, string>> | undefined;
		return innerHooks?.some((hook) => hook.command?.includes("handle-payment.js"));
	});

	const entry = {
		matcher: ".*",
		hooks: [{ type: "command", command: hookCommand }],
	};

	if (existingIdx !== -1) {
		elicitations[existingIdx] = entry;
	} else {
		elicitations.push(entry);
	}

	hooks.Elicitation = elicitations;
	settings.hooks = hooks;
	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, "\t") + "\n");
}

/**
 * 既に登録済みか
 */
export function isAlreadyRegistered(): { mcp: boolean; hook: boolean } {
	const mcpJsonPath = path.join(os.homedir(), ".mcp.json");
	const settingsPath = path.join(os.homedir(), ".claude", "settings.json");

	let mcp = false;
	if (fs.existsSync(mcpJsonPath)) {
		try {
			const config = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
			mcp = !!config?.mcpServers?.vaulx;
		} catch {
			/* ignore */
		}
	}

	let hook = false;
	if (fs.existsSync(settingsPath)) {
		try {
			const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
			const elicitations = settings?.hooks?.Elicitation as
				| Array<Record<string, unknown>>
				| undefined;
			hook = !!elicitations?.some((h) => {
				const innerHooks = h.hooks as Array<Record<string, string>> | undefined;
				return innerHooks?.some((hk) => hk.command?.includes("handle-payment.js"));
			});
		} catch {
			/* ignore */
		}
	}

	return { mcp, hook };
}
