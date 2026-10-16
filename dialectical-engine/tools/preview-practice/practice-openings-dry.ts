/**
 * Preview practice, mode "openings", --dry: scripted answers; nothing is spent and no socket is opened.
 *
 * Plain words: --dry runs the openings comparison exactly as the real run does: the same prompts, the same frame
 * and door, the same preview call policy with its repair and its busy resend, the same gate watch, tokens and cost.
 * Only the two spending gates are replaced by a script that answers on the spot, in the question's language, and the
 * policy's waits (the 60-second resend, a busy model's wait) take no time. The script is fixed so every arm and the
 * main fallbacks are exercised:
 *  - the Anthropic model's first list without an angle carries one over-long claim; the patch follow-up fixes it;
 *  - the first model asked to merge is refused as busy (not billed), every time from then on, so it sits out the
 *    rest and the code merges instead (MAP_MERGE_FALLBACK);
 *  - choose names one answer, so the code fills a second (ANSWERS_FILLED);
 *  - each gap round adds one point, so the gap rounds stop after one (GAP_STOPPED).
 * The expected verdict is PASS_WITH_WARNINGS (exit 10): a busy model that answered before, a repaired slip and the
 * unbilled refusals.
 */
import { detectArgumentLanguage } from "@debateai/kernel";
import { MAP_CONTRACT_IDS, MAP_LIMITS } from "@debateai/map";
import {
  parsePreviewProviderTestConfig,
  previewTargetJsonRow,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  PreviewVendorRefusedUnbilled,
  readPromptFrame,
  type FramedMaterialField,
  type PreviewBudgetPort,
  type PreviewProviderTestConfig,
  type PromptPacket,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import { onePerModel, practiceDeclaredTargets } from "./practice-formats.js";

/** The five preview AIs, as the preview's roster names them (the same five the practice unit tests use). */
export const OPENINGS_DRY_MODELS: readonly string[] = Object.freeze(["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash",
  "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"]);

/** A preview configuration for the dry run. Its socket paths are never opened. */
export function openingsDryConfig(): PreviewProviderTestConfig {
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", free_model_ids: OPENINGS_DRY_MODELS.slice(0, 2),
    premium_model_ids: OPENINGS_DRY_MODELS, requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-openings-dry" }));
  if (config === undefined) throw new Error("PRACTICE_OPENINGS_DRY_CONFIG_INVALID");
  return config;
}

/** One target per preview AI, from the reviewed provider list, as the real command builds them. */
export function openingsDryTargets(config: PreviewProviderTestConfig): readonly ProviderDiscoveryTarget[] {
  return onePerModel(practiceDeclaredTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow))), config.premium_model_ids);
}

/**
 * The prompt a gate body carries, for the frame reader: a DeepInfra body's own messages; an Anthropic body's system
 * text put back in front of its turns (a system sent as cache blocks is their texts joined, byte for byte). Length
 * guidance L30 (LG-B): a first user turn sent as marked text blocks is their texts joined, the turn byte for byte.
 */
export function openingsDryPacket(requestBody: string): Readonly<{ model: string; packet: PromptPacket }> {
  const body = JSON.parse(requestBody) as { model?: unknown; messages?: unknown; system?: unknown };
  const joined = (blocks: readonly { text?: unknown }[]): string => blocks.map((block) => (typeof block.text === "string" ? block.text : "")).join("");
  // LG-B (L30): a turn sent as text blocks (the marked material) is its blocks' texts joined: today's turn byte for byte.
  const turns = ((Array.isArray(body.messages) ? body.messages : []) as { role: PromptPacket["messages"][number]["role"]; content: unknown }[])
    .map((turn): PromptPacket["messages"][number] => ({ role: turn.role,
      content: Array.isArray(turn.content) ? joined(turn.content as { text?: unknown }[]) : String(turn.content) }));
  const system = typeof body.system === "string" ? body.system
    : Array.isArray(body.system) ? joined(body.system as { text?: unknown }[])
      : null;
  return Object.freeze({ model: String(body.model), packet: Object.freeze({
    messages: Object.freeze(system === null ? turns : [{ role: "system" as const, content: system }, ...turns]) }) });
}

type OpeningsDryText = Readonly<{ point: string; why: string; yes: string; no: string; position: string; gap: string; snowball: string;
  angles: readonly [string, string, string, string] }>;

