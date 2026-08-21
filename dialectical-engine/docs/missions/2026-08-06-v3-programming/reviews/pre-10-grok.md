# PRE-10 Grok peer review (independent lens)

**Ticket:** `t_d467ee8a` — PRE-10 · DR-105 stack re-instantiation: Python/FastAPI engine  
**Reviewer:** Grok (DR-101 peer lens; Claude-authored ticket)  
**Protocol:** Independent; no Codex verdict, no `reviews/pre-10-codex*`, no post-handoff peer comments read  
**Comments read through:** `claude-worker` READY FOR PEER REVIEW (2026-08-07 10:03)  
**Scope judged (UNTRACKED, read directly):**

| Artifact | Role |
|---|---|
| `docs/architecture/01-decisions/ADR-0001` / `0002` / `0003` / `0009` / `0012` + `README.md` | five re-instantiated ADRs + status record |
| `docs/architecture/03-module-design.md` | package map / lint gates / signatures |
| `docs/architecture/05-register-skeleton.md` | bootstrap keys + counts |
| `docs/architecture/06-test-strategy.md` | stack + CI + orphan audits |
| `docs/architecture/07-build-order.md` | GPG rows + S0 scaffold |
| `docs/missions/2026-08-06-v3-programming/design-patterns.md` | 18 patterns re-ground |

**Consistency context (not judgment targets beyond stated checks):** PROG ledger DR-104 / DR-105 / DR-112 / DR-115; Plan.md §9 bound; landed `02-data-model.md` (must stay untouched).  

**Posture:** red-team — hunt what the language swap silently breaks; this artifact gates V's pattern ratification and Codex's S00.

---

## Verdict

**CHANGES REQUESTED**

Five blocking findings. The re-instantiation is mostly honest about lost structural properties and correctly folds DR-115, but the language swap leaves implementable holes in AC-07's wire form, AC-04's async restatement, AC-35/65 exhaustiveness, G2's two-runner assembly, and two residual "four bootstrap" residues that contradict the claimed six-key recount.

---

## Ground-truth alignment (non-blocking baseline)

| Source | What PRE-10 must satisfy | Result |
|---|---|---|
| **DR-105** | Engine = Python/FastAPI; DB = PostgreSQL; kept UI = TS/Next; re-instantiate 0001/0002/0003/0009/0012; design four replacement mechanisms for AC-59/61/35-65/09 | **Met** in ADR substance and doc alignment |
| **Plan.md §9** | Context map, data model, API direction survive; only §2.2–§2.7 re-instantiate | **Met** — eleven non-stack ADRs not opened (mtime 2026-08-06); `02` mtime 2026-08-06 23:18 vs ADR-0001 2026-08-07 10:02 |
| **DR-104** | Resolve-on-machine bootstrap pins; GPG-4 contract 0.1.0 / register_version 1 | **Met** — six keys, values still `— none stated`; 0.1.0 is the ruled GPG-4 identifier, not a tool-version numeral |
| **DR-112** | PRE-10 before S00 | **Met** — ticket body + 07 GPG-2/S0 entry |
| **DR-115** | No scaffolded runtime data; fixtures confined | **Met** — ADR-0009 cl.1, ADR-0012 cl.7, design-patterns anti-pattern #1, 07 S0 bind; replay blind spot named |
| **No version numerals** | Tool versions absent from C4 docs | **Met** in PRE-10 scope (no `python 3.x` / package-pin literals). GPG-4's `0.1.0` is ruled identity, not a seat tool pin |
| **18 patterns / no shape change** | design-patterns re-grounds stack names only | **Met** — P1–P18 shapes intact; DR-115 is new *law entry* in the anti-pattern register, not a quiet P-shape change |

---

## Red-team limbs (the nine hunts)

### (1) BYTE-IDENTITY — shortest-round-trip end to end

**Finding F1 — BLOCKING.**

ADR-0001 §"The numeric property" correctly states:

- `float` is IEEE-754 double and `repr(float)` is shortest-round-trip;
- **the wire form is produced by the response encoder, not by `repr`**;
- a CI assertion must pin encoder output to `repr` for boundary doubles;
- fixture id is lane 6's to mint.

What it does **not** secure:

1. **Which production encoder is the authority.** FastAPI's serve path can be stdlib `json` via Starlette `JSONResponse`, pydantic v2 `ser_json`, a custom `jsonable_encoder`, or a drop-in **orjson / ujson** response class. Seat-choices name uvicorn and openapi-typescript; they neither pin nor forbid an alternate JSON library. A builder who "optimizes" the front door to orjson can change decimal form for edge doubles while a fixture that imports "the helper used in tests" still matches `repr`.
2. **The pin is not required to exercise the HTTP serve path.** "Pins the encoder's output" can be satisfied by unit-testing a pure function that production never calls. AC-07 cares about **served** numbers; the assertion must bind the same code path that writes the response body (route → model dump → JSON bytes).
3. **asyncpg / Decimal is named as a cost in ADR-0003 but not joined to the pin.** A `numeric`/`Decimal` round-trip that re-enters the serve path as a second numeric semantics is exactly the AC-14/AC-85 breach the float-only rule exists to prevent; the owed fixture set should include a serve-path double that left storage, not only a bare Python float.

CPython's current `json.dumps` happens to match `repr` for common doubles — that is an **accident of one encoder**, not a stack law. The residual is not discharged by hoping FastAPI keeps the default.

**Required repair:** name the single allowed production JSON path (class/module), forbid alternate response codecs on the serve surface, and state that the owed lane-6 fixture asserts **HTTP body bytes** (or the exact production encoder call used to build them) against `repr` for a declared boundary set (including `-0.0`, subnormals, and values near binary-decimal ties). Join the asyncpg-not-Decimal rule to that same fixture limb.

---

### (2) THE LOST PROPERTY — D4 via hand-edited wire type

**Walk (attack: hand-edited generated TS module reaches the browser):**

| Gate | Catches hand-edit of generated module? | Catches hand-kept parallel `types.ts`? |
|---|---|---|
| **M1** regen + byte-equality diff | **Yes**, if the contract-stage regen gate runs | No — a second hand file is not the generated module |
| **M2** inventory join | served⇒consumed: inventory row with no consumer; consumed⇒served: TS error against generated module | Partial — only if the hand file is what consumers import; a cast/`as any` path bypasses |
| **M3** two checkers | Not about wire-type identity | UI exhaustiveness only if UI switches on generated unions |
| **Postgres CHECK** | No (browser-side defect) | No |

**Honest cost is recorded loudly enough** for the CI-config-skip re-open:

- ADR-0001 Consequences: *"A CI configuration that skips any of the three re-opens D4"*;
- README §5.5 restates the same sentence and refuses to soften it;
- M1 cost: property is gate-enforced, not structural.

That is the right volume for a known residual of DR-105.

**Observation (not blocking alone):** the docs do not name the **type-assertion / second-mirror** residual — a hand-kept mirror that is imported under `as any` or a local interface can re-create V2's D4 without skipping M1's regen gate. Worth a single sentence under M1/M2 costs; not sufficient alone for RED if F1–F5 land.

**Limb (2) on the CI-skip record: PASS (loud enough).** Residual type-assertion path: observation for rework if other fixes open the file.

---

### (3) ASYNC HAZARDS — ADR-0009 clause 7

**Finding F2 — BLOCKING.**

Clause 7 restates AC-04 for asyncio and is the right *intent*. The written rule is weaker than the law:

**(a) is lexical only:**

> *"No `await` on the provider gateway may appear **lexically** inside a transaction context manager."*

Concrete evasion the clause fails to forbid:

```python
async def _provider(req: CallRequest) -> RawArtifactRef:
    return await providers.call(req)  # await lives HERE

async def claim_and_judge(item_id: UUID) -> None:
    async with session.begin():           # open write TX / held locks
        item = await claim_skip_locked(session, item_id)
        await _provider(item.to_call())   # holds the lock for the model call
        # clause 7(a) is satisfied: the await of providers.call is NOT
        # lexically inside the `async with` — it is inside _provider
```

A house rule whose mechanical shape is **lexical nesting** is defeated by ordinary extraction. AC-04 is a **dynamic** property (no write lock held for the duration of the call), not a source-layout property.

**(b) covers inherited sessions; it does not cover non-transaction locks:**

```python
await conn.execute("SELECT pg_advisory_lock($1)", graph_id)  # session-level
try:
    await providers.call(req)   # holds advisory lock across the model call
finally:
    await conn.execute("SELECT pg_advisory_unlock($1)", graph_id)
```

Seam B's per-graph advisory lock is load-bearing for AC-20. Session-level advisory locks (and any long-held connection checkout used as a mutex) are write-exclusion mechanisms; clause 7 never names them. Only "transaction context manager" and "gateway's own connection" are covered.

**(c)** cancellation isolation is well stated.

**Required repair:** restate 7(a) as a **runtime / connection-state property** (no provider await while this task holds a write transaction, row lock, or advisory lock — however acquired), not a lexical AST shape. If a lint still helps, it is a *sufficient* static approximation, not the law. Explicitly forbid holding `pg_advisory_lock` / xact advisory locks / `FOR UPDATE` rows across the gateway await. Keep the owed lane-6 fixture, and make it fail the helper-extraction case above.

---

### (4) EXHAUSTIVENESS — match + pydantic union + mypy

**Finding F3 — BLOCKING.**

