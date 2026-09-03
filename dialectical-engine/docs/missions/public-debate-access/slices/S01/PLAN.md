# PLAN — S01 Public publication envelope + publish path

> **For agentic workers:** Architecture seat fills steps. Requirements seat
> authored only the SPEC-trace skeleton and the quantifiability law.
> REQUIRED later: `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` at programming time.

**Goal:** Widen the public publication envelope and publish path so new
snapshots carry the argument tree and public-safe honesty fields, without
breaking old snapshots.

**Spec:** `docs/missions/public-debate-access/slices/S01/SPEC.md`

**Status:** STEPS AUTHORED by ARCH-01 (Claude, 2026-08-29).

## Quantifiability law (binding on Architecture)

- Every step is markable done / not-done by a stranger with no judgement call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test · file surface.
- Every PLAN step traces to a SPEC sentence; every SPEC requirement has ≥1 step.
- Three-run law: each cluster's verification command runs three times; the
  worst run is the verdict (green-green-red = RED).
- UNVERIFIED is a valid, respected answer on any claim.

## MEASURED ground truth this PLAN rests on (Architecture's own probes)

**REDACTION-CORRECTNESS thread, round 2 (`t_83a9eb08`) note: every line
range in this section is a DATED round-0 snapshot, true when first
measured, on the file as it stood before this PLAN's own S01-C1-1
relocation and S01-C2-1 projection landed.** `packages/contract/src/index.ts:262-279`
and `:443-476` specifically no longer show `PublicDebateSchema`/`NodeSchema`/
`EdgeSchema` (own re-run this round: 262-279 now shows `PublicDebateListSchema`/
`DeploymentSchema`; `NodeSchema`/`EdgeSchema` now start at 424/445). This
section is a historical record of the ORIGINAL discovery, not a live gate
— left as-written for that reason (rewriting it would misrepresent what
was actually measured at round 0), annotated here so a reader does not
mistake a citation below for current fact. The TDZ finding and its fix
(S01-C1-1) are unaffected — they describe a declaration-ORDER relationship
(`PublicDebateSchema` must not precede `NodeSchema`/`EdgeSchema`), which
the current file still correctly maintains (own re-run: `PublicDebateSchema`
now at line 460, strictly after `NodeSchema`'s 424 and `EdgeSchema`'s
445) — only the specific LINE NUMBERS cited alongside that finding are
stale, not the finding itself.
- `packages/contract/src/index.ts:262-279` — `PublicDebateSchema` is
  `.strict()`, nested `answer` is `.strict()`, current fields exactly:
  `public_ref, author_pseudonym, question, published_at, answer{terminal,
  verdict, verdict_available, confidence_band, summary_segments, badges,
  residual_objections, reversal_point, as_of}`. READ, own read.
- `packages/contract/src/index.ts:443-476` — `NodeSchema` (443-461) and
  `EdgeSchema` (464-476) are declared **AFTER** `PublicDebateSchema`
  (262-279). READ, own read. **Load-bearing structural trap (new finding,
  not in INTAKE):** a `const` reference to `NodeSchema`/`EdgeSchema` inside
  `PublicDebateSchema`'s initializer at line 262 would throw
  `ReferenceError: Cannot access 'NodeSchema' before initialization` at
  module load — this is a temporal-dead-zone failure, not a type error, and
  it fails at server boot, not at a call site. Step S01-C1-1 below is the
  fix. **PRICE if undiscovered:** a coding seat adding `nodes:
  z.array(NodeSchema)` in place without relocating would get a boot crash
  with a confusing stack trace, likely mis-diagnosed as a circular-import
  bug rather than a declaration-order bug (`NodeSchema` and
  `PublicDebateSchema` are in the same file — no import is involved).
- `packages/contract/src/index.ts:495-496` — `AnswerSchema.nodes` /
  `.edges` (`z.array(NodeSchema)` / `z.array(EdgeSchema)`, both required,
  non-optional) confirm S01's ground truth. READ, own read.
- `packages/contract/src/index.ts:443-462` — `NodeSchema` fields:
  `node_id, claim, way_of_knowing, base_score, final_strength,
  provenance_ref, maker_lineage, review, locator, stranger_restatement,
  defeater_refs, defeater_exhaustion_marked, disagreement, condition_marks,
  abstention, staleness_state, relevant_as_of`. None match the R2 forbidden
  identity-carrier list. READ, own read.
- `apps/api/src/publications.ts:153-169` — `publish()` builds the
  `publicDebate` literal by hand, field-by-field, from `input.answer`. It
  currently drops `nodes`/`edges` and everything past `as_of`. This is the
  exact edit site for R1/R2. READ, own read.
- `apps/api/src/publications.ts:301-326` — `readPublicDebate`: `try {
  PublicDebateSchema.parse(...) } catch { return null }` at 309-321. READ,
  own read.
- `apps/api/src/index.ts:724-737` — handler: `debate === null ?
  reply.status(404)... : reply.send(...)`. READ, own read.
- **MEASURED (own command, decorrelated from REV-01's inherited claim):**
  live dev server, one real publication
  `d89b38a4-f188-4840-94bd-a2dece92f275`:
  `curl -sk 'https://localhost:3000/api/v1/public/debates/d89b38a4-f188-4840-94bd-a2dece92f275'`
  → full old-shape JSON, no `nodes`/`edges`. This is the exact old-shape
  fixture used in the RED test below.
- **MEASURED (own three-trial probe, own script, imports the REAL
  `PublicDebateSchema` from `packages/contract/src/index.ts`, not a
  byte-for-byte replica):** ran from repo root via
  `node_modules/.bin/tsx`, script written, executed, and deleted in the
  same session (`git status --porcelain` confirmed clean after). Results:
  `A current-schema x live-old-shape: [OK, OK, OK]` ·
  `B required-widen x live-old-shape: [THREW, THREW, THREW]` ·
  `C optional-widen x live-old-shape: [OK, OK, OK]` ·
  `D full-path-replay required-widen x live-old-shape:
  {"status":404,"body":{"error":"DEBATE_NOT_FOUND"}}`. This independently
  reproduces REV-00/REV-01's finding: the mechanism is REQUIRED KEYS +
  catch→null + handler null→404, not `.strict()` — an OPTIONAL widen is
  the safe shape.
- `tests/unit/s8-publication.test.ts:30-46` — the existing `publicDebate()`
  test fixture is byte-identical in shape to today's `PublicDebateSchema`
  (no tree fields). It is reused verbatim as the RED test's old-shape
  input in S01-C1-3 below (no new fixture invented). READ, own read.
- `tests/unit/s8-publication.test.ts:602-611` — existing forbidden-carrier
  test adds each forbidden key as a **top-level** sibling of `public_ref`
  (not nested inside `.answer`). Unaffected by this PLAN (no forbidden key
  is added; new fields are `nodes`/`edges`/`tree_included`, none forbidden).
  READ, own read.
- `tests/architecture/s8-publication-contract.test.ts:120-138` — the
  standing forbidden-carrier + banned-route test. My 3 new field names
  (`nodes`, `edges`, `tree_included`) are not in its forbidden list — this
  test needs **no edit** for S01. READ, own read. (Its later block,
  140-175, is an S02/S03 concern — see those PLANs.)

## Architecture decisions (see DECISIONS.md for the formal entries)

1. **Widen via three new OPTIONAL fields on the nested `answer` object:**
   `nodes: z.array(NodeSchema).optional()`, `edges:
   z.array(EdgeSchema).optional()`, `tree_included: z.boolean().optional()`.
   `tree_included` is an explicit version discriminator (SPEC allows
   "optional/nullable and/or version-discriminated") rather than relying on
   `nodes` array-presence alone, because an implicit signal conflates "no
   tree because this is a legacy snapshot" with a hypothetical
   zero-node tree — the explicit boolean removes that ambiguity for S02's
   UI and S04's audit. New publishes always set `tree_included: true`.
2. **No other new top-level honesty fields on `PublicDebateSchema.answer`
   in this PLAN.** Node-level honesty (`way_of_knowing`, `base_score`,
   `stranger_restatement`, `defeater_refs`, `condition_marks`, `abstention`,
   `staleness_state`) already flows through via the widened `nodes` array —
   that covers S02 R3's node-card requirement. Answer-level-only sections
   the owner drawer renders (`condition_mark_records`, `value_hinges`,
   `shadow_suppressions`, `builds_on_previous`, plus the R2-forbidden
   `memory_disclosure`/`cost_envelope`/`ledger_digest_handle`/
   `inspection_handle`/`tier_provenance_ref`) stay OUT of the public
   envelope for this PLAN — S02's public honesty drawer renders them as
   typed absence, not as a fabricated projection. Reasoning: these are
   signals about the answer's own generation process, not about the
   debate's substance (verdict/arguments) that V's brief named; widening is
   additive and reversible later under a new SPEC version, narrowing after
   shipping is not. `risk_tier`/`tier_source` are also withheld even though
   neither is individually on the forbidden list, because they are
   meaningless without `tier_provenance_ref`. **REWORK ROUND 1 (N7,
   `t_8fc983bc`):** this used to say "Row 4, open" — stale. **V CLOSED Row 4
   on 2026-08-29: both `cost_envelope` and `tier_provenance_ref` stay
   EXCLUDED**, ratifying this PLAN's original conservative default rather
   than overturning it. `risk_tier`/`tier_source` stay withheld too, now
   for the stronger reason that their one sibling field is permanently
   excluded, not merely pending.
3. **Pre-widening publication policy: disclosed answer-only legacy (option
   c), not migrate/re-encrypt (a) and not require-republish-only (b).**
   This is a technical/engineering-cost call within Architecture's
   delegated authority (packet §4), not a product preference: (a) needs new
   one-off re-encryption tooling touching corpus-key handling — no existing
   migration utility exists in this codebase for republishing snapshot
   content, and building one for exactly 1 row is disproportionate risk for
   the blast radius (INTAKE: total=1); (b) is free in code but depends on
   V manually re-publishing, which the fleet cannot guarantee or verify as
   shipped — R4 forbids a silent gap either way. (c) costs zero backend
   code (already implemented by decision 1's `tree_included` field being
   absent on old ciphertext) and is forward-compatible: if the owner later
   re-publishes, the existing `publish()` path already produces a
   new-shape snapshot with no special-case migration code required.
4. **Relocate `PublicDebateSchema` (and its `export type PublicDebate`
   line) to immediately after `EdgeSchema`'s `export type Edge` line**
   (i.e., between the current `EdgeSchema` and `AnswerSchema` blocks) as a
   pure cut-paste with no logic change, to fix the TDZ ordering trap above.
   `PublicDebateSummarySchema`/`PublicDebateListSchema` stay where they are
   (line 252/281) — neither references `Node`/`Edge`, no ordering conflict.
5. **New mission-specific test file naming:** `tests/unit/pda-s01-*.test.ts`
   (prefix `pda` = public-debate-access) for schema-only tests that don't
   fit naturally into the existing `s8-publication*.test.ts` files, to keep
   this mission's new tests distinguishable from prior-mission `sNN`
   architecture tests. Integration-style publish/read round-trip additions
   extend the existing `tests/unit/s8-publication.test.ts` in place
   (same harness, same fixtures, avoids duplicating mock repository/cipher
   setup).

## Clusters

**REWORK ROUND 4 (PLAN-03, blocking, `t_71699495`): every command below was
rewritten and RUN, not just edited.** Two separate, previously-unrecorded
defects, both found by actually running these commands as this round's
brief required, not by inspection:
1. `vitest 4.1.10` removed the `--reporter=basic` reporter — the flag is
   dropped everywhere below (own reproduction: `npx vitest run
   tests/unit/s8-publication.test.ts --reporter=basic` → `Startup Error:
   Failed to load custom Reporter from basic`, exit 1; the same command
   without the flag → exit 0, 13/13 passed). This is PLAN-03 itself.
2. **Self-caught while running S01-C1's own cluster command, not named by
   this round's brief:** `pnpm exec vitest run <missing-file> <existing-file>
   -t "<pattern>"` does **not** error when one of several file arguments
   does not exist — it silently drops the missing path and runs only the
   file(s) it found. Demonstrated: `pnpm exec vitest run
   tests/unit/pda-s01-envelope-schema.test.ts tests/unit/s8-publication.test.ts
   -t "strictly rejects|old-shape|new-shape"` (the file doesn't exist yet)
   → **exit 0**, `1 passed | 12 skipped (13)` — the "1 passed" is an
   UNRELATED pre-existing test (`strictly rejects owner/internal fields at
   the anonymous boundary`) whose name happens to match the alternation
   pattern; the missing file is never mentioned. This is the exact
   "neighbouring failure mode" this round's brief described for the
   gitignore class, found instead in the multi-file-argument case — a
   cluster command reporting GREEN while the file it exists to verify does
   not exist. Fixed below with a `test -f <path> &&` guard, which correctly
   short-circuits to exit 1 when the file is absent (demonstrated:
   `test -f tests/unit/pda-s01-envelope-schema.test.ts && pnpm exec vitest
   run ... ` → exit 1 today; confirmed the guard does not change behavior
   once the file exists, since `test -f` then simply passes through to the
   real vitest run).

**ACCEPTANCE-COMMAND THREAD, ROUND 2 (PLAN-04, blocking, `t_eade6007`):
the `| grep -qE ...` suffix above and below was itself broken — a THIRD
variant of the same family (round 3: acceptance on a gitignored path;
round 1 of this thread: `--reporter=basic` crashed before running; this:
`grep -q` crashes DURING the run and hides it).** `grep -q` exits on its
FIRST match and closes its end of the pipe; if vitest is still writing
when that happens, it can receive EPIPE/SIGPIPE mid-write — and the
PIPELINE's exit code is `grep`'s, not vitest's, so a vitest crash after
the summary line is printed is invisible to `$?`. **Reproduced myself
before changing anything, in two parts, since the exact EPIPE race is
timing-dependent and did not trigger on every attempt in this
environment (small output, fast grep — consistent with why it can pass
locally and still be a real, Router-verified defect elsewhere), while
the DETERMINISTIC root cause reproduces every time:**
```
$ ( printf 'Tests 5 passed (5)\n'; exit 7 ) | grep -qE "Tests +[0-9]+ passed"
$ echo $?
0
```
A producer that prints a matching summary line and THEN exits 7 (simulating
a post-summary crash) still yields pipeline exit 0 — conclusive,
timing-independent proof that `cmd | grep -q ...`'s exit status can never
reveal a crash in `cmd`, which is the actual defect regardless of whether
the EPIPE symptom itself fires on a given run. **Fix: capture the
command's own output and exit code FIRST via `$(...)`, then grep the
captured string — no live pipe between vitest and grep at all, so there is
nothing to close early and nothing to race:**
```sh
out=$(pnpm exec vitest run <file> [-t "<pattern>"] 2>&1); vt=$?
printf '%s' "$out" | grep -qE 'Tests +[0-9]+ passed'; guard=$?
# pass condition: [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]
```
Validated against all three real outcomes on `s8-publication.test.ts`
(2026-08-29): real pass → `vt=0 guard=0` (GREEN); zero-match `-t` filter
→ `vt=0 guard=1` (correctly RED — `$vt` alone would miss this, exactly
the class round 4 fixed); a genuinely failing test (temporary probe file,
written/run/deleted this session, `git status --porcelain` confirmed
clean) → `vt=1 guard=1` (correctly RED — `guard` alone could theoretically
be fooled by stray matching text, `$vt` alone cannot). **Both checks
required, neither sufficient alone** — this is why the idiom asserts on
both, not either.

**ACCEPTANCE-COMMAND THREAD, ROUND 3 of 3 — FINAL (PLAN-05, blocking,
`t_f910328a`): round 2's guard above is the FOURTH variant of the same
family.** A Grok blind lens was asked to construct a case where the
capture-then-check idiom passes while verifying nothing, and found one;
the Router reproduced it independently. `grep -qE 'Tests +[0-9]+ passed'`
is **unanchored** — it searches the WHOLE capture, not just the summary
line, and vitest prints every SKIPPED test's TITLE on its own line. A
test named so its title happens to contain the substring `Tests <n>
passed` satisfies the guard on a run that executed nothing. **Reproduced
myself before changing anything** (temporary probe file, written, run,
deleted this session, `git status --porcelain` confirmed clean after):
```
$ cat tests/unit/__tmp-pollution.test.ts
test("router B1 probe > Tests 1 passed is in the title", () => { expect(1).toBe(1); });
$ out=$(pnpm exec vitest run tests/unit/__tmp-pollution.test.ts -t "feature-not-written-zzzz" 2>&1); vt=$?
$ printf '%s' "$out" | grep -qE 'Tests +[0-9]+ passed'; guard=$?
$ echo "vt=$vt guard=$guard"
vt=0 guard=0
```
— compound PASSES, while the real summary line reads `Tests  1 skipped
(1)`; the guard actually matched `↓ tests/unit/__tmp-pollution.test.ts >
router B1 probe > Tests 1 passed is in the title`, a test TITLE, not the
summary. Clean control (same file, ordinary title, no pollution): `vt=0
guard=1`, correctly fails — confirming the polluting title, not the
mechanism generally, is what flips it.

**Three changes, each load-bearing, verified by this seat against the
brief's own 7-case hostile matrix before adopting it (not taken on
trust):**
```sh
out=$(pnpm exec vitest run <file> [-t "<pattern>"] 2>&1); vt=$?
sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?
[ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]
```
1. **Anchor** (`grep -E '^[[:space:]]*Tests[[:space:]]+'`, then `tail -1`)
   isolates the ONE summary line from everything else vitest printed — a
   test title can no longer satisfy the guard, because the guard never
   sees titles at all.
2. **Nonzero pass count** (`[1-9][0-9]*`, not `[0-9]+`) rejects a
   hypothetical `Tests 0 passed` summary.
3. **Reject `failed`** (`! grep -q 'failed'`) catches a mixed run — vitest's
   own summary format for a mixed result is `Tests  1 failed | 1 passed
   (2)`, which the FIRST check alone would match (it contains "1 passed"),
   so the second check is not redundant.

Own verification, all 7 cases, temporary probe files written/run/deleted
this session (`git status --porcelain` confirmed clean after each):

| case | expected | old (round 2) | new (round 3), own run |
|------|----------|-----|-----|
| A real pass | PASS | PASS | **PASS** (`vt=0 guard=0`) |
| B vacuous `-t`, clean title | FAIL | FAIL | **FAIL** (`vt=0 guard=1`) |
| C vacuous `-t`, polluted title | FAIL | **PASS (the bug)** | **FAIL** (`vt=0 guard=1`) |
| D real failure | FAIL | FAIL | **FAIL** (`vt=1 guard=1`) |
| E mixed pass+fail | FAIL | FAIL | **FAIL** (`vt=1 guard=1`; own run's actual summary: `Tests  1 failed \| 1 passed (2)`) |
| F nonexistent file | FAIL | FAIL | **FAIL** (`vt=1 guard=1`) |
| G whole polluted file, test genuinely runs and passes | PASS | PASS | **PASS** (`vt=0 guard=0`) |

Matches the brief's own matrix exactly, independently re-derived rather
than copied. Applied to the cluster-table row below and all 8 step-level
acceptance lines that used the round-2 idiom.

**ACCEPTANCE-COMMAND THREAD, ROUND 4 (cap waived by V — V-DECISIONS-PACKET Row 6, not a
free round, the fix must close the CLASS; PLAN-06, blocking, `t_e1208546`): the three
multi-pattern presence arms above are the FIFTH variant of the same family, and it is not
a typo.** `vitest -t` takes a JS **regex** — inside a regex, `\|` is an **escaped literal
pipe character**, not alternation. The patterns above were written `a\|b` only because a
bare `|` breaks a markdown table cell; nothing about that choice changes what `-t` actually
does with the string. **Reproduced myself before changing anything**, both at the JS level
and live against the coding seat's finished worktree (`.worktrees/prog-a-s01/dialectical-engine`,
read-only — no writes made there, no product code, no test files touched):
```
$ node -e "console.log(new RegExp('replay_handle\\|disagreement').test('replay_handle'))"
false
$ node -e "console.log(new RegExp('replay_handle|disagreement').test('replay_handle'))"
true
$ out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts \
    -t "ledger_unknown_ref\|replay_handle\|residual.*handle\|stranger_restatement\|disagreement" 2>&1); vt=$?
$ echo "$out" | grep Tests
      Tests  21 skipped (21)      # ZERO matched — vt=0, guard=1, the arm is UNPASSABLE
```
The affected step-level acceptances still PASSED regardless, because the coding seat named
its real tests to satisfy the broken filter. Confirmed in `tests/unit/s8-publication.test.ts`
(the Router's brief quoted three; a **fourth was self-found** while confirming scope,
produced by this same S01-C3 pattern, at line 958):
```
"publishes the tree|tree survives publish by value without field drift"
"protects ledger_unknown_ref|redact only its abstention value"
"removes residual handle|handle residual marker values from published JSON"
"round-trip|read restores the published public tree"
```
Read against the exclusive-provenance invariant this seat wrote last round: the PASS on
these four step-level acceptances was produced by **the shape of a test's name** — a
string engineered to satisfy a broken filter — not by the behaviour the acceptance claims
to verify. Renaming any of the four titles above to plain English breaks the acceptance
while the feature keeps working; that is the invariant's own definition of a violation, and
this is its first live instance, exactly as the brief said.

**Fix, chosen by the shape of the constraint and applied to the whole class, not
per-instance.** A bare `|` breaks a markdown table cell; a real (unescaped) `|` inside a
vitest `-t` argument is correct JS-regex alternation. The two constraints only actually
conflict *inside a table cell* — nowhere else in this file:
- The 4 step-level `**Acceptance test:**` lines are plain backtick code spans, not table
  cells — a pipe inside a code span does not break rendering, so they are simply
  **unescaped in place** (`\|` → `|`). Verified by RUNNING each corrected command against
  the coder's finished worktree (own runs, 2026-08-29):
  ```
  publish.*tree|tree.*publish            -> vt=0 guard=0, "2 passed | 19 skipped (21)"
  ledger_unknown_ref|redact              -> vt=0 guard=0, "2 passed | 19 skipped (21)"
  residual.*handle|handle.*residual      -> vt=0 guard=0, "1 passed | 20 skipped (21)"
  round.trip|read.*tree                  -> vt=0 guard=0, "2 passed | 19 skipped (21)"
  ```
  Also verified with a temporary probe file of NATURAL, non-contorted titles (written, run,
  deleted this session in the worktree; `git status --porcelain` confirmed clean after)
  that all four patterns match ordinary English phrasing and do not depend on the coder's
  literal-pipe contortion — e.g. `publish.*tree|tree.*publish` matched
  `"publishes the tree without leaking owner-only fields"` alone, no `|` in the title at
  all. This is the load-bearing check: an alternation that only worked on a contrived title
  would just be variant five again, wearing a fix.
- The 5 table-cell sites cannot carry a raw `|` at all, so each cluster's presence-arm
  command is moved out of the table into ONE labeled block below, and every table cell
  references it by label instead of repeating the pattern text. This also closes a smaller
  defect noticed while doing this: the S01-C2 and S01-C3 patterns were previously quoted
  verbatim in **two** separate tables (the compact table below and the detail category
  table further down) — two copies of the same broken string, wrong the same way, that
  would otherwise need fixing twice. One block per cluster is now the single source of
  truth for that cluster's presence-arm command.

```sh
# S01-C1-presence (also usable standalone; see step 5 for the worker's exact final form)
test -f tests/unit/pda-s01-envelope-schema.test.ts && pnpm exec vitest run \
  tests/unit/pda-s01-envelope-schema.test.ts tests/unit/s8-publication.test.ts \
  -t "strictly rejects|old-shape|new-shape"

