CODEX REVIEW TOOL-STAMP-CHECK r2 — CHANGES · comments read through: tool-stamp-check-r2-2026-09-07
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging.

**S1 remains open.** The preserved fixture matches its expected outcomes, and both named real-record populations still pass. Four blocking findings remain: unfenced mutant command output, ambiguous span boundaries, missing newline separation, and the earlier requirement for internally matching completion fields. Two nonblocking findings concern the printed qualification and fixture descriptions. These are findings for F-TOOL-MUTATE-3 and its evidence; no reviewed tool was edited.

The reviewer packet was read in full first. Paths beginning `tools/`, `logs/`, `packets/`, and `board/` are relative to the mission directory in that packet. The assigned ticket and packet were reread before filing. The packet's explicit reviewer assignment, two-output contract, and comment cursor govern this review; no board or Git mutation was performed.

Reviewed source SHA-256 values, unchanged at the final byte check:

| File | SHA-256 |
|---|---|
| `tools/stamp-check.sh` v3.2 | `742b628388cb9e090764c2313ffb244c607f3b36c889660230fe274e62b025fd` |
| `tools/gate-run.sh` v3 | `98eeccb3451c17672a6e723bf7344a5bdad3201f63fad432504bbd3917b4f0a6` |
| `tools/mutate.sh` v3 | `38f07a07c36c04ef0d648d2f91777b804b3702b87ceea5d8cfaed3a68bf03769` |

## Independent checks

The preserved fixture was run successfully as a test population three times, each yielding comparator exit **1**, `records compared: 12 · failures: 7`. Negative fixtures make exit 1 the expected result. Every file was also checked individually:

| Case | Observed | Matches EXPECTED.md |
|---|---|---|
| 01 | OK | Yes |
| 02 | OK, newest mutant block selected | Yes; see N2 about the old block's description |
| 03 | INCOMPLETE | Yes |
| 04 | STALE | Yes |
| 05 | OK, bare stamp | Yes |
| 06 | AMBIGUOUS | Yes |
| 07 | NO-STAMP | Yes |
| 08 | STALE | Yes |
| 09 | Skipped | Yes |
| 10 | INCOMPLETE | Yes |
| 11 | OK, header inside TOKEN ignored | Yes |
| 12 | OK, non-emitter line treated as bare stamp | Yes |
| 13 | Skipped | Yes |
| 14 | INCOMPLETE | Yes; see N2 about missing EXIT |

An individually selected skipped file produces zero compared records and exit 3, as intended. An additional population containing one current bare-stamp record and five unstamped files matching the five exclusion patterns produced `records compared: 1 · failures: 0`, exit 0. The v1 `.json`/`comparator` exclusions are restored alongside the documented newer `.sha256`/`.pid` exclusions. `bash -n` passed for all three scripts.

Real-record regression checks, each repeated three times:

| Population | Resolved lane HEAD | Each result |
|---|---|---|
| `logs/dev-health/r1-5*` | `4e5f93278809c42f098468623227a0918e9db91e` | 15 compared, 0 failures, exit 0 |
| Eleven `logs/diag-class-a/*mutant*-r2.log` records | `12e054d9da29ea17d0d18fb9dc67d185856c1893` | 11 compared, 0 failures, exit 0 |

The eleven diag-class-a records were selected through scratch symlinks because the comparator accepts a literal prefix. `31-red-r2.log` is a raw test capture, outside that emitter-record population. These checks compare saved records; they do not rerun those lanes' tests or mutants.

Scratch evidence is preserved at `/private/tmp/st3-r2-review-62t4e4fp`: `cases/15-*.log` through `cases/30-*.log`, corresponding `.run{1,2,3}.out` files, JSON results, real gate captures, and protected-artifact hashes. All sixteen added record cases were checked three times with identical outcomes. Fixture HEAD is `dbe0071e29204a2b6aeecf9ff56e15b2d0b3f8c8`; tree is `4b825dc642cb6eb9a060e54bf8d69288fbee4904`. Reproduce any added case with the unchanged mission tool:

```sh
bash "$MISSION_DIR/tools/stamp-check.sh" \
  "$MISSION_DIR/logs/tooling/st3-fixture/repo" \
  /private/tmp/st3-r2-review-62t4e4fp/cases/15-mutant-raw-output-interrupted.log
```

STRENGTH: entailed by fresh executions, case inspection, source comparison, and byte hashes. Five additional empty-population invocations caused by my harness dropping directory trailing slashes are preserved separately; they are not counted as fixture/regression successes. See the self-report.

## Findings

**B1 — P2, blocking: mutant command output still supplies completion metadata.**

File/line: `tools/mutate.sh:51`; `tools/stamp-check.sh:36`, `:43`, `:44`.

Input → wrong outcome: case 15 appends a current-head mutant attempt after an older complete stale attempt. OLD and TOKEN are properly closed. The discriminating command's raw output ends with `EXIT = 0` and `RESULT: ok — echoed inner-tool summary`; the outer attempt has no command-exit/restoration summary of its own. The checker accepts it in all three runs:

```text
records compared: 1 · failures: 0
OK: every record stamps the filed tip
```

