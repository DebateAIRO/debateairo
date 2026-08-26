import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { CONDITION_MARKS } from "@debateai/kernel";
import {
  AUTHORED_CODES,
  CONDITION_MARK_SEVERITY,
  DECLARED_GAP_CODES,
  DERIVED_CODES,
  FIRST_ID_PARAMETER_SECURITY_GATE,
  INDIRECT_ORIGINS,
  REGISTRY,
  REVIEWED_PARAMETER_SECURITY_GATES,
  SAFE_TEMPLATES,
  SEVERITY_DEFAULT,
  SEVERITY_LADDER,
  SEVERITY_OVERRIDES,
  SUSPICIOUS_SUCCESS_SUBCLASSES,
  TAXONOMY_CLASSES,
  TEMPLATE_PARAMETER_TYPES,
  assertParameterSecurityGates,
  assertRegistryCodePartitions,
  resolveSafeTemplate,
  resolveSafeTemplateId,
  resolveTaxonomyClass,
  safeTemplateId,
  severity,
  severityForConditionMark,
  validateBoundedInt,
  validateClosedEnum,
  validateId,
  validateRegistryCode,
  validateTemplateParameters,
  type RegistryCode,
  type SafeTemplateId,
  type TemplateParameterDeclaration,
  type TemplateParameterType,
} from "@debateai/obs-capture/registry-internal";
import { describe, expect, it } from "vitest";

const EXPECTED_DERIVED_COUNT = 276;
const EXPECTED_DERIVED_SHA256 =
  "65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451";
const EXPECTED_GAP_SHA256 =
  "d1e9b67d17efa3a2e8f8a2be386f59517fbd7769e193b2d5f042f24c53d4ae9a";
const EXPECTED_ORIGINS_SHA256 =
  "e2f70b4b78fd6e02e3c9078bb99c6cf81cd75379debdcfe69f5517c39dd152a9";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() =>
    Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() =>
        Value extends Left ? 1 : 2
      ? true
      : false
    : false;

const PARAMETER_TYPE_UNION_IS_EXACT: Equal<
  TemplateParameterType,
  "id" | "registry_code" | "closed_enum" | "bounded_int"
> = true;
const SAFE_TEMPLATE_ID_REJECTS_ARBITRARY_TEXT: "tpl.NOT_A_REGISTRY_CODE" extends SafeTemplateId
  ? false
  : true = true;

