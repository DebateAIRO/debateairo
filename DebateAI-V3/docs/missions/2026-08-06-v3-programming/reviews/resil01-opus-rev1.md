# RESIL-01 — Opus 5 diamond lens, review 1

**Ticket:** `t_00c8561c` · board `debateai-v3` · DebateAI-V3 mission.
**Seat:** Opus 5 lens of the dual diamond (the Grok lens ran in parallel; no coordination).
**Specialties exercised:** mutation testing and LIVE verification.
**Law read in full before any judgement:** `reviews/dr174-architecture-plan.md` §§1–14 **and** its
binding `## Revision after V's rulings (DR-174-A)`; `reviews/dr174-plan-grok-verdict.md`
(AUTHORIZATION: GRANTED + 10 binding conditions); `decisions-ledger.md` DR-174 (1300–1314),
DR-174-A (1316–1341), DR-176 (1365–1385); `goal-packets/RESIL-01-codex-goal.md`;
`handoffs/RESIL-01-codex-handoff.md`.

**Isolation (DR-163).** Every mutation and every live process ran in throwaway APFS clones of the
parent root — `/private/tmp/resil01-opus-clone` (mutations) and `/private/tmp/resil01-opus-live`
(the throwaway stack). The standing stack (PG 55432, API 8790, UI 3000, shim 8791) was never
touched, never restarted and never connected to — the only observation of it was `lsof`, to prove
the throwaway ports did not collide. Both clones are deleted at the end of this review; the
mutation clone's source tree was verified byte-identical after every single mutation (the harness
re-hashes the file and asserts equality before proceeding — a failed restore aborts the run).

**Isolation receipt.** After all 24 mutations, the mutation clone's source tree hashes identically to
the untouched original:

```
$ find apps packages acceptance tests migrations web tools -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.sql' \) \
    | sort | xargs shasum -a 256 | shasum -a 256
clone:    c7f8e4a484b82a942e071d62b506a710597e2c443f0ed36648e480f1aeba32a3  -
original: c7f8e4a484b82a942e071d62b506a710597e2c443f0ed36648e480f1aeba32a3  -
```

and the standing stack kept its original process identities throughout, alongside the throwaway
stack's own:

```
$ lsof -nP -iTCP -sTCP:LISTEN
node      18666 …  TCP *:3000 (LISTEN)              <-- standing UI, untouched
node      67335 …  TCP 127.0.0.1:8790 / 8791        <-- standing API + shim, untouched
postgres  67349 …  TCP 127.0.0.1:55432              <-- standing PG, untouched
node      96019 …  TCP 127.0.0.1:8796 / 8797        <-- THROWAWAY (this review)
postgres  96172 …  TCP 127.0.0.1:55450              <-- THROWAWAY (this review)
```

---

## 0. A delta-accounting correction the packet must record first

The goal packet defines the delta as `git diff ee4c676`. **That baseline is incomplete.**
`ee4c676` ("Intake seed gated DRAFT") touches one doc file, but its parent `aa4aa0b`
("DR-177/DR-178: Grok joins the panel; harness identity; next-mission intake seed") already
contains **632 lines of RESIL-01**:

```
$ git show --stat aa4aa0b
 DebateAI-V3/apps/runner/src/index.ts               | 161 +++++++++++++++
 DebateAI-V3/apps/v2-ui/lib/debateTreeUtils.ts      |  10 +-
 DebateAI-V3/packages/battery/src/index.ts          |  13 +-
 DebateAI-V3/packages/db/src/index.ts               |  44 ++++-
 DebateAI-V3/packages/kernel/src/index.ts           |  11 +-
 DebateAI-V3/packages/providers/src/index.ts        |  25 ++-
 DebateAI-V3/tests/unit/dr174-resilience.test.ts    | 218 +++++++++++++++++++++
 ...
```

Reviewing only `git diff ee4c676` would have skipped **the kernel mint of all three marks**, the
`ProviderCallFailedError` typed carrier, the `assertClaimCoversCall` cooldown inequality, the
`HOLDING` projection and its writers, and `withCooldownRetry` / `excludeHiddenSubtrees` /
`remainingProviderAttempts` — i.e. the cooldown helper itself. The handoff's opening line
("Working tree only. No commit…") is true of the worker seat but false of the artefact: part of
RESIL-01 is committed. **This lens reviewed `git diff 2f2aaa2` (the commit before `aa4aa0b`),
which is the whole delta.** Recorded as a process finding, not a code defect.

---

## 1. Gate outputs — real, from the clone

