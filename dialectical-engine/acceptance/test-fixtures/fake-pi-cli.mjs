#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";

// Test-layer fake of pi 0.87.1 `--mode json` (model scorecard §2.10). The fake
// itself enforces nothing: a relay reaches it only when a TEST hands it over —
// as `testOnlyCommand`, which `resolveTestGuardedCommand` refuses outside
// NODE_ENV=test (TEST_ONLY_PI_COMMAND_FORBIDDEN, DR-115), or through a launcher
// a test wrote and named in ACCEPTANCE_PI_BINARY. The event
// sequence and every member of the assistant message_end are the redacted real
// capture of 2026-09-26 (M4): session, agent_start, turn_start, message_start /
// message_end (system, user, assistant), turn_end, agent_end, agent_settled.
// Host paths and ids from the capture are replaced by fixed test values. The
// prompt is read from the `@file` argument, never from argv text.
const argumentList = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = argumentList.indexOf(flag);
  return index >= 0 ? argumentList[index + 1] ?? "" : "";
};
const fileArgument = argumentList.find((argument) => argument.startsWith("@"));
const promptFile = fileArgument === undefined ? null : fileArgument.slice(1);
const prompt = promptFile === null ? "" : readFileSync(promptFile, "utf8");
const promptFileMode = promptFile === null ? null : (statSync(promptFile).mode & 0o777).toString(8);
const model = process.env.FAKE_PI_WRONG_MODEL === "1" || prompt.includes("WRONG_MODEL_CLI")
  ? "glm-9-fake"
  : valueAfter("--model");

// W6 (SECURITY): the echo below is a PROJECTION over this allow-list, never
// `process.env`. Every key is here because an acceptance assertion reads it:
//   asserted PRESENT — pi-relay.test.ts exact-set toEqual (HOME, LANG, LOGNAME,
//   OLDPWD, PATH, PI_TELEMETRY, PWD, TMPDIR, USER);
//   asserted ABSENT  — pi-relay.test.ts (DATABASE_URL, GLM_API_KEY,
//   OPENAI_API_KEY, UNRELATED_SECRET, ZAI_API_KEY: the relay never passes the
//   Z.AI key, F37); ZAI_API_KEY stays listed for fake-cli-environment.test.ts,
//   which runs this fake directly with the key set.
const ECHOED_ENVIRONMENT_KEYS = [
  "HOME",
  "LANG",
  "LOGNAME",
  "OLDPWD",
  "PATH",
  "PI_TELEMETRY",
  "PWD",
  "TMPDIR",
  "USER",
  "ZAI_API_KEY",
  "DATABASE_URL",
  "GLM_API_KEY",
  "OPENAI_API_KEY",
  "UNRELATED_SECRET"
];

// W6 fix round 1 / F4 — the CREDENTIAL-SHAPE rule, stated identically in every
// member of the class. Full reasoning in `fake-claude-cli.mjs:44-58`.
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
  input: 480,
  output: 3,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
  totalTokens: 483,
  cost: { input: 0.000672, output: 0.0000132, cacheRead: 0, cacheWrite: 0, total: 0.0006852 }
};

function assistant(text, overrides = {}) {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "zai",
    model,
    usage: MEASURED_USAGE,
    stopReason: "stop",
    timestamp: 0,
    responseId: "redacted-response",
    rawStopReason: "stop",
    ...overrides
  };
}

function emitRun(message) {
  const system = { role: "system", content: "", sections: { preamble: "redacted" } };
  const user = { role: "user", content: [{ type: "text", text: "redacted" }], timestamp: 0 };
  const events = [
    { type: "session", version: 3, id: "00000000-0000-0000-0000-000000000000", timestamp: "2026-09-26T00:00:00.000Z", cwd: process.cwd() },
    { type: "agent_start" },
    { type: "turn_start" },
    { type: "message_start", message: system },
    { type: "message_end", message: system },
    { type: "message_start", message: user },
    { type: "message_end", message: user },
    { type: "message_start", message: { ...message, stopReason: "pending" } },
    { type: "message_end", message },
    { type: "turn_end", message, toolResults: [] },
    { type: "agent_end", messages: [system, user, message] },
    { type: "agent_settled" }
  ];
  for (const event of events) process.stdout.write(`${JSON.stringify(event)}\n`);
}

if (process.env.FAKE_PI_ALWAYS_FAIL === "1") {
  process.stderr.write("intentional fake pi CLI handshake failure\n");
  process.exitCode = 7;
} else if (process.env.FAKE_PI_IGNORE_PROMPT_FILE === "1") {
  // The silent failure the handshake reply check exists for: a pi that never
  // reads the `@file`, answers some other request and still ends "stop" with a
  // generic, non-empty reply from the pinned model.
  emitRun(assistant("Hello! How can I help you today?"));
} else if (prompt.includes("FAIL_CLI")) {
  process.stderr.write("intentional fake pi CLI failure\n");
  process.exitCode = 17;
} else if (prompt.includes("TIMEOUT_CLI")) {
  setTimeout(() => emitRun(assistant("late output")), 2_000);
} else if (prompt.includes("IGNORE_SIGTERM_CLI")) {
  process.on("SIGTERM", () => undefined);
  setTimeout(() => emitRun(assistant("unreachable late output")), 2_000);
} else if (prompt.includes("NON_JSON_CLI")) {
  process.stdout.write("not json\n");
} else if (prompt.includes("STOP_ERROR_CLI")) {
  emitRun(assistant("", { content: [], stopReason: "error", errorMessage: "redacted" }));
} else if (prompt.includes("LENGTH_STOP_CLI")) {
  emitRun(assistant("a partial answer", { stopReason: "length", rawStopReason: "length" }));
} else if (prompt.includes("acceptance transport handshake")) {
  emitRun(assistant("OK"));
} else {
  emitRun(assistant(JSON.stringify({
    prompt,
    promptFile,
    promptFileMode,
    cwdEntries: readdirSync(process.cwd()),
    argumentList,
    environment: echoedEnvironment(),
    // W6 fix round 1 / F3: key NAMES restore the reach the allow-list removed.
    environmentKeyNames: Object.keys(process.env).sort()
  })));
}
