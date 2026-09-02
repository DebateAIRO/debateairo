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
import { createBrowserContractClient } from "../../web/lib/api.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

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
  // construction of BOTH client surfaces — the live apps/ui client and the
  // legacy web/ client — and reach the application as a queued run.
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

  it.each([EXPANSION_DEPTH_MIN, EXPANSION_DEPTH_MAX])(
    "accepts depth %i through the legacy web/ client",
    async (depth) => {
      const api = buildAskApi();
      try {
        const client = createBrowserContractClient(async (input, init) => {
          const url = new URL(String(input), "http://localhost");
          const headers: Record<string, string> = { ...MUTATION_HEADERS };
          new Headers(init?.headers).forEach((value, key) => { headers[key] = value; });
          const response = await api.inject({
            method: "POST",
            url: url.pathname.replace(/^\/api/, ""),
            headers: { ...headers, ...MUTATION_HEADERS },
            payload: init?.body === undefined ? undefined : JSON.parse(String(init.body))
          });
          return new Response(response.body, {
            status: response.statusCode, headers: { "content-type": "application/json" }
          });
        }, "/api");
        await expect(client.submitAsk(askWithout({ depth }) as unknown as AskRequest))
          .resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
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
type DuplicateKind = "DEPTH_BOUND_LITERAL" | "DOMAIN_ENUMERATION";

const MENTIONS_A_DEPTH = /depth/i;
const BARE_FIVE = /(?<![\w.$])5(?![\w.$])/;
const SIX_AS_EXCLUSIVE_BOUND = /(?:[<>]=?\s*6(?![\w.$])|\.(?:lt|gte)\(\s*6\s*\))/;
const WHOLE_DOMAIN = /\b1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\b/;

/**
 * The SINGLE owning declaration, allowed by exact text. Not a path exemption:
 * a second numeric depth export in this very file is still a violation.
 */
const OWNING_DECLARATION = Object.freeze({
  path: "packages/contract/src/index.ts",
  text: "export const EXPANSION_DEPTH_MAX = 5;"
});

interface DuplicateSite {
  readonly kind: DuplicateKind;
  readonly line: number;
  readonly text: string;
}

/** The two predicates, applied to one candidate text. Unchanged by T1B. */
function kindOf(candidate: string): DuplicateKind | null {
  if (MENTIONS_A_DEPTH.test(candidate) && (BARE_FIVE.test(candidate) || SIX_AS_EXCLUSIVE_BOUND.test(candidate))) {
    return "DEPTH_BOUND_LITERAL";
  }
  return WHOLE_DOMAIN.test(candidate) ? "DOMAIN_ENUMERATION" : null;
}

/**
 * DECLARATION UNITS — the layout-independent half of the oracle (T1B, codex r3 B1).
 *
 * The r3 oracle scanned PHYSICAL LINES, so it could only see a ceiling whose depth
 * token and whose literal happened to be typed on the same row. Three ordinary
 * formattings defeated it — a wrapped Zod chain, a comparison split after the
 * operator, and a wrapped `[1, 2, 3, 4, 5]`. That is a check that could not fail
 * for the reason it exists (D56), and the fault was the UNIT, never the predicates.
 *
 * So the predicates above are untouched and only the unit changes: a unit is the
 * enclosing DECLARATION, gathered by a lexer rather than by newline. Newlines are
 * ordinary whitespace, so a ceiling reads the same however it is wrapped.
 *
 * A unit ENDS at:
 *   · `;` or `,` at the unit's own bracket depth   — statement / element separator
 *   · `{` or `}` at any depth                      — a block or object body is its own scope
 *   · a closer that would drop below the start depth
 *   · `&&`, `||`, `??` at the unit's own depth     — each conjunct is a separate claim
 *
 * The logical-operator boundary is not cosmetic: without it the widened unit joined
 * `topic.trim().length > 6` to a `depth` five conjuncts away in
 * apps/ui/app/new/page.tsx and manufactured a false site. It was measured, not
 * guessed. It also costs coverage, disclosed below.
 *
 * Comments do NOT contribute to unit text — a comment defines no ceiling, and
 * gluing prose into a joined unit invents pairings. Nothing is lost: the LINE scan
 * is retained beside this one and still reads comments exactly as r3 did.
 *
 * WHAT THIS STILL CANNOT SEE, stated plainly rather than claimed away:
 *   · indirection — `const CEILING = 5;` then `depth > CEILING` are two units
 *   · a ceiling that is not the literal `5`: `2 + 3`, `0x5`, `5.0` (a PREDICATE
 *     limit, not a layout one — `BARE_FIVE` never matched those on one line either)
 *   · a bound split across `&&`, e.g. `isDepthField(x) && x <= 5`
 *   · a bound assembled across two statements or across a brace
 * A single-quoted or double-quoted string is closed at the newline, so a regex
 * literal mis-read as a string can only desync within one line, never past it.
 */
const UNIT_BOUNDARY_OPERATORS = Object.freeze(["&&", "||", "??"]);

function declarationUnits(source: string): { readonly line: number; readonly text: string }[] {
  const units: { line: number; text: string }[] = [];
  let buffer = "";
  let bracketDepth = 0;
  let startDepth = 0;
  let line = 1;
  let startLine = 0;
  const flush = (): void => {
    const text = buffer.replace(/\s+/g, " ").trim();
    if (text) units.push({ line: startLine || 1, text });
    buffer = "";
    startLine = 0;
  };
  const begin = (): void => { flush(); startDepth = bracketDepth; };
  const mark = (): void => { if (startLine === 0) startLine = line; };
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (char === "\n") { line += 1; buffer += " "; index += 1; continue; }
    if (char === "/" && next === "/") {
      let end = index;
      while (end < source.length && source[end] !== "\n") end += 1;
      buffer += " "; index = end; continue;
    }
    if (char === "/" && next === "*") {
      const close = source.indexOf("*/", index + 2);
      const end = close < 0 ? source.length : close + 2;
      line += (source.slice(index, end).match(/\n/g) ?? []).length;
      buffer += " "; index = end; continue;
    }
    if (char === "'" || char === '"') {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "\\") { end += 2; continue; }
        if (source[end] === char) { end += 1; break; }
        if (source[end] === "\n") break;
        end += 1;
      }
      mark(); buffer += source.slice(index, end); index = end; continue;
    }
    if (char === "`") {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "\\") { end += 2; continue; }
        if (source[end] === "`") { end += 1; break; }
        if (source[end] === "$" && source[end + 1] === "{") {
          let nested = 1; let scan = end + 2;
          while (scan < source.length && nested > 0) {
            if (source[scan] === "{") nested += 1;
            else if (source[scan] === "}") nested -= 1;
            scan += 1;
          }
          end = scan; continue;
        }
        if (source[end] === "\n") line += 1;
        end += 1;
      }
      mark(); buffer += source.slice(index, end).replace(/\s+/g, " "); index = end; continue;
    }
    if (char === "{") { bracketDepth += 1; buffer += " "; begin(); index += 1; continue; }
    if (char === "}") { bracketDepth -= 1; buffer += " "; begin(); index += 1; continue; }
    if (char === "(" || char === "[") { mark(); bracketDepth += 1; buffer += char; index += 1; continue; }
    if (char === ")" || char === "]") {
      bracketDepth -= 1;
      if (bracketDepth < startDepth) { begin(); index += 1; continue; }
      mark(); buffer += char; index += 1; continue;
    }
    if ((char === ";" || char === ",") && bracketDepth === startDepth) { begin(); index += 1; continue; }
    if (bracketDepth === startDepth && next !== undefined
      && UNIT_BOUNDARY_OPERATORS.includes(`${char}${next}`)) { begin(); index += 2; continue; }
    mark(); buffer += char; index += 1;
  }
  flush();
  return units;
}

