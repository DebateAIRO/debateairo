import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// NOTE: deliberately placed outside app/debate/[id]/ (see
// headerToolbarResilience.source-test.mjs / lifecycleDecisions.source-test.mjs
// for the same established pattern) -- the bracketed directory name is not
// reliably picked up by `node --test` when it is itself the argument path, so
// this file lives one level up and reads sources via a relative path instead.
const root = process.cwd();
const clientPath = join(root, "app", "debate", "[id]", "DebatePageClient.tsx");
const pagePath = join(root, "app", "debate", "[id]", "page.tsx");

// (c) A transient SSR coordinator timeout/unreachable must NOT drop the user on
// the fatal "Back to library" dead-end. It renders a pending/loading state and
// lets the existing client polling/stream retry populate the debate.
test("a transient (pending) SSR failure renders a loading state, never the fatal gate", () => {
  const page = readFileSync(pagePath, "utf8");
  const client = readFileSync(clientPath, "utf8");

  // page.tsx consumes the discriminated result and routes pending -> loading.
  assert.match(
    page,
    /const result = await getDebateServer\(id\);/,
    "the debate page must consume the discriminated getDebateServer result"
  );
  assert.match(
    page,
    /result\.kind === "pending"[\s\S]{0,120}?initialPending = true/,
    "a transient (pending) SSR outcome must set initialPending, not a terminal error"
  );
  assert.match(
    page,
    /initialPending=\{initialPending\}/,
    "initialPending must be threaded down to the client component"
  );
  // The old blanket try/catch that turned ANY thrown SSR error (including a
  // transient timeout) into a fatal initialError must be gone.
  assert.doesNotMatch(
    page,
    /catch\s*\(exc\)[\s\S]*?initialError = exc/,
    "the old catch-all seeding initialError from any thrown SSR error must be removed"
  );

  // The client accepts the pending flag and renders a loading/connecting screen
  // for it -- the fatal gate stays restricted to a real error with no debate.
  assert.match(client, /initialPending\?: boolean;/, "client must accept an initialPending prop");
  assert.match(
    client,
    /const \[error, setError\] = useState<string \| null>\(initialError\);/,
    "error state must be seeded only from a definitive initialError (pending never seeds error)"
  );
  assert.match(
    client,
    /if \(error && !debate\) \{/,
    "the fatal dead-end gate must remain restricted to a real error with no debate"
  );
  assert.match(
    client,
    /if \(!debate\) \{[\s\S]*?initialPending \? "Connecting to the coordinator…" : "Loading…"/,
    "a pending initial state must render the loading/connecting screen, not the fatal dead-end"
  );
});

// (b) Recovered data must self-heal: a successful refresh() and a live stream
// (re)connection must clear stale error state so a debate that arrives after a
// transient failure never stays stuck behind an old banner or fatal screen.
test("refresh() success and stream onopen clear stale error state (self-heal)", () => {
  const client = readFileSync(clientPath, "utf8");

  assert.match(
    client,
    /const latest = await getDebate\(id\);\s*setDebate\(latest\);[\s\S]{0,500}?setError\(null\);/,
    "refresh() success must clear stale error state after setting the debate"
  );
  assert.match(
    client,
    /events\.onopen = \(\) => \{[\s\S]*?setError\(null\);[\s\S]*?refresh\(\);/,
    "stream onopen must clear stale error state before refreshing"
  );
});
