import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "../../packages/kernel/src/index.js";
import { apiOperationalErrorDiagnostic } from "../../apps/api/src/index.js";

// Synthetic sensitive content. None of these is a real credential; each is shaped
// like a value that the removed rules would have emitted verbatim.
const FAKE_TOKEN = "AKIAIOSFODNN7EXAMPLE";
const FAKE_DIGEST = "DEADBEEFCAFEBABE0123456789ABCDEF";
const SQL_FRAGMENT = "SELECT_PASSWORD_HASH_FROM_IDENTITY_USER";
const FILE_PATH = "/var/run/secrets/dialectical-api.key";

const ALPHABET_BEGIN = "// ─── BEGIN OPERATIONAL DIAGNOSTIC ALPHABET";
const ALPHABET_END = "// ─── END OPERATIONAL DIAGNOSTIC ALPHABET";

function diagnosticAlphabetBlock(source: string): string {
  const start = source.indexOf(ALPHABET_BEGIN);
  const end = source.indexOf(ALPHABET_END);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + ALPHABET_END.length);
}

function declaredList(block: string, name: string): readonly string[] {
  const declaration = block.slice(block.indexOf(`const ${name}`));
  const body = declaration.slice(declaration.indexOf("["), declaration.indexOf("]);"));
  return Object.freeze([...body.matchAll(/"([A-Z][A-Z0-9_]*)"/gu)].map((match) => match[1]!));
}