```
$ pnpm typecheck
$ tsc --noEmit
EXIT=0

$ pnpm lint
$ tsx tools/orphan-audit/src/cli.ts architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}
$ tsx tools/orphan-audit/src/cli.ts source
{
  "blocking": []
}
EXIT=0

$ pnpm vitest list | grep -c ' > '
576

$ pnpm test
 Test Files  79 passed (79)
      Tests  576 passed | 1 skipped (577)
   Duration  36.94s

$ pnpm vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
 Test Files  9 passed (9)
      Tests  35 passed (35)

$ pnpm --dir apps/v2-ui typecheck
$ tsc --noEmit -p tsconfig.json
exit=0

$ pnpm --dir apps/v2-ui test
# tests 27
# pass 27
# fail 0

$ pnpm generate:contract      # then: working tree still 30 modified + 3 untracked = 33 entries
$ tsx packages/contract/src/generate.ts
(no generated drift)

$ git diff --check
exit=0
```

Migration **0021 on a real embedded PostgreSQL 18.4** (throwaway instance, port 55450, fresh
data directory), read back from `pg_constraint` after the production migration path ran:

```
[2026-08-14T07:52:16.305Z] migration 0021 CHECK on real PG:
[{"constraint_check":"CHECK ((kind = ANY (ARRAY['ENVELOPE_CONSUMED'::text, 'ENVELOPE_STATE'::text,
'PHASE'::text, 'TERMINAL'::text, 'honesty.staleness_trigger_fired'::text, 'node.retrying'::text,
'ledger.could_not_do'::text])))"}]
```

Register rows resolved through the shipped chain on that same real instance:

```
[2026-08-14T07:52:16.340Z] register runDeathPolicy={"cooldownMs":600000,"finalRetryAttempts":1,
"maxCooldownHoldsPerRun":2} hiddenNodeScoreThreshold={"value":0.35,
"sourceRef":"acceptance:DR-176:V-approved"}
```

**Every gate the packet names is green.** The gates are not the problem; §3 is.

---

## 2. Mutation ledger

Method: one named mutation at a time in the clone, the named test run, the file restored, the
restore verified by SHA-256 before the next mutation. `GREEN(SURVIVED)` means the mutation was
applied and **no test in the whole enforced suite (576 tests) went red**.

### 2.1 The handoff's own ledger rows — re-run, all RED

| # | Mutation | Named test | Result |
|---|---|---|---|
| M-T10 | `remainingProviderAttempts`: `maxAttempts - consumed` → `maxAttempts` | `dr174-resilience` T10 | **RED** |
| M-T13 | drop the `instanceof ProviderCallFailedError` guard (transport and schema carriers merge) | T13 | **RED** |
| M-T25a | hold cap `holds >= max` → `holds > max` (a third hold sneaks in) | T25/T26 | **RED** |
| M-T26 | hold count from memory (`= 0`) instead of the recorded event stream | T25/T26 | **RED** |
| M-T25b | final retry issued with the ruled bound (no extra attempt) | T25 | **RED** |
| M-T25c | retry without waiting the cooldown | T25 | **RED** |
| M-T27 | `excludeHiddenSubtrees` keeps every arrow — hidden node still feeds the number | T27/T28 (+T33) | **RED** (2 tests) |
| M-T28 | drop the subtree closure — children survive their hidden parent | T27/T28 | **RED** |
| M-T30 | remove `if (strength == null) return false` — absence treated as lowness | T30/T31 | **RED** |
| M-T31 | restore `threshold = 0.35` default argument | T30/T31 | **RED** |
| M-T32 | remove the three members from `REQUIRED_CONDITION_MARK_RECORDS` | T32 | **RED** |
| M-T29 | class H no longer maps onto the set-aside affordance | T29 | **RED** |

12/12 RED. **T27 — the DR-165(3) breach detector Grok elevated — is genuinely mutation-proof**, and
kills at both the helper level and the real-PostgreSQL T33 level.

**F1 isolation sweep** — each of the nine new tests run alone, no order dependence:

```
T10 computes                    Tests  1 passed | 8 skipped (9)
T13 schema                      Tests  1 passed | 8 skipped (9)
T25/T26 recovers                Tests  1 passed | 8 skipped (9)
T25 holds 1 and 2               Tests  1 passed | 8 skipped (9)
T27/T28 excludes                Tests  1 passed | 8 skipped (9)
T29 maps class H                Tests  1 passed | 8 skipped (9)
T30/T31 keeps                   Tests  1 passed | 8 skipped (9)
T32 mints                       Tests  1 passed | 8 skipped (9)
T33 computes the served root    Tests  1 passed | 8 skipped (9)
```

### 2.2 Hunting beyond the ledger — twelve mutations, each run against the WHOLE suite

