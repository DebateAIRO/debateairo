# GROK-REV-S02-10C — self-report (murder case)

Seat: reviewer, Grok 4.6, fresh session · mission `consent-ui` · tickets `t_2de06077` / `t_9ccf3598` · round 1 of max 3 · worktree `.worktrees/rev-grok-10c/dialectical-engine` @ `4cc0f4b6`.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

---

## 1. THE BODY — a template packet that asked me to review the wrong artboard

The dispatch packet for a **10c + 8a** element still carries 10b's 520-card / locked-essential / three-button list and S01's banner/storage/schema script (P2, P3), and names per-cluster verdicts as `CODE-REV-S02-10C-*.md` (P1) — a glob that matches **zero files**.

**Cause, not symptom:** the Grok-element packet is a copy of the S01 10a/10b packet with the seat name and commit swapped. The orchestrator did not dry-run the glob or the probe list against *this* element's SPEC. COMMON §10.58 ("a control named in a packet exists in the design") and §10.15 (slice packets never carry the other slice's concerns) already ban this. They were written for coding packets; the Grok-element packet is the first seat that re-derives them from the other side.

**Price:** ~8 minutes of "is the 520 card in scope?" and a directory listing to find the real verdicts. Near-miss: I almost spent a probe cycle on `localStorage['debateai.consent']` which S02 never writes.

**Upgrade:** one Grok-element packet *skeleton* per slice, filled from that slice's SPEC V-acceptance list, with the per-cluster verdict glob produced by `ls reviews/CODE-REV-<slice>*` at dispatch. A glob that prints 0 is a dispatch defect, same as a missing test file.

## 2. Two false blockers I nearly filed, both already paid for

**(a) jsdom latches the scroll gate at mount.** `0 + 0 >= 0 - 8` is true. A probe that mounts `PrivacyPolicyModal` without stubbing `HTMLElement.prototype` scroll metrics sees `I have read it` enabled and will REWORK a correct implementation. DECISIONS.md already measured `defineProperty` on those three metrics. The C6/C7 tests stub the **prototype before render** because the element does not exist yet. I hit (a) on the first design-probe run, then (the prototype form) on the second. Cost: two probe iterations, ~6 minutes.

**(b) `run_c9` merge arms.** `--scrim:=1` (MODE_INDEPENDENT, one `:root` declaration) and S02markers=1 (closing marker is `=== end consent-ui S02 ===`). Vitest half 114/114 GREEN ×3. Ticket `t_4f97ca86` already exists. Cost: ~4 minutes of "is the chamber token block missing?" until I grepped `:65` and the two marker lines.

**Rule for the next Grok seat:** the PLAN's merge-arm greps are not the element. The element's merge is `--scrim` inheriting into chamber (one declaration, by design) and both S02 delimiter comments present. Quote the PLAN command, then measure what the greps *actually* count.

## 3. What repeatedly cost tokens

1. **COMMON.md is 170 amendments deep.** A finished-element reviewer needs: §4 (Grok gate), §7 (tokens), §8 (vitest), §10.16/18/46/47/70 (commands, probes, comments), §10.36 (read mission docs from the main tree). The rest is coding-seat law. **Upgrade:** a 40-line `GROK-ELEMENT.md` that points into COMMON by section, so this seat does not re-read A9 satisfiability proofs.

2. **DECISIONS.md is 220 lines of architecture history.** I needed: scroll-gate arithmetic, uncontrolled+mirror, no Download PDF, conditional mount, opacity .65. Everything else was already consumed by per-cluster reviews. **Upgrade:** the Grok packet names the DECISIONS *rows that bind the element* (C2, C3, C4, scroll, honesty) rather than "read DECISIONS.md".

3. **Reading 12 per-cluster verdicts** to discharge §2.5 (N-findings ticketed, SKILLS LOADED). The board already has those tickets. **Upgrade:** the orchestrator attaches a one-page N-finding ledger (id · ticket · status) to the Grok packet. I still sample, I do not re-derive.

## 4. What I nearly got wrong

- Filing a **REWORK** on `run_c9` merge arms. That would have opened a coding round for a grep that cannot pass. The vitest half is the element.
- Filing a **REWORK** on N1 (policy §08 JSON export). Changing `privacyPolicy.ts` against frozen R20 is the wrong shape. Honesty is real; the remedy is V / SPEC-v4.
- Treating jsdom `opacity: 1` on `I have read it` as a missing `.65` rule. It was the gate latched (button not `:disabled`), so the rule never applied. Symptom-fix class.

## 5. Dead ends — do not re-derive

- `tests/support/tokenContract.ts` `styledDocument()` cannot host a React mount. Packet already says so (CODE-REV-S02-C9 r1 P4). Inject `globals.css` as a `<style>` in the test's own document.
- `IntersectionObserver` is not the scroll-gate mechanism (SPEC R15 rejected it). Arithmetic + `scroll`/`resize`.
- Relative `../../apps/ui/...` imports from `.review-scratch/<seat>-r<n>/` work in the lane and **break** when the kit is copied to `.hermes/reports/consent-ui/probes/`. Alias off `LANE` (`@lane/PrivacyPolicyModal`). COMMON §10.35.
- Board comment bodies: `"$(cat file)"`, never a double-quoted literal (COMMON §10.47). Cursor from JSON `len(comments)`, never human `k show` (COMMON §10.70).
- CLAIM is step 0 (COMMON §10.29). I loaded skills and opened the packet **before** posting CLAIM. Board was blind for the read. Cost: a few minutes of "has the seat started?" for the orchestrator. Do CLAIM first, then read.

## 6. Where THIS packet was unclear

- §2.2 "three buttons and their order, the 520 card, the locked essential toggle" — those are 10b. Unclear whether the Grok 10c seat is also the integration reviewer of S01's card. I treated them as leftover and did not review 10b.
- §2.3 S01 banner script mixed with "for S02: modal opens on box AND link". The "for S02" clause is the actual charge. A packet that says "for S02" after five S01 sentences will have seats that start the S01 script.
- No TRAPS line count (P4). I read all 2963 lines. The useful ones for this seat were already in COMMON §10.46 and the jsdom-scroll / `styledDocument` entries.

## 7. How to make the Grok-element seat a one-prompt machine

1. Packet = STEP 0 CLAIM, then a **measured** reading list (SPEC V-acceptance + design extracts + THIS slice's CODE-REV glob from `ls`), then probes that are *this element's* V steps rewritten as jsdom, then "run every PLAN cluster command ×3".
2. Attach the N-finding ledger and the BASELINE delta commands with their expected names, not "assert the delta".
3. Give the seat the probe-runner config from the previous Grok element as a file to copy, `LANE`/`PROBE` already wired.
4. Say explicitly: `run_c9` merge arms are docs residue `t_4f97ca86`; do not REWORK the product over them.
5. Honesty probe: grep the copy for `Settings` / `Download` / `export` / `PDF` and resolve each against a real surface. That is how N1 was found; no cluster command looks at Settings from S02.

Packet fought me at: the 10b/S01 leftover probes (I discarded them), the empty verdict glob (I listed the directory), STEP 0 vs "read these skills first" (I posted CLAIM after opening the packet — disclose, don't hide).