describe("API operational error diagnostics", () => {
  it("retains bounded codes without retaining raw exception messages", () => {
    // CHANGED (F-DIAG-OPERATIONAL-REGEX): was `DEPENDENCY_42501`. `DEPENDENCY_${code}`
    // forwarded the five-character code the SERVER chose; the code rule is now an
    // allow-list keyed by the published SQLSTATE class.
    expect(apiOperationalErrorDiagnostic(Object.assign(new Error("secret SQL text"), { code: "42501" })))
      .toBe("DEPENDENCY_SQL_42_ACCESS_OR_SYNTAX");
    expect(apiOperationalErrorDiagnostic(new TypeError("PROVIDER_PROBE_RESPONSE_INVALID")))
      .toBe("PROVIDER_PROBE_RESPONSE_INVALID");
    expect(apiOperationalErrorDiagnostic(new Error("private question text")))
      .toBe("ERROR");
  });

  it("emits no synthetic sensitive content placed in code, message or name", () => {
    // A credential-shaped `code`: satisfied /^[A-Z0-9_]{2,32}$/u and was emitted.
    const tokenInCode = apiOperationalErrorDiagnostic(
      Object.assign(new Error("boom"), { code: FAKE_TOKEN })
    );
    expect(tokenInCode).not.toContain(FAKE_TOKEN);
    expect(tokenInCode).toBe("ERROR");

    // A digest-shaped `message`: satisfied /^[A-Z][A-Z0-9_]{2,63}$/u and was emitted.
    const digestInMessage = apiOperationalErrorDiagnostic(new Error(FAKE_DIGEST));
    expect(digestInMessage).not.toContain(FAKE_DIGEST);
    expect(digestInMessage).toBe("ERROR");

    // An upper-cased SQL fragment: constant-SHAPED, but not a known constant.
    const sqlInMessage = apiOperationalErrorDiagnostic(new TypeError(SQL_FRAGMENT));
    expect(sqlInMessage).not.toContain(SQL_FRAGMENT);
    expect(sqlInMessage).toBe("TYPE_ERROR");

    // A secret-bearing class `name`: was camel-to-SNAKE upper-cased and emitted.
    const tokenInName = apiOperationalErrorDiagnostic(
      Object.assign(new Error("boom"), { name: "TokenAkiaiosfodnn7" })
    );
    expect(tokenInName).not.toContain("AKIAIOSFODNN7");
    expect(tokenInName).toBe("UNEXPECTED_ERROR");

    // A driver rejection naming a relation: the class, never the server's text.
    const relationInMessage = apiOperationalErrorDiagnostic(Object.assign(
      new Error('relation "identity_user" does not exist'),
      { code: "42P01", name: "error" }
    ));
    expect(relationInMessage).not.toContain("identity_user");
    expect(relationInMessage).not.toContain("42P01");
    expect(relationInMessage).toBe("DEPENDENCY_SQL_42_ACCESS_OR_SYNTAX");

    // A filesystem path in the message reaches the fixed class category.
    const pathInMessage = apiOperationalErrorDiagnostic(new Error(FILE_PATH));
    expect(pathInMessage).not.toContain("secrets");
    expect(pathInMessage).toBe("ERROR");
  });

  it("still maps every allow-listed failure constant, whatever produced it", async () => {
    const block = diagnosticAlphabetBlock(await readFile("apps/api/src/index.ts", "utf8"));
    const constants = declaredList(block, "KNOWN_FAILURE_CONSTANTS");
    expect(constants.length).toBeGreaterThan(200);

    // Cited producers, one per admitted category.
    expect(constants).toContain("PROVIDER_PROBE_RESPONSE_INVALID"); // packages/providers/src/provider-probe.ts:104
    expect(constants).toContain("PSEUDONYM_ALLOCATION_EXHAUSTED"); // apps/api/src/registration.ts:1275
    expect(constants).toContain("CONTENT_ATTESTATION_INVALID"); // migrations/0040_account_erasure.sql:608

    // A PostgreSQL RAISE arrives with the constant in `message` and a SQLSTATE in
    // `code`; the named constant is the more specific answer and must win.
    expect(apiOperationalErrorDiagnostic(Object.assign(
      new Error("CONTENT_ATTESTATION_INVALID"),
      { code: "22023", name: "error" }
    ))).toBe("CONTENT_ATTESTATION_INVALID");

    for (const constant of constants) {
      expect(apiOperationalErrorDiagnostic(new Error(constant))).toBe(constant);
    }
  });

  it("maps a declared domain code and refuses an undeclared typed code", async () => {
    // codex r1 F1: `TypedDomainError`'s `code` is typed `string`
    // (packages/kernel/src/index.ts:388), so this branch used to return whatever
    // the constructor was handed. Control first — a declared code keeps its
    // diagnostic, which is the whole point of not simply dropping the branch.
    expect(apiOperationalErrorDiagnostic(
      new TypedDomainError("RUN_CONTENT_ROLLBACK_INCOMPLETE", "Run rollback did not complete")
    )).toBe("RUN_CONTENT_ROLLBACK_INCOMPLETE");
    expect(apiOperationalErrorDiagnostic(
      new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "composition contract")
    )).toBe("COMPOSITION_CONTRACT_ERROR");

    // Rejection — the reviewer's own probe value, which is not a declared code.
    expect(apiOperationalErrorDiagnostic(new TypedDomainError("DIAG_REVIEW_SENTINEL", "probe")))
      .toBe("UNRECOGNIZED_DOMAIN_ERROR");

    // Rejection — a credential-shaped typed code must not survive the branch.
    const tokenTyped = apiOperationalErrorDiagnostic(new TypedDomainError(FAKE_TOKEN, "probe"));
    expect(tokenTyped).not.toContain(FAKE_TOKEN);
    expect(tokenTyped).toBe("UNRECOGNIZED_DOMAIN_ERROR");

    // Rejection — an upper-cased SQL fragment carried as a typed code.
    const sqlTyped = apiOperationalErrorDiagnostic(new TypedDomainError(SQL_FRAGMENT, "probe"));
    expect(sqlTyped).not.toContain(SQL_FRAGMENT);
    expect(sqlTyped).toBe("UNRECOGNIZED_DOMAIN_ERROR");

    const block = diagnosticAlphabetBlock(await readFile("apps/api/src/index.ts", "utf8"));
    const codes = declaredList(block, "KNOWN_DOMAIN_CODES");
    expect(codes.length).toBeGreaterThan(300);
    expect(codes).not.toContain("DIAG_REVIEW_SENTINEL");
    for (const code of codes) {
      expect(apiOperationalErrorDiagnostic(new TypedDomainError(code, "declared"))).toBe(code);
    }
  });

  it("keeps the api and runner diagnostic alphabets byte-identical", async () => {
    const [api, runner] = await Promise.all([
      readFile("apps/api/src/index.ts", "utf8"),
      readFile("apps/runner/src/index.ts", "utf8")
    ]);
    expect(diagnosticAlphabetBlock(runner)).toBe(diagnosticAlphabetBlock(api));
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
