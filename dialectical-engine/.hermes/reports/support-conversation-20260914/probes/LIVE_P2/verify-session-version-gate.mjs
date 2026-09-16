import assert from "node:assert/strict";
import { createRuntimeSessionVersionGate } from "./session-version-gate.mjs";

const VERSION = "d674533e89d145bf9203248e2e324b451e57a2f1d3f257614d31678b7ac379df";
const sessionResponse = (version = VERSION) => ({
  session: {
    session_id: "00000000-0000-4000-8000-000000000001",
    identity_bound: false,
    language: "en",
    state: "OPEN",
    kb_version: version,
    created_at: "2026-09-15T00:00:00.000Z",
    consent_own_context_at: null
  },
  session_token: "x".repeat(43),
  first_message: { role: "assistant",text: "fixture" }
});

{
  const gate = createRuntimeSessionVersionGate(VERSION);
  assert.equal(gate.status(),"PENDING");
  assert.equal(gate.observe(sessionResponse()),VERSION);
  assert.equal(await gate.waitUntilReady(),VERSION);
  assert.equal(gate.status(),"READY");
}

for (const fixture of [
  null,
  {},
  { kb_version: VERSION },
  { session: null },
  { session: {} },
  { session: { kb_version: 7 } }
]) {
  const gate = createRuntimeSessionVersionGate(VERSION);
  assert.throws(() => gate.observe(fixture),/LIVE_P2_RUNTIME_SESSION_SHAPE_INVALID/);
  await assert.rejects(gate.waitUntilReady(),/LIVE_P2_RUNTIME_SESSION_SHAPE_INVALID/);
  assert.equal(gate.status(),"FAILED");
}

{
  const gate = createRuntimeSessionVersionGate(VERSION);
  assert.throws(
    () => gate.observe(sessionResponse("a".repeat(64))),
    /LIVE_P2_RUNTIME_SESSION_VERSION_MISMATCH/
  );
  await assert.rejects(gate.waitUntilReady(),/LIVE_P2_RUNTIME_SESSION_VERSION_MISMATCH/);
  assert.equal(gate.status(),"FAILED");
}

{
  const gate = createRuntimeSessionVersionGate(VERSION,{ timeoutMs: 5 });
  await assert.rejects(gate.waitUntilReady(),/LIVE_P2_RUNTIME_SESSION_VERSION_UNAVAILABLE/);
  assert.equal(gate.status(),"FAILED");
}

process.stdout.write("LIVE_P2 session-version gate: 10/10 inert controls passed\n");
