## r1

# S06 Codex reviewer self-report

This is the review case file for T10+T11 at `3665302a`, not an execution diary. The review was static: no test, build, install, provider, or mutating Git command was run.

## Causes and prices

1. **The implementation census stopped at exercised constructors.** The acceptance constructor and integration fixture supply `verdictLabelPolicy`, while the shipped `apps/runner/src/main.ts` constructor does not. Focused seam evidence therefore made the new loud stop look deployable while the actual process entry point deterministically reaches it with `undefined`. Price: one rework round and a production path that cannot serve an answer.

2. **The migration preserved historical bytes but the TypeScript and wire models collapsed history into the live vocabulary.** Migration 0055 correctly leaves old `first-configured-provider` rows in place, yet the read projection and `AnswerSchema` now admit only the replacement literal. The DR-184 catch-up path also copies the historical literal into a new constrained write. Price: old multi-maker answers become unreadable through API validation and cannot be caught up without a constraint failure.

3. **The claimed consumer sweep was not closed over all consumers.** A pre-existing integration assertion and the acceptance README still name the retired rule. The focused integration filter only selected tests whose name contained `through the production runner`, so the stale HYG assertion remained outside the evidence. Price: the authoritative full integration suite has a deterministic red, and current operator documentation describes the wrong selection rule.

4. **Verification scope was described more broadly than its compilation graph.** Root `tsconfig.json` excludes `acceptance/**`; an included unit test imports `acceptance/main.ts`, but no included source imports `acceptance/ceremony.test.ts`. The only acceptance-wide config was not evidenced as run. Price: the edited ceremony test is statically unverified even though the worker report says it was “typechecked only.”

5. **The packet promoted prose to D24 evidence.** It says two non-discriminating mutants are recorded and asks the reviewer to assess both. `M8` has the required applied-diff/run/restore/hash record; the first ladder-order mutant exists only in narrative. Price: its claimed equivalence versus test weakness cannot be independently assessed from the packet.

## Near misses

- I nearly accepted the report's class-sweep table. A direct repository search found the integration assertion at `tests/integration/database.test.ts:2048` and the current acceptance prose at `acceptance/README.md:78`.
- I nearly treated `NOT VALID` as sufficient compatibility. Following the value through `ServeRepository.readAnswerProjection`, API `AnswerSchema.parse`, and DR-184 catch-up exposed the read and re-write failures.
- I nearly credited the root typecheck for all acceptance edits. Reading both tsconfigs and the import graph showed that `acceptance/main.ts` can be transitively checked while `acceptance/ceremony.test.ts` is not.
- I treated recorded test output as author evidence, not as an independent rerun. This preserved the static-review boundary and kept CANNOT-ASSESS distinct from PASS.

## Dead ends closed without findings

- The D14/D16 BASE-full versus TIP-minus-header comparisons are sound after removing the one added log header; the paired compiler output is byte-identical.
- The zone BASE/TIP failure-name sets are identical, and the three cluster records contain the claimed repeated counts. Those facts do not cover the stale integration test because the zone excludes integration and the focused cluster uses a name filter.
- `M8` is genuinely non-discriminating as applied: it adds fallbacks but leaves the preceding undefined-policy loud stop intact. `M8prime` mutates both halves and the recorded seam catches it.
- The report hash, diff metadata, mode-change count, baseline behavioral RED, canonical mark insertion, forced UI/web lines, and receipt/migration shape all match the filed artifacts by static inspection.
- I did not file speculative UI-wiring or catch-up-receipt objections where the packet explicitly scoped the change to vocabulary wiring or allowed a null receipt.

## Review-system upgrades

- Every new required constructor setting should trigger a caller census that names the production entry point separately from test and acceptance factories.
- A migration that retains a retired vocabulary member should require a read/write compatibility table: historical read, latest read, wire parse, catch-up copy, and new insert.
- “Every consumer migrated” evidence should include repository-wide residual-token output and the authoritative suite's unfiltered consumers, including current operational Markdown.
- Typecheck evidence should name the exact config and prove each edited file belongs to its compilation graph.
- A claimed non-discriminating mutant should not count as recorded unless its own D24 block contains the applied mutation, live-token proof, result, restore, post-restore proof, and matching before/after hashes.

## r2

