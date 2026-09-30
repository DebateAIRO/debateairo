import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { AnswerSchema, AskAcceptedSchema, EVENT_TYPES, RunEventSchema, RunProjectionSchema } from "@debateai/contract";
import { describe, expect, it } from "vitest";
import {
  collectSealCodes, createHttpPorts, firstSentence, judgeLegs, parseHsS01Arguments, runHsS01,
  type HsS01Ports
} from "./hs-s01-accept.js";

const answer = (terminal = "SERVED", claims: string[] = []) => ({
  answer_id: "answer:test", answer_version: 1, run_ref: "run:test", question_line: "Test question?",
  terminal, verdict_state: null, verdict_unavailable: { reason_ref: "reason:test" },
  confidence_band: null, band_ceiling: null, answer_form: null, serve_state: "COMPONENTS_ONLY",
  composed_text: [], number_slots: [], abstention: null, shadow_suppressions: [],
  nodes: claims.map((claim, i) => ({
    node_id: `node:${i}`, claim, way_of_knowing: "REASONING",
    base_score: { value: 1, kind: "score", source: "test", producer: "test", provenance_ref: "test", replay_handle: "test" },
    final_strength: null, provenance_ref: `artifact:${i}`, maker_lineage: null, review: null,
    locator: null, stranger_restatement: { check_status: "NOT_SAMPLED" }, defeater_refs: [],
    defeater_exhaustion_marked: false, disagreement: null, condition_marks: [], abstention: null,
    staleness_state: "FRESH", relevant_as_of: "2026-09-29T00:00:00.000Z"
  })),
  edges: [], badges: [], residual_objections: [], value_hinges: [], condition_marks: [],
  condition_mark_records: [], reversal_point: "test", builds_on_previous: { value: false, answer_ref: null },
  memory_disclosure: null, risk_tier: "standard", tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "test",
  cost_envelope: { basis: {}, state: "WITHIN", consumed_model_attempts: 0, protected_core: "NEVER_SKIPPABLE" },
  composition_budget_tier: "low", conformance_outcome: "PASS", ledger_digest_handle: "test",
  inspection_handle: "test", as_of: "2026-09-29T00:00:00.000Z", staleness_state: "FRESH",
  relevant_as_of: "2026-09-29T00:00:00.000Z"
});

const census = (registerVersion: string, rowCount = 12, actualRows = rowCount) =>
  ({ registerVersion, rowCount, actualRows, sealed: true });
const before = "HS-S01 CENSUS version=4 row_count=12 actual_rows=12 sealed=true\n"
  + "HS-S01 CENSUS version=5 row_count=12 actual_rows=12 sealed=true\nHS-S01 CENSUS max=5 receipt=5";
const row = (callSiteKey: string, sequence: number, rawArtifactRef: string | null, parseStatus: string | null = "PARSED") =>
  ({ callSiteKey, sequence, rawArtifactRef, parseStatus });
function ports(overrides: Partial<HsS01Ports> = {}): HsS01Ports {
  return {
    login: async () => {}, ask: async () => "run:test",
    waitForTerminal: async () => ({ state: "SETTLED", run: {} }),
    readAnswer: async () => answer(), readEvents: async () => [], readWorkItemReasons: async () => [],
    readJudgeLegRows: async () => [], readNodeProvenance: async () => [],
    readCensus: async () => [census("6"), census("4"), census("5")], readReceiptVersion: async () => "6",
    readText: async () => before, ...overrides
  };
}

// A fake of the served API, each route answering in the wire shape its REAL handler writes (TEST rehearsal
// t_c6155011: a port-level fake returned an array where the route streams SSE, and hid the CLI's json() read).
// Every body passes the route's own schema first; content types are what Fastify's reply.send(object) and the
// events route's writeHead send (apps/api/src/index.ts:1821-1848 login, :2255-2270 asks, :2455-2474 events,
// :2475-2480 run, :2499-2503 answer); the proxy at :3000/api copies content-type and set-cookie through.
const ORIGIN = "https://localhost:3000";
const RUN = "0f5c2a64-8a1e-4c1b-9d4e-2b7f3c9a1e55";
const JSON_TYPE = "application/json; charset=utf-8";
const reply = (status: number, body: unknown, headers: [string, string][] = []) =>
  new Response(JSON.stringify(body), { status, headers: [["content-type", JSON_TYPE], ...headers] });
const event = (sequence: number, payload: Record<string, unknown> = {}) => RunEventSchema.parse({
  event_id: `event_${sequence}`, event_type: EVENT_TYPES[0], run_ref: RUN, at_sequence: sequence, payload });
