// tests/support/investigation-close-world.ts
// W5-1 (the final report over an investigation): a made-up investigation for the dossier's and the closing's unit tests —
// a first debate about a second ferry pier with two paths, its digs (one READY rewrite with the person's own view, one
// FAILED rewrite that brings its own material, one nested below the first), scripted vendors (Haiku writes, GLM checks)
// that answer from the material they were sent, an in-memory report store and the closing's money check at the
// engine's own counting (projectedCallCeilingMicros: bytes / 2 in, the call's output cap out).
import { projectedCallCeilingMicros, type ProviderTargetPrice } from "@debateai/budget";
import type { InvestigationReportRecord, InvestigationReportsRead, UnreportedClosing } from "@debateai/db";
import { readPromptFrame, type PromptPacket, type ProviderCallRequest, type ProviderCallResult } from "@debateai/providers";
import type { InvestigationCloseInput, InvestigationCloseSettings } from "../../apps/runner/src/investigation-close.js";
import type { DossierDig, DossierInput, DossierPath } from "../../apps/runner/src/investigation-dossier.js";
import { pathRewriteBodyBytes } from "../../apps/runner/src/path-rewrite-material.js";

export const ROOT = "11111111-1111-4111-8111-111111111111";
export const INVESTIGATION = "22222222-2222-4222-8222-222222222222";
export const DIG_READY = "33333333-3333-4333-8333-333333333333";
export const DIG_FAILED = "44444444-4444-4444-8444-444444444444";
export const DIG_NESTED = "55555555-5555-4555-8555-555555555555";
export const PATH_YES = "aaaaaaaa-0000-4000-8000-000000000001";
export const PATH_NO = "aaaaaaaa-0000-4000-8000-000000000002";
export const OWN_VIEW = "Winter ferries run half empty, so the pier is only needed in summer.";

/** Haiku 5.5 and GLM at the preview's prices (packages/providers preview-models.ts), micros per million tokens. */
export const PRICES: Readonly<Record<string, ProviderTargetPrice>> = Object.freeze({
  "ref-haiku": Object.freeze({ inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 500_000 }),
  "ref-glm": Object.freeze({ inputMicrosPerMillionTokens: 150_000, outputMicrosPerMillionTokens: 500_000 }),
  "ref-qwen": Object.freeze({ inputMicrosPerMillionTokens: 113_000, outputMicrosPerMillionTokens: 382_000 })
});

const point = (id: string, text: string, disputed = false, side: "for" | "against" = "for") =>
  Object.freeze({ id, text, onId: null, side, trust: null, disputed });

export function firstPaths(pointsEach = 3): readonly DossierPath[] {
  const make = (ref: string, line: string, prefix: string): DossierPath => Object.freeze({
    ref, storyLine: line, storyFate: "HELD_UP" as const,
    points: Object.freeze(Array.from({ length: pointsEach }, (_, at) => point(`${prefix}${String(at).padStart(4, "0")}-0000-4000-8000-000000000000`,
      `Point ${String(at + 1)} of the path "${line}": ridership at rush hour fills the one pier today.`, at === 1))),
    sources: Object.freeze([Object.freeze({ pointId: `${prefix}0000-0000-4000-8000-000000000000`, site: "city.example.org",
      title: "Ferry ridership 2025", quote: "Rush-hour ridership on the harbour line grew by a quarter between 2023 and 2025, while winter "
        + "ridership stayed flat and the morning boats still leave people on the quay.", line: "The city's own ridership counts." })])
  });
  return Object.freeze([make(PATH_YES, "Yes: a second pier would relieve rush hour.", "bbbb"), make(PATH_NO, "No: the money is better spent on buses.", "cccc")]);
}

export function readyDig(over: Partial<DossierDig> = {}): DossierDig {
  return Object.freeze({
    runId: DIG_READY, parentRunId: ROOT, positionRef: PATH_YES, level: 1, finishedAt: "2026-10-31T10:00:00.000Z",
    picks: Object.freeze([Object.freeze({ text: OWN_VIEW, by: "PERSON_OWN_VIEW" as const }),
      Object.freeze({ text: "How full are winter ferries?", by: "AI_SUGGESTION" as const })]),
    rewrite: Object.freeze({
      rewriteId: "66666666-6666-4666-8666-666666666666", recordedAt: "2026-10-31T10:05:00.000Z", state: "READY" as const,
      before: Object.freeze({ line: "Yes: a second pier would relieve rush hour.", summary: null, fate: "HELD_UP" as const }),
      after: Object.freeze({ line: "Partly: a second pier helps at rush hour, not in winter.",
        summary: "The dig found winter ridership falls by half.", fate: "PARTLY_HELD" as const }),
      whatChanged: Object.freeze(["The dig weakened the year-round case: winter ridership falls."]),
      view: Object.freeze({ outcome: "HELPED" as const, scope: "PATH" as const, reason: "Winter ridership does fall by half." }),
      digPaths: Object.freeze([Object.freeze({ positionRef: "dddddddd-0000-4000-8000-000000000001", line: "Winter ridership falls.", fate: "HELD_UP" as const })])
    }),
    ownMaterial: null,
    ...over
  });
}

