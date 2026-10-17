/**
 * Preview practice, mode "judge-order" (engine redesign R2b, owner ruling D3, 2026-10-16): do the comparing judges lean
 * on the order they read the answers in?
 *
 * Plain words: every transcript.json under --transcripts that holds an engine-2 debate is read again. For each comparing
 * judge whose vote the debate recorded, the very prompt that judge was sent goes once more to the same AI, with ONE
 * change: the answers are listed in the reverse order, each keeping its letter. The report says, per maker of the judge:
 * how often its choice changed (the flip rate), how often it chose the longest answer it was shown (in both orders,
 * beside the rate chance alone would give), and how often it called its choice conditional (in both orders). With
 * --control the prompt also goes once more unchanged, so an order effect can be told from an AI that simply answers
 * differently each time. The numbers go to the owner; nothing here changes how a debate is judged (no both-orders rule
 * until the owner has seen them). It is never part of `rescore`, which asks no AI: this mode spends a little real money,
 * one judge call per recorded vote (two with --control). Counts and codes only in the report, no reply text; the
 * judge-order.jsonl log holds the same. An answer's length is the words of its answer, its case and its supporting
 * points, words being runs of characters between spaces.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import {
  COMPARING_JUDGE_CONTRACT_ID, COMPARING_JUDGE_LIMITS, COMPARING_JUDGE_READING, classifyComparingJudgeReply,
  comparingJudgeReplySchema, parseStructuredArtifact
} from "@debateai/judgement";
import {
  ENGINE_ANSWER_LETTERS, QUESTION_LANGUAGE_FIELD, comparingJudgeCallSiteKey, questionLanguageFromRun,
  type EngineAnswerLetter, type QuestionLanguage
} from "@debateai/kernel";
import {
  appendFramedRejection, createPreviewGuardedFetch, readPromptFrame, rememberingAcceptedReply, schemaFailureLocator,
  structureRepairOriginalKey, type CallBound, type PreviewBudgetPort, type PreviewBudgetPorts, type PreviewProviderTestConfig,
  type PromptPacket, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { errorCodeOf, practiceJobGateway } from "./practice-formats.js";
import type { PracticeGateObserver } from "./practice-gate-observer.js";
import { openingsDryPacket, openingsDryVendorReply } from "./practice-openings-dry.js";
import type { PracticeReport } from "./practice-report.js";
import { PracticeJsonlWriter } from "./practice-samples-log.js";
import { PracticeRefusal } from "./practice-settings.js";
import type { PracticeTranscript, TranscriptAttempt } from "./practice-transcript.js";
import { PRACTICE_EXIT_CODES, type PracticeVerdict } from "./practice-verdict.js";

export const PRACTICE_JUDGE_ORDER_SCHEMA = "preview-practice-judge-order-v1" as const;
export const PRACTICE_JUDGE_ORDER_FILES = Object.freeze({ transcript: "transcript.json", log: "judge-order.jsonl" });
const GATE_NAMES = Object.freeze(["deepinfra", "anthropic"] as const);
const UNREADABLE = "PRACTICE_JUDGE_ORDER_PROMPT_UNREADABLE";

class JudgeOrderSkip extends Error {
  constructor(readonly code: string) { super(code); }
}
const unreadable = (): never => { throw new JudgeOrderSkip(UNREADABLE); };

type JudgeAnswerShown = Readonly<{ letter: string; answer?: unknown; case?: unknown; supporting_points?: unknown }>;

/** The answers the packet shows, in the order shown (B1's `answers` field). */
function shownAnswersOf(packet: PromptPacket): readonly JudgeAnswerShown[] {
  let fields;
  try { fields = readPromptFrame(packet).fields; } catch { return unreadable(); }
  const content = fields.find((field) => field.name === "answers")?.content;
  if (content === undefined) return unreadable();
  let answers: unknown;
  try { answers = JSON.parse(content); } catch { return unreadable(); }
  if (!Array.isArray(answers) || answers.length < 2) return unreadable();
  if (!answers.every((entry) => typeof entry === "object" && entry !== null
    && (ENGINE_ANSWER_LETTERS as readonly unknown[]).includes((entry as { letter?: unknown }).letter))) return unreadable();
  return Object.freeze(answers as JudgeAnswerShown[]);
}

