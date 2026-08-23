import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { auditS14TypeGraph } from "../../tools/orphan-audit/src/index.js";

describe("S14 / AC-59..61 / W19 — native UI contract", () => {
  it("uses the generated contract client for both browser and SSR with no V2 wire mirror", async () => {
    const [browser, server, types] = await Promise.all([
      readFile(new URL("../../web/lib/api.ts", import.meta.url), "utf8"),
      readFile(new URL("../../web/lib/serverApi.ts", import.meta.url), "utf8"),
      readFile(new URL("../../web/lib/types.ts", import.meta.url), "utf8")
    ]);
    expect(browser).toContain("createContractClient");
    expect(server).toContain("createContractClient");
    expect(types).toContain("@debateai/contract");
    expect(types).not.toContain("export type DebateDetail");
    expect(types).not.toContain("ScoringRefreshState");
  });

  it("routes browser contract traffic through the V3 same-origin API boundary", async () => {
    const [browser, server, route, localEnv] = await Promise.all([
      readFile(new URL("../../web/lib/api.ts", import.meta.url), "utf8"),
      readFile(new URL("../../web/lib/serverApi.ts", import.meta.url), "utf8"),
      readFile(new URL("../../web/app/api/[...path]/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../web/.env.local", import.meta.url), "utf8")
    ]);
    expect(browser).toContain('"/api"');
    expect(server).toContain("DIALECTICAL_API_BASE");
    expect(route).toContain("DIALECTICAL_API_BASE_REQUIRED");
    expect(route).toContain("response.body");
    expect(localEnv).toContain("NEXT_PUBLIC_API_BASE=/api");
  });

  it("FX-ORPH-04 walks web consumers in both directions and rejects the death-list inventory", async () => {
    const report = await auditS14TypeGraph();
    expect(report.contractVersion).toBe("v1");
    expect(report.servedWithoutConsumer).toEqual([]);
    expect(report.consumedWithoutServed).toEqual([]);
    expect(report.eventsWithoutConsumer).toEqual([]);
    expect(report.deathListReachable).toEqual([]);
  });

  it("carries the S04 orphan-audit wording fix and deterministic locale tiebreak", async () => {
    const [audit, recommendation, register] = await Promise.all([
      readFile(new URL("../../tools/orphan-audit/src/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../web/lib/recommendation.ts", import.meta.url), "utf8"),
      readFile(new URL("../../packages/register/src/index.ts", import.meta.url), "utf8")
    ]);
    expect(audit).not.toContain("measureDispersion surface records typed absence");
    expect(recommendation).not.toContain("localeCompare");
    expect(register).not.toContain("localeCompare");
  });

  it("W7 removes the obsolete source-text test corpus and W16 persists verbatim steering", async () => {
    const [migration, api, askPage, askForm, serverDefaults] = await Promise.all([
      readFile(new URL("../../migrations/0017_s14.sql", import.meta.url), "utf8"),
      readFile(new URL("../../apps/api/src/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../web/app/new/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../web/app/new/NewQuestionForm.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../web/lib/serverAskDefaults.ts", import.meta.url), "utf8")
    ]);
    expect(migration).toContain("ask_contract");
    expect(api).toContain("steering_annotations: ask.steering_annotations");
    expect(askForm).toContain("logged verbatim");
    expect(askPage).toContain('dynamic = "force-dynamic"');
    expect(askPage).toContain("deriveMachineAskAsOf()");
    expect(serverDefaults).toContain('import "server-only"');
    expect(askForm).toContain("as_of: machineAsOf");
    expect(askForm).not.toMatch(/\b(?:new\s+Date|Date\.now)\b/);
  });
});
