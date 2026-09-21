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
  readShippedCorpusManifest,
  shippedCorpusDrift,
  writeShippedCorpusManifest
} from "../support/shippedCorpusManifest.js";
import ts from "typescript-classic";
import {
  candidatesOf,
  ceilingSites,
  DEPTH_LIMIT,
  domainSites,
  duplicateBoundSites,
  evaluatedCandidatesOf,
  kindOf,
  NODE_BUDGET,
  parseModule,
  type Cell,
  type EvaluatedCandidate,
  type Site,
  type Value
} from "../support/depthOracle.js";

/**
 * Expectations are DERIVED, never copied from evaluator output (codex r2 B8's
 * lesson): offsets come from the source text itself, and work-limit rows are
 * measured by this file's own independent walker against the recorded semantics.
 */
function spanOf(source: string, fragment: string, occurrence = 0): [number, number] {
  let index = -1;
  for (let seen = 0; seen <= occurrence; seen += 1) index = source.indexOf(fragment, index + 1);
  if (index < 0) throw new Error(`fragment not found in source: ${fragment}`);
  return [index, index + fragment.length];
}

/** Line of an offset, 1-based, derived from the source text. */
function lineOf(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

/** Independently locate the statement containing the named literal's offset. */
function statementLineOf(source: string, offset: number, path: string): number {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let statementStart: number | undefined;
  const visit = (node: ts.Node): void => {
    if (node.getStart(file) > offset || node.getEnd() <= offset) return;
    if (ts.isStatement(node)) statementStart = node.getStart(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (statementStart === undefined) throw new Error("fixture has no owning statement");
  return lineOf(source, statementStart);
}

/** The recorded counter semantics, re-implemented here so the test does not trust the module. */
function measureCallbackBody(source: string): { nodes: number; depth: number } {
  const file = ts.createSourceFile("m.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let arrow: ts.ArrowFunction | undefined;
  const find = (n: ts.Node): void => {
    if (arrow === undefined && ts.isArrowFunction(n)) arrow = n;
    ts.forEachChild(n, find);
  };
  find(file);
  if (arrow === undefined) throw new Error("no arrow function in source");
  let nodes = 0;
  let depth = 0;
  const walk = (n: ts.Node, d: number): void => {
    nodes += 1;
    if (d > depth) depth = d;
    ts.forEachChild(n, (c) => walk(c, d + 1));
  };
  walk(arrow.body, 0);
  return { nodes, depth };
}

/** A numeric-cell Value, built from the spec rather than from observed output. */
function numbers(cells: readonly number[], coll: "array" | "set" = "array"): Value {
  return { kind: "EXACT", coll, cells: cells.map((v) => ({ t: "num" as const, v })) };
}

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
    plan_tier: "free",
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
            plan_tier: "free",
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
 *   DOMAIN_ENUMERATION   a ruled or conservatively unknown numeric-array occurrence
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
    return duplicateBoundSites(path, readFileSync(absolute, "utf8"))
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
    // The corpus is ENUMERATED, not assumed — and it is enumerated BY NAME. A count
    // (`toBe(232)`) is a number standing in for a set: it cannot say which file
    // appeared, it cannot tell an addition from a balancing deletion, and a
    // legitimately landed shipped file reddens this row with a message naming no
    // path. The committed manifest names every scanned file, so a new shipped file
    // is a deliberate manifest edit and a vanished one is reported by name.
    const scannedPaths = scanned.map(
      (absolute) => relative(REPOSITORY_ROOT, absolute).split(sep).join("/")
    );
    if (process.env.SHIPPED_CORPUS_MANIFEST_UPDATE === "1") writeShippedCorpusManifest(scannedPaths);
    const manifest = readShippedCorpusManifest();
    expect(shippedCorpusDrift(scannedPaths, manifest)).toEqual({ added: [], missing: [] });
    // The .tsx share FOLLOWS from the manifest instead of from a second literal.
    expect(scannedPaths.filter((path) => path.endsWith(".tsx")).length)
      .toBe(manifest.filter((path) => path.endsWith(".tsx")).length);
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
    if (process.env.ORACLE_AUDIT === "1") console.log("PARSE_ATTACK_ROW " + JSON.stringify({
      source, path, expected: [], observed: candidatesOf(path, source), strength: "entailed"
    }));
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
    if (process.env.ORACLE_AUDIT === "1") console.log("PARSE_ATTACK_ROW " + JSON.stringify({
      source, path, expected, observed: candidatesOf(path, source), strength: "entailed"
    }));
  });

  // ROUND-1 REWORK (codex r1 B6) — THE FIVE ORIGINAL TRUNCATED PREFIXES, imported from
  // the donor at 60641339b983365952dd6cd61ed2f379aef6dc8a, tests/unit/s1-1-depth-contract.test.ts
  // lines 1048-1052, preserving their wrapping and comment bytes EXACTLY (the 18-space
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
    if (process.env.ORACLE_AUDIT === "1") console.log("TRUNCATED_ATTACK_ROW " + JSON.stringify({
      source: planted, path: "planted.tsx", expected: { candidates: [], sites: [{ kind: "INCONCLUSIVE", line, diagnostic: "Expression expected." }] },
      observed: { candidates: candidatesOf("planted.tsx", planted), sites }, strength: "entailed"
    }));
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
    if (process.env.ORACLE_AUDIT === "1") console.log("PARSE_ATTACK_ROW " + JSON.stringify({
      source, path, expected, observed: candidatesOf(path, source), strength: "entailed"
    }));
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
    // B8: BOTH consumed boundaries move to the consumed owner — here the whole
    // rejected outer call (16,87). The literal identity (64,77) is unchanged.
    expect(evaluated.consumedStart).toBe(16);
    expect(evaluated.consumedEnd).toBe(87);
    expect(evaluated.verdict).toBe("UNDETERMINED");
    expect(domainSites("planted.ts", source)).toEqual([
      { kind: "DOMAIN_ENUMERATION", line: 1, text: source }
    ]);
  });

  it("evaluates K45's computed-member twin, whose call is textually 16-90", () => {
    const source = 'const choices = ((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5]["includes"]);';
    const evaluated = evaluateOne("planted.ts", source);
    expect(evaluated.start).toBe(64);
    expect(evaluated.end).toBe(77);
    expect(source.slice(16, 90)).toBe('((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5]["includes"])');
    expect(evaluated.consumedStart).toBe(16);
    expect(evaluated.consumedEnd).toBe(90);
    expect(evaluated.verdict).toBe("UNDETERMINED");
    expect(domainSites("planted.ts", source)).toEqual([
      { kind: "DOMAIN_ENUMERATION", line: 1, text: source }
    ]);
  });

  // K43's observable KNOWN-RECEIVER check (codex r2 B11): the manifest binds K43 to
  // six known str("x") receiver cells, and asserting only the final UNDETERMINED
  // would be satisfied by an earlier map failure. The receiver prefix is evaluated
  // on its own so the receiver stage is observable.
  it("evaluates K43's receiver prefix to six known str cells", () => {
    const receiver = evaluateOne("planted.ts", 'const receiver = [0,1,2,3,4,5].map(n => "x");');
    expect(receiver.value.kind).toBe("EXACT");
    expect(cellsOf(receiver)).toEqual([
      { t: "str", v: "x" }, { t: "str", v: "x" }, { t: "str", v: "x" },
      { t: "str", v: "x" }, { t: "str", v: "x" }, { t: "str", v: "x" }
    ]);
    expect(receiver.verdict).toBe("OTHER");
    expect(receiver.reason).toBe("applied map");
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

  // ══════ ROUND-2 REWORK — the purity, grammar, work-limit and ownership rows ══════
  // Every row gives COMPLETE source and asserts the verdict AND the attributable
  // reason, so a row cannot be satisfied by an unrelated UNKNOWN. Values measured
  // before assertion (r2/22-rework-measurements.log, r2/23-worklimit-measurements.log).

  // B1 — parameter admission. Only a plain identifier is a parameter this grammar
  // models; an initialiser or a rest token rejects the WHOLE operation. K7's
  // parameter-COUNT mutation stays a separate row.
  it.each([
    {
      id: "B1 a default initialiser on the callback parameter",
      source: "const choices = [0,1,2,3,4,5].map(n=>n===0?undefined:n).map((n=1)=>n);",
      reason: /purity clause 1: the parameter has a default initialiser/
    },
    {
      id: "B1 a rest parameter",
      source: "const choices = [0,1,2,3,4,5].filter((...n) => n);",
      reason: /purity clause 1: the parameter is a rest parameter/
    }
  ])("rejects $id", ({ source, reason }) => {
    const e = evaluateOne("planted.ts", source);
    expect(e.verdict).toBe("UNDETERMINED");
    expect(e.value.kind).toBe("UNKNOWN");
    expect(e.reason).toMatch(reason);
  });

  // B2 — flatMap runs through the SAME purity gate, with its declared array-shape
  // exception. Admission examines the whole syntax; evaluation visits only the
  // selected branch.
  it.each([
    { id: "B2 flatMap with an async callback", source: "const choices = [0,1,2,3,4,5].flatMap(async n => n ? [n] : []);", reason: /purity clause 4: the callback is async/ },
    { id: "B2 flatMap with an assignment in an UNTAKEN branch", source: "const choices = [0,1,2,3,4,5].flatMap(n => true ? [n] : [(n = 1)]);", reason: /purity clause 3: the body contains assignment/ }
  ])("rejects $id", ({ source, reason }) => {
    const e = evaluateOne("planted.ts", source);
    expect(e.verdict).toBe("UNDETERMINED");
    expect(e.reason).toMatch(reason);
  });

  it("admits flatMap's declared return-only block form", () => {
    const e = evaluateOne("planted.ts", "const choices = [0,1,2,3,4,5].flatMap(n => { return n ? [n] : []; });");
    expect(e.verdict).toBe("RULED");
    expect(cellValues(cellsOf(e))).toEqual([1, 2, 3, 4, 5]);
    expect(e.reason).toBe("applied flatMap");
  });

  // B3 — POSITIVE grammar admission: an undeclared operator rejects the whole
  // operation even when it sits in an untaken branch. Neither is evaluated.
  it.each([
    { id: "B3 a prefix increment in an untaken branch", source: "const choices = [0,1,2,3,4,5].map(n => true ? n : ++n);", reason: /the unary operator PlusPlusToken/ },
    { id: "B3 `void` in an untaken branch", source: "const choices = [0,1,2,3,4,5].map(n => true ? n : void n);", reason: /the body contains void/ }
  ])("rejects $id", ({ source, reason }) => {
    const e = evaluateOne("planted.ts", source);
    expect(e.verdict).toBe("UNDETERMINED");
    expect(e.reason).toMatch(reason);
  });

  // B4 — the work limits are measured on the ORIGINAL body node (body = 0,
  // forEachChild), so a return-only block counts its Block and ReturnStatement.
  // Both limits are exhausted independently, and flatMap is measured too.
  const balancedZeroSum = (n: number): string =>
    n === 1 ? "0" : `(${balancedZeroSum(n >> 1)} + ${balancedZeroSum(n - (n >> 1))})`;

  it.each([
    {
      id: "B4 a return-only body of 66 nodes exceeds the 64 budget",
      source: `const choices = [0,1,2,3,4,5].map(n => { return n + ${balancedZeroSum(16)}; }).slice(1);`,
      verdict: "UNDETERMINED" as const
    },
    {
      id: "B4 the same expression as a 64-node expression body is admitted",
      source: `const choices = [0,1,2,3,4,5].map(n => n + ${balancedZeroSum(16)}).slice(1);`,
      verdict: "RULED" as const
    },
    {
      id: "B4 depth 34 exceeds the 32 depth limit, independently of the node count",
      source: `const choices = [0,1,2,3,4,5].map(n => { return ${"(".repeat(32)}n${")".repeat(32)}; }).slice(1);`,
      verdict: "UNDETERMINED" as const
    },
    {
      id: "B4 depth 28 is admitted",
      source: `const choices = [0,1,2,3,4,5].map(n => ${"(".repeat(28)}n${")".repeat(28)}).slice(1);`,
      verdict: "RULED" as const
    },
    {
      id: "B4 flatMap's body is measured too — 129 nodes exceeds the budget",
      source: `const choices = [0,1,2,3,4,5].flatMap(n => [n + ${balancedZeroSum(32)}]).slice(1);`,
      verdict: "UNDETERMINED" as const
    }
  ])("$id", ({ source, verdict }) => {
    expect(evaluateOne("planted.ts", source).verdict).toBe(verdict);
  });

  // B5 — the two missing Prim transfers, with their PAYLOADS pinned.
  it("applies ToBoolean(jsx) = true", () => {
    const e = evaluateOne("planted.tsx", "const choices = [0,1,2,3,4,5].map(n => (<span/>)).map(n => n ? 1 : 0);");
    expect(cellsOf(e)).toEqual([
      { t: "num", v: 1 }, { t: "num", v: 1 }, { t: "num", v: 1 },
      { t: "num", v: 1 }, { t: "num", v: 1 }, { t: "num", v: 1 }
    ]);
    expect(e.verdict).toBe("OTHER");
  });

  it.each([
    { id: "null renders as \"null\"", source: 'const choices = [0,1,2,3,4,5].map(n => "" + null);', text: "null" },
    { id: "undefined renders as \"undefined\"", source: 'const choices = [0,1,2,3,4,5].map(n => undefined + "");', text: "undefined" }
  ])("renders in string concatenation: $id", ({ source, text }) => {
    const e = evaluateOne("planted.ts", source);
    expect(cellsOf(e)).toEqual(Array.from({ length: 6 }, () => ({ t: "str", v: text })));
    expect(e.verdict).toBe("OTHER");
  });

  // B6 — zero-argument splice removes NOTHING, after a ruled derivation so the
  // error would change the verdict.
  it("distinguishes splice() from splice(start)", () => {
    const zero = evaluateOne("planted.ts", "const choices = [0,1,2,3,4,5].slice(1).splice();");
    expect(zero.verdict).toBe("OTHER");
    expect(cellsOf(zero)).toEqual([]);
    const one = evaluateOne("planted.ts", "const choices = [0,1,2,3,4,5].splice(1);");
    expect(one.verdict).toBe("RULED");
    expect(cellValues(cellsOf(one))).toEqual([1, 2, 3, 4, 5]);
  });

  // B7 — unsupported binding forms are REJECTED before any output is classified.
  it.each([
    { id: "a nested array binding pattern", source: "const [[head, ...choices]] = [[0,1,2,3,4,5]];", reason: /nested binding pattern/ },
    { id: "a nested pattern behind a rest token", source: "const [...[head, ...choices]] = [0,1,2,3,4,5];", reason: /nested binding pattern/ },
    { id: "a defaulted binding element", source: "const [choices = Array.from({length:5}, (_,i)=>i+1)] = [0,1,2,3,4,5].map(n=>undefined);", reason: /defaulted binding element/ }
  ])("rejects $id", ({ source, reason }) => {
    const e = evaluateOne("planted.ts", source);
    expect(e.verdict).toBe("UNDETERMINED");
    expect(e.reason).toMatch(reason);
  });

  // B8 — both consumed boundaries move with the owner; the literal identity does not.
  it.each([
    { id: "a transparent wrapper", source: "const choices = ([0,1,2,3,4,5] as const).slice(1);", start: 17, end: 30, cs: 6, ce: 49 },
    { id: "an array binding declaration", source: "const [, ...choices] = [0,1,2,3,4,5];", start: 23, end: 36, cs: 6, ce: 36 }
  ])("carries both consumed boundaries through $id", ({ source, start, end, cs, ce }) => {
    const e = evaluateOne("planted.ts", source);
    expect([e.start, e.end]).toEqual([start, end]);
    expect([e.consumedStart, e.consumedEnd]).toEqual([cs, ce]);
    expect(e.verdict).toBe("RULED");
  });

  // B9 — exact sibling spreads fold in order; an unmodelled sibling stays UNKNOWN.
  it("folds exact sibling spreads in order, to the ruled domain", () => {
    const all = evaluatedCandidatesOf("planted.ts", "const choices = [...[1,2,3], ...[4,5]];");
    expect(all).toHaveLength(2);
    for (const e of all) {
      expect(e.verdict).toBe("RULED");
      expect(cellValues(cellsOf(e))).toEqual([1, 2, 3, 4, 5]);
      expect(e.reason).toBe("spread folded into the enclosing array, in order");
    }
  });

  it("folds exact sibling spreads to a decided non-ruled value", () => {
    const all = evaluatedCandidatesOf("planted.ts", "const choices = [...[0,1,2], ...[3,4,5]];");
    expect(all).toHaveLength(2);
    for (const e of all) {
      expect(e.verdict).toBe("OTHER");
      expect(cellValues(cellsOf(e))).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("reports when a sibling spread is not exact under the admitted grammar", () => {
    const e = evaluateOne("planted.ts", "const choices = [...[0,1,2,3,4,5], ...other].slice(1);");
    expect(e.verdict).toBe("UNDETERMINED");
  });

  // B10 — the receiver-state continuation rule comes BEFORE freeze identity.
  it("applies NOT_ARRAY continuation before Object.freeze identity", () => {
    const scalar = evaluateOne("planted.ts", 'const choices = Object.freeze([0,1,2,3,4,5].join(""));');
    expect(scalar.verdict).toBe("UNDETERMINED");
    expect(scalar.value.kind).toBe("UNKNOWN");
    expect(scalar.reason).toMatch(/continuation yields UNKNOWN/);
    const exactValue = evaluateOne("planted.ts", "const choices = Object.freeze([0,1,2,3,4,5]).slice(1);");
    expect(exactValue.verdict).toBe("RULED");
  });

  // Further §3 rows the stage contract calls for.
  it("sorts by String(cell), not numerically", () => {
    const e = evaluateOne("planted.ts", "const choices = [0,1,2,3,4,5,10].sort().slice(1,-1);");
    expect(cellValues(cellsOf(e))).toEqual([1, 10, 2, 3, 4]);
    expect(e.verdict).toBe("OTHER");
  });

  it.each([
    { id: "the same sentinel twice dedupes", source: 'const choices = [...new Set([0,6,1,2,3,4,5].map(n => n===0?"a":n===6?"a":n))].slice(2);', verdict: "OTHER" as const, cells: [2, 3, 4, 5] },
    { id: "two different sentinels do not", source: 'const choices = [...new Set([0,6,1,2,3,4,5].map(n => n===0?"a":n===6?"b":n))].slice(2);', verdict: "RULED" as const, cells: [1, 2, 3, 4, 5] }
  ])("applies SameValueZero to Set: $id", ({ source, verdict, cells }) => {
    const e = evaluateOne("planted.ts", source);
    expect(cellValues(cellsOf(e))).toEqual(cells);
    expect(e.verdict).toBe(verdict);
  });

  // CONTRACT AMENDMENT A1 (codex r2 F1) — terminal consumption of a decided scalar,
  // with its POSITIVE case and its CONSERVATIVE counter-controls. The counter-controls
  // are what keep this from being a blanket NOT_ARRAY exemption.
  it("ends the chain when a decided scalar is discarded in a condition slot (amendment A1)", () => {
    const e = evaluateOne("planted.ts", "if (a || [502,503,504].includes(s)) { }");
    expect(e.verdict).toBe("OTHER");
    expect(e.value.kind).toBe("NOT_ARRAY");
    expect(e.reason).toMatch(/terminal consumption/);
  });

  it.each([
    { id: "new Set over a scalar could still yield an array of characters", source: 'const choices = new Set([0,1,2,3,4,5].join(""));' },
    { id: "a member access over a scalar could still yield an array", source: 'const choices = [0,1,2,3,4,5].join("").split("");' },
    { id: "an operation over NOT_ARRAY reports (K50)", source: 'const choices = [0,1,2,3,4,5].join("").split("").map(n => +n).slice(1);' }
  ])("amendment A1 does NOT absorb: $id", ({ source }) => {
    expect(evaluateOne("planted.ts", source).verdict).toBe("UNDETERMINED");
  });

  // ══════════ R3 — THE COMPLETE EVALUATED-RECORD TABLE ══════════
  //
  // Each row asserts the WHOLE record: discovery identity, both display lines,
  // BOTH consumed boundaries, the whole Value (kind, collection and every cell
  // payload), the verdict and the reason. Identity and spans are DERIVED from
  // the source text by `spanOf`/`lineOf` — never copied from evaluator output.
  it.each([
    {
      id: "C2 multiline rule 1: owning statement differs from consumed literal",
      source: "const allowed =\n  [1,2,3,4,5];",
      literal: "[1,2,3,4,5]", consumed: "[1,2,3,4,5]",
      value: numbers([1, 2, 3, 4, 5]), verdict: "RULED" as const,
      reason: "rule 1: the candidate's own distinct set is the ruled domain"
    },
    {
      id: "a bare ruled literal decided by rule 1",
      source: "const allowed = [1,2,3,4,5];",
      literal: "[1,2,3,4,5]", consumed: "[1,2,3,4,5]",
      value: numbers([1, 2, 3, 4, 5]), verdict: "RULED" as const,
      reason: "rule 1: the candidate's own distinct set is the ruled domain"
    },
    {
      id: "a suffix slice over a non-ruled literal",
      source: "const choices = [0,1,2,3,4,5].slice(1);",
      literal: "[0,1,2,3,4,5]", consumed: "choices = [0,1,2,3,4,5].slice(1)",
      value: numbers([1, 2, 3, 4, 5]), verdict: "RULED" as const,
      reason: "applied slice"
    },
    {
      id: "a transparent as-wrapper",
      source: "const choices = ([0,1,2,3,4,5] as const).slice(1);",
      literal: "[0,1,2,3,4,5]", consumed: "choices = ([0,1,2,3,4,5] as const).slice(1)",
      value: numbers([1, 2, 3, 4, 5]), verdict: "RULED" as const,
      reason: "applied slice"
    },
    {
      id: "a Set converted back to an array by spread, then sliced",
      source: "const choices = [...new Set([0,1,2,3,4,5])].slice(1);",
      literal: "[0,1,2,3,4,5]", consumed: "choices = [...new Set([0,1,2,3,4,5])].slice(1)",
      value: numbers([1, 2, 3, 4, 5]), verdict: "RULED" as const,
      reason: "applied slice"
    },
    {
      id: "an ordered reverse then slice",
      source: "const choices = [0,1,2,3,4,5].reverse().slice(1);",
      literal: "[0,1,2,3,4,5]", consumed: "choices = [0,1,2,3,4,5].reverse().slice(1)",
      value: numbers([4, 3, 2, 1, 0]), verdict: "OTHER" as const,
      reason: "applied slice"
    },
    {
      id: "a decided scalar from includes",
      source: 'const flag = [0,1,2,3,4,5].includes(3);',
      literal: "[0,1,2,3,4,5]", consumed: "flag = [0,1,2,3,4,5].includes(3)",
      value: { kind: "NOT_ARRAY" } as Value, verdict: "OTHER" as const,
      reason: "applied includes"
    },
    {
      id: "K45 — the member is an ARGUMENT, so the whole rejected call is consumed",
      source: "const choices = ((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5].includes);",
      literal: "[0,1,2,3,4,5]",
      consumed: "((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5].includes)",
      value: { kind: "UNKNOWN" } as Value, verdict: "UNDETERMINED" as const,
      reason: "the candidate is an argument to an unmodelled call"
    },
    {
      id: "A1 — a decided scalar discarded in a condition context",
      source: "if (a || [502,503,504].includes(s)) { }",
      literal: "[502,503,504]", consumed: "if (a || [502,503,504].includes(s)) { }",
      value: { kind: "NOT_ARRAY" } as Value, verdict: "OTHER" as const,
      reason: "terminal consumption: a decided scalar discarded in a condition context (amendment A1)"
    },
    {
      id: "R1 — the same shape OUTSIDE a condition context continues, and reports",
      source: 'const choices = ([0,1,2,3,4,5].join("") || "").split("").map(n => +n).slice(1);',
      literal: "[0,1,2,3,4,5]", consumed: '[0,1,2,3,4,5].join("") || ""',
      value: { kind: "UNKNOWN" } as Value, verdict: "UNDETERMINED" as const,
      reason: "unmodelled owner"
    },
    {
      id: "R2 — a sibling spread through a transparent wrapper folds in order",
      source: "const choices = [...([1,2,3]), ...([4,5])];",
      literal: "[1,2,3]", consumed: "choices = [...([1,2,3]), ...([4,5])]",
      value: numbers([1, 2, 3, 4, 5]), verdict: "RULED" as const,
      reason: "spread folded into the enclosing array, in order"
    },
    {
      id: "a nested payload opened by an array binding",
      source: "const [choices] = [[0,1,2,3,4,5].slice(1)];",
      literal: "[0,1,2,3,4,5]", consumed: "[choices] = [[0,1,2,3,4,5].slice(1)]",
      value: numbers([1, 2, 3, 4, 5]), verdict: "RULED" as const,
      reason: "array binding: a bound output is the ruled domain"
    },
    {
      id: "the comma operator discards a left operand",
      source: "const slots = ([0,1,2,3,4,5], 7);",
      literal: "[0,1,2,3,4,5]", consumed: "[0,1,2,3,4,5], 7",
      value: { kind: "NOT_ARRAY" } as Value, verdict: "OTHER" as const,
      reason: "comma operator: the candidate's value is discarded"
    }
  ])("records the complete evaluated candidate for $id", (row) => {
    const { source, literal, consumed } = row;
    const [start, end] = spanOf(source, literal);
    const [consumedStart, consumedEnd] = spanOf(source, consumed);
    const path = source.includes("<") ? "planted.tsx" : "planted.ts";
    // The row NAMES which literal it is about, so the candidate is selected by the
    // derived offset rather than by assuming the source has exactly one.
    const evaluated = evaluatedCandidatesOf(path, source).find((c) => c.start === start);
    if (evaluated === undefined) {
      throw new Error(`no candidate at the derived offset ${start} in: ${source}`);
    }
    expect({
      start: evaluated.start,
      end: evaluated.end,
      elementLine: evaluated.elementLine,
      statementLine: evaluated.statementLine,
      consumedStart: evaluated.consumedStart,
      consumedEnd: evaluated.consumedEnd,
      value: evaluated.value,
      verdict: evaluated.verdict,
      reason: evaluated.reason
    }).toEqual({
      start, end,
      elementLine: lineOf(source, start),
      statementLine: statementLineOf(source, start, path),
      consumedStart, consumedEnd,
      value: row.value,
      verdict: row.verdict,
      reason: row.reason
    });
  });

  // PROPERTY C1: every admitted sibling operand folds to the same ordered Value
  // from BOTH literal occurrences. Missing downward computed/comma rules break it.
  it.each([
    { form: "computed member", source: 'const choices = [...[1,2,3], ...[0,4,5]["slice"](1)];' },
    { form: "comma right", source: "const choices = [...[1,2,3], ...(0,[4,5])];" },
    { form: "both computed", source: 'const choices = [...[0,1,2,3]["slice"](1), ...[0,4,5]["slice"](1)];' },
    { form: "parentheses", source: "const choices = [...([1,2,3]), ...([4,5])];" },
    { form: "Set", source: "const choices = [...new Set([1,2,3]), ...new Set([4,5])];" },
    { form: "slice", source: "const choices = [...[0,1,2,3].slice(1), ...[3,4,5].slice(1)];" },
    { form: "as const", source: "const choices = [...([1,2,3] as const), ...([4,5] as const)];" },
    { form: "freeze", source: "const choices = [...Object.freeze([1,2,3]), ...Object.freeze([4,5])];" },
    { form: "Array.from", source: "const choices = [...Array.from([1,2,3]), ...Array.from([4,5])];" },
    { form: "satisfies", source: "const choices = [...([1,2,3] satisfies number[]), ...([4,5] satisfies number[])];" },
    { form: "template coercion", source: 'const choices = [...[1,2,3], ...[0,4,5].map(n => `${n}`).map(n => +n).slice(1)];' }
  ])("C1 folds both occurrences through $form", ({ source }) => {
    const all = evaluatedCandidatesOf("planted.ts", source);
    expect(all).toHaveLength(2);
    for (const evaluated of all) {
      expect(evaluated.value).toEqual(numbers([1, 2, 3, 4, 5]));
      expect(evaluated.verdict).toBe("RULED");
    }
  });

  // PROPERTY C1: unsupported sibling values remain reported; widening a sibling
  // literal to arbitrary strings/templates or mistaking an argument for a callee breaks it.
  it.each([
    'const choices = [...[1,2,3], ...["4","5"]];',
    'const choices = [...[1,2,3], ...[`4`,`5`]];',
    'const choices = [...[1,2,3], ...[0,4,5][method](1)];',
    'const choices = [...[1,2,3], ...f([0,4,5]["slice"])];',
    'const choices = [...[1,2,3], ...[0,4,5]["slice"](1,2,3)];',
    'const choices = [...[1,2,3], ...[0,4,5]["slice"](...args)];'
  ])("C1 reports an unsupported sibling %s", (source) => {
    const all = evaluatedCandidatesOf("planted.ts", source);
    expect(all.length).toBeGreaterThan(0);
    for (const e of all) {
      expect(e.value).toEqual({ kind: "UNKNOWN" });
      expect(e.verdict).toBe("UNDETERMINED");
    }
  });

  // PROPERTY C2: the policy is 64 nodes / depth 32 on the ORIGINAL body, with
  // each boundary crossed by exactly one and the other limit unexhausted.
  // The balanced sum has 60 nodes including `n +`; parentheses add one each.
  // These fixtures never use an imported limit to choose an expectation.
  const zeroSum = (n: number): string => (n === 1 ? "0" : `(${zeroSum(n >> 1)} + ${zeroSum(n - (n >> 1))})`);
  const nest = (k: number, inner: string): string => "(".repeat(k) + inner + ")".repeat(k);
  const limitPairs = (["map", "flatMap"] as const).flatMap((operation) =>
    ([false, true] as const).flatMap((block) =>
      (["nodes", "depth"] as const).flatMap((axis) =>
        ([false, true] as const).map((exhausted) => {
          const overhead = (operation === "flatMap" ? 1 : 0) + (block ? 2 : 0);
          const inner = axis === "nodes"
            ? nest(4 - overhead + Number(exhausted), `n + ${zeroSum(15)}`)
            : nest(32 - overhead + Number(exhausted), "n");
          const expression = operation === "flatMap" ? `[${inner}]` : inner;
          const body = block ? `{ return ${expression}; }` : expression;
          return {
            id: `${operation}/${block ? "block" : "expression"}/${axis}/${exhausted ? "exhausted" : "admitted"}`,
            source: `const choices = [0,1,2,3,4,5].${operation}(n => ${body});`,
            operation, axis, exhausted
          };
        }))));
  it.each(limitPairs)("C2 exact original-body limit $id", ({ source, operation, axis, exhausted }) => {
    expect([NODE_BUDGET, DEPTH_LIMIT]).toEqual([64, 32]);
    const measured = measureCallbackBody(source);
    if (axis === "nodes") {
      expect(measured.nodes).toBe(exhausted ? 65 : 64);
      expect(measured.depth).toBeLessThan(32);
    } else {
      expect(measured.depth).toBe(exhausted ? 33 : 32);
      expect(measured.nodes).toBeLessThan(64);
    }
    const e = evaluateOne("planted.ts", source);
    expect(e.value).toEqual(exhausted ? { kind: "UNKNOWN" } : numbers([0, 1, 2, 3, 4, 5]));
    expect(e.verdict).toBe(exhausted ? "UNDETERMINED" : "OTHER");
    expect(e.reason).toBe(exhausted
      ? `${operation}: work limit: ${axis === "nodes" ? "65 counted nodes exceeds the node budget 64" : "depth 33 exceeds the depth limit 32"}`
      : `applied ${operation}`);
  });

  // ═══════ THE REVIEWER'S ATTACK LIST, RE-RUN AS A CHECKLIST ═══════
  //
  // MANDATED: every counterexample class codex used in r1, r1b, r2 and r2b, with
  // the verdict the SPEC requires. The filed table (class · input · spec-expected ·
  // observed · STRENGTH) is r2/36-attack-checklist.log.
  const historicalAttacks: { round: string; cls: string; source: string; expected: string; path?: string; count?: number }[] = [
    // ── r1 (plan review era) ──
    { round: "r1", cls: "K31 out-of-grammar callback (array literal + element access)", source: "const choices = [0,1,2,3,4,5].map(n => [n,n][0]).slice(1);", expected: "UNDETERMINED" },
    { round: "r1", cls: "K43 rule-1 masking: the inner literal IS the domain", source: "const choices = [[1,2,3,4,5]].at(0);", expected: "RULED" },
    { round: "r1", cls: "K10 boolean-result OR over a Set, then slice", source: "const choices = [...new Set([0,1,2,3,4,5].map(n => n || 1))].slice(1);", expected: "OTHER" },
    { round: "r1", cls: "K9/K48 shared fixture: the truthiness filter", source: "const choices = [0,1,2,3,4,5].filter(n => n);", expected: "RULED" },
    // ── r1b ──
    { round: "r1b", cls: "K7d old form: two purity clauses at once", source: "const choices = [0,1,2,3,4,5].map(n => { let m = 0; m = n; return m; });", expected: "UNDETERMINED" },
    { round: "r1b", cls: "K7d new form: assignment ALONE", source: "const choices = [0,1,2,3,4,5].map(n => (n = n));", expected: "UNDETERMINED" },
    // ── r2 B1–B11 ──
    { round: "r2 B1", cls: "default parameter initialiser", source: "const choices = [0,1,2,3,4,5].map(n=>n===0?undefined:n).map((n=1)=>n);", expected: "UNDETERMINED" },
    { round: "r2 B1", cls: "rest parameter", source: "const choices = [0,1,2,3,4,5].filter((...n) => n);", expected: "UNDETERMINED" },
    { round: "r2 B2", cls: "flatMap with an async callback", source: "const choices = [0,1,2,3,4,5].flatMap(async n => n ? [n] : []);", expected: "UNDETERMINED" },
    { round: "r2 B2", cls: "flatMap, assignment in an UNTAKEN branch", source: "const choices = [0,1,2,3,4,5].flatMap(n => true ? [n] : [(n = 1)]);", expected: "UNDETERMINED" },
    { round: "r2 B2", cls: "flatMap, admitted return-only block", source: "const choices = [0,1,2,3,4,5].flatMap(n => { return n ? [n] : []; });", expected: "RULED" },
    { round: "r2 B3", cls: "prefix increment in an untaken branch", source: "const choices = [0,1,2,3,4,5].map(n => true ? n : ++n);", expected: "UNDETERMINED" },
    { round: "r2 B3", cls: "void in an untaken branch", source: "const choices = [0,1,2,3,4,5].map(n => true ? n : void n);", expected: "UNDETERMINED" },
    { round: "r2 B5", cls: "ToBoolean(jsx) is true", source: "const choices = [0,1,2,3,4,5].map(n => (<span/>)).map(n => n ? 1 : 0);", expected: "OTHER", path: "planted.tsx" },
    { round: "r2 B5", cls: "null renders in concatenation", source: 'const choices = [0,1,2,3,4,5].map(n => "" + null);', expected: "OTHER" },
    { round: "r2 B5", cls: "undefined renders in concatenation", source: 'const choices = [0,1,2,3,4,5].map(n => undefined + "");', expected: "OTHER" },
    { round: "r2 B6", cls: "zero-argument splice removes nothing", source: "const choices = [0,1,2,3,4,5].slice(1).splice();", expected: "OTHER" },
    { round: "r2 B7", cls: "nested array binding pattern", source: "const [[head, ...choices]] = [[0,1,2,3,4,5]];", expected: "UNDETERMINED" },
    { round: "r2 B7", cls: "nested pattern behind a rest token", source: "const [...[head, ...choices]] = [0,1,2,3,4,5];", expected: "UNDETERMINED" },
    { round: "r2 B7", cls: "defaulted binding element", source: "const [choices = Array.from({length:5}, (_,i)=>i+1)] = [0,1,2,3,4,5].map(n=>undefined);", expected: "UNDETERMINED" },
    { round: "r2 B8", cls: "K45 — the member is an argument", source: "const choices = ((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5].includes);", expected: "UNDETERMINED" },
    { round: "r2 B9", cls: "two exact sibling spreads", source: "const choices = [...[0,1,2,3,4,5], ...[6]].slice(1);", count: 2, expected: "OTHER" },
    { round: "r2 B10", cls: "freeze over a decided scalar", source: 'const choices = Object.freeze([0,1,2,3,4,5].join(""));', expected: "UNDETERMINED" },
    // ── r2b R1: the logical-operator counterexamples ──
    { round: "r2b R1", cls: "|| then split — continuation must not be hidden", source: 'const choices = ([0,1,2,3,4,5].join("") || "").split("").map(n => +n).slice(1);', expected: "UNDETERMINED" },
    { round: "r2b R1", cls: "?? then split", source: 'const choices = ([0,1,2,3,4,5].join("") ?? "").split("").map(n => +n).slice(1);', expected: "UNDETERMINED" },
    { round: "r2b R1", cls: "&& right operand then split", source: 'const choices = (true && [0,1,2,3,4,5].join("")).split("").map(n=>+n).slice(1);', expected: "UNDETERMINED" },
    { round: "r2b R1", cls: "the OR itself yields the array", source: "const choices = [0,1,2,3,4,5].includes(7) || Array.from({length:5}, (_,i)=>i+1);", expected: "UNDETERMINED" },
    { round: "r2b R1", cls: "the AND itself yields the array", source: "const choices = [0,1,2,3,4,5].includes(0) && Array.from({length:5}, (_,i)=>i+1);", expected: "UNDETERMINED" },
    { round: "r2b R1", cls: "the ?? itself yields the array", source: "const choices = [0,1,2,3,4,5].at(99) ?? Array.from({length:5}, (_,i)=>i+1);", expected: "UNDETERMINED" },
    { round: "r2b R1", cls: "unary ! then an unknown enclosing call", source: "const choices = f(![0,1,2,3,4,5].includes(0));", expected: "UNDETERMINED" },
    { round: "r2b R1", cls: "the shipped if-condition still terminates", source: "if (a || [502,503,504].includes(s)) { }", expected: "OTHER" },
    { round: "r2b R1", cls: "K50 paired control — differs ONLY by the logical wrapper", source: 'const choices = [0,1,2,3,4,5].join("").split("").map(n => +n).slice(1);', expected: "UNDETERMINED" },
    // ── r2b R2: sibling operands under the admitted grammar ──
    { round: "r2b R2", cls: "sibling spreads through parentheses", source: "const choices = [...([1,2,3]), ...([4,5])];", count: 2, expected: "RULED" },
    { round: "r2b R2", cls: "sibling spreads through new Set", source: "const choices = [...new Set([1,2,3]), ...new Set([4,5])];", count: 2, expected: "RULED" },
    { round: "r2b R2", cls: "sibling spreads derived by slice", source: "const choices = [...[0,1,2,3].slice(1), ...[3,4,5].slice(1)];", count: 2, expected: "RULED" },
    { round: "r2b R2", cls: "sibling spreads through as const", source: "const choices = [...([1,2,3] as const), ...([4,5] as const)];", count: 2, expected: "RULED" },
    { round: "r2b R2", cls: "sibling spreads through Object.freeze", source: "const choices = [...Object.freeze([1,2,3]), ...Object.freeze([4,5])];", count: 2, expected: "RULED" },
    { round: "r2b R2", cls: "an unmodelled sibling still reports", source: "const choices = [...[0,1,2,3,4,5], ...other].slice(1);", expected: "UNDETERMINED" }
    ,{ round: "r2 B4", cls: "flatMap depth exhaustion", source: `const choices = [0,1,2,3,4,5].flatMap(n => [${nest(32, "n")}]).slice(1);`, expected: "UNDETERMINED" },
    { round: "r1b F3", cls: "left-associative arithmetic can isolate the node budget", source: `const choices = [0,1,2,3,4,5].map(n => n${" + 0".repeat(22)}).slice(1);`, expected: "UNDETERMINED" },
    { round: "r2c C1", cls: "computed sibling member", source: 'const choices = [...[1,2,3], ...[0,4,5]["slice"](1)];', expected: "RULED", count: 2 },
    { round: "r2c C1", cls: "comma sibling right value", source: "const choices = [...[1,2,3], ...(0,[4,5])];", expected: "RULED", count: 2 },
    { round: "r2c C1", cls: "Array.from sibling", source: "const choices = [...Array.from([1,2,3]), ...Array.from([4,5])];", expected: "RULED", count: 2 }
  ];
  it.each(historicalAttacks)("attack checklist [$round] $cls", ({ source, expected, path, count, round, cls }) => {
    expect(parseModule(path ?? "planted.ts", source).ok).toBe(true);
    const all = evaluatedCandidatesOf(path ?? "planted.ts", source);
    if (process.env.ORACLE_AUDIT === "1") console.log("ATTACK_ROW " + JSON.stringify({
      round, cls, source, expected: Array(count ?? 1).fill(expected), observed: all.map((e) => e.verdict), strength: "entailed"
    }));
    expect(all.map((e) => e.verdict)).toEqual(Array(count ?? 1).fill(expected));
  });


  // PROPERTY C3: each row pins a clause/member of the operative §3 contract.
  // A missing exact transfer must fail its admitted side; an unsound widening
  // must fail its rejected side. Expectations were filed before evaluation in
  // r3/09-boundary-inventory.md. Always-UNKNOWN and spec-silent sides say so.
  type BoundaryRecord = { value: Value; verdict: string; reason?: string };
  type BoundaryCase = { source: string; records: BoundaryRecord[] };
  type BoundaryRule = { id: string; rule: string; admitted: BoundaryCase; rejected: BoundaryCase; note?: string };
  const boundaryRules: BoundaryRule[] = [
    {"id":"C3-001","rule":"§3.9 clause 1 — map count-zero","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(() => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"0 parameters"}]}},
    {"id":"C3-002","rule":"§3.9 clause 1 — map count-two","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map((n, i) => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"2 parameters"}]}},
    {"id":"C3-003","rule":"§3.9 clause 1 — map default","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map((n = 1) => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"default initialiser"}]}},
    {"id":"C3-004","rule":"§3.9 clause 1 — map rest","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map((...n) => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"rest parameter"}]}},
    {"id":"C3-005","rule":"§3.9 clause 1 — map optional","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map((n?: number) => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"optional"}]}},
    {"id":"C3-006","rule":"§3.9 clause 1 — map pattern","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(({n}) => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"binding pattern"}]}},
    {"id":"C3-007","rule":"§3.9 clause 2 — map extra statement","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => { return n; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => { const k = 0; return n; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-008","rule":"§3.9 clause 2 — map return absent","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => { return n; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => {});","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-009","rule":"§3.9 clause 2 — map bare return","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => { return n; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => { return; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-010","rule":"§3.9 clause 4 — map async","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(async n => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"async"}]}},
    {"id":"C3-011","rule":"§3.9 clause 4 — map generator","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(function* (n) { return n; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"generator"}]}},
    {"id":"C3-012","rule":"§3.9 callback syntax — map named callback","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"not a function expression"}]}},
    {"id":"C3-013","rule":"§3.9 function expression — map return-only function","admitted":{"source":"const result = [0,1,2,3,4,5].map(function (n) { return n; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(function (n) { let k; return n; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-014","rule":"§3.15 arity — map no argument","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-015","rule":"§3.15 arity — map second argument","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => n, context);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-016","rule":"§3.15 arity — map spread argument","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(...callbacks);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-017","rule":"§3.9 clause 1 — filter count-zero","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(() => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"0 parameters"}]}},
    {"id":"C3-018","rule":"§3.9 clause 1 — filter count-two","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter((n, i) => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"2 parameters"}]}},
    {"id":"C3-019","rule":"§3.9 clause 1 — filter default","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter((n = 1) => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"default initialiser"}]}},
    {"id":"C3-020","rule":"§3.9 clause 1 — filter rest","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter((...n) => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"rest parameter"}]}},
    {"id":"C3-021","rule":"§3.9 clause 1 — filter optional","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter((n?: number) => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"optional"}]}},
    {"id":"C3-022","rule":"§3.9 clause 1 — filter pattern","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(({n}) => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"binding pattern"}]}},
    {"id":"C3-023","rule":"§3.9 clause 2 — filter extra statement","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => { return n; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => { const k = 0; return n; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-024","rule":"§3.9 clause 2 — filter return absent","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => { return n; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => {});","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-025","rule":"§3.9 clause 2 — filter bare return","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => { return n; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => { return; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-026","rule":"§3.9 clause 4 — filter async","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(async n => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"async"}]}},
    {"id":"C3-027","rule":"§3.9 clause 4 — filter generator","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(function* (n) { return n; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"generator"}]}},
    {"id":"C3-028","rule":"§3.9 callback syntax — filter named callback","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(callback);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"not a function expression"}]}},
    {"id":"C3-029","rule":"§3.9 function expression — filter return-only function","admitted":{"source":"const result = [0,1,2,3,4,5].filter(function (n) { return n; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(function (n) { let k; return n; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-030","rule":"§3.15 arity — filter no argument","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-031","rule":"§3.15 arity — filter second argument","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => n, context);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-032","rule":"§3.15 arity — filter spread argument","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied filter"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(...callbacks);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-033","rule":"§3.9 clause 1 — flatMap count-zero","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(() => n ? [n] : []);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"0 parameters"}]}},
    {"id":"C3-034","rule":"§3.9 clause 1 — flatMap count-two","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap((n, i) => n ? [n] : []);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"2 parameters"}]}},
    {"id":"C3-035","rule":"§3.9 clause 1 — flatMap default","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap((n = 1) => n ? [n] : []);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"default initialiser"}]}},
    {"id":"C3-036","rule":"§3.9 clause 1 — flatMap rest","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap((...n) => n ? [n] : []);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"rest parameter"}]}},
    {"id":"C3-037","rule":"§3.9 clause 1 — flatMap optional","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap((n?: number) => n ? [n] : []);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"optional"}]}},
    {"id":"C3-038","rule":"§3.9 clause 1 — flatMap pattern","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(({n}) => n ? [n] : []);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"binding pattern"}]}},
    {"id":"C3-039","rule":"§3.9 clause 2 — flatMap extra statement","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => { return n ? [n] : []; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => { const k = 0; return n ? [n] : []; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-040","rule":"§3.9 clause 2 — flatMap return absent","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => { return n ? [n] : []; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => {});","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-041","rule":"§3.9 clause 2 — flatMap bare return","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => { return n ? [n] : []; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => { return; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-042","rule":"§3.9 clause 4 — flatMap async","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(async n => n ? [n] : []);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"async"}]}},
    {"id":"C3-043","rule":"§3.9 clause 4 — flatMap generator","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(function* (n) { return n ? [n] : []; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"generator"}]}},
    {"id":"C3-044","rule":"§3.9 callback syntax — flatMap named callback","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(callback);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"not a function expression"}]}},
    {"id":"C3-045","rule":"§3.9 function expression — flatMap return-only function","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(function (n) { return n ? [n] : []; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(function (n) { let k; return n ? [n] : []; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"purity clause 2"}]}},
    {"id":"C3-046","rule":"§3.15 arity — flatMap no argument","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-047","rule":"§3.15 arity — flatMap second argument","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : [], context);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-048","rule":"§3.15 arity — flatMap spread argument","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(...callbacks);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-049","rule":"§3.9 clause 3 / §3.10 — map forbidden call","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : f(n));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"a call"}]}},
    {"id":"C3-050","rule":"§3.9 clause 3 / §3.10 — filter forbidden call","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : f(n));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"a call"}]}},
    {"id":"C3-051","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden call","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [f(n)]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"a call"}]}},
    {"id":"C3-052","rule":"§3.9 clause 3 / §3.10 — map forbidden assignment","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : (n = 1));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"assignment"}]}},
    {"id":"C3-053","rule":"§3.9 clause 3 / §3.10 — filter forbidden assignment","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : (n = 1));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"assignment"}]}},
    {"id":"C3-054","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden assignment","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [(n = 1)]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"assignment"}]}},
    {"id":"C3-055","rule":"§3.9 clause 3 / §3.10 — map forbidden compound assignment","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : (n += 1));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"assignment"}]}},
    {"id":"C3-056","rule":"§3.9 clause 3 / §3.10 — filter forbidden compound assignment","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : (n += 1));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"assignment"}]}},
    {"id":"C3-057","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden compound assignment","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [(n += 1)]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"assignment"}]}},
    {"id":"C3-058","rule":"§3.9 clause 3 / §3.10 — map forbidden member","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : n.x);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"member access"}]}},
    {"id":"C3-059","rule":"§3.9 clause 3 / §3.10 — filter forbidden member","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : n.x);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"member access"}]}},
    {"id":"C3-060","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden member","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [n.x]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"member access"}]}},
    {"id":"C3-061","rule":"§3.9 clause 3 / §3.10 — map forbidden element access","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : n[0]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"member access"}]}},
    {"id":"C3-062","rule":"§3.9 clause 3 / §3.10 — filter forbidden element access","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : n[0]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"member access"}]}},
    {"id":"C3-063","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden element access","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [n[0]]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"member access"}]}},
    {"id":"C3-064","rule":"§3.9 clause 3 / §3.10 — map forbidden this","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : this);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"this"}]}},
    {"id":"C3-065","rule":"§3.9 clause 3 / §3.10 — filter forbidden this","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : this);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"this"}]}},
    {"id":"C3-066","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden this","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [this]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"this"}]}},
    {"id":"C3-067","rule":"§3.9 clause 3 / §3.10 — map forbidden await","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : await n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"await"}]}},
    {"id":"C3-068","rule":"§3.9 clause 3 / §3.10 — filter forbidden await","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : await n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"await"}]}},
    {"id":"C3-069","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden await","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [await n]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"await"}]}},
    {"id":"C3-070","rule":"§3.9 clause 3 / §3.10 — map forbidden yield","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : yield n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"yield"}]}},
    {"id":"C3-071","rule":"§3.9 clause 3 / §3.10 — filter forbidden yield","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : yield n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"yield"}]}},
    {"id":"C3-072","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden yield","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [yield n]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"yield"}]}},
    {"id":"C3-073","rule":"§3.9 clause 3 / §3.10 — map forbidden tagged template","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : tag`x`);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"tagged template"}]}},
    {"id":"C3-074","rule":"§3.9 clause 3 / §3.10 — filter forbidden tagged template","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : tag`x`);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"tagged template"}]}},
    {"id":"C3-075","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden tagged template","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [tag`x`]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"tagged template"}]}},
    {"id":"C3-076","rule":"§3.9 clause 3 / §3.10 — map forbidden object","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : ({a:n}));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"object literal"}]}},
    {"id":"C3-077","rule":"§3.9 clause 3 / §3.10 — filter forbidden object","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : ({a:n}));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"object literal"}]}},
    {"id":"C3-078","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden object","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [({a:n})]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"object literal"}]}},
    {"id":"C3-079","rule":"§3.9 clause 3 / §3.10 — map forbidden array","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : [n]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"array literal"}]}},
    {"id":"C3-080","rule":"§3.9 clause 3 / §3.10 — filter forbidden array","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : [n]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"array literal"}]}},
    {"id":"C3-081","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden array","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [[n]]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"array literal"}]}},
    {"id":"C3-082","rule":"§3.9 clause 3 / §3.10 — map forbidden nested function","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : (() => n));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"nested function"}]}},
    {"id":"C3-083","rule":"§3.9 clause 3 / §3.10 — filter forbidden nested function","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : (() => n));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"nested function"}]}},
    {"id":"C3-084","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden nested function","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [(() => n)]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"nested function"}]}},
    {"id":"C3-085","rule":"§3.9 clause 3 / §3.10 — map forbidden prefix increment","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : ++n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"PlusPlusToken"}]}},
    {"id":"C3-086","rule":"§3.9 clause 3 / §3.10 — filter forbidden prefix increment","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : ++n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"PlusPlusToken"}]}},
    {"id":"C3-087","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden prefix increment","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [++n]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"PlusPlusToken"}]}},
    {"id":"C3-088","rule":"§3.9 clause 3 / §3.10 — map forbidden prefix decrement","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : --n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"MinusMinusToken"}]}},
    {"id":"C3-089","rule":"§3.9 clause 3 / §3.10 — filter forbidden prefix decrement","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : --n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"MinusMinusToken"}]}},
    {"id":"C3-090","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden prefix decrement","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [--n]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"MinusMinusToken"}]}},
    {"id":"C3-091","rule":"§3.9 clause 3 / §3.10 — map forbidden postfix increment","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : n++);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"postfix operator"}]}},
    {"id":"C3-092","rule":"§3.9 clause 3 / §3.10 — filter forbidden postfix increment","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : n++);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"postfix operator"}]}},
    {"id":"C3-093","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden postfix increment","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [n++]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"postfix operator"}]}},
    {"id":"C3-094","rule":"§3.9 clause 3 / §3.10 — map forbidden void","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : void n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"void"}]}},
    {"id":"C3-095","rule":"§3.9 clause 3 / §3.10 — filter forbidden void","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : void n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"void"}]}},
    {"id":"C3-096","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden void","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [void n]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"void"}]}},
    {"id":"C3-097","rule":"§3.9 clause 3 / §3.10 — map forbidden typeof","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : typeof n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"typeof"}]}},
    {"id":"C3-098","rule":"§3.9 clause 3 / §3.10 — filter forbidden typeof","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : typeof n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"typeof"}]}},
    {"id":"C3-099","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden typeof","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [typeof n]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"typeof"}]}},
    {"id":"C3-100","rule":"§3.9 clause 3 / §3.10 — map forbidden bitwise","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : n | 0);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"BarToken"}]}},
    {"id":"C3-101","rule":"§3.9 clause 3 / §3.10 — filter forbidden bitwise","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : n | 0);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"BarToken"}]}},
    {"id":"C3-102","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden bitwise","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [n | 0]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"BarToken"}]}},
    {"id":"C3-103","rule":"§3.9 clause 3 / §3.10 — map forbidden exponent","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : n ** 1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"AsteriskAsteriskToken"}]}},
    {"id":"C3-104","rule":"§3.9 clause 3 / §3.10 — filter forbidden exponent","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : n ** 1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"AsteriskAsteriskToken"}]}},
    {"id":"C3-105","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden exponent","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [n ** 1]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"AsteriskAsteriskToken"}]}},
    {"id":"C3-106","rule":"§3.9 clause 3 / §3.10 — map forbidden comma","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => true ? n : (0,n));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"CommaToken"}]}},
    {"id":"C3-107","rule":"§3.9 clause 3 / §3.10 — filter forbidden comma","admitted":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : 99);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].filter(n => true ? n : (0,n));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"CommaToken"}]}},
    {"id":"C3-108","rule":"§3.9 clause 3 / §3.10 — flatMap forbidden comma","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => true ? [n] : [(0,n)]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"CommaToken"}]}},
    {"id":"C3-109","rule":"§3.10 flatMap shapes — empty","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-110","rule":"§3.10 flatMap shapes — singleton","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => [n]);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => [n,n]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-111","rule":"§3.10 flatMap shapes — conditional","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : []);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => n ? [n] : n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-112","rule":"§3.10 flatMap shapes — parenthesized","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => ([n]));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => [...n]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-113","rule":"§3.13 / §3.17 constructor and Cell↔Prim — num","admitted":{"source":"const result = [0].map(n => 2).map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-114","rule":"§3.13 / §3.17 constructor and Cell↔Prim — decimal","admitted":{"source":"const result = [0].map(n => 2.5).map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2.5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-115","rule":"§3.13 / §3.17 constructor and Cell↔Prim — normalized hex","admitted":{"source":"const result = [0].map(n => 0x10).map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":16}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-116","rule":"§3.13 / §3.17 constructor and Cell↔Prim — str","admitted":{"source":"const result = [0].map(n => \"x\").map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"x"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-117","rule":"§3.13 / §3.17 constructor and Cell↔Prim — template","admitted":{"source":"const result = [0].map(n => `x${n}`).map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"x0"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-118","rule":"§3.13 / §3.17 constructor and Cell↔Prim — bool true","admitted":{"source":"const result = [0].map(n => true).map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-119","rule":"§3.13 / §3.17 constructor and Cell↔Prim — bool false","admitted":{"source":"const result = [0].map(n => false).map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-120","rule":"§3.13 / §3.17 constructor and Cell↔Prim — null","admitted":{"source":"const result = [0].map(n => null).map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"null"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-121","rule":"§3.13 / §3.17 constructor and Cell↔Prim — undef","admitted":{"source":"const result = [0].map(n => undefined).map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"undef"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-122","rule":"§3.13 / §3.17 constructor and Cell↔Prim — jsx","admitted":{"source":"const result = [0].map(n => (<span/>)).map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"jsx"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-123","rule":"§3.13 / §3.17 constructor and Cell↔Prim — fragment","admitted":{"source":"const result = [0].map(n => (<></>)).map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"jsx"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-124","rule":"§3.17 Cell→Prim — nested arr unavailable","admitted":{"source":"const result = [0].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [[0]].map(n => n);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-125","rule":"§3.13 finite numbers — finite literal","admitted":{"source":"const result = [0].map(n => 1e3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1000}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 1e400);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-126","rule":"§3.13 finite numbers — finite calculation","admitted":{"source":"const result = [0].map(n => 1 / 2);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0.5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 1 / 0);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-127","rule":"§3.13 finite numbers — NaN calculation","admitted":{"source":"const result = [0].map(n => 0 / 1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 0 / 0);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-128","rule":"§3.17 finite own cells — literal overflow","admitted":{"source":"const result = [1e3];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1000}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [1e400];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-129","rule":"§3.13 numeric arithmetic — +","admitted":{"source":"const result = [0].map(n => 2 + 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => true + 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-130","rule":"§3.13 numeric arithmetic — -","admitted":{"source":"const result = [0].map(n => 2 - 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-1}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => true - 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-131","rule":"§3.13 numeric arithmetic — *","admitted":{"source":"const result = [0].map(n => 2 * 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":6}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => true * 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-132","rule":"§3.13 numeric arithmetic — /","admitted":{"source":"const result = [0].map(n => 2 / 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0.6666666666666666}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => true / 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-133","rule":"§3.13 numeric arithmetic — %","admitted":{"source":"const result = [0].map(n => 2 % 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => true % 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-134","rule":"§3.13 comparison — numeric <","admitted":{"source":"const result = [0].map(n => 2 < 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 < \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-135","rule":"§3.13 comparison — string <","admitted":{"source":"const result = [0].map(n => \"a\" < \"b\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 < \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-136","rule":"§3.13 comparison — numeric <=","admitted":{"source":"const result = [0].map(n => 2 <= 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 <= \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-137","rule":"§3.13 comparison — string <=","admitted":{"source":"const result = [0].map(n => \"a\" <= \"b\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 <= \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-138","rule":"§3.13 comparison — numeric >","admitted":{"source":"const result = [0].map(n => 2 > 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 > \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-139","rule":"§3.13 comparison — string >","admitted":{"source":"const result = [0].map(n => \"a\" > \"b\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 > \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-140","rule":"§3.13 comparison — numeric >=","admitted":{"source":"const result = [0].map(n => 2 >= 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 >= \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-141","rule":"§3.13 comparison — string >=","admitted":{"source":"const result = [0].map(n => \"a\" >= \"b\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 >= \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-142","rule":"§3.13 comparison — numeric ===","admitted":{"source":"const result = [0].map(n => 2 === 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 === \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-143","rule":"§3.13 comparison — string ===","admitted":{"source":"const result = [0].map(n => \"a\" === \"b\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 === \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-144","rule":"§3.13 comparison — numeric !==","admitted":{"source":"const result = [0].map(n => 2 !== 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 !== \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-145","rule":"§3.13 comparison — string !==","admitted":{"source":"const result = [0].map(n => \"a\" !== \"b\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 !== \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-146","rule":"§3.13 comparison — numeric ==","admitted":{"source":"const result = [0].map(n => 2 == 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 == \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-147","rule":"§3.13 comparison — string ==","admitted":{"source":"const result = [0].map(n => \"a\" == \"b\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 == \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-148","rule":"§3.13 comparison — numeric !=","admitted":{"source":"const result = [0].map(n => 2 != 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 != \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-149","rule":"§3.13 comparison — string !=","admitted":{"source":"const result = [0].map(n => \"a\" != \"b\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 != \"3\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-150","rule":"§3.13 string rendering — number concat-left","admitted":{"source":"const result = [0].map(n => \"a\" + 2);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"a2"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => \"a\" + (<span/>));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-151","rule":"§3.13 string rendering — number concat-right","admitted":{"source":"const result = [0].map(n => 2 + \"a\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"2a"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => (<span/>) + \"a\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-152","rule":"§3.13 string rendering — number template","admitted":{"source":"const result = [0].map(n => `a${2}`);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"a2"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => `a${(<span/>)}`);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-153","rule":"§3.13 string rendering — string concat-left","admitted":{"source":"const result = [0].map(n => \"a\" + \"x\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"ax"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => \"a\" + (<span/>));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-154","rule":"§3.13 string rendering — string concat-right","admitted":{"source":"const result = [0].map(n => \"x\" + \"a\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"xa"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => (<span/>) + \"a\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-155","rule":"§3.13 string rendering — string template","admitted":{"source":"const result = [0].map(n => `a${\"x\"}`);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"ax"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => `a${(<span/>)}`);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-156","rule":"§3.13 string rendering — boolean concat-left","admitted":{"source":"const result = [0].map(n => \"a\" + false);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"afalse"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => \"a\" + (<span/>));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-157","rule":"§3.13 string rendering — boolean concat-right","admitted":{"source":"const result = [0].map(n => false + \"a\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"falsea"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => (<span/>) + \"a\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-158","rule":"§3.13 string rendering — boolean template","admitted":{"source":"const result = [0].map(n => `a${false}`);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"afalse"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => `a${(<span/>)}`);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-159","rule":"§3.13 string rendering — null concat-left","admitted":{"source":"const result = [0].map(n => \"a\" + null);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"anull"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => \"a\" + (<span/>));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-160","rule":"§3.13 string rendering — null concat-right","admitted":{"source":"const result = [0].map(n => null + \"a\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"nulla"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => (<span/>) + \"a\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-161","rule":"§3.13 string rendering — null template","admitted":{"source":"const result = [0].map(n => `a${null}`);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"anull"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => `a${(<span/>)}`);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-162","rule":"§3.13 string rendering — undefined concat-left","admitted":{"source":"const result = [0].map(n => \"a\" + undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"aundefined"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => \"a\" + (<span/>));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-163","rule":"§3.13 string rendering — undefined concat-right","admitted":{"source":"const result = [0].map(n => undefined + \"a\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"undefineda"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => (<span/>) + \"a\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-164","rule":"§3.13 string rendering — undefined template","admitted":{"source":"const result = [0].map(n => `a${undefined}`);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"aundefined"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => `a${(<span/>)}`);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-165","rule":"§3.13 unary + — num","admitted":{"source":"const result = [0].map(n => +(2));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => +undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-166","rule":"§3.13 unary + — str","admitted":{"source":"const result = [0].map(n => +(\"2\"));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => +undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-167","rule":"§3.13 unary + — bool true","admitted":{"source":"const result = [0].map(n => +(true));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => +undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-168","rule":"§3.13 unary + — bool false","admitted":{"source":"const result = [0].map(n => +(false));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => +undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-169","rule":"§3.13 unary + — null","admitted":{"source":"const result = [0].map(n => +(null));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => +undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-170","rule":"§3.13 unary + — invalid string","admitted":{"source":"const result = [0].map(n => +\"2\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => +(\"x\"));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-171","rule":"§3.13 unary + — jsx","admitted":{"source":"const result = [0].map(n => +\"2\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => +((<span/>)));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-172","rule":"§3.13 unary + — unknown","admitted":{"source":"const result = [0].map(n => +\"2\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => +(missing));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-173","rule":"§3.13 unary - — num","admitted":{"source":"const result = [0].map(n => -(2));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-2.0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => -undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-174","rule":"§3.13 unary - — str","admitted":{"source":"const result = [0].map(n => -(\"2\"));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-2.0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => -undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-175","rule":"§3.13 unary - — bool true","admitted":{"source":"const result = [0].map(n => -(true));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-1.0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => -undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-176","rule":"§3.13 unary - — bool false","admitted":{"source":"const result = [0].map(n => -(false));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-0.0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => -undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-177","rule":"§3.13 unary - — null","admitted":{"source":"const result = [0].map(n => -(null));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-0.0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => -undefined);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-178","rule":"§3.13 unary - — invalid string","admitted":{"source":"const result = [0].map(n => -\"2\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => -(\"x\"));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-179","rule":"§3.13 unary - — jsx","admitted":{"source":"const result = [0].map(n => -\"2\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => -((<span/>)));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-180","rule":"§3.13 unary - — unknown","admitted":{"source":"const result = [0].map(n => -\"2\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => -(missing));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-181","rule":"§3.13 truthiness/nullish — positive !","admitted":{"source":"const result = [0].map(n => !(2));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => !missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-182","rule":"§3.13 truthiness/nullish — positive &&","admitted":{"source":"const result = [0].map(n => (2) && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"right"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-183","rule":"§3.13 truthiness/nullish — positive ||","admitted":{"source":"const result = [0].map(n => (2) || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-184","rule":"§3.13 truthiness/nullish — positive conditional","admitted":{"source":"const result = [0].map(n => (2) ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":7}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-185","rule":"§3.13 truthiness/nullish — positive ??","admitted":{"source":"const result = [0].map(n => (2) ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-186","rule":"§3.13 truthiness/nullish — zero !","admitted":{"source":"const result = [0].map(n => !(0));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => !missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-187","rule":"§3.13 truthiness/nullish — zero &&","admitted":{"source":"const result = [0].map(n => (0) && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-188","rule":"§3.13 truthiness/nullish — zero ||","admitted":{"source":"const result = [0].map(n => (0) || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"right"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-189","rule":"§3.13 truthiness/nullish — zero conditional","admitted":{"source":"const result = [0].map(n => (0) ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":8}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-190","rule":"§3.13 truthiness/nullish — zero ??","admitted":{"source":"const result = [0].map(n => (0) ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-191","rule":"§3.13 truthiness/nullish — negative zero !","admitted":{"source":"const result = [0].map(n => !(-0));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => !missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-192","rule":"§3.13 truthiness/nullish — negative zero &&","admitted":{"source":"const result = [0].map(n => (-0) && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-0.0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-193","rule":"§3.13 truthiness/nullish — negative zero ||","admitted":{"source":"const result = [0].map(n => (-0) || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"right"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-194","rule":"§3.13 truthiness/nullish — negative zero conditional","admitted":{"source":"const result = [0].map(n => (-0) ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":8}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-195","rule":"§3.13 truthiness/nullish — negative zero ??","admitted":{"source":"const result = [0].map(n => (-0) ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":-0.0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-196","rule":"§3.13 truthiness/nullish — string !","admitted":{"source":"const result = [0].map(n => !(\"x\"));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => !missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-197","rule":"§3.13 truthiness/nullish — string &&","admitted":{"source":"const result = [0].map(n => (\"x\") && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"right"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-198","rule":"§3.13 truthiness/nullish — string ||","admitted":{"source":"const result = [0].map(n => (\"x\") || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"x"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-199","rule":"§3.13 truthiness/nullish — string conditional","admitted":{"source":"const result = [0].map(n => (\"x\") ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":7}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-200","rule":"§3.13 truthiness/nullish — string ??","admitted":{"source":"const result = [0].map(n => (\"x\") ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"x"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-201","rule":"§3.13 truthiness/nullish — empty string !","admitted":{"source":"const result = [0].map(n => !(\"\"));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => !missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-202","rule":"§3.13 truthiness/nullish — empty string &&","admitted":{"source":"const result = [0].map(n => (\"\") && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":""}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-203","rule":"§3.13 truthiness/nullish — empty string ||","admitted":{"source":"const result = [0].map(n => (\"\") || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"right"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-204","rule":"§3.13 truthiness/nullish — empty string conditional","admitted":{"source":"const result = [0].map(n => (\"\") ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":8}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-205","rule":"§3.13 truthiness/nullish — empty string ??","admitted":{"source":"const result = [0].map(n => (\"\") ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":""}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-206","rule":"§3.13 truthiness/nullish — true !","admitted":{"source":"const result = [0].map(n => !(true));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => !missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-207","rule":"§3.13 truthiness/nullish — true &&","admitted":{"source":"const result = [0].map(n => (true) && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"right"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-208","rule":"§3.13 truthiness/nullish — true ||","admitted":{"source":"const result = [0].map(n => (true) || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-209","rule":"§3.13 truthiness/nullish — true conditional","admitted":{"source":"const result = [0].map(n => (true) ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":7}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-210","rule":"§3.13 truthiness/nullish — true ??","admitted":{"source":"const result = [0].map(n => (true) ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-211","rule":"§3.13 truthiness/nullish — false !","admitted":{"source":"const result = [0].map(n => !(false));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => !missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-212","rule":"§3.13 truthiness/nullish — false &&","admitted":{"source":"const result = [0].map(n => (false) && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-213","rule":"§3.13 truthiness/nullish — false ||","admitted":{"source":"const result = [0].map(n => (false) || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"right"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-214","rule":"§3.13 truthiness/nullish — false conditional","admitted":{"source":"const result = [0].map(n => (false) ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":8}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-215","rule":"§3.13 truthiness/nullish — false ??","admitted":{"source":"const result = [0].map(n => (false) ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-216","rule":"§3.13 truthiness/nullish — null !","admitted":{"source":"const result = [0].map(n => !(null));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => !missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-217","rule":"§3.13 truthiness/nullish — null &&","admitted":{"source":"const result = [0].map(n => (null) && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"null"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-218","rule":"§3.13 truthiness/nullish — null ||","admitted":{"source":"const result = [0].map(n => (null) || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"right"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-219","rule":"§3.13 truthiness/nullish — null conditional","admitted":{"source":"const result = [0].map(n => (null) ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":8}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-220","rule":"§3.13 truthiness/nullish — null ??","admitted":{"source":"const result = [0].map(n => (null) ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":9}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-221","rule":"§3.13 truthiness/nullish — undef !","admitted":{"source":"const result = [0].map(n => !(undefined));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => !missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-222","rule":"§3.13 truthiness/nullish — undef &&","admitted":{"source":"const result = [0].map(n => (undefined) && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"undef"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-223","rule":"§3.13 truthiness/nullish — undef ||","admitted":{"source":"const result = [0].map(n => (undefined) || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"right"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-224","rule":"§3.13 truthiness/nullish — undef conditional","admitted":{"source":"const result = [0].map(n => (undefined) ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":8}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-225","rule":"§3.13 truthiness/nullish — undef ??","admitted":{"source":"const result = [0].map(n => (undefined) ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":9}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-226","rule":"§3.13 truthiness/nullish — jsx !","admitted":{"source":"const result = [0].map(n => !((<span/>)));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"bool","v":false}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => !missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-227","rule":"§3.13 truthiness/nullish — jsx &&","admitted":{"source":"const result = [0].map(n => ((<span/>)) && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"right"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing && \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-228","rule":"§3.13 truthiness/nullish — jsx ||","admitted":{"source":"const result = [0].map(n => ((<span/>)) || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"jsx"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing || \"right\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-229","rule":"§3.13 truthiness/nullish — jsx conditional","admitted":{"source":"const result = [0].map(n => ((<span/>)) ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":7}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ? 7 : 8);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-230","rule":"§3.13 truthiness/nullish — jsx ??","admitted":{"source":"const result = [0].map(n => ((<span/>)) ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"jsx"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => missing ?? 9);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-231","rule":"§3.13 taken branch only — unknown in untaken branch","admitted":{"source":"const result = [0].map(n => true ? 2 : missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => false ? 2 : missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-232","rule":"§3.13 UNKNOWN propagation — binary with unknown","admitted":{"source":"const result = [0].map(n => 2 + 3);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0].map(n => 2 + missing);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-233","rule":"§3.15 slice — zero","admitted":{"source":"const result = [0,1,2,3,4,5].slice();","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].slice(...args);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-234","rule":"§3.15 slice — one","admitted":{"source":"const result = [0,1,2,3,4,5].slice(1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].slice(k);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-235","rule":"§3.15 slice — two","admitted":{"source":"const result = [0,1,2,3,4,5].slice(1, 2);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].slice(1, 2, 3);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-236","rule":"§3.15 slice — negative","admitted":{"source":"const result = [0,1,2,3,4,5].slice(-2);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].slice(-1.5);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-237","rule":"§3.15 slice — positive sign","admitted":{"source":"const result = [0,1,2,3,4,5].slice(+1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].slice(+k);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-238","rule":"§3.15 splice — zero","admitted":{"source":"const result = [0,1,2,3,4,5].splice();","records":[{"value":{"kind":"EXACT","coll":"array","cells":[]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].splice(...args);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-239","rule":"§3.15 splice — one","admitted":{"source":"const result = [0,1,2,3,4,5].splice(1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].splice(k);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-240","rule":"§3.15 splice — two","admitted":{"source":"const result = [0,1,2,3,4,5].splice(1, 2);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].splice(1, 2, 3);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-241","rule":"§3.15 splice — negative","admitted":{"source":"const result = [0,1,2,3,4,5].splice(-2);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].splice(-1.5);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-242","rule":"§3.15 splice — positive sign","admitted":{"source":"const result = [0,1,2,3,4,5].splice(+1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].splice(+k);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-243","rule":"§3.15 reverse — order and zero arity","admitted":{"source":"const result = [0,1,2,3,4,5].reverse();","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":5},{"t":"num","v":4},{"t":"num","v":3},{"t":"num","v":2},{"t":"num","v":1},{"t":"num","v":0}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].reverse(1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-244","rule":"§3.15 sort — lexical order and zero arity","admitted":{"source":"const result = [0,1,2,3,4,5,10].sort();","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":10},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].sort((a,b) => a-b);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-245","rule":"§3.15 sort — numeric receiver","admitted":{"source":"const result = [0,1,2,3,4,5].sort();","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => \"x\").sort();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-246","rule":"§3.15 fixed return kind — includes","admitted":{"source":"const result = [0,1,2,3,4,5].includes(3);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"applied includes"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).includes(3);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"Fixed return-kind rule; rejected side has UNKNOWN receiver. No method-specific arity is stated for this name."},
    {"id":"C3-247","rule":"§3.15 fixed return kind — some","admitted":{"source":"const result = [0,1,2,3,4,5].some(n => n);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"applied some"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).some(n => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"Fixed return-kind rule; rejected side has UNKNOWN receiver. No method-specific arity is stated for this name."},
    {"id":"C3-248","rule":"§3.15 fixed return kind — every","admitted":{"source":"const result = [0,1,2,3,4,5].every(n => n);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"applied every"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).every(n => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"Fixed return-kind rule; rejected side has UNKNOWN receiver. No method-specific arity is stated for this name."},
    {"id":"C3-249","rule":"§3.15 fixed return kind — indexOf","admitted":{"source":"const result = [0,1,2,3,4,5].indexOf(3);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"applied indexOf"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).indexOf(3);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"Fixed return-kind rule; rejected side has UNKNOWN receiver. No method-specific arity is stated for this name."},
    {"id":"C3-250","rule":"§3.15 fixed return kind — lastIndexOf","admitted":{"source":"const result = [0,1,2,3,4,5].lastIndexOf(3);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"applied lastIndexOf"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).lastIndexOf(3);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"Fixed return-kind rule; rejected side has UNKNOWN receiver. No method-specific arity is stated for this name."},
    {"id":"C3-251","rule":"§3.15 fixed return kind — findIndex","admitted":{"source":"const result = [0,1,2,3,4,5].findIndex(n => n);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"applied findIndex"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).findIndex(n => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"Fixed return-kind rule; rejected side has UNKNOWN receiver. No method-specific arity is stated for this name."},
    {"id":"C3-252","rule":"§3.15 fixed return kind — join","admitted":{"source":"const result = [0,1,2,3,4,5].join(\"\");","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"applied join"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).join(\"\");","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"Fixed return-kind rule; rejected side has UNKNOWN receiver. No method-specific arity is stated for this name."},
    {"id":"C3-253","rule":"§3.15 fixed return kind — forEach","admitted":{"source":"const result = [0,1,2,3,4,5].forEach(n => n);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"applied forEach"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).forEach(n => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"Fixed return-kind rule; rejected side has UNKNOWN receiver. No method-specific arity is stated for this name."},
    {"id":"C3-254","rule":"§3.15 element return — find","admitted":{"source":"const result = [0,1,2,3,4,5].find(n => n);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => \"x\").find(n => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-255","rule":"§3.15 element return — findLast","admitted":{"source":"const result = [0,1,2,3,4,5].findLast(n => n);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => \"x\").findLast(n => n);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-256","rule":"§3.15 element return — at","admitted":{"source":"const result = [0,1,2,3,4,5].at(0);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => \"x\").at(0);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-257","rule":"§3.15 element return — pop","admitted":{"source":"const result = [0,1,2,3,4,5].pop();","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => \"x\").pop();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-258","rule":"§3.15 element return — shift","admitted":{"source":"const result = [0,1,2,3,4,5].shift();","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => \"x\").shift();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-259","rule":"§3.15 numeric index — numeric versus known string receiver","admitted":{"source":"const result = [0,1,2,3,4,5][0];","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => \"x\")[0];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-260","rule":"§3.15 always UNKNOWN — reduce","admitted":{"source":"const result = [0,1,2,3,4,5].reduce((a,n) => a, 0);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).reduce((a,n) => a, 0);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists: the admitted column exercises the declared UNKNOWN outcome on an EXACT receiver; rejected column uses UNKNOWN receiver."},
    {"id":"C3-261","rule":"§3.15 always UNKNOWN — reduceRight","admitted":{"source":"const result = [0,1,2,3,4,5].reduceRight((a,n) => a, 0);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).reduceRight((a,n) => a, 0);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists: the admitted column exercises the declared UNKNOWN outcome on an EXACT receiver; rejected column uses UNKNOWN receiver."},
    {"id":"C3-262","rule":"§3.15 always UNKNOWN — concat","admitted":{"source":"const result = [0,1,2,3,4,5].concat(4,5);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).concat(4,5);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists: the admitted column exercises the declared UNKNOWN outcome on an EXACT receiver; rejected column uses UNKNOWN receiver."},
    {"id":"C3-263","rule":"§3.15 always UNKNOWN — flat","admitted":{"source":"const result = [0,1,2,3,4,5].flat();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).flat();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists: the admitted column exercises the declared UNKNOWN outcome on an EXACT receiver; rejected column uses UNKNOWN receiver."},
    {"id":"C3-264","rule":"§3.15 always UNKNOWN — fill","admitted":{"source":"const result = [0,1,2,3,4,5].fill(1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).fill(1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists: the admitted column exercises the declared UNKNOWN outcome on an EXACT receiver; rejected column uses UNKNOWN receiver."},
    {"id":"C3-265","rule":"§3.15 always UNKNOWN — with","admitted":{"source":"const result = [0,1,2,3,4,5].with(0,1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).with(0,1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists: the admitted column exercises the declared UNKNOWN outcome on an EXACT receiver; rejected column uses UNKNOWN receiver."},
    {"id":"C3-266","rule":"§3.15 always UNKNOWN — toSorted","admitted":{"source":"const result = [0,1,2,3,4,5].toSorted();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).toSorted();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists: the admitted column exercises the declared UNKNOWN outcome on an EXACT receiver; rejected column uses UNKNOWN receiver."},
    {"id":"C3-267","rule":"§3.15 always UNKNOWN — toReversed","admitted":{"source":"const result = [0,1,2,3,4,5].toReversed();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).toReversed();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists: the admitted column exercises the declared UNKNOWN outcome on an EXACT receiver; rejected column uses UNKNOWN receiver."},
    {"id":"C3-268","rule":"§3.15 always UNKNOWN — copyWithin","admitted":{"source":"const result = [0,1,2,3,4,5].copyWithin(0,1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).copyWithin(0,1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists: the admitted column exercises the declared UNKNOWN outcome on an EXACT receiver; rejected column uses UNKNOWN receiver."},
    {"id":"C3-269","rule":"§3.15 always UNKNOWN — unlisted","admitted":{"source":"const result = [0,1,2,3,4,5].unlisted();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(callback).unlisted();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists: the admitted column exercises the declared UNKNOWN outcome on an EXACT receiver; rejected column uses UNKNOWN receiver."},
    {"id":"C3-270","rule":"§3.15 non-call member — length versus named member","admitted":{"source":"const result = [0,1,2,3,4,5].length;","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].foo;","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-271","rule":"§3.15 computed member — string name versus unresolved name","admitted":{"source":"const result = [0,1,2,3,4,5][\"slice\"](1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5][method](1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-272","rule":"§3.15 computed property — length string versus unresolved name","admitted":{"source":"const result = [0,1,2,3,4,5][\"length\"];","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5][key];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-273","rule":"§3.15 continuation — .slice(1)","admitted":{"source":"const result = [0,1,2,3,4,5].join(\"\");","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].join(\"\").slice(1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-274","rule":"§3.15 continuation — .foo","admitted":{"source":"const result = [0,1,2,3,4,5].join(\"\");","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].join(\"\").foo;","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-275","rule":"§3.15 continuation — [0]","admitted":{"source":"const result = [0,1,2,3,4,5].join(\"\");","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].join(\"\")[0];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-276","rule":"§3.15 continuation — [\"length\"]","admitted":{"source":"const result = [0,1,2,3,4,5].join(\"\");","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].join(\"\")[\"length\"];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-277","rule":"§3.16 sole argument — new Set second argument","admitted":{"source":"const result = new Set([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5], other);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-278","rule":"§3.16 sole argument — new Set spread argument","admitted":{"source":"const result = new Set([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set(...[0,1,2,3,4,5]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-279","rule":"§3.15/§3.16 wrapper continuation — new Set","admitted":{"source":"const result = new Set([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5].join(\"\"));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-280","rule":"§3.16 sole argument — Array.from second argument","admitted":{"source":"const result = Array.from([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = Array.from([0,1,2,3,4,5], other);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-281","rule":"§3.16 sole argument — Array.from spread argument","admitted":{"source":"const result = Array.from([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = Array.from(...[0,1,2,3,4,5]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-282","rule":"§3.15/§3.16 wrapper continuation — Array.from","admitted":{"source":"const result = Array.from([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = Array.from([0,1,2,3,4,5].join(\"\"));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-283","rule":"§3.16 sole argument — Object.freeze second argument","admitted":{"source":"const result = Object.freeze([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = Object.freeze([0,1,2,3,4,5], other);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-284","rule":"§3.16 sole argument — Object.freeze spread argument","admitted":{"source":"const result = Object.freeze([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = Object.freeze(...[0,1,2,3,4,5]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-285","rule":"§3.15/§3.16 wrapper continuation — Object.freeze","admitted":{"source":"const result = Object.freeze([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = Object.freeze([0,1,2,3,4,5].join(\"\"));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-286","rule":"§3.16 new Map — declared unsupported","admitted":{"source":"const result = new Map([0,1,2,3,4,5]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"rejected":{"source":"const result = new Map([0,1,2,3,4,5], other);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"No exact admitted side exists for new Map; both sides report UNKNOWN."},
    {"id":"C3-287","rule":"§3.16 collection kind — Set receiver versus array conversion","admitted":{"source":"const result = Array.from(new Set([0,1,2,3,4,5])).slice(1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5]).slice(1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-288","rule":"§3.16 Set has — invocation versus bare member","admitted":{"source":"const result = new Set([0,1,2,3,4,5]).has(1);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5]).has;","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-289","rule":"§3.16 Set size — property versus invocation","admitted":{"source":"const result = new Set([0,1,2,3,4,5]).size;","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5]).size();","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-290","rule":"§3.16 spread — Set to array conversion","admitted":{"source":"const result = [...new Set([0,1,2,3,4,5])];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [...[0,1,2,3,4,5].join(\"\")];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-291","rule":"§3.17 SameValueZero — num","admitted":{"source":"const result = new Set([0,1,2,3,4,5].map(n => n || 1));","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5].map(n => missing));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"identity is unavailable"}]}},
    {"id":"C3-292","rule":"§3.17 SameValueZero — str","admitted":{"source":"const result = new Set([0,1,2,3,4,5].map(n => \"s\"));","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"str","v":"s"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5].map(n => missing));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"identity is unavailable"}]}},
    {"id":"C3-293","rule":"§3.17 SameValueZero — bool","admitted":{"source":"const result = new Set([0,1,2,3,4,5].map(n => true));","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"bool","v":true}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5].map(n => missing));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"identity is unavailable"}]}},
    {"id":"C3-294","rule":"§3.17 SameValueZero — null","admitted":{"source":"const result = new Set([0,1,2,3,4,5].map(n => null));","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"null"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5].map(n => missing));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"identity is unavailable"}]}},
    {"id":"C3-295","rule":"§3.17 SameValueZero — undef","admitted":{"source":"const result = new Set([0,1,2,3,4,5].map(n => undefined));","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"undef"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5].map(n => missing));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"identity is unavailable"}]}},
    {"id":"C3-296","rule":"§3.17 unavailable object identity — jsx","admitted":{"source":"const result = new Set([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1,2,3,4,5].map(n => (<span/>)));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"identity is unavailable"}]}},
    {"id":"C3-297","rule":"§3.17 unavailable object identity — arr","admitted":{"source":"const result = new Set([0,1,2,3,4,5]);","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([[0,1,2,3,4,5]]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"identity is unavailable"}]}},
    {"id":"C3-298","rule":"§3.17 SameValueZero — signed zero dedupes","admitted":{"source":"const result = new Set([0,-0,2]);","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"num","v":0},{"t":"num","v":2}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1e400,2]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-299","rule":"§3.17 SameValueZero — typed keys remain distinct","admitted":{"source":"const result = new Set([0,1].map(n => n ? \"0\" : 0));","records":[{"value":{"kind":"EXACT","coll":"set","cells":[{"t":"num","v":0},{"t":"str","v":"0"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = new Set([0,1].map(n => n ? missing : 0));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-300","rule":"§3.16 transparent wrapper — parentheses","admitted":{"source":"const result = ([0,1,2,3,4,5]).slice(1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = f(([0,1,2,3,4,5])).slice(1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-301","rule":"§3.16 transparent wrapper — as const","admitted":{"source":"const result = ([0,1,2,3,4,5] as const).slice(1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = f(([0,1,2,3,4,5] as const)).slice(1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-302","rule":"§3.16 transparent wrapper — as type","admitted":{"source":"const result = ([0,1,2,3,4,5] as number[]).slice(1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = f(([0,1,2,3,4,5] as number[])).slice(1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-303","rule":"§3.16 transparent wrapper — satisfies","admitted":{"source":"const result = ([0,1,2,3,4,5] satisfies number[]).slice(1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = f(([0,1,2,3,4,5] satisfies number[])).slice(1);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-304","rule":"§3.16 comma roles — right retained / left discarded","admitted":{"source":"const result = (0,[0,1,2,3,4,5]).slice(1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = ([0,1,2,3,4,5], 7);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"discarded"}]}},
    {"id":"C3-305","rule":"§3.16 / C1 sibling grammar — parentheses","admitted":{"source":"const result = [...([1,2,3]), ...([4,5])];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"},{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3], ...other];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-306","rule":"§3.16 / C1 sibling grammar — Set","admitted":{"source":"const result = [...new Set([1,2,3]), ...new Set([4,5])];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"},{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3], ...other];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-307","rule":"§3.16 / C1 sibling grammar — slice","admitted":{"source":"const result = [...[0,1,2,3].slice(1), ...[3,4,5].slice(1)];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"},{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3], ...other];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-308","rule":"§3.16 / C1 sibling grammar — as const","admitted":{"source":"const result = [...([1,2,3] as const), ...([4,5] as const)];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"},{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3], ...other];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-309","rule":"§3.16 / C1 sibling grammar — freeze","admitted":{"source":"const result = [...Object.freeze([1,2,3]), ...Object.freeze([4,5])];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"},{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3], ...other];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-310","rule":"§3.16 / C1 sibling grammar — Array.from","admitted":{"source":"const result = [...Array.from([1,2,3]), ...Array.from([4,5])];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"},{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3], ...other];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-311","rule":"§3.16 / C1 sibling grammar — satisfies","admitted":{"source":"const result = [...([1,2,3] satisfies number[]), ...([4,5] satisfies number[])];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"},{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3], ...other];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-312","rule":"§3.16 / C1 sibling grammar — computed member","admitted":{"source":"const result = [...[1,2,3], ...[0,4,5][\"slice\"](1)];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"},{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3], ...other];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-313","rule":"§3.16 / C1 sibling grammar — comma right","admitted":{"source":"const result = [...[1,2,3], ...(0,[4,5])];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"},{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3], ...other];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-314","rule":"§3.16 numeric sibling only — direct string","admitted":{"source":"const result = [...[1,2,3],4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3],\"4\",5];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-315","rule":"§3.16 numeric sibling only — direct template","admitted":{"source":"const result = [...[1,2,3],4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [...[1,2,3],`4`,5];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-316","rule":"§3.16 nested payload — opened versus left nested","admitted":{"source":"const [choice] = [[0,1,2,3,4,5].slice(1)];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [[0,1,2,3,4,5].slice(1)];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"arr","value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]}}]},"verdict":"OTHER"}]}},
    {"id":"C3-317","rule":"§3.16 binding positions — elision counted","admitted":{"source":"const [, ...rest] = [0,1,2,3,4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const [,, ...rest] = [0,1,2,3,4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]}},
    {"id":"C3-318","rule":"§3.16 binding forms — nested","admitted":{"source":"const [head,...rest] = [0,1,2,3,4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const [[head,...rest]] = [[0,1,2,3,4,5]];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"nested binding"}]}},
    {"id":"C3-319","rule":"§3.16 binding forms — rest pattern","admitted":{"source":"const [head,...rest] = [0,1,2,3,4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const [...[head,...rest]] = [0,1,2,3,4,5];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"nested binding"}]}},
    {"id":"C3-320","rule":"§3.16 binding forms — default","admitted":{"source":"const [head,...rest] = [0,1,2,3,4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const [head = 1] = [0,1,2,3,4,5];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"defaulted"}]}},
    {"id":"C3-321","rule":"§3.16 bound outputs — any RULED wins","admitted":{"source":"const [head,...rest] = [0,1,2,3,4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const [head,...rest] = [0,2,3,4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0}]},"verdict":"OTHER"}]}},
    {"id":"C3-322","rule":"§3.16 bound outputs — no RULED / any UNKNOWN","admitted":{"source":"const [a,b] = [0,1,2,3,4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0}]},"verdict":"OTHER"}]},"rejected":{"source":"const [a,b] = [0,1,2,3,4,5].map(n => n ? missing : 0);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-323","rule":"§3.16 binding out of range — conservative silence","admitted":{"source":"const [a] = [0];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0}]},"verdict":"OTHER"}]},"rejected":{"source":"const [a,b] = [0];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"§3.16 does not define an out-of-range cell; conservatively UNKNOWN rather than inventing an undefined Value."},
    {"id":"C3-324","rule":"§3.16 binding no names — conservative silence","admitted":{"source":"const [a] = [0];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0}]},"verdict":"OTHER"}]},"rejected":{"source":"const [] = [0];","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"no bound name"}]},"note":"§3.16 does not decide an empty output aggregate; conservative UNKNOWN."},
    {"id":"C3-325","rule":"§3.16 terminal owner — identifier","admitted":{"source":"const result = [0,1,2,3,4,5].slice(1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = f([0,1,2,3,4,5].slice(1));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"unmodelled call"}]}},
    {"id":"C3-326","rule":"§3.16 terminal owner — property","admitted":{"source":"const object = {result: [0,1,2,3,4,5].slice(1)};","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = f([0,1,2,3,4,5].slice(1));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"unmodelled call"}]}},
    {"id":"C3-327","rule":"§3.16 terminal owner — return","admitted":{"source":"function f(){ return [0,1,2,3,4,5].slice(1); }","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = f([0,1,2,3,4,5].slice(1));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"unmodelled call"}]}},
    {"id":"C3-328","rule":"§3.16 terminal owner — JSX expression","admitted":{"source":"const view = <p>{[0,1,2,3,4,5].slice(1)}</p>;","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = f([0,1,2,3,4,5].slice(1));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"unmodelled call"}]}},
    {"id":"C3-329","rule":"§3.18 invocation roles — .includes","admitted":{"source":"const result = [0,1,2,3,4,5].includes(3);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = f([0,1,2,3,4,5].includes);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"unmodelled call"}]}},
    {"id":"C3-330","rule":"§3.18 invocation roles — [\"includes\"]","admitted":{"source":"const result = [0,1,2,3,4,5][\"includes\"](3);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = f([0,1,2,3,4,5][\"includes\"]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"unmodelled call"}]}},
    {"id":"C3-331","rule":"§3.18 receiver role — candidate argument not receiver","admitted":{"source":"const result = [0,1,2,3,4,5].includes(3);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER"}]},"rejected":{"source":"const result = other.includes([0,1,2,3,4,5]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"unmodelled call"}]}},
    {"id":"C3-332","rule":"§3.16 fallback owner — unknown syntax","admitted":{"source":"const result = [0,1,2,3,4,5].slice(1);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5] + 1;","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"unmodelled owner"}]}},
    {"id":"C3-333","rule":"A1 revised condition context — if","admitted":{"source":"if (a || [0,1,2,3,4,5].includes(1)) {}","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].includes(1) || other;","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-334","rule":"A1 revised condition context — while","admitted":{"source":"while (!(a && [0,1,2,3,4,5].includes(1))) {}","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].includes(1) || other;","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-335","rule":"A1 revised condition context — do","admitted":{"source":"do {} while ([0,1,2,3,4,5].at(99) ?? a);","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].includes(1) || other;","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-336","rule":"A1 revised condition context — for","admitted":{"source":"for (;[0,1,2,3,4,5].includes(1);) {}","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].includes(1) || other;","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-337","rule":"A1 revised condition context — conditional","admitted":{"source":"const choice = [0,1,2,3,4,5].includes(1) ? a : b;","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].includes(1) || other;","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-338","rule":"A1 context boundaries — call","admitted":{"source":"if([0,1,2,3,4,5].includes(1)) {}","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"if(f([0,1,2,3,4,5].includes(1))) {}","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-339","rule":"A1 context boundaries — call of negation","admitted":{"source":"if([0,1,2,3,4,5].includes(1)) {}","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"if(f(![0,1,2,3,4,5].includes(1))) {}","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-340","rule":"A1 context boundaries — ternary branch","admitted":{"source":"if([0,1,2,3,4,5].includes(1)) {}","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"if(c ? [0,1,2,3,4,5].includes(1) : false) {}","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-341","rule":"A1 context boundaries — for initializer","admitted":{"source":"if([0,1,2,3,4,5].includes(1)) {}","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"for([0,1,2,3,4,5].includes(1);;) {}","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-342","rule":"A1 context boundaries — EXACT condition","admitted":{"source":"if([0,1,2,3,4,5].includes(1)) {}","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"if([0,1,2,3,4,5]) {}","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]},"note":"A1 admits only NOT_ARRAY in the condition slot; EXACT condition treatment is otherwise unspecified and remains UNKNOWN."},
    {"id":"C3-343","rule":"A1 context boundaries — UNKNOWN condition","admitted":{"source":"if([0,1,2,3,4,5].includes(1)) {}","records":[{"value":{"kind":"NOT_ARRAY"},"verdict":"OTHER","reason":"terminal consumption"}]},"rejected":{"source":"if([0,1,2,3,4,5].reduce(f)) {}","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-344","rule":"§3.17 numeric classification — distinct equality / duplicates","admitted":{"source":"const result = [1,1,2,3,4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED"}]},"rejected":{"source":"const result = [0,1,2,3,4,5];","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER"}]}},
    {"id":"C3-345","rule":"§3.17 numeric classification — known nonnumber versus unknown","admitted":{"source":"const result = [0].map(n => \"x\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"x"}]},"verdict":"OTHER"}]},"rejected":{"source":"const result = [0,1].map(n => n ? missing : \"x\");","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"str","v":"x"},{"t":"unknown"}]},"verdict":"UNDETERMINED"}]}},
    {"id":"C3-346","rule":"§3.2 early rule 1 — before a transforming callback","admitted":{"source":"const result = [1,2,3,4,5].map(n=>0);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"RULED","reason":"rule 1"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n=>0);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":0},{"t":"num","v":0},{"t":"num","v":0},{"t":"num","v":0},{"t":"num","v":0}]},"verdict":"OTHER"}]}},
    {"id":"C3-347","rule":"§3.13 recorded work limits — map/expression/nodes","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => ((((n + (((0 + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))))))));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => (((((n + (((0 + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))))))))));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"exceeds the node budget 64"}]},"note":"64/65 nodes or 32/33 depth; independent original-body walker and the unexhausted other bound are asserted by C2."},
    {"id":"C3-348","rule":"§3.13 recorded work limits — map/expression/depth","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => ((((((((((((((((((((((((((((((((n)))))))))))))))))))))))))))))))));","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => (((((((((((((((((((((((((((((((((n))))))))))))))))))))))))))))))))));","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"exceeds the depth limit 32"}]},"note":"64/65 nodes or 32/33 depth; independent original-body walker and the unexhausted other bound are asserted by C2."},
    {"id":"C3-349","rule":"§3.13 recorded work limits — map/block/nodes","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => { return ((n + (((0 + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))))); });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => { return (((n + (((0 + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))))))); });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"exceeds the node budget 64"}]},"note":"64/65 nodes or 32/33 depth; independent original-body walker and the unexhausted other bound are asserted by C2."},
    {"id":"C3-350","rule":"§3.13 recorded work limits — map/block/depth","admitted":{"source":"const result = [0,1,2,3,4,5].map(n => { return ((((((((((((((((((((((((((((((n)))))))))))))))))))))))))))))); });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied map"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].map(n => { return (((((((((((((((((((((((((((((((n))))))))))))))))))))))))))))))); });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"exceeds the depth limit 32"}]},"note":"64/65 nodes or 32/33 depth; independent original-body walker and the unexhausted other bound are asserted by C2."},
    {"id":"C3-351","rule":"§3.13 recorded work limits — flatMap/expression/nodes","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => [(((n + (((0 + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))))))]);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => [((((n + (((0 + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))))))))]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"exceeds the node budget 64"}]},"note":"64/65 nodes or 32/33 depth; independent original-body walker and the unexhausted other bound are asserted by C2."},
    {"id":"C3-352","rule":"§3.13 recorded work limits — flatMap/expression/depth","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => [(((((((((((((((((((((((((((((((n)))))))))))))))))))))))))))))))]);","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => [((((((((((((((((((((((((((((((((n))))))))))))))))))))))))))))))))]);","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"exceeds the depth limit 32"}]},"note":"64/65 nodes or 32/33 depth; independent original-body walker and the unexhausted other bound are asserted by C2."},
    {"id":"C3-353","rule":"§3.13 recorded work limits — flatMap/block/nodes","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => { return [(n + (((0 + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))))]; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => { return [((n + (((0 + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))))))]; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"exceeds the node budget 64"}]},"note":"64/65 nodes or 32/33 depth; independent original-body walker and the unexhausted other bound are asserted by C2."},
    {"id":"C3-354","rule":"§3.13 recorded work limits — flatMap/block/depth","admitted":{"source":"const result = [0,1,2,3,4,5].flatMap(n => { return [(((((((((((((((((((((((((((((n)))))))))))))))))))))))))))))]; });","records":[{"value":{"kind":"EXACT","coll":"array","cells":[{"t":"num","v":0},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},"verdict":"OTHER","reason":"applied flatMap"}]},"rejected":{"source":"const result = [0,1,2,3,4,5].flatMap(n => { return [((((((((((((((((((((((((((((((n))))))))))))))))))))))))))))))]; });","records":[{"value":{"kind":"UNKNOWN"},"verdict":"UNDETERMINED","reason":"exceeds the depth limit 32"}]},"note":"64/65 nodes or 32/33 depth; independent original-body walker and the unexhausted other bound are asserted by C2."},
  ];
  it.each(boundaryRules.flatMap((row) => (["admitted", "rejected"] as const).map((side) => ({
    id: row.id, rule: row.rule, side, fixture: row[side], note: row.note
  }))))("boundary sweep $id $side — $rule", ({ id, rule, side, fixture, note }) => {
    const path = "planted.tsx";
    const parsed = parseModule(path, fixture.source);
    expect(parsed.ok, fixture.source).toBe(true);
    const observed = evaluatedCandidatesOf(path, fixture.source);
    if (process.env.ORACLE_AUDIT === "1") {
      console.log("BOUNDARY_ROW " + JSON.stringify({ id, rule, side, source: fixture.source,
        expected: fixture.records, observed, note, strength: "entailed" }));
    }
    expect(observed.map(({ value, verdict }) => ({ value, verdict })), fixture.source)
      .toEqual(fixture.records.map(({ value, verdict }) => ({ value, verdict })));
    fixture.records.forEach((record, index) => {
      if (record.reason !== undefined) expect(observed[index]!.reason).toContain(record.reason);
    });
  });

  // Canonical manifest sources, copied from Part 2 without shorthand expansion.
  // The mutation audit prints observations BEFORE assertions, so a failing verdict
  // cannot hide the payload, receiver prefix, address or emitted records.
  const manifestFixtures: readonly {
    id: string; source: string; verdict: string; count: number; cells?: Cell[];
    receiver?: { source: string; cells: Cell[] }; pair?: { source: string; verdict: string };
  }[] = [
    {"id":"K1","source":"const choices = [1,2,3,4,5].map(n => 0);","verdict":"RULED","count":1},
    {"id":"K2","source":"const choices = [...new Set([0,1,2,3,4,5].map(n => n || 1))].slice(1);","verdict":"OTHER","count":1},
    {"id":"K6","source":"const choices = [0,1,2,3,4,5].map(n => `${n}`).map(n => n * 1).slice(1);","verdict":"UNDETERMINED","count":1},
    {"id":"K6b","source":"const choices = [0,1,2,3,4,5].map(n => `${n}`).map(n => +n).slice(1);","verdict":"RULED","count":1},
    {"id":"K7","source":"const choices = [0,1,2,3,4,5].filter((n, i) => 0);","verdict":"UNDETERMINED","count":1},
    {"id":"K9","source":"const choices = [0,1,2,3,4,5].filter(n => n);","verdict":"RULED","count":1,"pair":{"source":"const choices = [-0,1,2,3,4,5].filter(n => n);","verdict":"RULED"}},
    {"id":"K8","source":"const choices = [0,1,2,3,4,5].filter(n => n % 2 === 0);","verdict":"OTHER","count":1},
    {"id":"K10","source":"const choices = [0,1,2,3,4,5].map(n => n || 1);","verdict":"RULED","count":1,"cells":[{"t":"num","v":1},{"t":"num","v":1},{"t":"num","v":2},{"t":"num","v":3},{"t":"num","v":4},{"t":"num","v":5}]},
    {"id":"K11","source":"const choices = [0,1,2,3,4,5].flatMap(n => [n]);","verdict":"OTHER","count":1},
    {"id":"K12","source":"const choices = [0,1,2,3,4,5].splice(1);","verdict":"RULED","count":1},
    {"id":"K13","source":"const choices = [0,1,2,3,4,5].slice(1);","verdict":"RULED","count":1},
    {"id":"K14","source":"const choices = [0,1,2,3,4,5].reverse().slice(0,-1);","verdict":"RULED","count":1},
    {"id":"K15","source":"const choices = [0,1,2,3,4,5,10].sort().slice(1,-1);","verdict":"OTHER","count":1},
    {"id":"K16","source":"const choices = [0,1,2,3,4,5].slice(1,4).concat(4,5);","verdict":"UNDETERMINED","count":1},
    {"id":"K17","source":"const choices = [...[0,1,2,3,4,5],6].slice(1);","verdict":"OTHER","count":1},
    {"id":"K18","source":"const [, ...choices] = [0,1,2,3,4,5];","verdict":"RULED","count":1},
    {"id":"K19","source":"const [choices] = [[0,1,2,3,4,5].slice(1)];","verdict":"RULED","count":1},
    {"id":"K20","source":"const choices = [0,1,2,3,4,5][\"slice\"](0,4);","verdict":"OTHER","count":1},
    {"id":"K21","source":"const choices = ([0,1,2,3,4,5] as const).slice(1);","verdict":"RULED","count":1},
    {"id":"K22","source":"const choices = Array.from(new Set([0,1,2,3,4,5].map(n => n || 1))).slice(1);","verdict":"OTHER","count":1},
    {"id":"K26","source":"const a = [1,2,3,4,5]; const b = [1,2,3,4,5];","verdict":"RULED","count":2},
    {"id":"K29","source":"const choices = [0,1,2,3,4,5].reduce((a, n) => n ? a.concat(n) : a, []);","verdict":"UNDETERMINED","count":1},
    {"id":"K31","source":"const choices = [0,1,2,3,4,5].map(n => n + (((((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))) + ((((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))))).slice(1);","verdict":"UNDETERMINED","count":1},
    {"id":"K32","source":"const choices = [0,1,2,3,4,5].filter(n => { if (n > 9) return true; return n > 0; });","verdict":"UNDETERMINED","count":1},
    {"id":"K33","source":"const choices = [0,1,2,3,4,5].slice(1,2,3);","verdict":"UNDETERMINED","count":1},
    {"id":"K36","source":"const choices = [0,1,2,3,4,5].map(n => n === 0 ? 1 : n);","verdict":"RULED","count":1},
    {"id":"K39","source":"const slots = (\";\", [0,1,2,3,4,5]);","verdict":"OTHER","count":1},
    {"id":"K40","source":"const [choices] = [[0,1,2,3,4,5].slice(1)];","verdict":"RULED","count":1},
    {"id":"K41","source":"const choices = new Set([0,1,2,3,4,5]).slice(1);","verdict":"UNDETERMINED","count":1},
    {"id":"K42","source":"const choices = [0,1,2,3,4,5].reduce((a, n) => n ? a.concat(n) : a, []);","verdict":"UNDETERMINED","count":1},
    {"id":"K43","source":"const choices = [0,1,2,3,4,5].map(n => \"x\").at(0);","verdict":"UNDETERMINED","count":1,"receiver":{"source":"const receiver = [0,1,2,3,4,5].map(n => \"x\");","cells":[{"t":"str","v":"x"},{"t":"str","v":"x"},{"t":"str","v":"x"},{"t":"str","v":"x"},{"t":"str","v":"x"},{"t":"str","v":"x"}]}},
    {"id":"K44","source":"const choices = [0,1,2,3,4,5].foo;","verdict":"UNDETERMINED","count":1,"pair":{"source":"const length = [0,1,2,3,4,5].length;","verdict":"OTHER"}},
    {"id":"K45","source":"const choices = ((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5].includes);","verdict":"UNDETERMINED","count":1},
    {"id":"K46","source":"const choices = [0,1,2,3,4,5].map(n => `${n}`).map(n => +n).slice(1);","verdict":"RULED","count":1},
    {"id":"K47","source":"const choices = [...new Set([0,0,1,2,3,4,5].map(n => n === 0 ? \"s\" : n))].slice(1);","verdict":"RULED","count":1},
    {"id":"K48","source":"const choices = [-0,1,2,3,4,5].filter(n => n);","verdict":"RULED","count":1,"pair":{"source":"const choices = [0,1,2,3,4,5].filter(n => n);","verdict":"RULED"}},
    {"id":"K49","source":"const choices = [0,1,2,3,4,5].map(n => (n === 0 ? null : n) ?? 1);","verdict":"RULED","count":1},
    {"id":"K50","source":"const choices = [0,1,2,3,4,5].join(\"\").split(\"\").map(n => +n).slice(1);","verdict":"UNDETERMINED","count":1},
    {"id":"K51","source":"const [head, ...choices] = [0,1,2,3,4,5];","verdict":"RULED","count":1}
  ];
  it.each(manifestFixtures)("asserts canonical mutation fixture $id", (fixture) => {
    const path = "planted.tsx";
    const observed = evaluatedCandidatesOf(path, fixture.source);
    const sites = domainSites(path, fixture.source);
    const receiver = fixture.receiver ? evaluateOne(path, fixture.receiver.source) : undefined;
    const pair = fixture.pair ? evaluateOne(path, fixture.pair.source) : undefined;
    if (process.env.ORACLE_AUDIT === "1") console.log("MUTATION_ROW " + JSON.stringify({
      id: fixture.id, source: fixture.source, observed, sites, receiver, pair,
      limits: fixture.id === "K31" ? { ...measureCallbackBody(fixture.source), NODE_BUDGET, DEPTH_LIMIT } : undefined
    }));
    expect(parseModule(path, fixture.source).ok).toBe(true);
    expect(observed).toHaveLength(fixture.count);
    if (fixture.id === "K31") {
      expect(new TextEncoder().encode(fixture.source).length).toBe(241);
      expect(measureCallbackBody(fixture.source)).toEqual({ nodes: 128, depth: 11 });
      expect(DEPTH_LIMIT).toBe(32);
    }
    if (fixture.receiver && receiver) expect(receiver.value).toEqual({ kind: "EXACT", coll: "array", cells: fixture.receiver.cells });
    if (fixture.pair && pair) expect(pair.verdict).toBe(fixture.pair.verdict);
    if (fixture.cells) expect(observed[0]!.value).toEqual({ kind: "EXACT", coll: "array", cells: fixture.cells });
    expect(observed.map((candidate) => candidate.verdict)).toEqual(Array.from({ length: fixture.count }, () => fixture.verdict));
    expect(sites).toEqual(fixture.verdict === "OTHER" ? [] : Array.from({ length: fixture.count }, () => ({
      kind: "DOMAIN_ENUMERATION", line: 1, text: fixture.source
    })));
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

  it.each([
    { id: "A3", source: "const a = [1,2,3,4,5]; const b = [1,2,3,4,5];", count: 2 },
    { id: "A9", source: "const a = [1,2,3,4,5]; const b = [0,1,2,3,4,5];", count: 1 }
  ])("emits $id by literal identity with exact display records", ({ source, count }) => {
    expect(domainSites("planted.ts", source)).toEqual(
      Array.from({ length: count }, () => ({ kind: "DOMAIN_ENUMERATION", line: 1, text: source }))
    );
  });

  it("emits a multiline literal on its owning statement line", () => {
    const source = "const allowed =\n  [1,2,3,4,5];";
    expect(domainSites("planted.ts", source)).toEqual([
      { kind: "DOMAIN_ENUMERATION", line: 1, text: "const allowed =" }
    ]);
  });

  // PROPERTY: exactly ONE line in shipped code fixes the ruled ceiling, and it is
  // the owning declaration. Site-addressed, so a second duplicate inside an
  // already-listed file cannot hide behind the first.
  it("leaves no duplicate definition of the ruled ceiling anywhere in shipped code", () => {
    expect(duplicateBoundSitesInShippedCode()).toEqual([]);
  });

  it("keeps the owning declaration as the only depth-bound site in shipped code", () => {
    const sites = depthBoundSitesInShippedCode();
    if (process.env.ORACLE_AUDIT === "1") console.log("SHIPPED_SITES " + JSON.stringify(sites));
    expect(sites).toEqual([
      `${OWNING_DECLARATION.path}:112 [DEPTH_BOUND_LITERAL] ${OWNING_DECLARATION.text}`
    ]);
  });

  // §5 R3: these donor prefixes are completed with the actual LoginFlow body.
  // Original five truncated negatives above remain byte-for-byte unchanged.
  const loginBody = [
    '<span',
    '  className="authCodeBox"',
    '  key={slot}',
    '  data-filled={code.length > slot ? "true" : undefined}',
    '  data-next={code.length === slot ? "true" : undefined}',
    '>',
    '  {code[slot] ?? ""}',
    '</span>'
  ].join("\n");
  const completeLoginLayout = (source: string): string => source.trimEnd().endsWith(".map((slot) => (")
    ? "const view = <div>\n" + source + "\n" + loginBody + "\n))}</div>;"
    : source;

  it("models the actual shipped LoginFlow candidate as six JSX cells and OTHER", () => {
    const path = "apps/ui/components/LoginFlow.tsx";
    const source = readFileSync(join(REPOSITORY_ROOT, path), "utf8");
    const candidate = evaluateOne(path, source);
    expect(source.slice(candidate.start, candidate.end)).toBe("[0, 1, 2, 3, 4, 5]");
    expect(candidate.value).toEqual({ kind: "EXACT", coll: "array", cells: Array.from({ length: 6 }, () => ({ t: "jsx" })) });
    expect(candidate.verdict).toBe("OTHER");
    expect(domainSites(path, source)).toEqual([]);
  });

  it.each([
    { spelling: "leading sentinel dropped by .slice(1)", planted: "const choices = [0, 1, 2, 3, 4, 5].slice(1);" },
    { spelling: "trailing value dropped by .slice(0, -1)", planted: "const choices = [1, 2, 3, 4, 5, 6].slice(0, -1);" },
    { spelling: "leading sentinel dropped by a rest binding", planted: "const [unused, ...choices] = [0, 1, 2, 3, 4, 5];" },
    { spelling: "trailing comma before the narrowing", planted: "const choices = [0, 1, 2, 3, 4, 5,].slice(1);" },
    { spelling: "a later narrowing behind a length-preserving map", planted: "const choices = [0, 1, 2, 3, 4, 5].map(n => n).slice(1);" },
    { spelling: "the same with a block callback", planted: "const choices = [0, 1, 2, 3, 4, 5].map(n => { return n; }).slice(1);" },
    { spelling: "a length-preserving map inside a collapsing wrapper", planted: "const choices = new Set([0, 1, 2, 3, 4, 5].map(n => n || 1));" },
    { spelling: "computed member access", planted: 'const choices = [0, 1, 2, 3, 4, 5]["slice"](1);' },
    { spelling: "narrowing through a type assertion", planted: "const choices = ([0, 1, 2, 3, 4, 5] as const).slice(1);" }
  ])("reports a declaration that DEFINES the ruled domain — $spelling", ({ planted }) => {
    expect(domainSites("planted.tsx", completeLoginLayout(planted)).map((site) => site.kind)).toEqual(["DOMAIN_ENUMERATION"]);
  });

  it.each([
    { spelling: "whole index domain, reversed", planted: "const slots = [0, 1, 2, 3, 4, 5].reverse();" },
    { spelling: "whole index domain, copied", planted: "const slots = [0, 1, 2, 3, 4, 5].slice();" },
    { spelling: "narrowed to a DIFFERENT domain", planted: "const slots = [0, 1, 2, 3, 4, 5].slice(0, 4);" },
    { spelling: "whole index domain, sorted", planted: "const slots = [0, 1, 2, 3, 4, 5].sort();" },
    { spelling: "even filter defines the exact other domain", planted: "const slots = [0, 1, 2, 3, 4, 5].filter(n => n % 2 === 0);" },
    { spelling: "a bare six-page list", planted: "const pages = [1, 2, 3, 4, 5, 6];" },
    { spelling: "a bare index run", planted: "const slots = [0, 1, 2, 3, 4, 5];" }
  ])("does not report a declaration that defines another domain — $spelling", ({ planted }) => {
    const source = completeLoginLayout(planted);
    expect(parseModule("planted.tsx", source).ok).toBe(true);
    if (source !== planted) {
      expect(evaluateOne("planted.tsx", source).value).toEqual({
        kind: "EXACT", coll: "array", cells: Array.from({ length: 6 }, () => ({ t: "jsx" }))
      });
    }
    expect(domainSites("planted.tsx", source)).toEqual([]);
  });

  it.each([
    { layout: "the real six-slot login array", planted: "                  {[0, 1, 2, 3, 4, 5].map((slot) => (" },
    { layout: "the real login array, wrapped after the sentinel", planted: "                  {[0,\n                  1, 2, 3, 4, 5].map((slot) => (" },
    { layout: "the real login array, block comment after the sentinel", planted: "                  {[0, /* first slot */ 1, 2, 3, 4, 5].map((slot) => (" },
    { layout: "the real login array, commented AND wrapped", planted: "                  {[0, /* first slot */\n                  1, 2, 3, 4, 5].map((slot) => (" },
    { layout: "the real login array, line comment after the sentinel", planted: "                  {[0, // first slot\n                  1, 2, 3, 4, 5].map((slot) => (" },
    { layout: "index run, one line", planted: "  const slots = [0, 1, 2, 3, 4, 5];" },
    { layout: "index run, wrapped after the sentinel", planted: "  const slots = [0,\n    1, 2, 3, 4, 5];" },
    { layout: "index run, wrapped before the last value", planted: "  const slots = [0, 1, 2, 3, 4,\n    5];" },
    { layout: "index run, one value per line", planted: "  const slots = [\n    0,\n    1,\n    2,\n    3,\n    4,\n    5\n  ];" },
    { layout: "index run, literal on its own line", planted: "  const slots =\n    [0,\n     1, 2, 3, 4, 5];" },
    { layout: "index run, block comment after the sentinel", planted: "  const slots = [0, /* first slot */ 1, 2, 3, 4, 5];" },
    { layout: "index run, commented AND wrapped", planted: "  const slots =\n    [0, /* first slot */\n     1,\n     2,\n     3,\n     4,\n     5];" },
    { layout: "index run, line comment after the sentinel", planted: "  const slots = [0, // first slot\n    1, 2, 3, 4, 5];" }
  ])("does not read an index run left whole as the ruled domain — $layout", ({ planted }) => {
    const source = completeLoginLayout(planted);
    expect(parseModule("planted.tsx", source).ok).toBe(true);
    if (source !== planted) {
      expect(evaluateOne("planted.tsx", source).value).toEqual({
        kind: "EXACT", coll: "array", cells: Array.from({ length: 6 }, () => ({ t: "jsx" }))
      });
    }
    expect(domainSites("planted.tsx", source)).toEqual([]);
  });

  it.each([
    {
      group: "an index run left whole",
      expected: false,
      layouts: [
        "{[0, 1, 2, 3, 4, 5].map((slot) => (",
        "{[0,\n  1, 2, 3, 4, 5].map((slot) => (",
        "{[0, /* first slot */ 1, 2, 3, 4, 5].map((slot) => (",
        "{[0, /* first slot */\n  1, 2, 3, 4, 5].map((slot) => (",
        "const slots = [0, 1, 2, 3, 4, 5];",
        "const slots =\n  [0,\n   1, 2, 3, 4, 5];"
      ]
    },
    {
      group: "the ruled domain written bare",
      expected: true,
      layouts: [
        "const allowed = [1, 2, 3, 4, 5];",
        "const allowed = [1,\n  2, 3, 4, 5];",
        "const allowed = [\n  1,\n  2,\n  3,\n  4,\n  5\n];",
        "const allowed = new Set([1, 2, 3, 4, 5]);",
        "const allowed = [1, /* one */ 2, 3, 4, 5];"
      ]
    },
    {
      group: "a longer literal narrowed to the ruled domain",
      expected: true,
      layouts: [
        "const choices = [0, 1, 2, 3, 4, 5].slice(1);",
        "const choices = [0,\n  1, 2, 3, 4, 5].slice(1);",
        "const choices = [0, 1, 2, 3, 4, 5,].slice(1);",
        'const choices = [0, 1, 2, 3, 4, 5]["slice"](1);',
        "const choices = ([0, 1, 2, 3, 4, 5] as const).slice(1);",
        "const choices = [0, 1, 2, 3, 4, 5].map(n => n).slice(1);"
      ]
    },
    {
      group: "a bare six-page list left as 1..6",
      expected: false,
      layouts: [
        "const pages = [1, 2, 3, 4, 5, 6];",
        "const pages = [1, 2, 3, 4, 5,\n  6];",
        "const pages = [\n  1,\n  2,\n  3,\n  4,\n  5,\n  6\n];"
      ]
    }
  ])("gives equivalent layouts the same verdict — $group", ({ layouts, expected }) => {
    for (const planted of layouts) {
      const source = completeLoginLayout(planted);
      expect(parseModule("planted.tsx", source).ok).toBe(true);
      if (source !== planted) expect(evaluateOne("planted.tsx", source).value).toEqual({
        kind: "EXACT", coll: "array", cells: Array.from({ length: 6 }, () => ({ t: "jsx" }))
      });
    }
    const verdicts = layouts.map((planted) =>
      domainSites("planted.tsx", completeLoginLayout(planted)).some((site) => site.kind === "DOMAIN_ENUMERATION"));
    expect(verdicts).toEqual(layouts.map(() => expected));
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

  // Bare option-domain controls use the parsed domain emitter (§5.6 R4).
  it.each([
    { spelling: "array option domain", planted: "  {[1, 2, 3, 4, 5].map((value) => value)}" },
    { spelling: "set option domain", planted: "  const allowed = new Set([1, 2, 3, 4, 5]);" }
  ])("detects a duplicate written as $spelling", ({ planted }) => {
    expect(domainSites("planted.tsx", planted).map((site) => site.kind)).toEqual(["DOMAIN_ENUMERATION"]);
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
    expect(domainSites("planted.tsx", planted).map((site) => site.kind)).toEqual(["DOMAIN_ENUMERATION"]);
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
