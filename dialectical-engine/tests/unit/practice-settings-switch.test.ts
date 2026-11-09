// V4 start step, Task 90b (the paid sitting of 9 Nov, its findings 1-4 and the gate figures written by hand): THE PRACTICE AND THE
// FREE CHECK FOLLOW THE OWNERS' SETTINGS SWITCH. The site runs the version the owners switched on (register.read_active_settings_version(),
// migration 0124), not the release's boot version in runner.env. So README S-1 exports up to the switched-on version and says which;
// S-2 writes that version into the practice's copy of the settings and, when the version carries the line-up, the gate part alone (as
// the live boot requires, D14/D15); S-6's start-step commands give the plan's DeepSeek checker; Task 90's world uses the gate part alone
// on a version with the line-up; and the private gate-figures file has a writer that prints nothing, fed by an S-step that copies each
// gate's two GO limits. The README's server lines are run here on made-up files (multiples of eleven), never on the owner's.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_LINE_UP_POLICY_ROW_KEY, previewLineUpPolicyRow } from "@debateai/register";
import { composePreviewProviderTestConfig, parsePreviewLineUp, type PreviewLineUp } from "@debateai/providers";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import { PracticeRefusal, parsePracticeSettings, practiceSettingsWithLineUp } from "../../tools/preview-practice/practice-settings.js";
import { PRACTICE_LINE_UP_MEMBERS, practiceSettingsTextForVersion, practiceSocketsOnlySettingsText } from "../../tools/preview-practice/practice-settings-switch.js";
import { PRACTICE_GATE_LIMITS_SCHEMA, practiceGateFiguresOf, writePracticeGateFiguresFile } from "../../tools/preview-practice/practice-gate-figures.js";
import { readPrivateGateFigures } from "../support/private-figures.js";

const README = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
const R22_WORLD = readFileSync(new URL("../support/r22-world.ts", import.meta.url), "utf8");

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const DEEPSEEK_CHECKER_REF = "preview:deepseek-v4-1-flash";
const GLM_CHECKER_REF = "preview:fixture-b";

const GATE = { deployment: "v3-preview", requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-unit" };
/** The live runner.env's full form (finding 3): both rosters and the thinking levels. */
const FULL_FORM = { ...GATE, free_model_ids: [GLM, DEEPSEEK, MIMO], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU],
  thinking_levels: { [DEEPSEEK]: { level: "low" } } };
/** The switched-on version's line-up (made up): lean Free, no MiMo there. */
const LINE_UP: PreviewLineUp = parsePreviewLineUp({ free_model_ids: [GLM, DEEPSEEK, QWEN, HAIKU], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU],
  thinking_levels: { [DEEPSEEK]: { level: "low" } } });
const settingsWith = (config: unknown, registerVersion = "11") => ["PREVIEW_PROVIDER_TEST_CONFIG_JSON=" + JSON.stringify(config),
  "PROVIDER_DISCOVERY_TARGETS_JSON=[]", `REGISTER_VERSION=${registerVersion}`, "DEBATEAI_DEPLOYMENT_MODE=local", "NODE_ENV=production",
  "CLAIM_MS=3000000", "CLAIM_MARGIN_MS=60000", "MAX_RECOMPOSE=1", "JUDGEMENT_NUMBER_KIND=k", "JUDGEMENT_PRODUCER=p",
  "PROPAGATION_NUMBER_KIND=k", "PROPAGATION_PRODUCER=p", "PROVIDER_REF=preview:fixture-a", "STRANGER_SAMPLE_RATE=0", "BATTERY_VERSION=s00",
  "SETTLEMENT_WATCH_HANDLE=h", ""].join("\n");

