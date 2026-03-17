import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });

export async function ask(question: string): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

export async function askWithDefault(
  question: string,
  defaultValue: string,
): Promise<string> {
  const answer = await ask(`${question} [${defaultValue}]: `);
  return answer || defaultValue;
}

export async function confirm(question: string): Promise<boolean> {
  const answer = await ask(`${question} (y/n): `);
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

export function close() {
  rl.close();
}
