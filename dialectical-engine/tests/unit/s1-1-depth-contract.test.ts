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
 * The ruled domain spelled out as literal values — and ONLY when the run IS the
 * domain, never when it is a SUBSEQUENCE of a longer numeric run.
 *
 * EXCLUDED, by shape (F-T1-ORACLE-LOGINFP; codex W5 r2 F1): a run extended past
 * either end. `[0, 1, 2, 3, 4, 5]` — the six 0-based boxes of the login code at
 * apps/ui/components/LoginFlow.tsx:252 — and `[1, 2, 3, 4, 5, 6]`, which overshoots
 * the ceiling. Neither is a second definition of the 1–5 bound; both are different
 * domains that merely contain the ruled one's digits in order. The r3 pattern was
 * unanchored at both ends, so it read the subsequence as the domain and reported a
 * file holding no depth token at all.
 *
 * KEPT: the ruled domain's literal values wherever they sit — `[1, 2, 3, 4, 5]`,
 * `new Set([1, 2, 3, 4, 5])`, and the same values wrapped one per line. Those carry
 * no depth token either, and they must keep firing: the bare option-domain controls
 * are what this arm exists for. So the rule is the SHAPE of the run, never a file
 * allow-list and never a rename.
 *
 * Deliberately NOT a "depth token in reach" rule. The domain run always contains a
 * bare `5`, so any candidate that spells the run AND mentions a depth is already
 * returned by the CEILING-LITERAL arm before this one is consulted — a depth-token
 * disjunct here could never fire, and a check that cannot fire for the reason it
 * exists is D56. What the narrowing gives up is therefore only depth-FREE longer
 * runs, and that is pinned in both directions: by the subsequence negative controls
 * and by "still catches a longer run when a depth token is in reach".
 */
const WHOLE_DOMAIN = /(?<!\d\s*,\s*)\b1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\b(?!\s*,\s*\d)/;

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
  const record = (kind: DuplicateKind | null, line: number, text: string): void => {
    if (kind === null) return;
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

  // SUBSEQUENCE NEGATIVE CONTROLS — MEASURED, not imagined (F-T1-ORACLE-LOGINFP;
  // codex W5 r2 F1). The first entry is the real expression at
  // apps/ui/components/LoginFlow.tsx:252 verbatim: six visual boxes for a six-digit
  // login code, indexed 0..5. It is not a depth domain — the file holds no depth
  // token at all — and the r3 arm reported it only because the unanchored run
  // `1,2,3,4,5` is a SUBSEQUENCE of the 0-based run `0,1,2,3,4,5`.
  //
  // The CLASS is "a longer numeric run that merely CONTAINS the ruled domain", and
  // it has two members, both asserted here: a run extended BEFORE the 1 (0-based
  // origin) and a run extended AFTER the 5 (past the ruled ceiling). The wrapped
  // form is asserted too, because the declaration window joins it back into one
  // unit and a line-only guard would pass this file while still reporting the tree.
  it.each([
    { shape: "the real six-slot login array", planted: "                  {[0, 1, 2, 3, 4, 5].map((slot) => (" },
    { shape: "0-based origin, one line", planted: "  const slots = [0, 1, 2, 3, 4, 5];" },
    {
      shape: "0-based origin, wrapped",
      planted: [
        "  const slots = [",
        "    0,",
        "    1,",
        "    2,",
        "    3,",
        "    4,",
        "    5",
        "  ];"
      ].join("\n")
    },
    { shape: "extended past the ruled ceiling", planted: "  const pages = [1, 2, 3, 4, 5, 6];" }
  ])("does not read a longer numeric run as the ruled domain — $shape", ({ planted }) => {
    expect(duplicateBoundSites(planted)).toEqual([]);
  });

  // WHAT THE NARROWING COSTS, asserted rather than argued.
  //
  // The narrowing is safe because it can only ever reach candidates that carry NO
  // depth token. The ruled domain's own run always contains a bare `5`, so any
  // candidate that spells the run AND mentions a depth is returned by the
  // CEILING-LITERAL arm before the domain arm is consulted at all. That is why the
  // fix does not — and must not — add a "depth token in reach" disjunct to the
  // domain arm: such a disjunct is unreachable, a check that cannot fire for the
  // reason it exists (D56).
  //
  // So these two shapes, which the domain arm no longer claims, are still caught —
  // by the other arm. If anyone ever narrows BARE_FIVE, this control says so.
  it.each([
    { shape: "0-based origin with a depth token in reach", planted: "  const depthSlots = [0, 1, 2, 3, 4, 5];" },
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