export function failedDig(over: Partial<DossierDig> = {}): DossierDig {
  return Object.freeze({
    runId: DIG_FAILED, parentRunId: ROOT, positionRef: PATH_NO, level: 1, finishedAt: "2026-10-31T11:00:00.000Z",
    picks: Object.freeze([Object.freeze({ text: "Would buses carry as many people?", by: "AI_SUGGESTION" as const })]),
    rewrite: Object.freeze({
      rewriteId: "77777777-7777-4777-8777-777777777777", recordedAt: "2026-10-31T11:05:00.000Z", state: "FAILED" as const,
      before: Object.freeze({ line: "No: the money is better spent on buses.", summary: null, fate: "HELD_UP" as const }),
      after: null, whatChanged: Object.freeze([]), view: null, digPaths: Object.freeze([])
    }),
    ownMaterial: Object.freeze({
      answer: Object.freeze([]),
      paths: Object.freeze([Object.freeze({ positionRef: "eeeeeeee-0000-4000-8000-000000000001", statement: "Buses carry fewer at the peak.",
        points: Object.freeze([point("eeeeeeee-0000-4000-8000-0000000000a1", "A bus carries 80 people; a ferry 400.")]), extracts: Object.freeze([]) })]),
      sources: Object.freeze([])
    }),
    ...over
  });
}

export function nestedDig(): DossierDig {
  return readyDig({ runId: DIG_NESTED, parentRunId: DIG_READY, positionRef: "dddddddd-0000-4000-8000-000000000001", level: 2,
    finishedAt: "2026-10-31T12:00:00.000Z",
    picks: Object.freeze([Object.freeze({ text: "Does the summer peak last?", by: "AI_SUGGESTION" as const })]),
    rewrite: Object.freeze({ ...readyDig().rewrite!, rewriteId: "88888888-8888-4888-8888-888888888888", recordedAt: "2026-10-31T12:05:00.000Z",
      view: null, before: Object.freeze({ line: "Winter ridership falls.", summary: null, fate: "HELD_UP" as const }),
      after: Object.freeze({ line: "Winter ridership falls; summer grows.", summary: "The summer peak lasts.", fate: "HELD_UP" as const }),
      digPaths: Object.freeze([]) }) });
}

export function investigationInput(over: Partial<DossierInput> = {}): DossierInput {
  return Object.freeze({
    question: Object.freeze({ line: "Should the city build a second ferry pier?", place: null, time: null, purpose: null,
      readingLevel: null, language: null }),
    first: Object.freeze({ runId: ROOT, answer: Object.freeze({ headline: "Yes, for rush hour.", summary: "A second pier relieves the morning crush.",
      change: "Falling ridership would change it." }), paths: firstPaths() }),
    digs: Object.freeze([failedDig(), nestedDig(), readyDig()]),
    earlier: null,
    ...over
  });
}

/** A chain of digs one below the other, down to `levels`, each with many words: a large tree for the ladder. */
export function deepChain(levels: number, wide = 6, wordy = 2000): readonly DossierDig[] {
  const digs: DossierDig[] = [];
  const pad = "x".repeat(wordy);
  for (let level = 1; level <= levels; level += 1) {
    for (let sibling = 0; sibling < wide; sibling += 1) {
      const id = `${String(level).padStart(8, "0")}-${String(sibling).padStart(4, "0")}-4000-8000-000000000000`;
      const parent = level === 1 ? ROOT : `${String(level - 1).padStart(8, "0")}-0000-4000-8000-000000000000`;
      const parentPath = level === 1 ? PATH_YES : `ffffffff-${String(level - 1).padStart(4, "0")}-4000-8000-000000000000`;
      digs.push(readyDig({ runId: id, parentRunId: parent, positionRef: parentPath, level, finishedAt: `2026-10-31T${String(level).padStart(2, "0")}:${String(sibling).padStart(2, "0")}:00.000Z`,
        picks: Object.freeze([Object.freeze({ text: `Level ${String(level)} pick ${String(sibling)}: ${pad}`, by: "AI_SUGGESTION" as const })]),
        rewrite: Object.freeze({ ...readyDig().rewrite!, rewriteId: id.replace(/^./u, "9"), recordedAt: `2026-10-31T${String(level).padStart(2, "0")}:${String(sibling).padStart(2, "0")}:30.000Z`,
          view: null, whatChanged: Object.freeze([`At level ${String(level)} the dig found ${pad}`]),
          digPaths: Object.freeze([Object.freeze({ positionRef: `ffffffff-${String(level).padStart(4, "0")}-4000-8000-000000000000`, line: `Path below ${pad}`, fate: "HELD_UP" as const })]) }) }));
    }
  }
  return Object.freeze(digs);
}