M3's two halves:

| Half | Claimed job |
|---|---|
| `assert_never` in fall-through | missed member → type error |
| `require-exhaustive-match` | fall-through **exists** |

The second half does **not** require that the fall-through body **is** `assert_never`. Silent pass under mypy:

```python
def handle(status: KernelStatus) -> None:  # closed union / Literal enum
    match status:
        case "ACTIVE":
            ...
        case "WAIT":
            ...
        case "INACTIVE":
            ...
        case _:
            pass   # or: raise RuntimeError("todo")
            # fall-through EXISTS → AST lint green
            # no assert_never → mypy has nothing to exhaust
            # add POLICY_BLOCKED to the union → still green until runtime
```

The design-patterns P12 text and ADR-0001 M3 table both say the lint asserts existence only. "Both halves required; either alone is a hole" is true — and the composition as written still leaves a third hole: **fall-through without `assert_never`**.

Additional residual (observation): string-tag matches and `if/elif` chains over the same vocabulary are not clearly inside the lint's subject ("match over a closed kernel vocabulary"). If the AST check is match-only, `if status == "ACTIVE": ... elif ...` re-opens the same silent non-exhaustiveness mypy already allows.

**Required repair:** the lint half must require the fall-through **form** `case _: assert_never(...)` (or equivalent Never-returning call the type checker understands), not merely a `_` branch. State whether `if/elif` over kernel vocabularies is in scope or forbidden in favor of match.

---

### (5) TWO-RUNNER SEAM — G2 never-called list

**Finding F4 — BLOCKING.**

The cost is named in three places:

- ADR-0012 Consequences: assembled from **two** coverage sources joined by M2's inventory; force unchanged, assembly is not;
- `06` §2 unit row: same claim, points at §14;
- `03` §12 orphan-audit row: *"G2 call coverage **assembled from both test runners**"*.

What is **missing** is the mechanism:

| Location | What it says about merge HOW |
|---|---|
| `06` §14 `never-called list` | only `FX-ORPH-02` — no two-runner language |
| `06` §11 **FX-ORPH-02** | still *"a **runtime call tape** from the acceptance run"* — **singular**, pre-DR-105 wording |
| ADR-0012 | "joined by the same inventory M2 produces" — join key named, **union/intersect/rules not** |

Open questions S00 cannot answer from the text:

- Is the blocking list the **union** of uncovered executable units from pytest coverage and the web runner?
- Does inventory membership gate which web symbols count (UI components not on the OpenAPI pointer)?
- Does engine-only pure code (not on the inventory) still enter G2 from pytest alone?
- Is the "acceptance run" still one process, or two taped runs concatenated?

**Required repair:** re-express `FX-ORPH-02`'s mechanism under DR-105 with an explicit assembly rule (inputs, join key, union vs inventory-filtered set, what "entry" means on each side). Point §14's never-called row at that rule. Until then the **BLOCKING** launch gate is vague exactly where the language swap made it hard.

---

### (6) COUNT ARITHMETIC

**Arithmetic: PASS.** Independent recount of §5.4 table = **28** rows; total = 18 shipped (§5.1 after dissolved) + 6 + 9 + 28 = **61**; bootstrap class = **6**. §5.4-ii delta (+`pythonVersion`, +`uvVersion`) is consistent. `07` S0 scaffold is a **ten-row** table consistent with uv workspace + web lockfile + FastAPI/OpenAPI/codegen + inventory + import-linter + three AST checks + Alembic + pytest/hypothesis/testcontainers + replay `__all__` pin.

**Finding F5 — BLOCKING (residual prose contradiction).**

`05` claims the re-derivation touches "exactly three places" (§5.4 rows, §5.4a, §5.6 counts) and that the class is **six**. Two residues still say **four**:

| Location | Text |
|---|---|
| `05` §1.1 `resolution_scope` cell (L137) | *"the marker `bootstrap` on the **four** rows that must be readable before the database exists"* |
| `05` §8 first bullet (L801–802) | *"That includes the **four** bootstrap pins"* |

A builder reading §1.1 or §8 will implement four pins; a builder reading §5.4a/§5.6 will implement six. That is exactly the silent arithmetic defect PRE-10's recount exists to prevent.

**Required repair:** both residues → **six**, and a quick pass for any other "four bootstrap" strings outside the historical recount tables.

---

### (7) SEAT-CHOICES — ruff's no-custom-rule vs three AST checks

**PASS with observation.**

Weakest seat-choice is correctly argued: ruff has no custom-rule API → three repo-local AST checks. Who runs them and where:

| Check | CI stage (`06` §14) | S0 scaffold (`07` row 7) | Named in `03` §6.3 / §12 |
|---|---|---|---|
| `no-source-literal-constant` | **lint** (build force) | yes | yes |
| `require-exhaustive-match` (fall-through half) | **lint** | yes | yes |
| `no-unlabeled-number` | **lint** | yes | yes |
| `import-linter` (no-impure + edge table) | **lint** | row 6 | yes |

Honesty notes in `03` §6.3 (maintained code; fire-both-ways fixtures) are sufficient for a design ticket. Fixture **ids** for the three AST fire-both-ways limbs remain lane 6's — consistent with "no fixture id minted" discipline.

Subject to F3: once the fall-through form is tightened, the lint-stage description must match.

---

### (8) Eighteen patterns + DR-115

**PASS.**

- P1–P18 present; shapes (modular monolith, FC/IS, contract-first facade, gateway, event sourcing, CQRS-lite, aggregate lock, strategy+registry, gate pipeline, ledger identity, work queue, ADTs, memento replay, SSE observer, bulkhead, shadow mode, DDL authority, attestations) are **not** quietly rewritten.
- Stack-named re-grounds (P1 workspace, P2 import-linter, P3 FastAPI/pydantic/codegen, P11 asyncio clause 7, P12 pydantic unions + dual exhaustiveness, P17 Alembic/Core/asyncpg + rule 4) match the ADRs.
- **DR-115** is the new first anti-pattern entry; cites ADR-0009 cl.1 and ADR-0012 cl.7; names the replay-cannot-detect trap. Correct as new law, not a P-shape change.
- P7 still uses `withGraphWrite` / `GraphWriter` tokens — API shape names, not a stack regression; no finding.

---

### (9) Eleven ADRs + `02` untouched; no version numerals

**PASS.**

| Check | Evidence |
|---|---|
| 16 ADRs total; 5 re-instantiated | mtimes 2026-08-07 on 0001/0002/0003/0009/0012 + README |
| 11 survivors untouched | 0004–0008, 0010, 0011, 0013–0016 all mtime 2026-08-06 |
| `02-data-model.md` not opened | mtime 2026-08-06 23:18:36; no PRE-10 touch |
| No tool version numerals in scope | grep clean for package/runtime pins; `0.1.0` only as DR-104(3) GPG-4 |

---

## What is strong (so rework does not thrash good work)

1. **Four replacement mechanisms (M1–M4)** are the real substance of ADR-0001; adapter-vs-generated-projection distinction is precise; M4's "small closure, not clever tool" limit is charter-grade honesty.
2. **OpenAPI never checked in**, types-only codegen, full-client-generator rejection (second runtime validator = D4) — correct.
3. **ADR-0003 rule 4** (autogenerate drafting-only; cannot see CHECKs/triggers/grants) is the right new mistake-to-forbid under Alembic.
4. **DR-115** fold is excellent: gateway-only entry, no-fallback, typed synthetic marker on the artifact, import fence, and the replay blind spot stated where builders will look.
5. **Symbol-granularity ceremony proof** under Python (`__all__` is not enough; walk actual imports; AST for local duplicate) is tighter than a hand-wavy "exports" claim.
6. **Honest costs** of two lockfiles, two typecheckers, lost single-type-graph, build-time-not-compile-time Core inventory — not softened.
7. **S0 scaffold list** is executable and cites DR-115 on the first line where temptation is highest.

---

## Required rework list (same Claude session)

1. **F1** — Pin production JSON path; forbid alternate serve codecs; encoder fixture = serve path; join Decimal prohibition to it.  
2. **F2** — Rewrite ADR-0009 clause 7(a) as dynamic lock/transaction state law; cover advisory / `FOR UPDATE` holds; defeat helper-extraction.  
3. **F3** — `require-exhaustive-match` requires `assert_never` (or Never) in the fall-through, not mere existence; clarify if/elif.  
4. **F4** — Re-express `FX-ORPH-02` (+ §14 pointer) with explicit two-runner assembly rules.  
5. **F5** — `05` L137 and §8 "four bootstrap" → **six**; sweep any other four-bootstrap residue outside historical recount tables.

Optional (if files are open): name the M1/M2 type-assertion / second-mirror residual under D4 costs.

---

## Independence statement

Did **not** read any Codex verdict, any `reviews/pre-10-codex*`, or any ticket comment after the worker's READY FOR PEER REVIEW handoff. Judgment is from the scoped artifacts + PROG ledger DR-104/105/112/115 + Plan.md §9 + `02` mtime/presence only.

---

## Verdict line (for board)

```
GROK REVIEW: CHANGES REQUESTED — (1) byte-identity serializer not E2E-pinned (orjson/serve-path hole); (2) ADR-0009 cl.7 lexical await is evadable + advisory-lock gap; (3) require-exhaustive-match allows non-assert_never fall-through; (4) FX-ORPH-02/G2 two-runner merge unspecified; (5) 05 residual "four bootstrap" vs six keys
```

