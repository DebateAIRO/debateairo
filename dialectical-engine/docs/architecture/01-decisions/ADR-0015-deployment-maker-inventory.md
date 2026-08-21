# ADR-0015 — The deployment maker inventory: two predicates, not one

| Field | Value |
|---|---|
| **Status** | **ACCEPTED — minted by V at DR-099, amendment A-02**, one of the four amendments ruled *individually* in that sitting (A-01..A-04); the architecture it records is accepted under **DR-098 (VS-1)**. This ADR is a decision **record**, not a proposal. |
| **Date** | decision 2026-08-05 (DR-055, restated at `03-module-design.md` §7.3); minted 2026-08-05 (DR-099/A-02); authored 2026-08-06 |
| **Authored by** | PROG-V3-R1 / ticket **PRE-04** (board `debateai-v3`, `t_c3538824`), under **DR-100**'s follow-through instruction ("mint ADR-0015"). |
| **Owning context** | **16 · `providers`** (generic subdomain) — `03-module-design.md` §3.1 row 16 |
| **Source of record** | Plan.md rev 3 §3.2 **Seam C**; decision text at `03-module-design.md` **§7.3**; launch-gate authority **DR-055**, charter **S4**, **AC-38** |
| **Fixtures** | **`FX-PRV-01a`** · **`FX-PRV-01b`** · **`FX-PRV-02`** (`06-test-strategy.md` §5, §12); adjacent launch prerequisite **`FX-HR-H2a`** |

> **Numbering note.** This is the ADR-0015 that **DR-099 amendment A-02** mints,
> by its subject: *the deployment maker inventory*. The **repo-layout / no-fence**
> decision that **DR-068** and **DR-069** point at (their affected-rows columns
> read "ADR-0015 scope" and "ADR on the repo-layout decision") is
> **[ADR-0016](ADR-0016-repository-layout-no-fence.md)**. The resolution is
> recorded at [README §2](README.md#2-the-adr-0015-and-adr-0016-numbering-resolution).

## Context

**AC-38** makes multi-maker critique a **launch gate at the deployment level**,
not a per-run nicety. Three ruled facts fix what that gate may read:

- **DR-055** — *multi-maker is a launch gate*: standard-and-above tiers must
  execute real different-maker critique from day one, and **"degraded
  single-maker mode" is TRANSIENT provider-unavailability handling only** (the
  DR-014 cap-and-label path) — **never a legal standing configuration for
  standard+**. A deployment that cannot execute multi-maker at standard+ **does
  not pass launch** (charter acceptance item; charter **S4**).
- **DR-013** — the bright line the inventory counts over: **different maker =
  different lineage**; anything same-maker, including across generations, is the
  **same** lineage. Auditable per pairing.
- **DR-014** — when no second lineage is available: **cap + label + lift path**.
  The answer serves, cannot reach the top confidence band, wears a visible
  "independent critique unavailable" label with its reason, and the lift
  condition is recorded so executing the critique later re-scores.

DR-055 and DR-014 therefore speak about **two different subjects at two
different timescales**: a *deployment's standing configuration*, and *one run's
provider luck*. Plan.md §3.2 Seam C states the consequence — **one predicate
cannot carry both** — and until this record was minted, no C4 document carried
the options-considered trail behind it (`README.md` §2 raised exactly this gap
as **H-O-15** / **G2-3**).

## Options considered

*The two rejected arms below are the two ways to have **one** predicate. Their
rejections are Plan.md §3.2's own and DR-055's own; nothing is reasoned in
afresh here.*

### Option A — one predicate, evaluated as a liveness probe at call time *(rejected)*

The conventional shape: ask "can we reach a second maker right now?" and take
DR-014's cap-and-label path whenever the answer is no.

Rejected by Plan.md §3.2's own indictment, restated at `03-module-design.md`
§7.3: **every standard-tier run on a one-provider deployment then quietly takes
DR-014's path**, the deployment never fails anything, and **DR-055's launch gate
is dead code wearing a gate's clothes** — charter **G3**'s exact charge. It also
converts DR-055's *"never a legal standing configuration"* into a per-run label,
which is the one reading DR-055 forecloses in terms.

