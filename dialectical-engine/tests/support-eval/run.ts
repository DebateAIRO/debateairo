import { mkdir,mkdtemp,readdir,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { loadHelpCorpus } from "../../packages/support-kb/src/index.js";
import { buildApi,type AskApplication } from "../../apps/api/src/index.js";
import { createSupportAnswerService } from "../../apps/api/src/support/answer.js";
import { createSupportKeyPort } from "../../apps/api/src/support/keys.js";
import type { SupportModelPort } from "../../apps/api/src/support/model.js";
import type { SupportIncidentRecord } from "../../apps/api/src/support/incidents.js";
import {
  createSupportMessageCipher,
  createSupportCaseMaterial,
  createSupportCaseService,
  createWrappedSupportSessionKey
} from "../../apps/api/src/support/session.js";
import type { SupportApplication } from "../../apps/api/src/support/index.js";
import {
  migrate,
  PostgresSupportCaseRepository,
  PostgresSupportMessageRepository,
  PostgresSupportSessionRepository,
  PostgresSupportStatusRepository
} from "../../packages/db/src/index.js";
import type { SupportConfigurationState } from "../../packages/register/src/index.js";
import {
  TEST_APP_ORIGIN,testHttpIdentity,testSessionApplication,testSessionHeaders
} from "../support/httpSession.js";
import { startTestDatabase } from "../support/testDatabase.js";

export type SupportEvalClass = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type SupportEvalMode = "deterministic-structural" | "real-relay";

export type SupportEvalCase = Readonly<{
  id: string;
  className: SupportEvalClass;
  messages: readonly Readonly<{ role: "user";content: string }>[];
  expectedOutcome: string;
  expectedSourceIds: readonly string[];
  expectedLanguage: "en" | "ro";
  forbiddenToolCalls: readonly string[];
}>;

export type SupportEvalObservation = Readonly<{
  outcome: string;
  language: "en" | "ro";
  sourceIds: readonly string[];
  toolCalls: readonly string[];
  modelCalled: boolean;
  firstTokenMs: number | null;
  completedMs: number;
}>;

export type SupportEvalFailure = Readonly<{
  caseId: string;
  constraints: readonly string[];
}>;

export type SupportEvalRun = Readonly<{
  run: number;
  passed: number;
  total: number;
  failures: readonly SupportEvalFailure[];
  firstTokenP95Ms: number | null;
  firstTokenP50Ms: number | null;
  completedP95Ms: number | null;
  deterministicP95Ms: number | null;
  latencyFailures: readonly string[];
  classes: Readonly<Record<SupportEvalClass,Readonly<{ passed: number;total: number }>>>;
}>;

export type SupportEvalReport = Readonly<{
  total: number;
  applicable: number;
  pending: Readonly<Record<"SUP-02" | "SUP-03" | "SUP-05",number>>;
  runs: readonly SupportEvalRun[];
  worstRun: number;
  mode: SupportEvalMode;
  rubric: Readonly<{ status: "PENDING";seat: "independent-eval-author" }>;
  realFirstTokenEvidence: "VERIFIED" | "UNVERIFIED" | "NOT_APPLICABLE";
  verdict: "PASS" | "FAIL" | "PENDING" | "UNVERIFIED";
}>;

type AuthoredCase = Readonly<{
  id: unknown;
  class: unknown;
  messages: unknown;
  expected_outcome: unknown;
  expected_source_ids: unknown;
  expected_language: unknown;
  forbidden_tool_calls: unknown;
}>;

const APPLICABLE_CLASSES = new Set<SupportEvalClass>(["A","B","C","D","E","F","G"]);
const CLASS_PATTERN = /^[A-G]$/u;

function parseCase(value: AuthoredCase): SupportEvalCase {
  if (typeof value.id !== "string"
    || typeof value.class !== "string" || !CLASS_PATTERN.test(value.class)
    || !Array.isArray(value.messages)
    || typeof value.expected_outcome !== "string"
    || !Array.isArray(value.expected_source_ids)
    || (value.expected_language !== "en" && value.expected_language !== "ro")
    || !Array.isArray(value.forbidden_tool_calls)) {
    throw new TypeError("SUPPORT_EVAL_CASE_INVALID");
  }
  const messages = value.messages.map((message: unknown) => {
    if (typeof message !== "object" || message === null
      || (message as { role?: unknown }).role !== "user"
      || typeof (message as { content?: unknown }).content !== "string") {
      throw new TypeError("SUPPORT_EVAL_CASE_INVALID");
    }
    return Object.freeze({ role: "user" as const,content: (message as { content: string }).content });
  });
  if (!value.expected_source_ids.every((source): source is string => typeof source === "string")
    || !value.forbidden_tool_calls.every((tool): tool is string => typeof tool === "string")) {
    throw new TypeError("SUPPORT_EVAL_CASE_INVALID");
  }
  return Object.freeze({
    id: value.id,className: value.class as SupportEvalClass,messages: Object.freeze(messages),
    expectedOutcome: value.expected_outcome,
    expectedSourceIds: Object.freeze([...value.expected_source_ids]),
    expectedLanguage: value.expected_language,
    forbiddenToolCalls: Object.freeze([...value.forbidden_tool_calls])
  });
}

export async function discoverSupportEvalCases(directory: string): Promise<Readonly<{
  cases: readonly SupportEvalCase[];
  applicable: readonly SupportEvalCase[];
  pending: Readonly<Record<"SUP-02" | "SUP-03" | "SUP-05",number>>;
}>> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  const cases = await Promise.all(names.map(async (name) => parseCase(
    JSON.parse(await readFile(join(directory,name),"utf8")) as AuthoredCase
  )));
  const applicable = cases.filter((testCase) => APPLICABLE_CLASSES.has(testCase.className));
  const pending = Object.freeze({
    "SUP-02": cases.filter(({ className }) => className === "G"
      && !APPLICABLE_CLASSES.has(className)).length,
    "SUP-03": cases.filter(({ className }) => className === "E"
      && !APPLICABLE_CLASSES.has(className)).length,
    "SUP-05": cases.filter(({ className }) => className === "F"
      && !APPLICABLE_CLASSES.has(className)).length
  });
  return Object.freeze({ cases: Object.freeze(cases),applicable: Object.freeze(applicable),pending });
}

