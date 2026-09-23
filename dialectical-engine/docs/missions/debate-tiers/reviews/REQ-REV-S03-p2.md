# REQ-REV(S03) pass 2 — scoped blind re-review of `slices/S03/SPEC-v2.md` and the packet `REQ-FIX-S03.md`

- **Seat:** REQ-REV-S03 · **node:** REQ-REV, pass 2 of 3 (SCOPED) · **ticket:** `t_580ac829` · **date:** 2026-09-13
- **cwd (every command):** the S03 lane — `git rev-parse --short HEAD` = **`9a000c37`**, `git status --porcelain | wc -l` = **0**, read-only throughout
- **Scope (the packet's):** B1/B2/B3 as ADDRESSED · V's V-35/V-37/V-38 folds · my own pass-1 §8 predictions and probes re-run against v2 · the seat's flagged judgement call on R8's positive limb. Requirements v2 leaves unchanged from v1 were reviewed at pass 1 and are not re-litigated here.
- **Probes (mine, this pass):** `.hermes/reports/debate-tiers/probes/REQ-REV-S03/p2-v2-r8-oracle.mjs` + `.out` (seven ids, both matchers, 413 files) · `p2-v2-claims.sh` + `.out` (v2's measurable claims). Pass-1 probes unedited.
- **Never done:** no git write · no stack or provider call · no `.local/**` read · nothing opened on V's desktop · no file under review edited.

## 1. Verdict

**REWORK — pass 2.** **One** blocking finding, five non-blocking.

B1, B2 and B3 are genuinely closed, and the seat did the work the way it should be done: it reproduced
each failure path before fixing it, measured rather than argued, took the exit my verdict named as
exit 2 and made it loud instead of silent, and **found one fact I had missed** (the `cards.ts`
allow-list was never a quoted-exact declaration at all, so it is deleted rather than preserved — I
verified this: `cards.ts:27-28` are `"Anthropic · Claude · claude-opus-5"` and
`"OpenAI · GPT · gpt-5.6-sol"`, display copy).

The one blocking finding is **new, introduced by the fix**: R23's subtraction clause, written to carry
R31's absent slot, is applied to five surfaces at once — and for two of them it contradicts other
requirements of the same document, including the acceptance step this pass was convened to repair.

## 2. What I verified, and how

| Claim under test | Method | Result |
|---|---|---|
| R8's oracle table (`:95-109`) | probe `p2-v2-r8-oracle.mjs`, seven ids × both matchers, 413 files | **exact, row for row.** Quoted-exact hits = `packages/contract/src/plan-tiers.ts` only, for every id; `glm-5.3-flash` and `glm-5.3` both hit the three support files under bare |
| `cards.ts:27-28` are display copy, never quoted-exact | `sed -n '27,28p'` | **true** — the seat's new measurement holds |
| `setup-tiers-s03.log` line 28 carries the 10/10 correction | `sed -n '28p'` | **true**, verbatim |
| `tiers-s02-rosters.test.ts:8-9` is the `apps`+`packages` root | `sed` | **true**; `.yaml` is not in `SOURCE_EXTENSIONS` — neither scan reaches the file |
| That suite is 4 cases (so "becomes 5/5" = +1) | `grep -c '^  it('` | **4** — `:204`, `:216`, `:239`, `:243` |
| R14.3's order derivation | re-read `apps/runner/src/main.ts:65-71` at this HEAD | **true** — slot 0's `authorizationHeader` is compared to `VLLM_AUTHORIZATION`, so Premium-first keeps V's paid key out of the primary triple |
| SPEC.md still frozen | `git diff c07e348b -- …/SPEC.md`; `git status --porcelain` on it | **both empty** — byte-identical |
| The seat's `allowed` list | freeze diff `c07e348b..fd429ad7` | 9 files: the seat's 5 (INSTRUCTIONS, SPEC-v2 new, PLAN, DECISIONS, its self-report) + 4 the orchestrator's (COMMON, this packet, LEDGER, RESUME-HERE). **No product file, no PROGRESS.md, no SPEC.md, no intake, no V packet, no verdict.** Contract held |
| Caps and hygiene | `wc -l`; banned-word grep over SPEC-v2 + DECISIONS + INSTRUCTIONS | INSTRUCTIONS **95/100**; banned words **none**; v2 line 3 = `ui: no`, line 4 = the supersession line |
| N1/N2 folds landed | grep INSTRUCTIONS + v2 §0 + R27 | lane `9a000c37` in all three places; R27 row is **10/10** with the regression warning |

## 3. Blocking finding

### B1(p2) — R23's "minus any slot absent under R31" is applied to five surfaces. For `/new` it contradicts R16, R31 and acceptance step 8; for the register, `api.env` and the discovery targets it contradicts R14 and leaves two builds true.

**Where:** `SPEC-v2.md:276-278` (R23) vs `:178-179` and `:196` (R14) · `:269` (R31) · `:207-214` (R16) ·
`:411-419` (acceptance step 8) · `:279-286` (R32).

R23 reads, in full:

> **R23.** On a run with no shape refusal the stack restarts and the file's entries are live: the
> panel, the published register version, `api.env`, the API's discovery targets and `/new` name the
> file's entries and nothing else — minus any slot absent under R31, which is named, not hidden.

The subtraction attaches to "the file's entries" and therefore to **all five** surfaces in the list.

**Member (i) — `/new`. As written, R23 breaks step 8.** R16 (`:213-214`) says *"The lists `/new` shows
are the FILE's, not the healthy panel's — a tier whose model is unreachable still lists it"*, and R31
(`:269`) repeats it: *"The tier's list on `/new` is unchanged (R16: the list is the file's)"*. R23 says
`/new` names the file's entries **minus any slot absent under R31**. On the merge-day state R32
describes — no key file, both Free slots absent — these give opposite pages: R16/R31 show a Free card
listing `gpt-5.6-luna` and `glm-5.3-flash`; R23 shows an **empty Free card**. Step 8 (`:413`) depends
on the first: *"`/new` still lists both Free models (R16)"*, and step 2 is marked key-free in the P1/P2
table (`:372`) for exactly that reason. A seat that builds R23 literally makes step 2 and step 8
unrunnable again — the same two steps B2 and B3 were about.

**Member (ii) — the register, `api.env` and the discovery targets. Two builds, both coherent, nothing
chooses.** R14 (`:178`) says *"The discovery slot set equals the union of the two tiers' entries, one
slot per entry, and the register's configured provider set is that same set"*, and (`:196`) *"At merge
the set is five slots"*. R23 subtracts the absent slot from the published register version, `api.env`
and the API's discovery targets. On a keyless machine those are different products:

- **Build A — configured but unhealthy.** Five targets always; the two Free slots are configured with
  no authorization header, probe ABSENT, and drop out of the *healthy* panel only. R14 holds as
  written; the register publishes the same five-ref set on every machine; S02's admission filter
  refuses because the member is not in the discovered-and-healthy panel. (`authorization_header` is
  already optional in the parser, `packages/providers/src/index.ts:171-177`, so this is buildable
  today, and the HEALTHY/ABSENT distinction is the product's own.)
- **Build B — omitted from the configured set.** Three targets on a keyless machine; the register
  publishes a three-ref `configuredProviderSet`; `api.env` carries three. R14's "five slots at merge"
  is then false in precisely the state R32 calls the merge-day state, and V later placing a key and
  restarting **publishes a new register version with no file edit at all** — which sits badly with
  R14.2 (*"the same file yields the same `provider_ref` … so a register version is not republished by
  restarting alone"*) and with R24, whose subject is a file whose entry set changed.

R31's own wording (`:267`, *"every other entry's slot is **configured** and served"*) reads as Build B;
R14 reads as Build A. Nothing in v2 breaks the tie.

**Why blocking, at pass 2.** This is the register/`api.env` seam — contradiction C14, the hardest thing
in the slice and the reason `dev-api-environment.ts`'s drift guard has to change at all (R25). ARCH
designs that seam next, from this sentence. Two seats reading it build different register contents on
the machine V will actually run on merge day.

**The fix is one clause, not a requirement.** Name the surfaces separately: the *healthy panel* loses
the absent slot; `/new` does not (R16); and say explicitly whether the register's configured set and
`api.env` follow the file (A) or the startable entries (B).
**VERDICT** Build A — the configured set is the file's entries; only the healthy panel loses the slot /
**CONFIDENCE** medium / **STRONGEST COUNTER:** under A the stack sends an unauthenticated probe to
OpenAI and Z.ai on every freshness window from any machine without keys — calls to a third party for a
slot nobody can use; B never calls a maker it has no key for. If V or ARCH prefers B, R14 must lose
"the set is five slots at merge" and R24/R14.2 must say that a key appearing is a legitimate cause of
a new register version.

## 4. Non-blocking findings

- **N1(p2) — R20 class 6 cannot be fixtured as written.** `:248` defines class 6 as *"A malformed base
  URL — R11's six refusals"*, and R28 (`:346`) demands *"one per R20 shape class (six)"*. But R11's
  sixth refusal (`:157`) is *"a `cli:` slot whose observed base URL is not that slot's loopback port"* —
  an **observation** at panel-build time, not a field of the file: an R3 CLI entry has exactly the keys
  `cli` and `model`, so no file fixture can produce it. Class 6 is fixturable from the file only
  through R11's first five. Cost: one seat writes a sixth file fixture it cannot make fail.
- **N2(p2) — R27's `tiers-s02-rosters` row lost a sentence v1 had.** The row (`:327`) names `:216-227`,
  `:239` and `:243` but is silent on the suite's first case, `:204-214`
  (`expect(PLAN_TIER_ROSTERS.free).toEqual([…])`). v1's row said *"Exact rosters (`:204-214`) become the
  new Free pair"*. It survives only if `PLAN_TIER_ROSTERS` still exists and takes its values at runtime
  from the file; if a seat reads R8 as deleting the constant, that case has no stated expectation and
  the arithmetic "4/4 → 5/5" silently becomes 3+1.
- **N3(p2) — the positive limb is assigned to two suites.** R8 (`:120-121`) says *"R27 names which suite
  carries it"*, but R27 gives it to `tiers-s02-rosters` as a fifth case (`:327`) **and** describes
  `tier01-roster` as comparing *"the tier lists the product exposes at runtime against the file"*
  (`:326`) while staying 1/1. Harmless duplication if both are written; a gap if each seat assumes the
  other suite carries it.
- **N4(p2) — the seat's READY misstates its own artifact.** It reports SPEC-v2 as *"430 lines"*;
  `wc -l` says **454**. Nothing depends on it, and the packet's own constant (454) is right — but a
  handoff's measurable facts are exactly what a reviewer is asked to trust (§3.6).
- **N5(p2) — COMMON.md still carries the pass-1 N1 wording.** `COMMON.md:7` says the lane's *"base
  7188b167"* while `:48` says *"@ 9a000c37"*. Both are defensible (base vs HEAD) and v2 now says HEAD
  correctly, so this is the last member of that class, in the planning set rather than the SPEC.

## 5. The flagged judgement call — R8's positive limb: **ruled IN**

The seat flagged it honestly as the one thing to check rather than discover: R8's positive limb
(`:116-121`) is named by no finding of mine and is not V's update.

**Measurement.** Delete `config/models.yaml` from the product's read path entirely — wire the tier
lists from anywhere else (an env var, a second JSON, a hard-coded module that spells nothing) — and ask
which named suite fails. Under the **negative limb alone**: `tier01-roster` passes (every id's
quoted-exact expectation is `[]` and that is satisfied by ids that exist nowhere);
`tiers-s02-rosters`'s canonical map passes for the same reason; `:239` (no tier `if`/`case`) passes;
`:243` (≥ 2 members) passes as long as the lists are non-empty from wherever they come. Neither scan
can see the file: both are rooted at `apps`+`packages` (`tier01-roster.test.ts:17-27`,
`tiers-s02-rosters.test.ts:8-9`) and `.yaml` is not in `SOURCE_EXTENSIONS` — I measured both. **No
suite in R27's table reads `config/models.yaml`, so no suite fails.** The only requirement that would
catch it is R16's runtime test, and R27 (`:330`) says that test is fed by a **fixture**.

So the negative limb alone leaves a passing build in which the file V edits is decorative. That is the
same class B1 is about — *"R8 must leave exactly one build true"* — and the limb is one test case
adding no product surface, no screen, no token and no V decision. **Ruled IN, inside B1's scope.** It
is not new scope and does not need a V-ROW.

## 6. Charges, answered

1. **Packet review** — `REQ-FIX-S03.md`'s constants check out against their sources (tickets
   `t_9ee87d3d`/`t_1292cc86`/`t_748b2433`/`t_d502e39f`, base `9a000c37`, the verdict's section
   offsets, the two matchers' line ranges, the three support files). Its `allowed` list is exhaustive
   and was obeyed (§2). **My pass-1 N6 is retired by it**: it no longer says "(append only)". No packet
   defect found this pass. The one packet constant I re-measured and the seat's handoff disagree on is
   N4(p2) — and the **packet** is right.
2. **B1 → CLOSED.** Oracle re-run (seven ids × two matchers): v2's table is exact. The quoted-exact
   rule is the only one under which R8 can hold, R26 holds with no support file edited, and the change
   is loud per suite with totals. The `cards.ts` deletion is correct and is the seat's own measurement.
   The per-suite totals are sound with the two caveats N2(p2)/N3(p2).
3. **B2 → CLOSED.** Composed R20/R21/R23/R31/R32 with step 8 as I did at pass 1: no keys → R31(a) →
   exit 0, both Free slots absent, one warning each → `/new` still lists both (R16) → a Free ask hits
   R15's filter with both ids missing → `422 ASK_PLAN_TIER_MODEL_UNAVAILABLE` naming `free` and both
   ids (the message at `apps/api/src/index.ts:1224-1226` carries the tier and every missing id).
   **The 422 now appears, on merge day, with no key.** R20's six shape classes stand unweakened — V's
   sentence intact — and R31 carries the one sentence for the other ruling. The post-key reproduction
   (a `base_url:` pointing at a host that answers nothing) is shape-valid, so it reaches R31(b) and not
   R20, and touches no `.local/**`. *Caveat: member (i) of B1(p2) puts this back at risk if R23 is
   built literally.*
4. **B3 → CLOSED.** I re-derived the table row by row. With the merged file and no key file: step 1
   (file read) ✓ · 2 ✓ (R16 + R32) · 5 ✓ (Premium's CLI relays need no entry from `provider-keys.env`) ·
   6 ✓ · 7 ✓ (a shape refusal; `api.env` exists — it is the stack's file, not the key file) · 8 ✓ (the
   merge-day state itself) · 9 ✓ (Premium keeps 2 entries and 2 makers, R6) · 10a ✓ (Free becomes 3
   entries / 3 makers, one per maker — R6 holds, and R14.1 makes the duplicate `grok-4.6-build` across
   tiers parseable because only `provider_ref` must be unique) · 11 ✓. **"Steps 3, 4 and 10b are the
   only ones that wait on V's keys" is true as stated.** The 10a/10b split is the same defect shape
   swept, correctly. R32 states the post-merge start as a requirement, which is what v1 lacked.
5. **V's folds** — R7 takes the subscription endpoint (V-35 ANSWERED) ✓ · R30 is checkable and cites
   the echo gate (`provider-discovery.ts:77-79`) ✓, and it answers V's "GLM 4.7" honestly rather than
   letting the panel relabel ✓ · R13 states F14 **beside** the observable and hands ARCH the fact, not
   a prescription ✓ · R14's three observables are each checkable and the order rule's derivation is
   sound — I re-read `main.ts:65-71` ✓. R14.1's own parenthetical ("only `provider_ref` must be
   unique") is the fact I measured at pass 1 and it is cited correctly.
6. **Pass-1 predictions, scored honestly.** (a) *"a reader who checks B1 by eye on `tier01-roster` will
   report it as a non-issue"* — **failed, in the good direction**: the seat ran both matchers itself and
   extended the measurement. (b) *"the common failure on B2/B3 is never composing R20 with the
   acceptance"* — **untested**: no competing lens ran; the seat composed them. (c) *"at least one other
   lens flags the `7188b167` constant"* — **held** (folded and fixed). (d) *"nobody flagged N7"* —
   **held and adopted**: the REQ-FIX CLAIM names its transcript file instead of a session id, which is
   the fix N7 asked for. **N1–N7 all retired** except N5(p2) above, the COMMON remnant.
   `ui: no` re-checked: nothing in v2 adds a surface — R31's warnings are command output, R17 is
   unchanged, `/new` changes in data only. Banned words: none. Against S02: §0 names S03 R8 as
   superseding S02 SPEC-v2 R1 and keeps S02 R3–R10 live through R15 ✓ (N5 of pass 1 retired).
7. **Tiering.** One B, five N. If pass 3 were to REWORK, what would be left for V is a single product
   question — *does the published register set follow the file, or the entries that could start?* — and
   it is answerable in one line by ARCH under either reading once R23 says which.

## 7. UNVERIFIED

- Every acceptance step needing the served stack — never served, by contract. In particular I did not
  run step 8's merge-day path; I verified it by composing the requirements and the admission code.
- Whether OpenAI sells the model as `gpt-5.6-luna` (row V-34) — no provider call.
- F13/F14 (the echo behaviour and the 64-token probe) — the seat cites them from the intake and did not
  re-measure; neither did I. They are the orchestrator's measurement of 16:05.
- No suite was run by me this pass. Every `passed/total` in R27 is the lane baseline as corrected at
  `setup-tiers-s03.log:28`, not a fresh run by either of us.

## 8. Predictions

If a third pass happens, I predict the disagreement will be about member (ii) of B1(p2) and not member
(i): `/new` has two explicit sentences on its side and will be read correctly by anyone who reaches
step 8, while the register question has one sentence on each side and no tie-breaker, so a reader who
does not hold R14 and R23 in mind at the same time will call it settled. I predict ARCH, left alone
with v2 as it stands, would build **B** — because R31's "every other entry's slot is configured" sits
three lines from the thing it is implementing, while R14's "the set is five slots" is eighty lines
away. I also predict no one else will notice N1(p2) (R20 class 6's unfixturable sixth), because the
word "six" now looks settled after N3 of pass 1 was fixed.

## 9. Rows for V

**None new.** Row V-38's default carries B2/B3 and v2 states in one sentence what moves if V rules the
other way; V-34 (the OpenAI key), V-36 and V-37 keep their binding defaults and v2 is written to them.
B1(p2) is an internal contradiction with an engineering answer, not a V question — it should not cost V
a round-trip.
