/**
 * Preview: the offline check of the owner's thinking-levels table, run BEFORE any API or runner restart (spec
 * 2026-10-12 §4.2; final review fix 1a).
 *
 * Plain words: the API and the runner refuse to start on a bad `thinking_levels` table, but their launchers print only
 * PREVIEW_API_STARTUP_REFUSED / PREVIEW_RUNNER_STARTUP_REFUSED, never why. This command reads the one
 * PREVIEW_PROVIDER_TEST_CONFIG_JSON value (a settings.env-style file with --settings, or stdin: that KEY=value line, or the
 * bare JSON), runs the same parser the API and the runner run at boot, and prints either
 *  - OK, then one row per AI: its usual level and its step overrides (an entry for a model not on this config's rosters
 *    is accepted, and the row says it is unused), or
 *  - the parser's exact refusal: PREVIEW_THINKING_LEVELS_INVALID:<detail> or PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID.
 * Addition D14 (owner 2026-10-22): a sockets-only value (the gate part alone) carries no line-up and so no table: it prints
 * OK and says the line-up lives in the settings version (previewLineUpPolicy).
 * Addition D23 (owner 2026-10-22): `--print-line-up` prints, instead of the table, the value's line-up as the publish kit's plan
 * member, `{"lineUp":{"free_model_ids":[…],"premium_model_ids":[…],"thinking_levels":{…}|null}}` on one line (via
 * previewLineUpOfConfig), so the first settings version is planned with exactly the line-up the preview runs today. A
 * sockets-only value prints only the sentence above (there is no line-up to print); a refused value prints what the check
 * prints, with the same exit code.
 * Exit 0 OK, 1 the value is refused, 2 the check could not run (no value, two values, an unreadable file, a key-shaped
 * value). It sends nothing and reads no environment. OK prints only model ids, level words and step names (all checked
 * against the reviewed rows); a refusal's detail may name the unreviewed table key or step word it refuses, with every
 * key shape (a bare long token too) blanked. Any other line of the file is never printed, and a key-shaped value is
 * refused unprinted.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PREVIEW_THINKING_LEVELS_INVALID,
  PREVIEW_THINKING_STEPS,
  parsePreviewEnvironmentConfig,
  parsePreviewProviderTestConfig,
  previewLineUpOfConfig,
  previewModelRow,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import { redactKeyShapes } from "./practice-redaction.js";
import { settingsValueIsKeyShaped } from "./practice-settings.js";

const KEY = "PREVIEW_PROVIDER_TEST_CONFIG_JSON";
const CONFIG_INVALID = "PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID";
const SOCKETS_ONLY_NOTE = "No line-up in this setting: it lives in the settings version (previewLineUpPolicy).";
const USAGE = "usage: check-thinking-levels.ts [--print-line-up] [--settings <settings.env>]  (without --settings: the value on stdin)";
const PRINT_LINE_UP = "--print-line-up";

export type ThinkingLevelsCheck = Readonly<{ exitCode: 0 | 1 | 2; lines: readonly string[] }>;

const refused = (why: string): ThinkingLevelsCheck => Object.freeze({ exitCode: 2, lines: Object.freeze([`CHECK_REFUSED: ${why}`]) });

/** The one value: its KEY=value line (other lines skipped, never printed), else the whole text when it is bare JSON. */
function valueOf(text: string): string | ThinkingLevelsCheck {
  const found = text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.startsWith(`${KEY}=`));
  if (found.length > 1) return refused(`${KEY} appears more than once`);
  if (found.length === 1) return found[0]!.slice(KEY.length + 1);
  const bare = text.trim();
  return bare.startsWith("{") ? bare : refused(`no ${KEY}= line (or bare JSON) found`);
}

/** The table as rows: every roster AI, then any table entry for a model not on the rosters (accepted, unused). */
function tableLines(config: PreviewProviderTestConfig): string[] {
  const rostered = [...new Set([...config.premium_model_ids, ...config.free_model_ids])];
  const levels = config.thinking_levels ?? {};
  const unused = Object.keys(levels).filter((model) => !rostered.includes(model));
  const withNote = unused.length > 0;
  const lines = [withNote ? "| model | usual level | step overrides | note |" : "| model | usual level | step overrides |",
    withNote ? "|---|---|---|---|" : "|---|---|---|"];
  for (const model of [...rostered, ...unused]) {
    const row = previewModelRow(model)!;
    const choice = levels[model];
    const usual = choice?.level === undefined ? `${row.defaultEffort} (its default)` : `${choice.level} (table)`;
    const steps = PREVIEW_THINKING_STEPS.flatMap((step) => {
      const level = choice?.steps?.[step];
      return level === undefined ? [] : [`${step}=${level}`];
    });
    const note = unused.includes(model) ? "not on this config's rosters: accepted, unused" : "-";
    lines.push(`| ${model} | ${usual} | ${steps.length === 0 ? "-" : steps.join(", ")} |${withNote ? ` ${note} |` : ""}`);
  }
  return lines;
}

