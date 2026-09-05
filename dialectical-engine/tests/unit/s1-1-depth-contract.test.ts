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
 *   DOMAIN_ENUMERATION   any line spelling the whole domain 1,2,3,4,5 — and only
 *                        the domain, never a longer run that merely contains it
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
/**
 * The ruled domain spelled out as literal values. r3's pattern, restored byte-for-byte.
 *
 * T1B-r1 tried to carry the exclusion HERE, by anchoring the run so it could not match
 * inside a longer one. codex r1 refuted that in two independent ways and both refutations
 * are pinned by controls below:
 *
 *   B1 · a longer literal can still DERIVE exactly the ruled domain.
 *        `[0, 1, 2, 3, 4, 5].slice(1)`, `[1, 2, 3, 4, 5, 6].slice(0, -1)` and
 *        `const [unused, ...choices] = [0, 1, 2, 3, 4, 5]` all evaluate to the ruled
 *        option domain, and all three name no depth, so no other arm rescues them.
 *        **"A longer run is necessarily a different domain" was simply false** — the
 *        literal's input length does not fix the resulting domain.
 *
 *   B2 · a regex cannot carry this exclusion at all, whatever it is anchored on,
 *        because the DOMAIN arm is applied in more than one WINDOW and one of those
 *        windows is a truncated physical line. `const slots = [0,` / `  1, 2, 3, 4, 5];`
 *        puts the complete run on line 2 with its `0,` on line 1: the line window sees a
 *        bounded run and records a site, and `record` only ever ADDS — a later window
 *        returning null cannot retract it. So an anchored pattern excluded the one-line
 *        form and passed the wrapped one, which is layout dependence, the exact fault
 *        T1B existed to remove.
 *
 * So the exclusion is NOT in this pattern. This pattern FINDS runs; a single source-level
 * classification decides which of them are the ruled domain, and every window inherits
 * that one verdict — see `withheldDomainLines`.
 */
const WHOLE_DOMAIN = /\b1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\b/;

/**
 * THE ONE SHAPE THE DOMAIN ARM WITHHOLDS — decided once, over the whole source.
 *
 * The reported defect was `apps/ui/components/LoginFlow.tsx:252`,
 * `{[0, 1, 2, 3, 4, 5].map((slot) => (` — six visual boxes for a six-digit login code,
 * indexed 0..5. It is an INDEX RUN, and the file holds no depth token at all.
 *
 * A run is withheld only when BOTH hold:
 *
 *   1. it is a 0-based contiguous index run — `values[i] === i`, so `[0, 1, 2, 3, 4, 5]`
 *      qualifies and `[1, 2, 3, 4, 5, 6]` does not; and
 *   2. the declaration consumes it WHOLE — nothing is applied to the literal that could
 *      narrow it to the ruled domain. `.map`/`.forEach`/`.entries`/`.keys`/`.values`/
 *      `.join`/`.includes`/`.indexOf`/`.length` are length-preserving or return no array
 *      domain at all; a rest binding (`const [unused, ...choices] = …`) narrows; and
 *      **anything not on that list narrows until someone shows otherwise.**
 *
 * The burden is inverted, exactly as the rest of this oracle inverts it: an unlisted
 * spelling REPORTS. A miss is silent and ships a duplicate ceiling; a false positive is
 * loud and costs one visible diff to the list above. `.slice` is not on the list, so all
 * three B1 derivations report, and none of them needed to be enumerated as a detector.
 *
 * `[1, 2, 3, 4, 5, 6]` therefore reports in EVERY layout. T1B-r1 excluded it and called
 * it "a different domain"; B1's `.slice(0, -1)` is that same literal deriving the ruled
 * domain, so the claim is withdrawn and the safe verdict is the reported one.
 *
 * WHY A LINE SET, and not a smarter predicate. Three windows can report a DOMAIN site
 * (physical line, declaration unit, and the line a unit starts on), and only the source
 * has the context to judge a run whose two ends sit on different lines. So the verdict is
 * computed once here, against the whole source, and applied as a set of lines on which no
 * window may record a DOMAIN site. Equivalent layouts then agree by CONSTRUCTION rather
 * than by assertion — which is what the wrapping controls check.
 *
 * A line is withheld only when EVERY ruled-domain run touching it is withheld, so a real
 * domain sharing a line with an index run is still reported.
 */
