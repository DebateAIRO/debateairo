// Scripted gate answers keyed by WHAT a call asked, never by when it arrived — moved verbatim from
// tests/integration/parallel-calls-debate.test.ts (debate-shape plan, Task 15 Step 1; written in Task 13), so the
// debate-shape suites (tests/support/debate-shape-harness.ts) answer judge, panel and review calls the same way.
import { createHash } from "node:crypto";
import { readPromptFrame, type PromptPacket } from "@debateai/providers";
import type { GateOverride, GateRequest } from "./preview-gate-stubs.js";
import { wirePacket } from "./framed-packet.js";
import { reviewArtifact, withRequestDerivedBearings } from "./reviewBearings.js";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const digestOf = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
/** The call's own fence and canary, as the provider door reads them; null for a packet with no frame. */
function framedTokensOf(chat: string): Readonly<{ fence: string; canary: string }> | null {
  try {
    const frame = readPromptFrame(wirePacket(chat) as PromptPacket);
    return { fence: frame.fence, canary: frame.canary };
  } catch {
    return null;
  }
}
/** A number in [0, 1] with two decimals, from 8 hex digits of a digest. */
const share = (hex: string): number => Math.round((Number.parseInt(hex.slice(0, 8), 16) / 0xffffffff) * 100) / 100;

/**
 * Answers that depend only on WHAT a call asked, never on when it arrived: the request's model, kind and text, with
 * the run's question, every random id (node, edge) and each prompt's random fence and canary taken out. A debate argued twice from the same run therefore
 * gets the same answer to the same call, whatever order the calls come in.
 */
export function scriptedAnswers(question: string, bearings?: Readonly<{ support: number; attack: number }>) {
  return (request: GateRequest, chat: string): GateOverride | null => {
    // Every framed prompt carries its own random fence and canary (the prompt-injection boundary): not what was asked.
    // They are read through the frame's own reader (never a hand-rolled pattern) and masked in every message.
    const frame = framedTokensOf(chat);
    const unframed = frame === null ? chat
      : chat.split(frame.fence).join("#|<fence>|#").split(frame.canary).join("<canary>");
    const asked = unframed.split(question).join("<question>").replace(UUID, "<id>");
    const digest = digestOf(`${request.model}\n${request.kind}\n${asked}`);
    const level = share(digest);
    switch (request.kind) {
      case "JUDGE": return { content: JSON.stringify({
        statement: `Point ${digest.slice(0, 12)}.`, way_of_knowing: "REASONING", locator: null,
        restatement_text: `Point ${digest.slice(0, 12)}, restated.`, restatement_status: "PASS", value_laden: false, claim_type: "unknown",
        steelman: { summary: `Steelman ${digest.slice(12, 20)}.`, fidelity: level },
        critic: { summary: `Counter ${digest.slice(20, 28)}.`, counterargumentStrength: share(digest.slice(8)), basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.6, relevance: 0.6 }, context: { fit: 0.6, ambiguityFlags: [] }, fallacy: { severity: 0.2, fatalFlags: [] }
      }) };
      case "PANEL": return { content: JSON.stringify({
        steelman: { summary: `Panel ${digest.slice(0, 12)}.`, fidelity: level },
        critic: { summary: "Panel member counter.", counterargumentStrength: share(digest.slice(8)), basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.5, relevance: 0.5 }, context: { fit: 0.5, ambiguityFlags: [] }, fallacy: { severity: 0.3, fatalFlags: [] }
      }) };
      case "REVIEW": return { content: withRequestDerivedBearings(reviewArtifact(
        level < 0.5 ? "agree" : "dispute", [`Review ${digest.slice(0, 12)}.`],
        bearings ?? { support: share(digest.slice(16)), attack: share(digest.slice(24)) }
      ), chat) };
      default: return null;
    }
  };
}
