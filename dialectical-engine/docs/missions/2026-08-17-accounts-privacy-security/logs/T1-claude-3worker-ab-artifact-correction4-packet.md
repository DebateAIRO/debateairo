# T1 Claude Opus — three-worker A/B artifact correction 4

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router
Kanban: `accounts-phase1` / `t_b225b2f2`
Status: static support-artifact repair only; **NO TEST OR DIAGNOSTIC EXECUTION**

## Authority, failed receipt, and entry custody

Continue Claude Opus session `e4f0558b-1204-4ca9-b349-59c8edc79909`.
Read this packet completely before editing. The governing scientific design is
`T1-claude-3worker-ab-draft-packet.md`, SHA-256
`a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503`.
Correction 1, SHA-256
`90734f6a1e8fc85f04c65406daacd678dc7cfcec2299665cfe2118dc5be3c595`,
remains the substantive artifact contract. Correction 3, SHA-256
`a5f4465922027e4fe6f0e5688285c676bc69736656bc838108cd300e8813dc06`,
remains authority for the process/receipt/RSS/freshness redesign except where
this packet makes the two final Sol xHigh reviews more exact.

Preserve correction 3's raw author receipt and status `74`. The failure is
truthful: the result contained a summary plus the required marker rather than
equaling the marker byte-for-byte. More importantly, dual final review found
substantive defects, so this is not a receipt-only correction.

Required repository state is HEAD
`9801f85d97e4263a7c8311304e29d6a03c4a6d15`, empty index, and the twelve
governed hashes frozen in the design packet. Entry artifact hashes are:

```text
7018372118b04535b59281969674355d12e228f61b8cc09d32aa19c0ac3801c4  T1-3worker-ab-booted-rss-harness.mjs
c3ff7e51c26c077daf8eeb759af66c85d7b0405bc65f9a67863c678e4bf45d46  T1-3worker-ab-adjudicator.mjs
b32fcc44c8b17a9243c8abd0d3411361c83182e240223ebf9758686a7eb1bd8a  T1-3worker-ab-command-matrix.md
bc69885295a97990cba2bb60d0d85c20e5ed03fff669c089455b2e1c3cfc614f  T1-3worker-ab-integration.patch
0a0be344fe433a9f0f95e7ee9a0d8d4cc4dee415ce3d7914fbc282b3bd1b0a42  T1-3worker-ab-architecture.patch
600a795ddb67c52264512dd3ac58db1ffad83bbb7da232b4cab25d7c92ceb893  T1-3worker-ab-mutation-helper.mjs
db90236e3962b6b817550f2f7cabe296252b43ee489a5d9aa9b80d982d94196a  T1-3worker-ab-manifest-builder.mjs
ef76b2a9f6cd47d3ce819aa0a7cf1d32980a8a962fec988041d0052b04361fcc  run-claude-T1-3worker-ab-diagnostic.sh
```

## Write scope and prohibitions

Edit only those eight artifacts. Do not add a ninth support artifact or edit
product, governed tests, packets, receipts, progress, Kanban, or quarantined
paths. Use only `Read`, `Edit`, `Write`, `Glob`, and `Grep`—no Bash/Task tool.
Do not run Node, Python, zsh, Git, Vitest, pnpm, patches, wrappers, harnesses,
builders, workers, PostgreSQL, or commands. Do not stage/commit/push or claim
execution evidence. Outer postchecks are static only.

## 1. Real bounded cell deadline and immediate stop

`T1_CELL_TIMEOUT_SECONDS=5400` is an operational abort, not a scientific
threshold. Make it real. `t1_run_cell` must use a monotonic bounded watcher, not
an unbounded `wait`. At the deadline it must:

1. atomically mark the cell timed out and stop later scientific/mutant cells;
2. verify the still-owned session/process group identity;
3. TERM, bounded-wait, KILL if needed, and reap the exact group/direct fallback;
4. write the raw timeout/status/finalization/process receipts; and
5. enter fail-closed cleanup with `CODEX BLOCKED (normal-cell)` unless a more
   authoritative rss/restoration/custody block already exists.

Every wait in finish/fallback cleanup must also be bounded. The watchdog itself
must be reaped and removed on ordinary completion. A declared-but-unused timeout
or a bare unbounded `wait` is a launch blocker.

## 2. Process/session custody must cover descendants, not just leaders

Keep a validated session/group active until the whole recorded group/session is
empty, not merely until its leader exits. Record PID, PGID, SID, wrapper PGID,
cell ID, and run commitment. Before any negative-PGID signal, enumerate group
members and revalidate the group/session ownership. A leader may exit while
Vitest, PostgreSQL, or worker descendants survive; final custody must enumerate
and require zero surviving members for every recorded PGID/SID.

