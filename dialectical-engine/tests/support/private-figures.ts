import { readFileSync } from "node:fs";
import { z } from "zod";

/*
 * V4 start step, Task 84 (plan Global Constraints "Public repo"; spec 2026-11-03 §8): THE OWNER'S PRIVATE FIGURES, read
 * only when named. The repository is public, so no real pot, limit or price is ever written into it. The end-to-end world
 * (Task 90) and the rehearsal (Task 93) may instead read the owner's own files, kept outside the repository:
 *  - DEBATEAI_PRIVATE_GATE_FIGURES: each gate's pot, paid posts, calls in flight and models (schema
 *    `debateai-private-gate-figures-v1`, written in Task 91's sitting from the gates' status files);
 *  - DEBATEAI_PRIVATE_REGISTER_EXPORT: the release's register export (the S-1 export), handed back as its text.
 * A variable absent (or blank) reads as null, and the check prints PRIVATE_NOT_CHECKED and skips. A file that does not
 * read throws an error that names the field (or what went wrong), never a value and never a word of the file, so no
 * figure reaches a log; a need is compared with a pot only as a share (`shareOfPot`). Nothing here logs anything.
 */

/** What a check prints when the private files are not named, and then skips. */
export const PRIVATE_NOT_CHECKED = "not checked" as const;

export type PrivateGateFigures = Readonly<{
  schema: "debateai-private-gate-figures-v1";
  gates: Readonly<Record<"deepinfra" | "anthropic", Readonly<{
    daily_budget_usd: string;
    max_paid_posts_per_day: number;
    max_concurrent_calls: number;
    final_writer_max_in_flight?: number;
    largest_reservation_usd?: string;
    largest_final_writer_reservation_usd?: string;
    enabled_models: readonly string[];
  }>>>;
  team_total_usd?: string;
  hosted_billing: Readonly<Record<string, unknown>>;
}>;

/** A dollar figure as the gates write it: a plain decimal, at most six places (micro-dollars), never a sign or a comma. */
const DECIMAL_USD = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/u;
const usd = z.string().regex(DECIMAL_USD);
const count = (min: number) => z.number().int().min(min).max(1_000_000_000);
const gateSchema = z.object({
  daily_budget_usd: usd,
  max_paid_posts_per_day: count(0),
  max_concurrent_calls: count(1),
  final_writer_max_in_flight: count(1).optional(),
  largest_reservation_usd: usd.optional(),
  largest_final_writer_reservation_usd: usd.optional(),
  enabled_models: z.array(z.string().min(1).max(200)).max(64)
}).strict();
const figuresSchema = z.object({
  schema: z.literal("debateai-private-gate-figures-v1"),
  gates: z.object({ deepinfra: gateSchema, anthropic: gateSchema }).strict(),
  team_total_usd: usd.optional(),
  hosted_billing: z.record(z.string(), z.unknown())
}).strict();

const GATE_FIGURES_VARIABLE = "DEBATEAI_PRIVATE_GATE_FIGURES";
const REGISTER_EXPORT_VARIABLE = "DEBATEAI_PRIVATE_REGISTER_EXPORT";

/** The file a variable names, or null when it is absent or blank. */
function namedFile(env: NodeJS.ProcessEnv, variable: string): string | null {
  const value = env[variable];
  return value === undefined || value.trim() === "" ? null : value;
}

