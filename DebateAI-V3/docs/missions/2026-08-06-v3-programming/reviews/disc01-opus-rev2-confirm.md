# DISC-01 — Opus 5 lens, rev 2 CONFIRMATION

**Ticket:** `t_1589a6cc` · board `debateai-v3` · dual diamond, Opus lens.
**Scope (P8):** confirm — or refute — that the four blockers *I* raised in
`reviews/disc01-opus-rev1.md` are closed. This is the final confirmation of the
mission. I re-ran my own killing mutations; I did not accept the worker's ledger
on its word.
**Delta reviewed:** `git diff 2fea51b` at `/Users/vladmihaimiron/Documents/DebateAIRO`
plus untracked `acceptance/discovery.ts`, `acceptance/mono-panel.test.ts`,
`acceptance/test-fixtures/codex-sessions/`, and the rewritten
`handoffs/DISC-01-codex-handoff.md` (§"Rev2 blocking-review rework").

**Isolation (DR-163).** Every gate and every mutation ran in
`/private/tmp/disc01-confirm-clone`, an APFS clone (`cp -Rc`) of the parent root,
deleted at the end of this review. The standing stack (PG 55432 / API 8790 /
shim 8791 / grok-relay 8792 / UI 3000) was never started, stopped, migrated,
written or otherwise touched. Because the rev2 work is **commit-free**, `git
checkout --` would have destroyed it: every mutation was therefore restored from
a byte-level backup, and I verified restoration with `md5` — all five mutated
files are byte-identical to their pre-mutation state, and the clone's
`git status` line count is unchanged (68 before, 68 after).

**Model spend disclosure.** This confirmation ran **zero** model completions.
The B1 confirmation replayed my own *archived* rev1 stdout against real on-disk
data; the B4 confirmation used the real-PostgreSQL single-relay composition test
with an HTTP provider double. No CLI was invoked. The only real completions in
this ticket's history are the ones inventoried under A1 below.

---

## 0. VERDICT SUMMARY

All four of my blocking findings are **CONFIRMED CLOSED**, each by the killing
mutation I originally used to prove the gap, re-run against the rev2 tree.

| # | Finding (rev1) | Status |
|---|---|---|
| **B1** | codex parser written against a fabricated event shape; OpenAI house ABSENT on every real boot | **CONFIRMED-CLOSED** |
| **B4** | discovered panel of ONE crashes the live composition root with a raw `TypeError` | **CONFIRMED-CLOSED** |
| **B2** | four non-apparatus render proofs cut from `ux01` | **CONFIRMED-CLOSED** |
| **B3** | live composition root unpinned (panel cap / attempt bound survive) | **CONFIRMED-CLOSED** |

Advisories A1 (probe spend disclosure), A2 (stale proof scripts), A3 (dead
`discovery.ts`), A4 (duplicate condition mark) are all addressed; the A1
ledgering deferral is honestly argued and I judge the argument sound (§5).

**The shape of the repair matches the shape of the failure.** My rev1 summary
was that "the engine is right; the wire between the engine and the world was
never run." Rev2 ran the wire: the parser now reads what the real CLI actually
persists, the composition root composes for a panel of one, the live root is
pinned functionally rather than only by source string, and the rendered page is
rendered again.

---

## 1. GATES (clone, real embedded PostgreSQL)

```text
$ pnpm test
 Test Files  81 passed (81)
      Tests  584 passed (584)
   Duration  35.47s

$ pnpm typecheck
$ tsc --noEmit
(exit 0, no output)

$ pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }

$ pnpm vitest list | wc -l
584

$ pnpm vitest run --config acceptance/vitest.config.ts
 Test Files  11 passed (11)
      Tests  43 passed (43)

$ pnpm vitest list --config acceptance/vitest.config.ts | wc -l
43
```

