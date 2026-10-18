// The debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md §3), end to end over the preview
// harness (tests/support/preview-debate-harness.ts): the sizes P2a would freeze on a receipt (`shapeForTest`), scripted
// map replies that depend only on what was asked (`scriptedShapeAnswers`), and one shaped debate admitted, argued and
// completed (`runShapeDebate`, pre-flight PF-B53: P2L Task 17 calls it too). Plan Task 15 Step 1, written in Task 13.
import { createHash } from "node:crypto";
import type { DebateShapeSettings } from "@debateai/contract";
import { MAP_ENGINE_CONTRACT_IDS, mapContractNameOf, mapPromptContractHash } from "@debateai/map";
import { readPromptFrame, type FramedMaterialField, type PromptPacket } from "@debateai/providers";
import {
  debateShapePolicyStartValues, engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveDebateShape,
  resolveLengthGuidance, type DebateShapeCeilingInput, type DebateShapePlanKey, type LengthGuidance
} from "@debateai/register";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { engineMapScriptedContent, type EngineMapScriptOptions } from "./engine-map-script.js";
import { readFramedMaterial, wirePacket } from "./framed-packet.js";
import {
  OWNER_CALL_CONCURRENCY, PANEL_REFS, RUN_RESILIENCE, type AdmittedRun, type PreviewGates, type PreviewRunnerMoney,
  type previewDebateHarness
} from "./preview-debate-harness.js";
import { stubChatBody, type GateOverride, type GateRecord, type GateRequest } from "./preview-gate-stubs.js";
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

/**
 * P2L Task 17 (pre-flight PF-L52): the map's prose in the language the request's `question_language` field names — a
 * locked Romanian map step refuses English prose (TEXT_NOT_IN_QUESTION_LANGUAGE), so the stand-in writes Romanian when
 * the lock's code is `ro`, today's English otherwise. Every literal the script compares against is read from here.
 */
const MAP_PROSE = Object.freeze({
  en: Object.freeze({
    why: "It could change the answer for the people affected.",
    angles: Object.freeze({
      opp: ["The other side", "The strongest case against."], worry: ["The worry", "What the asker fears."],
      do: ["What to do", "What to do first."], cost: ["The cost", "Who pays."]
    }),
    against: (label: string, tag: string) => `A point against, from ${label} ${tag}.`,
    for: (label: string, tag: string) => `A point for, from ${label} ${tag}.`,
    shared: "A shared point about cost.",
    keep: "No, keep it as it is.",
    first: (label: string) => `Yes, ${label.toLowerCase()} first.`,
    missing: (tag: string) => `A missing point ${tag}.`
  }),
  ro: Object.freeze({
    why: "Ar putea schimba răspunsul pentru oamenii afectați.",
    angles: Object.freeze({
      opp: ["Cealaltă parte", "Cel mai puternic argument împotrivă."], worry: ["Îngrijorarea", "De ce se teme cel care întreabă."],
      do: ["Ce este de făcut", "Ce trebuie făcut mai întâi."], cost: ["Costul", "Cine plătește."]
    }),
    against: (label: string, tag: string) => `Un argument împotrivă, din ${label} ${tag}.`,
    for: (label: string, tag: string) => `Un argument pentru, din ${label} ${tag}.`,
    shared: "Un punct comun despre cost, care contează pentru toți.",
    keep: "Nu, să rămână așa cum este.",
    first: (label: string) => `Da, mai întâi ${label.toLowerCase()}.`,
    missing: (tag: string) => `Un punct care lipsește din hartă ${tag}.`
  })
});
/** The request's locked language code (its `question_language` field), or null on a request without a lock. */
const lockedCodeOf = (chat: string): string | null => {
  const content = field(chat, "question_language");
  return content === "" ? null : (JSON.parse(content) as { code: string }).code;
};
const mapProseOf = (chat: string) => lockedCodeOf(chat)?.split("-")[0]?.toLowerCase() === "ro" ? MAP_PROSE.ro : MAP_PROSE.en;

/**
 * Engine redesign R3 (Task 17): the map numbers its items in an order seeded by the RUN id (packages/map/src/items.ts
 * `mapAssignItemIds`, seed `run.runId`), so the merge is shown the same points and answers in another order on every run,
 * and the engine script's merge (which groups and numbers in the order shown) would argue other answers with other points
 * each run. The harness hands the script the merge's points and candidate answers in text order instead, so the scripted
 * map, and every judge's material after it, depends on what was raised, never on the run's seed: a debate on a fixed
 * question argues the same map every run (ruling W4's fixed question, tests/integration/r2-engine-debate.test.ts).
 */
