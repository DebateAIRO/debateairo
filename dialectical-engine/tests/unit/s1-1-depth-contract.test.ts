import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApi as buildApiBase, type AskApplication } from "@debateai/api";
import {
  AskRequestSchema,
  EXPANSION_DEPTH_MAX,
  EXPANSION_DEPTH_MIN,
  type AskRequest
} from "@debateai/contract";
import { resolveExpansionDepth } from "@debateai/runner";
import { auditArchitecture, auditSourceRules } from "../../tools/orphan-audit/src/index.js";
import { createDebate } from "../../apps/ui/lib/api.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import {
  candidatesOf,
  ceilingSites,
  domainSites,
  evaluatedCandidatesOf,
  kindOf,
  parseModule,
  type Cell,
  type EvaluatedCandidate,
  type Site
} from "../support/depthOracle.js";

/** Exactly one evaluated candidate, or the count is the failure. */
function evaluateOne(path: string, source: string): EvaluatedCandidate {
  const all = evaluatedCandidatesOf(path, source);
  if (all.length !== 1) {
    throw new Error(`expected exactly one candidate in ${path}, got ${all.length}`);
  }
  return all[0]!;
}

/** The EXACT cells of an evaluated candidate; anything else is the failure. */
function cellsOf(candidate: EvaluatedCandidate): readonly Cell[] {
  if (candidate.value.kind !== "EXACT") {
    throw new Error(`expected an EXACT value, got ${candidate.value.kind}`);
  }
  return candidate.value.cells;
}

/** Cells rendered for assertion: a number when numeric, otherwise the tag. */
function cellValues(cells: readonly Cell[]): readonly (number | string)[] {
  return cells.map((cell) => (cell.t === "num" ? cell.v : cell.t));
}

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const ANSWER_ID = "44444444-4444-4444-8444-444444444444";
const IDENTITY = testHttpIdentity("s1-1-depth");
const MUTATION_HEADERS = testSessionHeaders(IDENTITY, true);

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () => ({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readInspection: async () => ({
      answer_id: ANSWER_ID,
      answer_version: 1,
      conformance: { outcome: "PASS", coverage_mode: "EXHAUSTIVE", segment_results: [] },
      segment_suppressions: [],
      shadow_suppressions: []
    }),
    readLedgerDigest: async () => ({ answer_id: ANSWER_ID, run_ref: RUN_ID, work_items: [], entries: [] }),
    events: async function* () {
      yield { event_id: "event:test", event_type: "run.accepted", run_ref: RUN_ID, at_sequence: 1, payload: {} };
    }
  };
}

function buildAskApi(application: AskApplication = fixtureApplication()) {
  return buildApiBase({
    application,
    sessions: testSessionApplication([IDENTITY]),
    allowedOrigin: TEST_APP_ORIGIN
  });
}

/** The ruled ask minus depth_params, so each case supplies only the value under test. */
function askWithout(depthParams: unknown): Record<string, unknown> {
  return {
    question_line: "What follows from this evidence?",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker-declaration:s1-1",
    composition_budget_tier: "low",
    depth_params: depthParams,
    decision_scope: "s1-1 depth contract",
    as_of: "2026-09-01T00:00:00.000Z",
    steering_presets: [],
    steering_annotations: []
  };
}

describe("S1-1 · depth enforced at the contract door", () => {
  // PROPERTY: an expansion depth above the ruled maximum is refused at the
  // contract door — POST /v1/asks carrying depth 9 answers HTTP 400 with the
  // parseRequest validation envelope's machine code MALFORMED_REQUEST, and no
  // ask ever reaches the application.
  it("refuses depth 9 at POST /v1/asks with the parseRequest 400 envelope", async () => {
    let submitted = 0;
    const api = buildAskApi({
      ...fixtureApplication(),
      submit: async () => { submitted += 1; return { run_ref: RUN_ID, status: "QUEUED" as const }; }
    });
    try {
      const response = await api.inject({
        method: "POST",
        url: "/v1/asks",
        headers: MUTATION_HEADERS,
        payload: askWithout({ depth: 9 })
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe("MALFORMED_REQUEST");
      expect(submitted).toBe(0);
    } finally {
      await api.close();
    }
  });

  // PROPERTY: the contract door refuses every depth_params shape that is not an
  // integer inside the ruled range under exactly one key.
  it.each([
    { label: "0 (below the floor)", depthParams: { depth: 0 } },
    { label: "6 (above the ceiling)", depthParams: { depth: 6 } },
    { label: "missing depth", depthParams: {} },
    { label: "fractional", depthParams: { depth: 2.5 } },
    { label: "string", depthParams: { depth: "3" } },
    { label: "unknown key alongside depth", depthParams: { depth: 3, rounds: 2 } }
  ])("refuses $label with the parseRequest 400 envelope", async ({ depthParams }) => {
    const api = buildAskApi();
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/asks", headers: MUTATION_HEADERS, payload: askWithout(depthParams)
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe("MALFORMED_REQUEST");
    } finally {
      await api.close();
    }
  });

  // PROPERTY: the ruled endpoints of the range are accepted through the ask
  // construction of the live apps/ui client and reach the application as a
  // queued run. T1 authored this over BOTH client surfaces; dev's UI overhaul
  // deleted `web/` wholesale (D23 ADDENDUM-2), so the legacy arm's SUBJECT is
  // gone on this tree and the arm goes with it — the same rule round 1 applied
  // to tests/architecture/s14-contract.test.ts. The surviving arm is unchanged.
  it.each([EXPANSION_DEPTH_MIN, EXPANSION_DEPTH_MAX])(
    "accepts depth %i through the live apps/ui client",
    async (depth) => {
      const api = buildAskApi();
      const seen: AskRequest[] = [];
      try {
        const accepted = await createDebate(
          "What follows from this evidence?",
          {
            risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:ui-selection",
            composition_budget_tier: "low", depth, decision_scope: "personal",
            as_of: "2026-09-01T00:00:00.000Z"
          },
          "cookie-session",
          {
            submitAsk: async (ask: AskRequest) => {
              seen.push(ask);
              const response = await api.inject({
                method: "POST", url: "/v1/asks", headers: MUTATION_HEADERS, payload: ask
              });
              expect(response.statusCode).toBe(202);
              return response.json() as { run_ref: string; status: "QUEUED" };
            }
          } as never
        );
        expect(accepted).toEqual({ id: RUN_ID });
        expect(seen).toHaveLength(1);
        expect(seen[0]!.depth_params).toEqual({ depth });
      } finally {
        await api.close();
      }
    }
  );

  // PROPERTY: the runner keeps its own RUN_DEPTH_PARAMS_INVALID guard as defence
  // in depth, and that guard's bounds ARE the contract's exported constants —
  // moving the constant moves the guard.
  it("keeps the runner RUN_DEPTH_PARAMS_INVALID guard bound to the contract constants", () => {
    expect(resolveExpansionDepth({ depth: EXPANSION_DEPTH_MIN })).toBe(EXPANSION_DEPTH_MIN);
    expect(resolveExpansionDepth({ depth: EXPANSION_DEPTH_MAX })).toBe(EXPANSION_DEPTH_MAX);
    for (const invalid of [
      { depth: EXPANSION_DEPTH_MIN - 1 },
      { depth: EXPANSION_DEPTH_MAX + 1 },
      { depth: EXPANSION_DEPTH_MAX + 0.5 },
      { depth: "3" },
      {}
    ]) {
      expect(() => resolveExpansionDepth(invalid)).toThrowError(
        expect.objectContaining({ code: "RUN_DEPTH_PARAMS_INVALID" })
      );
    }
  });

  // PROPERTY: the depth schema is reachable from the contract door itself, so
  // the bound is one schema rather than a route-local check.
  it("exports the ruled bound as constants the ask schema enforces", () => {
    expect([EXPANSION_DEPTH_MIN, EXPANSION_DEPTH_MAX]).toEqual([1, 5]);
    for (let depth = EXPANSION_DEPTH_MIN; depth <= EXPANSION_DEPTH_MAX; depth += 1) {
      expect(AskRequestSchema.parse(askWithout({ depth })).depth_params).toEqual({ depth });
    }
    expect(() => AskRequestSchema.parse(askWithout({ depth: EXPANSION_DEPTH_MAX + 1 }))).toThrow();
    expect(() => AskRequestSchema.parse(askWithout({ depth: EXPANSION_DEPTH_MIN - 1 }))).toThrow();
  });
});

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SHIPPED_ROOTS = ["packages", "apps", "web"] as const;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "generated", ".next", "dist", "build", "__tests__"]);
const SHIPPED_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs"];