export function evaluateSupportObservation(
  testCase: SupportEvalCase,
  observation: SupportEvalObservation
): readonly string[] {
  const failures: string[] = [];
  if (observation.outcome !== testCase.expectedOutcome) failures.push("outcome");
  if (observation.language !== testCase.expectedLanguage) failures.push("language");
  if (!testCase.expectedSourceIds.every((source) => observation.sourceIds.includes(source))) {
    failures.push("required_sources");
  }
  if (observation.toolCalls.some((tool) => testCase.forbiddenToolCalls.includes(tool))) {
    failures.push("forbidden_tools");
  }
  return Object.freeze(failures);
}

function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left,right) => left - right);
  return sorted[Math.max(0,Math.ceil(sorted.length * 0.95) - 1)] ?? null;
}

function percentile50(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left,right) => left - right);
  return sorted[Math.max(0,Math.ceil(sorted.length * 0.5) - 1)] ?? null;
}

const LATENCY_TARGETS_MS = Object.freeze({
  firstTokenP50: 3_000,firstTokenP95: 8_000,completedP95: 20_000,deterministicP95: 1_000
});

export async function runSupportEval(input: Readonly<{
  caseDirectory: string;
  runs: number;
  mode: SupportEvalMode;
  executeCase: (testCase: SupportEvalCase,run: number) => Promise<SupportEvalObservation>;
}>): Promise<SupportEvalReport> {
  if (!Number.isInteger(input.runs) || input.runs < 1) throw new TypeError("SUPPORT_EVAL_RUNS_INVALID");
  const discovered = await discoverSupportEvalCases(input.caseDirectory);
  const runs: SupportEvalRun[] = [];
  let missingRealFirstToken = false;
  let observedRealModelCall = false;
  for (let run = 1;run <= input.runs;run += 1) {
    const failures: SupportEvalFailure[] = [];
    const firstTokenMs: number[] = [];
    const completedMs: number[] = [];
    const deterministicMs: number[] = [];
    for (const testCase of discovered.applicable) {
      try {
        const observation = await input.executeCase(testCase,run);
        if (input.mode === "real-relay" && observation.modelCalled) {
          observedRealModelCall = true;
          if (observation.firstTokenMs === null) missingRealFirstToken = true;
        }
        const constraints = evaluateSupportObservation(testCase,observation);
        if (observation.modelCalled && observation.firstTokenMs !== null) {
          firstTokenMs.push(observation.firstTokenMs);
        }
        if (!observation.modelCalled) deterministicMs.push(observation.completedMs);
        completedMs.push(observation.completedMs);
        if (constraints.length > 0) failures.push(Object.freeze({ caseId: testCase.id,constraints }));
      } catch {
        if (input.mode === "real-relay") missingRealFirstToken = true;
        failures.push(Object.freeze({ caseId: testCase.id,constraints: Object.freeze(["execution"]) }));
      }
    }
    const firstTokenP50Ms = percentile50(firstTokenMs);
    const firstTokenP95Ms = percentile95(firstTokenMs);
    const completedP95Ms = percentile95(completedMs);
    const deterministicP95Ms = percentile95(deterministicMs);
    const latencyFailures = Object.freeze([
      ...(firstTokenP50Ms !== null && firstTokenP50Ms > LATENCY_TARGETS_MS.firstTokenP50
        ? [`first_token_p50>${LATENCY_TARGETS_MS.firstTokenP50}ms`] : []),
      ...(firstTokenP95Ms !== null && firstTokenP95Ms > LATENCY_TARGETS_MS.firstTokenP95
        ? [`first_token_p95>${LATENCY_TARGETS_MS.firstTokenP95}ms`] : []),
      ...(completedP95Ms !== null && completedP95Ms > LATENCY_TARGETS_MS.completedP95
        ? [`completed_p95>${LATENCY_TARGETS_MS.completedP95}ms`] : []),
      ...(deterministicP95Ms !== null && deterministicP95Ms > LATENCY_TARGETS_MS.deterministicP95
        ? [`deterministic_p95>${LATENCY_TARGETS_MS.deterministicP95}ms`] : [])
    ]);
    runs.push(Object.freeze({
      run,total: discovered.applicable.length,
      passed: discovered.applicable.length - failures.length,
      failures: Object.freeze(failures),
      firstTokenP50Ms,firstTokenP95Ms,completedP95Ms,deterministicP95Ms,latencyFailures
      ,classes: Object.freeze(Object.fromEntries(
        (["A","B","C","D","E","F","G"] as const).map((className) => {
          const classCases = discovered.applicable.filter((item) => item.className === className);
          const failed = new Set(failures.map((failure) => failure.caseId));
          return [className,Object.freeze({
            passed: classCases.filter((item) => !failed.has(item.id)).length,
            total: classCases.length
          })];
        })
      ) as Record<SupportEvalClass,Readonly<{ passed: number;total: number }>>)
    }));
  }
  const worst = runs.reduce((selected,current) => current.passed < selected.passed ? current : selected);
  const structuralOrLatencyFailure = runs.some((run) =>
    run.passed !== run.total || run.latencyFailures.length > 0
  );
  const realFirstTokenEvidence = input.mode === "deterministic-structural"
    ? "NOT_APPLICABLE" as const
    : observedRealModelCall && !missingRealFirstToken ? "VERIFIED" as const : "UNVERIFIED" as const;
  const verdict = structuralOrLatencyFailure ? "FAIL" as const
    : realFirstTokenEvidence === "UNVERIFIED" ? "UNVERIFIED" as const
      : "PENDING" as const;
  return Object.freeze({
    total: discovered.cases.length,applicable: discovered.applicable.length,
    pending: discovered.pending,runs: Object.freeze(runs),worstRun: worst.run,
    mode: input.mode,
    rubric: Object.freeze({ status: "PENDING" as const,seat: "independent-eval-author" as const }),
    realFirstTokenEvidence,verdict
  });
}

