CODEX REVIEW TOOL-STAMP-CHECK r3 — CHANGES · comments read through: tool-stamp-check-r3-2026-09-07
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging.

The staged set is not ready to replace the live tools. All 22 preserved cases match EXPECTED.md in three independent runs, and fresh emitter runs verify the newline repair and restoration after target deletion. However, a normal nested transcript from another checkout makes a correctly stamped outer gate report STALE. Static inspection also finds incomplete framing/schema checks and an unsupported nonce-secrecy claim. Four blocking findings and two nonblocking findings follow; route them under F-TOOL-MUTATE-3 and its fixture work.

The reviewer packet was read in full first. File references beginning `tools/`, `logs/`, `packets/`, or `board/` are relative to the mission directory named in that packet. Its explicit reviewer assignment and two-file output contract govern this review. The required comment cursor above comes from the packet; the 20-line ticket has no appended comment thread and retains older version/status commentary. This session authored neither reviewed implementation nor preserved fixture. Author session identity beyond the ticket's `claude/orchestrator` entry is not independently established.

Reviewed SHA-256 values:

| Staged file | SHA-256 |
|---|---|
| gate-run.sh | a0f142f343a839ff823b1ad617da71f81d160ef248a4c72e4e403f4b3f98fae4 |
| mutate.sh | 94762e4de77c38156da0fbede2cc4c997210eee275c97fb07cea207a0ada70f5 |
| stamp-check.sh | e628cc511502f68ed10351078bef9409564d1e5e1f979bcaf734dceada2dea79 |

## Independent verification

Scratch evidence: `/private/tmp/st4-r3-review-ag3g8ruo`. The fixture comparator used its literal `recs/` directory prefix, including the trailing slash, and `GIT_OPTIONAL_LOCKS=0`. Each case was additionally checked individually three times. `fixture-results.json` contains the 66 per-file observations, and `fixture-checks/` contains stdout/stderr. Each population run exited 1 and printed:

```text
records compared: 22 · failures: 10 · legacy-framed: 6
```

| Preserved case | Observed in each of three runs | Matches expectation |
|---|---|---|
| 01 | OK | Yes |
| 02 | OK | Yes |
| 03 | OK; nonzero command exit is legitimate | Yes |
| 04 | OK | Yes |
| 05 | OK; see N1 about the coverage claim | Yes |
| 06 | OK | Yes |
| 07 | OK | Yes |
| 08 | OK | Yes |
| 09 | APPARATUS-FAIL | Yes |
| 10 | OK | Yes |
| 11 | STALE | Yes |
| 12 | INCOMPLETE | Yes |
| 13 | FIELD-MISMATCH | Yes |
| 14 | FIELD-MISMATCH | Yes |
| 15 | INCOMPLETE | Yes |
| 16 | UNCLEAN | Yes |
| 20-legacy-02 | OK, legacy | Yes |
| 20-legacy-03 | INCOMPLETE, legacy | Yes |
| 20-legacy-05 | OK, legacy | Yes |
| 20-legacy-06 | AMBIGUOUS, legacy | Yes |
| 20-legacy-07 | NO-STAMP, legacy | Yes |
| 27 | OK, legacy | Yes |

The scratch repos are filesystem copies of the supplied throwaway fixture, not worktrees of the mission. Only the second scratch copy was checked out at its previous commit for the nested-checkout comparison. Commands used the unchanged staged emitters; raw records were not edited. New output files and temporary files were outside both scratch checkouts.

| Fresh emitter exercise | Three-run result |
|---|---|
| Gate with newline, without newline, or empty output | Emitter 0; comparator 0; output bytes/separation checked |
| Gate running `false` | Emitter 1; comparator 0 |
| Mutate with no final output newline | Emitter 0; comparator 0; target bytes restored |
| Mutate whose command deletes the mutated scratch target | Emitter 0; comparator 0; target bytes restored |
| Outer gate displaying a real inner transcript from the same checkout | Both emitters 0; comparator 0; this alone does not prove outer selection |
| Outer gate displaying a real inner transcript from the previous checkout | Both emitters 0; comparator incorrectly STALE/1 |
| Mutate with declared multiplicity 3 but actual multiplicity 1 | Emitter 8; comparator APPARATUS-FAIL/1; target restored; one emitter temp file left per run |

