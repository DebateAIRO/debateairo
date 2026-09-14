import { describe,expect,it,vi } from "vitest";

import { createSupportAnswerService } from "../../apps/api/src/support/answer.js";
import {
  createHelpCorpusSnapshotLookup,type HelpCorpusEntry,type LoadedHelpCorpus
} from "../../packages/support-kb/src/index.js";
import type { SupportMessageCipherPort } from "../../apps/api/src/support/session.js";
import { createSupportModelReferenceFactory } from "../../apps/api/src/support/model-references.js";

const REFERENCE_REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const SOURCE_REFERENCE = "s-10000000000040008000000000000001-1";
const ACTION_REFERENCE = "a-10000000000040008000000000000001-1";
const modelReferenceFactory = () => createSupportModelReferenceFactory(REFERENCE_REQUEST_ID);

function entry(id: string,body: string): HelpCorpusEntry {
  return Object.freeze({
    id,lang: "en",title: "Crosscap article",status: "shipped",
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
  it("maps request-local model references to canonical response provenance", async () => {
    const snapshot = corpus([
      entry("getting-started-debate","create debate topic plan controls")
    ],"9".repeat(64));
    const sourceReference = "s-10000000000040008000000000000001-1";
    const actionReference = "a-10000000000040008000000000000001-1";
    let system = "";
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory: () => Object.freeze({
        referenceFor: (kind: "source" | "action") =>
          kind === "source" ? sourceReference : actionReference
      }),
      modelFor: () => Object.freeze({
        complete: async (input: Readonly<{ system: string }>) => {
          system = input.system;
          return Object.freeze({ text: JSON.stringify({
            kind: "answer",text: "Choose Start a debate to continue.",
            sourceIds: [sourceReference],actionIds: [actionReference]
          }) });
        }
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    } as never);

    const result = await service.respond({
      ...request(snapshot),text: "How do I create a debate?"
    });

    expect(result).toMatchObject({
      outcome: "ANSWER_GROUNDED",
      sources: [{ id: "getting-started-debate",label: "Crosscap article" }],
      actions: [{ id: "start-debate",label: "Start a debate",href: "/login?next=%2Fnew" }]
    });
    expect(system).toContain(sourceReference);
    expect(system).toContain(actionReference);
    for (const forbidden of ["getting-started-debate","start-debate","new-debate","/new","route="]) {
      expect(system).not.toContain(forbidden);
    }
  });

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
        sourceIds: [SOURCE_REFERENCE],actionIds: []
      }) });
    });
    const service = createSupportAnswerService({
      entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,modelReferenceFactory,
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
    expect(system).toContain("sourceIds=s-10000000000040008000000000000001-1,s-10000000000040008000000000000001-2,s-10000000000040008000000000000001-3");
    expect(system).toContain("actionIds=none");
    expect(system).toContain('{"kind":"answer","text":"<grounded answer>","sourceIds":["<allowed source reference>"],"actionIds":[]}');
  });

  it("filters unavailable actions before the model sees the output contract", async () => {
    const snapshot = corpus([entry("export-json","export JSON served answer ledger")],"d".repeat(64));
    let system = "";
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelFor: () => Object.freeze({
        complete: async (input: Readonly<{ system: string }>) => {
          system = input.system;
          return Object.freeze({ text: JSON.stringify({
            kind: "answer",text: "JSON export requires a served answer and readable ledger.",
            sourceIds: [SOURCE_REFERENCE],actionIds: []
          }) });
        }
      }) as never,modelReferenceFactory,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text: "How does JSON export work?",signedIn: false
    });

    expect(result.outcome).toBe("ANSWER_GROUNDED");
    expect(system).toContain("actionIds=none");
    expect(system).toContain("Never write source IDs, action IDs, capability IDs, routes, or paths inside text");
    expect(system).toContain("Owner debate workspace");
    expect(system).toContain("available only in verified owner context | actions=none");
    expect(system).not.toContain("owner-debate:");
    expect(system).not.toContain("route=");
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
        sourceIds: [SOURCE_REFERENCE],actionIds: []
      }) });
    });
    const service = createSupportAnswerService({
      entries: snapshotB.entries,
      snapshots: createHelpCorpusSnapshotLookup(snapshotB),messages,
      modelFor: () => Object.freeze({ complete }) as never,modelReferenceFactory,
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
      reportDraftDiagnostic,modelReferenceFactory,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: "```json\n{}\n```" })
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond(request(snapshot));

    expect(result.outcome).toBe("REFUSE_SAFETY");
    expect(reportDraftDiagnostic).toHaveBeenCalledOnce();
    expect(reportDraftDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      code: "JSON_INVALID",predicate: "JSON_SYNTAX",jsonValid: false,fenced: true,
      attemptId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
    }));
    expect(Object.keys(reportDraftDiagnostic.mock.calls[0]![0]).sort()).toEqual([
      "actionIdCount","allowedActionIdCount","allowedSourceIdCount","attemptId","code",
      "exactKeys","fenced","jsonValid","kindValid","predicate","sourceIdCount",
      "textCodePoints"
    ]);
    expect(JSON.stringify(reportDraftDiagnostic.mock.calls)).not.toContain("```json");
    expect(JSON.stringify(reportDraftDiagnostic.mock.calls)).not.toContain("selected-a");
  });

  it("rejects an internal identifier before canonical assistant storage", async () => {
    const snapshot = corpus([entry("selected-a","alpha crosscap selected-a-end")],"e".repeat(64));
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: JSON.stringify({
          kind: "answer",text: "Select start-debate to continue.",
          sourceIds: [SOURCE_REFERENCE],actionIds: []
        }) })
      }) as never,modelReferenceFactory,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond(request(snapshot));

    expect(result).toMatchObject({ outcome: "REFUSE_SAFETY",sources: [],actions: [] });
    expect(result.text).not.toContain("start-debate");
    expect(messages.write).toHaveBeenLastCalledWith(expect.objectContaining({
      role: "assistant",outcome: "REFUSE_SAFETY"
    }));
  });

  it("rejects a request alias in narrative text before canonical assistant storage", async () => {
    const snapshot = corpus([entry("selected-a","alpha crosscap selected marker")],"7".repeat(64));
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: JSON.stringify({
          kind: "answer",text: `Select ${SOURCE_REFERENCE} to continue.`,
          sourceIds: [SOURCE_REFERENCE],actionIds: []
        }) })
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond(request(snapshot));

    expect(result).toMatchObject({ outcome: "REFUSE_SAFETY",sources: [],actions: [] });
    expect(result.text).not.toContain(SOURCE_REFERENCE);
  });

  it("rejects a source reference issued for a prior request", async () => {
    const snapshot = corpus([entry("selected-a","alpha crosscap selected marker")],"8".repeat(64));
    const firstFactory = createSupportModelReferenceFactory(REFERENCE_REQUEST_ID);
    const secondFactory = createSupportModelReferenceFactory("20000000-0000-4000-8000-000000000002");
    const factories = [firstFactory,secondFactory];
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory: () => factories.shift()!,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: JSON.stringify({
          kind: "answer",text: "Selected snapshot answer.",
          sourceIds: [firstFactory.referenceFor("source",0)],actionIds: []
        }) })
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    await expect(service.respond(request(snapshot))).resolves.toMatchObject({
      outcome: "ANSWER_GROUNDED",sources: [{ id: "selected-a" }]
    });
    await expect(service.respond(request(snapshot))).resolves.toMatchObject({
      outcome: "REFUSE_SAFETY",sources: [],actions: []
    });
  });

  it("assigns distinct opaque identities to separate rejected model attempts", async () => {
    const snapshot = corpus([entry("selected-a","alpha crosscap selected-a-end")],"f".repeat(64));
    const reports: Array<Readonly<{ attemptId: string }>> = [];
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      reportDraftDiagnostic: (report) => { reports.push(report); },modelReferenceFactory,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: "not-json" })
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    await service.respond(request(snapshot));
    await service.respond(request(snapshot));

    expect(reports).toHaveLength(2);
    expect(new Set(reports.map(({ attemptId }) => attemptId)).size).toBe(2);
    expect(reports.every(({ attemptId }) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(attemptId)
    )).toBe(true);
  });
});