# S01-C2-presence (round-3 anchored idiom; real alternation, 5 patterns)
out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts \
  -t "ledger_unknown_ref|replay_handle|residual.*handle|stranger_restatement|disagreement" 2>&1); vt=$?
sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?
[ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]

# S01-C3-presence (round-3 anchored idiom; real alternation, 2 patterns, both files)
out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts tests/unit/s8-publication-http.test.ts \
  -t "round.trip|read.*tree" 2>&1); vt=$?
sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?
[ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]

# S01-C4-verify (CLASS-FIX ROUND 1, `t_7539734e`, public-debate-access: this block
# was previously a table cell with `\|` in place of every one of these three shell
# pipes — extracted and run literally as written, it never actually pipes: printf's
# extra arguments get recycled into the "%s" format string instead of reaching a
# second process, so grep/tail never run, and `guard` comes back wrong. No
# grep-internal alternation appears in this one's two patterns, so unescaping is
# unconditionally correct here — nothing to weigh against BRE `\|` semantics.)
out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts -t "legacy" 2>&1); vt=$?
sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?
[ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]
```

Run against the coder's finished worktree, own observed results (2026-08-29):
```
S01-C1-presence: exit 0, Test Files 2 passed (2), Tests  4 passed | 20 skipped (24)
S01-C2-presence: vt=0 guard=0, Tests  5 passed | 16 skipped (21)
S01-C3-presence: vt=0 guard=0, Tests  2 passed | 23 skipped (25)
```
Run against the MAIN tree (not the worktree — S01-C4 is a regression/legacy check,
not a presence arm gated on the coder's new work), own observed results, CLASS-FIX
ROUND 1 (2026-08-29): **escaped form, run exactly as it appeared in the table cell
before this round:** `printf` receives `"$out"`, `|`, `grep`, `-E`, ... as five
literal arguments (the backslash makes bash treat `|` as ordinary text, not the
pipe operator), so `grep`/`tail` never execute as separate processes and `$sum`
comes back as garbage; `vt=0 guard=1` — a **false FAIL** on a case that is a
genuine pass. **`S01-C4-verify` block above, unescaped, same tree, same moment:**
`vt=0 guard=0`, `Tests  1 passed | 24 skipped (25)` — correct, and matches the
regression-baseline category this row already claims (see line ~465's corrected
evidence below).
All three presence arms remain GREEN for the right reason — every one of the matched titles is a real,
distinct new test, not a contrivance (S01-C2 alone accounts for 5 of the 8 new tests named
in its step list; S01-C3 for 2 of its 4).

**Not this seat's file to edit, but the brief asks what the four contorted titles should
become — for the coding seat's own renaming ticket, guidance only, no test file touched
here:**
```
"publishes the tree|tree survives publish by value without field drift"
  -> "publishes the tree without leaking owner-only fields"
"protects ledger_unknown_ref|redact only its abstention value"
  -> "redacts only ledger_unknown_ref's abstention value, leaving the rest of the record intact"
"removes residual handle|handle residual marker values from published JSON"
  -> "strips residual handle marker values from the published JSON"
"round-trip|read restores the published public tree"
  -> "reading a published debate restores the same public tree that was published"
```
Each proposed title still contains the exact substring the corresponding pattern already
matches (verified above against natural, non-contorted phrasing) — renaming to these would
not break the acceptance.

| Cluster | Steps | ONE verification command | File surface |
|---|---|---|---|
| S01-C1 | S01-C1-1..7 (**V RULING, DECISIONS Row 9, `t_a00a162e`**: added C1-6, `.strict()` on `NodeSchema.stranger_restatement`; **V RULING, `t_83df0d9c`**: added C1-7, `PublicNodeSchema` split for `disagreement`) | `test -f tests/unit/pda-s01-envelope-schema.test.ts && pnpm exec vitest run tests/unit/pda-s01-envelope-schema.test.ts tests/unit/s8-publication.test.ts tests/unit/contract.test.ts` — presence arm: **run block `S01-C1-presence` above** (see step 5 for the exact final command once test names are fixed by the worker) | `packages/contract/src/index.ts`, `apps/api/src/publications.ts`, `tests/unit/pda-s01-envelope-schema.test.ts`, `tests/unit/contract.test.ts` |
| S01-C2 | S01-C2-0, S01-C2-0B, S01-C2-1..8 (**REWORK ROUND 2, B2, `t_9322ae7b`**: added C2-7/C2-8, one residual test per open-ended bag) | whole-file regression run **plus a presence arm** (**ROUND 3, Finding 2, `t_f910328a`**, pattern fixed **ROUND 4, `t_e1208546`** — see note below the table): `pnpm exec vitest run tests/unit/s8-publication.test.ts` (regression) `&&` **run block `S01-C2-presence` above** (presence — at least one named new test must have run and passed) | `apps/api/src/publications.ts`, `tests/unit/s8-publication.test.ts` |
| S01-C3 | S01-C3-1..4 (**REWORK ROUND 1, self-caught while re-checking every cluster's step count against N2's pattern**: corrected from "1..3" — S01-C3-4, "confirm no new anonymous route," was always in this cluster's body, undercounted in round 0's table) | whole-file regression run **plus a presence arm** (same fix as S01-C2): `pnpm exec vitest run tests/unit/s8-publication.test.ts tests/unit/s8-publication-http.test.ts` (regression) `&&` **run block `S01-C3-presence` above** (presence) | `tests/unit/s8-publication.test.ts`, `tests/unit/s8-publication-http.test.ts` (read-only regression, no production-code edit expected) |
| S01-C4 | S01-C4-1..2 | **run block `S01-C4-verify` above** (**CLASS-FIX ROUND 1, `t_7539734e`: moved out of this table cell — the previous inline form used `\|` for three real shell pipes, which is BROKEN when extracted and run literally; see the class-fix note above the S01-C1..C3 blocks and this mission's `S03/PLAN.md` for the sibling instances and the general argument**) | `tests/unit/s8-publication.test.ts` (read-only regression + 1 new test, no production-code edit beyond C1/C2) |

**Cluster command categories and their OBSERVED pre-fix results (run
2026-08-29, main tree; S01-C1's substance is COMPLETE per the coding seat —
three 16/16 GREEN runs — and S01-C2's unfiltered suite is 19/19 GREEN;
neither's SUBSTANCE changed this round, only S01-C4's verification
command):**

| Cluster | Category | Observed pre-fix result |
|---|---|---|
| S01-C1 | FEATURE-ASSERTION | **RED**, correctly: `test -f tests/unit/pda-s01-envelope-schema.test.ts` fails (file does not exist), exit 1. Verified this is a real RED, not the vacuous GREEN the unguarded command gave (documented above). |
| S01-C2 | FEATURE-ASSERTION (composite, TWO arms as of round 3 — see note below) | **Regression arm GREEN-BUT-INCOMPLETE, not a false pass** (unchanged from round 4): `pnpm exec vitest run tests/unit/s8-publication.test.ts` → exit 0, 13/13 passed today — honest, not vacuous, no `-t` filter/missing-file risk, GREEN because the file's 13 PRE-EXISTING tests still pass while the cluster's new `it()` blocks aren't written yet. **Presence arm — pattern fixed ROUND 4, `t_e1208546`, was UNPASSABLE before this round (round-3 escaped-pipe pattern matched zero real tests, `21 skipped (21)`, against the coder's now-finished implementation — see the class fix above the compact table).** Current pattern (**run block `S01-C2-presence` above**), against the coder's finished worktree: `vt=0`, `guard=0`, `5 passed \| 16 skipped (21)` — correctly GREEN, and GREEN for a real reason: five distinct new tests matched, not a contrivance. Against the main tree (still pre-S01-CODE) the same block is correctly RED: `13 skipped (13)`, `vt=0 guard=1`. Together: the cluster's ONE command is GREEN only once BOTH arms pass — the regression arm alone could no longer be mistaken for cluster completion. |
| S01-C3 | FEATURE-ASSERTION (composite, TWO arms as of round 3 — see note below) | **Regression arm GREEN-BUT-INCOMPLETE, same reasoning as S01-C2** (unchanged from round 4): exit 0, 17/17 passed today (13 + 4), no vacuous-pass risk. **Presence arm — pattern fixed ROUND 4, `t_e1208546`** (**run block `S01-C3-presence` above**): against the coder's finished worktree, `vt=0`, `guard=0`, `2 passed \| 23 skipped (25)` — correctly GREEN. Against the main tree (still pre-S01-CODE) the same block is correctly RED: `13 skipped (13)`, `vt=0 guard=1`. |

**ACCEPTANCE-COMMAND THREAD, ROUND 3, Finding 2 (non-blocking, `t_ffcb2df1`), sets WHEN not
WHETHER — resolved this round, not merely scheduled:** S01-C2 and S01-C3's cluster commands ran
the whole file with no filter, which is the right shape for a REGRESSION guard (it must see every
test, not just the new ones) but the wrong shape ALONE for a FEATURE-ASSERTION's own category —
before the new tests exist, the whole-file run is satisfied entirely by the PRE-EXISTING suite,
so a worker could report the cluster's ONE command green without ever having added the cluster's
own subject matter. Distinct from Finding 1 (the guard reading the wrong TEXT within one run) —
this is the command's SCOPE being wider than its claim, across two separate runs conflated into
one. Fixed by adding a second, `-t`-filtered PRESENCE arm to each cluster's ONE command (chained
with `&&`), reusing each cluster's own already-established step-level `-t` patterns — not a new
mechanism, an existing one applied at the cluster level where it was previously missing. The
`test -f <path> &&` guard from S01-C1-5 was the other option the brief named; not used here
because S01-C2/C3's gap is TEST ABSENCE within an existing file, not FILE absence — `test -f`
cannot see inside a file, and a filtered vitest run already does, exactly.
| S01-C4 | FEATURE-ASSERTION | **RED, correctly, on the round-3 ANCHORED capture-then-check idiom.** Re-run 2026-08-29 (main tree, still pre-S01-CODE — the coding seat's work lives in a worktree the Router syncs, not touched by this thread): `vt=0`, `guard=1`, summary `Tests  13 skipped (13)` — compound false, RED, correctly. Same observable result as round 2's unanchored version on THIS input (this file's other test titles don't happen to contain the polluting substring), but round 2's version was still structurally vulnerable to a title that did — see the Clusters section's round-3 note for the reproduced, Router-independently-confirmed bug and the verified 7-case matrix. **Superseded by drift, not by this round's fix (CLASS-FIX ROUND 1, `t_7539734e`): this row's `13 skipped (13)` reflects the main tree AS IT STOOD AT ROUND 3** — the file has since grown to 25 tests across later rounds, including a passing "legacy" test. The `S01-C4-verify` block's fresh run above (`vt=0 guard=0`, `1 passed \| 24 skipped (25)`) is TODAY's correct result on the SAME command, unescaped — the difference from this row is codebase growth across rounds, not a reversal of this row's own claim, and is unrelated to the escaped-pipe defect this round actually fixes (this row never had one). |

**Note on the cluster table's "ONE verification command" for S01-C1:** the
worker names the new test file's `it()` blocks and finalizes the exact
`-t` grep string in step S01-C1-5; the acceptance criterion for the
cluster is that ALL tests in `pda-s01-envelope-schema.test.ts` plus the
existing `s8-publication.test.ts` pass, run three times, worst run is the
verdict. A simpler, always-correct command that satisfies "ONE command"
without depending on test-name wording — **also carrying the same
`test -f` guard, for the same reason as the cluster-table row above**:
`test -f tests/unit/pda-s01-envelope-schema.test.ts && pnpm exec vitest run
tests/unit/pda-s01-envelope-schema.test.ts tests/unit/s8-publication.test.ts`.

## SPEC trace — R1 Envelope carries argument tree for new publishes

**SPEC:** S01 R1 · **Cluster:** S01-C1 (schema), S01-C2 (publish path)

### S01-C1-1 — Relocate `PublicDebateSchema` below `EdgeSchema`, add three optional fields

**Cluster:** S01-C1
**File surface:** `packages/contract/src/index.ts`
**Change:** Cut the `export const PublicDebateSchema = z.object({...}).strict();`
block and its immediately-following `export type PublicDebate = z.infer<typeof PublicDebateSchema>;`
line (currently lines 262-279 plus the type line) out of their current
location. Paste them back in, unchanged except for the addition below, at
the point immediately after `EdgeSchema`'s `export type Edge = z.infer<typeof EdgeSchema>;`
line and immediately before `export const AnswerSchema = z.object({`.
Inside the pasted block's nested `answer: z.object({...}).strict()`, add
three new fields after the existing `as_of: z.iso.datetime()` line:
```
    nodes: z.array(NodeSchema).optional(),
    edges: z.array(EdgeSchema).optional(),
    tree_included: z.boolean().optional()
```
**Acceptance test:** `grep -n "export const PublicDebateSchema" packages/contract/src/index.ts`
reports a line number greater than the line number reported by
`grep -n "export const EdgeSchema" packages/contract/src/index.ts`, AND
`grep -n "tree_included: z.boolean().optional()" packages/contract/src/index.ts`
returns exactly one match inside the `PublicDebateSchema` block (verify by
eye that it is nested under `answer`, not top-level — the stranger check is
`sed -n '/export const PublicDebateSchema/,/export type PublicDebate/p' packages/contract/src/index.ts`
shows `tree_included` indented under `answer: z.object({`).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly.** Run 2026-08-29: `grep -n "export const
PublicDebateSchema"` → line 262; `grep -n "export const EdgeSchema"` →
line 464. 262 is not greater than 464, so the criterion is currently
FALSE — a genuine RED, not a vacuous one (both greps are single-file,
single-pattern, no `-t`/multi-file risk).
**Failure it CATCHES:** the module fails to load at all (server boot
crash) if the relocation is skipped and the three fields reference
`NodeSchema`/`EdgeSchema` before their declaration — this step's ordering
requirement, checked by the grep-line-number comparison, catches exactly
that regression before it ever reaches a running server.
**Failure it MISSES:** does not catch a field added with the wrong TYPE
(e.g. `nodes: z.array(NodeSchema)` without `.optional()`, which is a
silent 404-on-old-snapshots regression) — that is caught by S01-C1-3/4's
RED test, not this step.

### S01-C1-2 — Regenerate the contract client

**REWORK ROUND 3 (PLAN-01, blocking, `t_08356244`): round 0's acceptance
test could never observe its own change — rewritten below with a test
this seat has itself watched fail, then pass.**

**Reproduced myself, exactly as this round's brief named, before touching
anything:**
```
$ git check-ignore -v packages/contract/generated/client.ts
dialectical-engine/.gitignore:7:packages/contract/generated/	packages/contract/generated/client.ts
$ git diff --stat packages/contract/generated/
(no output, exit 0)
```
`.gitignore:7` matches the whole `packages/contract/generated/` directory.
`git diff --stat` on an ignored path is empty BY CONSTRUCTION, always,
whether or not the step ran — the Router's finding holds exactly as
stated.

**Investigating the replacement, I found the brief's own two suggested
mechanisms ("greps the generated artifact for the fields," "compares a
content hash across the run") do not work EITHER, for a reason specific
to this generation script — worth recording so nobody re-tries them:**
`packages/contract/src/generate.ts` writes three files. `client.ts` is a
FIXED three-line re-export barrel (`export * from "../src/index.js"`)
that is byte-identical regardless of what any schema contains — hashing
it observes nothing, ever. `field-inventory.json` walks
`contractInventory.resources` and records `Object.keys(schema.shape)` —
**one level deep only**. S01's actual widening adds `nodes`/`edges`/
`tree_included` inside the NESTED `.answer` sub-object, so
`PublicDebateSchema`'s own top-level key list
(`public_ref, author_pseudonym, question, published_at, answer`) is
IDENTICAL before and after the widening — own confirmed measurement
below. A field-grep or hash on either generated file would report
"unchanged" even in the fully-correct post-widening state, which is a
WORSE defect than the gitignore one: it would not just fail to fail, it
would look like it was checking something and be silently wrong forever.

**What DOES discriminate, demonstrated by controlled experiment on the
real file, reverted after each run (`git status --porcelain` confirmed
clean before, after the broken state, and after the correct state; all
three `generated/` file hashes confirmed byte-identical to the pristine
baseline once fully reverted):**
1. Baseline: `pnpm run generate:contract` on the unmodified source →
   exit 0.
2. Applied the BROKEN edit — added `nodes: z.array(NodeSchema).optional()`
   to `PublicDebateSchema` AT ITS ORIGINAL (unrelocated) position, i.e.
   exactly the mistake S01-C1-1 exists to prevent. Ran `pnpm run
   generate:contract` → **exit 1**:
   ```
   ReferenceError: Cannot access 'NodeSchema' before initialization
       at <anonymous> (.../packages/contract/src/index.ts:277:20)
   ```
3. Reverted (`git checkout HEAD -- packages/contract/src/index.ts`),
   confirmed clean, then applied the CORRECT edit — relocated
   `PublicDebateSchema` below `EdgeSchema` per S01-C1-1, with the three
   new optional fields. Ran `pnpm run generate:contract` → **exit 0**.
4. Confirmed `field-inventory.json`'s `resources.PublicDebateSchema` in
   this CORRECT state is `["public_ref","author_pseudonym","question","published_at","answer"]`
   — unchanged from before, proving the "grep the generated artifact for
   the new field names" approach genuinely does not work here, not merely
   assumed not to.
5. Reverted again, regenerated from the pristine source, confirmed all
   three `generated/` file hashes match step 1's baseline exactly — no
   trace left in either the tracked source or the gitignored output.

**Cluster:** S01-C1
**File surface:** `packages/contract/generated/client.ts` (and sibling
generated files) — generated output only, do not hand-edit.
**Change:** Run `pnpm run generate:contract`.
**Acceptance test:** `pnpm run generate:contract` exits 0 — this is not a
placeholder "the command ran" check, it is the exact, demonstrated
discriminator against the TDZ regression S01-C1-1 exists to prevent (step
2 above proves it fails when that regression is present; step 3 proves it
passes when the fix is correct); `pnpm run typecheck` exits 0.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly.** Run 2026-08-29: `pnpm run
generate:contract` exits 0 today, on the unwidened source — there is
nothing to break yet, so GREEN is the right pre-fix state, matching this
step's own round-3 demonstration (exit 1 only once the specific broken
widening from that round's controlled experiment is applied). Not a
vacuous pass: no `-t` filter, no missing-file argument, and round 3
already showed this exact command flips to exit 1 under the real
regression it exists to catch.
**Checked the neighbouring failure mode this round's brief named ("an
acceptance test whose command can pass without the step having
happened"), and caught one I nearly introduced myself:** an earlier draft
of this fix added a secondary check —
`"PublicDebateSchema" in field-inventory.json's resources` — intended as
a weaker confirmation the resource walk didn't silently skip this schema.
Tested it against TODAY's completely unmodified, unwidened source (before
S01-C1-1 has ever landed): **it passes**, because `PublicDebateSchema` is
already a registered resource today, independent of whether it has been
relocated or widened at all. That check discriminates NOTHING beyond what
the primary exit-code check already covers (a resource-walk crash on this
key would already make `generate:contract` throw and fail the primary
check) — it is exactly the class of vacuous acceptance test this round
exists to remove, so it is not included above. No second gitignore-class
member was found elsewhere in this step or its neighbors in S01-C1.
**Failure it CATCHES:** exactly the TDZ `ReferenceError` regression named
in S01-C1-1's own finding — a schema edit that references `NodeSchema`/
`EdgeSchema` before their declaration, demonstrated above to make this
exact command fail with this exact error. Also still catches a hand-edit
to the generated file surviving past the next regeneration (round 0's
original concern), since `generate.ts` unconditionally overwrites all
three files on every run.
**Failure it MISSES:** does not catch a semantically wrong field addition
that is still syntactically valid and doesn't break module load (e.g. a
field with the wrong TYPE, or a field added to the wrong nesting level) —
regeneration mechanically reflects and validates against whatever was
written, right or wrong; `S01-C1-3`/`S01-C1-4`'s schema-parse tests are
what catch that class, not this step. Does NOT catch a missing field by
grepping generated output — demonstrated above to be structurally
impossible for this generation script regardless of how the check is
written, not merely unattempted.

### S01-C1-3 — RED test: old-shape snapshot still parses (headline test)

**Cluster:** S01-C1
**File surface:** new file `tests/unit/pda-s01-envelope-schema.test.ts`
**Change:** Write a test that imports `PublicDebateSchema` from
`@debateai/contract` and a literal object identical in shape to
`tests/unit/s8-publication.test.ts:30-46`'s `publicDebate()` fixture (today's
shape — no `nodes`/`edges`/`tree_included`). Assert
`PublicDebateSchema.safeParse(oldShape).success === true` AND
`PublicDebateSchema.parse(oldShape).answer.tree_included === undefined` AND
`.answer.nodes === undefined`.
**Run this test BEFORE S01-C1-1 is applied is not meaningful** (the schema
doesn't have the fields yet, so there is nothing to regress against) — this
step is written to run AFTER S01-C1-1, as a regression guard, matching the
SPEC's description of it as "the headline acceptance of this slice," not a
pre-widening RED/GREEN pair. To get genuine RED-before-GREEN per
`heartbeat-worker`, the worker writes this test FIRST against the
UN-widened schema (trivially passes, since nothing changed yet — that is
expected and not a contradiction: the true RED/GREEN pair for THIS
requirement is S01-C1-4 below, which fails before the widening and passes
after).
**Acceptance test:** `pnpm exec vitest run tests/unit/pda-s01-envelope-schema.test.ts`
exits 0, and the failure summary is empty (0 failed).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly.** Run 2026-08-29: exit 1,
`No test files found, exiting with code 1` — the file doesn't exist yet.
A single-file target with no other argument fails cleanly on its own
(unlike the multi-file cluster command fixed above); no `test -f` guard
needed here.
**Failure it CATCHES:** a future change that flips `nodes`/`edges`/
`tree_included` from `.optional()` to required, which would make this
exact test throw on `.parse()` — this is the regression this whole PLAN
exists to prevent.
**Failure it MISSES:** does not catch a required field added ANYWHERE
ELSE on `PublicDebateSchema` outside this test's exact fixture shape (e.g.
a new required field on `PublicDebateSummarySchema`) — S01-C1-3 only
covers the exact fixture fields exercised.

### S01-C1-4 — RED/GREEN pair: required-widen would 404, optional-widen doesn't

**Cluster:** S01-C1
**File surface:** `tests/unit/pda-s01-envelope-schema.test.ts` (same file
as S01-C1-3, additional `it()` block)
**Change:** Write a test that builds a SEPARATE local schema (not
`PublicDebateSchema` itself) with the same old-shape fixture, but with a
REQUIRED (non-optional) `nodes: z.array(z.unknown())` added to its nested
`answer`, and assert `.safeParse(oldShape).success === false`. This proves
the mechanism this PLAN is defending against (required-widen breaks old
snapshots) without requiring the worker to actually regress
`PublicDebateSchema` and un-regress it. Immediately below it, assert that
the REAL, current `PublicDebateSchema` (after S01-C1-1) DOES accept the
same old-shape fixture (`success === true`) — this second assertion is
the true regression guard.
**Acceptance test:** `pnpm exec vitest run tests/unit/pda-s01-envelope-schema.test.ts -t "required"`
exits 0.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly.** Run 2026-08-29: exit 1,
`No test files found, exiting with code 1` — same single-file-target
behavior as S01-C1-3 above; the `-t` filter is irrelevant when the whole
file is missing (vitest checks file existence before filtering), so this
is a genuine RED, not the vacuous kind.
**Failure it CATCHES:** if a future editor "fixes" back-compat by only
removing `.strict()` (the documented wrong fix from the load-bearing
finding) while leaving a field required, this test's first assertion
(required-widen rejects old-shape) stays true regardless of `.strict()`,
proving the test is pinned to the REQUIRED-KEYS mechanism, not to
`.strict()`.
**Failure it MISSES:** does not catch a required field added with a
DEFAULT value (`z.array(...).default([])`) — zod's `.default()` makes a
required-shape field tolerate absence by substituting a default, which
would also parse old-shape input successfully but silently
fabricate an empty tree rather than leaving it typed-absent. This PLAN
does not use `.default()` anywhere (decision 1 uses plain `.optional()`),
so the gap is not exercised, but a future editor introducing `.default()`
on `nodes` would not be caught by this test and would defeat S01-C4's
"tree_included distinguishes legacy from zero-node" design. Flagged here
so a reviewer knows to check for `.default(` if this test ever needs
extending.

### S01-C1-5 — Confirm cluster verification command

**Cluster:** S01-C1
**File surface:** none (verification-only step)
**Change:** none.
**Acceptance test:** `test -f tests/unit/pda-s01-envelope-schema.test.ts && pnpm exec vitest run tests/unit/pda-s01-envelope-schema.test.ts tests/unit/s8-publication.test.ts`
exits 0, run three times consecutively; report all three exit codes.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly, ONLY after adding the `test -f` guard.**
Run 2026-08-29 WITHOUT the guard: `pnpm exec vitest run
tests/unit/pda-s01-envelope-schema.test.ts tests/unit/s8-publication.test.ts`
→ exit 0, `1 passed | 12 skipped (13)` — a vacuous GREEN, the missing
first file silently dropped, the "1 passed" coming from an unrelated
existing test. This is the multi-file-argument defect documented in the
Clusters section above, found on THIS step's own command while running
every acceptance command as this round requires. WITH the guard: exit 1
(`test -f` fails first, command short-circuits) — genuine RED. This is
the step whose acceptance test is literally "confirm the cluster
verification command," so it is the step where this defect would have
been shipped as "verified" without ever being run.
**Failure it CATCHES:** a flaky test in either file (e.g. one relying on
`Date.now()` or unseeded randomness) that passes once and fails on a
later run — the three-run law's whole purpose.
**Failure it MISSES:** does not catch a test that is deterministically
wrong in a way that happens to assert something true by accident (a
tautological assertion) — that class of defect needs Grok's mutant-class
review, not a rerun.

### S01-C1-6 — `NodeSchema.stranger_restatement` becomes `.strict()`, per V's ruling (DECISIONS Row 9, `t_a00a162e`)

**V has ruled; this step implements the ruling, it does not re-argue it.**
DECISIONS Row 9: the contract's lone `.passthrough()` becomes `.strict()`,
chosen deliberately over silent stripping and over deferral.

**The finding, reproduced myself before writing this step, not taken on
the Router's word:** `packages/contract/src/index.ts:434`, inside
`NodeSchema` (424), reached by `PublicDebateSchema` through `answer.nodes`:
```ts
stranger_restatement: z.object({ check_status: CheckStatusSchema }).passthrough(),
```
It is the only `.passthrough()` in the contract; everything else on the
anonymous path is `.strict()`. Ran the Router's committed probe
(`.hermes/reports/public-debate-access/probes/passthrough-probe.mts`)
myself, 2026-08-29: `parse_success: true`,
`keys_that_survived: ["check_status","SMUGGLED_OWNER_SECRET"]`,
`SMUGGLED_VALUE: ledger:abc-123` — confirmed, reproduces exactly as
reported. That parsed envelope is what `apps/ui/lib/v3/publicAnswerExport.ts`'s
`buildPublicAnswerExport` (S02-C3-3) spreads wholesale into a downloadable
file for anonymous readers.

**Cluster:** S01-C1
**File surface:** `packages/contract/src/index.ts:434` (the ONE token,
`.passthrough()` → `.strict()`, nothing else on this line or schema
changes), `tests/unit/contract.test.ts` (new assertions, existing file —
first claim by this mission; not previously in any slice's surface, no
collision).
**Change:** `.passthrough()` → `.strict()` on line 434's `z.object(...)`
call. No other line in `packages/contract/src/index.ts` changes.

**1. RED-before-GREEN acceptance, verified by RUNNING both ways, not by
reasoning.** `tests/unit/contract.test.ts:113-171` already has a proven-
valid `node` fixture (satisfies `NodeSchema.parse` today, per its own
existing assertions at lines 145-170) — reused rather than built from
scratch, since the Router's own probe took three attempts to reach a
valid fixture (`way_of_knowing` enum, `LabeledNumberSchema.value`/`kind`/
`producer`/`source`/`provenance_ref`/`replay_handle` — ALL six fields
required, `.strict()`, not just the three the brief named — and
`relevant_as_of`) and an invalid fixture fails for the wrong reason,
proving nothing: this mission's signature defect. New assertion, added to
the existing `it("admits recorded per-node maker lineage...")` block
(same fixture already in scope, no new `describe`/`it` needed):
```ts
expect(() => NodeSchema.parse({
  ...node,
  stranger_restatement: { ...node.stranger_restatement, SMUGGLED_OWNER_SECRET: "ledger:abc-123" }
})).toThrow();
```
**Verified myself, both ways, by running — not by reasoning:**
- **RED, against the CURRENT contract** (own script, `pnpm exec tsx`,
  imported the real `NodeSchema` read-only, deleted after, `git status
  --porcelain` confirmed clean before and after): the exact assertion
  above does NOT throw today — `NodeSchema.safeParse` on the smuggled
  object returns `success: true`, `stranger_restatement.SMUGGLED_OWNER_SECRET`
  present with value `"ledger:abc-123"`. The written assertion genuinely
  fails against today's contract, for the right reason (the passthrough
  leak, not a fixture bug) — confirmed by ALSO checking the base fixture
  (no smuggled key) parses successfully, so the failure is specific to
  the added key, not a defect in the reused fixture.
- **GREEN, against the ONE-LINE change** (own script, reconstructed
  `NodeSchema` verbatim field-for-field from the real source with every
  sub-schema — `WayOfKnowingSchema`, `LabeledNumberSchema`,
  `MakerLineageSchema`, `NodeReviewSchema`, `ConditionMarkSchema`,
  `AbstentionSchema`, `StalenessStateSchema`, `CheckStatusSchema` — all
  imported live from the real package, changing ONLY the one line under
  test to `.strict()`): the base fixture still parses (no regression on
  the valid case), and the smuggled object is rejected —
  `{"code":"unrecognized_keys","keys":["SMUGGLED_OWNER_SECRET"],"path":["stranger_restatement"],"message":"Unrecognized key: \"SMUGGLED_OWNER_SECRET\""}`.
  Reconstructing the full schema (not just the inner `stranger_restatement`
  sub-object in isolation) confirms the surrounding 16 other required
  fields don't interfere with or mask the one-line change's effect.
- Did not edit the tracked `packages/contract/src/index.ts` to produce
  the GREEN run — that would be product code, out of this round's scope.
  The reconstruction is a scratch-only script, deleted after use,
  `git status --porcelain` confirmed clean before and after; the coding
  seat runs the REAL one-line edit and the REAL test on its own ticket.
**Acceptance test:** `pnpm exec vitest run tests/unit/contract.test.ts`
exits 0 (regression: the file's existing 9+ assertions, including the
7 pre-existing `NodeSchema.parse`/`.toThrow()` calls at lines 145-170,
must still pass) AND the new `SMUGGLED_OWNER_SECRET` assertion above
specifically throws (feature: this is the new, previously-impossible
rejection).
**Category (V RULING, DECISIONS Row 9, `t_a00a162e`):** FEATURE-ASSERTION — own reproduction, 2026-08-29: RED
against the current contract (assertion does not throw, as shown above);
GREEN required once the one-line change lands (shown reachable above via
the reconstructed schema, not assumed).

**2. Blast-radius answer, measured, not assumed.** Which callers actually
invoke `NodeSchema.parse`/`.safeParse`/`AnswerSchema.parse` (the only
schemas embedding `NodeSchema`, `packages/contract/src/index.ts:475,498`)
— own grep across `packages/`, `apps/`, `tests/`, real source only,
build artifacts under `.next*` excluded:
- `apps/api/src/index.ts:932` — `NodeSchema.parse(node)`, single-node GET
  route. `node` originates from `packages/serve/src/index.ts:2198`'s
  query projection, which constructs `stranger_restatement: { check_status:
  row.check_status }` — own read, exactly one key. Unaffected.
- `apps/api/src/index.ts:899,993` — `AnswerSchema.parse(answer)`, same
  producer (`packages/serve/src/index.ts`), same single-key construction
  (there is only one construction site for this object in that file).
  Unaffected.
- `apps/api/src/publications.ts:53` — the public-projection function
  (this mission's own S01-C2 work) constructs `stranger_restatement: {
  check_status: node.stranger_restatement.check_status }` on its OUTPUT,
  explicit single-key projection, own read. Unaffected — and this is the
  object that then gets `PublicDebateSchema.parse`d, so the anonymous
  path was already implicitly safe by construction even before this
  step; `.strict()` makes that safety a schema-enforced INVARIANT instead
  of an implementation habit, which is the entire point of V's ruling.
- **REFUTED, `t_cc34ba78` — the bullet below was WRONG, correcting in
  place, not silently rewriting it:** `tests/unit/s8-publication.test.ts:124-128`'s
  fixture sets `stranger_restatement: { check_status: "PASS", secret_extra:
  "LEAK-ME-RESTATEMENT", owner_note: "do-not-publish" }`. This bullet
  originally claimed the extra keys were "inert JS properties TypeScript
  accepts because [the object is] passed via an intermediate `const`, not
  a literal" and concluded `.strict()` "has zero runtime interaction with
  it." **That reasoning checked the wrong half of the change.** It
  correctly traced whether the object is later PARSED at runtime (no —
  `publish()`'s only `.parse()` calls are on its freshly-projected
  OUTPUT, never this INPUT) but never checked whether the object is
  CONSTRUCTED under a type that `.strict()` also narrows. It is: the
  fixture is built and returned inside `function answerWithTree(): Answer`
  — a fresh object literal under a direct return-type annotation, exactly
  where TypeScript's excess-property check applies, regardless of
  whether anything ever calls `.parse()` on the result at runtime.
  `z.object(...).strict()` narrows the INFERRED TYPESCRIPT TYPE (via
  `z.infer`) as well as the runtime parse — only the runtime half was
  checked here. **Measured, independently, not accepted on the ticket's
  word:** `npx tsc --noEmit` in `.worktrees/s01-strict` exits `1` with
  exactly one error: `tests/unit/s8-publication.test.ts(126,9): error
  TS2353: Object literal may only specify known properties, and
  'secret_extra' does not exist in type '{ check_status: "FAIL" |
  "NOT_SAMPLED" | "PASS"; }'.` Own reproduction, same worktree, same
  result, before writing this correction.