---

# PRE-10 Grok peer review — REV 2 (independent lens)

**Ticket:** `t_d467ee8a` — PRE-10 · DR-117/DR-118 stack re-instantiation (TS restored + Hatchet + deploy)  
**Reviewer:** Grok (DR-101 peer lens; Claude-authored ticket)  
**Revision:** **REV 2** — rev-1 diamond superseded by DR-117 human stack sitting; this review is fresh and independent  
**Protocol:** Independent under DR-101 — no Codex verdict, no `reviews/pre-10-codex*`, no post-rev-2-handoff peer comments read  
**Comments read through:** `claude-worker` READY FOR PEER REVIEW (rev 2) (2026-08-07 11:25); DR-117 supersession notice (2026-08-07 10:40)  
**Scope judged (UNTRACKED, read directly):**

| Artifact | Role |
|---|---|
| `docs/architecture/01-decisions/ADR-0001` / `0002` / `0003` / `0009` / `0012` | five restored stack ADRs |
| `docs/architecture/01-decisions/ADR-0017` / `0018` | two minted ADRs (Hatchet; deploy/vLLM) |
| `docs/architecture/01-decisions/README.md` | set status + rev-2 record |
| `docs/architecture/03-module-design.md` | package map + §1.3 service map |
| `docs/architecture/05-register-skeleton.md` | four bootstrap keys + §5.4c pin proposal |
| `docs/architecture/06-test-strategy.md` | TS test stack; zero fixture churn |
| `docs/architecture/07-build-order.md` | GPG + ten-row S0 scaffold |
| `docs/missions/2026-08-06-v3-programming/design-patterns.md` | 18 patterns re-ground |
| `docs/missions/2026-08-06-v3-programming/ratification/hatchet-vs-inngest-grok.md` | **own** evaluation record (ADR-0017 claim: every con carried) |

**Must stay untouched:** `02-data-model.md`  
**Ground truth:** PROG ledger **DR-117 / DR-118 / DR-115** (and DR-105 SUPERSEDED)  
**Posture:** red-team — this gates all implementation.

---

## Verdict (rev 2)

**CHANGES REQUESTED**

Two blocking findings. The DR-117 restoration and DR-118 engine mint are substantially correct: TS is operative again, Python is record-not-option, ADR-0017 carries the evaluation cons by §A reference, lineage/SSE/co-tenant/pin arguments hold under attack, counts check, `02` is untouched, and no invented tool-version numerals appear. What does **not** yet gate implementation is ADR-0017 clause 3's claim composition under the nastiest reaper interleaving, plus two stale operative status sentences that contradict the DR-117 discharge they sit beside.

---

## Ground-truth alignment (non-blocking baseline)

| Source | What PRE-10 rev 2 must satisfy | Result |
|---|---|---|
| **DR-117** | Restore TS as ruled text (Fastify+TS+SSE, Postgres+Drizzle, workers TS initially); absorb durable-exec either/or, vLLM, Compose/Hetzner/Cloudflare; preserve Python as superseded record; PRE-10 re-scope | **Met** — five ADRs restored with superseded-episode sections; 0017/0018 minted; docs re-aligned |
| **DR-118** | Hatchet self-hosted Postgres-first; dispatcher only; posture clauses (RabbitMQ off, claim mapping, child tasks, register-bound retries, dedicated schema) | **Met** in ADR-0017 clauses 1–6 |
| **DR-115** | No scaffolded runtime data; fixtures confined; real artifacts only | **Met** — 0009 cl.1, 0012 cl.7 (survived reversal), 0017 cl.4, design-patterns anti-pattern #1, 07 S0 bind; replay blind spot restated |
| **Plan.md §9** | Context map, data model, API direction survive both replacement and reverse | **Met** — eleven non-stack ADRs not in scope; `02` mtime 2026-08-06 23:18, never opened this pass |
| **Own artifact** | ADR-0017 claims every con from `hatchet-vs-inngest-grok.md` carried into Consequences | **Met for §A cons 1–8** (see limb 2); §C risks mitigated by clauses rather than restated as costs |
| **No invented numerals** | Tool/image versions absent from C4 docs | **Met** — bootstrap values still `— none stated`; GPG-4 `0.1.0` / `register_version` 1 are ruled identities, not seat pins |
| **Counts** | four bootstrap keys; net-zero register round trip; ten S0 rows; zero fixture churn; 18 patterns | **Met** — see limb 7 |

---

## Red-team limbs (the eight hunts)

### (1) ADR-0017 clause 3 — claim / no-op / expiry composition

**The three named interleavings (engine redelivery while claim live + call in flight; engine assignment expiry between claim-COMMIT and gateway call; worker crash after claim-COMMIT before the call):**

| Scenario | What clause 3 says happens | Double-real-call? |
|---|---|---|
| **A — redelivery while attempt-1's model call is in flight and claim is live** | Attempt-2's first lines find live claim → **no-op, no model call** | **Closed** — one in-flight call only |
| **B — engine assignment timeout between claim-COMMIT and gateway call** | Engine timeout does **not** release our claim; re-dispatch against live claim is a no-op; engine decides *when to try*, claim decides *whether work happens* | **Closed** for double-call (progress may wait on reaper if attempt-1 was cancelled — intentional dual mechanism) |
| **C — worker crash after claim-COMMIT before the call** | Claim remains live; redelivery no-ops until **our reaper** expires the claim; then legitimate re-claim | **Closed** for double-call; stuck window = `claim_deadline` by design |

So the composition **holds** for the three scenarios the ticket named, **provided the claim stays live for the whole of legitimate work**.

**Finding F1 — BLOCKING. The text does not close a double-real-call window once that proviso fails.**

**Nastiest residual interleaving (constructive):**

1. Attempt-1: short txn → claim `core.work_item` → **COMMIT** → starts gateway/model call (vLLM or hosted; call bound may be long).  
2. `claim_deadline` elapses **while the model call is still in flight** (mis-set register value, no heartbeat, or reaper schedule tighter than the call bound).  
3. **Our reaper** expires the claim (AC-89 write half) — legitimate under the written rules; engine re-dispatch is not required for this hole.  
4. Attempt-2 (engine redelivery **or** a later poller path): claims successfully → **second real model call**.  
5. Attempt-1 returns → gateway writes artifact + ledger row; Attempt-2 also writes → **two real calls, two ledger rows, unbudgeted cost**, and possible double-side-effect depending on how completion merges.

Clause 3's safety sentence is only:

> *finds the row already claimed under a **live** deadline, and exits as a no-op*

That is **vacuous once the deadline is not live**. The composition slogan (*"two mechanisms, one decision point"*) assumes claim lifetime ⊇ attempt lifetime and **never states that invariant**. No heartbeat / claim-extension rule, no binding of `claim_deadline` to the call-site bound (`max_attempts` / `token_ceiling` / `deadline` register row), and no "in-flight ownership" check appears in ADR-0017, ADR-0009 clause 7(d), or P11.

**Secondary hole (same finding, same first-lines sequence):** clause 3 narrates only the **live-claim** no-op. Post-success redelivery after claim release / terminal status is left to law 2's *"idempotent `(row, node-set)` command"* without requiring the **same first-lines sequence** to short-circuit on *terminal work item or already-ledgered artifact for this identity*. A builder who implements only the live-claim check can re-enter the model path when the claim is gone but the work is done. Law 2 is the right authority; clause 3 must **name it in the first-lines checklist**, not only as a background law.

**Required repair (design text, not code):** extend clause 3 (and mirror in P11 / ADR-0009 cl.7(d) as needed) with an explicit composition invariant, e.g.:

1. **`claim_deadline` must cover the in-flight call** (bound ≥ call-site deadline + slack, **or** the worker must extend/heartbeat the claim until gateway return or typed failure) — so the reaper cannot open a reclaim window under a live attempt.  
2. **First lines of every task, in order:** open short txn → attempt claim **or** observe terminal/already-settled identity for this `(row, node-set)` → **COMMIT** → **only then** model; if claim lost mid-flight because deadline expired, that is a **defect in the bound**, not a licence for a second call — and the command body must still refuse a second gateway entry when an artifact/ledger row for this work item already exists (law 2 made mechanical).

Until that is written, **at-least-once + reaper is not proven safe against double real calls** under realistic vLLM latency.

---

### (2) Own cons — §C (and §A) row-by-row against ADR-0017

ADR-0017 Consequences claims costs *"each named in the evaluation record"* and cites **§A con N**. Walk:

| Evaluation record | Carried? | Where |
|---|---|---|
| **§A con 1** Dual bookkeeping permanent | **Yes** | Consequences bullet 1; clause 2 |
| **§A con 2** RabbitMQ pull | **Yes** | Consequences bullet 2; clause 1 (defect if running without recorded exception) |
| **§A con 3** gRPC extra surface | **Yes** | Consequences bullet 3 |
| **§A con 4** Determinism tax | **Yes** | Consequences bullet 4; clause 4 |
| **§A con 5** Retries re-run real work | **Yes** | Consequences bullet 5; clause 5 |
| **§A con 6** Claim semantics engine-owned | **Yes** | Consequences bullet 6; clause 3 (discipline engine cannot check) |
| **§A con 7** Younger ecosystem / unproven at workload | **Yes** | Consequences bullet 8 (*"unproven for this workload"*) |
| **§A con 8** Shared Postgres capacity | **Yes** | Consequences bullet 7; ADR-0003 costs |

