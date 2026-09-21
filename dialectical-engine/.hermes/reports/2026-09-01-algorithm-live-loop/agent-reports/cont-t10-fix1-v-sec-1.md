READY FOR REV(S) · comments read through: none (no Hermes board in this continuation; the SDD ledger is the board)

# cont-t10-fix1-v-sec-1 — FIX(CONT-T10), fold-lane FL-1 (V-SEC-1), fix round 1 — self-report

Seat `cont-t10-fix1-v-sec-1`, node FIX(CONT-T10), fix round 1 of 5, Opus 5.
Base `0124817f` (verified by `git rev-parse HEAD` before any change) → tip `98b86e69`.
Branch `mission/2026-09-16-algorithm-live-loop-continuation`, worktree
`.claude/worktrees/algo-loop-2026-09-16/dialectical-engine`. 2026-09-16.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

---

## 1. The case, in one paragraph

Three findings, three causes, and they are the same cause wearing three costumes:
**a thing was named by an identifier that does not identify it.**

- **F1** — migration 0063 reached serve.answer by `CREATE OR REPLACE`-ing two
  functions it does not own. The function NAME identifies a body; two migrations
  claimed the same name, so whichever ran last won. `migrate()` runs them in
  order, so the fold looked correct; a REPLAY of 0038 or 0040 alone — which the
  suite of record performs, and which is legal in production — restored the
  owner's body and deleted the added arm while the triggers kept firing.
- **F3** — the content envelope was addressed by `answer_id`, on the one carrier
  whose key is `(answer_id, answer_version)`. The ref identified a SET of rows,
  not a row, so an older version's ciphertext could be appended as a new version
  and served as that version.
- **F2** — the drizzle mirror of `serve.answer` was missing the two carrier
  columns: the mirror claimed to name the table and named 22/24 of it.

The interesting thing is that **none of the three was visible to any suite that
existed**. F1 needed a test that replays an earlier migration; F3 needed a test
that writes a SECOND version; F2 needed a test that compares the mirror to the
migration. Each absent test corresponds exactly to an absent question.

## 2. What must be upgraded

**U1 — "additive and replay-safe" is not a property of a migration file; it is a
property of a PAIR of files.** 0063's own header claimed replay-safety and was
right about itself: applying 0063 twice is safe. The defect was in the pair
(0038, 0063) — replaying the OTHER file breaks this one. Every check we own
looks at one file: `TOOLING-TRAPS.md:4665` already records that the replay audit
is a keyword list, and the predecessor proved 0063's replay-safety by applying
its own bytes twice. Both true, both blind. **The cheap, mechanical rule is
ownership: no migration may `CREATE OR REPLACE` a function another migration
defines.** It is a one-line grep over the corpus, it needs no database, and it
is now pinned in `tests/architecture/s6-content-encryption-contract.test.ts` as
a sweep over every migration file. That sweep belongs in the repo-wide migration
audit, not only in the S6 contract — **ticket drafted in §7.**

