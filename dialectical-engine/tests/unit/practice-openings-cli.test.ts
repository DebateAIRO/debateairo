// The preview practice's `openings` command (tools/preview-practice/practice.ts): its flags, --dry (scripted gates, no
// socket, nothing spent), the start checks of a real run, and openings.jsonl + report.json + report.md on every way out
// (the end, a first and a second interrupt, the tool breaking midway). The real gate builders are replaced here by
// pass-through spies, so a test can prove --dry never builds them; the real-run case hands them the dry script.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPreviewBudgetRpcPort,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  previewTargetJsonRow,
  type PreviewGateRemaining
} from "@debateai/providers";
import { practiceRemainingPorts } from "../../tools/preview-practice/practice-ask-composition.js";
import { OPENINGS_DRY_MODELS, openingsDryPorts } from "../../tools/preview-practice/practice-openings-dry.js";
import { practiceSocketsFromEnvironment } from "../../tools/preview-practice/practice-settings.js";
import { parsePracticeArgs, practiceFinishedUnit, repositoryRoot, runPractice } from "../../tools/preview-practice/practice.js";

vi.mock("@debateai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@debateai/providers")>();
  return { ...real, createPreviewBudgetRpcPort: vi.fn(real.createPreviewBudgetRpcPort) };
});
vi.mock("../../tools/preview-practice/practice-ask-composition.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../tools/preview-practice/practice-ask-composition.js")>();
  return { ...real, practiceRemainingPorts: vi.fn(real.practiceRemainingPorts) };
});
vi.mock("../../tools/preview-practice/practice-settings.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../tools/preview-practice/practice-settings.js")>();
  return { ...real, practiceSocketsFromEnvironment: vi.fn(real.practiceSocketsFromEnvironment) };
});

