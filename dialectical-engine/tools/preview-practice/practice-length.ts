/**
 * Preview practice, mode "debate": length guidance (spec docs/superpowers/specs/2026-10-15-length-guidance-design.md §3.7,
 * rulings L6, L22).
 *
 * Plain words: the target lengths come from one register row, lengthGuidancePolicy. `--length-policy FILE` checks FILE
 * with the register's own parser and puts the row into the practice's THROWAWAY register only (in the same version as
 * --shape-policy's row when both are given), so other numbers can be tried without publishing anything. With
 * --register-next the row goes into the code's next version instead, as the server's plan `--length-guidance` would. The
 * flag is debate-only; a refused file is named only by the place it is wrong, never by its content.
 */
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { parseLengthGuidancePolicy, type LengthGuidance, type LengthGuidancePolicy } from "@debateai/register";
import { PracticeRefusal } from "./practice-settings.js";

export const PRACTICE_LENGTH_FLAGS = Object.freeze(["--length-policy"] as const);
const POLICY_INVALID_PREFIX = "LENGTH_GUIDANCE_POLICY_INVALID:";

/** The file's text, read and checked by the register's own parser. A refusal names only the place that is wrong. */
export function parsePracticeLengthPolicyText(text: string): LengthGuidancePolicy {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new PracticeRefusal("PRACTICE_LENGTH_POLICY_INVALID", "$"); }
  try {
    return parseLengthGuidancePolicy(value);
  } catch (error) {
    const path = error instanceof TypeError && error.message.startsWith(POLICY_INVALID_PREFIX)
      ? error.message.slice(POLICY_INVALID_PREFIX.length) : "$";
    throw new PracticeRefusal("PRACTICE_LENGTH_POLICY_INVALID", path);
  }
}

/** The flag of a command line: null when absent; refused outside debate mode. Read before any socket or gate is touched. */
export function practiceLengthOverrideFromArgs(mode: string, flags: ReadonlyMap<string, string>,
  read: (path: string) => string = (path) => readFileSync(path, "utf8")): LengthGuidancePolicy | null {
  const path = flags.get("--length-policy");
  if (path === undefined) return null;
  if (mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--length-policy (debate mode only)");
  let text: string;
  try { text = read(path); } catch { throw new PracticeRefusal("PRACTICE_LENGTH_POLICY_UNREADABLE"); }
  return parsePracticeLengthPolicyText(text);
}

/* ------------------------------------------------------------------ what the run did (report.json `length`) */

/** FLAG: the row came from --length-policy. REGISTER: the imported register held its own row. */
export type PracticeLengthSource = "FLAG" | "REGISTER";
export type PracticeLengthBlock = Readonly<{
  source: PracticeLengthSource;
  /** The throwaway register version the debate ran on. */
  registerVersion: string;
  /** FLAG only: what the row did in that version; null for REGISTER. */
  row: "ADDED" | "REPLACED" | "UNCHANGED" | null;
  /** The numbers the run was admitted with (its receipt's `length`), null when it carries none or they could not be read. */
  frozen: Readonly<{ plan: string; answerLength: string; steps: Readonly<Record<string, number>> }> | null;
  unreadable: string | null;
}>;

/** The run's frozen numbers, read from its receipt in the throwaway database before it is deleted. */
export async function readPracticeFrozenLength(pool: Pick<Pool, "query">, runId: string): Promise<LengthGuidance | null> {
  const run = (await pool.query<{ envelope_basis: unknown }>("SELECT envelope_basis FROM core.run WHERE run_id=$1", [runId])).rows[0];
  return run === undefined ? null : parseCostEnvelopeBasis(run.envelope_basis).length ?? null;
}

export function practiceLengthBlock(input: Readonly<{
  source: PracticeLengthSource; registerVersion: string; row: PracticeLengthBlock["row"]; frozen: LengthGuidance | null;
  unreadable?: string;
}>): PracticeLengthBlock {
  return Object.freeze({
    source: input.source, registerVersion: input.registerVersion, row: input.source === "FLAG" ? input.row : null,
    frozen: input.frozen === null ? null
      : Object.freeze({ plan: input.frozen.plan, answerLength: input.frozen.answerLength, steps: Object.freeze({ ...input.frozen.steps }) }),
    unreadable: input.unreadable ?? null
  });
}

/** report.md: the length block as one short paragraph, codes and numbers only, never reply text (pre-flight PF-C4.5). */
export function practiceLengthBlockLines(block: PracticeLengthBlock): readonly string[] {
  const where = block.source === "FLAG"
    ? `from --length-policy: version ${block.registerVersion}${block.row === null ? "" : `, row ${block.row.toLowerCase()}`}`
    : `from the imported register's own row, version ${block.registerVersion}`;
  const frozen = block.frozen === null
    ? `none${block.unreadable === null ? "" : ` (${block.unreadable})`}`
    : `plan ${block.frozen.plan}, answer length ${block.frozen.answerLength}: `
      + `${Object.entries(block.frozen.steps).map(([step, words]) => `${step} ${String(words)}`).join(", ")} words`;
  return [`Length guidance (${where}):`, "", `- frozen on the run: ${frozen}`, ""];
}

/*
 * (pre-flight PF-C4.1) No guided-columns helper here: LG-B's practiceLengthRows (practice-tokens.ts) already computes the
 * table's guided words (median over accepted tries, `outcome === "OK"`) and over share (three decimals) from
 * raw_artifact.guided_words; Step 6 adds only the map rule there.
 */

const WORDS_TARGET = /about ([1-9][0-9]*) words/gu;

/**
 * A call's told target read back from its recorded prompt's fields: the sum of every "about N words" in its `length`
 * field, else in the writer's `answer_length`; null without one, and for a characters target (its factor is the run's,
 * which the prompt does not carry). Used ONLY by transcript.json, when the attempt's `guided_words` column is empty (a
 * shaped run without the length row tells the writer its answer length but records no guided words). The report's words
 * table stays record-only (LG-B deviation 9): it reads the column, so such a run still shows "-" there
 * (pre-flight PF-C4.12).
 */
export function practiceGuidedWordsOfFields(fields: readonly Readonly<{ name: string; content: string }>[]): number | null {
  const field = fields.find((entry) => entry.name === "length") ?? fields.find((entry) => entry.name === "answer_length");
  if (field === undefined) return null;
  const numbers = [...field.content.matchAll(WORDS_TARGET)].map((match) => Number(match[1]));
  return numbers.length === 0 ? null : numbers.reduce((sum, value) => sum + value, 0);
}