const NUMERIC_RUN = /\d+(?:\s*,\s*\d+)+/g;
const RULED_DOMAIN = [1, 2, 3, 4, 5] as const;
const LENGTH_PRESERVING_USE = /^\.(?:map|forEach|entries|keys|values|join|includes|indexOf|length)\b/;
const NARROWS_WITH_A_REST_BINDING = /\.\.\.\s*[A-Za-z_$]/;

interface DomainRun {
  readonly start: number;
  readonly end: number;
  /** true = an unrelated index run: this occurrence must not produce a DOMAIN site. */
  readonly withhold: boolean;
}

/** Every comma-separated integer run that spells the ruled domain, with its verdict. */
function ruledDomainRuns(text: string): DomainRun[] {
  const runs: DomainRun[] = [];
  for (const match of text.matchAll(NUMERIC_RUN)) {
    const values = match[0].split(",").map((value) => Number(value.trim()));
    const spellsDomain = values.some((_, index) =>
      RULED_DOMAIN.every((wanted, offset) => values[index + offset] === wanted));
    if (!spellsDomain) continue;
    const start = match.index;
    const end = start + match[0].length;
    const isIndexRun = values.every((value, index) => value === index);
    // What the declaration does to the literal, read forwards from the run's last digit …
    const after = text.slice(end, end + 120).replace(/^[\s\])]*/, "");
    const consumedWhole = !after.startsWith(".") || LENGTH_PRESERVING_USE.test(after);
    // … and backwards to the nearest statement or block boundary, for a rest binding.
    const before = text.slice(Math.max(0, start - 200), start);
    const statement = before.slice(before.search(/[;{}][^;{}]*$/) + 1);
    runs.push({
      start,
      end,
      withhold: isIndexRun && consumedWhole && !NARROWS_WITH_A_REST_BINDING.test(statement)
    });
  }
  return runs;
}

/** Lines on which no window may record a DOMAIN_ENUMERATION site. */
function withheldDomainLines(source: string): ReadonlySet<number> {
  const verdictsByLine = new Map<number, boolean[]>();
  const note = (line: number, withhold: boolean): void => {
    const seen = verdictsByLine.get(line) ?? [];
    seen.push(withhold);
    verdictsByLine.set(line, seen);
  };
  const lineAt = (index: number): number => {
    let line = 1;
    for (let scan = 0; scan < index; scan += 1) if (source[scan] === "\n") line += 1;
    return line;
  };
  // Every physical line the run's own text touches — this is the window that lost context.
  for (const run of ruledDomainRuns(source)) {
    const last = lineAt(run.end);
    for (let line = lineAt(run.start); line <= last; line += 1) note(line, run.withhold);
  }
  // And the line each declaration unit is ADDRESSED at, which may precede the run entirely.
  for (const unit of declarationUnits(source)) {
    for (const run of ruledDomainRuns(unit.text)) note(unit.line, run.withhold);
  }
  const withheld = new Set<number>();
  for (const [line, verdicts] of verdictsByLine) {
    if (verdicts.length > 0 && verdicts.every(Boolean)) withheld.add(line);
  }
  return withheld;
}

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

/**
 * The two predicates, applied to one candidate text. Bodies unchanged by T1B.
 * F-T1-ORACLE-LOGINFP narrowed the shared `WHOLE_DOMAIN` constant rather than one
 * arm's copy of it, so this predicate and `kindOfCeilingLiteral` below inherit the
 * same correction: the subsequence defect lived in the pattern, in both arms, and
 * fixing one call site would have left the other reading a login array as a domain.
 */
