# ARCH-REV(S02) pass 2 — blind, SCOPED review of `slices/S02/PLAN.md` Revision 2 and of the packet that produced it

- **Verdict: PASS (pass 2 of 3).** Zero blocking findings. Eight non-blocking (N1…N8), three of them
  against the orchestrator's packets rather than the plan.
- seat ARCH-REV-S02-p2 · ticket `t_1dc7049a` · session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886`
- started 2026-09-09 23:39:22 EEST · main tree HEAD `697ebf8a`, 97 dirty entries (other missions, untouched)
- lane `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine`
  @ `7f89f7b7` on `slice/tiers-s02`; `git status --porcelain | wc -l` = **0** before and after every probe
- blind: no contact with the ARCH-FIX seat or the pass-1 reviewer; nothing under review edited; no git writes
- under review: `docs/missions/debate-tiers/slices/S02/PLAN.md` Revision 2 (1042 lines),
  `.hermes/planning/debate-tiers/packets/ARCH-FIX-S02.md`, and my own packet `ARCH-REV-S02-p2.md`
- probes: `.hermes/reports/debate-tiers/probes/ARCH-REV-S02-p2/`

---

## 1. What I ran, and what it said

Every command PLAN.md Revision 2 publishes was re-run **by me**, at base, in the lane, from one script
— `clusters-p2.sh` (scratch) → `probes/ARCH-REV-S02-p2/clusters-p2.out`, per-command logs beside it.
Verbatim, 2026-09-09 23:41:20 → 23:42:17 EEST:

| Command | PLAN.md claims at base | I measured |
|---|---|---|
| **S02-C1** `…tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | `Test Files  1 passed (1)` · `Tests  21 passed (21)` · rc=0 · wall 14 s | `Test Files  1 passed (1)` · `Tests  21 passed (21)` · rc=0 · 14 s — **agrees** |
| **S02-C3** `…tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | `Test Files  1 failed (1)` · `Tests  3 failed \| 2 passed (5)` · rc=1 | `Test Files  1 failed (1)` · `Tests  3 failed \| 2 passed (5)` · rc=1 — **agrees**, three failure titles byte-identical to §S02-C3-S5 |
| **S02-C2** `…tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | `Test Files  2 passed (2)` · `Tests  45 passed (45)` · rc=0 · wall 14 s | `Test Files  2 passed (2)` · `Tests  45 passed (45)` · rc=0 · 14 s — **agrees** |
| **S02-C4** `…tiers-s02-wire.test.ts load01-live-proof s7-authorization contract` | `Test Files  3 passed (3)` · `Tests  39 passed (39)` · rc=0 · wall 2 s | `Test Files  3 passed (3)` · `Tests  39 passed (39)` · rc=0 · 2 s — **agrees** |
| §6 probe 3 (the file-count gate) | exits 0 with `Test Files 1 passed (1)` | `Test Files  1 passed (1)` · `Tests  7 passed (7)` · rc=0 — **agrees** |
| §6 probe 4 / F-4 | `Tests 6 passed (6)`, rc=0 | `Test Files  1 passed (1)` · `Tests  6 passed (6)` · rc=0 — **agrees** |
| §7 **S02-V1** `api contract load01 s7-authorization s14-contract` | `Test Files 1 failed \| 4 passed (5)`; `Tests 3 failed \| 63 passed (66)` | `Test Files  1 failed \| 4 passed (5)` ✓ · **`Tests  3 failed \| 65 passed (68)`** · rc=1 — **DISAGREES by 2** (finding **N1**) |

Per-file bases, measured for the F-7 arithmetic: `api` 24/24 · `contract` 7/7 · `load01` 1/1 ·
`s7-authorization` 31/31 · `s14-contract` `3 failed | 2 passed (5)` · `evaluator-database` 21/21.
All six agree with `BASELINE.md:106-109`, `:35`, `:73`. **The plan's inputs are exact; one sum is not.**

The three step-local RED commands (`S02-C1-S3`, `S02-C2-S2`, `S02-C4-S2`) each name a file that does
not exist at base, and each is the *only* filter, so vitest does **not** silently drop it — all three
exit `rc=1` with `No test files found`. That is a different failure mode from §6 probe 3's silent drop
and does not weaken the file-count gate, which applies to the multi-file cluster commands.

**Zero disagreements on every gate command. One disagreement, on a non-gate expected value.**

