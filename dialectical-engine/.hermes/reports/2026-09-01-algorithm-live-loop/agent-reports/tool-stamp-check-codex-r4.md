CODEX REVIEW TOOL-STAMP-CHECK r4 — CHANGES · comments read through: tool-stamp-check-r4-2026-09-07
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging.

The staged set is not ready to replace tools/. The 27 preserved cases match EXPECTED.md in all three independent runs, and freshly regenerated cases 17/19 now select the correct outer identity. However, ordinary unfinished transcript excerpts inside a successful outer run still break framing. Some record-schema checks requested in r3 remain absent, and the emitter and comparator disagree on accepted numeric declarations. Two blocking findings and two nonblocking findings follow. This reviews implementation rework round 3 of 3: the next step is V's decision, not an automatic fourth rework.

The packet was read in full first. Relative references below start at its mission directory. This session authored neither the staged implementation nor the preserved fixture. The packet's explicit reviewer assignment and two-report output contract govern this review; the ticket identifies the author as claude/orchestrator. The supplied ticket has no appended comments and retains the older `comments_read_through` field; the required r4 cursor above comes from the packet. Author session identity and skills-load evidence beyond that ticket were not supplied.

Reviewed staged SHA-256 values:

| File | SHA-256 |
|---|---|
| gate-run.sh | e3921dd38da01213b30468bcdf1945db2581969ecbdf82c5cb27dd2705b2afc7 |
| mutate.sh | 05d324288938fbf703fe88120af06160d93bb507a81961a9d6a2bf375f5fc301 |
| stamp-check.sh | ba506193770ef092152d3430de5526a4b1eeaf0e4f7db358fbbf451ea98f4d36 |

## Independent evidence

Scratch evidence is under `/private/tmp/st4-r4-review-tf1h_9hn`. The scripts `check_fixture.py`, `check_emitters.py`, `nested_driver.py`, and `check_signals.py` preserve the checks. `fixture-results.json`, `emitter-results.json`, and `signal-results.json` preserve their results, with raw stdout/stderr and records in the corresponding subdirectories. Scratch repositories were filesystem copies of the fixture repository with independent `.git` directories; only scratch copies were checked out or committed. The original fixture was read-only, with `GIT_OPTIONAL_LOCKS=0` during comparisons.

Each population invocation used `bash tools/staging/stamp-check.sh <fixture/repo> <fixture/recs/>`, with absolute paths and the trailing slash. Each exited 1 and printed this expected summary:

```text
records compared: 27 · failures: 12 · legacy-framed: 6
```

Every file was also compared individually three times: **81/81 status matches**, not merely agreement on the aggregate failure count.

| Cases | Observed in each run |
|---|---|
| 01–08, 10, 17–19 | OK |
| 09 | APPARATUS-FAIL |
| 11 | STALE |
| 12, 15 | INCOMPLETE |
| 13, 14 | FIELD-MISMATCH |
| 16 | UNCLEAN |
| 20-legacy-02, 20-legacy-05, 27 | OK, legacy |
| 20-legacy-03 | INCOMPLETE, legacy |
| 20-legacy-06 | AMBIGUOUS, legacy |
| 20-legacy-07 | NO-STAMP, legacy |
| 30, 31 | MALFORMED |

Fresh checks produced 69 comparator observations: 63 outer emitter runs and six whole-record CRLF conversions. Each row below was exercised three times. Inner runs were additionally executed by the nested driver and their process results retained.

