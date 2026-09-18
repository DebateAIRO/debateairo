import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const consentUrl = new URL("./consent.ts", import.meta.url).href;
const load = () => import(`${consentUrl}?cacheBust=${Date.now()}`);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const AT = "2026-09-19T08:14:00.000Z";

test("DL3-F6: the server's recorded consent is read from the session record", async () => {
  const { supportConsentRecordFrom } = await load();
  assert.deepEqual(
    supportConsentRecordFrom({ session: { session_id: "s", consent_own_context_at: AT } }),
    { consentOwnContextAt: AT }
  );
  assert.deepEqual(
    supportConsentRecordFrom({ session: { session_id: "s", consent_own_context_at: null } }),
    { consentOwnContextAt: null }
  );
});

test("DL3-F6: a body that states nothing about consent is unknown, never a claim of absence", async () => {
  const { supportConsentRecordFrom } = await load();
  for (const body of [
    {}, null, undefined, "record", { session: null }, { session: "s" },
    { session: { session_id: "s" } },
    { session: { session_id: "s", consent_own_context_at: 1758268440 } },
    { session: { session_id: "s", consent_own_context_at: true } }
  ]) {
    assert.equal(supportConsentRecordFrom(body), null, `${JSON.stringify(body)} states nothing`);
  }
});

test("DL3-F6: consent is given exactly when the server recorded a time for it", async () => {
  const { supportConsentGiven } = await load();
  assert.equal(supportConsentGiven(AT), true);
  assert.equal(supportConsentGiven(null), false);
  assert.equal(supportConsentGiven(undefined), false);
  assert.equal(supportConsentGiven(""), false);
});

// ---------------------------------------------- the call sites

test("DL3-F6: the toggle renders the server's value, not a local default", () => {
  const source = read("./ConsentToggle.tsx");
  assert.match(source, /consentedAt/u, "the recorded consent reaches the control");
  assert.match(source, /supportConsentGiven\(/u, "and decides what the box shows");
  assert.doesNotMatch(
    source,
    /\[checked,\s*setChecked\]/u,
    "a local default-false answer is exactly what misreported an active consent"
  );
});

test("DL3-F6: the assistant carries the recorded consent on the session it holds", () => {
  const source = read("./Assistant.tsx");
  const createSession = source.slice(source.indexOf("async createSession("));
  assert.match(
    createSession.slice(0, createSession.indexOf("\n  async ")),
    /supportConsentRecordFrom\(body\)/u,
    "createSession keeps the served consent instead of discarding it"
  );
  assert.match(source, /consentOwnContextAt/u);
  assert.match(source, /replyFrom\(body\) \?\? supportConsentRecordFrom\(body\)/u,
    "and the consent route's updated record replaces it");
  assert.match(
    source,
    /consentedAt=\{session\?\.consentOwnContextAt \?\? null\}/u,
    "the control is rendered from the session record"
  );
});