| # | Mutation | Result |
|---|---|---|
| H1 | **primary maker-position (`callSiteKey: "JUDGE"`) bypasses the cooldown wrap** | **GREEN — SURVIVED** |
| H2 | secondary maker-position (`JUDGE:root:secondary`) bypasses the cooldown wrap | **GREEN — SURVIVED** |
| H3 | class N (`UNAUTHORED-BRANCH-HALTED`) minted as revealable in the adapter | **GREEN — SURVIVED** |
| H4 | envelope/budget refusals swallowed by the XREV catch | RED |
| H5 | `NODE_REVIEW_UNAVAILABLE` retired for non-transport review failure too | RED |
| H6 | class-L boundary `strength <= T` → `strength < T` in the runner | **GREEN — SURVIVED** |
| H7 | pre-flight reverted to the ruled bound (recovered run dies on re-claim) | **GREEN — SURVIVED** |
| H8 | pre-flight halts a maker position instead of terminal-failing it | RED |
| H9 | pre-flight terminal-fails a site whose last attempt SUCCEEDED | **GREEN — SURVIVED** |
| H10 | halted subtree not skipped — descendants attempted against a missing parent | **GREEN — SURVIVED** |
| H11 | `HOLDING` projection loses its `hold_until > clock_timestamp()` self-expiry | RED |
| H12 | class-H exclusion removed from the runner (hidden in UI, still in the number) | RED |

Survivor tail, identical for all seven:

```
 Test Files  79 passed (79)
      Tests  576 passed | 1 skipped (577)
```

Seven survivors, and the first two are the ones that matter: **the binding condition the goal
packet calls "the sharpest" — that the primary maker-position authoring call must enter the
cooldown/final-retry path — is implemented correctly (§4 proves it live) but is pinned by nothing.**
H7/H9 leave plan obligation **T11** unpinned in both halves; **H10** leaves plan obligations
**T2/T3** (the halted subtree is skipped, no descendant is attempted against a missing parent)
entirely unexercised — no test in the suite drives a halted expansion leg; **H6** leaves DR-176(2)'s
`strength ≤ T` boundary unpinned at the only place where it moves the served number; **H3** lets
class N be presented as revealable, which is the exact promise V's DR-176(1) ruling forbade the
HIDDEN family from making.

---

## 3. What the mutation hunt then found — the blocking half

Two hunts turned into behaviour probes on **real embedded PostgreSQL with the shipped runner**.
Neither is a mutation of product code: in each case product code is untouched and only the
*scenario* is varied, exactly as an operator's real run would vary it.

### 3.1 A single dead cross-maker review on the SERVED position still kills the whole run

DR-176(4), verbatim: *"NODE_REVIEW_UNAVAILABLE loud stop RETIRED: one dead review hides one subtree
(class H, excluded from the evaluated snapshot, revealable as disclosed-not-served) **instead of
killing the run**."*

Probe: in the shipped integration fixture `T33`, make the **secondary** provider's first review call
transport-fail (503, twice — real HTTP, real ledger rows, real cooldown + final retry). That review
is the cross-maker review **of maker-position 0**, which is the node `selectServedRoot` serves under
the `first-configured-provider` rule. Everything else in the fixture is unchanged.

```
 FAIL  tests/integration/database.test.ts > apps/runner — legal command lifecycle >
       T33 serves over the judged graph while retaining a class-H subtree as disclosed unjudged material
TypedDomainError: 3cb2b4c9-f198-4ecc-ab2d-08be2cf5b91c
 ❯ WalkingSkeletonRunner.execute apps/runner/src/index.ts:1678:39
    1677|     const strength = propagation.strengths.find((row) => row.nodeId ==…
    1678|     if (strength === undefined) throw new TypedDomainError("EMPTY_PROP…
Serialized Error: { code: 'EMPTY_PROPAGATION' }
```

Mechanism, in the shipped code: the class-H node is excluded **as a whole subtree** from the
evaluated snapshot (`apps/runner/src/index.ts:1312-1313`) — correct per R.4.3 — but the served root
was selected *before* that exclusion (`:1274`), so when the served position is itself the hidden
node, `propagation.strengths.find(servedRoot)` is `undefined` and `:1678` throws.

**The whole-run death DR-174 exists to abolish is not removed; it is relocated and renamed.** And
`EMPTY_PROPAGATION` is the wrong carrier: propagation was not empty — the runner removed the served
root from its own input. The user is told the graph had nothing in it, when in fact one review call
timed out. That is the swallow class 03 §10 forbids, arriving from the other side.

Reachability is not exotic. The XREV loop iterates `authoredNodes` in index order, so **node 0 — the
served position — is the first node reviewed**, and its reviewer is the *other* maker's relay: the
very relay whose transport death this ticket exists to survive.

### 3.2 Class L excludes a judged, reviewed node from the served NUMBER — unauthorized, and fatal at the shipped 0.35

Probe, at the **shipped** threshold `0.35`, with **no failure of any kind**: lower the fixture's
judgement quality so an ordinary weak-but-honest position lands at tau `0.30`
(`steelman.fidelity: 0.72 → 0.30`; the acceptance composition row's only term is
`steelman_fidelity`, coefficient 1).

```
 × T33 serves over the judged graph … 264ms
    1678|     if (strength === undefined) throw new TypedDomainError("EMPTY_PROP…
Serialized Error: { code: 'EMPTY_PROPAGATION' }
```

