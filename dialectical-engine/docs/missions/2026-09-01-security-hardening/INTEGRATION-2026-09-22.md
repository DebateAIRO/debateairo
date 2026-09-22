# INTEGRATION 2026-09-22 — SYNC2 merged into the integration branch (INT2)

Technical ledger, written for reviewers and agents. Its companions are
`DEV-SYNC-2026-09-18.md` and `DEV-SYNC-2026-09-22.md`; the conflict-resolution principle is
theirs: *keep what BOTH sides meant; a security protection never gives way to a tidy-up — it
is re-fitted inside the newer code.*

- Work branch: `security/int2-sync2-into-integration`, created from the integration branch
  at `f8419b4c` (nine reviewed packages on the pre-sync base, plus INT1).
- Merged: `security/dev-sync-2026-09-22@22fc051d` — SYNC2's merge of `origin/dev@cbf1b281`
  (36 commits: Node 26.8.2, vitest 5.0.1, the restored S06 capture binding) plus its three
  follow-up commits. `git merge --no-ff`, never a rebase. Merge base `e8e03b08`.
- Host: Mac mini, Node v26.8.2, pnpm 11.20.0 self-selected from `packageManager`.

| Commit | What |
|---|---|
| `c0e43afc` | the merge: exactly the two conflicting files the dry run predicted |
| `9e906ff1` | the three `capture?.emit` sites routed; the redactor defect that routing exposed |
| `66c25f20` | `pnpm keys:rotate-kek` declared (V-3) |
| `74479f8e` | the two failures the merged tree exposed — fixed, not listed |
| `62f42c88` | the renamed known-red entries: the real cause named (vitest 5, not `dev`) |
| `c8283c95` | DL4-F3's missing pin — the product supplies the per-attempt hook |
| this file | the record |

## 1. The conflict set was exactly the predicted two

`dialectical-engine/apps/runner/src/index.ts` and `dialectical-engine/tests/ci-known-red.txt`,
matching the coordinator's dry run byte for byte. Eight other paths auto-merged, including
`tests/integration/obs-l3-s06-runner-binding.test.ts`, `packages/crypto/src/argon2-worker.ts`,
`tests/architecture/ci-security-gates.test.ts`, `s8-publication-contract.test.ts`,
`sup-06-no-zone-limiter.test.ts` and `acceptance/seed-register.ts`. Two of those clean
auto-merges were wrong in meaning — §5 — which is the whole argument for running the suites on
a merged tree even when the conflict list looks tidy.

## 2. `apps/runner/src/index.ts` — one hunk, per-hunk resolution

The conflict is a single hunk: the `fn:` of `declareHatchetWalkingSkeletonTask`. Everything
else in this 5 700-line file auto-merged, because Task 9's and Task 11's changes and `dev`'s
restored binding sit in different regions.

| Hunk | OURS (integration) | THEIRS (SYNC2) | Resolution |
|---|---|---|---|
| `fn:` signature | `async (rawDispatch: {runId, workItemId}) =>` — one parameter | `async (dispatch, hatchetContext?: { retryCount?(): number })` — two, under `dev`'s S06 comment block | **Both.** `dev`'s two-parameter signature and its comment, with OURS' `rawDispatch` name, because the validated value is what the body may use. |
| L4-F6 dispatch schema | `walkingSkeletonDispatchSchema.safeParse` → `RUNNER_WORKFLOW_INPUT_INVALID`, then `const dispatch = parsed.data` | absent | **Kept, and moved FIRST** — see below. |
| capture import | absent | `const capture = await import("@debateai/obs-capture").catch(() => undefined)` | Kept, after the validation. |
| `retryCount()` guard | absent | `let observedRetryCount` + try/catch + `attemptIndex` | Kept whole. |

**Ordering was the only real decision, and it is a security one.** The validation now runs
before the dynamic import and before `runWithObsContext` builds the ambient refs. A dispatch is
attacker-controllable; if the binding ran first, an unvalidated `runId` string would become
`run_ref.value` in an observability envelope before anything had checked it was a UUID. Putting
L4-F6 first costs nothing (a malformed dispatch has no run to attribute anyway) and closes that
path. The reverse order — binding first — would have been the tidy merge and the wrong one.

Everything below the hunk auto-merged and was re-read to confirm it survived. **Every line
number in this table is measured in `apps/runner/src/index.ts` at `345eb7d0`**, not at the merge
commit `c0e43afc`, and each was re-checked by grep when this row was written. No later commit on
this branch touches that file, so they hold at the tip too. The first draft of this table mixed
the two commits and one number was already stale by two lines.