/**
 * The saved judge packet with the `answers` list in reverse order; every other byte kept (the instruction, the safety
 * frame, its fence and canary, every other field). Refused (PRACTICE_JUDGE_ORDER_PROMPT_UNREADABLE) unless the packet is a
 * comparing judge's framed packet (system + user) whose material block re-reads byte for byte and shows two or more
 * answers; the result is checked with the frame's own reader.
 */
export function reversedJudgePacket(packet: PromptPacket): PromptPacket {
  let frame;
  try { frame = readPromptFrame(packet); } catch { return unreadable(); }
  if (frame.contractId !== COMPARING_JUDGE_CONTRACT_ID || packet.messages.length !== 2) return unreadable();
  const [system, user] = packet.messages;
  const lines = user?.role === "user" ? user.content.split("\n") : [];
  if (system?.role !== "system" || lines.length !== 3 || lines[0] !== frame.fence || lines[2] !== frame.fence) return unreadable();
  let block: { fields?: { name: string; content: string }[] };
  try { block = JSON.parse(lines[1]!) as typeof block; } catch { return unreadable(); }
  if (JSON.stringify(block) !== lines[1] || !Array.isArray(block.fields)) return unreadable();
  const shown = shownAnswersOf(packet);
  const reversedContent = JSON.stringify([...shown].reverse());
  const reversedBlock = { ...block, fields: block.fields.map((field) => field.name === "answers" ? { ...field, content: reversedContent } : field) };
  const result: PromptPacket = Object.freeze({ messages: Object.freeze([system,
    Object.freeze({ role: "user" as const, content: [frame.fence, JSON.stringify(reversedBlock), frame.fence].join("\n") })]) });
  let check;
  try { check = readPromptFrame(result); } catch { return unreadable(); }
  if (JSON.stringify(check.fields) !== JSON.stringify(reversedBlock.fields)) return unreadable();
  return result;
}

const words = (value: unknown): number => typeof value === "string" && value.trim() !== "" ? value.trim().split(/\s+/u).length : 0;
/** An answer's length as the judge read it: its answer, its case and its supporting points. */
function lengthOf(answer: JudgeAnswerShown): number {
  const points = Array.isArray(answer.supporting_points) ? answer.supporting_points : [];
  return words(answer.answer) + words(answer.case)
    + points.reduce<number>((sum, point) => sum + words((point as { text?: unknown } | null)?.text), 0);
}

export type PracticeJudgeOrderPlanned = Readonly<{
  debate: string; seat: number; maker: string; model: string; providerRef: string;
  packet: PromptPacket; shownLetters: readonly EngineAnswerLetter[]; longestLetters: readonly string[]; chanceLongest: number;
  question: string; questionLanguage: QuestionLanguage | null; tokenCeiling: number | null; guidedWords: number | null;
  original: Readonly<{ letter: string; conditional: boolean }>;
}>;
export type PracticeJudgeOrderSkipped = Readonly<{ debate: string; seat: number | null; code: string }>;
export type PracticeJudgeOrderReading =
  | Readonly<{ status: "ANSWERED"; letter: string; conditional: boolean }>
  | Readonly<{ status: "UNREADABLE" | "FAILED" | "BUSY" | "NOT_SENT"; code: string }>;
export type PracticeJudgeOrderAsk = Readonly<{
  debate: string; seat: number; maker: string; model: string; shown: number;
  /** The letters tied for the longest answer shown, and the share of answers they are (what chance alone would hit). */
  longestLetters: readonly string[]; chanceLongest: number;
  original: Readonly<{ letter: string; conditional: boolean }>;
  reversed: PracticeJudgeOrderReading;
  /** `--control` only: the same prompt again, unchanged. */
  control: PracticeJudgeOrderReading | null;
}>;

/** The seat a judge call-site key names (its repair and runner-up keys included), 1..B1's seat limit; null otherwise. */
const seatOf = (callSiteKey: string): number | null => {
  const base = structureRepairOriginalKey(callSiteKey).replace(/:seat:(main|runnerUp)$/u, "");
  for (let seat = 1; seat <= COMPARING_JUDGE_LIMITS.maxSeats; seat += 1) if (base === comparingJudgeCallSiteKey(seat)) return seat;
  return null;
};