If identity publication/validation fails, immediately stop the cell and mission,
TERM/KILL/reap only the exact direct fallback child, remove its active fallback
identity after exact reap, and block custody. Never leave a reaped fallback PID
for later signalling. Never continue science after `t1_block custody`.

Bind every cell report to its supervised identity. The supervisor should export
the verified supervised PID/PGID/SID and run commitment through inherited env;
reports include those exact fields. The builder/adjudicator compare them with
the wrapper's process-identity receipt and cell ID. Report `processId` must be a
member of that recorded group/session (or the report must carry an equivalent
non-forgeable inherited binding); mere PID presence/distinctness is insufficient.

## 3. Complete 512 MiB safety and cleanup semantics

The ceiling covers every actual three-worker Node process: integration,
architecture resource, all three fault cells, and standalone. `gateRssSafety`
must validate all of them. Each report identifies the measured PID, proves a
<=5 ms in-flight observation cadence, preserves samples/peak, and provides an
exact structured breach line that the launcher maps to rss-safety even if a
Vitest/`execFile` parent exits 1.

For integration:

- install observation/capture before measured imports/DB boot;
- actually consult `admitWork` before every seed/history/wave/job start and after
  awaits; a breach forbids new work;
- keep observation active through `afterAll` teardown;
- retain each flow's `AuditContextHasher` and its real refusal-audit coordinator;
- drain mail dispatches, then call the actual
  `RegistrationService.drainRateLimitAuditFlushes()`, then close every retained
  `AuditContextHasher`, then close the shared pool and database through nested
  `try/finally`, matching production `main.ts` shutdown order so an early error
  cannot strand later ownership;
- derive `drains.refusal` only from the real refusal coordinator/queue/writer
  state. Never infer it from mail occupancy or `activeSends`.

For architecture resource/fault children and standalone:

- a breach stops further submission/admission, cancels queued jobs, lets only
  already-active bounded work settle, then closes and zeroes in `finally`;
- parent `execFile` handling must preserve/forward structured stdout and child
  exit 3 instead of converting it into an opaque Vitest status 1;
- every fault cell carries the same RSS observer/report fields and is gated;
- the standalone observer starts before product dynamic imports and remains
  through cleanup; if a synchronous 1,572,864-slot mutation can starve a timer,
  add direct RSS checks at bounded chunks/pages so the ceiling cannot pass
  unseen.

Do not submit all queued work and merely `allSettled` it after breach. Prove
queued cancellation/zeroing, no post-breach admission, exact active settlement,
pool/service/database close, and buffer zeroing before status 3.

Apply the same structured 512 MiB observer/stop mapping to every three-worker
mutant process, including mutants 4–7. `t1_vitest_mutant` must recognize and
propagate an RSS breach before accepting an intended mutant failure or launching
any later mutant. A mutant's expected RED can never mask rss-safety.

## 4. Make lifecycle fault fixtures production-owned and non-vacuous

`retry-fulfilled` must hold a real job across fault and `pool.close()`, inject a
real first termination rejection/unconfirmed attempt, and let the pool's own
retry path make the distinct fulfilled second termination. Do not wait for the
job to finish before close, manually call fixture handles afterward, overwrite
`closeRejectedTyped`, or manufacture zero handle counts. Assert the actual close
promise/result, job settlement exactly once, final pool state, retiring/live/
physical maxima, restart/termination counts, and zero handles.

Likewise preserve correction 3's genuine late-exit and unconfirmed-death rules.
The adjudicator must fail if any fixture substitutes a precompleted job, manual
post-close cleanup, rewritten outcome, or fabricated count.

## 5. Secret capture and carrier temporal order

Console capture is streaming code/count-only. Never retain raw string/JSON args
in arrays or forward them. For each event, increment fixed counters and run
in-memory forbidden-literal/shape detection, retaining only code/count/boolean
results. Keep capture from module evaluation through final teardown.

Create the private mode-0600 carrier immediately after a unique private temp
directory exists and before any mission-generated literal is used or persisted
in a durable receipt. Generate the run ID/commitment into memory, immediately
append them and the private temp basename to the carrier, gate mode/count/
commitment, and only then create/name the durable run directory and preflight
receipts. Do not durably write `RUN_ID=...` first and normalize it as an
exception. Include every deterministic literal class, including all warm/load
labels (`t1-n3-ab-warm-*`, `t1-n3-ab-load-*`), emails/recovery addresses,
passwords, IPs, UAs, request/correlation/user/channel identifiers, temp IDs,
tokens/hashes/salts/ciphertext if observable. Raw literals never enter the
durable manifest.

## 6. Closed inventory, freshness, and semantic normalization

