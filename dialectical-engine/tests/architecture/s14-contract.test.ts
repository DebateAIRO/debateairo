import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { auditS14TypeGraph } from "../../tools/orphan-audit/src/index.js";

/** Names a module declares with `export type X` / `export interface X`. */
function exportedTypeNames(source: string): readonly string[] {
  return Object.freeze(
    [...source.matchAll(/^export (?:type|interface) ([A-Za-z_$][\w$]*)/gmu)].map((match) => match[1]!)
  );
}

/**
 * The V2-wire-mirror rule, as a function so it can be tested for FAILABILITY
 * rather than trusted: every type name the UI re-declares that the shared
 * contract already owns. A UI-only shape returns nothing.
 */
export function redeclaredContractTypes(
  contractSources: readonly string[],
  uiTypeSource: string
): readonly string[] {
  const owned = new Set(contractSources.flatMap((source) => exportedTypeNames(source)));
  return Object.freeze(exportedTypeNames(uiTypeSource).filter((name) => owned.has(name)).sort());
}

describe("S14 / AC-59..61 / W19 — native UI contract", () => {
  it("uses the generated contract client for both browser and SSR with no V2 wire mirror", async () => {
    const [browser, server, types, contractIndex, contractClient] = await Promise.all([
      readFile(new URL("../../apps/ui/lib/api.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/lib/serverApi.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/lib/types.ts", import.meta.url), "utf8"),
      readFile(new URL("../../packages/contract/src/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../packages/contract/src/client.ts", import.meta.url), "utf8")
    ]);
    expect(browser).toContain("createContractClient");
    expect(server).toContain("createContractClient");

    // V RULED 2026-09-20 — this rule is AMENDED, not relaxed.
    //
    // It used to demand `expect(types).toContain("@debateai/contract")` and
    // `expect(types).not.toContain("export type DebateDetail")`. Neither is
    // honestly satisfiable. The shared contract has no `DebateDetail` at all,
    // and the UI's shape carries screen-side fields the wire never had —
    // branch lineage, analyzer runs, agent outputs, provenance, lifecycle
    // decisions. `apps/ui/lib/v3/adapter.ts` exists precisely BECAUSE the two
    // shapes differ. Satisfying the old wording would mean pushing
    // screen-shaped types into the wire contract, which is worse, or moving a
    // declaration so a text search stops finding it, which is cheating.
    //
    // What the rule was protecting is unchanged and is now asserted directly:
    // the UI must never silently RE-DECLARE a type the shared contract already
    // owns, because two declarations of one wire shape drift apart and that is
    // what "V2 wire mirror" meant. A UI-only shape with no contract equivalent
    // is permitted — that is the part the old wording got wrong. The rule's
    // own failability is pinned by the sibling test below, so it cannot rot
    // into a tautology the way a text search can.
    expect(redeclaredContractTypes([contractIndex, contractClient], types)).toEqual([]);
    expect(types).not.toContain("ScoringRefreshState");
  });

  // The amended rule must be able to FAIL. A rule that only ever sees a clean
  // tree proves nothing about the tree; this pins that a genuine re-declaration
  // of a contract-owned type is reported, and that a UI-only shape is not.
  it("reports a UI re-declaration of a contract-owned type and stays silent on a UI-only shape", () => {
    const contract = "export type PublicDebate = { id: string };\nexport type Answer = { text: string };\n";
    expect(redeclaredContractTypes([contract], "export type PublicDebate = { id: string; drawerOpen: boolean };\n"))
      .toEqual(["PublicDebate"]);
    expect(redeclaredContractTypes([contract], "export interface Answer { text: string }\n"))
      .toEqual(["Answer"]);
    expect(redeclaredContractTypes([contract], "export type DebateDetail = { branches: string[] };\n"))
      .toEqual([]);
  });

  it("routes browser contract traffic through the V3 same-origin API boundary", async () => {
    const [browser, server, route, localEnv] = await Promise.all([
      readFile(new URL("../../apps/ui/lib/api.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/lib/serverApi.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/app/api/[...path]/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/.env.local", import.meta.url), "utf8")
    ]);
    expect(browser).toContain('"/api"');
    expect(server).toContain("DIALECTICAL_API_BASE");
    expect(route).toContain("DIALECTICAL_API_BASE_REQUIRED");
    expect(route).toContain("response.body");
    expect(localEnv).toContain("NEXT_PUBLIC_API_BASE=/api");
  });

  it("FX-ORPH-04 pins the generated contract version and the closed event vocabulary's consumers", async () => {
    // The two-direction WEB-consumer walk and the death-list sweep retired with
    // their subject: `web/` is retired in favour of apps/ui
    // (.hermes/reports/2026-09-01-algorithm-live-loop/PROGRESS.md:32,
    // DECISIONS.md:810), and apps/ui ships no equivalent of
    // web/lib/v3Presentation.ts, so those three assertions are not re-pointed by
    // analogy. The contract-derived half of FX-ORPH-04 is unchanged.
    const report = await auditS14TypeGraph();
    expect(report.contractVersion).toBe("v1");
    expect(report.eventsWithoutConsumer).toEqual([]);
  });

  it("carries the S04 orphan-audit wording fix and deterministic locale tiebreak", async () => {
    const [audit, recommendation, register] = await Promise.all([
      readFile(new URL("../../tools/orphan-audit/src/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/lib/recommendation.ts", import.meta.url), "utf8"),
      readFile(new URL("../../packages/register/src/index.ts", import.meta.url), "utf8")
    ]);
    expect(audit).not.toContain("measureDispersion surface records typed absence");
    expect(recommendation).not.toContain("localeCompare");
    expect(register).not.toContain("localeCompare");
  });

  it("W7 removes the obsolete source-text test corpus and W16 persists verbatim steering", async () => {
    // The UI half of this contract was written against web/app/new
    // (NewQuestionForm.tsx + lib/serverAskDefaults.ts). That app was removed;
    // apps/ui composes /new through app/new/defaults.tsx instead, so the
    // machine-owned as_of is asserted there.
    const [migration, api, askDefaults] = await Promise.all([
      readFile(new URL("../../migrations/0017_s14.sql", import.meta.url), "utf8"),
      readFile(new URL("../../apps/api/src/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/app/new/defaults.tsx", import.meta.url), "utf8")
    ]);
    expect(migration).toContain("ask_contract");
    expect(api).toContain("steering_annotations: ask.steering_annotations");
    // DEV-SYNC (D23 ADDENDUM-2): T2/S1-2 pinned the retired steering placebo with
    // `expect(askForm).not.toContain("logged verbatim")` against
    // web/app/new/NewQuestionForm.tsx. That file is deleted on this branch, so the
    // assertion retires with its surface — but the property did NOT retire with it.
    // The UI overhaul had rebuilt the same control on apps/ui; V ruled it out a
    // second time on 2026-09-03 and it is now removed there too. The behavioural
    // pin lives with the surviving form, in
    // tests/render/ux01-new-debate-form.test.tsx, which is where to look before
    // adding a steering box. The assertion above still holds W16's half: the API
    // persists steering verbatim, because the CONTRACT FIELDS stay.
    expect(askDefaults).toContain("as_of: asOf.toISOString()");
  });
});
