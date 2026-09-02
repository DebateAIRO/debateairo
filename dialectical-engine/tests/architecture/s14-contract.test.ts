import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("S14 / AC-59..61 / W19 — native UI contract", () => {
  it("uses the generated contract client for both browser and SSR with no V2 wire mirror", async () => {
    const [browser, server, types, adapter] = await Promise.all([
      readFile(new URL("../../apps/ui/lib/api.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/lib/serverApi.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/lib/types.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/lib/v3/adapter.ts", import.meta.url), "utf8")
    ]);
    expect(browser).toContain("createContractClient");
    expect(server).toContain("createContractClient");
    // pin updated 2026-09-02: apps/ui keeps its V2 presentation types (DebateDetail included) in lib/types.ts and feeds them from the contract through lib/v3/adapter.ts (UI-01 / DR-145); the web/lib/types.ts that re-exported the contract was removed with web/ (dev drift, see docs/missions/2026-09-01-security-hardening/VERIFICATION.md)
    expect(adapter).toContain("@debateai/contract");
    expect(types).not.toContain("ScoringRefreshState");
  });

  it("routes browser contract traffic through the V3 same-origin API boundary", async () => {
    const [browser, server, route, localEnv] = await Promise.all([
      readFile(new URL("../../apps/ui/lib/api.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/lib/serverApi.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/app/api/[...path]/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/.env.local.example", import.meta.url), "utf8")
    ]);
    expect(browser).toContain('"/api"');
    expect(server).toContain("DIALECTICAL_API_BASE");
    expect(route).toContain("DIALECTICAL_API_BASE_REQUIRED");
    expect(route).toContain("response.body");
    expect(localEnv).toContain("NEXT_PUBLIC_API_BASE=/api");
  });

  // FX-ORPH-04 ("walks web consumers in both directions and rejects the
  // death-list inventory") retired 2026-09-02: auditS14TypeGraph reads
  // web/lib/v3Presentation.ts and walks web/, and that app was removed (dev
  // drift, see docs/missions/2026-09-01-security-hardening/VERIFICATION.md).
  // Porting the type-graph walk to apps/ui/lib/v3 is a follow-up, not a pin.

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
    expect(askDefaults).toContain("as_of: asOf.toISOString()");
  });
});