| Behaviour | Owner | Where it lives after the merge (at `345eb7d0`) |
|---|---|---|
| `captureFailureEnvelope` | Task 9 (the amendment) | `:5477`, and now used at all three sites |
| `scrubbedTaskFailure` at the single trailing `throw` | DL4-F1, re-seated by SYNC2 | `:5593`, reached on every failing path including `dev`'s `!recorded` path |
| `assertAttemptAllowed: () => budget.assertModelAttemptAllowed(leasedRunId)` | DL4-F3, re-seated by SYNC2 | `:5678`, inside `http.call` — now pinned, §7 |
| `EVALUATOR_PROMPT_CONTRACT`, the dispatch-input schema, the frame-builder call sites | Task 9 | `:194` (the contract), `:4256` (the evaluator call site) |
| The cost-envelope decision path | Task 11 | `evaluateEnvelope` `:3968`, `recordEnvelope` `:3978`, `makeEnvelopeTerminal` `:3986`; the `RUN_COST_ENVELOPE_EXHAUSTED` catch `:4306` → `evaluateEnvelope(1)` `:4314` → terminal `:4323`; the final decision `:4326` |

**Correction, recorded rather than quietly fixed.** The first draft of the Task 11 row named
`runBodyBudgetStop`, `envelopeStopKind` and `buildMakerPositionDisclosure` as "auto-merged,
intact". Those three identifiers **exist nowhere in the tree** — not at HEAD and not at the
pre-merge integration tip `f8419b4c`; `git grep` returns only this document's own row. They came
from Task 11's report §11, which describes the design in the vocabulary of its rounds, and were
copied here as if they were code. Naming a symbol that does not exist is worse than naming
nothing: it reads as verification and is the opposite. The row above names anchors that were
each grepped at HEAD before being written down.

## 3. `tests/ci-known-red.txt` — the union, then the reconciliation

The entry block auto-merged to SYNC2's five (the integration branch had not touched the
entries, only Task 3's comment paragraph). The conflict was the "Deliberately NOT listed"
paragraph alone.

**The union as resolved:** SYNC2's five entries with their source notes; SYNC2's
`registration-database` and `tests/render` notes; and Task 3's RSS paragraph in place of
SYNC2's, amended to say what is now true — the case is **fixed on this branch**, V-25 keys the
bound by platform + architecture + Node version, both `node_v22.23.1_darwin_arm64` (256 MiB,
history) and `node_v26.8.2_darwin_arm64` (288 MiB) are published, so this Mac RUNS the case and
a host with no entry skips it loudly. It is listed nowhere, as before, and now for a better
reason.

**Then the gate was run, and reported `new=2`.** Neither was listed; both were fixed. See §5.

Gate after the reconciliation → **`new=0 known=5 stale=0`**.

## 4. The three capture sites, routed

`dev`'s restored binding emitted the RAW error at three places — two in the task body
(shorthand `error,` and the named `error: recordingFailure`) and one in the gateway wrapper.
`@debateai/obs-capture` is a second sink beside the job system's own Postgres and stderr, and
carries whatever it is handed as `payload_ref` once an emitter is installed.

RED, on the merged tree: `tests/unit/runner-hatchet-task-input.test.ts`'s `captureGuardVerdict`
read `expected 3 to be less than or equal to 0` — three emissions, zero uses of the builder.
All three now call `captureFailureEnvelope`, whose return type has no `error` member. GREEN,
18/18.

### The defect the routing exposed, and why it matters more than the routing

The builder and the sink were written apart. `createSharedRedactor` rejects a payload carrying
**any** key outside its `INPUT_ALLOWLIST` by minimising the WHOLE envelope to
`OBS_CAPTURE_SELF`, and `path` was not on that list. Every routed capture would have reached the
durable record with no code, no capture point and no attempt index: the amendment would have
silently destroyed exactly the signal the S06 binding exists to record, while every unit test of
the builder stayed green.

`path` is allowlisted **so that the payload is not minimised, and for nothing else.** It is the
bounded operational diagnostic — a closed alphabet derived from the error's class and SQLSTATE,
never its text — but `redact` never reads it, `PostRedactionEnvelope` has no `path` field, and
`flusher.ts:75` is its only caller, so **the diagnostic the runner computes at
`apps/runner/src/index.ts:5489` is discarded at the redaction boundary and reaches no durable
record today.** Said plainly because the first draft of this section claimed the opposite — that
`path` was "read for the decision" — which would have left a reader believing a signal exists
where none does. What the envelope actually preserves past the redactor is the `code`, the
capture point, the disposition, the source and the attempt index; what it removes is the error.
Both halves of that are the point: the error is gone, and the code survives. The runner is not
changed here — computing `path` costs nothing, it is the right value to carry if the durable
shape ever grows a field for it, and it is what makes the envelope self-describing at the
emission site.