**§C law-by-law sharpest risks (Hatchet column)** — not listed as "cons" in Consequences, but mitigated by clause:

| Law | §C risk | Mitigated by |
|---:|---|---|
| 1 | Task before our claim; assignment-as-claim | clause 3 (**residual F1**) |
| 2 | At-least-once double model call | clause 3 + law 2 identity (**residual F1**) |
| 3 | Txn held across model await | ADR-0009 cl.7(a)–(c) |
| 4 | Engine resume ≠ battery resume | clause 2; ADR-0009 cl.4 rev-2 clarification |
| 5 | Extra real calls; engine output as artifact | clauses 4–5; DR-115 boundary |
| 6 | Rabbit / capacity | clauses 1, 6 |
| 7 | Engine history as sequence of record | clause 2 (`at_seq` wins) |

**Silently dropped §A cons:** **none.**  
**§C residuals not fully closed:** laws 1–2 under reaper mid-flight — same as F1; not a silent drop of a named con, a **composition hole inside the claimed mitigation**.

---

### (3) ADR-0018 lineage law — two attacks

**Attack 1 — two different open-weights models from the same maker, one vLLM.**  
Clause 3(c): *"Running two models under one vLLM service does not by itself create maker diversity — if both weights come from the same maker, the floor sees one maker."*  
**Right answer:** one maker (e.g. Meta×2), two `model_id`s; diversity floor is **makers**, not models or serving runtimes. **Text correct.**

**Attack 2 — fine-tune of another maker's base.**  
Rule: lineage is the **served model's maker**, not vLLM, not "the base weight's brand by default." Natural reading: the **producer of the served weights** (the fine-tuner) is the maker attributed to the inventory / DR-013 floor; listing "vLLM" is a defect; listing only the base maker while serving a third-party fine-tune is the same class of mis-attribution.  
**Right answer under the written rule:** fine-tuner = maker of the served model.  
**Gap (non-blocking observation):** fine-tune-of-base is not named as a worked example. A hurried inventory author could still write the base house. Not a wrong rule — an underspecified edge. ADR-0015 remains the inventory design; this ADR correctly limits itself to *which maker a locally served model is attributed to*.

**Limb 3: PASS** (no blocking repair required).

---

### (4) SSE route clauses — Cloudflare buffering

ADR-0002 (three SSE clauses) + ADR-0018 clause 1: stream is a **route** of `apps/api`; event shapes in `packages/contract`; projection-grade only; **proxy buffering is the classic silent break**; fix is **proxy configuration, never a second path**.

**Does Cloudflare buffering actually break SSE as described?**  
Yes, as a class: reverse-proxy / edge buffering (and cache eligibility) is a standard way an `text/event-stream` response stops delivering event-by-event and only flushes on buffer fill or close. The trap narrative is accurate enough for architecture. Cloudflare-specific siblings (cache rules that store the stream, multi-minute connection/proxy timeouts on lower plans) are **further operational failure modes of the same shape** — still fixed as edge/proxy configuration, still must not become a direct-to-origin second path.

**Is proxy-config-not-second-path the complete *architectural* fix?**  
**Yes for AC-60.** Opening a grey-cloud / direct-origin stream "because Cloudflare buffers" is exactly the V2 three-path seam. Naming timeouts and cache-bypass as deployment work (not a licence for a second address) is the right boundary; the ADRs do not need a Cloudflare runbook.

**Limb 4: PASS.** Optional note for implementers (not a change request): treat connection-duration limits as part of the same proxy config limb.

---

### (5) Co-tenant (ADR-0003 rule 4) and pin proposal (05 §5.4c)

**Co-tenant poke.**  
Rule 4: engine schema not in our lineage / not in `02`; no V3 joins across the boundary; AC-02 not breached because dispatch bookkeeping is **not V3 domain data** and co-location preserves **one backup lineage**; second instance under load is operational.

Pokes that **do not land as defects:**

- *"Dispatch state affects whether work runs"* — true, but ADR-0017 clause 2 already forbids treating engine state as ledger / `at_seq` / run state; the no-join rule stops the easy authority leak.  
- Shared capacity is **named** as cost (§A con 8), not soft-pedaled.  
- "Not domain data" is a clean AC-02 reading when settlement / ledger / memory remain the one store; co-tenant is the law-6 posture DR-118 chose.

**Pin proposal poke (§5.4c).**  
Compose pins Hatchet/vLLM image tags; not register rows; counter-argument with `postgresMajorVersion` recorded; flip condition if vLLM **build** (not `model_version`) moves a served number; exact tags + compose as acceptance-bundle build input required; **SEAT-PROPOSAL**.

Pokes:

- Distinction from `postgresMajorVersion` (DDL/`SKIP LOCKED` semantics vs which container build runs) is **coherent**.  
- Flip condition is the right test; it is **honest** that a reviewer may overturn.  
- Soft residual (observation): Hatchet version can change retry/assignment interleaving and thus multi-attempt cost under F1's window — not "arithmetic of a served number," but outcome-adjacent; still acceptable as compose pin **if F1 closes**.  
- vLLM version can change outputs for the same `model_version` string — the flip condition already invites that objection.

**Limb 5: PASS** (arguments hold; SEAT-PROPOSAL status correctly leaves overturn room).

---

### (6) Superseded-episode hygiene — Python-era as OPERATIVE text?

Grep across the seven ADRs + README + 03/05/06/07 + design-patterns for `FastAPI|pydantic|Alembic|pytest|hypothesis|asyncpg|SQLAlchemy|uv|import-linter`:

| Location | Form | Operative? |
|---|---|---|
| Status banners / options considered / "superseded episode" sections | record of DR-105→116→117 | **No** — correctly labeled SUPERSEDED / record-not-option |
| `05` §5.4-ii `pythonVersion`/`uvVersion` | round-trip arithmetic | **No** — history of withdrawn keys |
| `03` / design-patterns / `07` GPG-2 history | narrative of the interval | **No** — history |
| `06` / `07` "hypothesis + research plan" | Q51 **domain** downgrade language | **No** — not the test library |
| **Decision / Decision tables / operative stack rows** | TypeScript, Fastify, Drizzle, Vitest, fast-check | **Clean** |

**Finding F2 — BLOCKING (hygiene / contradictory operative status, not Python stack residual).**

Python-era **tooling is not left as the ruled stack.** Two **non-Python** residuals leave **false operative status** next to the DR-117 discharge:

1. **`03-module-design.md` §0:** *"V still ratifies the stack (DR-005 as narrowed by DR-024)."*  
   **False under DR-117.** The banner at the top of the same file correctly says the stack is ruled; §0 still reads as open ratification. An implementer or reviewer skimming §0 gets the pre-sitting state.

2. **`07-build-order.md` §3.2 S0 entry-criteria row** still says **GPG-3/GPG-4 still open at VG-01**, while §3.1 and the S0 criterion-0 table state **all four GPGs discharged** (GPG-3 values fill at S00 under DR-104; GPG-4 at DR-104(3)). **Internal contradiction** on the document that gates S0.

**Required repair:** flip §0's stack sentence to DR-117 discharged; align §3.2 S0 row with §3.1 / criterion 0.

No FastAPI/pydantic/Alembic/pytest/SQLAlchemy left as **chosen** operative decision text.

---

### (7) Counts

| Claim | Evidence | Result |
|---|---|---|
| **Four bootstrap keys** | `nodeRuntimeVersion`, `pnpmVersion`, `postgresMajorVersion`, `typescriptVersion` in 05 §5.4 / §5.4a; FX-REG-01 four keys; GPG-3 four pins | **PASS** |
| **Net-zero register round trip** | §5.4-ii: 26→28→26 / 59→61→59; DR-105 +2 withdrawn by DR-117 −2 | **PASS** |
| **Ten S0 rows** | 07 S0 scaffold table rows 1–10 (workspace through claim discipline + hatchet-lite) | **PASS** |
| **Zero fixture churn** | 06 banner + FX-REG-01 still four keys; no FX id minted/renamed/retired claimed and consistent with four-key restore | **PASS** |
| **18 patterns** | design-patterns P1–P18 present; P11 re-grounded on Hatchet; DR-115 anti-pattern retained | **PASS** |

---

### (8) No invented numerals; `02` untouched

| Check | Result |
|---|---|
| Tool/image version literals in PRE-10 scope | **None found** as pins; `0.1.0` / `register_version` 1 are GPG-4 ruled identities |
| `02-data-model.md` | mtime **2026-08-06 23:18**; ADRs touched **2026-08-07**; status untracked/unmodified this mission window; ADR-0003 asserts never opened either pass | **PASS** |

---

## What is strong (so rework does not thrash it)

- **DR-117 restoration discipline:** Python episode preserved as measurement, not option; four language-neutral findings kept (exhaustive fall-through exists; isolation reads imports; pinned property seed; schema-diff generator never authority).  
- **ADR-0017 structure:** seven-law acceptance bar, Option D as honest baseline closed by ruling, claim≠assignment table, dual bookkeeping named permanent, unproven workload not papered over.  
- **ADR-0018:** one-transport through proxy; ceremony independence as topology; vLLM as ordinary Seam C adapter; maker ≠ runtime.  
- **DR-115 survival across reversal** — strongest evidence the confinement clauses were never language-bound.  
- **§5.4c** correctly marks itself SEAT-PROPOSAL with flip condition and counter-argument.