### Option B — one predicate, evaluated as a startup configuration check that also fails on outages *(rejected)*

The converse: keep the gate at the deployment level, and let a provider
error or timeout mark the deployment incapable.

Rejected because it **deletes DR-014's path** rather than implementing it. A
capable two-maker deployment would flip to *failing its launch gate* on an
unrelated network event, and the ruled transient response — cap the band, label
it, record the lift condition — would have **no predicate left to hang on**.
DR-055's precision (*"'degraded single-maker mode' = TRANSIENT
provider-unavailability handling only"*) presumes both a capable deployment and
a transient event; one predicate cannot hold both states apart.

### Option C — two predicates: different subject, different timing, different consequence *(chosen — and ruled)*

## Decision

**The maker inventory is two predicates. Each has its own subject, its own
evaluation timing, its own reads, and its own consequence.** The decision text
is `03-module-design.md` §7.3 and is restated here as the record:

| Predicate | Subject and timing | Reads | Consequence |
|---|---|---|---|
| **`deployment_maker_capability`** | the **deployment's configuration** — evaluated at startup and on **every register change**; explicitly **not** a liveness probe | the register's configured provider set, resolved to **distinct makers** under DR-013's bright line | **the launch / admission gate**: false ⇒ **standard-and-above asks are refused** with a typed error, and the **S15 attestation is absent** |
| **`run_maker_reachability`** | **one run**, evaluated **per critique attempt** | the ledger's recorded provider errors and timeouts **for that run** (AC-44's record of what ran) | **the transient path only**: false on a *capable* deployment ⇒ **DR-014's cap-and-label** (`SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE`, confidence-band cap, recorded lift condition) |

Three clauses ride with the pair.

### 1. A ledger-derived counter classifies every capped run against both predicates

So that **a standing misconfiguration can never accumulate as a run of
"transient" outages**. The counter is derived from the ledger (AC-44), not
asserted — it is the mechanism that keeps Option A from re-entering through the
back door at runtime, and `FX-PRV-02` is its fixture.

### 2. The refusal is typed, and the attestation is BLOCKING

A failing `deployment_maker_capability` makes `POST /v1/asks` **refuse** a
standard-or-above ask with a **typed error** (`04-api-contract.md`;
`09-traceability.md` AC-38 row) — never a silent downgrade to the DR-014 path,
which is the whole content of DR-055's "never a legal standing configuration".
The **`deployment_maker_capability` attestation in the S15 launch bundle is
BLOCKING** (charter S4; `06-test-strategy.md`), and it is an attestation in the
first-class sense: **absence is a typed reason, never a default** — "maker
capability unknown" is not "capable".

### 3. Both predicates are fixtured both ways, separately

Per **AC-79** (a gate is shown to fire **both** ways) the two arms are two
fixtures, not one:

- **`FX-PRV-01a`** — a **standing one-maker deployment** ⇒
  `deployment_maker_capability` **FAILS**; standard-and-above `POST /v1/asks` is
  **refused** with a typed error; **no S15 attestation**.
- **`FX-PRV-01b`** — a **two-maker deployment with one provider transiently down
  mid-run** ⇒ capability **PASSES** while `run_maker_reachability` is false for
  one provider; **that run takes DR-014's cap-and-label path**, and the counter
  **classifies it transient**.
- **`FX-PRV-02`** — the counter itself: a standing misconfiguration can never
  accumulate as a run of transient outages.

Slice assignment is **S8** for all three, with `FX-PRV-01a` re-consumed in the
**S15** launch bundle (`06-test-strategy.md` §12).

### 4. What the predicates are *not* allowed to be

- **Not a count invented here.** The configured provider set and its resolution
  to distinct makers are **register** material (ADR-0011); no threshold, no
  interval and no probe budget is stated in this ADR (**AC-76** · DR-039).
- **Not a second provider interface.** Both predicates read what already exists —
  the register's configured set, and the ledger's recorded errors. Every model
  call still crosses the **one** provider interface of Seam C (**AC-36**;
  ADR-0009 clause 1).
