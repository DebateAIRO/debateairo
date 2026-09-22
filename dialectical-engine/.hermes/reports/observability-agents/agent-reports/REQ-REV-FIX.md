# REQ-REV-FIX — self-report (case file), mission `observability-agents`, ticket `t_ca8c42be`

Seat: REQ-REV-FIX · role reviewer (`heartbeat-reviewer`) · model Grok 4.6 (user instruction overrides packet label Codex Sol Max) · round 1 of max 3 · start after reading packet `REQ-REV-FIX.md` in full.
V's question, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## 1. Verdict in one line
REWORK. The FixAgent set is complete as files and mostly honest as measurement; it cannot be frozen as-is because four SPECs freeze four different incident state machines, and SPEC.md cannot be edited after creation.

## 2. Causes, priced — what this review actually cost, and what the next one will re-pay

| # | Cause (not symptom) | Price | Fix |
|---|---|---|---|
| C1 | **The author's packet and the review packet both dump ~16 slices × 4 files plus a 310-line product file on one seat with "read in full" and no machine-check list.** P3/P7 are grep-shaped. I spent the first hour writing probes that the packet should have shipped as `docs/missions/_tools/req-review-probes.sh`. | ~45 min to stand up P3/P7/P5 harvest; ~0 of that was judgement | Ship the requirements-review probes next to `gen-scaffold.sh` the author asked for. Trace equality, heading set, banned-word sense, citation harvest are mechanical. |
| C2 | **`git show <sha>:<path>` is not the path the commit stored.** `8d38185c` stores the tree under `dialectical-engine/`. First `git show` calls returned fatal and looked like fabricated citations. | 1 probe + a wrong hypothesis ("main.ts missing at 8d38185c") until `git show 'sha:./path'` | TOOLING-TRAPS bullet appended. Packets that tell seats to cite a SHA must also say `git show '<sha>:./<path>'` from this repo root. |
| C3 | **COMMON §0 and H0 FINAL roster contradict, and both claim to be current.** Reviewer time spent deciding which document is law instead of reviewing FIX slices. | ~10 min of packet-review thrash | One roster block. COMMON should pointer to H0 or be regenerated when V edits the roster. Dual "supersedes" is how seats freeze the wrong house. |
| C4 | **P5 asks for ≥10 `path:line` at random, but the author only minted a handful of true `path:line`s.** Broadening the regex picked up `127.0.0.1:55432` and future `zz-scratch.ts:1`. | ~15 min of harvest/filter | Requirements floor: every measured-state sentence carries `path:line`. The review probe then has a population to sample. |
| C5 | **Four other seats writing this checkout.** `git status` is dirty on TOOLING-TRAPS / LEDGER / V-DECISIONS-PACKET. A reviewer who "cleans" the tree is a contract breach. | vigilance cost, not tokens | Packet already says this. Repeat it in CLAIM. I did. |

Tokens: one Grok 4.6 session, no children (COMMON §3 grants fan-out to Fable seats; this seat is Grok; packet allowed list has no child writes). Wall-clock: one sitting.

## 3. What we must upgrade (the one-prompt machine)

1. **State-machine tables belong in ONE place.** B1 exists because FIX-09-R04 copied the predecessor ladder and FIX-11/12/13 each restated a local fragment. A requirements tool that extracts `NEW →` from every SPEC and diffs them would have caught this in 2 seconds. That is the upgrade: freeze the machine in `fixagent.md` Q3 and have slice SPECs pointer, not recopy.
2. **Stranger-test the SPEC §5 in the author's own handoff.** The author ran banned-word grep (self-report N3) and a scaffold generator (153=153 by construction). They did not paste their own §5 as V. FIX-15 step 5 SQL would have failed on first paste. Add a handoff gate: "every §5 step compiled as a command or marked UNVERIFIED with the missing input named."
3. **Dispatch AUDIT-STATE before REQ, not beside it.** Author C1 is right and I re-derived it: H0 "every binding ABSENT" was false for `apps/runner/src/main.ts:1` and `apps/api/src/index.ts:490`. Requirements frozen on stale intake are frozen wrong. The author corrected the intake in Q1; that correction is why FIX-03/04 are cut as remainder, not as greenfield. Keep that pattern, make it a packet law.
4. **Stop dual-roster documents.** C3 above. One prompt machine cannot have two finals.

