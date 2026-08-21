# ARCHITECTURE PLAN — Docker + Hatchet containerization

```yaml
state:
  ticket: C2-DOCKER-OPUS
  mission: 2026-08-21-docker-hatchet
  risk_tier: high
  planning_tier: 2
  status: rework-3-ready-for-peer-review
  owner: { agent: claude-opus-5, session: 353f7aa5-5955-4e9b-8601-812810039d2b }
  loop: architecture
  stage: C2
  rework_round: 3
  authority_epoch: 4
  comments_read_through: H2-rework-2 remaining RED; G3-rework-2 APPROVED preserved
  human_review: yes
```

- **Upstream of record:** `research/synthesized-requirements.md` (H1 PASS at
  `reviews/h1-integrity.md`), `00-intake-H0.md`, `brief.md`, ADR-0017, ADR-0018,
  `03-module-design.md`, `05-register-skeleton.md`, `07-build-order.md`.
- **Rework inputs, round 1:** `architecture/PlanReview.md` (G3, F-1…F-7) and
  `architecture/H2-plan-review.md` (H2, H2-01…H2-09 plus one secondary precision defect).
- **Rework inputs, round 2:** `architecture/H2-plan-review.md` re-review of the round-1
  artifact (Plan SHA `39819b2e…`, which matches the file this round edits).
  **G3-rework-1: PEER REVIEW APPROVED — F-1…F-7 FLIPPED**, so every clause that answers a
  G3 finding is carried forward untouched (§0.2a marks them). **H2-rework-1: H2-01, H2-02
  and the secondary defect RESOLVED; H2-03…H2-09 remain RED** and are this round's only
  scope.
- **This artifact is ARCHITECTURE.** No Dockerfile, no compose file, no app code, no
  schema, no migration was written. Docker was **not** started; the CLI was **not** put on
  `PATH`. Nothing here was executed against a container runtime.

> **FREEZE — file *and* runtime.** Nothing in this plan authorizes a write to identity,
> registration, MFA, sessions, crypto shredding, `packages/crypto/**`, identity migrations
> `0030+`, or `docs/missions/2026-08-17-*/**`. The `accounts-phase1` / `accounts-phase4` /
> `debateai-v3` / `dialectical-engine` / `model-evaluator` boards are not operated.
> **§1.3 extends the freeze to running containers, networks and volumes** — a source-file
> freeze alone was the defect G3 F-6 and H2-01 both found.

---

## 0. How to read this, and what rework round 1 changed

### 0.1 Four kinds of statement

| Marker | Meaning |
|---|---|
| **RULED** | Standing law (ADR/DR/AC). Restated as a constraint, never re-argued. |
| **AR-n** | An **architecture ruling** this document makes and owns. Overturnable by a reviewer or by V without reopening requirements. Each carries the reading it rejects. |
| **SR-* / MB-n** | Carried forward from the synthesized requirements. §8 maps every one to a clause here or to a named successor. |
| **V-n** | V's. Drafted in §6. **Not closed here**, and no 2–1 product contest is decided by this seat. |

### 0.2 Rework ledger, round 1 — reproduce-first

Every finding was reproduced against the round-0 text before any rewrite. **All sixteen
reproduce; none is refutable.** The quoted passage is the round-0 text that exhibited it.

| Finding | Reproduced in round-0 Plan.md | Now |
|---|---|---|
| **F-1 ≡ H2-03** scheduler vs MB-1/MB-3 | §1.1:94 — `` `scheduler` \| **yes**, as three one-shot contexts \| three profiled one-shots `` — inside a table whose column header reads *"the set the MB-1 one-command `up` brings to healthy"*. A profiled one-shot is absent from a default `up` and is not `healthy` after exit. | **AR-15**, §1.1, §2.7, D6, **V-11** |
| **F-2 ≡ F-6 ≡ H2-01** project takeover | §1.3:142 — *"The mission's model uses the existing project name `debateai-v3`, the existing service key `postgres`, and the existing named volume `postgres-data`."* §3.3 recorded overlap only as a *cost*. D7 requires `down`/`up`. No runtime ownership check existed anywhere. | **AR-2 re-cut**, §1.3, §2.8, D0a probe |
| **F-3** U-2 has no lawful repair | §4 D0 — *"**U-2 is closed** (`docker-entrypoint-initdb.d` first-boot-only semantics …)"* with no repair named, `init-hatchet.sql` in no path class, and DR-188 forbidding volume deletion. | **AR-17**, §3.5, D3 |
| **F-4** MB-3 only for postgres + runner | §8.1 MB-3 row — *"§2.6 / AR-9; D3 (both Postgres databases); `service_healthy` conditions only"*. No check named for `api`, `web`, or the dispatcher. | **§2.7** health matrix |
| **F-5** V-2 designed-through | §4's graph ran D0…D7 + DV with no production-target lane; §6 V-2 said only *"whether §4 ends at D7 or gains a production-target slice"*. | **DP slice**, §4.2 |
| **F-7 ≡ H2-05(part)** unclassified hashed files | §3.2 hashed `deploy/postgres/init-hatchet.sql`, `.env.compose`, `register.bootstrap.json`; none appears in any §3.1 class. D1 must write `.env.compose`. | **§3.2** classification column |
| **H2-02** D0 impossible | §4 D0 — *"no image built and no service started beyond what a `config` render needs"* — while its done-condition closed U-2 by `down` → remove script → `up`. | **D0a / D0b split**, U-2 → D3 |
| **H2-04** V gates missing from slices | D0 *"Blocked by: V-1"* only (V-4 absent); D3 minted `HATCHET_CLIENT_TOKEN` with no V-10; D5 entered on V-7(a) alone though §6 said V-9 blocks it. | **§4.1** gate matrix |
| **H2-05** globbed / alternative file contract | §3.1 authorized `deploy/entrypoints/**`, `deploy/checks/**`, `deploy/env/**`, `docs/missions/…/**`, and `` `compose.vllm.yaml` *(or a profile inside the above)* ``. D5/D6 fanned out in parallel onto one compose file. | **§3.1** exact paths, **AR-16** fragments, **§4.3** writer matrix |
| **H2-06** invented values | §2.3 listed strict keys with no source of record; §2.4 used `<engine-service-dns>:<grpc-port>`; no base-image pin for either Dockerfile. | **§3.6** value matrix, **V-12**, **V-13** |
| **H2-07** principals + product truth | §3.5 required four principals and negative receipts with no provisioning artifact in §3.1; D4 required a real `v3WorkItemId` with no lawful trigger named. | **AR-17**, **AR-18**, §3.5, D3, D4 |
| **H2-08** D5 deepens AC-60 | D5 done-when — *"the `api` front door is published **alongside** `web` so the contract origin stays addressable"* — two published origins while V-9 is open. | **AR-19**, D5 gated on V-9 |
| **H2-09** MB-9 does not falsify | §2.6 required O-1∧O-2∧O-3 only — all post-hoc existence checks. No ordering, redelivery, or shared-budget case. | **§2.6.2** D4-L cases |
| **H2 secondary** replay invocation | AR-4 — *"`apps/replay` is a profiled one-shot … never a service"* — while prescribing `docker compose run --rm`, which requires a service definition. | **AR-4 re-cut** |

**Two findings changed a ruling rather than a wording**, and both are load-bearing:
**AR-2** (the compose identity) and **AR-3/AR-15** (the scheduler's place in the bar).

### 0.2a What round 2 must not touch

**G3-rework-1 recorded PEER REVIEW APPROVED: F-1…F-7 are FLIPPED.** The clauses that
carry them are **preserved verbatim in substance** this round and were edited only where an
H2 finding independently required it:

| G3 finding | Preserved clause | Touched in round 2? |
|---|---|---|
| F-1 | **AR-15** — `scheduler` outside the MB-1/MB-3 quantifier; §1.1's unit-class column; V-11 | only §2.7.2's *completion* rows gained exact commands (H2-03); the ruling is unchanged |
| F-2 · F-6 | **AR-2 / AR-2a** — project `docker-hatchet`, own postgres and volume, refusing ownership probe, §2.8's command table | **untouched** |
| F-3 | **AR-17** — idempotent always-run SQL; `init-hatchet.sql` unused | only its *authorization* was added (H2-07); the mechanism is unchanged |
| F-4 | **§2.7.1** — a named check per required unit | probes made exact (H2-03); the per-unit requirement is unchanged |
| F-5 | **DP** slice gated on V-2(b)/(c) | gained owned files and a writer (H2-05); the gating is unchanged |
| F-7 | **§3.2** — every hashed path classified; GENERATED OUTPUT class | only the manifest's *writer* rule changed (H2-05); the classification is unchanged |

**Nothing in this round unwinds a G3 flip.** §10 records the audit.

### 0.2b Rework ledger, round 2 — reproduce-first

Scope is **only** H2-03…H2-09. Each was reproduced against the round-1 text (SHA
`39819b2e…`) before rewriting; the quoted passage is the round-1 text that exhibited it.
**All seven reproduce.**

| Finding | Reproduced in round-1 Plan.md | Now |
|---|---|---|
| **H2-03** health exactness | §2.7.1's `web` row read *"an **HTTP GET of a page path** served by `next start`"* — a class of probe, not a probe. `runner` and dispatcher rows deferred to U-8/U-11 with no predecessor owning the discovery. **AR-14** said timing values are *"**recorded once** in `deploy/DISCLOSURE.md`"* — i.e. chosen later. | **§2.7.1** exact `CMD-SHELL` per unit; **§2.7.1a** the timing table, chosen here; **D2a** as the hard discovery predecessor |
| **H2-04** authorization ≠ values | §4.1's D0b row read *"IMPORTANT OPERATIONS: **none**"* though D0b creates and removes a disposable project; D3's covered only token minting though it creates a database, four roles and grants; D4's cited V-13, which ratifies **values**, not permission to write product rows; L-3 killed the runner with no authorization at all. | **V-14** (privileged DB), **V-15** (product data), **V-16** (destructive lifecycle), each with a scope and each wired into §4.1 |
| **H2-05** manifest / DP / `.gitignore` | Three rules disagreed: §3.1 gave `path-manifest.md` writer **D0b**; §3.2 rule 5 said *"the ticket **records the new hashes** into … `path-manifest.md`"*; §4.3 said *"D0b (created), every later slice **appends its own dated block**"*. §3.1 and §4.3 gave **DP** no owned file. §3.5 permitted *"an **additive** `.gitignore` line"* for a path in no class. | **§3.2** one-file-per-slice fragment directory; **§3.1/§4.3** DP's exact outputs and writer; **AR-21** — the operator secret leaves the repository, so **no `.gitignore` edit exists** |
| **H2-06** copyable runtime contract | §3.6 defined `OPS` as *"operator secret file"* with no path; the crypto row said `MOUNT` with no host source or container target and named only `api` as consumer though `apps/runner/src/main.ts:13` calls `loadKek`; address rows named variables without values; `API_HOST` was absent from the matrix; `DATABASE_URL` was *"composed **only** from the row above"* without the composition. | **§3.6** re-cut: exact paths, exact ports, every consumer, and the literal URL composition |
| **H2-07** DB + product-data authority | AR-17 had artifacts but D3 had no authorization for `CREATE DATABASE` / `CREATE ROLE` / `GRANT`; **AR-18** said *"a body conforming to `AskRequestSchema`"* and *"any non-empty `x-user-dev-token`"* — a schema and a predicate, not a fixture and a token. | **V-14**, **V-15**; **AR-18 re-cut** with an exact fixture path, an exact token literal, the derived asker id, and retention semantics |
| **H2-08** V-9(b) has no producer | AR-19 said route removal *"is routed through a **separate authorized file contract** — **this mission does not remove it**"*, but D5's entry criteria named only V-7(a) and V-9, so V-9(b) could be selected with the route still present. | **AR-22** — V-9(b) names an exact predecessor artifact and owner, and D5 depends on its **accepted completion** |
| **H2-09** proofs not exact | §2.6.2's L-rows named triggers in prose: L-1 *"by our own recorded ordering (`at_seq` / ledger sequence)"* without the claim field; L-2 *"evidenced by the claim's commit and the call's start being separate recorded events"*; L-3 *"let the engine redeliver to the restarted worker"* with no restart step, though **AR-7 forbids automatic restart**; L-5 *"a typed retryable failure"* with no assertion path. | **§2.6.2** re-cut: exact tables and columns (`core.work_item`, `ledger.ledger_entry`, `ledger.raw_artifact`), exact commands, exact counts, explicit restart step, and an ABSENT⇒blocker rule |

### 0.2c Rework ledger, round 3 — reproduce-first · **LAST LAWFUL ROUND**

`G3-rework-2: APPROVED` — F-1…F-7 still flipped, and §0.2a's preservation audit holds
unchanged. Scope is the **residuals** of H2-03…H2-09 recorded at `H2-rework-2`. Each was
reproduced against the round-2 text (SHA `c1d8db0c…`, which matches the file this round
edits) before rewriting. **All seven residuals reproduce.** The rework cap is 3; anything
still RED after this goes to V as a decisions packet, not to a round 4.

| Residual | Reproduced in round-2 Plan.md | Now |
|---|---|---|
| **H2-03** circular dispatcher health | §2.7.1 sourced the dispatcher's command from D3a; the gate matrix stopped D3 on *"engine healthy"*; D3a's entry was *"D3 (a running engine makes each answer confirmable)"*. **D3 needed D3a's output before D3a was eligible.** | **AR-21b** — D3a is renamed **D2a**, is **documentation-only**, and runs **before D3**. The graph is now acyclic and §4.2 says why |
| **H2-04** D6 product writes | §4.1's D6 row: *"none beyond V-14's D3 scope"* — but §3.5's grants exist so the jobs **can** append to `serve`, `scorecard`/`ledger` and `core.work_item`. **V-14 authorizes creating a principal, not what it writes**; V-15 was scoped to D4's asks | **V-15 split into (a) D4 asks and (b) D6 job writes**, with (b) a D6 entry gate |
| **H2-05** cyclic evidence ownership | L-0 §3 sent D4's counts to `deploy/ACCEPTANCE.md`; D6's disclosure to `deploy/DISCLOSURE.md`; §3.1 and §4.3 assigned **both solely to D7** — so D4 and D6 could only complete by writing a forbidden file or waiting on their own successor. The manifest table also used `<slice>` shorthand | **AR-23** — per-slice `deploy/evidence/*.md`, D7 assembles; and all eleven manifest paths **enumerated in full** |
| **H2-06** data-plane secrets absent | §3.6 declared the four `*_PASSWORD` values and the token *"the **only** `OPS` entries"* while AR-17 required a **bootstrap-admin credential** that was named nowhere; no dispatcher DB principal, URL or vendor env keys existed; `SERVER_URL` sat in U-6a, outside the "authoritative" matrix | **§3.6a** — the three `POSTGRES_*` bootstrap variables, **AR-24**'s `v3_hatchet_engine` principal, the dispatcher's full vendor env table, `SERVER_URL` decided at D2a, and **six** `OPS` entries |
| **H2-07** fixture not an input | AR-18 named the path and the thirteen fields, then said only that each value is *"a **fixture datum**"* and that `as_of` is stamped at invocation — leaving D4, the file's own writer, to invent twelve fields | **the literal JSON body is in the plan**, every enum taken from `packages/contract/src/index.ts:4-7`; **V-15(a) is hash-bound** and states the exact request count |
| **H2-08** V-9(b) producer | AR-22 assigned the ticket to *"the orchestrator"* — which routes and does **no content work** — and its deliverable was a contract *"granting some seat"* the files. No artifact path, no acceptance evidence | **AR-22 re-cut** — the intake's PROGRAMMING seat under its own goal packet, an exact two-file contract, a durable acceptance artifact D5 **reads**, and a named exit if the ticket is not authorized |
| **H2-09** wrong-quantity assertions | L-1 compared against *"the sequence of the claim-recording entry"* — **`LEDGER_ACTION_KINDS` has no claim kind, so that row does not exist**; L-2 proved visibility-before-terminal, not commit-before-call; L-4's *"terminal event"* named no table; L-5/L-6 used `count(*)` over all call sites against a per-call-site bound | **L-1/L-2 re-cut onto a polling observer** that catches `CLAIMED` with zero artifacts; **L-4 uses `core.run_progress_event`**; **L-5/L-6 count `DISTINCT attempt_id` filtered to `call_site_key='JUDGE'`**; L-0 §4 adds exact capture-and-bind commands |

### 0.3 Live-tree facts, re-verified

Round-0 facts still hold: `command -v docker` → exit 1; the CLI and Compose v2 plugin exist
inside `/Applications/Docker.app`; no Docker Desktop process is running; only **141** files
under `dialectical-engine/` are tracked; `compose.dev.yaml`, `package.json`,
`deploy/IMAGE-PINS.md`, `register.bootstrap.json`, `.env.compose` and
`packages/register/src/compose-env.ts` are **untracked and not ignored**;
`packages/register/src/auth-policy.ts` is tracked and dirty; the dirty set grew by two
files between the synthesis and round 0; `Makefile` is tracked-and-deleted;
`web/lib/api.ts:3-11` forces a same-origin `NEXT_PUBLIC_API_BASE`; `web/.env.local` exists
untracked with `DIALECTICAL_API_BASE=http://127.0.0.1:8790`.

**Three facts established during rework, each of which decides a finding:**

- **`POST /v1/asks` is `auth: "user"`, and `auth: "user"` is satisfied by any non-empty
  `x-user-dev-token` header.** `apps/api/src/index.ts:152` calls
  `resolveSession(request.headers["x-user-dev-token"])`, and `resolveSession`
  (`:130-140`) derives `asker:<sha256>` / `session:<sha256>` from the token string alone —
  `provisional_identity_model: true`, `ownership_provenance: "user_dev_token"`. **It reads
  no identity table and touches no frozen code path.** This is what makes H2-07's demand
  for a lawful dispatch trigger answerable: **AR-18**.
- **`GET /v1/session` (`apps/api/src/index.ts:237-239`) returns `request.session` and
  nothing else** — it exercises Fastify routing, the `preHandler` auth gate, the session
  schema and JSON encoding, and reaches neither the database nor any frozen file. That is
  the `api` health contract F-4 demanded (§2.7).
- **Nothing in the tree supplies the runner's strict environment values.** A repo-wide
  search for `JUDGE_MAX_ATTEMPTS` / `CLAIM_MS` finds only the loader that declares them
  (`packages/register/src/runtime-environment.ts:81-82`) and the consumer that reads them
  (`apps/runner/src/main.ts:28-29`). The acceptance harness uses its own disjoint
  `ACCEPTANCE_*` contract (`acceptance/README.md:156-166`) and constructs the runner
  in-process. **The containerized runner is the first consumer these values have ever
  had, and none of them is ratified.** That is H2-06's real size: **V-13**.

**Five facts established in round 2, each of which makes an H2 proof exact:**

- **The claim's own columns.** `packages/battery/src/index.ts:284-297` — the claim is
  `SELECT … FROM core.work_item WHERE state = 'READY' OR (state = 'CLAIMED' AND
  claim_deadline <= clock_timestamp()) … FOR UPDATE SKIP LOCKED`, then
  `UPDATE core.work_item SET state = 'CLAIMED', claimed_by = $1,
  claim_deadline = clock_timestamp() + make_interval(secs => $2)`. **`claimed_by` carries
  `RUNNER_WORKER_ID`** (`apps/runner/src/index.ts:1250-1252`). These are the fields L-1…L-4
  assert on; round 1 asserted on "the claim" without naming them.
- **The ledger's own tables.** `ledger.ledger_entry` (`sequence`, `run_id`, `attempt_id`,
  `action_kind`, `call_site_key`, `subject_item_id`, `outcome`) and `ledger.raw_artifact`
  (`raw_artifact_id`, `attempt_id`, `run_id`, `provider_ref`, `provider`) —
  `packages/ledger/src/index.ts:184-218`. `ledger_entry.sequence` is the recorded order
  L-1 compares against.
- **`AskRequestSchema` is `.strict()` with thirteen required fields**
  (`packages/contract/src/index.ts:107-122`): `question_line`, `risk_tier`, `tier_source`,
  `tier_provenance_ref`, `composition_budget_tier`, `depth_params`, `decision_owner`,
  `action_owner`, `decision_scope`, `caller_scope`, `as_of`, `steering_presets`,
  `steering_annotations`. A fixture is therefore fully specifiable — which is what turns
  AR-18 from a predicate into an artifact.
- **`KEK_PATH` is required by `runner` as well as `api`** — `apps/runner/src/main.ts:13`
  calls `loadKek(environment.KEK_PATH)`. Round 1's matrix named only `api`.
- **`packages/crypto/SECRET_STORE_LAYOUT.md` fixes the store's shape**:
  `USER_DEK_STORE_PATH/` (0700) → `users/` (0700) → `<user uuid>/` (0700) →
  `dek.v1.json` (0600); and `AUDIT_SOURCE_IP_SALT_PATH` is a separate 32-byte mode-0600
  secret. The mount targets in §3.6 are taken from this document, not chosen.

---

## 1. Target topology for this mission, against ADR-0018

### 1.1 The seven ruled services, placed — with their unit class

