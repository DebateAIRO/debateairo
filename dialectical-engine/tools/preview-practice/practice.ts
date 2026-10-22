/**
 * Preview practice: the command.
 *
 * Plain words: before anything is uploaded to the v3 preview, this runs a PRACTICE with all five real AIs from the
 * candidate code on this computer. Nothing is published and nothing reaches the site: the debate lives in a
 * throwaway database that is deleted at the end. The only thing it shares with the live preview is the two spending
 * gates on the server (they hold the keys; this computer never sees one), reached through SSH-forwarded sockets and a
 * small relay on the server (gate-relay.py). It spends real money, a little: see the README.
 *
 * Five modes, and two more commands (report and rescore):
 *  - formats: every model asked to do every job a few times; each reply checked by that job's real format check. The
 *    models work at the same time (one call each at a time); --sequential sends one call at a time. Every finished job
 *    is written to <out>/samples.jsonl at once (practice-samples-log.ts), and the report is built from it.
 *    With --levels (spec 2026-10-12 §4.8, practice-levels.ts) the listed models do every job once per listed
 *    thinking level, the runs taking turns, and the report gets a levels table.
 *  - debate:  one whole practice debate (depth 1 by default, 2 allowed) through the real ask path and the real runner.
 *             --call-concurrency sets how many AI calls go at once for this practice only (practice-parallel.ts).
 *             With --transcript it also writes <out>/transcript.json: every prompt and every reply, decrypted
 *             (practice-transcript.ts).
 *             --shape-policy FILE runs it in the new debate shape, in the throwaway register only (practice-shape.ts).
 *             --length-policy FILE runs it with the length row, in the throwaway register only (practice-length.ts).
 *             --site-language and --language-choice set the site language and answer the one-language offer (default keep).
 *  - openings: the debate-shape comparison (spec 2026-10-12 §2): today's opening (T) and three map openings (A snowball,
 *             B blind lists, C the angle map) on 12 fixed questions; every finished call goes to <out>/openings.jsonl at
 *             once (practice-openings-log.ts) and the report is built from it, on every way out. --dry answers from a
 *             script (practice-openings-dry.ts): no settings, no socket, no gate port is built, nothing is spent.
 *  - language: the question-language practice (P2L, practice-language.ts): nine fixed cases, each read by eld, the
 *             fast check (always asked) and one angle-planner call; the lock computed as the site's decider computes it;
 *             <out>/language.jsonl, report.json and report.md. --dry answers from a script: nothing is spent.
 *  - judge-order: (R2b, D3) every recorded comparing-judge vote of the saved engine-2 debates under --transcripts is
 *             asked again of the same AI with the answers in reverse order (letters kept); per judge maker the flip
 *             rate, the longest-answer rate beside chance and the conditional rate (practice-judge-order.ts).
 *             --control also asks the same prompt unchanged (the noise). <out>/judge-order.jsonl, report.json,
 *             report.md. It spends real money (one judge call per vote, two with --control); --dry answers from a script.
 *  - report:  builds report.json and report.md again from <out>/openings.jsonl when the folder holds one, else from
 *             <out>/samples.jsonl (sends nothing, needs no gate). With --side-by-side <samples.jsonl> it writes
 *             <out>/side-by-side.html instead (spec 2026-10-12 §4.8).
 *  - rescore: (R2, E12) reads every transcript.json under --transcripts again with no AI call: first the engine's own
 *             arithmetic must give back exactly the strengths it served, then each debate is scored with engine 2's honest
 *             scores and link rules, a "cannot assess" link at 0.5 / 0.66 / 0.75 / 1.0, investigations applied and not;
 *             <out>/rescore.json and rescore.md (practice-rescore.ts). --engine-policy picks the settings the sweep
 *             starts from (default tools/preview-practice/engine-policy-start.json).
 *
 * The exact commands are in tools/preview-practice/README.md. Exit codes: 0 PASS, 10 PASS_WITH_WARNINGS, 20 FAIL,
 * 30 NOT_PROVEN, 40 HARNESS_ERROR, 50 ABORTED.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mapPromptContractHash } from "@debateai/map";
import {
  createPreviewBudgetRpcPort,
  previewFinalWriterTierUnreadLine,
  previewModelRow,
  type PreviewBudgetPorts,
  type PreviewGateRemaining,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import { readOperatorCommandEnvironment } from "@debateai/register";
import { loadStoryPack, resolveStoryPackDir } from "@debateai/story";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { practiceRemainingPorts } from "./practice-ask-composition.js";
import { runPracticeDebate } from "./practice-debate.js";
import {
  onePerModel,
  PRACTICE_FORMATS_DEFAULTS,
  practiceDeclaredTargets,
  practiceRunnerPolicy,
  runPracticeFormats
} from "./practice-formats.js";
import { PracticeGateObserver, type PracticeGateName } from "./practice-gate-observer.js";
import { parsePracticeLevels, type PracticeLevelPlan } from "./practice-levels.js";
import { practiceInterruptGate, takeOverSignals } from "./practice-interrupt.js";
import { PRACTICE_CONTRACT_HASHES, PRACTICE_LANES, type PracticeLane } from "./practice-lanes.js";
import { openingsDryConfig, openingsDryPorts, openingsDryTargets } from "./practice-openings-dry.js";
import { OPENINGS_FILE, OPENINGS_SCHEMA, OpeningsLog, openingsReportFromLog, readOpeningsLog } from "./practice-openings-log.js";
import {
  OPENINGS_ENGINE_ARMS,
  openingsArmsFromFlag,
  openingsQuestionDigests,
  openingsQuestionsFromFlag,
  type OpeningsArm,
  type OpeningsQuestion
} from "./practice-openings-questions.js";
import { openingsQuestionRotations, runPracticeOpenings } from "./practice-openings.js";
import { practiceJudgeOrderDryPorts, runPracticeJudgeOrderMode } from "./practice-judge-order.js";
import { practiceDebateLanguageFromArgs, practiceLanguageDryPorts, practiceLanguagePolicy, runPracticeLanguageMode } from "./practice-language.js";
import { parsePracticeCallConcurrency } from "./practice-parallel.js";
import { practiceDebateQuestion } from "./practice-questions.js";
import { practiceStoryLengthFromArgs } from "./practice-story-length.js";
import {
  composePracticeHostedNextRegisterVersion,
  composePracticeNextRegisterVersion,
  parsePracticeNextRegisterInputs,
  parsePracticeRegisterExport,
  PracticeRegisterError
} from "./practice-register-import.js";
import {
  abortedReport,
  assertOutsideRepository,
  debateReport,
  defaultReportDirectory,
  harnessErrorReport,
  PRACTICE_REPORT_SCHEMA,
  writeReport,
  type PracticeReport
} from "./practice-report.js";
import { PRACTICE_RESCORE_FILES, PRACTICE_RESCORE_START_POLICY_FILE, runPracticeRescore } from "./practice-rescore.js";
import {
  parsePracticeSampleLog,
  PracticeSampleLog,
  practiceReportFromLog,
  readPracticeSampleLog,
  remainingLine
} from "./practice-samples-log.js";
import { practiceShapeOverrideFromArgs } from "./practice-shape.js";
import { practiceLengthOverrideFromArgs } from "./practice-length.js";
import { PRACTICE_ENGINE_FLAGS, practiceEngineOverrideFromArgs, practiceRegisterHasLengthRow } from "./practice-engine.js";
import { PRACTICE_PIN_FLAGS, practicePinsGiven, practiceWriterPinsFromArgs } from "./practice-pins.js";
import { writeSideBySideFile } from "./practice-side-by-side.js";
import {
  assertGateStatusAllowsPractice,
  PracticeRefusal,
  practiceSocketsFromEnvironment,
  readGateStatus,
  readPracticeSettings
} from "./practice-settings.js";

const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The checkout's source revision (`git rev-parse --verify HEAD`), or null when git cannot answer. Side-by-side spec §1:
 * it names the practice's release when the settings carry no RELEASE_KEY (practice-settings.ts, practiceReleaseKey).
 */
