# REV(S01) pass 1 — lens **security / data-safety** · mission `debate-tiers` · ticket `t_660e86e5`

Seat `REV-S01-p1-security-data-safety`, blind. Worktree
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-security/dialectical-engine`,
detached at `f6c147cc` (= `slice/tiers-s01` head), base `7f89f7b7`, 0 dirty at start and 0 dirty at exit.
No git write of any kind. 2026-09-10, 03:42–04:05 EEST.

## VERDICT — **PASS** for this lens, pass 1 of 3

Five refutation attempts against the slice's own code all failed (§3). The three findings below are all
**non-blocking (N)**: each is a *correct implementation of the frozen SPEC* whose requirement carries a
data-safety consequence S02 will inherit. None is a defect of the code under review, so none blocks.
Every N carries a `V-ROW: NEW` block for the orchestrator to transcribe (§6) and a ticket line (§7).

---

## 1. Packet review (the packet is in my scope; its author cannot review it)

Every quoted constant re-measured and **correct**: base `7f89f7b7` ✓ · head `f6c147cc` ✓ · dirty 0 ✓ ·
`DONE.md` is exactly 167 lines ✓ · `design/S01/README.md` exactly 33 ✓ · 14 `.dc.html` artboards +
`canvas.json` ✓ · the packet path resolves from the seat cwd ✓ · comment cursor 1 matched the single
`DISPATCHED` comment ✓ · the `allowed` list covers every deliverable the packet demands — with one
exception (P2).

**Authors' `SKILLS LOADED` lines** (`review-packages/S01-p1/board/BUILD-S01-C{1..5}.*.txt`): all five
declare the full worker floor — `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`,
`test-driven-development`, `verification-before-completion`, `systematic-debugging`. No shortfall; none
is a FIX node, so `receiving-code-review` is not owed. **No finding.**

- **P1 (packet, non-blocking).** The packet cites `SPEC-v2.md:232-268` for "§2 steps 1–12". §2 ends at
  `:266`; `:268` is the `## 3. Out of scope for S01` heading, so the range spills into the next section.
  *Recommendation:* `packet-check` should assert every cited range ends inside its own section.
  **VERDICT** fix in the checker, not by hand / **CONFIDENCE** high / **STRONGEST COUNTER** two lines of
  slop harmed nothing here, and a checker rule costs more than it saves — answered: the packet's own law
  is "at the lines they name", and three parallel lenses each pay the ambiguity.
- **P2 (packet, non-blocking — a contradiction with COMMON).** COMMON §4 instructs **any** seat to write
  a contested product question as a `V-ROW: NEW` block **in the slice's `DECISIONS.md`**. My packet's
  `allowed` list is declared *exhaustive* and does **not** include `DECISIONS.md`. The two instructions
  cannot both be obeyed. I obeyed the narrower one (wrote nothing to `DECISIONS.md`) and placed the three
  V-ROW blocks in §6 of this file for the orchestrator to transcribe.
  *Recommendation:* add the slice's `DECISIONS.md` to every review seat's `allowed` list, or delete the
  clause from COMMON §4 and make V-ROW transcription the orchestrator's job explicitly.
  **VERDICT** add the path to `allowed` / **CONFIDENCE** high / **STRONGEST COUNTER** parallel lenses
  writing to one `DECISIONS.md` collide — answered: that is exactly why COMMON already forbids the seat
  to *number* the row; appending a block is append-only and collision-tolerant.
- **P3 (packet, non-blocking).** The `no-touch` list (`:3000`, `:8790`, `127.0.0.1:55432`, `.local/**`)
  ships with **no baseline measurement**, so compliance is unfalsifiable. See UNVERIFIED-3.

## 2. What I verified, and how

**Every cluster command re-run by me, three times, in my own worktree** (runner
`.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh`, C5-restated pairs `tier01-new-plan-tier.test.tsx:21:0`
and `tier01-style-contract.test.ts:8:0`; log promoted as `probes/REV-S01-p1-security--cluster-rerun-3x.log`):

| Cluster | run 1 | run 2 | run 3 |
|---|---|---|---|
| S01-C1 (8 pairs) | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` |
| S01-C2 (9 pairs) | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` |
| S01-C3 (6 pairs) | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` |
| S01-C4 (11 pairs) | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` |

