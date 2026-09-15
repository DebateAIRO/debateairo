## r1

### 1. Cost

The decisive cost was tracing one contract across the T16 policy load, the pre-claim gates, claim-time provider health, the late synthesis adapters, and answer persistence. The 19-file packet surface and the split evidence bundle made this a source-and-artifact review rather than a local diff skim. Static-only authority prevented fresh probes, so every execution claim below is bounded to the supplied logs.

### 2. What I nearly got wrong

I nearly accepted an absent sealed synthesis provider as an allowed `SYNTHESIS_TRANSPORT_DEATH`. J24 draws a sharper boundary: a sealed role ref that is already unresolvable or unhealthy must refuse loudly, preferably at claim time, name the role, and never enter ordinary transport fallback. The runner's late resolver made the implementation look compliant until I compared the provider collection used there with the claim-filtered collection.

I also nearly treated a returned `loopRounds` array as a persisted record because the unit-test title says “persists.” Reading the repository write path showed that the array never crosses the storage boundary.

### 3. Dead ends and avoided false positives

- I considered filing the three-segment unit fixture as a J23 cap violation. The production composer parser has the two-segment cap, and the prior DR-159 disposition recognizes that parser seam as the production enforcement point, so I did not file it.
- I considered the omission of EDGE-target polarity relations from the digest builder. The reviewed live runner path materializes NODE-target relations; static evidence did not establish a reachable EDGE-target input in this lane, so I did not convert that uncertainty into a finding.
- The packet constants, goal hash, commit range, diffstat, evidence filenames, RED/green counts, and mutant restoration hashes reconciled statically. I found no packet defect.

### 4. Packet friction

The packet correctly names J24, but the evidence surface conflates four cases that need separate discriminators: missing policy family, sealed ref not configured, configured ref absent at claim, and a provider that was healthy at claim but dies during the role call. The architecture test inherits that conflation by calling its source-order assertion “refuses at CLAIM TIME” while only proving the missing-family gate is pre-claim.

The packet also asks for loop-round records and retired-guard disclosure without naming their durable read model. That made it necessary to inspect the entire persistence path to distinguish returned telemetry from reviewable evidence.

### 5. Process upgrade

For the next round, use a four-row role-resolution matrix with expected terminal, timing, visible mark, and provider-call count. Add a storage-boundary table for every new `ServeGateResult` field: producer, persisted representation, reader, and discriminator test. Require test names containing “persists” to reload through the repository rather than assert only on the pre-persistence object.

### 6. Prediction calibration

I expect rework to touch the pre-claim role-resolution path, synthesis round persistence (or an explicit durable reconstruction contract), and the persisted disclosure for the retired protected-core guard. The highest regression risk is accidentally converting a genuinely mid-call transport death into the J24 unresolvable-role refusal; the second is introducing a round store whose candidate reference still does not resolve to the recorded raw artifact.

## r2

### 1. Cost

The expensive part was not rechecking the three visible r1 fixes; those were locally clear. It was following the new `serve.synthesis_round` relation into two older system-wide contracts that the lane diff did not mention: encrypted content at first write and ownership/content-lease enforcement at read. I also had to distinguish “persisted” from “independently established”: the round test genuinely crosses the database boundary, but its candidate-reference assertion still compares two fields derived from the same unvalidated string.

### 2. Cause and price

The response to r1 B2 optimized for making the transient round object durable. That solved the immediate persistence defect, but the new table copied request, candidate, verdict, and objection plaintext without entering the repository's content-carrier registry. The price is a second, unprotected copy of material that neighboring serve carriers encrypt and crypto-erase. The same local focus left `candidate_ref` as arbitrary nonempty text, so persistence preserves a claim of resolvability without enforcing or measuring a target.

### 3. What I nearly got wrong

I nearly approved B2 after seeing the correct transaction boundary, the deleted `referenceCandidate`, and the runner's direct use of `response.rawArtifactRef`. D35 changed that conclusion: the database assertion proves only that the retry copied the first row's string and that the string does not use the old prefix. It never asks the ledger whether the artifact exists, while the durable schema accepts any nonempty text.

