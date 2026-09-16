# REV(S03) pass 2 — lens `correctness-tests` — slice `S03` @ `d35a9634`

**SKILLS LOADED:** `superpowers:using-superpowers`
(`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md`) ·
`dialectical-engine:heartbeat-protocol` (`.claude/skills/heartbeat-protocol/SKILL.md`) ·
`dialectical-engine:heartbeat-reviewer` (`.claude/skills/heartbeat-reviewer/SKILL.md`) ·
`superpowers:verification-before-completion`
(`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/verification-before-completion/SKILL.md`).

- seat `REV-S03-p2-correctness-tests` · ticket `t_ab69627a` · pass **2 of 3** · blind
- worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s03-p2-correctness-tests/dialectical-engine`,
  detached at `d35a9634`, `git status --porcelain` **0 entries at start and at handoff**
- pass base `cc014550` · slice head `cd043907` · review head `d35a9634` (= `integration/all`) · slice base `9a000c37`
- package `.hermes/reports/debate-tiers/review-packages/S03-p2/`
- **VERDICT: REWORK** (§8) — one blocking finding, eight non-blocking.

**My pass-1 B1 is FIXED, and the fix is guarded.** SPEC-v3 R18 is now met for all three CLI
transports, measured on the ARGV each relay actually builds, and four independent mutants prove the
new cases detect the exact defect pass 1 found. The blocking finding this pass is a different thing
entirely: **the head I am asked to certify fails a route-contract pin that no S03 command of record
runs, the packet asserts the opposite, and the failure silently disarms the drift guard on S03's own
new route.** No S03 product code is at fault and none should change.

---

## 1. The packet review (the packet is in my scope; its author cannot review it)

| # | Check | Outcome |
|---|---|---|
| 1 | Packet path resolves from the seat's cwd | OK |
| 2 | `cc014550` / `cd043907` / `d35a9634` / `9a000c37` against `git rev-parse` | OK, all four verified |
| 3 | `allowed` covers every deliverable the packet demands | OK |
| 4 | Freeze pair is a concrete `<previous>..<latest>` | OK — `d35a9634..e56063c5`; diff over the three mission trees = 28 files, **2212 insertions, 0 deletions**: the three p2 packets, the S03-p2 package, the four BUILD self-reports, one `PROGRESS.md` line. **No product code in the freeze.** |
| 5 | "the packet is unchanged" (FREEZE CORRECTION + FREEZE comments) | **TRUE and verified** — blob `73b78fe19a7aeeb5fa3e751e7d198d690a9af609` is byte-identical at `d1de4ee3`, `bd516cfd` and `e56063c5`, and identical to the copy I was told to read |
| 6 | Charge 4's constant "**12 rows** were added beside S03's row by other branches" | **N8 — FALSE. Measured: 2.** See §6 |
| 7 | Charge 4's claim "the route pins … **hold** at d35a9634" | **B1 — FALSE, and never measured at that head.** See §5 |
| 8 | `SKILLS LOADED` of the two FIX seats against their floor | Present on both board records (F1 `t_87ecea60`, F2 `t_d5ccdd90`); the orchestrator's CONSUMED comment records "SKILLS LOADED 7/7 verified on the rollout" for F2. No shortfall found. |

Pass-1 packet defects **N5** (a number without its command) and **N6** (charge asked what a cast hides
without granting the file behind it) are **both TAKEN by this pass**: the p2 README prints the argv
beside every number and names the five-suite C4 as the command of record, and charge 2 explicitly
grants the relay seam. Recorded closed, not re-found.

---

## 2. Everything I re-ran, in MY worktree (charge 5)

Argv, HEAD and porcelain are printed at the head of every log under
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/96555a10-dafb-468d-88b3-f6c3afd4c825/scratchpad/seats/REV-S03-p2-correctness-tests/`.

