import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const caseLinkUrl = new URL("./caseLink.ts", import.meta.url).href;
const load = () => import(`${caseLinkUrl}?cacheBust=${Date.now()}`);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const TOKEN = "T".repeat(43);

/** A location/history pair that records every address the page was rewritten to. */
function navigation(href) {
  const rewrites = [];
  return {
    location: { get href() { return rewrites.at(-1) ?? href; } },
    history: {
      state: { marker: "kept" },
      replaceState(state, _unused, url) {
        assert.deepEqual(state, { marker: "kept" }, "history state is preserved");
        rewrites.push(new URL(String(url), "https://dezbatere.ro").toString());
      }
    },
    rewrites
  };
}

test("DL3-F4: a case link points at the fragment, which never reaches a server", async () => {
  const { supportCaseLink } = await load();
  assert.equal(supportCaseLink(TOKEN), `/help#case=${TOKEN}`);
  assert.doesNotMatch(supportCaseLink(TOKEN), /[?]/u);
});

test("DL3-F4: a fragment bearer is read once and cleared from the address", async () => {
  const { consumeSupportCaseTokenFromUrl } = await load();
  const nav = navigation(`https://dezbatere.ro/help#case=${TOKEN}`);
  assert.equal(consumeSupportCaseTokenFromUrl(nav.location, nav.history), TOKEN);
  assert.deepEqual(nav.rewrites, ["https://dezbatere.ro/help"]);
});

test("DL3-F4: the retired query bearer is accepted for one release, and rewritten to the fragment first", async () => {
  const { consumeSupportCaseTokenFromUrl } = await load();
  const nav = navigation(`https://dezbatere.ro/help?case=${TOKEN}`);
  assert.equal(consumeSupportCaseTokenFromUrl(nav.location, nav.history), TOKEN);
  assert.deepEqual(nav.rewrites, [
    `https://dezbatere.ro/help#case=${TOKEN}`,
    "https://dezbatere.ro/help"
  ], "the query form leaves navigation state before anything else happens");
});

test("DL3-F4: other fragment pieces and query parameters survive the read", async () => {
  const { consumeSupportCaseTokenFromUrl } = await load();
  const nav = navigation(`https://dezbatere.ro/help?lang=ro#service-status&case=${TOKEN}`);
  assert.equal(consumeSupportCaseTokenFromUrl(nav.location, nav.history), TOKEN);
  assert.deepEqual(nav.rewrites, ["https://dezbatere.ro/help?lang=ro#service-status"]);
});

test("DL3-F4: no bearer means no token and no rewrite", async () => {
  const { consumeSupportCaseTokenFromUrl } = await load();
  for (const href of [
    "https://dezbatere.ro/help",
    "https://dezbatere.ro/help#service-status",
    "https://dezbatere.ro/help?lang=ro"
  ]) {
    const nav = navigation(href);
    assert.equal(consumeSupportCaseTokenFromUrl(nav.location, nav.history), null);
    assert.deepEqual(nav.rewrites, [], `${href} is left exactly as it was`);
  }
});

test("DL3-F4: a value that is not a case bearer is cleared and never fetched", async () => {
  const { consumeSupportCaseTokenFromUrl } = await load();
  for (const bad of ["", "T".repeat(42), "T".repeat(44), "../../v1/session", "a b", `${TOKEN}=`]) {
    const nav = navigation(`https://dezbatere.ro/help#case=${encodeURIComponent(bad)}`);
    assert.equal(
      consumeSupportCaseTokenFromUrl(nav.location, nav.history), null,
      `${JSON.stringify(bad)} is not a case bearer`
    );
    assert.deepEqual(nav.rewrites, ["https://dezbatere.ro/help"], "and it still leaves the address");
  }
});

// ---------------------------------------------- the call sites

test("DL3-F4: the case surfaces build and read the fragment form, and never reload to re-read it", () => {
  const source = read("./CaseView.tsx");
  assert.match(source, /supportCaseLink\(/u, "the acknowledgement link is the fragment form");
  assert.match(source, /consumeSupportCaseTokenFromUrl\(/u, "and the reader consumes it");
  assert.doesNotMatch(source, /location\.search/u, "the query string is no longer read directly");
  assert.doesNotMatch(
    source,
    /location\.reload/u,
    "a reload after a reply would look for a bearer the page has already cleared"
  );
});

test("DL3-F4: every rendered case link is normalised to the fragment form", () => {
  const source = read("./Assistant.tsx");
  assert.match(source, /supportCaseLink\(/u);
  const guard = source.slice(source.indexOf("function safeFirstPartyLink"));
  assert.match(
    guard.slice(0, guard.indexOf("\n}")),
    /supportCaseLink\(/u,
    "the API still mints ?case= links; the UI renders them as #case="
  );
});