---

## Blocking findings summary (rev 2)

| # | Finding | Where to repair |
|---:|---|---|
| **F1** | Claim/no-op/expiry composition does not close **reaper (or `claim_deadline`) mid-flight** double-real-call; first-lines sequence must also short-circuit **terminal / already-ledgered** identity, not only live claim | ADR-0017 cl.3; mirror P11 + ADR-0009 cl.7(d) as needed |
| **F2** | Stale operative status: `03` §0 still says stack unratified; `07` §3.2 S0 row still says GPG-3/GPG-4 open at VG-01 | `03-module-design.md` §0; `07-build-order.md` §3.2 |

---

## Non-blocking observations (do not block APPROVED once F1–F2 land)

- Fine-tune-of-base maker attribution is rule-correct but example-light (limb 3).  
- Cloudflare connection-duration limits sit beside buffering under the same proxy-config limb (limb 4).  
- §5.4c flip condition could mention engine build only if attempt interleaving is ever treated as verdict-bearing — optional; F1 is the real fix.

---

## Verdict line (for board) — REV 2

```
GROK REVIEW (rev 2): CHANGES REQUESTED — (1) ADR-0017 cl.3 claim/no-op leaves double-real-call window when claim_deadline/reaper fires mid-flight (and first-lines omit terminal/already-ledgered short-circuit); (2) stale operative status — 03 §0 still says stack unratified; 07 §3.2 S0 row still says GPG-3/GPG-4 open at VG-01
```

**Independence declaration:** no `reviews/pre-10-codex*`, no Codex board verdict, no post-rev-2-handoff peer comments read. Own evaluation record `ratification/hatchet-vs-inngest-grok.md` read as ground truth for the "every con carried" claim. Rev-1 section above is historical; **this REV 2 section is the live verdict.**

**PEER REVIEW CHANGES REQUESTED** — same Claude worker session revises under preserved law.

---

# PRE-10 Grok peer review — REV 2.1 (independent lens · re-review)

**Ticket:** `t_d467ee8a` — PRE-10 · DR-117/DR-118 stack re-instantiation  
**Reviewer:** Grok (DR-101 peer lens; Claude-authored ticket)  
**Revision:** **REV 2.1** — re-review after Grok rev-2 CHANGES REQUESTED (2 findings)  
**Protocol:** Independent under DR-101 — no Codex verdict, no `reviews/pre-10-codex*`, no peer-lens content other than this file's own prior sections  
**Comments read through:** `claude-worker` READY FOR PEER REVIEW (rev 2.1) (2026-08-07 12:34); own prior rev-2 findings in this file  
**Repaired regions judged (read directly):**

| Artifact | Repair target |
|---|---|
| `docs/architecture/01-decisions/ADR-0017` clause 3(a)–(f) + Decision intro SEAT carve-out + Costs double-call residual | F1 |
| `docs/architecture/01-decisions/ADR-0009` clause 7(e) | F1 mirror |
| `docs/missions/2026-08-06-v3-programming/design-patterns.md` P11 (eight laws) | F1 mirror |
| `docs/architecture/03-module-design.md` §0 + closing bullet | F2 |
| `docs/architecture/07-build-order.md` §3.2 S0 entry row | F2 |
| `docs/architecture/06-test-strategy.md` closing bullet | F2 sweep |
| `docs/architecture/01-decisions/README.md` §4 historical fold-in row | F2 sweep |

**Posture:** red-team the repair — not re-litigate closed limbs; attack residual composition and authority labeling.

---

## Verdict (rev 2.1)

**CHANGES REQUESTED**

One blocking finding remains. Rev-2 **F2 is fully discharged**. Rev-2 **F1 is substantially repaired** (five-case table, honest case D, first-lines three-check narrative, claim-outlives-call invariant, mirrors, accepted residual cost) — but **§3(b) step 2's short-circuit predicate is over-broad as written** and, taken literally, collides with multi-attempt retry after a ledgered typed failure. That is a new residual inside the repair of F1's secondary hole, not a re-open of case D's honesty.

---

## (1) Re-run of rev-2's three interleavings + case D attack

### Own three interleavings against the new five-case table

| Rev-2 scenario | Table case | Claimed closure | Holds? |
|---|---|---|---|
| Redelivery while attempt-1 call in flight, claim **live** | **A** | step 3 live-claim → no-op | **Yes** |
| Engine assignment timeout between claim-COMMIT and gateway | **B** | engine timeout ≠ claim release; re-dispatch no-ops on live claim | **Yes** |
| Worker crash after claim-COMMIT before the call | **C** | claim stays live until **our** reaper; then legitimate re-claim | **Yes** |

Added cases from the repair:

| Case | Claimed | Holds? |
|---|---|---|
| **E** — redelivery after settle + claim release | step 2 ledger/settled short-circuit regardless of claim liveness | **Yes for post-success** (see F1 below for non-terminal ledger rows) |
| **D** — `claim_deadline` elapses mid-flight | second real call **POSSIBLE** — named residual, not papered over | **Honest** |

Rev-2's constructive double-call under reaper mid-flight is **no longer claimed closed**. It is case D, costed in Consequences, mirrored in ADR-0009 7(e) and P11 law 4. The earlier vacuous slogan ("our claim decides whether work happens") is corrected to claim **and ledger** (3(f)). **That limb of F1 is discharged.**

### Attack on case D's safety argument — wrong served number or unreplayable state?

**Properties under test (3(e), all required):** attempt-scoped identity (append-only dual writes); first-settled-wins via conditional update; loser recorded as superseded and **never** served-number provenance; one `max_attempts` budget counts both.

**Constructive attempts:**

1. **Settle race, both succeed.** Conditional update `WHERE not already settled` — only one commit wins. Second cannot overwrite. **No dual-settled state** under compliant SQL.
2. **Loser finishes later with a different model number; serve path walks "latest artifact for work_item".** Would yield a wrong served number — **only if the serve path violates 3(e)(2)**. Under the written rule, provenance is the **winning** attempt's artifact (settle pointer / settled outcome), not max(`at_seq`) among attempts. That is **rule-level construction**, not a free join. Compliant implementation does not serve the loser's number.
3. **Discard loser to "tidy" books.** Explicitly forbidden (AC-44/AC-45); would be the DR-115/audit breach, not the residual.
4. **Budget double-count / overshoot by one under concurrent claim-time checks.** Cost and bound visibility — **not** a wrong served number; 3(e)(3) accepts bounded pathology.
5. **Which real call wins the race is non-deterministic across zombie incidents.** Cross-run choice among two real outcomes is residual **cost/consistency**, not AC-07 failure: replay of the **recorded** winner + its artifact is deterministic (AC-06/AC-07).

**Conclusion on the asked attack:** **I cannot construct a scenario** in which first-settled-wins + attempt-scoped identity + one budget + "loser never provenance", **under a compliant reading of 3(e)**, yields a **wrong served number** or an **unreplayable** settled state. The residual remains **cost, dual real side-effects, and race-winner non-determinism among real calls** — which the ADR now states as accepted rather than designed away. **Not blocking on that limb.**

(Replay determinism of the *loser* row: it stays on the ledger as superseded; it is not an input to the served number. That is correct for AC-44 without polluting AC-07.)

---

## (2) Loser-as-superseded-attempt vs served provenance (replay)

**By rule, yes — out of served provenance.** 3(e)(2): settle is a conditional update; loser artifact + ledger row remain, marked superseded duplicate; **that artifact never becomes a served number's provenance**; replay points at the winning attempt (AC-06, AC-07).

**By physical schema construction in `02`:** not newly minted here (`02` untouched, correctly). The construction is the **settle pointer + mark + serve-path discipline**, restated in three homes (0017 / 0009 7(e) / P11). That is enough at this design gate: an implementer who joins "any attempt artifact" for the primary number has breached the clause, not discovered a silent hole.

**No blocking finding on (2).**

---

## (3) `claim_deadline` derivation + heartbeat vs ADR-0009 7(a)

| Claim | Assessment |
|---|---|
| Derive `claim_deadline` from `CallBound.deadline` + margin (both register, no numeral) | **Sound default.** Healthy attempt's claim lifetime ⊇ declared call bound + slack; mis-size is a register defect, not a licence for a second call (stated). |
| Heartbeat / short separate txn as alternative when bounds vary (vLLM latency) | **Sound alternative.** Frozen worker stops heartbeats → same case D residual — honestly the same irreducible window. |
| "Not a breach of 7(a)" | **Honest.** 7(a) forbids an **open** transaction **across** the model call. A later short extension txn is a new unit of work, not a held lock for the call duration. 0009 7(e) restates the same distinction. |
| Derivation as default (no write path during call; no liveness from a worker that may be dead) | **Right preference.** Heartbeat needs the live worker; derivation does not. |

**No blocking finding on (3).**

---

## (4) Rev-2 F2 five sites + class grep

