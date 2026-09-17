# GROK-REV-S01-10A — self-report (mission `consent-ui`, finished-UI-element review, round 1)

Seat: GROK-REV-S01-10A · reviewer · grok-4.6 · ticket `t_1fe7c039` · HEAD `4cc0f4b6`.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause, not symptom

**The first 21 cluster runs were red for a CSI dim code around `$ tsc --noEmit`.** Not for the UI. `FORCE_COLOR` in the Grok tool shell wraps pnpm's script echo; PLAN.md's `n_tcran` grep is `^\$ tsc --noEmit$`; the wrap makes it 0; every CMD-C* prints `verdict=1` while the vitest/hit-list/typecheck-delta arms are the pin. Unsetting `FORCE_COLOR` flips all seven to `verdict=0` ×3. Class: **a guard that fingerprints a pnpm script-echo is ANSI-fragile in this harness.** Same family as COMMON §10.16 (glyph/locale) arriving through colour. Price: ~90s for a useless table, ~5 min to hexdump and re-run. If I had stopped at the first table I would have REWORK'd a done bar.

## What we must upgrade

1. **Cluster commands must strip colour at the capture**, or the fingerprint must be `tsc --noEmit` unanchored after stripping CSI. Do not tell Grok seats to "just run CMD-C*". Their tool shell is not Claude Code's.
2. **Packet globs that match zero files.** `CODE-REV-S01-10A-*.md` was empty; the reviews are `CODE-REV-S01-C*.md`. A seat that obeyed the glob literally would skip every per-cluster verdict. `ls` the glob at packet-write time.
3. **TOOLING-TRAPS line count at dispatch** is still missing from this packet after §10.66/67 made it law. I read 2963 lines because the skill said to; a seat that discharged on `wc -l` matching nothing would skip the FORCE_COLOR-adjacent traps.
4. **jsdom `var(--token)` on elements is transparent; custom properties on `<html>` are not.** A probe that `getComputedStyle(.consentBarBezel).backgroundColor` will "fail" a correct stylesheet. Measure tokens on `documentElement`. Layout (22px, 720px stack, 520 card) is V's, always.

## What repeatedly cost tokens

- Reading SPEC.md (784 lines) + PLAN verification blocks + COMMON §10 (73 amendments) before a single probe. The quality came from that; the cost is that a Grok element review cannot start measuring until ~40k tokens of law are in context.
- Three false-red probe assertions (R06 via `act()` flushing effects; computed bezel colour; scroll-gate latched because `scrollHeight === clientHeight`). Each was a jsdom/React-18 fact the SPEC already named (`renderToStaticMarkup`; "jsdom computes no layout"; scrollTop mechanism). I re-derived them. Price: two probe reruns, ~4 min.

## How to make coding (and this review) a one-prompt machine

- Put `env -u FORCE_COLOR` in the PLAN fenced blocks, or in COMMON as a standing prefix for every `pnpm` capture a Grok seat might run.
- Name the per-cluster review files in the Grok packet as a `ls` listing, not a glob that doesn't match.
- Give the element-review probe a 30-line template: inject `globals.css` into **this** document, `renderToStaticMarkup` for first paint, tokens off `<html>`, stub `scrollHeight` before opening 10c. I wrote that kit; the next Grok seat should copy it, not invent it.

## What I nearly got wrong

Treating `n_tcran=0` as "typecheck didn't run" (it did: eight pinned diagnostics, `tt=1`). Treating `act()`+`createRoot` as R06's first paint (the SPEC's hook is `renderToStaticMarkup`). Filing `I have read it` enabled-on-mount as a product bug (jsdom latch).

## Where this packet fought me

- STEP 0 CLAIM vs a reading list the launcher had already started. CLAIM posted with cursor 1 (DISPATCH was comment 0).
- Probe 2 lists 10c's 11 sections / 8 pills / footer on a seat named 10A, while `GROK-REV-S01-10B` exists. I ran those probes because the packet ordered them; a stricter reading would have left 10c to 10B.
- `allowed` scratch is `.review-scratch/` in the lane; COMMON §10.11 names a shared scratchpad. The packet list won.
- PLAN.md:622 still says run from `consent-s01`. The commands have no path; they ran in `rev-grok-10a`.

## Dead ends (do not re-derive)

- `tests/support/tokenContract.ts` `styledDocument()` — detached JSDOM, cannot host a React mount (already in the packet; still the first helper a seat reaches for).
- `NO_COLOR=1` without unsetting `FORCE_COLOR` — ignored, warning printed, CSI wrap remains.
- Matching `n_tcran` in the tool shell (ugrep) vs `/bin/bash` is not this failure; the bytes on the line are the failure.

Wall-clock: CLAIM 05:14Z → verdict ~05:35Z. Cluster ×3 twice (~3 min total). Probe three runs (~6s). The rest was packet/SPEC/TRAPS reading.