| Exercise | Emitter / comparator outcome in each run |
|---|---|
| Gate baseline; output without a final newline | 0 / OK |
| Gate command exit 255 | 255 / OK |
| Complete inner gate at OLD displayed by outer gate at HEAD (regenerated 17) | Both emitters 0 / OK |
| Complete inner gate at the same identity (18 control) | Both emitters 0 / OK |
| Complete inner mutate at OLD displayed by outer mutate at HEAD (regenerated 19) | Both emitters 0 / OK; both targets restored |
| Foreign-nonce closer; unmatched type closer; balanced foreign span in OUTPUT | 0 / OK |
| Unfinished inner gate excerpt ending at its OUTPUT opener | 0 / INCOMPLETE — wrong; B1 |
| Ordinary OUTPUT containing an unclosed foreign opener | 0 / INCOMPLETE — wrong; B1 |
| NEW literal containing an unclosed foreign TOKEN opener | 0 / INCOMPLETE — wrong; B1 |
| CRLF within command output | 0 / OK |
| Whole gate or mutate record converted from LF to CRLF | MALFORMED; emitter framing is LF |
| Mutate baseline; command exit 255 | 0 / OK |
| Mutate applied=1001, MUT_EXPECT=1001 | 0 / OK |
| MUT_EXPECT=01 / MUT_EXPECT=+1, applied=1 | 0 / FIELD-MISMATCH; 0 / MALFORMED — N1 |
| UTF-8 multiline OLD/NEW, including a terminal newline in each literal | 0 / OK; original target bytes restored |
| Declared multiplicity 3, actual 1 | 8 / APPARATUS-FAIL; target restored; no emitter temp file left |
| Command creates an untracked filename with spaces and brackets | 7 / APPARATUS-FAIL; target restored; dirty status correctly reported |

All 63 outer emitter runs restored the target's original bytes; the deliberate dirty-file case retained only its separately created untracked file until scratch cleanup. No emitter-named temp file remained after these runs. The 12 additional signal exercises sent SIGINT or SIGTERM to the emitter/child process group after the child signalled readiness. Gate runs terminated by the corresponding signal; mutate runs exited 130. All 12 left no emitter temp file and a clean scratch repository with the original target bytes. This verifies those signal timings, not every interruption window. `bash -n` passed for all three staged scripts.

STRENGTH: entailed by completed independent runs, per-file status comparisons, target-byte comparisons, and scratch Git state checks. The preserved fixture's original generation process was not independently witnessed.

## Findings

**B1 — P2, blocking: payload openers still control the enclosing record's boundaries.**

File/line: `tools/staging/stamp-check.sh:48`, `:54`, `:63`, `:70`; claimed guarantee at `:8`, `:20`, `tools/staging/gate-run.sh:7`, `tools/staging/mutate.sh:8`, and `packets/tool-stamp-check-codex-r4.md:12`, `:15`.

Input → wrong outcome: a successful outer gate at HEAD prints an ordinary excerpt from a genuinely generated inner gate at OLD. The excerpt ends at the inner OUTPUT opener. The outer emitter writes its own closing fence, EXIT, and unchanged CLEAN-STATE, but the comparator reports INCOMPLETE in all three runs. The outer transcript was not modified. `emitter-checks/nested-excerpt.run1.check.out:2` says:

```text
INCOMPLETE /private/tmp/st4-r4-review-tf1h_9hn/emitter-records/nested-excerpt.run1.log (a OUTPUT span of the block's nonce is never closed)
```

Cause: line 54 pushes every opener found inside payload. With an unfinished foreign span on top, the real outer closer does not match the stack top and is consumed as payload. The outer frame remains open. The same defect occurs with a fixed foreign opener in ordinary output, and inside a supported multiline NEW literal. Closing the foreign span gives the paired OK control. These cases require no knowledge of the outer nonce.

The requested same-type/same-nonce cases are also inconsistent with the claimed opacity, by source inspection. Line 54 has no different-nonce/type guard despite its comment. A repeated active opener adds another frame; one subsequent matching terminator leaves the outer frame open. In a fully balanced nested gate with identical nonces, both OUTPUT spans enter `mine` at line 63, so the required single-span inventory rejects it as MALFORMED. Nested same-nonce mutate spans similarly contaminate the outer inventory. These are static conclusions; a child that reads the outer nonce or constructs a same-nonce transcript was not run.

Required fix: make payload boundaries independent of payload contents. Consume OLD/TOKEN as raw, explicitly sized byte sequences; give OUTPUT an equally unambiguous boundary contract, such as a byte length derived from the already-spooled output. Validate the enclosing frame without treating nested payload delimiters as its structural children. Preserve the complete nested-transcript and appended-record controls, and add unfinished-excerpt and literal-opener coverage. The wording that known delimiters remain structurally correct must describe an established property.