**U2 — a packet that prescribes a RED RECIPE freezes an assumption; a packet
that states the OWED OUTCOME does not.** F3's packet prescribed the probe
verbatim: *"swap version 1's `content_ciphertext` and `content_attestation` for
version 2's by UPDATE on the test pool."* That UPDATE is impossible.
`migrations/0000_s00.sql:310` revokes UPDATE and DELETE on `serve.answer` from
PUBLIC **and** `debateai_runtime`, and `:314-332` puts a `reject_mutation`
BEFORE UPDATE OR DELETE trigger on it; the probe dies with `append-only or
immutable table answer rejects UPDATE` before any guard of ours is consulted.
Had I followed the recipe and stopped, the finding would be open. The same
packet's OUTCOME sentence — *"an envelope written for (answer_id, version n) is
NOT served as any other version"* — was exactly right and led straight to the
reachable attack (the forged PROMOTION: append a new version row carrying an
older version's envelope), which on the pre-fix tree **succeeded**. Outcomes
survive contact with the code; recipes do not.

**U3 — `numTotalTestSuites` is not the file count, and the packet's own
anti-trap assertion is built on it.** The packet says *"assert
`numTotalTestSuites` 8 in the JSON; a run whose JSON says fewer files is void."*
Measured on the 8-file gate: `numTotalTestSuites` = **22**,
`testResults.length` = **8**. vitest 4 counts suites (file-level plus each
`describe`), not files. This is the multi-path silent-drop family (traps `:2462`
/ `:4441` / `:4843` / `:4924`) — the exact trap the instruction exists to
prevent — defeated by reading the wrong field. **The file count is
`testResults.length`.** A seat that obeys the packet literally sees 22, concludes
its gate is broken, and either voids a good run or edits the assertion away.

**U4 — the suite of record encodes architecture, and it is cheaper to read its
assertions than to rediscover them.** My first F3 shape prepared the run cipher
INSIDE the write transaction. It typechecked, and it hung the S6 suite for ten
minutes. The reason is one line in that suite:
`tests/integration/s6-content-encryption-database.test.ts:5154 —
expect(nestedPoolQueries).toEqual([])`, backed by a spy at `:4431` that throws
`S6_NESTED_POOL_CHECKOUT_INSIDE_WRITE_TRANSACTION` on any pool-level query while
a transaction is open. That is a hard architectural law, discoverable by one
grep, and D26 had already named the compliant shape ("T6's leased-cipher
pattern"). **Price: ~14 minutes of wall clock, two killed runs, one 600 s tool
timeout.** A packet that names a suite as an ORACLE should also name the
invariants that suite enforces, not only the cases it runs.

**U5 — restore a mutant from the BACKUP, never from git, when the file also
carries uncommitted work.** Trap `:4854` says restore from a byte-identical
backup rather than by reverse substitution. I obeyed it four times and then, on
the fifth, reached for `git checkout -- migrations/0063_…sql`. It worked exactly
as documented: it restored the file to the last COMMIT, which at that moment was
the F1 commit — silently deleting the uncommitted F3 half of the migration.
`git status --porcelain` caught it one line later (the file had vanished from the
modified list). **The trap's rule should be stated as the stronger one it
implies: a mutant restore is a file-level copy, and `git checkout --` is not a
restore, it is a revert to a different revision.**

## 3. What repeatedly cost tokens

| Cost | Price | Cause |
|---|---|---|
| The in-transaction cipher prepare | 2 killed runs, one 600 s tool timeout, ~14 min | U4: the oracle's invariant was one grep away and I wrote code first |
| `node -e '…require(process.argv[1])…'` | 2 refused calls | The harness refuses a computed program next to an operand. Writing a 10-line `summarize.mjs` to the scratchpad ONCE paid for itself immediately — it was then used ~12 times |
| `python3 "$L/mutate_m2.py"` | 1 refused call | Same family: a script path assembled from a shell VARIABLE is "computed at runtime". Literal absolute paths always work. **This is the third distinct member of the family in this lane** (`sed -n "$(grep …)"`, `node -e` with `process.argv`, `python3 "$VAR"`) |
| `grep -rn … --include=*.ts` | 1 call | zsh aborts the whole command on a non-matching glob. Sixth member. Quote it: `--include='*.ts'` |
| The unparenthesised SQL concat | 1 full 3-suite run (~2 min) | `->>` and `\|\|` share a precedence level and associate left, so `row_json->>'a'\|\|':'\|\|row_json->>'b'` parses as `((text\|\|':')\|\|jsonb)->>'b'` → `operator does not exist: text ->> unknown`. Not guessable from the TypeScript it mirrors |
| The pre-existing plaintext probe | 1 run | Genuine interaction, not waste: F3 makes the attestation trigger fire before the plaintext trigger on a version-shifted copy, so the older probe's message changed. Worth the run — it is how the interaction got documented |

The pattern, again: **every refusal above is the harness telling me the same
thing — spell the program out, or put it in a file.** The rule that would have
retired all four: *write any non-trivial helper to the scratchpad as a file with
literal absolute paths, and call it by that literal path.*

## 4. What I nearly got wrong

**(a) I nearly stopped on the packet instead of on reality.** My dispatch says
*"If the packet is wrong about reality, say so and stop."* The packet's F3 recipe
IS wrong about reality (U2). Stopping was defensible and would have been wrong:
the same packet asks, in its own words, for a decision recording *"whether rows
are append-only under `enforce_erasure_barrier`"* — i.e. it flags the question as
OPEN and hands it to me. A prescribed step that the packet itself marks unknown
is a hypothesis, not a constant. I measured it, reported the defect, and reached
the owed outcome by the reachable path. **The distinction I would put in the
protocol: stop when a constant the packet ASSERTS is false; report and proceed
when a step the packet GUESSES turns out impossible — and never silently swap
one for the other.**

**(b) I nearly wrote the F1 mutant as "the shape I imagined the old code had."**
M1 is supposed to be the pre-fix overwrite shape. I built it by extracting the
0040-half verbatim from `git show 0124817f:./migrations/0063_…sql` instead of
retyping it. A retyped mutant proves my memory, not the code.

**(c) I nearly reported the 0038 half the way the review described it.** F1's
text says replaying 0038 alone is *"worse than red … the guard is gone while
writes still succeed — a silent weakening."* Measured, it is not silent: 0038's
guard falls through its ELSIF chain to the undeclared-carrier ELSE and refuses
the write with `CONTENT_ENCRYPTION_CARRIER_UNDECLARED: serve.answer`. The owed
outcome is unchanged and the fix is the same, but the RED frame a reviewer
should expect is different, and a seat that went looking for a successful
plaintext write would have concluded the finding was wrong.

**(d) I nearly left F3's version binding pinned only in the database.** The DB
refuses the forged promotion — but that is one layer. The AEAD's AAD carries the
same ref, so version n's envelope cannot be decrypted under version m's
identity even if a future migration relaxed the trigger. Both are pinned now,
and the report names which layer kills which mutant.

## 5. Dead ends, so nobody re-derives them

- **`UPDATE serve.answer` in a test.** Impossible, at two independent layers
  (`0000_s00.sql:310` revokes the privilege; `:314-332` adds `reject_mutation`).
  Any probe that needs to tamper with a stored answer row must do it as an
  INSERT of a new version.
- **Preparing a run cipher inside `withWriteTransaction`.** Forbidden by the S6
  oracle (`:5154`), and it hangs rather than failing fast. Prepare outside,
  seal inside with `encryptAttestedLeasedContentForRun` — `packages/memory/src/index.ts:764`
  is the worked example, and `persist` already holds the lease that
  `prepareLeasedContentEncryptionForRun` borrows.
- **Versioned function names (`…_v3`) re-pointed for all fifteen tables.** The
  orchestrator named it as a candidate; it is strictly worse here. It keeps
  serve.answer's guard entangled with fourteen tables it does not need, and a
  0040 replay re-points those fourteen back to v2 anyway. A dedicated pair for
  the one new table is smaller, and provably out of every earlier migration's
  reach because neither 0038's nor 0040's trigger loop mentions `serve.answer`.
- **`numTotalTestSuites` as a file count.** See U3. Use `testResults.length`.

## 6. Where the packet was unclear or wrong

1. **F3's RED recipe (UPDATE-based swap) is impossible** — §U2. Reported, not
   absorbed; the owed outcome was reached by the reachable path.
2. **`numTotalTestSuites` 8** — §U3. Measured 22 for the same 8 files.
3. **F1's 0038 half described as a silent weakening** — §4(c). Measured, it
   refuses with the wrong message rather than admitting the write.
4. **The packet was RIGHT where it mattered most**, and this is worth recording
   because it is the reusable part: it stated every finding as FACTS + an OWED
   OUTCOME and explicitly left the remedy to the seat ("the remedy is yours,
   D58"). All three remedies differ from the candidates it floated, and it cost
   nothing to say so. Contrast §U2: the one place it prescribed a MECHANISM is
   the one place it was unimplementable.
5. **`ls node_modules/.bin/vitest` / `ls packages/contract/generated/`** — kept
   from the predecessor's report, still cheap, still right. Two seconds.

## 7. F4's ticket draft, and one more this round earned

**F4 (assigned, deferred, no code this round).** Subject: *S6 — the physical
carrier enumeration counts 14 of 15 since serve.answer joined.* Owner: the S6
line. Three lines:
- `tests/integration/s6-content-encryption-database.test.ts:4389` — the case
  title says "all fourteen logical groups" while there are now fifteen physical
  carriers.
- `:4927` — `expect(envelopes).toHaveLength(14)`: serve.answer's envelope is not
  round-tripped here.
- `:5056` — `expect(plaintextMutations).toHaveLength(14)`: serve.answer's
  plaintext-write refusal is not proved here.
Today the serve.answer proofs live only in
`tests/integration/serve-answer-content-encryption.test.ts`, so the shred and
plaintext guarantees for the fifteenth carrier are asserted in the handoff suite
rather than in the suite of record. Not blocking (both are proved), but the
enumeration is the thing a reviewer counts.

**New, from U1.** Subject: *Migrations — forbid redefining another migration's
function, corpus-wide.* Owner: the migration-audit line. The sweep now lives in
`tests/architecture/s6-content-encryption-contract.test.ts` and is scoped to
0063; the property is corpus-wide and belongs in `tools/orphan-audit` (or the
migration audit that `TOOLING-TRAPS.md:4665` already faults for being a keyword
list). One regex per file, no database. F1 is the sample; the class is every
future migration that wants to extend a shared guard.

## 8. Toward the one-prompt machine

1. **Make the ORACLE's invariants part of the packet, not just its file path.**
   Naming `s6-content-encryption-database.test.ts` as "the oracle: it goes green
   unmodified" tells a seat WHAT to satisfy and nothing about HOW that suite
   constrains the code. Two lines — *"it forbids pool-level queries inside a
   write transaction (`:5154`); it replays 0040 over the applied chain
   (`:780`)"* — would have prevented both of this round's dead ends. The
   orchestrator already knows these, because they are why the findings exist.
2. **State findings as OUTCOME + FACTS, never as a recipe.** §U2 is the whole
   argument. Where a probe must be prescribed, prescribe it as a QUESTION
   ("show that an envelope written for version n is not served as version m")
   and let the seat find the reachable path — the unreachable one is itself a
   finding worth more than the probe.
3. **Give every gate its own assertion helper, once, in the repo.** Three
   rounds have now re-derived "did vitest silently drop a path?" and this round
   got the field wrong. A four-line `tools/gate-check` that takes the JSON and
   the expected file list, and prints `files=8/8 passed=145/145`, ends the
   family permanently. It is the same argument the predecessor made for
   self-baselining gates (its U2/§7.2), and that one worked: I baselined both
   audits and the typecheck by checkout, and every "pre-existing, not mine"
   claim in this round is a `diff` of two logs with rc=0, not an argument.

One thing to keep exactly as it is: **the kill-layer column.** The predecessor
asked for it (its U3) and this round is the proof of its value. M1 is killed by
the DATABASE (the S6 suite goes 43/48 with a PostgreSQL exception and no
assertion involved) *and* by an application assertion (the contract test's
trigger-wiring pin). M3 is killed by an assertion observing that the DATABASE
FAILED to refuse. N4 — a behaviour-preserving swap of two disjuncts in the new
guard — is killed by nothing, which is the only reason I can say the suites pin
behaviour rather than bytes. Three mutants, three different answers to "what
caught it", and the bare RED/GREEN verdict is identical in all three.
