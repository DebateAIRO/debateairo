# T1 Claude Opus — three-worker A/B support artifact correction 1

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router
Kanban: `accounts-phase1` / `t_b225b2f2`
Status: static artifact correction only; **NO EXPERIMENT EXECUTION**

## Authority and entry custody

Read completely and obey, in this order:

1. `T1-claude-3worker-ab-draft-packet.md`
   SHA-256 `a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503`.
2. `T1-claude-3worker-ab-artifact-authoring-packet.md`
   SHA-256 `6e1f45085946be5024a88717337b95493ce04b7053197a57a17a5d666b5e17a2`.
3. This correction packet. Where it is more specific, it supersedes the first
   artifact-authoring packet, but it never authorizes the diagnostic.

Entry artifacts are the reviewed, rejected draft bytes:

```text
e417fea6322877b3b977c80aa33dd9918538fbd2eb3eac813abbe96c95f2d5ec  T1-3worker-ab-booted-rss-harness.mjs
dc4c0243f9cf059fa41cba518b05323baac4ff4401ee008071f2a77cce72a7cb  T1-3worker-ab-adjudicator.mjs
9483470ed9c05969bff43bc1bfc6eb7df445ef22fd8be44ee69aa3dc29b63595  T1-3worker-ab-command-matrix.md
```

Required HEAD is
`9801f85d97e4263a7c8311304e29d6a03c4a6d15`; the Git index must be empty;
the twelve governed hashes remain exactly those in design packet section 2.

Both independent GPT-5.6 Sol xHigh reviews returned `CHANGES REQUESTED`.
This packet binds their complete correction, not merely the examples below.

## Allowed writes

The Claude seat may write only these eight mission-log artifacts:

1. `T1-3worker-ab-booted-rss-harness.mjs`
2. `T1-3worker-ab-adjudicator.mjs`
3. `T1-3worker-ab-command-matrix.md`
4. `T1-3worker-ab-integration.patch`
5. `T1-3worker-ab-architecture.patch`
6. `T1-3worker-ab-mutation-helper.mjs`
7. `T1-3worker-ab-manifest-builder.mjs`
8. `run-claude-T1-3worker-ab-diagnostic.sh`

The outer launcher is separately authorized to write its wrapper PID, raw
stream-JSON tool transcript and raw status receipt. Those are launcher custody
artifacts, not Claude-seat writes.

Do not edit or apply either patch to the governed tests in this seat. Do not
edit product, policy, tests, packets, prior receipts, wrappers or quarantined
paths. Do not stage, commit, push, launch an agent/model, move Kanban, run a
test, run the harness/adjudicator/builders, start a worker or PostgreSQL, or run
any command from the matrix.

Claude receives no Bash/shell tool. It must use only `Read`, `Write`, `Edit`,
`Glob` and `Grep`; this makes a repeat of the prior unaudited command deviation
impossible. The outer launcher and Codex-Router, not the Claude seat, perform
these static post-author checks:

- `node --check` on the four `.mjs` support sources;
- `zsh -n` on the diagnostic wrapper;
- `git apply --check` for each new patch against the frozen checkout;
- read-only custody and reporting with `shasum -a 256`, `wc`, `stat`, `rg`,
  `sed`, `git rev-parse`, `git diff --cached --name-only`, `git status --short`
  and `git diff --check`.

The launcher preserves Claude's complete stream-JSON tool transcript. The seat
must not use Node, Python, Perl, Ruby, awk, shell redirection or another program
to generate/rewrite/count source; it has no shell tool. Use `Write`/`Edit`.
The prior author seat's disclosed non-`--check` Node commands remain recorded;
these new hashes must be produced under this stricter authority and supersede
them. Wrapper-owned preflight/postflight shell commands are not seat commands.

## Required corrections

### 1. Make the checkout and shell commands executable

- Distinguish outer Git root
  `/Users/vladmihaimiron/Documents/DebateAIRO` from checkout root
  `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`.
