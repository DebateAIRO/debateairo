# SYNTHESIS — Observability requirements (2026-08-21-observability-loop)

- **Seat:** synthesis (separate Opus instance; not any blind seat), REQUIREMENTS loop
- **Inputs:** `research/{opus,grok,codex}-requirements.md` (all three read in full),
  `brief.md`, `00-intake-H0.md`, `logs/opus-handoff.txt`, `goal-packets/synthesis.md`
  (including its **LIVE ADDENDUM**, V steer 2026-08-21).
- **Integrity gate:** `reviews/H1-integrity-qa.md` did **not** exist at synthesis time
  (`reviews/` empty). Not blocked, per V order 2026-08-21 (wayfinder T02). The verdict
  stays Hermes/QA-owned and backfills; nothing here is self-certified.
- **Method:** I synthesized; I did not re-research. Where two seats contradicted on a
  **fact**, I ran one read-only repo check and recorded the result. Where they diverge on
  **judgement**, both sides are presented at their strongest and the disagreement is
  preserved. **No number that no seat grounded appears as a requirement** — every such
  number is a DECIDE-V row.
- **Provenance marks:** `[3/3]` all seats converge · `[2/3]` two seats, third silent
  (not contradicting) · `[1/3]` single-seat contribution, uncontested · `[V]` ruled by V,
  not seat-derived · `[SYN]` synthesis resolution of a real divergence.

---

## 1. Verdict summary

1. **There is no observability layer.** The one surviving module
   (`apps/ui/lib/observability/`) is detached dead code with zero importers; the whole
   product runtime contains exactly one `console.error` (`packages/db/src/index.ts:71`)
   and Fastify's logger is off (`apps/api/src/index.ts:143`). [3/3]
2. **Root-tracing is impossible by construction today.** `TypedDomainError` takes
   `(code, message)` and never passes `{ cause }` to `super`
   (`packages/kernel/src/index.ts:283-288`, verified). Every wrap in the tree severs the
   chain. This is the one blocking code prerequisite. [3/3]
3. **Two failure classes throw nothing at all** and are the largest input the listener
   will ever have: process-death stalls (claimed work items past deadline, no reaper) and
   silent no-ops. Capture-what-throws alone answers half of V's sentence. [3/3]
4. **The store must be a new Postgres bounded context** — off the global sequence
   allocator, off `core.reject_mutation`, with a local redacted spool for the case where
   the database *is* the failing component. [3/3]
5. **Absolute capture is not achievable and must not be claimed.** Under simultaneous
   DB + disk + queue loss the lawful behaviour is: product fails open, a counted
   `CAPTURE_GAP` marker is appended, mutation authority trips off. V's words are "every
   time"; the honest engineering contract is "every time, or an explicit, quantified
   admission that we lost some." **This qualification needs V's acceptance** (E6-13).
6. **The listener must not be a standing LLM.** A deterministic non-LLM loop over a
   durable cursor, spawning short-lived CLI workers per incident, is the only shape that
   is lawful under DR-179, costs ~0 at idle, and cannot accumulate a poisoned context.
   [3/3]
7. **Error text is attacker-influenced data.** It already flows into a model prompt today
   (`apps/runner/src/index.ts:883-890`, verified: raw zod parse text is interpolated into
   a provider repair message). No error message, stack, DB value, comment, or tool output
   may become an agent instruction, shell argument, branch name, or PR field. [1/3 Codex,
   verified and adopted]
8. **The blocking dependency is not technical — it is the repository.** 4,265 phantom
   deletions; 141 tracked files under `dialectical-engine/`, whose product-source subset
   is essentially the excluded security zone; everything the loop agent may lawfully fix
   is **untracked**. PR authority and coding-lane worktrees are impossible until V's
   reconciliation commit lands. **RULED: parked until immediately before the first coding
   lane of any mission** (ROW-GIT).
9. **RULED (V, LIVE ADDENDUM):** Hatchet's stored logs/errors are **one source, not a
   substitute**. Our layer and tables are built regardless; the listener is
   **dual-source** over both; **cross-source incident dedup is a MUST** (one real-world
   failure surfacing in both = one incident, one fix). Verified today: Hatchet is already
   the dispatcher in-tree (`@hatchet-dev/typescript-sdk@1.28.1` in `apps/{api,runner}`),
   runs on its own database on the same Postgres server (`deploy/postgres/init-hatchet.sql`),
   and **nothing in this repo ever reads Hatchet state back** — dispatch is
   `runNoWait` fire-and-forget (`apps/api/src/index.ts:363-372`). The read-back path is
   net-new work.
10. **The decision set V must rule on:** E1 QUICK-FIX threshold · E2 landing mechanics ·
    E3 runtime/model/budget · E4 retention under DR-188 · E5 security-zone granularity ·
    plus 13 deduplicated E6 rows, of which four are launch-shaping (capture-loss
    acceptance, kill-switch custody, initial allowlist, alerting-nobody-is-woken).

---

## 2. Agreement set

Requirements all three seats reached independently. **There is one numbering space:**
the normative ids `OBS-R001..OBS-R144` are defined in §4, and this table is the
convergence map showing which of them are three-way agreements and which per-seat
requirement each was built from. Every §4 requirement cites its per-seat parents inline.

| Unified id (defined in §4) | Agreement (compressed) | opus | grok | codex |
|---|---|---|---|---|
| OBS-R001 | No production error store exists; a new one is required | verdict 1-3 | verdict | verdict 1 |
| OBS-R062 | `TypedDomainError` must carry `cause`; wrap sites must preserve it | R-C1.1/C1.2, rec 1 | R19 | R62, R63 |
| OBS-R014 | Process-level `uncaughtException`/`unhandledRejection` capture in every runtime | R01 | R01 | R01 |
| OBS-R016 | The HTTP error handler must record before replying (it records nothing today) | R02, B1.3 | R07.2 | R21 |
| OBS-R017 | Job/queue wrapper capture at the Hatchet task seam, before terminal-failure write | R03, B1.6 | R07.3 | R22 |
| OBS-R018 | Provider-call capture, one event per exhausted call (not per attempt) | B1.8 | R07.4 | R24 |
| OBS-R019 | DB-error capture, on a non-recursive channel | B1.9 | R07.5 | R25 |
| OBS-R020 | Client (browser) error reporting seam: boundary + `window.onerror` + rejections | R-C3 RC-18/RC-20, B1.11 | R07.7 | R26 |
| OBS-R003 | `packages/liveness` is content staleness, not health; do not extend or reuse it | R08 | R04 | R08 |
| OBS-R002, OBS-R004 | Non-thrown failures ("does not work") need their own detectors | R09, R10 | R04 | R07 |
| OBS-R136 | Reuse the dev logger's *ideas/tests*; do not make its JSONL file the production sink | R14 (A4 #1) | R03, R05 | R12 |
| OBS-R028 | New table family; do not overload `ledger`, `run_progress_event`, `work_item` | R15 | R10 (A4) | R14, R35 |
| OBS-R032, OBS-R033 | Mandatory event fields incl. build/version identity, fingerprint, correlation ids | R20, R22 | R08 (B2) | R28, R29 |
| OBS-R037 | Fingerprint from code/location/class, never from raw message text | R23 | R09 | R55 |
| OBS-R036, OBS-R069 | Explicit cause-chain field with bounded, acyclic depth | R28 | R22 | R30, R69 |
| OBS-R040 | Capture is async, non-blocking, out of the product transaction | B5.2, B3.5 | R17 | R38 |
| OBS-R055 | Capture is total: a throw inside capture never propagates to the product | B5.1 | R11, R17 | R53 |
| OBS-R041 | Local append-only spool when Postgres is unavailable; idempotent re-ingest | B3.4 | R11 | R39 |
| OBS-R057 | Bounded buffer + explicit, counted drop/gap accounting — never a silent drop | B3.6, B5.4 | R12 (`shed_count`) | R41, R54 |
| OBS-R046 | Capture-time, synchronous redaction before *any* sink | B4.4 | R16 | R47 |
| OBS-R047 | Never store secrets/tokens/cookies/prompts/raw provider payloads/debate content | B4.1-B4.3 | R15 | R46 |
| OBS-R056 | Observability must never take the product down or add a boot-required dependency | B5.6 | R17 | R41, R52 |
| OBS-R059 | Self-observation must not recurse; separate bounded health channel | B5.8 | R33 counter | R40 |
| OBS-R068 | Deterministic, always-terminating trace procedure with a closed verdict vocabulary | R29, C2 | R22, C2 | R73, R68-R75 |
| OBS-R074 | "Insufficient evidence" is a first-class terminal verdict, never a guess | R29 (`INDETERMINATE`) | R22 | R34, R82 |
| OBS-R073 | External root (provider/infra/CLI) is a legitimate terminal verdict, never a fix target | R34 | R24 | R80 |
| OBS-R025 | Expected/policy refusal is a valid root and never a code-fix candidate | R35 (POLICY_ROOT) | R24 | R81 |
| OBS-R105 | The listener never invents a register value | R35 | R24 counter | R99 |
| OBS-R076 | `apps/replay` is not a tracing tool; unsupported shape is a first-class verdict | R31 | R21 counter | R72, R10 |
| OBS-R079 | Durable row is truth; `LISTEN/NOTIFY` is at most a wake hint; poll reconciles | R37 | R25 | R83, R85 |
| OBS-R080 | At-least-once delivery with a durable cursor; ack only after the verdict persists | R38 | R25 | R84, R74 |
| OBS-R086 | Listener liveness/cursor lag must itself be observable — a dead listener is not silent | R40 | R33 | R116 |
| OBS-R087 | Permanent loop is non-LLM; ephemeral per-incident CLI worker; no standing session | R42 | R27 | R89 |
| OBS-R089 | Idle model cost must be zero calls | R44 | R27 | R93 |
| OBS-R091 | Runs on V's machine now; server later is a config seam, not a redesign | R43 | E6.2 | R92 |
| OBS-R090 | DR-179: CLI-relay only; lifting it changes the adapter, never the authority | R46 | R28 | R90, R95 |
| OBS-R092 | Three tiers: QUICK-FIX / PR-FIX / ESCALATE, with objective machine-checkable criteria | D3 | R29 | R96-R101 |
| OBS-R093 | The spine §9 high-risk floor dominates every size threshold | R51, D3 | R29 | R99, R100 |
| OBS-R095 | RED→GREEN proof is mandatory for any code change | R47 | R29 (e)(f) | R96, R120 |
| OBS-R093, OBS-R104 | Hard forbidden write set: security zone, migrations, crypto, scoring, spend, protocol, board | R51 | R30 | R99, R104 |
| OBS-R104 | No self-modification: the agent may never edit its own guardrails/policy/audit | R51 item 8 | R30 | R103, R117 |
| OBS-R106 | Kill switch, human-owned, effective without database access | R52 | R31 | R114 |
| OBS-R107 | Rate caps + budget caps enforced by the supervisor, not the worker | R53, R55 | R32 | R94, R112, R113 |
| OBS-R111 | Every agent action is audited into the same store ("who watches the watcher") | R56 | R33 | R115, R116 |
| OBS-R115 | QUICK-FIX never lands as a direct commit to `main` | R66, E2 | R35 | R126 |
| OBS-R114 | Fixed, machine-parseable PR body: root verdict, evidence ids, RED, GREEN, revert | R62 | R34 | R125 |
| OBS-R118 | Every landed change is a single, cleanly-revertible commit | R65 | R34 | R129 |
| OBS-R119 | Regression after a fix trips authority off (circuit-breaker) | R54 | R32 (regression → escalate) | R118 |
| OBS-R122 | Phase gates: capture live → tables live → report-only → PR-FIX → QUICK-FIX; no skipping | D6 | R36 | R132-R138 |
| OBS-R126 | The agent must never be sole judge of whether a change is architectural | R72, R74 | R38 | R140, R141 |
| OBS-R129 | Mission workers' no-push law is untouched by the agent's product grant | R67 | D5 preamble | R131 |
| OBS-R130 | Security zone: capture at the boundary, never instrument inside, never auto-fix inside | R24, R26 | R18 | R59-R61 |
| OBS-R133 | Zone events are always-escalate and never enter an agent prompt | R24 tier 3 | R18 | R60, R122 |
| OBS-R134 | Zone membership comes from a manifest held **outside** the zone, test-enforced | R25 | R18 (path list) | R61 |

