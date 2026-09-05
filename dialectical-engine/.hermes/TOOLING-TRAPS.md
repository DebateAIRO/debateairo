# TOOLING-TRAPS — append-only. Read before you start; append what cost you time.

Format: one bullet per trap — the trap, the symptom, the fix. Newest at the bottom.
Every entry below was paid for at least once. Do not pay for it again.

- `git checkout <sha> -- <path>` **STAGES** the change; a follow-up `git checkout -- <path>`
  restores from the index — the WRONG version — and porcelain shows an easy-to-skim `M `.
  Use `git checkout HEAD -- <path>` or `git reset --hard HEAD`, and print
  `git status --porcelain` after EVERY restore. (verify-c5-lens; nearly dirtied a tree
  three review lenses depended on)
- vitest **deduplicates identical assertion errors** across tests and prints the shared
  error once. Grepping output for an assertion string names the WRONG assertion — the code
  frame is not the failure. Read the `❯ file:line` marker; only that names what fired.
  (verify-c5-lens; a mutant was mis-attributed to the wrong arm)
- `hermes kanban --board <slug> show <ticket>` **truncates** long text and JSON. Long
  comment threads need repeated indexed `jq` slices. Board flag goes BEFORE the verb;
  `comment` takes the body as a positional arg (no `--file`); `edit` requires `--result`.
  (s02-exhaustive-1; 32 comments read in slices)
- macOS: **no `timeout`** command · **`rg` may be absent** from PATH (use grep) · BSD
  `awk` treats `index` as a **builtin** — using it as a variable name is a syntax error.
  (three seats, three missions)
- `codex exec` **hangs awaiting EOF** unless stdin is closed (`< /dev/null`), and **echoes
  its prompt**, so marker-counting monitors false-positive on the echo. Count marker
  OCCURRENCES or use colon-suffixed forms; better, watch the board's comment count.
  (responsive-ui; two monitor false positives)
- Heredoc-generated launchers: an unquoted delimiter **eats `$vars`** silently — three
  reviewers once never launched. NEVER generate a launcher without reading it back and
  confirming its log file appears within 2 minutes. Verify per-lane log paths are
  DISTINCT — an inherited log path blinded a watchdog. (responsive-ui)
- zsh: `K="cmd with args"; $K more` does **no word splitting** — the whole string is one
  word. Repeat the full command or use an array. (observability-loop)
- tsx treats a scratchpad `.ts` file outside a package as **CJS** — top-level await fails.
  Name scratch files `.mts`. (observability-loop)
- Relative packet paths break silently: lane launchers `cd` into worktrees that carry
  STALE packet copies, and a colliding name loads the wrong packet with no error. Packet
  paths are ABSOLUTE, with an existence guard, verified to resolve from the seat's cwd.
  (observability-loop; measured blast radius zero by luck alone)
- `stderr` byte counts are **not tree pins**: every probe carries its own error-token
  length, so three lenses measured three different values and all were correct. The
  durable property is paired-arm byte identity, never an absolute count. (S05)
- perl `s{...}{...}` **mangles a JSX replacement containing braces** (`rows={3}`): it dies
  with "Missing right curly" on stderr, leaves the file UNTOUCHED, and the mutant run then
  reads as a clean GREEN — i.e. "my test failed to catch the mutant" when the mutant was
  never applied. Two of six mutants were silently void this way. Use python3 (or any
  literal-string writer) for JSX mutants, assert the anchor was found, and **print
  `git diff --stat` of the applied mutant before believing any mutant verdict.** (T2)
- Root `pnpm run typecheck` is **blind to the legacy UI**: tsconfig.json:20 excludes `web`
  and `apps/ui`, and its include list carries `tests/**/*.ts` but **not** `.tsx`. A web/
  edit and a new `.test.tsx` are typechecked by NOTHING at repo level, so a green root
  typecheck is not evidence for either. Gate web/ with `tsc --noEmit -p web/tsconfig.json`
  — which carries 1 pre-existing error (TS2882, `globals.css` side-effect import in
  web/app/layout.tsx) because Next's `.next/types` shim is not generated. (T2)
- The vitest `@` alias resolves to **apps/ui** (vitest.config.ts:8) for EVERY test, so a
  `web/` component's `@/lib/api` import loads apps/ui's module under test, not web's. Mock
  the specifier or you are asserting against the wrong app's client. (T2)