| Command | My result | The orchestrator's `reverify-d35a9634.txt` | Verdict |
|---|---|---|---|
| relay+panel set (4 files) | `Test Files 4 passed (4)` · `Tests 49 passed (49)` · rc 0 | — (F1's gate) | **green** |
| C3 nine-suite | `Test Files 1 failed \| 8 passed (9)` · `Tests 2 failed \| 89 passed (91)` · rc 1 | — | **match** — only the two inherited titles |
| C4 five-suite | `Test Files 5 passed (5)` · `Tests 78 passed (78)` · rc 0 | 78/78 at `b678f336` | **match** |
| §5 integrated 17-file | `Test Files 1 failed \| 16 passed (17)` · `Tests 2 failed \| 185 passed (187)` · rc 1 | identical, ×3 | **match** |
| **route pins** (`s7-authorization` + `contract`) | **`Test Files 1 failed \| 1 passed (2)` · `Tests 1 failed \| 40 passed (41)` · rc 1** | **never run at `d35a9634`** | **RED — see B1** |

The two failures everywhere are `tests/architecture/register-support-publication.test.ts` →
*"recognizes hostile static SQL concatenation…"* and *"classifies every register relation access…"*,
**pre-existing, dated 2026-09-12**, delta zero. `Test Files` is **17** on the integrated run, so no
filter was silently dropped. No suite of this slice's own fails on any run.

---

## 3. My own probes — built from the CLAIM (charge 2)

`tests/unit/REV-S03-p2-correctness-tests-probe.test.ts`, **8 assertions, `Tests 8 passed (8)`, rc 0**.
Every model id is read from the committed `config/models.yaml` through `loadModelConfig`, **never
written as a literal**, so the probe cannot pass by agreeing with the same constant the product
hard-codes. Promoted with a runner (§9).

| Probe | Property | Outcome |
|---|---|---|
| P1 | the Claude CLI is asked for the FILE's id | argv `--model claude-opus-5`; **not** `opus`; exactly one `--model` token |
| P2 | the alias path is UNCHANGED | `modelAlias: "claude-opus-5"` → `CLAUDE_CLI_MODEL_ALIAS_INVALID` (still refused) |
| P3 | a full id never reaches the alias pattern | `opus`, `gpt-5.6-sol`, `claude-OPUS-5`, `Claude-opus-5` on the model path → **`CLAUDE_CLI_MODEL_INVALID`**, never the alias code |
| P4 | precedence, measured on the ARGV | `model` + `modelAlias: "sonnet"` → argv carries `claude-opus-5`; `relay.model` = `claude-opus-5` |
| P5 | the Grok limb | `--model grok-4.6-build` present; and with no `model`, **no `--model` token at all** |
| P6 | **refutation, beyond the authors' parameters** | dated primary key + no `canonicalModel` + a helper entry: the **alias** path resolves, the **model** path throws `CLAUDE_CLI_MODEL_UNRESOLVED` — see **N1** |
| P7 | the same shape WITH `canonicalModel` | resolves. So the narrowing is exactly *dated key AND no canonicalModel*, not *dated key* |
| P8 | all three transports | `codex`→`gpt-…`, `claude`→`claude-…`, `grok`→`grok-…`, each from the file |

`tests/unit/REV-S03-p2-f2-crosscheck.test.ts` (charge 3), **`Tests 5 passed (5)`**, rc 0: X1 the
strict schema refuses **11** malformed shapes (absent row, `null`, either key missing, non-array,
blank and whitespace-only id, non-string id, unknown key, `__proto__`); X2 it **admits**
`{free:[],premium:[]}` (**N2**); X3 the committed file's tiers are non-empty; X4 the projection is
the ROW and differs from `PLAN_TIER_ROSTERS`; X5 `PLAN_TIER_ROSTERS` still deep-equals the file.

### 3.1 Mutants — property · mutant · outcome · restore

Content-matched (never line-numbered), each applied only after a helper asserted **exactly one**
literal match, restored from **my own byte copy** and verified by **sha256**. Script refuses a dirty
tree. Log: `mutants.log`, `mutant-f.log`.

| # | Property claimed | Mutant | Outcome | Restore |
|---|---|---|---|---|
| A | the new cases pin the ARGV, not the object literal | `claude-relay.ts:159` `request.value` → the literal `"opus"` (pass-1 B1 reintroduced) | **6 failures / 3 files**, incl. `asks the CLI for the caller's full model id`, `gives the full model id precedence over a model alias`, and the **re-titled C3 case** `starts the Claude relay with \`--model claude-opus-5\`` | sha `834ae12c…` OK |
| B | `model` beats `modelAlias` | `claude-relay.ts:195` precedence inverted | **15 failures**, incl. the precedence case and my P4 | sha `834ae12c…` OK |
| C | the Grok argv really carries the id | `grok-relay.ts:105` `--model` spread deleted | **exactly 3 failures**: grok-relay's new case, the panel's Grok argv case, my P5 | sha `ef45df3e…` OK |
| D | the casts' deletion is load-bearing (pass-1 M1, re-derived) | delete `readonly model?: string` from `ClaudeRelayOptions` (`:171`) | **exactly 1** diagnostic: `apps/runner/src/dev-cli-provider-panel.ts(122,59): error TS2353: … 'model' does not exist in type 'ClaudeRelayOptions'` | sha `834ae12c…` OK |
| E | the obs pair is the ONLY cause of the route-pin RED | add the two `observability` rows to the expected matrix **and** `contractInventory` | route pins go **`Tests 41 passed (41)`** — GREEN | shas OK |
| E2/F2 | the drift detector works once the pair is supplied | E + drift S03's own row `auth: "user"` → `"operator"` | RED, and the reason is now the **deep-equal** assertion | shas OK |
| F1 | **is the drift detector alive TODAY?** | drift the same row at the shipped head, obs pair still missing | **MASKED** — the failure message is byte-identical to the unmutated one (`to have a length of 50 but got 52`). The drift is never reported | sha `43012a29…` OK |

**M1/M2 re-derived (charge 2).** Pass-1 M1 deleted two `as unknown as` casts and produced 2 × TS2353;
the casts are now **gone from the shipped state** (`dev-cli-provider-panel.ts:118-128` is cast-free)
and mutant D shows the compiler guards the seam in the opposite direction. Pass-1 M2 supplied
`modelAlias` beside the id and turned the suite RED because the suite *forbade the working shape*;
at `d35a9634` that case is re-titled and **`modelAlias` beside `model` now loses to `model`** —
asserted on the argv by the shipped case and by my P4, and mutant B proves the assertion bites.

**A green I refused to trust.** My first mutant run reported every mutant "passed". `python3` was
being invoked through an unsplit zsh parameter, so **no mutant was ever applied** and I was reading
the clean tree. Nothing from that run is in this artifact; the table above is the re-run.

---

## 4. The merge cross-check (charge 4)

`diff-cd043907..d35a9634-S03-files.patch` read in full. Five of the files S03 wrote changed, all from
the observability branch plus the orchestrator's revert:

| File | Merge delta | Does it change what pass 1 measured, from THIS lens? |
|---|---|---|
| `apps/api/src/index.ts` | +54/−5 | **YES — B1.** Two `observability` policy rows at `:145-146`, `"observability"` in the resource union, an `onRequest` obs hook, and a 500-envelope change (`message` → `correlation_id`). S03's `GET /v1/plan-tiers` row and handler are untouched. |
| `tests/unit/api.test.ts` | +12/−3 | No. Three 500-envelope expectations follow the product change; `api.test.ts` is **29/29** at `d35a9634` in my C4 and integrated runs. |
| `packages/providers/src/index.ts` | +61/−0 | No. Obs emission on exhaustion, wrapped in `try/catch` with product semantics winning. `tests/unit/provider.test.ts` **9/9**. |
| `package.json` / `pnpm-lock.yaml` | +4/−2, +25/−0 | No. Dependency and script rows only. |

Measured inventory growth, by commit (`git show <c>:…index.ts | grep -c '^  { route: "'`):

| commit | policy rows | note |
|---|---|---|
| `9a000c37` (slice base) | 49 | |
| `cc014550` (pass-1 head) | 49 | |
| `cd043907` (slice head) | **50** | **S03 added exactly ONE row** — `GET /v1/plan-tiers` |
| `d35a9634` (review head) | **52** | **the merge added exactly TWO** — the obs pair |

Pass-1 line numbers that moved are merge artefacts; I re-grepped every citation in this artifact at
`d35a9634` rather than carrying a pass-1 number.

---

## 5. BLOCKING finding

### B1 — the review head fails a route-contract pin that no S03 command runs, the packet asserts it green, and the failure disarms the drift guard on S03's own new route

**The measurement.**

```
env LANG=en_US.UTF-8 npx vitest run tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 40 passed (41)
 × tests/unit/s7-authorization.test.ts > S7 deny-by-default authorization >
   keeps one complete, duplicate-free policy row per contract route
   → expected [ 'POST /v1/auth/register', …(51) ] to have a length of 50 but got 52
```

**The cause, measured not inferred.** `tests/unit/s7-authorization.test.ts:151` is
`expect(governed).toHaveLength(contractInventory.routes.length)`. At `d35a9634`:

- `apps/api/src/index.ts` governs **52** routes — the obs pair at `:145-146`
  (`GET /v1/obs/client-report/enums`, `POST /v1/obs/client-report`);
- `packages/contract/src/index.ts`'s `contractInventory.routes` lists **50** — the obs pair is absent;
- `s7-authorization.test.ts`'s `EXPECTED_AUTHORIZATION_MATRIX` lists **50** — the obs pair is absent.

Mutant **E** settles attribution: supplying exactly those two rows to the matrix and the inventory
turns the pins **41/41 GREEN**. Nothing else is wrong. **This is the observability branch's
inconsistency, carried in by V's all-worktrees merge — not S03's.** At the lane head `cd043907` the
three counts are 50 / 50 / 50 and S03's own row is correctly present in all three.

**Why it is blocking rather than someone else's problem.**

1. **The packet states the opposite as fact.** Charge 4: "the route pins and `tests/unit/api.test.ts`
   hold at d35a9634". They do not, and `reverify-d35a9634.txt` never ran them — its list is the
   17-file run ×3, §5-1b, the generator mount, the model-config mount and typecheck. The claim was
   carried forward from the F2 CONSUMED comment, which measured 41/41 at `b678f336` — **at the lane**.
   A verdict from me that did not measure this would have put a fabricated verification into the
   record (law 3.6).
2. **No S03 command of record runs either suite.** `tests/unit/s7-authorization.test.ts` and
   `tests/unit/contract.test.ts` are **files S03 wrote** (both in `s03-product-files.txt`; FIX-F2
   edited both), yet neither appears in C1–C4 nor in the §5 integrated 17-file list. The FIX seat had
   a private "route pins" command; the **slice** has none. So this class is invisible to every future
   re-verification of S03.
3. **The failure disarms the guard on S03's own route.** Mutant **F1**: with the obs pair still
   missing, changing S03's own row from `auth: "user"` to `auth: "operator"` produces a failure
   message **byte-identical** to the unmutated one — the length assertion at `:151` throws first, so
   `:152` (route-set equality) and `:153` (`toEqual(EXPECTED_AUTHORIZATION_MATRIX)`) are never
   reached. Mutant **F2** shows the detector works the moment the pair is supplied. Today, a silent
   downgrade of `GET /v1/plan-tiers` to operator-only — the exact defect product-truth's pass-1 B1
   was about — **would not be reported by the suite that exists to report it.**

**What the remedy is NOT.** No S03 product code should change; S03's diff is correct. This must not
be routed as a code FIX against the slice.

**The remedy, in three record-level parts.**
1. Add `tests/unit/s7-authorization.test.ts` and `tests/unit/contract.test.ts` to the slice's §5
   verification list, so the suites S03 edited are run by the slice that edited them.
2. Re-measure the route pins at the review head and record the RED **as inherited from the merge**,
   with the two-row cause and the `cd043907` 50/50/50 contrast, so pass 3 does not re-derive it.
3. Ticket the inventory inconsistency to the **observability** mission: its two policy rows need the
   matching entries in `contractInventory.routes` and `EXPECTED_AUTHORIZATION_MATRIX`.

**VERDICT** the head under review fails a route-contract pin and the packet certifies it green /
**CONFIDENCE** high (measured; cause isolated by mutant E; masking proved by mutant F1) /
**STRONGEST COUNTER** the RED belongs to another mission and S03's slice is complete and correct, so
blocking S03 for it spends a FIX node and a REV pass on a record change that the orchestrator could
fold without a REWORK. **Rebuttal:** the fold is exactly what I would accept — but a fold is the
orchestrator's to make on a finding, and I may not issue "PASS with concerns". The verdict has to
carry the fact that the certified head is RED on a pin nobody runs; what the orchestrator does with
it is its call, and if it folds all three parts without a code FIX I regard the finding as answered.

---

## 6. Non-blocking findings (each sets WHEN, never WHETHER; each needs a ticket by end of pass)

**N1 — the full-id path resolves model lineage strictly more narrowly than the alias path it
replaced, and the narrowing is unobservable without a real CLI turn.** `acceptance/claude-relay.ts:72`
makes the `kind: "model"` branch **exact equality**; the alias branch (`:76-78`) lowercases, splits on
non-alphanumerics and matches a token. With ≥2 entries in `modelUsage`, `resolveClaudeModel:85-88`
throws `CLAUDE_CLI_MODEL_UNRESOLVED` and **the relay refuses to start**. The repo's own captured
envelope shows Claude reporting **dated** keys for helper models
(`claude-relay.test.ts:111` `"claude-haiku-4-5-20251001"`). Measured (P6/P7): a dated primary key
**without** `canonicalModel` plus one helper entry — alias path resolves, model path throws; **with**
`canonicalModel` it resolves. So the failure window is precisely *dated key AND no `canonicalModel`*,
and no test covers it. **Cost if unfixed:** V's first live premium debate fails closed at relay
startup rather than running on the wrong model — loud, not silent, which is why this is N and not B.
*file:line* `acceptance/claude-relay.ts:72`.

**N2 — `PlanTierRostersSchema` admits `{free:[],premium:[]}`, which reproduces product-truth B1's
symptom with no refusal text.** `packages/contract/src/index.ts:308-312` constrains each id
(`z.string().trim().min(1)`) but not the array, so an empty-but-well-formed row parses. The page then
takes the success branch, sets the rosters and calls `setPlanTierRostersError(null)` — empty tier
cards, no `ASK_PLAN_TIER_ROSTERS_UNAVAILABLE`. Measured X2. **Not reachable from the committed file
today** (X3: both tiers non-empty, and the loader refuses an empty tier), so the exposure is a corrupt
or hand-edited register row. *file:line* `packages/contract/src/index.ts:308-312`.

**N3 — the user-facing roster read is coupled to the scorecard and ledger queries.**
`apps/api/src/index.ts:1536-1539` `readPlanTierRosters` calls `this.readDeployment(session)`, whose
`:1488` `Promise.all` runs three queries — `register.register_row`, `scorecard.scorecard_cell` and the
run-execution-binding read — and projects one row out of the result. A failure in either unrelated
query rejects the roster read, so `/new`'s tier cards go to the refusal state on a scorecard outage.
The fixture pool in `tests/unit/api.test.ts` returns `{ rows: [] }` for both, so no test measures the
coupling. *file:line* `apps/api/src/index.ts:1537`.

**N4 — (pass-1 N1, carried; still holds verbatim at `d35a9634`, no FIX assigned)** the S28 residue
names acceptance step 8; the step that actually breaks is **9**. `additive` at
`apps/runner/src/dev-api-environment.ts:383`, `exactHeldSet` at `:386`, the refusal at `:391` — line
numbers unchanged by the merge.

**N5 — (pass-1 N2, carried; still holds)** R25's "api.env follows a removal" is green only on a branch
no product path executes. `heldConfiguredProviderSets` is written in exactly two places repo-wide,
both fixtures (`tests/integration/dev-api-environment.test.ts:441`, `:493`); production threads the
parameter (`dev-auth-stack.ts:191` → `dev-api-environment.ts:531` → `:384`) and nothing writes it onto
the receipt. Re-grepped at `d35a9634`.

**N6 — (pass-1 N3, carried; still holds)** `readProviderKeys` validates the key NAME
(`apps/runner/src/dev-provider-keys.ts:66`) and stores the VALUE verbatim (`:69`), so a quoted `.env`
value becomes a probe-failure class (b) absent slot rather than a format refusal.

**N7 — (pass-1 N4, carried; still holds)** the base-URL admission
(`packages/model-config/src/shape.ts:156-160`) admits a trailing `?` and `#`, any host, a non-standard
port and an IP literal. Recorded for the security lens; not a defect against a frozen row.

**N8 — packet defect (against the orchestrator): charge 4's row count is wrong by an order of
magnitude.** It states "**12 rows** were added beside S03's `GET /v1/plan-tiers` row by other
branches". Measured: **2** (the diff of route names between `cd043907` and `d35a9634` is exactly the
obs pair; counts 50 → 52). **Cost:** the sentence reads as *the inventory grew a lot and that is
expected and fine*, which is precisely the frame under which a lens skips re-running the pin — the
one command that would have shown B1. A constant in a packet is load-bearing; this one pointed away
from the defect. **Remedy:** derive such counts with the command that measured them, and print it.