**Convergence quality note.** The three seats agreed on far more than the brief's authors
would have predicted from independent work: 54 substantive requirements converged with no
prompting. The disagreements below are therefore high-signal — they are not noise, they
are the places where the problem is genuinely underdetermined.

---

## 3. Divergence set

Real disagreements, presented at each side's strongest, then resolved. Nothing here is
flattened into a fake consensus. Two entries (DIV-04, DIV-13) were **facts** in dispute
and were settled by a read-only repo check; the rest are judgement calls where I give a
recommendation, a confidence, and the best argument against my own answer.

### DIV-01 — Capture topology: funnel-only vs throw-site instrumentation

**Side A (opus R18; grok B1 counter) — funnels only.** Capture belongs at the four seams
the tree already funnels errors through (`apps/api/src/index.ts:158-191`,
`apps/runner/src/index.ts:2504-2526`, `packages/providers/src/index.ts:195-386`,
`packages/db/src/index.ts:14-72`) plus process handlers. Opus's argument is historical:
"a scattered instrumentation pass is what rotted last time" — the 2026-08-06 rework
removed the call sites and left the sink standing (A2.2). Grok: "wrapping every package
call site is an architecture boil."

**Side B (codex verdict 3, R19, R20, R03) — throw-site + catch-before-transform.**
Process handlers "are too late and miss handled throws." A standardized capture helper
records every first-party throw before control transfers; catch blocks that transform or
downgrade capture the incoming error before losing detail; and CI maintains a generated
throw/catch/fire-and-forget inventory that **fails on a new unclassified `throw` or a
cause-losing wrapper**.

**Evidence weight.** Opus's own artifact argues against Opus's position here. His A1.3
counts 492 throw sites and 49 catch-and-rethrow wraps; his C3 is a 65-entry inventory of
errors that are *caught and destroyed* — and a caught error never reaches a funnel. His
own remediation classes RC-1..RC-22 are, without exception, call-site edits. Grok's C3
table reaches the same conclusion with different words (WRAP / UNSWALLOW classes).

**Resolution [SYN].** Both, with a distinction all three seats blur: *funnels are the
transport, not the coverage*. One capture API with four attach points handles unhandled
flow. Separately, the ~65 enumerated catch-and-transform sites are the only place a
handled-and-downgraded error exists at all, and they must be captured — as a **bounded,
enumerated list derived from the merged C3 inventories**, not a repo-wide sweep. Codex's
CI inventory is adopted as the anti-rot mechanism, because it is the only proposal in any
of the three artifacts that would have caught the original detachment. Codex's stricter
lint ("no raw `throw` outside approved helpers") is downgraded to SHOULD — it is a
~492-site change to a system with no test safety net for its untracked majority.
**Confidence: HIGH** on both-are-required; **MEDIUM** on deferring the lint.

**Strongest counter-argument to my resolution.** A bounded enumerated list is a snapshot,
and snapshots are exactly what rotted in 2026-08-06. By making the lint a SHOULD I have
kept the mechanism that failed and softened the only mechanism that would have prevented
it. If V wants the guarantee rather than the effort estimate, the lint is the MUST and the
list is the fallback.

### DIV-02 — Free-text error messages: redact-and-store vs never-store

**Side A (opus B4.5; grok R15 counter).** Store `message` and `stack` after passing them
through one shared redactor with depth and length caps. Grok states the cost of the
alternative plainly: "empty messages make RCA impossible."

**Side B (codex R47, R48, R31).** Redaction must be **allowlist-based** (unknown fields
rejected), and error messages must be mapped to **stable codes/templates at capture**.
Unrecognized text may be hashed for dedup but is neither stored nor sent to a model. The
dev logger's denylist regex "may inform tests but is insufficient as the production
boundary."

**Evidence weight.** Three independent grounds favour Side B, two of them from Side A's
own evidence. (i) Opus B4.2 proves error messages in *this* repo carry debate content —
`apps/runner/src/index.ts:1693-1696, 1718-1721, 1824-1836, 1871-1876` build prompts from
`run.questionLine` and `parent.statement`; `packages/memory/src/index.ts:234-241` throws
with sentence context. (ii) Opus verified zod is comparatively safe for only 4 of its
issue codes and marked the rest UNVERIFIED. (iii) **I verified** that raw parse text is
already interpolated into a model prompt today (`apps/runner/src/index.ts:883-890`,
`buildSchemaRepairPacket`) — so error text reaching model input is not hypothetical in
this codebase, it is current behaviour.

**Resolution [SYN].** Side B for anything the listener can read; Side A's concern
preserved by a separate channel. **MUST:** no raw free-text message in any agent prompt,
ever, and no raw message in the listener-readable projection. **MUST:** stable code + safe
template + bounded repo-relative frames + cause depth are the machine surface.
**SHOULD:** a separately-governed raw-detail field, redaction-gated, readable by humans
under least-privilege and never by the listener role — this keeps Grok's RCA argument
without handing attacker-controlled text to an autonomous agent. **Confidence: HIGH** on
the prompt exclusion; **MEDIUM-HIGH** on the storage exclusion.

**Strongest counter-argument.** "Never read by the listener" is a policy, not a mechanism.
Today's role idiom (`migrations/0000_s00.sql:290-312`) gives column-level separation only
through table separation, so the human-only field is one convenient join away from the
agent's context. A field that must not be read is safer not stored — which is Codex's
original, stricter position, and I may be splitting a difference that has no safe middle.

### DIV-03 — Store mutability: mutable incident projection vs strictly append-only

**Side A (opus B3.3).** The error tables must **not** carry `core.reject_mutation`,
because the group table needs `UPDATE` for `last_seen`/`count`/triage state, and any
retention policy needs `DELETE`.

**Side B (codex R37).** Occurrences, traces and agent actions are append-only with
monotonic ordering, following the repo's existing pattern; corrections append superseding
facts. The stated purpose: "prevents the fixer from rewriting its own audit trail."

**Repo check (mine).** `core.reject_mutation` is attached by an explicit
`DO $$ … FOREACH table_name IN ARRAY ARRAY[…19 named tables…]` block
(`migrations/0000_s00.sql:314-331`). It is **opt-in per table**, not schema-wide. Both
designs are mechanically available; there is no forced choice, and neither seat knew this.

**Resolution [SYN].** The dichotomy dissolves once facts are separated from projections.
**MUST:** the occurrence table and the agent-action audit table are strictly append-only
and carry the immutability trigger — this is Codex's real concern and it is
non-negotiable, because an agent that can rewrite its own audit trail has no audit trail.
**MAY:** the incident/group projection is mutable, *provided it is fully reconstructable
from the append-only occurrences* — which makes its mutability harmless and gives Opus
his aggregation and his retention handle. **Confidence: HIGH.**

**Strongest counter-argument.** A mutable projection that drifts from its source is a
second source of truth, and "reconstructable in principle" is not "reconstructed in
practice" — nobody rebuilds a projection until they already distrust it. Codex's
superseding-facts model has no drift class at all, and pays for it only in query
complexity.

### DIV-04 — The global sequence allocator `[DISPUTED-FACT → settled]`

**Side A (opus B3.2).** The error tables MUST NOT use `ledger.allocate_sequence()`: it is
a single-row table, every append-only insert in the system takes a row lock on it, and
bursty error volume would make observability a system-wide write bottleneck.

**Side B (codex R37).** Append-only with monotonic ordering "following the repo's sequence
and reject-mutation pattern," citing `migrations/0000_s00.sql:9-39`.

**Repo check (mine) — Opus is factually correct.** `ledger.sequence_allocator` is declared
`singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton)` and
`ledger.allocate_sequence()` performs `UPDATE ledger.sequence_allocator SET next_sequence
= next_sequence + 1 WHERE singleton = true` — one row, one lock, per allocation.

**Resolution [SYN].** Opus, settled by the check. **MUST NOT** join the global allocator;
**MUST** have its own monotonic ordering (dedicated sequence or time-ordered id). Codex's
underlying requirement — monotonic ordering plus append-only discipline — is fully
preserved; only the *shared* allocator is refused. **Confidence: HIGH.**

**Strongest counter-argument.** Leaving the global sequence means error events and ledger
events can no longer be interleaved by sequence alone; correlation falls back to
`(occurred_at, run_id, call_site_key)`, which is weaker under clock skew. V's dual-source
addendum makes this worse, not better: cross-source ordering between our store and
Hatchet's now matters more than any seat assumed, and neither source shares the other's
clock.

### DIV-05 — Listener consumption unit: incidents vs occurrences

**Side A (opus R39).** The listener consumes **groups**, not events: one bad deploy is
thousands of events and one fingerprint, and group-level consumption is what makes the
rate caps meaningful.

**Side B (codex R84/R86; grok R25).** At-least-once **per occurrence**, durable cursor,
lease/attempt facts, ack after the verdict persists, backlog prioritized S0/S1 and
oldest-within-severity.

**Resolution [SYN].** Not competing; conflating them is what makes them look competing.
**MUST:** the durable cursor and the ack are **per-occurrence** — that is what delivers
the missed-event guarantee across restarts. **MUST:** the diagnosis, spend and fix unit is
the **incident/fingerprint** — that is what bounds cost and makes rate caps mean anything.
**Confidence: HIGH.**

**Strongest counter-argument.** Per-occurrence acking during a storm means the cursor does
real work on thousands of rows nobody will ever diagnose. If the ack path is not extremely
cheap, the storm turns the observability layer into its own outage — the exact
self-inflicted failure mode OBS-R022 exists to forbid.

### DIV-06 — Retention under DR-188

**Side A (opus E4-b).** Tiered: full events for a short window, group aggregates forever,
event rows aged out. Rests on a **classification**: error events are operational telemetry
about the system, not product data — supported by
`docs/missions/2026-08-17-accounts-privacy-security/AMENDMENTS.md:20`, which already reads
DR-188 as governing "migrations and datadirs, not rows."