/* ----------------------------------------------------------------- scripted vendors */

export function fieldsOf(packet: PromptPacket): ReadonlyMap<string, string> {
  return new Map(readPromptFrame({ messages: packet.messages.slice(0, 2) }).fields.map((entry) => [entry.name, entry.content] as const));
}
export const contractOf = (packet: PromptPacket): string => readPromptFrame({ messages: packet.messages.slice(0, 2) }).contractId;

export const SATISFIED = JSON.stringify({ satisfied: true, problem: null, part: null });
export const SATISFIED_STORY = JSON.stringify({ satisfied: true, problem: null, part: null, misleading: false });
export const OBJECTION = JSON.stringify({ satisfied: false, problem: "It calls the winter question settled; the dig left it open.", part: "segments" });
export const STORY_OBJECTION = JSON.stringify({ satisfied: false, problem: "It calls the winter question settled.", part: "how_it_went", misleading: true });

/** An answer that rests on the first path and the first card. */
export function fittingAnswer(): string {
  return JSON.stringify({ segments: [{ text: "Build the pier for rush hour; winter crowds do not need it, so expect it half empty from November.",
    rests_on: ["A1"] }] });
}

/** A story with one paragraph for each card the material gives, in order. */
export function fittingStory(packet: PromptPacket): string {
  const cards = (JSON.parse(fieldsOf(packet).get("follow_ups") ?? "[]") as Array<{ ref: string }>).map((card) => card.ref);
  return JSON.stringify({ short_answer: "Yes, for rush hour.", what_would_change: "If summer ridership fell too.",
    how_it_went: cards.map((card) => ({ card, paragraph: `What follow-up debate number ${card.slice(1)} found about the pier.` })),
    still_open: ["Whether the summer peak lasts."] });
}

export type Vendor = { requests: ProviderCallRequest[] };
export type Script = (packet: PromptPacket, call: number) => string;

function vendor(name: "Anthropic" | "Z.AI", model: string, script: Script) {
  const state: Vendor & { provider: { call: (request: ProviderCallRequest) => Promise<ProviderCallResult> } } = {
    requests: [],
    provider: {
      call: async (request: ProviderCallRequest) => {
        state.requests.push(request);
        // As the gateway does: a reply code refuses gets the follow-up (one more try), so a slip costs a second POST.
        let content = script(request.packet, state.requests.length);
        for (let attempt = 1; attempt < request.bound.maxAttempts; attempt += 1) {
          const status = request.classifyContent?.(content).parseStatus;
          if (status !== "PARSE_FAILED" && status !== "SCHEMA_FAILED") break;
          content = script(request.packet, state.requests.length + attempt);
        }
        return Object.freeze({ rawArtifactRef: `artifact-${model}-${String(state.requests.length)}`, ledgerEntryRef: `ledger-${String(state.requests.length)}`,
          content, provider: "openai-compatible-http" as const, model, maker: name, modelVersion: "1" });
      }
    }
  };
  return state;
}

/** Haiku writes (answer and story from the material), GLM checks (satisfied unless scripted otherwise). */
export function team(scripts: Partial<{ haiku: Script; glm: Script }> = {}) {
  const haiku = vendor("Anthropic", "claude-haiku-5-5", scripts.haiku ?? ((packet) =>
    contractOf(packet).startsWith("report.story") ? fittingStory(packet) : fittingAnswer()));
  const glm = vendor("Z.AI", "zai-org/GLM-5.3-Flash", scripts.glm ?? ((packet) =>
    contractOf(packet) === "report.story-check.v1" ? SATISFIED_STORY : SATISFIED));
  return { haiku, glm };
}