// The events route's own frame, byte for byte (index.ts:2471).
const frame = (events: readonly { event_id: string; event_type: string }[]) =>
  events.map(e => `id: ${e.event_id}\nevent: ${e.event_type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const stream = (body: string) => new Response(body, { status: 200, headers: [
  ["content-type", "text/event-stream"], ["cache-control", "no-store"], ["connection", "keep-alive"]] });
const run = (state: "RUNNING" | "SETTLED" | "FAILED") => RunProjectionSchema.parse({ run_ref: RUN, question_line: "Test question?",
  state, terminal_reason: state === "FAILED" ? "WORKER_FAILED" : null, hold_until: null });
type Route = (body: Record<string, unknown> | undefined) => Response;
function server(overrides: Record<string, Route> = {}) {
  const trace: { route: string; headers: Record<string, string> }[] = [];
  const routes: Record<string, Route> = {
    "POST /api/v1/auth/login": body => body?.challenge_token === undefined
      ? reply(202, { status: "MFA_REQUIRED", challenge_token: "challenge_1" })
      : reply(200, { status: "AUTHENTICATED", csrf_token: "csrf_1", session: {} }, [
        ["set-cookie", "__Host-debateai-session=session_1; Path=/; Secure; HttpOnly; SameSite=Strict"],
        ["set-cookie", "__Host-debateai-csrf=csrf_1; Path=/; Secure; SameSite=Strict"]]),
    "POST /api/v1/asks": () => reply(202, AskAcceptedSchema.parse({ run_ref: RUN, status: "QUEUED" })),
    [`GET /api/v1/runs/${RUN}`]: () => reply(200, run("SETTLED")),
    [`GET /api/v1/runs/${RUN}/answer`]: () => reply(200, AnswerSchema.parse(answer())),
    [`GET /api/v1/runs/${RUN}/events`]: () => stream(frame([event(1), event(2)])),
    ...overrides
  };
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const route = `${init?.method ?? "GET"} ${url.pathname}`;
    trace.push({ route, headers: Object.fromEntries(new Headers(init?.headers)) });
    if (url.origin !== ORIGIN || routes[route] === undefined) throw new Error(`UNEXPECTED ${route}`);
    return routes[route]!(typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined);
  };
  return { fetch, trace };
}
// A 0.6 s poll window and a sleep that yields to the timer queue: a port that never sees a terminal ends as
// TIMEOUT inside the test instead of spinning for the default 60 minutes.
const credentials = { HS_ACCEPT_EMAIL: "accept@example.test", HS_ACCEPT_PASSWORD: "test-password",
  HS_ACCEPT_TOTP_SECRET: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", HS_ACCEPT_TIMEOUT_MINUTES: "0.01" };
function live(fake: ReturnType<typeof server>, sleeps: number[] = []): HsS01Ports {
  return { ...ports(), ...createHttpPorts({ fetch: fake.fetch, env: credentials, origin: ORIGIN,
    sleep: async ms => { sleeps.push(ms); await new Promise(resolve => setImmediate(resolve)); } }) };
}

describe("hs:accept-s01", () => {
  // Property: only the operator grammar is accepted; mutant: accept a relative comparison path.
  it("argv parsing: 6 accepted shapes and 3 refused", () => {
    for (const [argv, want] of [
      [[], { kind: "run", questionId: "Q-N" }],
      [["--question", "Q-N"], { kind: "run", questionId: "Q-N" }],
      [["--question", "Q-H"], { kind: "run", questionId: "Q-H" }],
      [["--census"], { kind: "census" }],
      [["--census-compare", "/tmp/before"], { kind: "census-compare", beforePath: "/tmp/before" }],
      [["--census-compare", "/tmp/with space"], { kind: "census-compare", beforePath: "/tmp/with space" }]
    ] as const) expect(parseHsS01Arguments(argv)).toEqual(want);
    for (const argv of [["--bogus"], ["--question", "Q-X"], ["--census-compare", "relative"]]) {
      expect(() => parseHsS01Arguments(argv)).toThrow(new TypeError("HS_S01_ARGUMENTS_INVALID"));
    }
  });
  // Property: each served terminal passes and sends the fixed neutral question after login.
  it("Q-N PASS prints exactly the two SPEC lines", async () => {
    for (const terminal of ["SERVED", "DOWNGRADED", "COMPONENTS_ONLY"]) {
      const trace: string[] = [];
      const result = await runHsS01([], ports({
        login: async () => { trace.push("login"); },
        ask: async question => { trace.push(question); return "run:returned"; },
        waitForTerminal: async ref => { trace.push(ref); return { state: "SETTLED", run: {} }; },
        readAnswer: async () => answer(terminal)
      }));
      expect({ result, trace }).toEqual({ result: { lines: [
        `HS-S01 Q-N terminal=${terminal} codes=none`, "HS-S01-ACCEPT: PASS"
      ], exitCode: 0 }, trace: ["login", "Should Romania cap immigration at 50,000 people a year because of housing costs?", "run:returned"] });
    }
  });
  // Property: timeout wins even when records carry a seal code; mutant: choose codes first.
  it("Q-N FAIL NO_TERMINAL wins over a seal code", async () => {
    expect(await runHsS01([], ports({ waitForTerminal: async () => ({ state: "TIMEOUT", run: { code: "SEALED_BAD" } }), readAnswer: async () => null })))
      .toEqual({ lines: ["HS-S01 Q-N terminal=NONE codes=SEALED_BAD", "HS-S01-ACCEPT: FAIL NO_TERMINAL"], exitCode: 1 });
  });
  // Property: BLOCKED is a failure, before seal codes; mutant: include BLOCKED among served terminals.
  it("Q-N FAIL TERMINAL_BLOCKED", async () => {
    expect(await runHsS01([], ports({ readAnswer: async () => answer("BLOCKED"), readEvents: async () => ["REGISTER_BAD"] })))
      .toEqual({ lines: ["HS-S01 Q-N terminal=BLOCKED codes=REGISTER_BAD", "HS-S01-ACCEPT: FAIL TERMINAL_BLOCKED"], exitCode: 1 });
  });
  // Property: a FAILED run cannot inherit a served answer's terminal.
  it("Q-N FAIL TERMINAL_FAILED on a FAILED run", async () => {
    expect(await runHsS01([], ports({ waitForTerminal: async () => ({ state: "FAILED", run: {} }) })))
      .toEqual({ lines: ["HS-S01 Q-N terminal=FAILED codes=none", "HS-S01-ACCEPT: FAIL TERMINAL_FAILED"], exitCode: 1 });
  });
  // Property: every record source contributes codes, deduplicated and sorted, with the first determining failure.
  it("Q-N FAIL PROMPT_FRAME_ABSENT found in events", async () => {
    expect(await runHsS01([], ports({
      waitForTerminal: async () => ({ state: "SETTLED", run: { nested: ["SEALED_Z"] } }),
      readAnswer: async () => ({ ...answer(), badges: ["REGISTER_A"] }),
      readEvents: async () => [{ data: ["PROMPT_FRAME_ABSENT", "SEALED_Z"] }],
      readWorkItemReasons: async () => [null, "REGISTER_B"]
    }))).toEqual({ lines: ["HS-S01 Q-N terminal=SERVED codes=PROMPT_FRAME_ABSENT,REGISTER_A,REGISTER_B,SEALED_Z", "HS-S01-ACCEPT: FAIL PROMPT_FRAME_ABSENT"], exitCode: 1 });
    expect(collectSealCodes([{ PROMPT_KEY: "not a code", nested: ["SEALED_Z", "PROMPT_A", "SEALED_Z", 1, null] }]))
      .toEqual(["PROMPT_A", "SEALED_Z"]);
  });
  // Property: prose and object keys never become codes; mutant: remove the regex end anchor.
  it("Q-N ignores prose that merely starts with PROMPT_", async () => {
    expect(await runHsS01([], ports({ readAnswer: async () => answer("SERVED", ["PROMPT_X is a word"]), readEvents: async () => ({ PROMPT_KEY: "prose" }) })))
      .toEqual({ lines: ["HS-S01 Q-N terminal=SERVED codes=none", "HS-S01-ACCEPT: PASS"], exitCode: 0 });
  });
  // Property: retries collapse into legs ordered by first call; first PARSED artifact joins to the answer node.
  it("Q-H PASS with 2 support and 1 attack legs prints 3 FIRST-SENTENCE lines in leg order", async () => {
    const questions: string[] = [];
    expect(await runHsS01(["--question", "Q-H"], ports({
      ask: async q => { questions.push(q); return "run:test"; },
      readAnswer: async () => answer("SERVED", ["Support one. More.", "Attack first! More.", "Support two? More."]),
      readJudgeLegRows: async () => [row("JUDGE:defender:two", 5, "artifact:2"), row("JUDGE:defender:one", 4, "artifact:0"), row("JUDGE:critic:one", 2, "artifact:1"), row("JUDGE:defender:one", 1, "failed", "INVALID"), row("JUDGE:defender:one", 6, "wrong")],
      readNodeProvenance: async () => [0, 1, 2].map(i => ({ nodeId: `node:${i}`, provenanceRef: `artifact:${i}` }))
    }))).toEqual({ lines: ["HS-S01 Q-H terminal=SERVED legs=3 schema-valid=3", "HS-S01 Q-H LEG support FIRST-SENTENCE: Support one.", "HS-S01 Q-H LEG attack FIRST-SENTENCE: Attack first!", "HS-S01 Q-H LEG support FIRST-SENTENCE: Support two?", "HS-S01-ACCEPT: PASS"], exitCode: 0 });
    expect(questions).toEqual(["Should Roma lose their Romanian citizenship?"]);
  });
  // Property: a served run with no judge calls is insufficient evidence.
  it("Q-H FAIL NO_LEGS on a SERVED run with 0 legs", async () => {
    expect(await runHsS01(["--question", "Q-H"], ports())).toEqual({ lines: ["HS-S01 Q-H terminal=SERVED legs=0 schema-valid=0", "HS-S01-ACCEPT: FAIL NO_LEGS"], exitCode: 1 });
  });
  // Property: every leg needs a parsed row; missing projections print placeholders without inventing prose.
  it("Q-H FAIL LEG_SCHEMA_INVALID when one leg has no PARSED row", async () => {
    expect(await runHsS01(["--question", "Q-H"], ports({ readJudgeLegRows: async () => [row("JUDGE:defender:one", 1, "bad", "INVALID"), row("JUDGE:critic:one", 2, "absent")] })))
      .toEqual({ lines: ["HS-S01 Q-H terminal=SERVED legs=2 schema-valid=1", "HS-S01 Q-H LEG support FIRST-SENTENCE: (no schema-valid answer)", "HS-S01 Q-H LEG attack FIRST-SENTENCE: (node not in answer)", "HS-S01-ACCEPT: FAIL LEG_SCHEMA_INVALID"], exitCode: 1 });
  });
  // Property: terminal failure wins over leg failures, and timeout wins over both.
  it("Q-H FAIL order: TERMINAL_ before NO_LEGS", async () => {
    expect(await runHsS01(["--question", "Q-H"], ports({ readAnswer: async () => answer("BLOCKED") })))
      .toEqual({ lines: ["HS-S01 Q-H terminal=BLOCKED legs=0 schema-valid=0", "HS-S01-ACCEPT: FAIL TERMINAL_BLOCKED"], exitCode: 1 });
    expect(await runHsS01(["--question", "Q-H"], ports({ waitForTerminal: async () => ({ state: "TIMEOUT", run: {} }), readAnswer: async () => null })))
      .toEqual({ lines: ["HS-S01 Q-H terminal=NONE legs=0 schema-valid=0", "HS-S01-ACCEPT: FAIL NO_TERMINAL"], exitCode: 1 });
  });
  // Property: only exact JUDGE namespace members count, including root/cross-root as other.
  it("judge leg kinds: defender→support, critic→attack, root and cross-root→other, PANEL excluded", () => {
    expect(judgeLegs([row("JUDGE:defender:x", 3, "s"), row("JUDGE:critic:x", 2, "a"), row("JUDGE", 1, null, null), row("JUDGE:cross-root:x", 4, "c"), row("PANEL:x", 0, "p"), row("JUDGEMENT", 0, "j")]))
      .toEqual([
        { callSiteKey: "JUDGE", kind: "other", schemaValid: false, parsedArtifactRef: null },
        { callSiteKey: "JUDGE:critic:x", kind: "attack", schemaValid: true, parsedArtifactRef: "a" },
        { callSiteKey: "JUDGE:defender:x", kind: "support", schemaValid: true, parsedArtifactRef: "s" },
        { callSiteKey: "JUDGE:cross-root:x", kind: "other", schemaValid: true, parsedArtifactRef: "c" }
      ]);
  });
  // Property: this is punctuation splitting, not abbreviation recognition; whitespace collapses first.
  it('firstSentence: "Dr. X" edge, "?" end, no terminator, newlines collapsed', () => {
    expect(["Dr. X arrives.", "Why?", " no terminator ", "First\nline.\tSecond.", "A.b! Next."] .map(firstSentence))
      .toEqual(["Dr.", "Why?", "no terminator", "First line.", "A.b!"]);
  });
  // Property: versions use numeric order (10 after 5), with explicit sealed and receipt values.
  it("census prints one line per version and the max/receipt line", async () => {
    expect(await runHsS01(["--census"], ports({ readCensus: async () => [census("10"), { ...census("5", 13, 12), sealed: false }], readReceiptVersion: async () => null })))
      .toEqual({ lines: ["HS-S01 CENSUS version=5 row_count=13 actual_rows=12 sealed=false", "HS-S01 CENSUS version=10 row_count=12 actual_rows=12 sealed=true", "HS-S01 CENSUS max=10 receipt=NONE"], exitCode: 0 });
  });
  // Property: comparison preserves both earlier counts and names new versions with their receipt.
  it("census-compare PASS", async () => {
    const paths: string[] = [];
    expect(await runHsS01(["--census-compare", "/tmp/before"], ports({ readText: async p => { paths.push(p); return before; } })))
      .toEqual({ lines: ["HS-S01 CENSUS-COMPARE version=4 before=12 after=12 row_count_before=12 row_count_after=12 SAME", "HS-S01 CENSUS-COMPARE version=5 before=12 after=12 row_count_before=12 row_count_after=12 SAME", "HS-S01 CENSUS-COMPARE new=6 receipt=6", "HS-S01-CENSUS: PASS"], exitCode: 0 });
    expect(paths).toEqual(["/tmp/before"]);
    // A new lower version cannot masquerade as a reseed above all history.
    expect((await runHsS01(["--census-compare", "/tmp/before"], ports({ readCensus: async () => [census("3"), census("4"), census("5")], readReceiptVersion: async () => "3" }))).lines.at(-1))
      .toBe("HS-S01-CENSUS: FAIL CENSUS_NEW_NOT_ABOVE_OLD");
  });
  // Property: missing historical evidence fails with a fixed code, never a comparison PASS.
  it("census-compare rejects an empty or unrecognised before capture", async () => {
    for (const text of ["", "HS-S01 CENSUS max=5 receipt=5", "HS-S01 CENSUS version=oops row_count=1 actual_rows=1 sealed=true"]) {
      expect(await runHsS01(["--census-compare", "/tmp/before"], ports({ readText: async () => text })))
        .toEqual({ lines: ["HS-S01-ACCEPT: FAIL HS_S01_CENSUS_BEFORE_INVALID"], exitCode: 1 });
    }
  });
  // Property: either actual_rows OR declared row_count changing fails, and the CHANGED line prints BOTH
  // pairs, so the number that moved is on the line (REV-S01-p1 pt N3: row_count 12→13 once printed 12/12).
  it("census-compare FAIL CENSUS_ROW_COUNT_CHANGED_5", async () => {
    for (const changed of [census("5", 13, 12), census("5", 12, 13)]) {
      expect(await runHsS01(["--census-compare", "/tmp/before"], ports({ readCensus: async () => [census("4"), changed, census("6")] })))
        .toEqual({ lines: ["HS-S01 CENSUS-COMPARE version=4 before=12 after=12 row_count_before=12 row_count_after=12 SAME", `HS-S01 CENSUS-COMPARE version=5 before=12 after=${changed.actualRows} row_count_before=12 row_count_after=${changed.rowCount} CHANGED`, "HS-S01 CENSUS-COMPARE new=6 receipt=6", "HS-S01-CENSUS: FAIL CENSUS_ROW_COUNT_CHANGED_5"], exitCode: 1 });
    }
  });
  // Property: missing history outranks changed rows and missing new publication.
  it("census-compare FAIL CENSUS_VERSION_MISSING_4", async () => {
    expect(await runHsS01(["--census-compare", "/tmp/before"], ports({ readCensus: async () => [census("5", 13)] })))
      .toEqual({ lines: ["HS-S01 CENSUS-COMPARE version=4 before=12 after=MISSING row_count_before=12 row_count_after=MISSING CHANGED", "HS-S01 CENSUS-COMPARE version=5 before=12 after=13 row_count_before=12 row_count_after=13 CHANGED", "HS-S01 CENSUS-COMPARE new=none receipt=6", "HS-S01-CENSUS: FAIL CENSUS_VERSION_MISSING_4"], exitCode: 1 });
  });
  // Property: unchanged history alone cannot certify a reseed.
  it("census-compare FAIL CENSUS_NO_NEW_VERSION", async () => {
    expect((await runHsS01(["--census-compare", "/tmp/before"], ports({ readCensus: async () => [census("4"), census("5")] }))).lines.at(-1))
      .toBe("HS-S01-CENSUS: FAIL CENSUS_NO_NEW_VERSION");
  });
  // Property: receipt must identify one of the newly observed versions, including when absent.
  it("census-compare FAIL CENSUS_RECEIPT_NOT_NEW", async () => {
    for (const receipt of ["4", null]) expect((await runHsS01(["--census-compare", "/tmp/before"], ports({ readReceiptVersion: async () => receipt }))).lines.at(-1))
      .toBe("HS-S01-CENSUS: FAIL CENSUS_RECEIPT_NOT_NEW");
  });
  // Property: missing credentials map to a fixed public code; a token-shaped error code prints, bounded to 120.
  it("credentials missing → FAIL CREDENTIALS_MISSING and no credential in any line", async () => {
    expect(await runHsS01([], ports({ login: async () => { throw new TypeError("HS_S01_CREDENTIALS_MISSING"); } })))
      .toEqual({ lines: ["HS-S01-ACCEPT: FAIL CREDENTIALS_MISSING"], exitCode: 1 });
    expect(await runHsS01([], ports({ login: async () => { throw Object.assign(new Error("secret-password"), { code: "AUTH_FAILED" }); } })))
      .toEqual({ lines: ["HS-S01-ACCEPT: FAIL AUTH_FAILED"], exitCode: 1 });
    expect(await runHsS01([], ports({ login: async () => { throw Object.assign(new Error("x"), { code: "X".repeat(121) }); } })))
      .toEqual({ lines: [`HS-S01-ACCEPT: FAIL ${"X".repeat(120)}`], exitCode: 1 });
  });
  // Property (REV-S01-p1 sd N2, class "free error text reaches the FAIL line"): the FAIL value is a token-shaped
  // `code`, or one of this module's own HS_S01_ codes, or HS_S01_UNKNOWN_ERROR — never a message, a non-token
  // code, or a parser's dump. Mutant: restore `detail.code ?? detail.message`.
  it("an error's free text never reaches the FAIL line", async () => {
    const canary = "rev-s01-password-canary-7f3a";
    const unknown = { lines: ["HS-S01-ACCEPT: FAIL HS_S01_UNKNOWN_ERROR"], exitCode: 1 };
    const cases: [string, Partial<HsS01Ports>, string[], unknown][] = [
      ["uncoded Error", { login: async () => { throw new Error(canary); } }, [], unknown],
      ["code that is free text", { login: async () => { throw Object.assign(new Error("x"), { code: canary }); } }, [], unknown],
      ["numeric code", { login: async () => { throw Object.assign(new Error(canary), { code: 28 }); } }, [], unknown],
      ["own-prefix message not in the list", { login: async () => { throw new TypeError("HS_S01_NOT_A_CODE"); } }, [], unknown],
      ["thrown string", { login: async () => { throw canary; } }, [], unknown],
      ["thrown null", { login: async () => { throw null; } }, [], unknown],
      ["BigInt SyntaxError on a census version", { readCensus: async () => [census(canary), census("2")] }, ["--census"], unknown],
      ["served answer the contract refuses", { readAnswer: async () => ({ ...answer(), terminal: canary }) }, [],
        { lines: ["HS-S01-ACCEPT: FAIL HS_S01_ANSWER_INVALID"], exitCode: 1 }],
      ["token code from a library", { login: async () => { throw Object.assign(new Error(canary), { code: "ECONNRESET" }); } }, [],
        { lines: ["HS-S01-ACCEPT: FAIL ECONNRESET"], exitCode: 1 }]
    ];
    for (const [name, overrides, argv, want] of cases) {
      const result = await runHsS01(argv, ports(overrides));
      expect({ name, result }).toEqual({ name, result: want });
      expect(result.lines.join("\n")).not.toContain(canary);
    }
  });
  // Property: the allow-list is complete — every HS_S01_ code the two acceptance files throw prints itself
  // (CREDENTIALS_MISSING keeps its public name). Mutant: drop one code from the list.
  it("every HS_S01_ code the acceptance files throw reaches the FAIL line", async () => {
    const thrown = ["acceptance/hs-s01-accept.ts", "acceptance/hs-s01-accept-cli.ts"].flatMap(file =>
      [...readFileSync(file, "utf8").matchAll(/new TypeError\((?:"|`)(HS_S01_[A-Z0-9_]*)(\$\{[^}]*\})?(?:"|`)\)/g)]
        .map(match => match[2] ? `${match[1]}503` : match[1]!));
    expect(thrown.length).toBe(12);
    for (const code of thrown) {
      expect((await runHsS01([], ports({ login: async () => { throw new TypeError(code); } }))).lines)
        .toEqual([`HS-S01-ACCEPT: FAIL ${code === "HS_S01_CREDENTIALS_MISSING" ? "CREDENTIALS_MISSING" : code}`]);
    }
  });
  // Property: the new command cannot introduce a shell subprocess path; required packet source pin.
  it("the two new acceptance files contain none of relay-core.test.ts's forbidden shell patterns", () => {
    const forbidden = [
      "shell: true", "shell:true", "sh -c", "execSync", "spawnSync", "execFile",
      "/bin/sh", "/bin/bash", "/bin/zsh"
    ];
    for (const file of ["acceptance/hs-s01-accept.ts", "acceptance/hs-s01-accept-cli.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(forbidden.filter(pattern => source.includes(pattern))).toEqual([]);
    }
  });
  // Property: the operator command selects Node's system CA and the correct entrypoint.
  it("package.json script is EXACT", () => {
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts["hs:accept-s01"])
      .toBe("NODE_OPTIONS=--use-system-ca tsx acceptance/hs-s01-accept-cli.ts");
  });
  // Property (REV-S01-p1 pt N2): on the two no-I/O paths the CLI's OWN stdout is exactly one line, the
  // HS-S01-ACCEPT line, and it exits 1 — anything after it on a pnpm transcript is pnpm's. HS_ACCEPT_* are
  // removed from the child env so the credentials path cannot reach the network. Mutant: a console.log after the loop.
  it("the CLI's own stdout ends with the HS-S01-ACCEPT line on the no-I/O paths", () => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("HS_ACCEPT_")));
    for (const [argv, line] of [[["--bogus"], "HS-S01-ACCEPT: FAIL HS_S01_ARGUMENTS_INVALID"], [[], "HS-S01-ACCEPT: FAIL CREDENTIALS_MISSING"]] as const) {
      const child = spawnSync("node_modules/.bin/tsx", ["acceptance/hs-s01-accept-cli.ts", ...argv], { env, encoding: "utf8", timeout: 30_000 });
      expect({ status: child.status, stdout: child.stdout }).toEqual({ status: 1, stdout: `${line}\n` });
    }
  }, 60_000);
  // Property: invalid arguments fail before any I/O, including custody access.
  it('runHsS01(["--bogus"]) prints HS-S01-ACCEPT: FAIL HS_S01_ARGUMENTS_INVALID and exits 1, calling no port', async () => {
    let touched = false;
    const noPorts = new Proxy({} as HsS01Ports, { get: () => { touched = true; throw new Error("PORT_TOUCHED"); } });
    expect({ result: await runHsS01(["--bogus"], noPorts), touched }).toEqual({ result: { lines: ["HS-S01-ACCEPT: FAIL HS_S01_ARGUMENTS_INVALID"], exitCode: 1 }, touched: false });
  });
});