I also nearly reported the D27 comparator output as stale evidence. The commit stamps are correct. The false `STALE` lines are tree hashes emitted as a second match by the ruled `grep -o` command, so the defect is in the mandated comparator/transcript, not in the eight gate logs.

### 4. Dead ends and avoided false positives

- I did not reopen the missing production `claimTimeProbe` wiring: J22/J27 explicitly route shared entry-point composition through T3C, and this review is pinned to S07's filed tip.
- I considered the claim-expiry race around terminal failure, but the static record did not establish a new reachable regression specific to this patch, so I did not turn it into a finding.
- The resolver source-text mutant R2M3 is not an independent oracle under D35, but the executed database arms already establish the acceptance-critical refusal and no-substitution behavior. I classify R2M3 as structural defense rather than claiming it as behavioral proof.
- The integration and zone failures match the supplied baseline signatures; the filtered `-t "at claim"` miss is repaired by the exact all-absent run and the final full integration log. I found no second filtered run whose advertised discriminator was not executed.

### 5. Packet friction

D27 ADDENDUM-2's exact command cannot produce the packet's claimed empty mismatch section for a valid gate stamp containing both `commit=<sha>` and `tree=<sha>`. `grep -m1 -oE` emits both hashes on separate lines; `awk` sees the tree-only line without a second field and prints it as stale. Running the standing form against the eight r3 gate logs produced eight false `STALE: bbe5d57...` lines. The packet's underlying tip assertion is true, but its required evidence recipe is not reproducible as written.

### 6. Process upgrade

Every migration that adds text or JSON tied to a run should trigger a carrier-inventory check: encryption columns/attestation, plaintext-write trigger, content-lease reader, ownership predicate, crypto-erasure enumeration, and leakage scan. Every field called a reference should have either a database foreign key or a read-back test that joins to the authoritative ledger target. Mutant summaries should label source-text assertions “structural” so they are not silently counted as D35-independent measurements.

### 7. Prediction calibration

I expect the next S07 patch to add `serve.synthesis_round` to the encrypted-carrier path (or persist only opaque ledger references), make its reader ownership-aware, and constrain `candidate_ref` to `ledger.raw_artifact`. The likely regression is encrypting the candidate text while leaving the request/verdict JSON plaintext. Independently, the orchestrator will need to change the D27 parser to select only `commit=<sha>` before this evidence recipe can be used literally.

## r3

### 1. Cost

The expensive part was separating three identities that the filing and packet partly collapsed: a configured provider role, one provider-call artifact, and a persisted round reference. That required tracing the J29 delta through the frozen T9/T16 text, both production call sites, the ledger artifact/entry split, the rewritten migration, the encrypted reader, and the database fixtures. The price is one final lawful worker rework round; no fourth worker round exists if this one misses.

### 2. Cause and price

The patch treated test observability as a storage requirement. Because `ledger.raw_artifact` does not retain provider input on an encrypted run, it inferred that the exact synthesizer request had to become a fifteenth content carrier. The frozen DoD only requires a recorded-request assertion and separately requires loop-round records; the existing recorder already observes the request before persistence, and the real provider double can observe the HTTP body. The inference added a 157-line encryption-function reproduction, another encrypted payload and reader-decryption path, and another carrier that every leakage/erasure inventory must maintain.

The second cause was confusing same-run membership with producer identity. The query proves that a UUID names some artifact in the run, but never that it came from `COMPOSER:SYNTHESIZER:<stage>:<round>` or `POST_COMPOSE_R9:EVALUATOR:<round>`. The encryption fixture then reused one unrelated author artifact for both fields and the second content commit changed the membership count to accommodate that fixture. T16 permits identical provider-role refs; it does not turn two fresh calls into one artifact.

### 3. What I nearly got wrong

I nearly approved the retained body because its trigger, sentinel, ownership predicate, lease and round-key decrypt are wired correctly. Reading the frozen grammar changed the result: “recorded-request assertions” and “loop-round records” are separate clauses, and an encrypted duplicate copied from the same in-memory object is not independent evidence of the bytes sent.

