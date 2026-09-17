import { TOOL_REGISTRY } from "./tools.js";
import type { SupportCasePredicate, SupportCaseToolCall } from "./cases.js";
import type { SupportLanguage } from "./templates.js";
import { supportSensitiveIntentFamily } from "./classify.js";

const HUMAN_PHRASES = Object.freeze([
  "speak to a person",
  "talk to a human",
  "human support",
  "vorbesc cu o persoană",
  "vorbesc cu o persoana",
  "suport uman"
]);

export type EscalationContext = Readonly<{
  message: string;
  classification: string | null;
  outcomes: readonly string[];
  previousOutcomes?: readonly string[];
  ratings: readonly ("yes" | "no" | "human")[];
  toolCalls: readonly SupportCaseToolCall[];
  requestedHuman: boolean;
}>;

function includesPhrase(message: string,phrases: readonly string[]): boolean {
  const normalized = message.normalize("NFKC").toLocaleLowerCase("en-US");
  return phrases.some((phrase) => normalized.includes(phrase));
}

export function evaluateEscalation(
  context: EscalationContext
): Readonly<{ predicate: SupportCasePredicate }> | null {
  const sensitiveFamily = supportSensitiveIntentFamily(context.message);
  if (sensitiveFamily === "account-erasure"
    || sensitiveFamily === "minor" || sensitiveFamily === "legal-data") {
    return Object.freeze({ predicate: "E8" });
  }
  if (context.classification === "REFUSE_SAFETY") return Object.freeze({ predicate: "E2" });
  if (context.classification === "REFUSE_ZONE"
    && context.outcomes.filter((outcome) => outcome === "REFUSE_ZONE").length >= 1) {
    return Object.freeze({ predicate: "E3" });
  }
  if (context.requestedHuman
    || context.ratings.at(-1) === "human"
    || includesPhrase(context.message,HUMAN_PHRASES)) {
    return Object.freeze({ predicate: "E1" });
  }
  if (context.toolCalls.some((call) => !(call.name in TOOL_REGISTRY)
    || call.outcome === "DENIED" || call.outcome === "BOUNDARY_DENY")) {
    return Object.freeze({ predicate: "E4" });
  }
  if (context.ratings.length >= 2
    && context.ratings.at(-1) === "no"
    && context.ratings.at(-2) === "no") {
    return Object.freeze({ predicate: "E5" });
  }
  if (context.outcomes.filter((outcome) => outcome === "NO_SOURCE").length >= 2) {
    return Object.freeze({ predicate: "E6" });
  }
  if ((context.previousOutcomes ?? context.outcomes).at(-1) === "DEGRADED"
    && context.message.trim() !== "") {
    return Object.freeze({ predicate: "E7" });
  }
  return null;
}

export type CaseTransferProjection = Readonly<{
  transcript: readonly Readonly<{ role: string;text: string }>[];
  predicate: SupportCasePredicate;
  tool_calls: readonly SupportCaseToolCall[];
  language: SupportLanguage;
  kb_version: string;
  summary: string | null;
  identity_owner_ref: string | null;
}>;

export function projectCaseTransfer(input: Readonly<{
  transcript: readonly Readonly<{ role: string;text: string }>[];
  predicate: SupportCasePredicate;
  toolCalls: readonly SupportCaseToolCall[];
  language: SupportLanguage;
  kbVersion: string;
  summary: string | null;
  identityOwnerRef: string | null;
  email?: unknown;
  debateContent?: unknown;
}>): CaseTransferProjection {
  return Object.freeze({
    transcript: input.transcript,
    predicate: input.predicate,
    tool_calls: input.toolCalls,
    language: input.language,
    kb_version: input.kbVersion,
    summary: input.summary,
    identity_owner_ref: input.identityOwnerRef
  });
}
