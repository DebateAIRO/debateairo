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
 * The goal's negative invariant is literal: "No second literal 5". A duplicate
 * SOURCE is therefore any shipped line that re-fixes the CEILING itself, in any
 * of the three syntaxes the codebase actually uses to express a domain:
 *
 *   VALIDATOR      a schema re-validating the bound   `depth: z.…min(1).max(5)`
 *   COMPARISON     a guard re-comparing against it    `depth <= 5`, `depth > 5`
 *   OPTION_DOMAIN  an enumeration of the whole range  `[1, 2, 3, 4, 5]`
 *
 * Two deliberate exclusions, each reasoned rather than convenient:
 *   · The OWNER's own declaration is not matched, because it names a constant
 *     (`EXPANSION_DEPTH_MAX = 5`) rather than restating the bound in a bound
 *     position. Assignment to a named export IS the single source; the scan is
 *     therefore run over packages/contract too, and passes on its merits.
 *   · A floor-only guard carrying no ceiling literal (`depth < 1`, as at
 *     web/app/new/NewQuestionForm.tsx:18) is NOT a second definition of the 1–5
 *     bound and contains no second literal 5. It is a separate completeness gap,
 *     reported as finding F-T1-4 and owned by T2, not silenced here.
 */
type DuplicateKind = "VALIDATOR" | "COMPARISON" | "OPTION_DOMAIN";

const CEILING_DETECTORS: ReadonlyArray<{ readonly kind: DuplicateKind; readonly pattern: RegExp }> = [
  { kind: "VALIDATOR", pattern: /depth[^\n]{0,80}?\.max\(\s*5\s*\)/i },
  { kind: "COMPARISON", pattern: /\bdepth\b[^\n]{0,40}?(?:<=?\s*[56]\b|>=?\s*[56]\b)/i },
  { kind: "OPTION_DOMAIN", pattern: /\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*\]/ }
];

interface DuplicateSite {
  readonly kind: DuplicateKind;
  readonly line: number;
  readonly text: string;
}

/** The oracle, over text — so it can be controlled with planted sources. */
function duplicateBoundSites(source: string): DuplicateSite[] {
  return source.split("\n").flatMap((text, index) => CEILING_DETECTORS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ kind }) => ({ kind, line: index + 1, text: text.trim() })));
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

/** Every duplicate SITE in shipped code, addressed `path:line [KIND] text`. */
function duplicateBoundSitesInShippedCode(): string[] {
  return shippedSourceFiles().flatMap((absolute) => {
    const path = relative(REPOSITORY_ROOT, absolute).split(sep).join("/");
    return duplicateBoundSites(readFileSync(absolute, "utf8"))
      .map((site) => `${path}:${site.line} [${site.kind}] ${site.text}`);
  }).sort();
}

describe("S1-1 · the depth bound has a single source", () => {
  // PROPERTY: no shipped file re-fixes the ceiling in ANY syntax. Site-addressed,
  // not file-addressed, so a second duplicate inside an already-listed file
  // cannot hide behind the first.
  it("leaves no duplicate definition of the ruled ceiling anywhere in shipped code", () => {
    expect(duplicateBoundSitesInShippedCode()).toEqual([]);
  });

  // POSITIVE CONTROLS — the oracle detects each syntax class it claims to cover.
  // Without these, an oracle that silently matched nothing would also be "green".
  it.each([
    { kind: "VALIDATOR", planted: "  depth: z.number().int().min(1).max(5)," },
    { kind: "COMPARISON", planted: "  const ready = depth >= 1 && depth <= 5;" },
    { kind: "OPTION_DOMAIN", planted: "  {[1, 2, 3, 4, 5].map((value) => value)}" }
  ])("detects a planted $kind duplicate", ({ kind, planted }) => {
    expect(duplicateBoundSites(planted).map((site) => site.kind)).toContain(kind as DuplicateKind);
  });

  // NEGATIVE CONTROLS — unrelated depth concepts, and a floor-only guard, are
  // not flagged. Each line is real code from this repo.
  it.each([
    "  if (depth >= limits.maxDepth) {",                              // logger recursion depth
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
