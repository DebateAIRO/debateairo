# Review packet — UI-02a rev2 (dual diamond, DR-153)

**Board:** `debateai-v3` · **Ticket:** `t_d4d7d993` (`review`) · READ-ONLY.
Both lenses must greenlight.

## Where this stands

- **rev1:** Grok APPROVED. Opus CHANGES REQUESTED on **B1 alone** — the raw NUL
  bytes in `apps/v2-ui/lib/v3/adapter.ts` were not fixed. The lens offered to
  convert to APPROVED if the orchestrator ruled them inherited/out of scope;
  **the orchestrator DECLINED** — the file is in this ticket's diff, the packet
  made it a required check, and it had already produced one false conclusion
  during the handoff.
- The rev1 lens verified the scoring work HARD and found no defect in it:
  the shipped formatter executed against the full 4-dp grid and **2,000,000
  random doubles** with zero property violations, and the absence switch proven
  exhaustive by compiling a fourth union member (`TS2366`).
  **Do not re-litigate the scoring.**

## The rev2 delta (small, and already byte-verified by the orchestrator)

| check | before | after |
|---|---|---|
| raw NUL count in `adapter.ts` | 2 | **0** |
| `file(1)` | `data` | `Java source, Unicode text, UTF-8 text` |
| plain `grep v3ScorePercentage` (no `-a`) | 0 hits | **4 hits** |

Runtime key proven UNCHANGED: the identity-key test asserts hex
`6100620063` — `a<NUL>b<NUL>c` — so the delimiter is still a real NUL at
runtime while the source carries an escape. A frozen formatter hash
(`59049c36…a48a4`) evidences that the scoring code was not touched.

Also closed: **A3** — `tests/unit/v2ui-pages.test.ts:201` now carries
`expect(drawer).not.toMatch(/\{v3\.(base_score|final_strength)\.value\}/)`, so
the concrete regression the rev1 lens described (swap `{baseScore.text}` for
`{v3.base_score.value}`, drawer returns to `0.41000000000000003`, all gates
green) now FAILS. **A1** — banner copy renamed to the badge tooltip and claim
drawer. **A7** — the IEEE-754-luck assertion replaced.

## Orchestrator's independent gates — do not re-run

root `tsc` clean · v2-ui `tsc` clean · root vitest **60 files / 416 tests**
(was 413) · architecture 27 rows / 0 violations · source 0 blocking.
Formatter re-run after the rework on the real recorded values, unchanged:
`0.98→98%`, `0.88→88%`, `0.41000000000000003→≈41%`, `0.3333…→≈33.33%`.

## What to judge

1. **Is B1 genuinely closed and behaviour-neutral?** The escape must produce a
   byte-identical runtime key. Verify the identity-key evidence rather than
   trusting it, and confirm no printable separator was substituted (that would
   reintroduce a key collision between `("a b","c")` and `("a","b c")`).
2. **Did the rework disturb the scoring?** The frozen hash is the author's own
   evidence; check the formatter and absence paths are actually untouched.
3. **Is the A3 ratchet real?** Would it fail for the described drift, or only
   for that literal string? A ratchet that a trivial rewording defeats is not
   a ratchet.
4. **A1 copy:** does the banner now name a surface that actually renders those
   values (`NodeDetailDrawer` / the badge tooltip)?
5. **Record-only items** the directive listed as out of scope — A4 (`apps/v2-ui`
   has a `test` script pointing at a missing `scripts/` directory, so
   `lib/scoringResponse.test.mjs` can NEVER run), A2, A5, A6, A8. Confirm they
   are stated honestly in the handoff and not silently dropped.

## Verdict

`APPROVED` or `CHANGES REQUESTED`; BLOCKING → ADVISORY, each with file:line,
the law or concrete scenario, and the failing case. This ticket is small now —
"nothing blocking" is the expected honest answer if the delta holds. Do not
manufacture findings.

Write to `reviews/ui02a-<yourname>-rev2.md` and print to stdout.