---

## 7. UNVERIFIED — what I could not do, and why

- **Any real provider or CLI call.** No lens may call the `codex`/`claude`/`grok` CLIs or a paid
  endpoint. So R18's *runtime* consequence is established on the ARGV each relay builds through its
  own process seam — which is the thing R18 names — and **not** on an observed live turn. N1's real
  exposure (what `modelUsage` keys a real Claude CLI emits, and whether it always emits
  `canonicalModel`) is therefore **UNVERIFIED**; this is the same line the F1 handoff drew, and I
  keep it drawn.
- **Whether the observability branch intends its two routes to be in `contractInventory`.** I measured
  that they are not and that this is the sole cause of the RED; whether the fix is to add them or to
  ungovern them is that mission's call, not mine.
- **The end-to-end refusal of acceptance step 9** (N4) — needs the real stack.
- **`max_tokens: 64` without `thinking:{type:"disabled"}` against a real Z.ai endpoint** — carried,
  never measured by anyone.
- **Whether OpenAI sells `gpt-5.6-luna`** — row V-34, waits on V's key.
- **The `/v1/deployment` → `/v1/plan-tiers` authorization question** — product-truth's lens; I
  measured only that the handler projects the register row through a `.strict()` schema.

---

## 8. Verdict

**REWORK — pass 2 of 3, lens `correctness-tests`.**

