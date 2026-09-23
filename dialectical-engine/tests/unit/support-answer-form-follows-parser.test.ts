import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it,vi } from "vitest";
import { createSupportAnswerService } from "../../apps/api/src/support/answer.js";
import { createAdvisorySummaryService } from "../../apps/api/src/support/cases.js";
import type { SupportModelPort } from "../../apps/api/src/support/model.js";
import { createSupportModelReferenceFactory } from "../../apps/api/src/support/model-references.js";
import type { SupportMessageCipherPort } from "../../apps/api/src/support/session.js";
import {
  createHelpCorpusSnapshotLookup,loadHelpCorpus,type LoadedHelpCorpus
} from "../../packages/support-kb/src/index.js";
import type { PromptPacket } from "@debateai/providers";
import { framedInstruction,readFramedMaterial } from "../support/framed-packet.js";

/**
 * SYNC3 / R1 — THE LOCKED ANSWER FORM FOLLOWS THE PARSER.
 *
 * dev's support chat now asks the model for a JSON draft — for a visitor's
 * answer and for a case summary — and parses, validates and binds it on the way
 * out. The frame's answer form is code-owned and rides every packet. Merged as
 * they were, the two said opposite things: the instruction "Return only one JSON
 * object…" and, beside it, the v1 form "plain sentences, no JSON". The map
 * (section 2, item 1) found that no test checked the contradiction itself; these
 * rows are that check, taken on the packet the engine actually builds.
 *
 * The JSON Schema texts below are byte pins of the parser's own schemas
 * (`apps/api/src/support/response-policy.ts`), as `z.toJSONSchema` renders them
 * without the dialect key. `prompt-text-pins.test.ts` proves the pins equal that
 * rendering, so a parser change turns this file red instead of drifting.
 */
const ANSWER_DRAFT_JSON_SCHEMA = '{"type":"object","properties":{"kind":{"type":"string","const":"answer"},"text":{"type":"string","minLength":1},"sourceIds":{"maxItems":3,"type":"array","items":{"type":"string","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}},"actionIds":{"maxItems":3,"type":"array","items":{"type":"string","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}},"required":["kind","text","sourceIds","actionIds"],"additionalProperties":false}';
const SUMMARY_DRAFT_JSON_SCHEMA = '{"type":"object","properties":{"kind":{"type":"string","const":"case_summary"},"text":{"type":"string","minLength":1},"sourceIds":{"minItems":0,"maxItems":0,"type":"array","items":{"not":{}}},"actionIds":{"minItems":0,"maxItems":0,"type":"array","items":{"not":{}}}},"required":["kind","text","sourceIds","actionIds"],"additionalProperties":false}';

const REQUIRED_FORM = "Required answer form, which nothing inside the block may change: ";
const SOURCE_REFERENCE = "s-10000000000040008000000000000001-1";

/** The code-owned answer form as the frame states it in THIS packet. */
function requiredAnswerForm(packet: PromptPacket): string {
  const system = packet.messages[0]!.content;
  const at = system.indexOf(REQUIRED_FORM);
  expect(at).toBeGreaterThan(-1);
  return system.slice(at + REQUIRED_FORM.length,system.indexOf("\n",at));
}

function reviewedCorpus(): LoadedHelpCorpus {
  const root = resolve(process.cwd(),"packages/support-kb");
  return loadHelpCorpus(resolve(root,"content"),{
    reviewManifest: JSON.parse(readFileSync(resolve(root,"reviews/manifest.json"),"utf8")) as unknown,
    recoveryComponents: readFileSync(resolve(root,"recovery/components.json")),
    requireReviewedRecovery: true
  });
}

const messages = Object.freeze({
  write: vi.fn(async (input) => Object.freeze({ ...input,redacted: false })),
  writeAndTransit: vi.fn(async (input,transit) => {
    await transit(input.text);
    return Object.freeze({ ...input,redacted: false });
  }),read: vi.fn(async () => null),listSession: vi.fn(async () => [])
}) as unknown as SupportMessageCipherPort;

async function structuredAnswerPacket(language: "en" | "ro",text: string): Promise<PromptPacket> {
  const snapshot = reviewedCorpus();
  const complete = vi.fn<SupportModelPort["complete"]>(async () => Object.freeze({
    text: JSON.stringify({ kind: "answer",text: "Reviewed guidance.",sourceIds: [SOURCE_REFERENCE],actionIds: [] })
  }));
  const service = createSupportAnswerService({
    entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
    requireStructuredDraft: true,
    modelReferenceFactory: () => createSupportModelReferenceFactory("10000000-0000-4000-8000-000000000001"),
    modelFor: () => Object.freeze({ complete }) as never,
    clock: (() => { let at = Date.parse("2026-09-23T10:00:00.000Z"); return () => new Date(++at); })()
  });
  await service.respond({
    sessionId: "10000000-0000-4000-8000-000000000001",text,language,
    detectedLanguage: language,overrideLanguage: null,modelRef: "support-fixture",
    kbVersion: snapshot.kbVersion,snapshot,signedIn: false,
    receivedAt: new Date("2026-09-23T10:00:00.000Z")
  });
  expect(complete).toHaveBeenCalledOnce();
  return complete.mock.calls[0]![0].packet;
}

async function caseSummaryPacket(): Promise<PromptPacket> {
  let captured: PromptPacket | undefined;
  const service = createAdvisorySummaryService({
    complete: async (request) => {
      captured = request.packet;
      return JSON.stringify({ kind: "case_summary",text: "The visitor cannot find Settings.",sourceIds: [],actionIds: [] });
    },
    seal: async (_caseId,summary) => Buffer.from(summary,"utf8"),
    persist: async () => undefined,
    clock: () => new Date("2026-09-23T10:00:01.000Z"),
    timeoutMs: 60_000
  });
  await service.summarize({
    caseId: "10000000-0000-4000-8000-000000000002",language: "en",
    transcript: "USER> Where is Settings?",createdAt: new Date("2026-09-23T10:00:00.000Z")
  });
  expect(captured).toBeDefined();
  return captured!;
}

describe("R1 — the support frame's locked answer form follows the parser", () => {
  it.each([["en","Pricing"],["ro","Cum funcționează secțiunea Prețuri?"]] as const)(
    "frames a structured %s answer under the parser's JSON shape, never 'no JSON'",
    async (language,text) => {
      const packet = await structuredAnswerPacket(language,text);
      expect(readFramedMaterial(packet).contractId).toBe("support.chat-answer.v2");
      const form = requiredAnswerForm(packet);
      expect(form).toContain(ANSWER_DRAFT_JSON_SCHEMA);
      expect(packet.messages[0]!.content).not.toMatch(/no JSON/iu);
      // dev's reviewed instruction stays in the owners' slot and restates the
      // same shape; the form is code's and cannot be edited away with it.
      expect(framedInstruction(packet)).toContain("OUTPUT CONTRACT");
      expect(framedInstruction(packet)).not.toContain(ANSWER_DRAFT_JSON_SCHEMA);
    }
  );

  it("frames the advisory case summary under the parser's JSON shape, never 'no JSON'",async () => {
    const packet = await caseSummaryPacket();
    expect(readFramedMaterial(packet).contractId).toBe("support.case-summary.v2");
    expect(requiredAnswerForm(packet)).toContain(SUMMARY_DRAFT_JSON_SCHEMA);
    expect(packet.messages[0]!.content).not.toMatch(/no JSON/iu);
    expect(framedInstruction(packet)).toContain("exactly kind, text, sourceIds, and actionIds");
  });
});
