# T1 Claude Opus — three-worker A/B artifact correction 3

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router
Kanban: `accounts-phase1` / `t_b225b2f2`
Status: static support-artifact repair only; **NO EXPERIMENT OR TEST EXECUTION**

## Authority and entry custody

Continue Claude Opus session `e4f0558b-1204-4ca9-b349-59c8edc79909`.
Read this packet completely before editing. The governing scientific design is
`T1-claude-3worker-ab-draft-packet.md`, SHA-256
`a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503`.
Correction 1, SHA-256
`90734f6a1e8fc85f04c65406daacd678dc7cfcec2299665cfe2118dc5be3c595`,
remains the substantive artifact contract. Correction 2, SHA-256
`873d3daf85af2fa4a169974b1404a18ce9af9ec56f9512fddf3ba25e50a7a958`,
is provenance for the present entry bytes. This packet supersedes correction 2
where the two Sol xHigh final reviews identified deterministic defects.

Required repository state is HEAD
`9801f85d97e4263a7c8311304e29d6a03c4a6d15`, empty index, and the twelve
governed hashes frozen in the design packet. Entry artifact hashes are:

```text
7d0fc09a41951b15ef5c2eb1fee15b4f90a4399a13ade5cc77f7fb8f85186260  T1-3worker-ab-booted-rss-harness.mjs
82df221fcb109407520cf3e460c77fe9b7599e5c42f202d79d78971b33927c70  T1-3worker-ab-adjudicator.mjs
53e2e99c35b54271dfd6484b10ad4f2dc533a12d303a9c49e9003146d4f9f6a1  T1-3worker-ab-command-matrix.md
7392cb7642a6d7e8204ddf146886f032b23f241bc09bfe5a3083ca39d6ac7045  T1-3worker-ab-integration.patch
34887006ddafc77df1af5c33d6a848a609c4610a415b64041f8d2bb675a66e61  T1-3worker-ab-architecture.patch
600a795ddb67c52264512dd3ac58db1ffad83bbb7da232b4cab25d7c92ceb893  T1-3worker-ab-mutation-helper.mjs
cab7eedb8557fa695f387207094b4c8a2d3e5f1451cd3e176d2e9810cc327395  T1-3worker-ab-manifest-builder.mjs
179b8f524a897e5b9da50c11c7765110063eaa38c62eb55b5c35809c3804d11e  run-claude-T1-3worker-ab-diagnostic.sh
```

## Write scope and prohibitions

Edit only the eight artifacts listed above. Do not edit product source, governed
tests, design/authority packets, authoring receipts, mission progress, Kanban,
or quarantined paths. Do not add a ninth support artifact. Claude has no Bash
tool: use only `Read`, `Edit`, `Write`, `Glob`, and `Grep`.

Do not run Node, Python, zsh, Git, Vitest, pnpm, a patch, wrapper, harness,
adjudicator, builder, worker, PostgreSQL, or any command. Do not stage, commit,
push, move tickets, or claim execution evidence. The outer launcher performs
only syntax and patch-application checks after the author seat exits.

## Required correction — process identity and cleanup

Replace the false `( setopt monitor; exec ... ) &` isolation with a real new
session/process-group launcher. The diagnostic wrapper must launch every cell
through `/usr/bin/python3` using `os.setsid()` followed by `os.execvp()` (or an
equally explicit reviewed supervisor), so the exec keeps the launched PID.
Before accepting a cell as live, read back and assert `pgid == pid`,
`pgid != wrapperPgid`, and the PID/PGID still identifies the launched child.
Failure is `CODEX BLOCKED (custody)` before scientific adjudication.

Maintain two separate concepts:

- immutable historical PID/PGID receipts for evidence; and
- an active identity-bound process table used for signals.

Remove an identity from the active table immediately after its exact child is
waited/reaped. TERM/KILL may target only a still-live, currently verified group
in that active table. Never signal a completed/historical numeric PID or PGID.
If group capture or ownership validation fails, signal/reap the direct child as
a bounded fallback and block custody; never use an unverified negative PGID.

## Required correction — closed receipt inventory and secret safety