- No other real-source call site invokes `NodeSchema`/`AnswerSchema`'s
  `.parse()`/`.safeParse()` — confirmed by grep across every non-build-
  artifact `.ts`/`.tsx` file in `packages/`, `apps/ui`, `apps/api/src`,
  `tests/`. This half of the original sweep stands, unrefuted — the
  correction above is about a construction site, not a parse site.
**The number V asked for, corrected: two separate numbers, not one.**
RUNTIME blast radius (does anything that PARSES via `NodeSchema`/
`AnswerSchema` currently pass an extra key): still zero, unaffected by
this correction. COMPILE-TIME blast radius (does anything CONSTRUCT an
`Answer`/`Node`-typed object literal with an extra key under
`stranger_restatement`): **exactly one** —
`tests/unit/s8-publication.test.ts:124-128`, measured by `tsc`, not
assumed. A blast-radius method that only runs the runtime half of this
check will miss this class every time `.strict()` (or any schema
narrowing) is applied to a type that ALSO flows into a `z.infer`-derived
TypeScript type used elsewhere — checking half of what a schema change
touches is not checking the change, the same shape as this mission's own
"checking half a `for` loop is not checking the loop" lesson, one
abstraction level up.

**The irony, recorded because it is the useful part, not a footnote:**
this exact fixture exists to PROVE a leak-shaped key does not escape to
an anonymous reader — that is the entire purpose of the
`secret_extra`/`owner_note` keys and the test at line 1054
("projects `stranger_restatement` to its public `check_status` only")
that consumes them. It could only ever have been WRITTEN in the first
place because the schema permitted the extra key at construction time —
the exact hole V's ruling closes. The guard depended on the vulnerability
it guarded against; closing the vulnerability necessarily breaks the
guard's own construction, not because the guard was wrong, but because
its INPUT could no longer be expressed as a plain literal once the type
it was borrowing room from tightened.

**Ruling: same shape as S02-C1-6 (a correct change breaking a standing
assertion), same conclusion (fix the assertion/fixture, do not freeze or
revert correct product code) — precedent applied, mechanism differs.**
S02-C1-6 needed a cross-slice SURFACE grant because the broken assertion
lived in `tests/architecture/s8-publication-contract.test.ts`, a file S02
did not own. Here, the broken fixture lives in
`tests/unit/s8-publication.test.ts`, a file S01 already owns and already
edits extensively (S01-C2/C3/C4's own file surface, and this same
S01-C1-6 step's widened cluster command) — there is no cross-slice
boundary to cross, so applying the precedent requires zero additional
surface-widening, only specifying the fixture fix within a step already
authorized to touch this file. Rejecting the `.strict()` change (the
S02-C1-6 precedent's "reject the refactor" option) is ruled out for the
same reason it was ruled out there: V has ruled, and the change is
correct — the assertion is what needs to adapt to newly-correct product
code, not the other way around.

**The fix — restructure the fixture so it still proves what it was
written to prove, without depending on a schema hole that no longer
exists.** The test's RUNTIME behavior must not change: the projection
function under test still needs a REAL extra key at runtime to prove it
strips one. Only the COMPILE-TIME view needs to change. Construct the
invalid input through a cast, not a literal — verified by running `tsc`
both ways, not by reasoning:
```ts
stranger_restatement: {
  check_status: "PASS",
  secret_extra: "LEAK-ME-RESTATEMENT",
  owner_note: "do-not-publish"
} as Node["stranger_restatement"],
```
(`type Node` added to the existing `import { PublicDebateSchema, type
Answer } from "@debateai/contract"` line — `Node` is already exported
from `packages/contract/src/index.ts:443` as `export type Node =
z.infer<typeof NodeSchema>`, no new export needed.) **Own verification,
both ways, against the real `.strict()`'d contract in
`.worktrees/s01-strict`, scratch file written to the main repo root
(NOT the worktree), run, deleted, `git status --porcelain` confirmed
clean before and after in both the main tree and the worktree:**
without the cast, `tsc --noEmit` reproduces the exact TS2353 error above
(control, confirms the reproduction is faithful); with the cast, `tsc
--noEmit` exits `0`, no errors, anywhere in the file. Runtime check on
the SAME cast object, same script: `Object.keys(node.stranger_restatement)`
→ exactly `["check_status","secret_extra","owner_note"]` —
**the cast does not strip the properties at runtime**, only changes
TypeScript's static view of the literal, so the test at line 1054 needs
NO change at all: it still receives a real three-key object at runtime
and still proves `publications.ts`'s projection drops the two extra
keys. `as Node["stranger_restatement"]` (a direct assertion, not
`as unknown as ...`) suffices because the literal is a structural
SUPERSET of the target type — verified with an isolated minimal
reproduction before applying it to the real fixture, since `as` and
direct-literal-assignment have different excess-property rules in
TypeScript and that difference is exactly what this fix depends on.
**This is a test-file edit; the coding seat applies it on its own
ticket, not here.**

**Not a defect in the coding seat's own work, said plainly so credit
lands where it belongs:** the S01-STRICT seat's RED was RED for the
right reason (`unrecognized_keys` naming `SMUGGLED_OWNER_SECRET` at
`stranger_restatement`), GREEN was 6/6, a `check_status: "FAIL"` fixture
was still correctly accepted (proving `.strict()` didn't over-narrow the
enum itself), three runs were 34/34, and the seat correctly separated a
PRE-EXISTING failure at `tests/unit/s8-publication-database.test.ts:1712`
that reproduces identically with `.passthrough()` still in place — not
caused by this change. **It reported the breakage instead of working
around it, which is exactly what Row 7 and this mission's own standing
law both require.** The defect this correction fixes is in my own
blast-radius METHOD, not in anything the seat did.

**Failure it CATCHES:** the exact defect this step exists to close — an
unknown key surviving `NodeSchema` validation into a parsed public
envelope, from which `buildPublicAnswerExport` (S02-C3-3) spreads the
ENTIRE `answer` object, forbidden-key exclusions and all, into a
downloadable file. `.strict()` makes this structurally impossible at the
schema layer, not merely absent from today's two producers by
convention — a THIRD future producer of `Node`-shaped data that carelessly
spreads extra fields into `stranger_restatement` now fails LOUDLY at
parse time instead of silently shipping.
**Failure it MISSES:** does not catch an owner-only secret smuggled under
a DIFFERENT, already-declared field name (e.g. reusing `check_status`
itself for a non-enum value that happens to coerce, or a leak through a
field this schema already declares and therefore already accepts) — that
is a field-CONTENT problem, not a schema-SHAPE problem, and `.strict()`
only closes the shape-widening class this finding is about.

### S01-C1-7 — Split `NodeSchema` so the public path enforces `disagreement: null` at the boundary, per V's ruling (`t_83df0d9c`)

**V has ruled; this step designs the fix, it does not re-argue it.** Two
independent blind lenses, from opposite angles, found the same hole:
`packages/contract/src/index.ts:437` declares `disagreement:
z.record(z.string(), z.unknown()).nullable()` inside `NodeSchema` — a
mutant that copies `disagreement` through instead of nulling it is
ACCEPTED by the schema, contrasted directly against `stranger_restatement`
after Row 9, where the identical class of mutant is a `ZodError`. No live
leak exists — `apps/api/src/publications.ts:56` sets `disagreement: null`
unconditionally, and S04's merged product-path test fails on three
regression shapes if that line regresses — but the field is guarded by
product code and a test, not by the contract, which is exactly what V
ruled must change.

**The premise, verified myself, not taken from the ticket:** `NodeSchema`
is used at two sites — `packages/contract/src/index.ts:475`
(`PublicDebateSchema.answer.nodes`) and `:498`
(`AnswerSchema.nodes`, the owner side). Own read of
`packages/serve/src/index.ts:2059,2201`: the owner-side query projection
types `disagreement: Readonly<Record<string, unknown>> | null` and
populates it from `judgement.disagreement` (a real, non-null JSONB
column value when a disagreement was actually recorded) — `disagreement:
row.disagreement`. The owner's own view of a debate genuinely needs a
non-null disagreement record; tightening `NodeSchema` in place, the way
Row 9 tightened `stranger_restatement`, would break that. **This is why
it is a split and not a one-token change** — confirmed, not assumed.

**Cluster:** S01-C1
**File surface:** `packages/contract/src/index.ts` (new schema/type,
one line changed at `PublicDebateSchema.answer.nodes`),
`apps/api/src/publications.ts` (one return-type annotation) —
**both already S01's own surface** (S01-C1 owns the contract; S01-C2
owns the publish path), no cross-slice grant needed.

**1. The shape of the split.** `NodeSchema.omit({ disagreement: true
}).extend({ disagreement: z.null() })`, not a hand-written separate
schema and not a branded variant. Verified working, both runtime and
compile-time, against the real Zod 4.4.3 in this repo (scratch script,
main repo root, deleted after, `git status --porcelain` clean before and
after):
```ts
export const PublicNodeSchema = NodeSchema.omit({ disagreement: true }).extend({
  disagreement: z.null()
});
export type PublicNode = z.infer<typeof PublicNodeSchema>;
```
Own confirmed results: the owner-side `NodeSchema` still accepts a
non-null `disagreement` (`true`, unaffected); `PublicNodeSchema` rejects
one (`false`) with `{"expected":"null","code":"invalid_type","path":
["disagreement"],"message":"Invalid input: expected null, received
object"}`; `PublicNodeSchema` still accepts `disagreement: null`
(`true`); `PublicNodeSchema` still requires every other `NodeSchema`
field exactly as before (tested by omitting one, correctly rejected).
**Why `.omit().extend()` over a hand-written separate schema:** every
OTHER field stays derived from one source of truth — if `NodeSchema`
ever gains a new field for the owner side, `PublicNodeSchema`
automatically inherits it (typed, required) rather than silently missing
it, which is exactly the parallel-drift failure this mission already
paid for once (S02's parallel-component-tree anti-drift cluster, S02-C6,
recorded because a hand-duplicated structure can go out of sync with no
compiler signal). **Why not a branded variant:** `.brand()` is a
compile-time-only device — it does not change what the RUNTIME parser
accepts, and the actual defect here is that the runtime parser accepts
too much. Branding would rename the type without closing the hole.
**`PublicDebateSchema.answer.nodes` (line 475) changes from
`z.array(NodeSchema).optional()` to `z.array(PublicNodeSchema).optional()`
— the only edit to an existing schema.** `AnswerSchema.nodes` (line
~498, owner side) is untouched.
**What happens to `export type Node` (line 443) and its consumers:**
**nothing.** `NodeSchema` itself is not modified — `PublicNodeSchema` is
a NEW schema derived FROM it, not a replacement of it. `Node` continues
to mean exactly what it means today (`disagreement: Record<string,
unknown> | null`), and every existing importer of `type Node`
(`packages/contract/src/client.ts`, `packages/serve/src/index.ts`,
`apps/api/src/index.ts`, `apps/api/src/publications.ts`,
`tests/unit/pda-s04-node-carrier-audit.test.ts`,
`tests/unit/s8-publication.test.ts` — own grep, confirmed below) keeps
compiling unchanged. This is the structural reason this split's blast
radius is small where Row 9's `.strict()` change was not: Row 9 tightened
a field INSIDE the one schema both paths share; this step introduces a
second schema instead of tightening the shared one.
**`redactNodeForPublic`'s return type, recommended change (product code,
for the coding seat):** `apps/api/src/publications.ts:33`,
`function redactNodeForPublic(node: Node): Node` becomes
`function redactNodeForPublic(node: Node): PublicNode`. This is a SECOND,
independent enforcement layer beyond the runtime schema: if a future
edit reverts line 56 from `disagreement: null` to `disagreement:
node.disagreement` (the exact mutant the blind lens applied), the
function body now fails to COMPILE — `Record<string, unknown> | null` is
not assignable to `null` — catching the regression before it ever reaches
`PublicDebateSchema.parse()` at runtime. Own grep, one caller only
(`apps/api/src/publications.ts:244`, `input.answer.nodes.map(redactNodeForPublic)`,
consistent across every worktree checked), so this return-type change is
fully contained.