function sourceRevision(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: ENGINE_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** The repository's top folder (git's answer; the engine folder's parent if git cannot answer). */
export function repositoryRoot(): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: ENGINE_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return resolve(ENGINE_ROOT, "..");
  }
}

type Args = Readonly<{ mode: "formats" | "debate" | "openings" | "language" | "report" | "rescore" | "judge-order"; flags: ReadonlyMap<string, string>; switches: ReadonlySet<string> }>;

/**
 * The server plan's inputs for `--register-next` (release-artifacts.mjs native-plan --operation plan): the owner's
 * hosted-billing JSON (kit v3), the checker and its gate statement, the rotation switch, and the call-concurrency row
 * as the plan's JSON (`--register-call-concurrency`; the practice's own `--call-concurrency` is a different thing: it
 * sets this practice's runner only and is never written to any register).
 */
const REGISTER_NEXT_INPUT_FLAGS = Object.freeze(["--hosted-billing", "--checker", "--deepseek-enabled-on-gate", "--role-rotation",
  "--register-call-concurrency"]);

const VALUE_FLAGS = new Set(["--settings", "--register-export", "--gate-status-deepinfra", "--gate-status-anthropic", "--out",
  "--samples", "--gap-ms", "--models", "--lanes", "--depth", "--question", "--max-in-flight", "--busy-wait-minutes", "--levels",
  "--side-by-side", "--questions", "--arms", "--call-concurrency", "--shape-policy", "--depth-mode", "--scrutiny",
  "--answer-length", "--site-language", "--language-choice", "--transcripts", "--length-policy", "--engine-policy",
  "--answer-writer-model", "--storyteller-model",
  ...REGISTER_NEXT_INPUT_FLAGS]);
const SWITCHES = new Set<string>(["--sequential", "--transcript", "--dry", "--register-next", "--story-length", "--control"]);

/**
 * The flags openings reads; every other flag is refused there, so a typo (--question for --questions) can never start
 * the full paid comparison. A dry run reads no settings and no gate status, so those are refused with --dry.
 */
const OPENINGS_FLAGS: ReadonlySet<string> = new Set(["--out", "--questions", "--arms", "--busy-wait-minutes", "--max-in-flight", "--dry",
  "--settings", "--gate-status-deepinfra", "--gate-status-anthropic"]);
const OPENINGS_REAL_RUN_ONLY: ReadonlySet<string> = new Set(["--settings", "--gate-status-deepinfra", "--gate-status-anthropic"]);
/** The flags language reads (practice-language.ts); every other flag is refused there. A dry run reads no settings, gate status or export. */
const LANGUAGE_FLAGS: ReadonlySet<string> = new Set(["--out", "--settings", "--gate-status-deepinfra", "--gate-status-anthropic", "--register-export", "--dry"]);
const LANGUAGE_REAL_RUN_ONLY: ReadonlySet<string> = new Set(["--settings", "--gate-status-deepinfra", "--gate-status-anthropic", "--register-export"]);
/** The flags rescore reads (practice-rescore.ts); every other flag is refused there. It reads no settings, gate or socket. */
const RESCORE_FLAGS: ReadonlySet<string> = new Set(["--transcripts", "--out", "--engine-policy"]);
/** The flags judge-order reads (practice-judge-order.ts); every other flag is refused there. A dry run reads no settings or gate status. */
const JUDGE_ORDER_FLAGS: ReadonlySet<string> = new Set(["--transcripts", "--out", "--settings", "--gate-status-deepinfra",
  "--gate-status-anthropic", "--dry", "--control"]);
const JUDGE_ORDER_REAL_RUN_ONLY: ReadonlySet<string> = new Set(["--settings", "--gate-status-deepinfra", "--gate-status-anthropic"]);

/** What the interrupt messages say the report is written from: openings' finished calls, the other modes' samples. */
export function practiceFinishedUnit(mode: string | undefined): "calls" | "samples" {
  return mode === "openings" ? "calls" : "samples";
}

export function parsePracticeArgs(argv: readonly string[]): Args {
  const [mode, ...rest] = argv;
  if (mode !== "formats" && mode !== "debate" && mode !== "openings" && mode !== "language" && mode !== "report" && mode !== "rescore"
    && mode !== "judge-order") {
    throw new PracticeRefusal("PRACTICE_MODE_REQUIRED", "formats, debate, openings, language, report, rescore or judge-order");
  }
  const flags = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index]!;
    if (SWITCHES.has(flag)) { switches.add(flag); continue; }
    if (!VALUE_FLAGS.has(flag)) throw new PracticeRefusal("PRACTICE_FLAG_UNKNOWN", flag);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_MISSING", flag);
    flags.set(flag, value);
    index += 1;
  }
  return Object.freeze({ mode, flags, switches });
}

function required(args: Args, flag: string): string {
  const value = args.flags.get(flag);
  if (value === undefined) throw new PracticeRefusal("PRACTICE_FLAG_REQUIRED", flag);
  return value;
}

/** Every model must be enabled at its own gate, by the gate's own read-only answer (formats and openings). */
function assertEnabledAtGates(models: readonly string[], before: Readonly<Record<PracticeGateName, PreviewGateRemaining | null>>): void {
  for (const model of models) {
    const gate = previewModelRow(model)?.provider === "anthropic" ? "anthropic" : "deepinfra";
    if (!before[gate]!.enabledModels.includes(model)) throw new PracticeRefusal("PRACTICE_MODEL_NOT_ENABLED_AT_GATE", model);
  }
}

/** The jobs a `--lanes` value names: each must be a practice lane (formats and report mode check it alike); undefined without the flag. */
function lanesOf(args: Args): PracticeLane[] | undefined {
  const text = args.flags.get("--lanes");
  if (text === undefined) return undefined;
  const lanes = text.split(",").map((lane) => lane.trim()) as PracticeLane[];
  if (lanes.some((lane) => !(PRACTICE_LANES as readonly string[]).includes(lane))) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--lanes");
  }
  return lanes;
}