| Site | Status |
|---|---|
| `03` §0 stack sentence | **Corrected** — stack RULED DR-117/DR-118; GPG-3/4 authorities; values remain V's at DR-023/VG-02 |
| `07` §3.2 S0 entry row | **Corrected** — GPG-1…GPG-4 ALL DISCHARGED with inline authorities; agrees with §3.1 and criterion 0 |
| `03` closing "stack is a proposal" | **Struck and replaced** with RULED + Plan §9 proven both directions |
| `06` closing "stack is a proposal" | **Struck and replaced** with RULED + zero fixture-id churn tested |
| README §4 "itemized confirmation at VG-01" | **Annotated** — historical; confirmation was DR-116 sitting → DR-117+DR-118 |

**Own class grep** (`V still ratifies the stack` / `The stack is a proposal` / GPG open-at-VG-01 contradictions) inside PRE-10 touch set: **clean**.

**Out-of-scope residuals (observation only — not re-opened F2):**

- `docs/architecture/00-overview.md` still carries **"The stack is a proposal"** (mtime 2026-08-06; never in PRE-10 file list).
- `docs/architecture/02-data-model.md` still carries **"V still ratifies the stack"** — **must stay untouched** under Plan §9; correct non-edit.
- `07` S0 "Carriers-only zone" still says GPG-3/GPG-4 are hard prerequisites **at VG-01** — historical phrasing about prerequisite *force*, not the contradictory "still open" §3.2 row that F2 named. Not a return of F2.

**F2: DISCHARGED.**

---

## (5) SEAT-PROPOSAL labeling of 3(b)–(f)

Decision intro is careful:

- **RULED (DR-118 posture):** clauses 1, 2, 4, 5, 6 + **headline of clause 3**
- **SEAT-PROPOSAL:** sub-clauses **3(b)–(f)** — reviewer may overturn without re-opening a ruling

**3(a)** sits under the headline / assignment≠claim table — that *is* DR-118 posture; correct not to mark it SEAT.

**Does anything in 3(b)–(f) still read as V-ruled that V never ruled?**

| Location | Risk | Severity |
|---|---|---|
| Constraints row DR-118: *"clauses 1–6, verbatim posture"* | Soft — "posture" can mean the numbered clause headlines; Decision intro is the sharper authority | **Observation** — prefer a one-clause echo of the carve-out |
| ADR-0009 7(e) as "**this ADR's** laws" | Elevates seat composition into a DR-117-ruled ADR without a SEAT tag | **Observation under diamond reading** — SEAT-PROPOSAL here means *overturnable in this review diamond*; once composition is approved it is the settled queue law. Not a false claim that V sat on the five-case table |
| P11 "Eight laws" under `RULED — DR-118` banner | Laws 2–4 are seat composition under a DR-118 heading | **Observation** — same diamond reading |

**No blocking finding on (5).** The Decision intro does the load-bearing honesty work; nothing in 3(b)–(f) is labeled `RULED — DR-118` at the sub-clause level.

---

## Blocking finding (rev 2.1)

### F1 — §3(b) step 2 short-circuit predicate is over-broad (blocks retries after ledgered failure)

**Text (ADR-0017 3(b) step 2; mirrored ADR-0009 7(e); P11 law 2):**

> If this `(row, node-set)` identity already carries a **settled outcome on `core.work_item`**, **or a ledgered attempt outcome** for it, the task exits as a no-op — whatever the claim says.

**Narrative intent (same paragraphs):** step 2 closes *work already done* — post-success redelivery, engine replay after restart, manual re-enqueue. That is the secondary hole rev-2 F1 required.

**Literal predicate:** **any** ledgered attempt outcome for the identity.

**Collision with existing law:**

- ADR-0009 clause 1: a failed call produces a **typed failure and a ledger row** (never a substitute artifact).
- ADR-0017 clause 5 / DR-020: **`max_attempts`** — retries after failure are first-class; every attempt is a ledger row.
- 3(e)(1): each attempt writes its own ledger row under its own attempt identity (including losers and failures).

**Constructive break (literal builder):**

1. Attempt-1: claim → model → **typed failure** → gateway writes **ledger row** → claim released (or reaper).  
2. Work item is **not** settled as success; budget remains.  
3. Engine redelivers (legitimate retry under `max_attempts`).  
4. Step 2: finds a **ledgered attempt outcome** → **no-op**.  
5. Command never reaches a successful settle; further attempts also no-op. **Retry is dead after the first ledgered failure.**

**Stuck-incomplete variant:** attempt writes a ledger row then dies before settle; step 2 forever no-ops while `core.work_item` stays unsettled — **unrecoverable command** unless an out-of-band path settles or clears it. Case C (crash *before* call, no ledger) still works; crash *after* ledger-before-settle does not.

Case **E** in the table only narrates *settled* identity; the predicate is wider than the table.

**Required repair (design text):** scope step 2 to **command-terminal / settled identity**, not any attempt ledger row. Concretely, something equivalent to:

- no-op iff `core.work_item` already carries a **terminal settled outcome** for this `(row, node-set)` (success *or* terminal exhaustion / permanent failure — whatever the data model treats as "command complete"), **or**
- no-op iff there is already a ledgered outcome that **satisfies the command's completion criterion** (the same fact the conditional settle would record),

and **explicitly:** a prior **non-terminal** typed-failure ledger row under an attempt identity does **not** short-circuit a further attempt while budget remains and the work item is not settled.

Mirror the same narrowing in ADR-0009 7(e) and P11 law 2. Keep the "builder who implements only the live-claim check has half the rule" sentence — it stays correct once step 2 means *done*, not *any ledger ink*.

**Why this is still F1's family, not a new philosophy fight:** rev-2 required terminal/already-settled short-circuit; the repair introduced "ledgered attempt outcome" as a second disjunct without bounding it to terminal completion. Case D honesty is fine; this is the secondary hole overshot.

---

## What the repair got right (do not thrash)

1. **Five-case interleaving table** with case D irreducible and costed — the honesty rev-2 demanded.  
2. **Three-check first lines** and the "half the rule" builder warning — right shape once step 2 is terminal-scoped.  
3. **Pre-gateway re-read** correctly claimed only to *narrow* D, not close it.  
4. **3(c) derivation + heartbeat** with clean 7(a) distinction.  
5. **3(e) three properties** + DR-115 boundary (second real call is cost, not scaffold; discard would be the breach).  
6. **3(f) slogan fix** — claim and ledger together.  
7. **SEAT-PROPOSAL carve-out** on 3(b)–(f) at Decision intro.  
8. **F2 five-site status hygiene** inside PRE-10 scope, with authorities.

---

## Non-blocking observations (do not block APPROVED once F1 lands)

- Constraints DR-118 cell could echo the 3(b)–(f) SEAT carve-out in one clause.  
- `00-overview.md` still says the stack is a proposal — out of PRE-10 exclusive file set; later hygiene.  
- `02` still says V ratifies the stack — correctly untouched.  
- Prior non-blocking notes (fine-tune maker example; Cloudflare duration; §5.4c) remain do-not-block.

---

## Verdict line (for board) — REV 2.1

```
GROK REVIEW (rev 2.1): CHANGES REQUESTED — (1) ADR-0017 §3(b) step 2 "ledgered attempt outcome" short-circuit is over-broad — literal reading no-ops retries after any ledgered typed failure and can stick unsettled work; scope to terminal/settled command completion only (mirror 0009 7(e) + P11 law 2)
```

**Independence declaration:** no `reviews/pre-10-codex*`, no Codex board verdict, no other peer's rev-2.1 content read. Own rev-2 section in this file + worker handoff + repaired regions only. Rev-1 and rev-2 sections above are historical; **this REV 2.1 section is the live verdict.**

**PEER REVIEW CHANGES REQUESTED** — same Claude worker session revises under preserved law.

---

# PRE-10 Grok peer review — REV 2.2 (independent lens · re-review)

**Ticket:** `t_d467ee8a` — PRE-10 · DR-117/DR-118 stack re-instantiation  
**Reviewer:** Grok (DR-101 peer lens; Claude-authored ticket)  
**Revision:** **REV 2.2** — re-review after Grok rev-2.1 CHANGES REQUESTED (1 finding: over-broad 3(b) short-circuit)  
**Protocol:** Independent under DR-101 — no Codex verdict, no `reviews/pre-10-codex*`, no peer-lens content other than this file's own prior sections  
**Comments read through:** `claude-worker` READY FOR PEER REVIEW (rev 2.2) (2026-08-07 13:10); own prior rev-2.1 finding in this file  
**Repaired regions judged (read directly):**

| Artifact | Repair target |
|---|---|
| `docs/architecture/01-decisions/ADR-0017` §3(b) step 2 | F1 (predicate narrowing + explicit negative) |
| `docs/architecture/01-decisions/ADR-0009` clause 7(e) bullet 1 | F1 mirror |
| `docs/missions/2026-08-06-v3-programming/design-patterns.md` P11 law 2 | F1 mirror |

**Frozen (worker claim; spot-checked below):** §3(a), §3(b) steps 1/3/4/5, §3(c)–(f), Decision SEAT carve-out, Costs residual, constraints, P11 eight-law shape, F2 status sites.

**Posture:** verify both directions of the narrowing — stuck-work closed without re-opening the double-call window; mirrors coherent; frozen regions untouched.

---

## Verdict (rev 2.2)

**APPROVED**

The single rev-2.1 blocking finding is discharged. Step 2's short-circuit is now **command-completion only**; the explicit negative paragraph defeats the literal-builder retry kill; cases E and D still close / residual-honest under the new predicate; the three homes say the same law; frozen regions are intact.

---

## (1) STUCK-WORK closed — command-completion predicate

