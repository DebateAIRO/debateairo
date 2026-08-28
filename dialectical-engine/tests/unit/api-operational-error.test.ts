import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { apiOperationalErrorDiagnostic } from "../../apps/api/src/index.js";

describe("API operational error diagnostics", () => {
  it("retains bounded codes without retaining raw exception messages", () => {
    expect(apiOperationalErrorDiagnostic(Object.assign(new Error("secret SQL text"), { code: "42501" })))
      .toBe("DEPENDENCY_42501");
    expect(apiOperationalErrorDiagnostic(new TypeError("PROVIDER_PROBE_RESPONSE_INVALID")))
      .toBe("PROVIDER_PROBE_RESPONSE_INVALID");
    expect(apiOperationalErrorDiagnostic(new Error("private question text")))
      .toBe("ERROR");
  });

  it("records provider recovery through the narrow runtime capability", async () => {
    const [repository, migration] = await Promise.all([
      readFile("packages/db/src/index.ts", "utf8"),
      readFile("migrations/0048_provider_probe_capability.sql", "utf8")
    ]);
    expect(repository).toContain("SELECT core.record_provider_probe($1,$2,$3,$4,$5,$6,$7)");
    expect(repository).not.toMatch(/INSERT INTO core\.provider_probe/);
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION core.record_provider_probe");
    expect(migration).toContain("TO debateai_runtime");
  });
});
