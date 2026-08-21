# ENV-01 — Opus 5 lens, rev1 (dual diamond, DR-153)

**Ticket:** `t_40b756e7` · **Verdict: APPROVED** (nothing blocking) · 6 advisories.

Read-only review. Gates not re-run (orchestrator verified independently). All
findings below were derived from the ledger text, the DEPTH-01 proposal, and the
working tree — not from the handoff's claims.

---

## 1. Byte-fidelity to DR-159 — VERIFIED against the ledger, not the handoff

Ledger `decisions-ledger.md:942-945` ratifies: depth 1 → 42 · 2 → 66 · 3 → 114 ·
4 → 210 · 5 → 402, for BOTH `standard` and `high-stakes`, `casual` NOT seeded.

`acceptance/seed-register.ts:176-187` seeds exactly ten members, in that order,
with those five integers at both tiers and no `casual` row.
`acceptance/seed-register.ts:9` sets provenance `acceptance:DR-159:V-approved`,
attached to the row at `:189`.

Cross-checked against the derivation, not just the ruling: the proposal's
B3-B + B2-A retry-tolerant column (`ratification/DEPTH-01-envelope-proposal.md:158-164`)
is 42/66/114/210/402. The seeded integers are V's column, unrounded and
un-"improved". **No deviation. AC-76 satisfied.**

## 2. Would the seed tests fail on drift? — YES, on all three mutations

`acceptance/seed-register.test.ts:110-128` is a whole-row `toEqual` on the built
row (value AND `sourceRef`), so it is a *behaviour* pin on
`buildAcceptanceRegisterRows()`, not a source-text pin:

- `114 → 115` in the seed → `toEqual` mismatch at member index 4. RED.
- drop `{depth:4, high-stakes}` → `toEqual` array-length/element mismatch. RED.
- add a `casual` row → `toEqual` mismatch, plus the explicit
  `:138` `some(risk_tier === "casual") === false`. RED.

The closure assertion at `:130-137` earns its place because it survives a
**co-edited pin**: it rebuilds the required key space independently
(`[1..5].flatMap(d => [d:standard, d:high-stakes])`) and compares sorted, so
editing both the seed and the `toEqual` expectation to drop a depth or a tier
still goes red. That is genuine closure over the key space, matching DR-151's
`CLAIM_TYPES` precedent.

Partial *database* seeds are separately covered: `seedAcceptanceRegister`
re-reads every persisted row and compares canonical JSON + `source_ref`
(`acceptance/seed-register.ts:293-307`), throwing `ACCEPTANCE_REGISTER_CONFLICT`
/ `ACCEPTANCE_REGISTER_ROW_COUNT_MISMATCH`; a stale standing `.pgdata` carrying
the old 9 stops loudly rather than silently serving it, and that path has its own
test (`acceptance/dual-maker-proof.test.ts:87`).

Third pin updated: `tests/support/v2uiFixtures.ts:119` now `42`. Repo-wide sweep
for `max_model_attempts` finds no remaining pin of the old `9` tied to the
acceptance seed (`tests/unit/pol01-policy.test.ts:22` uses 9 as an unrelated
synthetic fixture value).

## 3. The unpin — count and integers are gone (see ADV-2 for the residue)

`acceptance/runtime-policy.ts:39-46` replaced the one-member `z.tuple([...
depth: literal(1), risk_tier: literal("standard"), max_model_attempts: literal(9)])`
with `z.array(...).min(1)`, tier `z.enum(["standard","high-stakes"])`, attempts
`z.number().int().positive()`. **No member-count pin and no value pin** — today's
42/402 are not re-pinned, so the old trap is not recreated in its original form.

Positive finding worth recording: the "casual is unreachable" premise DR-159
rests on is itself enforced at boot — `acceptance/runtime-policy.ts:30` pins
`riskTier: z.literal("standard")`, so the acceptance deployment floor cannot
quietly drop to `casual` and leave every casual ask resolving against an unseeded
member.

## 4. A-1 — closed as a typed loud failure; the directive's letter is met

`apps/runner/src/index.ts:73`:
`.min(1).max(2, "Composer output exceeds DR-159's ratified two-segment serve cap")`,
surfaced through `parseComposerOutput` (`:178-180`) as typed
`COMPOSITION_CONTRACT_ERROR`, called at `:771`. The prompt at `:763` now says
"at most two … entries". Test: `tests/unit/env01-runner-policy.test.ts:13-18`
drives a genuine 3-segment payload and asserts both the code and the
assumption-naming message.

- **Where it fires:** composition time, inside the compose dependency, before
  segments are assembled — not at serve time.
- **Does it misfire on a lawful 1-segment composition?** No. `.min(1)` is intact,
  and `tests/integration/database.test.ts:1375-1377` still feeds a 1-segment
  composition through the real runner; it parses and fails later on the
  *reasoning* rule, proving the cap does not swallow the lawful lower bound.