function latency(value: number | null): string {
  return value === null ? "n/a" : `${value}ms`;
}

export function formatSupportEvalReport(report: SupportEvalReport): string {
  const lines = [
    `mode: ${report.mode}`,
    `applicable: ${report.applicable}/${report.total}`,
    `pending: SUP-02 (${report.pending["SUP-02"]}), SUP-03 (${report.pending["SUP-03"]}), SUP-05 (${report.pending["SUP-05"]})`
  ];
  for (const run of report.runs) {
    lines.push(
      `run ${run.run}: structural ${run.passed}/${run.total}; `
      + `first_token_p50=${latency(run.firstTokenP50Ms)} target<=3000ms ${run.firstTokenP50Ms === null ? "UNVERIFIED" : run.firstTokenP50Ms <= 3_000 ? "PASS" : "FAIL"}; `
      + `first_token_p95=${latency(run.firstTokenP95Ms)} target<=8000ms ${run.firstTokenP95Ms === null ? "UNVERIFIED" : run.firstTokenP95Ms <= 8_000 ? "PASS" : "FAIL"}; `
      + `completed_p95=${latency(run.completedP95Ms)} target<=20000ms ${run.completedP95Ms === null ? "UNVERIFIED" : run.completedP95Ms <= 20_000 ? "PASS" : "FAIL"}; `
      + `deterministic_p95=${latency(run.deterministicP95Ms)} target<=1000ms ${run.deterministicP95Ms === null ? "UNVERIFIED" : run.deterministicP95Ms <= 1_000 ? "PASS" : "FAIL"}`
    );
    for (const className of ["A","B","C","D","E","F","G"] as const) {
      const score = run.classes[className];
      if (score.total > 0) lines.push(`class ${className}: ${score.passed}/${score.total}`);
    }
    for (const failure of run.failures) {
      lines.push(`  ${failure.caseId}: ${failure.constraints.join(",")}`);
    }
    for (const failure of run.latencyFailures) lines.push(`  latency: ${failure}`);
  }
  lines.push(`real_first_token: ${report.realFirstTokenEvidence}`);
  lines.push(`rubric: ${report.rubric.status} (${report.rubric.seat})`);
  lines.push(`VERDICT (worst run): ${report.verdict} (run ${report.worstRun})`);
  return lines.join("\n");
}

