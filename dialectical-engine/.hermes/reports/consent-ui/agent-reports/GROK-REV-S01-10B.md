# GROK-REV-S01-10B — self-report (round 1)

V's question: treat it like a murder case. What can be done better. What we must upgrade. What repeatedly cost tokens. How we can make the coding more efficient. How to turn this into a one-prompt machine.

## Where I stand at first write

Seat GROK-REV-S01-10B, reviewer, grok-4.6, round 1 of 3. CLAIM posted on `t_41da6951` with `comments read through: 1`. HEAD `4cc0f4b6`, dirty 0. Packet reviewed for quoted constants before probes.

This file is written early (COMMON §4b) and will be updated before handoff.

## Skills actually loaded this session (body, not path)

- heartbeat-protocol (claude copy + grok copy)
- heartbeat-reviewer
- grok-heartbeat-adapter
- superpowers:using-superpowers
- superpowers:verification-before-completion
- superpowers:systematic-debugging
- COMMON.md (binding packet sibling)
- not loaded this session — `receiving-code-review`: not needed because no author contested a finding in this session.

## Packet vs this seat (where it fought me)

1. **STEP 0 CLAIM-before-read vs the user prompt "read your packet in full FIRST".** I read the packet (required to know the ticket id and CLAIM format) then posted CLAIM immediately, then continued the rest of the reading list. The board was blind for the packet-open window. Cause: two instructions in conflict. Price: ~2 min, not a round.
2. **`CODE-REV-S01-10B-*.md` glob matches zero files.** The per-cluster verdicts are `CODE-REV-S01-C*.md` and `CODE-REV-CROSS-*.md`. A seat that `ls`s the glob and stops has an empty reading list. Cause: the packet named the element id, not the cluster-review naming scheme. Price: one extra directory listing; would have been a skipped process-evidence charge if obeyed literally.
3. **Probe 2 mixes 10c structural facts (11 sections, 8 pills, end marker) into a 10b review.** Lawful because 10b's `Privacy notice` opens 10c; still a class of "the packet names the neighbouring artboard's furniture as if it were this element's."
4. **`--shadow-knob` in the packet vs SPEC R24's ten-token list / SPEC token map `--shadow-thumb`.** Implementation has `--shadow-knob` (CODE-REV-S01-C3C4 r1 N3). Packet quoted the shipped token, SPEC still says ten. A reviewer who diffs packet against SPEC without the follow-up commit files a false B.
5. **CMD-C6's `slice/consent-s02..HEAD` arm is vacuous at this detached head** (`slice/consent-s02` === `4cc0f4b6` === HEAD). TOOLING-TRAPS `:2871` already records this. Running it is still required; treating a vacuous 0 as evidence that S01 never touched S02 files after the merge would be the wrong reading.

## Dead ends (do not re-derive)

- Do not run probes via `pnpm exec vitest run .review-scratch/...` against the repo config: `include` is `tests/**`. Own `--config` with `include` pointing at the probe dir. Aliases copied from `vitest.config.ts`. Relative imports from `.review-scratch/<seat>-r<n>/` are `../../apps/ui/...`.
- Do not use `tests/support/tokenContract.ts` `styledDocument()` to host a React mount (packet already quotes CODE-REV-S02-C9 r1 P4).
- Board comment bodies: file + `"$(cat …)"`. Cursor: JSON `len(comments)` immediately before post.
- TOOLING-TRAPS at CLAIM: 2963 lines, main-tree absolute path. Read in full; the dispatch line-count trick is discharged as a HANDOFF re-read only.

## What repeatedly costs tokens on this mission (observed from the artifacts, not invented)

- Cluster commands each re-run `pnpm typecheck`. ×7 ×3 is ~21 typechecks of the same pin. A reviewer of a FULLY DONE element could run typecheck once and the vitest halves ×3. The PLAN forbids that shape; the element-review packet inherited it. Price: tens of minutes wall-clock, not a correctness gain.
- Per-cluster N-findings that are process/packet (wrong path, vacuous arm, SKILLS floor) inflate the "every N has a ticket" sweep the Grok seat must do, because the packet asks for process evidence over the whole slice history.
- The glob / naming mismatch in this packet is the same class as COMMON §10.45 (relative path resolving to the wrong same-basename file).

## What I nearly got wrong

- Importing probes with `../../../apps/ui` (one extra `..`) from a two-level scratch dir. Caught before the run by counting path segments against `vitest.root`.
- Treating CMD-C6's empty range as a real "S01 did not touch S02" proof. It is vacuous at this HEAD.

## Upgrades (CAUSE → change)

| Cause | Price this seat | Upgrade |
|---|---|---|
| Element-review packet names a glob that does not exist | minutes of empty `ls` | Packet lists the actual verdict files, or says "every `CODE-REV-S01-C*` + `CODE-REV-CROSS-*`" |
| Cluster command ×3 includes typecheck ×21 | 15–30 min | Element-review packet: typecheck once; vitest halves ×3 |
| SPEC R24 "exactly ten tokens" vs shipped `--shadow-knob` | false-B risk | SPEC-v4 or a DECISIONS row the Grok packet quotes |
| CLAIM-before-read vs "read packet first" | 2 min of board-blind | Packet STEP 0: "read §1 Ticket state only, CLAIM, then the rest" |

## Handoff update

Independent probes: `Tests  30 passed (30)` (first run 4 failed were fixture defects; class recorded in TRAPS).
CMD-C1…C7 ×3: `verdict=0` with `env -u FORCE_COLOR`; `verdict=1` under harness `FORCE_COLOR` (N2, cross-ref 10A `:2965`).
Consent SET: 197/197, 17 files. Colour-literal hit list: 1 at `globals.css:6116`. apps/ui tsc exit 0.
Verdict: **PASS**. N1 glob, N2 ANSI `n_tcran`, N3 SPEC ten-vs-`--shadow-knob`, N4 vacuous `CMD-C6` range.
Price of N2: one extra 21-run table (~100s) plus a hexdump. Price of the four probe fixture failures: ~8 min and two TRAPS cross-refs.
Saw 10A's `Verdict: PASS` header on `t_26efb70d` at cursor-measure time; probes were already green.