A run in which every call succeeded, every review landed, and every gate would have passed **dies
with no answer, no mark and no disclosure, because the position it was about to serve scored 0.30.**

Three separable defects sit inside this one:

**(a) The authorization is at best ambiguous here, and read the wrong way.** R.4.4's record table
assigns *"excluded from the served number"* to **class H only**; class L's row carries *"node ids
hidden, the recorded strength, and the ruled threshold with its register provenance"* and nothing
about the number. R.4.3 does open with *"a hidden node needs both"*, which **can** be read as
covering L — this lens states that fairly rather than pretending the plan is unambiguous — but every
one of R.4.3's five numbered points is written *"for a class-H node"*, and the whole justification is
DR-165(3): **unjudged** material must not reach the number. Class L material is authored, judged
**and** cross-reviewed. DR-165(3) has nothing to say about it, and DR-176(2) legalized the **value**
`0.35` for the incumbent **dimming**, in V's own framing — *"V legalizes the incumbent UI literal —
no visual change, full provenance"*. The implementation resolved the ambiguity by promoting a
presentation threshold into a **scoring exclusion**: `excludedFromServedNumber: true` is written for
class L in `apps/runner/src/index.ts:1450-1465`, asserted in `packages/serve/src/index.ts`
`assertRequiredConditionMarkRecords`, and frozen into migration 0021's
`condition_mark_excluded_number_check`. Given (b) and (c) below, that is the wrong reading to have
taken silently; it is a V row, not a coder's call.

**(b) It moves the served number in a direction nobody ruled — upward — by discarding real
judgements.** Class L hides *low-scoring* nodes, and low-scoring nodes are disproportionately
**attacks**. Removing a scored attack raises its target's strength. For class H the plan's §7 accepts
a directional distortion precisely because the material is **unjudged** — there is no earned number
to keep. Class L's material *has* an earned, cross-reviewed number, and the exclusion throws it
away: the served answer is then a number over less evidence than the system actually holds, which is
DR-115's family seen from the other side. The record discloses that material was hidden; **nothing
on the served surface says the number is higher than the judged graph would otherwise produce.**

**(c) It can annihilate the answer**, as shown.

**(d) A related scoping wobble:** class-L members are selected from `preliminary = evaluate(snapshot)`
(the H-excluded graph) in a single pass (`:1315-1319`), then excluded; the strengths of the graph
that is actually scored are never re-tested against the threshold. Which nodes hide is therefore a
fact about a graph that was not served.

### 3.3 The two are one shape

Both deaths are the same missing guard: **nothing prevents the served maker position from being
hidden.** The plan's R.4.3 reasoned about hiding *material inside* the served root's subtree; it
never contemplated hiding *the served root itself*, and neither the code nor any test closes that
door. Whatever V rules about (a) and (b), the served position must not be removable from the graph
that produces its own number — or, if it is, the run must reach the serve path with a typed refusal
that names the review or the score, not `EMPTY_PROPAGATION`.

---

## 4. LIVE verification — a throwaway stack, never the standing one

Boot: a **second, throwaway** acceptance-style stack inside the live clone —
embedded PostgreSQL **55450** (fresh data directory, migrations applied by the production path),
API **8795**, model shim **8796**, and a **DEAD PORT 8799** with nothing listening standing in for a
relay. No stub, no fixture, no injected failure: `connect ECONNREFUSED 127.0.0.1:8799` is a real
transport error, real ledger rows, real cooldown. The standing stack was untouched throughout
(`lsof` before boot confirmed 55432/8790/8791/3000 belong to other processes and 55450/8795/8796/8799
were free).

The probe drives the run through the **shipped API dispatcher** (`POST /v1/asks` → 202 →
`AcceptanceDispatcher`), never by calling the runner directly, so nothing is masked.

### 4.1 Phase A — the PRIMARY maker-position path (Grok binding condition 1), OBSERVED

`MODEL_BASE_URL` and the critic relay both point at the dead port, so the very first authoring call —
`callSiteKey: "JUDGE"`, the call that **bypasses the `authorPosition` funnel** and that Grok's
verdict says "must enter the same `withCooldownRetry` / death-policy path" — is the one that fails.

