import { createHash } from "node:crypto";

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
//   asserted PRESENT — claude-relay.test.ts:231-240 (exact-set toEqual);
//   asserted ABSENT  — claude-relay.test.ts:242-244. An absence assertion is
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

// W6 fix round 1 / F4 — the CREDENTIAL-SHAPE rule, stated identically in all six
// members of the class. A key is credential-shaped when a SEGMENT of its name is
// one of KEY, TOKEN, SECRET, PASSWORD, PASSWD, OAUTH, AUTH, CREDENTIAL(S), URL,
// URI or DSN.
// Why a pattern over the NAME and not an explicit list: an explicit list would
// have to be maintained in six places and would silently miss the next maker's
// locator, which is exactly how this leak survived. Why SEGMENT-anchored and not
// a substring: HOME, PATH, TMPDIR, LANG, USER, LOGNAME, PWD, OLDPWD, HERMES_HOME
// and CODEX_HOME are paths and identities the assertions need in clear, and none
// of them matches. Why URL/URI/DSN are in it: a connection string such as
// DATABASE_URL embeds a password — the most damaging value in this tree — and it
// matches none of the key/token words.
// A credential-shaped key's VALUE is never emitted. Presence and identity travel
// as a truncated one-way digest, so an assertion can still prove the relay passed
// THE key it was given by comparing the digest of the sentinel it set.
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
    result: JSON.stringify({
      prompt,
      argumentList,
      environment: echoedEnvironment(),
      // W6 fix round 1 / F3: the allow-list above cost the consumer's exact-set
      // assertion the ability to see a key `buildCliChildEnvironment` wrongly
      // admits. The key NAMES give that reach back at zero risk — a name is not
      // a credential, a value is. Read by `claude-relay.test.ts:253-257`.
      environmentKeyNames: Object.keys(process.env).sort()
    })
  })}\n`);
}