I also nearly accepted the DISTINCT fix as the intended identical-role case because the packet said T16 warned about it. T16's quoted text is about identical synthesizer/evaluator provider refs. The algorithm still performs two fresh calls, and the production gateway mints one raw artifact per call.

### 4. Dead ends and bounded evidence

- The worker is right that raw artifacts alone cannot reconstruct the request: encrypted artifacts null `input_hash` and encrypt only the response body. That fact does not require a production transcript store; it requires a wire-observing test double for the DoD assertion.
- UUID foreign keys and the cross-run rollback arm are real improvements. They refute nonexistent and foreign-run references, but neither refutes a wrong same-run artifact.
- The final D27 comparator resolved nine current logs with no stale stamp. The report self-hash, tip, tree, commit count, diffstat and no-mode-change claim reconcile.
- Fifteen final mutant transcripts have admissible pre/apply/restore gates across the supplied campaigns. The claimed first R4M1 survival has no retained D24 transcript, so that historical execution remains CANNOT-ASSESS; the pre-fix source does statically show why the writer mutation was outside that fixture.
- I did not execute tests, builds, migrations, mutants or providers because the packet made this a static-only seat.

### 5. Packet friction

Packet lines 45–46 call one artifact used for both fields “the identical-role-refs case T16 warns about.” That is not what T16 says and it steers the reviewer toward accepting the exact producer-identity gap J29 requires the round to close. The packet also narrows “same run and round producer” to a same-run join in its priority list, so reading r2/J29 rather than only the checklist was decisive.

### 6. Process upgrade

For every durable reference, require a four-column invariant table before implementation: target exists, target belongs to the run, target belongs to the expected call site/role/round, and the acceptance oracle measures each independently. Provider-role equality and artifact equality must be separate rows. For each proposed content carrier, first map the DoD clause to the cheapest observation point; test-only wire evidence must not create production storage. Generate the physical-row scan and crypto-erasure inventory from `CONTENT_CARRIERS` so adding a carrier cannot update the round-trip list while omitting the persisted-row and disk-marker scans.

### 7. Prediction calibration

I expect another lens to accept the fifteenth carrier because its encryption mechanics are complete, and to accept `artifact.run_id = answer.run_id` as full resolvability. The first counterexample to run is a same-run JUDGE artifact supplied as both round refs; the first design simplification is to capture the synthesizer HTTP request in the provider double and delete the request column.

## r4

### 1. Cost

The expensive part was separating a ledger pairing from a producer-role binding. The patch proves that an artifact exists at the call-site key the caller supplied, but the caller supplies both values; only the numeric suffix is independently checked. Tracing that distinction through the normal four-row oracle, the wrong-producer arm, and the mutation outputs exposed one product hole and two false mutation credits. With the worker's three rework rounds spent, the price is two V DECISIONS PACKET rows rather than another worker turn.

### 2. Cause and price

The round record models a call-site key as an unrefined string traveling beside the artifact. Persistence treats that pair as producer identity, even though it never derives the expected synthesizer/evaluator role and stage from the typed round. A legitimate synthesizer pair can therefore fill both candidate and verdict fields, or the roles can be swapped, while both lookups succeed.

The evidence repeated the same trust. R5M1 changed the SQL into a query PostgreSQL could not type, so PostgreSQL error `42P18` killed it before the producer assertion. R5M2 removed the round guard, persisted far enough to reach settlement, and then died on `WAIT_DRAIN_REQUIRED`; the target guard did not kill it. The hand-written campaign summary retained only “one test failed,” hiding both wrong causes, and D42 now forbids that summary form.

### 3. What I nearly got wrong

I nearly accepted the call-site pair because the normal runner emits exactly the intended strings and the database oracle returns four rows. The counterexample is simpler: reuse the real synthesizer artifact and `COMPOSER:SYNTHESIZER:INITIAL:1` key for both fields. `bound.role` appears only in error text, so nothing asks whether the verdict came from the evaluator.

I also nearly accepted the worker's statement that sharing the work item left only the round guard. Reading the raw mutant output instead of the aggregate summary showed the later terminal-event constraint still kills the mutant.