/**
 * BROAD BY CONSTRUCTION, with the one owner named.
 *
 * r2 enumerated spellings (`.max(5)`, `depth <= 5`, `[1,2,3,4,5]`) and codex
 * refuted it: `.lte(5)`, a `superRefine` refinement and the reversed
 * `5 >= depth` all reintroduced the bound while the oracle stayed green.
 * Enumerating spellings is unwinnable — the author's imagination is the
 * coverage limit. So this oracle inverts the burden:
 *
 *   DEPTH_BOUND_LITERAL  any line mentioning a depth that also carries the
 *                        literal 5, or a 6 in an exclusive-bound position
 *   DOMAIN_ENUMERATION   any line spelling the whole domain 1,2,3,4,5
 *
 * and then allows exactly ONE line in the whole tree: the owning declaration.
 * A new spelling does not need a new detector; it needs a new exemption, which
 * is a visible diff to this list.
 *
 * `6` counts only next to a comparison/`lt`/`gte` (an exclusive ceiling), never
 * as a bare value — otherwise the observability logger's unrelated
 * `maxDepth: 6` (apps/ui/lib/observability/logger.ts:77) is swept in. A
 * floor-only guard carrying no ceiling literal (`depth < 1`, as at
 * web/app/new/NewQuestionForm.tsx:18) still does not match: it is not a second
 * definition of the 1–5 bound and holds no second literal 5. That remains
 * finding F-T1-4, owned by T2 — argued, not silenced, and pinned by a negative
 * control below.
 */

/**
 * The SINGLE owning declaration, allowed by exact text. Not a path exemption:
 * a second numeric depth export in this very file is still a violation.
 */
const OWNING_DECLARATION = Object.freeze({
  path: "packages/contract/src/index.ts",
  text: "export const EXPANSION_DEPTH_MAX = 5;"
});

/**
 * THE OLD EMITTER, preserved for ROUND 1.
 *
 * Its ceiling composition (line scan + declaration units + conjunct units, keyed
 * `line:kind`, with the `WHOLE_DOMAIN` fallback) now lives in ONE place —
 * `ceilingSites` in tests/support/depthOracle.ts — and this alias keeps the
 * inherited call sites and their behaviour exactly as they were. It is TEXT ONLY
 * and never parses, so the malformed ceiling fragments below are not rewritten
 * into parseable source.
 *
 * The three bare DOMAIN controls and the shipped scan still run through here.
 * Round 3 removes the `WHOLE_DOMAIN` fallback and routes those three to
 * `domainSites` (plan §5.6 R4) — not this round.
 */
const duplicateBoundSites = (source: string): Site[] => ceilingSites(source);

function shippedSourceFiles(): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (SKIPPED_DIRECTORIES.has(entry)) continue;
      const absolute = join(directory, entry);
      if (statSync(absolute).isDirectory()) { walk(absolute); continue; }
      if (SHIPPED_EXTENSIONS.some((extension) => entry.endsWith(extension))) found.push(absolute);
    }
  };
  for (const root of SHIPPED_ROOTS) walk(join(REPOSITORY_ROOT, root));
  return found;
}

/** Every depth-bound SITE in shipped code, addressed `path:line [KIND] text`. */
function depthBoundSitesInShippedCode(): string[] {
  return shippedSourceFiles().flatMap((absolute) => {
    const path = relative(REPOSITORY_ROOT, absolute).split(sep).join("/");
    return duplicateBoundSites(readFileSync(absolute, "utf8"))
      .map((site) => `${path}:${site.line} [${site.kind}] ${site.text}`);
  }).sort();
}

