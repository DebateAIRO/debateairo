// tests/unit/r2-practice-judge-order.test.ts
// Engine redesign R2b, Task B11b (owner ruling D3): the judges' order practice. Each recorded comparing-judge vote of a
// saved engine-2 debate is asked again with the answers in reverse order (letters kept, every other byte of the prompt
// kept); the report gives per maker the flip rate, the longest-answer rate beside chance, and the conditional rate.
// It is its own mode: never part of rescore (which asks no AI).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPARING_JUDGE_PROMPT_CONTRACT, comparingJudgeMaterialFields
} from "@debateai/judgement";
import { LENGTH_GUIDANCE_START, type EngineDebateMaterial } from "@debateai/kernel";
import { buildFramedPrompt, readPromptFrame, type PromptPacket } from "@debateai/providers";
import {
  practiceJudgeOrderByMaker, practiceJudgeOrderDryPorts, practiceJudgeOrderPlan, reversedJudgePacket,
  runPracticeJudgeOrderMode, type PracticeJudgeOrderAsk
} from "../../tools/preview-practice/practice-judge-order.js";
import { buildPracticeTranscript, type TranscriptJudgeVote } from "../../tools/preview-practice/practice-transcript.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { openingsDryConfig, openingsDryTargets } from "../../tools/preview-practice/practice-openings-dry.js";
import { practiceRunnerPolicy } from "../../tools/preview-practice/practice-formats.js";
import { runPractice } from "../../tools/preview-practice/practice.js";

const LENGTH = Object.freeze({ words: LENGTH_GUIDANCE_START.standardWords.comparing_judge, languageCode: null,
  charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord });
/** Three answers: B is the longest (its case and points have the most words). Built through A11's type, as B1's tests do. */
const MATERIAL = Object.freeze({
  question: "Should a city build nuclear power?",
  answers: [
    { letter: "A", rootNodeId: "r-a", words: "Yes.", caseText: "It is clean.", supports: [], objections: [], assumptions: [] },
    { letter: "B", rootNodeId: "r-b", words: "Yes, where the grid needs steady power.",
      caseText: "Steady output with low emissions, if the build cost is financed over decades.",
      supports: [{ text: "Plants run at high capacity for sixty years.", disputed: false, notYetChecked: false, restsOn: null,
        fromRivalReply: null, investigation: null }], objections: [], assumptions: [] },
    { letter: "C", rootNodeId: "r-c", words: "No.", caseText: "Too slow to build.", supports: [], objections: [], assumptions: [] }
  ],
  disputed: []
}) as unknown as EngineDebateMaterial;
const packetFor = (seat: number): PromptPacket => buildFramedPrompt({ contract: COMPARING_JUDGE_PROMPT_CONTRACT,
  material: comparingJudgeMaterialFields({ material: MATERIAL, seat, length: LENGTH }) }).packet;
const lettersOf = (packet: PromptPacket): string[] =>
  (JSON.parse(readPromptFrame(packet).fields.find((field) => field.name === "answers")!.content) as { letter: string }[])
    .map((answer) => answer.letter);

describe("R2 B11b: the reversed prompt (only the answers' order changes)", () => {
  it("reverses the answers the judge saw, keeps each letter and every other byte", () => {
    const original = packetFor(2);                               // seat 2 sees B, C, A (comparingJudgeOrder)
    const reversed = reversedJudgePacket(original);
    expect(lettersOf(original)).toEqual(["B", "C", "A"]);
    expect(lettersOf(reversed)).toEqual(["A", "C", "B"]);
    expect(reversed.messages[0]).toEqual(original.messages[0]);  // the instruction, the frame, the fence and canary
    const others = (packet: PromptPacket) => readPromptFrame(packet).fields.filter((field) => field.name !== "answers");
    expect(others(reversed)).toEqual(others(original));
  });
  it("refuses what is not a comparing judge's packet with two or more answers", () => {
    const single = buildFramedPrompt({ contract: COMPARING_JUDGE_PROMPT_CONTRACT, material: comparingJudgeMaterialFields({
      material: { ...MATERIAL, answers: MATERIAL.answers.slice(0, 1) } as EngineDebateMaterial, seat: 1, length: LENGTH }) }).packet;
    expect(() => reversedJudgePacket(single)).toThrow(/PRACTICE_JUDGE_ORDER_PROMPT_UNREADABLE/u);
    expect(() => reversedJudgePacket({ messages: [{ role: "user", content: "hello" }] })).toThrow(/PRACTICE_JUDGE_ORDER_PROMPT_UNREADABLE/u);
  });
});

