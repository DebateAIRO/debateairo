import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { RUN_FAILURE_CODES, RUN_FAILURE_KINDS, runFailureKind, runFailureMessage } from "./runFailure.ts";

// A failed debate is told to its asker in one of four sentences, never by the
// engine's own terminal reason code (owner ruling 2026-09-28: codes stay for
// operators — the database, GET /v1/runs/:id, the logs, deploy/vps/README.md).

const appRoot = process.cwd();
const messagesRoot = join(appRoot, "messages");
const catalogue = (locale, namespace) => JSON.parse(
  readFileSync(join(messagesRoot, locale, `${namespace}.json`), "utf8")
);
const LOCALES = readdirSync(messagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
/** The two catalogues whose pages show a failed debate: the home list, and the debate page's banner. */
const NAMESPACES = ["home", "debateChrome"];

/** The owner's picks, 2026-09-28 (1b 2b 3b 5b); 4b was retired by the budget rule (spec 2026-09-28 §2.11). */
const ENGLISH = Object.freeze({
  NOT_STARTED: "Something went wrong on our side before this debate began. Please ask again.",
  MODELS_UNAVAILABLE:
    "This debate could not start because the AI models it needs were unavailable. Please try again in a while.",
  RUN_LIMIT_REACHED: "This debate reached its limit before it could produce an answer.",
  STOPPED: "This debate stopped partway because of a problem on our side. Please ask your question again."
});

test("every code family lands in its group, whether or not the runner wrapped it", () => {
  const cases = [
    // The API records these after creating the run (PostgresAskApplication.submit);
    // MODEL_ASSIGNMENT is the model scorecard's extra step (pinning the picker's
    // role assignment), on dev since Part 3 (P3-M18).
    ["RUN_SETUP_FAILED:ADMISSION_RELEASE", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:MEMORY_QUESTION", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:WORK_QUEUE", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:DISPATCH", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:MODEL_ASSIGNMENT", "NOT_STARTED"],
    // Part 1b's setup steps (B6b, B7b, B8): a question that could not take its
    // place in line, hold its estimate, start under its current plan, or record
    // its roster swap never began.
    ["RUN_SETUP_FAILED:WAITING_LINE", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:ROOM_HOLD", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:PLAN_CHANGED", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:COST_RECORD", "NOT_STARTED"],
    // The runner's claim-time refusals, first as written, then as the Hatchet
    // catch overwrites them (the role suffix is lost there).
    ["RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", "MODELS_UNAVAILABLE"],
    ["RUNNER_EXECUTION_FAILED:RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", "MODELS_UNAVAILABLE"],
    ["SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:SYNTHESIZER", "MODELS_UNAVAILABLE"],
    ["SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:EVALUATOR", "MODELS_UNAVAILABLE"],
    ["RUNNER_EXECUTION_FAILED:SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM", "MODELS_UNAVAILABLE"],
    // Part 3's final review, P3-M18: the model scorecard's claim-time refusal.
    // The runner's claim check found the role assignment pinned at the ask
    // corrupt or unable to seat a debate before any model was asked, so the
    // debate never began.
    ["RUN_ROLE_ASSIGNMENT_INVALID", "NOT_STARTED"],
    ["RUNNER_EXECUTION_FAILED:RUN_ROLE_ASSIGNMENT_INVALID", "NOT_STARTED"],
    ["RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL", "RUN_LIMIT_REACHED"],
    // Budget spec 2026-09-28 §2.11: group 4 is retired. The shared wall stops
    // only the arguing, so these never end a debate; a stray one is STOPPED.
    ["RUNNER_EXECUTION_FAILED:DAILY_COST_ENVELOPE_REACHED", "STOPPED"],
    ["DAILY_COST_ENVELOPE_REACHED", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:PERSON_ALLOWANCE_REACHED", "STOPPED"],
    // P3-M18: Part 3's other codes in the runner's alphabet, each a failure
    // of a debate already under way (a seat marker the ledger refused, a
    // question too long for a model's context window, a thinking level the
    // vendor refused or changed, a usage cap that outlasted the seat's
    // backup), so the debate stopped partway. The rest Part 3 added never
    // end a run (ASK_MODEL_* refuse the ask, ANSWER_MODEL_ASSIGNMENT_INVALID
    // is a serve-time log line, STRUCTURAL_CEILING_* refuses at admission)
    // and would read STOPPED all the same.
    ["RUNNER_EXECUTION_FAILED:CALL_SITE_SEAT_ALREADY_MARKED", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:CALL_SITE_SEAT_MARKER_REQUIRED", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:PROVIDER_CONTEXT_WINDOW_EXCEEDED", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:PROVIDER_THINKING_LEVEL_CHANGED", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:PROVIDER_THINKING_LEVEL_UNSUPPORTED", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:PROVIDER_USAGE_CAP", "STOPPED"],
    // Owner ruling 2026-09-28: a re-claim that finds a step's tries used up is
    // "stopped partway", not a spending limit.
    ["CALL_BUDGET_EXHAUSTED", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:NO_USABLE_JUDGEMENTS", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:DEPENDENCY_SQL_08_CONNECTION", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:UNRECOGNIZED_DOMAIN_ERROR", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:UNEXPECTED_ERROR", "STOPPED"],
    // Older rows, and anything nobody has mapped yet.
    ["NODE_REVIEW_UNAVAILABLE", "STOPPED"],
    ["TOTAL_REVIEW_COVERAGE_UNSATISFIED", "STOPPED"],
    ["ACCEPTANCE_EXECUTION_FAILED:UNEXPECTED_ERROR", "STOPPED"],
    ["A_CODE_INVENTED_TOMORROW", "STOPPED"],
    ["", "STOPPED"],
    [null, "STOPPED"],
    [undefined, "STOPPED"],
    // Near misses are not their neighbours.
    ["RUN_SETUP_FAILED_ELSEWHERE", "STOPPED"],
    ["RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL_TOO", "STOPPED"],
    ["XRUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", "STOPPED"]
  ];
  for (const [reason, kind] of cases) {
    assert.equal(runFailureKind(reason), kind, `${String(reason)} → ${kind}`);
  }
  const reached = new Set(cases.map(([, kind]) => kind));
  assert.deepEqual([...reached].sort(), [...RUN_FAILURE_KINDS].sort(), "every group is reachable");
});

test("says the owner's chosen English sentence in both catalogues, and on the English backstop", () => {
  const samples = {
    NOT_STARTED: "RUN_SETUP_FAILED:DISPATCH",
    MODELS_UNAVAILABLE: "RUNNER_EXECUTION_FAILED:RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM",
    RUN_LIMIT_REACHED: "RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL",
    STOPPED: "CALL_BUDGET_EXHAUSTED"
  };
  for (const kind of RUN_FAILURE_KINDS) {
    for (const namespace of NAMESPACES) {
      assert.equal(runFailureMessage(samples[kind], catalogue("en", namespace)), ENGLISH[kind], `en/${namespace} ${kind}`);
    }
    // A missing or partial catalogue answers from t()'s English, never with the key or the code.
    assert.equal(runFailureMessage(samples[kind], undefined), ENGLISH[kind], `backstop ${kind}`);
    assert.equal(runFailureMessage(samples[kind], {}), ENGLISH[kind], `empty catalogue ${kind}`);
  }
});

test("never lets the stored reason reach the sentence", () => {
  const hostile = [
    "RUNNER_EXECUTION_FAILED:Visit http://evil.test <b>now</b>",
    "RUN_SETUP_FAILED:{reason} 0xDEAD /var/lib/pg",
    "SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:grok-4.6-build",
    "{reason}"
  ];
  const sentences = new Set(Object.values(ENGLISH));
  for (const reason of hostile) {
    for (const namespace of NAMESPACES) {
      const message = runFailureMessage(reason, catalogue("en", namespace));
      assert.ok(sentences.has(message), `${reason} → a fixed sentence, got ${message}`);
      for (const fragment of ["evil.test", "<b>", "0xDEAD", "/var/lib", "grok", "{reason}", "RUN_", "FAILED"]) {
        assert.ok(!message.includes(fragment), `${reason} leaked ${fragment}`);
      }
    }
  }
});

test("words every group in all 35 locales, the same in both catalogues, with no internals", () => {
  assert.equal(LOCALES.length, 35);
  const english = catalogue("en", "home");
  for (const locale of LOCALES) {
    const home = catalogue(locale, "home");
    const chrome = catalogue(locale, "debateChrome");
    const seen = new Set();
    for (const kind of RUN_FAILURE_KINDS) {
      const key = `runFailure.${kind}`;
      const value = home[key];
      assert.equal(typeof value, "string", `${locale}/home ${key}`);
      assert.equal(chrome[key], value, `${locale}/debateChrome ${key} matches home`);
      assert.notEqual(value.trim(), "", `${locale} ${key} empty`);
      if (locale !== "en") assert.notEqual(value, english[key], `${locale} ${key} is still English`);
      assert.doesNotMatch(value, /[{}]/u, `${locale} ${key} placeholder`);
      assert.doesNotMatch(value, /\p{Nd}/u, `${locale} ${key} figure`);
      assert.doesNotMatch(value, /[A-Z]{2,}_[A-Z_]+|RUN_|FAILED/u, `${locale} ${key} code`);
      assert.doesNotMatch(
        value,
        /coordinat|runner|envelope|budget|ceiling|provider|synthes|evaluator|judge|terminal|claim|panel|worker|queue/iu,
        `${locale} ${key} engine word`
      );
      seen.add(value);
    }
    // Budget spec 2026-09-28 §2.11: the retired group-4 sentence is gone from both catalogues.
    assert.equal(Object.hasOwn(home, "runFailure.DAILY_LIMIT_REACHED"), false, `${locale}/home still has group 4`);
    assert.equal(Object.hasOwn(chrome, "runFailure.DAILY_LIMIT_REACHED"), false, `${locale}/debateChrome still has group 4`);
    assert.equal(seen.size, RUN_FAILURE_KINDS.length, `${locale}: one different sentence per group`);
  }
});

test("retires the sentences that printed the code", () => {
  for (const locale of LOCALES) {
    const home = catalogue(locale, "home");
    const chrome = catalogue(locale, "debateChrome");
    assert.equal(Object.hasOwn(home, "home.generationFailed"), false, `${locale}/home`);
    assert.equal(Object.hasOwn(chrome, "debateChrome.error.debateGenerationFailed"), false, `${locale}/debateChrome`);
    // The home list had one sentence that printed a reason; it has none now.
    for (const [key, value] of Object.entries(home)) {
      assert.ok(!value.includes("{reason}"), `${locale}/home:${key} interpolates a reason`);
    }
  }
});

test("maps only codes their writers still produce", () => {
  // A code renamed where it is written would silently fall to STOPPED; this
  // names it instead. Each check reads the write site itself, not merely some
  // mention of the code: every runner code also sits in lookup tables.
  const runner = readFileSync(join(appRoot, "..", "runner", "src", "index.ts"), "utf8");
  const api = readFileSync(join(appRoot, "..", "api", "src", "index.ts"), "utf8");
  assert.ok(runner.includes("return `RUNNER_EXECUTION_FAILED:${operationalDiagnosticOf(error)}`;"), "runner wrapper");
  // The Hatchet catch stores a thrown code as RUNNER_EXECUTION_FAILED:<code>
  // only when it is in the runner's operational alphabet; any other typed code
  // is stored as UNRECOGNIZED_DOMAIN_ERROR.
  const alphabetStart = runner.indexOf("const KNOWN_DOMAIN_CODES");
  assert.notEqual(alphabetStart, -1, "runner alphabet");
  const alphabet = runner.slice(alphabetStart, runner.indexOf("\n]);", alphabetStart));
  const inAlphabet = (code) => alphabet.includes(`"${code}"`);
  const thrown = (code) => new RegExp(`new TypedDomainError\\(\\s*"${code}"`, "u").test(runner);
  const writers = {
    RUN_SETUP_FAILED: () => api.includes("const reason = `RUN_SETUP_FAILED:${step}`;"),
    RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM: (code) =>
      runner.includes(`reason: "${code}"`) && thrown(code) && inAlphabet(code),
    SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM: (code) =>
      runner.includes(`reason: \`${code}:\${role}\``) && thrown(code) && inAlphabet(code),
    // P3-M18: the scorecard's claim-time refusal, written as the run's terminal
    // reason and then thrown (the catch keeps it, since it is in the alphabet).
    RUN_ROLE_ASSIGNMENT_INVALID: (code) =>
      runner.includes(`reason: "${code}"`) && thrown(code) && inAlphabet(code),
    RUN_CEILING_BELOW_FIRST_CALL: (code) => thrown(code) && inAlphabet(code)
  };
  assert.deepEqual(Object.keys(RUN_FAILURE_CODES).sort(), Object.keys(writers).sort(), "a writer check per mapped code");
  for (const [code, kind] of Object.entries(RUN_FAILURE_CODES)) {
    assert.ok(RUN_FAILURE_KINDS.includes(kind), `${code} → ${kind}`);
    assert.ok(writers[code](code), `${code} is still written where this table expects`);
  }
});

test("a debate the site's day stopped is told the group-5 sentence (budget spec 2026-09-28 §2.11)", () => {
  assert.equal(RUN_FAILURE_KINDS.includes("DAILY_LIMIT_REACHED"), false, "group 4 is retired");
  assert.equal(Object.hasOwn(RUN_FAILURE_CODES, "DAILY_COST_ENVELOPE_REACHED"), false, "the day's code maps to no group of its own");
  for (const reason of [
    "RUNNER_EXECUTION_FAILED:DAILY_COST_ENVELOPE_REACHED",
    "DAILY_COST_ENVELOPE_REACHED",
    "DAILY_LIMIT_REACHED",
    "RUNNER_EXECUTION_FAILED:PERSON_ALLOWANCE_REACHED",
    "PERSON_ALLOWANCE_REACHED"
  ]) {
    assert.equal(runFailureKind(reason), "STOPPED", `${reason} → STOPPED`);
    for (const namespace of NAMESPACES) {
      assert.equal(runFailureMessage(reason, catalogue("en", namespace)), ENGLISH.STOPPED, `en/${namespace} ${reason}`);
    }
  }
});

test("a debate whose pinned role assignment the runner refused at claim is told the not-started sentence (P3-M18)", () => {
  for (const reason of ["RUN_ROLE_ASSIGNMENT_INVALID", "RUNNER_EXECUTION_FAILED:RUN_ROLE_ASSIGNMENT_INVALID"]) {
    for (const namespace of NAMESPACES) {
      assert.equal(
        runFailureMessage(reason, catalogue("en", namespace)), ENGLISH.NOT_STARTED, `en/${namespace} ${reason}`
      );
    }
  }
});