```
[07:52:16.340Z] ===== PHASE A/primary-dead: MODEL_BASE_URL=http://127.0.0.1:8799/v1 criticRelay=http://127.0.0.1:8799 =====
[07:52:16.486Z] PHASE A/primary-dead: POST /v1/asks -> 202 run_ref=d5dbd750-800e-4f99-81cd-a3406a3dbff6

[07:52:21.494Z] --- A/primary-dead t+5s :: GET /v1/runs/:id -> 200
{"run_ref":"d5dbd750-800e-4f99-81cd-a3406a3dbff6",
 "question_line":"Is a four-day workweek a net gain for a small software team?",
 "state":"HOLDING","terminal_reason":null,"hold_until":"2026-08-14T08:02:16.499Z"}

[07:52:21.494Z] --- A/primary-dead t+5s :: core.run_progress_event (4 rows)
      at_seq=3  kind=PHASE             value_json="EMPIRICAL"
      at_seq=4  kind=ENVELOPE_STATE    value_json="WITHIN"
      at_seq=5  kind=ENVELOPE_CONSUMED value_json=0
      at_seq=83 kind=node.retrying     value_json={"state":"COOLDOWN_HOLD","hold_ms":600000,
                 "hold_until":"2026-08-14T08:02:16.499Z","call_site_key":"JUDGE","attempts_spent":3,
                 "parent_node_ref":null,"planned_leg_count":1,"transport_outcome":"FAILED"}

[07:52:21.494Z] --- A/primary-dead t+5s :: ledger MODEL_CALL rows (3)
      seq=80 call_site_key=JUDGE outcome=FAILED
      seq=81 call_site_key=JUDGE outcome=FAILED
      seq=82 call_site_key=JUDGE outcome=FAILED

[07:52:21.494Z] --- A/primary-dead t+5s :: work_item [{"state":"CLAIMED","terminal_reason":null}]
```

What this **observes** (not infers):

1. **Grok binding condition 1 holds in production wiring.** The `COOLDOWN_HOLD` event carries
   `call_site_key: "JUDGE"` — the primary maker-position call site, outside the funnel. It entered
   the courtesy path. (The mutation hunt says *no test* would have caught its removal; the live run
   says the code is nonetheless right.)
2. **The ruled bound was spent before holding:** exactly three real `MODEL_CALL` ledger rows at the
   same `call_site_key`, all `FAILED`.
3. **The hold honours the register value, not a literal:** `hold_ms: 600000`, and
   `hold_until − event time = 08:02:16.499 − 07:52:16.499 = exactly 600 s`. The value came from the
   `runDeathPolicy` row printed at boot with `sourceRef acceptance:DR-174:V-approved`.
4. **`HOLDING` is on the surface V watches**, from the shipped `GET /v1/runs/:id`, with `hold_until`
   for the countdown — not a frozen progress bar, and not an error banner.
5. **Held wall-clock is not spend:** `ENVELOPE_CONSUMED` stayed at its recorded value and no
   `MODEL_CALL` row appeared during the hold (the run sat at 3 rows for the whole observation
   window, t+5s through t+370s).
6. The work item stayed `CLAIMED` throughout — the claim covers the hold, as `assertClaimCoversCall`'s
   new inequality asserts.

**Observed vs inferred, stated plainly.** Items 1–6 are observed, not inferred. The goal permitted
observing the hold *begin* rather than sitting through two full cooldowns; **this review did not need
that concession for Phase A — the full 600 s elapsed and the run was watched continuously through it**
(a projection + event + ledger dump every 5 s from `t+5s` to the terminal at `t+601s`), so the
10-minute wall clock is observed as elapsed time and not merely as the value written to `hold_until`.
What remains inferred rather than observed is listed honestly in §4.3.

### 4.2 Phase A terminal — die-loud with the typed reason, and one honesty defect in the payload

The hold ran its full ten minutes and the run resolved at `t+601s`:

```
[08:02:17.141Z] --- A/primary-dead t+601s :: GET /v1/runs/:id -> 200
{"run_ref":"d5dbd750-800e-4f99-81cd-a3406a3dbff6",
 "question_line":"Is a four-day workweek a net gain for a small software team?",
 "state":"FAILED","terminal_reason":"ACCEPTANCE_EXECUTION_FAILED:MAKER_POSITION_UNAVAILABLE",
 "hold_until":null}

      at_seq=83 kind=node.retrying       value_json={"state":"COOLDOWN_HOLD","hold_ms":600000,
                 "hold_until":"2026-08-14T08:02:16.499Z","call_site_key":"JUDGE","attempts_spent":3,…}
      at_seq=84 kind=node.retrying       value_json={"state":"COOLDOWN_RETRY","hold_ms":600000,
                 "hold_until":"2026-08-14T08:02:16.499Z","call_site_key":"JUDGE","attempts_spent":3,…}
      at_seq=86 kind=ledger.could_not_do value_json={"state":"EXPANSION_HALTED","hold_ms":600000,
                 "hold_until":null,"call_site_key":"JUDGE","attempts_spent":1,
                 "parent_node_ref":null,"planned_leg_count":1,"transport_outcome":"FAILED"}

      seq=80 call_site_key=JUDGE outcome=FAILED
      seq=81 call_site_key=JUDGE outcome=FAILED
      seq=82 call_site_key=JUDGE outcome=FAILED
      seq=85 call_site_key=JUDGE outcome=FAILED       <-- the single post-cooldown final retry

[08:02:17.142Z] --- A/primary-dead t+601s :: work_item
      [{"state":"FAILED","terminal_reason":"ACCEPTANCE_EXECUTION_FAILED:MAKER_POSITION_UNAVAILABLE"}]
[08:02:17.142Z] PHASE A/primary-dead: TERMINAL work_item=FAILED
      terminal_reason=ACCEPTANCE_EXECUTION_FAILED:MAKER_POSITION_UNAVAILABLE sawHolding=true
```

