/**
 * Spec 2026-10-12 §4.2 (final review fix 1a): the offline checker the operator runs before any API or runner restart.
 * It reads one PREVIEW_PROVIDER_TEST_CONFIG_JSON value (a settings.env-style file or stdin), runs the boot parser, and
 * prints either OK plus each AI's level and step overrides, or the parser's exact refusal. No network, no secrets: it
 * prints only the config's model ids, level words and step names, and refuses a key-shaped value without printing it.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePreviewLineUp } from "@debateai/providers";
import { checkThinkingLevels, checkThinkingLevelsCommand, printLineUp } from "../../tools/preview-practice/check-thinking-levels.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const BASE = { deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU],
  requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-check-unit" };
const line = (value: unknown) => `PREVIEW_PROVIDER_TEST_CONFIG_JSON=${JSON.stringify(value)}`;

describe("check-thinking-levels: the offline table check (spec 2026-10-12 §4.2)", () => {
  it("a valid table: OK, then one row per AI with its usual level and step overrides", () => {
    const result = checkThinkingLevels([line({ ...BASE, thinking_levels: {
      [QWEN]: { level: "low", steps: { story_writer: "medium" } }, [HAIKU]: { steps: { slip_fix: "low", judge_panel: "medium" } } } }),
    "JUDGEMENT_PRODUCER=p", "# a comment"].join("\n"));
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual([
      "OK",
      "| model | usual level | step overrides |",
      "|---|---|---|",
      `| ${GLM} | high (its default) | - |`,
      `| ${DEEPSEEK} | high (its default) | - |`,
      `| ${MIMO} | default (its default) | - |`,
      `| ${QWEN} | low (table) | story_writer=medium |`,
      `| ${HAIKU} | high (its default) | judge_panel=medium, slip_fix=low |`,
      "A step not listed runs at its AI's usual level."
    ]);
  });

  it("no table: OK, every AI at its default (today's request)", () => {
    const result = checkThinkingLevels(line(BASE));
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toBe("OK");
    expect(result.lines).toContain("No thinking_levels table: every AI runs at its default (today's request).");
    expect(result.lines).toContain(`| ${QWEN} | default (its default) | - |`);
  });

  it("an entry for a reviewed model not on this config's rosters is accepted but unused, and says so", () => {
    const result = checkThinkingLevels(line({ ...BASE, premium_model_ids: [GLM, DEEPSEEK], thinking_levels: { [QWEN]: { level: "low" } } }));
    expect(result.exitCode).toBe(0);
    expect(result.lines).toContain(`| ${QWEN} | low (table) | - | not on this config's rosters: accepted, unused |`);
    expect(result.lines).toContain("| model | usual level | step overrides | note |");
  });

  it("an off-menu level: the parser's exact detail, exit 1", () => {
    const result = checkThinkingLevels(line({ ...BASE, thinking_levels: { [GLM]: { level: "medium" } } }));
    expect(result).toEqual({ exitCode: 1, lines: [`PREVIEW_THINKING_LEVELS_INVALID:level:${GLM}`] });
    expect(checkThinkingLevels(line({ ...BASE, thinking_levels: { [GLM]: { steps: { closing: "low" } } } })).lines)
      .toEqual([`PREVIEW_THINKING_LEVELS_INVALID:step:${GLM}:closing`]);
  });

  it("malformed JSON, or a config the parser refuses: the config code, exit 1", () => {
    expect(checkThinkingLevels("PREVIEW_PROVIDER_TEST_CONFIG_JSON={not json")).toEqual({ exitCode: 1, lines: ["PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID"] });
    expect(checkThinkingLevels(line({ ...BASE, scope_id: "Not Allowed" }))).toEqual({ exitCode: 1, lines: ["PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID"] });
  });

  it("stdin may carry the bare JSON value", () => {
    expect(checkThinkingLevels(`${JSON.stringify({ ...BASE, thinking_levels: { [GLM]: { level: "low" } } })}\n`).lines)
      .toContain(`| ${GLM} | low (table) | - |`);
  });

  it("refuses a key-shaped value and never prints it; never prints another line of the file", () => {
    const vendorKey = ["sk", "ant", "x".repeat(6) + "Q9".repeat(12)].join("-");
    const keyed = checkThinkingLevels(line({ ...BASE, thinking_levels: { [vendorKey]: { level: "low" } } }));
    expect(keyed).toEqual({ exitCode: 2, lines: ["CHECK_REFUSED: PREVIEW_PROVIDER_TEST_CONFIG_JSON holds something key-shaped (nothing of it printed)"] });
    const other = checkThinkingLevels([line(BASE), `JUDGEMENT_PRODUCER=${vendorKey}`].join("\n"));
    expect(other.exitCode).toBe(0);
    expect(other.lines.join("\n")).not.toContain(vendorKey);
    expect(other.lines.join("\n")).not.toContain("JUDGEMENT_PRODUCER");
  });

  it("a bare long token typed as a table key or step: named in the detail only blanked", () => {
    const token = "q7".repeat(20); // a 40-character run, built at run time so the secret scanner sees no literal
    for (const table of [{ [token]: { level: "low" } }, { [GLM]: { steps: { [token]: "low" } } }]) {
      const result = checkThinkingLevels(line({ ...BASE, thinking_levels: table }));
      expect(result.exitCode).toBe(1);
      expect(result.lines.join("\n")).toContain("[REDACTED:long-run]");
      expect(result.lines.join("\n")).not.toContain(token);
    }
  });

  // Addition D14 (owner 2026-10-22): the setting may carry only the gate part; the line-up and its table then live in the
  // settings version (previewLineUpPolicy), so there is no table here to check.
  it("a sockets-only value: OK, and it says the line-up lives in the settings version, exit 0", () => {
    const { free_model_ids: _free, premium_model_ids: _premium, ...gate } = BASE;
    const expected = { exitCode: 0, lines: ["OK", "No line-up in this setting: it lives in the settings version (previewLineUpPolicy)."] };
    expect(checkThinkingLevels(line(gate))).toEqual(expected);
    const { anthropic_budget_socket: _anthropic, ...deepinfraOnly } = gate;
    expect(checkThinkingLevels(`${JSON.stringify(deepinfraOnly)}\n`)).toEqual(expected);
    // A table with no line-up to apply it to is the parser's refusal, as at boot.
    expect(checkThinkingLevels(line({ ...gate, thinking_levels: { [GLM]: { level: "low" } } })))
      .toEqual({ exitCode: 1, lines: ["PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID"] });
  });

  it("refuses no value, or two values", () => {
    expect(checkThinkingLevels("NODE_ENV=production")).toEqual({ exitCode: 2,
      lines: ["CHECK_REFUSED: no PREVIEW_PROVIDER_TEST_CONFIG_JSON= line (or bare JSON) found"] });
    expect(checkThinkingLevels([line(BASE), line(BASE)].join("\n"))).toEqual({ exitCode: 2,
      lines: ["CHECK_REFUSED: PREVIEW_PROVIDER_TEST_CONFIG_JSON appears more than once"] });
  });
});

describe("check-thinking-levels: the command", () => {
  const folders: string[] = [];
  afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

  it("--settings <file> reads the file; no flag reads stdin; anything else is refused with the usage line", () => {
    const folder = mkdtempSync(join(tmpdir(), "thinking-check-"));
    folders.push(folder);
    const file = join(folder, "settings.env");
    writeFileSync(file, `${line({ ...BASE, thinking_levels: { [GLM]: { level: "low" } } })}\n`);
    const stdinNever = () => { throw new Error("stdin read"); };
    expect(checkThinkingLevelsCommand(["--settings", file], { readStdin: stdinNever, stdinIsTTY: true }).exitCode).toBe(0);
    expect(checkThinkingLevelsCommand([], { readStdin: () => line(BASE), stdinIsTTY: false }).lines[0]).toBe("OK");
    const usage = checkThinkingLevelsCommand(["--other"], { readStdin: stdinNever, stdinIsTTY: true });
    expect(usage.exitCode).toBe(2);
    expect(usage.lines[0]).toMatch(/^CHECK_REFUSED: usage: /u);
    // A terminal on stdin and no --settings: the usage line, never a wait for typing.
    expect(checkThinkingLevelsCommand([], { readStdin: stdinNever, stdinIsTTY: true }).exitCode).toBe(2);
    expect(checkThinkingLevelsCommand(["--settings", join(folder, "missing.env")], { readStdin: stdinNever, stdinIsTTY: true }))
      .toEqual({ exitCode: 2, lines: ["CHECK_REFUSED: the settings file cannot be read"] });
  });
});

/**
 * Side-by-side spec §13, addition D23 (owner 2026-10-22): `--print-line-up` prints, from an old-form value (the one the
 * preview runs with today), the plan member the kit takes (`{"lineUp":{…}}`), so the first settings version is planned with
 * exactly today's line-up and the line-up does not change on the day the env moves to the sockets-only form.
 */