function kindOf(candidate: string): DuplicateKind | null {
  if (MENTIONS_A_DEPTH.test(candidate) && (BARE_FIVE.test(candidate) || SIX_AS_EXCLUSIVE_BOUND.test(candidate))) {
    return "DEPTH_BOUND_LITERAL";
  }
  return WHOLE_DOMAIN.test(candidate) ? "DOMAIN_ENUMERATION" : null;
}

/**
 * The CEILING-LITERAL arms only — the composition the DECLARATION-UNIT scan uses.
 *
 * r3's `kindOf` above is unchanged and is what the line scan still applies. This
 * narrower set exists because the two arms are not the same kind of evidence, and
 * therefore do not deserve the same window:
 *
 *   · `5` and the enumerated domain `1,2,3,4,5` ARE the ceiling. Wherever they
 *     appear inside a declaration that mentions a depth, the ceiling is there.
 *     Widening their window finds real ceilings that wrapping had hidden.
 *   · `6` is NOT the ceiling. It is an INFERENCE from an exclusive comparison
 *     (`depth < 6`), and that inference is carried by the `6` and the depth token
 *     belonging to the SAME comparison. Widen its window to the declaration and it
 *     stops finding ceilings and starts manufacturing pairings — the measured
 *     example is `topic.trim().length > 6` a conjunct from an unrelated `depth`, at
 *     apps/ui/app/new/page.tsx:75.
 *
 * r1 got that distinction right and then drew the wrong conclusion from it: it made
 * the `6` arm LINE-scoped. Comparison-local is not line-local, and refuting the
 * too-wide declaration window was never evidence for the too-narrow line one. The
 * line window turned out to be wrong in BOTH directions — a newline inside one
 * comparison hid a real bound, and collapsing the negative control onto one line
 * manufactured the false one it exists to forbid.
 *
 * So the `6` arm gets the unit that actually matches its own argument: the
 * CONJUNCT. Same lexer, same layout independence, one extra boundary.
 *
 * This is a UNIT decision, not a predicate one: all four regexes are byte-unchanged
 * and r3's `kindOf` is retained verbatim above. It is the one place the oracle is
 * NOT a superset of r3, and that divergence is asserted, not left silent — see
 * "narrows r3 in exactly one place".
 */
function kindOfCeilingLiteral(candidate: string): DuplicateKind | null {
  if (MENTIONS_A_DEPTH.test(candidate) && BARE_FIVE.test(candidate)) return "DEPTH_BOUND_LITERAL";
  return WHOLE_DOMAIN.test(candidate) ? "DOMAIN_ENUMERATION" : null;
}

