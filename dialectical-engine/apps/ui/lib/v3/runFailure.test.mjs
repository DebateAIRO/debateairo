import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { RUN_FAILURE_CODES, RUN_FAILURE_KINDS, runFailureKind, runFailureMessage } from "./runFailure.ts";

// A failed debate is told to its asker in one of five sentences, never by the
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

/** The owner's picks, 2026-09-28 (1b 2b 3b 4b 5b). */
const ENGLISH = Object.freeze({
  NOT_STARTED: "Something went wrong on our side before this debate began. Please ask again.",
  MODELS_UNAVAILABLE:
    "This debate could not start because the AI models it needs were unavailable. Please try again in a while.",
  RUN_LIMIT_REACHED: "This debate reached its limit before it could produce an answer.",
  DAILY_LIMIT_REACHED: "Today's limit for debates ran out while this one was starting. Please ask again tomorrow.",
  STOPPED: "This debate stopped partway because of a problem on our side. Please ask your question again."
});

test("every code family lands in its group, whether or not the runner wrapped it", () => {
  const cases = [
    // The API records these after creating the run (PostgresAskApplication.submit);
    // MODEL_ASSIGNMENT is the model-scorecard line's extra step, not yet on dev.
    ["RUN_SETUP_FAILED:ADMISSION_RELEASE", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:MEMORY_QUESTION", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:WORK_QUEUE", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:DISPATCH", "NOT_STARTED"],
    ["RUN_SETUP_FAILED:MODEL_ASSIGNMENT", "NOT_STARTED"],
    // The runner's claim-time refusals, first as written, then as the Hatchet
    // catch overwrites them (the role suffix is lost there).
    ["RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", "MODELS_UNAVAILABLE"],
    ["RUNNER_EXECUTION_FAILED:RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", "MODELS_UNAVAILABLE"],
    ["SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:SYNTHESIZER", "MODELS_UNAVAILABLE"],
    ["SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:EVALUATOR", "MODELS_UNAVAILABLE"],
    ["RUNNER_EXECUTION_FAILED:SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM", "MODELS_UNAVAILABLE"],
    ["RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL", "RUN_LIMIT_REACHED"],
    ["RUNNER_EXECUTION_FAILED:DAILY_COST_ENVELOPE_REACHED", "DAILY_LIMIT_REACHED"],
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
    DAILY_LIMIT_REACHED: "RUNNER_EXECUTION_FAILED:DAILY_COST_ENVELOPE_REACHED",
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
    assert.equal(seen.size, RUN_FAILURE_KINDS.length, `${locale}: five different sentences`);
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
    RUN_CEILING_BELOW_FIRST_CALL: (code) => thrown(code) && inAlphabet(code),
    // Not reachable today: the day's limit is asked only when a NEW run is
    // admitted (the asker then sees requestFailure's DAILY_LIMIT_REACHED), never
    // mid-run. The runner keeps it as a stop of its own kind all the same, and so
    // does this table, so the day it is raised under way the asker reads its sentence.
    DAILY_COST_ENVELOPE_REACHED: (code) => runner.includes(`${code}: "DAILY"`) && inAlphabet(code)
  };
  assert.deepEqual(Object.keys(RUN_FAILURE_CODES).sort(), Object.keys(writers).sort(), "a writer check per mapped code");
  for (const [code, kind] of Object.entries(RUN_FAILURE_CODES)) {
    assert.ok(RUN_FAILURE_KINDS.includes(kind), `${code} → ${kind}`);
    assert.ok(writers[code](code), `${code} is still written where this table expects`);
  }
});