describe("check-thinking-levels --print-line-up: the plan member from today's value (addition D23)", () => {
  /** The owner's live table (final, 2026-10-13), pasted verbatim as SA1's and SA2's tests carry it. */
  const OWNER_LIVE_TABLE = JSON.parse(`{"zai-org/GLM-5.3-Flash":{"level":"high"},"deepseek-ai/DeepSeek-V4.1-Flash":{"level":"none"},"Qwen/Qwen3.8-Flash":{"level":"medium"},"XiaomiMiMo/MiMo-V2.6-Pro":{"level":"default","steps":{"pros_cons":"none","cross_exchange":"none"}},"claude-haiku-5-5":{"level":"medium","steps":{"judge_panel":"high","reviewer":"high","answer_checker":"high","story_checker":"high","answer_writer":"high","story_writer":"high","slip_fix":"medium"}}}`) as Record<string, unknown>;
  const OWNER_VALUE = { ...BASE, thinking_levels: OWNER_LIVE_TABLE };
  const MEMBER = JSON.stringify({ lineUp: { free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU], thinking_levels: OWNER_LIVE_TABLE } });

  it("the owner's value: exactly the plan member on one line, exit 0, and the kit's parser takes it unchanged", () => {
    const result = printLineUp([line(OWNER_VALUE), "JUDGEMENT_PRODUCER=p"].join("\n"));
    expect(result).toEqual({ exitCode: 0, lines: [MEMBER] });
    expect(parsePreviewLineUp(JSON.parse(result.lines[0]!).lineUp)).toEqual(JSON.parse(MEMBER).lineUp);
    // No table: the member says null (every AI at its default); the legacy five keys: GLM alone on both rosters.
    expect(printLineUp(line(BASE)).lines).toEqual([JSON.stringify({ lineUp: { free_model_ids: BASE.free_model_ids, premium_model_ids: BASE.premium_model_ids, thinking_levels: null } })]);
    const { anthropic_budget_socket: _a, premium_model_ids: _p, ...legacy } = { ...BASE, free_model_ids: [GLM] };
    expect(printLineUp(line(legacy))).toEqual({ exitCode: 0, lines: [JSON.stringify({ lineUp: { free_model_ids: [GLM], premium_model_ids: [GLM], thinking_levels: null } })] });
  });

  it("a sockets-only value: the SA3 sentence, exit 0, and no plan member", () => {
    const { free_model_ids: _free, premium_model_ids: _premium, ...gate } = BASE;
    expect(printLineUp(line(gate))).toEqual({ exitCode: 0, lines: ["No line-up in this setting: it lives in the settings version (previewLineUpPolicy)."] });
  });

  it("a refused or key-shaped value: the check's own lines and exit codes, nothing printed of it", () => {
    expect(printLineUp(line({ ...BASE, thinking_levels: { [GLM]: { level: "medium" } } }))).toEqual({ exitCode: 1, lines: [`PREVIEW_THINKING_LEVELS_INVALID:level:${GLM}`] });
    expect(printLineUp("PREVIEW_PROVIDER_TEST_CONFIG_JSON={not json")).toEqual({ exitCode: 1, lines: ["PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID"] });
    const vendorKey = ["sk", "ant", "x".repeat(6) + "Q9".repeat(12)].join("-");
    expect(printLineUp(line({ ...BASE, thinking_levels: { [vendorKey]: { level: "low" } } })).exitCode).toBe(2);
    expect(printLineUp("NODE_ENV=production").exitCode).toBe(2);
  });

  it("the command: --print-line-up with --settings <file> (either order) or stdin; anything else is the usage line", () => {
    const folder = mkdtempSync(join(tmpdir(), "line-up-print-"));
    try {
      const file = join(folder, "settings.env");
      writeFileSync(file, `${line(OWNER_VALUE)}\n`);
      const stdinNever = () => { throw new Error("stdin read"); };
      const tty = { readStdin: stdinNever, stdinIsTTY: true };
      expect(checkThinkingLevelsCommand(["--print-line-up", "--settings", file], tty)).toEqual({ exitCode: 0, lines: [MEMBER] });
      expect(checkThinkingLevelsCommand(["--settings", file, "--print-line-up"], tty)).toEqual({ exitCode: 0, lines: [MEMBER] });
      expect(checkThinkingLevelsCommand(["--print-line-up"], { readStdin: () => line(OWNER_VALUE), stdinIsTTY: false })).toEqual({ exitCode: 0, lines: [MEMBER] });
      for (const argv of [["--print-line-up"], ["--print-line-up", "--print-line-up"], ["--print-line-up", "--settings"], ["--print-line-up", file]]) {
        const usage = checkThinkingLevelsCommand(argv, tty);
        expect(usage.exitCode).toBe(2);
        expect(usage.lines[0]).toMatch(/^CHECK_REFUSED: usage: /u);
      }
      // Without the flag the check is unchanged.
      expect(checkThinkingLevelsCommand(["--settings", file], tty).lines[0]).toBe("OK");
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
});
