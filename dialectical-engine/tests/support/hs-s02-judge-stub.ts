import type { PromptPacket } from "../../packages/providers/src/index.js";
import { readPromptFrame } from "../../packages/providers/src/prompt-frame.js";
import { PublicationJudgeFailure, type PublicationJudgePort } from "../../apps/api/src/publication-check/check.js";

/**
 * A scripted answer. A string (or a function's text) is what an HONEST judge writes: when it is one JSON object —
 * bare, or in one ```json fence — without a "call" key, the stub adds this call's one-time value (V-21, the R5
 * answer form), exactly as a judge that follows the answer form would. `{ raw }` is sent byte for byte, unbound:
 * the shape a copying or forging judge produces.
 */
export type JudgeStubStep = string | Error | { readonly raw: string }
  | ((input: Parameters<PublicationJudgePort["complete"]>[0]) => Promise<{ text: string } | { raw: string }>);

/** The one-time value the frame of `packet` carries: the 32 hexadecimal characters of its boundary marker. */
export function callValueOf(packet: PromptPacket): string {
  return /[0-9a-f]{32}/u.exec(readPromptFrame(packet).fence)![0];
}

/** An honest judge's answer to `packet`: the scripted object with this call's value first. */
export function bindJudgeAnswer(text: string, packet: PromptPacket): string {
  const fenced = /^```(json)?\n([^]*)\n```$/u.exec(text);
  let value: unknown;
  try { value = JSON.parse(fenced ? fenced[2]! : text); } catch { return text; }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.hasOwn(value, "call")) return text;
  const bound = JSON.stringify({ call: callValueOf(packet), ...(value as Record<string, unknown>) });
  return fenced ? "```" + (fenced[1] ?? "") + "\n" + bound + "\n```" : bound;
}

/** The material fields of a framed judge packet (the envelope between the fence lines of the user message). */
export function fieldsOf(packet: PromptPacket): { name: string; content: string }[] {
  return JSON.parse(packet.messages[1]!.content.split("\n").slice(1, -1).join("\n")).fields;
}

const HONEST_ALLOW = JSON.stringify({ verdict: "ALLOW", rules: [], parts: [], possibly_illegal: false });

/**
 * FIX-HS2-t: every judge call carries ONE part kind (material.ts packJudgeCalls), so a scripted judge answers per
 * PART: the step for the call's field name (`question`, `summary`, `arguments`, `reviews`, `story`), `otherwise` for
 * every part the script does not name (an honest ALLOW by default). `calls` lists each call's field names, in order.
 */
export function createPartJudgeStub(steps: Readonly<Record<string, JudgeStubStep>>, otherwise: JudgeStubStep = HONEST_ALLOW):
  PublicationJudgePort & { packets: PromptPacket[]; calls: string[][] } {
  const calls: string[][] = [], packets: PromptPacket[] = [];
  return {
    providerRef: "test:judge", modelId: "test-model", packets, calls,
    complete(input) {
      const names = fieldsOf(input.packet).map(field => field.name);
      calls.push(names); packets.push(input.packet);
      const step = names.length === 1 && Object.hasOwn(steps, names[0]!) ? steps[names[0]!]! : otherwise;
      return createJudgeStub([step]).complete(input);
    }
  };
}

/** Only the external judge is scripted; framing, validation and recording remain real. */
export function createJudgeStub(script: readonly JudgeStubStep[]): PublicationJudgePort & { packets: PromptPacket[] } {
  const packets: PromptPacket[] = [];
  const answer = (result: { text: string } | { raw: string }, packet: PromptPacket) =>
    "raw" in result ? { text: result.raw } : { text: bindJudgeAnswer(result.text, packet) };
  return {
    providerRef: "test:judge", modelId: "test-model", packets,
    async complete(input) {
      const step = script[packets.length];
      packets.push(input.packet);
      if (step instanceof Error) throw step;
      if (typeof step === "function") return answer(await step(input), input.packet);
      if (typeof step === "object" && step !== null && "raw" in step) return { text: step.raw };
      if (typeof step !== "string") throw new PublicationJudgeFailure("JUDGE_TRANSPORT_FAILED");
      return { text: bindJudgeAnswer(step, input.packet) };
    }
  };
}
