import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function missionLog(name: string): string {
  return readFileSync(fileURLToPath(new URL(
    `../../docs/missions/2026-08-17-accounts-privacy-security/logs/${name}`,
    import.meta.url
  )), "utf8");
}

describe("S10 evidence honesty", () => {
  it("scopes the evidence artifact to technical outcomes and names every ruled residual", () => {
    const evidence = missionLog("S10-erasure-evidence-artifact.md");
    for (const required of [
      "CLEANED_WITH_LEGACY_RESIDUAL",
      "T6",
      "NOT VALID",
      "source-IP",
      "event-local C4",
      "xmin",
      "provider-retained",
      "WAL",
      "PITR",
      "backup",
      "RAM",
      "swap",
      "core dump",
      "retired pseudonym",
      "no anonymity claim",
      "no legal conclusion"
    ]) expect(evidence).toContain(required);
    expect(evidence).toContain("published snapshots remain readable");
    expect(evidence).toContain("mixed public and claimed legacy plaintext");
    expect(evidence).not.toMatch(/GDPR[- ]compliant|guarantees compliance|all personal data is gone/i);
  });

  it("documents a fail-closed, reproducible operational ceremony without an admin bypass", () => {
    const runbook = missionLog("S10-erasure-runbook.md");
    expect(runbook).toContain("ACCOUNT_ERASURE_GRACE_MS=604800000");
    expect(runbook).toContain("DELETE MY ACCOUNT");
    expect(runbook).toContain("email or recovery_email");
    expect(runbook).toContain("CLEANED_WITH_LEGACY_RESIDUAL");
    expect(runbook).toContain("notification ACK");
    expect(runbook).toContain("no Phase-1 operator/DSAR deletion route");
    expect(runbook).toContain("Do not manually delete");
  });

  it("maps each security claim to a destructive mutant and restored guard", () => {
    const matrix = missionLog("S10-vr10-mutation-matrix.md");
    expect(matrix).toContain("Expected RED");
    expect(matrix).toContain("Restoration gate");
    for (const mutant of [
      "calendar `7 days`",
      "vacuous notification fan-out",
      "current erasure ID instead of user-wide",
      "remove the notification custody lease",
      "runtime chosen attestation secret",
      "tuple-first lock",
      "v1 QBI",
      "plaintext parse error",
      "nested lease scope expansion",
      "unrestricted private provider gateway",
      "stable publication source digest",
      "legacy/public owner"
    ]) expect(matrix).toContain(mutant);
  });
});