### New predicate (ADR-0017 §3(b) step 2)

Fires **only** if this `(row, node-set)` **command** carries a **settled outcome on `core.work_item`**:

- **success**, or  
- a **terminal typed state that ends the command** (exhausted attempt budget under clause 5; typed skip under clause 6; any outcome the command contract marks terminal)

→ task exits as a no-op, **whatever the claim says**.

**Explicit negative (load-bearing):**

- does **not** fire on a retryable failure  
- a ledgered **attempt** row is evidence an attempt *happened*, not that the command *finished*  
- typed failure with attempt budget remaining leaves the command **unsettled**  
- redelivery is exactly what that state is for  
- short-circuiting on any ledgered attempt outcome would strand retries permanently (resumability inverted into stuck work — worse than the double-call window)

### Constructive retry scenario (must proceed)

| Step | State / action | Step-2 result |
|---|---|---|
| 1 | Attempt-1: short txn → claim → COMMIT → model call → **typed failure** (e.g. provider timeout) | — |
| 2 | Gateway writes **ledger row under attempt identity**; claim released (or reaper later); `core.work_item` **not** settled as success or terminal | — |
| 3 | Attempt budget remains (e.g. `max_attempts` = 3, used 1) under clause 5 | — |
| 4 | Engine redelivers (legitimate at-least-once / register-bound retry) | — |
| 5 | Attempt-2 first lines: open short txn → **step 2** | command has **no settled outcome** → **does not short-circuit** |
| 6 | Step 3: claim succeeds (no live holder) → COMMIT → model call | **retry proceeds** |

**Terminal contrast (must no-op):** last attempt fails and budget is exhausted → command settles as terminal typed failure → redelivery → step 2 fires → no-op. That is completion, not stuck work.

**Literal-builder trap from rev 2.1 is closed:** the only surviving occurrence of "ledgered attempt outcome" in the ADR set is **inside the never-fires sentence**, not as a positive trigger.

**STUCK-WORK: DISCHARGED.**

---

## (2) DOUBLE-CALL still closed — narrowing does not re-open rev-2 window

### Case E — done-but-claim-released

| Fact | Against NEW predicate |
|---|---|
| Attempt-1 settled **success** on `core.work_item`; claim released | Step 2: command carries **settled success** → **no-op regardless of claim liveness** |
| Engine redelivers / manual re-enqueue / restart replay | Live-claim check is silent (claim gone); **ledger-first still fires** |

The rev-2 secondary hole was "builder implements only live-claim → re-enters model path when work is done." That path still requires step 2; narrowing **removed** the over-broad "any attempt ledger row" disjunct without removing **settled success** (or any terminal command state). **Case E remains closed.**

### Case D — mid-flight `claim_deadline` expiry

| Fact | Against NEW predicate |
|---|---|
| Attempt-1 call still in flight; reaper expires claim | Work item **not** settled |
| Attempt-2: step 2 finds nothing settled → does not short-circuit; step 3 claims; second real call | **Still POSSIBLE — residual named in §3(d)** |

Narrowing does **not** claim to close D (nor should it). Case D remains the accepted residual under 3(e)'s three properties. Pre-gateway re-read (step 5) still only *narrows* D.

### Rev-2 original double-call window (summary)

| Window | Status under 2.2 text |
|---|---|
| Live-claim redelivery while call in flight (A) | Closed — step 3 |
| Engine timeout ≠ claim release (B) | Closed |
| Crash before call, claim live (C) | Closed until reaper |
| Mid-flight reaper / mis-sized deadline (D) | Residual, honest, costed |
| Post-settle redelivery, claim gone (E) | Closed — step 2 on **command settled** |

**DOUBLE-CALL: still closed at the same places; residual still named; no re-open.**

---

## (3) Mirror coherence — three homes, one law

| Home | Positive trigger | Claim independence | Explicit negative |
|---|---|---|---|
| **ADR-0017 §3(b) step 2** | settled on `core.work_item`: success **or** terminal typed state ending the command (budget exhausted / typed skip / contract-terminal) | "whatever the claim says, live or not" | does **not** fire on retryable failure; attempt rows = evidence, never trigger |
| **ADR-0009 7(e) bullet 1** | command settled: success **or** terminal typed state that ends the command | "regardless of claim liveness" | does **not** fire on retryable ledgered failure; same evidence/unsettled/resume sentence family |
| **P11 law 2** | **settled-COMMAND** check; fires on command completion — success or terminal typed state that ends the command | "no-ops regardless of claim liveness" | **never** on retryable ledgered failure; attempt row ≠ finished; strands if mis-scoped |

**Drift check:** 0017 enumerates three terminal examples (cl.5 budget, cl.6 skip, contract-terminal); 0009 and P11 state the same category without the three-example list. That is **depth of exposition**, not a different rule — implementers of the full composition read 0017; the mirrors correctly refuse the over-broad attempt-row trigger. Naming shifted from "settled/already-ledgered" to "settled-COMMAND" / "scoped to command completion" consistently.

**No mirror drift. PASS.**

---

## (4) Frozen-region spot-check (two samples + table)

Worker claimed 3(a)/(c)–(f) + F2 frozen. Spot-checked:

| Region | Spot-check | Intact? |
|---|---|---|
| **3(a)** assignment ≠ claim table | four-row table (what / owned by / delivery / authorizes) unchanged | **Yes** |
| **3(c)** claim-outlives-call | derivation + heartbeat alternative + "not a breach of 7(a)" | **Yes** |
| **3(d)** five-case table | A–E present; D = POSSIBLE residual; E = step 2 settled | **Yes** |
| **3(e)** first-settled-wins | attempt-scoped identity; conditional settle; loser recorded; one budget; DR-115 boundary | **Yes** |
| **3(f)** compose slogan | "claim **and** our ledger together"; vacuous-claim-alone correction | **Yes** |
| **Decision intro SEAT** | 3(b)–(f) SEAT-PROPOSAL; 1/2/4/5/6 + 3 headline RULED | **Yes** |
| **F2 sample: `03` §0** | stack RULED DR-117/DR-118; GPG-3/4 authorities; values remain V's | **Yes** |
| **F2 sample: `07` §3.2 S0 row** | GPG-1…GPG-4 ALL DISCHARGED with inline authorities | **Yes** |

Surgical scope claim holds: one-clause predicate + two mirrors; nothing else in the composition was rewritten.

---

## What the repair got right (do not thrash)

1. **Predicate = command settled state**, not attempt ink — exact discharge of rev-2.1 F1.  
2. **Explicit negative paragraph** (not only a quieter positive) so a literal builder cannot re-introduce stuck work.  
3. **Attempt rows as evidence, never trigger** — clean vocabulary for implementers and future reviews.  
4. **Three-home mirror** without re-opening 3(c)–(f) or case D honesty.  
5. **Case E table language** already said "SETTLED" in rev 2.1; the defect was confined to step 2's second disjunct — correctly diagnosed and limited.

---

## Non-blocking observations (do not block APPROVED)

- 0017's three terminal examples are slightly richer than 0009/P11; optional future one-line cross-echo of "budget exhausted / typed skip / contract-terminal" in the mirrors if a builder only reads P11 — not required for this gate.  
- Prior do-not-block notes (fine-tune maker example; Cloudflare duration; §5.4c; out-of-scope `00`/`02` status strings) remain do-not-block.

---

## Verdict line (for board) — REV 2.2

```
GROK REVIEW (rev 2.2): APPROVED
```

**Independence declaration:** no `reviews/pre-10-codex*`, no Codex board verdict, no other peer's rev-2.2 content read. Own rev-2.1 finding in this file + worker READY FOR PEER REVIEW (rev 2.2) handoff + three repaired homes + frozen-region spot-checks only. Rev-1 / rev-2 / rev-2.1 sections above are historical; **this REV 2.2 section is the live verdict.**

**PEER REVIEW APPROVED** — composition gate cleared for this lens.

---

# PRE-10 Grok peer review — REV 2.3 (BOUNDED DELTA RECEIPT)

**Ticket:** `t_d467ee8a` — PRE-10 · DR-117/DR-118 stack re-instantiation  
**Reviewer:** Grok (DR-101 peer lens; Claude-authored ticket)  
**Revision:** **REV 2.3** — bounded delta receipt after own rev-2.2 APPROVED; four Codex-directed repairs + self-reported incident  
**Protocol:** Independent under DR-101 — **no Codex content read** (no `reviews/pre-10-codex*`, no Codex board verdict, no Codex peer-lens body). Own prior sections in this file + worker READY FOR RECEIPT (rev 2.3) handoff + named changed regions only.  
**Comments read through:** `claude-worker` READY FOR RECEIPT (rev 2.3) (2026-08-07 13:31)  
**Discipline:** frozen-loop bounded delta — re-open only the named limbs; **new observations non-blocking**.

**Changed regions judged (read directly):**

| Region | Repair |
|---|---|
| ADR-0017 §3(b) step 5 + case F + §3(e)(2)–(3) | settlement-completion path; six-case table; budget-from-ledger |
| ADR-0009 clause 7(e) new bullet | mirror |
| design-patterns P11 (nine laws) | new law 3; renumber |
| ADR-0017 cl.6 + ADR-0003 rule 4 | one-instance strike; seven-schema + `evidence` |
| `05` §5.4b / §5.4c / §5.4-iii / §5.5 / §5.6 | incident + vLLM pin + counts |
| `07` F2-sweep strings | VG-01 residues |

