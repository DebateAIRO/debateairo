import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function repositorySource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

describe("EXEC-01 crash-path disclosure", () => {
  it("declares the surviving process-death stall instead of claiming unqualified stall freedom", () => {
    const scheduler = repositorySource("apps/scheduler/src/index.ts");
    const acceptanceMain = repositorySource("acceptance/main.ts");
    const handoff = repositorySource(
      "docs/missions/2026-08-06-v3-programming/handoffs/EXEC-01-codex-handoff.md"
    );

    // Exact shipped crash mechanism: the scheduler is still a scaffold and
    // the acceptance harness starts no claimNext/reaper loop after dispatch.
    expect(scheduler).toContain("S00_SCAFFOLD_ONLY");
    expect(acceptanceMain).not.toContain("claimNext(");

    expect(handoff).toContain(
      "PROCESS_DEATH_STALL: if the acceptance process dies after claiming work, the item remains CLAIMED after its deadline and the UI waits indefinitely because this harness starts no scheduler/reaper that calls claimNext."
    );
    expect(handoff).toContain(
      "Close this deferral by shipping and starting a scheduler/reaper that reclaims expired claims; that lifecycle work is outside EXEC-01."
    );
    expect(handoff).not.toContain("until normal expiry/recovery");
  });
});