**2. Narrow vs wide — ruled explicitly, narrow, with the boundary
named.** `redactNodeForPublic` also forces a fixed sentinel
(`"REDACTED_OWNER_ONLY"`) at `provenance_ref` (node-level, `base_score`,
`final_strength`, `review`) and at `abstention.ledger_unknown_ref` —
none of these are schema-enforced either. Own trace of EVERY call:
within `redactNodeForPublic` specifically (not `redactEdgeForPublic`,
which is a different function with its own conditional `redactSource`
flag, out of scope here), every one of these sentinel substitutions is
UNCONDITIONAL — no branch, no exception, every node, every time. A wide
split would express them too: `z.literal("REDACTED_OWNER_ONLY")` in
place of `z.string().min(1)` at each site. **Ruled narrow, this round —
`disagreement` only.** Reason, not a default: `disagreement`'s type is
`z.record(z.string(), z.unknown())` — an UNBOUNDED, ARBITRARY-SHAPED
record that can hold any nested object graph with no structural
constraint at all, which is exactly why the blind lens's mutant produced
a schema-valid leak of a full smuggled object rather than a
type-mismatch. The sentinel-string fields are, in every case, typed as
`z.string().min(1)` — a mutant that skips their redaction still produces
a STRING (the wrong one, a real leak of that one value, a real bug) but
one bounded in shape by the existing type; it cannot smuggle an
arbitrary object graph the way an unconstrained record can. This is a
difference in KIND of exposure, not merely degree, and it is why
`disagreement` was the field two independent lenses converged on and not
one of the others. **What remains unexpressed, said plainly:** the
`provenance_ref`/`replay_handle`/`ledger_unknown_ref` sentinel
invariants stay enforced by `redactNodeForPublic` and its own test
coverage only, not by the schema. Widening to cover them would also
require deriving public variants of `LabeledNumberSchema`,
`NodeReviewSchema`, and `AbstentionSchema` — and `LabeledNumberSchema`
is SHARED with `EdgeSchema.strength.number`, where `redactEdgeForPublic`
calls `redactLabeledNumber(..., { redactSource: false })` — a genuinely
different, conditional redaction rule for the SAME shared schema. A
public `LabeledNumberSchema` variant would have to either encode that
node/edge asymmetry (real added complexity, a second variant or a
parameterized one) or leave `source` unconstrained (weakening the wide
case's own completeness claim). This is real, non-trivial follow-on
work, not a rubber stamp on "leave it" — named explicitly as a
recommended follow-up ticket, not silently dropped, and flagged for V:
the SAME class of gap (schema silent where product code redacts) exists
at these five additional sites, lower severity than `disagreement`
(bounded string leaks, not arbitrary object leaks) but real.

**3. Blast radius, both halves, counted, not estimated.** Runtime
(`PublicDebateSchema`/`PublicNodeSchema` `.parse()`/`.safeParse()` call
sites) and compile-time (constructors/consumers of `type Node`/`type
PublicDebate`), per the `t_cc34ba78` lesson applied deliberately this
time:
- **Runtime — every `PublicDebateSchema.parse`/`.safeParse` call site
  found by grep (15 total, product and test) traced to its data
  origin:** three product sites
  (`apps/api/src/publications.ts:229,388`, `apps/api/src/index.ts:735`)
  either construct nodes via the real (always-nulling) `redactNodeForPublic`
  or re-parse an already-published, already-redacted stored snapshot.
  Twelve test sites: five construct no `nodes` array at all
  (`.optional()`, omitting it is valid — `tests/unit/s8-publication-ui.test.tsx`,
  `tests/render/pda-s02-public-page.test.tsx`,
  `tests/render/pda-s02-scoring-chrome.test.tsx`, the `legacyDebate`
  fixture in `tests/render/pda-s02-public-tree.test.tsx:290`, and
  `publicDebate()`/`s8-publication-http.test.ts:41`'s direct `:
  PublicDebate` literal); one constructs `nodes: []`
  (`tests/render/pda-s02-honesty-export.test.tsx`); the rest construct
  `disagreement: null` directly or route through the real
  `redactNodeForPublic`/`publicationHarness` pipeline
  (`tests/unit/pda-s04-node-carrier-audit.test.ts`,
  `tests/unit/s8-publication.test.ts`, `tests/unit/contract.test.ts`,
  `tests/unit/s14-ui.test.ts`, `tests/unit/dr174-resilience.test.ts`,
  `tests/render/pda-s02-public-tree.test.tsx`'s main fixture,
  `tests/support/v2uiFixtures.ts`). **Runtime blast radius: zero.**
- **Compile-time — every file importing `type Node` (7) or referencing
  `PublicDebate` in a type position (6) found by grep and individually
  checked, not assumed safe by category:** the 7 `type Node` importers
  are unaffected because `NodeSchema`/`Node` are unmodified (see above).
  Of the 6 `PublicDebate` type-position sites, four are UI components
  RECEIVING the type as a read-only parameter (`PublicDebatePageClient`,
  `PublicHonestyDrawer`, `PublicAnswerDisclosure`,
  `buildPublicAnswerExport`) — a consumer receiving a narrower type is
  never a compile break, only a producer constructing one can be. The
  other two — `tests/unit/pda-s04-node-carrier-audit.test.ts:190`'s
  `const projectedDebates: PublicDebate[] = []` (populated via `.push()`
  from `.parse()`'s own return value, not a hand-built literal) and
  `tests/unit/s8-publication-http.test.ts:41`'s direct `const
  publicDebate: PublicDebate = {...}` literal (the one genuinely
  highest-risk site, checked field-by-field: its `answer` object has no
  `nodes` key at all) — are both confirmed safe by reading their actual
  content, not by pattern-matching on "this looks like the risky shape."
  **Compile-time blast radius: zero.** No test fixture, in either half,
  needs any change — unlike Row 9's `.strict()` change, which needed
  exactly one cast. The difference is structural (this design never
  narrows the shared `NodeSchema`/`Node`), not luck, and is stated as
  such rather than presented as a coincidence.
- **Files that DO need to change — both already S01's own surface, both
  named above, nothing else:** `packages/contract/src/index.ts` (new
  schema/type, one line changed) and `apps/api/src/publications.ts` (one
  return-type annotation). Zero test files, zero fixture files.

**4. What proves it.** New test, `tests/unit/contract.test.ts` (already
this mission's home for direct schema-level negative-key tests, per
`t_a00a162e`'s `stranger_restatement` test) — **the property under test
is exactly V's ruling's own words: a non-null `disagreement` in a PUBLIC
envelope is REJECTED, not silently dropped** — tested at the
`PublicDebateSchema` boundary itself, not merely at the derived
`PublicNodeSchema` helper, since the boundary is what V's ruling names:
```ts
const smuggledDisagreementDebate = {
  public_ref: "11111111-1111-4111-8111-111111111111",
  author_pseudonym: "p", question: "q",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: {
    terminal: "SERVED", verdict: "SUPPORTED", verdict_available: true,
    confidence_band: "moderate",
    summary_segments: [{ text: "s" }], badges: [], residual_objections: [],
    reversal_point: "r", as_of: "2026-08-24T00:00:00.000Z",
    nodes: [{ ...validPublicNode, disagreement: { internal_note: "LEAK-ME" } }]
  }
};
expect(PublicDebateSchema.safeParse(smuggledDisagreementDebate).success).toBe(false);
expect(PublicDebateSchema.safeParse({
  ...smuggledDisagreementDebate,
  answer: { ...smuggledDisagreementDebate.answer, nodes: [{ ...validPublicNode, disagreement: null }] }
}).success).toBe(true);
```
(`validPublicNode`: any node fixture satisfying every OTHER `NodeSchema`
field — the existing `node` fixture at `tests/unit/contract.test.ts:114-143`,
minus its `secret_extra` cast concern which is irrelevant here, is a
ready-made base.) **No table-cell command — this mission's standing law
— the cluster's ONE verification command stays a plain single-file
target, no pipe, nothing to escape.**
**Acceptance test:** `pnpm exec vitest run tests/unit/contract.test.ts`
exits 0, including the two new assertions above.
**The mutant that must turn this RED, named explicitly so the
acceptance can be checked for discrimination, not just existence:** an
implementation that skips wiring `PublicNodeSchema` into
`PublicDebateSchema.answer.nodes` — i.e., leaves line 475 as `z.array(NodeSchema)`
— is the mutant that reproduces the ORIGINAL finding exactly; under that
mutant the first assertion above flips from `false` to `true` and the
test goes RED. A second, real-world mutant this design also catches
differently: reverting `redactNodeForPublic`'s line 56
(`disagreement: null` → `disagreement: node.disagreement`) is caught at
COMPILE TIME if the return-type change is applied (`Node` is not
assignable to `PublicNode`), and — independently, if the return-type
change were somehow skipped — at RUNTIME by this same test's schema, and
separately by the already-existing S04 product-path test
(`pda-s04-node-carrier-audit.test.ts`), which the brief confirms already
fails on this exact shape. Three independent layers for the real-world
mutant, one schema-level layer (this step's own) for the pure
schema-omission mutant that started this ticket.
**Category (V RULING, `t_83df0d9c`): FEATURE-ASSERTION — own verification
this round, before writing this step down, not after:** `PublicNodeSchema`
does not exist in the tracked contract today, so
`pnpm exec vitest run tests/unit/contract.test.ts` with this test added
would fail to even import/compile — a genuine, unambiguous RED (a
missing export, not a vacuous pass), matching this mission's own
established RED-shape vocabulary (same class as a missing test file,
not a filter/escaping defect). GREEN is reachable: verified via the
scratch `.omit().extend()` script above, run against the real Zod 4.4.3
in this repo, producing the exact rejection/acceptance results the test
asserts.
**Failure it CATCHES:** the exact defect this step exists to close — a
`disagreement` value surviving `PublicDebateSchema`/`PublicNodeSchema`
validation into a parsed public envelope, independent of whether the
PROJECTION code (`redactNodeForPublic`) is itself correct — this is the
"fail loudly at the boundary" property Row 9 already established for
`stranger_restatement`, now also true for `disagreement`.
**Failure it MISSES:** the five sentinel-string fields named in item 2
above (`provenance_ref` ×4 sites, `replay_handle` ×2,
`ledger_unknown_ref`) remain unenforced by the schema — a mutant that
skips redacting one of THOSE still passes this step's own test and every
other schema-level test in this file, since none of them assert those
fields' exact values; they remain guarded by `redactNodeForPublic`'s
product code and its own test coverage only, named as a recommended
follow-up, not claimed as closed here.

**Cost disclosed to V, as instructed if the HOW has one worth knowing
before it is paid:** this design's cost is genuinely small — two files,
zero test-fixture edits, a `.omit().extend()` one-liner plus one
return-type annotation — BECAUSE it deliberately does not widen beyond
`disagreement`. The wider fix (closing all six redaction guarantees at
the schema layer) is real, valuable, and NOT free: it requires new public
variants of three more shared schemas and a decision about how to encode
`LabeledNumberSchema`'s node/edge `redactSource` asymmetry. If V wants
that closed now rather than as a follow-up, the cost is a materially
larger step than this one, not a token change — worth knowing before
committing to it, not after.

## SPEC trace — R2 Public-safe honesty fields; identity carriers absent

**SPEC:** S01 R2 · **Cluster:** S01-C1 (schema), S01-C2 (publish path)

### S01-C2-0 — Finding: `NodeSchema.abstention.ledger_unknown_ref` is a ledger-adjacent handle that "copy nodes wholesale" would otherwise leak

**Cluster:** S01-C2 (this is the finding that produces S01-C2-1's redaction
requirement below — recorded as its own numbered item because it
responds directly to a flagged, unresolved question from REV-01's SPEC
review, not something this PLAN silently decided)
**MEASURED, own read:** REV-01's comment on ticket `t_2a279210`
(2026-08-29 11:08) flagged, under "what I did NOT check": *"Whether
`answer.abstention.register_row_key` / `answer.abstention.ledger_unknown_ref`
... should also be added to S01 R2's exclusion list — they read as
ledger-adjacent but aren't literally named `ledger_digest_handle`;
UNVERIFIED whether they carry the same risk."* Own read of
`packages/contract/src/index.ts:380-390` confirms `AbstentionSchema`
(used at `NodeSchema.abstention: AbstentionSchema.nullable()`, i.e.
PER-NODE, nullable) has exactly these fields: `kind, question_class,
risk_tier, price, register_row_key, register_version, register_source_ref,
unlock_condition, ledger_unknown_ref` — all `.strict()`, all REQUIRED
(none `.optional()`).
**Resolution:** `ledger_unknown_ref` is functionally the same category as
the explicitly-forbidden `ledger_digest_handle`/`inspection_handle` — a
pointer into the owner-only ledger system, just for the specific case of
an "unknown" abstention rather than a served answer. Since S01's own
decision is to copy `nodes` wholesale (verbatim, unstripped — see
Architecture decisions §1-2), and this field is REQUIRED (cannot be
omitted without breaking `.strict()` parse), the fix is VALUE redaction,
not field omission — see S01-C2-1. `register_row_key`/`register_version`/
`register_source_ref` are treated DIFFERENTLY: these reference the model
DEPLOYMENT REGISTER (same shape family as `DeploymentSchema.register.rows[]`
at `packages/contract/src/index.ts:289`), not the ledger — the same
operational-provenance category as `maker_lineage`/`provenance_ref`, which
S04's own SPEC ground truth already treats as in-scope-for-review rather
than automatically-forbidden. **Not redacted by S01; added to S04-C4-1's
evidence checklist instead** (see S04/PLAN.md) so QA judges them with real
sample data rather than Architecture guessing their risk from the schema
shape alone.
**Failure this finding CATCHES if left unresolved:** every published
debate containing ANY node with a non-null `abstention` would leak a real
`ledger_unknown_ref` value to anonymous readers — a genuine, silent
identity/handle-exposure regression that no EXISTING test (including the
standing `s8-publication-contract.test.ts`, which only checks top-level/
answer-level forbidden keys, never node-level ones — see S04/PLAN.md's
own note on this exact gap) would have caught.

### S01-C2-0B — REWORK ROUND 1, B1 (blocking, `t_70805572`): `replay_handle` is a second, more universal handle on the same wholesale-copy path

**Cluster:** S01-C2. **Reproduced myself, before patching, exactly as the
rework brief required — every claim below is this seat's own command, run
in round 1, not inherited from the brief's assertion:**
- `sed -n '325,331p' packages/contract/src/index.ts` → `LabeledNumberSchema`
  ends `replay_handle: z.string().min(1)` (line 330) — REQUIRED, not
  `.optional()`. MEASURED, own read.
- `sed -n '443,463p' packages/contract/src/index.ts` → `NodeSchema.base_score:
  LabeledNumberSchema` (required, line 447) and `.final_strength:
  LabeledNumberSchema.nullable()` (line 448) — both reach `LabeledNumberSchema`.
  `sed -n '464,477p'` → `EdgeSchema.strength`'s `PRESENT` arm carries
  `number: LabeledNumberSchema` too — a THIRD reachable site the brief's
  own citation didn't even need to name. MEASURED, own read.
**REDACTION-CORRECTNESS thread, round 2 (`t_83a9eb08`) note, added without
editing the historical claims above:** the `325,331`/`443,463`/`464,477`
line ranges above are a DATED record of round 1's own reproduction, true
when run then, on the file as it stood then — `packages/contract/src/index.ts`
has since grown (the projection remedy, S01-C1's relocation) and these
exact ranges no longer show the same content (own re-run this round:
`LabeledNumberSchema`/`NodeSchema`/`EdgeSchema` now start at 305/424/445
respectively, not 325/443/464). Left as-written here, since rewriting a
past round's own citation would misrepresent what that round actually
ran; the LIVE, re-runnable equivalents (anchor-based, not line-numbered)
are in the Clusters section's round-2 note, immediately before S01-C2-1.
- `sed -n '360,380p' apps/ui/components/NodeDetailDrawer.tsx` → line 367:
  `` produced by {baseScore.producer} · {baseScore.source} · replay
  {baseScore.replay_handle}`` ; line 376: the same for `finalStrength`.
  Confirmed byte-for-byte against the brief's citation. MEASURED, own read.
- `grep -rn replay_handle apps/ packages/ --include="*.ts" --include="*.tsx"`
  (own broader sweep, not just the two lines the brief cited): the handle
  is backed by real DB columns (`packages/db/src/schema.ts:241,348,371,482`,
  all `.notNull()`) and joined through `packages/serve/src/index.ts` /
  `packages/ledger/src/index.ts` — this is a real, persisted, dereferenceable
  pointer into the execution/ledger system, not a display-only label. This
  raises my own confidence above the brief's citation alone that this is
  the SAME risk class as `ledger_digest_handle`/`ledger_unknown_ref`, not a
  weaker one.
- `grep -rl replay_handle docs/missions/public-debate-access/slices/*/PLAN.md`
  → **0 files**, exit 1. `grep -rl ledger_unknown_ref` (same dirs) → 2
  files (S01, S04). Confirmed exactly as the brief stated. **B1 holds. I
  am patching it.**

**Exhaustive enumeration (the brief's second ask: "walk every field
reachable from `NodeSchema` and `EdgeSchema` and state, per field, whether
it is copied, redacted, or absent").** Every field below is reachable from
the public envelope's `nodes`/`edges` arrays (S01 copies both wholesale,
per Architecture decision §1-2) — nothing in this class is ever "absent"
the way a top-level `PublicDebateSchema.answer` field can be; the only
real classifications are COPIED (as-is) or REDACTED (value replaced, key
kept). Where a field's safety is not something a schema-shape read can
settle, it is COPIED-AND-FLAGGED — carried into S04's evidence checklist
rather than guessed at here.

**REWORK ROUND 2 (B2, blocking, `t_9322ae7b`): the enumeration below was
right; the TREATMENT of two rows was wrong.** `COPIED-AND-FLAGGED` is a
correct classification for a field whose VALUE might be risky but whose
SHAPE is fixed (`provenance_ref`, `maker_lineage.provider_ref` — a
checklist row genuinely lets QA sample real data and judge). It is NOT a
correct classification for a field whose SHAPE is open — `stranger_restatement`
(`.passthrough()`) and `disagreement` (`z.record(...)`) — because a
checklist row cannot close a wildcard: no amount of sampling today's data
proves what CAN be stored there tomorrow, and the wholesale `...node`
spread this round's `redactNodeForPublic` used (round 1, `S01/PLAN.md`
then line 486) copies whatever keys exist, known or not, by construction.

**Reproduced myself before patching, per this round's own instruction —
own command, own script, imports the REAL `NodeSchema` from
`packages/contract/src/index.ts`, deleted immediately after (`git status
--porcelain` confirmed clean):**
```
NodeSchema.safeParse(dirtyNode).success: true
parsed.stranger_restatement: {"check_status":"PASS","secret_extra":"LEAK-ME","owner_note":"do-not-publish"}
parsed.disagreement: {"internal_note":"LEAK-ME-TOO","ledger_ptr":"secret-ptr-123"}
published JSON contains 'LEAK-ME'? true
published JSON contains 'LEAK-ME-TOO'? true
published JSON contains 'do-not-publish'? true
published JSON contains 'secret-ptr-123'? true
projected stranger_restatement contains LEAK-ME? false
```
The schema itself accepts arbitrary extras on both fields (confirming
`.passthrough()`/`z.record()` are genuinely open, not just permissive
about a known set), round 1's spread-based `redactNodeForPublic` lets all
of it through, and a PROJECTION (build a new object naming only the keys
you keep, never spread the source) closes it. This matches both the
reviewer's and the Router's independent reproductions exactly.

**Sweep for every other member of the class, not just the two named.**
Grepped the WHOLE contract file (not just `NodeSchema`/`EdgeSchema`'s
immediate bodies) for every zod API that can widen a shape:
`.passthrough()` → 1 hit (`stranger_restatement`, line 453). `.catchall(`
→ 0 hits. `z.record(` → 4 hits (line 113 `AskRequestSchema.depth_params`,
line 456 `NodeSchema.disagreement`, line 573 `AnswerSchema.cost_envelope.basis`,
line 624 `RunEventSchema.payload`). `z.any()` → 0 hits. `z.unknown()`
(standalone) → 7 hits total, the 4 already counted via `z.record` plus
`DeploymentSchema.register.rows[].value` (line 292),
`ShadowSuppressionSchema.would_have_suppressed` (line 366),
`AnswerSchema.answer_form` (line 489). `.and(` intersections → 0 hits.
`z.looseObject`/`.loose(`/`z.strictObject` → 0 hits (own read confirms
this codebase's zod 4.4.3 usage never reaches for these either).

**Of every hit, own read of each one's CONTAINING schema, to confirm
reachability from the copied `nodes`/`edges` path specifically** (the
class this round is scoped to, per the brief): `depth_params`
(`AskRequestSchema` — the initial ask request, unrelated to
Node/Edge/publication) NOT REACHABLE. `cost_envelope.basis`
(`AnswerSchema.cost_envelope` — answer-level, and `cost_envelope` itself
is EXCLUDED wholesale by V's closed Row 4 ruling, never copied at all) NOT
REACHABLE. `payload` (`RunEventSchema` — anonymous event streams are
banned outright by S01 R6/S04 R2; never exposed) NOT REACHABLE.
`DeploymentSchema.register.rows[].value` (model/deployment registry, no
relation to a debate's nodes/edges) NOT REACHABLE.
`ShadowSuppressionSchema.would_have_suppressed` (`AnswerSchema.shadow_suppressions`
— answer-level, not in S01's copied field list) NOT REACHABLE.
`AnswerSchema.answer_form` (answer-level, not copied) NOT REACHABLE.
**Exactly two members of the class are reachable from `NodeSchema`/`EdgeSchema`
on the copied path: `stranger_restatement` and `disagreement`. The brief's
own table already named both — this sweep's contribution is proving
there is no THIRD, by exhausting every zod API that can open a shape
file-wide, not merely re-reading `NodeSchema`'s own body again.**

| schema.field | classification | reason |
|---|---|---|
| `NodeSchema.node_id` | COPIED | internal tree-node id, needed for tree structure/linking, not a person |
| `NodeSchema.claim` | COPIED | the argument text — the exact content V's parity ruling names |
| `NodeSchema.way_of_knowing` | COPIED | enum label, no handle shape |
| `NodeSchema.base_score` (`LabeledNumberSchema`) | see `LabeledNumberSchema.*` below | required, reached via every node |
| `NodeSchema.final_strength` (`LabeledNumberSchema.nullable()`) | see `LabeledNumberSchema.*` below | reached when non-null |
| `NodeSchema.provenance_ref` | **REDACTED (REDACTION-CORRECTNESS thread, round 1, `t_9e9e04ef`)** | own trace: `packages/serve/src/index.ts:2181`, sourced from `node.provenance_ref::text` → an FK into `ledger.raw_artifact.raw_artifact_id` (own read, `packages/db/src/schema.ts:284`) — an opaque internal DB row pointer. Own sweep: never accepted as input by any `apps/api` endpoint (0 hits), never rendered anywhere in `apps/ui` (0 hits). No confirmed alias or derivability to any owner-only secret, unlike the sites below — redacted on minimal-disclosure grounds (no product need for it), not because a leak is proven the way it is for the aliased sites |
| `NodeSchema.maker_lineage` (`MakerLineageSchema.nullable()`) | see `MakerLineageSchema.*` below | which AI model authored the node, not a human identity |
| `NodeSchema.review` (`NodeReviewSchema.nullable()`) | see `NodeReviewSchema.*` below | |
| `NodeSchema.locator` | **COPIED (VERIFIED, round 2)** | own trace of its producer/consumer: `packages/judgement/src/index.ts:120-131` is the LLM prompt schema asking the model for `"locator": non-empty string \| null`, under the explicit instruction *"Never invent evidence, citations, or sources... LOOKED_UP requires a resolving locator"* — this is a CITATION (where LOOKED_UP evidence was found), model-generated free text, never programmatically populated from an internal path/handle anywhere in `packages/judgement`, `packages/graph`, or `packages/serve`. Resolves round 1's UNVERIFIED flag with real evidence, not a stronger presumption — no longer on S04's checklist as open. |
| `NodeSchema.stranger_restatement` (`{check_status}.passthrough()`) | **PROJECTED to `{ check_status }` ONLY (B2 fix)** | `.passthrough()` allows arbitrary extra keys on stored data (own reproduction above: `secret_extra`/`owner_note` both survived a wholesale spread). A checklist row cannot close an open shape — the fix is to construct a NEW object naming only `check_status`, never spread the source. See S01-C2-1's revised `redactNodeForPublic` and S01-C2-7's residual test. |
| `NodeSchema.defeater_refs` | **COPIED (VERIFIED, round 2)** | own trace of its SQL producer, `packages/serve/src/index.ts:2085-2093`: `ARRAY(SELECT incoming.source_node_id::text FROM core.edge AS incoming JOIN core.node AS defeater ... WHERE ... incoming.polarity='attack' AND defeater.child_kind='defeater')` — these are `node_id` values of OTHER NODES in the SAME run/tree (the defeaters attacking this node), structurally identical to `EdgeSchema.from_node_ref`/`.target_ref`, already classified COPIED. Since the whole node array (including those same `node_id`s) is already published, this array discloses nothing beyond what publishing the tree already does. Resolves round 1's "presumed intra-tree" into a verified claim — no longer on S04's checklist as open. |
| `NodeSchema.defeater_exhaustion_marked` | COPIED | plain boolean |
| `NodeSchema.disagreement` (`z.record(string,unknown()).nullable()`) | **REDACTED WHOLESALE to `null` (B2 fix, decided WITH evidence, not by default)** | own trace of its producer, `packages/judgement/src/index.ts:352` (`JSON.stringify(input.disagreement)` written into a `ledger.reduced_judgement` jsonb column alongside `panel_contract_hashes`/`dispersion`/`judge_weight_version`) and consumer, `apps/ui/components/NodeDetailDrawer.tsx:402` (`v3.disagreement === null ? "No disagreement record" : JSON.stringify(v3.disagreement)` — even the OWNER UI renders it as a blind, unlabeled JSON dump). This is an internal multi-judge-panel dissent diagnostic with NO semantic contract anywhere in this codebase, not "argument content" — the schema being `.nullable()` makes `null` an already-valid value, so this is a clean field-level exclusion, not an invented placeholder. **This is the field the brief named as untouched by the reviewer's own fix — closed here, not left for a later round.** |
| `NodeSchema.condition_marks` | COPIED | array of enum values |
| `NodeSchema.abstention` (`AbstentionSchema.nullable()`) | see `AbstentionSchema.*` below | |
| `NodeSchema.staleness_state` | COPIED | enum |
| `NodeSchema.relevant_as_of` | COPIED | timestamp, not identity-bearing |
| `EdgeSchema.edge_id` | COPIED | internal identifier |
| `EdgeSchema.from_node_ref` / `.target_ref` | COPIED | intra-tree pointers, needed for tree structure |
| `EdgeSchema.target_kind` / `.relation` | COPIED | enums |
| `EdgeSchema.strength` (`PRESENT` arm `.number`) | see `LabeledNumberSchema.*` below | **this is the THIRD `replay_handle` site — present in the brief's underlying claim but not in its literal two-line citation; found only by walking `EdgeSchema` myself rather than stopping at the cited lines** |
| `EdgeSchema.strength` (`UNKNOWN` arm `.reason`) | COPIED | fixed literal, no risk |
| `EdgeSchema.provenance_ref` | **REDACTED (REDACTION-CORRECTNESS thread, round 1, `t_9e9e04ef`)** | own trace + own probe run (`.hermes/reports/public-debate-access/probes/leak-probe.mts`, against the coder's finished worktree): `packages/serve/src/index.ts:173-177`, `projectServeEdge` assigns the IDENTICAL `row.provenanceRef` to THIS field, `strength.number.provenance_ref`, and `strength.number.replay_handle` — three fields, one source value. Own probe, pre-fix: `owner_only_value_reached_anonymous_reader: true`. This is `replay_handle` under a different name, exactly as measured |
| `EdgeSchema.placeholder` | COPIED | plain boolean |
| `LabeledNumberSchema.value` | COPIED | the actual score — legitimate read content, already shown to the owner |
| `LabeledNumberSchema.kind` / `.producer` | COPIED | already rendered as visible owner-side read content (`NodeDetailDrawer.tsx:367,376`) — genuinely benign metadata, unlike `.source` below, which round 0/1 wrongly bundled into this same row by NAME-proximity, the exact mistake round 1's own rule exists to prevent |
| `LabeledNumberSchema.source` on `base_score`/`final_strength` | **REDACTED (REDACTION-CORRECTNESS thread, round 3, `t_3d2c21e9`, FINAL)** | own trace + own probe (`.hermes/reports/public-debate-access/probes/source-alias-probe.mts`, against the coder's worktree): `base_score.source` is `judgement.source_ref`, bound to the SAME `input.rawArtifactRef` as `raw_artifact_ref` in the SAME `INSERT INTO ledger.reduced_judgement` statement (`packages/judgement/src/index.ts:319-325,335-347` — both `record`/`recordReduced`) — own probe pre-fix: `owner_only_value_reached_via_source: true`. `final_strength.source` is `node_strength_record.source_ref`, bound to `lineage.provenanceRef`/`own.provenanceRef` at BOTH call sites of `recordPropagation` (`apps/runner/src/index.ts:651-670`, `:2006-2030`) — the node's own `provenanceRef`, the SAME value `node.provenance_ref` already redacts. Not independently probed for THIS site, redacted on the strength of the identical producer pattern (own read of both call sites), per this thread's own fixed-point rule (below): this field entered the redacted class as a CONSEQUENCE of `node.provenance_ref` being redacted in round 1, discovered only by re-sweeping the enlarged set, not by re-reading the schema |
| `LabeledNumberSchema.source` on `edge.strength.number` | **COPIED, VERIFIED (round 3)** | own trace: `packages/serve/src/index.ts:171`, `projectServeEdge` sets `source: row.strengthSource` — a `StrengthSource` ENUM (own read: `packages/db/src/schema.ts:259`, `packages/graph/src/index.ts` — literal values like `"EVIDENCE_VERIFIER"`), a DIFFERENT producer entirely from `provenanceRef`/`replay_handle`. Confirmed NOT aliased — redacting it would destroy legitimate content for no security reason |
| `LabeledNumberSchema.provenance_ref` | **REDACTED (REDACTION-CORRECTNESS thread, round 1), all 3 reachable sites** (`base_score`, `final_strength`, `edge.strength.number`) | own trace: on `base_score`, sourced from `judgement.reduced_judgement_id::text` (`packages/serve/src/index.ts:2079`) while `replay_handle` is `judgement.replay_handle`, itself `` `judgement:${reduced_judgement_id}` `` — own probe (`node-prefix-probe.mts`) confirms `replay_handle` is DERIVABLE from the published `provenance_ref` via that known prefix even after `replay_handle` itself is redacted (`reconstructed_equals_original_replay: true`, pre-fix). On `edge.strength.number`, identical to `replay_handle` verbatim (same producer call, see `EdgeSchema.provenance_ref` above). `final_strength` reaches the same `redactLabeledNumber` function, sourced from `strength.propagation_run_id::text` (`packages/serve/src/index.ts:2083`) — same ledger-row-pointer shape as `base_score`'s site; not independently probed this round, redacted alongside the other two on the strength of the identical code shape rather than left flagged |
| `LabeledNumberSchema.replay_handle` | **REDACTED (B1 fix)** | required, persisted DB-backed pointer into the ledger/execution system — same risk class as `ledger_digest_handle` |
| `MakerLineageSchema.maker` / `.model_id` / `.transport` / `.provider_ref` | **COPIED (VERIFIED, REDACTION-CORRECTNESS thread, round 1)** | own trace of `.provider_ref` specifically, the one field the old reasoning left open: `packages/serve/src/index.ts:2182`, `projectNodeMakerLineage`, sourced from `artifact.provider_ref` (`ledger.raw_artifact.provider_ref`) — traced further via `packages/providers/src/index.ts` and `apps/runner/src/dev-provider-panel.ts:20-32` to a STATIC per-deployment PROVIDER-SLOT identifier (own read, literal example values `"development:codex-cli"`, `"development:claude-cli"`), not a per-call secret — same class as `DeploymentSchema`'s already-public `model_ledger`/`scorecards` rows, which already disclose `provider`/`model_id`/`routing_decision_ref` at the deployment level. No alias or derivability to any owner-only secret found. Resolves the old "not proven safe" flag with a real producer trace — no longer on S04's checklist as open |
| `NodeReviewSchema.outcome` / `.reasons` | COPIED | argument content |
| `NodeReviewSchema.provenance_ref` | **REDACTED (REDACTION-CORRECTNESS thread, round 1)** | same producer KIND as `NodeSchema.provenance_ref` above — own trace: `packages/serve/src/index.ts:2188`, sourced from `review.review_raw_artifact_ref::text`, also an FK into `ledger.raw_artifact`. Same reasoning: no confirmed alias, redacted on minimal-disclosure grounds — own sweep confirms `NodeDetailDrawer.tsx` renders `review.outcome`/`.reasons`/`.reviewer_lineage.*` only, never `.provenance_ref` |
| `NodeReviewSchema.reviewer_lineage` | see `MakerLineageSchema.*` above | |
| `AbstentionSchema.kind` / `.question_class` / `.risk_tier` / `.price` / `.unlock_condition` | COPIED | read content, unchanged from round 0 |
| `AbstentionSchema.register_row_key` / `.register_version` / `.register_source_ref` | **COPIED (VERIFIED, REDACTION-CORRECTNESS thread, round 1)** | own trace: `packages/serve/src/index.ts:1568-1569` selects these straight off `serve.abstention` columns; own further trace of `register_source_ref`'s actual producer via `packages/memory/src/index.ts:753` (`registerSourceRef: policy.sourceRef`) confirms these are POLICY/deployment-REGISTER citations (a versioned rules table), structurally identical to `BandCeilingSchema.register_row_key`/`.register_version` (same file, already public, unflagged) and `DeploymentSchema.register`'s already-public rows — NOT a per-execution ledger pointer like `ledger_unknown_ref`. No alias or derivability to any owner-only secret found. Resolves the old "S04 checklist item 3b" flag with a real producer trace — no longer open |
| `AbstentionSchema.ledger_unknown_ref` | **REDACTED (round 0 fix, unchanged)** | |

**Failure this enumeration CATCHES if a reviewer skips it:** exactly what
happened in round 0 — a leak found by pattern-matching one suspicious
field name (`ledger_unknown_ref`) without walking every OTHER field the
same wholesale-copy decision reaches. The brief's own framing ("a third
missed sibling is the failure mode here") is why this table exists as a
mechanical artifact, not a paragraph of prose a reviewer has to re-derive.
**Failure it MISSES (as of round 0/B1/B2):** does not prove any
`COPIED-AND-FLAGGED` row is actually safe — those were honestly left
open, routed to S04, not settled by this table. A table that classified
everything as either "safe" or "redacted" with nothing left open would
have been overclaiming.

**REDACTION-CORRECTNESS thread, round 1 (`t_9e9e04ef`) closes every
`COPIED-AND-FLAGGED` row above — none are left flagged-not-settled.** A
Grok blind lens was asked to CONSTRUCT a leak against this table's own
`COPIED-AND-FLAGGED` reasoning rather than review it, and built one: for
`EdgeSchema`, `provenance_ref` is not merely "not proven safe by name" —
it is the SAME VALUE as `replay_handle`, under a different field name.
**The classification rule this table used through round 2 was wrong: it
classified by NAME (`*_handle` dangerous, `*_ref` descriptive) when the
thing that determines risk is what the PRODUCER assigns to the field.**
Reproduced myself before changing anything, both probes run against the
coder's finished worktree (`.worktrees/prog-a-s01/dialectical-engine` —
read-only, no writes):
```
$ pnpm exec tsx .hermes/reports/public-debate-access/probes/leak-probe.mts
{
  "replay_handle_after": "REDACTED_OWNER_ONLY",
  "number_provenance_ref_after": "edge-prov-alias-HANDLE-9f2a-SHOULD-NOT-LEAK",
  "edge_provenance_ref_after": "edge-prov-alias-HANDLE-9f2a-SHOULD-NOT-LEAK",
  "secret_still_in_json": true,
  "owner_only_value_reached_anonymous_reader": true
}
VERDICT_SIGNAL: LEAK_REPRODUCED
$ pnpm exec tsx .hermes/reports/public-debate-access/probes/node-prefix-probe.mts
{
  "published_replay": "REDACTED_OWNER_ONLY",
  "published_provenance": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "reconstructed_equals_original_replay": true,
  "original_replay_absent_from_json": true
}
VERDICT_SIGNAL: NODE_PREFIX_RECONSTRUCTABLE
```
Both match the rework brief's measured claims exactly. **THE RULE, re-derived
by value provenance, stated so a later seat can apply it without
re-deriving it: a field is REDACTED if and only if its producer assigns
it a value that is IDENTICAL to, or derivable via a known/public
transform from, an already-redacted field's source value or any other
owner-only ledger/execution-row pointer — traced through the actual
producer code, never inferred from the field's own name.** Applying that
rule to every `COPIED-AND-FLAGGED` row in the table above: `NodeSchema.provenance_ref`,
`EdgeSchema.provenance_ref`, `LabeledNumberSchema.provenance_ref` (all 3
sites), and `NodeReviewSchema.provenance_ref` are REDACTED — each traces
to a ledger-row pointer, either verbatim-aliased or prefix-derivable to
an already-redacted handle, or (for the two `raw_artifact_id` sites with
no confirmed alias) redacted anyway on minimal-disclosure grounds since
they serve no product purpose. `MakerLineageSchema.*` (all 4 fields
including `.provider_ref`) and `AbstentionSchema.register_row_key`/
`.register_version`/`.register_source_ref` are COPIED, VERIFIED rather
than flagged — both trace to static deployment/policy CONFIGURATION, not
a per-execution ledger pointer, structurally identical to already-public
`DeploymentSchema`/`BandCeilingSchema` register data. **No row is left
flagged-not-settled after this round.** (**REDACTION-CORRECTNESS thread,
round 3 correction, not an edit to the claim above: this was true of
every row that EXISTED at the time this table was swept, and false of a
row the sweep's OWN OUTPUT created — see the fixed-point note immediately
below.**)

**REDACTION-CORRECTNESS thread, round 3 (blocking, FINAL, `t_3d2c21e9`):
the rule above is RECURSIVE, and round 1 applied it in a single pass.**
The rule redacts a field whose value is identical to or derivable from
**an already-redacted field's** source value. `node.provenance_ref` was
NOT redacted at the moment round 1's sweep began — it BECAME redacted as
an OUTPUT of that same sweep (via the rule's OTHER clause, "any owner-only
ledger/execution-row pointer"). The instant it did, every field aliased to
`node.provenance_ref`'s value entered the class — but round 1 evaluated
every row against the SET IT STARTED WITH, not the set it ENDED with, so
`LabeledNumberSchema.source` (own probe, `source-alias-probe.mts`,
pre-fix: `owner_only_value_reached_via_source: true`) was missed — not
because it was overlooked, but because at the moment it was checked, it
genuinely was not yet in the class. **This is not "one more field was
missed." A recursive rule was applied once instead of to a fixed point.**

**Own fixed-point sweep this round, stated pass by pass — the pass count
IS the evidence the rule is now applied recursively, not the claim of it:**
- **Pass 0 (round 0 baseline, the set round 1's sweep started from):**
  `{ LabeledNumberSchema.replay_handle, AbstentionSchema.ledger_unknown_ref }`.
- **Pass 1 (round 1's sweep, evaluated against Pass 0):** added
  `LabeledNumberSchema.provenance_ref` (3 sites), `EdgeSchema.provenance_ref`,
  `NodeSchema.provenance_ref`, `NodeReviewSchema.provenance_ref` — 4 new
  members. **The set GREW. Round 1 stopped here and did not re-sweep.**
- **Pass 2 (this round, re-sweeping every remaining COPIED field against
  Pass 1's ENLARGED set — this is the pass round 1 owed and skipped):**
  checked every field for aliasing/derivability to the four Pass-1
  additions' actual VALUES (not just their names). Found:
  `LabeledNumberSchema.source` on `base_score`/`final_strength` — aliased
  to the same raw-artifact-id `node.provenance_ref` now redacts (own
  trace above). Checked and found NOT aliased on this pass: `edge.strength.number.source`
  (different producer, a `StrengthSource` enum — see table above);
  `MakerLineageSchema.provider_ref` (already traced, a deployment-config
  identifier, unchanged); `AbstentionSchema`'s remaining COPIED fields
  (`kind`/`question_class`/`risk_tier`/`price`/`unlock_condition` — enum/
  numeric/short descriptive types, no ledger-row-shaped string among
  them); `NodeSchema.locator`/`.defeater_refs` (already independently
  traced in an earlier round to non-ledger producers). **1 new member.
  The set GREW AGAIN.**
- **Pass 3 (this round, re-sweeping against Pass 2's set — required by
  the same rule, since Pass 2 also grew the set):** re-checked every
  remaining COPIED field against `LabeledNumberSchema.source`'s value
  (the same raw-artifact-id already covered by Pass 1's additions, so no
  field could newly alias to Pass 2's addition without ALSO aliasing to
  Pass 1's — checked anyway, not assumed). **0 new members. Pass 3 is the
  FIXED POINT: it added nothing.**

**Three passes to convergence, two of which grew the set — this count is
the round's own evidence that the rule needed iterating, not a single
application.** The class closed by this round: `LabeledNumberSchema.source`
on `base_score`/`final_strength` (redacted); `edge.strength.number.source`
explicitly confirmed safe and left COPIED, not redacted defensively
without evidence — over-redacting a field whose producer is genuinely
different is its own defect, the mirror image of this thread's whole
family.

**THE RULE, AMENDED to state the application procedure that was missing
— this is the actual fix, not the new redacted field, per the brief's own
framing ("write the fixed-point requirement INTO the rule, not just this
instance"):** a field is REDACTED if and only if its producer assigns it
a value identical to, or derivable via a known/public transform from, an
already-redacted field's source value or any other owner-only ledger/
execution-row pointer, traced through the actual producer code, never
inferred from the field's own name — **AND this sweep MUST be re-run
against the enlarged redacted set every time the set grows, until one
full pass adds nothing.** The redacted set is not a fixed input to the
rule; it is the rule's own output, fed back in. A sweep that stops after
one pass has only checked each field against where the set STARTED, not
where the rule's own reasoning, applied consistently, says it ENDS.
**Any future seat applying this rule must record its own pass count in
DECISIONS.md, the same way this round did — a rule applied once, with no
stated pass count, is indistinguishable from a rule applied to a fixed
point until a probe proves otherwise, which is exactly how this recurred.**

**Enumeration gap (item 4, closing it): the reviewer said it did not
exhaustively enumerate every `sourceRef` writer beyond the judgement/
serve path it cited.** Own sweep this round, for the TWO tables that
actually reach `LabeledNumberSchema.source` in the public envelope:
`grep -rl "INSERT INTO ledger.reduced_judgement\|INSERT INTO ledger.node_strength_record"`
across every `packages/*/src/*.ts` and `apps/*/src/*.ts` file returns
exactly 2 files — `packages/judgement/src/index.ts` (2 INSERT sites,
`record`/`recordReduced`, both binding `source_ref` to the SAME
`input.rawArtifactRef` parameter also bound to `raw_artifact_ref` in the
SAME statement — aliased BY CONSTRUCTION, not by correlation) and
`packages/ledger/src/index.ts` (1 INSERT site, `recordPropagation`,
taking `source_ref` as a caller-supplied parameter). Both CALLERS of
`recordPropagation` found and traced (`apps/runner/src/index.ts:651`,
`:2006`) — both bind `sourceRef` to that node's own `provenanceRef`, the
same value `node.provenance_ref` redacts. **Enumeration CLOSED for both
tables — 2 writers each, all 4 traced, no third writer exists in this
codebase today.** What this seat could NOT do, said plainly: establish
the LIVE DB FREQUENCY of the alias on already-published rows — this seat
has no database access and runs no product code. This is a narrower gap
than it may sound: because the alias is a CONSTRUCTION-TIME parameter-
binding identity in `packages/judgement/src/index.ts` (the same variable
bound twice in one `INSERT`), it is not a frequency question at all for
that table — it holds for 100% of rows by the shape of the code, not by
observed correlation, which a live query could only ever sample, not
prove. For `node_strength_record`, the exact query a seat WITH database
access could run to confirm empirically: `` SELECT count(*) FROM
ledger.node_strength_record nsr JOIN core.node n ON n.node_id = nsr.node_id
WHERE nsr.source_ref = n.provenance_ref::text `` (compares against the
live row count for that run/node set) — provided here as the open item's
exact query, per the brief's instruction, rather than letting the gap
evaporate un-actioned.

**DERIVABILITY, not just presence (the brief's item 4).** `base_score.provenance_ref`
is the raw `reduced_judgement_id`; `replay_handle` is `` `judgement:${reduced_judgement_id}` ``
— a FIXED, PUBLIC prefix. Redacting `replay_handle` alone leaves the raw
UUID published, and anyone can reconstruct the original handle by
prepending `"judgement:"` — own probe confirms this exactly
(`reconstructed_equals_original_replay: true`). This is why
`LabeledNumberSchema.provenance_ref` is redacted ALONGSIDE `replay_handle`,
not left as a "harmless" residual: redacting a value is insufficient when
a known transform recovers it from a SIBLING field that is not also
redacted.

**Remedy shape, chosen and applied to the whole class, not per-field —
see S01-C2-1's revised functions below.** `redactLabeledNumber`,
`redactNodeForPublic`, and `redactEdgeForPublic` move from spread+override
to full explicit PROJECTION (a brand-new object naming every field, never
`{ ...source, ... }`). This is not merely fixing the two newly-found
leaking fields — it is the general remedy `heartbeat-protocol` §2.2
prescribes for a fixed key set ("PROJECT to a named allow-list, build a
new object, never spread the source"), applied here for the first time to
sites that were previously left as spread+override under the belief that
a `.strict()` TypeScript-typed schema made spreading safe. It is safe
against an UNKNOWN key sneaking through (TS already prevents that for a
`.strict()`-inferred type); it is NOT safe against a KNOWN field the
classification table simply got wrong, which is exactly what happened
here — spread+override silently forwards a field's value the moment the
override list fails to name it, whether that omission is because the
field is new or because a reviewer's classification of an EXISTING field
was mistaken. Full projection does not prevent a classification mistake,
but it makes every field's fate a single, visible, named line in the
function body — the table above and the function body now say the same
thing in two places, which is what let this round's Grok lens and the
Router check one against the other and find the gap.

**REDACTION-CORRECTNESS thread, round 2 (blocking, `t_83a9eb08`): the
projection remedy above is correct and stays — but it EXPANDED the file,
and eight acceptance commands elsewhere in this PLAN pin a fixed line
range into `apps/api/src/publications.ts` / `packages/contract/src/index.ts` /
`apps/ui/components/NodeDetailDrawer.tsx`. Two broke loudly; the other six
are latent.** The coding seat hit this correctly and is parked behind it,
evidence preserved — this is the seat's sixth correct block in this
thread, not a mistake to fix in the seat's work.

**The self-contradiction is this PLAN's own, not the coder's:** S01-C2-1's
acceptance test asserted `redactNodeForPublic`/`redactEdgeForPublic`
appear at lines 153-220, while THIS SAME PLAN's own S01-C1 structural-
ordering ADR (see the "MEASURED ground truth" section and S01-C1-1)
mandates relocating `PublicDebateSchema` for the temporal-dead-zone fix —
a change to the SAME FILE'S structure that this round's own projection
remedy then compounded further (the `publish()` literal itself grew from
~20 lines to ~40 once every field is named instead of spread). One part
of this PLAN required a change; another part pinned an acceptance to
coordinates that change was guaranteed to move. **Under the exclusive-
provenance rule this thread's own round 1 restated: an acceptance whose
PASS traces to LINE COORDINATES rather than to the fact it claims is the
same violation as a PASS traced to a test's TITLE (ACCEPTANCE-COMMAND
thread, round 4) — the vehicle differs, the defect shape does not.**

**Reproduced first, against the coder's worktree (`.worktrees/prog-a-s01/dialectical-engine`),
own commands, own results, 2026-08-29 — not evaluated against the main
tree, which has no product change and would mislead:**
```
$ sed -n '153,220p' apps/api/src/publications.ts | grep -c "redactNodeForPublic\|redactEdgeForPublic"
0                                    # S01-C2-1's acceptance: FAILS LOUDLY on a correct implementation
$ sed -n '153,175p' apps/api/src/publications.ts | grep -E "memory_disclosure|cost_envelope|..."
(no output)                          # S01-C4-2's acceptance: PASSES VACUOUSLY — 153-175 is now
                                      # auditPreflightDenial, unrelated to publish()'s envelope
$ grep -n "async publish\|const publicDebate = PublicDebateSchema.parse" apps/api/src/publications.ts
184:  async publish(...    221:    const publicDebate = PublicDebateSchema.parse({
                                      # the real envelope literal now runs 221-240, not 153-175/153-220
```
**Own sweep for every fixed-line-range command in this PLAN, not just the
two the brief named** (the brief's own table samples 6; my own sweep
found 8, matching the brief's total count, across the following sites —
reported exactly as measured, including one place my own measurement
DIFFERS from the brief's, stated plainly rather than silently
overwritten):
1. `publications.ts:153,220` (S01-C2-1's acceptance) — **0 matches,
   confirmed broken**, exactly as the brief measured.
2. `publications.ts:153,175` (S01-C4-2's acceptance) — **0 matches,
   passes VACUOUSLY on the wrong region**, exactly as the brief measured.
3. `publications.ts:153,190` (this note's own round-4 Category citation,
   documenting the MAIN TREE's pre-fix state) — **still accurate today**
   (main tree unedited, function still absent regardless of range), but
   the SAME fragile shape; fixed anyway, on the same reasoning as #1/#2 —
   a citation that happens to still be right does not mean its SHAPE
   isn't the defect.
4. `contract/index.ts:325,331` (round-1 B1 reproduction: `LabeledNumberSchema`
   ends with `replay_handle`) — own re-run: `LabeledNumberSchema` now
   starts at line 305, not 325 — **drifted**, content at 325-331 is now
   mid-schema, not the field list originally cited.
5. `contract/index.ts:443,463` (round-1 B1: `NodeSchema.base_score`/
   `.final_strength`) — own re-run: `NodeSchema` now starts at 424, not
   443 — **drifted**; 443-463 now spans the TAIL of `NodeSchema` plus the
   START of `EdgeSchema`, not a clean single-schema view.
6. `contract/index.ts:464,477` (round-1 B1: `EdgeSchema.strength`'s
   `PRESENT` arm) — own re-run: `EdgeSchema` now starts at 445 — **drifted**
   by the same 19-line shift as `NodeSchema`.
7. `NodeDetailDrawer.tsx:360,380` (round-1 B1: `replay_handle` render
   sites) — own re-run: **NOT drifted** — this file is untouched by S01,
   lines 367/376 still hold the cited content exactly. Fixed anyway for
   the same reason as #3: the SHAPE is fragile even where today's content
   happens to still be right, and this file is not permanently exempt
   from future edits by other missions.
8. `contract/index.ts:252,260` (`S01-C3-1`'s acceptance, `PublicDebateSummarySchema`
   unchanged) — **own re-run measured this STILL CORRECT today**, showing
   exactly the six named fields with no `nodes`/`edges`/`tree_included`,
   contrary to the brief's table, which lists a `252,260` row as broken
   under the label "`PublicDebateSchema` shape." Two things can both be
   true and are: `PublicDebateSchema` ITSELF did move (to line 460,
   confirmed) and the "MEASURED ground truth" section's own separate
   `262-279` citation (PLAN.md line 28) is genuinely stale as a result
   (own re-run: that range now shows `PublicDebateListSchema`/
   `DeploymentSchema`, not `PublicDebateSchema`) — but `PublicDebateSummarySchema`,
   the schema `S01-C3-1` actually checks, was never at 252-260 because of
   `PublicDebateSchema`; it happens to still occupy that range because it
   was never moved. **Reporting this discrepancy plainly rather than
   silently editing S01-C3-1 to match a "broken" claim I could not
   reproduce** — fixed anyway, same SHAPE reasoning as #3/#7, and the
   genuinely stale "MEASURED ground truth" citation is called out
   separately below, since it is real even though it is not one of the
   eight acceptance commands.

**Bonus finding, not one of the eight (no pass/fail criterion attached,
so not an "acceptance" by this PLAN's own definition) but real and worth
recording: the "MEASURED ground truth" section's `packages/contract/src/index.ts:262-279`
and `:443-476` citations (PLAN.md lines 28, 33, 49) now describe content
that has moved.** These are dated, one-time round-0 discovery notes, not
re-run gates — left AS PROSE, not converted to anchors, but annotated
below with their current-drift status so a future reader does not mistake
them for current fact.

**Remedy shape, chosen by the shape of the constraint and applied to all
eight, not the two broken today.** The brief's own suggested direction —
anchor on the SYMBOL, not the line — is what this round uses, in two
forms depending on what each command actually needs:
- **Presence/count checks with no positional requirement** (S01-C2-1: "do
  these two function names appear at least twice") drop the range
  entirely and grep the WHOLE FILE. This is the simplest fix and the
  right one whenever the searched-for string is a unique identifier
  file-wide — no anchor needed because there is nothing ambiguous to
  anchor against.
- **Checks that need a SPECIFIC REGION** (S01-C4-2's forbidden-field
  absence check, which must NOT become a whole-file check — see its own
  step below for why; the B1-round schema/component citations) use
  `sed -n '/start-pattern/,/end-pattern/p'` — a pattern-delimited range,
  keyed to a unique symbol at each boundary (a function/schema/component
  declaration and its closing brace), never a line number. Verified own
  run against the worktree: every one of the 8 resolves to the SAME
  logical content today as the old fixed range claimed to show when it
  was written, and will continue to as the file grows, because the
  boundary is the SYMBOL, not its position.

**The limit of this remedy, stated as directly as projection's limit was
stated last round:** an anchor still assumes the SYMBOL NAME itself does
not change (a future rename of `redactNodeForPublic`, or of
`LabeledNumberSchema`, breaks the anchor exactly as a line-number range
broke this round) — it trades "immune to insertions/deletions elsewhere
in the file" for "still dependent on one specific string." This is a
strictly SMALLER dependency than a line number (a rename is a deliberate,
visible, `grep`-discoverable act; an insertion three functions away is
not), but it is not zero, and this PLAN does not claim otherwise. A
symbol rename is also a MUCH rarer, more deliberate edit than a nearby
insertion — the same "narrower and more stable surface" tradeoff this
seat already made once this round for the presence-arm patterns.

### S01-C2-1 — Publish path copies `nodes`/`edges`/`tree_included`

**Cluster:** S01-C2
**File surface:** `apps/api/src/publications.ts:153-169` (the
`PublicDebateSchema.parse({...})` literal inside `publish()`)
**Change:** Add three lines inside the `answer: {...}` object literal,
after the existing `as_of: input.answer.as_of` line:
```
        nodes: input.answer.nodes.map(redactNodeForPublic),
        edges: input.answer.edges.map(redactEdgeForPublic),
        tree_included: true
```
where the three redaction functions below are new, small, pure functions
(defined above `publish()` in the same file, or in a small new
`apps/api/src/publicProjection.ts` if the worker prefers — either is
acceptable, worker's call, not load-bearing which file). **REWORK ROUND 1
(B1):** `edges` now ALSO maps through a redaction function — round 0's
plan left `edges: input.answer.edges` unmapped, which was wrong the moment
`EdgeSchema.strength`'s `PRESENT` arm was walked (see S01-C2-0B's table) —
it reaches the same `LabeledNumberSchema.replay_handle` node/final_strength
does.
```ts
// REDACTION-CORRECTNESS thread, round 1 (`t_9e9e04ef`): every function below
// moved from spread+override to full explicit PROJECTION — a brand-new object
// naming every field, never `{ ...source, ... }`. See the note above S01-C2-1
// and S01-C2-0B's table for why: `provenance_ref` was leaking the same secret
// as `replay_handle` under a different name on THREE sites, and a spread would
// have kept leaking it even after this fix's redacted-field list was correct,
// the moment any field's classification changed without the override list
// being updated to match.
// REDACTION-CORRECTNESS thread, round 3 (`t_3d2c21e9`, FINAL): `source` is
// now a per-call parameter, not always copied. Own trace this round:
// `base_score.source`/`final_strength.source` are BOTH populated from the
// SAME raw_artifact_id `node.provenance_ref` already redacts (judgement's
// `reduced_judgement.source_ref` and the propagation path's
// `node_strength_record.source_ref` are each bound to that node's own
// `provenanceRef` at their write site — see S01-C2-0B's table for the
// full producer trace of both). `edge.strength.number.source` is NOT
// aliased — its producer is `edge.strength_source`, a `StrengthSource`
// ENUM (own trace: `packages/db/src/schema.ts:259`,
// `packages/graph/src/index.ts`), never a ledger-row pointer — redacting
// it would destroy legitimate content for no security reason, which is
// exactly the over-correction this round's own fixed-point rule (below)
// exists to prevent as much as under-correction.
function redactLabeledNumber(n: LabeledNumber, opts: { redactSource: boolean }): LabeledNumber {
  return {
    value: n.value,
    kind: n.kind,
    source: opts.redactSource ? "REDACTED_OWNER_ONLY" : n.source,
    producer: n.producer,
    provenance_ref: "REDACTED_OWNER_ONLY",
    replay_handle: "REDACTED_OWNER_ONLY"
  };
}

function redactNodeForPublic(node: Node): Node {
  return {
    node_id: node.node_id,
    claim: node.claim,
    way_of_knowing: node.way_of_knowing,
    base_score: redactLabeledNumber(node.base_score, { redactSource: true }),
    final_strength: node.final_strength === null ? null : redactLabeledNumber(node.final_strength, { redactSource: true }),
    // NEW this round: node-level provenance_ref is a separate field from
    // base_score's — an FK into ledger.raw_artifact, own trace in S01-C2-0B's
    // table. No confirmed alias, redacted on minimal-disclosure grounds.
    provenance_ref: "REDACTED_OWNER_ONLY",
    // MakerLineageSchema is COPIED, VERIFIED this round (own trace: static
    // deployment-config identifiers, not a per-call secret) — passed through
    // by reference, not spread; the value itself was already built by
    // packages/serve's own projectNodeMakerLineage, which names its own
    // fields explicitly.
    maker_lineage: node.maker_lineage,
    review: node.review === null ? null : {
      outcome: node.review.outcome,
      reasons: node.review.reasons,
      // NEW this round: same producer KIND as node-level provenance_ref
      // above (also an ledger.raw_artifact FK) — redacted for the same
      // reason.
      provenance_ref: "REDACTED_OWNER_ONLY",
      reviewer_lineage: node.review.reviewer_lineage
    },
    locator: node.locator,
    // REWORK ROUND 2 (B2): PROJECT, never spread, an open-ended shape.
    // stranger_restatement is `.passthrough()` — the source object may carry
    // any extra key beyond check_status. Naming check_status explicitly on a
    // FRESH object is what actually closes it.
    stranger_restatement: { check_status: node.stranger_restatement.check_status },
    defeater_refs: node.defeater_refs,
    defeater_exhaustion_marked: node.defeater_exhaustion_marked,
    // disagreement is `z.record(string, unknown())` — a genuinely unconstrained
    // bag with no named keys to project onto. Redacted wholesale to `null`,
    // which the schema already allows (`.nullable()`) — not an invented
    // placeholder.
    disagreement: null,
    condition_marks: node.condition_marks,
    abstention: node.abstention === null
      ? null
      : {
          kind: node.abstention.kind,
          question_class: node.abstention.question_class,
          risk_tier: node.abstention.risk_tier,
          price: node.abstention.price,
          // COPIED, VERIFIED this round — own trace: policy/deployment
          // register citations, not a per-execution ledger pointer.
          register_row_key: node.abstention.register_row_key,
          register_version: node.abstention.register_version,
          register_source_ref: node.abstention.register_source_ref,
          unlock_condition: node.abstention.unlock_condition,
          ledger_unknown_ref: "REDACTED_OWNER_ONLY"
        },
    staleness_state: node.staleness_state,
    relevant_as_of: node.relevant_as_of
  };
}

function redactEdgeForPublic(edge: Edge): Edge {
  return {
    edge_id: edge.edge_id,
    from_node_ref: edge.from_node_ref,
    target_kind: edge.target_kind,
    target_ref: edge.target_ref,
    relation: edge.relation,
    strength: edge.strength.status !== "PRESENT"
      ? edge.strength
      : { status: "PRESENT", number: redactLabeledNumber(edge.strength.number, { redactSource: false }) },
    // NEW this round: edge-level provenance_ref is THE defect this round
    // exists to fix — own probe confirmed it is the IDENTICAL value as
    // strength.number.replay_handle, not merely "the same bucket." The old
    // code never redacted this field at all (not even for the PRESENT arm),
    // and the UNKNOWN arm's early `return edge;` never touched it either.
    provenance_ref: "REDACTED_OWNER_ONLY",
    placeholder: edge.placeholder
  };
}
```
`redactLabeledNumber` is shared across all three `replay_handle`/`provenance_ref`-reachable
sites (`node.base_score`, `node.final_strength`, `edge.strength.number`)
so the redaction constants and field names are written exactly once.
**`redactNodeForPublic` now performs TWO different kinds of closure, not
one — worth stating precisely so a reviewer checks the right thing for
each:** (a) VALUE REDACTION for `base_score`/`final_strength`/`abstention.ledger_unknown_ref`
— the KEY is required and kept, only the secret VALUE is replaced,
because the field is a fixed, named, required string; (b) SHAPE PROJECTION
for `stranger_restatement`/`disagreement` — the source object's shape is
NOT trusted at all, a fresh object is constructed naming only what is kept
(`check_status`) or the whole field is set to a schema-valid empty value
(`null`), because a spread of an open shape carries forward whatever keys
happen to be there, known or not. **Using the wrong closure for the wrong
kind of field is exactly B2's defect** — round 1 used VALUE REDACTION
correctly for the two required-string handles, then WRONGLY tried to let
the same reasoning ("keep the object via spread, we've patched the two
fields we know about") cover the two open-shape fields, which cannot be
closed by patching known fields because their entire risk is in the
UNKNOWN ones.
**Why the value-redacted fields exist as VALUES, not omissions:**
`AbstentionSchema.ledger_unknown_ref`, `LabeledNumberSchema.replay_handle`/`.provenance_ref`,
`NodeSchema.provenance_ref`, `NodeReviewSchema.provenance_ref`, and
`EdgeSchema.provenance_ref` (`packages/contract/src/index.ts:389,310-311,430,419,455`)
are all REQUIRED, non-optional `z.string()` fields — none can simply be
OMITTED (unlike a top-level forbidden field, which is excluded by never
being written) without either changing the shared schema itself (out of
scope, used by owner code too) or failing `PublicDebateSchema.parse()`'s
required-field check.
No other line in `publish()` changes. The existing guard at line 123
(`input.answer.terminal === "BLOCKED"` → `return null`) already ensures
this only runs for non-BLOCKED answers, matching SPEC R1's "when an owner
publishes a non-BLOCKED answer" condition — no new guard needed.
**Acceptance test:** (**REDACTION-CORRECTNESS thread, round 2,
`t_83a9eb08`: fixed-line-range REMOVED — see the Clusters section's
round-2 note for why**) `grep -c "redactNodeForPublic\|redactEdgeForPublic" apps/api/src/publications.ts`
returns `≥2` (one call site each, `nodes.map(...)` and `edges.map(...)`,
plus the two function definitions — whole-file, no range, since both
names are unique identifiers anywhere in this file);
`sed -n '/function redactNodeForPublic/,/^}/p' apps/api/src/publications.ts | grep -c '\.\.\.node'`
returns `0` and `sed -n '/function redactEdgeForPublic/,/^}/p' apps/api/src/publications.ts | grep -c '\.\.\.edge'`
returns `0` (**REDACTION-CORRECTNESS thread, round 1: strengthened from
checking two named fields to checking for ANY spread of the source object
at all** — a spread anywhere in either function is how a field's
classification silently stops matching its implementation, which is this
round's whole defect, not just B2's; a stranger reading the diff can
check this without running anything); `pnpm run typecheck` exits 0
(confirms both mapped arrays' return types, `Node[]`/`Edge[]`, are
assignable to `z.array(NodeSchema).optional()`/`z.array(EdgeSchema).optional()`
— each redaction function must be typed `(node: Node) => Node` / `(edge:
Edge) => Edge`, not a narrower type, precisely so this stays true).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly, via `grep -c`'s own exit code.** Run
2026-08-29: `grep -c "redactNodeForPublic\|redactEdgeForPublic"
apps/api/src/publications.ts` (**REDACTION-CORRECTNESS thread, round 2:
range removed here too, same fix as the acceptance line above**) → prints
`0`, shell exit 1 (grep's own convention: exit 1 when the match count is
zero) — neither function exists yet on the main tree. No fix needed:
`grep -c` already encodes RED/GREEN correctly in its exit status, unlike
a vitest `-t` filter matching zero tests.
**Failure it CATCHES:** a publish that silently keeps dropping the tree
(the pre-S01 behavior) — this step is the entire fix for R1's "new
publishes carry the tree" requirement at the write side. Also now catches
(round 1 of ACCEPTANCE-COMMAND) an edge's `PRESENT` strength carrying a
live `replay_handle` into the public envelope, (round 2) either
open-ended field surviving via a spread instead of a projection, and
(REDACTION-CORRECTNESS round 1) `provenance_ref` leaking the identical or
derivable secret on `LabeledNumberSchema`, `EdgeSchema`, `NodeSchema`, or
`NodeReviewSchema`. **What the full-projection shape actually buys, stated
precisely and not overclaimed:** it forces a compile error the moment a
FUTURE field is added to `NodeSchema`/`EdgeSchema`/etc. and this function
is not updated to name it (no field can silently ride through on a
spread) — it does NOT by itself stop someone from changing an EXISTING
named line back to a pass-through value (`provenance_ref: node.provenance_ref`
still typechecks); that regression is still only caught at runtime, by
S01-C2-9's aliased-fixture residual test below.
**Failure it MISSES:** does not catch the tree being copied but with the
WRONG node objects (e.g. accidentally passing `input.answer.edges` twice)
— caught by S01-C2-2's assertion on field identity, not this grep. Does
not catch a REDACTED field being redacted to the WRONG constant (e.g. an
empty string, which would then fail `AbstentionSchema`'s own
`.trim().min(1)` re-parse) — caught by S01-C2-4/C2-5's tests actually
running `PublicDebateSchema.parse()` on the result, not by this step's
grep/typecheck alone.

### S01-C2-2 — Test: publish() output contains the input tree, minus the two named redactions, verbatim

**REWORK ROUND 1 (N3, `t_19926850`):** round 0's acceptance criterion said
"`result.answer.nodes` deep-equals the input `nodes` array" unconditionally
— that criterion CANNOT both pass and satisfy S01-C2-0B/C2-1's redaction
(a redacted node is, by construction, not deep-equal to its input). Fixed
below by scoping the deep-equal to an explicit redaction-aware comparison
instead of a blanket one — this is the SAME pass as B1, per the brief's
instruction, not a separate round.

**Cluster:** S01-C2
**File surface:** `tests/unit/s8-publication.test.ts` (new `it()` block,
follows the existing pattern at lines 371-410 that already constructs a
fake `Answer`, calls `publish()`/equivalent, and inspects the resulting
ciphertext's decrypted shape)
**Change:** Write a test that builds an `Answer`-shaped object with a
non-empty `nodes` array (at least 2 nodes, at least one with a non-null
`abstention`, and at least one node's `stranger_restatement`/`disagreement`
carrying extra/populated content — see S01-C2-7/8 for the dedicated
residual tests on those two; this step's own fixture just needs to not
accidentally pass by having empty/absent bags) and non-empty `edges` array
(at least 1 edge with `strength.status === "PRESENT"`), calls the same
`publish()` path the existing tests around line 371 exercise, decrypts the
resulting stored `PublicDebate`, and asserts, PER NODE and PER EDGE, not
as a single blanket deep-equal:
- every field on `result.answer.nodes[i]` deep-equals the corresponding
  input field EXCEPT `base_score.replay_handle`, `final_strength.replay_handle`
  (when non-null), `abstention.ledger_unknown_ref` (when non-null),
  `stranger_restatement`, and `disagreement` — concretely, build an
  "expected" object by spreading the input node and overwriting exactly
  those paths (`"REDACTED_OWNER_ONLY"` for the three value-redacted paths,
  `{ check_status: input node's own check_status }` for
  `stranger_restatement`, `null` for `disagreement`), then deep-equal
  AGAINST THAT expected object, not the raw input — **REWORK ROUND 2
  (B2):** this list grew from 3 exceptions to 5; the two new ones are
  PROJECTIONS/nulling, not value substitutions, so the "expected" object
  builder must construct a fresh sub-object for `stranger_restatement`
  (not spread the input's), matching S01-C2-1's own fix exactly;
- the same pattern for `result.answer.edges[i]`, overwriting
  `strength.number.replay_handle` when `strength.status === "PRESENT"`;
- `result.answer.tree_included === true`.
This is stricter than round 1's version, not weaker: it still fails on
ANY unintended field drift, and additionally fails if a projected field
carries through ANY extra key the input had (including the original
secret content — the regression B2 exists to prevent), not just if a
value-redacted field carries the wrong constant.
**Acceptance test:** `out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts -t "publish.*tree|tree.*publish" 2>&1); vt=$?; sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1); printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?; [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]`
exits 0 (both `$vt` and `$guard` are 0). (Worker names the `it()` block so
this grep matches; if named differently, the acceptance test is simply
that the new `it()` block passes when the whole file is run — cluster
command already covers this.) **ROUND 4 (`t_e1208546`): the `-t` pattern
was `\|`-escaped before this round, which is a JS-regex literal pipe, not
alternation — matched zero tests. Now real (unescaped) alternation,
verified against the coder's finished worktree:** `vt=0 guard=0`,
`2 passed | 19 skipped (21)`. See the Clusters section's ROUND 4 note for
the full reproduction.
**Category (REWORK ROUND 3 of this thread — FINAL, PLAN-05, `t_f910328a`):
FEATURE-ASSERTION — observed pre-fix RED, correctly, on the round-3
ANCHORED capture-then-check idiom** (round 2's unanchored version was
vulnerable to a polluting test title — see the Clusters section's
`t_f910328a` note for the reproduction and the verified 7-case matrix;
converted here for the same reason, not because THIS input triggered the
bug). Re-run 2026-08-29 (main tree, still pre-S01-CODE): `vt=0`, `guard=1`
(summary `Tests  13 skipped (13)`, anchored — no test title in this file
can satisfy it) — compound condition false, correctly RED.
**Failure it CATCHES:** a publish path that copies the tree by REFERENCE
in a way that could be mutated after publish, a copy-paste error (e.g.
`edges: input.answer.nodes`), AND (round 1) a redaction that either fails
to fire (the real secret value survives) or over-fires (a field outside
the two named paths gets clobbered) — the per-path expected-object
construction makes both directions of that mistake visible in one
assertion.
**Failure it MISSES:** does not catch the tree failing to survive the
actual ENCRYPT/DECRYPT round trip (a serialization bug in the cipher
itself) — that is S01-C3's concern, one layer down.

### S01-C2-3 — Confirm no forbidden field is copied alongside the tree

**REDACTION-CORRECTNESS thread, round 2 (blocking, `t_83a9eb08`): this
step is what the round-2 brief names "S01-C4-2"** (the step-ID in that
brief does not match this PLAN's own numbering — checked, this step's
actual ID is `S01-C2-3`; the SUBSTANCE of the brief's finding is exactly
right regardless of which ID names it, and is fixed below). **This was
the DANGEROUS half of the block: a negative assertion that PASSES over
the wrong region always passes, so nothing would ever have flagged it.**
Own re-run against the coder's worktree, before changing anything:
`sed -n '153,175p' apps/api/src/publications.ts` now shows
`auditPreflightDenial` — code with nothing to do with publishing; the
real envelope construction (`const publicDebate = PublicDebateSchema.parse({...})`)
now runs from line 221 to 240. The OLD acceptance's "no output, exit 1"
observation was therefore true for the WRONG reason: not because the
forbidden fields are absent from the envelope, but because the range no
longer contains the envelope at all.

**Cluster:** S01-C2
**File surface:** the `publish()` method's `PublicDebateSchema.parse({...})`
literal (currently `apps/api/src/publications.ts:221-240`; anchored below
so the file surface note itself does not need updating on the next drift)
**Change:** none (verification-only step; this confirms decision 2 above
was actually followed, not just decided).
**Acceptance test:** (**line range replaced with a symbol-anchored range,
matching this round's remedy shape**) `sed -n '/const publicDebate = PublicDebateSchema.parse({/,/^    });/p' apps/api/src/publications.ts | grep -E "memory_disclosure|cost_envelope|tier_provenance_ref|ledger_digest_handle|inspection_handle|risk_tier|tier_source"`
returns no output (exit code 1, grep convention for "no match").
**Demonstrated capable of FAILING when a forbidden field IS present, per
the brief's explicit instruction — own run against the worktree, piped
text only, no product file touched (`git status --porcelain apps/api/src/publications.ts`
confirmed unchanged before and after):**
```
$ sed -n '/const publicDebate = PublicDebateSchema.parse({/,/^    });/p' apps/api/src/publications.ts \
    | sed 's/tree_included: true/tree_included: true, cost_envelope: input.answer.cost_envelope/' \
    | grep -cE "memory_disclosure|cost_envelope|tier_provenance_ref|ledger_digest_handle|inspection_handle|risk_tier|tier_source"
1
```
A forbidden field artificially injected into the piped text (never the
real file) is caught — `1` match, exit 0 (would fail the acceptance) —
proving this check discriminates, unlike the old range which would have
returned the SAME "no output" result whether or not a forbidden field
had been added, because it was no longer even reading the envelope.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly, RE-VERIFIED round 2 against the
anchored range.** Run 2026-08-29, against the coder's worktree: no
output, exit 1 — none of the seven forbidden field names appear in the
real envelope literal today, and this must stay true forever (Change:
none; this step verifies an invariant, it does not introduce one).
`grep`'s own exit-code convention (1 = no match = pass here) still
discriminates correctly; the fix this round is WHAT TEXT is piped to it,
not the grep itself.
**Failure it CATCHES:** a well-intentioned future edit that adds "just one
more" honesty field to the publish literal without updating
`PublicDebateSchema` first — the schema's `.strict()` would already reject
it, but this grep catches the ATTEMPT at the publish-path source, which is
a faster/cheaper signal than a runtime parse failure surfacing as a publish
500. **As of round 2, also catches itself drifting onto the wrong region**
— the anchor is a `PublicDebateSchema.parse(` call, so as long as
`publish()` keeps building the envelope via that call (true today, and
required by S01-C2-1's own acceptance), the anchor finds it regardless of
surrounding insertions.
**Failure it MISSES:** does not catch a forbidden field added under a
DIFFERENT key name that isn't in this literal grep list (e.g. a renamed
alias) — the schema's own `.strict()` plus the standing architecture test
(`tests/architecture/s8-publication-contract.test.ts:130-133`) is the real
backstop for that. Does not catch `publish()` being rewritten to build the
envelope WITHOUT a `PublicDebateSchema.parse({...})` call shaped exactly
like this anchor (e.g. building the object in a named variable first,
then parsing it two lines later) — the anchor is narrower than "wherever
the envelope is built," same limit stated for every anchor this round.

### S01-C2-4 — Test: `ledger_unknown_ref` is redacted on any published node that abstained

**Cluster:** S01-C2
**File surface:** `tests/unit/s8-publication.test.ts` (new `it()` block)
**Change:** Write a test that builds an `Answer` with at least one node
whose `abstention` is non-null and whose `abstention.ledger_unknown_ref`
is a distinctive real-looking value (e.g. `"real-ledger-ptr-9f2a"`),
publishes it (real `publish()` path), decrypts the result, and asserts
`result.answer.nodes.find(n => n.node_id === thatNodeId).abstention.ledger_unknown_ref
=== "REDACTED_OWNER_ONLY"` (i.e. NOT the original value) while every
OTHER field on that same node's `abstention` (`kind`, `question_class`,
`risk_tier`, `price`, `register_row_key`, `register_version`,
`register_source_ref`, `unlock_condition`) matches the input verbatim —
proving this is a targeted single-field redaction, not a wholesale drop
of abstention data.
**Acceptance test:** `out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts -t "ledger_unknown_ref|redact" 2>&1); vt=$?; sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1); printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?; [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]`
exits 0. **ROUND 4 (`t_e1208546`): pattern was `\|`-escaped (literal pipe,
matched zero tests); now real alternation, verified against the coder's
finished worktree:** `vt=0 guard=0`, `2 passed | 19 skipped (21)`.
**Category (REWORK ROUND 3 of this thread — FINAL, PLAN-05, `t_f910328a`):
FEATURE-ASSERTION — observed pre-fix RED, correctly, on the round-3
ANCHORED capture-then-check idiom** (converted from round 2's unanchored
version, vulnerable to a polluting test title — see Clusters section's
`t_f910328a` note). Re-run 2026-08-29: `vt=0`, `guard=1` (`13 skipped
(13)`) — RED, correctly.
**Failure it CATCHES:** exactly the leak S01-C2-0 names — a published
debate exposing a real ledger pointer for any node that abstained. Also
catches an over-broad "fix" that redacts the WHOLE `abstention` object
(losing legitimate read content like `kind`/`risk_tier`) instead of the
one field that actually needs it.
**Failure it MISSES:** does not independently re-verify `register_row_key`/
`register_version`/`register_source_ref`'s safety on every run — those
are deliberately NOT redacted, and this test's "matches the input
verbatim" assertion on them only checks that TODAY's fixture value passes
through, not that the classification itself is correct. **REDACTION-CORRECTNESS
thread, round 1 (`t_9e9e04ef`): the classification is no longer merely
"deliberately not redacted, S04's open review scope" — own trace (S01-C2-0B's
table) followed `register_source_ref` to its real producer
(`packages/memory/src/index.ts:753`, `policy.sourceRef`) and confirmed it
is a policy/deployment-register citation, not a ledger execution pointer,
the same class as already-public `DeploymentSchema`/`BandCeilingSchema`
register data. No longer open on S04's checklist; if a FUTURE trace finds
a different producer path assigning these fields a ledger-pointer value
instead, that is a new finding against THIS trace, to be filed as a fresh
PLAN revision — not something this test can pre-empt on its own.

### S01-C2-5 — REWORK ROUND 1 (B1): Test: `replay_handle` is redacted on `base_score`, `final_strength`, and edge `strength.number`

**Cluster:** S01-C2
**File surface:** `tests/unit/s8-publication.test.ts` (new `it()` block,
sibling to S01-C2-4, same file)
**Change:** Write a test that builds an `Answer` with at least one node
whose `base_score.replay_handle` and `final_strength.replay_handle` (make
`final_strength` non-null for this fixture) are distinctive real-looking
values (e.g. `"real-replay-ptr-b2c1"`, a DIFFERENT string per site so a
copy-paste redaction bug that redacts the wrong site is visible), and at
least one edge whose `strength.status === "PRESENT"` with its own
distinctive `strength.number.replay_handle`. Publish (real `publish()`
path), decrypt, and assert all three sites read
`"REDACTED_OWNER_ONLY"` in the result, while `value`/`kind`/`source`/
`producer` on each of the three `LabeledNumberSchema` instances match the
input verbatim (same "targeted redaction, not wholesale drop" proof
pattern as S01-C2-4). **REDACTION-CORRECTNESS thread, round 1
(`t_9e9e04ef`): `provenance_ref` is REMOVED from the "matches input
verbatim" list — it is now ALSO asserted `=== "REDACTED_OWNER_ONLY"` on
all three `LabeledNumberSchema` sites, same as `replay_handle`.** Own
trace (S01-C2-0B's table) established `provenance_ref` carries the
identical or a derivable value to `replay_handle`'s own secret; a test
that still asserted it "matches input verbatim" would assert the OLD,
now-wrong classification and fail against the corrected redaction
functions above.
**Acceptance test:** `out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts -t "replay_handle" 2>&1); vt=$?; sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1); printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?; [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]`
exits 0.
**Category (REWORK ROUND 3 of this thread — FINAL, PLAN-05, `t_f910328a`):
FEATURE-ASSERTION — observed pre-fix RED, correctly, on the round-3
ANCHORED capture-then-check idiom** (mechanism: see Clusters section's
`t_f910328a` note). Re-run 2026-08-29: `vt=0`, `guard=1` (`13 skipped
(13)`) — RED, correctly.
**Failure it CATCHES:** the exact leak B1 names — a published debate
exposing a real, DB-backed replay pointer via any node's `base_score`,
`final_strength`, or any edge's `PRESENT` strength. Using three DIFFERENT
distinctive values (not the same string three times) specifically catches
a redaction that fires at one or two of the three sites but not the third
— round 0's actual defect shape (fixed `abstention`, never walked
`base_score`/`final_strength`/edge `strength`).
**Failure it MISSES:** does not catch a fourth, still-undiscovered
`LabeledNumberSchema`-reachable site if one exists outside `NodeSchema`/
`EdgeSchema` (S01-C2-0B's enumeration is scoped to exactly those two
schemas, per the brief's own instruction — a site reachable from some
OTHER schema this mission doesn't touch is out of this test's reach by
construction, not by oversight). **Also, as of round 0 through round 4,
did NOT catch the aliasing leak this round found**, and this is worth
being explicit about rather than letting it look like this test should
have caught it: this fixture gives every site a DIFFERENT distinctive
value specifically so a copy-paste redaction bug is visible (see
"Change" above) — which means it can never construct the case where TWO
fields share ONE producer value, the exact shape of this round's real
defect. A fixture that never aliases two fields the way production does
cannot fail against a production that does alias them — this is
`t_9e9e04ef`'s N1 finding, fixed by S01-C2-9 below, not by broadening
this test (this test's OWN job — catching a redaction that fires at one
site but not another — needs distinct values and would be weakened by
aliasing them).

### S01-C2-6 — REWORK ROUND 1 (B1): the failing regression test for residual handles

**This is the step whose acceptance test the brief asked to be named
explicitly as a failing test — not a euphemism for "a test exists," a
literal RED-before-GREEN requirement satisfied the same way S01-C1-3/4
satisfies it for back-compat.**

**Cluster:** S01-C2
**File surface:** `tests/unit/s8-publication.test.ts` (new `it()` block)
**Change:** Write ONE test, independent of S01-C2-4/C2-5's targeted
assertions, that: (1) builds an `Answer` whose EVERY handle-shaped field
identified in S01-C2-0B's enumeration (`base_score.replay_handle`,
`final_strength.replay_handle`, edge `strength.number.replay_handle`,
`abstention.ledger_unknown_ref`) is set to its own distinctive marker
string (four distinct markers, e.g. `"MARKER-1"`..`"MARKER-4"`); (2)
publishes it through the real `publish()` path; (3) `JSON.stringify`s the
decrypted `PublicDebate` result; (4) asserts NONE of the four marker
strings appear anywhere in that JSON string (`expect(json).not.toContain(marker)`
for each). **Run this test BEFORE `redactNodeForPublic`/`redactEdgeForPublic`
exist (i.e. against round 0's `publish()`, before S01-C2-1's rework
edit lands) to confirm it FAILS** — this is the literal reproduction of
B1 the brief asked for, now captured as a permanent, re-runnable
regression test rather than a one-time manual grep. After S01-C2-1's
redaction lands, the same test must pass.
**Acceptance test:** `out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts -t "residual.*handle|handle.*residual" 2>&1); vt=$?; sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1); printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?; [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]`
**ROUND 4 (`t_e1208546`): pattern was `\|`-escaped (literal pipe, matched
zero tests); now real alternation, verified against the coder's finished
worktree:** `vt=0 guard=0`, `1 passed | 20 skipped (21)`.
exits 0 AFTER the S01-C2-1 rework lands; the worker's own RED-before-GREEN
evidence (required by `heartbeat-protocol` §2.5 on every rework round) is
running this exact test against the PRE-rework `publications.ts` first and
recording the failure, per this step's own instruction above.
**Category (REWORK ROUND 3 of this thread — FINAL, PLAN-05, `t_f910328a`):
FEATURE-ASSERTION — observed pre-fix RED, correctly, on the round-3
ANCHORED capture-then-check idiom.** This step's own text demands proof
of a genuine pre-fix FAILURE, which is exactly what an unanchored guard
cannot guarantee (a polluting test title in the RED-before-GREEN evidence
itself could satisfy it — see Clusters section's `t_f910328a` note).
Re-run 2026-08-29: `vt=0`, `guard=1` (`13 skipped (13)`) — RED, correctly.
**Failure it CATCHES:** exactly what a name-matching test (like
S04-C1-1's schema-key introspection) structurally cannot: a handle whose
FIELD NAME doesn't match any known forbidden pattern but whose VALUE is a
live secret the worker forgot to redact — this test doesn't care about
field names at all, only about whether a specific real value survives
into the output. It is the mechanical, re-runnable form of "enumerate the
handle class exhaustively" — if a FIFTH handle site is ever added to
`NodeSchema`/`EdgeSchema` and NOT redacted, this test stays silent (it
only checks the four markers it was given), which is why S01-C2-0B's
table — not this test alone — is the actual completeness guarantee; this
test is the regression guard for the FOUR sites already found, not a
general handle-discovery mechanism.
**Failure it MISSES:** a handle-shaped field this session's own
enumeration missed (S01-C2-0B is this seat's best walk of `NodeSchema`/
`EdgeSchema`, not a formally exhaustive proof — see this PLAN's own
"Failure it MISSES" note on that table). Grok's review is expected to
probe for exactly that possibility.

### S01-C2-7 — REWORK ROUND 2 (B2): the failing residual test for `stranger_restatement`

**One test per bag, per the brief's explicit instruction ("Not one test
for the class — one per member, so a future regression names which bag
reopened"). This is the `stranger_restatement` member's own test —
S01-C2-8 below is `disagreement`'s, deliberately separate, not merged.**

**Cluster:** S01-C2
**File surface:** `tests/unit/s8-publication.test.ts` (new `it()` block)
**Change:** Write a test that builds an `Answer` with at least one node
whose `stranger_restatement` is `{ check_status: "PASS", secret_extra:
"LEAK-ME-RESTATEMENT", owner_note: "do-not-publish" }` (an UNEXPECTED key
beyond the schema's one named field, exactly as `.passthrough()` allows —
matching this seat's own round-2 reproduction script). Publish (real
`publish()` path), decrypt, `JSON.stringify` the result, and assert:
(1) `result.answer.nodes.find(...).stranger_restatement` deep-equals
EXACTLY `{ check_status: "PASS" }` — no other key present, not merely "the
leaked key has a redacted value" (there is no key to redact-in-place here,
the fix is a rebuild, so the assertion must check the object's OWN key set,
e.g. `Object.keys(result....stranger_restatement)` deep-equals `["check_status"]`);
(2) the full published JSON does NOT contain the string `"LEAK-ME-RESTATEMENT"`;
(3) does NOT contain `"do-not-publish"`.
**Run this test BEFORE S01-C2-1's round-2 projection fix lands (i.e.
against the round-1 spread-based `redactNodeForPublic`) to confirm it
FAILS** — this is this seat's own B2 reproduction script (see the finding
note above), now captured as a permanent, re-runnable regression test,
matching this round's explicit "reproduce it before you patch it, then
keep the reproduction as a test" instruction.
**Acceptance test:** `out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts -t "stranger_restatement" 2>&1); vt=$?; sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1); printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?; [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]`
exits 0 AFTER the round-2 fix lands; the worker's RED-before-GREEN
evidence (required by `heartbeat-protocol` §2.5 on every rework round) is
running this exact test against the PRE-fix `publications.ts` first and
recording the failure.
**Category (REWORK ROUND 3 of this thread — FINAL, PLAN-05, `t_f910328a`):
FEATURE-ASSERTION — observed pre-fix RED, correctly, on the round-3
ANCHORED capture-then-check idiom.** Re-run 2026-08-29: `vt=0`, `guard=1`
(`13 skipped (13)`) — RED, correctly.
**Failure it CATCHES:** exactly B2 for this specific bag — any extra key
on `stranger_restatement` surviving into the public envelope, by name
(the `Object.keys` assertion) and by content (the string-absence
assertions, which catch a bug where the KEY set looks right but a VALUE
was accidentally left populated some other way).
**Failure it MISSES:** a leak via `disagreement` (S01-C2-8's job) or via a
THIRD open-ended bag this round's sweep did not find (see the sweep's own
"exactly two members" claim above — Grok's review is expected to probe
that claim, not just this test).

### S01-C2-8 — REWORK ROUND 2 (B2): the failing residual test for `disagreement`

**Cluster:** S01-C2
**File surface:** `tests/unit/s8-publication.test.ts` (new `it()` block,
sibling to S01-C2-7, same file, deliberately a SEPARATE test)
**Change:** Write a test that builds an `Answer` with at least one node
whose `disagreement` is `{ internal_note: "LEAK-ME-DISAGREEMENT",
ledger_ptr: "secret-ptr-9f2a" }` (a non-null, populated open record —
matching this seat's own round-2 reproduction script). Publish, decrypt,
`JSON.stringify` the result, and assert: (1)
`result.answer.nodes.find(...).disagreement === null` exactly (not an
empty object `{}`, not a partially-stripped object — `null`, matching
S01-C2-1's `disagreement: null` fix precisely, and matching the schema's
own `.nullable()` allowance); (2) the full published JSON does NOT contain
`"LEAK-ME-DISAGREEMENT"`; (3) does NOT contain `"secret-ptr-9f2a"`.
**Run this test BEFORE S01-C2-1's round-2 fix lands to confirm it FAILS**
— same RED-before-GREEN requirement as S01-C2-7, and the SAME reproduction
already run once by this seat (own script, this PLAN's finding note
above) and once each by the reviewer and the Router — three independent
reproductions of the same defect before this test existed as a permanent
artifact.
**Acceptance test:** `out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts -t "disagreement" 2>&1); vt=$?; sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1); printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?; [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]`
exits 0 AFTER the round-2 fix lands.
**Category (REWORK ROUND 3 of this thread — FINAL, PLAN-05, `t_f910328a`):
FEATURE-ASSERTION — observed pre-fix RED, correctly, on the round-3
ANCHORED capture-then-check idiom.** Re-run 2026-08-29: `vt=0`, `guard=1`
(`13 skipped (13)`) — RED, correctly.
**Failure it CATCHES:** exactly B2 for this specific bag — this is the
member the brief singled out ("The reviewer's fix does NOT touch this one
— that is why it is here") as the one most likely to be left open by a
partial fix that only handles `stranger_restatement`. This test fails
independently of S01-C2-7, so a regression that reopens ONLY `disagreement`
(e.g. a future refactor that accidentally spreads `node.disagreement`
again while leaving `stranger_restatement`'s projection intact) is named
correctly rather than blamed on the wrong bag.
**Failure it MISSES:** does not prove `null` is the RIGHT product choice
for `disagreement` (as opposed to, say, a future decision to project it to
named keys once the underlying data is better understood) — it proves
today's chosen closure (`null`) is what actually ships, which is the
acceptance criterion this step owns; whether `null` remains the right
choice long-term is a product question, not this test's job.

### S01-C2-9 — REDACTION-CORRECTNESS thread, round 1 (`t_9e9e04ef`): `provenance_ref` redaction, with fixtures that ALIAS the way production does

**This step exists because S01-C2-5/C2-6's fixtures could not have caught
this round's real defect even in principle — N1, non-blocking but fixed in
this same pass, per the brief.** Every prior fixture in this file gives
each handle-shaped field its OWN distinctive marker value, deliberately,
so a copy-paste redaction bug (fixing site A but not site B) is visible.
That is the right shape for THAT failure mode. It is the WRONG shape for
THIS one: production's `projectServeEdge` assigns the SAME source value to
THREE fields at once (own trace, `packages/serve/src/index.ts:173-177`),
and a fixture that never aliases two fields the way production does cannot
fail against a production that does alias them — confirmed directly: this
seat aliased the edge fixture in the leak-probe to production's exact
shape and the residual assertion FAILED against the pre-fix redaction
functions; restoring independent per-field values made it pass again
regardless of whether the real leak was fixed. **The fixture WAS the reason
the tests stayed green. This step's fixtures are deliberately
production-shaped, not merely distinctive, to close that gap — and this is
the general rule for every future residual test in this file, not only
this one: a fixture must reproduce every KNOWN aliasing/derivability
relationship a real producer creates, not just assign each field a
different-looking string.**

**Cluster:** S01-C2
**File surface:** `tests/unit/s8-publication.test.ts` (two new `it()`
blocks, siblings to S01-C2-5/C2-6, same file)
**Change, test A (edge alias):** build an `Answer` with one edge whose
`strength.status === "PRESENT"` and whose `strength.number.provenance_ref`,
`strength.number.replay_handle`, AND the edge-level `provenance_ref` are
ALL set to the SAME single secret string (mirroring `projectServeEdge`'s
`row.provenanceRef` reuse exactly — this is the shape, not an incidental
choice). Publish, decrypt, and assert: (1) `strength.number.replay_handle
=== "REDACTED_OWNER_ONLY"`; (2) `strength.number.provenance_ref ===
"REDACTED_OWNER_ONLY"`; (3) the edge-level `provenance_ref ===
"REDACTED_OWNER_ONLY"`; (4) the full published JSON does NOT contain the
secret string anywhere (`JSON.stringify(result)` does not include it) —
assertion (4) is the one that actually catches an aliasing leak, since
(1)-(3) alone could all pass on a fixture that never shared the value in
the first place.
**Change, test B (node-prefix derivability):** build an `Answer` with one
node whose `base_score.provenance_ref` is a raw id string (e.g. a UUID)
and whose `base_score.replay_handle` is that SAME string with the known
production prefix prepended (`` `judgement:${provenance_ref}` `` — mirrors
`packages/serve/src/index.ts:2078-2079`'s real relationship exactly).
Publish, decrypt, and assert: (1) `base_score.replay_handle ===
"REDACTED_OWNER_ONLY"`; (2) `base_score.provenance_ref ===
"REDACTED_OWNER_ONLY"` (NOT the raw id — this is the assertion S01-C2-5
does not make); (3) reconstructing `` `judgement:${result...base_score.provenance_ref}` ``
does NOT equal the original `replay_handle` value (proves the redacted
`provenance_ref` no longer carries enough information to rebuild the
secret via the known transform — the derivability check, not just a
presence check).
**Change, test C (node/review-level `provenance_ref`):** build an `Answer`
with one node whose top-level `provenance_ref` (NOT `base_score`'s) and
whose `review.provenance_ref` (non-null review) are both distinctive
marker strings. Publish, decrypt, and assert both read
`"REDACTED_OWNER_ONLY"`, while `review.outcome`/`.reasons`/`.reviewer_lineage`
match the input verbatim (targeted redaction, not a wholesale drop of
review content).
**Change, test D (REDACTION-CORRECTNESS thread, round 3, `t_3d2c21e9`;
CORRECTED under V-DECISIONS-PACKET Row 7, ratified `t_956bde4a` — `.source`
alias, N1's fix): build an `Answer` with one node whose top-level
`provenance_ref`, `base_score.source`, AND `final_strength.source` are ALL
set to the SAME secret string — the alias is CROSS-OBJECT (`Node.provenance_ref`
↔ `LabeledNumber.source`, on two different sites of the SAME `LabeledNumber`
shape), not within one `LabeledNumber`'s own `.source`/`.provenance_ref`
pair as this step originally specified. `base_score.provenance_ref` and
`final_strength.provenance_ref` each keep their OWN, separate,
non-aliased value (a `reduced_judgement_id`-shaped / `propagation_run_id`-shaped
string), unrelated to the shared secret — this is what production
actually does (own re-verified trace: `packages/serve/src/index.ts:2095`
`LEFT JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id =
node.provenance_ref` confirms `node.provenance_ref` IS the raw artifact
id; `:2077` `judgement.source_ref AS base_source_ref` feeds `base_score.source`,
and `packages/judgement/src/index.ts:319-325` confirmed already in round
3 that `judgement.source_ref` is bound to the SAME `input.rawArtifactRef`
as the node's own provenance — while `:2079`
`judgement.reduced_judgement_id::text AS base_provenance_ref` feeds
`base_score.provenance_ref` from an UNRELATED id). Also include one EDGE
whose `strength.number.source` is a plain, non-secret enum-like string
(e.g. `"EVIDENCE_VERIFIER"`), DIFFERENT from its own `provenance_ref`/
`replay_handle` value — this arm asserts `.source` is NOT touched on the
edge site, proving the fix is targeted, not a blanket "always redact
source."** Publish, decrypt, and assert: (1) `base_score.source ===
"REDACTED_OWNER_ONLY"`; (2) `final_strength.source === "REDACTED_OWNER_ONLY"`;
(3) the full published JSON does NOT contain the shared secret string
anywhere (node-level `provenance_ref` included); (4) `edge.strength.number.source
=== "EVIDENCE_VERIFIER"` (unchanged, proving `.source` is NOT redacted
where it is not aliased — this is the assertion that would catch an
over-correction, not just an under-correction).** This fixture is
STRICTLY STRONGER than this step's original same-object spec: an
implementation that only checked "does `.source` equal `.provenance_ref`
on the SAME `LabeledNumber`" (a plausible but wrong reading of the
original spec) would never even see the real production alias, since
production's two aliased values sit on different fields of different
objects entirely.
**Run all four BEFORE this round's `redactLabeledNumber`/`redactNodeForPublic`/
`redactEdgeForPublic` land (i.e. against the PRE-round-1 functions, which
redact only `replay_handle`/`ledger_unknown_ref`/`stranger_restatement`/`disagreement`)
to confirm each FAILS** — RED-before-GREEN, same law as every prior
residual test in this cluster. Own reproduction this round used the
Router-provided probes for exactly this purpose (`.hermes/reports/public-debate-access/probes/leak-probe.mts`
covers test A's shape, `node-prefix-probe.mts` covers test B's,
`source-alias-probe.mts` covers test D's) — these four `it()` blocks are
that reproduction, captured as permanent, re-runnable tests rather than
one-time probe scripts.
**Acceptance test:** `out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts -t "provenance_ref|base_score.source" 2>&1); vt=$?; sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1); printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?; [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]`
exits 0 AFTER this round's redaction functions land. Real (unescaped)
alternation, two patterns — extended this round to also match test D's
title, matching the ACCEPTANCE-COMMAND thread's own round-4 closing
recommendation (key filters on stable, narrow vocabulary) rather than
repeating that thread's defect in a brand-new step.
**Category (REDACTION-CORRECTNESS thread, round 1, `t_9e9e04ef`; RE-VERIFIED
round 3, `t_3d2c21e9`, FINAL): FEATURE-ASSERTION — pre-fix RED at round 1,
correctly; tests A/B/C now GREEN, correctly, since implemented; test D
still correctly RED.** Own run against the coder's worktree, round 3:
`-t "provenance_ref"` against `tests/unit/s8-publication.test.ts` as it
stands today → `vt=0`, `guard=0`, `Tests 3 passed | 21 skipped (24)` —
tests A/B/C now exist (`it("redacts aliased edge provenance_ref values...")`,
`it("redacts derivable base score provenance_ref values...")`,
`it("redacts node and review provenance_ref values...")`, own read,
naturally titled, no round-4-style contortion) and pass against the
coder's round-1 implementation. **Test D does not exist yet** (own read:
no `.source`-alias test present) and this round's own probe run confirms
WHY it must — `redactLabeledNumber` in the worktree today still copies
`n.source` verbatim (own read, `apps/api/src/publications.ts:19-28`, the
PRE-round-3 signature), and `-t "provenance_ref|base_score.source"`
against the current file scores `vt=0 guard=0` on the SAME 3 tests, `21
skipped (24)` includes test D's absence — this compound acceptance is
GREEN only because tests A/B/C alone satisfy `[1-9][0-9]* passed`; the
presence-of-test-D question is what S01-C2-1/C2-9's own three-run cluster
verification (pending behind this round, per the coder's own worktree
state) will need to re-confirm once test D is added AND
`redactLabeledNumber`'s `redactSource` parameter lands together. The
Router-provided probes, run this round against the CURRENT (pre-round-3)
worktree, confirm the underlying defect test D will assert on:
`owner_only_value_reached_anonymous_reader: true` (test A's shape,
still true), `reconstructed_equals_original_replay: true` (test B's
shape, still true), and `owner_only_value_reached_via_source: true`
(test D's shape, own run this round, `source-alias-probe.mts`). Once
test D is written and run against the pre-round-3 `publications.ts`, the
coding seat's own RED-before-GREEN evidence (`heartbeat-protocol` §2.5)
is this same `vt=0 guard=1` shape, isolated to test D's own title if
tested alone (e.g. `-t "base_score.source"` → expect `1 skipped (1)`
scoped, or the compound pattern's total count including test D's
addition, whichever the coding seat's own RED-before-GREEN evidence
records).

**RATIFICATION UPDATE (`t_956bde4a`): test D now exists, implemented to
the CORRECTED cross-object spec above, not the same-object spec this
Category note was written against.** Own re-run against the coder's
worktree: `-t "redacts aliased base_score.source"` → `vt=0 guard=0`,
`Tests 1 passed | 24 skipped (25)`; full-file suite `25 passed (25)`;
`pnpm run typecheck` clean; all four probes (`leak-probe.mts`,
`node-prefix-probe.mts`, `source-alias-probe.mts`,
`hostile-copied-fields-probe.mts`) independently re-run this round, all
report their SAFE/CLEAN verdict signal. GREEN, correctly, and for the
right reason — the corrected fixture aliases the way production actually
does, per V-DECISIONS-PACKET Row 7.
**Failure it CATCHES:** exactly round 1's real defect — `provenance_ref`
leaking the identical or a derivable secret on `LabeledNumberSchema`,
`EdgeSchema`, and separately on `NodeSchema`/`NodeReviewSchema`'s own
non-`LabeledNumber` `provenance_ref` fields (tests A/B/C). **As of round 3,
test D also catches exactly round 3's real defect** — `.source` leaking
the same raw-artifact-id `node.provenance_ref` redacts, on `base_score`/
`final_strength`, while confirming `.source` is left untouched where it
is genuinely safe (`edge.strength.number.source`) — a regression that
either redacts `.source` nowhere (round 3's actual pre-fix state) or
redacts it EVERYWHERE including the safe edge site (an over-correction)
both fail test D's four-part assertion. Test A and B specifically catch a
regression where `redactLabeledNumber` reverts to redacting only
`replay_handle` (S01-C2-5's own fixtures would NOT catch this, per the
note above); test C catches a regression on the two sites S01-C2-5/C2-6
never touch at all.
**Failure it MISSES:** does not prove there is no FIFTH aliasing
relationship beyond what round 3's own fixed-point sweep found —
converged at Pass 3 (0 new members), per the Clusters section's round-3
note, but a fixed point reached by THIS round's own enumeration is only
as complete as that enumeration; a producer this seat has not yet traced
could still exist. **This exact class of miss was predicted by this
note's own round-1 wording** ("if that field turns out to have its own
distinct aliasing relationship to some other field, this test would not
catch it") — round 3's `.source` finding is that prediction coming true,
now closed by test D, with the same honest caveat restated for whatever
the sweep has not yet found.

## SPEC trace — R3 Back-compat old-shape snapshots still read

**SPEC:** S01 R3 · **Cluster:** S01-C1 · **Headline test:** S01-C1-3/4
above (already satisfies R3's "RED regression test proving an old-shape
snapshot still reads" — no additional step; SPEC's requirement and R1's
implementation share the same test).

## SPEC trace — R4 Pre-widening publications: no silent loss

**SPEC:** S01 R4 · **Cluster:** S01-C4
**Decision prerequisite:** recorded in DECISIONS.md (disclosed
answer-only legacy — see Architecture decisions §3 above).

### S01-C4-1 — Test: legacy (old-shape) snapshot reads back with `tree_included` absent, not fabricated

**Cluster:** S01-C4
**File surface:** `tests/unit/s8-publication.test.ts` (new `it()` block,
extends the same round-trip harness as S01-C2-2, but constructs the
CIPHERTEXT from an old-shape `PublicDebate` object directly — i.e.
`PublicDebateCipher.create(...).encrypt(oldShapeFixtureFromLine30)` — rather
than going through `publish()`, since `publish()` after S01-C2-1 always
produces new-shape output; this test proves the READ side, not the write
side, tolerates pre-existing ciphertext.)
**Change:** Encrypt the exact `publicDebate()` fixture (line 30-46,
old-shape) under the same cipher/repository harness used elsewhere in this
file, store it, then call the application's `readPublicDebate` and assert
the result is non-null, `result.answer.tree_included === undefined`, and
`result.answer.nodes === undefined` — never `[]`, proving the read path
does not silently backfill an empty tree that could be misread by S02 as
"a debate with zero arguments" instead of "predates the tree feature."
**Acceptance test:** `out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts -t "legacy" 2>&1); vt=$?; sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1); printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?; [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]`
exits 0.
**Category (REWORK ROUND 3 of this thread — FINAL, PLAN-05, `t_f910328a`):
FEATURE-ASSERTION — observed pre-fix RED, correctly, on the round-3
ANCHORED capture-then-check idiom, same as the cluster table's S01-C4 row
above (this is that row's step).** Re-run 2026-08-29: `vt=0`, `guard=1`
(`13 skipped (13)`) — RED, correctly.
**Failure it CATCHES:** the exact silent-404 and silent-fabricated-tree
outcomes SPEC R4 forbids — a regression here means either the old
publication starts 404ing (caught by `result` being null when it should
be non-null) or starts showing a fake empty tree (caught by
`nodes === undefined` failing if a future edit adds `.default([])`
somewhere).
**Failure it MISSES:** does not catch the UI (S02) actually rendering the
disclosure correctly from this signal — that is S02's own acceptance
sketch item 3, a separate step in S02's PLAN.

### S01-C4-2 — Confirm the DECISIONS.md entry exists before this cluster is marked done

**Cluster:** S01-C4
**File surface:** `docs/missions/public-debate-access/slices/S01/DECISIONS.md`
**Change:** none (this PLAN's own handoff appends the entry — see
`## DECISIONS APPENDED` in the ARCH-01 ticket comment).
**Acceptance test:** `grep -c "disclosed answer-only" docs/missions/public-debate-access/slices/S01/DECISIONS.md`
returns `1` or more.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): VERIFICATION-ONLY —
observed pre-fix GREEN, correctly (Change: none — this step confirms an
artifact this PLAN's own handoff already produced, it does not build
anything).** Run 2026-08-29: returns `3` — the policy decision was
recorded in DECISIONS.md at round 0 and referenced again in later rework
entries; ≥1 was already true before this round and stays true. `grep -c`
never returns a nonzero exit on a nonzero count, so there is no exit-code
ambiguity to worry about here (unlike `grep -c` returning 0, this line's
pass condition is checked on the printed NUMBER, not the exit code).
**Failure it CATCHES:** a worker starting S01-C4 code before the policy
decision is durably recorded (SPEC's explicit "decision prerequisite").
**Failure it MISSES:** does not catch the decision being WRONG, only that
it exists in writing — correctness of the decision itself is this
PLAN document's own burden, argued above.

## SPEC trace — R5 List endpoint stays anonymous and useful

**SPEC:** S01 R5 · **Cluster:** S01-C3

### S01-C3-1 — Confirm `PublicDebateSummarySchema` is untouched

**REDACTION-CORRECTNESS thread, round 2 (`t_83a9eb08`): the round-2 brief's
table lists a `252,260` row as broken, labeled "`PublicDebateSchema`
shape." Own re-run against the coder's worktree found this SPECIFIC
step's citation (`PublicDebateSummarySchema`, not `PublicDebateSchema`)
still accurate today — reported honestly rather than "fixed" against a
claim that did not reproduce; see the Clusters section's round-2 note,
item 8, for the full accounting of this discrepancy (the ACTUALLY-stale
`262-279` citation for `PublicDebateSchema` itself lives in the "MEASURED
ground truth" section, a separate, dated, non-live citation, also
annotated this round). Converted to an anchor anyway, same reasoning as
the file-untouched `NodeDetailDrawer.tsx` fix — the shape is fragile even
where today's content happens to still be right.**

**Cluster:** S01-C3
**File surface:** `PublicDebateSummarySchema`'s declaration in
`packages/contract/src/index.ts` (currently lines 252-260; anchored below)
**Change:** none (verification-only step).
**Acceptance test:** (**line range replaced with a symbol-anchored
range**) `sed -n '/^export const PublicDebateSummarySchema/,/^})\.strict();/p' packages/contract/src/index.ts`
shows exactly the six fields `public_ref, author_pseudonym, question,
published_at, verdict, confidence_band` with no `nodes`/`edges`/
`tree_included` — i.e. this PLAN's schema change (S01-C1-1) is scoped to
`PublicDebateSchema` only, never touches `PublicDebateSummarySchema` or
`PublicDebateListSchema`.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): VERIFICATION-ONLY —
observed pre-fix GREEN, correctly (Change: none), RE-VERIFIED round 2
against the anchored form.** Run 2026-08-29, against the coder's
worktree: `sed -n '/^export const PublicDebateSummarySchema/,/^})\.strict();/p' packages/contract/src/index.ts`
shows exactly the six named fields, no `nodes`/`edges`/`tree_included` —
true today and must stay true after S01-C1-1, since that step never
touches this schema.
**Failure it CATCHES:** an over-eager edit that widens the LIST item shape
too (bloating every list response with full trees for every published
debate — a performance/scope regression SPEC R5 explicitly warns against:
"widening the detail envelope must not break the list schema").
**Failure it MISSES:** does not catch a behavioral change to the list
ENDPOINT's pagination/auth logic (untouched by this PLAN, but not
mechanically re-verified beyond the existing regression suite).

### S01-C3-2 — Regression: anonymous list and detail both still 200

**Cluster:** S01-C3
**File surface:** `tests/unit/s8-publication-http.test.ts` (no edit
expected — this step is a re-run of the existing suite as a named
regression checkpoint) plus my own live-server probe (already MEASURED
above: `curl -sk 'https://localhost:3000/api/v1/public/debates?limit=20&offset=0'`
→ 200 with the one live item; `curl -sk .../public/debates/d89b38a4-...`
→ 200 with old-shape body).
**Acceptance test:** `pnpm exec vitest run tests/unit/s8-publication-http.test.ts`
exits 0.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly.** Run 2026-08-29: exit 0, 4/4 passed —
a pre-existing regression suite with no `-t` filter and no missing-file
argument, so no vacuous-pass risk; must stay green through S01's changes.
**Failure it CATCHES:** any S01 schema/publish-path edit that breaks the
existing "serves only the strict public projection and gives every absent
public ref the same face" test
(`tests/unit/s8-publication-http.test.ts:178`).
**Failure it MISSES:** does not catch a regression only visible against a
LIVE database with real data (the unit test uses an injected fake app) —
the live curl probes above are the closest this PLAN gets to that, and
they are pre-widening baselines, not post-widening confirmations (the
worker re-runs them after implementing to compare).

### S01-C3-3 — Test: new-shape publication round-trips through the full read path

**Cluster:** S01-C3
**File surface:** `tests/unit/s8-publication.test.ts` (new `it()` block,
extends the pattern at lines 468-506 — "authorizes visibility before
opening a key and revalidates after decryption" — which already exercises
`readPublicDebate` end-to-end through a fake repository/cipher)
**Change:** Publish (via the real `publish()` path, post-S01-C2-1) an
`Answer` with a non-empty tree, then call `readPublicDebate` on the
resulting `public_ref`, and assert the returned object's `answer.nodes`/
`.edges` match the original tree and `PublicDebateSchema.safeParse(result).success === true`
(i.e. the round-tripped object is itself schema-valid, not just
structurally similar).
**Acceptance test:** `out=$(pnpm exec vitest run tests/unit/s8-publication.test.ts -t "round.trip|read.*tree" 2>&1); vt=$?; sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1); printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?; [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]`
exits 0. **ROUND 4 (`t_e1208546`): pattern was `\|`-escaped (literal pipe,
matched zero tests); now real alternation, verified against the coder's
finished worktree:** `vt=0 guard=0`, `2 passed | 19 skipped (21)`.
**Category (REWORK ROUND 3 of this thread — FINAL, PLAN-05, `t_f910328a`):
FEATURE-ASSERTION — observed pre-fix RED, correctly, on the round-3
ANCHORED capture-then-check idiom.** Re-run 2026-08-29: `vt=0`, `guard=1`
(`13 skipped (13)`) — RED, correctly.
**Failure it CATCHES:** an encrypt/decrypt or JSON-serialization bug that
silently drops or corrupts the tree specifically (as opposed to S01-C2-2,
which only tests the literal construction before encryption).
**Failure it MISSES:** does not catch a performance regression from
storing larger ciphertext (larger trees mean larger encrypted blobs) — out
of this PLAN's scope; SPEC does not set a size bound.

## SPEC trace — R6 Public read remains snapshot-only

**SPEC:** S01 R6 · **Cluster:** S01-C3

### S01-C3-4 — Confirm no new anonymous route or live-projection path is introduced

**Cluster:** S01-C3
**File surface:** `apps/api/src/index.ts`
**Change:** none (verification-only step; this PLAN adds zero new routes).
**Acceptance test:** `grep -c "auth: \"public\"" apps/api/src/index.ts`
returns the SAME number before and after this slice's implementation
(worker records both counts in the handoff comment) — proving no new
anonymous route was added as a side effect of widening the envelope.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix baseline GREEN=11, recorded, must stay 11.** Run
2026-08-29: `grep -c 'auth: "public"' apps/api/src/index.ts` → `11`. This
is the baseline count the worker's handoff must reproduce unchanged after
S01's implementation — a changed count (either direction) is itself the
signal, not a pass/fail on the grep's own exit code (which is 0 either
way, since ≥1 match always exists today).
**Failure it CATCHES:** scope creep that adds a convenience anonymous
route (e.g. `GET /v1/public/debates/{id}/tree`) instead of widening the
existing envelope — explicitly out of scope per R6.
**Failure it MISSES:** does not catch an anonymous route added under a
DIFFERENT auth value that isn't the literal string `"public"` — a
determined scope-creep edit could evade this grep; the standing
architecture test's explicit route bans
(`tests/architecture/s8-publication-contract.test.ts:135-137`) are the
real backstop.

## Boundaries / ADRs

- **No ADR filed for S01.** None of this slice's decisions introduce a
  new dependency, a new cross-mission boundary, or a new protocol — the
  `tree_included` discriminator and the field relocation are mission-local
  and slice-local, correctly recorded in DECISIONS.md, not
  `docs/architecture/01-decisions/`.
- Which `Answer` fields become public projections: `nodes`, `edges` only,
  at the TOP field-list level (no field dropped or added), but the
  CONTENT of six specific nested fields is now transformed on the way out
  — four by VALUE REDACTION (`base_score.replay_handle`,
  `final_strength.replay_handle`, `strength.number.replay_handle`,
  `abstention.ledger_unknown_ref` — required fields, secret value
  replaced, key kept) and two by SHAPE PROJECTION
  (`stranger_restatement` rebuilt naming only `check_status`;
  `disagreement` set wholesale to `null`) because those two are
  open-ended shapes (`.passthrough()` / `z.record()`) that a value swap
  cannot close — see S01-C2-0B's exhaustive enumeration and S01-C2-1's
  functions for both mechanisms. **REWORK ROUND 2 (B2, `t_9322ae7b`):**
  this line previously said only "two nested VALUES redacted" — stale the
  moment B2 landed, since B2's whole point is that VALUE redaction and
  SHAPE projection are different mechanisms for different risk shapes,
  and conflating them in this summary is the same class of imprecision
  that let round 1 believe a checklist row could close a wildcard.
  **REWORK ROUND 1 (N4, `t_a7c376e5`):** round 0's "(verbatim, no
  stripping)" phrasing here was stale the moment B1 was fixed — corrected
  in place because this is `PLAN.md`, which Architecture edits directly
  (unlike `DECISIONS.md`, append-only — see DECISIONS.md's superseding
  entry for the same correction, never an edit to the old line there).
- Version discriminator vs optional fields: BOTH — `tree_included` is the
  explicit discriminator; `nodes`/`edges` are independently optional so a
  parse never depends on discriminator-then-array ordering.
- Already-published policy: disclosed answer-only legacy (§3).
- `web/` twin: **S01 does not touch `web/` at all.** `web/`'s
  `PublicationControl.tsx`/`page.tsx`/`public/debate/[id]/page.tsx` are
  constrained by `tests/architecture/s8-publication-contract.test.ts:140-175`
  (content/text parity with `apps/ui`'s equivalents), but that test checks
  neither `nodes`/`edges`/`tree_included` nor anything this slice changes
  — `web/`'s public page already reads `debate.answer.*` generically
  enough (see S02 PLAN's boundary note) that S01's schema widening needs
  no `web/` edit. Confirmed by reading both `web/app/public/debate/[id]/page.tsx`
  (22 lines) and `apps/ui/app/public/debate/[id]/page.tsx` (33 lines) — own
  read, neither references `nodes`/`edges` today and neither needs to for
  S01's contract to be satisfied (S02 decides whether `web/` gains tree
  rendering; S01 only decides that the DATA is available to it).

## Single-writer check

S01 touches: `packages/contract/src/index.ts`, `apps/api/src/publications.ts`,
`tests/unit/pda-s01-envelope-schema.test.ts` (new),
`tests/unit/s8-publication.test.ts`. **Verified (own grep) that no other
slice's PLAN touches any of these four paths** — S02 touches `apps/ui/**`
and reads (does not write) the contract types; S03 touches
`apps/ui/app/page.tsx` and `tests/architecture/s8-publication-contract.test.ts`'s
lines 140-175 (a disjoint line range within a file S01 does not touch at
all); S04 touches `tests/architecture/s8-publication-contract.test.ts`'s
identity-carrier assertions (lines 120-138, also disjoint from S03's
140-175 range) plus a new QA verdict file. S01 has no file-surface
collision with S02, S03, or S04. It is a hard dependency FOR S02 (S02
cannot render a tree the envelope doesn't carry) but is not blocked BY
any other slice.