For the deletion exercise, the child verified the changed token before removing only `dialectical-engine/target.ts` in the scratch checkout. The emitter restored it to the original SHA-256 `9aeef4e6a48dd8b0b2f03edf8cf5d45f7f2ed134f6bc8629a9b4e8f40324e464`, and an independent byte comparison and Git porcelain check confirmed restoration. This tests normal completion after deletion, not signal handling or a failed Git restore.

`check_emitters.py`, `emitter-results.json`, and `emitter-checks/` preserve the fresh-run checks. `payload-byte-counts.json` confirms 12 OLD/TOKEN lengths in the six normal mutant records; these correct emitted lengths do not establish comparator enforcement. `nonce-sample.json` contains 30 distinct nonces across the initial 30 emitter invocations, including inner gates. This is a sample, not a uniqueness guarantee. `bash -n` passed for all three staged scripts. STRENGTH: entailed by fresh command results and independent byte/state checks.

## Findings

**B1 — P2, blocking: header selection occurs before output/payload framing.**

File/line: `tools/staging/stamp-check.sh:32`, `:38`, `:89`.

Input → wrong outcome: a completed outer gate at fixture HEAD `9b2ff4edf57b2a1f073ddd5412111f624fbab1dc` displays, as ordinary diagnostics, the completed record of an inner gate at `f360fb6f27457b4967d505285a53027da5a5c9cf`. Both emitters succeed, both checkouts remain clean, and the outer record has its own completion. The comparator nevertheless reports the inner commit as STALE in all three runs. The output in `emitter-checks/nested-other-checkout.run1.check.out` includes:

```text
STALE    /private/tmp/st4-r3-review-ag3g8ruo/emitter-checks/nested-other-checkout.run1.log -> f360fb6f27457b4967d505285a53027da5a5c9cf
records compared: 1 · failures: 1 · legacy-framed: 0
```

Line 32 searches the entire file and chooses the last header without knowing whether it is inside output. Only afterward does line 38 start framing, relative to the already-selected inner nonce. The same-checkout control passes because the two identities coincide. Nonces on completion lines cannot repair selecting the wrong record in the first place.

Required fix: determine top-level records while respecting opaque payload/output boundaries, then select the newest top-level attempt and validate that attempt's own completion. Preserve appended-record selection. A later malformed or partial top-level attempt must be rejected without falling back to an older complete record. Add genuine nested-transcript coverage with distinct inner/outer identities so the selected identity is observable.

STRENGTH: entailed by three fresh paired normal-execution checks and the parser's operation order. No deliberately forged accepting transcript was constructed.

**B2 — P2, blocking: the advertised framing contract is not validated.**

File/line: `tools/staging/stamp-check.sh:38`, `:39`, `:40`, `:41`, `:42`; `tools/staging/mutate.sh:47`, `:48`.

Input → wrong outcome: records with missing or inconsistent payload-length metadata receive no length validation. The parser recognizes an OLD/TOKEN opener by its prefix and ignores the remaining text, including `bytes=`. It also has no final state check or required-span inventory. Consequently its predicate establishes neither that the declared payload was consumed nor that all required spans were present and closed. A delimiter-shaped line equal to the active same-nonce closer is interpreted as a boundary, irrespective of the declared payload length. This is a source-level finding; acceptance of deliberately corrupted records was not exercised here.

Required fix: parse required spans with an explicit state/length contract, validate exact byte counts, reject missing/malformed/unclosed spans, and keep payload bytes opaque. Account for the emitter's one framing newline after each OLD/TOKEN literal; it is additional to the advertised literal byte count. Apply an equally unambiguous contract to OUTPUT. Do not treat the three independent booleans as proof of a well-formed record.

STRENGTH: entailed for absent validation and current delimiter interpretation by complete source inspection; runtime results for crafted malformed transcripts are undetermined in this review.

**B3 — P2, blocking: RESULT field extraction is not a complete success-schema check.**

File/line: `tools/staging/stamp-check.sh:45`, `:48`, `:52`, `:53`, `:57`, `:68`.