Observed, end to end and unaided:

7. **The full ten minutes elapsed and then exactly one further attempt was made** — `seq=85`, the
   **same `call_site_key: "JUDGE"`**, giving `3 + 1 = 4` ledgered attempts at one site. The
   remaining-attempts arithmetic (§4 Claim B of the plan) is confirmed against a real ledger, with
   no `packages/providers` change.
8. **`COOLDOWN_HOLD` → `COOLDOWN_RETRY` → `EXPANSION_HALTED`** in `at_seq` order, through the two
   already-existing contract event kinds. No new event vocabulary.
9. **DR-176(3) die-loud is satisfied with the typed reason**: `MAKER_POSITION_UNAVAILABLE`, surfaced
   as the work item's `terminal_reason` and on the projection — **not a silent hang**. The run went
   `HOLDING → FAILED`, never back to a meaningless `RUNNING`.
10. **`HOLDING` self-expired**: `hold_until` is `null` on the terminal projection, satisfying the
    contract's `HOLDING ⟺ hold_until` refinement rather than outliving its own fact (the BUG-02
    defect class).

**And the one defect this timeline exposes (A1).** The halt event reports `attempts_spent: 1` after
**four** real ledgered attempts at that site (`seq=80,81,82,85`, all visible above). The `3` on the
hold event is right; the `1` on the halt is the *remaining bound* leaking out of the gateway. A
reader reconstructing the incident from `core.run_progress_event` is told one attempt was spent on a
site that burned four. Predicted from the code before the run, then observed.

### 4.2b Phase B — the goal's named recipe (real primary maker, DEAD second-maker relay)

Phase B booted the **real codex model shim on 8796** for the primary maker and left the critic relay
on the dead port, so the second maker's calls genuinely transport-fail while the first maker really
authors:

```
[08:02:17.142Z] ===== PHASE B/critic-dead: MODEL_BASE_URL=http://127.0.0.1:8796/v1 criticRelay=http://127.0.0.1:8799 =====
[08:02:17.221Z] PHASE B/critic-dead: POST /v1/asks -> 202 run_ref=37e822be-9094-4bb2-8e2b-4b95c90bef66
```

```
[08:03:12.292Z] --- B/critic-dead t+55s :: GET /v1/runs/:id -> 200
{"run_ref":"37e822be-9094-4bb2-8e2b-4b95c90bef66","state":"HOLDING","terminal_reason":null,
 "hold_until":"2026-08-14T08:12:33.890Z"}

      at_seq=175 kind=node.retrying value_json={"state":"COOLDOWN_HOLD","hold_ms":600000,
                  "hold_until":"2026-08-14T08:12:33.890Z","call_site_key":"JUDGE:root:secondary",
                  "attempts_spent":3,"parent_node_ref":null,"planned_leg_count":1,
                  "transport_outcome":"FAILED"}

      seq=167 call_site_key=JUDGE                  outcome=OK      <-- REAL codex maker, no hold
      seq=172 call_site_key=JUDGE:root:secondary   outcome=FAILED
      seq=173 call_site_key=JUDGE:root:secondary   outcome=FAILED
      seq=174 call_site_key=JUDGE:root:secondary   outcome=FAILED
```

Two things are observed here that Phase A could not show:

11. **Zero behaviour change on the healthy path** — the live counterpart of plan obligation **T1**.
    The real primary maker call (`seq=167`, `outcome=OK`) authored its position with **no hold, no
    retry, no event**; the courtesy path costs a healthy call nothing. One real model call of spend
    was used for this evidence.
12. **The second maker's branch behaves identically to the first** — the same three-attempt ruled
    bound, the same register-sourced 600 000 ms hold, the same `HOLDING` projection, at
    `call_site_key: "JUDGE:root:secondary"`. The courtesy is maker-agnostic (DR-162-A) in fact and
    not only in intent.

Phase B's own full 600 s hold then elapsed under continuous observation, and it resolved at `t+621s`
exactly as Phase A did:

