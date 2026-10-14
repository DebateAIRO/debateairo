// The debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md §3), end to end over the preview
// harness (tests/support/preview-debate-harness.ts): the sizes P2a would freeze on a receipt (`shapeForTest`), scripted
// map replies that depend only on what was asked (`scriptedShapeAnswers`), and one shaped debate admitted, argued and
// completed (`runShapeDebate`, pre-flight PF-B53: P2L Task 17 calls it too). Plan Task 15 Step 1, written in Task 13.
import { createHash } from "node:crypto";
import type { DebateShapeSettings } from "@debateai/contract";
import { MAP_CONTRACT_IDS, mapPromptContractHash } from "@debateai/map";
import { debateShapePolicyStartValues, resolveDebateShape, type DebateShapeCeilingInput, type DebateShapePlanKey } from "@debateai/register";
import { readFramedMaterial, wirePacket } from "./framed-packet.js";
import {
  OWNER_CALL_CONCURRENCY, PANEL_REFS, RUN_RESILIENCE, type AdmittedRun, type PreviewGates, type PreviewRunnerMoney,
  type previewDebateHarness
} from "./preview-debate-harness.js";
import type { GateOverride, GateRequest } from "./preview-gate-stubs.js";
import { scriptedAnswers } from "./scripted-answers.js";

/** P2a's own resolution, at the start values: the sizes a real admission would freeze on the receipt. */
export function shapeForTest(input: Readonly<{ plan: DebateShapePlanKey; makers: number; settings: DebateShapeSettings }>): DebateShapeCeilingInput {
  const shape = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: input.plan, makers: input.makers, settings: input.settings });
  if (shape === null) throw new Error("test: the shape needs two makers");
  return shape;
}

const field = (chat: string, name: string): string =>
  readFramedMaterial(wirePacket(chat)).fields.find((entry) => entry.name === name)?.content ?? "";
const digestOf = (text: string) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
const why = "It could change the answer for the people affected.";

export type ShapeScriptOptions = Readonly<{
  fail?: ReadonlySet<"ANGLES" | "MERGE" | "CHOOSE" | "LISTS_BUT_ONE" | "CHOOSE_ONE_ANSWER">;
  stopAt?: "MERGE"; stopCloseCallAfter?: number; reviews?: "agree" | "dispute"; panelSpread?: boolean;
  /**
   * Plan Task 15 (binding note 5, the TRAVEL route): with `stopCloseCallAfter`, the first `stopCloseCallSkip` nodes whose
   * panel reaches the close-call extension are graded in full; the stop applies from the next such node on.
   */
  stopCloseCallSkip?: number;
  /** How many of the merged answers the choose names (default 3; plan Task 15's SHARE case names all four). */
  chooseAnswers?: number;
}>;

/**
 * Map replies that depend only on what was asked (the material), never on arrival order — so a debate argued twice
 * from one admitted run gets the same map. Every other request goes to `scriptedAnswers` (the parallel-calls suite's).
 */