The r2 review remained static by packet law: no test, build, install, provider call, or mutating Git command was run. I inspected the committed source and the author-produced records, recomputed metadata and the report hash, and used read-only diffs/searches to test the claims.

### Causes and prices

1. **The repaired HYG assertion asks for a maximum without ensuring that the maximum is unique.** Its two roots use the same `judgementDouble` score, the default panel voice cannot displace either author, every review bearing is `cannot-assess`, and propagation ignores `UNKNOWN` edges. Both roots therefore have equal strength. The new inequality oracle accepts the retired first-provider selector, while the unchanged `reason` assertion still assumes the secondary maker loses even though the lawful tie-break is over two random UUIDs. Price: B2 consumed a rework round but remains blocking, and three green runs happened to conceal a roughly symmetric tie outcome rather than prove provider-order independence.

2. **Evidence was filed before the last product/type commit.** The root typecheck and all three-run clusters identify `34de9dc8`; final tip `a10c2254` then widened the projection type and added the compile-level assertion that those records are supposed to prove. Price: the report says “at r2 tip” without a final-tip compiler record, forcing another evidence cycle even though static inspection found the final types coherent.

3. **The harness law was fixed after the transcript that needed it.** `M4-omitted` ends with two dirty paths, then later blocks demonstrate the new exit-3 dirty-tree guard. The review packet nevertheless calls the earlier dirty block “complete in D24 shape.” Price: the same N3 evidence gap survives, plus a packet defect that could have caused a false approval if the porcelain line were not read.

4. **A renamed history model left its architecture prose and validation oracle behind.** The test still says the database stops accepting the retired rule, the opposite of J17, and its `not.toContain("NOT VALID")` check can be defeated by whitespace while never inspecting `pg_constraint.convalidated`. Price: a future `NOT\nVALID` regression could pass the named validation pin, and maintainers receive mutually contradictory instructions from the migration and its test.

### Near misses and dead ends

- I nearly credited the HYG oracle because it queries the real strength table. Following the fixture inputs through panel selection and propagation showed that a real oracle can still be non-discriminating when the fixture produces a tie.
- I nearly treated the clean final zone as covering the stale root typecheck. The zone transpiles/runs unit, architecture, and render tests; it does not replace `tsc`, and the new compile pin is in the excluded integration file.
- The J17 implementation itself closes r1 B3: migration 0018's valid one-member check means an existing row can only be null or the retired value, so 0055 can validate the two-member history without encountering a third lawful value. The read contract, catch-up carrier, and fresh-write guard match the ruling.
- B1, N1, and N2 from r1 are closed by static source plus recorded evidence. The separately discovered missing `panelPolicy` path is real and already has board ticket F33.

### Review-system upgrades

- Any “maximum wins” integration oracle must assert a strict maximum before asserting the winner; tie cases need their own deterministic-ID fixture.
- Filing automation should reject a gate log whose recorded tip is not the report's final tip, especially when later commits touch the exact type/test the gate claims to cover.
- Packet lint should parse every D24 porcelain block and reject any non-empty result; a later harness demonstration cannot retroactively legalize an earlier dirty transcript.
- Migration validation tests should query `pg_constraint.convalidated`, not search SQL prose for a layout-sensitive token.

## r3

# S06 Codex reviewer self-report — final lawful review round

This review remained static by packet law. I read the r3 packet first, then the
named rulings, prior verdicts, worker packet, ticket, r3 diff, report/self-report,
and recorded logs. I ran no test, build, install, provider, database, or mutating
Git command. Read-only Git metadata and text/hash checks were the only fresh
verification available.

### Causes and prices

1. **The mutant harness retained S06's pre-addendum transcript shape after D24
   ADDENDUM changed the law.** The r3 blocks show an applied count and a restored
   count, and their equal pre/post hashes strongly corroborate restoration, but
   they never print NEW between `<<<TOKEN` delimiters or record the `pre=0` gate.
   That recreates the exact free-parameter ambiguity the addendum was written to
   remove. Price: four scientifically plausible records still need an evidence-only
   correction at the final-round boundary.

2. **A correct factual residue was filed with a routing question that became stale
   minutes later.** The worker truthfully says S06 never executed the ceremony, but
   its draft asks V to choose a generic ceremony owner or D15-only closure. J18 now
   names W12, requires D15 plus the acceptance-inclusive typecheck for lane closure,
   and routes any attributable ceremony failure back as an S06 micro-fix. Price:
   one final report row now states an already-answered choice.