/** What one saved debate asks again: one entry per recorded vote with a letter, from that seat's ORIGINAL prompt. */
export function practiceJudgeOrderPlan(debate: string, transcript: PracticeTranscript): Readonly<{
  planned: readonly PracticeJudgeOrderPlanned[]; skipped: readonly PracticeJudgeOrderSkipped[];
}> {
  const votes = transcript.structure.judgeVotes ?? [];
  if (votes.length === 0) {
    return Object.freeze({ planned: Object.freeze([]), skipped: Object.freeze([Object.freeze({ debate, seat: null, code: "PRACTICE_JUDGE_ORDER_NO_VOTES" })]) });
  }
  const planned: PracticeJudgeOrderPlanned[] = [];
  const skipped: PracticeJudgeOrderSkipped[] = [];
  for (const vote of votes) {
    if (vote.letter === null || vote.conditional === null) { skipped.push(Object.freeze({ debate, seat: vote.seat, code: "PRACTICE_JUDGE_ORDER_NO_VOTE" })); continue; }
    const first = [...transcript.attempts].sort((a, b) => a.sequence - b.sequence).find((entry: TranscriptAttempt) =>
      seatOf(entry.callSiteKey) === vote.seat && entry.providerRef === vote.providerRef && entry.replyForm === "ORIGINAL"
      && Array.isArray(entry.prompt?.messages));
    if (first === undefined) { skipped.push(Object.freeze({ debate, seat: vote.seat, code: "PRACTICE_JUDGE_ORDER_NO_PROMPT" })); continue; }
    try {
      const packet = Object.freeze({ messages: first.prompt!.messages as PromptPacket["messages"] });
      reversedJudgePacket(packet);                               // refused here, before anything is sent
      const fields = readPromptFrame(packet).fields;
      const shown = shownAnswersOf(packet);
      // Letters are fixed per debate (A = the first answer of the plan, ruling R2b-B6.1), so the recorded letter names an
      // answer of this very prompt; a prompt that never showed it is not the one the vote answered.
      if (!shown.some((answer) => answer.letter === vote.letter)) throw new JudgeOrderSkip("PRACTICE_JUDGE_ORDER_NO_PROMPT");
      const lengths = shown.map(lengthOf);
      const most = Math.max(...lengths);
      const longestLetters = shown.filter((_answer, index) => lengths[index] === most).map((answer) => answer.letter);
      const language = fields.find((field) => field.name === QUESTION_LANGUAGE_FIELD)?.content;
      const named = language === undefined ? null : JSON.parse(language) as { code?: unknown; name?: unknown };
      const ceiling = (first.metadata as { token_ceiling?: unknown } | null)?.token_ceiling;
      planned.push(Object.freeze({
        debate, seat: vote.seat, maker: vote.maker, model: vote.modelId, providerRef: vote.providerRef, packet,
        shownLetters: Object.freeze(shown.map((answer) => answer.letter as EngineAnswerLetter)),
        longestLetters: Object.freeze(longestLetters), chanceLongest: longestLetters.length / shown.length,
        question: fields.find((field) => field.name === "question")?.content ?? "",
        questionLanguage: named !== null && typeof named.code === "string" && typeof named.name === "string"
          ? questionLanguageFromRun(named.code, named.name) : null,
        tokenCeiling: typeof ceiling === "number" && Number.isSafeInteger(ceiling) && ceiling > 0 ? ceiling : null,
        guidedWords: first.guidedWords,
        original: Object.freeze({ letter: vote.letter, conditional: vote.conditional })
      }));
    } catch (error) {
      skipped.push(Object.freeze({ debate, seat: vote.seat, code: error instanceof JudgeOrderSkip ? error.code : UNREADABLE }));
    }
  }
  return Object.freeze({ planned: Object.freeze(planned), skipped: Object.freeze(skipped) });
}

export type PracticeJudgeOrderMakerRow = Readonly<{
  maker: string; asked: number; answered: number; flips: number; flipRate: number | null;
  controlAnswered: number; controlFlips: number; controlFlipRate: number | null;
  /** Answered asks whose choice was among the longest answers shown: in the debate's order, and reversed. */
  longestOriginal: number; longestReversed: number; longestRate: number | null; chanceLongestRate: number | null;
  conditionalOriginal: number; conditionalReversed: number; conditionalRate: number | null;
}>;

