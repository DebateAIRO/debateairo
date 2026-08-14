// Test-layer fake of Grok Build's single-turn JSON mode. It is reachable only
// through the NODE_ENV=test guarded command seam (DR-115).
const argumentList = process.argv.slice(2);
const singleIndex = argumentList.indexOf("--single");
const prompt = singleIndex >= 0 ? argumentList[singleIndex + 1] ?? "" : "";
const REPORTED_MODEL = "grok-fake-cli-model";

const envelope = (overrides = {}) => JSON.stringify({
  is_error: false,
  result: JSON.stringify({ prompt, argumentList }),
  model: REPORTED_MODEL,
  ...overrides
});

if (process.env.FAKE_GROK_ALWAYS_FAIL === "1" || prompt.includes("FAIL_CLI")) {
  process.stderr.write("intentional fake grok CLI failure\n");
  process.exitCode = 17;
} else if (prompt.includes("TIMEOUT_CLI")) {
  setTimeout(() => process.stdout.write(`${envelope({ result: "late output" })}\n`), 2_000);
} else if (prompt.includes("ERROR_ENVELOPE_CLI")) {
  process.stdout.write(`${envelope({ is_error: true, result: "authentication failed" })}\n`);
} else if (prompt.includes("NO_MODEL_CLI")) {
  process.stdout.write(`${JSON.stringify({ is_error: false, result: "model absent" })}\n`);
} else if (prompt.includes("NON_JSON_CLI")) {
  process.stdout.write("not json\n");
} else {
  process.stdout.write(`${envelope()}\n`);
}