/** The same scan minus the one owning declaration — must be empty. */
function duplicateBoundSitesInShippedCode(): string[] {
  return depthBoundSitesInShippedCode().filter(
    (site) => !site.startsWith(`${OWNING_DECLARATION.path}:`) || !site.endsWith(` ${OWNING_DECLARATION.text}`)
  );
}

describe("S1-1 · the depth bound has a single source", () => {
  // ROUND 1 — the corpus parse gate. PROPERTY: every shipped file the oracle scans
  // is parsed by the pinned classic parser with no syntactic diagnostic, under the
  // ScriptKind its extension selects. Mutation K23 makes that mapping wrong.
  it("parses every shipped file with no syntactic diagnostic", () => {
    const scanned = shippedSourceFiles();
    const failures: string[] = [];
    for (const absolute of scanned) {
      const path = relative(REPOSITORY_ROOT, absolute).split(sep).join("/");
      const parsed = parseModule(path, readFileSync(absolute, "utf8"));
      if (parsed.ok) continue;
      const first = parsed.diagnostics[0];
      failures.push(`${path}: ${first ? `${first.line}: ${first.message}` : "no diagnostic"}`);
    }
    expect(failures).toEqual([]);
    // The corpus is ENUMERATED, not assumed: 232 files, of which 59 are .tsx.
    expect(scanned.length).toBe(232);
    expect(scanned.filter((absolute) => absolute.endsWith(".tsx")).length).toBe(59);
  });

  // ROUND 1 — PARSE-CONTEXT FIXTURES (plan §1 R3). PROPERTY: what the parser calls
  // an array-literal EXPRESSION is what the oracle may consider, and contexts that
  // merely look like one are not candidates. Each row is a node-kind fact, which a
  // `[`-numerics-`]` token pattern cannot express.
  it.each([
    { context: "JSX text that spells the run", path: "planted.tsx", source: "const view = <p>[1,2,3,4,5]</p>;" },
    { context: "a computed property name", path: "planted.ts", source: 'const m = { [1]: "x" };' },
    { context: "computed element access", path: "planted.ts", source: "const v = a[1];" },
    { context: "a tuple TYPE, not an expression", path: "planted.ts", source: "type T = [1,2,3,4,5];" },
    { context: "an empty array literal", path: "planted.ts", source: "const none = [];" },
    { context: "a mixed array literal", path: "planted.ts", source: "const mixed = [1, two, 3, 4, 5];" }
  ])("finds no candidate in $context", ({ path, source }) => {
    expect(candidatesOf(path, source)).toEqual([]);
  });

  // ROUND-1 REWORK (codex r1 B6) — THREE FURTHER PARSE CONTEXTS, each an input the
  // A1-A11 rows do NOT cover: A7's regex sits in a variable initializer, not after a
  // control-condition parenthesis; A4 has one template, not a template nested inside
  // another template's substitution. Each asserts a CLEAN parse and the literal
  // candidate offsets, measured before they were written (31-B6-measurements.log).
  it.each([
    {
      context: "a regex literal after a control-condition parenthesis",
      path: "planted.ts",
      source: "if (ready) /[//]/.test(text); const choices = [1,2,3,4,5];",
      expected: [{ start: 46, end: 57, elementLine: 1, statementLine: 1 }]
    },
    {
      context: "JSX text that resembles a line comment",
      path: "planted.tsx",
      source: "const view = <p>// example</p>; const choices = [1,2,3,4,5];",
      expected: [{ start: 48, end: 59, elementLine: 1, statementLine: 1 }]
    },
    {
      context: "a template nested inside another template's substitution",
      path: "planted.ts",
      source: "const s = `a${`b${[1,2,3,4,5].length}c`}d`;",
      expected: [{ start: 18, end: 29, elementLine: 1, statementLine: 1 }]
    }
  ])("parses cleanly and addresses the candidate in $context", ({ path, source, expected }) => {
    expect(parseModule(path, source).ok).toBe(true);
    expect(candidatesOf(path, source)).toEqual(expected);
  });

  // ROUND-1 REWORK (codex r1 B6) — THE FIVE ORIGINAL TRUNCATED PREFIXES, imported from
  // the donor at 60641339b983365952dd6cd61ed2f379aef6dc8a, tests/unit/s1-1-depth-contract.test.ts
  // lines 1047-1051, preserving their wrapping and comment bytes EXACTLY (the 18-space
  // indent, the `/* first slot */` block comment, the `// first slot` line comment and the
  // newline positions are all load-bearing: they are what made the same declaration read
  // two different ways in the donor's text pipeline).
  //
  // PROPERTY: a source the parser rejects yields NO discovery candidate and exactly ONE
  // narrowed INCONCLUSIVE carrying path, line and message. Measured first: each fails with
  // exactly one diagnostic, "Expression expected." (31-B6-measurements.log).
  it.each([
    {
      layout: "the real six-slot login array",
      planted: "                  {[0, 1, 2, 3, 4, 5].map((slot) => (",
      line: 1
    },
    {
      layout: "the real login array, wrapped after the sentinel",
      planted: "                  {[0,\n                  1, 2, 3, 4, 5].map((slot) => (",
      line: 2
    },
    {
      layout: "the real login array, block comment after the sentinel",
      planted: "                  {[0, /* first slot */ 1, 2, 3, 4, 5].map((slot) => (",
      line: 1
    },
    {
      layout: "the real login array, commented AND wrapped",
      planted: "                  {[0, /* first slot */\n                  1, 2, 3, 4, 5].map((slot) => (",
      line: 2
    },
    {
      layout: "the real login array, line comment after the sentinel",
      planted: "                  {[0, // first slot\n                  1, 2, 3, 4, 5].map((slot) => (",
      line: 2
    }
  ])("reports one INCONCLUSIVE and no candidate for the truncated prefix — $layout", ({ planted, line }) => {
    const parsed = parseModule("planted.tsx", planted);
    expect(parsed.ok).toBe(false);
    expect(candidatesOf("planted.tsx", planted)).toEqual([]);

    const sites = domainSites("planted.tsx", planted);
    expect(sites).toHaveLength(1);
    const [site] = sites;
    if (site?.kind !== "INCONCLUSIVE") {
      throw new Error(`expected INCONCLUSIVE, got ${site?.kind ?? "none"}`);
    }
    expect(site.path).toBe("planted.tsx");
    expect(site.line).toBe(line);
    expect(site.diagnostic).toBe("Expression expected.");
    expect(site.text).toBe(site.diagnostic);
  });

  // ROUND 1 — A1..A11 ADDRESSING (plan §2.3 R2, §2 R3). Every row asserts exact
  // cardinality and, per candidate, the literal `(start, end, elementLine,
  // statementLine)`. `toEqual([])` is not accepted as an addressing assertion.
  // Identity is the OFFSET PAIR; `statementLine` is display and never shares a
  // field with it. Every literal below was MEASURED before it was asserted.
  it.each([
    {
      id: "A1 — ASI: the owning statement begins on line 2",
      path: "planted.ts",
      source: "const marker = 0\nconst choices = [1,2,3,4,5]\n",
      expected: [{ start: 33, end: 44, elementLine: 2, statementLine: 2 }]
    },
    {
      id: "A2 — JSX container: the statement begins on line 1, the element on line 2",
      path: "planted.tsx",
      source: "const view = <section>{\n  [1,2,3,4,5]\n}</section>;",
      expected: [{ start: 26, end: 37, elementLine: 2, statementLine: 1 }]
    },
    {
      id: "A3 — two arrays on one line are two candidates with distinct spans",
      path: "planted.ts",
      source: "const a = [1,2,3,4,5]; const b = [1,2,3,4,5];",
      expected: [
        { start: 10, end: 21, elementLine: 1, statementLine: 1 },
        { start: 33, end: 44, elementLine: 1, statementLine: 1 }
      ]
    },
    {
      id: "A4 — inside a template expression",
      path: "planted.ts",
      source: "const s = `x${[1,2,3,4,5].length}y`;",
      expected: [{ start: 14, end: 25, elementLine: 1, statementLine: 1 }]
    },
    {
      id: "A5 — inside an object literal",
      path: "planted.ts",
      source: "const o = { a: [1,2,3,4,5] };",
      expected: [{ start: 15, end: 26, elementLine: 1, statementLine: 1 }]
    },
    {
      id: "A6 — comments are trivia to the parser",
      path: "planted.ts",
      source: "const slots = [0, /* c */ 1, 2, 3, 4, 5];",
      expected: [{ start: 14, end: 40, elementLine: 1, statementLine: 1 }]
    },
    {
      id: "A7 — a regex literal is not a candidate",
      path: "planted.ts",
      source: "const marker = /[//]/; const choices = [1,2,3,4,5];",
      expected: [{ start: 39, end: 50, elementLine: 1, statementLine: 1 }]
    },
    {
      id: "A8 inline — comma expression",
      path: "planted.ts",
      source: 'const slots = (";", [0,1,2,3,4,5]);',
      expected: [{ start: 20, end: 33, elementLine: 1, statementLine: 1 }]
    },
    {
      id: "A8 wrapped — the same statement line despite the newline",
      path: "planted.ts",
      source: 'const slots = (\n  ";", [0,1,2,3,4,5]);',
      expected: [{ start: 23, end: 36, elementLine: 2, statementLine: 1 }]
    },
    {
      id: "A9 — a ruled run beside a longer one: two candidates, distinct spans",
      path: "planted.ts",
      source: "const a = [1,2,3,4,5]; const b = [0,1,2,3,4,5];",
      expected: [
        { start: 10, end: 21, elementLine: 1, statementLine: 1 },
        { start: 33, end: 46, elementLine: 1, statementLine: 1 }
      ]
    }
  ])("addresses $id", ({ path, source, expected }) => {
    expect(candidatesOf(path, source)).toEqual(expected);
  });

  // ══════════════════ ROUND 2 — THE EVALUATOR ══════════════════
  //
  // PROPERTY: for one declaration, decide whether it DEFINES the ruled option
  // domain 1..5 — soundly inside the declared grammar, conservatively outside it.
  // Rule 1 is consulted FIRST; only a different literal reaches the chain.
  //
  // These rows are written BEFORE the transfer rules exist. Under the declared
  // stub ("every operation and wrapper yields UNKNOWN, rule-1 precedence kept")
  // the five named cases below fail BY WRONG VERDICT — not by a missing API and
  // not by a malformed fixture, both of which would prove nothing.

  it.each([
    {
      id: "0-5 then slice(1) — the ruled suffix",
      source: "const choices = [0,1,2,3,4,5].slice(1);",
      verdict: "RULED" as const,
      cells: [1, 2, 3, 4, 5]
    },
    {
      id: "the even filter — a decided, non-ruled value",
      source: "const choices = [0,1,2,3,4,5].filter(n => n % 2 === 0);",
      verdict: "OTHER" as const,
      cells: [0, 2, 4]
    },
    {
      id: "reverse then slice(1) — order is load-bearing",
      source: "const choices = [0,1,2,3,4,5].reverse().slice(1);",
      verdict: "OTHER" as const,
      cells: [4, 3, 2, 1, 0]
    },
    {
      id: "Array.from over a Set of the OR-map, then slice(1)",
      source: "const choices = Array.from(new Set([0,1,2,3,4,5].map(n => n || 1))).slice(1);",
      verdict: "OTHER" as const,
      cells: [2, 3, 4, 5]
    },
    {
      id: "1-6 then slice(0,-1) — the ruled prefix",
      source: "const choices = [1,2,3,4,5,6].slice(0,-1);",
      verdict: "RULED" as const,
      cells: [1, 2, 3, 4, 5]
    }
  ])("evaluates $id", ({ source, verdict, cells }) => {
    const evaluated = evaluateOne("planted.ts", source);
    expect(evaluated.verdict).toBe(verdict);
    expect(cellValues(cellsOf(evaluated))).toEqual(cells);
  });

  // GREEN UNDER THE STUB, and green afterwards — these must not move.
  it.each([
    { id: "bare 0-5 is a decided non-ruled literal", source: "const choices = [0,1,2,3,4,5];", verdict: "OTHER" as const },
    { id: "bare 1-6 is a decided non-ruled literal", source: "const choices = [1,2,3,4,5,6];", verdict: "OTHER" as const },
    { id: "rule 1: the bare ruled domain", source: "const allowed = [1,2,3,4,5];", verdict: "RULED" as const },
    { id: "rule 1 precedes the chain: map-to-zero over the ruled literal", source: "const choices = [1,2,3,4,5].map(n => 0);", verdict: "RULED" as const },
    { id: "K50 control: NOT_ARRAY continuation reports", source: 'const choices = [0,1,2,3,4,5].join("").split("").map(n => +n).slice(1);', verdict: "UNDETERMINED" as const }
  ])("evaluates $id", ({ source, verdict }) => {
    expect(evaluateOne("planted.ts", source).verdict).toBe(verdict);
  });

  // THE SEVEN ACTIVE CONTROLS (manifest Part 2c), each with its canonical source.
  it.each([
    { id: "K7b — combined: three parameters, assignment and element access", source: "const choices = [0,1,2,3,4,5].map(n => n === 5 ? 6 : n).filter((n, i, a) => { a[5] = 5; return n > 0; });", verdict: "UNDETERMINED" as const },
    { id: "K7c — async only (purity clause 4)", source: "const choices = [0,1,2,3,4,5].map(async n => n);", verdict: "UNDETERMINED" as const },
    { id: "K20b — computed member name with a string literal", source: 'const choices = [0,1,2,3,4,5]["slice"](1);', verdict: "RULED" as const },
    { id: "K34 — a direct unmodelled call", source: "const choices = ((x) => x.slice(1))([0,1,2,3,4,5]);", verdict: "UNDETERMINED" as const },
    { id: "K35 — truthiness filter", source: "const choices = [0,1,2,3,4,5].filter(n => n);", verdict: "RULED" as const },
    { id: "K37 — a non-finite calculation reports", source: "const choices = [0,1,2,3,4,5].map(n => n * n / n).filter(n => n);", verdict: "UNDETERMINED" as const }
  ])("evaluates control $id", ({ source, verdict }) => {
    expect(evaluateOne("planted.ts", source).verdict).toBe(verdict);
  });

  // K7d — the REAL assignment-rejection assertion (codex r1c point 5). A generic
  // UNKNOWN stub also makes this green, so the candidate identity and the REASON
  // are asserted too: the rejection must be attributable to purity clause 3.
  it("evaluates control K7d — assignment alone fails the purity gate, with identity and reason", () => {
    const source = "const choices = [0,1,2,3,4,5].map(n => (n = n));";
    const evaluated = evaluateOne("planted.ts", source);
    expect(evaluated.start).toBe(16);
    expect(evaluated.end).toBe(29);
    expect(evaluated.elementLine).toBe(1);
    expect(evaluated.statementLine).toBe(1);
    expect(evaluated.verdict).toBe("UNDETERMINED");
    expect(evaluated.value.kind).toBe("UNKNOWN");
    expect(evaluated.reason).toMatch(/assignment/i);
  });

  // THE FOUR O1 SEMANTIC CONTROLS (K48-K51), written before their transfer rules.
  it.each([
    { id: "K48 — signed zero is falsy under the truthiness rule", source: "const choices = [-0,1,2,3,4,5].filter(n => n);", verdict: "RULED" as const },
    { id: "K49 — ?? skips a null left operand", source: "const choices = [0,1,2,3,4,5].map(n => (n === 0 ? null : n) ?? 1);", verdict: "RULED" as const },
    { id: "K50 — an operation over NOT_ARRAY reports", source: 'const choices = [0,1,2,3,4,5].join("").split("").map(n => +n).slice(1);', verdict: "UNDETERMINED" as const },
    { id: "K51 — any bound output being RULED decides the occurrence", source: "const [head, ...choices] = [0,1,2,3,4,5];", verdict: "RULED" as const }
  ])("evaluates $id", ({ source, verdict }) => {
    expect(evaluateOne("planted.ts", source).verdict).toBe(verdict);
  });

  // THE REPAIRED MANIFEST FIXTURES (K9, K10, K31, K43, K47), each with the cells
  // or the verdict the manifest binds it to.
  it("evaluates K10's fixture with its exact baseline cells", () => {
    const evaluated = evaluateOne("planted.ts", "const choices = [0,1,2,3,4,5].map(n => n || 1);");
    expect(cellValues(cellsOf(evaluated))).toEqual([1, 1, 2, 3, 4, 5]);
    expect(evaluated.verdict).toBe("RULED");
  });

  it("evaluates K43's fixture: known string cells reach the element-return rule", () => {
    const evaluated = evaluateOne("planted.ts", 'const choices = [0,1,2,3,4,5].map(n => "x").at(0);');
    expect(evaluated.start).toBe(16);
    expect(evaluated.end).toBe(29);
    expect(evaluated.verdict).toBe("UNDETERMINED");
  });

  it("evaluates K31's in-grammar over-budget fixture as UNDETERMINED", () => {
    const sum = "(((((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))) + ((((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))))";
    const source = `const choices = [0,1,2,3,4,5].map(n => n + ${sum}).slice(1);`;
    expect(evaluateOne("planted.ts", source).verdict).toBe("UNDETERMINED");
  });

  it("evaluates K47's SAME-sentinel source: dedupe of a non-numeric cell is observable", () => {
    const evaluated = evaluateOne("planted.ts", 'const choices = [...new Set([0,0,1,2,3,4,5].map(n => n === 0 ? "s" : n))].slice(1);');
    expect(evaluated.verdict).toBe("RULED");
  });

  // K45 — callee role and spans, from ITS OWN bytes. The array literal is at
  // (64,77); the outer call is textually 16-87. M17's (16,94) belonged to a
  // different source and is NOT inherited.
  it("evaluates K45: the member is an ARGUMENT, not the callee, and the span is its own", () => {
    const source = "const choices = ((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5].includes);";
    const evaluated = evaluateOne("planted.ts", source);
    expect(evaluated.start).toBe(64);
    expect(evaluated.end).toBe(77);
    expect(source.slice(16, 87)).toBe("((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5].includes)");
    expect(evaluated.consumedStart).toBe(64);
    expect(evaluated.consumedEnd).toBe(87);
    expect(evaluated.verdict).toBe("UNDETERMINED");
  });

  it("evaluates K45's computed-member twin, whose call is textually 16-90", () => {
    const source = 'const choices = ((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5]["includes"]);';
    const evaluated = evaluateOne("planted.ts", source);
    expect(evaluated.start).toBe(64);
    expect(evaluated.end).toBe(77);
    expect(source.slice(16, 90)).toBe('((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5]["includes"])');
    expect(evaluated.consumedEnd).toBe(90);
    expect(evaluated.verdict).toBe("UNDETERMINED");
  });

  // The three bare DOMAIN controls gain RULED evaluated-candidate assertions while
  // remaining on the old emitter for site emission (plan §5.6 R4, round 2 row).
  it.each([
    { spelling: "array option domain", planted: "  {[1, 2, 3, 4, 5].map((value) => value)}", path: "planted.tsx" },
    { spelling: "set option domain", planted: "  const allowed = new Set([1, 2, 3, 4, 5]);", path: "planted.ts" },
    { spelling: "multiline domain enumeration", planted: "  const allowed = [\n    1,\n    2,\n    3,\n    4,\n    5\n  ];", path: "planted.ts" }
  ])("evaluates the bare option-domain control $spelling as RULED by rule 1", ({ planted, path }) => {
    const evaluated = evaluatedCandidatesOf(path, planted);
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0]!.verdict).toBe("RULED");
  });

  // K28 and K38 — the two round-2 mutation baselines, on their canonical sources.
  // Discovery admits neither a mixed array nor an empty one, so both yield NO
  // candidate. Each mutation admits its shape and produces exactly one evaluated
  // UNDETERMINED candidate; asserting the VERDICT LIST makes that the failure
  // message rather than a bare count.
  it.each([
    {
      id: "K28 — a mixed array is not a candidate",
      source: 'const sentinel = "s";\nconst choices = [0, sentinel, 2, 3, 4, 5];'
    },
    {
      id: "K38 — an empty array literal is not a candidate",
      source: "const choices = [].concat(1,2,3,4,5);"
    }
  ])("$id", ({ source }) => {
    // The VERDICT LIST is asserted first so that a mutation which admits the shape
    // reports "one evaluated UNDETERMINED candidate" as its failure message — the
    // observable the manifest binds these rows to — rather than a bare count.
    expect(evaluatedCandidatesOf("planted.ts", source).map((c) => c.verdict)).toEqual([]);
    expect(candidatesOf("planted.ts", source)).toEqual([]);
  });

  // ROUND 1 — the TRUNCATED-PREFIX block. PROPERTY: a source the parser rejects
  // yields exactly ONE conservative INCONCLUSIVE site and never a fabricated
  // DOMAIN_ENUMERATION; discovery yields nothing. Narrowed with a `throw` per
  // §1.13 R4 — an `expect` does not narrow a TypeScript union.
  it("reports exactly one INCONCLUSIVE site for a truncated source, and no candidate", () => {
    const truncated = "export function LoginFlow() {\n  const choices = [1, 2, 3, 4, 5";
    const sites = domainSites("planted.tsx", truncated);
    expect(sites).toHaveLength(1);
    const [site] = sites;
    if (site?.kind !== "INCONCLUSIVE") {
      throw new Error(`expected INCONCLUSIVE, got ${site?.kind ?? "none"}`);
    }
    expect(site.path).toBe("planted.tsx");
    expect(site.line).toBeGreaterThan(0);
    expect(site.diagnostic.length).toBeGreaterThan(0);
    expect(site.text).toBe(site.diagnostic);
    expect(candidatesOf("planted.tsx", truncated)).toEqual([]);
    expect(parseModule("planted.tsx", truncated).ok).toBe(false);
  });

  // A clean parse yields NO domain site in round 1: DOMAIN emission needs the
  // evaluator (round 2) and the rule-1 discriminator (round 3). The old emitter
  // still owns every DOMAIN verdict until then.
  it("emits no domain site from a clean parse while the old emitter still runs", () => {
    expect(domainSites("planted.ts", "const allowed = [1, 2, 3, 4, 5];")).toEqual([]);
  });

  // PROPERTY: exactly ONE line in shipped code fixes the ruled ceiling, and it is
  // the owning declaration. Site-addressed, so a second duplicate inside an
  // already-listed file cannot hide behind the first.
  it("leaves no duplicate definition of the ruled ceiling anywhere in shipped code", () => {
    expect(duplicateBoundSitesInShippedCode()).toEqual([]);
  });

  it("keeps the owning declaration as the only depth-bound site in shipped code", () => {
    expect(depthBoundSitesInShippedCode()).toEqual([
      `${OWNING_DECLARATION.path}:112 [DEPTH_BOUND_LITERAL] ${OWNING_DECLARATION.text}`
    ]);
  });

  // POSITIVE CONTROLS — adversarial by design. The first three are the exact
  // spellings that defeated the r2 oracle (codex r2 B1); the rest cover the
  // forms already seen in this repo. A control must discriminate the CLASS, not
  // re-run the one spelling the author happened to write.
  it.each([
    { spelling: "zod .lte alias", planted: "  depth: z.number().int().gte(1).lte(5)," },
    { spelling: "refinement", planted: "  .superRefine((d, c) => { if (d.depth > 5) c.addIssue({}); })" },
    { spelling: "reversed operands", planted: "  const ready = 1 <= depth && 5 >= depth;" },
    { spelling: "zod .max", planted: "  depth: z.number().int().min(1).max(5)," },
    { spelling: "plain comparison", planted: "  const ready = depth >= 1 && depth <= 5;" },
    { spelling: "exclusive six", planted: "  if (!Number.isInteger(depth) || depth < 6) {" }
  ])("detects a duplicate written as $spelling", ({ planted }) => {
    // ROUND 1: migrated to `ceilingSites` and asserting the KIND, never non-emptiness.
    // An INCONCLUSIVE cannot satisfy this, and `ceilingSites` cannot produce one.
    expect(ceilingSites(planted).map((site) => site.kind)).toEqual(["DEPTH_BOUND_LITERAL"]);
  });

  // THE TWO BARE OPTION-DOMAIN CONTROLS from this block. They are NOT ceiling
  // controls and cannot pass a DEPTH_BOUND_LITERAL assertion. They stay on the old
  // emitter's `WHOLE_DOMAIN` fallback for rounds 1-2 and are routed to `domainSites`
  // in round 3 (plan §5.6 R4).
  it.each([
    { spelling: "array option domain", planted: "  {[1, 2, 3, 4, 5].map((value) => value)}" },
    { spelling: "set option domain", planted: "  const allowed = new Set([1, 2, 3, 4, 5]);" }
  ])("detects a duplicate written as $spelling", ({ planted }) => {
    expect(duplicateBoundSites(planted).map((site) => site.kind)).toEqual(["DOMAIN_ENUMERATION"]);
  });

  // LAYOUT CONTROLS (T1B, codex r3 B1) — the same three CLASSES as above, written
  // across physical lines the way a formatter or a human ordinarily writes them.
  // PROPERTY: a ceiling is found when the depth token and the ceiling literal share
  // a syntactic UNIT, however many lines that unit occupies. The first two are the
  // reviewer's own repro inputs verbatim.
  it.each([
    {
      spelling: "multiline zod chain",
      planted: [
        "const depthSchema = z.number()",
        "  .int()",
        "  .gte(1)",
        "  .lte(5);"
      ].join("\n")
    },
    {
      spelling: "refinement split across lines",
      planted: [
        ".superRefine((d, c) => {",
        "  if (d.depth >",
        "    5) c.addIssue({});",
        "})"
      ].join("\n")
    },
    {
      spelling: "wrapped property inside an object literal",
      planted: [
        "const S = z.object({",
        "  depth: z.number()",
        "    .int()",
        "    .max(5)",
        "});"
      ].join("\n")
    }
  ])("detects a duplicate laid out as $spelling", ({ planted }) => {
    expect(ceilingSites(planted).map((site) => site.kind)).toEqual(["DEPTH_BOUND_LITERAL"]);
  });

  // THE THIRD BARE OPTION-DOMAIN CONTROL, same disposition as the two above.
  it.each([
    {
      spelling: "multiline domain enumeration",
      planted: [
        "  const allowed = [",
        "    1,",
        "    2,",
        "    3,",
        "    4,",
        "    5",
        "  ];"
      ].join("\n")
    }
  ])("detects a duplicate laid out as $spelling", ({ planted }) => {
    expect(duplicateBoundSites(planted).map((site) => site.kind)).toEqual(["DOMAIN_ENUMERATION"]);
  });

  // WRAPPED-CONJUNCT CONTROLS (T1B r1, codex B1). The r1 oracle flushed a unit at
  // `&&`, so the SAME expression was caught on one line and missed when wrapped —
  // which is the one thing this ticket exists to remove. Both orders are asserted,
  // because `&&` commutes: a rule that discriminated by operand order would make
  // the verdict depend on how the author happened to sequence the conjuncts, which
  // is layout dependence wearing a different hat.
  it.each([
    { order: "depth token first", planted: ["const ok = isDepthField(v) &&", "  v <= 5;"].join("\n") },
    { order: "ceiling first", planted: ["const ok = v <= 5 &&", "  isDepthField(v);"].join("\n") },
    { order: "same expression on one line", planted: "const ok = isDepthField(v) && v <= 5;" }
  ])("detects a ceiling wrapped across a conjunct — $order", ({ planted }) => {
    expect(ceilingSites(planted).map((site) => site.kind)).toEqual(["DEPTH_BOUND_LITERAL"]);
  });

  // LAYOUT NEGATIVE CONTROL — MEASURED, not imagined. This is the real shape of
  // apps/ui/app/new/page.tsx:73, which correct code and NOT a second definition:
  // it uses the imported constants. An early T1B build paired its
  // `topic.trim().length > 6` with the `depth` a conjunct away and reported it as
  // a duplicate. Both conjunct orders are asserted, because `&&` commutes and a
  // control that held for only one order would pin nothing.
  //
  // This is what makes the exclusive-`6` arm line-scoped: widen its window and
  // this control goes RED. See `kindOfCeilingLiteral`.
  it.each([
    {
      order: "ceiling first",
      planted: [
        "  const ready = topic.trim().length > 6 &&",
        "    depth >= EXPANSION_DEPTH_MIN &&",
        "    depth <= EXPANSION_DEPTH_MAX &&",
        "    riskTier.length > 0;"
      ].join("\n")
    },
    {
      order: "depth token first",
      planted: [
        "  const ready = depth >= EXPANSION_DEPTH_MIN &&",
        "    topic.trim().length > 6 &&",
        "    riskTier.length > 0;"
      ].join("\n")
    }
  ])("does not pair an unrelated ceiling with a depth a conjunct away — $order", ({ planted }) => {
    expect(ceilingSites(planted)).toEqual([]);
  });

  // EXCLUSIVE-SIX WINDOW — the PAIRED controls (T1B r2, codex B1).
  //
  // r1 argued that the `6` arm is comparison-local and then implemented it as
  // LINE-local, which is not the same claim. Refuting the too-wide declaration
  // window said nothing about the too-narrow line one, and the line window turned
  // out to be wrong in BOTH directions. These two assertions are the pair:
  //
  //   · split   — a newline INSIDE one comparison must not change the verdict
  //   · joined  — collapsing the negative control onto one line must not
  //               manufacture a site
  //
  // Neither can be satisfied by a line window, in either direction, so together
  // they force a layout-independent conjunct unit.
  it.each([
    { layout: "split after the operator", planted: ["if (depth <", "  6) c.stop();"].join("\n") },
    { layout: "same comparison on one line", planted: "if (depth < 6) c.stop();" },
    { layout: "split after a logical operator", planted: ["if (!Number.isInteger(depth) ||", "  depth < 6) {"].join("\n") }
  ])("detects an exclusive six however the comparison is wrapped — $layout", ({ planted }) => {
    expect(ceilingSites(planted).map((site) => site.kind)).toEqual(["DEPTH_BOUND_LITERAL"]);
  });

  // The conjunct boundary must apply at ANY bracket depth, not at the unit's own.
  // A logical operator separates conjuncts just as much inside `if (...)` as at
  // statement level, and with the shallower rule this shape joins into one unit and
  // pairs `> 6` with a `depth` that is not its comparison's operand. Mutant m10 is
  // exactly that shallower rule, and this control is what kills it.
  it("does not pair a six with a depth in another conjunct of the same condition", () => {
    expect(ceilingSites("  if (topic.trim().length > 6 && depth >= EXPANSION_DEPTH_MIN) {")).toEqual([]);
  });

  it("does not manufacture a site when the negative control is collapsed onto one line", () => {
    const collapsed =
      "  const ready = topic.trim().length > 6 && depth >= EXPANSION_DEPTH_MIN && depth <= EXPANSION_DEPTH_MAX && riskTier.length > 0;";
    expect(ceilingSites(collapsed)).toEqual([]);
  });

  // THE ONE DELIBERATE NARROWING, asserted rather than left silent.
  //
  // Everywhere else this oracle is a superset of r3. Here it is not, and the
  // divergence is the whole point of giving the `6` arm its own window: r3 read a
  // crowded LINE and paired a `6` with a `depth` belonging to another conjunct.
  // Both halves are asserted, so if anyone ever restores the `6` arm to the line
  // pass this control fails and says exactly what changed.
  it("narrows r3 in exactly one place: a six bound to something other than the depth", () => {
    const collapsed =
      "  const ready = topic.trim().length > 6 && depth >= EXPANSION_DEPTH_MIN && depth <= EXPANSION_DEPTH_MAX && riskTier.length > 0;";
    expect(kindOf(collapsed)).toBe("DEPTH_BOUND_LITERAL");
    expect(ceilingSites(collapsed)).toEqual([]);
  });

  // NEGATIVE CONTROLS — unrelated depth concepts, and a floor-only guard, are
  // not flagged. Each line is real code from this repo.
  it.each([
    "  if (depth >= limits.maxDepth) {",                              // logger recursion depth
    "      maxDepth: 6,",                                             // logger serialization depth
    "  const depthLimit = boundedDepth(options.causeDepthMax);",      // obs cause depth
    "    topic.trim(), { max_depth: 3, branching: 2, max_tokens: 800 },", // a different depth field
    "    if (!Number.isInteger(depth) || depth < 1) {"                // floor-only, no ceiling literal
  ])("does not flag unrelated depth code: %s", (planted) => {
    expect(ceilingSites(planted)).toEqual([]);
  });

  // FLOOR IMPORT (plan §5.5 R4, codex r0 point 4) — the two ceiling controls this
  // base lacked, adapted from the donor
  // .worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts
  // at 60641339b983365952dd6cd61ed2f379aef6dc8a (donor line 1128). They carry a
  // depth token in reach of a longer index run; the donor asserted them through the
  // old emitter, and they are asserted here through `ceilingSites` with the exact
  // kind. With these two the ceiling floor is 27 on this base.
  it.each([
    { shape: "index run with a depth token in reach", planted: "  const depthSlots = [0, 1, 2, 3, 4, 5];" },
    { shape: "past the ceiling with a depth token in reach", planted: "  const depthChoices = [1, 2, 3, 4, 5, 6];" }
  ])("still catches a longer run when a depth token is in reach — $shape", ({ planted }) => {
    expect(ceilingSites(planted).map((site) => site.kind)).toEqual(["DEPTH_BOUND_LITERAL"]);
  });

  it("names packages/contract as the exported single source", () => {
    const contractSource = readFileSync(join(REPOSITORY_ROOT, "packages/contract/src/index.ts"), "utf8");
    expect(contractSource).toContain(`export const EXPANSION_DEPTH_MIN = ${EXPANSION_DEPTH_MIN}`);
    expect(contractSource).toContain(`export const EXPANSION_DEPTH_MAX = ${EXPANSION_DEPTH_MAX}`);
    const runnerSource = readFileSync(join(REPOSITORY_ROOT, "apps/runner/src/index.ts"), "utf8");
    expect(runnerSource).toMatch(/import\s*\{[^}]*EXPANSION_DEPTH_MAX[^}]*\}\s*from\s*"@debateai\/contract"/);
  });
});

