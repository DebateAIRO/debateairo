import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export async function runPoolFailureChild(environment: Readonly<Record<string, string>>): Promise<{
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const childPath = fileURLToPath(new URL("./poolFailureChild.ts", import.meta.url));
  const child = spawn(process.execPath, ["--import", "tsx", childPath], {
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  return { exitCode, stdout, stderr };
}

export function readPoolFailureReceipt(stdout: string): Record<string, unknown> {
  const line = stdout.split("\n").find((candidate) => candidate.startsWith("POL03_RESULT "));
  if (line === undefined) throw new Error(`POL03_RESULT_MISSING: ${stdout}`);
  return JSON.parse(line.slice("POL03_RESULT ".length)) as Record<string, unknown>;
}