ADR-0018 (RULED, DR-117) names seven. **A "required service" in MB-1/MB-3's sense is a
unit that one `up` brings to a continuously `healthy` state.** Round 0 put `scheduler` in
that set while realizing it as one-shots; that is the F-1 / H2-03 contradiction, and the
column below is where it is resolved.

| Ruled service | Unit class | In the MB-1/MB-3 required set? | Shape here |
|---|---|---|---|
| `postgres` | long-running | **yes** | one container, **the** instance of this deployment (§1.3). Hosts the product database **and** the engine's co-tenant database (ADR-0017 clause 6, ADR-0003 rule 4). Two readiness probes (§2.7). |
| dispatcher (`hatchet-engine` \| `hatchet-lite`) | long-running | **yes** | one container, lite **image** in dev. **Service key is V-3's**; nothing else in this plan varies with it. |
| `api` | long-running | **yes** | one container from the app image. The **one** front door (AC-60). Runs the **real** dispatcher, never `acceptance/main.ts` (SR-C2.3). |
| `runner` | long-running | **yes** | one container from the app image. The **only** Hatchet worker (§2). |
| `web` | long-running | **yes**, *if* V-7(a) selects it | one container from its own image. Ingress model is V-9's — **AR-19**. |
| `scheduler` | **one-shot invocation unit** | **no — AR-15** | three profiled one-shot services, one credential each (§3.5). Completion, not health, is its falsifiable criterion (§2.7.2). Bounded exception owned by **V-11**. |
| `vllm` | long-running, **non-required** | **no** | one container behind an explicit profile — **AR-5**. What a pass may be *called* is V-8. |

**`apps/replay`** is a **profiled one-shot service** — it has a service definition so that
`docker compose run` is legal, and it is never started by `up` and never a `depends_on`
(**AR-4**). **`apps/evaluator-worker`** is not in the topology (V-6). **`apps/ui`** is not
started by this mission's compose invocation (V-7(a)).

**AR-5 — the vLLM profile boundary, and the trap on the other side of it.**

*Ruled:* `vllm` sits behind an **explicit, hardware-gated profile** in its own compose
fragment (§3.1). No required service declares `depends_on` on it, and the required-bar
command's `-f` chain **does not include that fragment**, so its `${VLLM_MODEL:?}` guard is
never parsed on the required path — which is SR-A4.1's lawful escape (*"or the service that
needs it is not in the required set"*) achieved by construction rather than by hoping
profiles filter before interpolation.

*The trap on the other side.* `loadRunnerEnvironment()` requires `VLLM_BASE_URL` (a
`z.string().url()`), `VLLM_MODEL` and `VLLM_MAKER` **whether or not the profile is on** —
turning the service off does not turn the keys off. Therefore `VLLM_BASE_URL` is set to the
`vllm` service's compose DNS address either way (a *valid and unreachable* URL: the runner
boots, and a call fails as a **typed failure with a ledger row** — RULED, ADR-0018 clause
3(d), DR-115). It is **never** a placeholder, a fake host, an empty string, or a
`${VAR:-default}`. `VLLM_MODEL` and `VLLM_MAKER` are values V must mint — **V-13**.

*Reading rejected:* stripping the `VLLM_*` keys when the profile is off. That edits
`runtime-environment.ts`'s strict contract — scope expansion, and it deletes the fail-fast.

### 1.2 What stays on the host, and why each

| Stays on host | Why it may not move into compose |
|---|---|
| **Hermes Kanban, port 9119** | Board custody. A `down` would take the board down mid-mission, and MB-5 requires 9119 to keep answering **while** a mission service restarts. Port 9119 is never overridden (RULED, intake). |
| **DR-179 CLI relays** | RULED: relays are the lawful model-call mechanism and **are not Hatchet workers**. Containerizing one places V's authenticated subscription credential into an image, volume, or env var — the exact surface DR-179 exists to prevent. |
| **Agent CLIs** | Operator tooling; not ADR-0018 units. |
| **Test runners** | No test may require the stack and no stack service may `depends_on` anything test-scoped (B5 invariants, AGREED). The test store stays disjoint — no shared volume, no compose-DNS reachability. |
| **The Docker engine itself** | Trivially, and it is the thing V-1 governs. |

### 1.3 Runtime ownership — the freeze extended past the source file

**This section is the union answer to G3 F-2, G3 F-6 and H2-01.** All three say the same
thing in different words: leaving `compose.dev.yaml` byte-identical does not make it legal
to stop, recreate or re-spec a container another live mission owns, and round 0's
project-name choice made exactly that possible.

**AR-2 — the mission owns its own Compose project, its own Postgres, and its own volume;
it never addresses, reconciles or stops any object it does not own.**

*Ruled:*

| Object | Owner | Name |
|---|---|---|
| Compose project | **this mission** | `docker-hatchet` — the mission/board slug, emitted once as `COMPOSE_PROJECT_NAME` (§3.6). A project name is an **operator identifier**, not a value that can move a served number, so it is not a register row. |
| Network | this mission | the project default network of `docker-hatchet`. **No `external:` network is joined.** |
| `postgres` container + volume | this mission | service key `postgres`, volume `postgres-data`, which Compose realizes as `docker-hatchet_postgres-data` — **distinct from** `debateai-v3_postgres-data` |
| `compose.dev.yaml` and everything it declares | **the security mission / dormant** | never started, stopped, referenced on a command line, or passed to `-f` by this mission |

*Why a distinct project, when round 0 chose the shared one.* Round 0 reasoned that sharing
the project name preserved AC-02. Both lenses showed that it instead hands one project two
alternating owners: `up` against a project reconciles that project's service set, and `down`
removes it wholesale — so a mission command could stop `hatchet-lite`, orphan `vllm`, or
recreate the `postgres` container that `accounts-phase1` was using. **Port
non-publication does not prevent service-set takeover** (F-2), and **file hashes are not
runtime authorization** (H2-01). A distinct project makes the foreign runtime unreachable
by construction, which is what both required corrections asked for.

*The AC-02 reading, stated as a reading.* AC-02 rules **one Postgres instance in the
deployment**. **The deployment this mission builds is the `docker-hatchet` project, and it
contains exactly one.** `compose.dev.yaml` is an **AUTHORED-DORMANT** artifact under
DR-121 (*"hatchet-lite dev-compose stays AUTHORED-DORMANT (files only)"*) that has never
run — no Docker daemon has ever started in this repo's history, which is why no seat has
ever seen a container here. A dormant declaration is not a second instance.
**This is a reading, and it has a real counter:** if V or a reviewer reads AC-02 as
host-wide regardless of ownership, then two projects each holding a Postgres is a breach,
and the answer is **V-2(d) — serialize the missions** and re-cut this plan single-project.
It is not resolved by argument here; it is made **unreachable in practice** by the probe
below.

**AR-2a — the foreign-runtime ownership probe, and it is a refusal, not a warning.**

Before **every** `up`, `down`, `restart`, `stop`, `run` and `config` in this mission:

1. `docker compose ls -a` and `docker ps -a --filter label=com.docker.compose.project`
   enumerate every project and container on the host.
2. `docker volume ls` enumerates volumes.
3. **Stop condition — post `BLOCKED` and escalate, do not proceed:** any project other
   than `docker-hatchet` owns a Postgres container or a volume derived from this repo; or a
   `debateai-v3` project exists in any state; or a container carrying this mission's service
   names exists under a foreign project label.
4. **Every mission command is scoped to `-p docker-hatchet`.** A command without an
   explicit project scope is a contract breach even if it would have worked.
5. **`down` is scoped to the mission project and never carries `-v`** (MB-7, DR-188).
6. The probe's output is captured into the acceptance receipt, so **the claim is never made
   in a two-owner world**.

**Freeze sentence, stated so a coding seat cannot miss it:** *this mission's lifecycle
commands MUST NOT stop, recreate, re-spec, relabel or orphan any container, network or
volume owned by another Compose project. If the probe finds one, the ticket posts `BLOCKED`
and escalates — it does not proceed, and it does not "just use a different name".*

**Whether any Compose project, container or volume from this repo exists on this host is
`UNVERIFIED` (U-9)** — the daemon has never been started here, so the expected answer is
"none", but the design is safe under either answer because the probe refuses rather than
assumes.

**Other boundaries, unchanged from round 0:**

- **In-compose services address each other by compose service DNS only** (SR-D2.2): never
  `localhost`, never `host.docker.internal`, never a published host port.
- **No required service bind-mounts host source or host `node_modules`** in the file the
  claim is made against (MB-10). A bind-mount dev overlay may exist as a separate,
  clearly-labelled fragment; **the acceptance claim is never made against it.**
- **The engine's database is a co-tenant** on the one instance. **No V3 query joins across
  that boundary** (RULED, ADR-0003 rule 4).

### 1.4 What this topology does not prove — MB-11's disclosure, in the words it must use

`deploy/DISCLOSURE.md` carries this verbatim in the acceptance record.

1. **Local-dev is not ADR-0018 production compliance.** Production has never been described
   in this tree. Whether this mission produces a production slice is **V-2** (slice **DP**).
2. **With `vllm` off, no real model call occurs.** No seat may describe the stack as
   "running debates". A vLLM failure is a **typed failure with a ledger row, never a
   substituted result** (RULED: ADR-0018 clause 3(d), DR-115).
3. **`job:reaper` is a stub.** `apps/scheduler/src/index.ts:87-88` — `runReaper` throws
   `S00_SCAFFOLD_ONLY`, and root `package.json` has no `job:reaper` script. AC-89's
   **write** half does not fire. The read half survives (`FX-SRV-10` derives the failed
   status from `claim_deadline` without writing), so no reader is misled.
4. **If the dispatcher runs the lite image, that is a substitute, not the ruled unit.**
   Lite-only is a false claim of ADR-0018 compliance (SR-C3.2); the lite-vs-production
   composition difference is written down whatever V-3 decides.
5. **The browser reaches the contract through `web`'s `/api/[...path]` route**, because
   `web/lib/api.ts:3-11` requires a same-origin path. Whether that is AC-60's forbidden
   second path or AC-57's sanctioned SSR forwarder is **V-9**, and it **predates this
   mission**. This plan does not deepen it and does not decide it (**AR-19**).
6. **NEW — `scheduler` is not a healthy-`up` service in this deployment.** Its three jobs
   are one-shot invocations with a completion criterion, not a health criterion, and
   `job:reaper` is not invoked at all. **A passing bar therefore does not prove that
   time-triggered work runs on a schedule** — only that each job can be invoked, exits
   zero, and holds exactly one credential. The exception's owner is **V-11**.
7. **NEW — the acceptance dispatch writes real product rows.** MB-9's proof is a real ask
   through the published front door (**AR-18**), so `core.work_item`, the ledger and the
   run streams gain genuine rows. They are written **only** to this mission's own
   `docker-hatchet_postgres-data` volume, never to a production or foreign store, and
   **nothing is deleted afterwards** (DR-188): the ledger is append-only and the receipt
   records the identifiers rather than cleaning them up.
8. **NEW — the register values this deployment runs on are unratified until V-13.** Any
   receipt captured before V-13 records behaviour under **provisional** values and may not
   be described as the deployment's behaviour.

---

## 2. Hatchet wiring — dispatcher only

### 2.1 The ownership boundary, restated as a constraint (RULED — ADR-0017 clause 2)

**The engine MAY own:** assignment, redelivery, assignment timeouts, worker lifecycle,
child-task fan-out, time-triggered dispatch, and **its own record of dispatch**.

**The engine MUST NOT own:** the claim (`core.work_item`'s claim-before-call via
`FOR UPDATE SKIP LOCKED`, committed **before** any model call — assignment authorizes an
*attempt*, the claim authorizes *the call*); the ledger (a dashboard is not an audit
trail); `at_seq` (where engine completion order and `at_seq` disagree, **`at_seq` wins**);
run state (a fold over our event streams, never a query against the engine); claim expiry;
model artifacts; the retry budget (**one** budget, register-bounded under DR-020 caps, **no
numeral in any engine configuration**); a second durable store; joins across the co-tenant
boundary.

**Three containerization corollaries:**

- **AR-7 — no automatic restart policy on any required service.**
  `restart: always | unless-stopped | on-failure` would be a **second recovery authority**
  competing with engine redelivery, and only the register-bounded one is lawful. It also
  converts SR-C2.1's fail-fast into a crash-loop that reads as a slow start. Recovery is
  **engine redelivery bounded by `HATCHET_ENGINE_RETRIES`** plus operator-initiated
  `docker compose restart` (which MB-5 tests).
- **No health check and no dashboard query may read run state.** A check may assert
  **worker registration** (dispatcher state); never a run, an envelope, or an activation.
- **AR-20 — the dispatcher *container*'s own retry configuration is register-sourced or
  off.** ADR-0017 clause 5 says engine retry behaviour is *"never left at the engine's
  defaults"*. Round 0 bounded only the worker SDK via `HATCHET_ENGINE_RETRIES`; a
  vendor-sample copy could reintroduce a second authority through the engine service's own
  environment. **No numeral may appear in the dispatcher service's environment**, and
  AR-10's guard fails on one, on the same terms as RabbitMQ. *(Raised by G3's
  dispatcher-only lens as a residual rather than a blocking finding; adopted anyway.)*

### 2.2 The wiring already exists — this mission supplies the environment and the network

| Piece | Where | What it already does |
|---|---|---|
| SDK | `@hatchet-dev/typescript-sdk` **1.28.1** in `apps/api` and `apps/runner` | pinned by the one lockfile |
| Dispatch | `apps/api/src/index.ts:363-383` | `runNoWait(workflowName, {runId, workItemId})` with `additionalMetadata: { v3RunId, v3WorkItemId, sourceOfRecord: "core.work_item" }` |
| Client | `apps/api/src/main.ts:38-43`, `apps/runner/src/main.ts:18-22` | `new Hatchet({ token, host_port, api_url, tenant_id, tls_config })` — **our `HATCHET_*` keys as SDK constructor overrides** |
| Task | `apps/runner/src/index.ts:2494-2524` | `client.task({ name: workflowName, retries: engineRetries, fn })`; a terminal failure is recorded to `core.work_item` **before** it rethrows |
| Registration | `apps/runner/src/main.ts:45-47` | `hatchet.worker(HATCHET_WORKER_NAME)` → `registerWorkflows([task])` → `worker.start()` |
| Env contract | `packages/register/src/runtime-environment.ts` | a **`.strict()` Zod object per role** |

**Consequences the coding seat must not undo:**

- **SR-C2.1 — fail-fast is a feature.** `parseEnvironment` builds its object from the
  declared shape only (unrelated environment variables are ignored by construction), and a
  **missing or malformed declared key throws at module load** — before the server listens
  and before the worker registers. **No Dockerfile `ENV` default, no compose
  `${VAR:-default}` fallback, and no `try/catch` may be introduced to make a half-wired
  container start.**
- **SR-C2.3 — the `api` container runs `apps/api`'s published entry point**, never
  `acceptance/main.ts`, whose README states the acceptance environment contains no Hatchet
  keys and which defines its own in-process `AcceptanceDispatcher` (`acceptance/main.ts:94`).
- **`apps/runner` is the only worker.** No second worker is added. If Hatchet is ever given
  the scheduler's jobs, C5's three credential scopes must be preserved rather than absorbed
  into the runner credential (SR-C2.5) — a later slice's problem, named so it is not solved
  by accident.

### 2.3 The env contract, per service

The **exact keys** are the loader's, reproduced here; **their sources, owners, carriers and
container paths are the matrix at §3.6**, which is what H2-06 required and round 0 lacked.

**`api` — `loadApiEnvironment()`:** `KEK_PATH`, `BLIND_INDEX_KEY_PATH`,
`AUDIT_KEY_STORE_PATH`, `AUDIT_SOURCE_IP_SALT_PATH`, `USER_DEK_STORE_PATH`,
`MAIL_SENDMAIL_PATH`, `MAIL_FROM`, `PUBLIC_APP_URL`, `DATABASE_URL`, `API_HOST`,
`API_PORT`, `STRANGER_SAMPLE_RATE`, `REGISTER_VERSION`, `BATTERY_VERSION`,
`SETTLEMENT_WATCH_HANDLE`, + the six shared Hatchet keys. Optional: `NODE_ENV`,
`EVALUATOR_DEV_MENU_ENABLED` (defaults `"false"`), `EVALUATOR_DEV_MENU_DATABASE_URL`.

**`runner` — `loadRunnerEnvironment()`:** `KEK_PATH`, `DATABASE_URL`, `RUNNER_WORKER_ID`,
`CLAIM_MS`, `CLAIM_MARGIN_MS`, the nine judge/composer/conformance bound keys,
`PROVIDER_REF`, the five contract-hash keys, `MAX_RECOMPOSE`, `FACT_BUNDLE_VERSION`,
`JUDGEMENT_NUMBER_KIND`, `JUDGEMENT_PRODUCER`, `PROPAGATION_NUMBER_KIND`,
`PROPAGATION_PRODUCER`, `HATCHET_ENGINE_RETRIES`, `HATCHET_WORKER_NAME`, `VLLM_BASE_URL`,
`VLLM_MODEL`, `VLLM_MAKER`, + the six shared Hatchet keys. Optional: `VLLM_AUTHORIZATION`.

**The six shared Hatchet keys** (`hatchetShape`, identical in both roles):
`HATCHET_CLIENT_TOKEN`, `HATCHET_HOST_PORT`, `HATCHET_API_URL`, `HATCHET_TENANT_ID`,
`HATCHET_WORKFLOW_NAME`, `HATCHET_TLS_STRATEGY` (`"tls" | "mtls" | "none"`).

**`scheduler` — one key per invocation, and only one:** `REPLAY_SELF_TEST_DATABASE_URL` ·
`LIVENESS_DATABASE_URL` · `SETTLEMENT_DATABASE_URL`.

**`web`:** `DIALECTICAL_API_BASE` set **explicitly** to the `api` service's compose DNS
address (SR-D3.4) — `web/lib/serverApi.ts:6` defaults to `http://127.0.0.1:8000`, which
inside a container points at the **web container itself** and on the host collides with
`vllm`'s published 8000, and `web/app/api/[...path]/route.ts` throws
`DIALECTICAL_API_BASE_REQUIRED` if unset. `NEXT_PUBLIC_API_BASE` stays a same-origin path
or unset (`web/lib/api.ts:3-11`).

**AR-6 — one workflow name, one source; and the sharing rule is inverted between the two
credential families.** The six Hatchet keys are emitted **once** and injected into both
`api` and `runner` from that one variable each; `HATCHET_WORKFLOW_NAME` must be
**byte-identical** in both, or `api` enqueues into a workflow nothing is registered for,
**neither side errors**, the ask returns its non-blocking 202, and work silently never
runs. The three scheduler credentials are the **opposite**: no shared `env_file`, no YAML
anchor, no `extends:`-inherited environment may carry any of the three. **Sharing is
mandatory for the workflow identity and forbidden for the job credentials**; a seat that
applies one rule uniformly breaks the other.

### 2.4 The address problem, and the fix

`compose.dev.yaml:28` sets `SERVER_GRPC_BROADCAST_ADDRESS: localhost:7077` and `:31` sets
`SERVER_INTERNAL_CLIENT_INTERNAL_GRPC_BROADCAST_ADDRESS: localhost:7077`. That is the
address the engine hands clients as *"where to reach me"* — correct for a **host** worker on
a published port, **wrong** for a containerized `runner`, which resolves `localhost` inside
its own container where nothing listens (SR-C3.3, derived by `[O]`, confirmed against
vendor docs by `[G]`, executed by nobody).

Under **AR-2** the mission never uses that file, so nothing is overridden: **the mission's
dispatcher fragment declares its own engine service with correct addresses from the start.**

- Broadcast addresses = the engine service's **compose DNS name** and its gRPC port.
- `HATCHET_HOST_PORT` = `${HATCHET_ENGINE_SERVICE}:${HATCHET_ENGINE_GRPC_PORT}` — both
  emitted (§3.6), never a literal, never `<placeholder>`.
- `HATCHET_API_URL` = the engine's compose-DNS HTTP address. `SERVER_URL` remains the
  operator-facing dashboard URL for humans.
- `HATCHET_TLS_STRATEGY` = `"none"` in dev, matching `SERVER_GRPC_INSECURE: "true"`. **The
  dev-only insecure settings live only in the mission's dev fragment and no production
  artifact `extends:` it** (SR-C3.1).

**AR-8 — token ordering.** Vendor documentation states that changing the broadcast address
**requires re-issuing the API token**. No `HATCHET_CLIENT_TOKEN` exists in this tree — 
nothing has ever run. So: **the engine's advertised addresses are made final first, and the
token is minted afterwards, never before.** A token minted against the old address and then
patched produces a worker that authenticates and cannot connect — a provisioning fault that
presents as a network fault. Token minting is gated on **V-10** (§4.1). Whether `SERVER_URL`
must also change for the token to be valid is **U-6a**, read off the engine's own
token-issuance output at D3.

**AR-11 — the two env name spaces are documented side by side.** Our loader keys are
`HATCHET_*` and are passed as **SDK constructor overrides**; the vendor's documented worker
env names are `HATCHET_CLIENT_*`. `deploy/DISCLOSURE.md` carries a mapping table stating
that **the vendor's env names are not read by our processes**. Without it, the first person
to copy a vendor snippet sets keys nothing reads and gets a `.strict()` parse failure naming
a key they did set, differently spelled.

