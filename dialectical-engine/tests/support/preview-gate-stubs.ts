// The two preview spending gates as test doubles over real unix sockets, speaking the gate's own local protocol
// (POST /complete answers {status, body} or a 409 {error: CODE}; POST /remaining answers the read-only "what is left
// today"). Factored out of tests/integration/preview-busy-model-run.test.ts so the busy-model run and the preview
// practice tool's integration test (tests/integration/preview-practice-run.test.ts) drive the SAME doubles.
// Every request that reaches a gate is recorded with how the gate answered it. A probe takes the next step of its
// model's script; with `debate` scripts a scripted model refuses every other request unbilled and the DeepInfra gate
// halts at its ceiling of unbilled releases (the run-resilience scenarios, spec
// docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md T1/T2); every other request is answered by its
// contract (a valid reply), unless the scenario's `override` answers it first.
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { argumentLanguageDirective } from "@debateai/kernel";
import { STORY_CHECKER_CONTRACT_ID, STORYTELLER_CONTRACT_ID } from "@debateai/story";
import { readFramedMaterial, wirePacket } from "./framed-packet.js";
import { reviewArtifact, withRequestDerivedBearings } from "./reviewBearings.js";

export type GateProvider = "deepinfra" | "anthropic";
export type GateRequestKind = "PROBE" | "STORYTELLER" | "STORY_CHECKER" | "PANEL" | "REVIEW" | "JUDGE" | "EVALUATOR" | "COMPOSE";
/** A /complete request as the gate saw it (what a scenario's `override` is handed). */
export type GateRequest = Readonly<{ provider: GateProvider; model: string; kind: GateRequestKind | "UNKNOWN"; body: Readonly<Record<string, unknown>> }>;
/**
 * How the gate answered a /complete request: by its contract or a scenario's content (OK), a gate-proven unbilled
 * vendor 429 (UNBILLED, 409 PROVIDER_REFUSED_UNBILLED), the gate's OWN unbilled refusal (GATE_REFUSED, 409
 * CONCURRENCY_LIMIT_REACHED or PROVIDER_NOT_REACHED: never one of its unbilled releases), a halted gate (STOPPED, 409
 * PREVIEW_TEST_AUTHORITY_STOPPED), a
 * billed vendor error (BILLED_500 for a refused model; VENDOR_ERROR for a scenario's vendor status), or a request no
 * contract answers (UNEXPECTED, a billed vendor 500 too).
 */
export type GateAnswer = "OK" | "UNBILLED" | "GATE_REFUSED" | "STOPPED" | "BILLED_500" | "VENDOR_ERROR" | "UNEXPECTED";
/** A recorded /complete request: the request and how it was answered, in arrival order. */
export type GateRecord = GateRequest & Readonly<{ answer: GateAnswer }>;
/** One read of a gate's `POST /remaining` (contract A §5), with the state it was answered. */
export type GateRemainingRead = Readonly<{ provider: GateProvider; state: "active" | "halted" }>;
/**
 * The run-resilience scripts (spec 2026-10-12 "Tests", T1/T2 setup).
 *  - `unbilled`: models that passed their claim probe and then refuse every other request: a gate-proven unbilled
 *    vendor 429 (409 PROVIDER_REFUSED_UNBILLED), which the app maps to PreviewUnbilledRefusal
 *    (packages/providers/src/preview-test.ts previewAuthorityRefusal) and withPreviewProviderCallPolicy sends once more
 *    after its 60-second wait.
 *  - `deepInfraHaltAt`: the DeepInfra gate's day ceiling of unbilled releases (the live gate's
 *    `unbilled_release_ceiling`): once it has given this many PROVIDER_REFUSED_UNBILLED answers it HALTS, so every later
 *    DeepInfra /complete is refused 409 PREVIEW_TEST_AUTHORITY_STOPPED before anything is reserved, and its /remaining
 *    answers state "halted" (the window stays open). Absent, it never halts. The Anthropic gate never halts.
 */
export type GateDebateScripts = Readonly<{ unbilled: readonly string[]; deepInfraHaltAt?: number }>;
/**
 * The DeepInfra gate's halt: its count of unbilled releases, the index (in `requests`) of the request whose release
 * reached the ceiling, and the index of the first request it answered STOPPED.
 */