/** The exclusive-bound arm only — the composition the CONJUNCT-unit scan uses. */
function kindOfExclusiveBound(candidate: string): DuplicateKind | null {
  return MENTIONS_A_DEPTH.test(candidate) && SIX_AS_EXCLUSIVE_BOUND.test(candidate)
    ? "DEPTH_BOUND_LITERAL"
    : null;
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
 *
 * Every one of those is a boundary between DISTINCT declarations, elements or
 * scopes. Nothing splits WITHIN an expression — in particular `&&`, `||` and `??`
 * are ordinary characters here.
 *
 * `splitConjuncts` adds ONE further boundary — `&&`, `||`, `??`, at ANY bracket
 * depth — and is used ONLY for the exclusive-`6` arm, whose own argument is that a
 * `6` is evidence about the comparison it sits in. At any depth, not the unit's own
 * depth: a logical operator separates conjuncts just as much inside `if (...)` as
 * at statement level, and the shallower rule let `if (topic.length > 6 && depth >=
 * MIN)` join into one unit.
 *
 * T1B r1 applied that boundary to the CEILING-LITERAL arm instead, and codex was
 * right to block it: the same expression was then caught on one line and missed
 * when wrapped. The boundary was never wrong — it was on the wrong arm. An
 * operand-order rule was rejected outright: `&&` commutes, so a verdict that
 * depended on which conjunct came first would be layout dependence again.
 *
 * Comments do NOT contribute to unit text — a comment defines no ceiling, and
 * gluing prose into a joined unit invents pairings. Nothing is lost: the LINE scan
 * is retained beside this one and still reads comments exactly as r3 did.
 *
 * WHAT THIS STILL CANNOT SEE, stated plainly rather than claimed away:
 *   · indirection — `const CEILING = 5;` then `depth > CEILING` are two units
 *   · a ceiling that is not the literal `5`: `2 + 3`, `0x5`, `5.0` (a PREDICATE
 *     limit, not a layout one — `BARE_FIVE` never matched those on one line either)
 *   · a bound assembled across two statements or across a brace
 *   · a `6` whose depth token lives in a DIFFERENT conjunct of the same comparison
 *     chain — deliberate, and the whole reason the `6` arm is conjunct-scoped
 * A single-quoted or double-quoted string is closed at the newline, so a regex
 * literal mis-read as a string can only desync within one line, never past it.
 */
function declarationUnits(
  source: string,
  splitConjuncts = false
): { readonly line: number; readonly text: string }[] {
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
    if (splitConjuncts && next !== undefined && char === next
      && (char === "&" || char === "|" || char === "?")) { begin(); index += 2; continue; }
    mark(); buffer += char; index += 1;
  }
  flush();
  return units;
}

/**
 * The oracle, over text — so it can be controlled with planted sources.
 *
 * THREE WINDOWS, each carrying the arms whose evidence it fits:
 *
 *   LINE        · ceiling-literal arms · r3's own window. Kept so that a `5` and a
 *                 depth crowded onto one line still register even where a unit
 *                 boundary falls between them, and so comments stay covered.
 *   DECLARATION · ceiling-literal arms · the ceiling is the ceiling wherever it
 *                 sits in the declaration.
 *   CONJUNCT    · exclusive-`6` arm    · a `6` is evidence only about its own
 *                 comparison.
 *
 * Deduplicated on `line` + `kind`, line text winning, which keeps the
 * owning-declaration exemption matching on its exact r3 text.
 */