### 4. Dead ends and bounded evidence

- The carrier removal is complete: the migration has no body column, trigger branch, ciphertext or attestation; `CONTENT_CARRIERS` and both encryption arrays are back to 14. I found no body reintroduced under another field.
- The normal producer path is internally consistent, and the ownership predicate still blocks the non-owner. Those facts do not close the forged-role counterexample.
- The nine final gate records are all stamped at `9a3a5f60`; the mission comparator reports 9/0 stale. The supplied cluster, zone, database, crypto and typecheck outputs reconcile. I did not execute tests, builds, migrations, mutants or provider calls because the packet is static-only.
- Git proves 0057 exists only on `lane/s07`, not that no external database ever applied an earlier draft. That historical execution claim remains CANNOT-ASSESS statically.

### 5. Packet friction

Packet lines 33-34 state that a changed call-site format makes the negated `endsWith` guard always true. A nonmatching format actually makes it fail closed by throwing; the present defect is that a wrong role's real key can still end in the right round. Line 30 also describes the negative fixture as a JUDGE artifact “under a synthesis call site,” but the ledger stores it under `JUDGE`; the round object merely claims a synthesis key that has no matching ledger entry. Both descriptions steered attention away from the accepted role-swap case.

### 6. Process upgrade

Do not carry producer identity as two caller-authored strings. Derive the exact expected keys from typed role, stage and round at persistence, preferably through one shared builder used by runner and serve, then resolve only those keys. Mutation review must read the raw failure and name the exact targeted assertion; a red exit code is not a kill. The production-writer test should stop at `ServeRepository.persist`, before unrelated work-item settlement can become a second failure source.

### 7. Prediction calibration

I expect another lens to treat the four-row join as proof of four producers because the oracle labels roles from the destination fields rather than from the call-site vocabulary. I also expect it to accept R5M2 from the aggregate `RED` line without reading the raw `WAIT_DRAIN_REQUIRED`. The first counterexample is one real synthesizer artifact/key used for both round roles; the first evidence check is the raw received error for each claimed mutant kill.

## T9B

### 1. Cost

The expensive part of T9B was separating three properties that initially looked like one: no fifth `COMPONENTS_ONLY` class, no untraced citation in a band basis, and serve-with-a-mark after the evaluator loop exhausts. Option 2 satisfies the first two by refusing the answer, but that mechanism directly defeats the third. Reading the full goal disposition, rather than only the two `COMPONENTS_ONLY` sentences highlighted in the packet, changed the verdict.

### 2. Cause and price

The review path treated “not `COMPONENTS_ONLY`” as though it implied “not terminal.” It does not: an exception is another terminal outcome. That vocabulary slip propagated into the worker filing and the comments around the new tests. The price is a V-blocking semantic choice after the implementation and evidence campaign are otherwise sound.

The range `9a3a5f60..HEAD` was another trap. It legitimately reports zero removed block declarations, but its base predates the integration merge and therefore cannot display the authorized S08 block retirement. I used both that requested range and `905261e6..HEAD`, then audited expectation and fixture changes inside surviving blocks. This exposed the behavioural retirement that a declaration-only count hides.

### 3. What I nearly got wrong

I nearly approved after confirming that `recorded.bases` stays empty and that F1M1 is killed for the right reason. Those facts prove the S08 safety property, not compatibility with the whole frozen synthesis disposition.

I also nearly classified all three re-pins as subject-preserving because their enclosing test titles remain plausible. The decisive question is what outcome the prior fixture observed. The composition-evidence test still exercises composition evidence, but the T09 matrix and exhausted-loop case both cease to observe citation-tracing exhaustion serving with a mark.

### 4. Dead ends and bounded evidence

- The role correction is real: role is typed, the expected key is derived, equality is checked, and the derived key is the one resolved in the ledger.
- The four mutant deaths are credited to their targeted assertions. The prewritten manifest also correctly catches the discarded no-test-selection campaign.
- The RED's dirty test bytes were not hashed. I could establish scenario continuity and the intended product delta, but not byte identity of the dirty test file; I reported that limit instead of overstating D57 provenance.
- Runtime remained outside authorization. All pass counts are attributed to supplied records, never represented as runs performed by this seat.