Delete prefix-wide `T1-3worker-ab-*` enumeration from adjudication. It must not
scan support source, patches, packets, manifests as arbitrary text, or Claude
author transcripts. The manifest builder must independently construct a closed,
authority-bound inventory from the frozen schedule and exact required lifecycle
receipts. That inventory must name every normal-cell stdout/stderr/status,
mutant mutation/run/restore stream and status, preflight/help/apply/backup,
restoration, process-custody, final-custody, and manifest-builder stream/status
that exists before adjudication. The adjudicator compares the observed
pre-adjudication inventory against that independent expected set exactly—no
count set from the same directory enumeration and no omitted/extra durable
runtime stream.

Adjudicator output cannot recursively adjudicate itself. Use an explicit
two-stage boundary: (1) the adjudicator scans and validates the complete closed
inventory finalized through manifest-builder completion, then exits; (2) the
launcher records the adjudicator stdout, stderr, and raw status and invokes a
small terminal scanner/linter that independently validates those exact three
receipts, including ANSI-stripped forbidden-literal/shape checks and exact
marker/status mapping. The terminal scanner's own output is a fixed code-only
launcher decision, not recursively added to the adjudicator inventory.

Scan the complete ANSI-stripped bytes of that closed pre-adjudication receipt
inventory. Do not scan the support
sources or private raw-literal carrier as durable evidence. Legitimate hashes
may be normalized only after the field/line grammar, artifact/path identity,
and exact authority-bound expected SHA are verified. Normalize the approved
value at that precise site, then run generic UUID/long-hex/email/password/IP/
identifier/path scans; no blanket SHA whitelist and no arbitrary 64-hex escape.
Report JSON fields such as `packetSha256` must likewise be structurally checked
against the exact approved SHA before normalization.

Every execution uses a newly created unique run directory with exclusive
creation, a high-entropy run commitment, and no reuse of fixed receipt names
outside that directory. Bind the commitment (never a raw secret or path) into
every cell report/status pair, manifest, builder result, adjudicator input, and
terminal scanner. The builder/adjudicator verify exact run binding, freshness,
cell finalization order, and that no receipt predates the run preflight. Stale or
cross-run receipt replay is `CODEX BLOCKED (receipt)`.

The mode-0600 private carrier must be created before any generated literal is
used; gate owner-only mode/readability, count, and commitment. It must contain
every deterministic/generated literal used by both integration and standalone
cells, including emails, recovery addresses, passwords, tokens/hashes/salts/
ciphertext when observable, IP/source strings, user agents, correlation/request/
user/channel identifiers, and temporary per-run identifiers. It remains outside
the durable manifest and is destroyed before the final marker. Never persist a
raw literal in the manifest itself.

Remove every raw `console` forwarder. Install identifier-safe capture before
embedded database boot/module `beforeAll`, keep it active through final drain
and database teardown, and emit only fixed code/count metrics. Standalone
capture must suppress or code-map raw arguments rather than writing
`args.map(String)` to stderr. The outer wrapper must ANSI-strip and fixed-string
validate the adjudicator output (`grep -F` semantics are insufficient alone;
also run the same forbidden-shape/literal policy) before accepting a marker.

## Required correction — exact success and stop semantics

Accept exactly one of these four scientific markers, byte-for-byte:

```text
THREE-WORKER A/B REPRODUCED AND SUPPORTS CREDENTIAL CONCURRENCY HYPOTHESIS
THREE-WORKER A/B ORDINARY QUEUE SIGNATURE ONLY — HISTORICAL RED NOT REPRODUCED
THREE-WORKER A/B CONTRADICTS CREDENTIAL CONCURRENCY HYPOTHESIS
THREE-WORKER A/B MIXED OR INCONCLUSIVE
```

No prefix wildcard is lawful. Adjudicator status 0 plus exactly one lawful
scientific marker is the only scientific-success combination. Status 2 must map
only to exactly one lawful `CODEX BLOCKED (...)` marker and the outer diagnostic
must remain nonzero; it can never become wrapper status 0. Status 3 always maps
to `CODEX BLOCKED (rss-safety)`. Any other combination blocks receipt/custody.
Mutants 1–7 must stop at once on survivor, zero selection, or wrong intended
failure—do not continue later mutants and defer rejection.

## Required correction — 512 MiB coverage and structured cleanup

