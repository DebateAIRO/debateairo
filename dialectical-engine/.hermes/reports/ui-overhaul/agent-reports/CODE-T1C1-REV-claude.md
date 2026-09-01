# CODE-T1C1-REV — self-report (blind review seat, claude-opus-5)

SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion

Mission `ui-overhaul` · board `ui-overhaul` · ticket `t_dd2f3ce0` · authority_epoch=22
Frozen target: commit `25155f3a` (3 files) · verdict: **PASS — T1-C1 MERGED-READY**, 6 non-blocking findings.
Treat it like a murder case. Below is the cause, the price, and what nearly went wrong.

---

## 1. The finding I would lead with, and why it is a CAUSE and not a symptom

**ARCH published a mount decision whose stated REASON names a state the owner route cannot reach.**

`PLAN.md` §T1-C1 HOW and `ADR-002` §mount table both justify "sibling of, never inside" with:
*"a toggle placed inside it vanishes on a debate that is still generating."* Measured on the tree:

- `hasTree = Boolean(debate?.tree)` (`DebatePageClient.tsx:823`).
- Every OWNER producer of `DebateDetail` emits a non-null tree. `debateDetailFromRunProjection`
  (`adapter.ts:500-529`) synthesises a skeleton `ROOT_CLAIM` for a RUNNING run.
- The genuinely-pending owner case (`page.tsx`, `starting=1`, `initialDebate={null}`) hits the
  `if (!debate)` early return at `DebatePageClient.tsx:1073` and renders a bare loading screen with
  **no chrome at all** — nothing there for a mount to be inside or beside.
- Repo-wide, the ONLY product site producing `tree: null` is `PublicDebatePageClient.tsx:46`
  (`answer.tree_included !== true` → answer-only publication).

The conclusion is right and the mount is right. The reason is wrong, and **the reason is what the
next three clusters read.** `T1-C4`, `T3-C3` and `T5` all consume that HOW; a seat that trusts it
will hunt the owner mid-generation case, fail to find it, and either weaken the pin or file a false
finding against it.

**This is the third instance of a pattern ADR-002's own changelog already named.** AM6 wrote:
*"I corrected this table's conclusion using a reason I had not checked, and the reason is the thing
later work leans on."* AM7 added: *"stating a number or a fact in the voice of a measurement without
taking the measurement."* The remedy those entries produced was a rule for TYPE EXPRESSIONS and then
for COUNTS. It was never generalised to **reachability claims**, which is the shape here.

**The upgrade this earns:** any ARCH sentence of the form *"placement X fails in state S"* must cite
the file:line that PRODUCES state S. One `grep -rn "tree: null"` would have produced the right reason
in ten seconds — and the right reason is BETTER for the mission, because it points at the public
route ADR-002's own Covers column already names.

## 2. What repeatedly cost tokens on this seat

**(a) The contract stack is 8 documents deep and only ~15% of it was load-bearing.**
Read to verdict: packet, spine §9/§11 + v3.3.0, two role skills, one Superpowers skill,
`dispatch-order.md` (1000+ lines), `SPEC`, `PLAN`, `DECISIONS`, `ADR-001`, `ADR-002`, `ADR-006`,
`token-inventory.md`, `test-migration.md`. The cells that actually decided the verdict were:
`dispatch-order` row 7 + the pol01 row, `PLAN` §T1-C1 HOW, `ADR-001` §(b) table, `ADR-006`'s two
baselines, `token-inventory` §"Stance and accents". **That is roughly 120 lines out of ~2,500 read.**
Everything else was navigation cost paid to find them.
*Upgrade:* the packet's §0 read order should carry the LINE ANCHORS, not just the file names — it
already does this for `DECISIONS.md rows 19-20` and `t3-library:243`, and those two were the cheapest
reads of the whole session. Do it for all of them.

**(b) `hermes kanban show` truncation.** Already in TOOLING-TRAPS; paid again. The 06:42 handoff is
6,063 chars and came back whole only because I read it before anything longer landed.

**(c) The oracle is a count, and I had to build a mutant to learn what everyone already suspected.**
M5 (one `oklch` reintroduced) → oracle 1, **row-7 command still 8 files / 81 passed**. M10 (a token
swapped for a DIFFERENT legal token, plus `--dispute`/`--agree` inverted on the pressure meter) →
oracle **0**, row-7 command **all green**. Nothing mechanical in this mission guards token CHOICE.
*Upgrade:* that is a permanent property, not a T1 fact. It belongs in `ADR-001` §"Why keep all three"
as a fourth paragraph — *the oracles count literals; no oracle sees a wrong-role token; the review
seat is the only gate* — so every future re-skin packet inherits the charge without an orchestrator
remembering to weight it.

## 3. What I NEARLY got wrong

**I nearly filed the gold findings as blocking.** SPEC T1-S8/R7 says *"gold reserved for reasoning &
verdict"*; the diff binds `--gold-bg`/`--gold-text`/`--gold` to a "Live generation" chip, a
"Challenge" chip, and a medium-pressure meter. That reads like a clean SPEC violation until you
compute the values: `--gen-bg` / `--gen-text` / `--gen-dot` and `--score-uncertainty-*` are
**byte-identical** to the gold family in both modes, and every one of those four surfaces was ALREADY
an amber literal at `25155f3a^`. **No gold pixel is introduced by this commit.** The defect is the
coupling, not the colour — N, not B. Filing it as B would have cost a full rework round to rename
four tokens with zero visual change.
*The general trap:* "reserved for X" reads as a claim about tokens; it is a claim about pixels. When
a palette collapses several roles onto one value, a naming finding can wear a SPEC violation's
costume. **Always compute the values before you tier a semantics finding.**