### 5. Packet friction

“Require that the measured code did not move” is too broad when the artifact is intentionally a pre-fix RED: the failing product expression must move. The useful D57 question is whether unrelated measured code or the test oracle moved, and whether the exact intended delta is independently reversed by a mutant at the filed tip.

I loaded the mission's process and verification guidance late in the static pass. It did not change the evidence gathered or the no-execution boundary, but it should have happened before repository inspection; the final filing is rechecked against it.

### 6. Process upgrade

For cross-lane safety corrections, build a criterion-by-outcome matrix before selecting a mechanism: each evaluator criterion across early satisfaction, third-round exhaustion, served mark, refusal and `COMPONENTS_ONLY`. Audit property-level expectation changes in addition to deleted test blocks. For a dirty RED, record the dirty test's hash or embed its exact diff so later reviewers can prove oracle continuity without inference.

### 7. Prediction calibration

Another reviewer may focus on the two named `COMPONENTS_ONLY` sentences and classify the result as a spirit-only concern. The literal counterexample is stronger: three exhausted rounds with `citationTracing: false` cannot produce the goal's required served answer with a visible objection mark. Another likely miss is accepting a zero-block-removal scan as proof that the retirement boundary held, despite fixture substitutions inside surviving blocks.

## T9B review 2

### 1. Cost

The decisive work was not the happy-path trace; that path is compact and internally coherent. The cost was keeping verdict label, confidence band, band decision and terminal state separate while reconciling V's prose with the actual unions. The second expensive trace followed the empty conformance set far enough to see that JavaScript's vacuous `every` turns it into an all-reasoning case before the empty-basis logic can run.

### 2. Cause and price

The third mechanism solves the previous refusal by suppressing the empty-cited-set throw, but it reuses the all-reasoning downgrade limb. That limb has a two-segment form contract. Because citation failure empties the verified set, the branch condition becomes true without any reasoning node, importing a precondition that the ruling never imposed. The price is a reachable `COMPOSITION_CONTRACT_ERROR` in precisely the “serve regardless” path.

Separately, the orchestrator protected the frozen code-derived label but translated V's value-producing band floor into no band. That is not a harmless vocabulary normalization: the decision text explicitly contrasted a value with absence, while the implementation selects absence.

### 3. What I nearly got wrong

I nearly accepted null/null as the safest possible implementation because it keeps untraced material out of the basis and preserves the acyclic label. The migration proves null/null is representable, but representability does not make it the selected policy. Re-reading V's stated tradeoff exposed the mismatch.

I also nearly treated the two-segment repin as ordinary fixture enrichment. Comparing it to the restored landed form and then reading the runner schema showed that the extra segment is necessary only to avoid the inherited throw. It is accommodation, and it removes the strongest production counterexample from the test.

### 4. Dead ends and bounded evidence

- The exact two-segment run really does return `DOWNGRADED`, carry the standing mark, and leave both band fields null; there is no hidden default.
- The six mutant credits are genuine. F1M3 has additional wrong-cause failures in permissive serve-s05 fixtures, but its primary T12 `.resolves` assertion independently kills it through the real empty-basis exception.
- The additive trace token has no second closed runtime registry that needed extension.
- The RED correctly predates the fix and the product blob is stable from fix to filed tip. The dirty test bytes were not hashed, so their exact identity remains CANNOT-ASSESS.
- Runtime stayed out of scope. The review reports suite outcomes only as supplied records.

### 5. Packet friction

The packet repeats the orchestrator's “terminal ladder” as `SERVED | CAPPED | DOWNGRADED`, but source types put `CAPPED` in the band vocabulary, not the terminal union. That wording makes a three-axis decision look like one ordered axis. It also reports 324 added `expect` lines without specifying the predicate; the symmetric predicate that reproduces 8 removals produces 328 additions.

### 6. Process upgrade

