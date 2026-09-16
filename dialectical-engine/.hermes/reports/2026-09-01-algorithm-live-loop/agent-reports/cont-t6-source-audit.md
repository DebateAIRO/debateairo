READY — BUILD(CONT-T6) · seat `cont-t6-source-audit` · pass 1 of 3 · comments read through: n/a (no board in this continuation)

# Self-report — BUILD(CONT-T6), the source audit and the scaffold pins

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

Base `ceb95cc0`, verified before the first edit. Three cluster commits: `dcd2f89c`, `73922db8`,
`51334f20`. Typecheck measured at base (rc=0, 0 diagnostics) and after every cluster (rc=0, 0).

---

## 1. The body: what actually killed this task's predecessors

**The cause is one habit, not five bugs: a NUMBER was copied forward from a run that never produced
it, and then a REMEDY was copied forward from a diagnosis nobody had measured.**

The mission's own trap file already names half of this — `## A CRASHED audit does not report ZERO
violations` (BUILD(CONT-T1), the same day). That entry caught the count. It did not catch the second
half, which is more expensive, because a wrong count is loud the moment the tool runs, and a wrong
remedy is silent all the way to the commit.

Here is the second half, measured.

`board/F18-scaffold-edge-rows.md:20-21` diagnosed the `packages/serve/src/synthesis.ts` source row
and prescribed its cure in one breath: the file *"owes a `GOAL_RULED_LAW_CARRIERS` entry"*. The
measurement of record repeats it. My brief inherits the frame (*"use the carrier pattern the audit
names"*). Three records, one prescription, zero measurements.

One command decides it:

    git grep -n 'DIGEST_EMPHASIS_OBJECTION_COUNT' -- .
    packages/serve/src/synthesis.ts:99:export const DIGEST_EMPHASIS_OBJECTION_COUNT = 2;
    packages/serve/src/synthesis.ts:180:        .slice(0, DIGEST_EMPHASIS_OBJECTION_COUNT)

Two occurrences. A declaration and its single call site, in one file. **Nothing imports it.** The
`GOAL_RULED_LAW_CARRIERS` map exists for the opposite situation — a constant the goal ORDERS to be
exported and imported by another surface (`apps/runner/src/index.ts` imports `EXPANSION_DEPTH_MAX`,
and `tests/unit/s1-1-depth-contract.test.ts:2132` pins that import). Applying the prescribed remedy
would have widened a deliberately narrow exemption to admit a symbol that never needed exporting.

It would also have falsified a live pin nobody had connected to it.
`tests/unit/s1-1-depth-contract.test.ts:2153` is named *"exempts exactly the two ruled depth exports,
in exactly one file"*. Its three assertions read a 400-character window around the map; a second
entry appended after the first leaves all three GREEN while the test's NAME and stated PROPERTY
become false. That is the worst failure mode a test has: it keeps passing while its subject changes.
And that file is in neither my gate nor my write surface, so nothing in this task would have caught
it.

**Price of the habit, on this task alone:** it would have produced an out-of-contract edit (the map
is outside the two named regions of `tools/orphan-audit/src/index.ts` I may write), a silently
falsified test, and a rework round to undo both. **Price of avoiding it: one `git grep`, about
fifteen seconds.**

## 2. What we must upgrade

**2.1 A record must separate DIAGNOSIS from REMEDY, and mark the remedy UNMEASURED.**
This is the single highest-value change available and it is a formatting rule, not a process.
`board/F18`'s line reads as settled fact. Had it read *"class: law-carrier. Candidate remedy
(UNMEASURED): add a `GOAL_RULED_LAW_CARRIERS` entry. Decides on: does anything import the symbol?"*,
every downstream reader — brief author, packet author, me — would have run the one command that
settles it. **Make the deciding question a required field next to any prescribed remedy.** A remedy
with no stated deciding question is an opinion wearing a fact's clothes.

**2.2 The gates measure declaration syntax, and report it as law.** MEASURED with mutant M4:

    export const DIGEST_EMPHASIS_OBJECTION_COUNT: number = 2;   // fully exported
    → audit:source blocking = the three obs-capture rows. NO synthesis row.

The rule (`tools/orphan-audit/src/index.ts:656`) has no room for a type annotation. `Object.freeze`
and a lower-case name evade it identically — which is why `DIGEST_COMPRESSION_LEVELS`, five exported
numbers in the very same file, has never been visible to it. A seat under pressure to make a row go
away will find the annotation in about a minute, and the gate will bless it.
**Upgrade: every source rule needs a stored negative fixture — the smallest input the rule SHOULD
catch and does not. Run them with the rule.** Without that, the audit's green is a statement about a
regex, and every report that quotes it inherits the confusion.

**2.3 The architecture table cannot see an over-declared edge.** MEASURED with mutant M5: adding
`"no-such-package"` to `apps/api`'s allowed list changed nothing — not a violation, not a count. The
audit checks `actual ⊆ allowed` and never the reverse. This matters precisely for the work I was
sent to do: declaring an edge. The audit can prove I did not under-declare; it can never tell anyone
I over-declared. The table is the only written record of the intended architecture, and it has no
guard against silently permitting edges the product does not have. **Upgrade: an unused-declaration
check, one loop, five lines.** Until then, "the audit went green" is not evidence for a declaration —
the manifest and the commit that wrote it are, which is why both cluster commits cite `9c68ceb3`.

**2.4 An audit that can crash must be tested against the input that crashes it.** This is C3, and it
is the same generating condition as 2.2: the tool had never been run against an input designed to
make it lie. One retired row with no `package.json` took the entire architecture gate offline for a
merge window, and three separate records then quoted a violation count from that dead state. The fix
is eleven lines. It did not ship in Task 1 because the module exposed no seam — which is itself the
finding: **a rule you cannot drive from a test is a rule you will discover is broken in production.**
The module already had the right idiom (`auditMigrationReplaySafety(name, source)`,
`auditSurfaceAttachmentLiterals(name, source)` — exported, named + input, returns findings); the
manifest read was the one rule that had never been extracted.

**2.5 `pnpm lint` still hides half the verdict.** The trap file records it at `:1832`
(`audit:architecture && audit:source` — a red architecture half short-circuits the source half).
It is still true today, and both halves are still red on the three F31 rows, so `pnpm lint` in this
tree reports the architecture list and never runs the source audit. Everyone who needs both must
know to run them separately. **Upgrade: make the script run both and merge the verdicts.** This is a
one-line `package.json` change that has now cost at least two seats a paragraph of explanation.

## 3. What repeatedly cost tokens

| cost | what | fix |
|---|---|---|
| highest | **Re-deriving the same attribution.** The `support-kb` / `obs-capture` attribution was measured by CONT-T1 and re-stated in my packet in ~120 words. I still re-measured the manifests and the commit, because the packet says a predicted value is a measurement to take. That is right — but the packet could have carried the four commands instead of the prose, and I would have spent the same tokens producing evidence rather than reading and then reproducing it. **Packets should carry COMMANDS, not conclusions.** |
| high | **Huge captured logs.** One 4-path vitest run writes ~19 000 lines. Every read of a frame is an offset hunt. The run script that logs first and prints `rc` + summary + failure names is what made this task cheap; it should be the mission's standard harness, not something each seat rebuilds. Three seats have now written their own version. **Ship `tools/gate-run.sh` once.** |
| high | **`grep` on this Mac.** Four separate trap entries already exist for `--include=*.ts` dying unquoted under zsh. I hit it anyway, on my first search, because the traps index is 190 headings and my reading floor named five of them. **A five-line `SHELL-RULES.md` at the top of the trap file (quote `--include`, zsh does not word-split, `$pipestatus` not `$PIPESTATUS`, no `timeout` on this host, BSD `head -n -N` absent) would end a recurring tax that the 4 600-line file is too big to prevent.** |
| medium | **Predictions in briefs that the governing default contradicts.** My brief predicts `scaffold.test.ts` 3/3 GREEN; my packet's architecture default makes that impossible by construction. Reconciling the two took real reasoning. See §5. |

## 4. What I nearly got wrong

**I nearly implemented the archive's remedy.** It is quoted in the measurement of record, in the
brief's framing, and in my packet's own words (*"the carrier pattern the audit names"*), and it is
wrong. What stopped me was not suspicion — it was a mechanical habit: before choosing between two
implementations, measure the fact that distinguishes them. Here that fact was "who imports this?".

**I nearly chose the POLICY route.** The brief's criterion — *"a bound, a count, a threshold the
algorithm decides with"* — reads as a direct hit: the value literally is a count. The criterion is
too weak to decide, and two measurements settled it in the other direction:

1. `packages/serve/src/synthesis.ts` imports only `@debateai/kernel`. It has no pool and no register
   reader. Its own header (`:21-22`) says the loop bound *"the sealed register row — never a code
   constant"* and says the top-2 emphasis is the S6-2 ruling — the file already distinguishes its
   policy value from its law constants, in prose, and only one of them is sealed.
2. A sealed row is a **deployment-resealable** value. If `2` became a row, a deployment could seal
   `top-5` and silently violate S6-2. That is the test that actually separates the species, and it is
   not the one the brief states.

The route was also structurally out of contract: it needs `ALGORITHM_REGISTER_ROW_KEYS`
(`packages/register/src/algorithm-policy.ts:68`, pinned by
`tests/integration/t16-algorithm-register.test.ts:439`) and a loud-missing-row test — neither file is
in my write surface. **A brief that names a route should name the files that route touches; if they
are not in `allowed`, the route is not on offer and the brief should say so.**

**I nearly reported the runner as not depending on `support-kb`.** `grep -o '"@debateai/support-kb":"[^"]*"'`
found it in `apps/api/package.json` and not in `apps/runner/package.json` — because one manifest is
minified (`":"`) and the other pretty-printed (`": "`). The probe contradicted a verdict I had
already measured, which is the only reason I looked again. Recorded as a trap.

## 5. Where the packet and brief were unclear or wrong

1. **`tools/orphan-audit/src/index.ts` line references have moved.** The packet names *"the edge
   table at `:25-35`; the manifest read at `:50-56`"*. MEASURED at base: the edge table is `:9-42`
   (T1 retired the `web` row and added a five-line comment) and the manifest read is a single line,
   `:56`, inside `auditArchitecture` which opens at `:49`. Not blocking — the anchors are unique by
   text — but a packet quoting line numbers against a file two prior seats edited this session is
   quoting a moving target. **Cite by symbol (`auditArchitecture`'s manifest read), never by line.**
2. **The brief predicts `scaffold.test.ts` GREEN; the packet's default forbids it.** Brief Step 3
   and its Interfaces line both predict the suite green. The architecture-audit default the
   orchestrator applies on V's behalf keeps the three F31 rows as violations while the edge-rows arm
   expects `[]`, so that arm is red by construction. Measured, final tip: `Tests 1 failed | 9 passed
   (10)`. The default governs; the prediction is a stale artifact of a plan written before the audit
   ever finished a run. Named as a finding, not absorbed.
3. **C3's write surface omits the seam its own deliverable needs.** `allowed` scopes
   `tools/orphan-audit/src/index.ts` to *"the edge table rows … and the manifest read guard at
   `:50-56`"*, and C3 requires a permanent guard test in `scaffold.test.ts`. The module exposed no
   seam. I extracted the manifest read into an exported `auditEdgeManifest(name, directory)` — the
   region named in `allowed`, in the module's own exported-rule idiom — rather than taking the
   packet's fallback (a temporary mutant), because a permanent test that cannot reach the guard pins
   nothing (`heartbeat-worker` §2). **Disclosed as the one interpretive judgement in this task.**
4. **The packet's `(line 10 only)` scope on `migrations/0061` is correct and was sufficient.** Noted
   because it is the one line-scoped constant in the packet that survived contact with the tree.

## 6. Dead ends — do not re-derive these

- **`packages/published-arithmetic` is not the numeric-constants carrier.** It exports exactly two
  functions (`agg`, `σ`) and zero constants, and `auditArchitecture` enforces that (`:96`). Moving a
  number there is not an option. `packages/serve` also does not declare it as an edge, so the import
  would create a fresh architecture violation.
- **Adding `support-kb` as a table ROW is not needed.** It is a dependency target, not a row; the
  cycle walk treats an unknown target as a leaf and the audit is satisfied. `edgeRowsChecked` stays
  27, which `scaffold.test.ts:27` pins.
- **There is no `CREATE TRIGGER` rule in `auditMigrationReplaySafety`.** `migrations/0061:34` has a
  bare `CREATE TRIGGER` and the audit is silent about it. In scope for a replay-safety sweep, out of
  scope here — named in the handoff.
- **`apps/api`'s `"evaluator"` allowed entry is real**, not a phantom: `packages/evaluator` exists.
  Checked while probing 2.3; do not re-open it.

## 7. Toward the one-prompt machine

Ranked by tokens saved per line of effort.

1. **Put the deciding question next to every prescribed remedy** (§2.1). One field. It converts the
   archive from a set of opinions a seat must re-litigate into a set of hypotheses with a stated
   test. This is the change that would have saved the most on THIS task.
2. **Ship one gate harness** (`log first, print rc + summary + failure names`) and one
   `SHELL-RULES.md` (§3). Three seats have written the harness; four trap entries describe the same
   zsh bite. Both are pure duplication.
3. **Packets carry commands, not conclusions** (§3). A conclusion must be re-measured anyway — the
   packet says so itself — so prose attribution is paid for twice.
4. **Every audit rule ships a negative fixture** (§2.2). The single change that would stop this
   codebase's gates from being quoted as stronger than they are.
5. **Cite by symbol, never by line** (§5.1), in packets and in records. Line numbers in a
   multi-seat session are wrong by the time they are read.
6. **State the write surface as a consequence of the deliverable, not beside it.** Three of this
   task's four judgement calls were "can I legally do the thing the packet asked for?". A packet that
   derived `allowed` from the route it selected — and said which routes it had therefore excluded —
   would have removed all three.