function canonicalLines(values: readonly string[]): string {
  const sorted = [...new Set(values)].sort((left, right) =>
    Buffer.from(left).compare(Buffer.from(right)),
  );
  return sorted.length === 0 ? "" : `${sorted.join("\n")}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function intersection(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): Set<string> {
  return new Set([...left].filter((value) => right.has(value)));
}

describe("S02 pinned registry partitions", () => {
  it("reproduces the Set-A derived count and hash", () => {
    expect(sha256(canonicalLines(REGISTRY.derived))).toBe(
      EXPECTED_DERIVED_SHA256,
    );
    expect(REGISTRY.derived).toHaveLength(EXPECTED_DERIVED_COUNT);
    expect(REGISTRY.derived).toBe(DERIVED_CODES);
  });

  it("reproduces the declared-gap count and hash", () => {
    expect(REGISTRY.declared_gap).toHaveLength(7);
    expect(sha256(canonicalLines(REGISTRY.declared_gap))).toBe(
      EXPECTED_GAP_SHA256,
    );
    expect(REGISTRY.declared_gap).toBe(DECLARED_GAP_CODES);
  });

  it("reproduces the forwarder-manifest count and hash", () => {
    const rows = REGISTRY.indirect_origins.map(
      (origin) =>
        `${origin.path}\t${origin.function_name}\t${origin.parameter}\t${origin.argument_index}`,
    );

    expect(REGISTRY.indirect_origins).toHaveLength(7);
    expect(sha256(canonicalLines(rows))).toBe(EXPECTED_ORIGINS_SHA256);
    expect(REGISTRY.indirect_origins).toBe(INDIRECT_ORIGINS);
  });

  it("keeps all code partitions pairwise disjoint behind the OBS_ fence", () => {
    const derived = new Set(REGISTRY.derived);
    const gap = new Set(REGISTRY.declared_gap);
    const authored = new Set(REGISTRY.authored);

    expect(intersection(derived, gap)).toEqual(new Set());
    expect(intersection(derived, authored)).toEqual(new Set());
    expect(intersection(gap, authored)).toEqual(new Set());
    expect(REGISTRY.authored).toEqual(AUTHORED_CODES);
    expect(REGISTRY.authored.every((code) => /^OBS_[A-Z0-9_]+$/u.test(code))).toBe(
      true,
    );
    expect(
      [...REGISTRY.derived, ...REGISTRY.declared_gap].every(
        (code) => !code.startsWith("OBS_"),
      ),
    ).toBe(true);
  });

  it("fails structurally before a namespace violation or collision can reach a map", () => {
    const fixtureCode = (value: string): RegistryCode => value as RegistryCode;

    expect(() =>
      assertRegistryCodePartitions({
        derived: [fixtureCode("OBS_WRONG_NAMESPACE")],
        declared_gap: [],
        authored: [],
      }),
    ).toThrow(/namespace fence violation/u);
    expect(() =>
      assertRegistryCodePartitions({
        derived: [],
        declared_gap: [],
        authored: [fixtureCode("WRONG_NAMESPACE")],
      }),
    ).toThrow(/namespace fence violation/u);
    expect(() =>
      assertRegistryCodePartitions({
        derived: [fixtureCode("COLLIDING_CODE")],
        declared_gap: [fixtureCode("COLLIDING_CODE")],
        authored: [],
      }),
    ).toThrow(/Registry code collision/u);
  });
});

describe("S02 safe templates", () => {
  it("resolves every code exactly once with an injective tpl.<code> id", () => {
    const allCodes = [
      ...REGISTRY.derived,
      ...REGISTRY.declared_gap,
      ...REGISTRY.authored,
    ];
    const resolved = allCodes.map((code) => resolveSafeTemplate(code));

    expect(SAFE_TEMPLATE_ID_REJECTS_ARBITRARY_TEXT).toBe(true);
    expect(resolved.every((template) => template !== undefined)).toBe(true);
    expect(SAFE_TEMPLATES).toHaveLength(allCodes.length);
    expect(new Set(SAFE_TEMPLATES.map((template) => template.code)).size).toBe(
      allCodes.length,
    );
    expect(new Set(SAFE_TEMPLATES.map((template) => template.id)).size).toBe(
      allCodes.length,
    );
    for (const code of allCodes) {
      expect(resolveSafeTemplate(code)?.id).toBe(`tpl.${code}`);
      expect(resolveSafeTemplate(code)?.id).toBe(safeTemplateId(code));
      expect(resolveSafeTemplateId(`tpl.${code}`)?.code).toBe(code);
    }
    expect(resolveSafeTemplate("NOT_A_REGISTRY_CODE")).toBeUndefined();
    expect(resolveSafeTemplateId("tpl.NOT_A_REGISTRY_CODE")).toBeUndefined();
  });

  it("seeds every template with an empty parameter list and no taxonomy binding", () => {
    expect(SAFE_TEMPLATES.every((template) => template.parameters.length === 0)).toBe(
      true,
    );
    expect(
      SAFE_TEMPLATES.every(
        (template) => !Object.prototype.hasOwnProperty.call(template, "taxonomy_class"),
      ),
    ).toBe(true);
  });
});

describe("S02 typed parameter injection wall", () => {
  it("has exactly four parameter types and structurally admits no fifth member", () => {
    expect(PARAMETER_TYPE_UNION_IS_EXACT).toBe(true);
    expect(TEMPLATE_PARAMETER_TYPES).toEqual([
      "id",
      "registry_code",
      "closed_enum",
      "bounded_int",
    ]);
    expect(TEMPLATE_PARAMETER_TYPES).not.toContain("string");
    expect(TEMPLATE_PARAMETER_TYPES).not.toContain("free_text");
  });

  it("rejects prose wearing an identifier shape", () => {
    const proseWithSensitiveShapes =
      "the.user.said.her.password.is.hunter2.and.her.card.is.4111111111111111";

    expect(validateId(proseWithSensitiveShapes)).toBe(false);
    const result = validateTemplateParameters(
      [{ name: "reference", type: "id" }],
      { reference: proseWithSensitiveShapes },
    );
    expect(result.parameters).toEqual({});
    expect(result.dropped).toEqual(["reference"]);
    expect(result.fallback_minimized).toBe(true);
  });

  it.each([
    ["payment-card-length numeric string", "4111111111111111"],
    ["SSN-length numeric string", "123456789"],
    [
      "session-prefixed identifier",
      "sess_9f3a2b1c4d5e6f708192a3b4c5d6e7f8",
    ],
    ["numeric payload in a run envelope", "run_4111111111111111"],
  ])("rejects prohibited identifier carriers: %s", (_label, value) => {
    expect(validateId(value)).toBe(false);

    const result = validateTemplateParameters(
      [{ name: "reference", type: "id" }],
      { reference: value },
    );
    expect(result.parameters).toEqual({});
    expect(result.dropped).toEqual(["reference"]);
    expect(result.fallback_minimized).toBe(true);
  });

  it("admits only the documented open identifier shapes", () => {
    const admitted = [
      "550e8400-e29b-41d4-a716-446655440000",
      "run_550e8400-e29b-41d4-a716-446655440000",
      DERIVED_CODES[0],
    ];
    const rejected = [
      "4111111111111111",
      "123456789",
      "sess_9f3a2b1c4d5e6f708192a3b4c5d6e7f8",
      "run_4111111111111111",
      "192.168.1.36",
      "asker-01a0285f-2037-7942-afd4-2a70a70fb694",
      "a".repeat(64),
      `eyJ${"A".repeat(30)}.${"B".repeat(30)}.${"C".repeat(30)}`,
      "customer_complained_that_the_refund_for_order_from_jane_doe_never_arrived",
      `run_${"A".repeat(41)}`,
    ];

    expect(admitted.every(validateId)).toBe(true);
    expect(rejected.every((value) => !validateId(value))).toBe(true);
  });

  it("names the first id parameter as an explicit security-review gate", () => {
    const templateWithId = {
      parameters: [{ name: "reference", type: "id" }],
    } as const;

    expect(FIRST_ID_PARAMETER_SECURITY_GATE).toBe(
      "FIRST_ID_PARAMETER_REQUIRES_EXPLICIT_SECURITY_REVIEW",
    );
    expect(REVIEWED_PARAMETER_SECURITY_GATES).toEqual([]);
    expect(() =>
      assertParameterSecurityGates(
        [templateWithId],
        REVIEWED_PARAMETER_SECURITY_GATES,
      ),
    ).toThrow(FIRST_ID_PARAMETER_SECURITY_GATE);
    expect(() =>
      assertParameterSecurityGates(
        [templateWithId],
        [FIRST_ID_PARAMETER_SECURITY_GATE],
      ),
    ).not.toThrow();
  });

  it("drops an invalid value for every validator and sets fallback_minimized", () => {
    const cases = [
      {
        declaration: { name: "run_id", type: "id" },
        invalid: "<script>alert(1)</script>",
        validatorResult: validateId("<script>alert(1)</script>"),
      },
      {
        declaration: { name: "code", type: "registry_code" },
        invalid: "NOT_A_REGISTRY_CODE",
        validatorResult: validateRegistryCode("NOT_A_REGISTRY_CODE"),
      },
      {
        declaration: {
          name: "mode",
          type: "closed_enum",
          members: ["safe", "strict"],
        },
        invalid: "arbitrary-text",
        validatorResult: validateClosedEnum("arbitrary-text", ["safe", "strict"]),
      },
      {
        declaration: {
          name: "attempt",
          type: "bounded_int",
          minimum: 0,
          maximum: 3,
        },
        invalid: 4,
        validatorResult: validateBoundedInt(4, 0, 3),
      },
    ] as const satisfies readonly {
      readonly declaration: TemplateParameterDeclaration;
      readonly invalid: unknown;
      readonly validatorResult: boolean;
    }[];

    for (const testCase of cases) {
      expect(testCase.validatorResult).toBe(false);
      const result = validateTemplateParameters(
        [testCase.declaration],
        { [testCase.declaration.name]: testCase.invalid },
      );
      expect(result.parameters).toEqual({});
      expect(result.dropped).toEqual([testCase.declaration.name]);
      expect(result.fallback_minimized).toBe(true);
    }
  });

  it("keeps only values proven by the four validators", () => {
    const declarations = [
      { name: "run_id", type: "id" },
      { name: "code", type: "registry_code" },
      { name: "mode", type: "closed_enum", members: ["safe", "strict"] },
      { name: "attempt", type: "bounded_int", minimum: 0, maximum: 3 },
    ] as const satisfies readonly TemplateParameterDeclaration[];

    const result = validateTemplateParameters(declarations, {
      run_id: "run_550e8400-e29b-41d4-a716-446655440000",
      code: DERIVED_CODES[0],
      mode: "strict",
      attempt: 3,
    });

    expect(result.parameters).toEqual({
      run_id: "run_550e8400-e29b-41d4-a716-446655440000",
      code: DERIVED_CODES[0],
      mode: "strict",
      attempt: 3,
    });
    expect(result.dropped).toEqual([]);
    expect(result.fallback_minimized).toBe(false);
  });

  it("drops undeclared input instead of admitting an unvalidated string", () => {
    const result = validateTemplateParameters([], { raw_text: "attacker controlled" });

    expect(result.parameters).toEqual({});
    expect(result.dropped).toEqual(["raw_text"]);
    expect(result.fallback_minimized).toBe(true);
  });

  it("rejects duplicate declaration names instead of returning contradictory state", () => {
    expect(() =>
      validateTemplateParameters(
        [
          { name: "reference", type: "bounded_int", minimum: 0, maximum: 9 },
          { name: "reference", type: "id" },
        ],
        { reference: 5 },
      ),
    ).toThrow("Duplicate template parameter declaration: reference");
  });
});

describe("S02 severity and unordered condition marks", () => {
  it("is total over every registry code with the empty override table", () => {
    const allCodes = [
      ...REGISTRY.derived,
      ...REGISTRY.declared_gap,
      ...REGISTRY.authored,
    ];

    expect(SEVERITY_LADDER).toEqual(["INFO", "DEGRADED", "SEVERE", "FATAL"]);
    expect(SEVERITY_DEFAULT).toBe("DEGRADED");
    expect(Object.keys(SEVERITY_OVERRIDES)).toEqual([]);
    expect(allCodes.every((code) => severity(code) === "DEGRADED")).toBe(true);
    expect(allCodes.every((code) => SEVERITY_LADDER.includes(severity(code)))).toBe(
      true,
    );
  });

  it("maps the kernel marks as an unordered, unextended vocabulary", () => {
    expect(new Set(Object.keys(CONDITION_MARK_SEVERITY))).toEqual(
      new Set(CONDITION_MARKS),
    );
    expect(Object.keys(CONDITION_MARK_SEVERITY)).toHaveLength(28);
    expect(Object.values(CONDITION_MARK_SEVERITY).every((value) => value === "DEGRADED")).toBe(
      true,
    );
    for (const mark of CONDITION_MARKS) {
      expect(severityForConditionMark(mark)).toBe("DEGRADED");
    }
  });
});

describe("S02 closed taxonomy", () => {
  it("resolves all twelve classes and the three suspicious-success subclasses", () => {
    const expectedClasses = new Set([
      "PROCESS_DEATH",
      "HTTP_FAILURE",
      "JOB_FAILURE",
      "PROVIDER_EXHAUSTED",
      "DB_FAILURE",
      "PARSE_SCHEMA_FAILURE",
      "STALL_DETECTED",
      "SILENT_NOOP",
      "SUSPICIOUS_SUCCESS",
      "CLIENT_FAILURE",
      "CAPTURE_SELF",
      "ORIGIN_UNKNOWN",
    ]);
    const expectedSubclasses = new Set([
      "empty_output",
      "missing_required_fields",
      "missing_artifact_chain",
    ]);

    expect(TAXONOMY_CLASSES).toHaveLength(12);
    expect(new Set(TAXONOMY_CLASSES)).toEqual(expectedClasses);
    expect(TAXONOMY_CLASSES.every((value) => resolveTaxonomyClass(value) !== undefined)).toBe(
      true,
    );
    expect(
      new Set(
        resolveTaxonomyClass("SUSPICIOUS_SUCCESS")
          ?.suspicious_success_subclasses,
      ),
    ).toEqual(expectedSubclasses);
    expect(new Set(SUSPICIOUS_SUCCESS_SUBCLASSES)).toEqual(expectedSubclasses);
    expect(resolveTaxonomyClass("NOT_A_TAXONOMY_CLASS")).toBeUndefined();
  });
});

describe("S02 merge-base drift report", () => {
  it("re-runs the byte-exact recipe and reports drift without grading S02", ({
    skip,
  }) => {
    const skipUnavailable = (reason: string): never => {
      console.info(`S02_REPIN_REPORT disposition=RECIPE_UNAVAILABLE reason=${reason}`);
      return skip(reason);
    };
    const relativeDocument = join(
      "docs",
      "missions",
      "2026-08-21-observability-loop",
      "planning",
      "S02-registry-pin-correction.md",
    );
    const documentPath = [
      resolve(process.cwd(), relativeDocument),
      resolve(process.cwd(), "../../../", relativeDocument),
    ].find((candidate) => existsSync(candidate));
    const availableDocumentPath =
      documentPath ?? skipUnavailable("planning document unavailable");

    const document = (() => {
      try {
        return readFileSync(availableDocumentPath, "utf8");
      } catch (error) {
        return skipUnavailable(
          `planning document unreadable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    })();
    const scriptMatch = document.match(
      /### 3\.2 The script\s+```sh\n([\s\S]*?)\n```/u,
    );
    const script =
      scriptMatch?.[1] ?? skipUnavailable("pinned recipe block unavailable");

    let repositoryRoot: string | undefined;
    let mergeBase: string | undefined;
    let projection: string | undefined;
    let unavailableReason: string | undefined;
    let temporaryDirectory: string | undefined;
    try {
      repositoryRoot = execFileSync(
        "git",
        ["rev-parse", "--show-toplevel"],
        { encoding: "utf8" },
      ).trim();
      mergeBase = execFileSync(
        "git",
        ["merge-base", "HEAD", "29f370e"],
        { encoding: "utf8" },
      ).trim();
      execFileSync("sh", ["-c", ":"], { encoding: "utf8" });
      temporaryDirectory = mkdtempSync(join(tmpdir(), "obs-s02-recipe-"));
      const scriptPath = join(temporaryDirectory, "obs-code-seed.sh");
      writeFileSync(scriptPath, `${script}\n`, "utf8");
      projection = execFileSync("sh", [scriptPath, "seed"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          OBS_REPO: repositoryRoot,
          OBS_BASE: mergeBase,
        },
      });
    } catch (error) {
      unavailableReason =
        error instanceof Error ? error.message.split("\n", 1)[0] : String(error);
    } finally {
      if (temporaryDirectory !== undefined) {
        try {
          rmSync(temporaryDirectory, { recursive: true, force: true });
        } catch (error) {
          unavailableReason ??=
            error instanceof Error ? error.message.split("\n", 1)[0] : String(error);
        }
      }
    }

    if (unavailableReason !== undefined) {
      skipUnavailable(`recipe environment unavailable: ${unavailableReason}`);
    }
    const availableMergeBase =
      mergeBase ??
      skipUnavailable("recipe environment unavailable: incomplete merge base");
    const availableProjection =
      projection ??
      skipUnavailable("recipe environment unavailable: incomplete projection");

    const actualHash = sha256(availableProjection);
    const actualCount =
      availableProjection === ""
        ? 0
        : availableProjection.trimEnd().split("\n").length;
    const drift = actualHash !== EXPECTED_DERIVED_SHA256;
    console.info(
      `S02_REPIN_REPORT merge_base=${availableMergeBase} count=${actualCount} sha256=${actualHash} expected=${EXPECTED_DERIVED_SHA256} drift=${String(drift)} disposition=${drift ? "ROUTER_REPIN_EVENT" : "PIN_REPRODUCED"}`,
    );

    expect(actualCount).toBeGreaterThan(0);
  });
});