const OPENINGS_DRY_TEXT: Readonly<Record<"ro" | "en", OpeningsDryText>> = Object.freeze({
  ro: Object.freeze({
    point: "Este un punct important pentru că poate schimba răspunsul la întrebare",
    why: "Dacă este adevărat, răspunsul trebuie să țină cont de el.",
    yes: "Da, dar cu condiții clare.",
    no: "Nu, costurile sunt prea mari.",
    position: "Răspunsul meu este da, pentru că beneficiile sunt mai mari decât costurile, dacă sunt respectate condițiile.",
    gap: "Un punct care lipsește: efectul asupra celor care nu au fost întrebați",
    snowball: "Un punct nou, după ce am văzut lista",
    angles: ["Cel mai puternic argument pentru alt răspuns", "Ce îl îngrijorează pe cel care întreabă", "Ce trebuie făcut în practică",
      "Costurile și cine le plătește"] as const
  }),
  en: Object.freeze({
    point: "This is an important point because it can change the answer to the question",
    why: "If it is true, the answer has to take it into account.",
    yes: "Yes, but with clear conditions.",
    no: "No, the costs are too high.",
    position: "My answer is yes, because the benefits are larger than the costs when the conditions are kept.",
    gap: "A missing point: the effect on the people nobody asked",
    snowball: "A new point after seeing the list",
    angles: ["The strongest case for a different answer", "What the person asking is worried about", "What to do in practice",
      "The costs and who pays them"] as const
  })
});

const openingsDryField = (fields: readonly FramedMaterialField[], name: string): string =>
  fields.find((entry) => entry.name === name)?.content ?? "";
const openingsDryTextOf = (fields: readonly FramedMaterialField[]): OpeningsDryText =>
  OPENINGS_DRY_TEXT[detectArgumentLanguage(openingsDryField(fields, "question_line")).tag === "ro" ? "ro" : "en"];

/**
 * A valid reply for the step, in the question's language (read from the material, as a model reads it). `serial` keeps
 * the snowball and gap points distinct; no model id or maker ever enters a reply, so the blindness test can look for them.
 */