- **Is it silent anywhere?** No. `packages/serve/src/index.ts:475` calls
  `dependencies.compose(...)` with no `try`, so the throw escapes `runServeGate`;
  the runner's only catch (`apps/runner/src/index.ts:855-858`) re-raises anything
  that is not `RUN_COST_ENVELOPE_EXHAUSTED`. There is no degradation to
  `componentsOnly` on a cap violation.

This satisfies "make the violation a typed loud failure that names the
assumption". The three advisories below are about *where* the cap sits and what
it does not cover — none of them reduce to "merely recorded".

## 5. A-2 — recorded with a concrete, non-clamping fix

Verified against source: `apps/runner/src/main.ts:26-28` still takes
`JUDGE/COMPOSER/CONFORMANCE_MAX_ATTEMPTS` from the environment
(`packages/register/src/runtime-environment.ts:47-49`), and
`resolveRunCostEnvelopeBasis` (`packages/register/src/index.ts:253-266`) matches
on depth fingerprint + tier only. The handoff's record is accurate, and the
proposed fix (register-owned attempt-policy loaded at the same register version,
typed-loud startup mismatch, explicitly *not* silent clamping) is the right
shape. The ticket permitted "record at minimum". Met — see ADV-3 for what the
record omits.

## 6. Honesty of the live proof — CLEAN

The handoff states the opposite of the forbidden claim, twice:
"Depth remains inert in the runner, as recorded by DR-157. This work proves
admission and budget resolution only; it does not claim depth-driven tree
expansion" (`handoffs/ENV-01-codex-handoff.md:7`) and "the live run remains the
current two-node shape" (`:215`). The pasted ceremony line reports
"2 nodes · 1 attack edge(s)" — consistent with an inert depth dial, not a
depth-3 tree.

Internal consistency of the 202: `run_ref db2d02bb…` QUEUED, persisted
`risk_tier: standard`, `depth_params {depth: 3}`, basis `max_model_attempts: 114`,
`register_row_key runCostEnvelope`, `register_version 1`,
`source_ref acceptance:DR-159:V-approved`, `seeded_member_count 10`. Those hang
together and match the seeded row. The reseed narrative also checks out
mechanically: only the composer *prompt text* feeds
`composerContractHash` (`acceptance/seed-register.ts:53-57`), so the prompt
rewording at `apps/runner/src/index.ts:763` genuinely did change the row and
force a fresh `.pgdata` — exactly as the handoff describes. Three backups exist
under the ignored pattern; `git check-ignore -v` confirms `.gitignore:55` for
each. **No honesty finding.**

---

## BLOCKING

None.

---

## ADVISORY (ranked)

### ADV-1 — the cap is on the composer, not on the serve set; the runner itself appends a third segment past it
`apps/runner/src/index.ts:789-800` · `packages/serve/src/index.ts:470-500`

`finalSegments` is `composedSegments` **plus** a renderer-owned
`memory:disclosure` segment, assembled *after* `parseComposerOutput` has run. So
the capped quantity (composer output ≤ 2) is not the quantity that reaches the
serve gate (up to 3). `packages/serve` has no segment-count bound of its own.

Concrete case: a repeat question that matches memory renders a disclosure
sentence (`packages/memory/src/index.ts:212-225`). That segment carries no
`servedNumberRefs` and no `assertedNodeRefs`, so `packages/serve/src/index.ts:481`
marks it non-load-bearing, and `:496` conforms it anyway whenever
`strangerSampleRate >= 1` (the ceremony's own setting —
`acceptance/ceremony.test.ts:214`). V's serve arithmetic is
`serve = A + A·S + 1` with **S = conformed segments per attempt**
(`ratification/DEPTH-01-envelope-proposal.md:80,85,94`); with S=3 that is
`2+6+1 = 9`, not 7, so depth-1 first-try becomes 16 and the 3× ceiling becomes
48 — above the ratified 42. Nothing overruns *today* (the shipped topology is
one primary + one critic), but this bites the moment PRO-01 lands and a
memory-matched question runs under exhaustive sampling, and it will surface as
`RUN_COST_ENVELOPE_EXHAUSTED`, not as a cap violation naming DR-159.

Second consequence of the same placement: a future second composer (PANEL-01)
that does not route through `parseComposerOutput` reopens A-1 silently, because
the enforcement lives at one call site rather than at the serve boundary.

No test exercises a 3-segment serve set — `memory:disclosure` appears nowhere
outside `apps/runner/src/index.ts:773,794`.

Suggested: bound the *serve set* in `packages/serve` (composed segments ≤ the
ratified cap, renderer-owned segments enumerated separately), and record the
memory-disclosure segment's conformance cost against V's S.

### ADV-2 — the unpin left a narrower-than-shipped depth pin that can refuse to boot one ruling later
`acceptance/runtime-policy.ts:42`

