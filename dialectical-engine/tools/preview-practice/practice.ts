/**
 * Preview practice: the command.
 *
 * Plain words: before anything is uploaded to the v3 preview, this runs a PRACTICE with all five real AIs from the
 * candidate code on this computer. Nothing is published and nothing reaches the site: the debate lives in a
 * throwaway database that is deleted at the end. The only thing it shares with the live preview is the two spending
 * gates on the server (they hold the keys; this computer never sees one), reached through SSH-forwarded sockets and a
 * small relay on the server (gate-relay.py). It spends real money, a little: see the README.
 *
 * Two modes, and a third command:
 *  - formats: every model asked to do every job a few times; each reply checked by that job's real format check. The
 *    models work at the same time (one call each at a time); --sequential sends one call at a time. Every finished job
 *    is written to <out>/samples.jsonl at once (practice-samples-log.ts), and the report is built from it.
 *    With --levels (spec 2026-10-12 §4.8, practice-levels.ts) the listed models do every job once per listed
 *    thinking level, the runs taking turns, and the report gets a levels table.
 *  - debate:  one whole practice debate (depth 1 by default, 2 allowed) through the real ask path and the real runner.
 *             With --transcript it also writes <out>/transcript.json: every prompt and every reply, decrypted
 *             (practice-transcript.ts).
 *  - report:  builds report.json and report.md again from <out>/samples.jsonl (sends nothing, needs no gate). With
 *             --side-by-side <samples.jsonl> it writes <out>/side-by-side.html instead (spec 2026-10-12 §4.8).
 *
 * The exact commands are in tools/preview-practice/README.md. Exit codes: 0 PASS, 10 PASS_WITH_WARNINGS, 20 FAIL,
 * 30 NOT_PROVEN, 40 HARNESS_ERROR, 50 ABORTED.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createPreviewBudgetRpcPort,
  parseProviderDiscoveryTargets,
  previewRunnerPolicy,
  previewModelRow,
  previewTargetJsonRow,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  type PreviewGateRemaining
} from "@debateai/providers";
import { readOperatorCommandEnvironment } from "@debateai/register";
import { loadStoryPack, resolveStoryPackDir } from "@debateai/story";
import { DEVELOPMENT_ORGAN_COST_BOUNDS } from "../../apps/runner/src/dev-deployment-register.js";
import { practiceRemainingPorts } from "./practice-ask-composition.js";
import { runPracticeDebate } from "./practice-debate.js";
import { onePerModel, PRACTICE_FORMATS_DEFAULTS, runPracticeFormats } from "./practice-formats.js";
import { PracticeGateObserver, type PracticeGateName } from "./practice-gate-observer.js";
import { parsePracticeLevels, type PracticeLevelPlan } from "./practice-levels.js";
import { practiceInterruptGate, takeOverSignals } from "./practice-interrupt.js";
import { PRACTICE_LANES, type PracticeLane } from "./practice-lanes.js";
import { composePracticeNextRegisterVersion, parsePracticeRegisterExport, PracticeRegisterError } from "./practice-register-import.js";
import {
  abortedReport,
  assertOutsideRepository,
  debateReport,
  defaultReportDirectory,
  harnessErrorReport,
  writeReport,
  type PracticeReport
} from "./practice-report.js";
import {
  parsePracticeSampleLog,
  PracticeSampleLog,
  practiceReportFromLog,
  readPracticeSampleLog,
  remainingLine
} from "./practice-samples-log.js";
import { writeSideBySideFile } from "./practice-side-by-side.js";
import {
  assertGateStatusAllowsPractice,
  PracticeRefusal,
  practiceSocketsFromEnvironment,
  readGateStatus,
  readPracticeSettings
} from "./practice-settings.js";

const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The repository's top folder (git's answer; the engine folder's parent if git cannot answer). */
export function repositoryRoot(): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: ENGINE_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return resolve(ENGINE_ROOT, "..");
  }
}

type Args = Readonly<{ mode: "formats" | "debate" | "report"; flags: ReadonlyMap<string, string>; switches: ReadonlySet<string> }>;

const VALUE_FLAGS = new Set(["--settings", "--register-export", "--gate-status-deepinfra", "--gate-status-anthropic", "--out",
  "--samples", "--gap-ms", "--models", "--lanes", "--depth", "--question", "--max-in-flight", "--busy-wait-minutes", "--levels",
  "--side-by-side"]);
const SWITCHES = new Set<string>(["--sequential", "--transcript", "--register-next"]);

