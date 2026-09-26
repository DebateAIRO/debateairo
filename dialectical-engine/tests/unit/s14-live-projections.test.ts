/**
 * The live-subject half of the retired `tests/unit/s14-ui.test.ts`.
 *
 * That suite imported `web/lib/v3Presentation.js` and `web/lib/api.js`, so it
 * had been a suite-load failure on every merge parent (LEDGER.md:487) and was
 * deleted with the rest of the `web/` surface (PROGRESS.md:32,
 * DECISIONS.md:810). Most of its assertions retired with that surface — but
 * these did not: their SUBJECTS are live, unchanged modules
 * (`@debateai/serve`, `@debateai/contract`, `@debateai/kernel`, and the shipped
 * apps/ui renderer at `apps/ui/lib/v3/labels.ts`). They are re-homed here
 * VERBATIM — same assertions, same fixtures, same titles — not ported by
 * analogy. Their only edit is the removal of the retired `web/` renderer from
 * the condition-mark arm, which now reads the one shipped renderer.
 *
 * Dropped rather than re-homed, because their subjects are the retired
 * `web/lib/*` modules and apps/ui ships no equivalent: `projectAnswerSurface`,
 * `summarizeFreshness` (and its FX-PT-D4 fuzz), `applyRunEvent` /
 * `createEmptyLiveAnswerState`, and `createBrowserContractClient`.
 */
import { describe, expect, it } from "vitest";
import { ABSTENTION_KINDS, CONDITION_MARKS } from "@debateai/kernel";
import {
  ContractHttpError,
  createContractClient,
  type RunEvent
} from "@debateai/contract";
import { projectNodeMakerLineage, projectServeEdge } from "@debateai/serve";
import { abstentionKindLabel, conditionMarkLabel } from "../../apps/ui/lib/v3/labels.js";

describe("S14 / W20 / W8-W15 — typed UI projections", () => {
  it("has a renderer for every ruled condition mark — including DR-161's unserved-maker disclosure", () => {
    // J13(b) 29 -> 31: PANEL-PARTIAL and PANEL-DEGRADED-SINGLE-VOICE joined the
    // J13(b) 29 -> 31, T7 31 -> 32 (BRANCH-FROZEN-LOW-LEVERAGE), T11 32 -> 33
    // (LABEL-BASIS-INCOMPLETE), T9 33 -> 37 (SYNTHESIS-OBJECTION-STANDING,
    // DIGEST-COMPRESSED, DIGEST-CANNOT-EXIST, PROTECTED-CORE-GUARD-RETIRED).
    // MERGE T9B: lane/s07 pinned 36 (32 + T9's four) and integration 19bbb4c4
    // pinned 33 (32 + T7's one); BOTH mints survive the merge, so the exact
    // count at this tree is 37 — counted from the shipped array, not summed
    // from these comments. Every new mark was minted MID-LIST, so the DR-176
    // positional tail `CONDITION_MARKS.slice(-4)` is unchanged.
    expect(CONDITION_MARKS).toHaveLength(37);
    expect(CONDITION_MARKS).toContain("OWED-CHECK-UNEXECUTED");
    expect(CONDITION_MARKS).toContain("UNSERVED-MAKER-POSITION");
    // The retired `web/lib/v3Presentation` renderer and its label-text pin left
    // with their module; the shipped apps/ui renderer carries the property.
    const labels = CONDITION_MARKS.map((mark) => conditionMarkLabel(mark));
    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(CONDITION_MARKS.length);
  });

  it("has a renderer for every one of spec section 12.3's five abstention kinds", () => {
    expect(ABSTENTION_KINDS.map((kind) => abstentionKindLabel(kind))
      .every((label) => label.trim().length > 0)).toBe(true);
  });
});

describe("S14 / W10 — first-class graph edges", () => {
  it("projects measured arrows with labeled replayable strength and unknown arrows without a number", () => {
    const base = {
      edgeId: "edge:test", sourceNodeId: "node:child", sourceChildKind: "support",
      targetKind: "NODE" as const, targetRef: "node:parent", polarity: "support" as const,
      strengthSource: "REVIEWER", provenanceRef: "provenance:edge"
    };
    expect(projectServeEdge({ ...base, magnitudeStatus: "MEASURED", strength: 0.6 }).strength).toMatchObject({
      status: "PRESENT", number: { value: 0.6, source: "REVIEWER", replay_handle: "provenance:edge" }
    });
    expect(projectServeEdge({ ...base, magnitudeStatus: "UNKNOWN", strength: null }).strength).toEqual({
      status: "UNKNOWN", reason: "NO_JUDGEMENT_OR_MAGNITUDE"
    });
  });
});

describe("UI-02b — recorded per-node maker lineage", () => {
  it("relays a complete ledger identity exactly and maps an unresolved join to typed absence", () => {
    const recorded = {
      maker: "maker:test-layer",
      model_id: "model:test-layer",
      model_version: null,
      provider: "provider-kind:test-layer",
      provider_ref: "provider:test-layer"
    };
    expect(projectNodeMakerLineage(recorded)).toEqual({
      maker: "maker:test-layer",
      model_id: "model:test-layer",
      transport: "provider-kind:test-layer",
      provider_ref: "provider:test-layer"
    });
    expect(projectNodeMakerLineage({ ...recorded, maker: null })).toBeNull();
    expect(projectNodeMakerLineage({ ...recorded, model_id: null })).toBeNull();
    expect(projectNodeMakerLineage({ ...recorded, provider: null })).toBeNull();
    expect(projectNodeMakerLineage({ ...recorded, provider_ref: null })).toBeNull();
  });
});

describe("S14 / W4 / FX-LG-13 — generated client error taxonomy", () => {
  it("branches on typed 429 rather than response prose", async () => {
    const client = createContractClient("https://api.example.test", async () => new Response("arbitrary prose", { status: 429 }));
    const request = client.readAnswer("answer:test");
    await expect(request).rejects.toBeInstanceOf(ContractHttpError);
    await expect(request).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("FX-WIRE-01 rejects tier-2 raw_text at the wire", async () => {
    const client = createContractClient("https://api.example.test", async () => new Response(JSON.stringify({
      answer_id: "answer:test",
      answer_version: 1,
      conformance: { outcome: "NOT_RUN", coverage_mode: "NOT_RUN", segment_results: [] },
      segment_suppressions: [],
      shadow_suppressions: [],
      raw_text: "must not cross the inspection boundary"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(client.readInspection("answer:test")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("parses SSE incrementally through the generated client", async () => {
    const first = JSON.stringify({ event_id: "1", event_type: "run.accepted", run_ref: "run:test", at_sequence: 1, payload: {} });
    const second = JSON.stringify({ event_id: "2", event_type: "run.running", run_ref: "run:test", at_sequence: 2, payload: {} });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${first}\n\nda`));
        controller.enqueue(new TextEncoder().encode(`ta: ${second}\n\n`));
        controller.close();
      }
    });
    const client = createContractClient("https://api.example.test", async () => new Response(body, { status: 200 }));
    const observed: RunEvent[] = [];
    await client.streamEvents("run:test", (event) => observed.push(event));
    expect(observed.map((event) => event.event_type)).toEqual(["run.accepted", "run.running"]);
  });
});