/**
 * The oracle, over text — so it can be controlled with planted sources.
 *
 * The UNION of the r3 line scan and the T1B declaration-unit scan, so the change
 * is additive: every site r3 reported is still reported, with r3's own text, and
 * the multiline sites are added. Deduplicated on `line` + `kind`, line text winning,
 * which keeps the owning-declaration exemption matching on its exact r3 text.
 */
function duplicateBoundSites(source: string): DuplicateSite[] {
  const byAddress = new Map<string, DuplicateSite>();
  source.split("\n").forEach((raw, index) => {
    const kind = kindOf(raw);
    if (kind !== null) byAddress.set(`${index + 1}:${kind}`, { kind, line: index + 1, text: raw.trim() });
  });
  for (const unit of declarationUnits(source)) {
    const kind = kindOf(unit.text);
    const address = `${unit.line}:${kind}`;
    if (kind !== null && !byAddress.has(address)) {
      byAddress.set(address, { kind, line: unit.line, text: unit.text });
    }
  }
  return [...byAddress.values()].sort((left, right) => left.line - right.line);
}

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
    { spelling: "exclusive six", planted: "  if (!Number.isInteger(depth) || depth < 6) {" },
    { spelling: "array option domain", planted: "  {[1, 2, 3, 4, 5].map((value) => value)}" },
    { spelling: "set option domain", planted: "  const allowed = new Set([1, 2, 3, 4, 5]);" }
  ])("detects a duplicate written as $spelling", ({ planted }) => {
    expect(duplicateBoundSites(planted)).not.toEqual([]);
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
    expect(duplicateBoundSites(planted)).not.toEqual([]);
  });

  // LAYOUT NEGATIVE CONTROL — MEASURED, not imagined. Widening the unit to the
  // whole declaration is what makes the multiline ceilings visible, and the first
  // build of it flagged apps/ui/app/new/page.tsx by pairing `topic.trim().length
  // > 6` with a `depth` five conjuncts further down the same expression. This is
  // that shape. It pins the `&&` boundary: delete `"&&"` from
  // UNIT_BOUNDARY_OPERATORS and this control goes RED.
  it("does not pair an unrelated ceiling with a depth several conjuncts away", () => {
    const planted = [
      "  const ready = topic.trim().length > 6 &&",
      "    depth >= EXPANSION_DEPTH_MIN &&",
      "    depth <= EXPANSION_DEPTH_MAX &&",
      "    riskTier.length > 0;"
    ].join("\n");
    expect(duplicateBoundSites(planted)).toEqual([]);
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
    expect(duplicateBoundSites(planted)).toEqual([]);
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