export function parsePracticeArgs(argv: readonly string[]): Args {
  const [mode, ...rest] = argv;
  if (mode !== "formats" && mode !== "debate" && mode !== "report") throw new PracticeRefusal("PRACTICE_MODE_REQUIRED", "formats, debate or report");
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
  let mode = argv[0] === "debate" ? "debate" : argv[0] === "report" ? "report" : "formats";
  let directory: string | null = null;
  let observer: PracticeGateObserver | null = null;
  // Formats: the samples log, open from just before the first paid call to the end line.
  let samplesLog: PracticeSampleLog | null = null;
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
  try {
    const args = parsePracticeArgs(argv);
    mode = args.mode;
    if (args.switches.has("--transcript") && args.mode !== "debate") {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--transcript (debate mode only)");
    }
    if (args.flags.has("--levels") && args.mode !== "formats") {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--levels (formats mode only)");
    }
    if (args.flags.has("--side-by-side") && args.mode !== "report") {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--side-by-side (report mode only)");
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
      // Rebuilds the report from an existing samples log; nothing is sent. On a refusal nothing is written there.
      let lines;
      try { lines = readPracticeSampleLog(folder); } catch (error) {
        throw new PracticeRefusal(error instanceof Error && /^PRACTICE_/u.test(error.message) ? error.message : "PRACTICE_SAMPLES_LOG_UNREADABLE");
      }
      directory = assertOutsideRepository(folder, repositoryRoot());
      return finish(practiceReportFromLog(lines));
    }
    directory = assertOutsideRepository(args.flags.get("--out") ?? defaultReportDirectory(mode, startedAt), repositoryRoot());
    const sockets = practiceSocketsFromEnvironment(env);
    const settings = readPracticeSettings(required(args, "--settings"));
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
    const register = mode === "debate" ? (() => {
      let text: string;
      try { text = readFileSync(required(args, "--register-export"), "utf8"); } catch (error) {
        if (error instanceof PracticeRefusal) throw error;
        throw new PracticeRefusal("PRACTICE_REGISTER_EXPORT_UNREADABLE");
      }
      return parsePracticeRegisterExport(text);
    })() : null;
    // --register-next: the code's next register version, composed before anything is spent (a refusal costs nothing).
    if (args.switches.has("--register-next") && mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_UNKNOWN", "--register-next (debate only)");
    const registerNext = register !== null && args.switches.has("--register-next")
      ? await composePracticeNextRegisterVersion(register) : null;
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
    if (mode === "formats") {
      const lanes = lanesOf(args) ?? [...PRACTICE_LANES];
      for (const model of wanted) {
        const gate = previewModelRow(model)?.provider === "anthropic" ? "anthropic" : "deepinfra";
        if (!before[gate]!.enabledModels.includes(model)) throw new PracticeRefusal("PRACTICE_MODEL_NOT_ENABLED_AT_GATE", model);
      }
      const configured = PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
        const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
        return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
      });
      const declared = parseProviderDiscoveryTargets(settings.runner.PROVIDER_DISCOVERY_TARGETS_JSON, configured);
      const policy = previewRunnerPolicy({
        bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs,
        synthesisRolePolicy: { synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER,
          evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE }
      }, settings.previewConfig);
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
      await runPracticeFormats({
        config: settings.previewConfig,
        targets,
        ports: budgetPorts,
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
      questionId: args.flags.get("--question") ?? "ro",
      ...(options.wait === undefined ? {} : { wait: options.wait }),
      ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
      progress: log,
      transcriptDirectory: args.switches.has("--transcript") ? directory : null
    });
    return finish(debateReport({ result, observer, startedAt, finishedAt: new Date() }));
  } catch (error) {
    const code = error instanceof PracticeRefusal || error instanceof PracticeRegisterError ? error.code
      : error instanceof Error && error.message === "PRACTICE_REPORT_INSIDE_REPOSITORY" ? error.message
        : typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code)
          : error instanceof Error ? `${error.name}:${error.message.slice(0, 120)}` : "UNKNOWN";
    if (code === "PRACTICE_REPORT_INSIDE_REPOSITORY" || mode === "report") directory = null;
    // Once the samples log is open the run has started: what finished is kept, and the verdict is ABORTED.
    if (samplesLog !== null) {
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
        + "(press again after two seconds to quit at once; the report is still written from the finished samples)\n");
      control?.stop();
      return;
    }
    process.stderr.write("interrupt again: quitting now; writing the report from the finished samples\n");
    quit("OPERATOR_SECOND_INTERRUPT");
  };
  const onStopFromOutside = (signal: string) => () => {
    // pnpm answers a terminal Ctrl-C by sending its child SIGTERM and quitting itself: within two seconds of the first
    // interrupt that is the same key press, so the calls in flight still finish and the report is still written.
    if (interrupts.justInterrupted()) return;
    process.stderr.write(`${signal}: quitting now; writing the report from the finished samples\n`);
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
