# Self-report — C4 FinalPlan consolidator (sdk-subagent-C4)

What went well:
- The r4 Plan.md was genuinely clean input — every finding already had its resolution folded into the section text, so consolidation was mostly deletion (tags, round headers, §g) plus renumbering, not reconstruction.
- Grep-based fidelity passes after writing (36 load-bearing markers, 28 arithmetic values, zero-scar scan) caught nothing missing, which is the outcome you want but only trustworthy because the checks were written from the upstream doc, not from my own output.
- Reading the r4 verdicts before writing paid off once: H2-verdict-r4 confirmed `box-sizing: border-box` underpins the tab arithmetic, which I kept as a parenthetical the plan itself never stated.

What fought me:
- Rework scars are not just tags — they are prose tense. Sentences like "redesigned round 2 per V ruling" and "the original claim was false" had to be rewritten as if right the first time while keeping the honest content (the withdrawn zero-tests claim, the refuted pan-x/pan-y path). Deciding what is "scar" vs "load-bearing honesty" was the real work; I kept refuted-path statements because implementers need to know what NOT to try.
- The contradiction: §b.1 prose pinned `--token-dock-clearance: 58px` while the approved §b.4 block defines `calc(18px + var(--dock-max-h))` = 114px. Neither reviewer flagged it because each value is locally coherent. Resolving it took tracing which value the verified disjointness arithmetic actually depends on — a consolidation reading, but uncomfortably close to the redesign line.
- Section renumbering (a-g → 1-7) forced touching nearly every cross-reference; one missed §-letter would have been a silent defect no grep for "scars" would catch. I added the mapping to the handoff instead of trusting myself.
- The 25k-token Read cap split Plan.md mid-§d.5 table; easy to have "finished" reading at the truncation point. The truncation banner saved me, not my own diligence.

What I would change about the stage:
- Give C4 a machine-checkable manifest from the final verdicts (list of must-survive strings/values) instead of each consolidator inventing its fidelity checks ad hoc.
- Make prose/value contradictions like the clearance one an explicit C2 exit check ("every CSS variable named in prose matches its defining block") — C4 finding it means three review rounds looked past it.
- The artifact spec's "no new design decisions" plus "pick the reading consistent with the latest verdicts" worked, but only because the conflict had a clear later-verdict winner; the spec should say what to do when it does not (my answer: CLAUDE BLOCKED, but it is currently implicit).