`mutate.sh:51` provides no OUTPUT boundary around `"$@" 2>&1`. Consequently those two output lines enter `frame` as metadata, and their order satisfies line 44. Paired case 16 replaces the command output with ordinary diagnostic text and is INCOMPLETE, exit 1, three times. The reverse error is also measured: case 23 contains an informational `RESULT:` in command output followed by the outer EXIT and proper RESULT; the first-RESULT search rejects the completed shape. Replacing only that informational prefix in case 30 restores acceptance.

Required fix: separate mutant raw command output from emitter metadata through an unambiguous, versioned record format, and select completion only from the outer emitter. Preserve existing captures and handle ambiguous legacy output explicitly. Merely choosing another first/last RESULT occurrence cannot distinguish these records. Add both interrupted-output and complete-output controls. This is the command-output portion of r1b S1, still unresolved.

STRENGTH: entailed by emitter/parser control flow and three repetitions of each paired synthetic case; no claim that a named historical lane capture contains this ambiguity.

**B2 — P2, blocking: one boolean cannot represent nested or differently typed spans.**

File/line: `tools/stamp-check.sh:33`, `:34`, `:35`; payload serialization at `tools/mutate.sh:41`, `:42`; raw output at `tools/gate-run.sh:76`.

Input → wrong outcome: case 17 has a current outer gate header and open OUTPUT, followed by an echoed inner gate transcript. Its structural tail is:

```text
<<<OUTPUT
<inner gate header>
<<<OUTPUT
ordinary diagnostic
OUTPUT>>>
EXIT = 0
CLEAN-STATE: unchanged
```

EOF occurs before the outer closing fence or completion. The inner `OUTPUT>>>` nevertheless sets `s=0`, exposing its EXIT/CLEAN-STATE as outer metadata. Result: exit 0, 1 compared, 0 failures, three times. Case 18 keeps the same inner completion inside the outer span without the nested delimiters and is correctly INCOMPLETE.

Case 19 independently starts TOKEN, places an `OLD>>>` line in that token's literal content, then places EXIT/RESULT lines before the actual TOKEN close. The unrelated OLD close also clears `s`; this unexecuted mutant shape passes three times. Its ordinary-payload control, case 20, is INCOMPLETE. The emitters print arbitrary payload/output bytes without escaping delimiter-shaped lines, so syntactic opening/closing echoes do not guarantee unique boundaries.

Required fix: make payload/output boundaries unambiguous and validate their type, nesting policy, and closure before accepting outer completion. Reject malformed/unclosed outer spans. A typed stack can address the balanced nested example, but alone does not solve arbitrary literal delimiter collisions; the emitter format must provide an escaping/length/separate-output contract. Preserve legacy records and add nested-output and cross-type-close controls.

STRENGTH: entailed by the exact state assignments and three repetitions of cases 17–20.

**B3 — P2, blocking: ordinary output without a final newline makes completed runs unreadable.**

File/line: `tools/gate-run.sh:76`, `:80`; `tools/mutate.sh:51`; `tools/stamp-check.sh:33`, `:43`, `:46`.

Input → wrong outcome: I ran the actual `gate-run.sh` against the existing fixture repo with the harmless command `printf '%s' benign`, writing only a scratch record and disabling Git optional locks. The emitter exited 0, with empty before/after porcelain, but its tail contained:

```text
<<<OUTPUT
benignOUTPUT>>>
EXIT = 0
porcelain AFTER   : []
CLEAN-STATE: unchanged across the run (TRACKED paths only — see PROVISIONING)
```

The anchored closer never matches, so the comparator returns INCOMPLETE/exit 1. This occurred on all three actual emitter runs. The otherwise identical newline-terminated command produced three emitter exit-0/comparator exit-0 controls. Source inspection and synthetic case 26 show the analogous mutant failure: command output joins to `EXIT = 0`, so there is no anchored EXIT line. The mutation emitter itself was not executed.

Required fix: ensure emitter metadata and closing boundaries start independently of the command's last byte, for both emitters, while preserving the measured output. Keep real-emitter newline/no-newline controls with the parser tests. A comparator-only declaration that output is fenced does not repair the bytes emitted today.

STRENGTH: entailed by six fresh gate emitter runs, paired comparator results, and mutant source/synthetic evidence.

**B4 — P2, blocking against the standing S1 requirement: occurrence and order still substitute for completion-field validation.**

File/line: `tools/stamp-check.sh:43`, `:44`, `:46`, `:47`; required behavior at `logs/dev-health/codex-r1b-verdict.final-snapshot.md:90`; emitter summary at `tools/mutate.sh:58`, `:60`.

Input → wrong outcome: case 24 is only a current mutant header, `EXIT = 0`, and `RESULT: ` with no summary. It passes three times. Case 28 additionally supplies an impossible successful summary: `RESULT: ok — pre=1 applied=0 restored=9 hashes=DIFFER porcelain=[modified] cmd_exit=7` after `EXIT = 0`. It also passes three times, just like the consistent control in case 29. No summary grammar or agreement is checked. This does not satisfy the prior ruling's explicit requirement to validate applicable execution/restoration fields rather than mere marker occurrence; that requirement was not withdrawn in this packet.

