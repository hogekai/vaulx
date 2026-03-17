import fs from "node:fs";

// VAULX_ENV_FILE が指定されていれば .env を読んで process.env に展開
const envFile = process.env.VAULX_ENV_FILE;
if (envFile) {
	if (!fs.existsSync(envFile)) {
		console.error(`❌ .env file not found: ${envFile}`);
		process.exit(1);
	}
	const content = fs.readFileSync(envFile, "utf-8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();
		// .env の値は上書きしない（MCP設定の env が優先）
		if (!process.env[key]) {
			process.env[key] = value;
		}
	}
}

// 本体起動
await import("./index.js");