The ruled 512 MiB diagnostic abort covers every three-worker Node process,
including integration, architecture resource/fault children, and standalone
cells. Provide a <=5 ms observer for each actual Node process (not merely a
different parent Vitest PID), identify which PID is measured, and preserve the
peak samples in the structured report. On breach: stop admitting/starting work,
let already-active bounded work settle where safe, cancel queued work, close the
pool/service/database, zero secret buffers, emit a structured safety report,
then exit exactly 3. Use `try/finally` so a thrown assertion cannot strand a
worker or database. The wrapper must propagate 3 as rss-safety, never status 1
or `normal-cell`. Do not claim a prompt-exit bound from whole-workload elapsed
time. Separately report the monotonic close-initiation-to-process-exit duration,
but treat it as measurement-only: no numeric prompt-exit acceptance threshold
has been ratified by V. A hang still fails through the wrapper's bounded cell
timeout/custody path; the author must not invent a new scientific threshold.

Architecture resource and fault headers must include finite
`eventLoopDelayP99Ms` and `eventLoopDelayMaxMs` in the exact header object the
adjudicator validates, not only as unrelated top-level child fields.

## Required correction — harness/product contracts

`mailDispatchOccupancy()` returns `queued`, `inFlight`, `activeSends`,
`maximum`, and `maximumQueued`; it does not return `active` or
`pendingPostwork`. Standalone drain checks must use the real fields and require
exact zero for `queued`, `inFlight`, and `activeSends`. Do not invent or require
an unauthorized product API/seam.
Keep the truthful buffer-zeroing cleanup event: make harness and adjudicator
agree on one exact cleanup order including it, and ensure the event occurs after
the buffers were actually zeroed.

The integration diagnostic must assert object identity proving the same sole
pool instance reaches the repository/audit hasher and registration service/
credential hashing path. A count-only assertion is insufficient.

## Required correction — lifecycle fixtures

Make the architecture lifecycle fixtures non-vacuous:

- `late-exit`: the first termination remains pending/unconfirmed past the
  confirmation deadline; only an explicitly controlled later `exit` confirms
  death. Assert no replacement begins while death is unconfirmed and assert
  live/physical maxima synchronously.
- `retry-fulfilled`: inject a real first termination rejection or unconfirmed
  attempt, then a distinct second termination attempt that fulfills and permits
  exactly the ruled transition. It must not be an ordinary first-call close.
- `settledExactlyOnce` must observe the job/fault/close interleaving under test,
  not a separate job completed before fault injection.

## Required correction — executable custody

The diagnostic wrapper itself, before any backup, edit, test, worker, or
PostgreSQL launch, must verify:

- exact checkout and outer Git roots;
- exact HEAD and empty index;
- the approved design and launch-authority packet hashes;
- all eight support artifact hashes approved for the eventual run; and
- all twelve governed file paths **and their exact frozen SHA-256 values**.

Do not merely check twelve names/cardinality. Treat `git diff --check` nonzero as
a custody block. For each governed backup, record SHA, byte size, and nanosecond
mtime where available; after unconditional restoration compare SHA, size,
mtime, and `cmp`. Restoration happens before manifest construction/adjudication.

Remove the trailing literal `</content>` from the command matrix and ensure no
tool-envelope token remains in any support artifact. Align the command matrix,
builder, adjudicator, and wrapper on these exact rules; there must be one
executable truth, not a stricter prose matrix and weaker wrapper.

Place any embedded Python supervisor in this exact shell no-op-heredoc envelope,
with the raw Python occupying only the indicated body:

```text
: <<'T1_N3_AB_PY_SUPERVISOR_HEREDOC'
# BEGIN T1_N3_AB_PY_SUPERVISOR
<raw Python body>
# END T1_N3_AB_PY_SUPERVISOR
T1_N3_AB_PY_SUPERVISOR_HEREDOC
```

Have the diagnostic wrapper extract that exact body for use. The outer static
author launcher requires each of the four envelope lines exactly once and in
that order, extracts only the intervening body, and passes it to Python
`compile()` without executing the diagnostic. A malformed envelope, empty body,
or compile failure is a static custody block.

## Static completion contract

Self-review all eight artifacts against every requirement above. Preserve the
scientific schedule/statistics already approved: AB/BA x5, H/Q co-primary
9-of-10 sign rules, ties lose, `11/1024`, Bonferroni `0.025`, 97.5% exact
Clopper–Pearson intervals, H>465 historical severity, all three-worker
H<=430/headroom>=35, four exact markers, and no production/release authority.

Return exactly:

`T1 THREE-WORKER A/B CORRECTION 3 READY FOR STATIC CHECK`

Do not claim Sol approval, V execution approval, product approval, release
approval, empirical evidence, or Kanban Done.