STRENGTH: entailed for the three fresh failure/control pairs and source control flow. Same-nonce runtime behavior is not independently measured. This is a correctness failure in ordinary output, not a demonstrated authentication bypass.

**B2 — P2, blocking: framing and completion checks still do not establish the complete record grammar requested in r3.**

File/line: `tools/staging/stamp-check.sh:63`, `:71`, `:84`, `:85`, `:90`, `:95`, `:98`.

Input → wrong outcome: records with completion metadata placed before the required OUTPUT span are not distinguished by these checks from records whose completion follows it. The span inventory establishes only OLD/TOKEN/OUTPUT ordering; completion selection checks position after the header, then EXIT before CLEAN-STATE/RESULT. It never compares completion positions with the final required span's closing position. Extra top-level spans of another nonce are filtered out by `mine`, and completion selection takes the first matching line without requiring uniqueness.

Two r3 schema omissions also remain: CLEAN-STATE checks a string prefix rather than the exact status token, and exit fields accept any one-to-three-digit value without enforcing the shell status range 0–255. Thus the code's acceptance predicate is broader than the advertised emitted-record grammar. The anchored seven-field RESULT expression is a real repair, but does not close these surrounding checks. No deliberately malformed accepting record was constructed or executed for this finding.

Required fix: validate one complete top-level record sequence, including required-span depth, uniqueness, ordering through the final completion, exact status tokens, and exit ranges. Apply field consistency checks after that structural/schema validation. Preserve the explicit early APPARATUS-FAIL alternative so pre-command failures do not require OUTPUT. Do not widen legacy semantics while fixing v4.

STRENGTH: entailed for the missing predicates and control flow by full source inspection; acceptance of constructed malformed records remains runtime-unverified. This carries forward the unclosed parts of r3 B2/B3 rather than claiming the new fixtures failed.

**N1 — P3, nonblocking: MUT_EXPECT has different numeric contracts in the emitter and comparator.**

File/line: `tools/staging/mutate.sh:47`, `:60`, `:70`; `tools/staging/stamp-check.sh:34`, `:102`.

Input → wrong outcome: with one replacement, `MUT_EXPECT=01` passes the emitter's numeric comparison and emits a successful summary, but the comparator compares the strings `01` and `1` and reports FIELD-MISMATCH. `MUT_EXPECT=+1` likewise produces emitter exit 0 and a successful summary but fails the RESULT grammar as MALFORMED. Each outcome repeated three times. Raw successful summaries are at `emitter-records/mutate-declared01.run1.log:21` and `emitter-records/mutate-declared-plus1.run1.log:21`; the corresponding comparator files report the disagreement.

Required fix: establish a shared numeric-input contract. Validate and canonicalize MUT_EXPECT before applying a mutation, then emit canonical decimal; alternatively accept the same numeric forms and compare their integer values. A form the comparator cannot represent must not yield an emitter-success transcript. Keep rejection of missing declarations and actual multiplicity mismatches.

STRENGTH: entailed by six successful emitter runs with independent rejection results and the numeric-versus-string comparison. Route for correction under F-TOOL-MUTATE-3; nonblocking does not mean optional.

**N2 — P3, nonblocking packet finding: the cleanup-handler description is inaccurate.**

File/line: `packets/tool-stamp-check-codex-r4.md:16`; `tools/staging/gate-run.sh:27`; `tools/staging/mutate.sh:41`–`:43`.

Input → wrong outcome: the packet says both emitters remove temporary files in EXIT/INT traps. Gate installs an EXIT trap only; mutate installs EXIT and INT/TERM handlers. A reviewer relying on that sentence would infer an explicit gate INT handler that does not exist. The tested gate signal paths nevertheless cleaned up correctly, so this is not evidence of a surviving temp leak.

Required fix: correct the packet's handler inventory and distinguish installed handlers from observed signal-path cleanup. No extra handler is requested merely to make the prose true. Route the documentation correction with this ticket.