export function scriptedShapeAnswers(question: string, options: ShapeScriptOptions = {}) {
  const others = scriptedAnswers(question);
  const fail = options.fail ?? new Set();
  // Pre-flight PF-B32 (runner-level row): grading requests seen per node, keyed by the framed material (the same for
  // every member of one node's panel). With `stopCloseCallAfter: n`, the (n+1)-th and later grading request of a node
  // (the close-call extension's extra members) is refused as the run's money ceiling.
  const gradingSeen = new Map<string, number>();
  /** The nodes whose panel reached its extension, in the order they reached it (`stopCloseCallSkip`). */
  const extended: string[] = [];
  /** `panelSpread`: per node (its framed material), the model that grades it low. */
  const spreadLow = new Map<string, string>();
  return (request: GateRequest, chat: string): GateOverride | null => {
    if (request.kind === "MAP") {
      const contractId = readFramedMaterial(wirePacket(chat)).contractId;
      if (contractId === MAP_CONTRACT_IDS.angles) {
        return fail.has("ANGLES") ? { content: "not json" } : { content: JSON.stringify({ angles: [
          { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The strongest case against." },
          { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the asker fears." },
          { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do first." },
          { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays." }] }) };
      }
      if (contractId === MAP_CONTRACT_IDS.listAngle || contractId === MAP_CONTRACT_IDS.listOpen || contractId === MAP_CONTRACT_IDS.listSnowball) {
        const label = field(chat, "angle_label") || "open";
        if (fail.has("LISTS_BUT_ONE") && label !== "The other side") return { content: "not json" };
        const tag = digestOf(label);
        return { content: JSON.stringify({ points: [
          { claim: `A point against, from ${label} ${tag}.`, why_it_matters: why, leans: "against_some_answer" },
          { claim: `A point for, from ${label} ${tag}.`, why_it_matters: why, leans: "for_some_answer" },
          { claim: `A shared point about cost.`, why_it_matters: why, leans: "context" }],
          candidate_answers: [label === "The other side" ? "No, keep it as it is." : `Yes, ${label.toLowerCase()} first.`] }) };
      }
      if (contractId === MAP_CONTRACT_IDS.merge) {
        if (options.stopAt === "MERGE") return { gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" };
        if (fail.has("MERGE")) return { content: "not json" };
        const points = JSON.parse(field(chat, "points")) as { item_id: string; claim: string }[];
        const answers = JSON.parse(field(chat, "candidate_answers")) as { item_id: string; answer: string }[];
        const group = <T,>(rows: T[], key: (row: T) => string) => [...new Set(rows.map(key))].map((text) => [text, rows.filter((row) => key(row) === text)] as const);
        return { content: JSON.stringify({
          key_points: group(points, (row) => row.claim).map(([claim, rows], index) => ({ key_point_id: `k${String(index + 1)}`, claim, member_item_ids: rows.map((row) => row.item_id) })),
          answers: group(answers, (row) => row.answer).map(([answer, rows], index) => ({ answer_id: `a${String(index + 1)}`, answer, member_item_ids: rows.map((row) => row.item_id) })) }) };
      }
      if (contractId === MAP_CONTRACT_IDS.gap) {
        return { content: JSON.stringify({ new_points: [{ claim: `A missing point ${digestOf(field(chat, "key_points"))}.`, why_it_matters: why, leans: "context" }], framing_challenges: [] }) };
      }
      if (contractId === MAP_CONTRACT_IDS.choose) {
        if (fail.has("CHOOSE")) return { content: "not json" };
        const keyPoints = (JSON.parse(field(chat, "key_points")) as { key_point_id: string }[]).map((row) => row.key_point_id);
        const answers = JSON.parse(field(chat, "answers")) as { answer_id: string; answer: string }[];
        const named = (fail.has("CHOOSE_ONE_ANSWER") ? answers.slice(0, 1) : answers.slice(0, options.chooseAnswers ?? 3)).map((answer, index, all) => ({
          answer_id: answer.answer_id, statement: answer.answer,
          for: keyPoints.filter((_id, at) => at % all.length === index).slice(0, 2),
          // Pre-flight PF-B52: with one answer, `for` and `against` would name the same key points, which the choose
          // check refuses (MAP_KEY_POINT_REPEATED) — the case would fall back instead of reaching ANSWERS_FILLED.
          against: all.length > 1 ? keyPoints.filter((_id, at) => at % all.length === (index + 1) % all.length).slice(0, 2) : [],
          strongest_rival: all.length > 1 ? all[(index + 1) % all.length]!.answer_id : null }));
        return { content: JSON.stringify({ answers: named }) };
      }
      return null;
    }
    if (request.kind === "PANEL" && options.stopCloseCallAfter !== undefined) {
      const material = readFramedMaterial(wirePacket(chat));
      const node = digestOf(JSON.stringify(material.fields));
      const seen = (gradingSeen.get(node) ?? 0) + 1;
      gradingSeen.set(node, seen);
      if (seen > options.stopCloseCallAfter) {
        if (!extended.includes(node)) extended.push(node);
        if (extended.indexOf(node) >= (options.stopCloseCallSkip ?? 0)) return { gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" };
      }
    }
    const answer = others(request, chat);
    if (answer === null || !("content" in answer)) return answer;
    if (request.kind === "REVIEW" && options.reviews !== undefined) {
      const parsed = JSON.parse(answer.content) as { outcome: string };
      return { content: JSON.stringify({ ...parsed, outcome: options.reviews }) };
    }
    if (request.kind === "PANEL" && options.panelSpread === true) {
      // Plan Task 15: EVERY node with two graders is a close call — the first model to grade a node grades it low, every
      // other model high. (Keyed by model, not by maker name, as before: the old "Qwen grades low" rule left root 0
      // without a close call whenever the rotation made Qwen root 0's author or left it off root 0's panel, about one
      // run in six, so the root-0 cases depended on the random question.)
      const node = digestOf(JSON.stringify(readFramedMaterial(wirePacket(chat)).fields));
      if (!spreadLow.has(node)) spreadLow.set(node, request.model);
      const parsed = JSON.parse(answer.content) as { steelman: { fidelity: number } };
      return { content: JSON.stringify({ ...parsed, steelman: { ...parsed.steelman, fidelity: spreadLow.get(node) === request.model ? 0.05 : 0.95 } }) };
    }
    return answer;
  };
}

/** Pre-flight PF-B53: the harness a shaped debate runs on (this suite's, and P2L Task 17's). */
export type ShapeDebateHarness = ReturnType<typeof previewDebateHarness>;
export type ShapeDebateOptions = Readonly<{
  label?: string; plan?: "free" | "pro"; settings?: DebateShapeSettings; depth?: number;
  script?: ShapeScriptOptions; concurrency?: boolean;
  language?: Readonly<{ tag: string; name: string }>; question?: string;
  /** Plan Task 15: the adaptive stopping row (δ, ε); absent, the harness's δ = ε = 0 (nothing stops early). */
  stoppingPolicy?: Readonly<{ delta: number; epsilon: number }>;
  /** Plan Task 15 (hand-over cases): the preview's run resilience (the sit-out book), as main.ts composes it. */
  resilience?: boolean;
  /** Plan Task 15: asked before the script for every gate request; null lets the script answer. */
  before?: (request: GateRequest, chat: string) => GateOverride | null;
  /** Plan Task 15 (T12-R0): a hosted runner's money seam and prices. */
  money?: PreviewRunnerMoney;
}>;
export type ShapeDebateRun = Readonly<{
  debate: AdmittedRun; gates: PreviewGates; shape: DebateShapeCeilingInput;
  result: Readonly<{ kind: "COMPLETED"; answerId: string }>;
  calls: Awaited<ReturnType<ShapeDebateHarness["modelCalls"]>>;
}>;

/**
 * One shaped debate, end to end: admitted with the sizes P2a would freeze on its receipt (`shapeForTest`, the four-member
 * panel), argued against the scripted gates (`scriptedShapeAnswers`) by a runner booted with the shape settings (the
 * map hash of this code), to a completed answer. Defaults: label "shape", plan "free", the standard settings, depth 1,
 * the owner's concurrency row (`concurrency: false` is the one-call-at-a-time lane).
 */
export async function runShapeDebate(harness: ShapeDebateHarness, options: ShapeDebateOptions = {}): Promise<ShapeDebateRun> {
  const settings: DebateShapeSettings = options.settings ?? { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" };
  const depth = options.depth ?? 1;
  const shape = shapeForTest({ plan: options.plan ?? "free", makers: PANEL_REFS.length, settings });
  const debate = await harness.admittedRun(options.label ?? "shape", {
    panelRefs: PANEL_REFS, depth, shape, settings,
    ...(options.language === undefined ? {} : { language: options.language }),
    ...(options.question === undefined ? {} : { question: options.question })
  });
  const scripted = scriptedShapeAnswers(debate.question, options.script ?? {});
  const before = options.before;
  const gates = await harness.startGates({}, undefined, before === undefined ? scripted
    : (request, chat) => before(request, chat) ?? scripted(request, chat));
  const composed = await harness.previewRunner(gates, "resend", {
    ...((options.concurrency ?? true) ? { callConcurrency: OWNER_CALL_CONCURRENCY } : {}),
    debateShape: { mapContractHash: mapPromptContractHash() },
    ...(options.stoppingPolicy === undefined ? {} : { stoppingPolicy: options.stoppingPolicy }),
    ...(options.resilience === true ? { resilience: RUN_RESILIENCE } : {}),
    ...(options.money === undefined ? {} : { money: options.money })
  });
  const result = await harness.completedRun(composed, debate, gates);
  return { debate, gates, shape, result, calls: await harness.modelCalls(debate.runId) };
}