**I nearly credited the worker's "nearest existing wave-0 token" rule without checking it.** It holds
for 9 of 12 replacements and fails for 3. Measured (RGB distance): pressure HIGH original `#D15E49`
→ chosen `--dispute` `#B0432F` dE **49.9**, but `--con` `#C15F3C` dE **20.6**. Pressure LOW `#4B9779`
→ chosen `--agree` `#3E7A4E` dE **53.5**, but `--pro` `#3F7466` dE **41.6**. In both cases the
rejected alternative is simultaneously CLOSER and more role-neutral. A stated rule is a hypothesis;
running it is cheap and it turned one soft finding into a measured one.

**I nearly filed "the blue glyph turns gold in Chamber" as a finding.** `GuideModal` icon2's
foreground went `oklch(0.58 0.13 255)` → `var(--reasoning)`, which is `#C8A055` in Chamber. That
looks like drift until you check the palette: `--reasoning`, `--link` AND `--score-impact-text` are
ALL `#C8A055` in Chamber. Every blue accent collapses to gold there **by wave-0 design**. Not a
worker choice. Recorded in the verdict so the next lens does not spend the same twenty minutes.

## 4. Dead ends — do not re-derive these

- **`describe.todo` vs `it.todo` is not an ownership question.** Both leave T1-C2/C3 a private hunk.
  The only measurable difference is reporting: `describe.todo` with an empty body registers **no**
  task (`t3-library.test.tsx` = `10 passed (10)`, no todo line), while `it.todo` adds `| 2 todo` to
  every downstream count. Cosmetic. Do not spend a round on it.
- **Sibling-BEFORE vs sibling-AFTER the `{hasTree ? …}` conditional is unpinned and that is FINE.**
  I built the mutant (M8): all green. The contract says "sibling of", not "sibling after". Uncovered
  degree of freedom, not a defect. Do not file it.
- **The `--gold` → pressure-medium binding cannot be fixed by renaming to `--gen-dot`.** Same pixels.
  If V wants the reservation enforced on SCREEN rather than in the token graph, that is a design
  change to four surfaces, not a token swap — and it is V's call, not a cluster's.

## 5. Where the packet fought me

- **`§0.4` and the ticket body both say "the second and LAST ModeToggle mount".** `ADR-002` was
  amended TWICE off exactly that number (AM5: two→three; AM7: three mounts, four code sites). The
  debate-chrome mount is the THIRD. "LAST" is correct. I spent real time deciding which document was
  stale before concluding the packet had inherited a pre-AM5 constant. Filed as N5.
- **`§1` "Tree: … working tree byte-clean at verdict except the standing manifest"** names three
  items. The actual tree at dispatch carries 3 modified `.hermes` files and ~40 untracked planning
  and report artifacts. A reviewer told "clean except these three" and shown forty-five has to stop
  and adjudicate. Filed as N5b. **Fix shape:** the packet should quote a `git status --porcelain`
  digest taken at dispatch, not an English list — the list ages between writing and launching.
- **What the packet got RIGHT and should be copied.** Every quoted constant I checked held:
  `DECISIONS.md rows 19-20`, `t3-library:243`, `(1488,11)→(1490,11)`, `t_47057270`, `t_0e7bf205`,
  `t_768f834b`, `8 files / 81 passed / 2 todo`, `21 files / 111 passed / 2 todo`. The three disclosed
  worker adaptations were disclosed accurately. **Pre-disclosing the adaptations converted three
  potential findings into three verifications** and is the single highest-leverage thing in the
  packet — it should be a standing section, not a T1 courtesy.

## 6. Toward the one-prompt machine

1. **Ship the reachability rule** (§1). It is the mission's third recurrence of one cause and the
   only one of the three not yet closed by a rule.
2. **Put "no oracle sees a wrong-role token" in ADR-001** (§2c) so the charge is inherited, not
   remembered. This mission has 20 re-skin clusters left; the orchestrator weighted it correctly
   here by hand, and hand-weighting does not survive twenty repetitions.
3. **Line-anchor the packet's read order** (§2a). Measured cheapest reads of the session were the
   two cells the packet anchored.
4. **Make the ADR-006 filter line-agnostic permanently.** `t_47057270` already proposes it; my run
   confirms the necessity — the published gate run VERBATIM today returns **1**, not 0, because it
   still pins `(1488,11)`. Three more T1 clusters write near that line. Each will shift it again and
   each will burn a ticket saying so.
5. **A closed count over source tags is not a closed count over the surface** (finding N3). The
   affordance-drift pin reads `toBe(20)` and is green while the rendered top bar carries 21 controls,
   because `<ModeToggle />` is a component tag and the regex matches `<button|<a|<Link|<summary`.
   This is variant N of the acceptance-defect family: a check that returns the right answer for a
   reason unrelated to the property it claims. **The class, not the instance:** every pin in this
   repo that counts SOURCE TEXT to describe a RENDERED surface has this hole. That is a sweep worth
   running once, mission-wide, rather than meeting one cluster at a time.

## 7. Isolation receipts

10 mutants applied and reverted (M1-M10), `cp` backups + SHA-256 restore after each, backups deleted.
No git writes; read-only inspection via `git show` into `/tmp`. At verdict:

```
26c5f6b50aaba072d226832738889598ebe928cc2558294a1d2d564b0fd70aa6  apps/ui/app/debate/[id]/DebatePageClient.tsx
df1e63c015fc7416bf5f9b3639437bde5d65f90eaac4fe871879e2ec778a2c61  apps/ui/components/GuideModal.tsx
8ad694350a672e8b61fa8f0b1263ac6e0be2193f2dc78df8ab9d231a673ff429  tests/render/t1-canvas.test.tsx
$ git status --porcelain -- dialectical-engine/apps dialectical-engine/tests
(empty)
```

All three match the worker's declared apply-patch ledger exactly.
