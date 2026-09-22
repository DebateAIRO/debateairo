import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

export const PLACEHOLDER=/^__[A-Z0-9_]+__$/u;
export async function readFinalContract(path) {
  if (!isAbsolute(path ?? "")) throw new Error("GUIDE_CAPTURE_CONTRACT_PATH_INVALID");
  const value=JSON.parse(await readFile(path,"utf8"));
  if (value?.schemaVersion !== 1 || value?.revision === null || PLACEHOLDER.test(value?.revision ?? "")
    || !/^[0-9a-f]{40}$/u.test(value?.revision ?? "") || !isAbsolute(value?.cwd ?? "")) {
    throw new Error("GUIDE_CAPTURE_FINAL_CONTRACT_UNBOUND");
  }
  return value;
}

export function requireAbsoluteCommand(phase) {
  if (phase === null || typeof phase !== "object" || !Array.isArray(phase.argv)
    || phase.argv.length < 2 || phase.argv.some(value => typeof value !== "string" || PLACEHOLDER.test(value))
    || !isAbsolute(phase.argv[0]) || !isAbsolute(phase.argv[1])
    || !isAbsolute(phase.output ?? "") || !isAbsolute(phase.log ?? "")) {
    throw new Error("GUIDE_CAPTURE_ABSOLUTE_COMMAND_INVALID");
  }
  return phase;
}