- **Not a substitute for H2.** `deployment_maker_capability` says the deployment
  *is configured with* distinct makers. **`FX-HR-H2a`** — the config-only switch,
  byte-identical source and build inputs except one register row — is a separate
  **launch prerequisite** under AC-38/DR-055 (`03-module-design.md` §7.4), and
  neither fixture stands in for the other.

## Consequences

**Accepted:**

- DR-055's launch gate becomes **falsifiable**: there is a deployment-level
  predicate with a stated evaluation moment and a refusal that a fixture can
  observe. Charter G3's "dead code wearing a gate's clothes" is answered by
  construction rather than by review.
- DR-014's cap-and-label path survives intact and stays **scoped to what it was
  ruled for** — a transient outage on an otherwise capable deployment.
- Re-evaluation **on every register change** means a deployment cannot be
  downgraded into single-maker configuration after launch without the gate
  noticing; the register is the only door (ADR-0011 clause 5).

**Costs and risks, stated plainly:**

- **Two predicates are two things to keep honest.** The counter of clause 1 is
  the only thing standing between the split and a slow drift back to Option A;
  if the counter is not derived from the ledger it becomes an assertion, and an
  assertion can be wrong in the direction nobody checks.
- `deployment_maker_capability` reads **configuration, not reality**. A register
  row naming two makers whose credentials are both dead is *capable* by this
  predicate and unreachable in fact — which is deliberate (the two subjects are
  different), but it means the S15 attestation evidences configuration plus
  `FX-HR-H2a`'s executed switch, and **not** a live probe.
- The refusal is user-visible at standard+ tiers. That is DR-055's ruled price:
  a deployment that cannot do multi-maker critique **does not serve those
  tiers**, rather than serving them capped.

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-38 — multi-maker critique is a launch gate at the **deployment** level | DR-055; charter S4; Plan.md §3.2 Seam C | `deployment_maker_capability` as the admission gate, with the BLOCKING S15 attestation |
| DR-055 — degraded single-maker mode is transient handling only, never a standing configuration | founding ledger DR-055 (precision of 2026-08-04) | the two subjects held apart, plus clause 1's classifying counter |
| DR-014 — no second lineage ⇒ cap + label + recorded lift path | founding ledger DR-014 | `run_maker_reachability` as the *only* trigger of that path |
| DR-013 — different maker = different lineage, bright-line and auditable | founding ledger DR-013 | the configured provider set resolved to **distinct makers** |
| AC-36 / AC-37 — one provider interface; the second provider by configuration | DR-029 H1/H2; spec §19 H1/H2 | both predicates read existing surfaces; `FX-HR-H2a` kept distinct |
| AC-44 — everything executed is recorded; the ledger is the record of what ran | DR-027; manifest §8.3; charter S3 | `run_maker_reachability` and the counter are **ledger-derived** |
| AC-79 — every gate shown to fire both ways | DR-063 VR-1/VR-5; spec §22 Z-1 | `FX-PRV-01a` / `FX-PRV-01b` fixtured **separately**, plus `FX-PRV-02` |
| AC-76 — no invented measurements | DR-039; manifest §2.2 item 9 | no threshold, interval or probe budget stated here; the provider set is a register row |
| AC-85 — one behaviour, one place | charter A3.1, A3.6 | one owning context (16 `providers`); one decision text (`03` §7.3) |

## Questions this ADR does not rule

**All 28 questions of `08-open-questions-for-V.md` are ruled** (DR-068..DR-097;
closure at **DR-100**). Nothing in this ADR waits on a Q-nn. What remains
reserved elsewhere:

- **The register's values.** The configured provider set, its keys and any
  operational values are **register rows**, V's at **DR-023** — proposed at
  `05-register-skeleton.md`, ratified at the **VG-02** sitting. This ADR states
  none of them (AC-76).
- **The provider adapters themselves.** Which two implementations ship is a
  `packages/providers` matter under AC-37 and `03-module-design.md` §7.4; this
  ADR rules the inventory predicates, not the roster.