STRENGTH: entailed by the installed trap statements; successful cleanup at the tested signal points is independently measured.

## Answers and r3 disposition

1. **Fixture and regeneration:** all 27 expectations match three times. Fresh 17 and 19 pass with the outer HEAD identity `9b2ff4edf57b2a1f073ddd5412111f624fbab1dc` and inner OLD identity `f360fb6f27457b4967d505285a53027da5a5c9cf`. The same-identity control passes. The requested known-nonce construction was assessed statically, not executed; B1 records the resulting stack/inventory problem and its evidence limit.
2. **Stack cases:** unmatched closers and other-nonce closers are payload when they do not match the active stack top; the fresh controls pass. Same-type/same-nonce openers are pushed, not opaque. A matching closer for a nested tracked span pops that span. CRLF within OUTPUT passes; converting the whole emitted record to CRLF produces MALFORMED because the exact opener/closer patterns retain terminal carriage returns. Whole-record CRLF support is not established by these LF emitters and is not claimed here.
3. **Success grammar:** applied=1001 and cmd_exit=255 both pass. Spaces/brackets in porcelain are not an emitter-success case: success emits `porcelain=empty`; dirty porcelain takes RESULT FAIL, which is recognized before RESULT_OK. A real dirty filename with both spaces and brackets correctly yielded APPARATUS-FAIL three times. The demonstrated successful-summary incompatibilities are the numeric declaration forms in N1. Missing `declared` now correctly fails case 31.
4. **Prior findings:** r3 B1's specific complete-nested-record failure is repaired, but payload opacity remains defective (B1 here). r3 B2 now has required inventory and byte-count checks, with case 30 rejecting correctly; complete structural enforcement remains open (B1/B2 here). r3 B3's anchored RESULT and explicit declaration are repaired; surrounding schema checks remain open (B2), and numeric compatibility needs N1. r3 B4's secrecy/authentication wording is corrected; the separate known-delimiter correctness assertion is still too strong (B1). r3 N1 is closed by the corrected case 05 label and real 17–19 transcripts. r3 N2's observed leak is closed by the early-failure and signal checks; N2 here concerns only packet wording.
5. **Custody and cap:** D64 ADDENDUM 7 (`DECISIONS.md:3541`) is the right rule: review the matched staged emitter/comparator set, preserve evidence and prior versions, and switch only between lanes when no seat is mid-round. This CHANGES verdict does not authorize a swap. No seat inventory or swap was performed. The ticket explicitly records rework_round=3, so send the findings to V through the existing decision route; do not initiate round 4 automatically.

STRENGTH: measured answers are entailed by the saved results; static conclusions are labelled above. The CHANGES and custody recommendations are reviewer judgment supported by those findings and the cited decision.

## Not verified

No child that reads the enclosing nonce, same-nonce transcript construction, working forgery, metadata manipulation, or exploit reproduction was built or run. The requested known-nonce manipulation was limited to static defensive analysis. B2's malformed-acceptance scenarios were also not executed. These limits do not weaken B1's three ordinary emitter-generated failure cases.

Signals were tested only after child readiness, against the process group. SIGKILL, all earlier/later interruption windows, failed Git restoration, disk-full/temp-creation failure, arbitrary binary OLD/NEW, other operating systems, and the full historical legacy corpus were not tested. No package installation, network action, product suite/typecheck, or security scan was performed.

No verifiable author skills-load receipt or author session transcript was supplied; author process compliance is undetermined. General spine and TOOLING-TRAPS reads were narrowed to reviewer-relevant guidance after oversized output truncation; their full bodies are not claimed as audited. No board comment was posted because the packet permits only the two report files. No other lens was contacted or consulted.

Only the two requested mission reports and scratch artifacts were written. The 87 captured protected files, including live/staged tools, packet, ticket, decisions, prior staged versions, prior verdict, self-test, and preserved fixture files, matched their initial SHA-256 values at final verification. No mission Git mutation occurred.

REVIEW: changes — keep the staged set unswapped and route the remaining payload-boundary and record-grammar defects, plus the numeric-contract and packet corrections, to V at the rework cap.