/**
 * J10 reconciliation. The goal ORDERS an exported contract depth constant; the
 * architecture audit forbids exported numeric literals outside
 * published-arithmetic, and J6's imports create two new workspace edges. Both
 * are real law-vs-audit conflicts, and both are settled in the audit — narrowly.
 */
describe("S1-1 · the architecture audit recognizes the ruled exports and edges (J10)", () => {
  // PROPERTY: after J10, this diff contributes NO architecture violation. The
  // audit is the authority, so the audit is what is asserted.
  it("reports no T1-owned architecture or source-rule violation", async () => {
    const [architecture, sourceRules] = await Promise.all([auditArchitecture(), auditSourceRules()]);
    expect(architecture.violations.filter((line) => line.includes("-> contract"))).toEqual([]);
    expect(sourceRules.blocking.filter((line) => line.includes("packages/contract/"))).toEqual([]);
  });

  // PROPERTY: the reconciliation is NARROW. It names two exports in one file —
  // never a package-wide exemption — so a third numeric export in that very file
  // still trips the purity law (proved by mutant m8 in the refutation harness).
  it("exempts exactly the two ruled depth exports, in exactly one file", () => {
    const auditSource = readFileSync(join(REPOSITORY_ROOT, "tools/orphan-audit/src/index.ts"), "utf8");
    const exemption = auditSource.slice(
      auditSource.indexOf("GOAL_RULED_LAW_CARRIERS"),
      auditSource.indexOf("GOAL_RULED_LAW_CARRIERS") + 400
    );
    expect(exemption).toContain("packages/contract/src/index.ts");
    expect(exemption).toContain("EXPANSION_DEPTH_MIN");
    expect(exemption).toContain("EXPANSION_DEPTH_MAX");
    // Narrowness: no directory-prefix or package-wide form.
    expect(exemption).not.toMatch(/startsWith\(\s*["']packages\/contract/);
  });
});