A new unit row drives the real builder through the real redactor. `test:ci-gate`, the only suite
CI runs (`.github/workflows/security.yml:27`), does not cover `tests/integration`; `test:s00`
does, but CI does not run it. RED was `expected true to be false` on `fallback_minimized`.

### `obs-l3-s06-runner-binding.test.ts`

Both capture expectations move from `error: <raw>` to **code + path**, each with an absence pin
(`toMatchObject` cannot see what is missing) and a marker-string check over the serialised
envelope. The gateway case also proves the transport's own `cause` text no longer reaches the
sink, which the raw-error envelope carried straight through.

Its third red case was unrelated and **predates this merge**: the case's private
`@debateai/register` stub had fallen behind `main.ts`, which since Task 11 imports
`assertHostedCostEnvelopesSealed`. ESM links the whole graph before any body evaluates, so the
stub failed at LINK time and the install-first ordering pin was measuring nothing at all. One
line. The file is **6/6** — against Task 9's measured 2 passed / 4 failed on its base.

## 5. Two failures the merged tree exposed — fixed, never listed

### 5.1 `sup-06-no-zone-limiter.test.ts` — a semantic conflict with no marker

`dev`'s vacuous-assertion sweep (`bcb2adb2`) had found the `indexOf` ordering assertion vacuous —
a missing declaration gives `-1`, which is less than anything — and added a presence pin, written
with `dev`'s spelling `const supportPool = createPool(environment.SUPPORT_DATABASE_URL)`. This
line's DL7-F7 had independently wrapped that same declaration in `boot.hold(...)` so an early
boot failure cannot leave the pool un-zeroed. Neither diff touched the other's line, so git
merged both cleanly and produced a guard pinning a spelling the product no longer has.

Both survive: the anti-vacuity pin is re-fitted to the boot-held declaration, and **one constant
now feeds the presence assertion and the ordering comparison**, so the needle can never again
drift away from the thing whose position is being compared. This is the class `DEV-SYNC-2026-09-22`
§4.1 records (`compareCodeUnits`) — the second instance in two merges.

### 5.2 `text-control-bytes.test.ts` — two raw NUL bytes