**Side B (grok E4-A).** Append-only forever; V-gated **compaction of payloads** with issue
rollups retained; "never `DELETE FROM` as a retention job."

**Side C (codex R147).** No deletion initially; after an explicit V law, 90 days hot / 365
days encrypted cold / minimal non-content audit indefinitely, destroying subject-link keys
where erasure requires it.

**Resolution [SYN] — I decline to decide, and say why.** This turns on a legal
classification of error events under a preservation law. That is V's, not mine, and Opus's
own strongest counter names the hazard precisely: "it's only telemetry" is how every
preservation exception begins. What I *can* synthesize is that the three seats agree on
far more than they dispute. **MUST (unanimous floor):** no automated deletion of error
data, ever, absent an explicit V retention law; aggregates and the agent-action audit
retained indefinitely; payload compaction is the lawful pressure valve. The single genuine
split — whether row deletion is *ever* lawful — goes to V as **E4**. **Confidence: HIGH**
on the floor; **no recommendation** on the classification.

**Strongest counter-argument.** Deferring means the store grows unbounded through P1 and
P2 with no ruled valve, and by the time V rules, migrating a large hot table to a tiered
layout is itself a high-risk persistence change — the decision gets more expensive the
longer it waits, which is an argument for forcing it now rather than parking it.

### DIV-07 — Security-zone event granularity

**Side A (opus E5-b / R24 tier 2; grok R18 / E5-A).** Keep the zone error's **code**; drop
message, stack and cause; tag `zone=EXCLUDED`. Grok additionally strips frames to a single
`excluded-module:<filename>`.

**Side B (codex R59 / R148).** Outer **metadata only** — time, outer operation, build,
severity, opaque zone marker. Explicitly **no** inner stack, message, identifiers, **or
cause walk**, and (R122) never entering an agent prompt even sanitized.

**Evidence weight.** Opus's own artifact argues against Opus's pick. He cites the zone's
deliberate uniform-response and constant-time patterns
(`apps/api/src/registration.ts:429, 566, 594, 621, 657`) — patterns that exist to suppress
exactly the discrimination that a stored error **code** restores. A spike in
`VERIFICATION_TOKEN_INVALID` versus `ACCOUNT_ABSENT` is an enumeration oracle in an ops
surface. He named this as his own strongest counter and then chose against it.

**But Side B has an unanswered case, and it is Opus's real one:** a
`DATABASE_POOL_FAILED` raised on the registration path is produced by **shared**
`packages/db` code (Opus's seam S6 — `packages/db/src/index.ts:598-603` re-exports
`PostgresIdentityRepository`). Under a route-based rule that error is lost, and the
product's infrastructure health acquires a hole shaped like the auth routes.

**Resolution [SYN].** Classify by **producing module**, not by request route — a
distinction neither seat drew, and which dissolves the conflict. **MUST:** errors produced
by *shared* code are ordinary shared-code errors and get full capture, with the route
field reduced to `zone` (an auth-route `DATABASE_POOL_FAILED` is a database incident, not
an auth incident). **MUST:** errors produced by *zone* code get Codex's opaque marker
only — no code, no message, no frames, no cause walk. **Confidence: MEDIUM-HIGH**, and it
remains V's **E5** call.

**Strongest counter-argument.** Classifying by producing module requires resolving the
module from a stack we have just refused to store for zone errors, and Codex's R61 rightly
requires uncertain attribution to default to *excluded*. Under that default, shared-code
errors on auth paths will routinely be misclassified as zone errors and reduced to an
opaque marker — reproducing precisely the blindness Opus warned about, by a longer route.
This resolution is only as good as the boundary classifier, which Codex lists as an
open UNVERIFIED (§6).

### DIV-08 — Listener governance: ops agent vs product component

**Side A (opus R41 / R70).** The **whole** listener is an ops agent outside the product's
reachability graph. Concrete argument: the only lawful model access lives in
`acceptance/`, which `acceptance/README.md:1-9` declares outside the production
reachability walk (roots: `apps/api/src/main.ts`, `apps/runner/src/main.ts`,
`apps/scheduler/src/cli.ts`), and `tools/orphan-audit` enforces that walk. A product
component cannot import it without breaking the invariant.

**Side B (codex R139).** Capture library, error store, deterministic dispatch **and**
watchdog are product components; only LLM diagnosis/fix is an ops agent.

**Side C (grok R38).** Both at once — a product component with tables and a runtime, *and*
an ops agent under spine discipline.

**Resolution [SYN].** Codex's split, with the seam drawn where Opus's evidence puts it:
**does this component's code path reach a model or mutate the repo?** **MUST:** the
capture library and error store are product components — they are imported by product
roots and governed by the spine's persistence rules. **MUST:** anything that invokes a
model or writes to git is an ops agent outside the reachability walk. The deterministic
dispatcher is the contested middle; I place it in **ops**, because the moment it spawns
the CLI worker, a product module would drag the relay into the product graph and break
the invariant `tools/orphan-audit` enforces. **Confidence: MEDIUM-HIGH.**

**Strongest counter-argument.** Putting the dispatcher in ops means the product cannot
observe its own listener's liveness through product surfaces — yet OBS-R032 makes listener
liveness mandatory precisely because a silently-dead listener is worse than none. The
watchdog therefore needs a product-side foothold anyway, which is Codex's original
position reached by a longer route. If V wants one rule rather than a seam, Codex's is the
cleaner one.

### DIV-09 — QUICK-FIX threshold numbers

**Opus E1-b:** 1 file / ≤10 changed lines / **0 added files** / no exported-signature
change / no ruled-vocabulary or register-key literal / RED test pre-existing.
**Grok E1-A:** 1 file / ≤20 changed lines / RED test in that file's test sibling.
**Codex R96:** ≤1 production file **+1 test file** / ≤20 production lines / ≤50 total /
V-approved allowlist, empty by default / clean base SHA / no prior fix on that fingerprint
in 30 days / independent deterministic policy gate.

**Structural finding [SYN].** Opus's "0 added files" **forbids adding a RED test**, so his
tier requires the reproducing test to already exist. In a repository whose only
observability tests are quarantined `.disabled` files, that tier is close to empty in
practice. Only Codex's formulation is internally consistent with mandating RED→GREEN.

**Resolution [SYN].** The *numbers* are ungrounded in all three artifacts — every seat says
so. Per contract they become **E1**, not a synthesized figure. What I do synthesize as MUST
is the unanimous structure: the §9 floor dominates and no size bound overrides it; RED→GREEN
on a clean base SHA is mandatory; a **deterministic non-LLM gate** — never the model —
evaluates eligibility; the allowlist is empty by default and grows only on evidence; and
**a test-file addition must be permitted or the tier is empty**. Where V wants a default,
I recommend **Codex's shape** (1 production + 1 test file, ≤20 production lines) as the
only internally consistent one — the number remains unratified. **Confidence: HIGH** on
the structure; **MEDIUM** on the recommended shape.

**Strongest counter-argument.** All three seats independently reached for a size bound, and
all three then wrote a counter-argument explaining why size is a bad proxy for risk. That
unanimous discomfort is evidence the dimension itself is wrong, and Opus's E1-d (a narrow
allowlist of *defect shapes* — missing `await`, null guard matching an existing contract,
wrong local constant with a failing test) may be the better instrument that all three
under-weighted because it is harder to specify.

### DIV-10 — Is the reaper in scope?

**Opus R09:** a reclaim/reaper capability MUST exist before the listener is armed, or the
largest input class (stalled runs) is permanently invisible.
**Grok C3:** explicitly "do not implement the reaper in this mission"; capture it when it
throws.
**Codex R07:** define a claim-deadline-breach *detector* (detection, not reclaim).

**Resolution [SYN].** Opus conflates *invisible* with *unremediated*. A detector makes the
stall visible, which is what this mission is for; reclaiming the item is a change to
product behaviour, which is not. **MUST:** claim-deadline-breach detection ships with the
capture layer. **Out of scope / DECIDE-V:** building the reaper
(`apps/scheduler/src/index.ts:87-89` is a throwing scaffold). **Confidence: HIGH.**

**Strongest counter-argument.** A detector that fires forever on an item nothing can
reclaim produces a permanent alert with no lawful resolution, and operators learn to ignore
it. That is classic alert fatigue, and it is what Opus's coupling was actually protecting
against — shipping detection without remediation can be worse than shipping neither.

### DIV-11 — Overhead, volume and depth numbers