function inTextOrder(material: Readonly<{ contractId: string; fields: readonly FramedMaterialField[] }>): readonly FramedMaterialField[] {
  if (material.contractId !== MAP_ENGINE_CONTRACT_IDS.merge) return material.fields;
  // By text; two items of the same text keep the order shown (their ids say nothing the merge needs).
  const sorted = (content: string, text: "claim" | "answer") => JSON.stringify((JSON.parse(content) as Record<string, string>[])
    .sort((a, b) => (a[text]! < b[text]! ? -1 : a[text]! > b[text]! ? 1 : 0)));
  return material.fields.map((entry) => entry.name === "points" ? { ...entry, content: sorted(entry.content, "claim") }
    : entry.name === "candidate_answers" ? { ...entry, content: sorted(entry.content, "answer") } : entry);
}

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
  /** Engine redesign R3: how the scripted engine-2 map answers (failed checks, reserves). */
  engineMap?: EngineMapScriptOptions;
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
      const material = readFramedMaterial(wirePacket(chat));
      // Engine redesign R3: an engine-2 map contract (map.*.v2, map.check.v1) is answered by the engine script.
      const engineReply = engineMapScriptedContent(material.contractId, inTextOrder(material), options.engineMap ?? {});
      if (engineReply !== null) return fail.has("CHOOSE") && material.contractId === "map.choose.v2" ? { content: "not json" } : { content: engineReply };
      const contractId = material.contractId;
      // LG-C Task 14: today's map contract or its length variant, by name (Task 17's lengthed shaped run).
      const mapName = mapContractNameOf(contractId);
      const prose = mapProseOf(chat);
      const why = prose.why;
      if (mapName === "angles") {
        // P2L Task 17: the planner names the question's language first, as its answer form asks (the reader accepts it).
        const code = lockedCodeOf(chat);
        const angle = (angle_id: keyof typeof prose.angles, kind: string) =>
          ({ angle_id, kind, label: prose.angles[angle_id][0], focus: prose.angles[angle_id][1] });
        return fail.has("ANGLES") ? { content: "not json" } : { content: JSON.stringify({
          ...(code === null ? {} : { question_language: code.split("-")[0]!.toLowerCase() }),
          angles: [angle("opp", "OPPOSITE_CASE"), angle("worry", "ASKER_WORRY"), angle("do", "PRACTICAL"), angle("cost", "SPECIFIC")] }) };
      }
      if (mapName === "listAngle" || mapName === "listOpen" || mapName === "listSnowball") {
        const label = field(chat, "angle_label") || "open";
        const otherSide = prose.angles.opp[0];
        if (fail.has("LISTS_BUT_ONE") && label !== otherSide) return { content: "not json" };
        const tag = digestOf(label);
        return { content: JSON.stringify({ points: [
          { claim: prose.against(label, tag), why_it_matters: why, leans: "against_some_answer" },
          { claim: prose.for(label, tag), why_it_matters: why, leans: "for_some_answer" },
          { claim: prose.shared, why_it_matters: why, leans: "context" }],
          candidate_answers: [label === otherSide ? prose.keep : prose.first(label)] }) };
      }
      if (mapName === "merge") {
        if (options.stopAt === "MERGE") return { gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" };
        if (fail.has("MERGE")) return { content: "not json" };
        const points = JSON.parse(field(chat, "points")) as { item_id: string; claim: string }[];
        const answers = JSON.parse(field(chat, "candidate_answers")) as { item_id: string; answer: string }[];
        const group = <T,>(rows: T[], key: (row: T) => string) => [...new Set(rows.map(key))].map((text) => [text, rows.filter((row) => key(row) === text)] as const);
        return { content: JSON.stringify({
          key_points: group(points, (row) => row.claim).map(([claim, rows], index) => ({ key_point_id: `k${String(index + 1)}`, claim, member_item_ids: rows.map((row) => row.item_id) })),
          answers: group(answers, (row) => row.answer).map(([answer, rows], index) => ({ answer_id: `a${String(index + 1)}`, answer, member_item_ids: rows.map((row) => row.item_id) })) }) };
      }
      if (mapName === "gap") {
        return { content: JSON.stringify({ new_points: [{ claim: prose.missing(digestOf(field(chat, "key_points"))), why_it_matters: why, leans: "context" }], framing_challenges: [] }) };
      }
      if (mapName === "choose") {
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
  /** LG-C Task 17: the length row's numbers frozen on the receipt; absent, today's receipt. */
  length?: LengthGuidance;
  /** Engine redesign R3: admit with engine 2 (and the length row it needs), run with the engine seal. */
  engine?: true;
}>;
/** One captured framed packet: its system message and its fenced material fields (P2L Task 17). */
export type ShapePrompt = Readonly<{ system: string; fields: readonly FramedMaterialField[] }>;
export type ShapeDebateRun = Readonly<{
  debate: AdmittedRun; gates: PreviewGates; shape: DebateShapeCeilingInput;
  result: Readonly<{ kind: "COMPLETED"; answerId: string }>;
  calls: Awaited<ReturnType<ShapeDebateHarness["modelCalls"]>>;
  /** P2L Task 17 (PF-L52): every framed packet the gates saw, read with `readPromptFrame`; PROBE requests left out. */
  prompts: readonly ShapePrompt[];
}>;

/**
 * The Anthropic adapter joins consecutive user turns with a blank line (its API wants the roles to alternate), so a
 * Haiku request built as several fenced blocks — a repair after a refused reply — arrives as ONE user turn. Each block
 * opens and closes with the fence on its own line and holds one single-line JSON envelope, so the joins are exactly the
 * blank lines between a closing and an opening fence; they are undone here so the door's own reader reads the packet the
 * runner built. A DeepInfra body is the packet as built. The fence is never spelled here (the packet-read guard): a join
 * is a blank line whose neighbouring lines are the same line — one block's closing fence and the next block's opening
 * fence — and a single-line envelope never holds a blank line.
 */
function unjoinedBlocksOf(content: string): string[] {
  const blocks: string[] = [];
  for (const piece of content.split("\n\n")) {
    const previous = blocks.at(-1);
    const closing = previous?.slice(previous.lastIndexOf("\n") + 1);
    const opening = piece.split("\n", 1)[0];
    if (previous !== undefined && (closing === "" || closing !== opening)) blocks[blocks.length - 1] = `${previous}\n\n${piece}`;
    else blocks.push(piece);
  }
  return blocks;
}
function builtPacketOf(request: GateRecord): PromptPacket {
  const packet = wirePacket(stubChatBody(request.provider, request.body));
  if (request.provider !== "anthropic") return packet as PromptPacket;
  return { messages: packet.messages.flatMap((message) => message.role === "user"
    ? unjoinedBlocksOf(message.content).map((content) => ({ role: "user", content }))
    : [message]) } as PromptPacket;
}

/** The framed packets among the gates' requests, as `{ system, fields }` (a probe has no frame and is left out). */
export function framedPromptsOf(requests: readonly GateRecord[]): readonly ShapePrompt[] {
  return Object.freeze(requests.filter((request) => request.kind !== "PROBE").map((request) => {
    const packet = builtPacketOf(request);
    const system = packet.messages[0]?.content;
    return Object.freeze({ system: typeof system === "string" ? system : "", fields: readPromptFrame(packet).fields });
  }));
}

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
  // Engine redesign R3: engine 2 needs the length row; LG-C's own `length` option wins when given.
  const length = options.length ?? (options.engine === true
    ? resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: options.plan ?? "free", answerLength: settings.answerLength }) : undefined);
  const engine = options.engine === true
    ? engineSettingsOf(engineVersionPolicyStartValues(), { makers: PANEL_REFS.length, mapOpening: true }) : undefined;
  const debate = await harness.admittedRun(options.label ?? "shape", {
    panelRefs: PANEL_REFS, depth, shape, settings,
    ...(options.language === undefined ? {} : { language: options.language }),
    ...(options.question === undefined ? {} : { question: options.question }),
    ...(length === undefined ? {} : { length }),
    ...(engine === undefined ? {} : { engine })
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
    ...(options.money === undefined ? {} : { money: options.money }),
    ...(options.engine === true ? { engine: { engineContractHash: engineContractHash() } } : {})
  });
  const result = await harness.completedRun(composed, debate, gates);
  return { debate, gates, shape, result, calls: await harness.modelCalls(debate.runId), prompts: framedPromptsOf(gates.requests) };
}
