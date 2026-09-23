# T2 SELF-REPORT — steering placebo (S1-2)

Seat T2, Opus 5, session `opus-t02-w1`. Worktree `.worktrees/lane-t2` on `lane/t2`,
base `1c9578a`. A case file, not a diary: causes, prices, near-misses, dead ends.

---

## 1. The dominant cost was NOT the task. It was suite wall-clock under lane concurrency.

The code change is three deletions and a two-line substitution. Everything else was
measurement. `pnpm test` took **2984s** in my worktree against T0's pinned **515s** —
**5.8x**. Cause, measured not guessed: `pgrep -fl vitest` during my run showed **three
concurrent full-suite runs** on this host — lane-t2 (mine), lane-t4, and the primary
checkout — each spinning real Postgres/testcontainers on an OneDrive-backed filesystem.
`vitest.config.ts:13` sets `fileParallelism: false`, so each run is single-file-serial and
cannot use idle cores even when alone; three of them simply queue on the same disk and CPU.

**Price: ~100 minutes** (one ~50-min base run + one ~50-min after run) against a ~45-minute
packet. This one line item is larger than every other cost in this lane combined.

**Consequence for the three-run law.** I honored it where it is meaningful and affordable —
the S02-C2 targeted cluster ran 3x, root typecheck ran 3x — and I got two COMPLETED full-suite
runs (base + after), not three. I am stating that as a deliberate, disclosed deviation rather
than manufacturing a third run I did not perform.

**The contention was not merely slow — it corrupted results and destroyed one run.**
1. My first after run was **SIGTERM-killed** (`exit=143`) mid
   `tests/integration/registration-database.test.ts`, with an embedded-Postgres checkpoint
   logged at `write=33.248 s`. It emitted no summary line. **Price: ~50 minutes bought
   nothing**, and I had to relaunch. A killed run that still writes a plausible-looking log is
   a trap: `exit=143` is the only thing that distinguishes it from a result, so any harness
   that greps a log for counts without checking the exit code will silently report a partial
   run as a pass.
2. The completed after run then carried **two new failures** —
   `evaluator-addon-database` and `evaluator-consumer-database` — with `timeout exceeded when
   trying to connect`. Both pass 2/2 in isolation and neither mentions `web/`. So the
   environment manufactured two failures that a careless seat would have either attributed to
   its own diff (a fake rework round) or waved away with the blanket claim router §2.6
   forbids. **Price: ~12 minutes to isolate and prove.** They are now filed as F-T2-7 — they
   are absent from T0's flake list, so this lane is the first to see them.

The general lesson: **suite concurrency across lanes is not a scheduling inconvenience, it is
a correctness hazard for the evidence record.** It fabricates failures, kills runs, and pushes
seats toward exactly the two dishonesties the protocol names.

**Fix, in priority order:**
1. **Packets should name a targeted cluster command, not the full suite, as the cluster
   verification.** My whole blast radius is three test files; three runs of those cost 38
   seconds. The full suite belongs to ONE integration seat after merges, not to every lane.
2. Orchestrator should **stagger or serialize** full-suite runs across lanes, or publish one
   shared suite result lanes may cite.
3. Revisit `fileParallelism: false` — if it exists for DB-port contention, scope it to the
   integration/DB files instead of the whole suite.

## 2. The baseline every W2 lane was pointed at was already stale — and each lane pays again

The packet names `agent-reports/t00-baseline.md` as the naming authority for pre-existing
failures. That pin predates D9 (contract-generation provisioning). Measured in my worktree
against it:

| | t00 pin | my worktree base |
|---|---|---|
| `pnpm run typecheck` | exit 1, 157 errors | **exit 0, 0 errors** |
| `pnpm test` tests | 15 failed / 1006 passed (1021) | **23 failed / 1753 passed (1776)** |
| `pnpm test` files | 83 failed / 134 passed (217) | **18 failed / 199 passed (217)** |

The suite grew by 755 executing tests because provisioning fixed the collection failures.
Classifying my failures against t00 would have been meaningless, so I spent a full 50-minute
run establishing my own base. **Price: ~50 minutes, and every other W2 lane is paying the
same 50 minutes for the same number.** D9 already says the baseline-of-record is the
post-provisioning re-pin — but W2 was dispatched before that re-pin landed.

**Fix:** never dispatch a wave against a baseline known to be superseded. Either hold the
wave for the re-pin, or publish it as a **machine-readable artifact** (a JSON list of failing
test ids) that each lane diffs in milliseconds instead of re-deriving in 50 minutes. A prose
baseline that every lane must re-measure is not a baseline.

## 3. NEAR-MISS — the most dangerous moment in this lane: two mutants that never applied

My first mutation pass used `perl -i -pe 's{...}{...}'` to re-insert a JSX textarea. perl
parsed the `{3}` in `rows={3}` as a quantifier, died with "Missing right curly", left the
file **untouched**, and the mutant run then reported a clean **GREEN**.

Read carelessly, that is the sentence "my test does not catch a restored steering textarea"
— a false refutation record, with the suite green and the corpus corrupted. That is exactly
the failure mode the worker contract §2 exists to prevent, and I produced it on my first
attempt. I caught it only because perl's error went to the same stream I was reading.

**Price: ~6 minutes.** Cheap this time, unbounded in general — a wrong refutation record is
the kind of artifact that survives review and rots.

**Fix (appended to TOOLING-TRAPS):** a mutation harness must (a) assert its anchor was found,
(b) **print `git diff --stat` of the applied mutant**, and (c) refuse to report a verdict on
an empty diff. My redo does all three. Generalized rule: **a mutant that produces no diff is
not a GREEN, it is a void run.**