12/12 `CLUSTER_GREEN`, 0 `CLUSTER_RED`, 0 `BROKEN`. `pnpm run generate:contract` rc 0 and **idempotent**
(0 dirty after). Worst run = best run.

**My own fixtures** — 5 probe files, 76 assertions, promoted to `.hermes/reports/debate-tiers/probes/`:
73 passed; the 3 that failed are my own deliberately falsifiable expectations, each refuted by the
product and each **dated pre-existing** in §4.

**Both modes, rendered DOM with the real compiled CSS** (my own UI server on `:8797` + my stub API on
`:8796`, both killed at exit). Measured against `DONE.md` §3 — M1 grid `repeat(2,…)`/gap 10px/margin-top
20px; M2 `--shell` + `--line-strong`, radius 12px, padding 13px 14px, cursor pointer; M3 `--core` +
`--line`; M4 `--ink`/`--bg` pill 999px/10.5px/700/4px 12px; M5 transparent + `--muted`/600; M6 11.5px
`--text-2`; M7 JetBrains Mono 10.5px `--text-3`, 7×7 dots `--m-gpt` `rgb(180,85,45)` / `--m-claude`
`rgb(138,99,201)` / `--m-grok` `rgb(95,102,112)` identical in both modes; M8 `opacity .45` +
`cursor: not-allowed`. **Terracotta and Chamber both conform**, and the nine locks are present in Chamber
as in Terracotta — no mode-dependent lock loss.

**SPEC-v2 §2 steps 11–12 measured on the wire**, verbatim from my stub's log
(`probes/REV-S01-p1-security--wire.log`):

```
{"question_line":"Remote work should be the default for knowledge workers.","plan_tier":"free",
 "risk_tier":"standard","tier_source":"MACHINE_DEFAULT","tier_provenance_ref":"machine:plan-tier-free",
 "composition_budget_tier":"low","depth_params":{"depth":2},…}          → 202
{… "plan_tier":"premium", "tier_provenance_ref":"machine:plan-tier-free", …}   → 202
```

## 3. Refutation attempts that FAILED (the slice held)

1. **21 malformed `plan_tier` shapes at the contract** — absent, `"gold"`, `""`, `"FREE"`, `"Premium"`,
   `" free "`, `null`, `0`, `1`, `true`, `["free"]`, `{value}`, `{toString}`, `new String("free")`,
   `"__proto__"`, `"constructor"`, `"prototype"`, trailing space/newline, a Cyrillic homoglyph, 40 KB.
   All refused (probe A).
2. **15 of those replayed against the REAL Fastify route** with a submit spy: every one `400
   {"error":"MALFORMED_REQUEST"}`, and `submit` was **never** reached (probe C2). `free`/`premium` → 202
   with the tier arriving at the application intact (probe C1).
3. **`__proto__` on the wire** — no pollution, key dropped from the parsed output, nothing serialized
   (probe B). Dead end; see §4.
4. **Mutant A — I deleted the security guard itself** (`apps/ui/lib/api.ts:375-376`, the
   `PLAN_TIERS_SET` check) and re-ran C2: `tests/unit/tier01-ask-wire.test.ts` 3/0 → **2 passed | 1
   failed**, cluster `CLUSTER_RED`. **The guard is genuinely pinned, non-vacuously.**
5. **Mutant B — I added `attacker-model-9` to the Premium roster** (`packages/contract/src/plan-tiers.ts:10`):
   caught by **two independent suites**, `tests/architecture/tier01-roster.test.ts` 1→0 passed and
   `tests/render/tier01-new-plan-tier.test.tsx` 21→20. **R11's single-declaration property is pinned.**

Both mutants restored by byte-copy (never `git checkout`); worktree verified byte-clean after each.

`PLAN_TIER_ROSTERS` is frozen at **both** levels and a push/reassign attempt changes nothing (probe A4).
`.strict()` still refuses an unknown key and the near-miss `plan_tiers` (probe A3), so R12's "no other
field loosened" holds. A padded `"  premium  "` is trimmed by `requiredString` and reaches the wire as
`premium` (probe E2) — the wire value is always one of the two.

## 4. Pre-existing behaviour I confirmed is NOT S01's (dated, so nobody re-files it)