One blocking finding (**B1**): at `d35a9634` the route-contract pin
`tests/unit/s7-authorization.test.ts:151` is **RED** (52 governed rows vs 50 contract routes); neither
route-pin suite is in any S03 command of record although S03 wrote both files; the packet certifies
them green on a number measured at the lane, not at the head; and the failure **masks** the drift
detector on S03's own `GET /v1/plan-tiers` row (mutant F1). The cause is the observability branch's
two policy rows, carried in by the all-worktrees merge — **S03's code is correct and must not be
changed**; the remedy is the three record-level parts in §5. Eight non-blocking findings, **N1–N8**,
one of them against the orchestrator's packet.

**My pass-1 B1 is closed.** SPEC-v3 R18 is met for all three CLI transports at `d35a9634`, measured
on the argv: `claude` is asked `--model claude-opus-5` (P1), `grok` is asked `--model grok-4.6-build`
(P5), `codex` continues to pin through `-c model="…"` (P8). The alias path still refuses a hyphenated
value (P2) and a full id never reaches it (P3); `modelAlias` beside `model` loses to `model` (P4); the
casts are gone and the compiler now guards the seam (mutant D, 1 × TS2353); and the re-titled C3 case
asserts the **ARGV**, proved by mutant A. Everything else this lens owes is green and re-measured by
me: all four cluster commands, the integrated 17-file run, the strict roster schema across 11
malformed shapes, the register-row source, the two-file roster-selection pin, and
`PLAN_TIER_ROSTERS` still deep-equal to the committed file.