Input → wrong outcome: an absent `declared` field is treated as `any` at line 57, although every successful v4 emitter summary carries a declaration. The code does not independently require the successful RESULT prefix: line 52 attempts to remove it with `sed`, which also succeeds when that prefix is absent. The following unanchored field searches are therefore not a validation of the full result grammar. Field-like substrings are extracted without checking token boundaries or complete consumption. The gate's clean-state check similarly checks a prefix, rather than an exact status token.

Required fix: parse an anchored success/failure grammar first; require the seven success fields exactly once, including an explicit `declared`; validate complete field tokens and exit-status ranges; then check their relationships. Keep a nonzero command exit legitimate and preserve early RESULT FAIL as APPARATUS-FAIL. Reject malformed completion syntax explicitly instead of allowing substring extraction to stand in for parsing.

The comparator also does not reconcile the summary with the earlier GATE counts, SHA lines, or porcelain text. Its current demonstrated guarantee is consistency among selected summary fields and EXIT, not independent restoration verification. If those repeated fields remain normative parts of the record, their disagreement should be rejected as part of the same schema check.

STRENGTH: entailed for the missing checks/default and source control flow. Supplied mismatch/order fixtures were executed three times; no additional accepting malformed summary was built or run.

**B4 — P2, blocking against the stated guarantee: a per-run nonce is not a secret from the measured command.**

File/line: `packets/tool-stamp-check-codex-r3.md:12`; `tools/staging/gate-run.sh:3`, `:33`, `:80`, `:81`; `tools/staging/mutate.sh:45`, `:57`, `:70`; `tools/staging/stamp-check.sh:15`.

Input → wrong outcome: the packet treats a command running under the emitter's user identity as unable to know the enclosing nonce. Both emitters write that nonce to the transcript before executing the command, and neither establishes a separate filesystem-access boundary for the child. Keeping NONCE out of the child's exported environment does not establish confidentiality of an already-written header. The asserted impossibility is unsupported by the implementation.

Required fix: state the trust model accurately. Use nonce framing to reduce accidental collisions, not as authentication or as the justification for ignoring hostile output. Make the structural parser correct even when delimiter values are known. If protection against a hostile child that can access the transcript is required, use protected metadata custody/access isolation; same-user writable logs cannot establish that property alone. Retain the identity-only/freshness qualification.

STRENGTH: entailed for publication order and lack of isolation in these scripts; actual hostile-child manipulation and any passing forgery are unverified. This finding supplies defensive analysis, not a working bypass.

**N1 — P3, nonblocking coverage/documentation finding: case 05 does not contain nested emitter output.**

File/line: `logs/tooling/st4-fixture/EXPECTED.md:6`; `logs/tooling/st4-fixture/recs/05-gate-nested-real-gate.log:11`, `:13`; `packets/tool-stamp-check-codex-r3.md:17`.

Input → wrong outcome: case 05 invokes an actual inner gate, but that gate writes its record to the separate `inner.log`. The outer OUTPUT contains only its path and `exit=0 clean=yes`. There is one record header in case 05, not two. Its expected OK result is correct, but labelling it as nested-header/fence coverage overstates what was tested and misses B1.

Required fix: preserve case 05, correct its description, and add a fixture whose OUTPUT actually contains the inner transcript. Use distinct identities, as well as a same-identity control. The latter alone can agree for the wrong reason.

STRENGTH: entailed by the full preserved record and the fresh paired checks.

**N2 — P3, nonblocking: new command-output temp files leak on early mutant failure.**

File/line: `tools/staging/mutate.sh:37`, `:42`, `:56`, `:59`.

Input → wrong outcome: declared multiplicity 3 with one actual replacement exits 8 and restores the target correctly, but leaves the `mutate.*` file created before that gate. Cleanup only occurs after the command path. Three isolated repetitions each left one zero-byte emitter temp file. `early-exit-results.json` records the paths and correct APPARATUS-FAIL verdicts.

Required fix: include idempotent temp-file cleanup in the exit/signal cleanup path, guarding initialization and preserving target restoration and the original exit status. Retain the early-failure restoration control.

STRENGTH: entailed by three completed measurements and cleanup control flow. An earlier harness assertion accidentally counted macOS's `xcrun_db` alongside the emitter temp file; that harness error is preserved and excluded from the three completed measurements, as explained in the self-report.