For policy-to-code mappings, write a typed tuple before reviewing the branch: `{ verdictLabel, terminal, confidenceBand, bandCeiling, conditionMarks, basis }`. Require the decision maker to fill each field or explicitly preserve it. For empty-set logic, add a reachability row for zero, one and two segments before accepting an `every`-based classification. Re-pin review should compare fixture cardinality as well as expected values.

### 7. Prediction calibration

The likely follow-up failure is a patch made only at `basisIsEmpty`, which cannot help because the one-segment throw occurs earlier. The first counterexample should therefore remain a one-segment `LOOKED_UP` candidate with three failed citation-tracing rounds. I also expect a reviewer to call null/null a “floor” because it is safe; the discriminating evidence is V's explicit preference for a consumer-visible value over absence.

## T9B review 3 — the value was right while its explanation was wrong

### 1. Cost

The expensive part was separating three nearby claims that looked equivalent: the returned confidence-band value, the `BandCeilingDecision.kind` invariant, and the ceiling record's label/lift metadata. The first two are correct. Following the third back into the actual register row exposed that the new floor band is paired with the row's `FULL` default and `retain-band` lift path.

### 2. What I nearly got wrong

I nearly treated “row provenance is present” as equivalent to “the row decision is faithfully represented.” It is not: provenance can accurately identify the source row while the selected label and lift path describe a different member of that row.

I also nearly rejected F1M6 because the mutated code throws a `TypeError`. Reading the assertion changed that conclusion: the regression owns a typed `COMPOSITION_CONTRACT_ERROR`, so receiving an untyped downstream crash is exactly how the assertion demonstrates the explicit precondition matters.

### 3. Evidence boundary

I re-derived the campaign form statically and read every failure frame for credit. I did not run tests, builds, installs, or providers. The RED log records the final matcher semantics but does not hash its dirty test file, so exact RED-oracle byte identity remains CANNOT-ASSESS rather than being inferred from matching line numbers.

### 4. Process upgrade

When a function returns both a value and a provenance-bearing decision record, mutation review should pin the tuple, not only the value. For register-driven decisions, add a cross-field matrix: selected label, selected band, applied/not-applied kind, and lift path. A source row's presence is not enough if one field is ignored.

### 5. Prediction calibration

The prior review predicted that a narrow empty-basis patch could miss the one-segment form throw; the new branch and F1M5 close that prediction. It did not predict that creating a non-null floor would force a truthful ceiling record, which is the remaining defect.

## PREDICTIONS

- A value-only test will stay green while a ceiling label or lift path tells a contradictory story; tuple-level assertions are needed.
- If the empty-basis decision is made explicit in the register, the validation asymmetry and misleading lift path can be fixed together rather than patched independently.

## T9B review 4 — product closed, record did not

### 1. Cost

The product decision was cheap to verify once separated into band membership, selected-entry identity, and causal reason. The expensive part was the record sweep: the prior review had named exact stale comments, the current filing claimed them swept, and the raw evidence set silently dropped a historical transcript while keeping the historical credit in the cumulative report.

### 2. What I nearly got wrong

I nearly demanded a second `bandOrder.includes` guard because the ordinary branch has one. Writing the predicate algebra made the difference clear: the floor entry is found only by equality to `bandOrder[0]`, so the selected band is already a member; the actual disagreement is absence of any matching entry, and that has its own refusal.

I also nearly accepted “the acceptance harness never sets false” as proof that production cannot reach the route. The acceptance source authors no false fixture, but the live runner parses `citation_tracing` from provider output as an unconstrained boolean. Static absence in the harness is not runtime unreachability.

### 3. Evidence boundary

I read every current mutant's literal OLD/NEW pair and assertion failure, re-derived the twelve-record campaign with the static index, matched every transcript's source hash to the filed serve source, and verified the two neighbours survive. I did not run tests, builds, installs, providers, or mutating git. The final suite statements are attributed to retained records.

F1M3 is a useful distinction: it is correctly absent from the live campaign because its target no longer exists, but its raw historical transcript should have been renamed as superseded rather than destroyed. The launch capture appears sufficient to recover it; byte identity of the deleted standalone file is CANNOT-ASSESS.