Required fix: validate the emitter's applicable completion form and internal field agreement, including command-exit agreement and restoration evidence for the claimed result. Preserve the distinction between a structurally complete failed run and a successful gate: a nonzero discriminating command is legitimate, and an identity comparator must not claim that gates passed. Missing or internally contradictory completion evidence must not count as a complete block. This is structural consistency, not transcript authentication.

STRENGTH: entailed by the prior requirement, absent parser validation, and three repetitions of cases 24, 28, and 29.

**N1 — P3, nonblocking: the qualification is clear in source but absent from the green output.**

File/line: `tools/stamp-check.sh:20`, `:21`, `:59`; `packets/tool-stamp-check-codex-r2.md:23`.

Input → wrong outcome: a reader receiving only successful comparator stdout sees `OK: every record stamps the filed tip`, with no explicit limitation on execution freshness or restoration. The wording itself describes identity, but the requested “never proof of fresh execution” qualification requires reading source comments.

Required fix: include that qualification in emitted success text, for example `OK (identity only; not proof of fresh execution): every record stamps the filed tip`. Keep the source explanation as well.

STRENGTH: entailed for the source/output difference; the need to expose it to stdout-only readers is reviewer judgment, not a measured misunderstanding.

**N2 — P3, nonblocking: two fixture descriptions overstate the scenarios exercised.**

File/line: `logs/tooling/st3-fixture/recs/14-mutate-result-before-exit.log:2`; `logs/tooling/st3-fixture/recs/02-mutate-appended-complete.log:2`; `logs/tooling/st3-fixture/EXPECTED.md:3`, `:15`; `packets/tool-stamp-check-codex-r2.md:18`.

Input → wrong outcome: case 14 is described as RESULT-before-EXIT, but it has no EXIT at all. It demonstrates the missing-EXIT check, not relative order. Case 02 is described as two complete blocks, but its old block has RESULT without EXIT and is incomplete under v3.2's own rule. The reported outcomes are correct; the claimed coverage is inaccurate. My added case 27 actually places RESULT before a later EXIT and is rejected three times, so the order check works on that input.

Required fix: preserve these historical records, correct their descriptions, and add accurately labelled cases for reversed order and two fully formed completed appended blocks. Future coverage should use the emitter's real completion fields, not abbreviated RESULT placeholders.

STRENGTH: entailed by full fixture reads and the independently executed reversed-order case.

## Answers about format and scope

`mutate.sh:41`–`:42` always prints OLD/TOKEN wrappers on the uninterrupted normal path, using `printf '%s\n'` for payloads. It does not escape delimiter-shaped payload lines or make an interrupted payload complete. Its own normal post-command RESULT at line 58/60 follows its own EXIT at line 51. Early failure RESULTs at lines 44/46/49/50 and the interrupt RESULT at line 35 can precede any command EXIT; classifying those as incomplete execution is appropriate. Arbitrary command output remains unfenced and may itself contain RESULT/EXIT, as B1 demonstrates.

`gate-run.sh` intends OUTPUT → closing OUTPUT → EXIT → CLEAN-STATE on the normal path. It does print EXIT before CLEAN-STATE. It does not guarantee a separate closing-marker line after arbitrary output, and fixed literal markers do not distinguish nested output, as B2/B3 demonstrate. Neither emitter guarantees completion after interruption.

Additional requested edge behavior: the CRLF complete gate in case 21 passes three times. The split header in case 22, with commit/tree on one line and `gate=review` on the next, also passes three times through the documented bare-stamp fallback, without completion. The supplied emitters write their headers on one line; this split form is outside that header grammar. It illustrates the bare-record allowance, not proof of a completed emitter run. The normal discriminator check and non-emitter case 12 are repaired relative to v3.1.

A stamp-check-only change cannot recover an unambiguous outer/inner distinction from identical unfenced bytes. Closing S1 requires a coordinated format/compatibility fix and meaningful completion checks, while retaining the identity-only limitation. The observed failures do not invalidate the separately inspected historical lane records or demonstrate anything about their original execution freshness.

## Not verified

No mutation emitter execution, target restoration experiment, signal-injection experiment, package install, lane unit suite/typecheck, network action, cross-platform run, or full security audit was performed. The additional interrupted and inconsistent records are explicitly synthetic parser tests; only the six newline controls used the actual gate emitter. No author session transcript or skill-load receipt was supplied, so author process compliance is unverified. I did not establish authentication, historical execution freshness, or complete custody of saved records. General protocol/trap reads were scoped to reviewer-relevant guidance after oversized output truncation; no full-trap-file audit is claimed.

Only the two requested report files and permitted scratch artifacts were written. Mission tools, preserved fixtures, packet, and ticket matched their captured hashes at the final check. No board/DECISIONS edit, source edit, Git mutation, or subagent delegation occurred. STRENGTH: entailed for review actions and byte comparisons; unexecuted behavior remains undetermined.

REVIEW: changes — the documented fixtures and historical identity comparisons pass, but S1 remains open because outer completion can still be borrowed from output, normal output can obscure metadata, and completion fields are not validated.