/* ----------------------------------------------------------------- the store and the settings */

export type ReportStore = {
  records: InvestigationReportRecord[];
  contents: Map<string, unknown>;
  waiting: string[];
  /** What each sent call was charged: its projection at the engine's own counting (the worst case). */
  charged: number;
};
export const memoryReports = (): ReportStore => ({ records: [], contents: new Map(), waiting: [], charged: 0 });

export const closingOf = (version = 1, closedAt = "2026-10-31T13:00:00.000Z"): UnreportedClosing =>
  Object.freeze({ investigationId: INVESTIGATION, reportVersion: version, rootRunId: ROOT, closedAt });

export function settingsOver(input: Readonly<{
  store: ReportStore;
  vendors: ReturnType<typeof team>;
  dossier?: DossierInput;
  free?: boolean;
  now?: string;
  logged?: Array<{ event: string; detail: Record<string, unknown> }>;
}>): InvestigationCloseSettings {
  const { store, vendors } = input;
  const projected = (request: ProviderCallRequest) => projectedCallCeilingMicros(PRICES[request.providerRef]!,
    { requestBytes: pathRewriteBodyBytes(request.packet), completionTokenCeiling: request.bound.tokenCeiling });
  const charging = (provider: { call: (request: ProviderCallRequest) => Promise<ProviderCallResult> }) => ({
    call: async (request: ProviderCallRequest) => {
      store.charged += projected(request);
      return provider.call(request);
    }
  });
  const members = [
    { provider: charging(vendors.haiku.provider), providerRef: "ref-haiku", maker: "Anthropic" },
    { provider: charging(vendors.glm.provider), providerRef: "ref-glm", maker: "Z.AI" }
  ];
  const read = (): InvestigationReportsRead => ({ investigation_id: INVESTIGATION, root_run_id: ROOT,
    reports: store.records.map((record) => ({ report_version: record.reportVersion, report_id: record.reportId, outcome: record.outcome,
      story_outcome: record.storyOutcome, failure_code: record.failureCode, covered_rewrite_id: record.coveredRewrite?.rewriteId ?? null,
      covered_rewrite_recorded_at: record.coveredRewrite?.recordedAt ?? null, ladder_step: record.ladderStep, left_out: record.leftOut,
      spent_micros: record.spentMicros, recorded_at: "2026-10-31T14:00:00.000Z", content: record.content === null ? null : record.reportId })) });
  return Object.freeze({
    reports: {
      readUnreported: async () => [],
      readWaiting: async () => ({ investigation_id: INVESTIGATION, root_run_id: ROOT, waiting: [...store.waiting] }),
      record: async (record: InvestigationReportRecord) => {
        if (store.records.some((stored) => stored.reportVersion === record.reportVersion)) return "ALREADY" as const;
        store.records.push(record);
        return "RECORDED" as const;
      },
      readOfRun: async () => read()
    },
    sources: {
      inputOf: async (closing: UnreportedClosing, earlier: InvestigationReportsRead | null): Promise<InvestigationCloseInput> => {
        const prior = (earlier?.reports ?? []).filter((entry) => entry.report_version < closing.reportVersion && entry.content !== null).at(-1);
        const opened = prior === undefined ? null : store.contents.get(prior.report_id) as { answer: { segments: string[] } } | undefined;
        const dossier = input.dossier ?? investigationInput();
        return { free: input.free === true, questionLine: dossier.question.line,
          input: { ...dossier, earlier: opened === undefined || opened === null ? null : { version: prior!.report_version, segments: opened.answer.segments } } };
      }
    },
    seal: async (rootRunId: string, reportId: string, content: unknown) => {
      store.contents.set(reportId, content);
      return { envelope: { sealedFor: rootRunId, key: reportId } as never, attestation: Buffer.from("a") };
    },
    roles: {
      resolveProvider: (roleRef: string) => members.find((member) => member.providerRef === roleRef) ?? null,
      backupCandidates: members,
      backupMakers: members.map((member) => ({ providerRef: member.providerRef, maker: member.maker }))
    },
    writerRoleRef: "ref-haiku",
    checkerRoleRef: "ref-glm",
    admission: { spentMicros: async () => store.charged, projectedMicros: projected },
    closingSeed: () => Buffer.alloc(32, 7),
    now: () => new Date(input.now ?? "2026-10-31T13:05:00.000Z"),
    ...(input.logged === undefined ? {} : { log: (event: string, detail: Record<string, unknown>) => { input.logged!.push({ event, detail }); } })
  });
}
