import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function listSystemProcesses(timeoutMs: number): Promise<string> {
  const result = await execFileAsync("/bin/ps", ["-Ao", "pid,command"], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 256 * 1024
  });
  return result.stdout;
}
