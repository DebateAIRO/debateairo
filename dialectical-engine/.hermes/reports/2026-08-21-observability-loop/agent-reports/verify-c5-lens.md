# verify-c5-lens — single verification lens on 367591e (S05, t_6e99d607)

**What went well.** Building the mutants from the packet's *descriptions* instead of the seat's patch
was the right call and cost less than I feared: a 60-line Python file with four exact anchors that
exist byte-identically in all three installers, driven by a shell wrapper that restores with
`git checkout --` and re-proves cleanliness every time. Twelve mutant runs at ~10s each. If you
inherit this, the harness is at `scratchpad/verify-c5/{mutate.py,run-mutant.sh}` — steal it rather
than rebuild it. I put an *independent* three-installer normalization + `writeSync`/`openSync`
count check inside the wrapper so I never had to trust the suite's own identity guard to tell me my
mutant was well-formed; that caught nothing, but it is the check that makes §4 meaningful.

**What fought me.** Two things, and both cost real budget.

First, vitest **deduplicates identical assertion errors** and prints the shared error once with the
list of tests above it. My first pass grepped for `distinctBuffers` and concluded b-inplace fired the
buffer-cardinality arm — it does not; that string was the *code frame*, and the failing line was
`882` (distinctContents), one line below. Do not read failures out of a grep. Read the
`❯ …test.ts:<line>` marker; that is the only thing that names the assertion that actually fired.
Lines to memorize on this file: 881 distinctBuffers · 882 distinctContents · 888 prefix ·
880 call count · 892 record-newline · 895 JSON.parse · 850 partialWriteProbe newline · 751 envelope
deep-equality · 725 normal-path newline.

Second, and this one nearly dirtied the tree: `git checkout <sha> -- <path>` **stages** the change,
so the follow-up `git checkout -- <path>` restores from the index — i.e. restores the *wrong*
version — and `git status --porcelain` reports a staged `M ` that is easy to skim past. I only caught
it because I print porcelain after every restore. Use `git checkout HEAD -- <path>` or
`git reset --hard HEAD`, and print porcelain every single time, not just at the end.

**Dead ends — do not spend budget here again.** I could not build a mutant that corrupts what reaches
the spool while the prefix assertion passes, and the reasons are structural, so re-deriving them is
waste. (1) The import-graph guard pins `writeSync(` and `openSync(` at exactly one occurrence each
per installer, which kills the whole "write the corruption through a second call / second fd / second
file" family before it starts. (2) The mock `node:fs` module exports only seven names, so any mutant
reaching for `appendFileSync`/`unlinkSync`/`writevSync` dies at ESM link time — over-detected, not a
finding. (3) `Buffer.equals` against a clamped `subarray` is *not* vacuous on the long side: I checked
(`longer.equals(s.subarray(0,longer.byteLength))` → false, 7 vs 6), so "commit more bytes than the
serialization" is caught by length. (4) "A valid prefix written twice" is not merely unlikely, it is
impossible for this record: I measured every k in 1..567 and there is no k with `S[0:k] == S[k:2k]`.

**What made me look where I looked.** The one thing worth carrying forward is a measurement, not a
hunch: the record is 1134 bytes with **exactly one newline byte, at the last index** — structural,
because `JSON.stringify` escapes literal newlines. That means a proper prefix can never end in `\n`,
so in the four "record" arms `prefix ∧ endsWith("\n")` is equivalent to *byte-exact equality with the
single serialization*. Once I had that, the hunt collapsed: the only surviving shapes are proper
prefixes in the "torn" arms, where a proper prefix is the correct outcome. I wish I had measured the
record before writing four speculative mutants; that was maybe a third of my budget.

**Where the packet was unclear, and one thing I would change.** The packet told me to confirm the
nine-arm call-count sequence "from output you see printed" but the only printed evidence is a green
suite plus a literal table — the numbers are pinned by exact-equality assertions, so green *is* the
measurement, but say that explicitly rather than making each lens re-decide what counts. Bigger:
grading the ninth-arm decision by *argument* is unreliable, and I nearly did it that way. What
settled it was cheap and should be the standard instruction — temporarily insert the candidate arm,
confirm 63/63 on the clean tree, then re-run the offset mutants and see whether it ever fires
*alone*. It never did. "Add the arm and check it discriminates" is a three-run experiment; make the
next packet ask for it instead of asking for a judgement.