- The wrapper and matrix must verify both, then `cd` to the checkout before any
  `apps/`, `packages/`, `tests/`, `docs/` or `pnpm` command.
- In zsh, store Vitest options as an array and expand with
  `"${T1_VITEST_FLAGS[@]}"`. Do not rely on scalar word splitting.
- Convert every packet/artifact/HEAD/index/twelve-hash/Vitest-help comparison
  from prose into an exact executable gate with a raw status receipt.
- The twenty integration cells, four architecture resource cells and twenty
  standalone cells retain their already-correct AB/BA schedules.

### 2. Provide exact temporary sources and installation

- The two `.patch` artifacts must apply cleanly, and only, to the frozen
  integration and architecture test hashes from design packet section 2.
- The integration patch must install the exact packet-token module gate,
  frozen S3b prehistory, N=3 two-arm measurement, enqueue/dispatch/settle seam,
  anonymous metrics, functional/opacity assertions and all non-vacuity checks
  required by design sections 3–5.
- The architecture patch must install the exact resource, retained-allocation
  positive-control, and three lifecycle fault titles required by design
  sections 6–7.
- Both patches must install identifier-safe capture before any product work or
  database boot. Cover every console channel including `error`; do not forward
  raw PostgreSQL arguments, addresses, temp paths or identifiers. Preserve only
  secret-free channel/event counts and generic error codes.
- The matrix and wrapper must contain the exact `git apply --check` and apply
  commands, preserve the exact patch/source hashes before the first child, and
  unconditionally restore both `cp -p` backups on every normal/signal exit.

### 3. Make mutants 1–7 real

- `T1-3worker-ab-mutation-helper.mjs` performs only exact, unique,
  source-anchor-bound replacements on a temporary governed-test copy. It must
  reject zero/multiple matches and unexpected before-bytes.
- Provide one stable unique anchor and exact replacement for each design mutant
  1–7. Each matrix block must mutate the installed temporary source, run the
  exact named title, require selected-test count > 0 and the exact intended
  failure text from the raw receipt, then restore to the installed non-mutant
  temporary source and verify hash/size/mtime/`cmp`.
- A missing, malformed or absent status is never equivalent to a valid nonzero
  mutant failure.

### 4. Build, bind and verify the manifest from raw evidence

- `T1-3worker-ab-manifest-builder.mjs` is deterministic and dependency-free.
  It accepts only the mission logs directory plus the externally approved
  launch-authority file/path shape defined by the wrapper. It reads raw
  receipts/statuses and constructs the manifest; it does not accept scientific,
  custody, restoration or mutant truth as operator-provided booleans.
- Require exact list cardinalities and exact frozen cell IDs/order. Bind every
  report's own `cellId`, worker count, pair/arm and process/PG identity to its
  filename and frozen schedule. Receipts cannot be relabelled after execution.
- Require raw status bytes to be exactly their permitted values. Missing,
  malformed, empty or non-integer statuses are receipt failures.
- Bind artifact hashes to the exact dual-reviewed/V-approved launch authority,
  not merely to a 64-hex shape. Do the same for the design packet, temporary
  patches/sources, helper, builder, wrapper and twelve governed hashes.
- Derive mutant selection, named intended failure, anchor count, temporary-copy
  use and restoration from raw receipts and file evidence.

### 5. Remove adjudicator trust gaps

- Recompute `H` from the anonymous existing/missing arm maxima and recompute
  `Q` as the median of the eight N=3 per-wave credential queue maxima. Never
  trust a reported endpoint summary when component values are present.
- Retain the reviewed-correct 9/10 sign rules, `11/1024`, Bonferroni `0.025`,
  97.5% two-sided exact Clopper-Pearson intervals, ties-lose semantics,
  published/historical thresholds and four-way marker mapping.
- Full-receipt scanning must cover every preflight, help, patch/diff, backup,
  normal cell, fault, positive control, mutant, helper, restoration, final
  custody, manifest-builder and manifest stream. The wrapper must additionally
  scan the adjudicator's own stdout/stderr before printing its marker.