---

## Verdict (rev 2.3)

**GROK RECEIPT: CLEAN — delta holds; incident verified**

Step 5 does **not** re-open either closed window. Budget-from-ledger holds under case-D double-ledger. One-instance / seven-schema / P11 nine-law mirrors cohere with what this lens approved at 2.1/2.2. Incident: §5.4b reconstruction does **not** contradict REG-8 or 09-traceability; §5.5/§5.6 arithmetic squares with §5.4-iii's 27/60/5 after independent recount; restoration note is honest and prominent.

---

## (1) Step 5 vs the two closed windows

### Predicate (ADR-0017 §3(b) step 5; post-claim, pre-gateway)

After claim **COMMIT**, before the gateway:

| Ledger state | Action |
|---|---|
| **Successful attempt artifact awaiting settlement** | complete settlement **from that artifact**; exit; **no second call** |
| **Attempt ledger shows shared budget exhausted** | commit **terminal exhausted** derived from ledger; exit; **no second call** |
| **Neither** (incl. **retryable failure with budget remaining**) | **proceed** to model |

Step 2 = **settled**; step 5 = **completable**. Different questions. Case **F** sits between D and E; `claim_deadline` covers the **call**, not the post-call settle window — stated honestly.

### DOUBLE-CALL — still closed; does not re-open A–C/E; D residual untouched

| Window | Under step 5 |
|---|---|
| **A** live-claim mid-call | step 3 still no-ops |
| **B** engine timeout ≠ claim release | unchanged |
| **C** crash before call, claim live | unchanged |
| **D** reaper mid-flight | still **POSSIBLE** residual; step 5 does not claim to close it |
| **E** post-settle redelivery | step 2 still no-ops on **command settled** |
| **F** call returned, artifact durable, settle uncommitted | step 5 completes from artifact — **second call No** |

### Walk — can step 5 settle a STALE artifact while a newer attempt is mid-call?

**Constructive race:**

1. Attempt-1 mid-call; `claim_deadline` elapses (**case D**).  
2. Attempt-2 claims; step 5 finds **neither** (A1 not yet written) → **second real call** (residual D).  
3. Attempt-1 returns first, ledgers success artifact A1, dies before settle.  
4. Attempt-2 still mid-call, **holds the live claim**.

Can a redelivery run step 5 on A1 while Attempt-2 is mid-call? **No** — step 3 finds the live claim → no-op; step 5 is never reached without a successful claim. Only the claim-holder (or a later attempt after reaper) can enter step 5.

If Attempt-2 later also dies and Attempt-3 claims: step 5 settles **from A1** (finish, don't redo). That is not a third call and not a re-open of the double-call window — the second call already happened under D. First-settled-wins + conditional update still govern if Attempt-2's A2 races the settle (§3(e)(2): winner is **the artifact**, not the worker).

**Conclusion:** settlement-completion **cannot** settle past a live mid-call claim; once the claim is free it completes from a **real durable success**, which is the intended F close — not a stale overwrite of an in-flight attempt's exclusive settle right under a live claim. **Double-call window not re-opened.**

### STUCK-WORK — still closed

| State | Step 5 | Stuck? |
|---|---|---|
| Retryable failure, budget remaining | **neither → proceed** (explicit) | **No** — same scoping rev 2.1/2.2 required |
| Budget exhausted, terminal not yet committed | commit terminal from ledger | **No** — completes F's failure twin |
| Success artifact awaiting settlement | complete settle from artifact | **No** |

Step 5 does **not** restore the over-broad "any ledgered attempt outcome" trigger. The explicit neither-case sentence preserves the rev-2.2 discharge. **Stuck-work not re-opened.**

---

## (2) Budget-derived-from-attempt-ledger under case-D overlap

§3(e)(3) + step 5 + mirrors (0009 7(e), P11 law 3):

> Remaining budget is computed **from the attempt ledger** for this command, **never from the unsettled work-item state**.

**Walk (both attempts ledgered under D):**

1. `max_attempts = N`. Attempt-1 and Attempt-2 both complete real calls; both write attempt-scoped ledger rows.  
2. Budget count = **2** from the ledger — both count against the **same** shared bound. Correct.  
3. Without ledger-derived remaining, a redelivery in F's window sees an unsettled work-item that looks untouched and can re-enter the gateway **past** the shared bound; step 5's exhausted branch + ledger derivation close that.  
4. Concurrent overshoot by at most the in-flight zombie (ledger not yet written when the reclaimer checked) remains the **accepted D residual** (bounded, visible once both ledger) — not a count error **after** both are ledgered.

**Budget limb holds.**

---

## (3) One-instance strikes + seven-schema + P11 nine laws

| Claim | Spot-check | Holds vs 2.1/2.2? |
|---|---|---|
| **ADR-0017 cl.6** — ON THE ONE INSTANCE; **no operational escape**; second instance needs **new human ruling** | present; does-not-rule echoes same | **Yes** — strengthens the co-tenant posture this lens already passed at rev 2 limb 5 |
| **ADR-0003 rule 4** — seven schemas: core, ledger, memory, scorecard, register, serve, **evidence**; engine co-tenant **not** eighth; six is stale | present; AC-02 bullet agrees | **Yes** — `evidence`/A-06/S6 consistent with DR-099 path already in 07 |
| **P11 nine laws** | law 2 = settled-COMMAND (never retryable failure); **law 3** = settlement-completion + budget-from-ledger; laws 4–9 = prior 3–8 renumbered | **Yes** — mirrors 0017/0009; no drift on step-2 scoping |
| **07 VG-01 sweep** | `grep VG-01` in `07-build-order.md` → **zero** | **Yes** for the named F4 sweep |

---

## (4) INCIDENT adjudication

### §5.4b vs REG-8 (§7) and 09-traceability

| Load-bearing claim in reconstructed §5.4b | REG-8 (§7) | 09 `convergenceStopDefaults` / REG-8 row |
|---|---|---|
| One consolidated typed row `convergenceStopDefaults` | same | same |
| Members **not enumerated** (AC-76 / DR-039) | same | same |
| Gap REG-8 = one typed row vs N stable keys | same | same |
| Two forms: (i) freeze type/member contract; (ii) preserve pending; **seat picks neither** | §7 quotes same forms | 09 states open choice + VG-02; **does not contradict** the two forms |
| Typed loud failure on consumer read; never default | same | same |
| DR-068…DR-100 did not touch REG-8; sitting **VG-02** | same | same |

**No contradiction.** Reconstruction is consistent with both surviving authorities. Flag as reconstruction (not byte-recovery) is correct; content is not invented relative to those rows.

### Independent arithmetic — §5.4-iii's 27 / 60 / 5

| Quantity | Claim | Independent check |
|---|---|---|
| §5.4 carrier rows | **27** | **27** rows counted in the §5.4 table (incl. `vllmImageDigest` + `convergenceStopDefaults`) |
| Bootstrap class | **5** | `nodeRuntimeVersion`, `pnpmVersion`, `postgresMajorVersion`, `typescriptVersion`, `vllmImageDigest` |
| Total keys | **60** *(+1 dissolved)* | 18 shipped §5.1 + 6 + 9 + 27 = **60**; §5.1's dissolved `adoptionBar` is the +1 tracked, not shipped |
| §5.4-iii delta | 26→27, 59→60, bootstrap 4→5 | matches +1 `vllmImageDigest` only |

### §5.5 / §5.6

- **§5.5:** 8 never-rows present, including **DR-090** (measured behavioural difference) and **DR-096** (verdict-first flag) as the handoff claimed for post-fold-in text.  
- **§5.6:** count prose agrees with the table and with §5.4-iii.

**Incident: VERIFIED** — deletion/restoration narrative credible; restored substance consistent; arithmetic correct.

---

## (5) Restoration note — honest and prominent

Located as the **first blockquote under `### 5.4b`**, before body prose. States:

- accidental scripted deletion during rev 2.3  
- no backup (untracked tree)  
- §5.5/§5.6 restored from session reads  
- §5.4b is a **reconstruction** (C4 log + REG-8 framing that survived), **not a byte-recovery**  
- asks reviewers to verify against REG-8 and 09  
- nothing invented / nothing silently repaired  

**Prominent and honest. PASS.**

---

## Non-blocking observations (bounded — do not fail this receipt)

1. **S0 criterion 0** in `07` still says GPG-3's "**four** pins fill at scaffold time" while GPG-3 / §5.4 / FX-REG-01 say **five**. Same class as a count residue; load-bearing GPG-3 cell is correct.  
2. **`05` §1.1** `resolution_scope` cell still says marker `bootstrap` on the "**four** rows".  
3. **§3(b) / P11 headings** still say "three checks" while the sequence is now steps 1–6 / nine laws (settlement is an additional pre-gateway check). Exposition lag, not a different rule.  
4. Multi-success artifacts both "awaiting settlement" under a pure D race: conditional first-settled-wins still selects one; step 5 does not need a total order beyond that.

---

## Verdict line (for board) — REV 2.3

```
GROK RECEIPT: CLEAN — delta holds; incident verified
```

**Independence declaration:** no Codex content read. Own rev-2.2 APPROVED + worker READY FOR RECEIPT (rev 2.3) + named changed regions only. Prior sections historical; **this REV 2.3 section is the live receipt.**