const HAIKU = "claude-haiku-5-5";
const quiet = { log: () => undefined, sleep: async () => undefined, wait: async () => undefined };
const folders: string[] = [];
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => {
  vi.restoreAllMocks();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const freshFolder = () => { const folder = mkdtempSync(join(tmpdir(), "pp-openings-cli-")); folders.push(folder); return folder; };
const freshOut = () => join(freshFolder(), "out");
const jsonl = (out: string) => readFileSync(join(out, "openings.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, any>);
const report = (out: string) => JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Record<string, any>;

describe("practice openings: the command line", () => {
  it("parses openings with --dry, --questions and --arms", () => {
    const args = parsePracticeArgs(["openings", "--dry", "--questions", "ro-euro,en-rent-caps", "--arms", "A,C", "--out", "/tmp/openings"]);
    expect(args.mode).toBe("openings");
    expect(args.switches.has("--dry")).toBe(true);
    expect(args.flags.get("--questions")).toBe("ro-euro,en-rent-caps");
    expect(args.flags.get("--arms")).toBe("A,C");
  });

  it("--dry runs every arm, writes openings.jsonl and both reports outside the repository, and spends nothing", async () => {
    const out = freshOut();
    const result = await runPractice(["openings", "--dry", "--questions", "ro-euro,en-four-day-week", "--out", out], {}, quiet);
    expect([result.report.verdict, result.exitCode]).toEqual(["PASS_WITH_WARNINGS", 10]);
    expect(result.report.reasons.some((reason) => reason.startsWith("MODEL_BUSY_PARTLY:"))).toBe(true);
    expect(result.report.reasons).toContain(`FORMAT_REPAIRED:${HAIKU}:1`);
    const lines = jsonl(out);
    expect(lines[0]).toMatchObject({ kind: "start", mode: "openings", dry: true, questions: ["ro-euro", "en-four-day-week"], arms: ["T", "A", "B", "C"],
      remainingBefore: { deepinfra: null, anthropic: null } });
    expect((lines[0]!.questionDigests as { id: string; sha256: string }[]).map((digest) => digest.id)).toEqual(["ro-euro", "en-four-day-week"]);
    expect((lines[0]!.questionDigests as { id: string; sha256: string }[]).every((digest) => /^[0-9a-f]{12}$/u.test(digest.sha256))).toBe(true);
    expect([...(lines[0]!.models as string[])].sort()).toEqual([...OPENINGS_DRY_MODELS].sort());
    expect(lines.filter((line) => line.kind === "arm").map((line) => `${String(line.arm.questionId)}:${String(line.arm.arm)}`)).toEqual([
      "ro-euro:T", "ro-euro:A", "ro-euro:B", "ro-euro:C", "en-four-day-week:T", "en-four-day-week:A", "en-four-day-week:B", "en-four-day-week:C"]);
    const marks = lines.filter((line) => line.kind === "arm").flatMap((line) => (line.arm.marks as { mark: string }[]).map((mark) => mark.mark));
    expect(marks).toEqual(expect.arrayContaining(["MAP_MERGE_FALLBACK", "ANSWERS_FILLED"]));
    const calls = lines.filter((line) => line.kind === "call").map((line) => line.call as Record<string, any>);
    expect(calls.some((call) => call.status === "REPAIRED" && call.replyForm === "PATCH")).toBe(true);
    for (const call of calls.filter((entry) => entry.status === "ACCEPTED" || entry.status === "REPAIRED")) {
      expect(typeof call.replyText).toBe("string");
      expect(call.inputTokens).toBeGreaterThanOrEqual(100);
      expect(call.shown === "BLIND" || Array.isArray(call.shown)).toBe(true);
    }
    expect(lines.filter((line) => line.kind === "wire").length).toBeGreaterThan(0);
    expect(lines.at(-1)).toMatchObject({ kind: "end", interrupted: false, remainingAfter: { deepinfra: null, anthropic: null } });
    expect(report(out)).toMatchObject({ mode: "openings", dry: true, verdict: "PASS_WITH_WARNINGS" });
    expect(readFileSync(join(out, "report.md"), "utf8")).toContain("Openings per arm");
    expect(readFileSync(join(out, "report.md"), "utf8").split("\n")[0]).toBe("# Preview practice (openings, dry: scripted answers, nothing spent): PASS_WITH_WARNINGS");
  });

  it("--dry never builds a real gate port, never reads the sockets, never fetches and never opens a socket (ruling T11-m3)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const connectSpy = vi.spyOn(Socket.prototype, "connect");
    const env = { PRACTICE_ACK: "spends-real-money", PRACTICE_DEEPINFRA_SOCKET: "/x/deepinfra.sock", PRACTICE_ANTHROPIC_SOCKET: "/x/anthropic.sock" };
    const result = await runPractice(["openings", "--dry", "--questions", "en-rent-caps", "--arms", "T,B", "--out", freshOut()], env, quiet);
    expect(result.exitCode).toBe(10);
    expect(vi.mocked(createPreviewBudgetRpcPort)).not.toHaveBeenCalled();
    expect(vi.mocked(practiceRemainingPorts)).not.toHaveBeenCalled();
    expect(vi.mocked(practiceSocketsFromEnvironment)).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("refuses an --out folder inside the repository, and writes nothing there", async () => {
    const inside = join(repositoryRoot(), "openings-report-must-not-exist");
    const result = await runPractice(["openings", "--dry", "--out", inside], {}, quiet);
    expect([result.report.verdict, result.exitCode]).toEqual(["HARNESS_ERROR", 40]);
    expect(result.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_REPORT_INSIDE_REPOSITORY"]);
    expect(existsSync(inside)).toBe(false);
  });

  it("--questions cannot carry a question: free text is refused, never sent, never repeated", async () => {
    const out = freshOut();
    const lines: string[] = [];
    const result = await runPractice(["openings", "--dry", "--questions", "Should I lie to my boss?", "--out", out], {},
      { ...quiet, log: (line) => { lines.push(line); } });
    expect(result.exitCode).toBe(40);
    expect(result.report.reasons[0]).toMatch(/^HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID/u);
    expect(JSON.stringify(result.report)).not.toContain("lie to my boss");
    expect(lines.join("\n")).not.toContain("lie to my boss");
    expect(existsSync(join(out, "openings.jsonl"))).toBe(false);
  });

  it("keeps the openings flags to the openings mode", async () => {
    for (const argv of [["formats", "--dry"], ["formats", "--arms", "T"], ["debate", "--questions", "ro-euro"]]) {
      const result = await runPractice([...argv, "--out", freshOut()], {}, quiet);
      expect(result.report.reasons[0]).toMatch(/^HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID/u);
    }
    const unknownArm = await runPractice(["openings", "--dry", "--arms", "X", "--out", freshOut()], {}, quiet);
    expect(unknownArm.report.reasons[0]).toMatch(/^HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID/u);
  });

  // A flag openings does not read would be ignored silently: a typo (--question for --questions) would start the full
  // paid comparison. Each is refused, before anything is written, sent or read.
  for (const [extra, label] of [
    [["--question", "en-rent-caps"], "--question"], [["--models", HAIKU], "--models"], [["--lanes", "PANEL"], "--lanes"],
    [["--samples", "1"], "--samples"], [["--gap-ms", "0"], "--gap-ms"], [["--depth", "1"], "--depth"],
    [["--register-export", "/x/register.json"], "--register-export"], [["--sequential"], "--sequential"], [["--transcript"], "--transcript"]
  ] as const) {
    for (const dry of [true, false]) {
      it(`refuses ${label} in openings${dry ? " --dry" : ""}, before anything is written or sent`, async () => {
        const out = freshOut();
        const result = await runPractice(["openings", ...(dry ? ["--dry"] : []), "--arms", "T", ...extra, "--out", out], {}, quiet);
        expect([result.report.verdict, result.exitCode]).toEqual(["HARNESS_ERROR", 40]);
        expect(result.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"]);
        expect(existsSync(out)).toBe(false);
      });
    }
  }

  for (const [extra, label] of [
    [["--settings", "/x/settings.env"], "--settings"], [["--gate-status-deepinfra", "/x/status.json"], "--gate-status-deepinfra"],
    [["--gate-status-anthropic", "/x/status.json"], "--gate-status-anthropic"]
  ] as const) {
    it(`refuses the real-run-only ${label} with --dry (a dry run reads no setting and no gate status)`, async () => {
      const out = freshOut();
      const result = await runPractice(["openings", "--dry", "--arms", "T", ...extra, "--out", out], {}, quiet);
      expect(result.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"]);
      expect(existsSync(out)).toBe(false);
    });
  }

  it("still accepts every flag openings reads (dry: --busy-wait-minutes, --max-in-flight)", async () => {
    const result = await runPractice(["openings", "--dry", "--questions", "en-rent-caps", "--arms", "T", "--busy-wait-minutes", "0",
      "--max-in-flight", "3", "--out", freshOut()], {}, quiet);
    expect(result.exitCode).toBe(0);
  });

  it("`report --out` rebuilds report.json and report.md from openings.jsonl when the folder holds one (F-I4)", async () => {
    const out = freshOut();
    const first = await runPractice(["openings", "--dry", "--questions", "en-rent-caps", "--arms", "T,B", "--out", out], {}, quiet);
    const markdown = readFileSync(join(out, "report.md"), "utf8");
    const before = report(out);
    rmSync(join(out, "report.json"));
    rmSync(join(out, "report.md"));
    const rebuilt = await runPractice(["report", "--out", out], {}, quiet);
    expect([rebuilt.report.mode, rebuilt.report.verdict, rebuilt.exitCode]).toEqual(["openings", first.report.verdict, first.exitCode]);
    expect(report(out).byArm).toEqual(before.byArm);
    expect(report(out).totals).toEqual(before.totals);
    expect(readFileSync(join(out, "report.md"), "utf8")).toBe(markdown);
    expect(existsSync(join(out, "samples.jsonl"))).toBe(false);
  });

  it("`report --out` on a folder with neither log still refuses as the formats rebuild does", async () => {
    const result = await runPractice(["report", "--out", freshFolder()], {}, quiet);
    expect(result.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_SAMPLES_LOG_MISSING"]);
  });

  it("the interrupt messages name the finished calls in openings, the finished samples elsewhere", () => {
    expect(practiceFinishedUnit("openings")).toBe("calls");
    for (const mode of ["formats", "debate", "report", undefined]) expect(practiceFinishedUnit(mode)).toBe("samples");
  });

  it("a real openings run passes the same start checks as formats (here: the acknowledgement)", async () => {
    const result = await runPractice(["openings", "--settings", join(tmpdir(), "no-such-settings.env"), "--out", freshOut()], {}, quiet);
    expect(result.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_ACK_REQUIRED"]);
  });

  it("refuses a folder that already holds another run's openings.jsonl, and leaves that run's report as it is", async () => {
    const out = freshOut();
    await runPractice(["openings", "--dry", "--questions", "en-rent-caps", "--arms", "T", "--out", out], {}, quiet);
    const before = readFileSync(join(out, "report.json"), "utf8");
    const again = await runPractice(["openings", "--dry", "--questions", "en-rent-caps", "--arms", "T", "--out", out], {}, quiet);
    expect(again.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_OUT_ALREADY_HOLDS_OPENINGS"]);
    expect(readFileSync(join(out, "report.json"), "utf8")).toBe(before);
  });
});

describe("practice openings: the log and the report on every way out", () => {
  it("a second interrupt midway still writes the report from the finished calls (ABORTED)", async () => {
    const out = freshOut();
    let abort: ((code: string) => number) | null = null;
    let seen = 0;
    const result = await runPractice(["openings", "--dry", "--questions", "ro-euro", "--arms", "T,C", "--out", out], {}, { ...quiet,
      onControl: (control) => { abort = control.abort; },
      log: (line) => { if (line.includes("JUDGE:root:secondary")) { seen += 1; if (seen === 1) abort?.("OPERATOR_SECOND_INTERRUPT"); } } });
    expect([result.report.verdict, result.exitCode]).toEqual(["ABORTED", 50]);
    expect(result.report.reasons[0]).toBe("ABORTED:OPERATOR_SECOND_INTERRUPT");
    const lines = jsonl(out);
    expect(lines.some((line) => line.kind === "abort")).toBe(true);
    expect(lines.some((line) => line.kind === "call")).toBe(true);
    // No arm of C was started after the abort.
    expect(lines.filter((line) => line.kind === "call").every((line) => line.call.arm === "T")).toBe(true);
    expect(report(out).verdict).toBe("ABORTED");
  });

  it("a first interrupt lets the arm in progress finish with a STOPPED note, starts no new arm, and ends NOT_PROVEN (ruling T11-m1)", async () => {
    const out = freshOut();
    let stop: (() => void) | null = null;
    let seen = 0;
    const result = await runPractice(["openings", "--dry", "--questions", "ro-euro,en-rent-caps", "--arms", "T,B", "--out", out], {}, { ...quiet,
      onControl: (control) => { stop = control.stop; },
      log: (line) => { if (line.includes("JUDGE:root:secondary")) { seen += 1; if (seen === 1) stop?.(); } } });
    expect([result.report.verdict, result.exitCode]).toEqual(["NOT_PROVEN", 30]);
    expect(result.report.reasons).toContain("RUN_INTERRUPTED");
    const lines = jsonl(out);
    const arms = lines.filter((line) => line.kind === "arm").map((line) => line.arm as Record<string, any>);
    expect(arms.map((arm) => `${String(arm.questionId)}:${String(arm.arm)}`)).toEqual(["ro-euro:T"]);
    expect(arms[0]!.notes).toEqual([expect.objectContaining({ note: "STOPPED", step: "POSITION" })]);
    expect(String(arms[0]!.notes[0].detail)).toContain("OPERATOR_INTERRUPT");
    const calls = lines.filter((line) => line.kind === "call").map((line) => line.call as Record<string, any>);
    expect(calls.every((call) => call.arm === "T" && call.questionId === "ro-euro")).toBe(true);
    expect(lines.at(-1)).toMatchObject({ kind: "end", interrupted: true });
    expect(report(out)).toMatchObject({ verdict: "NOT_PROVEN" });
    expect(report(out).byArm.find((row: { arm: string }) => row.arm === "T").notes).toEqual({ STOPPED: 1 });
  });

  it("the tool breaking midway still writes the report from the finished calls (ABORTED)", async () => {
    const out = freshOut();
    const result = await runPractice(["openings", "--dry", "--questions", "ro-euro", "--arms", "T", "--out", out], {}, { ...quiet,
      log: (line) => { if (line.includes("JUDGE:root:secondary")) throw new Error("BROKE_ON_PURPOSE"); } });
    expect([result.report.verdict, result.exitCode]).toEqual(["ABORTED", 50]);
    expect(result.report.reasons[0]).toBe("ABORTED:Error:BROKE_ON_PURPOSE");
    const lines = jsonl(out);
    expect(lines.some((line) => line.kind === "abort")).toBe(true);
    expect(lines.some((line) => line.kind === "call")).toBe(true);
    expect(report(out).verdict).toBe("ABORTED");
    expect(existsSync(join(out, "report.md"))).toBe(true);
  });
});

describe("practice openings: a real run's start checks, with the gate ports handed the dry script", () => {
  const FIVE = OPENINGS_DRY_MODELS;
  const open = (enabledModels: readonly string[]): PreviewGateRemaining => Object.freeze({ state: "active", windowOpen: true,
    remainingNanoUsd: 5_000_000_000n, remainingCalls: 1_000, maxConcurrentCalls: 4, largestReservationNanoUsd: 50_000_000n, enabledModels });

  /** The live settings file's shape (README S-2) and an active gate status (S-3), written to a fresh folder. */
  function realRunFiles(): Readonly<{ common: string[]; out: string }> {
    const folder = freshFolder();
    const config = { deployment: "v3-preview", free_model_ids: FIVE.slice(0, 2), premium_model_ids: FIVE, requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
      scope_id: "preview-practice-openings-test" };
    writeFileSync(join(folder, "settings.env"), [
      `PREVIEW_PROVIDER_TEST_CONFIG_JSON=${JSON.stringify(config)}`,
      `PROVIDER_DISCOVERY_TARGETS_JSON=${JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow))}`,
      "REGISTER_VERSION=5", "DEBATEAI_DEPLOYMENT_MODE=local", "NODE_ENV=production", "CLAIM_MS=4000000", "CLAIM_MARGIN_MS=60000",
      "MAX_RECOMPOSE=1", "JUDGEMENT_NUMBER_KIND=base-probability", "JUDGEMENT_PRODUCER=judgement:preview-practice-test",
      "PROPAGATION_NUMBER_KIND=propagated-probability", "PROPAGATION_PRODUCER=propagation:preview-practice-test",
      "PROVIDER_REF=preview:fixture-a", "STRANGER_SAMPLE_RATE=0", "BATTERY_VERSION=s00",
      "SETTLEMENT_WATCH_HANDLE=settlement-watch:preview-practice-test", ""].join("\n"));
    writeFileSync(join(folder, "status.json"), JSON.stringify({ state: "active", unsent_streak: 0, halts: 0 }));
    return { out: join(folder, "out"), common: ["--settings", join(folder, "settings.env"), "--gate-status-deepinfra", join(folder, "status.json"),
      "--gate-status-anthropic", join(folder, "status.json")] };
  }
  const env = { PRACTICE_ACK: "spends-real-money", PRACTICE_DEEPINFRA_SOCKET: "/x/deepinfra.sock", PRACTICE_ANTHROPIC_SOCKET: "/x/anthropic.sock" };

  async function handTheGatesTheScript(enabled: readonly string[]) {
    const real = await vi.importActual<typeof import("../../tools/preview-practice/practice-settings.js")>("../../tools/preview-practice/practice-settings.js");
    // The acknowledgement and the socket paths are still checked; only "is it a socket on this disk" is answered yes.
    vi.mocked(practiceSocketsFromEnvironment).mockImplementation((given) => real.practiceSocketsFromEnvironment(given, () => true));
    const dry = openingsDryPorts();
    vi.mocked(createPreviewBudgetRpcPort).mockImplementation((_config, socket) => (socket === env.PRACTICE_ANTHROPIC_SOCKET ? dry.ports.anthropic : dry.ports.deepinfra));
    vi.mocked(practiceRemainingPorts).mockImplementation(() => Object.freeze({ deepinfra: async () => open(enabled), anthropic: async () => open(enabled) }));
    return dry;
  }

  it("runs through the start checks, the gates' ports and their read-only answers, before and after", async () => {
    const dry = await handTheGatesTheScript(FIVE);
    const { common, out } = realRunFiles();
    const result = await runPractice(["openings", ...common, "--questions", "en-rent-caps", "--arms", "T,B", "--busy-wait-minutes", "0", "--out", out], env, quiet);
    expect([result.report.verdict, result.exitCode]).toEqual(["PASS_WITH_WARNINGS", 10]);
    expect(vi.mocked(createPreviewBudgetRpcPort).mock.calls.map((call) => call[1])).toEqual([env.PRACTICE_DEEPINFRA_SOCKET, env.PRACTICE_ANTHROPIC_SOCKET]);
    expect(dry.script.requests).toBeGreaterThan(0);
    const lines = jsonl(out);
    expect(lines[0]).toMatchObject({ kind: "start", dry: false, questions: ["en-rent-caps"], arms: ["T", "B"], busyWaitMs: 0,
      remainingBefore: { deepinfra: { state: "active", windowOpen: true }, anthropic: { state: "active", windowOpen: true } } });
    expect(lines.at(-1)).toMatchObject({ kind: "end", interrupted: false, remainingAfter: { deepinfra: { state: "active" }, anthropic: { state: "active" } } });
    expect(report(out)).toMatchObject({ mode: "openings", dry: false });
    expect(readFileSync(join(out, "report.md"), "utf8").split("\n")[0]).toBe("# Preview practice (openings): PASS_WITH_WARNINGS");
  });

  it("refuses a model the gate has not enabled, before anything is sent or logged", async () => {
    const dry = await handTheGatesTheScript(FIVE.filter((model) => model !== HAIKU));
    const { common, out } = realRunFiles();
    const result = await runPractice(["openings", ...common, "--out", out], env, quiet);
    expect(result.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_MODEL_NOT_ENABLED_AT_GATE"]);
    expect(dry.script.requests).toBe(0);
    expect(existsSync(join(out, "openings.jsonl"))).toBe(false);
  });
});