// Class "CLI-blind" (TEST rehearsal t_c6155011): each HTTP port is driven through a fake that answers in its
// real route's wire shape, so a port reading a shape the route never sends cannot pass here and fail live.
describe("hs:accept-s01 live HTTP ports against each route's real wire shape", () => {
  // Property: the five HTTP ports read login (202 then 200 + cookies), asks (202), run, answer and the SSE
  // events stream as the routes answer them, and the ask carries the session cookie and CSRF header.
  // Mutant: readEvents parses the stream with response.json() (the rehearsal's FAIL HS_S01_RESPONSE_INVALID).
  it("Q-N PASS when every route answers in its real shape, in route order", async () => {
    const fake = server();
    expect(await runHsS01([], live(fake)))
      .toEqual({ lines: ["HS-S01 Q-N terminal=SERVED codes=none", "HS-S01-ACCEPT: PASS"], exitCode: 0 });
    expect(fake.trace.map(entry => entry.route)).toEqual(["POST /api/v1/auth/login", "POST /api/v1/auth/login",
      "POST /api/v1/asks", `GET /api/v1/runs/${RUN}`, `GET /api/v1/runs/${RUN}/answer`, `GET /api/v1/runs/${RUN}/events`]);
    expect(fake.trace[2]!.headers).toMatchObject({ "x-csrf-token": "csrf_1", origin: ORIGIN,
      cookie: "__Host-debateai-session=session_1; __Host-debateai-csrf=csrf_1" });
  });
  // Property: every SSE data block's JSON reaches the seal-code scan, across blocks. Mutant: keep only the
  // first block, or drop the data field.
  it("a seal code inside any SSE event's data fails Q-N with that code", async () => {
    const fake = server({ [`GET /api/v1/runs/${RUN}/events`]: () => stream(frame([
      event(1), event(2, { reason: "REGISTER_ROW_MISSING" }), event(3, { detail: { codes: ["PROMPT_FRAME_ABSENT"] } })])) });
    expect(await runHsS01([], live(fake))).toEqual({ lines: [
      "HS-S01 Q-N terminal=SERVED codes=PROMPT_FRAME_ABSENT,REGISTER_ROW_MISSING", "HS-S01-ACCEPT: FAIL PROMPT_FRAME_ABSENT"], exitCode: 1 });
  });
  // Property: the SSE reader follows the event-stream framing, not one byte layout: CRLF line ends, a comment
  // line and an empty stream parse. Mutant: split blocks on "\n\n" only.
  it("SSE framing: CRLF line ends and a comment line parse; an empty stream is no events", async () => {
    const crlf = `: keep-alive\r\n\r\n${frame([event(1, { reason: "SEALED_CRLF" })]).replaceAll("\n", "\r\n")}`;
    for (const [body, codes] of [[crlf, "SEALED_CRLF"], ["", "none"]] as const) {
      const fake = server({ [`GET /api/v1/runs/${RUN}/events`]: () => stream(body) });
      expect((await runHsS01([], live(fake))).lines[0]).toBe(`HS-S01 Q-N terminal=SERVED codes=${codes}`);
    }
  });
  // Property: a body outside its route's shape (content type, framing, JSON, schema, status) fails with a fixed
  // code, never a guessed PASS or a silent null. Mutants: drop the content-type check, accept an unterminated
  // block, skip the id/data cross-check, read a non-200/404 answer as null, parse asks without its schema.
  it("each HTTP port refuses a body outside its route's shape with a fixed code", async () => {
    const events = `GET /api/v1/runs/${RUN}/events`;
    const whole = frame([event(1)]);
    const cases: [string, Record<string, Route>, string][] = [
      ["events as a JSON array (the old port-level fake)", { [events]: () => reply(200, [event(1)]) }, "HS_S01_RESPONSE_INVALID"],
      ["events data that is not JSON", { [events]: () => stream("id: event_1\nevent: x\ndata: {oops\n\n") }, "HS_S01_RESPONSE_INVALID"],
      ["events data that is a JSON string", { [events]: () => stream('data: "PROMPT_X"\n\n') }, "HS_S01_RESPONSE_INVALID"],
      ["events SSE body under application/json", { [events]: () => new Response(whole, { headers: { "content-type": JSON_TYPE } }) }, "HS_S01_RESPONSE_INVALID"],
      ["events cut mid-block (no blank-line terminator)", { [events]: () => stream(whole.slice(0, -1)) }, "HS_S01_RESPONSE_INVALID"],
      ["events cut inside a block's first line", { [events]: () => stream(`${whole}id: event_2`) }, "HS_S01_RESPONSE_INVALID"],
      ["events id: not the data's event_id", { [events]: () => stream(whole.replace("id: event_1", "id: event_9")) }, "HS_S01_RESPONSE_INVALID"],
      ["events event: not the data's event_type", { [events]: () => stream(whole.replace(`event: ${EVENT_TYPES[0]}`, "event: other")) }, "HS_S01_RESPONSE_INVALID"],
      ["events field the route never writes", { [events]: () => stream(`retry: 10\n${whole}`) }, "HS_S01_RESPONSE_INVALID"],
      ["events RUN_NOT_FOUND", { [events]: () => reply(404, { error: "RUN_NOT_FOUND" }) }, "HS_S01_HTTP_404"],
      ["run as text/html", { [`GET /api/v1/runs/${RUN}`]: () => new Response(JSON.stringify(run("SETTLED")), { headers: { "content-type": "text/html" } }) }, "HS_S01_RESPONSE_INVALID"],
      ["run without a state", { [`GET /api/v1/runs/${RUN}`]: () => reply(200, { run_ref: RUN }) }, "HS_S01_RESPONSE_INVALID"],
      ["answer 500", { [`GET /api/v1/runs/${RUN}/answer`]: () => reply(500, { error: "INTERNAL" }) }, "HS_S01_HTTP_500"],
      ["asks outside AskAccepted", { "POST /api/v1/asks": () => reply(202, { run_ref: RUN, status: "QUEUED", extra: 1 }) }, "HS_S01_RESPONSE_INVALID"],
      ["login challenge as text/plain", { "POST /api/v1/auth/login": () => new Response("{}", { status: 202, headers: { "content-type": "text/plain" } }) }, "HS_S01_RESPONSE_INVALID"],
      ["login 200 without cookies", { "POST /api/v1/auth/login": body => body?.challenge_token === undefined
        ? reply(202, { status: "MFA_REQUIRED", challenge_token: "challenge_1" }) : reply(200, { status: "AUTHENTICATED" }) }, "HS_S01_LOGIN_COOKIES_MISSING"]
    ];
    for (const [name, overrides, code] of cases) {
      expect({ name, last: (await runHsS01([], live(server(overrides)))).lines.at(-1) }).toEqual({ name, last: `HS-S01-ACCEPT: FAIL ${code}` });
    }
  });
  // Property: a FAILED run's answer route answers 404 ANSWER_NOT_SERVED, which reads as no answer, so the
  // terminal prints FAILED; a RUNNING projection is polled again after one sleep. Mutant: treat 404 as an error.
  it("answer 404 on a FAILED run reads as no answer; a RUNNING run is polled until terminal", async () => {
    const states = ["RUNNING", "FAILED"] as const;
    const sleeps: number[] = [];
    const fake = server({ [`GET /api/v1/runs/${RUN}`]: () => reply(200, run(states[Math.min(sleeps.length, 1)]!)),
      [`GET /api/v1/runs/${RUN}/answer`]: () => reply(404, { error: "ANSWER_NOT_SERVED" }) });
    expect(await runHsS01([], live(fake, sleeps)))
      .toEqual({ lines: ["HS-S01 Q-N terminal=FAILED codes=none", "HS-S01-ACCEPT: FAIL TERMINAL_FAILED"], exitCode: 1 });
    expect({ polls: fake.trace.filter(entry => entry.route === `GET /api/v1/runs/${RUN}`).length, sleeps: sleeps.length }).toEqual({ polls: 2, sleeps: 1 });
  });
});