- Concurrent lane worktrees each running the full suite **serialize on this host**: with
  three `vitest run` processes live (lane-t2, lane-t4, primary), `pnpm test` took 2984s vs
  T0's 515s — 5.8x. Budget suite wall-clock by counting concurrent lanes before promising
  a three-run cluster on the FULL suite, and never read a slow run as a hang. (T2)
- An acceptance **provider double that classifies a request on a QUOTED fragment of the
  rendered prompt never matches**: the packet is JSON-encoded onto the wire, so
  `"statement": non-empty string` arrives as `\"statement\": non-empty string`.
  `acceptance/ceremony.test.ts` carries exactly this dead check and survives only because
  its fixed FIFO falls back to popping index 0 — i.e. **a FIFO queue masks a broken
  classifier**. Key on escape-safe fragments (`restatement_text`, `served_number_refs`,
  `conforms,findings`) and make the double **refuse to guess**: record the unclassified
  body and answer 500, or a fixture gap surfaces as a bogus production error
  (`JUDGE_SCHEMA_FAILURE`) and a RED that proves nothing. (T3)
- **Adding one provider call site is a repo-wide event.** Before wiring a new model call,
  grep `call_site_key LIKE` across `migrations/*.sql` AND tests: expansion legs are
  enumerated by pattern (`JUDGE:%:root%:r1:p%` in acceptance/ceremony.test.ts:511,
  `JUDGE:%:root%:r%` in tests/integration/database.test.ts:1824), so a new call that reuses
  the `JUDGE:` prefix is silently counted as an authoring leg. Give a new call class its
  own namespace (`PANEL:`) rather than editing the assertions. Also check fixed-queue
  provider doubles and the sealed envelope basis. (T3)
- `tools/orphan-audit`'s **`neverCalled` list is hand-declared with no cross-check against
  `reachableCallables`** — wiring a listed surface makes the entry a silent lie, and no
  test fails. (`s04Surface`/`s05Surface` are safe: their attachment is derived.) After
  attaching any surface, edit `neverCalled` by hand. (T3)
