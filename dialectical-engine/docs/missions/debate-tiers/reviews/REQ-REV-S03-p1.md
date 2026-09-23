# REQ-REV(S03) pass 1 — blind review of `slices/S03/SPEC.md` and the packet `REQ-S03.md`

- **Seat:** REQ-REV-S03 · **node:** REQ-REV, pass 1 of 3 · **ticket:** `t_f2364116` · **date:** 2026-09-13
- **cwd (every command):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s03/dialectical-engine` — measured `git rev-parse --short HEAD` = **`9a000c37`**, `git status --porcelain | wc -l` = **0**
- **Read:** packet `REQ-S03.md` (first, in full) · `COMMON.md` · `INSTRUCTIONS.md` · `slices/S03/SPEC.md` (346 lines) · `PLAN.md` · `DECISIONS.md` · `PROGRESS.md` · `00-intake-S03.md` (all, including the three `CORRECTED 2026-09-13 15:30` lines) · `V-DECISIONS-PACKET.md` rows V-34/V-35/V-36 · `slices/S02/SPEC-v2.md:32-168` · the product lines the SPEC cites, **in the lane** · `setup-tiers-s03.log` · the freeze diff `1f8e9b33..fb2ce0ef`
- **Probes (mine, kept):** `.hermes/reports/debate-tiers/probes/REQ-REV-S03/p1-cited-lines.sh` · `p2-r8-declaration-oracle.mjs` + `.out`
- **Never done:** no git write · no stack or provider call · no `.local/**` read · nothing opened on V's desktop · no file under review edited.

## 1. Verdict

**REWORK — pass 1.** Three blocking findings. **Two of the three are in `## 2. Acceptance`, not in the
requirements**, and neither is fixed by weakening R20: R20's refusal classes are V's own sentence
(`00-intake-S03.md:22` — *"a model that doesn't answer"* is V's example of a refusal). The acceptance
was written as if the check did not exist. B1 is a requirement that cannot hold at merge as measured.

The SPEC's citation discipline is the best I have measured in this mission: **every one of the ~40
`path:line` citations I re-opened in the lane is exact**, including the five sub-citations inside R15
(`apps/api/src/index.ts:1215-1217`, `:1218-1228`, `:1239`, `:1248`, `:1256`) and the corrected F1/F4
gates. None of the findings below is a citation error.

## 2. What I verified, and how

| Check | Method | Result |
|---|---|---|
| Every product `path:line` the SPEC cites | probe `p1-cited-lines.sh` — `sed` over 16 ranges **in the lane** | all exact; R15's five sub-citations land on the exact statements |
| R8 ("the file is the only declaration") | probe `p2-r8-declaration-oracle.mjs` — re-implements BOTH matchers the suites use, 413 source files | **fails for `glm-5.3-flash`** — see B1 |
| The two matchers disagree | read `tiers-s02-rosters.test.ts:51-70` (bare `.includes`) vs `tier01-roster.test.ts:43-52` (`JSON.stringify`) | two different oracles, one requirement |
| Lane baseline | `grep 'rc=' setup-tiers-s03.log` | 13 rows; `dev-api-environment` row says `rc=1 | 1 failed | 9 passed (10)` — pre-dates `4df0b2b5` (N2) |
| Lane HEAD vs the SPEC's claim | `git rev-parse --short HEAD`; `git show --stat 9a000c37` | lane is `9a000c37`; the cherry-pick touches one **test** file (+1/−5), so no product line moved (N1) |
| Duplicate model ids across slots | read `packages/providers/src/index.ts:138-200` | only `provider_ref` must be unique (`PROVIDER_DISCOVERY_TARGET_DUPLICATE`); duplicate `model` is admissible → acceptance step 10 is parseable (N4) |
| `ui: no` | `heartbeat-requirements` SKILL.md:33-35, quoted in DECISIONS:9-10 | the quote is **real and correctly applied** — no finding |
| Banned words | `grep -iE '(improve|better|robust|handle|appropriate)'` over the SPEC | **none** |
| `INSTRUCTIONS.md ≤ 100` | `wc -l` | **95** |
| Author's `SKILLS LOADED` | `t_089ce7cc` READY comment | 4/4 floor, orchestrator-verified against the transcript body — **no fabrication finding** |

## 3. Blocking findings

### B1 — `glm-5.3-flash` is already written in three production files, so R8 cannot hold and R27's "stays 4/4" cannot happen. R26 forbids the only fix R8 leaves.

**Where:** SPEC `:85-93` (R8) · `:247` and `:248` (R27's `tier01-roster` and `tiers-s02-rosters` rows) ·
`:228-236` (R26, the support seam is untouched).

R8 demands that for each of the six ids, the files `git ls-files apps packages` returns (non-test,
non-generated, non-build) contain **no** file quoting that id, *"with exactly one allow-list kept as it
stands today: `apps/ui/components/landing/cards.ts`"*. Measured in the lane (probe `p2`, verbatim in
`p2-r8-declaration-oracle.out`):

```
### glm-5.3-flash
  A) bare-substring (tiers-s02-rosters matcher):
       apps/api/src/support/model.ts x2
       apps/runner/src/dev-auth-stack.ts x1
       apps/runner/src/dev-support-model.ts x2
  B) quoted-exact  (tier01-roster matcher):      (none)
```

The occurrences are `"development:hermes-glm-5.3-flash"` and `"z-ai/glm-5.3-flash"`
(`apps/api/src/support/model.ts:6-7`, `apps/runner/src/dev-support-model.ts:2-3`,
`apps/runner/src/dev-auth-stack.ts:55`) — **the support bot's provider ref and model, which R26 says this
slice does not touch.**

The two suites R27 pins use **different oracles for the same word "declaration"**:

- `tests/architecture/tiers-s02-rosters.test.ts:51-60` — `readFileSync(...).includes(needle)` with the
  **bare** id, plus `:62-70` which asserts the occurrence count is **exactly 1** per allow-listed path.
- `tests/architecture/tier01-roster.test.ts:43-52` — `const quotedExact = JSON.stringify(modelId)`,
  i.e. the id **with its quotes**.

Concrete failure, inputs → outcome: a BUILD seat follows R27's instruction *"the canonical-declaration
map (`:216-227`) points at the file and keeps the `cards.ts` allow-list"* and adds
`"glm-5.3-flash": ["config/models.yaml"]` (or `[]`). `sourceFilesContaining("glm-5.3-flash")` returns the
three support files → `expect(...).toEqual(...)` fails → the suite is **3/4, not 4/4**. Three exits, three
different products:

1. allow-list the three support files — R8 forbids ("exactly one allow-list"), and `:62-70` would also
   need counts of 2/1/2, not 1;
2. change the matcher to quoted-exact — passes, but it silently rewrites what the S02 suite was built to
   assert, and R8's own reviewer check ("greps the committed file… finds none") reads as substring;
3. remove the id from the support files — **R26 forbids it, and it breaks V's live support widget.**

Same class, second member: R27's `tier01-roster` row says the "exactly one declaring file" assertion
*"moves off `packages/contract/src/plan-tiers.ts` onto `config/models.yaml`"* — it cannot. That test's
`productionFiles()` scans `git ls-files … apps packages` (`tier01-roster.test.ts:17-27`); a file at the
**repo root** `config/models.yaml` is outside the scan. The assertion can only become `[]`, which is a
different sentence from the one R27 writes.

**Why blocking:** two seats build three different products from one requirement, and one of the three
edits the support bot mid-slice.
**What a fix must state:** whether a "declaration" is the bare id or the quoted id; and, if bare, that
the support seam's `development:hermes-glm-5.3-flash` / `z-ai/glm-5.3-flash` are a named, kept
allow-list — not an accident.

### B2 — Acceptance step 8 cannot be performed: R20 class 5 refuses the very edit the step prescribes, and R21 guarantees the old configuration keeps serving.

**Where:** SPEC `:314-318` (step 8) vs `:194-195` (R20.5) and `:199-203` (R21).

Step 8 tells V: *"Make one Free model unreachable (the cheapest: an entry pointing at a base URL that
answers nothing), restart, wait for the probe freshness window, then start a Free debate."* But R20.5
makes *"an entry whose health probe fails"* a **refusal class** of the restart command, and R21 says that
on refusal *"nothing is rewritten and nothing is stopped"* — *"every process that was listening before
the command is still listening on the same port with the same pid."*

Inputs → outcome: V edits the Z.ai `base_url:` to a dead host and runs `pnpm dev:auth:up` → the check
probes → the probe fails → **non-zero exit, nothing applied** → the stack is still serving the previous,
healthy five-slot panel → V starts a Free debate → **it runs normally**. The `422
ASK_PLAN_TIER_MODEL_UNAVAILABLE` the step demands never appears. There is no other procedure in the SPEC
that reaches the state step 8 needs (stack up, entry configured, model unreachable at ask time).

This matters more than one step: step 8 is the **only** acceptance of R15, which is the honesty law this
mission is built on (`INSTRUCTIONS.md:54-55`, "No substitution, no shrinking, no silent drop").

**Note for REQ-FIX: do not weaken R20.** *"a model that does not answer"* is V's own example of what the
check must refuse (`00-intake-S03.md:22`, the option V chose). The defect is in the step, not the rule.
A step that works without touching R20: let the probe-freshness window expire against a model that goes
unreachable **after** a successful start (stop nothing, edit nothing — e.g. V's own network path to one
maker), or state the step as UNVERIFIED-until-V-rules alongside the V-ROW in §9.

### B3 — The P1/P2 flags say six steps run today. Four of them cannot: R20 class 4 + R23 mean the merged file will not start a stack until both keys exist.

**Where:** SPEC `:286-287` (*"Steps 1, 2, 6, 7, 9 and 11 run **before** P1 and P2 are answered; they are
the acceptance V has today"*) vs `:192-193` (R20.4), `:207-209` (R23), `:56-76` (R7, the merged file),
`:120-126` (R12, V creates the key file).

At merge the file carries two `api:` entries naming `OPENAI_API_KEY` and `ZAI_API_KEY`. Neither exists:
there is no OpenAI key on this Mac (`00-intake-S03.md:69`, C10) and `.local/dev-auth/provider-keys.env`
is a file **V has not created yet** (R12: "no seat writes it"). R20.4 makes *"an `api:` entry whose key
file is absent… or whose named variable is absent or empty"* a refusal class; R23 restarts the stack
**only** on a passing check. Therefore `pnpm dev:auth:up` refuses, and the S03 lists are never live:

- **step 2** (the Free card lists `gpt-5.6-luna` and `glm-5.3-flash`) — needs the new lists live → blocked
- **step 6** (edit one line, restart, `/new` shows it) — the restart refuses on the untouched Free entries → blocked
- **step 9** (remove the grok entry, restart, the register version moves forward) — same → blocked
- **step 11** (the support bot answers *"through the whole of the above"*) — nothing above it ran → vacuous
- step 1 (read the file) and the refusal half of step 7 survive; step 7's last clause (*"reload `/new` and
  the previous lists are still there"*) is satisfied only in the trivial sense that the pre-S03 lists are.

So the flags do **not** mark exactly the steps that need keys (packet charge 4, answered: **no**). Six
steps are advertised as runnable today; **two** are.

**Second, larger consequence nothing in the SPEC states:** R19 names `pnpm dev:auth:up` *"the command
that already brings the stack up"*. After this slice merges, that command refuses on every machine that
lacks both keys — the dev stack becomes un-startable for anyone but V, and `## 3. Out of scope`
(`:330-338`) does not mention it. That is a product decision, not a wording one → **V-ROW in §9**.

## 4. Non-blocking findings (each ticketed by end of pass; the orchestrator routes)

- **N1 — one wrong constant, three spellings.** SPEC `:10-11` says the lane is `slice/tiers-s03` @
  **`7188b167`**; DECISIONS `:70` repeats it; INSTRUCTIONS.md's appended block repeats it ("Lane: …
  @ `7188b167`"). Measured in the lane: **`9a000c37`**. `git show --stat 9a000c37` = one test file,
  +1/−5 — so **no product line number moves and every citation survives**; the cost is that BUILD
  packets quote the wrong base. Class swept: those three members; COMMON.md carries both readings
  legitimately (`:7` "base 7188b167", `:48` "@ 9a000c37").
- **N2 — R27's `dev-api-environment` row is stale (already folded).** SPEC `:255` reads
  `9/10 — RED at base in the LANE` and *"Stays 9/10 plus R25's new case"*; the lane is **10/10** at
  `9a000c37`. The baseline log still says `rc=1 | 1 failed | 9 passed (10)` (`setup-tiers-s03.log:21`)
  because it was measured before the cherry-pick, so **the packet's "baseline rows" and the intake's
  CORRECTED line contradict each other on paper.** Folded at `DECISIONS.md:106`; the risk if that fold
  does not reach every BUILD packet is a seat shipping a real regression as "the pre-existing one".
- **N3 — R11/R28 miscount their own list.** `:118-119` enumerates username, password, query, fragment,
  a non-http(s) scheme **and** the `cli:`-slot port rule — six — then says *"each of those five"*;
  R28 `:264-265` repeats "five". The code's single gate has exactly five conditions
  (`packages/providers/src/index.ts:113-117`), so "five" reads as the URL gate and orphans the slot rule.
  A seat writes five RED tests or six.
- **N4 — the entry→slot derivation is unstated while R14 asserts properties of it.** R14 `:139-146` pins
  that the slot set equals the entries, that discovery stays order-checked, and that the first slot
  satisfies `RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT` (`apps/runner/src/main.ts:65-71`) — but nothing
  says how an entry yields a `providerRef`, a `maker`, a loopback `port`, or **its position**. Today all
  four are hand-written literals (`apps/runner/src/dev-provider-panel.ts:25-59`), whose own header warns
  *"appending is safe, reordering is not"*. Two live consequences: (a) acceptance step 10 (`grok-4.6-build`
  added under `free:`) needs a second grok slot with a ref and port no file declares — it is at least
  *parseable*, since only `provider_ref` must be unique and a duplicate `model` is admissible
  (`packages/providers/src/index.ts:159-161`); (b) the union's order decides whether slot 0 becomes Free's
  OpenAI HTTPS entry, which puts V's paid key in `VLLM_AUTHORIZATION` as the runner's primary target.
  ARCH owns the mechanism; the SPEC should name the invariant that binds the order.
  **VERDICT** add one line to R14 fixing the order (recommend: Premium's CLI entries first, so the
  primary slot stays a local relay) / **CONFIDENCE** medium / **STRONGEST COUNTER**: order is exactly what
  REQ is told to leave to ARCH, and R14 already pins the observable that matters.
- **N5 — S02 supersession trace.** S03 R8 replaces S02 R1's *"each id written as a roster member in
  exactly one file"* (`slices/S02/SPEC-v2.md:36-39`), and S02 R1 still spells `grok-4.6` where the fleet
  is `grok-4.6-build`. S03's `## 0` supersedes nothing explicitly and R15 names only S02 R3–R10, so a
  later REV lens reading S02 R1 as live finds a contradiction that is only a stale sentence.
- **N6 — packet defect (`REQ-S03.md:15` vs `:11`), and my ruling on the seat's act.** `allowed` says
  `INSTRUCTIONS.md (append only)` while `:11` orders *"the S03 row"* — and the slice table is at
  `INSTRUCTIONS.md:12-16`, so a row can only be an **insert**. **RULING: inserting the row was inside the
  contract.** The specific instruction (`:11`) and `heartbeat-requirements` SKILL.md:69, which makes "the
  slice table with `ui:` flags" part of REQ's own verification, both require it there; "(append only)" is
  the scope qualifier for the prose. The defect is the orchestrator's wording, not the seat's act. Second
  member: *"≤ 8 lines appended"* is uncountable — the seat added 1 table row + 9 lines (heading, blank,
  6 bullets, blank) by `diff`, or 6 by content; the ceiling that is measurable (`≤ 100`) holds at **95**.
- **N7 — "session id" proves nothing about blindness.** My CLAIM and the REQ seat's CLAIM on `t_089ce7cc`
  carry the **identical** string `96555a10-dafb-468d-88b3-f6c3afd4c825`, because a subagent's scratchpad
  path is keyed to the **parent** (orchestrator) session, not the seat. The CLAIM marker's `session id`
  field therefore identifies the orchestrator, not the reviewer, and cannot be used as blindness
  evidence. (My own blindness held in fact: I reconstructed every judgement from disk and from probes.)

## 5. Packet review

**`REQ-S03.md` — constants, checked one by one against their sources:** ticket `t_089ce7cc` ✓ and slice
ticket `t_f14b0ca0` ✓ (`00-intake-S03.md:4`) · cwd = the MAIN tree for a planning seat ✓ (COMMON `:7`) ·
`base: 7188b167` ✓ for the main tree · lane path ✓ · `slices/S02/SPEC-v2.md:32-168` ✓ — `## 1.
Requirements` is at `:32`, R1 opens at `:36`, R15 closes at `:167`, and `## 2. Acceptance` is at `:169`
exactly as claimed · `V-DECISIONS-PACKET.md` rows V-34/V-35 at the tail ✓ (V-36 was appended by the
orchestrator afterwards) · the F1–F10 line cites ✓ (re-measured; see §2). **One defect: N6.**

**`allowed` vs what the seat wrote.** `git -C <main tree> status --porcelain -- docs/missions/debate-tiers
.hermes/reports/debate-tiers/agent-reports` shows **one** uncommitted entry, `RESUME-HERE.md` (the
orchestrator's). The freeze diff `1f8e9b33..fb2ce0ef` carries 10 files: the seat's three
(`INSTRUCTIONS.md`, `slices/S03/{SPEC,PLAN,PROGRESS,DECISIONS}.md`, `agent-reports/REQ-S03.md`) plus six
that are the orchestrator's (the REQ-REV packet, LEDGER, `00-intake-S03.md`, `V-DECISIONS-PACKET.md`).
The intake and V-packet edits are written **about** REQ-S03 in the third person ("REQ-S03 finding 1/2/3"),
which corroborates the packet's split — but one squashed freeze commit **cannot by itself prove** which
seat wrote which hunk (see UNVERIFIED). `PROGRESS.md` is present and empty-shaped (the orchestrator's
file, correctly not filled by REQ); **no `DONE.md`**, correct for `ui: no`.

**The author's `SKILLS LOADED`:** `superpowers:using-superpowers · heartbeat-protocol ·
heartbeat-requirements · superpowers:brainstorming` — the full REQ floor, 4/4, and the orchestrator
records it verified against the transcript body. No finding.

**My own packet (`REQ-REV-S03.md`):** accurate throughout; its SPEC section map (`:10`) matches the file
line for line. It states `base: 9a000c37` for the lane, which is what I measured — i.e. **my packet is
right where the SPEC is wrong** (N1).

## 6. Charges, answered

1. **Packet review first** — done above. Constants clean; one defect (N6), ruled in the seat's favour.
2. **Intake C10–C15, F1–F12, the three CORRECTED lines** — the SPEC binds to the **corrected** facts, not
   the originals: R11 names **both** F4 gates (the `/v1` rule *and* `dev-provider-panel.ts:87-89`,
   the correction whose absence would have shipped a stack that refuses to start); R15 uses the **lane**
   numbers `:1214/:1216/:1223`-derived range, which I re-measured as exact; the lane log is treated as the
   baseline of record except at R27's one stale row (N2). C14 → R25 ✓, C15 → R16 ✓, C13 → R6 ✓, C12 →
   `## 3` ✓.
3. **R1–R29 mechanically checkable** — yes, with B1 the exception. The file's shape (`:33-94`) has one
   reading: R2 (two keys), R3/R4 (exact key sets), R5 (`^[A-Z][A-Z0-9_]*$`), R6 (≥2 entries, ≥2 makers,
   ≤1 per maker), R7 (the byte content). **Nothing lets a key value reach the file, a log, a ticket
   comment, a fixture or a handoff**: R5 makes `key:` a variable NAME, R12 forbids reading/printing, R21
   compares a `sha256` "never the contents", R22 forbids printing a value in the class-4 refusal. R11 ✓
   (both gates named as observables). R13 ✓ (states the HEALTHY record + exact `modelId`, leaves
   thinking-disabled vs a larger budget to ARCH). R14 — see N4. `:137-176` against S02 R3–R10: unchanged
   behaviour, refusal names tier **and** every missing id (the message at `apps/api/src/index.ts:1224-1226`
   carries both) ✓. `:177-210`: all four V-named failure classes present, plus three more, and the
   nothing-is-rewritten invariant is **measured** (sha256 + version + pid), not asserted ✓.
   `:211-237` against C14/F7 ✓ — a removal publishes a new version, the `:352` pin keeps its case.
4. **Acceptance as a stranger** — **B2 and B3.** Steps are numbered and V-runnable in shape; the
   preconditions are mis-mapped (B3) and step 8's procedure is self-defeating (B2). Step 10 is consistent
   with R6 and with the slot rule (F3) as far as parsing goes (N4 is the gap). Every step needing the
   served stack is UNVERIFIED by me — I never served it.
5. **`## Suites and evidence`** — R27 names 13 suites, each with an expectation; 12 of the 13 match
   `setup-tiers-s03.log` row for row; the 13th is N2. The three pin sets the charge names are each
   named with their new expectation (`dev-real-provider-only:27-41` ✓, `tier01-roster:8-50` ✓ but see
   B1's second member, `tiers-s02-rosters:204-247` ✓ but see B1). R28 lists 16 RED groups; R29 asserts
   the delta, never the absolute ✓.
6. **`ui: no` is correct.** `heartbeat-requirements` SKILL.md:33-35 — *"`ui: yes` when the slice ADDS OR
   CHANGES a surface the user sees… a slice whose only browser step is watching existing components
   render stays `ui: no`"*. S03 changes what the existing chips **say**; `apps/ui/app/new/page.tsx:196-212`
   renders them already, and R17 explicitly accepts the `default` family for `glm-5.3-flash`
   (`apps/ui/lib/models.ts:26-35` has no `glm` branch — verified) rather than adding a token. The
   DECISIONS quote of that rule is **verbatim and real** (I checked the skill body, not the quote).
   Banned words: none. Contradictions inside the SPEC: B1, B2, B3. Against S02: N5. Out-of-scope list vs
   V's verbatim goal: **nothing V asked for is out of scope** — Premium's transport, billing, the support
   bot, key rotation and the `-build` lineage are all things V excluded or already closed.
7. **Tiering** — three B (a requirement three seats would build three ways; two acceptance steps nobody
   can run), seven N. I deliberately did **not** blow N4 up to blocking: R14 states the observable and
   ARCH is the named owner.

## 7. UNVERIFIED (not passed, not failed)

- Every acceptance step that needs the served stack (3, 4, 5, 6, 8, 9, 10, 11) — I never served it, by contract.
- Whether the OpenAI platform sells the model as `gpt-5.6-luna`, and whether Z.ai answers on the
  pay-as-you-go base URL — rows V-34/V-35; no provider call from this seat.
- Which seat wrote the `00-intake-S03.md` and `V-DECISIONS-PACKET.md` hunks inside the single freeze
  commit `fb2ce0ef`. The text reads as the orchestrator's fold and the packet asserts it; a squashed
  commit cannot prove it. (Cheap fix for the class: the orchestrator commits its fold separately from a
  seat's artifacts, or names the author in the commit body.)
- `tests/integration/dev-api-environment.test.ts` at the lane HEAD — I did **not** re-run it (an
  integration suite with a database seam, and the 600s cap). N2 rests on the intake's CORRECTED line plus
  `git show --stat 9a000c37`, not on my own run.

## 8. Predictions (falsifiable — evidence that blindness held)

I expect no other lens ran the R8 oracle across **both** matchers, because reading either suite alone
looks green: `tier01-roster`'s quoted-exact matcher genuinely does not see the support files, and that is
the suite the intake quotes first (F1). I predict a reader who checks B1 by eye on `tier01-roster` will
report it as a non-issue and be wrong, and that the same reader will accept "Stays 4/4" on
`tiers-s02-rosters` without noticing its matcher is bare. On B2/B3 I predict the common failure is the
opposite of mine: a reviewer who reads R20 as "the check refuses" and the acceptance as "V runs it" but
never composes the two, because the two live 100 lines apart. I predict at least one other lens flags the
`7188b167`/`9a000c37` constant (N1) — it is the most visible defect and the least expensive. I expect
nobody flagged N7; I only saw it because my own CLAIM had to carry the same id.

## 9. Row for V (unnumbered — the orchestrator numbers it at transcription)

`V-ROW: NEW · S03 · slice ticket t_f14b0ca0 · **After this slice, `pnpm dev:auth:up` will refuse to start
the stack at all until both Free keys exist and both models answer.**`

V chose the restart that *"first checks the file (typos, a CLI that isn't installed, a model that doesn't
answer) and refuses without touching anything if it's wrong"* (`00-intake-S03.md:22`). Read literally —
and SPEC R20 does read it literally — the merged `config/models.yaml` names `OPENAI_API_KEY` and
`ZAI_API_KEY`, so with no OpenAI key (row V-34) and the Z.ai balance at 429 (row V-35), the check refuses
and **the dev stack does not come up at all**. Today it comes up and the Free tier simply refuses asks
with the honest S02 message naming the missing model.

**Recommended default:** keep V's rule for the file's SHAPE (a typo, an unknown transport, a missing CLI,
a malformed key name — refuse, always), but let a **key or probe** failure start the stack with that
entry's slot absent and a named warning, so the tier refuses asks the way S02 already does. That makes
acceptance step 8 runnable and keeps the machine usable while V's keys are pending.
**Smallest yes/no for V:** *"If a Free model's key is missing or the model doesn't answer, should the
stack still start (that tier then refuses debates, naming the model) — or should the whole stack refuse
to start?"*
**VERDICT** start-with-the-slot-absent / **CONFIDENCE** medium / **STRONGEST COUNTER:** V named "a model
that doesn't answer" as a refusal cause in V's own words, and a stack that starts half-configured is
exactly the silent degradation this mission's honesty law exists to prevent — the counter-argument is
that a refusal V cannot bypass is the honest behaviour, and the acceptance should be re-flagged instead.

## 10. Addendum — the intake changed under this review (V's 16:05 update), and B1 survives it

`00-intake-S03.md` and `V-DECISIONS-PACKET.md` were modified **during** this pass (they were clean in my
`git status` at ~14:25 and carried new sections when I re-checked at the end): V's update *"Switch the
5.3 to GLM 4.7. we got a subscription, use them API_TOKENS"*, the orchestrator's F13/F14, V-35 answered
and row V-37 raised. My verdict was reached on the frozen SPEC and is **unchanged** by it. Two of my
findings move:

- **B1 gets worse, and the class I named fires immediately.** V-37's two candidates are `glm-5.3-flash`
  (default) and `glm-5.3` (alternative). I re-ran the oracle for both (appended to
  `p2-r8-declaration-oracle.out`): **both** hit the same three support files under the bare matcher —
  `glm-5.3` collides because it is a **substring of `glm-5.3-flash`**, which is exactly the prefix/suffix
  collision I predicted would re-fire. `glm-4.7` is the only clean id, and F13 says the platform will not
  answer under it. So **no id V can choose makes R8 true as written** — the matcher must be named.
- **R13's mechanism is now measured, not open.** F14: `max_tokens: 64` + `thinking: {type:"disabled"}`
  returns `"OK"`; `max_tokens: 8` fails either way. R13 was right to state the observable and leave the
  mechanism to ARCH; ARCH now has the answer and does not need to re-derive it.
- **R7's `base_url` is superseded before merge.** V-35 is answered in favour of
  `https://api.z.ai/api/coding/paas/v4`, so the file content R7 pins is already stale — which is the
  SPEC's own R16 exercised (one line, edit + restart), not a new finding. REQ-FIX should re-freeze R7's
  block rather than leave V to edit it on day one.