Apply freshness to every expected pre-adjudication receipt, not just statuses and
normal-cell streams: preflight/help/apply/backup/restoration/process/final-
custody/mutant/builder streams must not predate the run epoch. The expected set
is independently derived; observed set matches exactly; missing/extra/stale is
`CODEX BLOCKED (receipt)`.

Resolve builder self-timing explicitly. It is lawful for the manifest to label
its own incomplete status/manifest as deferred, but after builder exit the
adjudicator must require those exact receipts complete/fresh/run-bound. Builder
stdout/stderr that exist while it runs must be treated consistently. Store the
pre-builder frozen cell finalization order as such; after builder exits, the
adjudicator independently reads the durable order and requires exactly
`frozenCellOrder() + manifest-build`. Do not compare the pre-builder manifest
array directly against the post-builder length.

Replace the incomplete static `digestByIdentity` with a closed semantic
normalization registry. At each permitted digest/run-commitment site:

1. parse exact receipt/JSON grammar and identity/path;
2. compute or obtain the exact expected value from frozen authority or verified
   runtime semantics (governed/artifact/packet/authority SHA, backup governed
   SHA, installed patched-source SHA, mutant preimage/restore SHA, helper SHA,
   carrier commitment, manifest-builder fields, run commitment);
3. require exact equality; and only then
4. normalize that exact token before generic long-hex/UUID/email/IP/path scans.

Any unsupported digest or wrong identity/value remains forbidden. This must
cover packet/authority, backup/temp, installed-source, mutant, restore, helper,
builder and commitment receipts—not just governed/artifact header identities.

Fix mutant 10's exact anchor across wrapper, matrix, and adjudicator: the current
adjudicator call uses `normalize`, not `headers`. The mutation helper must replace
exactly one current site and the mutant must fail for the intended secret-scan
reason. Do not weaken the scan to make the mutant construct.

## 7. Terminal scanner and exact marker binding

Pass the expected run commitment explicitly to the terminal scanner. Scan the
complete ANSI-stripped adjudicator stdout, stderr **and status receipt** after
site-verifying/normalizing that exact commitment. Require status receipt integer
equals the actual adjudicator exit and commitment equals the active run.

Count lawful markers across the entire stdout. Require exactly one total lawful
marker, no extra scientific/blocked marker anywhere, and exact status mapping:
0 + one scientific; 2 + one blocked while wrapper remains nonzero; 3 + exactly
rss-safety; anything else fails closed. Do not accept merely because the last
line is lawful.

The Claude author result for this correction must itself equal its required
marker byte-for-byte. No summary, prefix, suffix, whitespace, or Markdown.

## 8. Seal evidence after adjudication

Restoration/final-custody receipts are written and finalized once before builder
and adjudicator. After the terminal scanner accepts, `t1_finish` must not rewrite,
touch, truncate, or append to any adjudicated receipt. Use explicit state such as
`T1_RESTORATION_FINALIZED`/`T1_EVIDENCE_SEALED`: later cleanup may read/verify
bytes and remove private temp/carrier data, but durable evidence bytes remain
identical to what was adjudicated. Failure cleanup before sealing may finalize
receipts once; never mutate after sealing.

## 9. Command matrix is one exact executable truth

Remove stale fixed-log paths, bare statuses, direct unsupervised commands, stale
M10 bytes, and any alternative execution recipe. The diagnostic wrapper is the
sole executable procedure. The matrix must exactly enumerate the wrapper's
unique-run receipt names, counterbalanced cell IDs/arguments, supervised launch,
run-bound status grammar, stop/restore/adjudication order, exact mutant anchors,
and four markers. It may quote or cross-reference reviewed wrapper sections, but
must not present a second divergent script.

## 10. Parent-observed close-to-exit measurement

This remains measurement-only pending V ratification. Each child signals close
initiation through a private run-bound marker/seam; the supervising parent records
that event with its own monotonic clock and records the exact child/group reap
time from the same clock domain. Report their nonnegative difference. Do not
substitute workload elapsed time or teardown-complete time and do not invent an
acceptance threshold.

## Static completion contract

Self-review all eight artifacts and all cross-artifact names/anchors. Preserve
the approved science unchanged: AB/BA x5; H/Q co-primary >=9/10 with ties lose;
`11/1024`, Bonferroni `0.025`, 97.5% exact Clopper–Pearson; historical H>465;
every three-worker H<=430/headroom>=35; the same four terminal markers; 512 MiB
abort; no product/release/current-N*/worker-count authority.

Return exactly and only:

`T1 THREE-WORKER A/B CORRECTION 4 READY FOR STATIC CHECK`

Do not include a summary. Do not claim Sol/V/execution/product/release/Kanban
approval.
