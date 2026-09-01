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