```
[08:12:37.953Z] --- B/critic-dead t+621s :: GET /v1/runs/:id -> 200
{"run_ref":"37e822be-9094-4bb2-8e2b-4b95c90bef66","state":"FAILED",
 "terminal_reason":"ACCEPTANCE_EXECUTION_FAILED:MAKER_POSITION_UNAVAILABLE","hold_until":null}

      at_seq=175 kind=node.retrying       {"state":"COOLDOWN_HOLD", …,"call_site_key":"JUDGE:root:secondary","attempts_spent":3,…}
      at_seq=176 kind=node.retrying       {"state":"COOLDOWN_RETRY",…,"call_site_key":"JUDGE:root:secondary","attempts_spent":3,…}
      at_seq=178 kind=ledger.could_not_do {"state":"EXPANSION_HALTED","hold_until":null,
                                           "call_site_key":"JUDGE:root:secondary","attempts_spent":1,…}

      seq=167 call_site_key=JUDGE                outcome=OK       <-- real maker, untouched by the courtesy
      seq=172 call_site_key=JUDGE:root:secondary outcome=FAILED
      seq=173 call_site_key=JUDGE:root:secondary outcome=FAILED
      seq=174 call_site_key=JUDGE:root:secondary outcome=FAILED
      seq=177 call_site_key=JUDGE:root:secondary outcome=FAILED   <-- the single post-cooldown final retry

[08:12:37.953Z] PHASE B/critic-dead: TERMINAL work_item=FAILED
      terminal_reason=ACCEPTANCE_EXECUTION_FAILED:MAKER_POSITION_UNAVAILABLE sawHolding=true
[08:12:37.964Z] throwaway stack torn down
```

13. **DR-176(3) confirmed on the second maker too**: `3 + 1 = 4` attempts at
    `JUDGE:root:secondary`, one hold of exactly 600 000 ms, one same-key final retry, then
    **die-loud** with `MAKER_POSITION_UNAVAILABLE` — no silent hang, no partial serve, no
    SERVE-SURVIVING smuggling. The healthy first maker's `OK` call sits untouched in the same ledger.
14. **A1 reproduces exactly**: `attempts_spent: 1` on the halt event after four ledgered attempts
    (`seq=172,173,174,177`). Two independent runs, two independent call sites, same wrong number —
    it is the carrier, not a fluke.

### 4.3 Honest limits of the live half

- **A relay that recovers *during* the cooldown cannot be summoned on demand.** The recovery path
  (plan T8: retry succeeds ⇒ run continues, no mark) rests on unit evidence (M-T25b/M-T25c RED) and
  on the real-PostgreSQL T33 path, **not** on this live run. Stated rather than implied.
- **The hold *cap* (two per run) was not exercised live.** It is pinned by mutation (M-T25a, M-T26
  both RED) and by the durable `countCooldownHolds` SQL under integration (T17/T18 asserts
  `countCooldownHolds(runId) === 2` on real PostgreSQL). Reaching a third hold live would cost three
  ten-minute waits.
- **Phase A is a two-dead-relay run**, so it proves the *primary* maker-position branch of DR-176(3).
  The goal's named recipe (second maker's relay dead, primary live) was run as Phase B and is
  reported with the same discipline.
- **Neither live run reached the serve path**, because both were maker-position deaths (die-loud by
  DR-176(3)). The hidden frame's *served* behaviour — H/L marks riding a served answer, the reveal
  affordance, the served number over the judged graph — is therefore evidenced by the
  real-PostgreSQL integration path (T33) and by §3's probes on that same path, **not** by these two
  live runs. Said plainly rather than blurred: the live half proves the cooldown lifecycle and the
  death policy; the hidden frame's serve half is proven one layer down.
- No fixture, stub, forced malformed response or injected failure was used anywhere; no runtime datum
  was fabricated (DR-115 untouched). V's depth-5 debate was not re-run. Total real model spend for
  this review: **one** codex call (`seq=167`), by design.

---

## 5. Findings

### BLOCKING

**B1 — One dead cross-maker review on the served maker position still kills the whole run, as
`EMPTY_PROPAGATION`.** §3.1, proven on real embedded PostgreSQL with the shipped runner. DR-176(4)
retired `NODE_REVIEW_UNAVAILABLE` expressly so a dead review *would not kill the run*; the death
survived the retirement and acquired a terminal reason that names the wrong cause. Fix shape (V/the
architect to choose, not this lens): either the served-root selection runs over the **judged** graph
so a hidden position cannot be served, or the served position is not hideable, or the run reaches the
serve path with a typed refusal naming the dead review. `apps/runner/src/index.ts:1274`, `:1312-1313`,
`:1677-1678`.

**B2 — Class L is excluded from the served NUMBER without authorization, it moves the number upward,
and at the shipped `0.35` it can annihilate an otherwise perfect run.** §3.2, proven at the shipped
threshold with no failure of any kind. R.4.4 grants number-exclusion to class **H** only, on a
DR-165(3) basis that class L does not share; DR-176(2) legalized a *dimming* literal and said "no
visual change". `apps/runner/src/index.ts:1314-1319`, `:1450-1465`;
`packages/serve/src/index.ts` (`excludedFromServedNumber` assertions);
`migrations/0021_dr174_cooldown_prune.sql` (`condition_mark_excluded_number_check`).