---

## 9. Probes promoted

- `.hermes/reports/debate-tiers/probes/REV-S03-p2-correctness-tests-probe.test.ts` (R18, 8 cases)
- `.hermes/reports/debate-tiers/probes/REV-S03-p2-correctness-tests-f2-crosscheck.test.ts` (5 cases)
- `.hermes/reports/debate-tiers/probes/REV-S03-p2-correctness-tests-mutants.sh` (mutants A–F,
  content-matched, sha256-verified restore, refuses a dirty tree)
- `.hermes/reports/debate-tiers/probes/REV-S03-p2-correctness-tests-run-probe.sh` — takes the
  worktree root from `$WORKTREE` or `$1`, **never hard-coded**; copies the two probe files in, runs
  them, removes them, prints `porcelain after:`.

Each header names the head it was written against (`d35a9634`). **A mutant's direction can invert
between heads** — mutants A–D are written against the *fixed* state and would need re-derivation if
the relay contract changes again.

---

## 10. Row for V

```
V-ROW: NEW · S03 · the slice verification list does not run two suites the slice edits
FIX-S03-p1-F2 edited tests/unit/s7-authorization.test.ts and tests/unit/contract.test.ts
(both are in s03-product-files.txt), but neither suite appears in cluster commands C1-C4 nor in
the slice's §5 integrated 17-file run. The FIX seat ran them privately (41/41 at b678f336); the
SLICE never does. At the review head d35a9634 they are RED — 52 governed policy rows against 50
contract routes — because the observability branch added two rows to apps/api/src/index.ts:145-146
without the matching entries in contractInventory and EXPECTED_AUTHORIZATION_MATRIX. Measured:
the counts are 50/50/50 at the lane head cd043907, so S03 is not the cause; and with the two rows
supplied the pins go 41/41 green.
Recommended default: the two suites join the slice's §5 verification list; the RED is recorded as
inherited from the merge; the inventory inconsistency is ticketed to the observability mission.
No S03 product code changes.
Smallest yes/no for V: "Should a slice's verification list be required to run every test file the
slice edits?"
VERDICT add the two suites to the list and fold the rest / CONFIDENCE high / STRONGEST COUNTER:
the FIX seat did run them, so the gate hole cost nothing this time and a per-file rule would grow
every slice's command list. Rebuttal: it cost exactly the thing it was there to prevent — the
drift detector on S03's own new route is disarmed at the head V would merge from, and no command
of record would ever have said so.
```