const vote = (seat: number, letter: string | null, extra: Partial<TranscriptJudgeVote> = {}): TranscriptJudgeVote => Object.freeze({
  seat, maker: ["deepseek", "xiaomi", "anthropic"][seat - 1]!, providerRef: `preview:m${String(seat)}`,
  modelId: ["deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "claude-haiku-5-5"][seat - 1]!,
  letter, conditional: letter === null ? null : false, counted: letter !== null,
  notCountedReason: letter === null ? "JUDGE_FAILED" : null, questionKind: letter === null ? null : "general", sameAs: [], ...extra });
const attempt = (seat: number, replyForm: string, packet: PromptPacket | null, sequence: number) => ({
  sequence, callSiteKey: `VERDICT:judge:${String(seat)}`, providerRef: `preview:m${String(seat)}`, replyForm,
  metadata: { token_ceiling: 6000 }, guidedWords: 80, prompt: packet === null ? null : { fingerprint: "f", messages: packet.messages, text: null }
});
function transcriptOf(votes: readonly TranscriptJudgeVote[], attempts: readonly unknown[]) {
  return buildPracticeTranscript({ run: { runId: "run-1" } as never, attempts: attempts as never, answer: null, inspection: null,
    story: null, unavailable: [], judgeVotes: votes });
}

describe("R2 B11b: what is asked again", () => {
  it("one ask per recorded vote with a letter, from that seat's original prompt; every other seat says why not", () => {
    const transcript = transcriptOf([vote(1, "B"), vote(2, "A"), vote(3, null)],
      [attempt(1, "ORIGINAL", packetFor(1), 1), attempt(1, "PATCH", packetFor(1), 2)]);
    const plan = practiceJudgeOrderPlan("q1", transcript);
    expect(plan.planned.map((entry) => [entry.seat, entry.original.letter])).toEqual([[1, "B"]]);
    expect(plan.planned[0]!.shownLetters).toEqual(["A", "B", "C"]);
    expect(plan.skipped).toEqual([
      { debate: "q1", seat: 2, code: "PRACTICE_JUDGE_ORDER_NO_PROMPT" },
      { debate: "q1", seat: 3, code: "PRACTICE_JUDGE_ORDER_NO_VOTE" }
    ]);
  });
  it("an engine-1 transcript (no votes) is listed, never skipped silently; its structure keeps today's keys", () => {
    const today = buildPracticeTranscript({ run: { runId: "run-1" } as never, attempts: [], answer: null, inspection: null,
      story: null, unavailable: [] });
    expect(Object.hasOwn(today.structure, "judgeVotes")).toBe(false);
    expect(practiceJudgeOrderPlan("q0", today)).toEqual({ planned: [], skipped: [{ debate: "q0", seat: null, code: "PRACTICE_JUDGE_ORDER_NO_VOTES" }] });
  });
});

describe("R2 B11b: the rates per maker", () => {
  const ask = (maker: string, original: string, reversed: string | null, extra: Partial<PracticeJudgeOrderAsk> = {}): PracticeJudgeOrderAsk =>
    Object.freeze({ debate: "q", seat: 1, maker, model: `${maker}-model`, shown: 3, longestLetters: ["B"], chanceLongest: 1 / 3,
      original: { letter: original, conditional: false },
      reversed: reversed === null ? { status: "FAILED" as const, code: "PROVIDER_TRANSPORT_EXHAUSTED" }
        : { status: "ANSWERED" as const, letter: reversed, conditional: reversed === "B" },
      control: null, ...extra });
  it("flips, the longest answer in both orders beside chance, conditional in both orders; a failed ask counts in none", () => {
    const rows = practiceJudgeOrderByMaker([ask("deepseek", "B", "A"), ask("deepseek", "B", "B"), ask("xiaomi", "A", null)]);
    expect(rows).toEqual([
      { maker: "deepseek", asked: 2, answered: 2, flips: 1, flipRate: 0.5, controlAnswered: 0, controlFlips: 0, controlFlipRate: null,
        longestOriginal: 2, longestReversed: 1, longestRate: 0.75, chanceLongestRate: 1 / 3,
        conditionalOriginal: 0, conditionalReversed: 1, conditionalRate: 0.25 },
      { maker: "xiaomi", asked: 1, answered: 0, flips: 0, flipRate: null, controlAnswered: 0, controlFlips: 0, controlFlipRate: null,
        longestOriginal: 0, longestReversed: 0, longestRate: null, chanceLongestRate: null,
        conditionalOriginal: 0, conditionalReversed: 0, conditionalRate: null }
    ]);
  });
  it("--control: the same prompt again gives the noise beside the flip rate", () => {
    const rows = practiceJudgeOrderByMaker([ask("deepseek", "B", "A", { control: { status: "ANSWERED", letter: "C", conditional: false } })]);
    expect(rows[0]).toMatchObject({ flips: 1, controlAnswered: 1, controlFlips: 1, controlFlipRate: 1 });
  });
});

describe("R2 B11b: the mode, dry (scripted gates, nothing spent)", () => {
  const folders: string[] = [];
  afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
  const folder = () => { const made = mkdtempSync(join(tmpdir(), "r2-judge-order-")); folders.push(made); return made; };
  /** One saved debate: seat 1 saw A, B, C and voted A (the first shown). */
  const savedDebate = () => {
    const transcripts = folder();
    mkdirSync(join(transcripts, "q1"));
    writeFileSync(join(transcripts, "q1", "transcript.json"), JSON.stringify(transcriptOf([vote(1, "A")], [attempt(1, "ORIGINAL", packetFor(1), 1)])));
    return transcripts;
  };
  it("asks each recorded judge again reversed; the scripted judge always picks the first answer shown, so it flips", async () => {
    // Reversed, seat 1 sees C, B, A and the script picks C.
    const transcripts = savedDebate();
    const config = openingsDryConfig();
    const observer = new PracticeGateObserver();
    const dry = practiceJudgeOrderDryPorts();
    const out = folder();
    const report = await runPracticeJudgeOrderMode({ config, targets: openingsDryTargets(config),
      ports: { deepinfra: observer.wrap("deepinfra", dry.deepinfra), anthropic: observer.wrap("anthropic", dry.anthropic) },
      observer, bound: practiceRunnerPolicy(config).bounds.JUDGE, transcripts, control: false, folder: out, dry: true,
      startedAt: new Date(0), sleep: async () => undefined });
    expect(report).toMatchObject({ mode: "judge-order", verdict: "PASS", exitCode: 0 });
    expect((report.byMaker as { maker: string; flips: number; flipRate: number }[])[0]).toMatchObject({ maker: "deepseek", flips: 1, flipRate: 1 });
    const log = readFileSync(join(out, "judge-order.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { kind: string });
    expect(log.map((line) => line.kind)).toEqual(["start", "ask", "end"]);
    await expect(runPracticeJudgeOrderMode({ config, targets: openingsDryTargets(config),
      ports: { deepinfra: dry.deepinfra, anthropic: dry.anthropic }, observer, bound: practiceRunnerPolicy(config).bounds.JUDGE,
      transcripts, control: false, folder: out, dry: true, startedAt: new Date(0) })).rejects.toMatchObject({ code: "PRACTICE_OUT_ALREADY_HOLDS_JUDGE_ORDER" });
  });
  it("no transcript under --transcripts is a refusal; a folder of engine-1 transcripts is NOT_PROVEN", async () => {
    const config = openingsDryConfig();
    const observer = new PracticeGateObserver();
    const dry = practiceJudgeOrderDryPorts();
    const input = { config, targets: openingsDryTargets(config), ports: { deepinfra: dry.deepinfra, anthropic: dry.anthropic }, observer,
      bound: practiceRunnerPolicy(config).bounds.JUDGE, control: false, dry: true, startedAt: new Date(0) } as const;
    await expect(runPracticeJudgeOrderMode({ ...input, transcripts: folder(), folder: folder() }))
      .rejects.toMatchObject({ code: "PRACTICE_JUDGE_ORDER_NO_INPUT" });
    const transcripts = folder();
    writeFileSync(join(transcripts, "transcript.json"), JSON.stringify(transcriptOf([], [])));
    expect(await runPracticeJudgeOrderMode({ ...input, transcripts, folder: folder() })).toMatchObject({ verdict: "NOT_PROVEN",
      reasons: ["PRACTICE_JUDGE_ORDER_NO_VOTES"] });
  });
  // Pre-flight PF-R2b6.18, PF-R2b6.19: the command itself, so `judge-order --dry` is never refused by the `--dry` check
  // that sits before every mode's own flag check.
  it("the command: judge-order --dry runs end to end; --control outside judge-order and a flag judge-order does not read are refused", async () => {
    const quiet = { log: () => undefined, sleep: async () => undefined };
    const transcripts = savedDebate();
    const out = join(folder(), "out");
    const ran = await runPractice(["judge-order", "--dry", "--transcripts", transcripts, "--out", out], {}, quiet);
    expect(ran.report).toMatchObject({ mode: "judge-order", verdict: "PASS" });
    expect(existsSync(join(out, "judge-order.jsonl"))).toBe(true);
    for (const argv of [["debate", "--control"], ["judge-order", "--dry", "--transcripts", transcripts, "--models", "zai-org/GLM-5.3-Flash"]]) {
      const refused = await runPractice([...argv, "--out", join(folder(), "out")], {}, quiet);
      expect(refused.report.reasons[0]).toMatch(/^HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID/u);
    }
  });

  // Controller (B11b dispatch): --dry makes no network call and spends nothing. No socket is opened and the global fetch
  // is never called; every call the scripted judge answers is counted by the dry gates' own watch.
  it("judge-order --dry opens no socket and calls no fetch; only the scripted gates answer", async () => {
    const connect = vi.spyOn(Socket.prototype, "connect");
    const fetched = vi.spyOn(globalThis, "fetch");
    try {
      const transcripts = savedDebate();
      const ran = await runPractice(["judge-order", "--dry", "--control", "--transcripts", transcripts, "--out", join(folder(), "out")], {},
        { log: () => undefined, sleep: async () => undefined });
      expect(ran.report).toMatchObject({ mode: "judge-order", verdict: "PASS", control: true });
      expect((ran.report.gates as Record<string, { calls: number }>).deepinfra!.calls).toBe(2);   // reversed, then the control
      expect(connect).not.toHaveBeenCalled();
      expect(fetched).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
      fetched.mockRestore();
    }
  });
});

describe("R2 B11b: never part of rescore", () => {
  it("rescore never reads this mode, and this mode is wired as its own", () => {
    const rescore = readFileSync(new URL("../../tools/preview-practice/practice-rescore.ts", import.meta.url), "utf8");
    expect(rescore).not.toMatch(/practice-judge-order|judge-order|reversedJudgePacket/u);
    const order = readFileSync(new URL("../../tools/preview-practice/practice-judge-order.ts", import.meta.url), "utf8");
    expect(order).not.toMatch(/practice-rescore/u);
    const command = readFileSync(new URL("../../tools/preview-practice/practice.ts", import.meta.url), "utf8");
    expect(command).toContain('if (args.mode === "judge-order") {');
    expect(command).toContain("const JUDGE_ORDER_FLAGS: ReadonlySet<string> = new Set([");
  });
});