**B3 — Seven mutations survive the entire 576-test suite, including the goal packet's sharpest
binding condition.** §2.2. `H1`/`H2`: removing the primary and secondary maker-position calls from
the cooldown path changes nothing any test can see. `H7`/`H9`: plan obligation **T11** is unpinned in
both halves. `H10`: plan obligations **T2/T3** are unexercised — no test drives a halted expansion
leg at all, so the halted-subtree skip and the dense `authoredNodes` map (the latent defect the plan
called a correctness requirement) are unprotected. `H6`: DR-176(2)'s `≤ T` boundary is unpinned where
it moves the number. `H3`: class N can be presented as revealable — the exact promise V's DR-176(1)
ruling forbade. Under P1 and the packet's own DONE WHEN ("mutation obligations … named and red"),
this is a shortfall, and it is the reason B1 and B2 reached handoff undetected.

### Advisory

**A1 — `attempts_spent` on the post-retry halt event is the *remaining bound*, not attempts spent.**
`ProviderCallFailedError` is constructed with `request.bound.maxAttempts`
(`packages/providers/src/index.ts:366-371`), but the runner's gateway wrapper has already rewritten
that field to `remaining = maxAttempts − consumed` (`apps/runner/src/index.ts:1866-1873`). First
failure: consumed 0, bound 3 → `attempts_spent: 3` (correct, and observed live). Final retry:
consumed 3, bound 4 → remaining 1 → the `EXPANSION_HALTED` payload reports `attempts_spent: 1` after
four real attempts. The pre-flight path writes `judgeBound.maxAttempts + finalRetryAttempts` (= 4)
into the same field, so the two writers disagree about what it means. AC-63: the payload must carry
the fact.

**A2 — an unauthorized contract wire-shape change: `NodeSchema.final_strength` becomes nullable**
(`packages/contract/src/index.ts`), with `JOIN LATERAL` → `LEFT JOIN LATERAL` in serve's node
projection. §9 #3 and R.6 authorize exactly one contract change (`RunProjectionSchema.state +=
HOLDING`). This one is the mechanical consequence of hiding a node from the number while still
projecting it so the reveal button works — arguably necessary and honest — but it weakens the
served-node contract for every consumer and was never before the consult.
(`hold_until` on `RunProjectionSchema` and `HOLDING` on `OpenRunSummarySchema` are defensible
extensions of the authorized change; `final_strength` is a different kind of change.)

**A3 — `NODE_REVIEW_UNAVAILABLE` is retired only for the transport carrier**; non-transport review
failures still terminal-fail the run (pinned — H5 is RED). Defensible under DR-174-A(2)
"transport only", but DR-176(4)'s text reads absolute. One line to V.

**A4 — `findExhaustedModelAttempt` returns at most one call site** (`packages/ledger/src/index.ts`,
`result.rows[0]`), so a re-claim pre-flight can route only one halted site into
`preflightHaltedSites` per pass. Pre-existing shape, now load-bearing for the cooldown-aware
pre-flight.

**A5 — `ArgumentFocusView` renders `ArgumentNodeCard` without `lowStrengthThreshold`**, so
low-strength dimming is inert there. It fails *safe* (never an unruled number) and the component is
currently unreferenced; noted so it is not mistaken for wiring later.

**A6 — delta accounting.** §0: part of RESIL-01 is already committed in `aa4aa0b`; the handoff's
"Working tree only. No commit" and the packet's `git diff ee4c676` baseline both under-describe the
artefact.

**A7 — a maker-position death writes an `EXPANSION_HALTED` event before it dies loud.** Observed in
Phase A: `at_seq=86 kind=ledger.could_not_do value_json={"state":"EXPANSION_HALTED",…,
"call_site_key":"JUDGE"}`, immediately before `MAKER_POSITION_UNAVAILABLE`. Nothing was expanding
and nothing halted — the run ended. Harmless today (the run dies before serve, so no
`UNAUTHORED-BRANCH-HALTED` mark is minted), but the public event log now says the wrong word about
the loudest failure the policy has.

### What is right, and should be said plainly

- The cooldown seam, the two-hold cap recovered from durable events, the same-key final retry via the
  wrapper's remaining-attempts arithmetic with **zero `packages/providers` control-flow change**, the
  transport/schema carrier separation, the `HOLDING` projection with a self-expiring predicate, the
  claim-TTL inequality, the register rows with V's exact values and provenance, migration 0021's
  replay-safe shape, the kernel mint with V's chosen `UNAUTHORED-BRANCH-HALTED` name, the two-way
  required-record contract, and the reuse of the existing "Show set-aside paths" affordance with the
  default flipped to hidden — all of these are implemented as authorized, and the first twelve
  mutations say so.
- **T27, the DR-165(3) breach detector, is real.** A hidden node that still fed the served number is
  caught at two levels.
- The primary-path wrap Grok demanded **is** in the code, and this lens watched it fire against a
  genuinely dead port.
- The null-guard survived verbatim, the `0.35` default argument is gone, and the threshold now
  travels with `acceptance:DR-176:V-approved`.

The two blocking findings are not a repudiation of that work. They are the seam the plan did not
look at — *the served position hiding itself* — plus one step past the authorization line.

---

VERDICT: BLOCKING