function duplicateBoundSites(source: string): DuplicateSite[] {
  const byAddress = new Map<string, DuplicateSite>();
  // ONE verdict, computed against the whole source, obeyed by all three windows below.
  // `record` can only ADD — a window that returns null cannot retract what an earlier
  // window already recorded (codex r1 B2) — so the exclusion has to be applied HERE,
  // where every window passes through, rather than inside any single window's predicate.
  const withheld = withheldDomainLines(source);
  const record = (kind: DuplicateKind | null, line: number, text: string): void => {
    if (kind === null) return;
    if (kind === "DOMAIN_ENUMERATION" && withheld.has(line)) return;
    const address = `${line}:${kind}`;
    if (!byAddress.has(address)) byAddress.set(address, { kind, line, text });
  };
  source.split("\n").forEach((raw, index) => record(kindOfCeilingLiteral(raw), index + 1, raw.trim()));
  for (const unit of declarationUnits(source)) record(kindOfCeilingLiteral(unit.text), unit.line, unit.text);
  for (const unit of declarationUnits(source, true)) record(kindOfExclusiveBound(unit.text), unit.line, unit.text);
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
    expect(duplicateBoundSites(planted)).not.toEqual([]);
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
    expect(duplicateBoundSites(planted)).toEqual([]);
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
    expect(duplicateBoundSites(planted)).not.toEqual([]);
  });

  // The conjunct boundary must apply at ANY bracket depth, not at the unit's own.
  // A logical operator separates conjuncts just as much inside `if (...)` as at
  // statement level, and with the shallower rule this shape joins into one unit and
  // pairs `> 6` with a `depth` that is not its comparison's operand. Mutant m10 is
  // exactly that shallower rule, and this control is what kills it.
  it("does not pair a six with a depth in another conjunct of the same condition", () => {
    expect(duplicateBoundSites("  if (topic.trim().length > 6 && depth >= EXPANSION_DEPTH_MIN) {")).toEqual([]);
  });

  it("does not manufacture a site when the negative control is collapsed onto one line", () => {
    const collapsed =
      "  const ready = topic.trim().length > 6 && depth >= EXPANSION_DEPTH_MIN && depth <= EXPANSION_DEPTH_MAX && riskTier.length > 0;";
    expect(duplicateBoundSites(collapsed)).toEqual([]);
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
    expect(duplicateBoundSites(collapsed)).toEqual([]);
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

  // INDEX-RUN NEGATIVE CONTROLS — the reported defect, in every layout it can be written.
  //
  // The first entry is the real expression at apps/ui/components/LoginFlow.tsx:252 verbatim:
  // six visual boxes for a six-digit login code, indexed 0..5, in a file with no depth token.
  //
  // The WRAPPED entries are codex r1 B2. T1B-r1 anchored the domain pattern so it could not
  // match inside a longer run, which excluded the one-line forms and PASSED these — because
  // the physical-line window sees `1, 2, 3, 4, 5];` with its `0,` on the previous line, and a
  // site recorded by one window is never retracted by another. They are the controls that
  // force the verdict to be computed with whole-source context instead of per candidate.
  it.each([
    { layout: "the real six-slot login array", planted: "                  {[0, 1, 2, 3, 4, 5].map((slot) => (" },
    { layout: "the real login array, wrapped after the sentinel", planted: "                  {[0,\n                  1, 2, 3, 4, 5].map((slot) => (" },
    { layout: "index run, one line", planted: "  const slots = [0, 1, 2, 3, 4, 5];" },
    { layout: "index run, wrapped after the sentinel", planted: "  const slots = [0,\n    1, 2, 3, 4, 5];" },
    { layout: "index run, wrapped before the last value", planted: "  const slots = [0, 1, 2, 3, 4,\n    5];" },
    { layout: "index run, one value per line", planted: "  const slots = [\n    0,\n    1,\n    2,\n    3,\n    4,\n    5\n  ];" },
    { layout: "index run, literal on its own line", planted: "  const slots =\n    [0,\n     1, 2, 3, 4, 5];" }
  ])("does not read an index run consumed whole as the ruled domain — $layout", ({ planted }) => {
    expect(duplicateBoundSites(planted)).toEqual([]);
  });

  // DERIVATION POSITIVE CONTROLS — codex r1 B1, verbatim counterexamples.
  //
  // Each of these evaluates to exactly `[1, 2, 3, 4, 5]`, which is a legitimate way to
  // define a depth selector's options without naming depth. The r3 oracle reported all
  // three; T1B-r1 reported none of them, because it claimed a longer literal was
  // necessarily a different domain. **That claim was false** — the literal's input length
  // does not fix the resulting domain — and these are the controls that hold it withdrawn.
  //
  // None of them mentions a depth, so neither the ceiling-literal nor the exclusive-six arm
  // rescues them: if this arm misses them, nothing catches them.
  it.each([
    { derivation: "leading sentinel dropped by .slice(1)", planted: "const choices = [0, 1, 2, 3, 4, 5].slice(1);" },
    { derivation: "trailing value dropped by .slice(0, -1)", planted: "const choices = [1, 2, 3, 4, 5, 6].slice(0, -1);" },
    { derivation: "leading sentinel dropped by a rest binding", planted: "const [unused, ...choices] = [0, 1, 2, 3, 4, 5];" }
  ])("reads a declaration that DERIVES the ruled domain as a site — $derivation", ({ planted }) => {
    expect(duplicateBoundSites(planted).map((site) => site.kind)).toEqual(["DOMAIN_ENUMERATION"]);
  });

  // THE WITHDRAWN CLAIM, asserted in the direction it was wrong.
  //
  // T1B-r1 excluded `[1, 2, 3, 4, 5, 6]` as "a different domain". B1's second counterexample
  // is that same literal deriving the ruled domain, so the run's own values cannot settle it.
  // Only a 0-based INDEX run is withheld now; every other longer run reports. Reporting is
  // the safe direction — a miss ships a duplicate ceiling silently, a false positive costs
  // one visible diff — and this control is what stops the exclusion being widened back.
  it.each([
    { layout: "one line", planted: "  const pages = [1, 2, 3, 4, 5, 6];" },
    { layout: "wrapped before the last value", planted: "  const pages = [1, 2, 3, 4, 5,\n    6];" }
  ])("reports a longer run that is not a 0-based index run — $layout", ({ planted }) => {
    expect(duplicateBoundSites(planted).map((site) => site.kind)).toEqual(["DOMAIN_ENUMERATION"]);
  });

  // EQUIVALENT LAYOUTS MUST AGREE (codex r1 B2's required property, asserted directly).
  //
  // Every group below is ONE declaration written several ways. The oracle's verdict must be
  // a property of the declaration, never of where the newlines fell. A per-candidate rule
  // cannot satisfy this — the physical-line window's candidate is truncated by construction
  // — which is why the verdict is computed once over the source and obeyed by every window.
  it.each([
    {
      group: "an index run consumed whole",
      expected: false,
      layouts: [
        "{[0, 1, 2, 3, 4, 5].map((slot) => (",
        "{[0,\n  1, 2, 3, 4, 5].map((slot) => (",
        "{[0, 1,\n  2, 3, 4, 5].map((slot) => (",
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
        "const allowed = new Set([1, 2, 3, 4, 5]);"
      ]
    },
    {
      group: "an index run narrowed to the ruled domain",
      expected: true,
      layouts: [
        "const choices = [0, 1, 2, 3, 4, 5].slice(1);",
        "const choices = [0,\n  1, 2, 3, 4, 5].slice(1);",
        "const choices = [0, 1, 2, 3, 4, 5]\n  .slice(1);",
        "const [unused, ...choices] = [0,\n  1, 2, 3, 4, 5];"
      ]
    },
    {
      group: "a longer run that is not an index run",
      expected: true,
      layouts: [
        "const pages = [1, 2, 3, 4, 5, 6];",
        "const pages = [1, 2, 3, 4, 5,\n  6];",
        "const pages = [\n  1,\n  2,\n  3,\n  4,\n  5,\n  6\n];"
      ]
    }
  ])("gives equivalent layouts the same verdict — $group", ({ layouts, expected }) => {
    const verdicts = layouts.map((planted) =>
      duplicateBoundSites(planted).some((site) => site.kind === "DOMAIN_ENUMERATION"));
    expect(verdicts).toEqual(layouts.map(() => expected));
  });

  // WHAT THE WITHHOLDING COSTS, asserted rather than argued.
  //
  // The exclusion can only ever reach candidates that carry NO depth token: the ruled
  // domain's run always contains a bare `5`, so a candidate that spells the run AND mentions
  // a depth is returned by the CEILING-LITERAL arm before the domain arm is consulted. That
  // is why the fix does not — and must not — add a "depth token in reach" disjunct to the
  // domain arm: such a disjunct is unreachable, a check that cannot fire for the reason it
  // exists (D56), and codex W5 r2 F1 refused it separately because it would delete the three
  // bare option-domain controls above. These two shapes are still caught, by the other arm.
  it.each([
    { shape: "index run with a depth token in reach", planted: "  const depthSlots = [0, 1, 2, 3, 4, 5];" },
    { shape: "past the ceiling with a depth token in reach", planted: "  const depthChoices = [1, 2, 3, 4, 5, 6];" }
  ])("still catches a longer run when a depth token is in reach — $shape", ({ planted }) => {
    expect(duplicateBoundSites(planted).map((site) => site.kind)).toEqual(["DEPTH_BOUND_LITERAL"]);
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