---

## 11. Predictions about the other two lenses (falsifiable; written before any contact)

I predict **neither** lens reports B1. Both carry the same merge cross-check charge, but the charge
tells them the route pins hold, and the only way to find otherwise is to run two suites that appear
in no command list — after the packet has told you the inventory grew by twelve rows and that this is
other branches being normal. If one of them does find it, I expect it to be **security-data-safety**,
arriving from "two new `public` routes appeared in the policy table" rather than from a test count;
and I expect them to frame it as an authorization-surface question (a public obs write route reachable
without a session) rather than as a dead detector, which is the sharper half. I expect
**product-truth** to close its own B1 affirmatively — `readPlanTiers` is `auth: "user"`, the page names
`ASK_PLAN_TIER_ROSTERS_UNAVAILABLE` on a refusal, and the render suite covers both branches — and I
predict they will **not** notice N2, because the empty-but-valid row passes every assertion they will
write and only shows up if you ask the schema for its boundary rather than its behaviour. I also
expect at least one lens to report the 500-envelope change (`message` → `correlation_id`) in
`tests/unit/api.test.ts` as an S03 finding; it is not — it is the observability branch's, it is
covered at 29/29, and the merge patch attributes it. My own most likely error remains **tiering**: a
reasonable reviewer could hold B1 as an N on the ground that S03's code is faultless and the remedy is
a fold. I hold it blocking because the pass-2 record would otherwise assert a measured-green that was
never measured, and because the disarmed drift guard sits on the route this very slice added.