export function openingsDryContent(input: Readonly<{ contractId: string; fields: readonly FramedMaterialField[]; serial: number; slip: boolean }>): string {
  const text = openingsDryTextOf(input.fields);
  const short = String(input.serial);
  const point = (claim: string) => ({ claim, why_it_matters: text.why, leans: "context" });
  if (input.contractId.startsWith("judge.")) {
    return JSON.stringify({ statement: text.position, way_of_knowing: "REASONING", locator: null, restatement_text: text.position,
      restatement_status: "PASS", value_laden: false, claim_type: "unknown", steelman: { summary: text.position, fidelity: 0.72 },
      critic: { summary: text.no, counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" }, evidence: { quality: 0.72, relevance: 0.72 },
      context: { fit: 0.72, ambiguityFlags: [] }, fallacy: { severity: 0.28, fatalFlags: [] } });
  }
  if (input.contractId === MAP_CONTRACT_IDS.angles) {
    const [opposite, worry, practical, cost] = text.angles;
    return JSON.stringify({ angles: [
      { angle_id: "opposite", kind: "OPPOSITE_CASE", label: opposite, focus: opposite },
      { angle_id: "worry", kind: "ASKER_WORRY", label: worry, focus: worry },
      { angle_id: "practical", kind: "PRACTICAL", label: practical, focus: practical },
      { angle_id: "cost", kind: "SPECIFIC", label: cost, focus: cost }] });
  }
  if (input.contractId === MAP_CONTRACT_IDS.listAngle || input.contractId === MAP_CONTRACT_IDS.listOpen) {
    const label = openingsDryField(input.fields, "angle_label");
    const claims = [1, 2, 3].map((n) => `${text.point}${label === "" ? "" : ` (${label})`} ${String(n)}`);
    if (input.slip) claims[0] = `${claims[0]!} ${"x".repeat(MAP_LIMITS.claimMaxChars)}`;
    return JSON.stringify({ points: claims.map(point), candidate_answers: [label === text.angles[0] ? text.no : text.yes] });
  }
  if (input.contractId === MAP_CONTRACT_IDS.listSnowball) {
    return JSON.stringify({ points: [point(`${text.snowball} (${short})`)], candidate_answers: [] });
  }
  if (input.contractId === MAP_CONTRACT_IDS.merge) {
    const points = JSON.parse(openingsDryField(input.fields, "points")) as { item_id: string; claim: string }[];
    const answers = JSON.parse(openingsDryField(input.fields, "candidate_answers")) as { item_id: string; answer: string }[];
    const claims = [...new Set(points.map((row) => row.claim))];
    const texts = [...new Set(answers.map((row) => row.answer))];
    return JSON.stringify({
      key_points: claims.map((claim, index) => ({ key_point_id: `k${String(index + 1)}`, claim,
        member_item_ids: points.filter((row) => row.claim === claim).map((row) => row.item_id) })),
      answers: texts.map((answer, index) => ({ answer_id: `a${String(index + 1)}`, answer,
        member_item_ids: answers.filter((row) => row.answer === answer).map((row) => row.item_id) }))
    });
  }
  if (input.contractId === MAP_CONTRACT_IDS.gap) {
    return JSON.stringify({ new_points: [point(`${text.gap} (${short})`)], framing_challenges: [] });
  }
  if (input.contractId === MAP_CONTRACT_IDS.choose) {
    const first = (JSON.parse(openingsDryField(input.fields, "key_points")) as { key_point_id: string }[])[0]?.key_point_id;
    return JSON.stringify({ answers: [{ answer_id: "a-1", statement: text.yes, for: first === undefined ? [] : [first], against: [], strongest_rival: null }] });
  }
  return "{}";
}

/** The patch follow-up's answer: only the members asked for (here: the over-long claim, shortened). */
function openingsDryPatch(paths: readonly string[], fields: readonly FramedMaterialField[]): string {
  const text = openingsDryTextOf(fields);
  return JSON.stringify(Object.fromEntries(paths.map((path) => [path, `${text.point} 1`])));
}

/** What the dry script has done so far. */
export type OpeningsDryScript = { busyModel: string | null; slipped: boolean; requests: number };

export function openingsDryVendorReply(provider: "deepinfra" | "anthropic", model: string, content: string, id: number): string {
  return provider === "anthropic"
    ? JSON.stringify({ id: `msg_dry_${String(id)}`, type: "message", role: "assistant", model, content: [{ type: "text", text: content }],
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } })
    : JSON.stringify({ id: `dry-${String(id)}`, model, choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 } });
}

/**
 * The two scripted gate ports, each reading the prompt with the frame reader the gateway's door runs, and the dry run's
 * sleep: no time passes, so the policy's 60-second resend and a busy model's wait cost nothing.
 */
export function openingsDryPorts(): Readonly<{
  ports: Readonly<{ deepinfra: PreviewBudgetPort; anthropic: PreviewBudgetPort }>;
  script: OpeningsDryScript;
  sleep: (milliseconds: number) => Promise<void>;
}> {
  const script: OpeningsDryScript = { busyModel: null, slipped: false, requests: 0 };
  const port = (provider: "deepinfra" | "anthropic"): PreviewBudgetPort => Object.freeze({
    async execute(input: Parameters<PreviewBudgetPort["execute"]>[0]) {
      script.requests += 1;
      const { model, packet } = openingsDryPacket(input.requestBody);
      const frame = readPromptFrame(packet);
      if (model === script.busyModel) throw new PreviewVendorRefusedUnbilled();
      if (frame.contractId === MAP_CONTRACT_IDS.merge && script.busyModel === null) {
        script.busyModel = model;
        throw new PreviewVendorRefusedUnbilled();
      }
      const patchPaths = frame.fields.find((entry) => entry.name === "machine_rejection_paths")?.content;
      const isPatch = patchPaths !== undefined && frame.fields.some((entry) => entry.name === "machine_reply_form" && entry.content === "PATCH");
      const slip = provider === "anthropic" && !script.slipped && frame.contractId === MAP_CONTRACT_IDS.listOpen && !isPatch;
      if (slip) script.slipped = true;
      const content = isPatch ? openingsDryPatch(patchPaths.split(","), frame.fields)
        : openingsDryContent({ contractId: frame.contractId, fields: frame.fields, serial: script.requests, slip });
      return { status: 200, body: openingsDryVendorReply(provider, model, content, script.requests) };
    }
  });
  return Object.freeze({ ports: Object.freeze({ deepinfra: port("deepinfra"), anthropic: port("anthropic") }), script,
    sleep: async () => undefined });
}