### 4. Process upgrade

Treat campaign membership and evidence retention as different axes. When a mutant becomes obsolete, remove it from the live manifest and prefix, but archive the raw transcript with its original tip and an explicit superseded marker. For narrative sweeps, rerun the exact stale phrases from the previous review rather than searching only for the newest mechanism's vocabulary.

### 5. Prediction calibration

The prior review predicted a tuple-level record pin; F1M7 shows that correction works exactly. It did not predict that the cleanup would delete the earlier evidence or leave the previously cited comments unchanged. The next pass should therefore be a bounded record correction, not another product mechanism.

## PREDICTIONS

- A tautological membership check would add ceremony without catching an inconsistent selected entry; the missing-entry refusal is the discriminating guard.
- A live evaluator can still produce `citation_tracing: false` even when no acceptance fixture spells it, so deferral must rest on ownership and explicit residue, not asserted unreachability.
- Archiving F1M3 outside the current glob will preserve the earlier campaign without contaminating the current `10 killed / 2 survived` derivation.

## T9B merge review — the absence proof

### 1. Cost

The expensive question was not whether the repaired guard line looked right. It was whether
some other lane deletion had disappeared without leaving a visible representative in the
merge diff. The useful reduction was path ownership: 21 lane-only blobs could be proved by
identity, 21 integration-only blobs could be proved by identity, leaving one shared runner
file. Classifying every addition to that file then reduced the whole absence problem to
30 incoming lines, one bad reinstatement, and seven repair comments.

### 2. What I nearly got wrong

I nearly repeated the seat's counting failure in a different form. A raw repository search
finds `protectedCoreVerified` in historical comments even though the executable identifier is
gone. The meaningful count was runner-scoped executable text, paired with a patch-set
classification. Naming the scope turns 0 into a reproducible claim instead of an ambiguous
grep result. The same distinction applies to the two `restatementStatus === "PASS"` literals:
one is the disclosure ternary and the other is an explanatory comment, not a second ternary.

I also initially checked the full T9 range for deleted test declarations and found the legacy
gate blocks the frozen task deliberately retired. The supplied zero claim is true only for
the T9B range `9a3a5f60..b0591d9b`. Keeping those ranges separate prevented an accurate but
irrelevant count from becoming a merge finding.

### 3. Evidence boundary

The merge semantics are statically closed: the refusal occurs before the prospective call is
recorded, `pendingModelAttempts=1` changes only the refused-next-attempt question, and the
restatement status is disclosed after HARD_STOP rather than used as a terminal predicate. All
incoming test/acceptance blobs remain byte-identical and all ten raw mutant frames name an
assertion that observes the mutated property.

I did not execute tests, builds, installs, a compiler, a database, providers, or mutating Git.
Fresh runtime behavior is therefore CANNOT-ASSESS; I verified the retained three-run records,
their exact counts, commit/tree stamps, clean-state fields, and the causal mutant frames.

### 4. Process upgrade

For every merge conflict, print both parent diffs against the merge-base before resolving.
For deletion preservation, do not begin with substring search. First partition paths into
mine-only, theirs-only, and overlap; prove the first two by blob identity; then classify every
addition in each overlap as mine, theirs, resolution, or unexplained. An unexplained addition
is the exact signature of a possible reinstatement.

### 5. Prediction calibration

The previous review predicted that the current campaign would remain clean after archiving the
obsolete transcript, and it does. It did not predict that the next defect would be in the
merge rather than the product. The better forward prediction is procedural: deletion-bearing
conflicts will recur unless the merge reviewer explicitly reconstructs absence from the
merge-base.

## PREDICTIONS

- A line-substring lens may still claim several reinstatements; a blob/patch classifier will
  find exactly the repaired restatement conjunct and nothing else.
- The next realistic regression is another merge restoring an old quality predicate while
  preserving the incoming code around it. Parent-relative diffs are the cheapest detector.
- A credit-focused lens should agree on all ten mutants because every kill has a direct owned
  assertion frame; the two neighbours should remain the campaign's required survivors.
