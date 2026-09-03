# V DECISIONS PACKET — public-debate-access

Rows the fleet cannot decide for itself. The Router assembles this; V rules. Nothing here
blocks work already in flight — each row states what the fleet is doing MEANWHILE, so a
pending row never idles a seat.

**Created 2026-08-29 in response to a finding by the REQ-01 seat:** the REQ-01 packet
asserted a confirm row was "on the V DECISIONS PACKET" and gave no path, because no such
file existed. That is a Router packet defect, filed against the Router. Fixed here.

---

## Row 1 — "Same UI options": read affordances only, or mutations too? (CONFIRM)

**Status:** CLOSED (V ruled 2026-08-29 — see the ruling at the end of this row) · **Raised by:** Router at intake · **Type:** confirm an assumption

V ruled criterion 3 is full parity: *"public debates are always opened as a user's own. Same
UI options, you can see the verdict, the arguments, and et cetera."*

The Router read "same UI options" as **every READ affordance, not mutations**: an anonymous
visitor gets views, the argument tree, node cards, scoring diagnostics, the honesty drawer
and export — but NOT delete, unpublish, or replay-generation. Replay spends real model
calls; delete/unpublish would let any stranger destroy V's debate.

**Meanwhile:** the fleet builds to the read-only reading. Widening later is additive
(unhide controls); narrowing later would mean removing shipped anonymous mutation paths,
which is the expensive direction. This row is a confirm, not a blocker.

**V ruling: CONFIRMED 2026-08-29.** Reads yes, mutations no. The Router's working assumption is
now V's ruling: anonymous visitors get every READ affordance; delete, unpublish and
replay-generation stay owner-only. Status: **CLOSED.**

---

## Row 2 — Pre-widening publications: migrate, re-publish, or disclose as legacy? (DECIDE)

**Status:** CLOSED (V ruled 2026-08-29 — see the ruling at the end of this row) · **Raised by:** REQ-01 (S01-C4) · **Type:** policy

Publications are frozen encrypted snapshots. Debates published BEFORE the envelope widens
physically do not contain the argument tree in their ciphertext, so they cannot gain one
retroactively without a re-encrypt. Exactly **1** publication exists today.

Options: (a) one-shot migrate/re-encrypt the existing snapshot; (b) require the owner to
re-publish; (c) serve legacy snapshots answer-only with an honest typed absence label.

The fleet has banned two outcomes on its own authority: a **silent 404** (what a required
strict field would cause) and a **silent answer-only** page that looks like parity but
isn't. Architecture owns the choice among (a)/(b)/(c); it comes here only if Architecture
judges it a product question rather than a technical one.

**Meanwhile:** S01 proceeds with optional/nullable-or-versioned fields, which is required
under every option.

**V ruling: DECIDED 2026-08-29 — disclosed answer-only.** The one legacy publication keeps serving
its answer with an honest typed label stating the tree predates the change. No re-encryption of the
corpus-key/content-lease path, no forced re-publish. The two dishonest outcomes remain banned: a
silent 404, and a silent answer-only page that looks like parity but is not. Status: **CLOSED.**

---

## Row 3 — Visible-launch law is unenforceable on this machine (**CLOSED 2026-08-29 — V WAIVED THE LAW ON THIS MACHINE; see the closing entry at the end of this file. Do not re-litigate.**)

**Status:** CLOSED (V ruled 2026-08-29 — see the ruling at the end of this row) · **Raised by:** Router at first dispatch · **Type:** environment

`osascript` to Terminal returns `-1743 Not authorized to send Apple events`. Seats cannot be
launched in visible windows; they run backgrounded with tee'd logs under
`.hermes/planning/public-debate-access/logs/`. Restoring V's standing visible-seat
preference needs Automation permission granted in System Settings → Privacy & Security →
Automation. Only V can grant it.

**Meanwhile:** every seat tees to a distinct verified log path and the watchdog keys on disk
and board state rather than log strings, so observability is preserved — but V cannot watch
a window.

**V ruling:** _(pending)_

---

## Row 4 — Do `cost_envelope` and `tier_provenance_ref` fall inside "same UI options"? (DECIDE)

**Status:** CLOSED (V ruled 2026-08-29 — see the ruling at the end of this row) · **Raised by:** REV-01, verified independently by the Router · **Type:** scope of V's parity ruling

