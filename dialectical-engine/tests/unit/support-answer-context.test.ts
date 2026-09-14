import { describe,expect,it,vi } from "vitest";

import { createSupportAnswerService } from "../../apps/api/src/support/answer.js";
import {
  createHelpCorpusSnapshotLookup,type HelpCorpusEntry,type LoadedHelpCorpus
} from "../../packages/support-kb/src/index.js";
import type { SupportMessageCipherPort } from "../../apps/api/src/support/session.js";

function entry(id: string,body: string): HelpCorpusEntry {
  return Object.freeze({
    id,lang: "en",title: `Crosscap ${id}`,status: "shipped",
    sources: Object.freeze(["fixture"]),verifiedAgainst: "fixture",
    ratifiedBy: "V",ratifiedOn: "2026-09-01",body
  });
}

function corpus(entries: readonly HelpCorpusEntry[],kbVersion: string): LoadedHelpCorpus {
  return Object.freeze({ entries: Object.freeze([...entries]),kbVersion }) as LoadedHelpCorpus;
}

const messages = Object.freeze({
  write: vi.fn(async (input) => Object.freeze({ ...input,redacted: false })),
  writeAndTransit: vi.fn(async (input,transit) => {
    await transit(input.text);
    return Object.freeze({ ...input,redacted: false });
  }),read: vi.fn(async () => null),listSession: vi.fn(async () => [])
}) as unknown as SupportMessageCipherPort;

function request(snapshot: LoadedHelpCorpus) {
  return {
    sessionId: "10000000-0000-4000-8000-000000000001",
    text: "crosscap alpha beta gamma",
    language: "en" as const,detectedLanguage: "en" as const,overrideLanguage: null,
    modelRef: "support-fixture",kbVersion: snapshot.kbVersion,snapshot,signedIn: false,
    receivedAt: new Date("2026-09-14T10:00:00.000Z")
  };
}

describe("CP1 composed answer context", () => {
  it("keeps matching whole reviewed sections above 12,000 and below the 24,000 system cap", async () => {
    const entries = [
      entry("crosscap-alpha",`alpha crosscap ${"a".repeat(4_000)} alpha-end-marker`),
      entry("crosscap-beta",`beta crosscap ${"b".repeat(4_000)} beta-end-marker`),
      entry("crosscap-gamma",`gamma crosscap ${"c".repeat(4_000)} gamma-end-marker`)
    ];
    const snapshot = corpus(entries,"a".repeat(64));
    let system = "";
    const complete = vi.fn(async (input: Readonly<{ system: string }>) => {
      system = input.system;
      return Object.freeze({ text: JSON.stringify({
        kind: "answer",text: "The reviewed sections describe the requested feature.",
        sourceIds: ["crosscap-alpha"],actionIds: []
      }) });
    });
    const service = createSupportAnswerService({
      entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelFor: () => Object.freeze({ complete }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    await service.respond(request(snapshot));

    expect([...system].length).toBeGreaterThan(12_000);
    expect([...system].length).toBeLessThanOrEqual(24_000);
    expect(system).toContain("alpha-end-marker");
    expect(system).toContain("beta-end-marker");
    expect(system).toContain("gamma-end-marker");
    expect(system).toContain("The final OUTPUT CONTRACT lists the only allowed sourceIds and actionIds");
    expect(system).toContain("sourceIds=crosscap-alpha,crosscap-beta,crosscap-gamma");
    expect(system).toContain("actionIds=none");
  });

  it("uses the exact immutable snapshot object already resolved by the route", async () => {
    const selected = entry("selected-a","alpha crosscap selected-a-end");
    const stale = entry("stale-b","alpha crosscap stale-b-end");
    const snapshotA = corpus([selected],"a".repeat(64));
    const snapshotB = corpus([stale],"b".repeat(64));
    let system = "";
    const complete = vi.fn(async (input: Readonly<{ system: string }>) => {
      system = input.system;
      return Object.freeze({ text: JSON.stringify({
        kind: "answer",text: "Selected snapshot answer.",
        sourceIds: ["selected-a"],actionIds: []
      }) });
    });
    const service = createSupportAnswerService({
      entries: snapshotB.entries,
      snapshots: createHelpCorpusSnapshotLookup(snapshotB),messages,
      modelFor: () => Object.freeze({ complete }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshotA),kbVersion: snapshotB.kbVersion
    });

    expect(result.outcome).toBe("ANSWER_GROUNDED");
    expect(system).toContain("selected-a-end");
    expect(system).not.toContain("stale-b-end");
  });

  it("reports only the closed diagnostic shape for a rejected completion", async () => {
    const snapshot = corpus([entry("selected-a","alpha crosscap selected-a-end")],"c".repeat(64));
    const reportDraftDiagnostic = vi.fn();
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      reportDraftDiagnostic,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: "```json\n{}\n```" })
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond(request(snapshot));

    expect(result.outcome).toBe("REFUSE_SAFETY");
    expect(reportDraftDiagnostic).toHaveBeenCalledOnce();
    expect(reportDraftDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      code: "JSON_INVALID",jsonValid: false,fenced: true
    }));
    expect(JSON.stringify(reportDraftDiagnostic.mock.calls)).not.toContain("```json");
  });
});