/** The file's text; a file that cannot be read throws `<code>` alone (the reason could quote the path's content). */
function textOf(path: string, code: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new TypeError(code);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/**
 * The gate figures the owner's file holds, deep-frozen; null when DEBATEAI_PRIVATE_GATE_FIGURES is absent. A file that
 * does not read throws TypeError `PRIVATE_GATE_FIGURES_UNREADABLE`, `PRIVATE_GATE_FIGURES_NOT_JSON` or
 * `PRIVATE_GATE_FIGURES_INVALID:<field>` (the first field that is wrong, e.g. `gates.anthropic.max_concurrent_calls`; an
 * unknown field is named by its key). The message never carries a value: the parser's own words are never passed on.
 */
export function readPrivateGateFigures(env: NodeJS.ProcessEnv = process.env): PrivateGateFigures | null {
  const path = namedFile(env, GATE_FIGURES_VARIABLE);
  if (path === null) return null;
  const text = textOf(path, "PRIVATE_GATE_FIGURES_UNREADABLE");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError("PRIVATE_GATE_FIGURES_NOT_JSON");
  }
  const parsed = figuresSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = [...(issue?.path ?? []).map(String), ...(issue?.code === "unrecognized_keys" ? issue.keys.slice(0, 1) : [])];
    throw new TypeError(`PRIVATE_GATE_FIGURES_INVALID:${field.length === 0 ? "$" : field.join(".")}`);
  }
  return deepFreeze(parsed.data) as PrivateGateFigures;
}

/**
 * The release's register export as its text (the caller parses the rows it needs); null when
 * DEBATEAI_PRIVATE_REGISTER_EXPORT is absent. A file that cannot be read throws TypeError `PRIVATE_REGISTER_EXPORT_UNREADABLE`.
 */
export function readPrivateRegisterExport(env: NodeJS.ProcessEnv = process.env): string | null {
  const path = namedFile(env, REGISTER_EXPORT_VARIABLE);
  return path === null ? null : textOf(path, "PRIVATE_REGISTER_EXPORT_UNREADABLE");
}

/**
 * Task 90c: the hosted billing the end-to-end world (Task 90) composes its register with: the owner's plans and ceilings as the
 * file holds them, with billing ON. The sitting's file carries the practice copy's switch (off: the real practice debates run
 * billing off, tools/preview-practice/README.md S-3b), but the world drives a case per plan, which only billing on tells apart
 * (with billing off every person reads the premium key and the room has no plans).
 */
export function privateWorldHostedBilling(figures: PrivateGateFigures): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...figures.hosted_billing, billing: "on" });
}

/**
 * Task 90c: the Anthropic gate's calls at once after the release's upload (deploy/preview-gate/v3/README-anthropic.md, "four
 * calls at once": its GO edit sets `max_concurrent_calls` to 4 and no other figure). Not a private figure: the README says it.
 */
export const RELEASE_ANTHROPIC_CALLS_AT_ONCE = 4;

/**
 * Task 90c: the gates the end-to-end world answers from: the owner's figures with the release's GO edit on top. The sitting's file
 * holds today's GOs, and the step's first moment sends three Haiku calls at once (the planner, the question check, the language
 * decision), which today's Anthropic GO would hold in line; the release that carries the step gives that gate four.
 */
export function privateWorldGates(figures: PrivateGateFigures): PrivateGateFigures["gates"] {
  return Object.freeze({ deepinfra: figures.gates.deepinfra,
    anthropic: Object.freeze({ ...figures.gates.anthropic, max_concurrent_calls: RELEASE_ANTHROPIC_CALLS_AT_ONCE }) });
}

/** A plain decimal dollar figure in micro-dollars; anything else is TypeError("SHARE_OF_POT_INVALID"), with no value. */
function microsOf(figure: string): bigint {
  const match = DECIMAL_USD.exec(figure);
  if (match === null) throw new TypeError("SHARE_OF_POT_INVALID");
  return BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? ".").slice(1).padEnd(6, "0"));
}

/**
 * How a need compares with a pot, as the only thing a refusal may print: "about <n.n> times the pot", the share rounded
 * to a tenth, half up ("12.1" against "11" is "about 1.1 times the pot"); a share that rounds to nothing is "under 0.1
 * times the pot". Never a figure. Both are plain decimals, the pot above zero, else TypeError("SHARE_OF_POT_INVALID").
 */
export function shareOfPot(needUsd: string, potUsd: string): string {
  const need = microsOf(needUsd);
  const pot = microsOf(potUsd);
  if (pot === 0n) throw new TypeError("SHARE_OF_POT_INVALID");
  const tenths = (need * 20n + pot) / (2n * pot);
  return tenths === 0n ? "under 0.1 times the pot" : `about ${tenths / 10n}.${tenths % 10n} times the pot`;
}