A logged-in owner opening their own debate sees, in the honesty drawer
(`apps/ui/components/AnswerHonestyDrawer.tsx:86,199-204`):
- `Risk tier … {tier_provenance_ref}`
- a cost-envelope panel: `state`, `consumed_model_attempts`, `protected_core`, `basis`

Under the SPEC as frozen, an anonymous visitor opening the same published debate will never
see those two rows — not because they are mutations (V's only carve-out), but because
`tests/architecture/s8-publication-contract.test.ts:130-133` forbids them in
`PublicDebateSchema`.

**Why this is a real question and not a settled one:** that forbidden list mixes three
different kinds of thing. `asker_id` / `owner_ref` / `user_id` / `run_ref` / `answer_id` are
identity carriers. `memory_disclosure` / `ledger_digest_handle` / `inspection_handle` are
owner-only side-channel handles. Both classes are correctly excluded and nobody is asking to
change them. But `cost_envelope` and `tier_provenance_ref` are neither — they are cost and
tier READ content the owner already sees on screen. The ban predates V's full-parity ruling,
and V has already reversed a *different* narrowing from that same security mission for this
feature, so the mission's defaults are not self-evidently binding here.

**Meanwhile:** the fleet builds to the current SPEC default — both fields EXCLUDED. Adding
them later is additive; shipping them and retracting is the expensive direction.

**V ruling: DECIDED 2026-08-29 — keep BOTH excluded.** `cost_envelope` and `tier_provenance_ref`
stay out of the public envelope. The pre-existing s8 ban stands and is now V-ratified rather than
inherited. Reasoning of record: per-run cost data is operational information about V's business and
neither field helps a reader evaluate an argument; widening later is additive, retracting is not.
The SPEC default was already this, so no slice changes. Status: **CLOSED.**

---

---

## Row 5 — Mission-graph / programming gate (spine v3.2.0 item 5)

**V ruling: APPROVED 2026-08-29.** V approved the lane plan: run the architecture plan review
first, then programming on whatever survives it. Programming is UNGATED as of this ruling.
Status: **CLOSED.**

---

# DISCLOSURES — no ruling requested, but you should know

Things the fleet decided on its own authority that touch your brief. Listed so nothing is
hidden; none of these block, and none is a question.

- **2026-08-29 · S02 SPEC v1→v2 narrowed one option, and the reviewer said so rather than
  waving it through.** The rework was routed as a factual correction with scope unchanged.
  The blind reviewer refused to accept the "scope unchanged" label as asserted, traced it,
  and found that v1's R6 had given the architecture seat a discretionary option to build "a
  public-safe scoring projection" which v2 forecloses. It ruled this does NOT need your
  ratification, on the reasoning that the foreclosed option pointed at a richer scoring shape
  (`impact` / `strength` / `uncertainty` / `fatal_flags`) that exists nowhere in the codebase —
  owner-side or otherwise — so exercising it would have meant inventing a new scoring feature
  outside your brief. Two seats independently verified that no scoring backend exists
  (`getDebateScoring` is a hardcoded DR-115 stub; zero scoring routes in the API).
  **If you disagree that this is a correction rather than a scope cut, say so and it becomes a
  ruling row.** The Router consumes verdicts and does not produce them, so this is recorded,
  not decided by me.

## Row 3 — CLOSED 2026-08-29 by V

**Question:** the visible-launch law (v3.2.0 amendment 2) requires every seat to run in a real
window the human can watch. On this machine `osascript` returns `-1743` ("Not authorized to
send Apple events to Terminal"), which only V can grant. The law was therefore unenforceable
and had been silently unmet since intake.

**V's ruling: WAIVE THE LAW ON THIS MACHINE.** Seats run backgrounded with `tee` to per-seat
logs under `.hermes/planning/<mission>/logs/`, each path verified DISTINCT at launch, plus the
20-minute stagnation watchdog. Nothing changes operationally — the row stops being open, and a
rule that could not be satisfied stops being on the books.

**Consequence to carry forward:** the observability the law was reaching for is now carried
entirely by the per-seat logs and the watchdog, so those are load-bearing rather than
convenience. A lane whose log path is inherited from another lane is blind, and that has
already happened once on this fleet.

## Row 6 — CLOSED 2026-08-29 by V — fifth variant, rework cap waived

**Question:** the acceptance-command thread closed at its 3-of-3 cap, after which the Router
measured a fifth variant of the same family (`t_e1208546`). Multi-pattern `-t` filters are
written `a\|b` because a bare `|` breaks a markdown table, but `vitest -t` is a JS regex where
`\|` is a **literal** pipe — so the filter matches nothing. The coder made those acceptances
pass by naming tests with literal pipes in the title. `S01-C2`'s new five-pattern presence arm
is outright unpassable (measured: `Tests 21 skipped (21)`). The law says round 4 does not exist.

**V's ruling: WAIVE THE CAP — one more Architecture round.** PLAN.md stays strictly in its
owner's hands; the Router does not edit it even for a mechanical-looking fix.

**Standing consequence:** the cap is a default, not an absolute. A defect discovered *after* a
thread closes, in the same family, may be granted an extra round by V rather than being
absorbed by the Router or deferred to QA. The Router still may not author the fix.

## Row 7 — CLOSED 2026-08-29 by V — worker may correct a demonstrably-wrong PLAN spec in place

**Question:** the REDACTION-CORRECTNESS thread was exhausted at round 3 of 3 when the coding seat
blocked a seventh time. Round 3's own fix specified test D's fixture to alias
`base_score.source` with `base_score.provenance_ref`; production aliases it with
`node.provenance_ref` (`reduced_judgement_id` vs `raw_artifact_id`, confirmed at the SQL in
`packages/serve/src/index.ts:2079/2095/2161`). The fix for "fixtures do not match production"
specified a fixture that does not match production. Round 4 does not exist under the rework law.

**V's ruling: LET THE CODING SEAT CORRECT IT IN PLACE.** It holds the evidence, it diagnosed the
exact right pairing, and it is holding the RED.

**This is a NEW precedent and it reverses, narrowly, the Row 6 constraint that only the file's
owner may author a fix to `PLAN.md`.** Its bounds, so it does not become general license:

- It applies to a **demonstrably factual** error in a spec — one the worker can show is
  contradicted by the code, with the evidence on the ticket — not to disagreement about design,
  scope, or approach.
- The worker **records the deviation on its ticket** so the file's owner ratifies it afterwards.
  The correction is provisional until then.
- The worker still may not change SPECs, scope, or acceptance CATEGORIES, and still may not
  commit, push, merge, or mark Done.
- The Router still may not author a fix to `PLAN.md` — this ruling moves the authority to the
  seat holding the evidence, not up the lattice.

**Standing consequence:** where a rework cap and a demonstrably-wrong instruction collide, V would
rather the seat with the evidence fix it and disclose than have the fleet either encode a known
fiction or spend a round on a one-line factual correction.

---

## Row 8 — S03's live probes cannot observe the code under test; the dev stack is single-instance and hardcoded to :3000 (DECIDE)

**Raised by:** the S03-CODE seat, as a BLOCKER, at its own exit 2026-08-29 22:08. It refused to
report the probe as passing and refused to touch the shared server. That was the correct call and
it is why this row exists rather than a false green.

**MEASURED, not inferred:**

- `apps/ui/app/page.tsx` — S03's implementation — is complete in `.worktrees/s03-code` and locally
  green: `tsc --noEmit` exit 0; the new accessibility test `1 passed/1`; `git diff --check` clean.
- The seat **mutation-tested its own assertion**, which is the part that makes this trustworthy:
  mutating `Link` → `div` produced a genuine `1 failed/1`, and a neighbour-styling mutant stayed
  passing. The test discriminates, and it is specific rather than over-broad.
- S03-C3-3's acceptance is a LIVE probe:
  `curl -sk 'https://localhost:3000/?tab=yours' | grep -c "/public/debate/"`.
- `https://localhost:3000` is served by PID 43352, whose cwd is the **main checkout**
  (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`), NOT the seat's worktree.
  **The probe therefore observes a tree that does not contain the change it is verifying.**
- The dev stack cannot be run twice: `apps/runner/src/dev-auth-stack.ts:122` calls
  `isPublicPortOccupied()` and throws `DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED` when 3000 is taken,
  and the origin is a hardcoded **type-level literal** `"https://localhost:3000"` (lines 62, 163).
  There is no port env knob — I looked for one.

**Why the fleet cannot resolve this itself.** Making the port configurable is a product change in
`apps/runner/**`: outside S03's file surface, outside this mission's scope, and not authorable by
the Router. Freeing :3000 means stopping a server shared with other in-flight missions, which
collides with your standing instruction not to disturb another mission's work.

**This is the same defect shape as the acceptance-command family, one level up.** Variant 1 was a
command that could not observe its own change because the path was gitignored. This is a command
that cannot observe its own change because it is pointed at a different *runtime*. The assertion
is fine; the thing it looks at is the wrong world.

**Options:**

1. **Defer the live probes to the QA loop** *(Router's recommendation)*. S03-CODE hands off with
   the implementation, the passing test, and the mutation evidence, and the probe recorded
   UNVERIFIED-BY-RUNTIME with its exact command — the identical treatment S03-C3-3 direction 2
   already has. QA owns Manual QA runs under the spine and must answer the runtime question anyway
   for direction 2, so this consolidates one problem instead of solving it twice. Costs nothing now.
2. **Authorize a coordinated server swap**: stop PID 43352, serve the worktree on :3000, run both
   probes, restore. Verifies the real thing today. Risk: it disturbs whatever else depends on that
   server, and the observability mission has in-flight work.
3. **Authorize a small product change** making the dev-stack port configurable. Cleanest long-term
   and unblocks every future worktree probe in this repo, but it is scope expansion mid-mission and
   needs its own slice and review.

**Nothing is blocked on this today** — S02 is running, and S03's remaining work does not depend on
the answer. It becomes blocking when QA starts.

---

## Row 8 — CLOSED 2026-08-29 by V — live probes deferred to QA

**V's ruling: DEFER THE LIVE PROBES TO THE QA LOOP.** Option 1 of the three offered.

The shared dev server on `:3000` is **not** to be stopped, swapped, or reconfigured, and the
dev-stack port is **not** to be made configurable as part of this mission. S03-CODE hands off with
its implementation, its passing accessibility test and its mutation evidence, and S03-C3-3 stands
recorded **UNVERIFIED-BY-RUNTIME** with the exact command and the PID/cwd evidence — the identical
treatment direction 2 already carried as UNVERIFIED-BY-ARCHITECTURE.

**Consequence for QA:** QA now inherits BOTH directions of S03-C3-3 plus S03-C1-3, and it must
answer the runtime question to discharge any of them. It cannot discharge them from the shared
main-checkout runtime — that runtime does not contain the change. QA must say what it did about
that before reporting a verdict on those steps; an unqualified PASS on a probe run against
`:3000` would be the same defect this row exists to record.

**Compliance verified at the seat's exit:** S03-CODE-R2 recorded exactly this and confirmed *"the
server was not stopped, restarted, or reconfigured"* and *"no runner modification"*.

---

## Row 9 — CLOSED 2026-08-30 by V — the contract's lone `.passthrough()` becomes `.strict()`

**V's ruling: MAKE IT `.strict()` — FAIL LOUDLY.** Chosen over silent stripping and over deferral.

**The finding.** `packages/contract/src/index.ts:434`, inside `NodeSchema` (line 424), which
`PublicDebateSchema` reaches via `answer.nodes`:

    stranger_restatement: z.object({ check_status: CheckStatusSchema }).passthrough(),

The **only** `.passthrough()` in the contract. `PublicDebateSchema` is `.strict()` at both levels and
every sibling object is `.strict()`. Router reproduction
(`.hermes/reports/public-debate-access/probes/passthrough-probe.mts`):

    parse_success: true
    keys_that_survived: ["check_status","SMUGGLED_OWNER_SECRET"]
    SMUGGLED_VALUE: ledger:abc-123
    VERDICT_SIGNAL: PASSTHROUGH_LEAKS_UNKNOWN_KEYS

An owner-shaped value survives validation into the parsed public envelope, which
`buildPublicAnswerExport` spreads wholesale into a downloadable file for anonymous readers.

**No live leak today** — `apps/api/src/publications.ts:53` explicitly constructs
`{ check_status: … }` and discards the rest; REV-06's own export probe returned
`secret_hits_in_export: []`. The hole is that the **contract does not enforce what it appears to**:
S01's whole discipline is enumerate-every-field-and-classify-it, and this is the one place an
unenumerated field is accepted *by design*.

**Why `.strict()` is low-risk as well as loud:** the sole producer already emits only
`check_status`, so `.strict()` cannot reject any data the system currently produces. It fails only
if a producer starts emitting something new — which is precisely the event that must not be silent.

**Consequences:** this reopens **committed** S01 (`packages/contract` is S01's surface). It needs a
new PLAN step with a real RED-before-GREEN acceptance — a test that an unknown key under
`stranger_restatement` is REJECTED, which must fail before the change and pass after. The Router
may not author that step.