function wholeNumber(args: Args, flag: string, fallback: number, minimum: number, maximum: number): number {
  const text = args.flags.get(flag);
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", flag);
  return value;
}

export type PracticeRunOptions = Readonly<{
  /** Test seams; the real command uses real time. */
  sleep?: (milliseconds: number) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
  /** One content-free line at a time. */
  log?: (line: string) => void;
  /**
   * Test seam (debate mode): the ask's `as_of` (ISO time), which seeds the run's role rotation, so a test can draw the
   * same roles in two runs. Absent: the time of the ask (the real command).
   */
  asOf?: string;
  /** Lets the operator's interrupt stop the practice between calls. */
  onObserver?: (observer: PracticeGateObserver, stop: () => void) => void;
  /**
   * The two ways out, handed over as soon as the run starts: `stop` (the first interrupt: no new calls, the calls in
   * flight finish, the report is written as usual) and `abort` (a second interrupt or a crash: writes report.json and
   * report.md at once from the samples finished so far, verdict ABORTED, and returns the exit code; the caller then
   * quits). Both can be called at any time, and more than once.
   */
  onControl?: (control: PracticeControl) => void;
  /** Test seam for the jittered gap between one model's calls. */
  random?: () => number;
}>;

export type PracticeControl = Readonly<{ stop: () => void; abort: (code: string) => number }>;

export type PracticeRunResult = Readonly<{ exitCode: number; report: PracticeReport; directory: string | null }>;

