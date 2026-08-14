// Test-layer fake of Grok Build's single-turn JSON mode. It is reachable only
// through the NODE_ENV=test guarded command seam (DR-115).
const argumentList = process.argv.slice(2);
const singleIndex = argumentList.indexOf("--single");
const prompt = singleIndex >= 0 ? argumentList[singleIndex + 1] ?? "" : "";
const REPORTED_MODEL = "grok-fake-cli-model";

// Redacted Grok Build 1.0.0 envelope captured by the rev1 product-truth lens.
// No credential, private prompt, or raw provider payload is retained; only the
// observed public field shape and a test-controlled verbatim model key.
const envelope = (overrides = {}) => JSON.stringify({
  text: JSON.stringify({ prompt, argumentList }),
  stopReason: "end_turn",
  sessionId: "redacted-session",
  requestId: "redacted-request",
  thought: "redacted",
  usage: { input_tokens: 1, output_tokens: 1 },
  num_turns: 1,
  total_cost_usd: 0.00001,
  modelUsage: { [REPORTED_MODEL]: { input_tokens: 1, output_tokens: 1 } },
  ...overrides
});

if (process.env.FAKE_GROK_CAPTURED_ENVELOPE === "1") {
  process.stdout.write(`${envelope({
    text: "OK",
    modelUsage: { "grok-4.6-build": { input_tokens: 1, output_tokens: 1 } }
  })}\n`);
} else if (process.env.FAKE_GROK_ALWAYS_FAIL === "1" || prompt.includes("FAIL_CLI")) {
  process.stderr.write("intentional fake grok CLI failure\n");
  process.exitCode = 17;
} else if (prompt.includes("TIMEOUT_CLI")) {
  setTimeout(() => process.stdout.write(`${envelope({ text: "late output" })}\n`), 2_000);
} else if (prompt.includes("ERROR_ENVELOPE_CLI")) {
  process.stdout.write(`${envelope({ text: "", stopReason: "error" })}\n`);
} else if (prompt.includes("NO_MODEL_CLI")) {
  process.stdout.write(`${envelope({ text: "model absent", modelUsage: {} })}\n`);
} else if (prompt.includes("NON_JSON_CLI")) {
  process.stdout.write("not json\n");
} else {
  process.stdout.write(`${envelope()}\n`);
}