export function supportEvalExitCode(report: SupportEvalReport): 0 | 1 {
  return report.verdict === "PASS" ? 0 : 1;
}

function evalAskApplication(): AskApplication {
  return {
    withContentLease: async (_runId,use) => use(),
    submit: async () => ({ run_ref: "run:support-eval",status: "QUEUED" }),
    readAnswer: async () => null,readRunAnswer: async () => null,readRun: async () => null,
    readAnswerIndex: async (_session,limit,offset) => ({
      items: [],open_runs: [],limit,offset,total: 0
    }),
    readInspection: async () => null,readLedgerDigest: async () => null,
    readNode: async () => null,recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1,rows: [] },scorecards: [],model_ledger: [],
      fleet: { state: "UNAVAILABLE",reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () { return; }
  };
}

const EVAL_CONFIGURATION = Object.freeze({
  kind: "AVAILABLE",
  snapshot: Object.freeze({
    supportRegisterVersion: "9007199254740992",schemaVersion: 1,
    recordedAt: new Date("2026-09-06T00:00:00.000Z"),
    supportSnapshotSha256: "b".repeat(64),fullSnapshotSha256: "c".repeat(64),
    values: Object.freeze({
      supportEnabled: true,supportModelRef: "eval:deterministic-structural-stub",supportRelayConcurrency: 2,
      supportDailyCallCap: 500,supportLimitAnonMessages10m: 20,
      supportLimitAnonMessages24h: 100,supportLimitAnonSessions1h: 5,
      supportLimitSessionMessages: 40,supportLimitMessageCharacters: 2_000,
      supportLimitAccountMessages10m: 60,supportLimitAccountMessages24h: 300,
      supportQueueDepth: 10,supportLockAfterInjections: 3,supportIpCooldownMinutes: 60,
      supportRetentionPolicy: "keep",supportRetentionRatifiedBy: null
    })
  })
}) as SupportConfigurationState;

const DETERMINISTIC_STRUCTURAL_RELAY: SupportModelPort = Object.freeze({
  complete: async (input: Parameters<SupportModelPort["complete"]>[0]) => Object.freeze({
    text: input.language === "ro"
      ? "Iată explicația bazată exclusiv pe ajutorul verificat."
      : "Here is the explanation based only on the verified help entry."
  })
});

const EVAL_IDENTITY = testHttpIdentity("support-eval-public-guide");