- SHA whitelisting is limited to exact, named, authority-declared header lines;
  it is not manifest-expandable. Scan both generated literals and forbidden
  identifier/path patterns after ANSI stripping.
- Raw generated literals must never be written to a durable manifest or
  receipt. Keep them only in a mode-0600 wrapper-owned temporary carrier or
  inherited file descriptor, pass them directly to the scanner, exclude only
  that carrier from scanning, and destroy it after adjudication. The durable
  manifest records only a count and cryptographic commitment; its complete
  bytes remain part of the full scan. A literal hit is reported only by generic
  guard name and count, never by echoing the literal.
- Recompute architecture last-four-wave plateau from all eight wave readings;
  require identical eight-job work, every warm-up, exact active/queue/
  outstanding/thread evidence, baseline/in-flight/eight quiescent/settled/
  post-close RSS, close latency, event-loop progress and retained 4 MiB/wave RED.
- For standalone cells require finite RSS values and exact 0/25/50/100 slot
  counts culminating in `1,572,864/1,572,864`, plus the specified lifecycle,
  cleanup, load and swap evidence. Missing fields must fail.

### 6. Make RSS safety and cleanup truthful

- Route every RSS read through the safety observer, assert immediately after
  every boot/ready/consumer/baseline/occupancy/in-flight/settled/cleanup read,
  and never start more work after the first breach.
- A 512 MiB breach must let already-active work settle and run truthful cleanup,
  emit the structured secret-free safety report and exit exactly 3. The wrapper
  maps that to `CODEX BLOCKED (rss-safety)`, stops all later three-worker cells,
  restores custody and never mislabels it as `normal-cell`.
- Any service drain, hasher/pool close, database stop, secret-root removal or
  buffer-zeroing failure must make the harness nonzero. It must never emit
  `COMPLETE` or status 0 with a cleanup error.

### 7. Correct execution ordering and custody

The exact runner order is:

1. external V authority and artifact/hash preflight;
2. unique `mktemp -d`, two `cp -p` backups and verified trap arming;
3. install/verify the two approved temporary patches;
4. run the frozen foreground cell/mutant matrix with stop rules;
5. settle and reap tracked descendants;
6. unconditionally restore both governed tests and verify SHA/size/mtime/`cmp`;
7. verify HEAD/index/twelve hashes and compare complete `git status --porcelain`
   to a captured authorized entry baseline plus the explicitly named new run
   receipts—do not demand an absolutely clean worktree;
8. verify only exact tracked descendant PIDs/PGIDs are gone; never use a broad
   host-wide `pgrep -f T1-3worker-ab` that matches the wrapper or other work;
9. build the manifest from the now-complete raw evidence;
10. adjudicate, then scan the adjudicator output itself;
11. print exactly one lawful marker and clean the unique temporary directory.

No early failure path may print a scientific marker. A blocked path records the
reason, terminates/reaps tracked descendants, restores first, verifies custody,
and only then emits the one lawful `CODEX BLOCKED (...)` marker. Restoration
failure overrides every prior outcome with `CODEX BLOCKED (restoration)` and
status 74.

The diagnostic wrapper must implement, rather than describe, signal traps,
descendant tracking, TERM/KILL/reap ordering, the 512 MiB stop, unconditional
restoration and final status override. It may require an external launch
authority file containing the final packet/artifact hashes; absence or mismatch
must stop before backup or edit.

## Static verification and handoff

This seat does not execute `--self-test`; that first execution remains launch
prep after dual review and explicit V approval. The outer launcher/Codex runs
only the listed static checks after the seat exits. The seat reports the eight
artifacts it authored; the launcher reports SHA-256, bytes, lines and applicable
syntax/apply status. Recheck HEAD, empty index and all twelve frozen hashes.

Return exactly:

`T1 THREE-WORKER A/B CORRECTION 1 READY FOR SOL REVIEW`

Do not claim launch readiness, V approval, product acceptance or Kanban Done.
