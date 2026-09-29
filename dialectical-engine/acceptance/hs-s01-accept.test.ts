import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  collectSealCodes, firstSentence, judgeLegs, parseHsS01Arguments, runHsS01,
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
      .toEqual({ lines: ["HS-S01 CENSUS-COMPARE version=4 before=12 after=12 SAME", "HS-S01 CENSUS-COMPARE version=5 before=12 after=12 SAME", "HS-S01 CENSUS-COMPARE new=6 receipt=6", "HS-S01-CENSUS: PASS"], exitCode: 0 });
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
  // Property: either actual_rows OR declared row_count changing fails.
  it("census-compare FAIL CENSUS_ROW_COUNT_CHANGED_5", async () => {
    for (const changed of [census("5", 13, 12), census("5", 12, 13)]) {
      expect(await runHsS01(["--census-compare", "/tmp/before"], ports({ readCensus: async () => [census("4"), changed, census("6")] })))
        .toEqual({ lines: ["HS-S01 CENSUS-COMPARE version=4 before=12 after=12 SAME", `HS-S01 CENSUS-COMPARE version=5 before=12 after=${changed.actualRows} CHANGED`, "HS-S01 CENSUS-COMPARE new=6 receipt=6", "HS-S01-CENSUS: FAIL CENSUS_ROW_COUNT_CHANGED_5"], exitCode: 1 });
    }
  });
  // Property: missing history outranks changed rows and missing new publication.
  it("census-compare FAIL CENSUS_VERSION_MISSING_4", async () => {
    expect(await runHsS01(["--census-compare", "/tmp/before"], ports({ readCensus: async () => [census("5", 13)] })))
      .toEqual({ lines: ["HS-S01 CENSUS-COMPARE version=4 before=12 after=MISSING CHANGED", "HS-S01 CENSUS-COMPARE version=5 before=12 after=13 CHANGED", "HS-S01 CENSUS-COMPARE new=none receipt=6", "HS-S01-CENSUS: FAIL CENSUS_VERSION_MISSING_4"], exitCode: 1 });
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
  // Property: missing credentials map to a fixed public code; other errors prefer code and are bounded.
  it("credentials missing → FAIL CREDENTIALS_MISSING and no credential in any line", async () => {
    expect(await runHsS01([], ports({ login: async () => { throw new TypeError("HS_S01_CREDENTIALS_MISSING"); } })))
      .toEqual({ lines: ["HS-S01-ACCEPT: FAIL CREDENTIALS_MISSING"], exitCode: 1 });
    expect(await runHsS01([], ports({ login: async () => { throw Object.assign(new Error("secret-password"), { code: "AUTH_FAILED" }); } })))
      .toEqual({ lines: ["HS-S01-ACCEPT: FAIL AUTH_FAILED"], exitCode: 1 });
    expect(await runHsS01([], ports({ login: async () => { throw new Error("X".repeat(121)); } })))
      .toEqual({ lines: [`HS-S01-ACCEPT: FAIL ${"X".repeat(120)}`], exitCode: 1 });
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
  // Property: invalid arguments fail before any I/O, including custody access.
  it('runHsS01(["--bogus"]) prints HS-S01-ACCEPT: FAIL HS_S01_ARGUMENTS_INVALID and exits 1, calling no port', async () => {
    let touched = false;
    const noPorts = new Proxy({} as HsS01Ports, { get: () => { touched = true; throw new Error("PORT_TOUCHED"); } });
    expect({ result: await runHsS01(["--bogus"], noPorts), touched }).toEqual({ result: { lines: ["HS-S01-ACCEPT: FAIL HS_S01_ARGUMENTS_INVALID"], exitCode: 1 }, touched: false });
  });
});