## Requested answers and prior-findings disposition

1. **Fixture:** every supplied case matches its stated verdict, three times. Fresh generation verifies both emitters' newline handling and normal target restoration after deletion. A working forgery was not constructed. The nonce-access premise is assessed statically in B4; identity-only checking is not transcript authentication.
2. **Fences:** for a correctly selected outer nonce, a different-nonce closer does not match the awk rules. A closer of another type clears only its own flag and does not release the active type's flag. That limited repair is present. Actual nested records still fail outer selection (B1), and framing is not fully validated (B2). A same-nonce OLD closer occurring literally in OLD is indistinguishable to this parser from its terminator. OLD is supplied before the fresh random nonce is generated, so callers ordinarily cannot preselect such a collision. Each rerun draws a new 72-bit value; the emitter has no intentional reuse path or uniqueness registry. The fixture's two appended records have different nonces, as do the 30 independently sampled invocations. Repetition is therefore not guaranteed to reuse a nonce, nor is collision mathematically impossible.
3. **B3/B4:** r2 B3 is closed for the tested normal output paths. r2 B4 is improved: pre mismatch, command-exit mismatch, reversed completion order, apparatus failure, and changed clean-state all reject as expected. It remains open because success grammar/declaration enforcement is incomplete (B3 above). Emitted OLD/TOKEN byte counts matched the freshly generated payloads, but the comparator does not check them. r2 B1/B2 remain open for outer identity/framing; random nonce tagging alone is insufficient.
4. **Legacy:** keeping v3.2 rules and a legacy count is acceptable for the stated identity-only compatibility contract. The six legacy fixtures behave accordingly. **No historical mission record is ordered to be retaken by this review:** no specific historical acceptance record was established unsound here. This does not certify historical freshness or make legacy framing unambiguous. r2 N1 is closed: successful stdout now explicitly says `identity only; not proof of fresh execution`. r2 N2's named descriptions are corrected in the new expectation file; case 10 contains two complete blocks and case 15 really reverses RESULT/EXIT. N1 above is a separate new coverage defect.
5. **Custody:** D64 ADDENDUM 7 at `DECISIONS.md:3541` is the right custody rule: stage and review the matched emitter/comparator set, preserve the previous versions and evidence, and switch only when no seat is mid-round. This CHANGES verdict does not authorize the swap. No running-seat inventory or swap was performed. The ticket currently records `rework_round: 2`; review label r3 alone is not authority to open a fourth implementation round. The custodian must apply the existing cap when routing the next step.

STRENGTH: entailed for the cited source behavior and measured results; acceptance/custody recommendations are reviewer judgment consistent with the packet and D64 ADDENDUM 7.

## Not verified

No working forgery, hostile nonce-read/metadata-manipulation command, or exploit reproduction was built or run; the requested bypass construction is outside this review's safety limits. Static findings B2–B4 are distinguished from the benign runtime evidence. I did not test signals, forced nonce reuse/collision, failed restore commands, disk-full/temp-creation failure, cross-platform behavior, arbitrary binary output, or the entirety of the legacy historical corpus. No package install, network action, lane suite/typecheck, or full security scan was performed.

No author session transcript or verifiable skills-load receipt was supplied, so author process compliance is undetermined. General spine and TOOLING-TRAPS reads were scoped to reviewer-relevant guidance after oversized output truncation; their full bodies are not claimed as audited. No independent evidence of original fixture generation beyond its saved records was obtained. These limitations do not weaken the freshly regenerated nested-record failure.

Only the two requested mission report files and permitted scratch artifacts were written. No reviewed source, board, DECISIONS, or mission Git mutation occurred. The 64 captured protected files, including live/staged tools, packet, ticket, decisions, prior verdict, self-test and preserved fixture files, matched their initial SHA-256 values at final verification. Scratch Git operations and target deletion/restoration were confined to copies under `/private/tmp/st4-r3-review-ag3g8ruo`.

REVIEW: changes — preserve the newline and restoration repairs, but correct outer-record selection, enforce framing and completion grammar, and remove the unsupported nonce-secrecy guarantee before the staged set is swapped.