/** Per maker of the judge, in the order makers first appear; an ask whose reversed reading did not come back counts in none. Pure. */
export function practiceJudgeOrderByMaker(asks: readonly PracticeJudgeOrderAsk[]): readonly PracticeJudgeOrderMakerRow[] {
  const makers = [...new Set(asks.map((ask) => ask.maker))];
  const rate = (part: number, whole: number): number | null => whole === 0 ? null : part / whole;
  return Object.freeze(makers.map((maker) => {
    const mine = asks.filter((ask) => ask.maker === maker);
    const answered = mine.flatMap((ask) => ask.reversed.status === "ANSWERED" ? [{ ask, reversed: ask.reversed }] : []);
    const controlled = mine.flatMap((ask) => ask.control?.status === "ANSWERED" ? [{ ask, control: ask.control }] : []);
    const flips = answered.filter(({ ask, reversed }) => reversed.letter !== ask.original.letter).length;
    const controlFlips = controlled.filter(({ ask, control }) => control.letter !== ask.original.letter).length;
    const longestOriginal = answered.filter(({ ask }) => ask.longestLetters.includes(ask.original.letter)).length;
    const longestReversed = answered.filter(({ ask, reversed }) => ask.longestLetters.includes(reversed.letter)).length;
    const conditionalOriginal = answered.filter(({ ask }) => ask.original.conditional).length;
    const conditionalReversed = answered.filter(({ reversed }) => reversed.conditional).length;
    return Object.freeze({
      maker, asked: mine.length, answered: answered.length, flips, flipRate: rate(flips, answered.length),
      controlAnswered: controlled.length, controlFlips, controlFlipRate: rate(controlFlips, controlled.length),
      longestOriginal, longestReversed, longestRate: rate(longestOriginal + longestReversed, 2 * answered.length),
      chanceLongestRate: answered.length === 0 ? null : answered.reduce((sum, { ask }) => sum + ask.chanceLongest, 0) / answered.length,
      conditionalOriginal, conditionalReversed, conditionalRate: rate(conditionalOriginal + conditionalReversed, 2 * answered.length)
    });
  }));
}

/** No ask: NOT_PROVEN; a stopped gate or an interrupt before every ask: NOT_PROVEN; a reading that did not come back: a warning. */
export function practiceJudgeOrderVerdict(input: Readonly<{ planned: number; asks: readonly PracticeJudgeOrderAsk[];
  skipped: readonly PracticeJudgeOrderSkipped[]; stopped: string | null }>): Readonly<{ verdict: PracticeVerdict; exitCode: number; reasons: readonly string[] }> {
  const verdictOf = (verdict: PracticeVerdict, reasons: readonly string[]) =>
    Object.freeze({ verdict, exitCode: PRACTICE_EXIT_CODES[verdict], reasons: Object.freeze([...reasons]) });
  if (input.planned === 0) return verdictOf("NOT_PROVEN", [...new Set(input.skipped.map((entry) => entry.code))]);
  if (input.stopped !== null || input.asks.length < input.planned) return verdictOf("NOT_PROVEN", [input.stopped ?? "PRACTICE_INTERRUPTED"]);
  const unanswered = practiceJudgeOrderByMaker(input.asks).filter((row) => row.answered < row.asked)
    .map((row) => `PRACTICE_JUDGE_ORDER_UNANSWERED:${row.maker}=${String(row.asked - row.answered)}`);
  return unanswered.length === 0 ? verdictOf("PASS", []) : verdictOf("PASS_WITH_WARNINGS", unanswered);
}

const percent = (value: number | null): string => value === null ? "-" : `${(value * 100).toFixed(0)}%`;
/** report.md's lines (counts and codes only). Pure. */
export function practiceJudgeOrderLines(report: PracticeReport): readonly string[] {
  const rows = (Array.isArray(report.byMaker) ? report.byMaker : []) as readonly PracticeJudgeOrderMakerRow[];
  const lines = ["The judges' order (D3: each recorded vote asked again with the answers in reverse order; counts only):", "",
    "| judge's maker | asked | answered | flips | flip rate | flip rate, same order again | longest chosen | chance | conditional |",
    "|---|---|---|---|---|---|---|---|---|"];
  for (const row of rows) {
    lines.push(`| ${row.maker} | ${String(row.asked)} | ${String(row.answered)} | ${String(row.flips)} | ${percent(row.flipRate)} | `
      + `${percent(row.controlFlipRate)} | ${percent(row.longestRate)} | ${percent(row.chanceLongestRate)} | ${percent(row.conditionalRate)} |`);
  }
  const skipped = (Array.isArray(report.skipped) ? report.skipped : []) as readonly PracticeJudgeOrderSkipped[];
  if (skipped.length > 0) lines.push("", "Not asked (codes only):", "", ...skipped.map((entry) =>
    `- ${entry.debate}${entry.seat === null ? "" : ` seat ${String(entry.seat)}`}: ${entry.code}`));
  lines.push("");
  return Object.freeze(lines);
}

