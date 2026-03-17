export function addressBox(address: string, chainLabel: string, mode: string): string {
	const width = 50;
	const line = "─".repeat(width - 2);
	const pad = (s: string) => s + " ".repeat(Math.max(0, width - 4 - s.length));
	return [
		`┌${line}┐`,
		`│  ${pad(`Address:  ${address}`)}│`,
		`│  ${pad(`Chain:    ${chainLabel}`)}│`,
		`│  ${pad(`Mode:     ${mode}`)}│`,
		`└${line}┘`,
	].join("\n");
}
