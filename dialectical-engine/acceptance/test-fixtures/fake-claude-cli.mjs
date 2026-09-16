// Test-layer fake of the Claude Code CLI headless print mode (FAIR-02).
// Mimics the EMPIRICALLY OBSERVED `claude -p <prompt> --output-format json`
// envelope: a single JSON object on stdout carrying is_error, result,
// modelUsage (keyed by the model id the CLI actually used), subtype, type.
// Lives in the test layer only; the runtime seam that reaches it is rejected
// outside NODE_ENV=test (DR-115).

const argumentList = process.argv.slice(2);
const printIndex = argumentList.indexOf("-p");
const prompt = printIndex >= 0 ? argumentList[printIndex + 1] ?? "" : "";

const REPORTED_MODEL = "claude-fake-cli-model";

// W6 (SECURITY): the echo below is a PROJECTION over this allow-list, never
// `process.env`. Serialising the whole environment put every variable the relay
// admits — a real maker credential among them — into the model content that
// `ledger.raw_artifact` persists. Same projection shape as the product's own
// `buildCliChildEnvironment` (`acceptance/relay-core.ts:81-84`).
// Every key is here because an acceptance assertion reads it:
//   asserted PRESENT — claude-relay.test.ts:230-239 (exact-set toEqual);
//   asserted ABSENT  — claude-relay.test.ts:241-243. An absence assertion is
//   evidence only if the key WOULD be echoed when the relay admits it, so those
//   keys stay named. Anything unnamed — the W6 canary included — is dropped.
const ECHOED_ENVIRONMENT_KEYS = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "HOME",
  "LANG",
  "LOGNAME",
  "OLDPWD",
  "PATH",
  "PWD",
  "TMPDIR",
  "USER",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "SSH_AUTH_SOCK",
  "UNRELATED_SECRET",
  "XAI_API_KEY"
];

function echoedEnvironment() {
  const echoed = {};
  for (const key of ECHOED_ENVIRONMENT_KEYS) {
    const value = process.env[key];
    if (value !== undefined) echoed[key] = value;
  }
  return echoed;
}

function envelope(overrides) {
  return JSON.stringify({
    is_error: false,
    duration_api_ms: 100,
    num_turns: 1,
    session_id: "00000000-0000-0000-0000-000000000000",
    total_cost_usd: process.env.FAKE_CLAUDE_COST_ABSENT === "1" ? undefined : 0,
    modelUsage: {
      [REPORTED_MODEL]: process.env.FAKE_CLAUDE_MODEL_USAGE_NON_OBJECT === "1"
        ? "usage unavailable"
        : { output_tokens: 5 }
    },
    subtype: "success",
    result: "",
    type: "result",
    ...overrides
  });
}

if (process.env.FAKE_CLAUDE_ALWAYS_FAIL === "1") {
  process.stderr.write("intentional fake claude CLI handshake failure\n");
  process.exitCode = 7;
} else if (prompt.includes("FAIL_CLI")) {
  process.stderr.write("intentional fake claude CLI failure\n");
  process.exitCode = 17;
} else if (prompt.includes("TIMEOUT_CLI")) {
  // Long enough that the relay's deadline always fires first, while the
  // startup handshake (no marker) still answers instantly.
  setTimeout(() => process.stdout.write(`${envelope({ result: "late output" })}\n`), 2_000);
} else if (prompt.includes("IGNORE_SIGTERM_CLI")) {
  process.on("SIGTERM", () => undefined);
  setTimeout(() => process.stdout.write(`${envelope({ result: "unreachable late output" })}\n`), 2_000);
} else if (prompt.includes("IS_ERROR_CLI")) {
  // Observed live on 2026-08-10: auth failure => exit 1, is_error true,
  // result carries the CLI's own error text, modelUsage empty.
  process.stdout.write(`${envelope({ is_error: true, result: "Failed to authenticate: OAuth session expired and could not be refreshed", modelUsage: {} })}\n`);
  process.exitCode = 1;
} else if (prompt.includes("MULTI_MODEL_CLI")) {
  process.stdout.write(`${envelope({
    result: "ambiguous",
    modelUsage: { [REPORTED_MODEL]: { output_tokens: 3 }, "claude-fake-secondary": { output_tokens: 2 } }
  })}\n`);
} else if (prompt.includes("EMPTY_RESULT_CLI")) {
  process.stdout.write(`${envelope({ result: "   " })}\n`);
} else if (prompt.includes("NON_JSON_CLI")) {
  process.stdout.write("this is not a JSON envelope\n");
} else {
  process.stdout.write(`${envelope({
    result: JSON.stringify({ prompt, argumentList, environment: echoedEnvironment() })
  })}\n`);
}
