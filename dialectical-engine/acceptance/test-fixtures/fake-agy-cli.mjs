import { createHash } from "node:crypto";

// Test-layer fake of agy 1.2.11 print mode (model scorecard §2.10). The fake
// itself enforces nothing: a relay reaches it only when a TEST hands it over —
// as `testOnlyCommand`, which `resolveTestGuardedCommand` refuses outside
// NODE_ENV=test (TEST_ONLY_AGY_COMMAND_FORBIDDEN, DR-115), or through a launcher
// a test wrote and named in ACCEPTANCE_AGY_BINARY. Every shape is
// the redacted real capture of 2026-09-26 (M4): ONE JSON object — conversation_id,
// status, response, duration_seconds, num_turns, usage and, only when a tool
// was attempted, denied_actions. The prompt arrives on STDIN, never on argv,
// and is read as a stream to EOF: the fake answers only once stdin is CLOSED.
// With `--input-format stream-json`, stdin is one NDJSON user message and
// stdout is one NDJSON line carrying the same object.
const argumentList = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = argumentList.indexOf(flag);
  return index >= 0 ? argumentList[index + 1] ?? "" : "";
};
const streamJson = valueAfter("--input-format") === "stream-json";

function promptOf(text) {
  if (!streamJson) return text;
  const line = text.split("\n").find((candidate) => candidate.trim() !== "") ?? "{}";
  const parts = JSON.parse(line)?.message?.content;
  return Array.isArray(parts) && typeof parts[0]?.text === "string" ? parts[0].text : "";
}

// W6 (SECURITY): the echo below is a PROJECTION over this allow-list, never
// `process.env`. Every key is here because an acceptance assertion reads it:
//   asserted PRESENT — agy-relay.test.ts exact-set toEqual (HOME, LANG, LOGNAME,
//   OLDPWD, PATH, PWD, TMPDIR, USER);
//   asserted ABSENT  — agy-relay.test.ts (DATABASE_URL, GEMINI_API_KEY,
//   GOOGLE_API_KEY, OPENAI_API_KEY, UNRELATED_SECRET). An absence assertion is
//   evidence only if the key WOULD be echoed when the relay admits it.
const ECHOED_ENVIRONMENT_KEYS = [
  "HOME",
  "LANG",
  "LOGNAME",
  "OLDPWD",
  "PATH",
  "PWD",
  "TMPDIR",
  "USER",
  "DATABASE_URL",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
  "UNRELATED_SECRET"
];

// W6 fix round 1 / F4 — the CREDENTIAL-SHAPE rule, stated identically in every
// member of the class: a credential-shaped key's VALUE is never emitted, only a
// truncated one-way digest. Full reasoning in `fake-claude-cli.mjs:44-58`.
const CREDENTIAL_SHAPED_NAME =
  /(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|OAUTH|AUTH|CREDENTIAL|CREDENTIALS|URL|URI|DSN)(?:_|$)/u;

function echoedValue(key, value) {
  return CREDENTIAL_SHAPED_NAME.test(key)
    ? `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`
    : value;
}

function echoedEnvironment() {
  const echoed = {};
  for (const key of ECHOED_ENVIRONMENT_KEYS) {
    const value = process.env[key];
    if (value !== undefined) echoed[key] = echoedValue(key, value);
  }
  return echoed;
}

const MEASURED_USAGE = {
  input_tokens: 13977, output_tokens: 437, thinking_tokens: 436, cache_read_tokens: 0, total_tokens: 14414
};
const MEASURED_TOOLS_USAGE = {
  input_tokens: 13999, output_tokens: 781, thinking_tokens: 662, cache_read_tokens: 0, total_tokens: 14780
};

function result(overrides = {}) {
  return {
    conversation_id: "00000000-0000-0000-0000-000000000000",
    status: "SUCCESS",
    response: "",
    duration_seconds: 0.5,
    num_turns: 1,
    usage: MEASURED_USAGE,
    ...overrides
  };
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function respond(stdinText) {
  const prompt = promptOf(stdinText);
  if (process.env.FAKE_AGY_ALWAYS_FAIL === "1") {
    process.stderr.write("intentional fake agy CLI handshake failure\n");
    process.exitCode = 7;
  } else if (process.env.FAKE_AGY_IGNORE_STDIN === "1") {
    // Fix round 1: the failure Step 0 has not ruled out — an agy that never
    // reads stdin, runs on an EMPTY prompt and still says SUCCESS with a
    // generic, non-empty reply that answers nothing it was asked.
    emit(result({ response: "Hello! How can I help you today?\n" }));
  } else if (prompt.includes("FAIL_CLI")) {
    process.stderr.write("intentional fake agy CLI failure\n");
    process.exitCode = 17;
  } else if (prompt.includes("TIMEOUT_CLI")) {
    setTimeout(() => emit(result({ response: "late output" })), 2_000);
  } else if (prompt.includes("IGNORE_SIGTERM_CLI")) {
    process.on("SIGTERM", () => undefined);
    setTimeout(() => emit(result({ response: "unreachable late output" })), 2_000);
  } else if (prompt.includes("TOOLS_CLI")) {
    // The measured denial: stderr names the auto-denied permission; stdout says
    // status SUCCESS with an EMPTY response and a non-empty denied_actions.
    process.stderr.write("jetski: no output produced — a tool required the \"command\" permission that headless mode cannot prompt for, so it was auto-denied.\n");
    emit(result({ usage: MEASURED_TOOLS_USAGE, denied_actions: [{ action: "command", display_name: "RunCommand" }] }));
  } else if (prompt.includes("TOOLS_WITH_TEXT_CLI")) {
    // Fix round 1: a denied tool beside a NON-empty response — text written
    // around a blocked action is still not an answer.
    emit(result({
      response: "I have created the file as requested.\n",
      usage: MEASURED_TOOLS_USAGE,
      denied_actions: [{ action: "command", display_name: "RunCommand" }]
    }));
  } else if (prompt.includes("STATUS_ERROR_CLI")) {
    emit(result({ status: "ERROR", response: "partial" }));
  } else if (prompt.includes("NON_JSON_CLI")) {
    process.stdout.write("not json\n");
  } else if (prompt.includes("acceptance transport handshake")) {
    emit(result({ response: "OK\n" }));
  } else {
    emit(result({
      response: JSON.stringify({
        prompt,
        stdinText,
        argumentList,
        environment: echoedEnvironment(),
        // W6 fix round 1 / F3: key NAMES restore the reach the allow-list removed —
        // a name is not a credential, a value is. Read by agy-relay.test.ts.
        environmentKeyNames: Object.keys(process.env).sort()
      })
    }));
  }
}

let stdinText = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdinText += chunk; });
process.stdin.on("end", () => respond(stdinText));