- **`POST /v1/asks` answers `500 {"error":"INTERNAL_ERROR"}` for a body over the ~1 MB limit**, not 400
  or 413. Dated by probe D1: an oversized `question_line`, `decision_scope` **and** `tier_provenance_ref`
  — all base-era fields — reproduce it identically, while a 900 KB forged `plan_tier` correctly returns
  400. Field-agnostic, out of S01's diff. Ticket line in §7 (T4).
- **The 400 body discloses the field path and the enum's allowed values** —
  `{"error":"MALFORMED_REQUEST","message":"[… \"values\":[\"free\",\"premium\"], \"path\":[\"plan_tier\"] …]"}`.
  Dated by probe D2: `risk_tier` and `composition_budget_tier` disclose identically. It **never echoes
  the submitted value** (checked with a marker string). S01's incremental disclosure is two values the
  UI already displays. **Not a finding.**
- **`.strict()` does not flag a `__proto__` key.** Real, but zod-wide (a bare `z.object({a}).strict()`
  behaves the same), the key is dropped, and `Object.prototype` is untouched. **Not a finding, and a
  dead end — do not re-derive it.**

## 5. Findings

### N1 — the Free contract is enforced only in the browser, and no slice owns enforcing it

- `apps/ui/lib/api.ts:375-376` — the only `plan_tier` guard runs in the user's own browser.
- `apps/api/src/index.ts:905-916` — the route validates the tier's *shape* and cross-checks nothing.
- `apps/api/src/index.ts:1204-1226` — `evaluateAskAdmission` reads `risk_tier`, `tier_source`,
  `tier_provenance_ref`, `depth_params`; it **never reads `plan_tier`**.
- `SPEC-v2.md:268-273` (§3) assigns fleet filtering to S02 and gauge enforcement to **nobody**.

**Concrete inputs → wrong outcome.** Measured at the real route (probe C5): a body carrying
`plan_tier:"free"` **with** `risk_tier:"high-stakes"`, `composition_budget_tier:"high"`,
`depth_params:{depth:5}` and two steering lines is answered **202** and reaches the application
unaltered. Reachable end-to-end from the page: with Free still reading chosen, stripping the `disabled`
attribute — the only lock `SPEC R4` specifies — and driving `#treeDepth`, `#steeringPresets` and
`#steeringAnnotations` produced this wire body (`wire.log`, 00:57:50Z):

```
{… "plan_tier":"free", "depth_params":{"depth":5},
   "steering_presets":["Prefer primary sources"],
   "steering_annotations":["Flag any claim resting on a single source."] …}   → 202
```

The resulting ask is **indistinguishable from a legitimate Free ask**, so when S02 prices a run by
`plan_tier`, the gauges that actually drive the work are caller-controlled.

*Scope note:* the six segment pills (`riskTier-*`, `budgetTier-*`) genuinely **resist** attribute
stripping — React suppresses mouse events using the VDOM props, not the DOM attribute — so `risk_tier`
and `composition_budget_tier` stayed at `standard`/`low` in the browser path. The three `onChange`-driven
controls do not resist. At the API the distinction vanishes: all four travel freely (probe C5).

**Non-blocking** because S01's frozen SPEC excludes enforcement, and `disabled` is exactly the mechanism
R4 mandates. **VERDICT** the class must be owned before S02 prices anything /
**CONFIDENCE** high (measured at both the route and the browser) /
**STRONGEST COUNTER** row V-6 says there is no entitlement gate in this mission, so a forged tier is
explicitly out of scope — answered: V-6 governs *who may choose Premium*; N1 is about a `free` ask whose
**gauges** exceed the Free contract, which no row has ruled on and which S02's pricing depends on.

### N2 — the durable provenance string names a plan the run is not on

`apps/ui/app/new/defaults.tsx:74` — `tier_provenance_ref: … : "machine:plan-tier-free"`.

**Measured on the wire** (`wire.log`, 00:57:11Z) and reproduced at unit level (probe E3): a **Premium**
ask with an untouched risk tier carries `"plan_tier":"premium"` **and**
`"tier_provenance_ref":"machine:plan-tier-free"`.

That string is not ephemeral. It is written to a `NOT NULL` durable column
(`packages/db/src/schema.ts:119`) and rendered verbatim to the user
(`apps/ui/components/AnswerHonestyDrawer.tsx:86`) beside the label "machine default from the deployment
floor" (`apps/ui/lib/v3/labels.ts:6`). One honesty line will therefore read:

`Risk tier standard · machine default from the deployment floor · machine:plan-tier-free`