3. **The review packet asserted stronger provenance than its artifact carries.**
   Root typecheck and C3 have full-tip headers; C1 has only short `6624c3fa`. The
   short id resolves uniquely and does not undermine the recorded 15/15 x3, but the
   packet's plural `tip (full):` claim is false. Price: a reviewer must reconstruct
   which logs actually carry the promised provenance instead of trusting dispatch.

4. **Round accounting in both packets conflicts with the reviewer contract.** They
   say one ordinary worker round remains even though this is r3 and the contract
   says a CHANGES verdict must become V rows, never r4. Price: an automated
   orchestrator could spend an unlawful seat cycle unless the reviewer catches the
   contradiction.

### Near misses

- I nearly treated equal pre/post hashes plus restored-token zero as literal D24
  ADDENDUM compliance. Those facts support the result, but they do not prove that
  the harness identified NEW verbatim or hard-gated `pre=0` before applying.
- I nearly accepted the C1 provenance claim because its short SHA matches current
  HEAD. Packet review requires checking the quoted header, not reconstructing a
  nicer one from Git.
- I nearly kept V-S06-1 as a harmless conservative draft. J18 explicitly says the
  row is answered by ruling, so retaining the choice would be false process state.

### Dead ends closed without product findings

- The B1 diff makes the first-configured root weaker, asserts strict inequality
  before the winner, and derives both root identifiers from the strength rows. The
  recorded before/after blocks carry byte-identical mutant diffs and identical
  mutated-file hashes, with 1/1 surviving before and 1/1 failing after.
- The N2 re-run itself has matching pre/post file hashes, applied count 1, restored
  count 0, 20/20, and an empty cleanliness field. A mechanical scan found exactly
  the two older dirty blocks named by the appended inadmissibility index; the index
  no longer repeats the audited header and therefore does not create a third hit.
- The N3 diff deletes the layout-sensitive source-text negative, queries
  `pg_constraint.convalidated`, asserts both history members, and records the
  newline-split `NOT VALID` mutant as caught.
- The r3 diff touches only the integration and architecture tests; no D14/D16
  trigger path changed. Full-lane metadata, mode count, report hash, and clean
  worktree state matched the packet before filing.

### Review-system upgrades

- Version the D24 harness format and make packet lint reject a post-addendum block
  without literal NEW delimiters and all three printed gate results.
- Regenerate residue disposition after late rulings; a packet should never ask a
  reviewer to preserve a V question that DECISIONS has already answered.
- Derive log-provenance claims by parsing each log header, not by copying the best
  header from a neighbouring file.
- Make the packet writer derive remaining-round text from the round marker and the
  heartbeat cap. At r3 it must emit `no round 4; route findings to V`.

## merge

This merge review stayed static by packet law. I ran no test, build, install,
database fixture, provider call, or mutating Git command. I reviewed the packet
before the diff, read r3 first, reconciled J17-J19 and D24 with both addenda,
then inspected the merge object, both parent-relative diffs, every touched test,
the worker report/self-report, and every r4 evidence block.

### Causes and prices

1. **The compiler record names a state, not an immutable tree.**
   `merge-typecheck.log` says “the RESOLVED merge” and exit 0, but carries no
   commit or tree hash and was stamped 44 seconds before merge commit `e040b1ee`.
   The report upgrades that to “merged tip.” Price: the required acceptance-
   inclusive compiler gate needs one committed-tip evidence rerun even though
   static source inspection found no type defect.

2. **The resolution rationale compressed “does not read the differing field”
   into the false claim “reads only mark and subjectRef.”** The resolver also
   reads `reviewOutcome` and `terminalTransportOutcome`; widening remains safe
   because the two union arms differ only in `servedRootRule`, which it does not
   read. Price: one accurate comment/report correction, and a misleading proof
   premise in both the worker and reviewer packets.

3. **The landmark script counted source lines as vocabulary members and reused
   a two-lane mint template.** It prints `CONDITION_MARKS length: 86`; exact
   element counts are base 31, integration 31, lane parent 32, merged 32. T6 did
   not touch kernel, so this merge retains one S06 mint, not “both lanes'” mints.
   Price: the audit cannot be consumed mechanically until refiled.