### 2.5 RabbitMQ stays off — the check, and where it lives

**RULED (ADR-0017 clause 1, DR-118):** `SERVER_MSGQUEUE_KIND=postgres`; RabbitMQ is OFF;
enabling it is a recorded **law-6 exception**. The failure mode is *convenience*: vendor
production Compose examples commonly ship RabbitMQ, and `[G]` found the sharper trap — the
vendor's own "Postgres (Default)" lite sample **omits** `SERVER_MSGQUEUE_KIND`, whose
engine default when unset is `rabbitmq`.

**AR-10 — the guard**, with these properties, all required:

1. Runs on the **rendered/resolved** configuration — after every `-f`, override,
   `extends:`, interpolation and profile — **never** a source file.
2. **Fails** on: any `rabbitmq` (case-insensitive) in a service key, image, dependency,
   hostname, env key **or value**, command, URL or volume; any `amqp://`/`amqps://`; any
   published or exposed **5672**/**15672**.
3. **Fails positively** on `SERVER_MSGQUEUE_KIND` unset, empty, or ≠ `postgres`.
4. **AR-20 extension:** fails on **any numeral in the dispatcher service's environment**
   that is not sourced from an emitted variable — the second-retry-authority guard.
5. **Blocking**, in the same gate as `pnpm lint`; **fails closed** on an absent or
   unparseable configuration; **prints the offending path**.
6. Ships with fixtures demonstrating **RED against a renamed vendor-style broker** and
   **GREEN against the mission's rendered model**.

**Where it lives.** `[C]`'s RED/GREEN fixture requirement is AGREED and strictly stronger,
but `tests/**` is a path class this mission does not hold and `tools/orphan-audit/src/index.ts`
is dirty and foreign. So the check and its fixtures live at the exact paths in §3.1 under
`deploy/checks/`, wired by **one additive line** in root `package.json`'s `lint` script.

**Honest scope limit:** a repo-local check makes the defect impossible **to commit**, not
impossible **to run**. The second half needs the operator-checklist assertion in D7 that no
non-project broker container runs on the host.

### 2.6 Proving dispatch — the existence triple, then the law falsification

#### 2.6.1 MB-9's three observables (necessary, and round 0 stopped here)

Captured **from inside containers**: **O-1** the worker is registered/connected under
`HATCHET_WORKER_NAME` for `HATCHET_WORKFLOW_NAME` (**alone, a sidecar**); **O-2** an
engine-side artifact — dashboard, API, **or** log line — exists for that workflow carrying
a **real `v3WorkItemId`** (the requirement is the **correlation**, not a particular surface;
no endpoint, label or return shape is invented — U-4); **O-3** the matching
`core.work_item` row shows a **committed claim** and our ledger carries the attempt row
(**alone, indistinguishable from the pre-Hatchet acceptance harness**).

#### 2.6.2 D4-L — the dispatcher-law falsification cases (H2-09)

H2-09 is correct: O-1∧O-2∧O-3 are post-hoc existence checks. They prove *"Hatchet
dispatched something"*; they do not prove *"Hatchet remained dispatcher-only under retries
and redelivery"*. Round 1 named the cases in prose; **round 2 makes each one an exact
procedure**, because a proof a tester has to design is not a proof the plan supplies.

**The evidence surface, fixed once (§0.3).** Every assertion below reads exactly these:

| Object | Columns used |
|---|---|
| `core.work_item` | `work_item_id`, `run_id`, `state`, `claimed_by`, `claim_deadline` |
| `ledger.ledger_entry` | `sequence`, `run_id`, `attempt_id`, `action_kind`, `call_site_key`, `subject_item_id`, `outcome` |
| `ledger.raw_artifact` | `raw_artifact_id`, `attempt_id`, `run_id`, `provider_ref`, `provider` |
| `core.run_progress_event` | `run_id`, `at_seq`, `kind`, `value_json` — the run-state surface; the terminal event is `kind='TERMINAL'` (`packages/serve/src/index.ts:1178-1179`) |

`claimed_by` carries `RUNNER_WORKER_ID`; `ledger_entry.sequence` is the recorded order;
`call_site_key` for the judge path is the literal `'JUDGE'` (`apps/runner/src/index.ts:1435`).
**No case compares wall clocks, and no case reads a table absent from this list.**

**L-0 — preconditions, and they are gates, not preamble.**

1. **V-15(a)** authorizes the product-data writes every L-case produces; **V-16(a)/(b)**
   authorize the destructive injection L-3/L-4/L-6 require. A case whose authorization is
   open **is not run and is not claimed as proven**.
2. All queries run through a **read-only psql session** against the mission store using the
   `v3_replay_ceremony` principal (§3.5) — the evidence path cannot itself write.
3. Every case records `expected` and `actual` counts as numbers in **`deploy/evidence/D4.md`,
   which D4 owns** (AR-23). **Prose is not a receipt.** D7 later assembles
   `deploy/ACCEPTANCE.md` from that file; round 2 pointed D4 at a D7-owned file and made D4's
   completion depend on its own successor, which is H2-05's reproduced cycle.
4. **Identifier capture, once, and every case binds to it.** The ask returns the run id; the
   work item id is read once and bound for the rest of the case:

```sh
RUN_ID=$(docker compose -p docker-hatchet exec -T api node -e "
  fetch('http://127.0.0.1:'+process.env.API_PORT+'/v1/asks',{method:'POST',
    headers:{'content-type':'application/json','x-user-dev-token':'acceptance:dispatch-probe'},
    body:require('fs').readFileSync('/srv/fixtures/acceptance-ask.json','utf8')})
    .then(r=>r.json()).then(j=>console.log(j.run_id))")
WORK_ITEM_ID=$(docker compose -p docker-hatchet exec -T postgres \
  psql -qAt -U v3_replay_ceremony -d "$POSTGRES_APP_DB" \
  -c "SELECT work_item_id FROM core.work_item WHERE run_id='$RUN_ID' ORDER BY work_item_id LIMIT 1")
```

   Every `$1` below is `$RUN_ID` and every `$2` is the call-site key `'JUDGE'`
   (`apps/runner/src/index.ts:1435`). **No case re-derives an identifier.**

**The claim is not ledgered, and round 2's L-1 assumed it was.** `LEDGER_ACTION_KINDS`
(`packages/kernel/src/index.ts:200-211`) is exactly `MODEL_CALL`, `JUDGEMENT_SCHEDULED`,
`PROPAGATION`, `BUDGET_SKIP`, `SERVE`, `SETTLEMENT_OUTCOME_RECORDED`,
`SETTLEMENT_ATTEMPT_SUPERSEDED`, `SETTLEMENT_READ_BACK_VERIFIED`,
`SCORECARD_DERIVED_FROM_LEDGER`, `UNCLASSIFIED_ACTION` — **there is no claim-recording
kind**, so "the sequence of the claim-recording entry" named a row that does not exist.
H2-09 is right. **L-1 and L-2 are re-cut onto a directly observable committed-claim proof**
(the claim's visibility from an independent session), which needs no ledger row for the
claim and is stronger than an ordering comparison because it observes the transaction
boundary itself.

**The polling observer, used by L-1 and L-2.** One command, run concurrently with the ask,
sampling every 200 ms from an independent session until the run terminates:

```sh
docker compose -p docker-hatchet exec -T postgres sh -c '
  while :; do
    psql -qAt -U v3_replay_ceremony -d "$POSTGRES_APP_DB" -c "
      SELECT now(),
        (SELECT state FROM core.work_item WHERE run_id='"'"'$RUN_ID'"'"' LIMIT 1),
        (SELECT count(*) FROM ledger.raw_artifact WHERE run_id='"'"'$RUN_ID'"'"'),
        (SELECT count(*) FROM core.run_progress_event
           WHERE run_id='"'"'$RUN_ID'"'"' AND kind='"'"'TERMINAL'"'"')";
    sleep 0.2;
  done' | tee /tmp/observer-$RUN_ID.tsv
```

| Case | Exact procedure | Exact assertion | Falsifier |
|---|---|---|---|
| **L-1** the claim commits before any call | run the ask (L-0 §4) with the observer attached | **∃ a sampled row** where `state='CLAIMED'` **and** `raw_artifact count = 0`. The claim is therefore committed and visible to another transaction while **no** model artifact exists yet | no sampled row has `state='CLAIMED'` with a zero artifact count — the artifact appeared no later than the visible claim |
| **L-2** no transaction is held across the call | the **same** observer run — L-1 and L-2 read one capture | the L-1 row exists **and** a strictly later sample shows `raw_artifact count > 0` while `state` is still `'CLAIMED'`. A claim visible to an independent session *before* the artifact **is** the committed-transaction boundary: an open transaction would make `CLAIMED` invisible until after the call | `CLAIMED` first becomes visible in the **same or a later** sample than the first artifact — the claim was held open across the call |
| **L-3** redelivery while a claim is live | during the attempt: `docker compose -p docker-hatchet kill runner`; then **explicitly** `docker compose -p docker-hatchet start runner` — **AR-7 forbids an automatic restart policy, so the container stays down until started by hand**; then force redelivery by **D2a §R**'s recorded command. Capture `A0 = SELECT count(*) FROM ledger.raw_artifact WHERE run_id=$1` before, `A1` after | `A1 = A0`; `SELECT count(DISTINCT claimed_by) FROM core.work_item WHERE work_item_id=$WORK_ITEM_ID` **= 1** and that value **= `RUNNER_WORKER_ID`**; `claim_deadline` is not advanced by the redelivered attempt | `A1 > A0`, i.e. a second artifact under one live claim |
| **L-4** redelivery after settlement | wait for `SELECT count(*) FROM core.run_progress_event WHERE run_id=$1 AND kind='TERMINAL'` **= 1**; snapshot `S0 = SELECT state, claimed_by, claim_deadline FROM core.work_item WHERE run_id=$1` and `E0 = SELECT at_seq, kind FROM core.run_progress_event WHERE run_id=$1 ORDER BY at_seq`; force redelivery by D2a §R; re-capture `S1`, `E1` | `S1 = S0` and `E1 = E0` **row for row**; `count(*) FROM ledger.raw_artifact WHERE run_id=$1` unchanged. **The terminal-event surface is `core.run_progress_event (run_id, at_seq, kind, value_json)`** (`packages/serve/src/index.ts:1178-1179`) — round 2 named a "terminal event" with no table | any new `run_progress_event` row, or any change in `S` |
| **L-5** retryable failure, budget remaining | run the ask with the `vllm` profile **off**, so `VLLM_BASE_URL` resolves to an absent service and the gateway raises a **typed transport failure** (§1.1 — the runner boots on a valid-and-unreachable URL by design) | `SELECT count(DISTINCT attempt_id) FROM ledger.ledger_entry WHERE run_id=$1 AND call_site_key=$2 AND attempt_id IS NOT NULL` **= `JUDGE_MAX_ATTEMPTS`** exactly. **Distinct attempts for one call site** — round 2 counted `ledger_entry` rows across all call sites and compared them to a per-call-site bound, which H2-09 correctly called dimensionally invalid. Every attempt has ≥1 `ledger_entry` with a non-`OK` `outcome`; **no `raw_artifact` row exists for a call that did not return** (DR-115) | an attempt with no ledger row, a substituted artifact, or a distinct-attempt count ≠ the bound |
| **L-6** one budget, not two | repeat L-5 with `HATCHET_ENGINE_RETRIES` set to a **non-zero** emitted value | the same `count(DISTINCT attempt_id) … WHERE call_site_key='JUDGE'` is **still exactly `JUDGE_MAX_ATTEMPTS`** — engine redelivery does **not** add attempts on top of the gateway bound | a distinct-attempt count above the register bound: the engine extended a budget it does not own |
| **L-7** engine history is never run state | static, no runtime, no authorization: `deploy/checks/dispatcher-law-scan.mjs` scans `apps/**` and `packages/**` | the scan enumerates every `@hatchet-dev/typescript-sdk` call site and asserts each is a **dispatch** (`runNoWait`) or **worker-lifecycle** (`worker`, `registerWorkflows`, `start`, `task`) call — **zero** reads of the engine for a run's phase, an envelope's state, or a row's activation state, which are folds over our own event streams (ADR-0007) | any engine read reachable from a serving or run-state path |

**L-7 is executable today with no runtime and no authorization** — it is a source scan, and
it is the one law this mission can prove before Docker exists.

**The ABSENT rule, stated so it cannot be softened.** L-3, L-4 and L-6 depend on a lawful
forcing mechanism (redelivery; a non-default engine retry count). **D2a** owns that
discovery (§2.7.1). If `deploy/VENDOR-SURFACES.md` records the mechanism **ABSENT**, then:

- the dependent case is **not run**;
- **`deploy/evidence/D4.md`** — which D4 owns — records it as **UNPROVEN with the named
  blocker (U-10)**, and D7 carries that verdict through into `deploy/ACCEPTANCE.md`
  unchanged;
- **no seat, lens or verdict may state that the corresponding ADR-0017 law was proven**;
- and the case is **not replaced** by a weaker one.

**If a case exposes an application defect outside this mission's file contract, the ticket
routes a plan-defect / `BLOCKED` edge. It does not weaken the check** — the alternative is
a bar that passes because it stopped asking.

### 2.7 The health and completion contract, per unit (F-4, H2-03)

Round 0 specified a contract-exercising check for `postgres` and `runner` only, and §8.1
over-claimed MB-3 coverage. MB-3 requires **every** required service to declare a
`healthcheck:` that exercises **that service's own contract**; `["CMD","true"]`, a bare TCP
connect and a `depends_on` short form are named falsifiers.

#### 2.7.1 Required (continuously healthy) units

Round 1 named a *class* of probe per unit and deferred two to discovery. H2-03 is right that
a class is not a command. **Every probe below is exact**, and the two that genuinely depend
on a vendor surface have a **hard predecessor that owns the discovery, with an output path
and an acceptance rule** — which is the alternative H2-03 itself allows.

**Why `node -e` and not `curl`/`wget`.** The app and web images are built `FROM` a Node base
(§3.4), so **`node` is the one interpreter guaranteed present**; `curl` and `wget` are not.
A healthcheck that assumes an absent binary fails as "unhealthy" and reads as an application
fault.

**Why `127.0.0.1` inside a healthcheck is not an MB-10 violation.** MB-10 and SR-D2.2 forbid
`localhost` for **inter-service** addressing. A healthcheck executes **inside the container
it checks**, where `127.0.0.1` *is* that service. Every **inter-service** address in this
plan remains compose DNS. Stated because it otherwise reads as a contradiction.

| Unit | Exact check | What it exercises | Source |
|---|---|---|---|
| `postgres` | `CMD-SHELL pg_isready -U ${POSTGRES_APP_USER} -d ${POSTGRES_APP_DB} -h 127.0.0.1 -p 5432 && pg_isready -U ${POSTGRES_APP_USER} -d ${POSTGRES_HATCHET_DB} -h 127.0.0.1 -p 5432` | **two** databases — the product store **and** the co-tenant. A single probe goes green while the engine's database is absent, which is exactly the U-2 failure AR-17 removes | `pg_isready` ships in the postgres image |
| `api` | `CMD-SHELL node -e "fetch('http://127.0.0.1:'+process.env.API_PORT+'/v1/session',{headers:{'x-user-dev-token':'healthcheck'}}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"` | routing, the `preHandler` auth gate, the session schema and JSON encoding. Verified: `apps/api/src/index.ts:237-239` returns `request.session` and reaches **neither the database nor any frozen file**. **Must not be `/v1/auth/*`** — those are `public` but exercise **frozen registration behaviour** | the route list in `apps/api/src/index.ts` |
| `web` | `CMD-SHELL node -e "fetch('http://127.0.0.1:'+process.env.WEB_PORT+'/').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"` | the Next server actually **serving** the root page, not a port being bound. Verified present: `web/app/page.tsx` | the `web/app/` tree |
| `runner` | the exact command **D2a records** in `deploy/VENDOR-SURFACES.md` §W, asserting this worker is registered under `HATCHET_WORKER_NAME` for `HATCHET_WORKFLOW_NAME` (MB-9's O-1, in-container). Asserts **dispatcher state**, never run state (**AR-9**) | worker registration | **D2a**, hard predecessor — **U-8** |
| dispatcher | the exact command **D2a records** in `deploy/VENDOR-SURFACES.md` §E, asserting engine readiness on the engine's own documented surface | engine readiness | **D2a**, hard predecessor — **U-11** |

**AR-21 — the vendor-surface discovery is a slice, not a footnote.** Round 1 left U-8 and
U-11 as UNVERIFIED rows attached to D3/D4, which meant the seat that hit them had to invent
a probe or stall. **D2a** (§4.2) owns them with an explicit contract:

- **Output path:** `deploy/VENDOR-SURFACES.md`, four sections — **§W** worker-registration
  query, **§E** engine readiness, **§C** the dispatch-correlation artifact for MB-9's O-2,
  **§R** the redelivery-forcing mechanism for L-3/L-4/L-6.
- **Acceptance rule, per section:** either **(i)** an exact command, its expected output, and
  the vendor document (title + version + URL) it came from; or **(ii)** the literal token
  **`ABSENT`** plus the search performed.
- **Consequence of `ABSENT`, per section:** §W ⇒ `runner` has no lawful healthcheck and
  **MB-3 is unmeetable for it — report a blocker (U-8)**; §E ⇒ same for the dispatcher
  (U-11); §C ⇒ MB-9's O-2 is unprovable (U-4); §R ⇒ L-3/L-4/L-6 are **UNPROVEN** under
  §2.6.2's ABSENT rule (U-10).
- **Never substituted:** `["CMD","true"]`, a bare TCP connect, or a `depends_on` short form
  are the falsifiers MB-3 names. A blocker is the correct output; a green check that proves
  nothing is not.

**The health token is not a credential.** `resolveSession` accepts any non-empty string and
derives a provisional asker from its hash; `healthcheck` above is a **non-secret literal
marker** carrying no authority, so MB-4's no-secret-values rule is unaffected. Stated
because a reviewer seeing a token in a healthcheck will otherwise, correctly, ask.

**`depends_on` uses the long form with `condition: service_healthy` throughout** (and
`service_completed_successfully` for the AR-17 one-shots). The short form is an MB-3
falsifier.

#### 2.7.1a Timing values, chosen here (AR-14)

**AR-14 — health-check timing values are operational, not verdict-bearing, and are chosen
in this plan.** Under §5.4c's own test, changing an `interval`, `timeout`, `retries` or
`start_period` cannot change a produced artifact or a served result — the same test that
acquits the dispatcher digest and convicts the vLLM digest. They are therefore **not**
register rows and need no V ratification. Round 1 said they would be "recorded once" later;
H2-03 is right that deferring a choice is not making one, so they are chosen now:

| Unit | `interval` | `timeout` | `retries` | `start_period` | Why this value |
|---|---|---|---|---|---|
| `postgres` | 10s | 5s | 5 | 20s | two `pg_isready` calls; first boot runs initdb |
| dispatcher | 10s | 5s | 5 | 60s | the engine runs its own migrations on first start — the longest cold start in the model |
| `api` | 10s | 5s | 5 | 30s | Node cold start plus the register reads in `main.ts` before `listen` |
| `runner` | 10s | 5s | 5 | 30s | Node cold start plus worker registration |
| `web` | 10s | 5s | 5 | 30s | `next start` boot |

**These are the only numerals this plan chooses**, and each is an operational timing under
AR-14's test. *Reading rejected:* treating every numeral as a register row — it would make V
ratify a health-check interval, which AC-74 was not written to do. The table is copied into
`deploy/DISCLOSURE.md` with this rationale so the fragments carry no unexplained numbers.

#### 2.7.2 The one-shot completion contract (AR-15)

**AR-15 — `scheduler` is a one-shot invocation unit and is not in the MB-1/MB-3 required
set.**

*Ruled:* the three scheduler jobs and the replay ceremony are **profiled one-shot
services**. They are not started by the required-bar `up`, they are not expected to report
`healthy`, and they are **removed from the "every required service is healthy" quantifier**.
Their falsifiable criterion is **completion**, not health:

| Criterion | Falsifier |
|---|---|
| the invocation **exits 0** | any non-zero exit |
| it **prints the report its CLI documents** (`apps/scheduler/src/cli.ts` writes `JSON.stringify(report)`; `apps/replay/src/cli.ts` writes the ceremony report and sets `exitCode = 1` when not exact) | empty or unparseable stdout |
| its process environment contains **exactly one** of the three job credentials (§3.5) | two or more visible in the rendered model |
| the **negative** permission receipts hold (§3.5) | any cross-scope write succeeding |

*Why this and not the alternatives.* `apps/scheduler/src/cli.ts` reads `process.argv[2]`,
runs one command and exits — it is a one-shot by construction, and `job:reaper` is not
runnable at all, so "run all three at `up` and keep them healthy" is unlawful for one of the
three regardless. Making them daemons would mean writing a supervisor loop into `apps/**`,
which is scope expansion and forbidden by SR-D3.6.

*This is a bounded change to an inherited requirement, so it is V's to bless:* **V-11**,
with **MB-11 item 6** carrying the disclosure under either answer. Both review lenses asked
for exactly this shape (F-1's third flip option; H2-03's second option).

### 2.8 What the mission's lifecycle commands may touch

A single table, because H2-01's re-review proof asks for a command-level sequence showing
the foreign runtime cannot be harmed.

| Command | Scope | May touch | Refuses if |
|---|---|---|---|
| ownership probe | host-wide, **read-only** | nothing | n/a — it is the gate |
| `config` render | `-p docker-hatchet`, mission fragments only | nothing | probe fails |
| `up -d` (required bar) | `-p docker-hatchet` | only services declared in the mission's required fragments | probe fails |
| `restart <svc>` (MB-5) | `-p docker-hatchet` | one named mission service | probe fails, or the service is not the mission's |
| `run --rm <one-shot>` | `-p docker-hatchet` | one profiled mission one-shot | probe fails |
| `down` (MB-7) | `-p docker-hatchet`, **never `-v`** | only the mission project's containers and network | probe fails |
| anything against `compose.dev.yaml` | **forbidden** | — | always |

**No mission command names a foreign project, and no mission command omits `-p`.**

---

## 3. File and image contract

### 3.1 The exact-file manifest (H2-05 — no globs, no alternatives, one writer each)

Round 0 authorized four directory globs and one *"or a profile inside the above"*. Both are
breaches of SR-D1.1's *exact files, not directory globs*. Every path below is exact; the
**Writer** column names the sole slice that may create or modify it, which is also §4.3's
matrix.

**MAY CREATE** (no existing writer):

| Exact path | Purpose | Writer |
|---|---|---|
| `deploy/compose/00-data.yaml` | `postgres`, dispatcher, the two SQL one-shots | **D3** |
| `deploy/compose/10-dispatch.yaml` | `api`, `runner` | **D4** |
| `deploy/compose/20-web.yaml` | `web` | **D5** |
| `deploy/compose/30-jobs.yaml` | three scheduler one-shots + `replay-ceremony` | **D6** |
| `deploy/compose/90-vllm.yaml` | the non-required vLLM lane (its `${VLLM_MODEL:?}` guard lives here and nowhere else) | **DV** |
| `deploy/compose/up.sh` | the **one documented command** — the ordered `-f` chain, `-p docker-hatchet`, preceded by the AR-2a probe | **D7** |
| `deploy/compose/down.sh` | the one documented non-destructive stop (never `-v`) | **D7** |
| `deploy/compose/probe-ownership.sh` | the AR-2a foreign-runtime probe | **D0b** |
| `deploy/images/app.Dockerfile` | the one app image (`api`, `runner`, scheduler, replay) | **D2** |
| `deploy/images/web.Dockerfile` | the `web` image | **D2** |
| `.dockerignore` (workspace root) | SR-D3.2's other half — §3.4 | **D2** |
| `deploy/sql/ensure-hatchet-db.sql` | idempotent co-tenant database creation (**AR-17**) | **D3** |
| `deploy/sql/ensure-principals.sql` | idempotent creation of the four principals and their §5.5.0 grants | **D3** |
| `deploy/sql/verify-principals.sql` | the **negative** cross-scope permission receipts | **D3** |
| `deploy/checks/rabbitmq-guard.mjs` | AR-10 + AR-20 rendered-config guard | **D3** |
| `deploy/checks/fixtures/red-renamed-broker.yaml` | AR-10's RED fixture | **D3** |
| `deploy/checks/fixtures/green-mission-model.yaml` | AR-10's GREEN fixture | **D3** |
| `deploy/checks/compose-invariants.mjs` | rendered-model assertions: DNS-only addressing, no `restart:` policy, `service_healthy` long form, Hatchet workflow-name byte-identity, one-credential-per-job-context | **D3** |
| `deploy/checks/dispatcher-law-scan.mjs` | L-7's static scan (no engine read is run state) | **D4** |
| `deploy/evidence/D0b.md` · `D1.md` · `D2.md` · `D2a.md` · `D3.md` · `D4.md` · `D5.md` · `D6.md` · `DV.md` | **AR-23** — each slice's own receipts and disclosure text. **One writer each: the slice the file is named for.** D7 **reads and assembles** them; it never writes them | the named slice |
| `deploy/DISCLOSURE.md` | MB-11 §1.4 verbatim, the lite-vs-production difference, `MAIL_SENDMAIL_PATH`'s status, the `HATCHET_*` ↔ `HATCHET_CLIENT_*` map, AR-14's timing values, **plus the disclosure text assembled from `deploy/evidence/*.md`** | **D7** |
| `deploy/ACCEPTANCE.md` | the receipt set, **assembled from `deploy/evidence/*.md`** — D7 merges, it does not author a predecessor's numbers | **D7** |
| `deploy/env/compose-env-deploy.ts` | **only if AR-1's fallback fires** — a mutually exclusive authorized branch, never an improvised expansion | **D1** |
| `deploy/VENDOR-SURFACES.md` | **AR-21** — the four vendor surfaces (§W worker registry, §E engine readiness, §C dispatch correlation, §R redelivery forcing), each an exact command **or** the literal `ABSENT` | **D2a** |
| `deploy/fixtures/acceptance-ask.json` | **AR-18** — the exact `AskRequestSchema`-conforming body for the MB-9 dispatch receipt | **D4** |
| `deploy/compose/prod/00-prod.yaml` | **DP** — the production-target resolved model (static config only, never deployed by this mission) | **DP** |
| `deploy/PRODUCTION-TARGET.md` | **DP** — the resolved-config proof and the statement that a static proof is not a deployment | **DP** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md` | this file | **C2** |
| `docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-rework1-selfreport.md` · `…/c2-rework2-selfreport.md` | the rework self-reports | **C2** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/D0b-baseline.md` | hash baseline | **D0b** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/D1.md` | D1's post-write hashes | **D1** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/D2.md` | D2's post-write hashes | **D2** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/D2a.md` | D2a's post-write hashes | **D2a** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/D3.md` | D3's post-write hashes | **D3** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/D4.md` | D4's post-write hashes | **D4** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/D5.md` | D5's post-write hashes | **D5** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/D6.md` | D6's post-write hashes | **D6** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/D7.md` | D7's post-write hashes | **D7** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/DV.md` | DV's post-write hashes | **DV** |
| `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/DP.md` | DP's post-write hashes | **DP** |

**MAY EXTEND** — only for containerization of already-ruled services, and only when §3.2's
claim-time check passes for that **exact file**:

| Exact path | Bound | Writer |
|---|---|---|
| `packages/register/src/compose-env.ts` | **AR-1.** Additive emission only. No reformat, no import reorganization, no other change in `packages/register`. | **D1** |
| `package.json` (root) | **`scripts` only**, additive (`lint` gains the guard; the compose commands gain wrappers). If §3.2's check fails, post `BLOCKED` rather than edit. | **D1** (scripts for D1), **D7** (lifecycle scripts) — **disjoint hunks, named in §4.3** |
| `deploy/IMAGE-PINS.md` | **additive rows only** | **D1** |
| `register.bootstrap.json` | **additive rows only, and only if V-5(a) and/or V-12 mint a row.** Otherwise **MUST NOT TOUCH**. | **D1** |

**GENERATED OUTPUT** — a class round 0 lacked, which is why F-7 and H2-05 both landed:

| Exact path | Rule | Writer |
|---|---|---|
| `.env.compose` | the **output** of `pnpm compose:env`. Rewriting it is the tool running, not a hand edit; it stays **derived and secret-free**; its new hash is recorded on completion. **Never hand-edited.** | **D1** (via the tool) |

**MUST NOT TOUCH:**

- `deploy/postgres/init-hatchet.sql` — **hashed, foreign-authored, and unused by this
  mission** (AR-17 replaces its function). Its presence in the base file is the base file's
  business.
- The dirty tracked set, **re-read at every ticket claim, not copied from here**. As of
  2026-08-21: `apps/api/src/mail-channel.ts`, `apps/api/src/registration.ts`,
  `packages/db/src/identity.ts`, `packages/register/src/auth-policy.ts`,
  `tests/integration/identity-database.test.ts`,
  `tests/integration/registration-database.test.ts`, `tests/unit/registration.test.ts`,
  `tools/orphan-audit/src/index.ts`,
  `docs/missions/2026-08-17-accounts-privacy-security/logs/run-claude-seat.sh`.
- **`compose.dev.yaml` — byte-unchanged, and never on a command line** (AR-2).
- `packages/crypto/**`, including `SECRET_STORE_LAYOUT.md`.
- `migrations/0030_identity_foundation.sql` and later identity/auth migrations;
  `migrations/pending/**` belonging to the security mission.
- `docs/missions/2026-08-17-accounts-privacy-security/**` and
  `docs/missions/2026-08-17-mfa-recovery-requirements/**`.
- **`tests/**`** — a path class this mission does not hold. If a coding seat concludes a
  test file must change, that is a **contract request to the orchestrator**, not a refactor.
- Identity / registration / MFA / session / auth routes and behaviour, **byte-for-byte**. If
  the image cannot boot without editing one, that is a freeze collision → `BLOCKED`, never a
  patch.
- The five foreign boards; every object owned by a foreign Compose project (§1.3).

**AR-16 — the compose model is split into per-slice fragments combined by an ordered `-f`
chain inside the mission's own project.** This is what gives every compose stanza exactly
one writer (H2-05) while keeping one resolved model for AR-10's rendered-config guard. The
chain is all-mission-owned, so no override of a foreign file is needed and U-3 stops being a
blocking question. The required-bar chain is `00` → `10` → `20` → `30`; `90-vllm.yaml` is
**excluded** from it, which is what keeps `${VLLM_MODEL:?}` off the required path.
*Reading rejected:* one `compose.app.yaml` authored by D3 and frozen — later slices would
have to either edit a frozen file or push their services into D3, collapsing the slice
boundaries the plan exists to draw.

### 3.2 The ownership mechanism, and every hashed path classified (F-7)

**AR-12.** Only 141 files under `dialectical-engine/` are tracked, and **every file this
mission most needs is untracked and not ignored**. A coding seat that "checks the diff" sees
its own new files and **does not see** whether a sibling mission overwrote one of these: a
collision surfaces as a silent overwrite, with no diff, no conflict marker and no history.

F-7's defect was that three hashed paths sat in no class, so D1's mandatory `.env.compose`
write was simultaneously required and unlawful. **Every hashed path now carries its class:**

| Path | SHA-256 (first 16) | mtime | §3.1 class |
|---|---|---|---|
| `compose.dev.yaml` | `a61c779d5b61010c` | 2026-08-07T23:56:53 | **MUST NOT TOUCH** |
| `package.json` | `7b5eec140f2375a6` | 2026-08-15T11:08:09 | **MAY EXTEND** (scripts only) |
| `deploy/IMAGE-PINS.md` | `1b316fbc22b850ac` | 2026-08-07T23:56:54 | **MAY EXTEND** (additive rows) |
| `deploy/postgres/init-hatchet.sql` | `69b5b4240895ee85` | 2026-08-07T23:49:18 | **MUST NOT TOUCH** (unused — AR-17) |
| `.env.compose` | `f6bf431d145b821c` | 2026-08-07T23:57:16 | **GENERATED OUTPUT** |
| `register.bootstrap.json` | `83ce70a26c1495d7` | 2026-08-07T23:57:07 | **MAY EXTEND** iff V-5(a) / V-12; else **MUST NOT TOUCH** |
| `packages/register/src/compose-env.ts` | `5e3b3decb284e436` | 2026-08-07T23:56:54 | **MAY EXTEND** (AR-1) |

**The rule, per ticket:**

1. At claim time, re-hash every row **and** re-run `git status --porcelain`.
2. **Every dirty tracked file is foreign until proven otherwise** (SR-D1.2 — the set grew
   by two files within one day of the synthesis).
3. **A changed hash on a row this ticket intends to write is a foreign write → post
   `BLOCKED` and escalate.** Do not widen; do not merge by hand.
4. `compose.dev.yaml`'s hash is re-checked at **every** ticket regardless of intent.
5. On completion the ticket **writes its own hash-record file** —
   **the one file §3.1 enumerates for it by full path** under
   `docs/missions/2026-08-21-docker-hatchet/architecture/path-manifest/` — and
   **appends to no other**. The manifest is the **directory**, read in lexical order;
   the current baseline for any path is its **last** occurrence. **One writer per file, and
   no file is ever appended to by two slices.**
6. **A generated-output rewrite is not a foreign write** — but its post-write hash is
   recorded so the *next* ticket can still detect one.

**Why a directory and not one file.** H2-05 caught three incompatible rules in round 1: §3.1
gave `path-manifest.md` a single writer (D0b), §3.2 told **every** ticket to record hashes
into it, and §4.3 said every later slice appends a dated block. A coding seat could satisfy
at most two. **One file per slice satisfies all three intents at once** — a single writer per
path, a per-ticket record, and an append-only history — with no rule left contradicting
another.

### 3.3 AR-1 — the register-emission path class

*Ruled:* this mission holds `packages/register/src/compose-env.ts` as **MAY EXTEND**, and
`pnpm compose:env` remains the single producer of register-sourced compose constants.

*Why.* SR-A4.1, SR-A4.2, SR-C2.2 and the whole §3.6 matrix require compose constants to be
**emitted by `pnpm compose:env`**; §1.3 of the module design is explicit that *"a value
injected as a container environment variable is still a constant"* (AC-74). The file is
untracked, clean, and last modified 2026-08-07 in the same batch as `compose.dev.yaml`;
`packages/register/src/auth-policy.ts` is dirty and foreign — **same package, different
file**, and one-writer-per-file is per file.

*Bounded:* additive emission only; no reformat; no import reorganization; nothing else in
`packages/register`.

*Named fallback, as a mutually exclusive authorized branch:* if §3.2's check shows
`compose-env.ts` has acquired a foreign writer, the seat does **not** write literals and does
**not** widen. It creates `deploy/env/compose-env-deploy.ts`, which imports
`loadBootstrapRegister()` from `@debateai/register` and emits a **second, mission-owned** env
file — values still through the register loader, no literal anywhere — wired by an additive
root script. Its cost (two emitters, two env files) is why it is the fallback.

*Reading rejected:* `[G]`'s blanket `packages/**` readonly — it leaves SR-A4.2 unsatisfiable
except by the literal AC-74 forbids.

### 3.4 Image contract

**One build context: the workspace root — forced, not preferred.**
`apps/runner/src/main.ts:2` imports `loadKek` by the relative path
`../../../packages/crypto/src/index.js`, while `apps/runner/package.json` does not declare
`@debateai/crypto`. A per-app context cannot resolve it, and normalizing the import would
edit a runner file whose target is the **frozen** crypto boundary. **Per-app build contexts
are forbidden.**

**`.dockerignore` at the workspace root** must exclude at minimum: `node_modules`, `.next`,
`.pgdata*`, `.git`, `.hermes`, build outputs; **`web/.env.local`** — verified present,
untracked, not ignored, setting `DIALECTICAL_API_BASE=http://127.0.0.1:8790`; copied into
the image it produces a `web` container that looks configured and addresses a host port no
compose service owns; and `.env.compose` plus any operator secret file — **secrets arrive as
mounts or injected environment, never as layers**.

| Image | Services | Command | Base image |
|---|---|---|---|
| `deploy/images/app.Dockerfile` | `api`, `runner`, the three scheduler one-shots, `replay-ceremony` | the **existing published entry points** — `apps/api`'s and `apps/runner`'s `start` scripts, the root `job:*` scripts, `replay:ceremony`. A wrapper, if needed, lives under `deploy/`. **No new file inside `apps/**`** (SR-D3.6). | a Node image at `nodeRuntimeVersion` (`v22.23.1`, a ratified bootstrap row), **pinned by digest** — the digest is **V-12** |
| `deploy/images/web.Dockerfile` | `web` | `next start` via the package's published `start` script | same base, same pin, same **V-12** |

**Runtime rules:**

- **Inject every required loader key at runtime. Bake none into a layer. Rename none. Log
  none** (MB-4: no token or credential value in the log stream).
- **`API_HOST` binds `0.0.0.0`.** Publication is AR-19's, not a default.
- **`USER_DEK_STORE_PATH` is a named volume that survives `down` without `-v`** (SR-D3.1,
  MB-6's teeth) — a directory tree with mode semantics (`0700` dirs, `0600` `dek.v1.json`,
  per `packages/crypto/SECRET_STORE_LAYOUT.md`, read-only to this mission). **The container
  adapts to the documented layout; the modes are not relaxed "to make it work."** Losing it
  destroys every user's wrapped DEK — crypto-shredding by accident, unrecoverable.
  `KEK_PATH`, `BLIND_INDEX_KEY_PATH`, `AUDIT_KEY_STORE_PATH`, `AUDIT_SOURCE_IP_SALT_PATH`
  are mounts on the same terms.
- **`MAIL_SENDMAIL_PATH` is validated only as a non-empty string** (SR-D3.3): a container
  with no sendmail binary **boots fine and fails only when a registration email is sent**.
  **Ruled:** `deploy/DISCLOSURE.md` **records** that registration mail is non-functional —
  recorded, never discovered. A sendmail binary is not added: that is
  registration-adjacent, and `apps/api/src/mail-channel.ts` is dirty and foreign.
- **`PUBLIC_APP_URL` must start with `https://`** and the refine is **not relaxed**; the
  value is V's (§3.6, V-13) and `deploy/DISCLOSURE.md` records that in local dev nothing
  serves that origin. The dev-menu guards are likewise not relaxed.
- **Image provenance (MB-8).** Third-party images by **digest**; built images by
  **immutable image ID/digest** recorded by the slice that built them, in
  `deploy/evidence/D2.md`, and assembled into `deploy/ACCEPTANCE.md` by D7 (AR-23). A
  floating tag alone fails. **Every compose image identity that is a register row is interpolated from a
  `compose:env`-emitted variable, never a compose literal** (SR-A4.2 — today
  `register.bootstrap.json`'s `vllmImageDigest` and `compose.dev.yaml:34`'s literal agree
  and nothing detects drift).
- **`postgres`' identity stays `postgres:${POSTGRES_MAJOR_VERSION}` unless V-5.** Under
  either answer MB-8 holds: the identity used is recorded, and a mutable tag alone never
  counts as a pin. **The register loader is the only version source** — no Dockerfile
  `FROM postgres:…`, no compose literal as a second source (B5 invariant, AGREED).

### 3.5 Credentials, principals, and the artifacts that create them (H2-07)

**AR-3 — credential separation is an *exposure* property.** Each scheduler job runs in its
**own injection context** carrying **exactly one** of the three URLs. **No shared
`env_file`, no YAML anchor, no `extends:`-inherited environment carries any of the three.**
A shared admin URL exported under three names satisfies the shape and destroys the property.

*Why the exposure reading.* `[O]` reads §5.5.0 as *what is reachable from the process*;
`[G]` as *which role each invocation uses*; `[C]` sits between and leans `[O]`. The exposure
reading **satisfies both** — a process that can see one credential necessarily uses one —
and is the only one provable from the rendered configuration without printing values.
`[O]`'s counter is that §5.5.0 says the three jobs *"share a process"*; that sentence
describes the **module**, not the runtime container, and §5.5.0's own table gives the three
**different grants**, which is a statement about principals. *This ruling is architecture's,
not V's* — synth §3.5 and §6 both say so.

**AR-17 — the co-tenant database and the four principals are created by idempotent,
always-run SQL one-shots that this mission owns.** This is the union answer to G3 F-3 and
H2-07, and it retires U-2 as a blocker.

*Ruled:* `deploy/sql/ensure-hatchet-db.sql` and `deploy/sql/ensure-principals.sql` are
**idempotent and run on every `up`**, ordered before the dispatcher by
`depends_on: { condition: service_completed_successfully }`. They are executed by profiled
one-shot services in `00-data.yaml` holding the mission's own bootstrap admin credential —
a **fourth injection context**, distinct from the four principals.

- **Fresh volume and existing volume behave identically**, because the scripts are guarded
  (`CREATE DATABASE` only when absent; `CREATE ROLE … ` only when absent; grants reapplied
  unconditionally). H2-07's re-review proof — *"a fresh-volume path and an existing-volume
  path"* — is satisfied by there being **one** path.
- **`deploy/postgres/init-hatchet.sql` is never used and never edited.** F-3's problem was
  that `docker-entrypoint-initdb.d` runs **only on first boot**, so relying on it means an
  existing volume yields an engine failure that presents as a credentials error, with no
  lawful repair (editing the file is out of class; deleting the volume is DR-188). **Not
  depending on it is the repair.** U-2 therefore stops being a blocker and becomes a
  recorded fact.
- **No volume is ever deleted, and no `-v` appears in any documented command** (DR-188).

*Reading rejected:* keeping the initdb mount as the mechanism and documenting the
first-boot caveat. That leaves a day-one failure whose only recovery is the one DR-188
forbids.

**The four principals** — names are identifiers, not verdict-bearing values, so they are
fixed here; **passwords are generated at operator-up and never committed** (AR-13):

| Principal | Role name | Grant (RULED — `03-module-design.md` §5.5.0) | Injected as |
|---|---|---|---|
| `job:replay-self-test` | `v3_replay_self_test` | read-only on every schema **except** append on `serve`'s two eviction streams (`served_number_event`, `segment_suppression`) | `REPLAY_SELF_TEST_DATABASE_URL`, alone |
| `job:reaper` | `v3_reaper` | read-only on every schema **except** write on `core.work_item` — **schema `core`, not `serve`** | `LIVENESS_DATABASE_URL`, alone. **Provisioned though the job is a stub** (§1.4 item 3), so the later slice needs no deployment change. |
| `job:settlement-watch` | `v3_settlement_watch` | read-only on every schema **except** three appends inside `scorecard`/`ledger`: `scorecard.answer_outcome`, its `ledger_entry` rows, **INSERT-only** on `scorecard.scorecard_cell`. **No UPDATE, no DELETE; no write on `serve`, none on `core`.** | `SETTLEMENT_DATABASE_URL`, alone |
| `apps/replay` | `v3_replay_ceremony` | **read-only, full stop** (VR-3 limb (iii); `06-test-strategy.md` FX-IND-03) | **argv at invocation** — never an env var, never a compose value |

**No two jobs share a target.** Image reuse is permitted; **credential reuse is not.**

**`deploy/sql/verify-principals.sql` carries the negative receipts** (`[C]` REQ-C5-3,
AGREED): each principal is shown **denied** a representative write from each of the other
two scopes, plus the replay principal denied every write. Positive-only checks pass under a
collapsed superuser — the exact failure this guards. **Rendered evidence proves distinctness
without printing values.**

**AR-4 (re-cut) — `replay-ceremony` is a profiled one-shot *service definition*.** H2's
secondary defect is correct: `docker compose run` requires a service. The exact shape:
service key **`replay-ceremony`** in `30-jobs.yaml`, in the `jobs` profile, **never started
by `up`, never a `depends_on` of anything**, invoked as
`docker compose -p docker-hatchet -f … run --rm replay-ceremony <db-url> <attestation-path>`
— which matches `apps/replay/src/cli.ts`'s argv contract exactly, so **the read-only
credential never enters the container environment**, the strongest available form of VR-3
limb (iii). "Not a service" in round 0 meant "not a long-running required service"; that
was imprecise and is now stated. *Recorded weakness:* a profile in the same project shares
the network, so *"separately scheduled"* is honored by convention rather than construction;
a genuinely separate project is stronger and costs more, and is deferred to **DP**.

**AR-13 — no credential literal, anywhere.** Not in any compose fragment, Dockerfile, or
`.env.compose`. **`.env.compose` is generated and not gitignored** (verified), so anything
written there is committable: it stays **derived and secret-free**.
**`HATCHET_CLIENT_TOKEN` is never committed** and is minted at operator-up under AR-8's
ordering and V-10's gate.

**AR-21a — the operator secret file lives outside the repository, so no `.gitignore` edit
exists.** Round 1 permitted "an additive `.gitignore` line" for a path that appeared in no
class — H2-05 is right that this authorized a write the contract did not grant. **Ruled:**
the operator secret file is

```
${HOME}/.debateai/docker-hatchet/operator.env      mode 0600, owner = the operator
```

— **outside the workspace**, therefore outside every build context, outside `git` entirely,
and outside this mission's file contract. Compose reaches it by an absolute-path `env_file:`
(read by the CLI at config time, never copied into a layer). Consequences: **no
`.gitignore` is edited by this mission**, no ignored-path convention has to be chosen, and
`.dockerignore` needs no rule for it because it was never inside the context.
*Reading rejected:* an in-repo `deploy/secrets/…` guarded by a new ignore rule — it puts a
secret one mistaken `git add -f` away from history and requires a write to a file (root
`.gitignore`) that this mission does not hold.

**Do not change `POSTGRES_PASSWORD: debateai-dev-only`** in the base file — cited by live
security research; changing it is a collision, not a hardening win (`[O]` R-C5.8 / `[G]` D2).

### 3.6 The value, secret and image matrix (H2-06)

Round 1 gave sources but left the paths, ports and compositions to a later seat. H2-06 is
right that a matrix a coding seat must complete is not a contract. **Carrier** is how the
value reaches the container; **Owner** is who may decide it.

| Carrier | Exact meaning |
|---|---|
| `EMIT` | emitted by `pnpm compose:env` into `.env.compose` (repo, **derived and secret-free**) and interpolated by the fragments |
| `OPS` | read from `${HOME}/.debateai/docker-hatchet/operator.env` (mode 0600, **outside the repository** — AR-21a) via an absolute-path `env_file:` |
| `MOUNT` | a named volume or host bind, with the exact container target given below |
| `DERIVED` | computed from another artifact by a named producer |

**Ports and hosts, chosen here.** None is an invention: each is either an existing in-tree
convention or the vendor's own default, and none is verdict-bearing under §5.4c's test.

| Variable | Value | Why this value, not a chosen number |
|---|---|---|
| `API_HOST` | `0.0.0.0` | SR-D3.6 — a container-reachable interface |
| `API_PORT` | `8790` | **already the tree's convention**: `web/.env.local` sets `DIALECTICAL_API_BASE=http://127.0.0.1:8790`. Also avoids `vllm`'s published `8000`, which `web/lib/serverApi.ts:6` would otherwise collide with |
| `WEB_PORT` | `3000` | hardcoded by both `web` and `apps/ui` (`next start -p 3000`) |
| `POSTGRES_PORT` | `5432` | the image default; **internal only, never published** |
| `HATCHET_ENGINE_GRPC_PORT` | `7077` | the vendor default already in `compose.dev.yaml:20`; **internal only** |
| `HATCHET_ENGINE_HTTP_PORT` | `8888` | the vendor default already in `compose.dev.yaml:19`; **internal only** |

**Published ports: exactly one**, chosen by AR-19 from V-9's answer. Everything else is
reachable only on the project network, which is what makes MB-10's anti-masquerade check
meaningful rather than nominal.

**The exact composition of every derived URL.** Non-secret parts come from `EMIT`; the
password comes from `OPS`; **the composition happens in the compose fragment**, so no
assembled URL containing a password is ever written to `.env.compose`:

```
DATABASE_URL                  = postgresql://${POSTGRES_APP_USER}:${POSTGRES_APP_PASSWORD}@${POSTGRES_SERVICE}:${POSTGRES_PORT}/${POSTGRES_APP_DB}?sslmode=disable
REPLAY_SELF_TEST_DATABASE_URL = postgresql://v3_replay_self_test:${V3_REPLAY_SELF_TEST_PASSWORD}@${POSTGRES_SERVICE}:${POSTGRES_PORT}/${POSTGRES_APP_DB}?sslmode=disable
LIVENESS_DATABASE_URL         = postgresql://v3_reaper:${V3_REAPER_PASSWORD}@${POSTGRES_SERVICE}:${POSTGRES_PORT}/${POSTGRES_APP_DB}?sslmode=disable
SETTLEMENT_DATABASE_URL       = postgresql://v3_settlement_watch:${V3_SETTLEMENT_WATCH_PASSWORD}@${POSTGRES_SERVICE}:${POSTGRES_PORT}/${POSTGRES_APP_DB}?sslmode=disable
HATCHET_HOST_PORT             = ${HATCHET_ENGINE_SERVICE}:${HATCHET_ENGINE_GRPC_PORT}
HATCHET_API_URL               = http://${HATCHET_ENGINE_SERVICE}:${HATCHET_ENGINE_HTTP_PORT}
VLLM_BASE_URL                 = http://${VLLM_SERVICE}:8000
DIALECTICAL_API_BASE          = http://${API_SERVICE}:${API_PORT}
```

#### 3.6a The data plane's own secrets — Postgres bootstrap and the dispatcher's database

Round 2 specified the app and job contracts and left the **data plane's** to D3, so a D3
seat would have had to invent the Postgres initialization secret and the dispatcher's
database configuration before the engine could start. H2-06 is right; both are fixed here.

**Postgres bootstrap.** The `postgres` image initializes its superuser from three variables
on **first boot only**; AR-17's idempotent one-shots then run as that principal:

| Variable | Value / source | Carrier | Consumer |
|---|---|---|---|
| `POSTGRES_USER` | `POSTGRES_APP_USER` — the bootstrap **and** application principal for the product database | `EMIT` | `postgres` |
| `POSTGRES_PASSWORD` | **`POSTGRES_APP_PASSWORD`** — the Postgres **bootstrap-admin credential**, and the fifth `OPS` entry. Round 2's §3.6 said only four `*_PASSWORD` values existed and identified none as the bootstrap admin | `OPS` | `postgres`, and the AR-17 one-shots |
| `POSTGRES_DB` | `POSTGRES_APP_DB` — the product database | `EMIT` | `postgres` |

**The dispatcher's database is a fifth principal, not the app's.** ADR-0017 clause 6 makes
the engine's database a **co-tenant**; giving it the application principal would put the
co-tenant boundary inside one credential. `deploy/sql/ensure-principals.sql` therefore also
creates **`v3_hatchet_engine`**, owner of `POSTGRES_HATCHET_DB` and holding **no grant on any
V3 schema** — which is what makes "no V3 query joins across the boundary" true at the
credential layer rather than by convention.

**The dispatcher service's exact environment.** Keys are the vendor's, on the engine service
only; values come from this plan's variables. `compose.dev.yaml:22-31` is the shape being
corrected, not inherited:

| Vendor key | Value | Note |
|---|---|---|
| `DATABASE_URL` | `postgresql://v3_hatchet_engine:${V3_HATCHET_ENGINE_PASSWORD}@${POSTGRES_SERVICE}:${POSTGRES_PORT}/${POSTGRES_HATCHET_DB}?sslmode=disable` | the sixth `OPS` entry is that password |
| `SERVER_MSGQUEUE_KIND` | `postgres` | RULED (ADR-0017 clause 1). AR-10 fails if unset, empty or different |
| `SERVER_GRPC_BIND_ADDRESS` | `0.0.0.0` | container-reachable |
| `SERVER_GRPC_PORT` | `${HATCHET_ENGINE_GRPC_PORT}` | |
| `SERVER_GRPC_INSECURE` | `true` | dev-only; **DP must not inherit it** (SR-D2.3) |
| `SERVER_GRPC_BROADCAST_ADDRESS` · `SERVER_INTERNAL_CLIENT_INTERNAL_GRPC_BROADCAST_ADDRESS` | `${HATCHET_ENGINE_SERVICE}:${HATCHET_ENGINE_GRPC_PORT}` | §2.4's fix — **never `localhost`** |
| `SERVER_URL` | `http://${HATCHET_ENGINE_SERVICE}:${HATCHET_ENGINE_HTTP_PORT}` | **and this is the matrix entry U-6a was missing.** It is set to the compose-DNS address by default because that is what an in-network client must reach. **If D2a §E's vendor reading shows the issued token binds to `SERVER_URL` in a way that requires the operator-facing dashboard URL instead, that is recorded in `deploy/VENDOR-SURFACES.md` and the value follows the vendor** — the choice is made by evidence at D2a, not left open inside D3 |
| `SERVER_AUTH_COOKIE_DOMAIN` · `SERVER_AUTH_COOKIE_INSECURE` | dev-only values for the dashboard | dashboard-only; **no numeral, and DP must not inherit** |

**No numeral appears in this service's environment** beyond the emitted port variables —
AR-20's guard, checked by AR-10.

**The `OPS` file therefore holds exactly six entries**, and they are the only secrets in the
mission: `POSTGRES_APP_PASSWORD`, `V3_HATCHET_ENGINE_PASSWORD`,
`V3_REPLAY_SELF_TEST_PASSWORD`, `V3_REAPER_PASSWORD`, `V3_SETTLEMENT_WATCH_PASSWORD`,
`HATCHET_CLIENT_TOKEN`. The replay ceremony's credential is **not** among them — it is
supplied at argv (AR-4). All six are generated at operator-up; **none is ever committed, and
none appears in `.env.compose`.**

The six `OPS` entries above are the **only** ones.
`AR-3` still holds: each scheduler one-shot receives **only its own** URL, so the three job
URLs are composed in three separate service stanzas and never in a shared `env_file`.

**The exact crypto mounts.** Sources are host paths the operator provisions; targets are
fixed by `packages/crypto/SECRET_STORE_LAYOUT.md` (readonly) rather than chosen:

| Key | Host source | Container target | Mode | Consumers |
|---|---|---|---|---|
| `USER_DEK_STORE_PATH` | **named volume** `user-dek-store` (survives `down` — SR-D3.1, MB-6) | `/srv/secrets/user-dek-store` | `0700` dirs, `0600` `dek.v1.json`, per the layout doc | `api` |
| `KEK_PATH` | `${HOME}/.debateai/docker-hatchet/kek.bin` | `/srv/secrets/kek.bin` | `0600`, read-only mount | **`api` and `runner`** — `apps/runner/src/main.ts:13` calls `loadKek` |
| `BLIND_INDEX_KEY_PATH` | `${HOME}/.debateai/docker-hatchet/blind-index.key` | `/srv/secrets/blind-index.key` | `0600`, read-only | `api` |
| `AUDIT_KEY_STORE_PATH` | `${HOME}/.debateai/docker-hatchet/audit-key-store` | `/srv/secrets/audit-key-store` | `0700`, read-only | `api` |
| `AUDIT_SOURCE_IP_SALT_PATH` | `${HOME}/.debateai/docker-hatchet/audit-source-ip.salt` | `/srv/secrets/audit-source-ip.salt` | `0600`, read-only — a 32-byte secret per the layout doc | `api` |

**The container adapts to the documented layout; the modes are not relaxed** (SR-D3.1). This
mission writes nothing under `packages/crypto`.

The remaining rows are the value inventory. **Carrier** and **Owner** as above.

| Family | Keys | Source of record | Owner | Secret | Carrier | Consumed by |
|---|---|---|---|---|---|---|
| Project identity | `COMPOSE_PROJECT_NAME` | this plan (§1.3) — an operator identifier, not a register row | architecture | no | `EMIT` | every command |
| Image identities | `POSTGRES_MAJOR_VERSION`; dispatcher digest; `vllmImageDigest`; **app/web base-image digest** | `register.bootstrap.json` + `deploy/IMAGE-PINS.md` | V (**V-5**, **V-12**) | no | `EMIT` | fragments, Dockerfiles |
| Service addresses | `API_HOST`, `API_PORT`, `WEB_PORT`, `POSTGRES_SERVICE`, `POSTGRES_PORT`, `POSTGRES_APP_DB`, `POSTGRES_HATCHET_DB`, `POSTGRES_APP_USER`, `HATCHET_ENGINE_SERVICE`, `HATCHET_ENGINE_GRPC_PORT`, `HATCHET_ENGINE_HTTP_PORT`, `API_SERVICE`, `VLLM_SERVICE` | **values fixed in the "Ports and hosts" table above**; service keys follow V-3 | architecture (operational under AR-14's test) | no | `EMIT` | all fragments |
| Derived addresses | `DATABASE_URL`, the three job URLs, `HATCHET_HOST_PORT`, `HATCHET_API_URL`, `VLLM_BASE_URL`, `DIALECTICAL_API_BASE` | **the literal compositions given above** — never a literal address, never `localhost` between services, never a published port | architecture | the four DB URLs embed a password → composed **in the fragment**, never written to `.env.compose` | `EMIT` (non-secret parts) + `OPS` (passwords) | `api`, `runner`, `web`, the three jobs |
| Hatchet identity | `HATCHET_TENANT_ID`, `HATCHET_WORKFLOW_NAME`, `HATCHET_WORKER_NAME`, `HATCHET_TLS_STRATEGY`, `HATCHET_ENGINE_RETRIES` | `HATCHET_WORKFLOW_NAME` / `HATCHET_WORKER_NAME` / `HATCHET_ENGINE_RETRIES` are **register values** (V-13); tenant id is minted by the engine at D3; TLS strategy is `"none"` in dev per §2.4 | V (**V-13**) / engine | no | `EMIT` | `api`, `runner` |
| Hatchet secret | `HATCHET_CLIENT_TOKEN` | minted by the engine **after** addresses are final (AR-8) | operator, gated **V-10** | **yes** | `OPS` | `api`, `runner` |
| Crypto material | `KEK_PATH`, `BLIND_INDEX_KEY_PATH`, `AUDIT_KEY_STORE_PATH`, `AUDIT_SOURCE_IP_SALT_PATH`, `USER_DEK_STORE_PATH` | `packages/crypto/SECRET_STORE_LAYOUT.md` (read-only) | operator | **yes** | `MOUNT` — **exact sources and targets in the crypto-mount table above** | **`api`; `KEK_PATH` also `runner`** |
| Job credentials | `REPLAY_SELF_TEST_DATABASE_URL`, `LIVENESS_DATABASE_URL`, `SETTLEMENT_DATABASE_URL` | `deploy/sql/ensure-principals.sql` roles `v3_replay_self_test` / `v3_reaper` / `v3_settlement_watch`; passwords generated at operator-up into `OPS` | operator | **yes** | `OPS`, composed **in three separate stanzas**, one per injection context (AR-3) | the three one-shots |
| Replay credential | — | `v3_replay_ceremony` | operator | **yes** | **argv at invocation only** (AR-4) | `replay-ceremony` |
| Mail / URL | `MAIL_SENDMAIL_PATH`, `MAIL_FROM`, `PUBLIC_APP_URL` | register values | V (**V-13**) | no | `EMIT` | `api` |
| Runner register values | `RUNNER_WORKER_ID`, `CLAIM_MS`, `CLAIM_MARGIN_MS`, the nine bound keys, `MAX_RECOMPOSE`, `FACT_BUNDLE_VERSION`, `PROVIDER_REF`, `JUDGEMENT_NUMBER_KIND`, `JUDGEMENT_PRODUCER`, `PROPAGATION_NUMBER_KIND`, `PROPAGATION_PRODUCER`, `VLLM_MODEL`, `VLLM_MAKER` | **no producer exists in the tree** — verified §0.3 | V at DR-023 (**V-13**) | no | `EMIT` | `runner` |
| API register values | `STRANGER_SAMPLE_RATE`, `REGISTER_VERSION`, `BATTERY_VERSION`, `SETTLEMENT_WATCH_HANDLE` | same | V (**V-13**) | no | `EMIT` | `api` |
| Contract hashes | `JUDGE_CONTRACT_HASH`, `COMPOSER_CONTRACT_HASH`, `CONFORMANCE_CONTRACT_HASH`, `PROPAGATION_CONTRACT_HASH`, `SERVE_CONTRACT_HASH` | **`DERIVED`** — hashes over contract artifacts. The producer must be located (`pnpm generate:contract` is the candidate) — **U-12**; if none exists, they fall to V-13 | derived, else V | no | `EMIT` | `runner` |
| Health timing | `interval`, `timeout`, `retries`, `start_period` | **AR-14** — operational, recorded in `deploy/DISCLOSURE.md` | architecture | no | fragment literals, recorded | all healthchecks |
| Optional | `NODE_ENV`, `EVALUATOR_DEV_MENU_ENABLED`, `EVALUATOR_DEV_MENU_DATABASE_URL`, `VLLM_AUTHORIZATION` | omitted or `"false"`; the dev-menu guards are not relaxed | architecture | n/a | omitted | `api`, `runner` |

**The blocking consequence, stated plainly.** Everything in the two "register values" rows
and possibly the contract hashes is **unratified and has no producer**. A container cannot
boot without them, because the loader is `.strict()`. **Therefore `api` and `runner` cannot
reach a healthy state until V-13 supplies them, and D4 is blocked on V-13.** A typed loud
failure is the correct behaviour for an unratified read (`07-build-order.md` §2 rule (iv)),
but **a slice that requires the value cannot be declared runnable until the value exists**
(H2-06's words, and correct). No seat invents one.

---

## 4. Slice and lane order for the PROGRAMMING loop

### 4.1 The authoritative gate matrix (H2-04)

**Slice descriptions derive from this matrix.** A slice may not be claimed while any cell in
its row is open. IMPORTANT OPERATIONS are V's by intake.

| Slice | Required V decisions | Required values | IMPORTANT OPERATIONS | Predecessor artifacts | Stop marker |
|---|---|---|---|---|---|
| **D0a** static preflight | **V-1**, **V-4** | none | **V-1** — Docker CLI on `PATH` + daemon start | Plan.md | the seven preflight receipts, captured |
| **D0b** ownership probe | V-1, V-4, **V-16(c)** | none | **V-16(c)** — creates and removes a **disposable Compose project** for the probe's negative-case fixture | D0a | `probe-ownership.sh` + a clean probe + `path-manifest/D0b-baseline.md` |
| **D1** emission | V-1, V-4; **V-5** and **V-12** iff a register row is minted | those V-5/V-12 mint | none | D0b | `.env.compose` regenerated, `path-manifest/D1.md` |
| **D2** images | V-1, V-4, **V-12** (base digest) | base-image digest | none | D1 | two image IDs recorded |
| **D2a** vendor-surface discovery | V-1, V-4 | none | none — **documentation only, no image, no container, no runtime** | **Plan.md only** | `deploy/VENDOR-SURFACES.md` with §W/§E/§C/§R each an exact command **or** `ABSENT` |
| **D3** data plane | V-1, V-4, **V-3** (service key), **V-10** (token), **V-14** (privileged DB) | image identities; addresses; **the Postgres bootstrap and dispatcher-database contract (§3.6a)** | **V-14** — `CREATE DATABASE`, `CREATE ROLE`, `GRANT` on the mission store · **V-10** — minting `HATCHET_CLIENT_TOKEN` | D2, **D2a §E** | AR-10 GREEN + principals verified + engine healthy + `deploy/evidence/D3.md` |
| **D4** dispatch pair | V-1, V-4, **V-13** (runtime values), **V-15(a)** (acceptance-ask product data), **V-16(a)/(b)** (destructive injection) | the full `api`/`runner` value set | **V-15(a)** — the AR-18 ask writes **retained** real product rows · **V-16(a)** — `kill`/`start` of the mission's `runner` for L-3 · **V-16(b)** — forced redelivery for L-3/L-4/L-6 | D3, **D2a §W/§C/§R** | O-1∧O-2∧O-3 + L-1…L-7 with numeric counts in **`deploy/evidence/D4.md`** |
| **D5** web | V-1, V-4, **V-7(a)**, **V-9**; **under V-9(b) also the accepted `AC60-ROUTE-CONTRACT` artifact** (AR-22) | `WEB_PORT`, `DIALECTICAL_API_BASE` | none | D4; **AR-22's artifact if V-9(b)** | one resolved ingress + bypass negative check in **`deploy/evidence/D5.md`** |
| **D6** jobs | V-1, V-4, **V-7(b)**, **V-11**, **V-14**, **V-15(b)** (scheduler job writes) | job role passwords (`OPS`) | **V-15(b)** — the invoked jobs may append to `serve`'s eviction streams, `scorecard`/`ledger`, and `core.work_item` (§3.5's grants exist precisely so they can). V-14 authorizes **creating** the principals; it does not authorize what they then write | D3 (not D4) | completion + negative permission receipts in **`deploy/evidence/D6.md`** |
| **D7** lifecycle | V-1, V-4, **V-8** (MB-11 wording), V-11, **V-16(a)** (MB-5 restart, MB-6 `down`/`up`) | none new | **V-16(a)** — MB-5's single-service restart and MB-6's `down`/`up` are lifecycle mutations of the mission's own project | D5, D6 | `deploy/ACCEPTANCE.md` + `deploy/DISCLOSURE.md`, **assembled from `deploy/evidence/*.md`** |
| **DV** vLLM | V-1, V-4, **V-8**, **V-13** (`VLLM_MODEL`) | `VLLM_MODEL`, `VLLM_MAKER` | pulling a multi-GB image | D3 | U-1 closed either way |
| **DP** production-target | **V-2(b)/(c)** | production pins, origins | none — **static config only, never applied** | D7 | `deploy/compose/prod/00-prod.yaml` + `deploy/PRODUCTION-TARGET.md` |

**Authorization is not a value decision.** H2-04's sharpest point: round 1 cited **V-13**
against D4's product-data writes, but V-13 ratifies *what the values are*, not *permission to
mutate*. **V-14, V-15 and V-16 are authorizations**, each with a stated scope, and each is a
hard entry criterion of the slice that performs the mutation.

**Reading the matrix:** **V-1** and **V-4** gate *every* slice — V-1 because nothing
executes without a daemon, **V-4 because DR-121 and DR-121-r are both still ACTIVE rows
saying "do not install anything from the Docker family"**, and running Docker against an
ACTIVE contrary ruling is exactly what H2-04 caught round 0 omitting.

### 4.2 Slice entries

```
D0a ─► D0b ─► D1 ─► D2 ─► D2a ─► D3 ─┬─► D4 ─► D5 ─┐
                                      ├─► D6 ──────┴─► D7 ─► [DP, if V-2(b)/(c)]
                                      └─► DV (non-required, gated on V-8 + V-13)
```

**The graph is acyclic, and D2a's position is what makes it so.** D2a produces the
dispatcher's readiness command; **D3 consumes it to become healthy**; D4 consumes the
worker-registration, correlation and redelivery surfaces. Round 2 placed D2a after D3 and
created a cycle — H2-03's reproduced blocker. D2a needs **no runtime**, so nothing is lost
by running it early and the cycle disappears. D6 depends on D3 only.

#### D0a — Static preflight · **FIRST CODING TICKET**

- **Delivers end to end:** an honest answer to *"can this machine run any of this?"*, as
  receipts. **Zero runtime mutation.**
- **Entry:** per §4.1.
- **Gates it must show firing:** the seven preflight receipts — `docker` on `PATH` (or one
  absolute path used reproducibly by **every** operator command and automation); `docker
  version` printing **both** Client and Server blocks; `docker compose version` showing the
  **v2 plugin**; `docker info` recording daemon status, host architecture, storage driver,
  available memory/disk; the **named context**; a non-mutating pull/build feasibility check
  per required platform; the **claimed** files used, not a vendor sample.
- **Done when:** the seven receipts exist and are captured. **D0a writes no manifest file** —
  the hash baseline is `path-manifest/D0b-baseline.md`, and D0b is its sole writer (§3.2).
- **Boundary — the H2-02 fix:** every done-criterion is satisfiable **without building,
  starting, stopping or mutating a container, image, network, volume, database or
  uncontracted file.** `docker version` / `info` / `compose version` query the daemon; they
  create nothing.
- **Value-pending:** none. Mints no value, writes no application file.

#### D0b — Ownership probe

- **Delivers end to end:** `deploy/compose/probe-ownership.sh` plus its first clean run.
- **Entry:** V-1, V-4, and **V-16(c)** — the negative-case fixture creates and removes a
  disposable Compose project, which is a lifecycle mutation and therefore needs
  authorization, not merely care. Round 1 marked this slice "IMPORTANT OPERATIONS: none";
  H2-04 is right that it is not none.
- **Gates:** AR-2a's six clauses; **U-9 closed** (`docker compose ls -a`, `docker ps -a
  --filter label=com.docker.compose.project`, `docker volume ls`) — read-only enumeration.
- **Done when:** the probe refuses correctly against the synthetic fixture and the live
  probe is clean; `path-manifest/D0b-baseline.md` is written.
- **Boundary:** the probe itself mutates nothing. Its fixture lives in a project named
  `docker-hatchet-probe`, is **never** a real foreign object, and is torn down by the same
  ticket with `down` (never `-v`).

#### D1 — Register-sourced emission

- **Delivers:** `pnpm compose:env` emits every constant §3.6 marks `EMIT`.
- **Gates:** SR-A4.2 (identities interpolated, never literal); SR-C2.2
  (`HATCHET_WORKFLOW_NAME` emitted **once**); AC-74's rule that a container environment
  variable is still a constant; AR-1's bound.
- **Done when:** `deploy/IMAGE-PINS.md` carries additive rows; the emitted file is derived
  and secret-free; `.env.compose`'s new hash is recorded (its **GENERATED OUTPUT** class).
- **Value-pending:** every §3.6 row owned by V ships as a carrier with a typed loud failure
  and **no invented value** (AC-74/AC-76, `07-build-order.md` §2 rule (iv)).

#### D2 — Images

- **Delivers:** two built images; nothing wired to them.
- **Gates:** SR-D3.2 (the runner's relative `packages/crypto` import resolves — the check a
  per-app context fails); the §3.4 `.dockerignore` exclusions **including `web/.env.local`**;
  MB-8's immutable ids recorded; base images pinned by digest (**V-12**).
- **Done when:** ids recorded; no host `node_modules`, no `.next`, no secret in any layer.

#### D2a — Vendor-surface discovery · **documentation-only; hard predecessor of D3 and D4**

- **Delivers:** `deploy/VENDOR-SURFACES.md` — the four surfaces this plan refuses to invent.
- **Entry:** V-1, V-4, and **nothing else**. This slice reads the **vendor's published
  documentation for the pinned image version**; it needs no image, no container, no running
  engine and no database. **No IMPORTANT OPERATION: it mutates nothing.**
- **Why it moved (H2-03).** Round 2 placed this slice *after* D3 while D3's own done-contract
  required the dispatcher healthcheck — whose command this slice produces. That is a cycle:
  D3 needed D2a's output before D2a was eligible, so a D3 seat would have had to invent a
  provisional readiness check or break the slice graph. **Discovery is documentation work,
  so it belongs before the runtime that consumes it.** Confirmation against a live engine
  is not a separate slice: D3 and D4 either find the documented command works, or they
  report a blocker under the ABSENT rule.
- **Gates — one section each, and each is exact-or-`ABSENT` (AR-21):**
  - **§W** the in-container query proving this worker is registered under
    `HATCHET_WORKER_NAME` for `HATCHET_WORKFLOW_NAME` → the `runner` healthcheck (U-8)
  - **§E** the engine's own readiness surface → the dispatcher healthcheck (U-11)
  - **§C** the engine-side artifact carrying `v3WorkItemId` → MB-9's O-2 (U-4)
  - **§R** the redelivery-forcing mechanism → L-3, L-4, L-6 (U-10)
- **Done when:** each section carries **either** an exact command, its expected output, and
  the vendor document (title + version + URL) it came from, **or** the literal `ABSENT`
  plus the search performed.
- **Why a slice.** Round 1 left these as UNVERIFIED rows hanging off D3/D4, so the seat that
  hit one had to invent a probe or stall — H2-03 and H2-09 both landed on that. Making the
  discovery a predecessor with an output path and an acceptance rule means an `ABSENT`
  answer produces a **named blocker on a known date**, not a surprise inside the
  load-bearing slice.

#### D3 — Data plane, principals, and the token

- **Delivers:** a healthy data plane, four provisioned principals with verified negative
  receipts, and a dispatcher advertising an address a containerized worker can dial.
- **Entry:** D2 and **D2a §E** — the dispatcher's readiness command must already exist (or be
  recorded `ABSENT`) **before** this slice is asked to make the engine healthy; **V-3**,
  **V-10**, and **V-14**. AR-17's scripts execute `CREATE DATABASE`,
  `CREATE ROLE` and `GRANT` — **privileged database writes**, which round 1 left
  unauthorized while authorizing only the token. They are the mission's own store, but
  "our own store" is not an authorization; **V-14** is.
- **Gates:** §2.7.1's checks for `postgres` (two probes) and the dispatcher; **AR-17**'s
  idempotent scripts succeeding on a fresh volume **and** on a re-run (the existing-volume
  path); `deploy/sql/verify-principals.sql` passing including every **negative**;
  **AR-10 + AR-20 GREEN** with the RED fixture demonstrated; §2.4's compose-DNS addresses;
  `deploy/checks/compose-invariants.mjs` GREEN.
- **Done when:** **AR-8's ordering is honored** — addresses final, *then* the token minted
  under **V-10**; **U-6** closed by reading the runner-facing connect target from the
  engine's own output; **U-6a** answered from the token-issuance output; **U-11** closed or
  reported as a blocker; **U-2 recorded as a fact** (AR-17 means nothing depends on it).
- **Value-pending:** V-3's service key — the only thing in this slice that varies with it.

#### D4 — The dispatch pair · **the load-bearing slice**

- **Delivers:** MB-9's triple **and** the D4-L law falsification set.
- **Entry:** D3, **D2a**; **V-13** (without the runtime value set the strict loaders throw
  and neither container can become healthy), **V-15(a)** (the asks write retained product
  rows, bound to the fixture's hash), **V-16(a)/(b)** (L-3's `kill`/`start`, L-3/L-4/L-6's
  forced redelivery).
- **AR-18 (re-cut) — the lawful dispatch trigger, as an artifact rather than a predicate.**
  Round 1 said "a body conforming to `AskRequestSchema`" and "any non-empty
  `x-user-dev-token`". H2-07 is right that a schema and a predicate still make the tester
  invent the data. The exact contract:

  | | |
  |---|---|
  | **Request** | `POST http://${API_SERVICE}:${API_PORT}/v1/asks` from **inside the project network** |
  | **Identity** | header `x-user-dev-token: acceptance:dispatch-probe` — a **fixed, recorded, non-secret marker**. `resolveSession` (`apps/api/src/index.ts:130-140`) derives `asker:<sha256(token)>` / `session:<sha256(token)>` from it, so **the asker id is deterministic and reproducible** and no identifier is invented |
  | **Body** | `deploy/fixtures/acceptance-ask.json` — a **committed fixture** (§3.1, writer D4) supplying all thirteen `.strict()` fields of `AskRequestSchema` (`packages/contract/src/index.ts:107-122`): `question_line`, `risk_tier`, `tier_source`, `tier_provenance_ref`, `composition_budget_tier`, `depth_params`, `decision_owner`, `action_owner`, `decision_scope`, `caller_scope`, `as_of`, `steering_presets`, `steering_annotations` |
  | **Field values** | **the literal body below.** Round 2 gave the path and the schema and called the values "fixture data", which still left D4 — the file's own writer — to invent them. H2-07 is right: a path plus a schema is not an input |

  **`deploy/fixtures/acceptance-ask.json`, in full.** Every enum literal is taken from
  `packages/contract/src/index.ts:4-7` (`RiskTierSchema`, `AskTierSourceSchema`,
  `CompositionBudgetTierSchema`), not chosen freely; `depth_params.depth` is the key
  `apps/api/src/main.ts` reads via `Number(input.depthParams.depth)`:

  ```json
  {
    "question_line": "Does containerizing this deployment change any served number?",
    "risk_tier": "casual",
    "tier_source": "MACHINE_DEFAULT",
    "tier_provenance_ref": "acceptance:dispatch-probe",
    "composition_budget_tier": "low",
    "depth_params": { "depth": 1 },
    "decision_owner": "acceptance:dispatch-probe",
    "action_owner": "acceptance:dispatch-probe",
    "decision_scope": "acceptance:dispatch-probe",
    "caller_scope": "ASKER",
    "as_of": "<stamped at invocation, ISO-8601 UTC, recorded in the receipt>",
    "steering_presets": [],
    "steering_annotations": []
  }
  ```

  **`as_of` is the only field not fixed here**, because it must be an
  `z.iso.datetime()` at the moment of the call; it is stamped at invocation and recorded.
  Every other value is a literal in this plan. **`risk_tier: "casual"` and
  `composition_budget_tier: "low"` are chosen deliberately** — the smallest lawful envelope,
  so the acceptance ask exercises the dispatch path with the least product-data footprint. |
  | **V-15(a) binds to this content** | the fixture is **hash-bound**: D4 records the file's SHA-256 in `deploy/evidence/D4.md`, and **V-15(a)'s scope is that hash**. A different body is a different authorization |
  | **Retention** | rows are **real and retained** — the ledger is append-only and DR-188 forbids deletion. The receipt records `run_id`, `work_item_id` and the derived `asker_id` so the run is **re-findable rather than cleaned up** |
  | **Scope** | the mission's own `docker-hatchet_postgres-data` volume only. **Never** a production or foreign store |

  Verified lawful: `auth: "user"` is satisfied by any non-empty dev token, and
  `resolveSession` reads **no identity table and touches no frozen code path**, so no
  registration flow is exercised and no freeze collision arises. **No fake product data. No
  direct SQL masquerading as the API path. No `acceptance/main.ts`** (SR-C2.3).
- **Gates:** O-1, O-2, O-3 (§2.6.1); **L-1…L-7** (§2.6.2) with expected call/ledger counts;
  §2.7.1's `api` and `runner` checks; SR-C2.1 (a deliberately missing key makes the
  container exit non-zero and the check never green); AR-6's byte-identity assertion
  **without printing the token**; AR-7 (no automatic restart policy).
- **Done when:** the triple holds **together**, every L-case has a recorded verdict, **U-4**
  is closed from vendor documentation against the running engine, and **U-8** / **U-10** are
  closed or reported as blockers.

#### D5 — `web`

- **Entry:** D4; **V-7(a)** and **V-9**. **D5 does not run while V-9 is open** — AR-19.
- **AR-19 — one resolved ingress model, chosen by V-9, never both.** Round 0 published
  `api` *alongside* `web` and called it "no new origin"; H2-08 is right that two published
  origins plus a browser proxy is not evidence of one origin, and that this plan may not
  decide the dispute.
  - **Under V-9(a)** (the route is lawful same-origin SSR forwarding under AC-57): the
    **sole externally reachable origin is `web`**; `api` publishes **no** host port and is
    reachable only on the project network. Browser and SSR both traverse `web`.
    **Negative check:** the resolved model exposes exactly one host port for the claim, and
    an attempt to reach `api` from the host fails.
  - **Under V-9(b)** (the route is AC-60's forbidden second path): the **sole origin is
    `api`**; `web` serves assets/SSR only. **AR-22 — V-9(b) has a named producer, and D5
    depends on its accepted completion.** Round 1 said route removal "is routed through a
    separate authorized file contract" without naming one, so V-9(b) could be selected while
    the conflicting route still existed — H2-08's exact point. Ruled:
    - **Ticket:** `AC60-ROUTE-CONTRACT`. **Routed by** the orchestrator (Grok-4.6
      Grok-Router, per intake) — routing only, **no content work**, which is what round 2 got
      wrong by naming the router as the owner.
    - **Implementation owner:** the **PROGRAMMING seat named in the intake roster**
      (`codex@gpt-5.6-sol`), under its **own goal packet** at
      `docs/missions/2026-08-21-docker-hatchet/goal-packets/ac60-route-contract.md`. It is a
      seat, not a role that cannot write.
    - **Its file contract:** exactly `web/app/api/[...path]/route.ts` and `web/lib/api.ts`.
      Both are needed together — `web/lib/api.ts:3-11` **requires** a same-origin path, so
      removing the route without changing that file leaves the browser with no client at all.
    - **Durable completion artifact:** `docs/missions/2026-08-21-docker-hatchet/reviews/ac60-route-contract.md`,
      carrying the ticket id, the two file hashes after the change, and the line
      `AC60 ROUTE CONTRACT ACCEPTED`.
    - **D5's entry criterion under V-9(b):** that artifact **exists and carries the acceptance
      line**. D5 reads it; it does not infer completion. Until then **D5 is BLOCKED** — it
      does not start, and it does not fall back to V-9(a)'s model as a workaround.
    - **If V-9(b) is chosen and that ticket is not authorized**, then **`web` is out of scope
      for this mission**: D5 is not built, D7's bar is recorded without a `web` row, and the
      interface becomes a **named successor mission**. That is the honest exit, and it is
      stated so V's answer never leaves the plan without a defined next step.
    - **This mission still does not remove the route.**
  - Note for V: (a) makes `web` the contract origin, which reads against ADR-0018 clause 1's
    *"one origin address for the contract, and it is `apps/api`"*; (b) matches the ADR but
    requires a change this mission may not make. **That tension is why V-9 is V's**, and it
    is not resolved here.
- **Gates:** SR-D3.4 (`DIALECTICAL_API_BASE` explicit, never the `127.0.0.1:8000` default,
  never `host.docker.internal`); SR-D3.5 (**exactly one** of `web`/`apps/ui` containerized,
  the other not started by the same invocation — both hardcode `-p 3000`, so a wrong pick is
  invisible until both run); `NEXT_PUBLIC_API_BASE` a same-origin path or unset; §2.7.1's
  `web` check; AR-19's negative bypass check.
- **Done when:** the model exposes exactly the approved origin and the receipt shows browser
  **and** SSR traffic using it with no direct or privileged bypass.

#### D6 — Jobs: scheduler one-shots and the replay ceremony

- **Entry:** **D3** (not D4 — the jobs need the data plane, not the dispatch pair; this also
  removes the round-0 D5∥D6 parallel-writer overlap); **V-7(b)**, **V-11**, and **V-15(b)**.
  The three invoked jobs hold grants that let them **write product data** — eviction streams,
  `scorecard`/`ledger` appends, `core.work_item` — and V-14 authorized only *creating* those
  principals, not what they write. Round 2 recorded this slice's important operations as
  "none beyond V-14's D3 scope"; that was H2-04's residual.
- **Delivers:** four one-shot service definitions, each with one credential; the completion
  receipts; the negative permission receipts.
- **Gates:** §2.7.2's completion contract for each; AR-3's injection distinctness proved
  from the **rendered model without printing values**; `verify-principals.sql`'s negatives;
  AR-4's exact `run --rm replay-ceremony <url> <attestation>` invocation.
- **Done when:** the reaper's **credential is provisioned** and the reaper **is not
  invoked**; and **`deploy/evidence/D6.md`** — which D6 owns (AR-23) — records the completion
  receipts, the negative permission receipts, and the disclosure text stating that AC-89's
  write half does not fire and that the scheduler is outside the healthy-`up` bar (MB-11
  item 6). **D7 assembles that text into `deploy/DISCLOSURE.md`; D6 never writes it.**
- **Note:** under `[C]`'s reading (V-7(b)) the scheduler cannot be accepted until all three
  ruled jobs have runnable published entry points — and **nothing this mission may lawfully
  do clears that**, because `runReaper`'s implementation belongs to a later slice.

#### D7 — Lifecycle, anti-masquerade, acceptance record

- **Entry:** D5 and D6.
- **Gates:** **MB-1** one documented command (`deploy/compose/up.sh`) after a documented
  preflight, with **no host `pnpm`/`tsx`/`next` process required by any required service**
  — and the command is new, because `Makefile` is tracked-and-deleted; **MB-2** declared
  inventory with the lite substitute **called out as a substitute**; **MB-4** attributable
  per-service logs with **no credential values**; **MB-5** restart `api`, then `runner`,
  each returning healthy while siblings are **not** restarted (compare `StartedAt`), the
  runner **re-registers**, a new dispatch completes, and **Hermes on 9119 keeps answering
  throughout**; **MB-6** `down` **without `-v`** then `up -d` preserves the Postgres data
  **and** the `USER_DEK_STORE_PATH` tree; **MB-7** one documented non-destructive stop
  (`down.sh`) that **deletes no volume**; **MB-8** every container maps to a recorded image
  identity; **MB-10** `docker compose top` shows each app process inside its service, no
  host process owns a claimed port, no required service bind-mounts host source or host
  `node_modules`, and services address each other by compose DNS only; **MB-11** §1.4
  written verbatim into `deploy/DISCLOSURE.md`.
- **Also:** AR-2a's probe output captured in the receipt; the operator-checklist assertion
  that **no non-project broker container runs on the host** (AR-10's scope limit).
- **Done when:** `deploy/ACCEPTANCE.md` and `deploy/DISCLOSURE.md` are complete, **assembled
  from the nine `deploy/evidence/*.md` files** (AR-23), and every MB row has a captured
  command output, not prose. **D7 merges and may not author a predecessor's numbers**: if an
  evidence fragment is missing or records UNPROVEN, D7 carries that through rather than
  filling it in.

#### DV — the vLLM lane (non-required, gated)

- **Entry:** V-1, V-4, **V-8**, **V-13** (`VLLM_MODEL`, `VLLM_MAKER`).
- **Gates:** `docker manifest inspect` on `vllm/vllm-openai@sha256:ffb2d59b…` — does it
  publish an `arm64` variant? does it run without a CUDA GPU on this `darwin/arm64` host? —
  then an attempted profiled `up`. `[C]`'s vendor citation stands: the official CUDA path
  requires the NVIDIA runtime and `--gpus all`, and experimental Apple-Silicon paths are
  **not** proof that *this pinned image* runs here.
- **Done when:** **U-1** closed either way and recorded. **No required service `depends_on`
  `vllm`, and the required-bar chain excludes `90-vllm.yaml`.**

#### DP — production-target static-config slice (F-5)

- **Entry:** **V-2(b) or V-2(c) only.** Under **V-2(a)** this slice is **not built** and
  becomes the named successor mission; under **V-2(d)** the whole plan is re-cut
  single-project (§1.3).
- **Delivers:** a **static, resolved-configuration proof** — explicitly **not** a live
  Hetzner/Cloudflare deployment, which stays a separately V-gated IMPORTANT OPERATION.
- **Gates:** the resolved production model shows ADR-0018's service names; **none** of the
  dev-only insecure settings is inherited (`SERVER_AUTH_COOKIE_INSECURE`,
  `SERVER_GRPC_INSECURE`, `localhost` cookie/broadcast addresses) — SR-D2.3; exact pins
  (MB-8); **one** Cloudflare-facing origin per AR-19's resolved answer; internal services
  unpublished; the four credentials separately injected; AR-10 GREEN on the production
  render.
- **Done when:** the proof is captured and `deploy/DISCLOSURE.md` states that a static
  config proof is **not** a deployment.
- **Why it exists:** F-5 is right that round 0 compiled `[O]`/`[G]`'s majority answer into
  the DAG while leaving V-2 nominally open. With DP defined, a (b)/(c) answer has a slice,
  files and done-criteria; an (a) answer simply does not build it.

**First coding ticket: D0a**, unclaimable until **V-1 and V-4** are both closed.

### 4.3 Slice → file writer matrix (H2-05)

Exactly one writer per path. Two slices share `package.json`, and their **hunks are
disjoint and named**.

| Path | Sole writer | Read-only to |
|---|---|---|
| `deploy/compose/probe-ownership.sh` | D0b | all later |
| the eleven `…/architecture/path-manifest/` files, **enumerated by exact path in §3.1** | **the slice each file is named for, and only that slice.** No slice ever writes another slice's file | all others |
| the nine `deploy/evidence/` files, **enumerated by exact path in §3.1** | **the slice each file is named for** (AR-23) | **D7 reads all of them** |
| `deploy/VENDOR-SURFACES.md` | D2a | all later |
| `deploy/fixtures/acceptance-ask.json` | D4 | all later |
| `deploy/compose/prod/00-prod.yaml`, `deploy/PRODUCTION-TARGET.md` | DP | — |
| `packages/register/src/compose-env.ts`, `deploy/IMAGE-PINS.md`, `register.bootstrap.json`, `deploy/env/compose-env-deploy.ts` | D1 | all later |
| `.env.compose` | D1's tool run; **regenerated, never hand-edited** | all later |
| `package.json` → the `compose:env`-adjacent script hunk | D1 | — |
| `package.json` → the `lint` hunk and the lifecycle-script hunk | D7 | — |
| `deploy/images/app.Dockerfile`, `deploy/images/web.Dockerfile`, `.dockerignore` | D2 | all later |
| `deploy/compose/00-data.yaml`, `deploy/sql/*.sql`, `deploy/checks/rabbitmq-guard.mjs`, `deploy/checks/fixtures/*`, `deploy/checks/compose-invariants.mjs` | D3 | all later |
| `deploy/compose/10-dispatch.yaml`, `deploy/checks/dispatcher-law-scan.mjs` | D4 | all later |
| `deploy/compose/20-web.yaml` | D5 | all later |
| `deploy/compose/30-jobs.yaml` | D6 | all later |
| `deploy/compose/90-vllm.yaml` | DV | all later |
| `deploy/compose/up.sh`, `deploy/compose/down.sh`, `deploy/DISCLOSURE.md`, `deploy/ACCEPTANCE.md` | D7 | — |

**D5 and D6 no longer overlap:** they write different fragments, and D6 depends on D3 rather
than D4, so the parallel edge H2-05 flagged is gone. **DV writes its own fragment**, which
is why the *"or a profile inside the above"* alternative is retired.

---

## 5. Architecture rulings — closed loudly, not silently

| # | Ruling | Where | Reading rejected |
|---|---|---|---|
| **AR-1** | `compose-env.ts` obtained by exact file name as MAY EXTEND; `pnpm compose:env` stays the single producer; `deploy/env/` emitter is the named exclusive fallback | §3.3 | `[G]`'s blanket `packages/**` readonly — leaves SR-A4.2 unsatisfiable except by the literal AC-74 forbids |
| **AR-2** ⟳ | **Mission-owned Compose project `docker-hatchet`**, own `postgres`, own volume; base file never chained, never on a command line | §1.3 | round 0's shared project name — it hands one project two alternating owners (F-2/F-6/H2-01) |
| **AR-2a** ⟳ | Foreign-runtime **ownership probe before every lifecycle command**; a foreign owner is `BLOCKED`, not a warning | §1.3, §2.8 | file hashes as runtime authorization |
| **AR-3** | Credential separation is an **exposure** property | §3.5 | `[G]`'s usage-property reading — satisfied as a consequence, not adopted as the rule |
| **AR-4** ⟳ | `replay-ceremony` is a **profiled one-shot service definition** invoked by `run --rm` with argv credentials | §3.5 | round 0's "not a service" — imprecise; `run` requires a service |
| **AR-5** | `vllm` behind a hardware-gated profile in **its own fragment**, excluded from the required chain; runner `VLLM_*` keys stay set and valid | §1.1 | stripping the keys when the profile is off — edits the strict contract and deletes fail-fast |
| **AR-6** | One emitted variable per Hatchet key; sharing **mandatory** there and **forbidden** for job credentials | §2.3 | one uniform sharing rule across both families |
| **AR-7** | No automatic `restart:` policy on any required service | §2.1 | "`unless-stopped` is just dev ergonomics" — an unregistered retry count that masks fail-fast |
| **AR-8** | Engine addresses final **first**, token minted **after**, gated V-10 | §2.4 | minting early and patching — an authenticated worker that cannot connect |
| **AR-9** | Runner health = O-1 in-container; dispatcher state, never run state; blocker if no lawful signal | §2.7.1 | `CMD true`, bare TCP, `depends_on` short form — named MB-3 falsifiers |
| **AR-10** | RabbitMQ guard + RED/GREEN fixtures at exact `deploy/checks/` paths | §2.5 | fixtures under `tests/**` or dirty `tools/**` |
| **AR-11** | `HATCHET_*` ↔ vendor `HATCHET_CLIENT_*` documented side by side | §2.4 | discovery via a `.strict()` failure naming a key they did set, differently spelled |
| **AR-12** | Content-hash baseline, re-checked per ticket, **every hashed path classified** | §3.2 | "check the diff" — blind to the collision surface that matters |
| **AR-13** | No credential literal anywhere; `.env.compose` derived and secret-free | §3.5 | a generated file being safe by virtue of being generated |
| **AR-14** ⟳ | Health-check timing values are **operational, not verdict-bearing**, and are **chosen in §2.7.1a**, not deferred | §2.7.1a | treating every numeral as a register row — it would make V ratify a health-check interval; and round 1's "record them later", which deferred a choice instead of making one |
| **AR-15** ✚ | **`scheduler` is a one-shot invocation unit, outside the MB-1/MB-3 required set**, with a completion contract; exception owned by V-11 | §1.1, §2.7.2 | keeping it "required" while realizing it as profiled one-shots (the F-1/H2-03 contradiction), and daemonizing it (scope expansion into `apps/**`) |
| **AR-16** ✚ | Compose model split into **per-slice fragments** combined by an ordered `-f` chain inside the mission project | §3.1 | one file authored by D3 and frozen — later slices would edit a frozen file or collapse into D3 |
| **AR-17** ✚ | Co-tenant DB **and** the four principals created by **idempotent always-run SQL one-shots**; `init-hatchet.sql` unused and untouched | §3.5 | relying on `docker-entrypoint-initdb.d` and documenting the first-boot caveat — leaves a failure whose only recovery is DR-188-forbidden |
| **AR-18** ⟳ | MB-9's trigger is a **real ask through the published front door** — **an exact committed fixture, an exact token literal, a deterministic asker id**, rows retained | §4.2 D4 | fake product data, direct SQL, the acceptance harness; and round 1's "a conforming body" — a schema is not a fixture |
| **AR-19** ✚ | **D5 gated on V-9**; exactly one resolved ingress model per answer, with a bypass negative check | §4.2 D5 | round 0's "publish `api` alongside `web`" — two origins is not evidence of one |
| **AR-20** ✚ | The dispatcher **container**'s own retry configuration is register-sourced or off; no numeral in its environment | §2.1, §2.5 | bounding only the worker SDK — a vendor-sample copy reintroduces a second authority |
| **AR-21** ✦ | **Vendor-surface discovery is a slice (D2a)** with an output path and an exact-or-`ABSENT` acceptance rule per surface; `ABSENT` ⇒ a named blocker, never a substituted check | §2.7.1, §4.2 | leaving U-8/U-11/U-4/U-10 as footnotes on D3/D4 — the seat that hits one must then invent a probe or stall |
| **AR-21a** ✦ | The operator secret file lives at `${HOME}/.debateai/docker-hatchet/operator.env`, **outside the repository**, so **no `.gitignore` edit exists** | §3.5 | an in-repo secrets directory guarded by a new ignore rule — one `git add -f` from history, and it needs a write this mission does not hold |
| **AR-22** ⟳ | **V-9(b) names an implementation owner** (the intake's PROGRAMMING seat, under its own goal packet), an exact two-file contract, and a **durable acceptance artifact D5 reads**; if that ticket is not authorized, `web` leaves this mission's scope | §4.2 D5 | "a separate authorized file contract" with no producer; and naming the **router** as owner — under the protocol it routes and does no content work |
| **AR-21b** ✧ | **D2a is documentation-only and runs before D3**, because the slice that discovers the dispatcher's readiness command cannot depend on the dispatcher already being healthy | §4.2 D2a | round 2's placement after D3 — a cycle that forced a D3 seat to invent a provisional check |
| **AR-23** ✧ | **Every slice writes its own `deploy/evidence/<slice>.md`; D7 reads and assembles** `ACCEPTANCE.md` and `DISCLOSURE.md` from them | §3.1, §4.3 | a predecessor writing into its successor's file — it made D4 and D6 depend on D7 to become complete |
| **AR-24** ✧ | The dispatcher gets its **own database principal `v3_hatchet_engine`** with no grant on any V3 schema | §3.6a | reusing the application principal — it puts ADR-0017's co-tenant boundary inside one credential |

⟳ re-cut · ✚ new in rework 1 · ✦ new in rework 2 · ✧ new in rework 3

---

## 6. V DECISIONS PACKET — draft

Sixteen rows. **No seat contacted V.** V-1…V-10 are carried forward from
`research/synthesized-requirements.md` §5 with their options, evidence and per-seat
recommendations unchanged; this document adds **what each blocks here** and **what is
invariant under either answer**. V-11…V-13 were raised by the round-1 review union;
**V-14…V-16 are authorizations** raised by H2-04/H2-07 in round 2. **None of the six new
rows is a product contest this seat declined to decide** — each is a value, a bounded
requirements change, or a permission to mutate that architecture is not entitled to grant
itself.

**On the three 2–1 product contests (V-2, V-3, V-5) this seat picks no winner.**

| # | Question (short) | What it blocks here | Invariant under either answer |
|---|---|---|---|
| **V-1** | Enable the Docker CLI / start Docker Desktop? | **Every slice.** D0a cannot be claimed; U-1…U-12 stay open. Under option (d) the honest word is **UNPROVEN**. | The whole contract (§1–§3) and the slice order (§4) are reviewable without it. `[O]`'s counter stands: the daemon changes this machine's memory and CPU profile while `accounts-phase1` is live on it. |
| **V-2** | Production Hetzner/Cloudflare slice in this mission? | Whether **DP** is built. Option **(d) serialize** additionally **retires AR-2** and lets the mission run single-project — which is also the fallback if AC-02 is read host-wide (§1.3). | The dev slice is **production-shaped** either way: same ADR-0018 names, same env contract, differing only in published ports, TLS, insecure flags, build-vs-pull, and secret sourcing. No local pass is **labelled** ADR-0018 compliance. `[O]`, against his own answer: deferring leaves the proxy / SSE-buffering / AC-60 clauses **unexercised** — *"exactly where the ADR predicts the incident."* |
| **V-3** | Dispatcher service key: `hatchet-engine` or `hatchet-lite`? | One service key in `00-data.yaml` and one `IMAGE-PINS.md` row. **Nothing else.** | SR-C3.1, SR-C3.2, SR-C3.3 hold either way, as does §1.4 item 4. `[G]` and `[C]` lean against the rename; `[O]` proposed it and wrote its own strongest counter. |
| **V-4** | Does V's 2026-08-21 prompt supersede DR-121 / DR-121-r, and how much? | **Every slice — newly, and this was the H2-04 hole.** DR-121 (*"for now we do not install anything from the Docker family"*) and DR-121-r are **both ACTIVE**. Running Docker at all runs against an ACTIVE contrary ruling until V says which clause is lifted. | The B5 invariants hold under **either** mechanism: no ambient probe decides the store; the Postgres major comes from the register loader on every path; test stores and the deployment store are **disjoint**; no test requires the stack; **Hatchet is never silently skipped**. Under option (a) this plan is already correct — `tests/**` is untouched and embedded-Postgres stays standing. |
| **V-5** | Digest-pin `postgres`, or is major `18` the pin? | One D1 emission, one `IMAGE-PINS.md` row, and whether `register.bootstrap.json` moves from MUST NOT TOUCH to MAY EXTEND (§3.2). | MB-8 holds either way. `[G]` and `[C]` prefer (b); `[O]` proposed (a) and volunteered that reading §5.4c as binding `postgres` is **his own extension**. |
| **V-6** | Is `apps/evaluator-worker` an ADR-0018 unit? | §7's first non-goal. All three seats recommend **exclude**: no `scripts`, no `main.ts`, no CLI — a library exporting `EVALUATOR_TASK_FAMILIES`. **You cannot containerize a library.** | `[O]`'s counter: `model-evaluator` is **live**; if it lands a worker process this mission will have containerized everything except the component that was actively growing. `[G]` rejects folding its families onto `apps/runner`. |
| **V-7** | (a) `apps/ui` vs `web`; (b) `job:reaper` vs `job:liveness-sweep` | **(a)** blocks D5. **(b)** blocks D6's acceptance: under `[C]`'s rule the scheduler cannot pass until all three ruled jobs are runnable, and **nothing this mission may lawfully do clears it**. | Either way exactly one web service is containerized, and §1.4 item 3's disclosure holds. `[G]` on (a): *"`apps/ui` is where the live debate canvas actually is; containerizing `web` could ship an empty/kept shell."* On (b): **"not a silent alias."** |
| **V-8** | Does "containerized" require a real model call? | MB-11 item 2's wording, DV's entry, and whether D7 may use *"full app containerized"*. | Requirements already closed the **disclosure** half. `[O]` against his own answer: *"a bar that never makes a model call proves the plumbing and not the product."* The hard constraint is **DR-179**: relays are not Hatchet workers and stay on the host, `vllm` is the only in-compose provider, so a fully containerized runner may have **no lawful in-network way to make a real call** — and a relay bridge is a DR-179 question, not an engineering choice. |
| **V-9** | Is `web`'s `/api/[...path]` the second path AC-60 forbids? | **D5 entirely** (AR-19). Sharpened by a live-tree fact no seat had: `web/lib/api.ts:3-11` forces a **same-origin path**, so the browser cannot be pointed at `api` directly — the proxy is the browser's path **by construction**. Note the tension for V: answer (a) makes `web` the contract origin, which reads against ADR-0018 clause 1's *"one origin address … and it is `apps/api`"*; answer (b) matches the ADR but needs a route change this mission may not make. | Containerization must not **deepen** it: no new route, no new origin, the proxy stays a pure forwarder making no tier (ADR-0013), disclosure (AC-56) or honesty-field (AC-54) decision. The condition **predates this mission**. |
| **V-10** | DR-179's scope over `HATCHET_CLIENT_TOKEN`; may the repo document vendor default local-dev UI credentials? | **D3's token-minting step** (§4.1) and AR-13's second half. | Agreed regardless: **no credential literal** anywhere; `.env.compose` is generated **and not gitignored**, so it stays derived and secret-free; operator secrets **outside the repository entirely** at AR-21a's exact path (the synthesis said "a gitignored file or a `secrets:` mount" — AR-21a takes the stronger option, which needs no ignore rule at all); rendered evidence proves distinctness **without printing values**; logs never print them. `[O]`'s point stands — a DR-179 secret-scan gate written without the model-key/engine-token distinction either false-positives on every Hatchet deployment or gets disabled, **both worse than naming the exception**. |
| **V-11** ✚ | **Does the mission bar's "every required service is healthy" quantifier admit one-shot units?** | **D6 and D7.** Raised by G3 F-1 and H2-03 jointly. `apps/scheduler/src/cli.ts` runs one command and exits, and `job:reaper` is not runnable at all, so the ADR-0018 `scheduler` row cannot be both "required" and "continuously healthy". **Options:** (a) one-shots are outside the quantifier and carry the §2.7.2 completion contract, disclosed at MB-11 item 6 — **AR-15's shape**; (b) the scheduler must become long-running services with contract-exercising checks, which means writing a supervisor into `apps/**` (scope expansion, SR-D3.6); (c) `scheduler` leaves this mission's topology entirely, with a named successor. | Under every answer: the three jobs hold **one credential each**, the negative permission receipts are required, and the reaper is not invoked. This is a **bounded requirements change**, not a product contest — recorded as V's because it modifies an inherited MB row. |
| **V-12** ✚ | **What base image do `app.Dockerfile` and `web.Dockerfile` build `FROM`, and is its digest a register row or a compose build input?** | **D2**, and D1 if it becomes a register row. MB-8 requires third-party images **by digest**; `nodeRuntimeVersion` (`v22.23.1`) is a ratified bootstrap row but names a runtime, not an image. §5.4c's test decides the class: a Node base build could plausibly move a produced artifact, which would convict it as `vllmImageDigest` was convicted — but that is a judgement §5.4c has not made. **Resolving a digest also mints a value (DR-104), which is V's.** | Either way: the identity used is recorded, no floating tag counts as a pin, and the digest is interpolated from an emitted variable rather than written as a Dockerfile literal. |
| **V-13** ✚ | **Ratify the runtime value set the containerized `api` and `runner` require — or name the successor that does.** | **D4 and DV, hard.** Verified in §0.3: **nothing in the tree supplies these values**; the only occurrences of `JUDGE_MAX_ATTEMPTS` / `CLAIM_MS` are the loader that declares them and the consumer that reads them, and the acceptance harness uses a disjoint `ACCEPTANCE_*` contract. Because the loader is `.strict()`, **`api` and `runner` cannot boot at all** without: `RUNNER_WORKER_ID`, `CLAIM_MS`, `CLAIM_MARGIN_MS`, the nine bound keys, `MAX_RECOMPOSE`, `FACT_BUNDLE_VERSION`, `PROVIDER_REF`, `JUDGEMENT_*`, `PROPAGATION_*`, `VLLM_MODEL`, `VLLM_MAKER`, `HATCHET_WORKFLOW_NAME`, `HATCHET_WORKER_NAME`, `HATCHET_ENGINE_RETRIES`, `STRANGER_SAMPLE_RATE`, `REGISTER_VERSION`, `BATTERY_VERSION`, `SETTLEMENT_WATCH_HANDLE`, `MAIL_SENDMAIL_PATH`, `MAIL_FROM`, `PUBLIC_APP_URL`, and — unless a producer is found (**U-12**) — the five contract hashes. | **No seat invents one** (AC-76). A typed loud failure is the correct behaviour for an unratified read, but **a slice that requires a value cannot be declared runnable until the value exists**. If V prefers, the answer may be "ratify a provisional dev-only set recorded as provisional", in which case **MB-11 item 8** applies to every receipt captured under it. |

| **V-14** ✦ | **Authorize the privileged database operations D3 performs on the mission's own store.** Scope, exactly: `CREATE DATABASE <hatchet co-tenant>`; `CREATE ROLE` for `v3_replay_self_test`, `v3_reaper`, `v3_settlement_watch`, `v3_replay_ceremony`; the §5.5.0 `GRANT`/`REVOKE` statements; and the read-only verification queries. **Blocks D3, and therefore everything after it.** | Round 1 gave AR-17 concrete SQL artifacts but no authorization to run them. These are privileged writes; that they land on a store this mission created does not make them self-authorizing. **No production or foreign database is in scope, ever.** Idempotent and re-runnable either way. |
| **V-15** ✦ | **Authorize product-data writes, in two separately answerable scopes.** **(a) D4's acceptance asks.** Exactly **four** `POST /v1/asks` requests — one each for L-1/L-2 (a single shared run), L-3, L-4, L-5, and L-6 reusing L-5's run — via **AR-18's hash-bound fixture** and the fixed token `acceptance:dispatch-probe`, producing real `core.work_item`, `ledger.ledger_entry`, `ledger.raw_artifact` and `core.run_progress_event` rows in `docker-hatchet_postgres-data`. **The authorized body is the SHA-256 D4 records; a different body is a different authorization.** **(b) D6's scheduler job writes.** The three invoked jobs write under the grants §3.5 provisions: `job:replay-self-test` may append to `serve`'s two eviction streams, `job:settlement-watch` may append `scorecard.answer_outcome` + its `ledger_entry` rows + INSERT-only `scorecard.scorecard_cell`, and `job:liveness-sweep` may write `core.work_item`. **Blocks D4 (a) and D6 (b).** | **V-13 does not cover either** — it ratifies *what values are*, not *permission to mutate*. **V-14 does not cover (b)** — creating a principal is not authorizing what it writes, which was H2-04's round-2 residual. Rows are **retained, not cleaned up** (DR-188), and the receipts record `run_id` / `work_item_id` / derived `asker_id` so they are re-findable. If V prefers a bounded retention policy or a smaller request count, that is this row's answer to give. |
| **V-16** ✦ | **Authorize destructive lifecycle operations, in three separately answerable scopes.** **(a)** `kill` / `stop` / `start` / `restart` / `down` (never `-v`) of the **mission's own** containers — needed by MB-5, MB-6 and L-3. **(b)** forced **redelivery** injection for L-3/L-4/L-6, by whatever mechanism D2a records. **(c)** creating and removing the **disposable probe project** `docker-hatchet-probe` at D0b. **Blocks D0b (c), D4 (a,b), D7 (a).** | AR-2a already forbids touching any **foreign** object, and nothing here weakens that: every scope is confined to objects this mission created. What was missing is that a destructive operation on one's own runtime is still a destructive operation. **DR-188 holds throughout — no scope includes `-v` or any volume deletion.** |

**For the orchestrator batching this:** **V-1 and V-4 together gate the entire mission**;
**V-13 gates the load-bearing slice** and is the largest single executability gap;
**V-7(b) is the only row that can make a slice *unpassable*** rather than merely unstarted;
**V-9 blocks D5 outright** rather than shaping it — and under **V-9(b)** it blocks D5 until a
**separate orchestrator-owned ticket** (`AC60-ROUTE-CONTRACT`, AR-22) is accepted.
**V-14, V-15 and V-16 are cheap to answer and block early** — V-16(c) gates the second
slice, V-14 the fourth. They are separated from the value rows on purpose: a seat may know
every value and still lack permission to write.

---

## 7. Non-goals

1. **`apps/evaluator-worker` is not containerized** — unless **V-6** says otherwise. It is a
   library with no process.
2. **The live security WIP is not touched — file or runtime.** No frozen file is written,
   `compose.dev.yaml` is byte-unchanged and never on a command line, and **no container,
   network or volume owned by another Compose project is stopped, recreated, re-specced,
   relabelled or orphaned** (§1.3). `POSTGRES_PASSWORD: debateai-dev-only` is unchanged.
3. **No Kubernetes.** RULED closed at DR-117.
4. **No Hatchet Cloud, no managed control plane, no Inngest.** RULED closed at DR-118.
5. **No RabbitMQ.** AR-10 + AR-20 make reintroducing it a failing gate.
6. **No test-store change.** `tests/**` is a class this mission does not hold; three of its
   files are dirty and foreign. Testcontainers-vs-embedded is **V-4**.
7. **No second Hatchet worker**, and no Hatchet-scheduled scheduler jobs.
8. **No live production deployment.** **DP** is a *static* resolved-config proof, gated on
   V-2(b)/(c); a live Hetzner/Cloudflare deploy stays a separately V-gated IMPORTANT
   OPERATION.
9. **No Dockerfile, compose file, or application code was written by this stage.**
10. **No second durable store, and no move of the engine's database off the one instance** —
    that requires a new human ruling, not a deploy-time capacity judgement.
11. **No product data is fabricated.** MB-9's proof is a real ask through the front door
    (AR-18); no direct SQL masquerades as the API path, and nothing is deleted afterwards.

---

## 8. Requirements coverage

### 8.1 The mission bar

| Row | Where |
|---|---|
| MB-1 one command up | D7 via `deploy/compose/up.sh`; §1.2 (no host process for a required service); `scheduler` removed from the quantifier by **AR-15 / V-11** |
| MB-2 declared inventory | §1.1; D7; the lite substitute called out at §1.4 item 4 |
| MB-3 contract-exercising health checks | **§2.7.1 — one named contract per required unit** (`postgres`, `api`, `runner`, dispatcher, `web`), long-form `service_healthy` only; AR-14 for timing; blockers for `runner`/dispatcher if no lawful signal (U-8/U-11) |
| MB-4 logs, no secret values | D7; AR-6's assertion prints no token; §3.4 "log none"; the health token is a non-secret marker (§2.7.1) |
| MB-5 single-service restart, 9119 survives | D7; §1.2; AR-7; §2.8 (restart is project-scoped) |
| MB-6 durability across `down`/`up` | D7; §3.4 `USER_DEK_STORE_PATH` named volume (SR-D3.1); §2.8 (`down` never `-v`) |
| MB-7 non-destructive stop | D7 via `down.sh`; DR-188; §2.8 |
| MB-8 image provenance | §3.4; **V-12** for base images; D2; D7 |
| MB-9 dispatch is real | §2.6.1 **and** §2.6.2's L-cases; D4; AR-18's lawful trigger |
| MB-10 anti-masquerade | §1.3; D7 |
| MB-11 the label is bounded | §1.4 — **eight items**, three new in rework 1 |
| Preflight preconditions (7) | D0a |

### 8.2 Section-level AGREED rows

| Row | Where |
|---|---|
| A1 · A2 · A3 · A4 facts · A5 | §1.1 · §2.3/§3.4/§1.4 item 3 · §2.2 · §3.4/D1 · §0.3/D0a |
| B1 | = MB-1…MB-11 |
| B2 in-compose vs host | §1.1, §1.2 — with `scheduler` reclassified by unit, not dropped |
| B4 split (label is V-8) | AR-5; DV |
| B5 invariants | §6 V-4's invariant column; §7 item 6 |
| C1 ownership boundary | §2.1 + AR-7 + **AR-20** |
| C2 minimum wiring + proof | §2.2, §2.3, §2.6.1, **§2.6.2** |
| C4 RabbitMQ | AR-10 (+AR-20); D3 |
| C5 principals + negatives | AR-3, **AR-17**, AR-4; §3.5; D3, D6 |
| D1 classes + enforcement | §3.1 (exact, no globs), §3.2 (every hashed path classified), §4.3 (one writer per path) |
| D2 base byte-unchanged | AR-2 — and **never on a command line** |
| D3 image contract | §3.4 |
| SR-A4.1 | AR-5 + AR-16 — the guard lives only in the excluded fragment |
| SR-A4.2 | §3.4; D1 |
| SR-C2.1 · C2.2 · C2.3 · C2.4 · C2.5 | §2.2 · AR-6 · §2.2 · AR-8 · §2.2 |
| SR-C3.1/C3.2/C3.3 | §1.4 item 4, §2.4 — invariant under V-3 |
| SR-D1.1 / D1.2 | §3.1, §3.2 — and SR-D1.2 **fired** (§0.3) |
| SR-D2.1 | AR-2 (strengthened: not merely unedited, but unreferenced) |
| SR-D2.2 | §1.3, §2.4, `compose-invariants.mjs` |
| SR-D2.3 | AR-2's expiry + **DP**'s non-inheritance gate |
| SR-D2.4 | **retired as a blocker by AR-16** — the mission chains only its own fragments, so no foreign-file override is needed; U-3 stays a recorded question, not a gate |
| SR-D2.5 | AR-16 — one resolved model from mission-owned fragments |
| SR-D3.1…D3.6 | §3.4 · §3.4 · §3.4 · §2.3/D5 · D5 · §3.1 |
| Vendor name-space mismatch | AR-11 |
| `[O]` R-C1 corollary | AR-7, AR-20 |
| `[G]` E4-c | **Closed by construction** — AR-2 references no foreign file, so no base env key is overridden and no base token is invalidated |

### 8.3 Deferred with a named successor

| Deferred | Successor |
|---|---|
| Live production deployment | **V-2**; DP proves static config only; a live deploy is a separate IMPORTANT OPERATION |
| A real model call from inside compose | **V-8**; DV for hardware, DR-179 for the relay half |
| Testcontainers / test-store flip | **V-4**; a class this mission does not hold |
| `job:reaper`'s implementation | its own later slice; credential provisioned now |
| Hatchet-scheduled scheduler jobs | a later slice under SR-C2.5 |
| Time-triggered scheduling of the three jobs | **V-11** / a later slice — this mission proves invocability, not scheduling (MB-11 item 6) |
| Replay as a genuinely separate project | **DP**; the weaker profile form is used now with its weakness recorded (AR-4) |
| Merging `compose.dev.yaml` with the mission fragments | SR-D2.3's expiry — **when `accounts-phase1` closes** |
| The `/api/[...path]` route's fate | **V-9**; a change is a separate authorized file contract, not this mission |

---

## 9. UNVERIFIED, carried forward

| # | Unverified | Closed by | Owner |
|---|---|---|---|
| **U-1** | Whether `vllm/vllm-openai@sha256:ffb2d59b…` publishes an `arm64` variant or runs without CUDA here; and the Hetzner host's GPU | `docker manifest inspect` + a profiled `up` | DV |
| **U-2** | `docker-entrypoint-initdb.d` first-boot-only semantics | official image docs. **No longer a blocker** — AR-17 does not depend on it; recorded as a fact | D3 |
| **U-3** | Whether a sibling file can override a base service's env key | `docker compose -f … -f … config`. **No longer a gate** — AR-16 overrides nothing | D0a, informational |
| **U-4** | Hatchet's dashboard/API surface names for O-1/O-2. **No endpoint, label or return shape is invented.** ADR-0017's *"what this ADR does not rule"* already requires vendor examples and pins to be re-checked at the implementation ticket. O-2 is satisfied by **any** engine-side artifact carrying the `v3WorkItemId` — the requirement is the **correlation** | **D2a §C** — exact command or `ABSENT` | **D2a** |
| **U-5** | Whether the pinned `hatchet-lite` digest is vendor-supported for production and exposes ADR-0018's migration/dashboard surfaces | version-specific vendor audit | informs V-3 |
| **U-6** | The `SERVER_GRPC_BROADCAST_ADDRESS` consequence for an in-compose runner — derived by `[O]`, confirmed against vendor docs by `[G]`, executed by nobody | read the runner's connect target in its logs | D3 |
| **U-6a** | Whether `SERVER_URL` must also change for a re-issued token to be valid | the engine's token-issuance output | D3 |
| **U-7** | Whether `${VLLM_MODEL:?}` fails a render even behind a profile. **No longer a gate** — AR-16 excludes the fragment from the required chain | `docker compose --profile … config` | DV, informational |
| **U-8** | Whether a lawful in-container worker-registration signal exists for the runner health check | **D2a §W** — exact command or `ABSENT` | **D2a** — `ABSENT` ⇒ **MB-3 unmeetable for `runner`; report a blocker** |
| **U-9** ✚ | Whether any Compose project, container or volume from this repo exists on this host | `docker compose ls -a`; `docker ps -a --filter label=…`; `docker volume ls` — read-only | D0b |
| **U-10** ✚ | Whether the SDK/engine gives a lawful way to force redelivery for L-3/L-4/L-6 | **D2a §R** — exact command or `ABSENT` | **D2a** — `ABSENT` ⇒ **L-3/L-4/L-6 recorded UNPROVEN under §2.6.2's ABSENT rule; the laws are not claimed proven, and no weaker case replaces them** |
| **U-11** ✚ | The dispatcher's own documented readiness/health surface | **D2a §E** — exact command or `ABSENT` | **D2a** — `ABSENT` ⇒ **MB-3 unmeetable for the dispatcher; report a blocker** |
| **U-12** ✚ | Whether a producer exists for the five contract-hash values, or whether they fall to V-13 | locate the producer (`pnpm generate:contract` is the candidate) — static, no runtime | D1 |

**Two live blockers a coding seat still hits on day one:** `deploy/compose/up.sh` is a **new**
one-command lifecycle, because `Makefile` is tracked-and-deleted; and **no register value the
strict loaders require exists yet** (V-13).

---

## 10. Method, and residual risk

- **Rework method, round 1.** Read both review artifacts in full. **Reproduced every one of
  the sixteen findings against the round-0 text before writing** — §0.2 records the quoted
  passage for each. **None was refutable**, so none is contested; where the two lenses
  overlapped (F-1≈H2-03, F-2/F-6≈H2-01, F-7≈H2-05-part) a **single** clause answers both.
  No third architecture was invented: every re-cut takes one of the options the reviewers
  themselves named.
- **Rework method, round 2.** Scope was **only** H2-03…H2-09; H2-01, H2-02 and the secondary
  defect are RESOLVED and were not touched. **Confirmed the reviewer read this exact file**
  — the cited Plan SHA `39819b2e…` matches the round-1 artifact byte for byte. Each of the
  seven was reproduced against that text before rewriting (§0.2b); **all seven reproduce**.
  Round 2's changes are **surgical section edits, not a rewrite**, so the G3-approved clauses
  are preserved by construction rather than by re-typing.
- **G3-preservation audit (§0.2a).** AR-1…AR-13 and AR-15…AR-20 are unchanged. AR-2/AR-2a
  (F-2/F-6), §2.8, §1.1's unit-class column, the DP gating (F-5), and §3.2's classification
  (F-7) are untouched. Three G3-carrying clauses were **extended, never reversed**: AR-17
  gained an authorization (V-14) but not a different mechanism; §2.7.1 gained exact probes
  but not a different per-unit requirement; AR-14 chose its values instead of deferring them.
  **No G3 flip is unwound.**
- **Rework method, round 3 — the last lawful round (cap = 3).** Scope was the **residuals** of
  H2-03…H2-09 at `H2-rework-2`; H2-01, H2-02 and the secondary defect stay RESOLVED and were
  not touched. **Confirmed the reviewer read this exact file** — SHA `c1d8db0c…` matches the
  round-2 artifact. All seven residuals reproduced before rewriting (§0.2c). Again surgical
  edits, so **G3's approved clauses are preserved by construction**; §0.2a's audit is
  unchanged and re-verified.
- **The sharpest round-3 correction was a fact, not a judgement.** H2-09 claimed L-1's
  right-hand row did not exist; `packages/kernel/src/index.ts:200-211` confirms
  `LEDGER_ACTION_KINDS` has **no claim-recording kind**, so round 2's ordering comparison was
  against a row the schema cannot produce. The replacement — observing `CLAIMED` from an
  independent session while the artifact count is still zero — is **stronger than the
  original**, because it observes the transaction boundary itself rather than inferring it
  from two sequence numbers.
- **What round 3 did not do.** It did not close V-9 by constraining the mission to V-9(a),
  which the reviewer offered as an alternative: that would decide an OPEN-V row by
  convenience. Instead V-9(b) got a real producer **and** a named exit if that producer is
  not authorized, so both branches are executable without V's answer being pre-empted.
- **The one round-2 ruling a reviewer should look at hardest** is **AR-14's numerals**
  (§2.7.1a). This plan otherwise mints no numbers; H2-03 required these to be chosen, and
  AR-14's classification under §5.4c's test is what makes choosing them lawful rather than an
  AC-76 breach. If that classification is wrong, the timing table is the only thing that
  falls, and it falls back to V.
- **New verification performed this round** (read-only, no runtime): the API route table and
  auth gate (`apps/api/src/index.ts:130-157, 205-353`), which established that a lawful
  dispatch trigger and a lawful `api` health check both exist without touching frozen code;
  and a repo-wide search establishing that **no producer exists for the runner's register
  values**, which is V-13.
- **Where this document exceeds the findings.** AR-20 (dispatcher-container retry config)
  was G3's explicitly *non-blocking* residual; it is adopted anyway. AR-14 (health timing is
  operational) answers a question H2-03 raised only as "by lawful source". U-9…U-12 are new
  UNVERIFIED rows created by the new mechanisms rather than inherited.
- **What I did not do.** Picked no winner on V-2, V-3 or V-5; closed no OPEN-V row;
  contacted no V; started no Docker; put nothing on `PATH`; reopened neither DR-117 nor
  DR-118; wrote no Dockerfile, compose file, application file, schema, migration or
  configuration.
- **Residual risk.**
  1. **AR-2's AC-02 reading is a reading** (§1.3). It is made safe by AR-2a's refusal rather
     than by argument, and if V reads AC-02 host-wide the answer is V-2(d) and a re-cut.
  2. **V-13 may be large.** If V declines to ratify ~30 values for a dev deployment, D4 has
     no lawful path and the mission's honest ceiling is D3 — a data plane and a dispatcher
     with no proven dispatch. That would be a real, reportable outcome, not a failure to
     plan around.
  3. **Two health contracts (`runner`, dispatcher), MB-9's O-2 and the redelivery mechanism
     rest on U-8/U-11/U-4/U-10 — now all owned by D2a** with an exact-or-`ABSENT` rule. Each
     is instructed to report a blocker rather than weaken the check, so the plan can stall on
     vendor reality — deliberately, since the alternative is a green bar that proved less
     than it says. **What round 2 changed is *when* that stall surfaces:** at D2a, on a known
     date, rather than inside the load-bearing slice.
  6. **V-14/V-15/V-16 could be refused.** If V declines the product-data writes (V-15), MB-9
     has no lawful trigger and D4 stops at the health checks; if V declines destructive
     injection (V-16(b)), L-3/L-4/L-6 are UNPROVEN by authorization rather than by vendor
     absence. Both are recordable outcomes, and §2.6.2's ABSENT rule already forbids
     describing the affected laws as proven.
  4. **The §3.2 baseline is a mechanism, not a fact.** Its value depends on every ticket
     re-running it; a seat that trusts the table instead of recomputing it has the exact
     blindness the mechanism exists to fix.
  5. **AR-15 asks V to amend an inherited MB row.** If V refuses (V-11(b)), the scheduler
     needs a supervisor in `apps/**` — scope expansion this plan forbids — and V-11(c)
     becomes the only lawful exit.
- **Freeze and writes.** No file under the freeze was read for a write or written; no
  foreign runtime object exists to touch and none is authorized. **Writes: exactly the two
  paths in each rework packet's `allowed` list.** No commit. No push. No board mutated. No V
  contact. No reviewers launched. Docker was not started in any round.
- **Session-id note.** The round-0 handoff was written with a placeholder that was corrected
  to the real session id **before** the C2 handoff; the current file has carried
  `353f7aa5-5955-4e9b-8601-812810039d2b` since then, which matches the packet's recovered
  id and the G3 reviewer's citation. The `WORKER CONTINUITY OVERRIDE` recorded on the board
  is consistent with this file; no continuity gap exists.

---

```
REWORK READY FOR PEER REVIEW:
- mission/step: 2026-08-21-docker-hatchet / C2-rework-3
- owner CLI session: 353f7aa5-5955-4e9b-8601-812810039d2b
- findings addressed: H2-03, H2-04, H2-05, H2-06, H2-07, H2-08, H2-09
- findings BLOCKED/deferred: none
- comments read through: H2-rework-2 remaining RED; G3-rework-2 APPROVED preserved
```