export async function runPractice(argv: readonly string[], env: Readonly<Record<string, string | undefined>>,
  options: PracticeRunOptions = {}): Promise<PracticeRunResult> {
  const startedAt = new Date();
  const log = options.log ?? ((line: string) => { process.stderr.write(`${line}\n`); });
  let mode = argv[0] === "debate" ? "debate" : argv[0] === "report" ? "report" : argv[0] === "language" ? "language"
    : argv[0] === "openings" ? "openings" : argv[0] === "rescore" ? "rescore" : argv[0] === "judge-order" ? "judge-order" : "formats";
  let directory: string | null = null;
  let observer: PracticeGateObserver | null = null;
  // Formats: the samples log, open from just before the first paid call to the end line.
  let samplesLog: PracticeSampleLog | null = null;
  // Openings: openings.jsonl, open from just before the first call to the end line.
  let openingsLog: OpeningsLog | null = null;
  // Set once the report is on the disk (the run's own, or the abort's): nothing writes over it afterwards.
  let settled: PracticeRunResult | null = null;
  let stopRequested = false;
  // The first interrupt also cuts a busy model's wait short.
  const interrupted = new AbortController();
  const stop = () => {
    stopRequested = true;
    interrupted.abort();
    observer?.stop("deepinfra", "OPERATOR_INTERRUPT");
    observer?.stop("anthropic", "OPERATOR_INTERRUPT");
  };
  const write = (report: PracticeReport): PracticeRunResult => {
    if (directory !== null) {
      const written = writeReport(directory, report);
      log(`report: ${written.json}`);
      log(`summary: ${written.markdown}`);
    }
    log(`PRACTICE_VERDICT ${report.verdict} exit ${String(report.exitCode)}`);
    return Object.freeze({ exitCode: report.exitCode, report, directory });
  };
  const finish = (report: PracticeReport): PracticeRunResult => {
    if (settled !== null) return settled;
    settled = write(report);
    return settled;
  };
  /** The abort: the report from the samples finished so far (formats) or the gates' counts (debate), written at once. */
  const abort = (code: string): PracticeRunResult => {
    if (settled !== null) return settled;
    // No new call is sent; a call in flight cannot be taken back.
    stop();
    if (openingsLog !== null && directory !== null) {
      const at = new Date();
      try { openingsLog.append({ kind: "abort", at: at.toISOString(), code }); } catch { /* the report below still names the abort */ }
      openingsLog.close();
      try {
        settled = write(openingsReportFromLog(readOpeningsLog(directory), { code, at }));
        return settled;
      } catch (error) {
        log(`openings log unreadable: ${error instanceof Error ? error.message : "UNKNOWN"}`);
      }
    }
    if (samplesLog !== null && directory !== null) {
      const at = new Date();
      try { samplesLog.append({ kind: "abort", at: at.toISOString(), code }); } catch { /* the report below still names the abort */ }
      samplesLog.close();
      try {
        settled = write(practiceReportFromLog(readPracticeSampleLog(directory), { code, at }));
        return settled;
      } catch (error) {
        log(`samples log unreadable: ${error instanceof Error ? error.message : "UNKNOWN"}`);
      }
    }
    settled = write(abortedReport(mode, code, startedAt, observer));
    return settled;
  };
  options.onControl?.(Object.freeze({ stop, abort: (code: string) => abort(code).exitCode }));

  /**
   * Mode openings: openings.jsonl opened before the first call (its start line pins each asked question's digest), the
   * run, the end line with each gate's answer after (none in --dry), and the report built from the log on the disk, as
   * formats builds its own. Every other way out goes through `abort`, which builds the report from the same log.
   */
  const runOpeningsMode = async (setup: Readonly<{
    watched: PracticeGateObserver;
    config: PreviewProviderTestConfig;
    targets: readonly ProviderDiscoveryTarget[];
    ports: PreviewBudgetPorts;
    dry: boolean;
    folder: string;
    unsentStreakAtStart: Readonly<Record<PracticeGateName, number>>;
    gateLimits: Readonly<Record<PracticeGateName, number>>;
    before: Readonly<Record<PracticeGateName, PreviewGateRemaining | null>>;
    remainingPorts: ReturnType<typeof practiceRemainingPorts> | null;
    questions: readonly OpeningsQuestion[];
    arms: readonly OpeningsArm[];
    busyWaitMs: number;
    maxInFlight: number;
    sleep: ((milliseconds: number) => Promise<void>) | undefined;
  }>): Promise<PracticeRunResult> => {
    let opened: OpeningsLog;
    try { opened = OpeningsLog.create(setup.folder); } catch (error) {
      if (error instanceof Error && error.message === "PRACTICE_OUT_ALREADY_HOLDS_OPENINGS") {
        // Another run's folder: its report is left as it is.
        directory = null;
        throw new PracticeRefusal("PRACTICE_OUT_ALREADY_HOLDS_OPENINGS", "use a new --out folder");
      }
      throw error;
    }
    openingsLog = opened;
    opened.append({ kind: "start", schema: OPENINGS_SCHEMA, mode: "openings", dry: setup.dry, startedAt: startedAt.toISOString(),
      models: setup.targets.map((target) => target.model), questions: setup.questions.map((question) => question.id),
      questionDigests: openingsQuestionDigests(setup.questions), arms: setup.arms,
      busyWaitMs: setup.busyWaitMs, unsentStreakAtStart: setup.unsentStreakAtStart,
      remainingBefore: { deepinfra: remainingLine(setup.before.deepinfra), anthropic: remainingLine(setup.before.anthropic) } });
    setup.watched.listen({ event: (event) => opened.append({ kind: "wire", event }), stop: (gateStop) => opened.append({ kind: "stop", stop: gateStop }) });
    log(`openings: ${opened.path}`);
    log(`openings: ${String(setup.questions.length)} question(s), arms ${setup.arms.join(",")}, ${String(setup.targets.length)} AIs`
      + (setup.dry ? ", dry (scripted answers, nothing spent)" : ""));
    const policy = practiceRunnerPolicy(setup.config);
    await runPracticeOpenings({
      config: setup.config, targets: setup.targets, ports: setup.ports, observer: setup.watched,
      questions: setup.questions, arms: setup.arms, bound: policy.bounds.JUDGE,
      contractHashes: { judge: PRACTICE_CONTRACT_HASHES.judge, map: mapPromptContractHash(), engine: engineContractHash() },
      ...(setup.sleep === undefined ? {} : { sleep: setup.sleep }),
      ...(options.random === undefined ? {} : { random: options.random }),
      progress: log, shouldStop: () => stopRequested, stopSignal: interrupted.signal, busyWaitMs: setup.busyWaitMs,
      gateLimits: setup.gateLimits, maxInFlight: setup.maxInFlight,
      onCall: (call) => opened.append({ kind: "call", call }),
      onArm: (arm) => opened.append({ kind: "arm", arm }),
      onBusy: (model) => opened.append({ kind: "busy", model }),
      onBusyWait: (wait) => opened.append({ kind: "busy-wait", ...wait })
    });
    if (settled !== null) return settled;
    const after = setup.remainingPorts === null ? { deepinfra: null, anthropic: null } : {
      deepinfra: await setup.remainingPorts.deepinfra().catch(() => null),
      anthropic: await setup.remainingPorts.anthropic().catch(() => null)
    };
    if (settled !== null) return settled;
    opened.append({ kind: "end", finishedAt: new Date().toISOString(), interrupted: stopRequested,
      remainingAfter: { deepinfra: remainingLine(after.deepinfra), anthropic: remainingLine(after.anthropic) } });
    opened.close();
    // The report is built from the log on the disk, as formats builds its own.
    return finish(openingsReportFromLog(readOpeningsLog(setup.folder)));
  };
  try {
    const args = parsePracticeArgs(argv);
    mode = args.mode;
    if (args.mode === "rescore") {
      // R2 (E12): the free re-scoring of saved transcripts. No AI call, no gate, no socket, no settings, no database. Checked
      // and run here, before every debate-only flag check (R1d refuses --engine-policy outside a debate; here it names the
      // settings the sweep starts from). On a refusal nothing is written (`directory` stays null).
      for (const flag of [...args.flags.keys(), ...args.switches]) {
        if (!RESCORE_FLAGS.has(flag)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (not read by rescore)`);
      }
      const folder = assertOutsideRepository(args.flags.get("--out") ?? defaultReportDirectory(mode, startedAt), repositoryRoot());
      let policyText: string;
      try { policyText = readFileSync(args.flags.get("--engine-policy") ?? PRACTICE_RESCORE_START_POLICY_FILE, "utf8"); } catch {
        throw new PracticeRefusal("PRACTICE_ENGINE_POLICY_UNREADABLE");
      }
      const rescored = runPracticeRescore({ transcripts: required(args, "--transcripts"), out: folder, enginePolicyText: policyText });
      log(`rescore: ${join(folder, PRACTICE_RESCORE_FILES.json)}`);
      log(`summary: ${join(folder, PRACTICE_RESCORE_FILES.markdown)}`);
      log(`PRACTICE_VERDICT ${rescored.verdict} exit ${String(rescored.exitCode)}`);
      return Object.freeze({ exitCode: rescored.exitCode, directory: folder, report: Object.freeze({
        schema: PRACTICE_REPORT_SCHEMA, mode: "rescore", verdict: rescored.verdict, exitCode: rescored.exitCode,
        reasons: rescored.reasons, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString()
      }) });
    }
    // Parallel AI calls: the debate's runner only; checked before anything is read or sent.
    const callConcurrencyText = args.flags.get("--call-concurrency");
    if (callConcurrencyText !== undefined && args.mode !== "debate") {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--call-concurrency (debate mode only)");
    }
    const callConcurrency = callConcurrencyText === undefined ? undefined : parsePracticeCallConcurrency(callConcurrencyText);
    if (args.switches.has("--transcript") && args.mode !== "debate") {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--transcript (debate mode only)");
    }
    if (args.switches.has("--dry") && args.mode !== "openings" && args.mode !== "language" && args.mode !== "judge-order") {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--dry (openings, language or judge-order mode only)");
    }
    // Debate shape (spec 2026-10-12 §5): the four debate-only flags, read and checked here, before any socket, settings
    // file or gate is touched; a policy file that does not pass the register's own check never starts a paid run.
    const shapeOverride = practiceShapeOverrideFromArgs(args.mode, args.flags);
    // Length guidance (spec 2026-10-15 §3.7): the debate-only flag, read and checked here, before any socket, settings file
    // or gate is touched; a policy file that does not pass the register's own check never starts a paid run.
    const lengthOverride = practiceLengthOverrideFromArgs(args.mode, args.flags);
    // Engine row and pinned final writers (R1d): debate-only, refused here in every other mode before anything is read.
    // The engine file itself is read once the register export is read (below): the flag needs a length row, from
    // --length-policy or from the export.
    for (const flag of [...PRACTICE_ENGINE_FLAGS, ...PRACTICE_PIN_FLAGS]) {
      if (args.flags.has(flag) && args.mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (debate mode only)`);
    }
    // The debate's question, a fixed id only, checked here too (it used to fail only once the database had started).
    const debateQuestionId = args.mode === "debate" ? practiceDebateQuestion(args.flags.get("--question") ?? "ro").id : "ro";
    // Question language (P2L, practice-language.ts): debate mode's two language flags, checked here too.
    const debateLanguage = practiceDebateLanguageFromArgs(args.mode, args.flags);
    for (const flag of ["--questions", "--arms"]) {
      if (args.flags.has(flag) && args.mode !== "openings") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (openings mode only)`);
    }
    if (args.mode === "openings") {
      // The other way round: a flag only another mode reads is refused here (its value is never repeated).
      const dryRun = args.switches.has("--dry");
      for (const flag of [...args.flags.keys(), ...args.switches]) {
        if (!OPENINGS_FLAGS.has(flag)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (not read by openings)`);
        if (dryRun && OPENINGS_REAL_RUN_ONLY.has(flag)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (not read by openings --dry)`);
      }
    }
    if (args.mode === "language") {
      // The other way round: a flag only another mode reads is refused here (its value is never repeated).
      const dryRun = args.switches.has("--dry");
      for (const flag of [...args.flags.keys(), ...args.switches]) {
        if (!LANGUAGE_FLAGS.has(flag)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (not read by language)`);
        if (dryRun && LANGUAGE_REAL_RUN_ONLY.has(flag)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (not read by language --dry)`);
      }
    }
    if (args.mode === "judge-order") {
      // R2b (D3): only its own flags; with --dry none of the real run's (its value is never repeated).
      const dryRun = args.switches.has("--dry");
      for (const flag of [...args.flags.keys(), ...args.switches]) {
        if (!JUDGE_ORDER_FLAGS.has(flag)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (not read by judge-order)`);
        if (dryRun && JUDGE_ORDER_REAL_RUN_ONLY.has(flag)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (not read by judge-order --dry)`);
      }
    }
    if (args.switches.has("--control") && args.mode !== "judge-order") {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--control (judge-order mode only)");
    }
    // Only fixed ids are accepted, each checked with its seat rotation before anything else (ruling T11-m6); the text of
    // a refused value is never repeated (practice-openings-questions.ts).
    const openingsQuestions = args.mode === "openings" ? openingsQuestionsFromFlag(args.flags.get("--questions")) : [];
    const openingsArms = args.mode === "openings" ? openingsArmsFromFlag(args.flags.get("--arms")) : [];
    // Task 17a (D5): the engine-2 arms answer v2 forms only through the real gates; the dry script answers engine 1's.
    if (args.switches.has("--dry") && openingsArms.some((arm) => (OPENINGS_ENGINE_ARMS as readonly string[]).includes(arm))) {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--arms C2, C2N (not read by openings --dry)");
    }
    // Checked here so a bad selection writes nothing; checked again by the engine before the first call.
    openingsQuestionRotations(openingsQuestions);
    if (args.flags.has("--levels") && args.mode !== "formats") {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--levels (formats mode only)");
    }
    // Length guidance and engine 2's story (LG-D, R1d): checked before anything starts, so a misplaced switch never
    // starts a paid run.
    const storyLength = practiceStoryLengthFromArgs(args.mode, args.switches);
    if (args.flags.has("--side-by-side") && args.mode !== "report") {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--side-by-side (report mode only)");
    }
    const nextInputFlag = REGISTER_NEXT_INPUT_FLAGS.find((flag) => args.flags.has(flag));
    if (nextInputFlag !== undefined && !args.switches.has("--register-next")) {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${nextInputFlag} (with --register-next only)`);
    }
    if (args.mode === "report") {
      const folder = required(args, "--out");
      const sideBySideLog = args.flags.get("--side-by-side");
      if (sideBySideLog !== undefined) {
        // Spec 2026-10-12 §4.8: the side-by-side page from the samples log named, nothing sent. Only the page is written
        // (report.json and report.md in the folder are left as they are). `--lanes` names the jobs it shows.
        const lanes = lanesOf(args);
        let lines;
        try { lines = parsePracticeSampleLog(readFileSync(sideBySideLog, "utf8")); } catch (error) {
          throw new PracticeRefusal(error instanceof Error && /^PRACTICE_/u.test(error.message) ? error.message : "PRACTICE_SAMPLES_LOG_UNREADABLE");
        }
        directory = assertOutsideRepository(folder, repositoryRoot());
        const samples = lines.flatMap((line) => line.kind === "sample" ? [line.sample] : []);
        log(`side-by-side: ${writeSideBySideFile(directory, samples, lanes === undefined ? {} : { lanes })}`);
        return Object.freeze({ exitCode: 0, report: practiceReportFromLog(lines), directory });
      }
      // Rebuilds the report from an existing log; nothing is sent. On a refusal nothing is written there. A folder that
      // holds openings.jsonl is an openings run (F-I4: insurance for a long run whose report was never written).
      if (existsSync(join(folder, OPENINGS_FILE))) {
        let openingsLines;
        try { openingsLines = readOpeningsLog(folder); } catch (error) {
          throw new PracticeRefusal(error instanceof Error && /^PRACTICE_/u.test(error.message) ? error.message : "PRACTICE_OPENINGS_LOG_UNREADABLE");
        }
        directory = assertOutsideRepository(folder, repositoryRoot());
        return finish(openingsReportFromLog(openingsLines));
      }
      let lines;
      try { lines = readPracticeSampleLog(folder); } catch (error) {
        throw new PracticeRefusal(error instanceof Error && /^PRACTICE_/u.test(error.message) ? error.message : "PRACTICE_SAMPLES_LOG_UNREADABLE");
      }
      directory = assertOutsideRepository(folder, repositoryRoot());
      return finish(practiceReportFromLog(lines));
    }
    if (args.mode === "openings" && args.switches.has("--dry")) {
      // --dry (ruling T11-m3): the two gate ports come ONLY from the script (practice-openings-dry.ts). No acknowledgement,
      // no socket, no settings, no gate status; no RPC or "what is left" port is built (the dry config names the real
      // socket paths only because its parser requires them), so nothing can reach a gate and nothing is spent.
      const folder = assertOutsideRepository(args.flags.get("--out") ?? defaultReportDirectory(mode, startedAt), repositoryRoot());
      directory = folder;
      const watched = new PracticeGateObserver();
      observer = watched;
      options.onObserver?.(watched, stop);
      const config = openingsDryConfig();
      const dry = openingsDryPorts();
      return await runOpeningsMode({ watched, config, targets: openingsDryTargets(config),
        ports: Object.freeze({ deepinfra: watched.wrap("deepinfra", dry.ports.deepinfra), anthropic: watched.wrap("anthropic", dry.ports.anthropic) }),
        dry: true, folder, unsentStreakAtStart: { deepinfra: 0, anthropic: 0 }, gateLimits: PRACTICE_FORMATS_DEFAULTS.gateLimits,
        before: { deepinfra: null, anthropic: null }, remainingPorts: null, questions: openingsQuestions, arms: openingsArms,
        // A busy model sits out at once unless asked otherwise; the script's waits take no time either way.
        busyWaitMs: wholeNumber(args, "--busy-wait-minutes", 0, 0, 240) * 60_000,
        maxInFlight: wholeNumber(args, "--max-in-flight", PRACTICE_FORMATS_DEFAULTS.maxInFlight, 1, 20), sleep: dry.sleep });
    }
    if (args.mode === "language" && args.switches.has("--dry")) {
      // --dry: the two gate ports come ONLY from the script (practice-language.ts practiceLanguageDryPorts). No
      // acknowledgement, no socket, no settings, no gate status, no export; nothing can reach a gate, nothing is spent.
      // eld still reads each question on this computer.
      const folder = assertOutsideRepository(args.flags.get("--out") ?? defaultReportDirectory(mode, startedAt), repositoryRoot());
      directory = folder;
      const watched = new PracticeGateObserver();
      observer = watched;
      options.onObserver?.(watched, stop);
      const config = openingsDryConfig();
      const dry = practiceLanguageDryPorts();
      const chosen = practiceLanguagePolicy(null);
      return finish(await runPracticeLanguageMode({ config, targets: openingsDryTargets(config),
        ports: Object.freeze({ deepinfra: watched.wrap("deepinfra", dry.ports.deepinfra), anthropic: watched.wrap("anthropic", dry.ports.anthropic) }),
        observer: watched, policy: chosen.policy, policySource: chosen.source, bound: practiceRunnerPolicy(config).bounds.JUDGE,
        folder, dry: true, startedAt, sleep: async () => undefined, progress: log, shouldStop: () => stopRequested }));
    }
    if (args.mode === "judge-order" && args.switches.has("--dry")) {
      // --dry: the two gate ports come ONLY from the script (practiceJudgeOrderDryPorts); nothing can reach a gate.
      const folder = assertOutsideRepository(args.flags.get("--out") ?? defaultReportDirectory(mode, startedAt), repositoryRoot());
      directory = folder;
      const watched = new PracticeGateObserver();
      observer = watched;
      options.onObserver?.(watched, stop);
      const config = openingsDryConfig();
      const dry = practiceJudgeOrderDryPorts();
      return finish(await runPracticeJudgeOrderMode({ config, targets: openingsDryTargets(config),
        ports: Object.freeze({ deepinfra: watched.wrap("deepinfra", dry.deepinfra), anthropic: watched.wrap("anthropic", dry.anthropic) }),
        observer: watched, bound: practiceRunnerPolicy(config).bounds.JUDGE, transcripts: required(args, "--transcripts"),
        control: args.switches.has("--control"), folder, dry: true, startedAt, sleep: async () => undefined, progress: log,
        shouldStop: () => stopRequested }));
    }
    directory = assertOutsideRepository(args.flags.get("--out") ?? defaultReportDirectory(mode, startedAt), repositoryRoot());
    const sockets = practiceSocketsFromEnvironment(env);
    const settings = readPracticeSettings(required(args, "--settings"), sourceRevision());
    if (settings.runner.DEPLOYMENT_MODE === "hosted") {
      log(mode === "debate"
        ? "settings: hosted mode (the hosted runner and ask path, their ceilings and the story's money row; billing kept off in "
          + "the practice: no NETOPIA, Quaderno, SmartBill or mail, no key file read)"
        : "settings: hosted mode (formats mode asks the same jobs in both modes; no billing setting is read)");
    }
    if (settings.setAsideKeys.length > 0) {
      log(`settings: server-only settings set aside unread (never opened, never sent): ${settings.setAsideKeys.join(", ")}`);
    }
    // Formats: the models of this run, and (spec 2026-10-12 §4.8) the --levels plan, checked before any gate is asked.
    const wanted = args.flags.get("--models")?.split(",").map((model) => model.trim()).filter((model) => model !== "")
      ?? [...settings.previewConfig.premium_model_ids];
    if (mode === "formats" && wanted.some((model) => !settings.previewConfig.premium_model_ids.includes(model))) {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--models (not in the preview's roster)");
    }
    const levelsText = args.flags.get("--levels");
    const levels: PracticeLevelPlan | undefined = levelsText === undefined ? undefined : parsePracticeLevels(levelsText, wanted);
    const unsentStreakAtStart: Record<PracticeGateName, number> = { deepinfra: 0, anthropic: 0 };
    const gateLimits: Record<PracticeGateName, number> = { ...PRACTICE_FORMATS_DEFAULTS.gateLimits };
    for (const gate of ["deepinfra", "anthropic"] as const) {
      const status = readGateStatus(gate, required(args, `--gate-status-${gate}`));
      assertGateStatusAllowsPractice(gate, status);
      unsentStreakAtStart[gate] = status.unsentStreak;
      if (status.maxConcurrentCalls !== null) gateLimits[gate] = status.maxConcurrentCalls;
    }
    const register = mode === "debate" || (mode === "language" && args.flags.has("--register-export")) ? (() => {
      let text: string;
      try { text = readFileSync(required(args, "--register-export"), "utf8"); } catch (error) {
        if (error instanceof PracticeRefusal) throw error;
        throw new PracticeRefusal("PRACTICE_REGISTER_EXPORT_UNREADABLE");
      }
      return parsePracticeRegisterExport(text);
    })() : null;
    // Engine row (R1d): read and checked by the register's own parser here, before the next version is composed and
    // before any socket or gate is touched. Engine 2 needs the length row: from --length-policy, or the export's own.
    const engineOverride = practiceEngineOverrideFromArgs(args.mode, args.flags, undefined,
      lengthOverride !== null || (register !== null && practiceRegisterHasLengthRow(register)));
    // Pinned final writers (R1d, INTERFACE §15.2): each must be one of the preview's premium models; checked here, before
    // any gate is asked. Role rotation off in the practice register is refused by the ask composition, before any AI call.
    const pins = practiceWriterPinsFromArgs(args.mode, args.flags, settings.previewConfig.premium_model_ids);
    // --register-next: the code's next register version, composed before anything is spent (a refusal costs nothing).
    if (args.switches.has("--register-next") && mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_UNKNOWN", "--register-next (debate only)");
    // Debate shape with --register-next (controller ruling D-REGNEXT): the --shape-policy policy goes into the code's
    // next version itself, through the kit's own source build (kit v2, or kit v3 with --hosted-billing), so the practice
    // publishes no second version on top.
    const nextShape = shapeOverride === null ? null : shapeOverride.policy;
    // The server plan's own inputs, checked by the release tool's own rules; `--hosted-billing` selects publish kit v3.
    const nextInputs = register !== null && args.switches.has("--register-next") ? await parsePracticeNextRegisterInputs({
      hostedBilling: args.flags.get("--hosted-billing"), checker: args.flags.get("--checker"),
      deepseekEnabledOnGate: args.flags.get("--deepseek-enabled-on-gate"), roleRotation: args.flags.get("--role-rotation"),
      callConcurrency: args.flags.get("--register-call-concurrency"), debateShape: nextShape, lengthGuidance: lengthOverride,
      engineVersion: engineOverride
    }) : null;
    // As the server's plan: a hosted preview's next version needs the hosted inputs (HOSTED_BILLING_REQUIRED there).
    if (nextInputs?.kit === "v2" && settings.runner.DEPLOYMENT_MODE === "hosted") {
      throw new PracticeRegisterError("PRACTICE_REGISTER_NEXT_HOSTED_BILLING_REQUIRED",
        "the preview runs hosted: give --hosted-billing '<JSON>' as the server's plan does");
    }
    const registerNext = register === null || nextInputs === null ? null
      : nextInputs.kit === "v3" ? await composePracticeHostedNextRegisterVersion(register, nextInputs.hostedBilling!, nextInputs.choices)
        : Object.keys(nextInputs.choices).length === 0 ? await composePracticeNextRegisterVersion(register)
          : await composePracticeNextRegisterVersion(register, undefined, nextInputs.choices);
    if (registerNext?.composer !== undefined) {
      log(`register-next: publish kit v3 (${registerNext.composer}), billing ${registerNext.hostedBilling!.billing} in the next version; `
        + "the practice runs it in hosted mode, with billing kept off");
      for (const note of registerNext.notes ?? []) log(`register-next: ${note}`);
    }
    // The brake counts connection failures in a row, from root's streak at the start (practice-gate-observer.ts).
    observer = new PracticeGateObserver({ unsentStreakAtStart });
    options.onObserver?.(observer, stop);
    // Each port's third parameter (left at its default, as main.ts's createPreviewBudgetRpcPorts leaves it) is the same
    // forwarded socket's read-only /remaining: after a STOPPED refusal the port asks it, and a halted gate is then
    // PROVIDER_GATE_UNAVAILABLE (run resilience fix (c)), never a money stop.
    const budgetPorts = Object.freeze({
      deepinfra: observer.wrap("deepinfra", createPreviewBudgetRpcPort(settings.previewConfig, sockets.deepinfra)),
      anthropic: observer.wrap("anthropic", createPreviewBudgetRpcPort(settings.previewConfig, sockets.anthropic))
    });
    // The gates' own read-only answer: both must be open before anything paid is sent.
    const remainingPorts = practiceRemainingPorts(settings, sockets);
    const before: Record<PracticeGateName, PreviewGateRemaining | null> = { deepinfra: null, anthropic: null };
    for (const gate of ["deepinfra", "anthropic"] as const) {
      let answer: PreviewGateRemaining;
      try { answer = await remainingPorts[gate](); } catch { throw new PracticeRefusal("PRACTICE_GATE_UNREACHABLE", gate); }
      if (answer.state !== "active" || !answer.windowOpen) throw new PracticeRefusal("PRACTICE_GATE_NOT_OPEN", `${gate}: ${answer.state}`);
      before[gate] = answer;
    }
    if (args.mode === "judge-order") {
      // R2b (D3): any preview AI may have judged; each must be enabled at its gate before anything paid is sent.
      const models = [...settings.previewConfig.premium_model_ids];
      assertEnabledAtGates(models, before);
      return finish(await runPracticeJudgeOrderMode({ config: settings.previewConfig,
        targets: onePerModel(practiceDeclaredTargets(settings.runner.PROVIDER_DISCOVERY_TARGETS_JSON), models),
        ports: budgetPorts, observer, bound: practiceRunnerPolicy(settings.previewConfig).bounds.JUDGE,
        transcripts: required(args, "--transcripts"), control: args.switches.has("--control"), folder: directory, dry: false,
        startedAt, ...(options.sleep === undefined ? {} : { sleep: options.sleep }), progress: log, shouldStop: () => stopRequested }));
    }
    if (args.mode === "language") {
      // Question language (P2L): the fast check's model and every preview AI (the planners take turns) must be enabled.
      const chosen = practiceLanguagePolicy(register);
      const models = [...settings.previewConfig.premium_model_ids];
      assertEnabledAtGates([...models, chosen.policy.fastCheck!.model], before);
      return finish(await runPracticeLanguageMode({ config: settings.previewConfig,
        targets: onePerModel(practiceDeclaredTargets(settings.runner.PROVIDER_DISCOVERY_TARGETS_JSON), models),
        ports: budgetPorts, observer, policy: chosen.policy, policySource: chosen.source,
        bound: practiceRunnerPolicy(settings.previewConfig).bounds.JUDGE, folder: directory, dry: false, startedAt,
        ...(options.sleep === undefined ? {} : { sleep: options.sleep }), progress: log, shouldStop: () => stopRequested }));
    }
    if (args.mode === "openings") {
      // All the preview's AIs (spec §2: "all five preview AIs"); each must be enabled at its gate.
      const models = [...settings.previewConfig.premium_model_ids];
      assertEnabledAtGates(models, before);
      return await runOpeningsMode({ watched: observer, config: settings.previewConfig,
        targets: onePerModel(practiceDeclaredTargets(settings.runner.PROVIDER_DISCOVERY_TARGETS_JSON), models),
        ports: budgetPorts, dry: false, folder: directory, unsentStreakAtStart, gateLimits, before, remainingPorts,
        questions: openingsQuestions, arms: openingsArms,
        busyWaitMs: wholeNumber(args, "--busy-wait-minutes", 30, 0, 240) * 60_000,
        maxInFlight: wholeNumber(args, "--max-in-flight", PRACTICE_FORMATS_DEFAULTS.maxInFlight, 1, 20), sleep: options.sleep });
    }
    if (mode === "formats") {
      const lanes = lanesOf(args) ?? [...PRACTICE_LANES];
      assertEnabledAtGates(wanted, before);
      const declared = practiceDeclaredTargets(settings.runner.PROVIDER_DISCOVERY_TARGETS_JSON);
      const policy = practiceRunnerPolicy(settings.previewConfig);
      const parallel = !args.switches.has("--sequential");
      const samples = wholeNumber(args, "--samples", 2, 1, 10);
      const maxInFlight = wholeNumber(args, "--max-in-flight", PRACTICE_FORMATS_DEFAULTS.maxInFlight, 1, 20);
      // Each model's budget of busy waits (0: a busy model's remaining jobs are skipped at once, the old rule).
      const busyWaitMs = wholeNumber(args, "--busy-wait-minutes", 30, 0, 240) * 60_000;
      const targets = onePerModel(declared, wanted);
      // The samples log: opened before the first paid call; every finished job, call and stop goes in at once.
      try { samplesLog = PracticeSampleLog.create(directory); } catch (error) {
        if (error instanceof Error && error.message === "PRACTICE_OUT_ALREADY_HOLDS_SAMPLES") {
          // Another run's folder: its report is left as it is.
          directory = null;
          throw new PracticeRefusal("PRACTICE_OUT_ALREADY_HOLDS_SAMPLES", "use a new --out folder, or `report --out` to rebuild that one");
        }
        throw error;
      }
      const sampleLog = samplesLog;
      sampleLog.append({ kind: "start", schema: "preview-practice-samples-v1", mode: "formats", startedAt: startedAt.toISOString(),
        models: targets.map((target) => target.model), lanes, samples, parallel, busyWaitMs, unsentStreakAtStart,
        remainingBefore: { deepinfra: remainingLine(before.deepinfra), anthropic: remainingLine(before.anthropic) },
        ...(levels === undefined ? {} : { levels: Object.fromEntries(Object.entries(levels).map(([model, runs]) => [model, runs.map((run) => run.run)])) }) });
      observer.listen({ event: (event) => sampleLog.append({ kind: "wire", event }), stop: (gateStop) => sampleLog.append({ kind: "stop", stop: gateStop }) });
      log(`samples: ${sampleLog.path}`);
      log(parallel
        ? `formats: ${String(targets.length)} models at once, one call each at a time (at once at most: deepinfra ${String(gateLimits.deepinfra)}, anthropic ${String(gateLimits.anthropic)}, all ${String(maxInFlight)})`
        : "formats: one call at a time (--sequential)");
      for (const [model, runs] of Object.entries(levels ?? {})) {
        log(`levels: ${model}: ${runs.map((run) => run.run).join(", ")} (each job once per run, the runs taking turns)`);
      }
      if (storyLength !== null) log("formats: the story jobs are asked as engine 2's story (v4), with the owners' start values (--story-length)");
      await runPracticeFormats({
        config: settings.previewConfig,
        targets,
        ports: budgetPorts,
        gateRemaining: remainingPorts,
        // Task 4 review fix 1: one function for the whole run, so one line per gate and reason in the practice's log.
        onFinalWriterTierUnread: (event) => { log(previewFinalWriterTierUnreadLine(event)); },
        observer,
        lanes,
        samples,
        gapMs: wholeNumber(args, "--gap-ms", parallel ? 1_000 : 2_000, 0, 600_000),
        parallel,
        gateLimits,
        maxInFlight,
        pack: loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url })),
        bounds: { judge: policy.bounds.JUDGE, synthesizer: policy.synthesisRolePolicy.synthesizerBound,
          evaluator: policy.synthesisRolePolicy.evaluatorBound },
        ...(storyLength === null ? {} : { storyLength }),
        ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
        ...(options.random === undefined ? {} : { random: options.random }),
        progress: log,
        shouldStop: () => stopRequested,
        onSample: (sample) => sampleLog.append({ kind: "sample", sample }),
        onBusy: (model) => sampleLog.append({ kind: "busy", model }),
        busyWaitMs,
        onBusyWait: (wait) => sampleLog.append({ kind: "busy-wait", ...wait }),
        onResume: (resume) => sampleLog.append({ kind: "resume", ...resume }),
        stopSignal: interrupted.signal,
        ...(levels === undefined ? {} : { levels })
      });
      if (settled !== null) return settled;
      const after = {
        deepinfra: await remainingPorts.deepinfra().catch(() => null),
        anthropic: await remainingPorts.anthropic().catch(() => null)
      };
      if (settled !== null) return settled;
      sampleLog.append({ kind: "end", finishedAt: new Date().toISOString(), interrupted: stopRequested,
        remainingAfter: { deepinfra: remainingLine(after.deepinfra), anthropic: remainingLine(after.anthropic) } });
      sampleLog.close();
      // The report is built from the log on the disk, the same way `report --out` builds it.
      return finish(practiceReportFromLog(readPracticeSampleLog(directory)));
    }
    const result = await runPracticeDebate({
      settings, sockets, register: register!, registerNext,
      budgetPorts, observer, depth: wholeNumber(args, "--depth", 1, 1, 2),
      questionId: debateQuestionId,
      ...(shapeOverride === null ? {} : { shape: shapeOverride }),
      ...(lengthOverride === null ? {} : { length: lengthOverride }),
      ...(engineOverride === null ? {} : { engine: engineOverride }),
      ...(practicePinsGiven(pins) ? { pins } : {}),
      ...(debateLanguage === null ? {} : { language: debateLanguage }),
      ...(callConcurrency === undefined ? {} : { callConcurrency }),
      ...(options.wait === undefined ? {} : { wait: options.wait }),
      ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
      ...(options.asOf === undefined ? {} : { asOf: options.asOf }),
      progress: log,
      transcriptDirectory: args.switches.has("--transcript") ? directory : null
    });
    return finish(debateReport({ result, observer, startedAt, finishedAt: new Date() }));
  } catch (error) {
    const code = error instanceof PracticeRefusal || error instanceof PracticeRegisterError ? error.code
      : error instanceof Error && error.message === "PRACTICE_REPORT_INSIDE_REPOSITORY" ? error.message
        : typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code)
          : error instanceof Error ? `${error.name}:${error.message.slice(0, 120)}` : "UNKNOWN";
    if (code === "PRACTICE_REPORT_INSIDE_REPOSITORY" || mode === "report" || code === "PRACTICE_OUT_ALREADY_HOLDS_LANGUAGE"
      || code === "PRACTICE_OUT_ALREADY_HOLDS_JUDGE_ORDER") directory = null;
    // Once the samples log is open the run has started: what finished is kept, and the verdict is ABORTED.
    if (samplesLog !== null || openingsLog !== null) {
      log(`practice broke midway: ${code}`);
      return abort(code);
    }
    // A refusal's detail says why (flag names, key names, gate states, a bad table's model/step/level; never a secret);
    // the report's reason keeps the code alone.
    log(`practice could not run: ${error instanceof PracticeRefusal ? error.message : code}`);
    return finish(harnessErrorReport(mode, code, startedAt, observer));
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  let control: PracticeControl | null = null;
  const interrupts = practiceInterruptGate();
  const finished = practiceFinishedUnit(process.argv[2]);
  const quit = (code: string): never => {
    let exitCode = 50;
    try { exitCode = control?.abort(code) ?? 50; } catch { /* exit below all the same */ }
    process.exit(exitCode);
  };
  const onInterrupt = () => {
    const action = interrupts.signal();
    // The same key press passed on again by pnpm or tsx (within two seconds of the first): already handled.
    if (action === "REPEAT_IGNORED") return;
    if (action === "FIRST") {
      process.stderr.write("interrupt: no new calls will be sent; waiting for the calls in flight, then the report is written "
        + `(press again after two seconds to quit at once; the report is still written from the finished ${finished})\n`);
      control?.stop();
      return;
    }
    process.stderr.write(`interrupt again: quitting now; writing the report from the finished ${finished}\n`);
    quit("OPERATOR_SECOND_INTERRUPT");
  };
  const onStopFromOutside = (signal: string) => () => {
    // pnpm answers a terminal Ctrl-C by sending its child SIGTERM and quitting itself: within two seconds of the first
    // interrupt that is the same key press, so the calls in flight still finish and the report is still written.
    if (interrupts.justInterrupted()) return;
    process.stderr.write(`${signal}: quitting now; writing the report from the finished ${finished}\n`);
    quit(`OPERATOR_${signal}`);
  };
  // Ours alone: a library's own listener (embedded-postgres's async-exit-hook) would quit with 130 before the report.
  const handlers = { SIGINT: onInterrupt, SIGTERM: onStopFromOutside("SIGTERM"), SIGHUP: onStopFromOutside("SIGHUP") };
  takeOverSignals(process, handlers);
  process.on("uncaughtException", (error) => {
    process.stderr.write(`practice broke: ${error.name}\n`);
    quit(`UNCAUGHT:${error.name}`);
  });
  process.on("unhandledRejection", () => {
    process.stderr.write("practice broke: an unhandled rejection\n");
    quit("UNCAUGHT:UNHANDLED_REJECTION");
  });
  // ADR-0027: an operator command names the keys it reads; the register's loader is the one reader of the environment.
  const env = readOperatorCommandEnvironment(["PRACTICE_ACK", "PRACTICE_DEEPINFRA_SOCKET", "PRACTICE_ANTHROPIC_SOCKET"]);
  const outcome = await runPractice(process.argv.slice(2), env, { onControl: (given) => {
    control = given;
    // Once more as the run starts, in case anything loaded since added its own.
    takeOverSignals(process, handlers);
  } });
  process.exit(outcome.exitCode);
}
