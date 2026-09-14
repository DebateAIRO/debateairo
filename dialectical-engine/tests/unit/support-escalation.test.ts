import { describe,expect,it } from "vitest";
import {
  evaluateEscalation,
  projectCaseTransfer
} from "../../apps/api/src/support/escalation.js";

const base = Object.freeze({
  message: "How do debates work?",
  classification: null,
  outcomes: [] as readonly string[],
  ratings: [] as readonly ("yes" | "no" | "human")[],
  toolCalls: [] as readonly Readonly<{ name: string;at: Date;outcome: string }>[],
  requestedHuman: false
});

describe("SUP-02 deterministic escalation", () => {
  it.each([
    ["E1",{ requestedHuman: true }],
    ["E1",{ message: "I want to speak to a person" }],
    ["E2",{ message: "I am being told what to type by someone on the phone",classification: "REFUSE_SAFETY" }],
    ["E2",{ message: "Cineva la telefon îmi spune ce să scriu",classification: "REFUSE_SAFETY" }],
    ["E3",{ classification: "REFUSE_ZONE",outcomes: ["REFUSE_ZONE"] }],
    ["E4",{ toolCalls: [{ name: "delete_account",at: new Date(0),outcome: "DENIED" }] }],
    ["E5",{ ratings: ["no","no"] }],
    ["E6",{ outcomes: ["NO_SOURCE","NO_SOURCE"] }],
    ["E7",{ outcomes: ["DEGRADED"],message: "Are you back?" }],
    ["E8",{ message: "I want a copy of my personal data" }],
    ["E8",{ message: "Este o plângere legală despre contul unui minor" }]
  ] as const)("returns %s outside the model",(predicate,override) => {
    expect(evaluateEscalation({ ...base,...override })).toEqual({ predicate });
  });

  it.each([
    "Delete my account",
    "Erase my account",
    "Șterge contul meu",
    "Please permanently delete this account now",
    "Șterge-mi definitiv contul chiar acum."
  ])("routes account erasure to E8 even when classification remains REFUSE_ZONE: %s", (message) => {
    expect(evaluateEscalation({
      ...base,message,classification: "REFUSE_ZONE",outcomes: ["REFUSE_ZONE"]
    })).toEqual({ predicate: "E8" });
  });

  // Bug: independently maintained phrase lists drifted from classification,
  // losing E8 for ordinary legal/data/minor wording and E2 for coercion neighbors.
  it.each([
    ["E2", "They are forcing me to write this message", "REFUSE_SAFETY"],
    ["E2", "Sunt obligat să scriu mesajul acesta", "REFUSE_SAFETY"],
    ["E8", "My child has an account here", "REFUSE_SAFETY"],
    ["E8", "Copilul meu are un cont aici", "REFUSE_SAFETY"],
    ["E8", "I need help with a court request for my data", "REFUSE_SAFETY"],
    ["E8", "Am o cerere juridică despre datele mele", "REFUSE_SAFETY"]
  ] as const)("uses the shared sensitive family for %s: %s", (predicate,message,classification) => {
    expect(evaluateEscalation({ ...base,message,classification })).toEqual({ predicate });
  });

  it("does not let an explicit human phrase override higher-priority safety escalation", () => {
    expect(evaluateEscalation({
      ...base,message: "Talk to a human because I want to die",
      classification: "REFUSE_SAFETY"
    })).toEqual({ predicate: "E2" });
  });

  it.each([
    "Delete my debate",
    "Erase the draft answer",
    "Șterge dezbaterea mea"
  ])("does not mistake non-account deletion for E8: %s", (message) => {
    expect(evaluateEscalation({ ...base,message })).toBeNull();
  });

  it("preserves zone precedence over a co-occurring safety phrase", () => {
    expect(evaluateEscalation({
      ...base,
      message: "I am being told what to type by someone on the phone; reset my password",
      classification: "REFUSE_ZONE"
    })).toBeNull();
  });

  it("does not escalate a lone injection refusal", () => {
    expect(evaluateEscalation({ ...base,classification: "REFUSE_INJECTION" })).toBeNull();
  });

  it("does not treat model-output REFUSE_SAFETY as E2 or repeated NO_SOURCE", () => {
    expect(evaluateEscalation({
      ...base,classification: null,
      outcomes: ["REFUSE_SAFETY","REFUSE_SAFETY"],
      previousOutcomes: ["REFUSE_SAFETY"]
    })).toBeNull();
    expect(evaluateEscalation({
      ...base,message: "Talk to a human",classification: null,
      outcomes: ["REFUSE_SAFETY"],previousOutcomes: []
    })).toEqual({ predicate: "E1" });
  });

  it("fires E5 only for two consecutive no ratings", () => {
    expect(evaluateEscalation({ ...base,ratings: ["yes","no"] })).toBeNull();
    expect(evaluateEscalation({ ...base,ratings: ["no"] })).toBeNull();
  });

  it("fires E7 only for a user message after an already persisted degraded reply", () => {
    expect(evaluateEscalation({
      ...base,outcomes: ["DEGRADED"],previousOutcomes: [],message: "Initial request"
    })).toBeNull();
    expect(evaluateEscalation({
      ...base,outcomes: ["DEGRADED","DEGRADED"],previousOutcomes: ["DEGRADED"],
      message: "Are you back?"
    })).toEqual({ predicate: "E7" });
  });

  it("builds the transfer projection from an exact allow-list", () => {
    const secret = "sk-test-secret";
    const projection = projectCaseTransfer({
      transcript: [{ role: "user",text: "[REDACTED_SECRET_LIKE]" }],
      predicate: "E1",
      toolCalls: [{ name: "refuse",at: new Date(0),outcome: "DENIED" }],
      language: "en",
      kbVersion: "a".repeat(64),
      summary: null,
      identityOwnerRef: "00000000-0000-4000-8000-000000000001",
      email: "must-not-transfer@example.test",
      debateContent: secret
    });
    expect(Object.keys(projection).sort()).toEqual([
      "identity_owner_ref","kb_version","language","predicate","summary","tool_calls","transcript"
    ]);
    expect(JSON.stringify(projection)).not.toContain(secret);
    expect(JSON.stringify(projection)).not.toContain("must-not-transfer");
  });
});
