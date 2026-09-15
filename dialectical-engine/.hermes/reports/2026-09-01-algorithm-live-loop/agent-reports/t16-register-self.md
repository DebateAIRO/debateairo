# T16 SELF-REPORT — a case file

Seat: Opus 5, session `opus-t16-w1`. Lane worktree `.worktrees/lane-t16`, branch `lane/t16`,
base `dev@1c9578a`. Zero rework rounds. This is the murder case, not the diary.

---

## 1. THE SINGLE MOST EXPENSIVE THING: the packet named one seeding path; there are two

**Cause.** Packet §2 names the seeding path as `apps/runner/src/dev-deployment-register.ts`
+ its CLI, and defers "production seeding" to T14. That partition is not exhaustive.
`acceptance/seed-register.ts` is a THIRD seeder — the one the ceremony uses — and it is
neither dev-deployment nor production. It seals `ACCEPTANCE_REGISTER_VERSION = 1` and
mirrors the same row vocabulary (`riskTier`, `wayOfKnowingCeiling`,
`acceptanceOrganCostBounds`, `runDeathPolicy`, `panelDiscoveryPolicy`,
`configuredProviderSet`, …).

**Why it matters and what it would have cost.** T3, T7, T9, T11 and T17 all carry
ACCEPTANCE-path DoDs ("an ACCEPTANCE-path receipt proving dispersion + family discount
live", "the flagship M≥2 run", "the mono-maker acceptance run asserts its label is
CONTESTED"). Had I seeded only the dev register, every one of those five lanes would have
booted the ceremony, called a T16 reader, and been met with `*_UNRESOLVED` — the loud
failure working exactly as designed, against the wrong target. **Five lanes, one round
each, discovered one at a time.** I found it only because I grepped for
`INSERT INTO register.register_version` to bound a trigger's blast radius; nothing in the
packet, SPEC or DECISIONS points at it.

**PRICE (this seat):** ~8 minutes of exploration, zero rework. **PRICE (avoided):** an
estimated five lane-rounds.

**UPGRADE.** A packet that names a seeding/config path must name it EXHAUSTIVELY or state
the enumeration command. One line in the packet would have done it:
`grep -rn 'INSERT INTO register.register_version' --include='*.ts' .` returns four sites —
two library helpers, the dev seeder, the acceptance seeder. Every "the path is X" claim in
a packet is a countable set; make the packet print the count.

---

## 2. WHAT I NEARLY GOT WRONG (three, in order of near-miss severity)

**2.1 I nearly shipped a trigger.** My first design for the migration enforced the
required-row manifest with a `BEFORE INSERT` trigger on `register.register_version` —
strictly stronger, since no seeder can bypass it. I stopped to measure the blast radius
and found `ACCEPTANCE_REGISTER_VERSION = 1` and `persistBootstrapRegister`'s version 1,
both of which seal registers that legitimately do NOT carry T16 rows. A trigger keyed on
`introduced_in_version <= NEW.register_version` would have survived those two — but it
would also have fired inside every future seeder anyone writes, including T14's, with no
opt-out and no local error message. I shipped an explicit
`SELECT register.assert_required_rows($1)` call from inside the seeding transaction
instead. **This is the one design decision in this lane a reviewer should attack**: it is
weaker on purpose, and the reasoning is exactly the above.

**2.2 I nearly bumped the register version.** Adding rows to a sealed version is the
classic reason to bump `DEVELOPMENT_REGISTER_VERSION` 4→5. I did not, and the reason is a
booby trap: `apps/runner/src/dev-api-environment.ts:396-398` builds its v3/v2/v1 negative
fixtures by literal string replacement on `"REGISTER_VERSION=4\n"`. A bump to 5 makes all
three replacements silently NO-OP — the negative tests keep passing while testing nothing.
Green suite, dead tests. **Anyone who later bumps this constant must fix those three lines
in the same commit.** Filed as finding F3 in the main report.

**2.3 I nearly wrote a grep-proof that could not fail.** The DoD says "consumers read
register only (no code constants; grep-proof in test)". My first instinct was to assert
the row KEYS do not appear in consumer sources — which is nearly vacuous, and worse,
`repeatedFamilyMultiplier` already appears four times in `s04.ts` as a legitimate
parameter name, so the test would have been born broken or born toothless. I measured
instead (worker contract §3, "measure before you speculate"): nine candidate literals
across `packages/{judgement,serve,propagation}/src` — **all nine return zero occurrences
today**. That single 20-second measurement turned a vacuous assertion into a real tripwire
with a proven-empty baseline, and mutant E confirmed it fires.

---

## 3. WHAT REPEATEDLY COST TOKENS

**3.1 Reconstructing the row list from five different files.** The goal names the rows in
one dense sentence ("δ, ε (T7) · γ, high cut, low cut, disagreement threshold + the named
disagreement quantity (T11) · …"). Turning that into 15 typed rows required reading
`S03-panel/SPEC.md`, `S05-stopping`, `S06-selection-label`, `S07-synthesis` and
`S09-envelope` — five consumer SPECs — because only the consumer's own task text says what
"the named disagreement quantity" IS (T11: "the recorded panel dispersion of the winning
root's reduced judgement"). **~15k tokens and ~10 minutes.**

*UPGRADE — the highest-leverage one-prompt-machine change in this report.* T16 is a
cross-cutting prerequisite whose entire deliverable is a table. The requirements seat
should emit that table ONCE, in `S01-register/PLAN.md`, as `row key | family | value |
ruling ref | consuming task`. It is pure transcription from text the requirements seat has
already read — zero new judgement — and it removes five SPEC reads from the critical path
of the lane that blocks W2 onward. The `PLAN.md` cluster table currently reads
`| S01-C1 | T16 rows | (worker fills) | (worker fills) |`. That row is where the table
belongs.

**3.2 The band-vocabulary hunt.** J1 rules "the ENGINE'S EXISTING band vocabulary in its
canonical order … seeded verbatim from code". Finding it took four greps that each
returned the wrong thing: `BAND`/`Band` in kernel → nothing; `CONFIDENCE_BANDS` → nothing;
`PROVISIONAL` → crypto and auth-policy false positives; `"CAPPED"` → finally
`packages/serve/src/index.ts:192` (`kind: "CAPPED" | "NOT_CAPPED"` — a decision kind, NOT
the vocabulary, a genuine trap) and `dev-deployment-register.ts:157`
(`bandOrder: ["CAPPED","FULL"]` — the real answer). **~6 minutes.** The vocabulary was a
naked array literal duplicated in two seeders with no name and no export, which is
precisely why it was ungreppable. I extracted it to `ENGINE_BAND_ORDER` in
`packages/register/src/engine-shape.ts`; both seeders and the downgrade-bands row now read
that one constant, so the "grep-cited in the row's source_ref" clause cites a real symbol
rather than a line number that drifts.

**3.3 The 10-minute Bash cap versus a ~9-minute suite.** I passed
`timeout: 3600000` to the full-suite run; the tool clamps at 600000ms and killed the run at
exactly 10m00s (exit 143), after which it had to be re-run from zero in the background.
**~10 minutes of pure waste, and the log file was left truncated mid-suite.** See §5.

---

## 4. DEAD ENDS — do not re-derive these

- **`register.bootstrap.json` is not a candidate for anything.** Five pins, strict zod
  schema (`bootstrapSchema` in `packages/register/src/index.ts`), `registerVersion: 1`
  literal. The goal already forbids touching it; the schema would reject it anyway. My
  architecture test now pins that it stays five keys and carries none of the 15 row keys.
- **`packages/register/src/index.ts` cannot host the row builder.** The builder needs the
  `ENGINE_*` shape constants, `index.ts` must re-export the builder, and the cycle breaks
  ESM const initialisation. The fix is the two-module split
  (`engine-shape.ts` → `algorithm-policy.ts` → `index.ts` re-exports both); all four
  existing `ENGINE_*` importers use the package barrel, so the move is invisible to them.
- **A migration cannot seed the rows themselves.** `register.register_row` is a generic
  key/value/source_ref table, the seeding paths compare their whole expected row set
  against what is persisted and throw `DEV_DEPLOYMENT_REGISTER_DRIFT` /
  `ACCEPTANCE_REGISTER_CONFLICT` on any surprise, and provenance is deployment-specific.
  Rows inserted by a migration would collide with every seeder on the next boot. The
  migration's only honest job here is the SCHEMA of the row set — which is what the
  required-row manifest is.
- **Whole-file RED is avoidable and worth avoiding.** My first draft statically imported
  `DEVELOPMENT_ALGORITHM_SOURCE_REF`, a symbol that did not exist yet; that turns the RED
  run into one ESM link failure and seven uncollected tests — weak evidence. Inlining the
  expected constant as a literal in the test and lazily `await import(...)`-ing only the
  not-yet-existing module produced **7 individually failing tests with 7 distinct
  reasons**. Cost of the fix: one edit, ~1 minute. Do this by default.

---

## 5. TOOLING TRAPS PAID THIS ROUND (append owed — see finding F5)

`.hermes/TOOLING-TRAPS.md` sits outside my exhaustive `allowed` list in the primary
checkout, and the worktree's copy would conflict on merge (the primary's copy is already
dirty). Recording here, as T0 did, and flagging the append as owed:

- **The Bash tool clamps `timeout` to 600000ms (10 min) and reports the clamp only as
  `Exit code 143` after the fact.** A vitest full run on this repo is ~9-10 minutes and
  lands right on the boundary — under lane contention it loses. Run any suite that has
  ever taken >5 minutes with `run_in_background: true` from the start; foreground it never.
  (algorithm-live-loop T16; 10 minutes and one truncated log)
- **`git checkout HEAD -- <path>` does not restore an UNTRACKED file**, so mutation
  testing against not-yet-committed new files has no restore path. Commit the work first,
  then mutate. (The existing staging trap in TOOLING-TRAPS covers a different failure of
  the same command; this is its sibling.)
- **BSD `sed -i` differs from GNU and silently mangles multi-line patterns.** `perl -0pi -e`
  with `\n` in the pattern is the portable in-place multi-line edit on this host, and it is
  what all six mutants used.
- **`vitest -t` still runs the whole file's `beforeEach`.** For a file whose `beforeEach`
  boots embedded-postgres, filtering to one test saves ~0 seconds. Mutation-test the whole
  file — you get "which OTHER assertions also fired" for free, which is better evidence
  anyway (mutant A was caught by two tests, and that is a fact worth knowing).

---

## 6. HOW TO MAKE THIS A BETTER ONE-PROMPT MACHINE

Ranked by expected saving, highest first.

1. **Emit the row table in `PLAN.md`** (§3.1). Saves five SPEC reads on the critical path
   of the mission's blocking prerequisite. ~15k tokens, ~10 minutes, every register lane.
2. **Make "the path is X" claims countable** (§1). Any packet sentence naming a code path
   as if it were the only one carries the enumeration command that proves it. This is the
   same defect class as D8's stale-premise cure, one level down: D8 fixed premises stated
   as fact; this fixes SETS stated as complete.
3. **State the post-provisioning baseline numerically in the packet.** My packet said
   "T0 found 157 pre-existing tsc errors PRE-provisioning; post-provisioning re-pin is in
   flight". I measured `pnpm run typecheck` at **exit 0, zero errors** — a 157-error
   difference between the number in my packet and reality. I could not tell, without
   running it myself, whether a clean typecheck meant "provisioning fixed everything" or
   "my worktree is wrong". A packet that ships a live baseline number, or explicitly says
   "measure it yourself and report it", removes that ambiguity. **~4 minutes and one
   moment of genuine uncertainty about whether to trust my own tree.**
4. **Give the RED requirement a shape, not just a rule.** The packet says "capture that
   failing run to logs/ BEFORE implementing". It does not say "and make sure the failures
   are per-test, not one collection error" — which is the difference between evidence and
   a receipt. One clause in the worker contract §2 or the packet stop conditions
   (`RED must fail per-assertion; a module-resolution failure is a receipt, not evidence`)
   would generalise §4's dead end to every lane.
5. **Say which tests to run, and how many times.** The three-run law applies to "a
   cluster", and `PLAN.md` left the cluster's verification command as `(worker fills)`.
   I chose four files. A reviewer cannot tell whether that choice was right without
   redoing my scoping. The requirements or orchestrator seat should name the cluster
   command when the slice is dispatched; the worker fills EVIDENCE, not SCOPE.

---

## 7. WHERE THE PACKET WAS UNCLEAR — exactly

| § | Text | Problem |
|---|---|---|
| §2 | "Seeding path (read + extend in your worktree): `dev-deployment-register.ts` + CLI" | Presented as the complete set; `acceptance/seed-register.ts` is a third seeder of the same rows (§1). I extended it and disclosed it rather than leaving five lanes to discover the gap. |
| §2 | "seed the envelope formula input rows its extension will read" | T17 has not written its extension, so "the rows it will read" is unknowable. I seeded the four engine-shape constants that are code constants TODAY plus the three call-site counts T17's own task text enumerates ("1 reviewer call, up to 3 synthesizer + 3 evaluator rounds"). Disclosed as a constant choice; T17 may need more. |
| §1 preamble | "new sealed rows land via MIGRATION + the deployment-register seeding path" | The goal text (frozen, so a finding not an edit) never says what the MIGRATION contributes when the target table is already generic key/value. I made it the required-row manifest and argued it in §2.1; a reviewer could reasonably say the migration should have been empty. This is the least-determined decision in the lane. |
| §4 | "~90 minutes wall-clock" | Not reachable as specified if the full suite is also required: three cluster runs (~3.5 min), six mutants (~5 min), and one full suite (~10 min) is ~19 minutes of pure waiting before any thinking. It fit — but only because the cluster went green first try. Budget the wall-clock separately from the thinking time. |

## 8. WHAT WENT RIGHT AND SHOULD BE COPIED

- **Measure-then-assert produced the only non-vacuous grep-proof in this lane** (§2.3).
- **RED with seven distinct reasons** (§4, last bullet) made GREEN mean something.
- **Six mutants, each caught by exactly the intended assertion, and two neighbours
  correctly NOT caught.** Mutant A was caught by two tests — the second one told me the
  reader round-trip independently pins δ, which I had not planned and would not have known.
- **Deriving the family map and the role identities from each deployment's OWN configured
  provider set** means no deployment name is written twice anywhere in this diff. The
  ceremony seeder and the dev seeder disagree about provider refs by construction, and
  neither can drift from the row it seeds.

---

## r2

The rework round, as a case file.

Rework round 1 of 3, against codex review r1 (CHANGES, 4 blocking). I verified all
four against the code before touching anything; **all four were real**, and one of them
I had already written down in this file and then argued myself out of.

## r2.1 THE MURDER: I diagnosed B1 correctly in r1 and shipped the bug anyway

§2.2 of this report, written BEFORE the review, says: *"Adding rows to a sealed version is
the classic reason to bump `DEVELOPMENT_REGISTER_VERSION` 4→5. I did not, and the reason is
a booby trap: three fixtures build v3/v2/v1 by literal string replacement… A bump to 5 makes
all three replacements silently NO-OP."*

Every clause of that is true. The conclusion drawn from it was wrong, and the error is
worth naming precisely because it is not an error of knowledge:

> **I let the cost of REPAIRING three fixtures outrank the correctness of SEALED-VERSION
> IDENTITY, and I recorded the trade-off honestly instead of recognising it as
> disqualifying.** Writing a defect down clearly is not the same as weighing it correctly.
> The self-report bought me the feeling of having handled it.

The reviewer's sentence is the one I should have written myself: *"That fixture work cannot
take precedence over sealed-version identity."* There is a general rule here:

**When a correctness property and an implementation cost collide, the cost is never the
tiebreaker — it is the work.** If I had asked "what would I do if the fixtures did not
exist?" the answer (bump) was immediate. The fixtures were a reason to be careful, never a
reason to choose.

**PRICE: one full rework round.** Everything else in r2 (B2, B3, B4) was ~40 minutes of
work; B1 alone forced the version mint, the historical-state fixtures, the generated
predecessor list, five launch-pin repairs and two acceptance-test repairs.

**And the fix cured the trap anyway.** The generated predecessor list
(`historicalRegisterSources`, derived from the constant, with a guard that throws
`DEV_API_ENVIRONMENT_HISTORICAL_REGISTER_SOURCE_INVALID` if any replacement no-ops) means
the booby trap I used as my excuse for not bumping cannot fire again for anyone. **The
thing I avoided was the thing that removed the reason to avoid it.**

## r2.2 WHAT I NEARLY GOT WRONG IN r2

**A mutant that silently did not apply looked exactly like a mutant that was not caught.**
My first attempt at mutant K (disable the scanner's identifier rule) used a long multi-line
`perl -0pi` pattern that matched nothing. The suite came back 10/10 green — which I would
have had to read as *"the assertion does not catch this mutant"*, i.e. as evidence my test
was weak. I only knew otherwise because I print a `grep -c` count after every mutation and
it still showed the rule present. **Without that count I would have filed a false negative
about my own test.** Every mutation in this lane now prints an `APPLIED? n (expect m)` line
before the run; that line is not decoration, it is what makes a green result readable.

**I nearly left two acceptance tests silently passing while testing nothing.**
`acceptance/ceremony.test.ts` counted rows `WHERE register_version=1` before and after a
double seed. With the ceremony register moved to v2, that query returns 0 both times and the
equality assertion *still passes* — a dead test with a green tick. Found by grepping for
hardcoded version literals after the bump, not by any suite. Hardcoded version literals in
tests are the same defect class as the api.env fixtures: a constant that moved leaves a
test measuring nothing.

**The scaffold/version-3 pairing.** My generated predecessor list initially made the
removed-dev-scaffold predecessor "current − 1", which quietly re-pointed a HISTORICAL fact
(the scaffold shipped while the register was at version 3) at a moving target. The suite
caught it (`DEV_API_ENVIRONMENT_DRIFT`). Generated lists are right for *enumerating*
predecessors and wrong for *identifying* a specific historical one — those need a named
constant, not an index arithmetic on the current version.

## r2.3 A DEFECT CLASS THIS ROUND CONFIRMS: docs that are live contracts

`docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.json`
declares `REGISTER_VERSION` and is asserted by three test files. It lives under `docs/` and
reads like a historical mission artifact, but it is a live pin of the dev stack. I updated
it and flagged it (report finding F11) because leaving it at 4 while the stack boots at 5
manufactures exactly the stale-record defect D8 exists to prevent — and, worse, the test
that reads it would have stayed GREEN, because it pins the DOC, not the doc-against-reality.
**A document asserted by a test is code.** Mission-scoped `docs/` paths should say so, or
the assertion should compare the doc to the live value rather than to a literal.

## r2.4 UPGRADES — what would have prevented this round

1. **A packet/contract line that makes sealed-version identity non-negotiable.** One
   sentence — *"a register version that exists at the base is historical: new rows mint a
   new version; repairing fixtures is never a reason to reuse one"* — deletes B1 entirely.
   This is the single highest-value line anyone could add to a register packet, and it
   generalises: **for any append-only/sealed artifact, state up front that identity beats
   convenience.**
2. **Require the historical-state fixture by name in the DoD.** Every one of my r1 tests
   started from an EMPTY database, so none of them could see B1 — and the reviewer said so
   in his PREDICTIONS ("every authored fixture starts from an empty database"). A DoD clause
   *"at least one fixture starts from the artifact state that exists at the base commit"*
   would have forced it. Fresh-state testing is the blind spot of every seeding lane.
3. **Make "startup" a named surface, not an adjective.** B3 was not a coding error; it was
   me naming a library reader "startup" because no boot path existed yet. Ruling J7 fixed it
   by NAMING the surface (the seeding entrypoints). Packets should name the process whose
   behaviour is asserted, so "startup warning" cannot be satisfied by a function call.
4. **A grep-proof DoD must name its positive controls.** "Grep-proof in test" got me a scan
   with a proven-empty baseline that could not catch `const evaluatorLoopMaxRounds = 3` —
   green, honest, and useless for two of the five consuming tasks. The clause should read
   *"…with a committed positive control per consumer surface and a negative control"*. That
   is what B4 asked for and what the scanner now carries; mutants K and K2 show the r1 shape
   failing both.
5. **Ruling refs need a checkable predicate.** B2 existed because "cite the ruling" has no
   test until someone writes `expect(source_ref).toBe(exact)`. `toContain(prefix)` felt like
   a provenance assertion and pinned nothing about the ruling half. The r2 test asserts EXACT
   equality per row plus the J1/J8 partition — the partition assertion is the one that would
   have caught this in r1, because it asserts a CLOSED set (J1 rules exactly five) rather
   than a property of one row.

## r2.5 TRAPS PAID IN r2 (append still owed — F5 stands)

- **A `perl -0pi` mutation that matches nothing exits 0 and changes nothing.** Print an
  applied-count assertion after every mutation; a green mutant run is uninterpretable
  without it. (cost: nearly one false finding against my own test)
- **`git checkout HEAD -- <path>` cannot restore a file the mutation never changed** — the
  restore also succeeds silently, so the whole mutate/verify/restore cycle can be a no-op
  end to end with every command exiting 0.
- **Bumping a shared version constant is a repo-wide grep, not an edit.** `REGISTER_VERSION`
  had eight live pins across source, tests and a docs JSON; two of them (`ceremony.test.ts`)
  would have stayed green while testing nothing. Grep the literal AND the constant name.

---

## r3

The final round, as a case file. Zero product changes: codex r2 closed all four r1 blockers
and left three non-blocking findings, one of which was the orchestrator's own board lag.
Two text fixes were mine. Both are worth a case file precisely because neither is a coding
error — they are the two ways a correct lane still hands off wrong.

### r3.1 The stale-ruling-citation defect: I implemented D13 and never re-read the ruling

**Cause.** I read D13 mid-r1, applied it correctly, and wrote the SUITES row from that
reading. D15 amended D13's letter — same subject, different location of authority — and I
never re-checked the ruling I had already "handled". My report kept saying the judge-stage
worktree run was authoritative after the mission had moved that authority to the
integration branch's post-merge batch.

**Why it is not a typo.** The failure scenario codex wrote is real and specific: an
integration owner reads my handoff, believes the worktree run is the authority, and treats
the actual D15 batch run as secondary. **A ruling citation is a pointer, and a pointer to a
superseded ruling is worse than no pointer** — it reads as current and carries my name.

**The general rule this round teaches me:** *a ruling I have already implemented is exactly
the ruling I will stop re-reading.* Rulings in this mission are append-only and amend by
addition (D15 "amends D13's letter", J8 supersedes my J1 citation, D12 supersedes the T0
baseline pointer). The correct discipline is to re-read the DECISIONS tail at every handoff
and grep my own report for every ruling id I cite — not to re-read only what is new to me.
Note the symmetry with r2's B2: **that** was citing a ruling that never chose the value;
**this** was citing a ruling that had since been amended. Same defect class — a provenance
claim that was true when written and is false when read — and I have now produced one of
each in consecutive rounds. That is the pattern worth carrying out of this lane.

**PRICE:** one non-blocking finding and one full rework round of overhead (~15 minutes of
round-trip for a text edit). Cheap this time only because codex checked the exact label.

### r3.2 A heading that made a true claim unverifiable

My handoff said the self-report "contains section `## r2`". The actual line was
`# ## r2 — the rework round, as a case file` — an artifact of appending a section with a
heredoc and prefixing it as though starting a new document. The section existed and the
content was right; **an extractor grepping `^## r2$` would have found nothing and concluded
the case file was missing.** The claim was true in substance and false as written.

The lesson is narrow and useful: **when a report claims another file contains an exact
anchor, that claim is a testable assertion and should be tested before the marker goes
down.** `grep -c '^## r2$'` is two seconds. I asserted it instead of running it — the same
class of error as reporting a suite result without reading the log, just cheaper. I ran the
exact grep this round for both `## r2` and `## r3` before writing the marker.

### r3.3 What this makes me want in the machine

1. **A handoff-time self-check, mechanical, before the marker.** Three greps: every ruling
   id I cite still resolves to a ruling that has not been amended; every exact anchor I
   claim in another file exists; the report hash matches. All three of this round's findings
   (mine and the orchestrator's board lag) would have been caught by that check. This is the
   single highest-value addition to the worker contract I can name from this lane — it is
   the difference between a lane that is correct and a lane that is correctly *reported*.
2. **Rulings that amend should name their amendment at the citation site.** D15's own text
   says "amends D13's letter", which is exactly right and is why the fix was mechanical
   once I read it. If every amending ruling carries that phrase, a worker can grep
   `amends D13` and find its own stale citations. The failure was mine, but the affordance
   is cheap and general.
3. **Heredoc-appended sections need a heading assertion.** Every `cat >>` in this lane's
   history added a section; one of them arrived malformed and nothing noticed for a full
   round. If a report format declares required section anchors, a two-line check can pin
   them the way `board-lint.sh` pins ticket fields.

### r3.4 Traps paid in r3 (append still owed — F5 stands, third round running)

- **A ruling you have already implemented is the one you stop re-reading.** Re-grep the
  DECISIONS tail for every ruling id your own report cites, at every handoff, not only when
  a new ruling is announced.
- **`cat >> file <<'EOF'` starting with `# ...` silently produces a malformed heading when
  the intent was a section, not a document.** Grep the exact anchor after every heredoc
  append; the content can be perfect while the anchor is unfindable.