4. **The filing prepended a Markdown heading marker to a heading already carrying
   one.** Both worker artifacts say `# ## r4`, while their packet requires a real
   `## r4` section. Price: anchored section parsers cannot locate the filing, and
   correcting the report heading also requires recomputing line 2's hash.

### Near misses and dead ends

- I nearly accepted the resolver rationale because its first pass does filter and
  query by `mark`/`subjectRef`. Reading the decision arms exposed the other two
  accesses; comparing the type definitions then proved the widening itself safe.
- I nearly treated a pre-commit typecheck as self-evidently identical to the
  commit. Without a recorded tree hash or post-commit rerun, that equivalence is
  testimony rather than immutable provenance.
- The apparent merge-risk dead ends are closed: T6's extracted contract schema,
  `review_outcome`, XOR refinement, and truth-binding body survive; T6/TINT1
  dedicated test files are byte-identical to integration; no touched test deletes
  a T6/TINT1 assertion; migrations remain 0053 -> 0054 -> 0055.
- The four repaired mutant records are D24-admissible. D14/D16 payloads are
  byte-identical, zone failure sets are equal, and the fourteenth zone name is the
  tracked F22 S3c RSS member rather than an S06 regression.

### Review-system upgrades

- Every pre-commit gate log should record `git write-tree`; every post-commit gate
  should record full `HEAD` and empty porcelain. A prose label such as “resolved”
  must never be promoted to “at tip.”
- Generate merge-safety rationale from the actual property-access set and the
  discriminant between the widened types: here the proof is “all accessed fields
  are identical; only `servedRootRule` differs and is unread.”
- Count closed-vocabulary elements structurally, not by line span, and compare
  each parent before claiming that both lanes minted anything.
- Lint required report headings with anchored Markdown patterns before hashing.

## merge-r2

This verification round remained static by packet law. I ran no test, build,
install, provider, database, or mutating Git command. I reviewed only the four
prior findings and this round's packet, using read-only Git-object inspection,
source extraction, structural counting, anchored searches, and hash recomputation.

### Cause and price

The N1 repair replaced a false two-field enumeration with the correct structural
proof, but its record then promoted “less coupled to the complete read-set” into
“does not depend on the read-set” and “stays true as the body changes.” The proof
still has one necessary behavioural premise: `resolveTrueUnjudgedReasons` must not
read `servedRootRule`, the only field whose type differs between the union arms.
Price: no product change and no new runtime evidence; two sentences in the report
and self-report need a record-only correction before approval.

Concrete counterexample: a future fifth access branches on
`record.servedRootRule`. Fresh and preserved records can then take different arms,
so the current widening needs semantic review. The accurate durable claim is
narrower: adding reads of any *other* `ConditionMarkRecord` field is safe because
`Omit<..., "servedRootRule">` preserves those fields identically; reading
`servedRootRule` invalidates the proof premise.

### Near miss

I nearly approved N1 because the source comment itself is accurate and my
independent extraction confirms exactly four current accesses: `mark`,
`subjectRef`, `reviewOutcome`, and `terminalTransportOutcome`. Reading the r4b
report and self-report as proof text, rather than merely checking that the four
names appeared, exposed the absolute maintenance claim.

### Dead ends closed

- B1 is closed statically as an evidence record: the filed-tip log names full
  commit `9413114c`, tree `d888dcf2`, porcelain zero before and after, and exit
  zero; independent Git metadata gives the same tree and an empty current
  porcelain. I did not rerun the compiler.
- N2 is closed: independent structural extraction gives 31/31/32/32, identical
  hashes for the raw four-member tail, no T6 kernel diff, and one S06 member at
  position 27.
- N3 is closed: neither artifact contains `^# ## `; both contain anchored r2, r3,
  r4, and r4b sections; deleting line 2 and hashing the report reproduces
  `8f1c6769e6f7a361c76937154731f14ea88955601aa75372253bfd76fe661fd1`.
- The packet's commit, tree, one-commit diff, +18/-4 stat, comment-only
  classification, output paths, marker, and quoted artifact constants all match.

### Review-system upgrade

A merge-safety proof should name both the type delta and the invalidation trigger:
“only field X differs; function F does not read X; re-review if F begins reading
X.” Packet lint should reject absolute phrases such as “cannot go stale” unless
the claimed invariant is mechanically enforced. The packet itself was precise;
the only process tension was the general reviewer contract's probe preference,
which the explicit STATIC-only dispatch correctly overrode.