type Row = Readonly<{ rowKey: string; valueJsonText: string }>;
/** A made-up export of versions 21 to 23 in S-1's shape; `newest` are version 23's rows, `older` version 22's. */
function exportText(newest: readonly Row[], older: readonly Row[] = []): string {
  const version = (register_version: string, rows: number) => ({ register_version, row_count: rows, sealed: true, base_register_version: null,
    publication_id: null, request_sha256: null, snapshot_sha256: null, publication_kind: "GENERAL", recorded_at: null });
  const rows = (register_version: string, list: readonly Row[]) => list.map((row) => ({ register_version, row_key: row.rowKey,
    value_json: row.valueJsonText, source_ref: "made up" }));
  return JSON.stringify({ schema: "preview-practice-register-export-v1",
    versions: [version("21", 1), version("22", older.length + 1), version("23", newest.length + 1)],
    rows: [...rows("21", [{ rowKey: "alpha", valueJsonText: "11" }]), ...rows("22", [{ rowKey: "alpha", valueJsonText: "22" }, ...older]),
      ...rows("23", [{ rowKey: "alpha", valueJsonText: "33" }, ...newest])] });
}
const checkerRow = (providerRef: string): Row => ({ rowKey: "evaluatorRoleRef", valueJsonText: JSON.stringify({ providerRef }) });
const lineUpRow = (): Row => previewLineUpPolicyRow(LINE_UP, "kit");
/** A made-up billing row with a figure (a multiple of eleven) that the facts line must never print. */
const figureRow: Row = { rowKey: "billingPlans", valueJsonText: JSON.stringify({ perRunCeilingMicros: 4_400_000 }) };