export type GateHalt = { unbilledReleases: number; haltedAt: number | null; firstStoppedAt: number | null };
/** What a scenario may answer instead of the contract's valid reply. */
export type GateOverride = Readonly<{ content: string }> | Readonly<{ unbilled: true }> | Readonly<{ vendorStatus: number }>
  /** The gate's own unbilled refusal (review amendment R-d, 2026-10-12): its slots full, or the vendor not reached. */
  | Readonly<{ gateRefuses: "CONCURRENCY_LIMIT_REACHED" | "PROVIDER_NOT_REACHED" }>;

/* ------------------------------------------------------------------ the doubles' answers */

export const stubJudgement = (statement: string): string => JSON.stringify({
  statement, way_of_knowing: "REASONING", locator: null, restatement_text: statement, restatement_status: "PASS",
  value_laden: false, claim_type: "unknown",
  steelman: { summary: statement, fidelity: 0.72 },
  critic: { summary: "Plausible counter.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.72, relevance: 0.72 }, context: { fit: 0.72, ambiguityFlags: [] },
  fallacy: { severity: 0.28, fatalFlags: [] }
});
/** A panel member's assessment at fidelity 0 (tau 0): it never displaces an author's voice (tests/integration/database.test.ts). */
export const STUB_PANEL_ASSESSMENT = JSON.stringify({
  steelman: { summary: "Panel member assessment.", fidelity: 0 },
  critic: { summary: "Panel member counter.", counterargumentStrength: 1, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0, relevance: 0 }, context: { fit: 0, ambiguityFlags: [] }, fallacy: { severity: 1, fatalFlags: [] }
});
export const STUB_COMPOSITION = JSON.stringify({ segments: [
  { segment_id: "segment:verdict", text: "Congestion pricing on central roads is worth trying.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
  { segment_id: "segment:research", text: "Check an independent source.", node_refs: [], served_number_refs: [] }
] });
export const STUB_EVALUATOR_SATISFIED = JSON.stringify({ satisfied: true, objection: null, criteria: {
  fairness_to_losers: true, statement_label_agreement: true, no_overstatement: true, restatement: true, citation_tracing: true
} });
export const STUB_STORY_CHECKER_SATISFIED = JSON.stringify({ satisfied: true, objection: null, criteria: {
  faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
} });

/** A story with one path per position the storyteller was handed (its `positions` material, refs P1..Pn). */
export function stubStoryFor(chat: string, defaultShape: string): string {
  const fields = readFramedMaterial(wirePacket(chat)).fields;
  const positions = JSON.parse(fields.find((field) => field.name === "positions")?.content ?? "[]") as { id: string }[];
  const refs = positions.length === 0 ? ["P1"] : positions.map((position) => position.id);
  const paragraph = (text: string) => ({ text, node_refs: [refs[0]!] });
  return JSON.stringify({
    shape_id: defaultShape,
    short: {
      headline: "The positions were argued, and they held up.",
      summary: "You asked a question; the answers were weighed against their strongest objections.",
      confidence: "Fairly sure, until a sourced objection turns up.",
      paths: refs.map((ref) => ({ position_ref: ref, fate: "HELD_UP", line: "This position held up.", node_refs: [ref] })),
      change: paragraph("A stronger, sourced objection would change the answer.")
    },
    why: { reasons: [paragraph("The first position held up against its strongest objection.")] },
    long: { sections: ["What you are deciding", "The verdict", "What would change it"].map((title) => ({
      title, paragraphs: [paragraph(`${title}, in the debate's own terms.`)]
    })) },
    reviewer_note: null
  });
}

/* ------------------------------------------------------------------ reading a request */

/** The argument-language directive names the machine keys below, so it is removed before routing (as database.test.ts). */
const LANGUAGE_DIRECTIVE = new RegExp(argumentLanguageDirective("\u0000")
  .replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\u0000", "[^.]+?"), "gu");
const PROBE_QUESTION = "Reply exactly: OK";

/**
 * The OpenAI-shaped body the frame reader reads: an Anthropic Messages body carries the system text beside its
 * turns, so it is put back in front of them (the adapter only lifted it out).
 */
export function stubChatBody(provider: GateProvider, body: Readonly<Record<string, unknown>>): string {
  if (provider === "deepinfra") return JSON.stringify(body);
  const turns = Array.isArray(body.messages) ? body.messages : [];
  return JSON.stringify({ messages: typeof body.system === "string" ? [{ role: "system", content: body.system }, ...turns] : turns });
}

/** Which contract a request is for: the probe by its question, the story by its contract id, the debate by structural keys. */
export function classifyGateRequest(chat: string): GateRequestKind | "UNKNOWN" {
  const messages = wirePacket(chat).messages;
  if (messages.length === 1 && messages[0]!.role === "user" && messages[0]!.content.includes(PROBE_QUESTION)) return "PROBE";
  const contractId = readFramedMaterial(wirePacket(chat)).contractId;
  if (contractId === STORYTELLER_CONTRACT_ID) return "STORYTELLER";
  if (contractId === STORY_CHECKER_CONTRACT_ID) return "STORY_CHECKER";
  const instruction = (messages[0]?.content ?? "").replace(LANGUAGE_DIRECTIVE, "");
  // The panel's assessment is the judge's schema WITHOUT restatement_text (tests/unit/t03-judge-panel.test.ts).
  if (instruction.includes("fatalFlags") && !instruction.includes("restatement_text")) return "PANEL";
  if (instruction.includes("edge_bearings")) return "REVIEW";
  if (instruction.includes("restatement_text")) return "JUDGE";
  if (instruction.includes("fairness_to_losers")) return "EVALUATOR";
  if (instruction.includes("served_number_refs")) return "COMPOSE";
  return "UNKNOWN";
}

/** The vendor's own reply shape: an OpenAI chat completion (DeepInfra) or a Messages reply (Anthropic), with usage. */
export function stubVendorReply(provider: GateProvider, model: string, content: string, id: string): string {
  return provider === "anthropic"
    ? JSON.stringify({ id: `msg_${id}`, type: "message", role: "assistant", model, content: [{ type: "text", text: content }],
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } })
    : JSON.stringify({ id, model, choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 } });
}

/* ------------------------------------------------------------------ the gates */

export type PreviewGateStubs = Readonly<{
  /** Every /complete request, in arrival order, with how it was answered. */
  requests: GateRecord[];
  /** Every /remaining read, in arrival order. */
  remainingReads: GateRemainingRead[];
  /** The DeepInfra gate's halt (only ever moves with `debate.deepInfraHaltAt`). */
  halt: Readonly<GateHalt>;
  sockets: Readonly<Record<GateProvider, string>>;
  close(): Promise<void>;
}>;

/**
 * Both preview gates over real unix sockets, routed by URL as the gate routes them: `POST /complete` (one model call)
 * and `POST /remaining` (the read-only day figures, contract A §5, read on the same socket as on the preview:
 * createPreviewRemainingRpcPort). Any other path is a 404.
 *  - `probeScripts`: a probe takes the next step of its model's script (OK once spent).
 *  - `refuseModels`: any request for these models is a billed vendor 500 (a test that must never call them fails by
 *    the record).
 *  - `debate`: the run-resilience scripts (GateDebateScripts): scripted models refuse every non-probe request unbilled;
 *    the DeepInfra gate halts at its ceiling.
 *  - `override`: a scenario's own answer for a request, before the contract's valid reply.
 *  - `enabledModels`: what /remaining says each gate serves (default: the five reviewed models by their gate).
 *  - `remainingState`: what /remaining says while the gate has not halted (default "active"); a halted DeepInfra gate
 *    always answers "halted".
 * The order of answers: a halted DeepInfra gate (STOPPED), a refused model (BILLED_500), an unbilled step (the probe's
 * script, or `debate.unbilled` for any other request), the override, the contract.
 */
export async function startPreviewGateStubs(input: Readonly<{
  storyDefaultShape: string;
  probeScripts?: Readonly<Record<string, readonly ("OK" | "UNBILLED")[]>>;
  refuseModels?: readonly string[];
  debate?: GateDebateScripts;
  override?: (request: GateRequest, chat: string) => GateOverride | null;
  enabledModels?: Readonly<Record<GateProvider, readonly string[]>>;
  remainingState?: "active" | "halted";
}>): Promise<PreviewGateStubs> {
  const requests: GateRecord[] = [];
  const remainingReads: GateRemainingRead[] = [];
  const queues = new Map<string, ("OK" | "UNBILLED")[]>(Object.entries(input.probeScripts ?? {}).map(([model, steps]) => [model, [...steps]]));
  const halt: GateHalt = { unbilledReleases: 0, haltedAt: null, firstStoppedAt: null };
  const servers: Server[] = [];
  const directories: string[] = [];
  let served = 0;
  const enabled = input.enabledModels ?? {
    deepinfra: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash"],
    anthropic: ["claude-haiku-5-5"]
  };
  const answerFor = (kind: GateRequestKind | "UNKNOWN", chat: string): string | null => {
    served += 1;
    switch (kind) {
      case "PROBE": return "OK";
      case "STORYTELLER": return stubStoryFor(chat, input.storyDefaultShape);
      case "STORY_CHECKER": return STUB_STORY_CHECKER_SATISFIED;
      case "PANEL": return STUB_PANEL_ASSESSMENT;
      case "REVIEW": return withRequestDerivedBearings(reviewArtifact("agree", [`Review ${String(served)} agrees.`]), chat);
      case "JUDGE": return stubJudgement(`Practice debate point ${String(served)}.`);
      case "EVALUATOR": return STUB_EVALUATOR_SATISFIED;
      case "COMPOSE": return STUB_COMPOSITION;
      default: return null;
    }
  };
  const socketFor = async (provider: GateProvider): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "pgs-"));
    directories.push(directory);
    const socket = join(directory, "gate.sock");
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const json = (status: number, payload: string) => response.writeHead(status, { "content-type": "application/json" }).end(payload);
        if (request.url === "/remaining") {
          const state = provider === "deepinfra" && halt.haltedAt !== null ? "halted" : input.remainingState ?? "active";
          remainingReads.push(Object.freeze({ provider, state }));
          json(200, JSON.stringify({
            state, window_open: true, remaining_usd: "9.500000000", remaining_calls: 1900,
            max_concurrent_calls: provider === "anthropic" ? 2 : 10, largest_reservation_usd: "0.214016000",
            enabled_models: enabled[provider]
          }));
          return;
        }
        if (request.url !== "/complete") { json(404, JSON.stringify({ error: "NOT_FOUND" })); return; }
        const execution = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { requestBody: string };
        const body = JSON.parse(execution.requestBody) as Record<string, unknown>;
        const model = String(body.model);
        const chat = stubChatBody(provider, body);
        let kind: GateRequestKind | "UNKNOWN";
        try { kind = classifyGateRequest(chat); } catch { kind = "UNKNOWN"; }
        const seen: GateRequest = Object.freeze({ provider, model, kind, body });
        const record = (answer: GateAnswer): number => requests.push(Object.freeze({ ...seen, answer })) - 1;
        const reply = (status: number, vendorBody: string) => json(200, JSON.stringify({ status, body: vendorBody }));
        const refuse = (code: string) => json(409, JSON.stringify({ error: code }));
        const unbilled = () => {
          const at = record("UNBILLED");
          if (provider === "deepinfra") {
            halt.unbilledReleases += 1;
            const ceiling = input.debate?.deepInfraHaltAt;
            if (ceiling !== undefined && halt.unbilledReleases >= ceiling) halt.haltedAt ??= at;
          }
          refuse("PROVIDER_REFUSED_UNBILLED");
        };
        if (provider === "deepinfra" && halt.haltedAt !== null) {
          const at = record("STOPPED");
          halt.firstStoppedAt ??= at;
          refuse("PREVIEW_TEST_AUTHORITY_STOPPED");
          return;
        }
        if (input.refuseModels?.includes(model) === true) {
          record("BILLED_500");
          reply(500, JSON.stringify({ error: { message: "this model must never be called in this test" } }));
          return;
        }
        const scriptedUnbilled = kind === "PROBE"
          ? queues.get(model)?.shift() === "UNBILLED"
          : input.debate?.unbilled.includes(model) === true;
        if (scriptedUnbilled) { unbilled(); return; }
        const override = input.override?.(seen, chat) ?? null;
        if (override !== null) {
          if ("unbilled" in override) { unbilled(); return; }
          if ("gateRefuses" in override) { record("GATE_REFUSED"); refuse(override.gateRefuses); return; }
          if ("vendorStatus" in override) {
            record("VENDOR_ERROR");
            reply(override.vendorStatus, JSON.stringify({ error: { message: "scripted vendor error" } }));
            return;
          }
          served += 1;
          record("OK");
          reply(200, stubVendorReply(provider, model, override.content, `practice-stub-${String(served)}`));
          return;
        }
        const content = answerFor(kind, chat);
        if (content === null) { record("UNEXPECTED"); reply(500, JSON.stringify({ error: { message: "unexpected test request" } })); return; }
        record("OK");
        reply(200, stubVendorReply(provider, model, content, `practice-stub-${String(served)}`));
      });
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(socket, done));
    return socket;
  };
  const sockets = Object.freeze({ deepinfra: await socketFor("deepinfra"), anthropic: await socketFor("anthropic") });
  return Object.freeze({
    requests,
    remainingReads,
    halt,
    sockets,
    async close() {
      await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
      await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
    }
  });
}