`depth_params: z.object({ depth: z.number().int().min(1).max(5) }).strict()` is
stricter than both the shipped contract (`packages/contract/src/index.ts:112`,
open record) and the shipped register reader
(`packages/register/src/index.ts:152`, open record). Concrete failing case: the
day V ratifies a depth-6 member — or PRO-01 adds a second `depth_params` key such
as `{depth:3, breadth:2}` — `readAcceptanceRuntimePolicy` throws at parse and the
acceptance runtime **refuses to boot**, which is the exact failure shape ENV-01
was minted to remove, just with five depths of headroom instead of one member.
The count and the integers are correctly unpinned; this residue is not.

Suggested: `depth: z.number().int().positive()` and drop `.strict()` on
`depth_params`, or reuse the shipped reader's shape outright.

### ADV-3 — A-2's record omits `MAX_RECOMPOSE`, the `A` factor in V's own formula
`apps/runner/src/main.ts:32` · `packages/register/src/runtime-environment.ts:53`

V's serve cost is `serve = A COMPOSER + A·S CONFORMANCE + 1 R9` with `A = 2`
"maximum composition attempts" (`ratification/DEPTH-01-envelope-proposal.md:79,85`).
`A` is `maxRecompose`, and in the standalone runner it is supplied by the
`MAX_RECOMPOSE` environment variable — invisible to the envelope match key,
identical in kind to the three attempt bounds A-2 names. Concrete case: a
deployment setting `MAX_RECOMPOSE=4` doubles both the composer and the
conformance terms (serve 7 → 13) and silently invalidates every ratified
ceiling, and the handoff's A-2 section does not mention it. The acceptance
harness is safe only because `acceptance/main.ts:207` hardcodes `maxRecompose: 2`.

Suggested: fold `MAX_RECOMPOSE` into the same proposed register-owned
attempt-policy basis before A-2 is worked.

### ADV-4 — the acceptance work-item claim lease silently grew 45× as a side effect of the seed
`acceptance/main.ts:191-196` · `apps/runner/src/index.ts:304`

`maximumRunAttempts = Math.max(...members.map(m => m.max_model_attempts))` is now
**402** instead of 9, and `claimMs = longestDeadline * maximumRunAttempts` =
60 000 × 402 = 24 120 000 ms. `claimSeconds` therefore jumps from 540 s (9 min)
to 24 120 s (≈ 6.7 h). `assertClaimCoversCall`
(`packages/battery/src/index.ts:214-225`) only checks the lower bound, so nothing
flags it. Consequence: a work item abandoned by a crashed acceptance worker is
not reclaimable for most of a day. Harness-only and not a correctness defect, but
it is an unrecorded behavioural consequence of the ten-member seed and belongs in
the handoff. Suggested: derive the lease from the member the run actually
resolved, not the maximum across all members.

### ADV-5 — the cap makes a chatty model fatal to the run, against B1-B's stated rationale
`packages/serve/src/index.ts:472-475` · `apps/runner/src/index.ts:73`

The `parseComposerOutput` throw escapes the `for (attempt <= maxRecompose)` loop
entirely (the `compose` call is not wrapped), so a composer that emits three
segments once gets **zero** recompose attempts, while a composer that merely
fails conformance gets a full recompose. V chose B1-B precisely so "a transient
provider failure should be survivable rather than fatal"
(`decisions-ledger.md:936-941`); a stray third segment is the same class of
transient model misbehaviour. Suggested: reject-and-recompose within the ratified
attempt budget, escalating to the typed error only after the recompose budget is
spent.

### ADV-6 — the acceptance README now attributes V's DR-159 members to the superseded DR-138
`acceptance/README.md:92-96`

The edited sentence reads "**DR-138** supplies the shipped run-level
`runCostEnvelope` members for depths 1–5 … with the DR-159 retry-tolerant
ceilings … and provenance exactly `acceptance:DR-159:V-approved`". The row's
code-level provenance is correct; the prose credits the wrong ruling for V's
values, which is the one thing this mission's provenance discipline exists to
prevent. (Same stale reference, harmless, at `acceptance/ceremony.test.ts:393`.)
One-word fix.

---

## Checked and clean (no finding)

- No remaining pin of the old `9` in the acceptance path; the shipped resolver
  handles ten members with a canonical-JSON depth fingerprint and throws typed
  `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` on a miss
  (`packages/register/src/index.ts:253-266`).
- `acceptance/runtime-policy.test.ts:7-27` proves the unpinned schema accepts a
  complete ten-member envelope (it feeds synthetic attempt values, which is
  correct for a shape test — the ratified values are pinned in the seed test).
- Backups: three timestamped dirs plus the older `2026-08-11` one, all matched by
  `.gitignore:55`; none committable.
- `acceptance/run-acceptance.ts:192-195` (the `independent attack edges` console
  line the handoff pastes) belongs to the FAIR lane —
  `acceptance/fair-debate.ts:48,98` — not to ENV-01. Correctly excluded from the
  inventory.