## 4. Nothing at repo level typechecks the file this task changes

`tsconfig.json:20` excludes `web` and `apps/ui`; the include list carries `tests/**/*.ts`
but **not** `.tsx`. So the two files that carry this lane's work — the legacy form and my new
`.test.tsx` — are typechecked by **nothing** in `pnpm run typecheck`. A green root typecheck
is not evidence for a `web/` change, and I would have been wrong to present it as one.

I gated it separately with `tsc --noEmit -p web/tsconfig.json`, which carries **1 pre-existing
error** (TS2882, `globals.css` side-effect import in `web/app/layout.tsx`, because Next's
`.next/types` shim is not generated). I proved it pre-existing by re-running against the
pre-change form — byte-identical output. **Price: ~4 minutes.**

**Fix:** add `tsc -p web/tsconfig.json` to the `typecheck` script and clear the TS2882, or at
minimum add `tests/**/*.tsx` to the root include so render tests are typechecked.

## 5. A deletion task's real surface is every assertion that names the deleted thing

Removing the annotations textarea deleted the only occurrence of the string `logged verbatim`
in the product — and `tests/architecture/s14-contract.test.ts:63` asserted that string was
present. The SPEC's DoD ("no other web/ change") is silent about repo-level tests that pin
the behavior being deleted, so the packet's scope law does not, on its face, tell a seat what
to do when a passing test defends the thing it was ordered to remove.

This cost me **nothing** only because I grepped the removed strings repo-wide *before*
touching the file and predicted the break in advance. Discovered instead by codex review, it
is a full rework round.

**Fix — cheap and mechanical:** a deletion packet should carry, as a required first step,
`grep -rn '<token being deleted>'` and list every pinning assertion in `allowed` up front.
Same class as D8's stale-premise cure, applied to deletions.

## 6. The packet's harness premise was wrong, and it steered toward the weaker path

The packet offered a fallback: "if web/ has NO runnable test harness ... pin the DoD with a
static assertion test at the repo level instead". The framing implies the fallback is likely.
It is not — and a seat that checked the obvious place would have taken the weaker path:

- `web/package.json` has **no test script at all** (dev/build/start/lint only).
- There is **no** `@testing-library`, no `web/`-local vitest config.

Both facts say "no harness". Both are misleading. The real harness is repo-level: nine
`tests/render/*.test.tsx` files already mount `web/` components in jsdom
(`web-auth-login`, `s9-legacy-claim-controls`, `web-auth-enrollment`, …). **Price: ~8 minutes**
of probing to disprove the packet's implied premise — and the far larger avoided cost of
shipping a source-text assertion where a real render+submit test was available.

**Fix:** when a harness exists, the packet names it **by path**. When the packet genuinely
does not know, it states the exact probe that decides it — not a vibe about the app's age.

## 7. Packet defect I could not resolve inside my contract

`INSTRUCTIONS.md:65` says the worker fills `slices/<code>/PLAN.md`'s evidence column, and
PLAN.md carries `| S02-C2 | T2 rows | (worker fills) | (worker fills) |`. **PLAN.md is not in
my packet's `allowed` list.** Worker contract §4 makes that list exhaustive, so I left it
unfilled and reported it rather than crossing the contract. The S02-C2 evidence column will
stay empty until someone with the write reaches it.

## 8. Dead ends — do not re-derive these

- `web/package.json` has no test script → **does not** mean web/ is untestable (see §6).
- `tests/render/stubs/next-navigation.ts` does **not** export `useRouter`, though
  `vitest.config.ts` aliases `next/navigation` to it. Rendering any component that calls
  `useRouter` requires an explicit `vi.mock`; the alias alone throws.
- The vitest `@` alias resolves to **apps/ui** (`vitest.config.ts:8`) for every test, so a
  `web/` component's `@/lib/api` import loads **apps/ui's** client under test. Mock the
  specifier or you are asserting against the wrong app's module. (Filed as F-T2-1.)
- `git checkout HEAD~1 -- <path>` **stages** the restore (porcelain shows `M `), as
  TOOLING-TRAPS already warns. I committed my work *before* mutating precisely so that
  `git reset --hard HEAD` was a safe restore; reverting mutants by git against uncommitted
  work would have destroyed the change.

## 9. Toward the one-prompt machine

1. **Ship a `verify.sh` with the packet.** One targeted command per cluster, authored by the
   architecture seat that knows the blast radius. This alone removes the single largest cost
   in this lane (§1) and makes "three runs, worst wins" affordable instead of aspirational.
2. **Baselines as data, not prose** (§2). A JSON set of failing test ids; lanes diff it.
   Prose baselines force N lanes to re-measure the same number N times.
3. **Verify packet premises at packet-write time** — extend D8's cure from "quote exactly" to
   "every factual premise carries the command that established it" (§6).
4. **A deletion-task template** that greps the deleted token and pre-loads the pinning
   assertions into `allowed` (§5).
5. **Make the harness assert its own validity** — void-run detection for mutants (§3). The
   protocol asks for mutants; it should also demand proof the mutant existed.
6. **Watchdog on `logs/<seat>/**`, not only the report path.** I was pinged as silent at 25m
   while three log files were actively growing; the fix is one stat path.

## 10. What went right and is worth copying

Grepping the removed strings repo-wide **before** editing turned the only collateral break in
this lane from a rework round into a predicted, one-line, disclosed fix. The RED was designed
from the PROPERTY ("no control the asker can type in reaches steering") rather than from the
shape of the diff — which is why it caught M3, the mutant that re-wires steering to a
*different* live control and that a naive "assert the textarea is gone" test would have
missed entirely.