584 is the expected count and it reproduces exactly. The real-PostgreSQL
integration tests are inside that 584 — seven `tests/integration/*-database.test.ts`
files ran, including `database.test.ts`'s DR-182(6) claim-gap cases
(*"re-probes once at claim, records a missing pinned member, shrinks, discloses,
and serves"*, *"records a failed claim-time re-probe and stops loudly only when
the effective panel is empty"*, *"calls the depth guard for a mono-maker run
before persisting any model call"*). Every number the handoff claims is honest.

---

## 2. B1 — codex parser and the fabricated event stream · **CONFIRMED-CLOSED**

### 2.1 What rev2 changed

`parseCodexCompletion` (`acceptance/model-shim.ts:130`) no longer looks for a
`model` field in stdout — the field the real CLI never emits. It now takes the
`thread_id` from the real `thread.started` event, locates the matching persisted
Codex rollout (`~/.codex/sessions/**/…-<threadId>.jsonl`), verifies the rollout's
`session_meta.payload.id` equals that thread id, and resolves **exactly one**
`turn_context.payload.model`, throwing `CODEX_CLI_MODEL_UNRESOLVED` on zero or
multiple candidates.

### 2.2 My archived real output, replayed — the decisive test

My rev1 archive `/private/tmp/opus-disc01-live.log` survives, and my rev1 §4.1
capture preserves the real stdout verbatim, including its thread id
`01a000e7-3ea0-7f91-b166-7104741ef333`. **That thread's real rollout is still on
this machine**, written by my own rev1 handshake:

```text
/Users/vladmihaimiron/.codex/sessions/2026/08/14/
  rollout-2026-08-14T18-32-30-01a000e7-3ea0-7f91-b166-7104741ef333.jsonl

session_meta.payload.id = 01a000e7-3ea0-7f91-b166-7104741ef333
turn_context.payload.model = gpt-5.6-sol      (exactly one such event)
```

I replayed **my own archived real stdout** — the four events that made rev1
BLOCKING — through the fixed parser against the **real** sessions tree:

```text
$ tsx acceptance/opus-rev2-b1-replay.ts /Users/vladmihaimiron/.codex/sessions
REPLAY RESULT: {"content":"OK","model":"gpt-5.6-sol"}
```

The exact input that produced `CODEX_CLI_MODEL_UNRESOLVED` in rev1 now resolves
the CLI's own model id. **A healthy codex resolves its model id.** The scratch
replay file was deleted before the gates were run.

### 2.3 The fixture now mirrors the REAL event stream

`acceptance/model-shim.test.ts:27–32` is my rev1 capture, event for event:

```ts
JSON.stringify({ type: "thread.started", thread_id: "01a000e7-3ea0-7f91-b166-7104741ef333" }),
JSON.stringify({ type: "turn.started" }),                      // model-less, as the real CLI emits
JSON.stringify({ type: "item.completed", item: { id: "item_0", type: "agent_message", text: "OK" } }),
JSON.stringify({ type: "turn.completed",
  usage: { input_tokens: 15490, cached_input_tokens: 0, output_tokens: 5 } })
```

Same thread id as my real capture, and `input_tokens: 15490` is the exact figure
my rev1 review recorded from the real run. The fabricated
`{"type":"turn.started","model":"gpt-fixture"}` shape is **gone repo-wide**: a
sweep of `acceptance/` and `tests/` for `turn.started` returns only model-less
occurrences, and `acceptance/test-fixtures/fake-codex-cli.mjs` was corrected to
emit `thread.started` + model-less `turn.started` too. The rollout fixture at
`test-fixtures/codex-sessions/2026/08/14/rollout-…-01a000e7-….jsonl` carries the
real two-event shape (`session_meta.payload.id`, `turn_context.payload.model`).

### 2.4 The worker's real handshake — independently corroborated

The handoff discloses one real handshake at 16,009 input tokens. I did not take
this on trust; I found it on disk and verified all four figures:

```text
rollout-2026-08-14T18-47-25-01a000f4-e6a2-7a62-abc1-6def3ebe6fe0.jsonl
  originator: codex_exec   cwd: …/DebateAI-V3   model: gpt-5.6-sol
  total_token_usage: { input_tokens: 16009, cached_input_tokens: 11008,
                       output_tokens: 5, reasoning_output_tokens: 0 }
```

Every disclosed number matches exactly. I also confirmed rollout accounting is
1:1 with stdout `turn.completed` usage (my own thread reports 15,490 in both), so
the disclosure is directly comparable and not a re-based figure. The captured
shape in the fixture is the shape this real handshake produced.

### 2.5 Killing mutation

| Mutation | Target | Result |
|---|---|---|
| Parser reverted to resolving the model from stdout `event.model` — the rev1 fabricated contract | `acceptance/model-shim.test.ts` | **RED** — 4 failed, `CliRelayFailure: CODEX_CLI_MODEL_UNRESOLVED` |

The rev1 defect is now caught by the suite. B1 is closed: the transport claim is
verified against the real CLI, the loss of the OpenAI house is reversed rather
than merely disclosed, and the fixture can no longer drift from reality without
turning the suite red.

---

## 3. B4 — panel-of-one boot · **CONFIRMED-CLOSED**

### 3.1 What rev2 changed

`acceptance/main.ts:285` replaces the unconditional non-null assertion with a
conditional spread, exactly the remedy my rev1 §9.0 prescribed:

```ts
...(additionalProviders[0] === undefined ? {} : { critique: {
  provider: additionalProviders[0].gateway,
  providerRef: additionalProviders[0].providerRef,
  maker: additionalProviders[0].maker
} }),
additionalMakers: additionalProviders.slice(1).map(…)
```

No `!` remains on that path; a panel of one composes a runner with `critique`
absent, which the runner already handles at construction.

### 3.2 The scenario I reproduced live in rev1 now boots and serves

`acceptance/mono-panel.test.ts` is new and is the composition test I asked for.
It builds `createAcceptanceRuntime` from **one** relay on **real embedded
PostgreSQL** with the acceptance register seeded, submits a **high-stakes,
depth-4** ask — the same tier and depth as my rev1 crash repro, chosen to
exercise DR-182(2) and DR-182(3) together — and asserts on the served answer:

- ask admits `202`, work item reaches `DONE` (so the API listened and served —
  the thing that was unreachable in rev1);
- `confidence_band === "CAPPED"` — DR-182(3)'s ruled band cap, live;
- `condition_marks` contains both `SINGLE-LINEAGE` and `CRITIQUE-UNAVAILABLE`;
- `CRITIQUE-UNAVAILABLE` appears **exactly once** (this also pins A4);
- `condition_mark_records` carries
  `MONO_LINEAGE_DEPTH_NOT_EXPANDED:requested_depth=4` with lift path
  `RUN_DIFFERENT_MAKER_CRITIQUE` — DR-182(2)'s disclosure and the preserved lift.

**Disclosure of what I ran.** I did not re-run a live three-CLI ceremony for
this. I ran the real-PostgreSQL integration equivalent, which the goal permits:
the mono composition is exercised end-to-end on a real database with an HTTP
provider double, at **zero model spend**, on ephemeral reserved ports with a
fresh `mkdtemp` data directory torn down afterwards. This is a strictly better
regression surface than my rev1 live repro, because it runs on every `pnpm
vitest --config acceptance` invocation rather than only when two CLIs happen to
be down.

### 3.3 Killing mutation

| Mutation | Target | Result |
|---|---|---|
| Restore the unconditional `additionalProviders[0]!.gateway` | `acceptance/mono-panel.test.ts` | **RED** — `TypeError: Cannot read properties of undefined (reading 'gateway')` |

The mutation reproduces my rev1 crash **verbatim**, and the suite now catches it.
DR-182(2) and DR-182(3) are reachable in production, and the residual
impossibility path is no longer an index assertion.

---

## 4. B2 and B3 — restored proofs and composition-root pins · **CONFIRMED-CLOSED**

### 4.1 B2 — the four proofs, each with its killing mutation re-run

`tests/render/ux01-new-debate-form.test.tsx` renders the real page again
(`@testing-library` render + real submit); the rev1 file of three pure-function
greps is gone. All four proofs I demonstrated as lost are present and each one
kills the mutation that walked past it in rev1:

| Proof | Test | My mutation | Result |
|---|---|---|---|
| **PROV-01** tier source | *"PROV-01 keeps untouched risk machine-defaulted and edited risk asker-owned through the real page"* | `tier_source` always `"MACHINE_DEFAULT"` | **RED** (1 failed / 5 passed) |
| **DR-166-A** dual-token owners through the real page | *"DR-166-A derives distinct decision and action owners for two authenticated tokens through the real page"* | `/new` hardcodes `"asker:anonymous"` | **RED** (2 failed / 4 passed) |
| **B6** as-of preservation | *"B6 refreshes untouched as-of at submit and preserves an explicitly edited value"* | submit overwrites an edited `as_of` | **RED** — `expected '2026-08-13T05:02:03.456Z' to be '2026-08-14T09:30:00.000Z'` |
| **R3** `aria-controls` | *"R3 exposes aria-controls exactly while the rendered Options panel exists"* | `aria-controls` always emitted | **RED** (1 failed / 5 passed) |

Each mutation was GREEN across all 581 tests in rev1. All four are RED now.

Two further repairs beyond the four, worth recording because they were part of
my rev1 §5 complaint:

- **The DR-180 polarity is fixed.** *"renders depth 1..5 while keeping retired
  apparatus and all machine-owned fields out of the DOM"* asserts the machine
  field ids are **absent** from rendered HTML. In rev1 the only surviving check
  was a source grep asserting those names were *present* — the opposite polarity.
- **The strengthening I asked for shipped.** *"submits the complete
  discovery-owned ask without an agent-count field"* asserts
  `expect(config).not.toHaveProperty("agent_count")` on the submitted payload.

My rev1 remedy named ten proofs; rev2 carries them as six consolidated rendered
tests (the owner/scope, machine-field and apparatus-absence cases are folded into
the two breadth tests above). I judge the coverage restored: the four proofs I
demonstrated as live coverage loss are each independently mutation-killed, and
`tests/render/` again contains real DOM-level proof of the `/new` surface, which
was the structural cause.

### 4.2 B3 — the live composition root is pinned

`acceptance/runtime-policy.test.ts` gains *"pins the live composition root to
complete discovery and register-owned structural bounds"*, which combines source
pins (`resolveFreshDiscovery({`, `return toDiscoveredPanel(resolved.panel);`,
`not.toMatch(/\.slice\(0,\s*2\)/)`, the two exact
`computeAcceptanceStructuralCeiling` call shapes) with a **functional**
assertion — `computeAcceptanceStructuralCeiling({ JUDGE/COMPOSER/CONFORMANCE
maxAttempts: 3, … }, 2, 1)` must yield `max_model_attempts: 74` and
`per_site_attempts: { judge: 3, organ: 3 }`. 74 is my independently recomputed
`ceiling(2,1)` from rev1 §3, so the pin is anchored to a number I derived myself
from the call-site inventory, not to a literal copied from the implementation.

The ceiling's **inputs** are now register-owned rather than literal:
`computeAcceptanceStructuralCeiling` reads `policy.bounds.JUDGE.maxAttempts` and
`Math.max(COMPOSER, CONFORMANCE)` from the parsed register rows. That is the
precise gap H4/H4c exploited in rev1.

| Mutation (rev1's survivors) | Target | rev1 | rev2 |
|---|---|---|---|
| Cap the live discovered panel at 2 (`resolved.panel.slice(0, 2)`) | `acceptance/runtime-policy.test.ts` | GREEN — survived | **RED** (1 failed / 4 passed) |
| Compute the ask-time ceiling with `judgeMaxAttempts: 1, organMaxAttempts: 1` | `acceptance/runtime-policy.test.ts` | GREEN — survived | **RED** (1 failed / 4 passed) |

Both properties DR-181(2) and DR-182(4) exist to make unrepresentable are now
unrepresentable. B3 is closed, and with it the gap that B4 walked into.

---

## 5. ADVISORIES

**A1 — probe spend disclosure · ADDRESSED; the ledgering deferral is sound.**
The handoff now discloses the real handshake's cost to the token (16,009 input /
11,008 cached / 5 output / 0 reasoning), and I verified all four figures against
the persisted rollout independently (§2.4). Probe completions are persisted
append-only in `core.provider_probe` and printed by the ceremony scripts.

The worker declines to write probes into `ledger.ledger_entry`, arguing that
doing so honestly needs a separately ruled schema/API migration. **I judged that
claim against the DDL and it holds.** `ledger_entry_action_kind_closed`
(`migrations/0015_s12.sql`) is a closed `CHECK` over ten values with no probe
member, so a probe row is *rejected by the database* today — admitting one
requires altering a ruled constraint, which is V's to rule, not the worker's to
assume. Beyond the constraint, `ledger_entry` requires `subject_item_id`,
`stance_at_action`, `outcome`, `actor_ref`, `input_hash` and `contract_hash` as
`NOT NULL` — all shaped for a model call against a work item. A boot probe has
no work item, so writing one today means inventing six values, which is exactly
the fabrication class this mission forbids. (`run_id` is nullable, so identity
alone would not have blocked it — the closed action-kind and the six NOT NULL
columns are what do.) Deferring to a ruled migration is the honest disposition,
and the spend is disclosed and recoverable in the meantime. Remains advisory.

**A2 — stale proof scripts · CLOSED.** `panel01-depth1-proof.ts` no longer
refuses a panel that is not exactly 2 roots; it asserts
`rootLineage.length === ceremony.discoveredPanelSize` (discovered N). Both it and
`xrev01-depth1-proof.ts` now check `modelCallCount` against the computed
`structuralCeilingMaxModelAttempts` instead of the retired `> 42` Set-A bound,
and both print `providerProbeEvidenceCount`. The runtime-policy test pins this,
asserting neither script matches `/M=2|\/42|DR159|RATIFIED_ENVELOPE/`. Grok's
condition 6 (harness touch-list) is now **MET** rather than partial.

**A3 — `discovery.ts` single source · CLOSED.** `probeRelay` is defined in
exactly one place (`acceptance/discovery.ts:45`); the hand-rolled duplicate in
`acceptance/main.ts` is gone, and the composition root imports `probeRelay`,
`resolveFreshDiscovery` and `toDiscoveredPanel` from that module. T1/T2/T5 now
pin the module the product actually calls — which is also the mechanical reason
the B3 panel mutation can be caught at all.

**A4 — duplicate condition mark · CLOSED.** `apps/runner/src/index.ts:1529`
wraps the merged marks in `Object.freeze([...new Set([…])])`, and the mark count
is pinned twice: by `mono-panel.test.ts` (`filter(m => m === "CRITIQUE-UNAVAILABLE")`
has length 1) and by a real-database claim-loss assertion.

**A5–A10 carry forward unchanged** as advisories. None was in scope for this
confirmation and none blocks: A5 (`NOT VALID` back-scan consequence for a legacy
in-flight run), A6 (the risk-policy rider lost with a justified deletion), A7
(`as const` numeric-literal lint exemption is accidental rather than declared),
A8 (the known-dead Hatchet API root never probes), A9 (composition organs absent
from the `MODEL_CALL` ledger — pre-existing, safe direction), A10 (raw system
message stored in `provider_probe.failure_code` where the design wanted typed
codes).

---

## 6. GROK'S CONDITIONS — the two I marked against

| # | Condition | rev1 | rev2 |
|---|---|---|---|
| 2 | D1 dead before discovery ships | MET IN LETTER, FAILED IN FACT (B1) | **MET.** The handshake succeeds against the real CLI; verified by replaying my own archived real output (§2.2). |
| 6 | Harness touch-list completed in the same ticket | PARTIAL (A2) | **MET.** Both proof scripts refreshed and pinned. |
| 9 | ASK-01 rev2 sequencing — remove **R2 only** | VIOLATED (B2) | **MET.** R1 and R3 restored through the rendered page; R2 remains removed as authorized. |

Conditions 1, 3, 4, 5, 7, 8, 10 were MET at rev1 and are unaffected by this
delta, except that condition 1's caveat ("correct in the engine, unreachable in
production") and condition 5's caveat ("the formula is pinned, its inputs are
not") are both now lifted by B4 and B3 respectively.

---

## 7. WHAT I CHECKED THAT DID NOT MOVE

Recorded so this confirmation is not read as broader than it is. I did not
re-run the T1–T9 ledger or my independent ceiling recomputation — both were
verified in rev1 and the rev2 delta does not touch the formula, the DDL identity,
the claim-time mechanism, or the M-apparatus retirement. The 584-test suite,
typecheck, lint and the real-PostgreSQL integration tests all pass, which is the
regression evidence that those properties survived the rework. My rev1 §8
("what is right") stands in full, with its two caveats now lifted.

---

## 8. STATEMENT

Four blockers, all mine, all closed — and closed by mechanism rather than by
argument. In each case I re-ran the mutation that proved the gap in rev1 and
watched it turn red, and in the B1 case I was able to do something stronger than
a mutation: feed the fixed parser the *same real bytes* that made rev1 blocking
and watch it resolve `gpt-5.6-sol`. The worker's disclosures are verifiable and
verified, including a spend figure I confirmed to the token against on-disk
evidence, and the one thing the worker declined to do is declined for a reason
the database itself enforces.

**VERDICT: APPROVE**