- In `tests/integration/database.test.ts` a runner fixture is one of TWO species and the
  choice is not a continuum: it either **terminates on its envelope** (pin a tight
  `maxModelAttempts`; script only judgements + reviews; the serve gate takes the
  envelope-terminal path with zero composer calls) or it **serves** (generous ceiling;
  you MUST script compose + two conformance + R9 on the PRIMARY maker's double). A
  ceiling between the two fails as an unscripted-composer schema error or a hard
  `RUN_COST_ENVELOPE_EXHAUSTED` throw, and neither message names the real cause. Decide
  the species before choosing the number. (T3 r2)
- A provider double that pops `index 0` when a RECOGNISED request class has no scripted
  response of its own class serves a wrong-class answer (a review body to a judge call),
  which surfaces as a bogus production schema failure. Refuse by name for recognised
  classes; keep FIFO only for genuinely untyped requests such as health probes. Fixing
  the guess in `ceremony.test.ts` and `database.test.ts` left all their fixtures green,
  so the fallback was masking, not load-bearing. (T3 r2)
- Adding a member to a CLOSED VOCABULARY has a fixed shape in this repo, and skipping any
  step ships a FACSIMILE — a string that looks like a canonical value but is rejected by
  the parser that is supposed to disclose it. The full chain: `packages/kernel`
  CONDITION_MARKS (**insert MID-LIST** — the DR-176 tail is read positionally by
  `CONDITION_MARKS.slice(-4)` in `tests/unit/t4-way-of-knowing.test.ts`,
  `tests/unit/dr174-resilience.test.ts` and the runner's required-record gate) →
  `packages/contract` `z.enum(CONDITION_MARKS)` (automatic, but PROVE it with
  `ConditionMarkSchema.parse`) → the `ConditionMarkRecord.mark` union in
  `packages/serve/src/index.ts` (NOT automatic) → a runner projection that actually emits
  it → the deliberately-exhaustive UI switches `apps/ui/lib/v3/labels.ts` and
  `web/lib/v3Presentation.ts` (these fail typecheck by design — one forced line each) →
  `pnpm run generate:contract` → both D16 surface gates. Write the two-line admission
  test (`CONDITION_MARKS` contains it; the schema parses it) FIRST: a behavioural test
  that asserts against your own untyped JSON will pass while the mark is still a
  facsimile. (T3 r3)
- A scope claim like "my diff does not touch packages/kernel, so D16 does not gate" is a
  DERIVED fact with an expiry — it silently becomes false when a later round edits the
  kernel. Re-run the gate greps immediately before freezing a report, never once at the
  start. (T3 r3)
- `git stash push -u` is NOT a time machine once your work is COMMITTED: it stashes only the
  uncommitted delta, so a "base classification" run done after a checkpoint commit still runs
  YOUR tip and will happily tell you your own regression is pre-existing. Use
  `git checkout <base-sha>` (detached), and make every base-classification command print
  `git rev-parse HEAD` in its own output so the log proves which tree was tested. (T7 r1)
- Under `zsh`, `grep -rn "x" --include=*.ts .` dies with `no matches found` before grep ever
  runs — the shell expands `--include=*.ts`. Quote it: `--include='*.ts'`. (T7 r1)
- A vitest spy declared `vi.fn(async () => undefined)` has no parameter type, so
  `spy.mock.calls.map(([entry]) => entry.someField)` fails `tsc` with TS2493/TS2352 even
  though the test runs. Declare the parameter on the mock:
  `vi.fn(async (_entry: { readonly actionKind: string }) => undefined)`. (T7 r1)
- `buildMultiMakerExpansionPlan` (`apps/runner/src/index.ts`) emits legs ROOT-MAJOR —
  `rootIndex` OUTER, `round` INNER — so `leg.round` RESETS at every root and the consumption
  loop's `activeExpansionRound` is a per-root index, not a global round counter. It is safe
  for its existing job (triggering reviews) and wrong for anything that must happen "once per
  round". Read the PRODUCER's loop nesting before attaching to the consumer. (T7 r1)
- `buildMultiMakerExpansionPlan(depth, effectiveMakerCount)` takes **DEPTH FIRST**
  (apps/runner/src/index.ts:1183-1186). Both arguments are small positive integers, so
  the reversed call builds a perfectly legal plan for a DIFFERENT shape and every
  assertion about it is quietly about the wrong tree — only the symmetric `(2,2)` case
  is safe from the confusion. Symptom: a generalisation loop over `(M, depth)` pairs
  fails on the shapes you did not hand-check. Print `legs.length` and the distinct
  `rootIndex` set before asserting. (t07 r3; two false RED failures + one diagnostic run)
- zsh does **no word splitting on a plain scalar**, so `Z="a.ts b.ts"; vitest run $Z`
  passes ONE argument and vitest answers `No test files found, exiting with code 1` —
  instantly, three runs in a row, looking exactly like a broken zone. Use an array:
  `Z=(a.ts b.ts); vitest run "${Z[@]}"`. (t07 r3; the generic form of this trap was
  already recorded and it still cost a cluster round — the fix is the ARRAY, write it down)
- A mutant harness that restores with `git checkout HEAD -- <file>` **destroys
  uncommitted implementation work**, because HEAD is whatever you inherited. COMMIT the
  GREEN state before the first mutant, then mutate against your own commit. (t07 r3;
  caught before it fired, one harness rewrite)
- **zsh does NOT word-split an unquoted variable.** `ZONE="a.test.ts b.test.ts"; npx vitest
  run $ZONE` passes the whole string as ONE filter; vitest answers `No test files found,
  exiting with code 1` — which reads like a broken glob, not like a shell difference, and
  the run looks superficially normal (exit 1, no failures). Pass the paths as literal
  arguments, or use `${=ZONE}`. Cost: one wasted zone run. (T6 r1)
- **Reverting source WITHOUT touching the index**, for the paired base↔HEAD classification
  the fleet keeps needing: `git show <sha>:<repo-relative-path> > <path>`, run, then
  `git checkout -- <path>`. Unlike `git checkout <sha> -- <path>` (already recorded above)
  this stages nothing, so `git status --porcelain` after the restore is genuinely empty.
  It is what settled T6's `staleness_state ARCHIVED_REVIVED` failure as pre-existing in
  one run instead of an argument. Note the repo-relative path inside a worktree still
  carries the `dialectical-engine/` prefix even when your cwd IS `dialectical-engine`. (T6 r1)
- **CORRECTION to the index-free base revert above (T6 r1) — it is only safe on COMMITTED
  work.** `git checkout -- <path>` restores from the INDEX, so if the file you overwrote with
  `git show <sha>:<path> > <path>` held UNCOMMITTED edits, the "restore" silently replaces
  them with the last committed version and `git status --porcelain` then looks *clean*, which
  reads as success. T6 r2 lost three product files this way while running the D16 base pair
  mid-change; only a content grep (`grep -c review_outcome`) caught it, not git. COMMIT (or
  `git stash`) BEFORE any base-pair revert, and verify the restore by grepping for a token
  your change introduced — never by `git status` alone. (T6 r2)
- **One vitest FILE = one embedded Postgres = ONE monotonic `ledger.allocate_sequence()`
  counter shared by every test in it.** A fixture that hard-codes an `at_seq` /
  `created_at_seq` literal is therefore a LANDMINE with a fuse: it detonates the moment
  the file's own allocations climb to that number, and it detonates in *other people's*
  tests, at setup, with `duplicate key value violates unique constraint
  "run_created_at_seq_key"`. `database.test.ts` carried literals at 10001/10002/10005 with
  only a few hundred allocations of headroom; adding ONE production scenario tripped it and
  took out 23 unrelated tests, all failing in 1–2 ms. The symptom points at your change and
  the cause is a decade-old constant. Diagnose by reading the DETAIL line (`Key
  (created_at_seq)=(10001) already exists` — a suspiciously round number is the tell) and
  `grep -oE "'s00',[0-9]+\)"`, then bisect PRODUCT vs TEST by running the file with the
  previous round's test file against the new product code. (T6 r3)
- **Base-pair classification: `git checkout --detach <base>` inside the lane worktree is
  the safe form**, once the tree is committed and clean — run the gates, then `git checkout
  <branch>`. It moves the whole tree coherently, so nothing half-reverted can compile-fail
  in a way you then misread as a finding, and it cannot silently eat uncommitted work the
  way the per-file `git show <sha>:<path> > <path>` form can. Verify the return by grepping
  a token your change introduced, not by `git status`. (T6 r3)
- **A parameterised INSERT built from string fragments must reference EVERY `$n` you bind.**
  Postgres rejects the round trip with `bind message supplies 6 parameters, but prepared
  statement "" requires 3` — which reads like a driver bug, not like a probe that varies its
  own SQL. Pass the varying values as parameters (`$4,$5,$6`) and let them be NULL, instead
  of interpolating `NULL` / `'literal'` into the statement text. (T6 r3)
- **The scratchpad ROOT is shared between concurrent seats — one seat's tool file silently
  replaces another's.** Reaching for this lane's r3 mutant harness at `<scratchpad>/mutant.sh`,
  T6 r4 found the S06 seat's harness under the same name: hard-coded to `.worktrees/lane-s06`
  and appending to `logs/s06/`. Invoking it blind — the natural move, since the path was
  "mine" — would have mutated ANOTHER LANE'S WORKTREE and written into another lane's evidence
  directory, from a seat with no contract over either. Put seat tooling under a seat-scoped
  subdirectory (`<scratchpad>/t06-r4/…`), and `cat` any remembered scratch script before you
  run it. (T6 r4)
- **`assert t.count(old) == N` before a multi-site replace is NOT a safety check.** It proves N
  occurrences exist; it proves nothing about whether they MEAN the same thing — and textual
  identity is precisely what a HOMONYM has. T6 r3 narrowed a column type with a
  `count == 2` assertion and hit two different columns whose annotations were spelled
  identically (`ledger.node_review.outcome`, three lawful values, and
  `serve.condition_mark.review_outcome`, one), shipping a copied comment that cited the wrong
  constraint as justification. When a selector matches more than once, the count is a
  REQUIREMENT TO DISAMBIGUATE: read every site, and if two are textually identical and
  semantically different, make them textually different (name one) rather than being careful.
  No type can express "narrowed in the right query" — a source assertion counting the narrowed
  reads can. (T6 r4)
- **Gate logs need a captured `EXIT STATUS:` line, not just clean output.** A typecheck log
  containing the command and no diagnostics proves a command RAN; it does not prove it exited
  0 (a crashed or filtered run looks identical). Wrap gates as
  `{ echo "\$ cmd"; cmd 2>&1; echo "EXIT STATUS: $?"; } > log`. A static reviewer correctly
  downgraded T6 r3's typecheck evidence to testimony-grade for exactly this. (T6 r4)
- **A vitest `-t` filter that matches NOTHING reports `Tests N skipped (N)` and exits 0.** It is
  indistinguishable from a pass at a glance, and every downstream gate treats exit 0 as evidence.
  T1B ran five mutation probes that tested nothing this way: the filter was
  `-t "laid out as (multiline zod chain)"` while `it.each` had interpolated `$spelling` into the
  name **with quotes**, `laid out as 'multiline zod chain'`. **`N skipped` with `0 passed` is a
  FAILED MEASUREMENT, not a green run** — assert that a filtered run passed at least one test
  before you believe its verdict. (T1B)
- **`gate-run.sh` stamps `git rev-parse HEAD`, which is the WRONG commit whenever the working
  tree is dirty.** Run a gate before committing your fix and the record binds to the *previous*
  commit while measuring code that is not in any commit. The record even prints the dirt on its
  `porcelain BEFORE` line — it just does not draw the conclusion, so nothing fails. `stamp-check`
  then reports STALE much later, after the run is expensive to repeat. Commit first, then gate;
  T1B re-ran five gates for this. (T1B)
- **Verify a merge by comparing diff LINE SETS in both directions, not by reading hunks.** For
  each file both sides touched: `diff(base,lane)` must equal `diff(integration,merged)`, and
  `diff(base,integration)` must equal `diff(lane,merged)` — take `git diff -U0 … | grep '^[+-][^+-]' | sort`
  and compare. Two `diff` calls per file prove neither side's contribution was dropped, which
  no amount of reading the merged file does. A clean auto-merge resolves by POSITION and is the
  case that most needs this. (T1B)


## `pnpm typecheck` is BLIND to `acceptance/` — that project has its own tsconfig
Found by W4 (2026-09-03): the root `tsconfig.json` `include` list is
`apps/ packages/ tools/ tests/ vitest.config.ts drizzle.config.ts` — `acceptance/` is not
in it. `acceptance/tsconfig.json` covers that tree separately. An unknown-property error in
an acceptance file therefore does not appear in `tsc --noEmit`; it needs
`tsc --noEmit -p acceptance/tsconfig.json`. W4's RED signal (`TS2353 … 'testOnlyCodexSessionsRoot'
does not exist`) was invisible to the root run, which instead printed only the pre-existing
`tests/unit/s14-ui.test.ts` errors from the absent `web/` tree. Typecheck BOTH projects, or a
type-level RED frame silently reads as green.

## The acceptance vitest config must be run from `dialectical-engine/`, not the worktree root
Found by W4 (2026-09-03): `acceptance/vitest.config.ts` sets `include:
["acceptance/**/*.test.ts"]`, resolved against the config's own root. Invoked from the
worktree root — which is what `gate-run.sh <worktree>` does if you pass the repo root — vitest
prints `No test files found, exiting with code 1` and the gate records exit=1. That is
indistinguishable at a glance from a failing suite. Pass the PACKAGE root
(`<worktree>/dialectical-engine`) as gate-run.sh's first argument; it stamps the same commit
because `git -C` still resolves inside the repo. Cost: one wasted gate record.

## A scratchpad `.ts` file runs as CJS under tsx — top-level `await` dies
Found by W4 (2026-09-03): `tsx /tmp/.../probe.ts` fails with `Top-level await is currently
not supported with the "cjs" output format`, because the scratch directory has no
`package.json` declaring `"type": "module"`. Name throwaway probes `.mts`. Cost: one failed
probe run before a live call was made (no live call was wasted).

## A loose secret-scan regex matches CSS property names — read the match, never the count
Found by W4 (2026-09-03): `grep -rlE "sk-[A-Za-z0-9_-]{16,}"` over the mission log tree
reported a hit in a codex review log, which looked like a leaked API key in a committed
record. The actual matched text was a minified CSS property-name blob —
`…mask-composite`, `mask-size`, `mask-position…` — where `sk-` is the tail of `mask-`.
Printing the match with `grep -oE` instead of trusting `-l` prevented a false security
finding. Scan for the KEY NAME with its value (`"ANTHROPIC_API_KEY":"…"`) or a
vendor-prefixed form (`sk-ant-`), and always print what matched.