/** The scripted gates for `judge-order --dry`: every judge picks the FIRST answer it is shown (a pure order-follower). */
export function practiceJudgeOrderDryPorts(): Readonly<{ deepinfra: PreviewBudgetPort; anthropic: PreviewBudgetPort }> {
  let served = 0;
  const port = (provider: "deepinfra" | "anthropic"): PreviewBudgetPort => Object.freeze({
    async execute(request: Parameters<PreviewBudgetPort["execute"]>[0]) {
      served += 1;
      const { model, packet } = openingsDryPacket(request.requestBody);
      const best = shownAnswersOf(packet)[0]!.letter;
      const content = JSON.stringify({ best, conditional: false, same_as: [], reasons: "Scripted: the first answer shown.", question_kind: "general" });
      return { status: 200, body: openingsDryVendorReply(provider, model, content, served) };
    }
  });
  return Object.freeze({ deepinfra: port("deepinfra"), anthropic: port("anthropic") });
}

export type PracticeJudgeOrderRunInput = Readonly<{
  config: PreviewProviderTestConfig;
  targets: readonly ProviderDiscoveryTarget[];
  ports: PreviewBudgetPorts;
  observer: PracticeGateObserver;
  /** The judge organ's bound (`practiceRunnerPolicy(config).bounds.JUDGE`); the saved call's own token ceiling wins. */
  bound: CallBound;
  transcripts: string;
  control: boolean;
  folder: string;
  dry: boolean;
  startedAt: Date;
  sleep?: (milliseconds: number) => Promise<void>;
  progress?: (line: string) => void;
  shouldStop?: () => boolean;
}>;