## 4. What I nearly got wrong

- N1 Nearly filed `packages/obs-capture/package.json:11` as a **fabricated** citation (B). It is an off-by-one; the `./runtime` export is on line 12 at both HEAD and `8d38185c`. Packet says fabricated = B. Wrong line ≠ invented file. Filed N2.
- N2 Nearly charged the author for a missing `SKILLS LOADED` handoff line. Packet §1c forbids it. The CLAIM on `t_80ef9dec` already listed the four floor skills. I used the orchestrator comment on `t_ca8c42be` as instructed.
- N3 Nearly treated `packages/db/src/index.ts:14-18` as a miss against current HEAD (those lines are now session exports). Author pinned `dc9fd57` and wrote "line numbers non-normative". At that SHA the lines are `typedPoolFailure` and `pool.on("error")`. Probe at the pinned SHA before charging.
- N4 Nearly scored empty PLAN step cells as P1 failures. Packet Q4 says the architecture seat fills them. Empty is the contract.
- N5 Nearly BLOCKED on the missing handoff comment. Packet COMMON §6 BLOCKED is for a missing artifact *under review*. The files exist; the board marker does not. That is N1, not BLOCKED.

## 5. Dead ends (do not re-derive)

- D1 `git show 8d38185c:packages/obs-capture/package.json` → fatal nested-prefix. Use `8d38185c:./packages/…`. Do not `git checkout 8d38185c`.
- D2 Broad citation regex without excluding host:port and future scratch paths. Population for P5 must be "existing repo file at a real line".
- D3 `ls docs/missions/observability-agents/slices | grep '^FIX-'` printed nothing in one inventory run (timing/color?); the `FIX-01..16` for-loop found all 64 files. Do not trust one `ls | grep` for existence.
- D4 Opening `reviews/` to see if my verdict path exists also lists sibling `REQ-REV-SUP.md`. I did not open it. Blindness is "do not read the file", not "pretend the directory is empty".

## 6. Where THIS packet was unclear

- U1 §1 model line says Codex Sol Max; the user instruction overrides only that label to Grok 4.6. CLAIM and verdict name Grok 4.6. The packet itself was not edited. Say in the packet body "model as launched, not as printed" or regenerate the packet when the house changes.
- U2 §2b says scratch in `/tmp/`; the goal instruction forbids shared `/tmp` and names a private scratch dir. I used the private dir and recorded it as a plan deviation.
- U3 `## comments read through: <n>` — COMMON says your ticket; §1 cursor is 3 on the *author's* ticket. I used 3 on `t_ca8c42be` (orchestrator skills-gate + prior CLAIM + this CLAIM) and I did read all 3 comments on `t_80ef9dec`.
- U4 P1 "every PLAN-scaffold trace row — can V run it?" against a packet that forbids the requirements seat from writing PLAN steps. I scored SPEC §5, and treated empty PLAN cells as lawful scaffold.
- U5 P8 vs §1c: heartbeat-reviewer §5 still says missing SKILLS LOADED is a finding; the packet carves it out because the author died. Packet wins. A reviewer who loads heartbeat-reviewer after the packet and follows the skill literally will file a forbidden finding.

## 7. Near-miss that would have shipped a false PASS

If I had reviewed only `fixagent.md` Q3 + compass + FIX-01, I would have PASSed. Q3 is coherent, FIX-01 is V-runnable, 153=153, banned-word scan is clean, C1/C3/C4 hold. B1 is invisible until you grep `NEW →` across FIX-09/11/12/13. That is the class: **recopied state machines in frozen SPECs**. The one-prompt machine needs a mechanical diff of those copies, or one canonical table and pointers.