**Grok:** ≤20 events/second/process, <1 ms p99, cause depth 8 (self-marked MEDIUM, "a
guess"). **Codex:** 8 KiB envelope, 32 frames, cause depth 16, 64 MiB / 10,000 queue,
degrade at 80%, p99 ≤1 ms, ≤0.5% throughput, ≤1% p99, 64-hop walk (self-marked
provisional, peak UNVERIFIED). **Opus:** declines absolutes; ≤1% of `JUDGE_DEADLINE_MS`
per event, the ceiling itself a register row; volume UNVERIFIED.

**Resolution [SYN].** This is a divergence of *method*, not of value: two seats named
provisional numbers, one refused on principle. Opus's method is right for this repo —
every other threshold in the system is a register row with provenance
(`apps/runner/src/index.ts:1245-1248`: "its value is V's at DR-023 and is never
invented"). **MUST:** bounded, register-ruled, measurable, with an explicit degradation
ladder. **Every number is DECIDE-V and calibrated in P1** against a real corpus. Codex's
and Grok's figures are recorded as *starting proposals for calibration*, not as
requirements. **Confidence: HIGH.**

**Strongest counter-argument.** A register row with no value is not a threshold, it is a
blocked deployment. If V does not rule promptly, P1 cannot start, whereas a provisional
number would have let measurement begin and replaced itself with evidence — refusing to
guess can cost more than guessing badly.

### DIV-12 — "Every error is captured" is not achievable

Only Codex states it (R41, R152): under simultaneous DB, disk and memory loss, absolute
capture is impossible, and the acceptance contract must test **truthful degradation**, not
claim losslessness. Opus (B5.5, B3.6) has the degradation ladder and drop accounting but
never says the guarantee is unattainable; Grok (R12) sheds to fallback with a `shed_count`.

**Resolution [SYN].** Not a disagreement — a unique contribution that directly qualifies
V's own words ("observe **every time** the system throws an error"). It must be surfaced,
not buried in an appendix. **MUST:** product fails open; a counted `CAPTURE_GAP` marker
with time/sequence/count bounds is appended; mutation authority trips off while a gap is
open; acceptance tests assert honest degradation rather than losslessness. Routed to V as
**E6-13** because it narrows his stated goal. **Confidence: HIGH.**

**Strongest counter-argument.** Naming the exception invites its use: a system permitted to
declare a capture gap will declare one under ordinary load rather than under catastrophe,
and the marker becomes a routine excuse instead of a rare admission. The mitigation — every
gap is itself a high-severity incident that trips mutation off — must be as load-bearing as
the marker.

### DIV-13 — `apps/evaluator-worker` runtime status `[DISPUTED-FACT → settled]`

**Opus:** no entry point; never runs in production; dispatch binding permanently `UNBOUND`.
**Codex:** "production caller/runtime and final unhandled destination are **UNVERIFIED**."
**Grok:** a library of task functions, not a standing process.

**Repo check (mine) — Opus is correct and the uncertainty is removable.**
`packages/evaluator/src/dispatch-binding.ts` declares
`readonly state: "UNBOUND"` as a **literal type**; every return path in
`readEvaluatorDispatchBinding` returns `state: "UNBOUND"` (reasons `ROW_ABSENT`,
`ROW_INVALID`, `EXPLICIT_UNBOUND`). The binding is structurally incapable of being bound.

**Resolution [SYN].** Do not build capture for a process that cannot run. **MUST:** capture
at the exported-function boundary (Grok's position) so the code is covered wherever tests
or a future host call it; **MUST NOT** specify a process-level host for it until V rules
(**E6-05**). **Confidence: HIGH.**

**Strongest counter-argument.** If the docker-hatchet mission gives the evaluator a
standing Hatchet worker — a natural thing for a containerization mission to do — this
requirement is stale on arrival and the process-level gap returns silently, which is Grok's
own E6.7 warning.

---

## 4. Unified requirements spec

Grouped by the brief's RQ blocks. `MUST` = binding · `SHOULD` = strong default, deviation
must be argued · `DECIDE-V` = cannot be settled below V. Every requirement carries its
per-seat parents; `[V]` marks V's own rulings and `[SYN]` marks synthesis resolutions of a
divergence (both trace to the divergence entry that produced them).

### Block A — Ground truth, detectors and taxonomy

| id | Requirement | Mark | Parents |
|---|---|---|---|
| OBS-R001 | A new production error store and capture layer SHALL be built; the surviving `apps/ui/lib/observability/` module is dead code and is not it | MUST | OPUS-R06, GROK-R03, CODEX-R04 |
| OBS-R002 | Both classes SHALL be covered: thrown errors **and** "does not work" (stalls, silent no-ops, dead watches, dead-letters) | MUST | OPUS-R10, GROK-R04, CODEX-R07 |
| OBS-R003 | `packages/liveness` SHALL remain the content-staleness owner; runtime-health detectors are a separate family that may consume it but not reuse its states | MUST | OPUS-R08, GROK-R04, CODEX-R08 |
| OBS-R004 | Independent detectors SHALL exist for: claim-deadline breach, oldest-READY age, missing worker heartbeat, no run-progress delta, WAIT age, cooldown overdue, provider-failure burst, parse/schema burst, scheduler expected-vs-observed cadence, replay unsupported, listener heartbeat/cursor lag | MUST | CODEX-R07, OPUS-R10, GROK-R04 |
| OBS-R005 | Every periodic job SHALL persist "scheduled / started / succeeded-failed-noop / next due"; a no-op is lawful only when its input count is recorded | MUST | CODEX-R09, OPUS-A3#15 |
| OBS-R006 | Detection of a stalled claim ships with the capture layer; **building the reaper is out of scope** for this mission | MUST / DECIDE-V | [SYN] DIV-10; OPUS-R09, GROK-C3, CODEX-R07 |
| OBS-R007 | Every occurrence SHALL carry exactly one primary class from a closed taxonomy grounded in present-tree signals, plus severity and component attribution | MUST | CODEX-R16/R17/R18, OPUS-A5, GROK-R06 |
| OBS-R008 | Severity SHALL reuse the system's existing `CONDITION_MARKS` vocabulary for the degraded band rather than minting a parallel ladder | SHOULD | OPUS-R16 |
| OBS-R009 | Component attribution SHALL be structural — `(process, package, call_site_key, organ)` — not free text; `call_site_key` is already stable and stored | MUST | OPUS-R17, CODEX-R18, GROK-A5 |
| OBS-R010 | Severity promotion SHALL depend on breadth, duration, recurrence and affected runs — never on model sentiment or on attacker-written text | MUST | CODEX-R17 |
| OBS-R011 | Every error code SHALL resolve to a single machine-readable registry; dynamically-parameterised codes must be registry members | MUST | OPUS-R05 |
| OBS-R012 | Suspicious-success detectors (`empty_output`, `missing_required_fields`, `missing_artifact_chain`) SHALL be preserved as first-class semantic-failure classes | MUST | CODEX-R05, OPUS-A5.2, GROK-A2 |
| OBS-R013 | Declared-but-unproducible signals SHALL be reconciled before the layer is designed (**verified: 29 declared event types vs 7 DDL-permitted kinds**) | DECIDE-V | OPUS-R11/E6-3 |

### Block B1 — Capture

| id | Requirement | Mark | Parents |
|---|---|---|---|
| OBS-R014 | Every runtime SHALL install process-level `uncaughtException`/`unhandledRejection` capture; one-shot CLIs capture before exit. The boundary emits once, flushes within a hard deadline, then preserves normal failure semantics | MUST | OPUS-R01, GROK-R01, CODEX-R01 |
| OBS-R015 | Process lifecycle (start, ready, SIGTERM/SIGINT, exit code) SHALL be recorded, so "crashed" / "restarted" / "never started" are distinguishable | MUST | OPUS-B1.2, CODEX-R01 |
| OBS-R016 | The HTTP error handler SHALL record before replying, including the already-sent/stream-aborted branch | MUST | OPUS-R02, GROK-R07.2, CODEX-R21 |
| OBS-R017 | The job/queue wrapper SHALL capture **before** the terminal-failure write, so the record survives a lost race | MUST | OPUS-R03, GROK-R07.3, CODEX-R22 |
| OBS-R018 | Provider capture SHALL emit one event per **exhausted** call and retain per-attempt outcomes; raw request/response never crosses into the store | MUST | GROK-R07.4, CODEX-R24, OPUS-B1.8 |
| OBS-R019 | DB-error capture SHALL cover pool errors, query/connect/transaction failure and error-store write failure, via a **non-recursive** health channel | MUST | OPUS-B1.9, GROK-R07.5, CODEX-R25/R40 |
| OBS-R020 | UI SHALL have one client reporting seam — error boundary lifecycle, `window.onerror`, `unhandledrejection` — not edits at each of the ~16 call sites | MUST | OPUS-RC-20/RC-22, GROK-R07.7, CODEX-R26 |
| OBS-R021 | Capture SHALL attach at the existing funnels **and** at the enumerated catch-and-transform sites from the merged C3 inventory; a caught-and-downgraded error never reaches a funnel | MUST | [SYN] DIV-01; OPUS-R18, CODEX-R19/R20, GROK-C3 |
| OBS-R022 | CI SHALL maintain a generated throw / catch / fire-and-forget inventory and fail on a new unclassified throw, bare catch, discarded promise, or cause-losing wrapper | MUST | CODEX-R03/R67; [SYN] DIV-01 |
| OBS-R023 | A lint forbidding raw `throw` outside approved capture helpers | SHOULD | CODEX-R19; [SYN] DIV-01 |
| OBS-R024 | Capture SHALL be idempotent and de-duplicating across layers: one provider timeout currently yields five unrelated artefacts (ledger entry, typed error, hold record, condition mark, terminal reason) and must yield one incident | MUST | OPUS-R19 |
| OBS-R025 | Expected domain refusals SHALL be recorded but SHALL NOT page or enter the fix queue unless rate/anomaly rules promote them | MUST | CODEX-R02, GROK-R02 counter |
| OBS-R026 | Third-party/library throws SHALL be captured at the nearest owned boundary; no monkey-patching of dependency internals | MUST | CODEX-R27 |
| OBS-R027 | Subprocess stderr SHALL be captured bounded and redacted, not drained — this becomes load-bearing the moment the listener runs a CLI relay | MUST | OPUS-R13/RC-21 |

### Block B2/B3 — The error store

| id | Requirement | Mark | Parents |
|---|---|---|---|
| OBS-R028 | The store SHALL be a **new** Postgres bounded context in both migrations and Drizzle metadata; it SHALL NOT add columns to `ledger.ledger_entry`, `core.run_progress_event` or `core.work_item` | MUST | OPUS-R15, GROK-R10, CODEX-R35/R14 |
| OBS-R029 | Separate logical records SHALL exist for immutable occurrences, incident projections, causal links, delivery/ack attempts, trace verdicts, agent actions, budget usage, policy decisions and spool receipts | MUST | CODEX-R36, OPUS-B3.1 |
| OBS-R030 | Occurrence and agent-action records SHALL be strictly append-only and immutable; the incident projection MAY be mutable **only if** fully reconstructable from the occurrences | MUST | [SYN] DIV-03; CODEX-R37, OPUS-B3.3 |
| OBS-R031 | The store SHALL NOT use `ledger.allocate_sequence()`; it SHALL have its own monotonic ordering (**verified single-row allocator, one row lock per call**) | MUST | [SYN] DIV-04; OPUS-B3.2 |
| OBS-R032 | Mandatory on every occurrence: immutable event id · occurrence sequence · occurred/captured timestamps · environment · **build/commit identity + dirty marker** · runtime · component/package · operation/capture point · stable code · taxonomy/severity · disposition · fingerprint + fingerprint version · redaction policy version and result | MUST | OPUS-R20/R22, GROK-R08, CODEX-R28 |
| OBS-R033 | `build_ref` SHALL be baked in at build time and stamped on every event; **zero support exists today**, and without it the version-skew class is undiagnosable and the agent cannot tell whether an error came from code its own last fix changed | MUST | OPUS-R20, GROK-B2, CODEX-R32/R66 |
| OBS-R034 | Correlation fields SHALL be explicit three-state — a valid opaque reference, `NOT_APPLICABLE`, or `UNKNOWN:<reason>` — so null never means both "irrelevant" and "capture failed" | MUST | CODEX-R29, OPUS-R22 |
| OBS-R035 | Correlation SHALL propagate ambiently (async context), not be threaded by hand through dozens of files | MUST | OPUS-R21, GROK-R20, CODEX-R64 |
| OBS-R036 | Causality SHALL be explicit: parent event id or `NO_CAUSE`, wrapper/rethrow relation, retry-of, spawned-by; unknown cause is `CAUSE_NOT_CAPTURED:<reason>` | MUST | CODEX-R30, OPUS-B2, GROK-B2 |
| OBS-R037 | Fingerprints SHALL derive from trusted code/location/class inputs, never from raw message text — otherwise a unique-message attack becomes a cardinality bomb and id-bearing messages fragment every group | MUST | OPUS-R23, GROK-R09, CODEX-R55 |
| OBS-R038 | An event missing a mandatory field SHALL be rejected to the fallback sink as `schema_invalid` and SHALL NOT enter the listener cursor | MUST | GROK-R08, CODEX-R33 |
| OBS-R039 | Every event SHALL bind to a capture status (`PERSISTED` / `SPOOLED` / `GAP_RECONSTRUCTED`) so no consumer can claim completeness after a sink failure | MUST | CODEX-R33 |
| OBS-R040 | The write path SHALL be asynchronous, out of the product's transaction, on a separate least-privilege pool | MUST | OPUS-B3.5, GROK-R17, CODEX-R38/R56 |
| OBS-R041 | A pre-opened, append-only **local spool** SHALL accept already-redacted envelopes when Postgres is unavailable; re-ingest is idempotent by event id and appends a receipt | MUST | OPUS-B3.4, GROK-R11, CODEX-R39 |
| OBS-R042 | Listener-serving indexes SHALL cover: unacked monotonic sequence · severity/time · fingerprint/time · component/build/time · run/work/node/attempt/ledger correlation · causal parent · delivery lease/ack · agent-action fingerprint. Query plans at 10× projected retention are acceptance evidence | MUST | OPUS-B3.8, GROK-R13, CODEX-R44 |
| OBS-R043 | The store SHALL have its own least-privilege roles: product processes INSERT-only; the listener SELECT plus narrow triage UPDATE; **no role holds DELETE** except a future V-gated retention role | MUST | OPUS-R57/B3.10, CODEX-R36 |
| OBS-R044 | Volume, rate, envelope-size, frame-count and cause-depth bounds SHALL be register-ruled with provenance, measurable, and calibrated in P1 against a real corpus | MUST + DECIDE-V | [SYN] DIV-11; OPUS-B3.7, GROK-R12, CODEX-R11/R43 |
| OBS-R045 | No automated deletion or pruning of error data SHALL exist absent an explicit V retention law; aggregates and the agent-action audit are retained indefinitely | MUST | [SYN] DIV-06; GROK-R14, CODEX-R45, OPUS-B3.9 |

### Block B4/B5 — Privacy, overhead and failure isolation

| id | Requirement | Mark | Parents |
|---|---|---|---|
| OBS-R046 | Redaction SHALL be capture-time, synchronous, in one place, before **any** sink; a write that bypasses it is a defect of the observability layer and is always-escalate | MUST | OPUS-B4.4, GROK-R16, CODEX-R47 |
| OBS-R047 | The store SHALL NEVER contain: debate/question/claim/answer text · private prompts · provider request/response/raw artifact · parse text derived from raw content · secrets, keys, passwords, tokens, cookies, authorization headers · email/phone/IP/user-agent · absolute local paths · environment values · arbitrary request bodies/headers/query strings · serialized unknown objects | MUST | OPUS-B4.1-B4.3, GROK-R15, CODEX-R46 |
| OBS-R048 | Redaction SHALL be **allowlist-based** per event type; unknown fields are rejected and replaced by a minimal fixed-code event. A denylist regex is insufficient as the production boundary | MUST | [SYN] DIV-02; CODEX-R47, OPUS-R14 |
| OBS-R049 | No raw free-text error message SHALL enter an agent prompt or the listener-readable projection; the machine surface is stable code + safe template + bounded repo-relative frames + cause depth | MUST | [SYN] DIV-02; CODEX-R48/R31, GROK-R15 counter |
| OBS-R050 | A separately-governed raw-detail field, redaction-gated, readable by humans under least privilege and never by the listener role | SHOULD | [SYN] DIV-02; OPUS-B4.5, GROK-R15 counter |
| OBS-R051 | Stack frames SHALL be normalized to repo-relative file/module/function/line from a trusted build manifest; argument values, absolute paths, source snippets and URL text are forbidden | MUST | CODEX-R49/R32, OPUS-B4.5 |
| OBS-R052 | User/session correlation SHALL use opaque, purpose-scoped keyed pseudonyms whose key can be destroyed for crypto-shredding; every user-linking column SHALL be enumerated so the erasure regime can reach it | MUST | CODEX-R50, OPUS-B4.6/B4.7 |
| OBS-R053 | The API SHALL stop returning internal error messages to clients on 500-class responses; the client receives a correlation id | MUST | OPUS-R02/B4.8 |
| OBS-R054 | Every capture SHALL record redaction policy version, allowlisted field-set id and whether fallback minimization occurred; privacy canary tests SHALL cover secrets in keys, values, messages, stacks, causes, URLs and provider output | MUST | CODEX-R51, GROK-B4 |
| OBS-R055 | The capture path SHALL be total and non-throwing; serialization/redaction failure degrades to a fixed minimal event | MUST | OPUS-B5.1, GROK-R17, CODEX-R53 |
| OBS-R056 | The capture path SHALL NOT block the product hot path, SHALL add no synchronous I/O, and SHALL introduce no new boot-required dependency | MUST | OPUS-B5.2/B5.6, GROK-R17, CODEX-R52 |
| OBS-R057 | Backpressure ladder, explicit and ordered: full envelope → minimal occurrence → local spool → counted gap, with hysteresis before recovery. Product requests never wait for queue space | MUST | OPUS-B5.5/B5.4, GROK-R12, CODEX-R54 |
| OBS-R058 | Under simultaneous sink exhaustion the product SHALL fail open, append a counted `CAPTURE_GAP` marker bounding time/sequence/count, and trip mutation authority off. Acceptance SHALL test **truthful degradation, not losslessness** | MUST + DECIDE-V | [SYN] DIV-12; CODEX-R41/R152 |
| OBS-R059 | Observability failures SHALL NOT recurse through the normal capture path; a separate fixed-code health channel with a circuit breaker and counter reports sink state | MUST | OPUS-B5.8, CODEX-R40, GROK-R33 counter |
| OBS-R060 | The layer SHALL be independently disableable at runtime via an auditable register row, without redeploying the product | MUST | OPUS-B5.7, GROK-R31 |
| OBS-R061 | Chaos acceptance SHALL cover: DB unavailable · disk full/read-only · queue full · malformed/cyclic error object · 10× burst · redactor failure · recursive writer failure · crash during flush · recovery and re-ingest. Pass = product failure semantics unchanged and any loss explicit | MUST | CODEX-R58, OPUS-P1 criteria |

### Block C — Root-cause traceability

| id | Requirement | Mark | Parents |
|---|---|---|---|
| OBS-R062 | `TypedDomainError` SHALL accept and carry a `cause` (**verified: it does not today**), and every wrap site SHALL pass the original error | MUST | OPUS-C1.1/C1.2, GROK-R19, CODEX-R62 |
| OBS-R063 | Catch-and-wrap SHALL preserve the original event id/cause and add context; it SHALL NEVER interpolate raw upstream text into a new message | MUST | CODEX-R63, OPUS-C1.2, GROK-R19 |
| OBS-R064 | Re-throw SHALL NOT replace: a handler that cannot record the failure must still propagate the original error | MUST | OPUS-C1.3/RC-1, GROK-C3 |
| OBS-R065 | A swallowed error is permitted only when the returned fallback state carries the captured event id or an explicit privacy-safe incident reference | MUST | CODEX-R77, OPUS-C3, GROK-R23 |
| OBS-R066 | Fire-and-forget SHALL go through a supervised helper recording start/settle/reject and ownership; raw `void promise` is forbidden at production async boundaries | MUST | CODEX-R78, OPUS-RC-22 |
| OBS-R067 | Error identity SHALL be independent of message text, and async joins SHALL preserve all rejections, not only the first | MUST | OPUS-C1.6/C1.7 |
| OBS-R068 | The trace procedure SHALL be deterministic, LLM-free, and always terminate in exactly one member of a closed verdict vocabulary | MUST | OPUS-R29/C2, GROK-R22/C2, CODEX-R73 |
| OBS-R069 | The cause walk SHALL use a visited-id set and a hard hop limit, emitting `CAUSE_CYCLE` / `CAUSE_GAP` / `CAUSE_DEPTH_EXCEEDED` rather than looping | MUST | CODEX-R69, OPUS-R28, GROK-R22 |
| OBS-R070 | Lineage joins SHALL be indexed and bounded so each step provably resolves or provably does not exist; no step may require a scan | MUST | OPUS-R27, CODEX-R70 |
| OBS-R071 | Lineage validation SHALL flag cross-run, future-sequence or build-mismatch joins as corruption, so a coincidentally-correlated row cannot become the root | MUST | CODEX-R70 |
| OBS-R072 | "Root" = the earliest evidenced condition whose absence would have prevented the failure, at the lowest boundary the system can responsibly control; the latest wrapper is proximate, never automatically root | MUST | OPUS-R32, CODEX-R79, GROK-R24 |
| OBS-R073 | External roots SHALL be named at a boundary with evidence (provider HTTP, CLI subprocess, Hatchet engine, PostgreSQL host) and SHALL never be a fix target | MUST | OPUS-R33/R34, GROK-R24, CODEX-R80 |
| OBS-R074 | Missing evidence, unsupported replay, security-zone boundary and capture gaps are terminal **non-root** verdicts that always escalate; the agent SHALL NOT search code until it finds a plausible narrative | MUST | CODEX-R82/R34, OPUS-R29, GROK-R22 |
| OBS-R075 | Every trace SHALL persist its verdict, evidence ids, visited path, queries and manifest versions **before** delivery is acknowledged | MUST | CODEX-R74, OPUS-R30, GROK-R25 |
| OBS-R076 | `apps/replay` SHALL NOT be extended for error tracing; an unsupported shape is a first-class `REPLAY_UNSUPPORTED` / `CAPABILITY_GAP` verdict, never a retry loop or a root claim | MUST | OPUS-R31, CODEX-R72/R10, GROK-R21 |
| OBS-R077 | Trace execution SHALL get bounded retries across transient store failures; deterministic poison events go to dead-letter and humans | MUST | CODEX-R75 |
| OBS-R078 | Remediation order SHALL be: boundary capture → cause preservation → correlation propagation → eliminate verbatim error-into-prompt paths → static enforcement | SHOULD | CODEX-R76 |

### Block D — The listener loop agent

| id | Requirement | Mark | Parents |
|---|---|---|---|
| OBS-R079 | An immutable durable record SHALL be the source of truth; `LISTEN/NOTIFY` carries only a safe key as a wake hint; a periodic cursor poll reconciles restarts and gaps | MUST | OPUS-R37, GROK-R25, CODEX-R83 |
| OBS-R080 | Delivery SHALL be at-least-once with a durable consumer identity, monotonic cursor, lease/attempt facts, and ack only after the trace verdict persists | MUST | OPUS-R38, GROK-R25, CODEX-R84 |
| OBS-R081 | The cursor/ack unit is the **occurrence**; the diagnosis, spend and fix unit is the **incident/fingerprint** | MUST | [SYN] DIV-05; OPUS-R39, CODEX-R84/R86, GROK-R25 |
| OBS-R082 | Startup and every reconnect SHALL establish listening, then reconcile the cursor boundary, then process — closing the LISTEN initialization race | MUST | CODEX-R85 |
| OBS-R083 | Backlog SHALL prioritize highest severity then oldest-within-severity, cap concurrent diagnoses, and guarantee a poison event cannot block the cursor | MUST | CODEX-R86 |
| OBS-R084 | Notification failure or lag SHALL never fail a product transaction; notification health is itself a capture-layer incident | MUST | CODEX-R87, GROK-R25 |
| OBS-R085 | Hatchet SHALL NOT be used as the error bus — it is the product work dispatcher and its own outage is an error class | MUST | GROK-R26 |
| OBS-R086 | Listener liveness, cursor lag, leases, audit continuity, spend counters and policy hash SHALL be monitored by a separate **deterministic non-LLM watchdog** that cannot modify code | MUST | OPUS-R40, GROK-R33, CODEX-R116 |
| OBS-R087 | The permanent component SHALL be a deterministic non-LLM daemon; it spawns a **fresh short-lived** CLI worker per eligible incident. No idle LLM session, no shared conversational memory | MUST | OPUS-R42, GROK-R27, CODEX-R89 |
| OBS-R088 | Diagnosis SHALL run read-only: no network, no credentials, no subagents, no interactive shell, no session resume, fixed tool/query allowlist, bounded paths. Mutation requires a separate policy-approved executor | MUST | CODEX-R91/R107, OPUS-R57 |
| OBS-R089 | Idle model cost SHALL be zero calls; active cost SHALL be measured per trace and per fix attempt; missing cost telemetry fails closed to report-only | MUST | OPUS-R44/R45, GROK-R27, CODEX-R93 |
| OBS-R090 | Under DR-179 model access SHALL be local authenticated CLI only; lifting the hold changes the adapter behind the same seam and **SHALL NOT** expand fix authority | MUST | OPUS-R46, GROK-R28, CODEX-R90/R95 |
| OBS-R091 | Where the listener runs SHALL be a configuration seam — Postgres connection string, CLI binary path, git worktree path — so a server move is deployment, not redesign | MUST | OPUS-R43, GROK-E6.2, CODEX-R92 |
| OBS-R092 | Three tiers — QUICK-FIX / PR-FIX / ESCALATE — with criteria a machine can check; ambiguity resolves to the stricter tier, and unknown classification is ESCALATE | MUST | OPUS-D3, GROK-R29, CODEX-R96-R101 |
| OBS-R093 | The spine §9 immutable floor SHALL dominate every size threshold: a one-line change to security, auth, persistence, migrations, spend, scoring semantics, live data, destructive git, architecture, protocol docs or board state is ESCALATE | MUST | OPUS-R51, GROK-R29, CODEX-R99 |
| OBS-R094 | Tier eligibility SHALL be evaluated by a **deterministic non-LLM policy gate**; the model's confidence or sense of obviousness is never a criterion, and the tracing seat is never the seat that decides its own authority | MUST | OPUS-R58, CODEX-R97/R100, GROK-R35 |
| OBS-R095 | A RED reproducer failing on a clean base SHA and GREEN afterwards SHALL be mandatory for any code change; "cannot write a RED test" is itself a recorded finding and blocks the fix | MUST | OPUS-R47/R48, GROK-R29, CODEX-R96 |
| OBS-R096 | The QUICK-FIX tier SHALL permit adding a test file, or the tier is empty in a repo with no reproducing tests | MUST | [SYN] DIV-09; CODEX-R96, GROK-R29(e) |
| OBS-R097 | The low-risk path allowlist SHALL be **empty by default** and grow only from evidence of completed capture/trace coverage with no high-risk reachability | MUST | CODEX-R151, OPUS-R50 |
| OBS-R098 | Blast radius SHALL be **computed** from the module/dependency graph, not estimated; a `CODE_ROOT` whose reachability exceeds a ruled threshold is ESCALATE regardless of line count | MUST | OPUS-R49/R74, CODEX-R100/R104 |
| OBS-R099 | Generated patch content SHALL be re-classified after generation: a generated import, symlink, path traversal, rename, generated file or test-command change reaching a forbidden surface invalidates the attempt | MUST | CODEX-R102/R121 |
| OBS-R100 | A fix SHALL address exactly one confirmed root; bundling cleanup, refactor, dependency updates or formatting sweeps is forbidden | MUST | CODEX-R119 |
| OBS-R101 | Test changes SHALL NOT weaken, delete or skip assertions, snapshots, lint, coverage or acceptance gates; the model SHALL NOT invent test commands (they come from a human-owned catalog with fixed arguments) | MUST | CODEX-R120/R108 |
| OBS-R102 | Error payloads, stacks, DB values, comments, tool output, issue/PR text and provider output are **untrusted data**; they never enter instructions and cannot request tools or relax policy | MUST | CODEX-R105 |
| OBS-R103 | No raw error text SHALL appear in shell arguments, SQL, paths, filenames, branch names, commit messages or PR fields; fixed templates consume only validated ids and codes | MUST | CODEX-R106 |
| OBS-R104 | The agent SHALL NEVER modify its own prompt, allowlist, denylist, limits, model selection, tests, audit writer, supervisor, kill switch — or the capture/store/listener/watchdog code itself. Those incidents always escalate | MUST | OPUS-R51(8), GROK-R30, CODEX-R103/R117 |
| OBS-R105 | The agent SHALL NEVER invent a register value; a fix requiring one is ESCALATE (`SCORING_OPERATOR_UNRESOLVED` states the law in-tree: "its value is V's at DR-023 and is never invented") | MUST | OPUS-R35, GROK-R24, CODEX-R99 |
| OBS-R106 | A human-owned, out-of-band kill switch SHALL exist that works **without database access**, defaults mutation off after supervisor restart, and trips on budget/rate breach, audit or store outage, policy-hash mismatch, capture gap, branch-protection failure, regression or watchdog anomaly | MUST | OPUS-R52, GROK-R31, CODEX-R114 |
| OBS-R107 | Rate and budget caps SHALL be enforced by the supervisor (not the worker), and every cap SHALL be a register row with provenance | MUST + DECIDE-V | OPUS-R53/R55, GROK-R32, CODEX-R94/R112/R113 |
| OBS-R108 | Fix cooldown: no new fix for the same fingerprint/component for a ruled window after a merge or revert; recurrence during canary escalates | MUST + DECIDE-V | CODEX-R111, GROK-R32, OPUS-R53 |
| OBS-R109 | Fingerprint maturity: an incident SHALL meet a ruled minimum occurrence count (or a fatal severity) before it is eligible for fix authority — maturity gates *fixing*, never *capture* | MUST + DECIDE-V | GROK-R37, OPUS-D3(10), CODEX Gate 5 |
| OBS-R110 | One active mutation per repository and one per fingerprint; base SHA must match; unrelated dirty state blocks the attempt | MUST | CODEX-R109, OPUS-R60 |
| OBS-R111 | Every agent read, decision, prompt-envelope hash, model identity, tool call, file considered, diff, test, branch/PR/merge/revert, budget unit, denial and kill event SHALL append to the same observability store | MUST | OPUS-R56, GROK-R33, CODEX-R115 |
| OBS-R112 | The agent SHALL verify a clean baseline before every change and abort on a dirty tree or a `build_ref` mismatch against the observed error | MUST | OPUS-R60, CODEX-R124 |
| OBS-R113 | Branch naming SHALL use a single reserved namespace built from validated hashes only, with a dedicated signed bot identity | MUST | OPUS-R61/R63, GROK-R34, CODEX-R123 |
| OBS-R114 | The PR body SHALL follow a fixed machine-parseable template: incident id/fingerprint · root verdict + evidence ids · causal path · RED command and result on base · diff scope · GREEN gates · privacy and forbidden-surface attestations · blast radius · tier and qualifying criteria · what was deliberately not changed · spend · revert command · canary window. No raw error text | MUST | OPUS-R62, GROK-R34, CODEX-R125 |
| OBS-R115 | QUICK-FIX SHALL NEVER be a direct commit to `main`; it lands as a per-fix PR, auto-merged only after protected checks plus an independent deterministic policy approval | MUST | OPUS-R66/E2, GROK-R35, CODEX-R126 |
| OBS-R116 | Auto-merge SHALL be permitted only while head, base and policy hashes match the approved values and all checks are fresh (no time-of-check/time-of-use substitution) | MUST | CODEX-R130 |
| OBS-R117 | PR-FIX SHALL require human review and merge; the agent SHALL NOT hold merge permission, approve or close its own PR, and the same model/session cannot be author and sole reviewer | MUST | OPUS-R64, GROK-R34, CODEX-R127/R141 |
| OBS-R118 | Every landed change SHALL be one self-contained, cleanly-revertible commit; batching is forbidden because it destroys one-commit-one-revert | MUST | OPUS-R65, CODEX-R129, GROK-R34 |
| OBS-R119 | A canary SHALL monitor the original fingerprint plus adjacent error/latency/test signals; exactly **one** deterministic automatic revert is allowed, after which mutation disables and humans own recovery | MUST | OPUS-R54, CODEX-R118, GROK-R32 |
| OBS-R120 | Merge SHALL NOT imply deploy, restart or any data action; deployment authority is separate | MUST + DECIDE-V | CODEX-R128/R149 |
| OBS-R121 | Every auto-applied landing SHALL fire a human-visible notification — "no approval" removes the *wait*, never the *visibility* | MUST | OPUS-R66(c), GROK-R33 |
| OBS-R122 | Activation gates SHALL be fail-closed and ordered, with no skipping: **G0** V rules E1-E6 and the policy bundle is pinned → **G1** capture + tables live, listener off → **G2** deterministic listener, report-only, no LLM → **G3** LLM diagnosis, report-only, injection corpus clean → **G4** PR-FIX, human merge only → **G5** QUICK-FIX canary → **G6** steady state. Any policy, audit or capture regression rolls authority back one gate automatically | MUST | [SYN] merged ladder; OPUS-D6, GROK-R36, CODEX-R132-R138 |
| OBS-R123 | Gate exit criteria SHALL be evidence-based (corpus size, human agreement on root verdicts, zero forbidden touches, zero audit gaps, budget within cap); the specific sample sizes and calendar minimums are V's | MUST + DECIDE-V | CODEX-R133-R137, OPUS-D6, GROK-R36 |
| OBS-R124 | The system SHALL remain fully functional with the listener parked at report-only forever; every phase is revocable by the kill switch | MUST | OPUS-R68 |
| OBS-R125 | Capture library and error store are **product components**; anything invoking a model or writing to git is an **ops agent** outside the production reachability walk | MUST | [SYN] DIV-08; OPUS-R41/R71, CODEX-R139, GROK-R38 |
| OBS-R126 | The listener SHALL NOT be the sole judge of whether a change is architectural; deterministic indicators (dependency edge, public contract, storage/query, config/deploy, cross-package ownership, new abstraction, uncertain reach) route to architecture intake and stop patching | MUST | OPUS-R72/R74, GROK-R38, CODEX-R140 |
| OBS-R127 | ESCALATE SHALL produce a structured mission-intake candidate; the listener SHALL NOT create tickets, mutate the board, or write into `.hermes/**` | MUST | OPUS-R73, GROK-R38 |
| OBS-R128 | Security, privacy, persistence, spend, scoring and live-data incidents SHALL route directly to named human owners, never through general PR generation | MUST | CODEX-R142, OPUS-R51 |
| OBS-R129 | Mission workers' no-push law is unchanged; nothing here authorizes requirements, architecture or programming seats to push | MUST | OPUS-R67, CODEX-R131, GROK-D5 |

### Block E — The excluded security-zone boundary

| id | Requirement | Mark | Parents |
|---|---|---|---|
| OBS-R130 | Capture SHALL occur only at the existing outer API/process boundary; **no capture call is added to any file inside the zone**, and no migration `0030..0033` is altered | MUST | OPUS-R24/R26, GROK-R18, CODEX-R59 |
| OBS-R131 | Zone-origin events SHALL be classified by **producing module**, not by request route: shared-code errors on auth routes are ordinary shared-code errors (full capture, route reduced to `zone`); zone-code errors get an opaque marker only | MUST + DECIDE-V | [SYN] DIV-07; OPUS-B6.1 seams, CODEX-R59/R61, GROK-R18 |
| OBS-R132 | Zone-code events SHALL carry time, outer operation, build, severity and an opaque zone marker — no inner stack, message, identifiers or cause walk | DECIDE-V (E5) | CODEX-R59, OPUS-E5-b, GROK-R18 |
| OBS-R133 | Every zone event SHALL be ESCALATE, never LLM-traced, never auto-fixed, never replayed, never included in a generated patch or PR body; aggregates may show counts and availability only | MUST | OPUS-R24(3), GROK-R18, CODEX-R60/R122 |
| OBS-R134 | Zone membership SHALL come from a human-owned immutable path/module manifest held **outside** the zone, checked both at capture and before agent dispatch, test-enforced so it cannot drift; uncertain attribution defaults to excluded | MUST | OPUS-R25, CODEX-R61, GROK-R18 |
| OBS-R135 | The design SHALL NOT disturb the stopped accounts mission's resume points; commit `6e58adc` and its S-series surface remain untouched | MUST | OPUS-R26, GROK-B6 |
| OBS-R136 | The `apps/ui/lib/observability/README.md` prohibition SHALL be **reconciled by explicit amendment, not implicitly overridden**: the dev JSONL sink stays file-only and never DB-persisted; the new operational store is a separate, V-ordered class; neither imports the other's transport | MUST | OPUS-A4#2/E6-6, GROK-R05, CODEX-R12 |

### Block H — Dual-source (Hatchet) — **RULED by V, LIVE ADDENDUM 2026-08-21**

V verbatim: *"Basically, Hatchet will store some logs and errors yes, but we need our own
observability as well, and an agent that listens to both and creates pull requests in
order to fix them errors."*

Verified current-state facts for this block (mine, read-only): Hatchet is **already** the
in-tree dispatcher (`@hatchet-dev/typescript-sdk@1.28.1` in both `apps/api` and
`apps/runner`); `hatchet-lite` is pinned by digest in `compose.dev.yaml` with
`SERVER_MSGQUEUE_KIND: postgres`; it runs on **its own database on the same Postgres
server** (`deploy/postgres/init-hatchet.sql` = `CREATE DATABASE hatchet;`); and **nothing
in this repository ever reads Hatchet state back** — dispatch is fire-and-forget
`runNoWait` (`apps/api/src/index.ts:363-372`), the task wrapper uses only
`Pick<Hatchet, "task">`. The read-back path is entirely net-new work.

| id | Requirement | Mark | Parents |
|---|---|---|---|
| OBS-R137 | Our own observability layer and error tables SHALL be built **regardless** of what Hatchet stores; Hatchet's surface is one source, never a substitute | MUST | [V] addendum (a) |
| OBS-R138 | The listener SHALL be **dual-source**: it consumes both the Hatchet failure/log surface and our error store, and its PR authority covers failures rooted in either | MUST | [V] addendum (b) |
| OBS-R139 | **Cross-source incident dedup SHALL be a first-class requirement**: one real-world failure appearing in both sources is ONE incident with ONE fix, ONE audit record and ONE cooldown | MUST | [V] addendum (c) |
| OBS-R140 | Cross-source correlation SHALL use durable join keys the product already sends into Hatchet metadata (run id, work-item id) plus occurrence time and build identity; correlation SHALL be evidenced, and an unmatched pair SHALL stay two incidents rather than be merged on a guess | MUST | [SYN] from R139; GROK-R20, OPUS-B2 |
| OBS-R141 | Hatchet ingestion SHALL be **read-only** and SHALL NOT make Hatchet a dependency of our capture path; a Hatchet outage degrades the second source and is itself an incident in our store, never a capture failure | MUST | [SYN] from R137; GROK-R26, CODEX-R87 |
| OBS-R142 | Hatchet-sourced records SHALL pass the same redaction, taxonomy, severity and fingerprint discipline as first-party occurrences before they are stored or shown to any agent; Hatchet log text is untrusted data under OBS-R102 | MUST | [SYN] from R138; CODEX-R105, OPUS-B4 |
| OBS-R143 | Ingestion SHALL be at-least-once with its own durable cursor and gap accounting; a Hatchet retention window shorter than ours SHALL be recorded as a bounded `CAPTURE_GAP` on the Hatchet source, never as silence | MUST | [SYN] from R138; CODEX-R33/R84 |
| OBS-R144 | Hatchet-side capture specifics the blind seats could not verify — retention window, log/failure API surface, per-run failure detail, backlog and heartbeat guarantees, auth model for read-back, whether containerization changes the store — remain UNVERIFIED and are **ARCH-phase** work | DECIDE-ARCH | [V] addendum (d); §6 U-01 |

---

## 5. Contested decisions for V

### 5a. RULED — standing constraints, recorded, not open

| Row | Ruling | Effect on this spec |
|---|---|---|
| **ROW-GIT** | **RULED by V (2026-08-21, wayfinder T03): the reconciliation commit is PARKED until immediately before the first coding lane of any mission.** Orchestrator-verified facts, re-verified at synthesis: **4,265 phantom deletions** from an unrecorded 2026-08-17 tree move; **141 files tracked** under `dialectical-engine/`, whose product-source subset is essentially the accounts-mission commits (the excluded security zone); **everything the loop agent may lawfully fix is untracked**; branch `dev`, `HEAD` `5b2471d`, remote `DebateAIRO/debateairo.git`. The smallest V decision is when and how the tree move is committed — V's cleanup, V's authority, destructive-git-adjacent, never agent-initiated. | Recorded as a **standing gate**, not an open decision. Loop-agent PR/commit authority (OBS-R110-R118) and any mission's coding-lane worktrees are **impossible** until it lands. Gate **G4 (PR-FIX) SHALL NOT open** before it does. There is no `git diff` baseline against which any line-count criterion can even be computed until then. |
| **ROW-TOPOLOGY** | **RULED by V (2026-08-21, wayfinder T04): BOTH, post-Hatchet primary.** No hard ordering between this mission and `2026-08-21-docker-hatchet` (the neutral core makes either order work). | Capture layer and error tables are specified **topology-neutral** (Blocks A-C, E). The listener and "does-not-work" detection are specified against the **post-containerization** world (Block D) with a thin interim binding for today's process topology. Seats independently flagged Hatchet-era gaps (worker-as-library, one-shot scheduler, pooler-in-transaction-mode breaking `LISTEN`) — carried in §6. |
| **ROW-HATCHET** | **RULED by V (2026-08-21, LIVE ADDENDUM):** our own layer is built regardless; the listener is dual-source; cross-source dedup is a MUST; Hatchet unknowns stay UNVERIFIED/ARCH. | Block H (OBS-R137-R144). Not an open decision. Note the verified consequence: **nothing in the repo reads Hatchet state back today**, so the second source is net-new ARCH work, not an integration of something already present. |

### 5b. OPEN — the decision set V must rule on

Deduplicated union of all three seats' E1-E6. "Seats" shows each seat's pick; where the
seats agree, the row is still V's because it is a product-authority grant, not an
engineering choice.

| id | Decision | Options | Seat picks | Synthesis recommendation | Conf. |
|---|---|---|---|---|---|
| **E1** | QUICK-FIX threshold | (a) 1 file / ≤10 lines / 0 added files + proof · (b) 1 file / ≤20 lines + proof · (c) ≤1 prod +1 test file / ≤20 prod / ≤50 total + allowlist · (d) narrow allowlist of *defect shapes* · (e) no QUICK-FIX tier at all | opus (a) · grok (b) · codex (c) | **(c)** — the only formulation internally consistent with mandating a RED test; (a) forbids adding one and is near-empty in practice. **The line numbers themselves are unratified in all three artifacts** and are V's. (d) is the safest and all three seats' counter-arguments point at it. | MED |
| **E2** | QUICK-FIX landing mechanics | (a) direct commit to `main` · (b) direct commit to a long-lived agent branch · (c) per-fix auto-merged PR · (d) batched daily PR | opus (c, into `dev`) · grok (c, `obs/quick/*`, never `main`) · codex (c, protected + policy bot) | **(c)** — unanimous across seats. Target branch is V's; `dev` (never `main`) matches the repo's current branch posture. (d) destroys one-commit-one-revert; (a) removes the audit object. | HIGH |
| **E3** | Listener runtime, model and monthly budget | (a) deterministic daemon + spawned CLI worker on V's machine · (b) same, on `dezbatere.ro` later · (c) standing CLI session · (d) HTTP API agent after DR-179 lifts | opus (a→b, **declines to name a model or a dollar figure**) · grok (a, Grok CLI, SuperGrok $30/mo already paid, 8 spawns/day) · codex (a, Codex CLI `gpt-5.6-sol`, **€50/mo**, 20 diagnoses/day) | **(a) now, (b) later, never a standing session.** Shape is unanimous. **On the money: I follow Opus.** Grok's $30/$100 are cited list prices for consumer subscriptions whose *CLI quota relevance is UNVERIFIED by grok's own admission*; Codex's €50 is asserted, not derived. **No currency figure is synthesized.** Cap on **model calls + wall-clock**, which are always observable. Model choice is V's. | HIGH on shape · **no rec. on the number** |
| **E4** | Error-data retention under DR-188 | (a) append-only forever, V-gated payload compaction, never `DELETE` · (b) tiered: full events short window, aggregates forever, rows aged out · (c) no deletion now, later 90d hot / 365d cold / key destruction · (d) treat as user data, crypto-shred on erasure | grok (a) · opus (b) · codex (c) | **Unanimous floor adopted as MUST** (OBS-R045): no automated deletion absent an explicit V law; aggregates and audit forever; compaction is the valve. **The split — is row deletion ever lawful? — turns on classifying error events as ops telemetry vs product data, which is a legal reading of DR-188 and is V's alone. I decline to recommend.** Note the supporting datum both ways: `AMENDMENTS.md:20` already reads DR-188 as governing migrations and datadirs, not rows. | **decline** |
| **E5** | Security-zone boundary granularity | (a) fully exclude — record nothing · (b) boundary capture keeping the error **code** · (c) boundary capture, **opaque marker only**, no code · (d) instrument inside | opus (b) · grok (b) · codex (c) | **(c) for zone-code errors, plus a distinction no seat drew:** classify by **producing module**, not request route, so shared-code failures on auth paths (e.g. a `DATABASE_POOL_FAILED` from `packages/db`) keep full capture. The stored *code* for zone errors is an enumeration oracle that the zone's own constant-time patterns exist to suppress. (a) blinds infrastructure health on the auth path. | MED-HIGH |
| **E6-01** | Does an auto-merged QUICK fix deploy or restart anything? | merge-only · merge implies deploy | codex: merge-only | **Merge-only.** Deployment blast radius is categorically larger than a code patch's. | HIGH |
| **E6-02** | Kill-switch custody | V alone · V + named delegate (either can stop, both required to expand) | codex: V + delegate | **V + one named delegate**, dual control on *expansion* only. A single-custodian switch on a laptop is a single point of silence. | HIGH |
| **E6-03** | Initial low-risk allowlist | broad · narrow · **empty**, evidence-driven | codex: empty | **Empty by default.** Fails closed while capture and trace mature; this is the intended canary posture. | HIGH |
| **E6-04** | Who reviews a loop-agent PR? | V · a named delegate · an independent reviewer seat | grok: V unless delegated · opus: human + independent non-author-family reviewer | **Human + independent non-author-family reviewer**, delegate nameable. V-as-sole-reviewer recreates the queue QUICK-FIX exists to shrink. | HIGH |
| **E6-05** | Should `apps/evaluator-worker` ever run? | never · library only · standing Hatchet worker | opus/grok: not today | **Capture at the exported-function boundary; do not specify a process host until V rules** (verified: its dispatch binding is structurally, permanently `UNBOUND`). Docker-hatchet may change this. | HIGH |
| **E6-06** | Nothing schedules the scheduler jobs (`pnpm job:*` are one-shot CLIs, no cron anywhere) | schedule them · leave one-shot | opus: surfaced | **V/ops decision.** It affects this layer directly — liveness sweeps and settlement watches are error-relevant inputs that currently never run. | HIGH |
| **E6-07** | `asker_id` / `session_id` in the error store | store, flagged user-linked · omit · re-hash under a destroyable key | opus: store, flagged · codex: keyed pseudonym | **Keyed, purpose-scoped pseudonym with a destroyable key** (OBS-R052) — gives Opus his correlation backbone and keeps crypto-shredding reachable. Still a privacy call, not an engineering one. | MED-HIGH |
| **E6-08** | Does the listener get read access to debate content (`core.run.question_line`)? | yes · **no** | opus: no | **No.** The listener works from ids, codes and structure; content-dependent failures escalate to a human who can read them. | HIGH |
| **E6-09** | **Alerting — nothing above wakes a human.** A `FATAL` at 03:00 with the listener at report-only is currently just a row | none · severity-triggered notification · full paging | opus E6-9: severity-triggered, V to define | **Needs its own ruling, possibly its own mission.** Every seat specified *recording*; none specified *notification*. This is the largest uncovered surface in the merged spec. | HIGH that it is a gap |
| **E6-10** | Which UI is the live surface — `apps/ui` or `web`? (`pnpm build` builds only `web`; the brief names `apps/ui`) | name one · instrument both | opus E6-10 | **V names one**, or client-side work doubles for no benefit. | HIGH |
| **E6-11** | May QUICK-FIX touch UI copy/CSS? | yes if floor-clear · no | grok E6.3: yes if floor-clear | **Yes if floor-clear**, with "scoring semantics" defined precisely as arithmetic and served-number writers — not every component that sits near a score badge. | MED |
| **E6-12** | Fingerprint maturity minimum (N occurrences before fix authority) | N=1 · N=3 except fatal · higher | grok: N=3 except fatal · opus/codex: "a ruled minimum" | **N is V's.** Structure is unanimous: maturity gates *fixing*, never *capture* or *reporting*. | HIGH on structure |
| **E6-13** | **Acceptable capture loss.** Absolute capture is impossible under simultaneous DB + disk + memory loss — this qualifies V's "every time the system throws an error" | product fails open + counted gap marker + mutation kill · product blocks · product crashes | codex R152: fail open + gap + kill | **Fail open, append a counted `CAPTURE_GAP`, trip mutation off.** V should accept this qualification explicitly, because it narrows his stated goal and no other option is achievable. | HIGH |
| **E6-14** | Threshold at which QUICK authority auto-disables | any forbidden touch or audit gap · ≥1 auto-revert in 30d · >5% human-rejected root verdicts | codex R153 | **All three as an OR**, with the numbers V's. Autonomous mutation deserves a stricter floor than human development. | MED |
| **E6-15** | Contract vs DDL event vocabulary (**verified: 29 declared event types, 7 DDL-permitted kinds**; `node.failed`, `ledger.failure`, `ledger.attempt` are all unproducible, and the UI branch rendering a failed node is unreachable code) | widen the DDL and write producers · delete the unproducible members · leave it | opus E6-3: decide before architecture | **Decide before ARCHITECTURE.** An error taxonomy built on a vocabulary most of which the system cannot emit bakes the fiction in. | HIGH |
| **E6-16** | Cross-source dedup authority (**new, from the addendum**): when our store and Hatchet disagree about the same failure, which is authoritative for the incident record? | ours · Hatchet's · evidenced merge with both retained | — (post-dates the blind seats) | **Evidenced merge, both retained, ours authoritative for taxonomy/severity/fingerprint** (Hatchet log text is untrusted data). An unmatched pair stays two incidents rather than merging on a guess. | MED-HIGH |

---

## 6. UNVERIFIED ledger

Deduplicated union of all three seats' UNVERIFIED/gaps, each tagged with the phase that
must resolve it. **ARCH** = architecture loop · **PROG** = programming loop (measure or
implement) · **ACT** = activation/rollout gate · **V** = needs a V ruling first.

| id | Unverified item | Seats | Resolving phase |
|---|---|---|---|
| U-01 | **Hatchet's own failure/log surface**: retention window, API for reading failures and logs back, per-run failure detail, backlog/heartbeat guarantees, auth model, and whether containerization changes any of it. Verified in-tree: Hatchet is already the dispatcher, has its own DB on the shared Postgres, and **is never read back** | all 3 + [V] addendum (d) | **ARCH** |
| U-02 | Production error volume, rate, peak throughput, event size and DB/disk capacity — **no traffic data exists in the repo**; every numeric bound in OBS-R044 is provisional | all 3 | **PROG** (measure in G1) |
| U-03 | Model/CLI cost: per-request token billing, rate limits, quota sufficiency, and reliable usage telemetry (the Codex relay currently returns `usage: null`). Subscription list prices are public; their CLI-quota relevance is not | all 3 | **V** (E3) then **ACT** |
| U-04 | Branch protection, CODEOWNERS, required CI checks, signed-bot identity, auto-merge and revert mechanics on the remote — all are **activation prerequisites** for G4/G5 | codex | **ACT** (blocked behind ROW-GIT) |
| U-05 | Pre-rework observability surface: reconstructable only from `LOAD-01-codex.log` and two `.disabled` test files. Git archaeology is impossible — no commit reachable from `--all` contains any path matching `observability` | opus, codex, grok | **closed as unresolvable** — no requirement may claim server-wide capture previously existed |
| U-06 | Actual host behaviour for unhandled Node/Next/Hatchet failures on the deployment image (Node version, container init, restart policy) | grok, codex | **ARCH** |
| U-07 | Whether Postgres will sit behind a pooler in **transaction mode** after docker-hatchet — if so, `LISTEN` must bypass it and needs a dedicated connection | grok | **ARCH** (ROW-TOPOLOGY) |
| U-08 | Whether `evaluator-worker` becomes a standing process, and the production caller/schedule/supervisor for scheduler jobs and the future listener | all 3 | **V** (E6-05, E6-06) |
| U-09 | A safe, reliable way to identify an excluded-zone-origin error at the outer boundary **without importing or inspecting inside the zone** — this is the mechanism OBS-R131/R134 depend on and it is not yet proven | codex | **ARCH** (gates E5) |
| U-10 | Zod v4 message leakage across all issue codes — verified safe for 4 codes only; unverified for the rest, hence redaction regardless | opus | **PROG** (canary tests) |
| U-11 | `core.run_progress_event` has **no timestamp column** (only `at_seq`) — whether wall-clock time for pre-existing run events is recoverable at all, and therefore whether historical correlation before the new store is possible | opus | **ARCH** |
| U-12 | Retention ↔ crypto-shredding interaction: how the existing erasure regime enumerates the tables it must reach (that mechanism lives inside the excluded zone and cannot be inspected here) | opus | **ARCH** + **V** (E4) |
| U-13 | Whether `apps/ui` or `web` is the live client surface | opus | **V** (E6-10) |
| U-14 | `packages/serve` (~2,026 lines) and `packages/evaluator` (~4,866 lines) were surveyed by targeted throw/catch grep, not read in full; non-throwing silent-failure paths inside them may be unenumerated | opus, codex | **PROG** (CI inventory, OBS-R022) |
| U-15 | **No runtime was executed by any seat.** Every behavioural claim in all three artifacts is read off static control flow. Notably the runner mis-wiring (below) is proven structurally, not observed | all 3 | **PROG** (G1 fixture) |
| U-16 | Exhaustive dynamic throw inventory and third-party exception behaviour — dynamically-parameterised error codes are not statically enumerable | codex, opus | **PROG** (OBS-R011 registry) |
| U-17 | `recordSuspiciousScoringResponse` has no static callers; a dynamic import was searched for and not found, but absence is not proof | grok, opus | **PROG** |
| U-18 | Cross-source clock skew between our store and Hatchet's, which OBS-R140 correlation depends on — no shared sequence exists after DIV-04 | [SYN] | **ARCH** |

### Verified-at-synthesis findings (not unverified — recorded so they are not re-litigated)

Five claims were disputed or single-sourced; I settled each with one read-only check.

1. **`ledger.allocate_sequence()` is a single-row allocator** — `singleton boolean PRIMARY
   KEY DEFAULT true CHECK (singleton)` with `UPDATE … WHERE singleton = true`. Opus is
   correct; the store must not join it (DIV-04 → OBS-R031).
2. **`core.reject_mutation` is attached per-table via an explicit 19-table `DO` block** —
   it is opt-in, so both the append-only and the mutable-projection designs were always
   available (DIV-03 → OBS-R030). Neither seat knew this.
3. **`TypedDomainError` genuinely has no `cause`** — `constructor(readonly code: string,
   message: string) { super(message); }`. All three seats correct (OBS-R062).
4. **The production runner entrypoint is mis-wired** — `apps/runner/src/main.ts`
   constructs the runner with `compositionRow` but **without** `judgementPolicy` or
   `servePolicy`, and `apps/runner/src/index.ts:1226-1232` throws
   `JUDGEMENT_POLICY_UNRESOLVED` before the claim at `:1250`. **Confirmed.** A unique Opus
   finding, and the ideal G1 acceptance fixture: a real, live defect the new layer must
   surface on day one. It is out of scope to fix here — ticket separately.
5. **Error text already reaches a model prompt today** — `buildSchemaRepairPacket`
   (`apps/runner/src/index.ts:883-890`) interpolates raw zod parse text into a user-role
   message sent back to the provider. Codex's injection concern is not theoretical in this
   codebase (OBS-R049, OBS-R102, OBS-R103).
6. **`apps/evaluator-worker` cannot be dispatched** — `EvaluatorDispatchBinding.state` is
   the literal `"UNBOUND"`; every return path yields it (DIV-13 → OBS-R010/E6-05).
7. **29 declared wire event types vs 7 DDL-permitted kinds** — counted directly from
   `packages/contract/src/index.ts` and `migrations/0021_dr174_cooldown_prune.sql`. This
   confirms Opus's A3 §8 arithmetic; the differing "13 of 26" figure in his own E6-3 row is
   an internal slip, superseded by the verified counts (E6-15).