export async function createInProcessSupportEvalExecutor(input: Readonly<{
  mode?: SupportEvalMode;
  realRelay?: SupportModelPort;
}> = {}): Promise<Readonly<{
  executeCase: (testCase: SupportEvalCase,run: number) => Promise<SupportEvalObservation>;
  close: () => Promise<void>;
}>> {
  const mode = input.mode ?? "deterministic-structural";
  const relay = mode === "deterministic-structural"
    ? DETERMINISTIC_STRUCTURAL_RELAY : input.realRelay;
  if (relay === undefined) throw new TypeError("SUPPORT_EVAL_REAL_RELAY_REQUIRED");
  const database = await startTestDatabase();
  let keyRoot: string | undefined;
  let server: FastifyInstance | undefined;
  let keys: Awaited<ReturnType<typeof createSupportKeyPort>> | undefined;
  let currentEvalCase: SupportEvalCase | undefined;
  try {
    await migrate(database.pool);
    keyRoot = await mkdtemp(join(tmpdir(),"debateai-support-eval-keys-"));
    const secrets = join(keyRoot,"secrets");
    await mkdir(secrets,{ mode: 0o700 });
    const supportKekPath = join(secrets,"support-kek.bin");
    await writeFile(supportKekPath,Buffer.alloc(32,0x65),{ mode: 0o600 });
    keys = await createSupportKeyPort({ supportKekPath });
    const sessionRepository = new PostgresSupportSessionRepository(
      database.pool,createWrappedSupportSessionKey(keys)
    );
    const messages = createSupportMessageCipher(
      keys,new PostgresSupportMessageRepository(database.pool)
    );
    const status = new PostgresSupportStatusRepository(database.pool);
    const corpus = loadHelpCorpus("packages/support-kb/content");
    const evalIncident: SupportIncidentRecord = Object.freeze({
      incidentId: "eval-active",startedAt: new Date("2026-09-07T08:30:00.000Z"),
      endedAt: null,severity: "major",affectedSurface: "whole-site",
      summaryEn: "Debates are slow to generate.",
      summaryRo: "Dezbaterile se generează lent.",publishedBy: "V",
      publishedAt: new Date("2026-09-07T08:35:00.000Z"),sourceRef: null
    });
    const incidents = Object.freeze({
      readActiveIncidents: async () => currentEvalCase?.id === "SUP-F-01-OPEN-INCIDENT-EN"
        || currentEvalCase?.id === "SUP-F-02-OPEN-INCIDENT-RO"
        ? Object.freeze([evalIncident]) : Object.freeze([])
    });
    const answer = createSupportAnswerService({
      entries: corpus.entries,messages,modelFor: () => relay,incidents
    });
    const cases = createSupportCaseService({
      messages,
      create: async (request) => new PostgresSupportCaseRepository(
        database.pool,createSupportCaseMaterial(keys!,request.transcriptSnapshot)
      ).createCase({
        caseId: request.caseId,tokenSha256: request.tokenSha256,
        sessionId: request.sessionId,identityOwnerRef: request.identityOwnerRef,
        language: request.language,createdAt: request.createdAt,
        triggerPredicate: request.triggerPredicate,toolCalls: request.toolCalls,
        kbVersion: request.kbVersion,slaHours: request.slaHours
      })
    });
    const support: SupportApplication = Object.freeze({
      configuration: Object.freeze({ current: async () => EVAL_CONFIGURATION }),
      sessions: Object.freeze({
        create: sessionRepository.create.bind(sessionRepository),
        read: sessionRepository.read.bind(sessionRepository),
        admitMessage: sessionRepository.admitMessage.bind(sessionRepository),
        admitIpSession: sessionRepository.admitIpSession.bind(sessionRepository),
        finalizeInjectionLock: sessionRepository.finalizeInjectionLock.bind(sessionRepository),
        recordRateLimit: sessionRepository.recordRateLimit.bind(sessionRepository),
        rateMessage: sessionRepository.rateMessage.bind(sessionRepository),
        status: status.status.bind(status)
      }),
      messages,answer,cases,incidents,
      knowledge: Object.freeze({
        status: async () => Object.freeze({
          kbVersion: corpus.kbVersion,shipped: corpus.shippedCount,ignored: corpus.ignoredCount
        }),
        snapshot: (version: string) => version === corpus.kbVersion ? corpus : undefined
      })
    });
    server = buildApi({
      application: evalAskApplication(),sessions: testSessionApplication([EVAL_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN,support
    });
    let address = 0;
    const activeServer = server;
    return Object.freeze({
      executeCase: async (testCase: SupportEvalCase) => {
        currentEvalCase = testCase;
        address += 1;
        const ip = `198.51.${Math.floor(address / 250)}.${(address % 250) + 1}`;
        const identityHeaders = testCase.className === "E"
          ? testSessionHeaders(EVAL_IDENTITY,true) : {};
        const opened = await activeServer.inject({
          method: "POST",url: "/v1/support/sessions",
          headers: { ...identityHeaders,"x-forwarded-for": ip },
          payload: { language: testCase.expectedLanguage }
        });
        if (opened.statusCode !== 201) throw new TypeError("SUPPORT_EVAL_SESSION_FAILED");
        const capability = opened.json<{
          session: { session_id: string };
          session_token: string;
        }>();
        let response: Awaited<ReturnType<FastifyInstance["inject"]>> | undefined;
        for (const message of testCase.messages) {
          response = await activeServer.inject({
            method: "POST",url: `/v1/support/sessions/${capability.session.session_id}/messages`,
            headers: {
              ...identityHeaders,"x-support-session-token": capability.session_token,
              "x-forwarded-for": ip
            },
            payload: { text: message.content }
          });
          if (response.statusCode !== 200) {
            throw new TypeError(`SUPPORT_EVAL_MESSAGE_FAILED_${response.statusCode}`);
          }
        }
        if (response === undefined) throw new TypeError("SUPPORT_EVAL_CASE_EMPTY");
        const body = response.json<{
          outcome: string;
          sources: readonly Readonly<{ id: string }>[];
        }>();
        const timestamp = (await database.pool.query<{
          received_at: Date;
          first_token_at: Date | null;
          completed_at: Date | null;
          language: "en" | "ro";
          model_called: boolean;
        }>(`
          SELECT received_at,first_token_at,completed_at,language,model_called
          FROM support.message
          WHERE session_id=$1 AND role='assistant'
          ORDER BY received_at DESC,message_id DESC LIMIT 1
        `,[capability.session.session_id])).rows[0];
        if (timestamp === undefined || timestamp.completed_at === null) {
          throw new TypeError("SUPPORT_EVAL_TIMESTAMPS_MISSING");
        }
        const recordedTools = (await database.pool.query<{ name: string }>(`
          SELECT name FROM support.tool_call WHERE session_id=$1 ORDER BY at,tool_call_id
        `,[capability.session.session_id])).rows.map(({ name }) => name);
        return Object.freeze({
          outcome: body.outcome,language: timestamp.language,
          sourceIds: Object.freeze((body.sources ?? []).map(({ id }) => id).sort()),
          toolCalls: Object.freeze(recordedTools),modelCalled: timestamp.model_called,
          firstTokenMs: timestamp.first_token_at === null ? null
            : timestamp.first_token_at.getTime() - timestamp.received_at.getTime(),
          completedMs: timestamp.completed_at.getTime() - timestamp.received_at.getTime()
        });
      },
      close: async () => {
        await activeServer.close();
        await keys?.close();
        await database.stop();
        if (keyRoot !== undefined) await rm(keyRoot,{ recursive: true,force: true });
      }
    });
  } catch (error) {
    await server?.close().catch(() => undefined);
    await keys?.close().catch(() => undefined);
    await database.stop().catch(() => undefined);
    if (keyRoot !== undefined) await rm(keyRoot,{ recursive: true,force: true });
    throw error;
  }
}

function requestedRuns(arguments_: readonly string[]): number {
  const inline = arguments_.find((argument) => argument.startsWith("--runs="));
  const separate = arguments_.findIndex((argument) => argument === "--runs");
  const raw = inline?.slice("--runs=".length)
    ?? (separate === -1 ? undefined : arguments_[separate + 1]);
  const runs = raw === undefined ? 3 : Number(raw);
  if (!Number.isInteger(runs) || runs < 1) throw new TypeError("SUPPORT_EVAL_RUNS_INVALID");
  return runs;
}

function requestedMode(arguments_: readonly string[]): SupportEvalMode {
  const inline = arguments_.find((argument) => argument.startsWith("--mode="));
  const separate = arguments_.findIndex((argument) => argument === "--mode");
  const raw = inline?.slice("--mode=".length)
    ?? (separate === -1 ? undefined : arguments_[separate + 1])
    ?? "deterministic-structural";
  if (raw !== "deterministic-structural" && raw !== "real-relay") {
    throw new TypeError("SUPPORT_EVAL_MODE_INVALID");
  }
  return raw;
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  const mode = requestedMode(arguments_);
  const executor = await createInProcessSupportEvalExecutor({ mode });
  let exitCode: 0 | 1 = 1;
  try {
    const report = await runSupportEval({
      caseDirectory: "tests/support-eval/cases",
      runs: requestedRuns(arguments_),mode,
      executeCase: executor.executeCase
    });
    console.log(formatSupportEvalReport(report));
    exitCode = supportEvalExitCode(report);
  } finally {
    await executor.close();
  }
  process.exit(exitCode);
}

if (process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof TypeError && error.message.startsWith("SUPPORT_EVAL_")
      ? error.message : "SUPPORT_EVAL_FAILED");
    process.exitCode = 1;
  });
}