## Round 2

Seat: REQ-REV-FIX · round 2 of max 3 · Grok 4.6 · scoped re-review of B1 and N1–N8 after `REQ-FIX-REWORK-R1`. Verdict: **PASS** (r1 file preserved as REWORK). New non-blocking finding r2-N1 (stale U-F5).
V's question, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

### Cause, priced
**Cause:** the rework fixed the *named sample* of N3 (FIX-06 §5 step 2) and did not sweep the *class member* that still pointed at that step (`fixagent.md` U-F5). Heartbeat 2.2 said this in 2026-08-29 and it still cost a reviewer pass. Price: ~8 min to notice after the close-out table already looked green; one extra same-day ticket instead of a silent ARCH detour later. The one-prompt machine needs: when a SPEC §5 step is rewritten, grep the product file for that step's id.

### Near-miss
Nearly marked N1 NOT ADDRESSED because `t_80ef9dec` still has no comment from author `REQ-FIX`. The disk `## Handoff` exists and `REQ-FIX-REWORK` posted READY as comment 5. Treating "wrong author handle" as an open file defect would have forced a false REWORK. Packet/plan: classify both layers; filesystem closed.

### Dead end
`PSQL='docker exec … -c'` then `$PSQL "SELECT …"` under zsh: the whole string is one word (`command not found: docker exec debateai-v3-postgres-1 psql …`). Repeat the full `docker exec` command. Same TOOLING-TRAPS zsh-no-split trap as round 1; paid it again for ~2 min.

### Where the round-2 instruction was unclear
AUTHORIZED NEXT says "inspect the fix diff/current touched clauses for new breakage" and the plan says classify N1 honestly if disk handoff exists and board mirror does not. It does not say whether a READY posted by `REQ-FIX-REWORK` (not `REQ-FIX`) counts as the board mirror. I counted it as a mirror, not as the missing historical author comment, and still closed N1 on disk. Also: "Critical/Important" vs heartbeat PASS-with-N-findings — I treated leftover U-F5 as Important-non-blocking and kept PASS, because B1 is gone and "never pass with concerns" means list N-findings, not invent a second REWORK round for a gap row.

## Round 3

Seat: REQ-REV-FIX · round 3 of max 3 · Grok 4.6 · scoped close-out of r2-N1 only. Verdict: **PASS**. r1 remains REWORK; r2 remains PASS.
V's question, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

### Cause, priced
**Cause:** rewriting a SPEC acceptance step without grepping the product-file gap row that named that step. Round 2 caught the leftover; the follow-up was a one-line U-F5 rewrite. Price: a full extra review round (round 3 of max 3) for one sentence — wall-clock ~15 min of reviewer time plus orchestrator dispatch. The cheaper machine is `grep -n 'FIX-06 §5 step 2'` in `fixagent.md` inside the same rework that edits the SPEC.

### Near-miss
Nearly filed a new N-finding because U-F5 still lives under `## UNVERIFIED / gaps` while the body says `RESOLVED`. That heading leftover does not restore the ARCH duty. Charging it would have been REWORK on the last lawful round for a section title.

### Dead end
Reading the Round 2 PASS follow-up in `REQ-FIX-REWORK-R1.md` before grepping the files. The follow-up claims zero `ARCH names the site` hits; that is the author's evidence, not this seat's. Ran the grep independently (`exit 1`, 0 hits) and printed both `path:line`s with `nl -ba`.

### Where the round-3 instruction was unclear
AUTHORIZED NEXT calls this "final, optional close-out" while spine law says round 3 is the last *lawful rework*. Optional + max-3 together could mean "skip if busy" or "must close r2-N1 now." I treated the comment as a binding scope (r2-N1 only) and closed it. It also does not say whether a RESOLVED row remaining under `## UNVERIFIED / gaps` is in-scope new breakage; I judged it not Critical/Important.