— two mutually contradictory provenance claims, and on a Premium run **neither is true**: the page never
reads the deployment floor (SPEC's own evidence, `:63-69`) and the asker is not on the Free plan.

**Non-blocking: the code conforms exactly to the frozen R7**, which rules this intended at `:83-85` ("a
value still standing from the Free lock when Premium is chosen … still carries `machine:plan-tier-free`").
SPEC-v2 `:291-300` routed the *label* half to row V-14; what it did not weigh is that the ref is false on
a Premium run, and the column is append-only, so S02 cannot repair the rows S01 writes.
**VERDICT** V should rule before S01 reaches production / **CONFIDENCE** high /
**STRONGEST COUNTER** R7 is frozen and a reviewer does not relitigate a frozen requirement — answered:
I am not relitigating it, I am reporting a measured consequence R7's derivation did not cover, which is
the reviewer's job under law 3.2.

### N3 — the tier options assert which models will receive the user's question; that assertion governs nothing

`apps/ui/app/new/page.tsx:207` renders `PLAN_TIER_ROSTERS[option.value]`, so the control tells the user
that Free routes to `gpt-5.6-luna` + `claude-sonnet-5` and Premium to `gpt-5.6-sol` + `claude-opus-5` +
`grok-4.6`. **Measured:** `plan_tier` is consumed by nothing server-side (`grep -rn 'plan_tier' apps packages`
excluding tests: the only production hits are the contract declaration, the UI guard and the page itself);
the panel comes from `resolveDiscoveredPanel()` with no tier input (`apps/api/src/index.ts:1205-1226`);
and the value is persisted **nowhere** (0 hits in `packages/db/src`, `packages/register/src`). Both tiers
therefore run the identical discovered panel, and three of the five displayed ids are not configured
discovery targets at all (COMMON row `the fleet today`; intake C1 / row V-7).

**Data-safety facet (mine):** which third-party models receive a user's question is a data-routing
representation, and the control makes it falsely. The product-truth facet belongs to that lens; the
"not configured" half is already V-7.

**Non-blocking:** SPEC-v2 §2 step 12 concedes it in writing ("Until S02 lands, both tiers run the same
fleet, and that is correct here"), so S01 conforms.
**VERDICT** S01 must not reach production ahead of S02 / **CONFIDENCE** high /
**STRONGEST COUNTER** the mission always intended S01+S02 to ship together, so the window never opens —
answered: nothing in the slice records that constraint; a merge-order rule that exists only in a reviewer's
head is not a rule, and this is the one finding here that could mislead a real user about their data.

## 6. `V-ROW: NEW` blocks — for the orchestrator to transcribe into `slices/S01/DECISIONS.md` (see P2: my `allowed` list bars me from writing there; the orchestrator numbers them)

```
V-ROW: NEW · S01 · Free-contract enforcement · Recommended default: S02 revalidates the Free gauge set
server-side (reject, or clamp-and-record, an ask whose plan_tier is `free` and whose gauges exceed the
R7 values). Smallest yes/no for V: "Should the server refuse a `free` ask that carries non-Free gauges?"
· VERDICT own the class before S02 prices anything / CONFIDENCE high / STRONGEST COUNTER: row V-6 rules
out entitlement gates — but V-6 is about who may CHOOSE Premium, not about a Free ask carrying Premium
gauge values.
```

```
V-ROW: NEW · S01 · Provenance names the wrong plan · Recommended default: the `false` branch of
tier_provenance_ref becomes tier-aware (`machine:plan-tier-free` under Free, a Premium-truthful ref
otherwise), or the whole pair moves to a vocabulary value as SPEC-v2:300 sketches. Smallest yes/no for V:
"May a Premium run's durable provenance say `machine:plan-tier-free`?" · VERDICT rule before S01 reaches
production, because the column is append-only / CONFIDENCE high / STRONGEST COUNTER: R7 is frozen and
deliberately mechanism-based — but R7's derivation never weighed the Premium row's durability or the
honesty drawer's contradictory label (V-14).
```

```
V-ROW: NEW · S01 · Merge order vs the displayed rosters · Recommended default: S01 does not reach
production before S02, because until then the two rosters are a false statement about which models
receive the user's question. Smallest yes/no for V: "May S01 ship to production before S02?" · VERDICT
gate the merge / CONFIDENCE high / STRONGEST COUNTER: SPEC step 12 already concedes both tiers run one
fleet, so it is disclosed — but it is disclosed in a spec, not to the user reading the control.
```

## 7. Tickets every N is owed (COMMON §3 — non-blocking sets WHEN, never WHETHER)

| # | Class | Members found | Sample |
|---|---|---|---|
| T1 | Free-contract values unenforced server-side | 4 (risk_tier, composition_budget_tier, depth, both steering arrays) | `apps/api/src/index.ts:905-916` |
| T2 | Durable provenance ref names a plan the run is not on | 1 branch, every Premium run with an untouched risk tier | `apps/ui/app/new/defaults.tsx:74` |
| T3 | Displayed roster is not the routed roster | 2 rosters / 5 ids, 3 of them unconfigured (V-7) | `apps/ui/app/new/page.tsx:207` |
| T4 | Oversized request body answered `500 INTERNAL_ERROR` (**pre-existing**, out of S01's diff) | field-agnostic; 3 base-era fields reproduce | `apps/api/src/index.ts:905` |

## 8. UNVERIFIED

1. **The trusted mouse/keyboard route past a stripped lock.** My arrow-key gesture did not move
   `#treeDepth` — but a control experiment proved the instrument, not the lock: under **Premium**, with
   the slider legitimately enabled and focused, the same gesture also failed. N1's browser evidence
   therefore rests on the native-setter + `input`/`change` route (what a devtools console does), not on a
   mouse drag. The API-level evidence (probe C5) is unaffected.
2. **`LibraryComposer` mounted in a browser.** It lives on `/` (`app/page.tsx:83`) behind
   `sessionConfirmed`, which my stub session does not satisfy; `/library` is a 404. Settled at unit level
   instead (probe E1): its tier-less config throws on the **pre-existing `risk_tier` guard**, before
   S01's new one, with `submitAsk` never called — so S01 changed that path's behaviour in no way. The
   composer's start button has always fallen through to `/new?topic=`.
3. **That `:3000` was listening when I arrived.** It has no listener at my exit. I killed exactly two
   pids — 53355 on `:8796` and 44631 on `:8797`, both mine, both printed by port before the kill — ran no
   `pkill`, and never navigated to or acted on the pane's `seed` tab. But the packet gave no baseline
   `lsof` for the protected ports, so I can prove the scope of my actions and not the state before them.
   See P3.
4. **`grok-cli` / the live fleet.** Untouched by contract; the three unconfigured ids are row V-7.

## 9. Predictions about the other two lenses (falsifiable; evidence that blindness held)

I expect **correctness/tests** to spend most of its pass on probes.md #1 and #3 and to land a finding I
did not chase: that `modelIdentity` (`page.tsx:65-70`) duplicates `modelMeta(modelId).dot`
(`apps/ui/lib/models.ts`) and that its fallback `return modelId` yields an unmapped identity for any id
outside the three prefixes — dead today, live the moment a fourth maker is added; I predict it files that
as N, not B, because every current id is covered and the render suite pins the three `--dot` values. I
also expect it to re-run the M-line mutation matrix and find the `DONE.md` assertions non-vacuous, and to
confirm the repaired `region()` guard at `tests/unit/v2ui-pages.test.ts:83` is non-vacuous while noting
the other 11 members of F11_F4 `t_1e4fccc1` are still open. My guess at its risk: it may report the
`riskTier` initial-state change (`""` → `"standard"`, `page.tsx:92`) as an unauthorised behaviour change,
because `SPEC-v2:73` still describes `riskTier` as starting `""` — that description is stale prose about
the *base*, and R2+R7 jointly require the new value, so I predict that finding, if filed, is wrong.
For **product-truth** I expect a clean sweep of M1–M15 in both modes (I measured the ones my lens
touches and they conform) and its real finding to be N3's other half — the displayed roster versus the
fleet that actually runs, plus the honesty-drawer contradiction of N2, which SPEC-v2:291-300 hands it on
a plate. I predict **neither** lens finds a blocking defect, that the union verdict is PASS with a stack
of N-findings and V rows, and that the single most likely disagreement between us is tiering: I have
called the enforcement gap non-blocking on the ground that S01's SPEC excludes it, and a lens reading
"a finding is a finding" more aggressively could call it B — which would be a scope disagreement for the
orchestrator, not a factual one, since we would be looking at the same measured 202.
