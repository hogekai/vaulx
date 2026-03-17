import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: stdin, output: stdout });

export async function ask(question: string): Promise<string> {
	const answer = await rl.question(question);
	return answer.trim();
}

export async function askWithDefault(question: string, defaultValue: string): Promise<string> {
	const answer = await ask(`${question} [${defaultValue}]: `);
	return answer || defaultValue;
}

export async function confirm(question: string): Promise<boolean> {
	const answer = await ask(`${question} (y/n): `);
	return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

interface SelectOption {
	label: string;
	value: string;
}

export async function select(question: string, options: SelectOption[]): Promise<string> {
	console.error(question);
	for (let i = 0; i < options.length; i++) {
		console.error(`  ${i + 1}. ${options[i].label}`);
	}
	const answer = await askWithDefault(`Choice (1-${options.length})`, "1");
	const idx = Number(answer) - 1;
	if (idx < 0 || idx >= options.length) return options[0].value;
	return options[idx].value;
}

export function close() {
	rl.close();
}
