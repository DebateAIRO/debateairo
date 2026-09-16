import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argumentList = process.argv.slice(2);
const promptIndex = argumentList.indexOf("-z");
const prompt = promptIndex >= 0 ? argumentList[promptIndex + 1] ?? "" : "";

// W6 (SECURITY): the echo below is a PROJECTION over this allow-list, never
// `process.env`. Serialising the whole environment put every variable the relay
// admits — a real maker credential among them — into the model content that
// `ledger.raw_artifact` persists. Same projection shape as the product's own
// `buildCliChildEnvironment` (`acceptance/relay-core.ts:81-84`).
// Every key is here because an acceptance assertion reads it:
//   asserted PRESENT — hermes-relay.test.ts:66 (GLM_API_KEY), :68 and :73
//   (HERMES_HOME), :69 (HOME), :70 (PWD);
//   asserted ABSENT  — hermes-relay.test.ts:67 (OPENROUTER_API_KEY), :71
//   (DATABASE_URL), :72 (ANTHROPIC_API_KEY). An absence assertion is evidence
//   only if the key WOULD be echoed when the relay admits it, so those keys
//   stay named. Anything unnamed — the W6 canary included — is dropped.
const ECHOED_ENVIRONMENT_KEYS = [
  "GLM_API_KEY",
  "HERMES_HOME",
  "HOME",
  "PWD",
  "ANTHROPIC_API_KEY",
  "DATABASE_URL",
  "OPENROUTER_API_KEY"
];

function echoedEnvironment() {
  const echoed = {};
  for (const key of ECHOED_ENVIRONMENT_KEYS) {
    const value = process.env[key];
    if (value !== undefined) echoed[key] = value;
  }
  return echoed;
}

if (process.env.HERMES_HOME) {
  mkdirSync(process.env.HERMES_HOME, { recursive: true });
  writeFileSync(join(process.env.HERMES_HOME, "session.sqlite"), "fake transcript");
}

if (process.env.FAKE_HERMES_FAIL === "1") {
  process.exitCode = 17;
} else if (prompt.includes("acceptance transport handshake")) {
  process.stdout.write(`${process.env.FAKE_HERMES_BAD_HANDSHAKE === "1" ? "NOT_OK" : "OK"}\n`);
} else {
  process.stdout.write(`${JSON.stringify({
    prompt,
    argumentList,
    environment: echoedEnvironment(),
    // W6 fix round 1 / F3: the allow-list above narrows what this fixture can
    // emit, so a key the relay wrongly admits under an unlisted name would be
    // invisible. The key NAMES restore that reach at zero risk — a name is not a
    // credential, a value is. Read by `hermes-relay.test.ts:85-88`.
    environmentKeyNames: Object.keys(process.env).sort()
  })}\n`);
}