/** The value read and parsed by the boot's own parsers: its config, or the outcome to print (refusal or sockets-only). */
function configOf(text: string): PreviewProviderTestConfig | ThinkingLevelsCheck {
  const value = valueOf(text);
  if (typeof value !== "string") return value;
  if (settingsValueIsKeyShaped(value)) return refused(`${KEY} holds something key-shaped (nothing of it printed)`);
  let config: PreviewProviderTestConfig | undefined;
  try {
    // Addition D14: the env's three forms, read by the boot's own parser; the sockets-only form has no line-up here.
    if (parsePreviewEnvironmentConfig(value)?.envLineUp === null) return Object.freeze({ exitCode: 0, lines: Object.freeze(["OK", SOCKETS_ONLY_NOTE]) });
    config = parsePreviewProviderTestConfig(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // The detail names a model, step or level the owner wrote: blanked if key-shaped, and kept short.
    const line = message.startsWith(`${PREVIEW_THINKING_LEVELS_INVALID}:`) ? redactKeyShapes(message).slice(0, 200) : CONFIG_INVALID;
    return Object.freeze({ exitCode: 1, lines: Object.freeze([line]) });
  }
  return config ?? Object.freeze({ exitCode: 1, lines: Object.freeze([CONFIG_INVALID]) });
}
const isOutcome = (value: PreviewProviderTestConfig | ThinkingLevelsCheck): value is ThinkingLevelsCheck => "exitCode" in value;

/** Spec 2026-10-12 §4.2: the check itself, on the text of a settings.env-style file or of stdin. */
export function checkThinkingLevels(text: string): ThinkingLevelsCheck {
  const config = configOf(text);
  if (isOutcome(config)) return config;
  const lines = ["OK", ...tableLines(config)];
  lines.push(config.thinking_levels === undefined
    ? "No thinking_levels table: every AI runs at its default (today's request)."
    : "A step not listed runs at its AI's usual level.");
  return Object.freeze({ exitCode: 0, lines: Object.freeze(lines) });
}

/**
 * Addition D23 (owner 2026-10-22): the value's line-up as the kit's plan member, one line, exit 0. The ids, levels and step
 * names printed have all passed the boot's parser against the reviewed rows (the same guarantee as the table). A sockets-only
 * value prints only the sentence that the line-up lives in the settings version; a refusal is the check's own.
 */
export function printLineUp(text: string): ThinkingLevelsCheck {
  const config = configOf(text);
  if (isOutcome(config)) return config.exitCode === 0 ? Object.freeze({ exitCode: 0, lines: Object.freeze([SOCKETS_ONLY_NOTE]) }) : config;
  return Object.freeze({ exitCode: 0, lines: Object.freeze([JSON.stringify({ lineUp: previewLineUpOfConfig(config) })]) });
}

/**
 * The command: `--settings <file>`, or nothing and the value on stdin (a terminal on stdin gets the usage line); with
 * `--print-line-up` (once, before or after `--settings <file>`) the line-up is printed as the plan member instead of the table.
 */
export function checkThinkingLevelsCommand(argv: readonly string[],
  io: Readonly<{ readStdin: () => string; stdinIsTTY: boolean }>): ThinkingLevelsCheck {
  const print = argv.filter((argument) => argument === PRINT_LINE_UP).length;
  if (print > 1) return refused(USAGE);
  const rest = argv.filter((argument) => argument !== PRINT_LINE_UP);
  const run = print === 1 ? printLineUp : checkThinkingLevels;
  if (rest.length === 0) return io.stdinIsTTY ? refused(USAGE) : run(io.readStdin());
  if (rest.length !== 2 || rest[0] !== "--settings") return refused(USAGE);
  let text: string;
  try { text = readFileSync(rest[1]!, "utf8"); } catch { return refused("the settings file cannot be read"); }
  return run(text);
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  const outcome = checkThinkingLevelsCommand(process.argv.slice(2),
    { readStdin: () => readFileSync(0, "utf8"), stdinIsTTY: process.stdin.isTTY === true });
  process.stdout.write(`${outcome.lines.join("\n")}\n`);
  process.exit(outcome.exitCode);
}
