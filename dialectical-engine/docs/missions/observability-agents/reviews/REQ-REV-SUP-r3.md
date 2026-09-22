# REQ-REV-SUP — verdict on SupportAgent requirements (round 3)
SKILLS LOADED: using-superpowers (`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md`), heartbeat-protocol (`.claude/skills/heartbeat-protocol/SKILL.md` and `.grok/skills/heartbeat-protocol/SKILL.md`), heartbeat-reviewer (`.claude/skills/heartbeat-reviewer/SKILL.md`), verification-before-completion (`superpowers/6.3.0/skills/verification-before-completion/SKILL.md`), systematic-debugging (`superpowers/6.3.0/skills/systematic-debugging/SKILL.md`), receiving-code-review (`superpowers/6.3.0/skills/receiving-code-review/SKILL.md`)
## Verdict: PASS
Round 3 of 3 (final). Scoped re-review of r2 N8 and N13 only, against current `slices/SUP-03/SPEC.md` acceptance step 1. Preserved unmodified: r1 `reviews/REQ-REV-SUP.md` (`## Verdict: REWORK`) and r2 `reviews/REQ-REV-SUP-r2.md`. Reviewer is Grok 4.6 by direct user instruction. Blindness: listed `reviews/` this round and did not open sibling product-review verdict files.

`HERMES AUTHORIZED NEXT` is comment 7 on `t_d819e88e` (author `codex-orchestrator`): inspect only N8/N13 and SUP-03 step 1; treat r2 body as REWORK despite its PASS header; write this r3 file. This r3 verdict is internally consistent: N8 and N13 are both ADDRESSED, so the line is PASS. No leftover blocker; no V DECISIONS PACKET row; no fourth round.

## Finding close-outs

N8 · ADDRESSED · `slices/SUP-03/SPEC.md:104-133` no longer uses a raw `qa-account-*.json` count. Independent grep for the r2 false-green `find … -print | wc -l` / `Expected: at least 2. Designate` in SUP-03 SPEC: **zero matches**. Step 1 now requires a pasteable `jq -e` predicate (`SPEC.md:111`) plus fail-closed `test "$support_fixture_count" -ge 2 || { … exit 1; }` (`SPEC.md:117`).

N13 · ADDRESSED · The glob that counted recovery-only JSON as a second identity is gone. Recovery-only JSON is excluded: `SPEC.md:123-124` states a recovery-only file lacking non-empty `password` and `login_proof = authenticated_then_logged_out` is absent from the index. Independent key-only probe this round (paths and booleans only): recovery file `qa-account-20260826183130-recovery.json` → REJECTED (`password_nonempty_string=False`, `login_proof` missing); credential file `qa-account-20260828070616-d3e68cfc.json` → LOGIN_CAPABLE. COUNTS `login_capable=1 rejected=1`. SPEC-equivalent `jq` loop: recovery FAIL, credential PASS, count=1, would `exit 1`.

## Three required judgments (explicit)

Recovery-only JSON is excluded. The `jq -e` predicate at `slices/SUP-03/SPEC.md:111` requires non-empty string `email`, non-empty string `password`, and exact `login_proof == "authenticated_then_logged_out"`. The on-disk recovery file has keys `{email, generated_at, purpose, recovery_codes}` and is REJECTED.

Fewer than two login-capable identities fails closed. `SPEC.md:117` is `test "$support_fixture_count" -ge 2 || { printf 'FAIL: …' >&2; exit 1; }`. Current on-disk set has one login-capable file. Independent equivalent probe: count=1, FAIL, exit would be 1. V cannot proceed past step 1 on today's fixtures.

Actual sign-in for both QA-A and QA-B is required. After a failed probe, `SPEC.md:124-129` stops and tells V to provision a second identity, prove sign-in then sign-out, save a 0600 credential record, and rerun until exit 0. After exit 0, `SPEC.md:129-131` designates QA-A and QA-B and requires separate browser profiles to sign in with each, expected both reach the signed-in landing page, before creating run `F`. Do not continue until the probe exits 0 (`SPEC.md:129`).

## New breakage in the fix-touched clause

None Critical. None Important. The probe writes a fixed path under `/tmp/` (`SPEC.md:108`); a concurrent paste could clobber that file. That is not a false-green and does not reopen N8/N13. Not filed as a finding.

No other files in this round's scope.

## What I verified and how

Independent of `REQ-SUP-REWORK-R1.md` close-out table:
- Read `slices/SUP-03/SPEC.md:102-133` in full.
- Grep for the r2 glob/wc-l gate: 0 hits.
- Key-only JSON inspection (key names and booleans, no credential values) over both `qa-account-*.json` files.
- Ran the SPEC `jq -e` predicate in a scratch-dir equivalent of the pasteable loop; recovery FAIL, one LOGIN_CAPABLE, count 1, fail-closed.

## What I did NOT verify

- Live `pnpm dev:auth:up` or actually signing in as QA-A.
- Provisioning a second QA identity (V-only; out of this seat's contract).
- r1 B1–B2 / N1–N7 / N9–N12 (out of round-3 scope).
- Sibling product-review verdict files.

## Predictions

A lens that only checks that `jq -e` appears, without running it, will miss whether `login_proof` on the remaining file actually equals `authenticated_then_logged_out`. I ran that comparison as a boolean (true on the credential file; missing on recovery). I also expect someone to call PASS inconsistent with "today the probe exits 1" — that fail-closed result is the required gate until V provisions QA-B, not a remaining requirements defect.

## comments read through: 9
