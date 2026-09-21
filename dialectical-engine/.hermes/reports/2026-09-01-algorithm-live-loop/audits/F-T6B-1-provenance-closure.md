# F-T6B-1 closure — which T6 gate claims are testimony, and which are machine records

Deliverable ordered by V, 2026-09-03: *the work is to RECORD, not to repair: the logs cannot be
retro-stamped without turning testimony into a fabricated machine record. Deliverable is a
closure statement naming exactly which claims rest on testimony rather than on the artifact.*

Measured at integration tip `7dda3cc0`, against the 21 files matching `logs/t06/*r4*`.

## The ticket's own count was wrong, and correcting it strengthens the finding

F-T6B-1 records that "17 of 21 r4 logs carry no commit token either". Counted directly:

```
r4 logs total                                              21
containing 7f513173 / commit= / tree= / HEAD= anywhere       12
containing none of those                                      9
```

So the split is 12/9, not 4/17. I am not filing that as a correction to a number, because the
number turns out not to matter. What the twelve actually carry is this:

```
r4-zone-run1.log:1          === T6 r4 zone run 1 @ tip 7f513173 ===
r4-lint-source-tip.log:1    === audit:source @ TIP 7f513173 ===
r4-d16-ui-tip.log:1         === D16 ui gate @ TIP 7f513173 ===
```

A hand-formatted banner, written by an `echo` the seat placed before the command. **The same
keystroke produces that line whether or not the tree matched.** It records an intention, not an
observation. So the twelve and the nine are in the same evidential class, and the 12/9 split is
cosmetic.

## The three mutant logs are a separate, sharper case

```
r4-mutant-M18-renarrow-ledger-read.log:3    lane tip    : 7f51317349ec8f2670d1c29643a986a2d814cbaa
```

Full 40-character SHA, which a hand-typed banner usually is not. But it is NOT the mission
tool's signature: `tools/mutate.sh:17` emits `commit=$TIP tree=$TREE  mutate.sh  <date>`, and
none of these files contains that form. They came from a hand-rolled driver that was not filed.

Whether that SHA was computed by `git rev-parse` inside the driver, or typed, **cannot be
determined from the artifact** — the driver does not exist in the record. This is the same class
as S08's r4 index finding, where a driver's claimed derivation had no filed generator, and it
gets the same verdict: CANNOT-ASSESS, not "probably fine".

## The statement

**All 21 T6 r4 gate logs are testimony-grade for their commit attribution.** Not 17, not 9 — all
of them. None carries a tree hash, none carries porcelain before or after, and none carries a
provenance line any tool generated. Every sentence in the T6 report that attributes an r4 gate to
`7f513173` rests on the seat's word that it ran the command where it says it did.

Three things are NOT in doubt and should not be read as impeached:

- The gate OUTPUTS — the pass/fail counts, the failure names, the mutant discrimination — are
  ordinary command output and stand as recorded.
- The product tree is committed and independently checkable.
- The r4 code verdict is unaffected. Nothing here reopens a finding.

What is impeached is exactly one link: that a given log was produced at a given tree. Any future
reader comparing an r4 log against `7f513173` is comparing it against an assertion.

## Why it is not repaired

Adding a stamp now would produce a line indistinguishable from a machine record, generated after
the fact, by someone who was not present at the run. That converts a known weakness into a
concealed one. The record stays as it is and this statement stands beside it.

## What prevents the next one

`tools/gate-run.sh` (D45, amended D49 and D52) derives commit and tree from git at run time,
records the provisioning block, and captures porcelain before and after the command. Its header
cannot be typed, and a log without it is inadmissible under the current mission rules. Both T6
provenance sentences — r3's and r4's — now say they are testimony.

One residual worth carrying forward: `gate-run.sh` governs GATES. The T6 r4 mutants ran through
a hand-rolled driver rather than `tools/mutate.sh`, which is how they escaped the tool that
would have stamped them. The rule that closes this class is not "stamp the logs" but **"a filed
result must name the filed tool that produced it"** — the same rule S08's index finding needed.