/** The mode: every transcript.json under `transcripts` (sorted), judge-order.jsonl as it goes, then the report. */
export async function runPracticeJudgeOrderMode(input: PracticeJudgeOrderRunInput): Promise<PracticeReport> {
  let entries: readonly string[];
  try { entries = readdirSync(input.transcripts, { recursive: true, encoding: "utf8" }); } catch {
    throw new PracticeRefusal("PRACTICE_JUDGE_ORDER_NO_INPUT", "the --transcripts folder cannot be read");
  }
  const files = entries.filter((entry) => entry.split(sep).at(-1) === PRACTICE_JUDGE_ORDER_FILES.transcript).sort();
  if (files.length === 0) throw new PracticeRefusal("PRACTICE_JUDGE_ORDER_NO_INPUT", `no ${PRACTICE_JUDGE_ORDER_FILES.transcript} under --transcripts`);
  const planned: PracticeJudgeOrderPlanned[] = [];
  const skipped: PracticeJudgeOrderSkipped[] = [];
  for (const file of files) {
    const debate = dirname(file).split(sep).join("/");
    let transcript: PracticeTranscript;
    try { transcript = JSON.parse(readFileSync(join(input.transcripts, file), "utf8")) as PracticeTranscript; } catch {
      skipped.push(Object.freeze({ debate, seat: null, code: "PRACTICE_JUDGE_ORDER_NO_VOTES" }));
      continue;
    }
    const plan = practiceJudgeOrderPlan(debate, transcript);
    planned.push(...plan.planned);
    skipped.push(...plan.skipped);
  }
  let log: PracticeJsonlWriter;
  try { log = PracticeJsonlWriter.create(input.folder, PRACTICE_JUDGE_ORDER_FILES.log, "PRACTICE_OUT_ALREADY_HOLDS_JUDGE_ORDER"); } catch (error) {
    if (error instanceof Error && error.message === "PRACTICE_OUT_ALREADY_HOLDS_JUDGE_ORDER") {
      throw new PracticeRefusal("PRACTICE_OUT_ALREADY_HOLDS_JUDGE_ORDER", "use a new --out folder");
    }
    throw error;
  }
  const guardedFetch = createPreviewGuardedFetch(input.ports);
  const runId = randomUUID();
  const asks: PracticeJudgeOrderAsk[] = [];
  let stopped: string | null = null;
  try {
    log.append({ kind: "start", schema: PRACTICE_JUDGE_ORDER_SCHEMA, dry: input.dry, control: input.control,
      startedAt: input.startedAt.toISOString(), transcripts: files.length, planned: planned.length });
    for (const entry of planned) {
      stopped = GATE_NAMES.map((gate) => input.observer.stopped(gate)?.reason ?? null).find((reason) => reason !== null) ?? null;
      if (stopped !== null || input.shouldStop?.() === true) break;
      const target = input.targets.find((candidate) => candidate.model === entry.model);
      if (target === undefined) {
        skipped.push(Object.freeze({ debate: entry.debate, seat: entry.seat, code: "PRACTICE_JUDGE_ORDER_MODEL_NOT_IN_ROSTER" }));
        continue;
      }
      const context = Object.freeze({ shownLetters: entry.shownLetters, question: entry.question, questionLanguage: entry.questionLanguage });
      const bound: CallBound = Object.freeze({ ...input.bound, tokenCeiling: entry.tokenCeiling ?? input.bound.tokenCeiling });
      const ask = async (packet: PromptPacket): Promise<PracticeJudgeOrderReading> => {
        const job = practiceJobGateway({ target, config: input.config, guardedFetch, ...(input.sleep === undefined ? {} : { sleep: input.sleep }) });
        const reading = rememberingAcceptedReply((content, reply) => classifyComparingJudgeReply(content, reply, context));
        try {
          const response = await job.gateway.call({ runId, subjectItemId: randomUUID(), callSiteKey: comparingJudgeCallSiteKey(entry.seat),
            role: "JUDGE", lane: "served", modelRole: "JUDGE", bound, contractHash: engineContractHash(), providerRef: target.providerRef,
            packet, buildRepairPacket: (rejected) => appendFramedRejection(packet, schemaFailureLocator(rejected)),
            classifyContent: reading.classifyContent, ...(entry.guidedWords === null ? {} : { guidedWords: entry.guidedWords }) });
          const parsed = parseStructuredArtifact(response.content, comparingJudgeReplySchema,
            reading.acceptedAs(response.content).reply, COMPARING_JUDGE_READING);
          if (parsed.kind !== "PARSED") return Object.freeze({ status: "UNREADABLE" as const, code: "COMPARING_JUDGE_REPLY_REFUSED" });
          return Object.freeze({ status: "ANSWERED" as const, letter: parsed.value.best, conditional: parsed.value.conditional });
        } catch (error) {
          const code = errorCodeOf(error);
          return Object.freeze({ status: job.endedBusy() ? "BUSY" as const : code === "PROVIDER_CONTENT_UNACCEPTED" ? "UNREADABLE" as const
            : "FAILED" as const, code });
        }
      };
      const reversed = await ask(reversedJudgePacket(entry.packet));
      const control = input.control ? await ask(entry.packet) : null;
      const record: PracticeJudgeOrderAsk = Object.freeze({ debate: entry.debate, seat: entry.seat, maker: entry.maker, model: entry.model,
        shown: entry.shownLetters.length, longestLetters: entry.longestLetters, chanceLongest: entry.chanceLongest,
        original: entry.original, reversed, control });
      asks.push(record);
      log.append({ kind: "ask", ask: record });
      input.progress?.(`${entry.debate} seat ${String(entry.seat)} (${entry.maker}): ${entry.original.letter} → `
        + `${reversed.status === "ANSWERED" ? reversed.letter : reversed.status}`);
    }
    const finishedAt = new Date();
    log.append({ kind: "end", finishedAt: finishedAt.toISOString() });
    const notInRoster = skipped.filter((entry) => entry.code === "PRACTICE_JUDGE_ORDER_MODEL_NOT_IN_ROSTER").length;
    return Object.freeze({
      schema: "preview-practice-report-v1",                     // PRACTICE_REPORT_SCHEMA, written out (as practice-language.ts does)
      mode: "judge-order", dry: input.dry, control: input.control,
      ...practiceJudgeOrderVerdict({ planned: planned.length - notInRoster, asks, skipped, stopped }),
      startedAt: input.startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
      transcripts: files.length, asks: Object.freeze(asks), skipped: Object.freeze(skipped),
      byMaker: practiceJudgeOrderByMaker(asks),
      gates: Object.fromEntries(GATE_NAMES.map((gate) => [gate, input.observer.summary(gate)]))
    });
  } finally {
    log.close();
  }
}