**The both-ways trace, by the pass-1 reviewer's own parser, unmodified**
(`probes/ARCH-REV-S02/trace.py`; I read its expansion code before trusting its output — it derives the
step set from §4's own headings independently of both tables, and expands `…` ranges properly). Output
at `probes/ARCH-REV-S02-p2/trace-out-p2.txt`: 15 requirements, **40 steps** (M 4, C1 8, C3 6, C2 11,
C4 4, V 7), and all five checks answer `none` — no requirement without a step, no §3 name §4 never
defines, no §4 step §3b never covers, no §4 step no forward row names, **no step outside both tables**.

---

## 2. Rulings on the charges this pass carries

### Charge 1 — the packets, reviewed first

`ARCH-FIX-S02.md`'s constants are exact where they are load-bearing. I re-measured every product line
it cites, in the lane: `tests/unit/api.test.ts:5` (the `evaluateAskAdmission` import), `:10` (the
`@debateai/api` specifier), `:365` (the query-list assertion) ✓ · `apps/api/src/index.ts:1284`,
`:1289`, `:1293`, `:1303`, `:1317` ✓ · `packages/contract/src/client.ts:88-91` ✓ ·
`packages/db/src/index.ts:767-796` and `:1249-1251` ✓ · `migrations/0040_account_erasure.sql:4317` ✓,
`:6141-6143` (the `REVOKE ALL` the plan's no-DROP decision rests on) ✓, `:6366-6369` (the
`GRANT EXECUTE … TO debateai_content_provision`) ✓.

**The `allowed` list against what the seat actually wrote.** The ARCH-FIX seat's writes, isolated:
`git diff --stat e6b24748..e7350ee4 -- docs/missions/debate-tiers/slices/S02 docs/architecture/01-decisions`
→ `PLAN.md` +670/−148 and `DECISIONS.md` +53, **and nothing else**; `ADR-0024` untouched, exactly as
its handoff states; `agent-reports/ARCH-FIX-S02.md` new. `PROGRESS.md` (+5) and `V-DECISIONS-PACKET.md`
(+3) moved in `697ebf8a`, the orchestrator's own commit. **The seat crossed nothing.** Two packet
findings fall out of getting there: **N7** (the freeze-commit rule) and **N6** (charge 2's stale
count). One more against my own packet is recorded at **N7** as well.

**The author's `SKILLS LOADED` against the architecture role floor:** short by
`superpowers:brainstorming` (`heartbeat-protocol` §1 makes it the architecture floor; COMMON §1 binds
the floor independently of the packet's list, and the ARCH-FIX packet's list omits it too). Finding
**N8**.

### Charge 2 — is B1 closed? **YES, all three members, and the closure is mechanically detectable.**

**(a) C1 — the order is reversed and the mechanism holds.** Execution order is now
`S02-C1-S2 → S3 → S1 → S4 → S5 → S6 → S7 → S8` (`PLAN.md:239-240`), with step ids deliberately
unchanged so every citation in `DECISIONS.md`, §3/§3b and the pass-1 verdict still resolves. I verified
the mechanism line by line rather than reading the claim: `migrate(pool)` builds the directory URL from
`import.meta.url` and reads it **from disk** — `readdir` `packages/db/src/index.ts:769`, filter
`/^\d+.*\.sql$/` and `.sort()` `:769`, skip-if-applied `:781-782`, `client.query(await readFile(...))`
`:783` — and the C1 suite calls `migrate` on a fresh embedded Postgres
(`tests/integration/evaluator-database.test.ts:74`; `selectPrototypeDatabaseMechanism`
`tests/support/testDatabase.ts:31-38` pins embedded-postgres). With `0061` absent from disk all four
cases fail; with it present, cases 1 and 2 are green before they are written. **The step's criterion is
now a counter, not a judgement:** `S02-C1-S3` is marked done only on `4 failed`, and a frame showing
`2 failed / 2 passed` is defined as "the migration was written first, restart from this step"
(`PLAN.md:283-285`). That is the one detector no command can provide, and it exists.

I also checked the ordering is safe in the other direction: `S02-C1-S1` adds `'planTier'` to `0040`'s
extra-key allow-list (`:4270-4275`, a `p_run - ARRAY[…] <> '{}'` rejection) **before** `S02-C1-S5` puts
the key into the encrypted payload, so no step leaves a window in which `core.create_encrypted_run`
rejects a payload the code sends.

**(b) C2 — one RED run, and it covers every case the cluster authors.** `S02-C2-S1` now authors **all
nine** cases before any build step (`PLAN.md:458-509`); `S02-C2-S2` is the single RED run and is marked
done only on `9 failed` (`PLAN.md:510-514`). `S02-C2-S6` and `S02-C2-S7` no longer author anything —
they verify case 7 and case 8 against S02-C2-S2's own frame, RED line beside GREEN line. Both former
post-fix cases are RED-able at base and I re-measured why: `grep -rn 'ASK_PLAN_TIER_MODEL_UNAVAILABLE'
apps packages tests acceptance` in the lane returns **0**, so case 7's 422 code does not exist; and the
unfiltered path provisions a run, so case 8's `connectCalls === 0` fails. R15's frames 1–6 are all
inside that set (cases 1–5 and case 8) and all shown failing at one step. **The charge's own wording
says "all eight"; the answer is nine of nine** — see **N6**.

**(c) C4 — the case moved out of the build step.** `S02-C4-S1` authors both cases (`PLAN.md:656-670`),
`S02-C4-S2` is the one RED run on `2 failed`, and `S02-C4-S3` is one line with "no test is written in
this step" stated in bold. I confirmed the second case is genuinely RED at base and not merely
tautological: `grep -c 'planTier' apps/api/src/index.ts` = **0**, so the count half already holds
(`grep -rn '\.startRun(' apps packages` = exactly one, `apps/api/src/index.ts:1293`) while the
`planTier`-at-the-call-site half fails, which is the half the guard exists for.

**(d) C3 — swept, no member,** because it has no implementation step. The sweep is recorded member by
member at `PLAN.md:225-235` as a table: four clusters examined, three members found, three closed.

### Charge 3 — N1/N2/N4/N6/N7/N8/N9/N11: **all eight closed.**

- **N1 / N2 — closed, verified by running the parser myself.** Zero orphans in all five checks (§1).
  The three pass-1 orphans and the `S02-M3` ghost are gone; the merge steps are now in the
  `**S02-Mn · …**` form the parser reads. R15's forward row (`PLAN.md:191`) now names only
  `S02-C1-S2`/`S02-C1-S3` (authored / shown failing) and `S02-C2-S1`/`S02-C2-S2`, with
  "**No implementation step carries a frame**" stated in the row. The parser's own per-requirement dump
  confirms it: `R15: ['S02-C1-S2', 'S02-C1-S3', 'S02-C2-S1', 'S02-C2-S2']`.
- **N4 — all eight members re-measured by me in the lane at `7f89f7b7`, all now exact**
  (`probes/ARCH-REV-S02-p2/measure-p2.out`):
  1. import at `tests/unit/api.test.ts:5`, specifier `"@debateai/api"` at `:10`, and `:13` is
     `fixtureDiscoveredPanel` — the plan now says exactly this and calls a relative import a finding ✓
  2. `:365` is the `prepare_run_key_provision|create_encrypted_run|INSERT INTO core\.run` assertion,
     `:366` blank ✓
  3. six ask literals in three files — I reproduced all six ✓
  4. `evaluator-database.test.ts:1378` = `};`, construction `:1379-1386`, `submit` `:1387-1389` ✓
  5. `0040:4317` = `jsonb_array_length(p_run->'discoveredPanel')`, `:4318` = the panel itself ✓
  6. placeholders `$1…$19` at `:1249-1251`, **`$13` twice on `:1250`** (`jsonb_array_length($13::jsonb),
     $13::jsonb`), 20 columns `:1243-1247` against 19 parameters — the step names both occurrences and
     requires the before/after in the ticket comment ✓
  7. 49 `startRun(` · exactly one `.startRun(` at `apps/api/src/index.ts:1293` · **13** files under
     `tests/` + `acceptance/dual-maker-proof.ts` = 14 — corrected by an appended note, `DECISIONS.md`
     staying append-only ✓
  8. the call opens `:1293` and closes `:1317` with `},lease.client);` ✓
- **N6 — closed.** `PLAN.md:385-403` states why C3 carries no RED frame and gives a four-row base-state
  table. Its two RED-at-base cases are named (case 1 and case 4, both RED only because
  `PLAN_TIER_ROSTERS` has not merged — I confirmed `grep -rn 'PLAN_TIER_ROSTERS' apps packages tests` =
  **0** in the lane), and the two already-green guards are named as standing guards.
- **N7 — closed in the expression, and the case that proves it does prove it.** I did not read the fix;
  I ran it. `probes/ARCH-REV-S02-p2/n7-filter-oracle.out` executes both shapes over **ten** panels —
  the plan's own cases 1–6 and 9, plus three I added: three providers on one id with a second id
  doubled, a panel arriving in reverse roster order, and a duplicate on a *missing* id.
  **Pass-1's `flatMap(filter)`: 2 violations of frozen R4. Revision-2's `map(find).filter()`: 0
  violations, roster order held in all ten**, and R6's `missing`, computed from the filtered panel as
  `S02-C2-S4` writes it, refuses in exactly the four incomplete-roster shapes and in no other. Case 9
  (four members, three distinct ids → `panelSize` 3) is the minimal case that separates the two shapes,
  and it is authored at `S02-C2-S1` before any build step.
- **N8 — stated once, and as a pin rather than a role.** `PLAN.md:143-156` gives name **and** shape
  (`PLAN_TIER_ROSTERS`, a frozen record keyed by tier whose values are ordered arrays), sources both to
  `slices/S01/PLAN.md:226-236`, calls the pin "a prediction until it is read", and keeps S02-M4 as a
  verbatim read-back that **BLOCKS** on any difference — "never a substitution the cluster seat
  invents. A cluster that begins before M4 is a finding." Pass 1's contradictory "this plan does not
  guess them" sentence is withdrawn in the same block. The name is then used consistently at `:394`,
  `:406` and `:521`.
- **N9 — closed.** `packages/contract/src/client.ts:88-91` builds the detail as
  `` `${serverCode}: ${serverMessage}` `` (re-measured). Every wording now says `CODE: message` —
  `:186` (the §3 row), `:566-574` (the message step) and `:861-872` (S02-V5, which measures the string
  rather than the SPEC's word). The contradiction with frozen R10 is a `DECISIONS.md` row, not a SPEC
  edit.
- **N11 — closed, and I re-ran everything it was about.** The §5 header (`PLAN.md:696-703`) now claims
  only what was run, names the script and the 23:11–23:12 window, and records the TDD path each command
  silently drops. Nothing in any cell qualifies the header. My own re-run of all four cluster commands
  plus both §6 probes agrees to the digit.

### Charge 4 — the orchestrator's folds, F-6, F-7 and row V-19

- **N3 fold — closed, byte-exact.** I diffed `DECISIONS.md:144` against the main tree's
  `.hermes/TOOLING-TRAPS.md:1041`: **identical**. The lane's copy (1034 lines) does not carry the entry
  at all, exactly as recorded. `PLAN.md` now cites TRAPS by heading in all four places
  (`:260-263`, `:288-291`, `:374-377`, `:851-854`); three of the four are present in the lane's copy
  (`:144`, `:816`, `:896`) and the fourth is the main-tree-only one quoted in `DECISIONS.md`.
- **N5 fold — closed.** `grep -n 'ADR-002' PLAN.md` shows `ADR-0024` throughout; the old `:668`
  sentence survives only as the quoted subject of its own correction at `:1031-1041`. `ls
  docs/architecture/01-decisions/` confirms `ADR-0021`, `-0022`, `-0023`, `-0024` and nothing higher,
  so "the next free number is `0025`" is right. The single `0023` left inside `ADR-0024` is `:51`,
  `migrations/0023_evaluator_foundation.sql:429` — an unrelated migration filename, as claimed.
- **N10 fold — closed.** `BASELINE.md:375-376` carries `dr181-ceiling` 3/3, `dr184-review-resilience`
  6/6 and `register-s09` 3/3 for **both** lanes; `register-version-boundaries` 6/6 is at `:119-120`.
  §7's "run once to confirm" now has something to compare against, and §9 marks F-4 DISCHARGED with
  "A BUILD or REV seat reading this section must not re-raise it."
- **F-6 — the remedy is right and I proved it on a known hit; the diagnosis and its receipt are not.**
  The pass-1 published form `grep -rn ': AskRequest = {|as AskRequest' tests` answers **0 hits, rc=1**
  — reproduced. The corrected form `grep -rnE ': AskRequest = \{|as AskRequest' tests` answers **6 hits
  in 3 files**, and I confirmed a known hit is real (`tests/unit/api.test.ts:125` is
  `const ask: AskRequest = {`). **The fix is correct and safe under both grep binaries on this
  machine.** Two defects behind it: findings **N2** (the "8 lines on `api.test.ts`" receipt does not
  reproduce) and **N3** (there are two greps here, and the plan names one).
- **F-7 — the remedy is present and correctly placed.** `S02-M3` gains item 4 (`PLAN.md:132-142`):
  re-measure every §5 command's base immediately after the rebase, into the cluster's ticket comment,
  before that cluster's first RED test. Every post-rebase figure in §5 (`:712-714`) and in the cluster
  steps (`:438-445`, `:644-652`, `:684-690`) is stated as **that base plus this slice's own delta**
  (`+1` file and `+9`/`+4`/`+2` tests), with the pre-rebase arithmetic recorded as a check rather than
  a gate. C1 correctly keeps its absolute `25`, because it runs before the rebase. The one place the
  remedy did not land cleanly is `S02-V1` — finding **N1**.
- **Row V-19 — it exists and its default binds a single build.** `V-DECISIONS-PACKET.md:25`, with the
  orchestrator's ruling at `:42` ("appended with its recommended default binding"). The default —
  "the R3 filter takes the FIRST healthy panel member per roster id and the duplicate is dropped in
  silence" — is exactly one expression, `S02-C2-S3`'s `roster.map(find).filter(...)`, asserted by
  exactly one case, case 9. It carries the `VERDICT / CONFIDENCE / STRONGEST COUNTER` triple and a
  smallest yes/no, and the counter routes the alternative (a typed error or a warning mark) to a slice
  of its own rather than leaving a fork inside this one. **No build seat has anything to choose here.**

### Charge 5 — scope

Every finding below is inside pass 1's closures or created by the revision, with one exception marked
INHERITED and explicitly not charged against this pass (**N5**).

---

## 3. Findings

### N1 — `S02-V1`'s published total is wrong by two, and its two published figures are one S01-delta out of phase

`PLAN.md:810-811`: *"Pre-rebase arithmetic, from `BASELINE.md`: api 24/24, contract 7/7, load01 1/1,
s7 31/31, s14-contract 2/5 = `Tests 3 failed | 63 passed (66)`."*

I ran the published command as written, at base, in the lane:
**`Test Files  1 failed | 4 passed (5)` · `Tests  3 failed | 65 passed (68)` · rc=1.**

The sum added the three `s14-contract` failures to 63 and dropped `s14-contract`'s **two passes** from
both the passed count and the total. Every input is right — I re-measured all five files individually
and all five match `BASELINE.md:106-109` / `:35` — only the addition is wrong. The compounding half:
`PLAN.md:813-814` then states the **post**-rebase figure as `3 failed | 65 passed (68)`, which is
exactly the true **pre**-rebase value. A correctly built, correctly rebased lane reads
`3 failed | 67 passed (70)`. So both published numbers are reachable — at the wrong moment — and a seat
that measures `68` before the rebase would conclude S01's two cases had already landed.

Concrete inputs → wrong outcome: `REV(S02)` runs S02-V1 on the merge candidate, reads `70`, and finds a
plan saying `68`; or runs it pre-rebase, reads `68`, and finds a plan saying `66`. Either way it must
adjudicate an arithmetic error inside the one verification item whose delta is ZERO, on a HIGH-risk
slice. **Non-blocking** only because the step states its own gate in bold two lines above the bad
number — *"the number is not the gate — the ZERO delta is"* — and instructs the seat to write the M3
base beside the result. *VERDICT correct the two figures to `3 failed | 65 passed (68)` pre-rebase and
`3 failed | 67 passed (70)` post-rebase, or delete both and keep only the ZERO-delta rule /
CONFIDENCE high / STRONGEST COUNTER: the plan already demotes the number to a checkable aside, so
deleting it costs nothing and removes the only place F-7's own class survives.*

### N2 — the measurement that certifies F-6's blessed grep form does not reproduce

`PLAN.md:967` and `DECISIONS.md:161` both certify S02-M4's grep with the same receipt: *"a BRE with an
ESCAPED `\|`, which IS correct BRE alternation here: verified in the lane, it answers 8 lines on
`tests/unit/api.test.ts`"*.

Measured by me in the same lane at `7f89f7b7`, under **both** grep binaries available on this machine:
`grep -n 'PLAN_TIER_ROSTERS\|PlanTier' tests/unit/api.test.ts` → **0 lines, rc=1**. That file carries
**zero** occurrences of `PlanTier` and **zero** of `PLAN_TIER_ROSTERS` at base. I chased the plausible
mis-attributions before raising this: `slices/S01/PLAN.md` answers 14, `slices/S02/PLAN.md` answers 9,
the lane's entire `tests/` answers 0. None is 8.

**The claim the receipt supports is nonetheless true**, and I proved it independently rather than
leaving it in doubt: on a fixture I built with a ground truth I control (one line carrying
`PLAN_TIER_ROSTERS`, one carrying `PlanTier`), the published BRE form answers **exactly 2 lines**, and
so does the ERE equivalent. So S02-M4's gate is sound and no step is at risk. What is at risk is
`heartbeat-protocol` §3.6: a figure formatted as a measurement that no run produces, inside the very
finding whose subject is *a published command that answers zero and looks like a pass*.
*VERDICT replace the receipt with the run that produced it, or with the fixture proof / CONFIDENCE
high / STRONGEST COUNTER: none — I could not find any artifact in this repository for which that
command answers 8.*

### N3 — `grep` is two different binaries here, and which one you get depends on how the command is run

`PLAN.md:775-779`, `:958-962` and `DECISIONS.md:161` state as an unconditional fact that *"This Mac's
`grep` is **`ugrep 7.8.4`**"*, measured in the lane. Measured by me in the same lane at the same commit,
**from a `.sh` file** — which every packet in this mission requires — `grep --version` answers
**`grep (BSD grep, GNU compatible) 2.6.0-FreeBSD`**.

Both measurements are correct. Cause, measured: inline in a harness Bash call, `grep` is a **shell
function** installed by Claude Code's shell snapshot that execs `claude -G --ignore-files --hidden -I …`
with `ARGV0=ugrep` → ugrep 7.8.4 (`type grep` names the snapshot file). A child shell running a `.sh`
does not inherit the function, so `grep` resolves to `/usr/bin/grep` → BSD grep. There is no `ugrep`
binary on `PATH` at all.

The consequence that matters for the plan: its **second** stated consequence is false under the binary
a script-running seat gets. `grep -rnE ': AskRequest = {|as AskRequest' tests` — `-E` with an
**unescaped** brace, which the plan says `ugrep` rejects with `invalid repeat` — ran clean for me:
**rc=0, stderr empty, the same 6 hits**. The **first** consequence is true under both (`0 hits, rc=1`
for the bare-pipe BRE — I reproduced it), so **F-6's remedy is right and safe either way**, and
`DECISIONS.md` D-F6's binding *rule* ("`-E` with every brace backslash-escaped, or a BRE with
backslash-escaped pipes, never a bare pipe without `-E`") holds under both binaries. Only the recorded
cause is half the machine.

This mission runs Claude seats (inline → ugrep) and Codex/Grok seats and `.sh` scripts (→ BSD grep) by
design, so the split is a standing hazard for every published command, not a curiosity.
*VERDICT record the SPLIT in `.hermes/TOOLING-TRAPS.md` — "the grep you get inline is not the grep you
get from a `.sh` file" — beside the two escaped-pipe headings that already exist, and keep D-F6's rule
as written / CONFIDENCE high / STRONGEST COUNTER: a seat could be told to pin `command grep` or an
absolute path, but that fixes one command rather than the family, and the family is what keeps biting.*
The TRAPS file is the orchestrator's, which is why this is filed rather than fixed.

### N4 — R15's frame numbering contradicts itself in three places

The substance is right — all nine cases are authored at `S02-C2-S1` before any build step, and §3's
R15 row (`PLAN.md:191`) is **correct**: frames 1–6 authored at `S02-C2-S1`, shown failing at
`S02-C2-S2`, frame 7 in C1. The labels a downstream reviewer reads are not:

- `PLAN.md:458-460` titles the step *"RED frames 1–6 of SPEC R15, plus R7's HTTP face, R8's no-run case
  and N7's duplicate-id case"* — which reads cases 1–6 as frames 1–6. But **case 6 is the empty-panel
  guard, which is not one of R15's seven**, and `PLAN.md:496` labels **case 8** *"no run on a refusal
  (SPEC R8, R15's frame 6)"*. Frame 6 is therefore assigned to two different cases.
- The RED-map cell at `PLAN.md:228` accounts for *"R15 frames 1–6, plus R7's HTTP face and N7's
  duplicate-id case"* — **8 items for 9 cases**; R8's no-run case is missing from the accounting.
- Frozen `SPEC-v2.md:159-162` lists seven frames: free filter, premium filter, all-members-missing,
  single-missing, several-missing, no-run-on-refusal, tier-read-back. Mapping the nine cases against
  it: cases 1–5 = frames 1–5, case 8 = frame 6, C1's cases 3–4 = frame 7; cases 6, 7 and 9 are extra
  guards that serve R6/R7/R4 and are not R15 frames.

Partly inherited (pass 1 used the same "frames 1–6" shorthand for six cases) and sharpened by the
revision, which added three cases without re-deriving the accounting. Nothing breaks — the case list is
unambiguous and `S02-C2-S2`'s `9 failed` gate does not depend on the labels — but N2 exists precisely
because the trace labels are what a REV seat reads to check R15 mechanically.
*VERDICT relabel to "cases 1–9, of which cases 1–5 and 8 are R15's frames 1–6" in the three places /
CONFIDENCE high / STRONGEST COUNTER: it is prose and the gate is a count, so a build seat is never
misled — but a reviewer checking R15 frame by frame is.*

### N5 — INHERITED, recorded not charged: R15's frame 3 is specified "in full" and case 3 asserts half of it

`SPEC-v2.md:163-168` spells the all-members-missing test out *"in full, because it is the one the wrong
build passes silently"*: it **answers 422**, with `error: "ASK_PLAN_TIER_MODEL_UNAVAILABLE"`, **a
message naming every roster member of that tier**, and asserts the code is not
`MAKER_INVENTORY_UNSATISFIED`. `PLAN.md:475-478` (case 3) asserts the code and the not-. The 422 face
is asserted by case 7 against "a refusing roster" whose tier is unspecified; the "names every missing
member" half is asserted by case 5, which is premium with **two of three** missing, not all-missing.
No single case carries the frame as the SPEC spells it.

**This text is byte-identical to pass 1** (I diffed `681bc09d..e7350ee4`), pass 1 did not raise it, and
my packet's charge 5 scopes this pass to the closures. It is recorded here rather than left silent
because it costs one assertion — case 3 also asserting the message names both free roster members —
and because acceptance step 6 and `S02-V5` both already pin the exact Free string. **It does not affect
this verdict.** *VERDICT fold it into `DECISIONS.md` for the C2 build seat / CONFIDENCE medium /
STRONGEST COUNTER: the three halves are each asserted somewhere, so R15 is arguably met by the suite as
a whole and the SPEC's "in full" describes the *shape* rather than one `it()` block.*

### N6 — packet defect (orchestrator): charge 2 quotes a count that matches neither the frozen SPEC nor the revision

`ARCH-REV-S02-p2.md:24`: *"does S02-C2-S2's single RED run cover all eight of R15's frames?"* Frozen
`SPEC-v2.md:161-162` says **"Seven in all."** The revised C2 suite has **nine** cases. The "eight" is
pass 1's B1-remedy sentence — which counted the *cases* the suite then had — copied forward as a
*frame* count, and by dispatch time it was stale in both directions. A reviewer answering the charge
literally either checks the wrong number or reports a mismatch that is the packet's, not the plan's.
Same class as pass 1's F-5 and the ADR-number collision: **a packet quoting a constant it did not
re-derive after the work moved.** *VERDICT quote frozen counts from the frozen file and re-derive any
count the rework moved / CONFIDENCE high / STRONGEST COUNTER: none — the count is checkable in one
`sed`.*

### N7 — packet defect (orchestrator): the freeze-commit rule is false at these commits, and the commit named as the freeze does not contain the artifact under review

My packet §1 states: *"the freeze commits … `git diff --stat <previous>..<latest> -- docs/missions/debate-tiers`
is exactly what the seat under review changed"*. Measured:

- `git show --stat 697ebf8a` — the commit the DISPATCHED comment names as "the freeze commit", whose
  own subject reads *"ARCH-FIX(S02) READY — PLAN S02 Revision 2 (1042 lines)…"* — lists **7 files and
  none of them is `PLAN.md`**.
- `PLAN.md` Revision 2 (+670/−148) and `slices/S02/DECISIONS.md` (+53) were committed in **`e7350ee4`**,
  subject *"MOCK(S01) READY — MOCK.md, the canvas record, the DONE(S01) node for V, folds, graph"* — a
  commit for a different node of a different slice.
- `git diff --stat 2432f61a..697ebf8a -- docs/missions/debate-tiers` therefore hands the reviewer 205
  lines of `S01/MOCK.md` plus S01's `DECISIONS`/`PROGRESS` as part of "what the seat under review
  changed".

The ARCH-FIX seat reported the recurrence itself (its handoff line 32) and made no git writes; the
cause is the orchestrator's freeze using `git add -A` in a tree two sessions are writing — the exact
entry already in `.hermes/TOOLING-TRAPS.md` under *"## git add -A in a tree that two sessions are
writing (2026-09-02, cost: three files committed under wrong messages)"*. **The trap is written down
and it fired anyway.** Cost to this pass: ~8 minutes and four extra git invocations to reconstruct the
real boundary (`e6b24748..e7350ee4 -- slices/S02` is the ARCH-FIX seat's true output, and against that
boundary the seat crossed nothing).
*VERDICT freeze with named paths, never `-A`, and make `packet-check.sh` assert that the commit it
names as a freeze contains the artifact the packet sends the reviewer to read / CONFIDENCE high /
STRONGEST COUNTER: none — it is a two-line assertion.*

A smaller sibling in the same packet: `allowed` gives the scratch dir as
`scratchpad/seats/ARCH-REV-S02` (no `-p2`) while the probes dir is `probes/ARCH-REV-S02-p2/`, so two
blind passes share one scratch directory while their probes are separated. I suffixed every file `-p2`
to avoid collision; the fix is to make the scratch dir per-pass like the probes dir.

### N8 — the ARCH-FIX seat's `SKILLS LOADED` is short of the architecture role floor, and so is the packet that dispatched it

`ARCH-FIX-S02-handoff.md:5` lists `superpowers:using-superpowers`,
`dialectical-engine:heartbeat-protocol`, `dialectical-engine:heartbeat-architecture`,
`superpowers:receiving-code-review`, `superpowers:writing-plans`. `heartbeat-protocol` §1 makes the
architecture floor `brainstorming`, **then** `writing-plans`; COMMON §1 binds the floor independently
of the packet's list. `superpowers:brainstorming` was not loaded, and `ARCH-FIX-S02.md:4`'s own skill
list omits it too — so the cause is the packet, not the seat's honesty. The seat's line is otherwise
exact and it declared the scoped-variant substitution explicitly, which is the right form.
Practical cost on a rework pass that re-issues an existing plan: near zero, which is why this is
non-blocking. *VERDICT the packet's skill list names the role floor in full, or says which floor skill
it is deliberately dropping and why / CONFIDENCE medium / STRONGEST COUNTER: brainstorming is a
divergent-options skill and a scoped rework under a verdict is convergent, so dropping it may be right
— but then the packet should say so rather than omit it silently.*

---

## 4. What I tried to break and could not

My posture was to refute (`heartbeat-reviewer` §2). Six attempts failed; recorded so nobody re-derives
them.

1. **"The widened §3b ranges fake the trace closure."** They do not. I read `trace.py`'s extraction and
   expansion before trusting it: the step set comes from §4's own `- **S02-…·` headings, independently
   of both tables, and `expand()` walks `Sn…Sm` ranges properly. 40 steps, five checks, all `none`.
2. **"Adding `plan_tier` to `core.run` breaks a suite that pins an exact column set."** It does not.
   The only `SELECT *` inside the C1/C2 cluster commands hits `memory.question_key`
   (`evaluator-database.test.ts:478`, `:513`); the single `FROM core.run` read there is a two-column
   projection (`:1397`); and the sharpest whole-row-shaped assertion in the repo,
   `tests/integration/database.test.ts:1087-1093`, is also a projection. The plan's "its 21 cases stay
   21" survives, and the plan's own record of that suite as a known gap outside every cluster command
   is accurate.
3. **"The reversed C1 order opens a window where `core.create_encrypted_run` rejects the payload."** It
   does not. `S02-C1-S1` adds `'planTier'` to the extra-key allow-list (`0040:4270-4275`) before
   `S02-C1-S5` puts the key in the payload, and at the RED step `S02-C1-S3` neither exists.
4. **"Case 9's fix breaks one of the other eight cases."** It does not — I executed both shapes over
   all of the plan's cases plus three of my own (ten panels): Revision-2's shape produced zero R4
   violations, held roster order in every one, and left R6's `missing` refusing in exactly the four
   incomplete-roster shapes.
5. **"`typeof discoveredPanel[number]` in the filter's type predicate is a typecheck error."** It is
   not; TypeScript parses it as `(typeof discoveredPanel)[number]`, the standard idiom. Not a finding.
6. **"The three single-file RED commands are silently dropped like §6 probe 3's filter."** They are
   not: with the sole filter matching nothing, vitest exits **rc=1** with `No test files found` (I ran
   all three). The file-count gate applies to the multi-file cluster commands, and it is sound there.

**What I did NOT verify (UNVERIFIED, honestly).** (a) Anything downstream of S01's merged exports —
`PLAN_TIER_ROSTERS` does not exist in the lane (`grep` = 0 hits), so the N8 pin is a prediction and
S02-M4 is what verifies it; a mismatch is a BLOCKED handoff by the step's own text. (b) The post-rebase
base counts F-7 names — S01 has not merged, so my `68`/`70` arithmetic for S02-V1 is a check, never a
gate; S02-M3 item 4 measures it. (c) The green verdicts themselves — the four new suites do not exist,
so only base halves are measurable. (d) `pnpm typecheck` — I ran none; S02-V3's delta needs a diff that
does not exist. (e) SPEC §2 acceptance — V's, in a browser; steps 1–4 and 8–9 wait on row V-7. (f) I
did not read `.local/**`, any SPEC beyond S02's frozen `SPEC-v2.md`, or any file my packet did not
name, except `slices/S01/PLAN.md` at the two line ranges F-7 and N8 cite, to check those two citations.

---

## 5. Predictions for the other lenses

There is no second lens on this node — ARCH-REV runs one blind pass — so I record what I expect
`REV(S02)` and the BUILD seats to hit, as falsifiable evidence that this pass was blind and mechanical.
**First:** the first real cost will still be paid at `S02-C2-S3` on `PLAN_TIER_ROSTERS`'s actual shape,
and it will surface as a typecheck error rather than a test failure — but the pin at S02-M4 means the
seat will BLOCK at the read-back instead of improvising, and I expect the block, not the improvisation.
**Second:** somebody will run `S02-V1` on the merge candidate, read `70`, compare it to the plan's `68`
and open a finding that is N1, not a build defect; I would fold N1 before any BUILD seat starts to stop
that round trip. **Third:** the C1 seat will paste a `4 failed` frame in which cases 3 and 4 fail with a
read-back error rather than a message naming `plan_tier`, and will wonder whether the step's "must name
`plan_tier` in its failure text" is satisfied — cases 1 and 2 supply that text, and the `4 failed`
count is the real detector. **Fourth:** the next seat to publish a `grep` will validate it inline and
publish it for someone to run from a `.sh`, and the two binaries will disagree again; the one thing I
would check first on the merge candidate is any command whose alternation is not `-E` with escaped
braces. I would be surprised to be wrong about the second and would take an even bet on the fourth.

---

## 6. Verdict

**PASS — pass 2 of 3.** The blocking finding is closed on all three of its members and, more
importantly, closed in a way a stranger can check without judgement: each cluster's single RED step is
gated on a **count** (`4 failed`, `9 failed`, `2 failed`), and a smaller count is defined in the plan as
"restart from this step". The mechanism B1 rested on — `migrate(pool)` reading the migrations directory
from disk — I verified line by line rather than accepting; the eight assigned non-blocking findings are
each closed and each re-measured by me in the lane; the three orchestrator folds close (N3's guard text
is byte-identical to its source, N5's ADR record is consistent, N10's three rows exist for both lanes);
row V-19's default binds exactly one expression and one test case; and every gate command in §5 and §6
re-ran under me with **zero** numeric disagreements. N7's fix I did not read but executed, over four
panel shapes beyond the plan's own, and it holds where pass 1's shape violated frozen R4 twice.

N1…N8 are for the orchestrator to fold into `DECISIONS.md` and the downstream ticket comments. **N1 and
N3 are the two worth folding before any BUILD or REV seat starts** — N1 because `REV(S02)` will
otherwise measure a correct slice against a wrong expected value, and N3 because the next published
grep will be validated under one binary and run under another. **This verdict releases BUILD(S02-C1),
which needs no S01 dependency and is the slice's long pole.** One pass remains lawful after this one.
