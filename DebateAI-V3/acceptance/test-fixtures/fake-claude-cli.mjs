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

function envelope(overrides) {
  return JSON.stringify({
    is_error: false,
    duration_api_ms: 100,
    num_turns: 1,
    session_id: "00000000-0000-0000-0000-000000000000",
    total_cost_usd: 0,
    modelUsage: { [REPORTED_MODEL]: { output_tokens: 5 } },
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
    result: JSON.stringify({ prompt, argumentList })
  })}\n`);
}
