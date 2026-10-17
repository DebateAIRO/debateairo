/**
 * Preview practice, mode "debate": the engine row (spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md
 * §3.3 "Practice", §14; plan INTERFACE §15.1).
 *
 * Plain words: engine 2 is switched on by one register row, engineVersionPolicy, and no server has it. `--engine-policy
 * FILE` checks FILE with the register's own parser and puts the row into the practice's THROWAWAY register only, in the
 * same throwaway version as the --shape-policy and --length-policy rows (practice-register-import.ts
 * publishPracticeOverrideVersion). With --register-next the row goes into the code's next version instead, through the
 * kit's own source build, as the server's plan would. Engine 2 reads its word targets from the length row, so the flag
 * needs --length-policy or a length row in the exported register's newest version; without either it is refused before
 * anything is spent. The flag is debate-only; a refused file is named only by the place it is wrong, never by its content.
 */
import { readFileSync } from "node:fs";
import {
  LENGTH_GUIDANCE_POLICY_ROW_KEY,
  engineInForce,
  parseEngineVersionPolicy,
  type EngineVersionPolicy
} from "@debateai/register";
import { practiceVersionRows, type PracticeRegisterExport } from "./practice-register-import.js";
import { PracticeRefusal } from "./practice-settings.js";

export const PRACTICE_ENGINE_FLAGS = Object.freeze(["--engine-policy"] as const);
const POLICY_INVALID_PREFIX = "ENGINE_VERSION_POLICY_INVALID:";

/**
 * The file's text, read and checked by the register's own parser. A refusal names only the place that is wrong ("$"
 * for a text that is not JSON). A row switched off (`enabled: false`) is read as no row by the ask side, so it could
 * never run engine 2: refused as "enabled".
 */
export function parsePracticeEnginePolicyText(text: string): EngineVersionPolicy {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new PracticeRefusal("PRACTICE_ENGINE_POLICY_INVALID", "$"); }
  let policy: EngineVersionPolicy;
  try {
    policy = parseEngineVersionPolicy(value);
  } catch (error) {
    const path = error instanceof TypeError && error.message.startsWith(POLICY_INVALID_PREFIX)
      ? error.message.slice(POLICY_INVALID_PREFIX.length) : "$";
    throw new PracticeRefusal("PRACTICE_ENGINE_POLICY_INVALID", path);
  }
  if (engineInForce(policy) === null) throw new PracticeRefusal("PRACTICE_ENGINE_POLICY_INVALID", "enabled");
  return policy;
}

/** True when the export's newest version (the base every practice version is built on) holds the length row. */
export function practiceRegisterHasLengthRow(document: PracticeRegisterExport): boolean {
  const last = document.versions[document.versions.length - 1]!;
  return practiceVersionRows(document, last.register_version).some((row) => row.rowKey === LENGTH_GUIDANCE_POLICY_ROW_KEY);
}

/**
 * The flag of a command line: null when absent; refused outside debate mode; refused when no length row will be there
 * (`lengthGiven`: --length-policy was given, or the exported register's newest version holds the row). Called after the
 * export is read and before any socket, gate or database is touched. `read` keeps its default when the caller passes
 * undefined (the parameter order is INTERFACE §15.1's).
 */
export function practiceEngineOverrideFromArgs(mode: string, flags: ReadonlyMap<string, string>,
  read: (path: string) => string = (path) => readFileSync(path, "utf8"), lengthGiven: boolean): EngineVersionPolicy | null {
  const path = flags.get("--engine-policy");
  if (path === undefined) return null;
  if (mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--engine-policy (debate mode only)");
  let text: string;
  try { text = read(path); } catch { throw new PracticeRefusal("PRACTICE_ENGINE_POLICY_UNREADABLE"); }
  const policy = parsePracticeEnginePolicyText(text);
  if (!lengthGiven) {
    throw new PracticeRefusal("PRACTICE_ENGINE_REQUIRES_LENGTH_POLICY",
      "engine 2 reads its word targets from the length row: give --length-policy (the register export has none)");
  }
  return policy;
}