/** The README's server-side python block whose script starts with `# <name>`: its argument words and its script. */
function pythonBlock(name: string): Readonly<{ args: string[]; script: string }> {
  const blocks = [...README.matchAll(/^\/usr\/bin\/python3 -I - ([^\n]*) <<'PY'\n([\s\S]*?)\nPY$/gmu)].filter((match) => match[2]!.startsWith(`# ${name}`));
  expect(blocks).toHaveLength(1);
  return { args: blocks[0]![1]!.split(" "), script: `${blocks[0]![2]!}\n` };
}
/** Runs a README python block as the server runs it (`python3 -I -`, the script on stdin) with these arguments. */
function runPython(name: string, args: readonly string[]) {
  const result = spawnSync("python3", ["-I", "-", ...args], { input: pythonBlock(name).script, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
/** One README step's text, from its heading to the next step's. */
function step(heading: string): string {
  const start = README.indexOf(`### ${heading}`);
  expect(start).toBeGreaterThan(0);
  const end = README.indexOf("\n### ", start + 4);
  return README.slice(start, end);
}

const folders: string[] = [];
const folder = (): string => { const made = mkdtempSync(join(tmpdir(), "practice-settings-switch-")); folders.push(made); return made; };
afterEach(() => {
  vi.restoreAllMocks();
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true });
});

describe("S-1: the export ends at the version the owners switched on, and says which", () => {
  it("reads the pointer in a read-only session, falls back to runner.env's boot version only when it is empty, and prints both", () => {
    const s1 = step("S-1").split("\n");
    const psql = "runuser -u postgres -- env PGOPTIONS='-c default_transaction_read_only=on' psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -X -q -At -v ON_ERROR_STOP=1 -c ";
    expect(s1).toContain("B=$(sed -n 's/^REGISTER_VERSION=//p' /etc/debateai-v3-preview/auth-dev-v1/runner.env)");
    expect(s1).toContain(`A=$(${psql}"SELECT register.read_active_settings_version()")`);
    expect(s1).toContain("V=${A:-$B}");
    expect(s1).toContain("echo \"register version: $V (switched on: ${A:-none}; the release's boot version: $B)\"");
    // The boot version alone never bounds the export any more (finding 1: 17 against the switched-on 23).
    expect(s1.some((line) => /^V=\$\(sed /u.test(line))).toBe(false);
    // The export itself is still the one read-only statement, bounded by $V (tests/unit/preview-practice.test.ts pins it).
    expect(s1.filter((line) => line.startsWith(psql) && line.includes("register_version <= ${V}"))).toHaveLength(1);
    // ... and the pointer's empty answer (psql -At prints nothing for NULL) is the boot version, a set pointer wins.
    const pick = (answer: string) => spawnSync("bash", ["-c", `A=${answer}; B=17; V=\${A:-$B}; printf %s "$V"`], { encoding: "utf8" }).stdout;
    expect(pick("")).toBe("17");
    expect(pick("23")).toBe("23");
  });

  it("then prints the export's newest version, its answer checker and whether it carries the line-up: words, never a figure", () => {
    const facts = pythonBlock("S-1 facts");
    expect(facts.args).toEqual(["/root/practice/register-export.json"]);
    const dir = folder();
    const deepseek = join(dir, "deepseek.json");
    writeFileSync(deepseek, exportText([checkerRow(DEEPSEEK_CHECKER_REF), lineUpRow(), figureRow]));
    expect(runPython("S-1 facts", [deepseek])).toEqual({ status: 0, stdout: "newest version: 23; answer checker: deepseek; line-up row: yes\n", stderr: "" });
    // GLM's checker, and a line-up row on an OLDER version only: the newest carries none.
    const glm = join(dir, "glm.json");
    writeFileSync(glm, exportText([checkerRow(GLM_CHECKER_REF), figureRow], [lineUpRow()]));
    expect(runPython("S-1 facts", [glm])).toEqual({ status: 0, stdout: "newest version: 23; answer checker: glm; line-up row: no\n", stderr: "" });
    const none = join(dir, "none.json");
    writeFileSync(none, exportText([figureRow]));
    expect(runPython("S-1 facts", [none]).stdout).toBe("newest version: 23; answer checker: other; line-up row: no\n");
  });
});

describe("S-2: the practice's copy of the settings follows the switched-on version (findings 2 and 3)", () => {
  it("names the export and the copy, prints nothing, and then shows only the version it wrote", () => {
    const s2 = step("S-2");
    expect(pythonBlock("S-2 settings").args).toEqual(["/root/practice/register-export.json", "/root/practice/settings.env"]);
    expect(s2).toContain("sed -n 's/^REGISTER_VERSION=//p' /root/practice/settings.env");
    // The block comes after both greps (it rewrites their file), before the keys are listed.
    expect(s2.indexOf("/usr/bin/python3 -I - ")).toBeGreaterThan(s2.indexOf(">> /root/practice/settings.env"));
    expect(s2.indexOf("/usr/bin/python3 -I - ")).toBeLessThan(s2.indexOf("cut -d= -f1 /root/practice/settings.env"));
  });

  it("a version with the line-up: REGISTER_VERSION is its number, the configuration the gate part alone, every other line unchanged", () => {
    const dir = folder();
    const exportPath = join(dir, "register-export.json");
    const settingsPath = join(dir, "settings.env");
    writeFileSync(exportPath, exportText([checkerRow(DEEPSEEK_CHECKER_REF), lineUpRow()]));
    const live = settingsWith(FULL_FORM, "17");
    writeFileSync(settingsPath, live, { mode: 0o600 });
    expect(runPython("S-2 settings", [exportPath, settingsPath])).toEqual({ status: 0, stdout: "", stderr: "" });
    const written = readFileSync(settingsPath, "utf8");
    expect(statSync(settingsPath).mode & 0o777).toBe(0o600);
    // The same text the world's (and any Mac-side) form gives: the TS helper and the server's python agree, line for line.
    const expected = practiceSocketsOnlySettingsText(live.replace("REGISTER_VERSION=17\n", "REGISTER_VERSION=23\n"));
    const lines = written.split("\n");
    const expectedLines = expected.split("\n");
    expect(lines).toHaveLength(expectedLines.length);
    lines.forEach((line, index) => {
      if (line.startsWith("PREVIEW_PROVIDER_TEST_CONFIG_JSON=")) {
        expect(JSON.parse(line.slice(line.indexOf("=") + 1))).toEqual(JSON.parse(expectedLines[index]!.slice(expectedLines[index]!.indexOf("=") + 1)));
      } else {
        expect(line).toBe(expectedLines[index]);
      }
    });
    expect(JSON.parse(lines[0]!.slice(lines[0]!.indexOf("=") + 1))).toEqual(GATE);
    // The practice now runs on the version's line-up, where the live copy refused (the sitting's PREVIEW_LINE_UP_ENV_CONFLICT).
    expect(() => practiceSettingsWithLineUp(parsePracticeSettings(live), LINE_UP, { trial: false })).toThrow("PREVIEW_LINE_UP_ENV_CONFLICT");
    const settings = parsePracticeSettings(written);
    expect(settings.runner.REGISTER_VERSION).toBe(23);
    expect(practiceSettingsWithLineUp(settings, LINE_UP, { trial: false }).previewConfig)
      .toEqual(composePreviewProviderTestConfig(settings.runner.PREVIEW_GATE_SETTINGS, LINE_UP));
  });

  it("a version without the line-up: only REGISTER_VERSION changes; the rosters stay, byte for byte", () => {
    const dir = folder();
    const exportPath = join(dir, "register-export.json");
    const settingsPath = join(dir, "settings.env");
    writeFileSync(exportPath, exportText([checkerRow(GLM_CHECKER_REF)], [lineUpRow()]));
    const live = settingsWith(FULL_FORM, "17");
    writeFileSync(settingsPath, live, { mode: 0o600 });
    expect(runPython("S-2 settings", [exportPath, settingsPath])).toEqual({ status: 0, stdout: "", stderr: "" });
    expect(readFileSync(settingsPath, "utf8")).toBe(live.replace("REGISTER_VERSION=17\n", "REGISTER_VERSION=23\n"));
  });

  it("a copy it cannot read refuses in one line that quotes nothing, and leaves the file as it was", () => {
    const dir = folder();
    const exportPath = join(dir, "register-export.json");
    const settingsPath = join(dir, "settings.env");
    writeFileSync(exportPath, exportText([lineUpRow()]));
    const noVersion = settingsWith(FULL_FORM).replace("REGISTER_VERSION=11\n", "");
    writeFileSync(settingsPath, noVersion, { mode: 0o600 });
    const refused = runPython("S-2 settings", [exportPath, settingsPath]);
    expect(refused).toEqual({ status: 1, stdout: "", stderr: "S-2 refused: the export or the settings copy does not read as expected (nothing written)\n" });
    expect(readFileSync(settingsPath, "utf8")).toBe(noVersion);
  });

  it("the README says why, and keeps the practice's own rule (REGISTER_VERSION is the export's newest version)", () => {
    expect(step("S-2")).toContain("register.read_active_settings_version()");
    expect(README).toContain("its `REGISTER_VERSION`, which S-2 sets to the switched-on version, must still be the export's newest version");
  });
});

describe("the gate part alone: practiceSocketsOnlySettingsText and practiceSettingsTextForVersion", () => {
  it("drops the three line-up members from the configuration line only, keeping the gate part's order", () => {
    expect(PRACTICE_LINE_UP_MEMBERS).toEqual(["free_model_ids", "premium_model_ids", "thinking_levels"]);
    const live = settingsWith(FULL_FORM);
    const alone = practiceSocketsOnlySettingsText(live);
    expect(alone).toBe(settingsWith(GATE));
    // Already the gate part alone: unchanged.
    expect(practiceSocketsOnlySettingsText(alone)).toBe(alone);
  });

  it("a version without the line-up keeps the text itself (byte for byte); with it, the gate part alone", () => {
    const live = settingsWith(FULL_FORM);
    expect(practiceSettingsTextForVersion(live, null)).toBe(live);
    expect(practiceSettingsTextForVersion(live, LINE_UP)).toBe(settingsWith(GATE));
  });

  it("refuses a text without exactly one configuration line, or one that is not a JSON object, never quoting it", () => {
    const refusal = (text: string): PracticeRefusal => {
      try { practiceSocketsOnlySettingsText(text); } catch (error) { if (error instanceof PracticeRefusal) return error; throw error; }
      throw new Error("expected a PracticeRefusal");
    };
    const missing = refusal("REGISTER_VERSION=11\n");
    expect(missing.code).toBe("PRACTICE_SETTINGS_VALUE_INVALID");
    expect(missing.message).toBe("PRACTICE_SETTINGS_VALUE_INVALID: PREVIEW_PROVIDER_TEST_CONFIG_JSON");
    expect(refusal(`${settingsWith(FULL_FORM)}${settingsWith(FULL_FORM)}`).code).toBe("PRACTICE_SETTINGS_VALUE_INVALID");
    const secretish = refusal("PREVIEW_PROVIDER_TEST_CONFIG_JSON=[\"sk-made-up-0000\"]\n");
    expect(secretish.message).not.toContain("sk-made-up");
    expect(refusal("PREVIEW_PROVIDER_TEST_CONFIG_JSON={not json\n").message).toBe("PRACTICE_SETTINGS_VALUE_INVALID: PREVIEW_PROVIDER_TEST_CONFIG_JSON");
  });
});

describe("Task 90's world: the gate part alone when the version it runs on carries the line-up (finding 2)", () => {
  it("reads the version's line-up first, then parses the settings text for that version and composes that same row", () => {
    const flat = R22_WORLD.replace(/\s+/gu, " ");
    const read = flat.indexOf("const lineUpRow = await readPreviewLineUpPolicy(database.pool, nextVersion);");
    const parse = flat.indexOf("const parsed = parsePracticeSettings(practiceSettingsTextForVersion(settingsText(startStepSwitch), lineUpRow), { sourceRevision: SOURCE_REVISION });");
    const compose = flat.indexOf("const settings = practiceSettingsWithLineUp(versioned, lineUpRow, { trial: false });");
    expect(read).toBeGreaterThan(0);
    expect(parse).toBeGreaterThan(read);
    expect(compose).toBeGreaterThan(parse);
    // The made-up exports carry no line-up row: their settings text is today's, so their worlds are unchanged.
    expect(flat).toContain("free_model_ids: freeModelIds, premium_model_ids: FIVE };");
  });
});

/** Made-up gate figures (multiples of eleven), as root's status prints them, with members the writer must leave behind. */
const deepinfraStatus = { state: "active", reason: null, provider: "deepinfra", enabled_models: [GLM, DEEPSEEK, MIMO, QWEN], unsent_streak: 0,
  daily_budget_usd: "11.00", today_spend_usd: "2.20", remaining_today_usd: "8.80", today_posts: 33, max_paid_posts_per_day: 1100, in_flight: 0, halts: [] };
const anthropicStatus = { state: "active", reason: null, provider: "anthropic", enabled_models: [HAIKU], unsent_streak: 0,
  daily_budget_usd: "22.00", today_spend_usd: "0.00", remaining_today_usd: "22.00", today_posts: 0, max_paid_posts_per_day: 2200, in_flight: 0, halts: [] };
const deepinfraGo = { schema: "preview-provider-budget-go-v3", provider: "deepinfra", allow_paid_calls: true, enabled_models: [GLM],
  allowed_peer_uids: [1100], daily_budget_usd: "11.00", max_paid_posts_per_day: 1100, max_concurrent_calls: 11, max_final_writer_calls: 11, open_days: 11 };
const anthropicGo = { schema: "preview-provider-budget-go-v3", provider: "anthropic", allow_paid_calls: true, enabled_models: [HAIKU],
  allowed_peer_uids: [2200], daily_budget_usd: "22.00", max_paid_posts_per_day: 2200, max_concurrent_calls: 22, open_days: 22 };
const hostedBilling = { billing: "on", perRunCeilingMicros: 3_300_000, dailyCeilingMicros: 110_000_000, askRoomReads: { limit: 660, windowMs: 66_000, capacity: 65_536 } };

/**
 * Task 90c: the gate's OWN largest full-size holds for these models (packages/providers/ops/preview_budget_authority.py, as its
 * /remaining answers them: largest_reservation and largest_final_writer_reservation over the code's reviewed rows), rounded UP to six
 * places, the private file's precision. These are the code's list prices, not a pot.
 */
function gateOwnLargest(provider: "deepinfra" | "anthropic", models: readonly string[]): Readonly<{ standard: string; finalWriter: string }> {
  const script = [
    "import json, sys",
    "from decimal import Decimal, ROUND_CEILING",
    "sys.path.insert(0, sys.argv[1])",
    "import preview_budget_authority as a",
    "a.load_helper(skip_custody_for_tests=True)",
    "profile, models = a.profile_of(sys.argv[2]), json.loads(sys.argv[3])",
    "six = lambda value: str(value.quantize(Decimal('0.000001'), rounding=ROUND_CEILING))",
    "print(json.dumps({'standard': six(a.largest_reservation(profile, models)), 'finalWriter': six(a.largest_final_writer_reservation(profile, models))}))"
  ].join("\n");
  const ops = new URL("../../packages/providers/ops/", import.meta.url).pathname;
  const result = spawnSync("python3", ["-I", "-c", script, ops, provider, JSON.stringify(models)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`gateOwnLargest: ${result.stderr}`);
  return JSON.parse(result.stdout) as { standard: string; finalWriter: string };
}

describe("the gate figures: S-3b copies each gate's two GO limits, the Mac writes the private file and prints nothing (Task 90)", () => {
  /** Runs S-3b's python on made-up GO and billing files into `dir` (as root runs it into /root/practice). */
  function s3b(dir: string) {
    const deepinfra = join(dir, "deepinfra-go.json");
    const anthropic = join(dir, "anthropic-go.json");
    const billing = join(dir, "hosted-billing-v1.json");
    writeFileSync(deepinfra, JSON.stringify(deepinfraGo));
    writeFileSync(anthropic, JSON.stringify(anthropicGo));
    writeFileSync(billing, JSON.stringify(hostedBilling));
    return runPython("S-3b limits", [deepinfra, anthropic, billing, dir]);
  }

  it("S-3b reads the two GO files and the hosted billing read-only, names its files, and installs both copies for the Mac", () => {
    const s3 = step("S-3b");
    expect(pythonBlock("S-3b limits").args).toEqual(["/etc/debateai-v3-preview/provider-deepinfra-go-v3.json",
      "/etc/debateai-v3-preview/provider-anthropic-go-v1.json", "/etc/debateai-v3-preview/hosted-billing-v1.json", "/root/practice"]);
    expect(s3).toContain("install -o ubuntu -g ubuntu -m 0600 /root/practice/gate-limits.json /root/practice/hosted-billing.json /home/ubuntu/practice/");
  });

  it("S-3b writes only the two limits per gate and the hosted billing with billing off, private, printing nothing", () => {
    const dir = folder();
    expect(s3b(dir)).toEqual({ status: 0, stdout: "", stderr: "" });
    expect(JSON.parse(readFileSync(join(dir, "gate-limits.json"), "utf8"))).toEqual({ schema: PRACTICE_GATE_LIMITS_SCHEMA,
      deepinfra: { max_concurrent_calls: 11, max_final_writer_calls: 11 }, anthropic: { max_concurrent_calls: 22 } });
    expect(JSON.parse(readFileSync(join(dir, "hosted-billing.json"), "utf8"))).toEqual({ ...hostedBilling, billing: "off" });
    expect(statSync(join(dir, "gate-limits.json")).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "hosted-billing.json")).mode & 0o777).toBe(0o600);
  });

  it("the writer builds the file Task 90 reads from the status files, the limits and the billing, and prints nothing", () => {
    const dir = folder();
    expect(s3b(dir).status).toBe(0);
    writeFileSync(join(dir, "deepinfra-status.json"), JSON.stringify(deepinfraStatus));
    writeFileSync(join(dir, "anthropic-status.json"), JSON.stringify(anthropicStatus));
    const out = join(dir, "gate-figures.json");
    const printed = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"),
      vi.spyOn(process.stdout, "write"), vi.spyOn(process.stderr, "write")];
    writePracticeGateFiguresFile(dir, out);
    for (const spy of printed) expect(spy).not.toHaveBeenCalled();
    expect(statSync(out).mode & 0o777).toBe(0o600);
    // Task 90c: each gate's largest hold as the gate answers it; the final-writer room only as a pair (its GO names the calls).
    const deepinfraLargest = gateOwnLargest("deepinfra", [GLM, DEEPSEEK, MIMO, QWEN]);
    const anthropicLargest = gateOwnLargest("anthropic", [HAIKU]);
    expect(readPrivateGateFigures({ DEBATEAI_PRIVATE_GATE_FIGURES: out })).toEqual({
      schema: "debateai-private-gate-figures-v1",
      gates: {
        deepinfra: { daily_budget_usd: "11.00", max_paid_posts_per_day: 1100, max_concurrent_calls: 11, final_writer_max_in_flight: 11,
          largest_reservation_usd: deepinfraLargest.standard, largest_final_writer_reservation_usd: deepinfraLargest.finalWriter,
          enabled_models: [GLM, DEEPSEEK, MIMO, QWEN] },
        anthropic: { daily_budget_usd: "22.00", max_paid_posts_per_day: 2200, max_concurrent_calls: 22, largest_reservation_usd: anthropicLargest.standard,
          enabled_models: [HAIKU] }
      },
      hosted_billing: { ...hostedBilling, billing: "off" }
    });
    // A file that is there already is never written over.
    const before = readFileSync(out, "utf8");
    expect(() => writePracticeGateFiguresFile(dir, out)).toThrow();
    expect(readFileSync(out, "utf8")).toBe(before);
  });

  it("refuses an input without a member it needs, naming the file and the member, never a value", () => {
    const texts = { deepinfraStatus: JSON.stringify(deepinfraStatus), anthropicStatus: JSON.stringify(anthropicStatus),
      limits: JSON.stringify({ schema: PRACTICE_GATE_LIMITS_SCHEMA, deepinfra: { max_concurrent_calls: 11 }, anthropic: { max_concurrent_calls: 22 } }),
      hostedBilling: JSON.stringify({ ...hostedBilling, billing: "off" }) };
    expect(practiceGateFiguresOf(texts).gates.deepinfra).not.toHaveProperty("final_writer_max_in_flight");
    expect(practiceGateFiguresOf(texts).gates.deepinfra).not.toHaveProperty("largest_final_writer_reservation_usd");
    const refusal = (changed: Partial<typeof texts>): string => {
      try { practiceGateFiguresOf({ ...texts, ...changed }); } catch (error) { if (error instanceof PracticeRefusal) return error.message; throw error; }
      throw new Error("expected a PracticeRefusal");
    };
    const { max_paid_posts_per_day: _posts, ...noPosts } = anthropicStatus;
    expect(refusal({ anthropicStatus: JSON.stringify(noPosts) })).toBe("PRACTICE_GATE_FIGURES_INPUT_INVALID: anthropic-status.json:max_paid_posts_per_day");
    expect(refusal({ deepinfraStatus: JSON.stringify({ ...deepinfraStatus, daily_budget_usd: "11,00" }) }))
      .toBe("PRACTICE_GATE_FIGURES_INPUT_INVALID: deepinfra-status.json:daily_budget_usd");
    expect(refusal({ limits: JSON.stringify({ schema: PRACTICE_GATE_LIMITS_SCHEMA, deepinfra: {}, anthropic: { max_concurrent_calls: 22 } }) }))
      .toBe("PRACTICE_GATE_FIGURES_INPUT_INVALID: gate-limits.json:deepinfra.max_concurrent_calls");
    expect(refusal({ limits: JSON.stringify({ schema: "other", deepinfra: { max_concurrent_calls: 11 }, anthropic: { max_concurrent_calls: 22 } }) }))
      .toBe("PRACTICE_GATE_FIGURES_INPUT_INVALID: gate-limits.json:schema");
    expect(refusal({ hostedBilling: "[1100]" })).toBe("PRACTICE_GATE_FIGURES_INPUT_INVALID: hosted-billing.json:$");
    expect(refusal({ deepinfraStatus: "{not json 1100" })).toBe("PRACTICE_GATE_FIGURES_INPUT_INVALID: deepinfra-status.json:$");
    // Task 90c: a model the code does not review has no hold the gate would answer (its /remaining refuses REMAINING_UNAVAILABLE).
    expect(refusal({ deepinfraStatus: JSON.stringify({ ...deepinfraStatus, enabled_models: [GLM, "made-up/model-11"] }) }))
      .toBe("PRACTICE_GATE_FIGURES_INPUT_INVALID: deepinfra-status.json:enabled_models");
    expect(refusal({ anthropicStatus: JSON.stringify({ ...anthropicStatus, enabled_models: [GLM] }) }))
      .toBe("PRACTICE_GATE_FIGURES_INPUT_INVALID: anthropic-status.json:enabled_models");
  });

  it("the README's Mac line calls the writer on $P and names the two files Task 90 reads", () => {
    expect(README).toContain("P=\"$P\" node_modules/.bin/tsx -e 'import(\"./tools/preview-practice/practice-gate-figures.ts\").then((m) => "
      + "m.writePracticeGateFiguresFile(process.env.P, `${process.env.P}/gate-figures.json`))'");
    expect(README).toContain("DEBATEAI_PRIVATE_GATE_FIGURES=\"$P/gate-figures.json\"");
    expect(README).toContain("DEBATEAI_PRIVATE_REGISTER_EXPORT=\"$P/register-export.json\"");
  });
});

describe("S-6: the start-step commands give the plan's DeepSeek checker and the hosted billing (finding 3)", () => {
  it("both start-step lines carry --hosted-billing \"$HB\" and the DeepSeek checker, and parse; HB is S-3b's copy, billing off", () => {
    const lines = README.split("\n").filter((line) => line.includes("tools/preview-practice/practice.ts debate ") && line.includes(" --start-step "));
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toContain(" --register-next --hosted-billing \"$HB\" --checker deepseek --deepseek-enabled-on-gate yes ");
      const args = parsePracticeArgs(line.slice(line.indexOf("practice.ts ") + "practice.ts ".length).trim().split(/\s+/u)
        .map((word) => word.replace(/^"(.*)"$/u, "$1")));
      expect(args.flags.get("--checker")).toBe("deepseek");
      expect(args.flags.get("--deepseek-enabled-on-gate")).toBe("yes");
      expect(args.flags.get("--hosted-billing")).toBe("$HB");
    }
    expect(README.split("\n")).toContain("HB=\"$(cat \"$P/hosted-billing.json\")\"");
    expect(README).toContain("When S-1 printed `answer checker: glm`, leave out `--checker deepseek --deepseek-enabled-on-gate yes`");
  });
});
