/**
 * Preview practice: the command.
 *
 * Plain words: before anything is uploaded to the v3 preview, this runs a PRACTICE with all five real AIs from the
 * candidate code on this computer. Nothing is published and nothing reaches the site: the debate lives in a
 * throwaway database that is deleted at the end. The only thing it shares with the live preview is the two spending
 * gates on the server (they hold the keys; this computer never sees one), reached through SSH-forwarded sockets and a
 * small relay on the server (gate-relay.py). It spends real money, a little: see the README.
 *
 * Two modes:
 *  - formats: every model asked to do every job a few times; each reply checked by that job's real format check.
 *  - debate:  one whole practice debate (depth 1 by default, 2 allowed) through the real ask path and the real runner.
 *
 * The exact commands are in tools/preview-practice/README.md. Exit codes: 0 PASS, 10 PASS_WITH_WARNINGS, 20 FAIL,
 * 30 NOT_PROVEN, 40 HARNESS_ERROR.
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
import { onePerModel, runPracticeFormats } from "./practice-formats.js";
import { PracticeGateObserver, type PracticeGateName } from "./practice-gate-observer.js";
import { PRACTICE_LANES, type PracticeLane } from "./practice-lanes.js";
import { parsePracticeRegisterExport, PracticeRegisterError } from "./practice-register-import.js";
import {
  assertOutsideRepository,
  debateReport,
  defaultReportDirectory,
  formatsReport,
  harnessErrorReport,
  writeReport,
  type PracticeReport
} from "./practice-report.js";
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

type Args = Readonly<{ mode: "formats" | "debate"; flags: ReadonlyMap<string, string>; switches: ReadonlySet<string> }>;

const VALUE_FLAGS = new Set(["--settings", "--register-export", "--gate-status-deepinfra", "--gate-status-anthropic", "--out",
  "--samples", "--gap-ms", "--models", "--lanes", "--depth", "--question"]);
const SWITCHES = new Set<string>();

export function parsePracticeArgs(argv: readonly string[]): Args {
  const [mode, ...rest] = argv;
  if (mode !== "formats" && mode !== "debate") throw new PracticeRefusal("PRACTICE_MODE_REQUIRED", "formats or debate");
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
}>;

export type PracticeRunResult = Readonly<{ exitCode: number; report: PracticeReport; directory: string | null }>;

export async function runPractice(argv: readonly string[], env: Readonly<Record<string, string | undefined>>,
  options: PracticeRunOptions = {}): Promise<PracticeRunResult> {
  const startedAt = new Date();
  const log = options.log ?? ((line: string) => { process.stderr.write(`${line}\n`); });
  let mode = argv[0] === "debate" ? "debate" : "formats";
  let directory: string | null = null;
  let observer: PracticeGateObserver | null = null;
  const finish = (report: PracticeReport): PracticeRunResult => {
    if (directory !== null) {
      const written = writeReport(directory, report);
      log(`report: ${written.json}`);
      log(`summary: ${written.markdown}`);
    }
    log(`PRACTICE_VERDICT ${report.verdict} exit ${String(report.exitCode)}`);
    return Object.freeze({ exitCode: report.exitCode, report, directory });
  };
  try {
    const args = parsePracticeArgs(argv);
    mode = args.mode;
    directory = assertOutsideRepository(args.flags.get("--out") ?? defaultReportDirectory(mode, startedAt), repositoryRoot());
    const sockets = practiceSocketsFromEnvironment(env);
    const settings = readPracticeSettings(required(args, "--settings"));
    const unbilledTodayAtStart: Record<PracticeGateName, number> = { deepinfra: 0, anthropic: 0 };
    for (const gate of ["deepinfra", "anthropic"] as const) {
      const status = readGateStatus(gate, required(args, `--gate-status-${gate}`));
      assertGateStatusAllowsPractice(gate, status);
      unbilledTodayAtStart[gate] = status.todayUnbilled;
    }
    const register = mode === "debate" ? (() => {
      let text: string;
      try { text = readFileSync(required(args, "--register-export"), "utf8"); } catch (error) {
        if (error instanceof PracticeRefusal) throw error;
        throw new PracticeRefusal("PRACTICE_REGISTER_EXPORT_UNREADABLE");
      }
      return parsePracticeRegisterExport(text);
    })() : null;
    // The brake counts the day's unbilled refusals from root's count at the start (practice-gate-observer.ts).
    observer = new PracticeGateObserver({ unbilledTodayAtStart });
    let stopRequested = false;
    const stop = () => {
      stopRequested = true;
      observer?.stop("deepinfra", "OPERATOR_INTERRUPT");
      observer?.stop("anthropic", "OPERATOR_INTERRUPT");
    };
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
      const wanted = args.flags.get("--models")?.split(",").map((model) => model.trim()).filter((model) => model !== "")
        ?? [...settings.previewConfig.premium_model_ids];
      if (wanted.some((model) => !settings.previewConfig.premium_model_ids.includes(model))) {
        throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--models (not in the preview's roster)");
      }
      const lanes = (args.flags.get("--lanes")?.split(",").map((lane) => lane.trim()) ?? [...PRACTICE_LANES]) as PracticeLane[];
      if (lanes.length === 0 || lanes.some((lane) => !(PRACTICE_LANES as readonly string[]).includes(lane))) {
        throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--lanes");
      }
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
      const result = await runPracticeFormats({
        config: settings.previewConfig,
        targets: onePerModel(declared, wanted),
        ports: budgetPorts,
        observer,
        lanes,
        samples: wholeNumber(args, "--samples", 3, 1, 10),
        gapMs: wholeNumber(args, "--gap-ms", 2_000, 0, 600_000),
        pack: loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url })),
        bounds: { judge: policy.bounds.JUDGE, synthesizer: policy.synthesisRolePolicy.synthesizerBound,
          evaluator: policy.synthesisRolePolicy.evaluatorBound },
        ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
        progress: log,
        shouldStop: () => stopRequested
      });
      const after = {
        deepinfra: await remainingPorts.deepinfra().catch(() => null),
        anthropic: await remainingPorts.anthropic().catch(() => null)
      };
      return finish(formatsReport({ result, observer, startedAt, finishedAt: new Date(), interrupted: stopRequested,
        remaining: { deepinfra: { before: before.deepinfra, after: after.deepinfra }, anthropic: { before: before.anthropic, after: after.anthropic } } }));
    }
    const result = await runPracticeDebate({
      settings, sockets, register: register!,
      budgetPorts, observer, depth: wholeNumber(args, "--depth", 1, 1, 2),
      questionId: args.flags.get("--question") ?? "ro",
      ...(options.wait === undefined ? {} : { wait: options.wait }),
      ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
      progress: log
    });
    return finish(debateReport({ result, observer, startedAt, finishedAt: new Date() }));
  } catch (error) {
    const code = error instanceof PracticeRefusal || error instanceof PracticeRegisterError ? error.code
      : error instanceof Error && error.message === "PRACTICE_REPORT_INSIDE_REPOSITORY" ? error.message
        : typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code)
          : error instanceof Error ? `${error.name}:${error.message.slice(0, 120)}` : "UNKNOWN";
    if (code === "PRACTICE_REPORT_INSIDE_REPOSITORY") directory = null;
    log(`practice could not run: ${code}`);
    return finish(harnessErrorReport(mode, code, startedAt, observer));
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  let interrupts = 0;
  let stopper: (() => void) | null = null;
  process.on("SIGINT", () => {
    interrupts += 1;
    if (interrupts === 1) {
      process.stderr.write("interrupt: no new calls will be sent; waiting for the call in flight (press again to quit at once)\n");
      stopper?.();
      return;
    }
    process.exit(130);
  });
  // ADR-0027: an operator command names the keys it reads; the register's loader is the one reader of the environment.
  const env = readOperatorCommandEnvironment(["PRACTICE_ACK", "PRACTICE_DEEPINFRA_SOCKET", "PRACTICE_ANTHROPIC_SOCKET"]);
  const outcome = await runPractice(process.argv.slice(2), env, { onObserver: (_observer, stop) => { stopper = stop; } });
  process.exit(outcome.exitCode);
}