`tests/unit/v30-support-provider.test.ts:330-331` carried two literal control characters inside a
`join` separator where the escape was meant. **Not caused by this merge** — the file is this
line's own (Task 12). It surfaced because SYNC2 correctly DELETED the `text-control-bytes`
known-red entry (`dev` had fixed `dev`'s own two bytes in `6947fab9`), and that entry had been
covering this file too. Exactly the rot the list's header warns about: an entry that outlives the
defect it was written for hides the next one. Both escaped; the escape parses to the identical
value, so the two assertions are unchanged.

## 6. The renamed known-red entries: the real cause is the TOOL

SYNC2's record said `dev`'s title template "dropped the quotes around the two names". Measured
and false:

- `git log 7bae9806..cbf1b281 -- tests/architecture/role-token-map.test.ts` is **empty**;
- the template `it.each(expected)("$surface binds its $role role", …)` is **byte-identical** at
  both ends of the range.

The rename came from **vitest 4.1.10 → 5.0.1** (`dev`'s D78). Vitest 5's title formatter returns
a string value as itself; 4.x routed it through `inspect()`, which quoted it. So taking D78
renamed **every `$prop`-interpolated test title in the repository whose substituted value is a
string** — all at once, in one dependency bump.

**How many, stated as a FLOOR and not a census.** A scan for `.each(…)("…$prop…")` finds **at
least 52 such templates across 12 files**, the largest being `s1-1-depth-contract.test.ts` with
38, and including `s5-session-http.test.ts`, `s7-authorization.test.ts` (`$method $url`),
`support-kb.test.ts` (`$name`, `$filename`), `v2ui-pages.test.ts`, `role-token-map.test.ts`,
`api.test.ts`, `t17-envelope.test.ts`, `obs-agent-01-runtime.test.ts`,
`obs-agent-01-restart-lifecycle.test.ts`, `obs-agent-03-defect-detectors.test.ts` and
`dev-deployment-register.test.ts`. It is a floor in both directions and deliberately not
resolved further: the scanner only sees titles it can reach from the `.each(` call, and only
templates whose substituted value is a *string* actually renamed — numbers and objects went
through `inspect()` before and after. An exact count would need the run itself, and nothing here
turns on it.

**The first draft of this section said "7 templates in 5 files", and that was wrong** — it came
from a single-line grep that could not see a multi-line `.each`, reported as though it were the
whole population. The correction matters less for the number than for what the number is for:
the blast radius is *large*, and the reason the known-red list is nevertheless correct today is
narrow and lucky — **`role-token-map` was the only renamed file with entries on the list.**

The entries are unchanged; the SOURCE NOTE is corrected in both places that carry it, so a future
re-baseline looks at the runner rather than at `dev`'s history. **The general lesson belongs with
it:** a test-runner upgrade can rename every templated title in one step with no diff anywhere to
read, and a known-red entry that matches no test name neither fails nor reports stale — it simply
stops meaning anything while the gate calls the same rows NEW. A control for unmatched entries
remains unbuilt (§9).

Not corrected: the same sentence in the SYNC2 seat's `task-1-report.md` §8, which lives in
another worktree this branch may not touch.

## 7. DL4-F3's missing pin

The SYNC2 review found the re-seat unpinned, and it was right. Every existing case hands
`assertAttemptAllowed` to `OpenAICompatibleProviderGateway` itself
(`tests/unit/provider-gateway-backoff.test.ts:71, :84`), so the suite proved the gateway HONOURS
a hook and nothing about whether the product SUPPLIES one. Had SYNC2 dropped the re-seat, the
whole suite would have stayed green while the run ceiling went back to being consulted once per
CALL instead of once per ATTEMPT — a refused run able to keep retrying inside a single call,
which is the spend DL4-F3 exists to bound.

RED was **measured, not reasoned**: with the hook replaced by `undefined` at
`apps/runner/src/index.ts:5678`, the two new cases fail and **all six pre-existing cases stay
green** — the gap itself, shown. Source restored; 8/8.

`createPostgresProviderGateway` opens a `Pool`, a content lease and a ledger before it reaches the
hook, and no pool-free harness for it exists anywhere in the repository, so this is a
source-structure pin rather than a driven one — the same reasoning Task 11 recorded for
`WalkingSkeletonRunner`, and for the same reason: a private test double of that size rots unseen.
It is written so it cannot be vacuous. It locates the factory, asserts the anchors it measures
against are present (the delegating `http.call({`, the `OpenAICompatibleProviderGateway`
construction, and the `leasedRunId` binding the hook must close over rather than re-reading
`request.runId`), and a sibling case proves its own failability against the exact mutation it
exists to catch.

## 8. `pnpm keys:rotate-kek`

Task 6 built the rotation and three documents named the command — the CLI's own header,
`packages/crypto/SECRET_STORE_LAYOUT.md` and the VPS runbook — but the script was deferred until
after the sync, so an operator following the written procedure after a suspected master-key
exposure got "Command not found". One line, the sibling shape (`tsx <path>`), no change to
engines, dependencies or the lockfile.

RED first, beside the decision logic it names:
`expected undefined to be 'tsx apps/runner/src/rotate-kek-cli.ts'`. The row pins the NAME the
documents use against the CLI the rest of that file drives, plus the sibling invocation shape so
it cannot drift into another runner. 28 → 29 passed.

The two sentences that said the script did not yet exist are corrected. The VPS runbook is
untouched: its fenced `systemd-run` block runs the spelled-out form, which still works verbatim,
and `vps-deployment-baseline.test.ts` pins that path.

## 9. Verification

Every command was run in `dialectical-engine/` on this host after the merge, with
`ps -Ao pid,etime,command` checked first for each heavy run.

| Check | Command | Result |
|---|---|---|
| Lockfile consistency | `pnpm install --frozen-lockfile` | → `Already up to date`. No package was too young; no exclusion was added |
| Contract generation | `pnpm run generate:contract` | → clean |
| Typecheck | `pnpm run typecheck` | → **0 errors** |
| Acceptance project | `pnpm exec tsc --noEmit -p acceptance/tsconfig.json` | → **0 errors** |
| Known-red gate | `pnpm run test:ci-gate` | → **`CI_KNOWN_RED_GATE new=0 known=5 stale=0`** (run twice; the quoted line is the second, on a verified-quiet host) |
| Advisories | `pnpm audit --audit-level=moderate` | → **No known vulnerabilities found** |
| Advisories, stricter | `pnpm audit --audit-level=low` | → No known vulnerabilities found |
| UI production build | `pnpm --filter dialectical-engine-v2ui build` | → GREEN, `AUTH_PRODUCTION_ROUTES_VERIFIED=apps-ui:/login,/sign-up,/verify-email,/enroll-mfa` |
| UI security smoke | `node tests/integration/s5-ui-security-smoke.mjs` | → PASS (live 200 + 404 nonce CSP, fallback CSP, static API CSP, no image optimizer, trusted-proxy client ip, upgrade teardown) |
| UI node suite | `pnpm --filter dialectical-engine-v2ui test` | → **132 / 132**, 0 failed (SYNC2 recorded 130/0; this branch adds two) |
| The shape scanner, the capture guard, the floors | `pnpm exec vitest run tests/architecture/packet-read-through-the-frame.test.ts tests/unit/runner-hatchet-task-input.test.ts tests/architecture/dependency-floors.test.ts` | → 3 files, **47 / 47** |
| The S06 binding | `pnpm exec vitest run tests/integration/obs-l3-s06-runner-binding.test.ts` | → **6 / 6** (Task 9's base: 2 passed / 4 failed) |
| The per-attempt hook | `pnpm exec vitest run tests/unit/provider-gateway-backoff.test.ts` | → **8 / 8** (6 before; the two new are §7) |
| The rotation command | `pnpm exec vitest run tests/unit/rotate-kek.test.ts` | → **29 / 29** (28 before) |
| The reconciled failures | `pnpm exec vitest run tests/unit/text-control-bytes.test.ts tests/architecture/sup-06-no-zone-limiter.test.ts tests/unit/v30-support-provider.test.ts` | → 3 files, **37 / 37** |
| The gate's own tool | `pnpm exec vitest run tests/architecture/ci-known-red-gate.test.ts` | → 17 / 17 |

### Does vitest 5.0.1 clear the vitest advisory, and is the floor row still correct?

**Yes, and yes — the row stays exactly as it is.** The advisory is GHSA-82fw-gwwq-j7x9 (path
traversal, dev-only), recorded in DL6-F1 against `vitest` / `@vitest/mocker@4.1.10` and patched in
4.1.11. `pnpm audit --audit-level=low` is clean on this tree and there is no `vitest` override in
`pnpm-workspace.yaml`, so nothing is masking the result.

`tests/architecture/dependency-floors.test.ts` keeps `vitest: (v) => compare(v, "4.1.11") < 0`
unchanged. **A floor names the version an advisory was fixed in, not the version installed**; its
job is to refuse a future resolve that falls back below the fix. Raising it to 5.0.1 would confuse
those two things, and retiring a satisfied floor buys nothing and drops the guard. The row's
comment — that `@vitest/mocker` ships in lockstep and is covered because scoped names are quoted
in the lockfile and so miss the unquoted resolver — was re-checked on this tree and still holds:
`vitest@5.0.1` unquoted, `'@vitest/mocker@5.0.1'` quoted, same version, and the only direct
declaration is the root manifest's `"vitest": "5.0.1"`.

## 10. Open items

1. **`task-1-report.md` §8** still carries the corrected-away claim that `dev` renamed the
   role-token-map entries (§6). It lives in the SYNC2 seat's worktree, which this branch may not
   touch; the coordinator owns it.
2. **A control for unmatched known-red entries.** SYNC2 raised it and §6 sharpens it: an entry
   that matches no test name in a run neither fails nor reports stale. `tools/ci-known-red.mjs`
   could report unmatched entries — and after §6 the case is stronger, because a test-runner
   upgrade can produce dozens at once with no diff to read. Not built here; it belongs to whoever
   owns that tool.
3. **The redactor's input allowlist is now a shared vocabulary** (§4). Adding `path` was correct,
   but the episode shows the allowlist and the envelope builders can drift apart silently. A
   structural pin — every key any shipped envelope builder can emit is in `INPUT_ALLOWLIST` —
   would close the class rather than this instance. Out of scope here.
4. **CI runs one suite, and it is not the one that covers `tests/integration`.**
   `.github/workflows/security.yml:27` runs `pnpm run test:ci-gate`, which is
   `tests/unit tests/architecture` only. `test:s00` (`package.json:15`) does cover
   `tests/integration` — but nothing in CI invokes it, so in practice those files gate nothing
   and are run only when someone remembers to. That is why both S06 defects (§4) reached a
   merged tree, one of them a stale stub that had made a security ordering pin vacuous since
   Task 11. The new unit row covers the redaction joint specifically; the general gap stands,
   and the cheapest close is a CI step that runs `test:s00` — a decision for whoever owns the
   workflow, since it changes CI's runtime.
5. Everything `DEV-SYNC-2026-09-22.md` §8 left open is unaffected by this merge, except its item
   1 (the RSS row, fixed here by Task 3 and now recorded as such in the list) and its item 2 (the
   three capture sites, routed here — §4).
