CODEX REVIEW S08 r3 — CHANGES · comments read through: s08-r3-2026-09-02
VERDICT: REWORK — 1 blocking finding, 2 non-blocking findings; the next correction is the final authorized rework (3/3)

## Scope and method

I read the packet first, then J20/J22, J23, J25, D24 and both addenda, D41,
D42, D43, the frozen S08 and closure specifications, the ticket, the complete
r2 verdict, the complete worker filing and self-report, the r3 diff, the
production seams the new assertions traverse, and the filed evidence. This was
a STATIC review only. I ran no tests, builds, installs, provider calls, or
mutation commands.

Fresh read-only verification produced:

```text
TIP=e60e0296f3702e26b40d378f3bdf5cfff7f669e7
records compared: 26 · failures: 0
OK: every record stamps the filed tip
STAMP_CHECK_EXIT=0
HEAD=e60e0296f3702e26b40d378f3bdf5cfff7f669e7
TREE=28126352baa1c3989a60a03e7e7dbcee5514aade
STATUS_LINES=0
REPORT_HASH_WITH_LINE2_REMOVED=ec38d6d9a7f35715b1220fd56ed67911c687245f38a168372cf2a480eea3e44d
TRANSCRIPTS=21
MUTATE_SH_FORMAT=0
OTHER_FORMAT=21
```

The tip, tree, clean status, report hash, five-file base diff, and D41 on-tip
claim are correct. D41 establishes stamp currency only; it does not cure B1.

## Disposition of the r2 scope

### B1 — product/test correction CLOSED

The false r2 sentence is corrected in the stable filing at §11.6 and again in
§12.1. `tests/unit/t12-t13-band-basis.test.ts:417-455` now calls the check
“static call-graph reachability ... (NOT executable proof)” and places the
missing `panelPolicy`, T3C/J20/J22, `PANEL_WEIGHTING_UNRESOLVED`, integration,
and W12 dependency at the test itself. `main.ts` remains untouched. That claim
is exactly true: the audit walks textual callable references from declared entry
files and the F30 helper is called from the runner path, while this standalone
tip still cannot execute the M>=2 path without T3C's composition.

### B2 — persisted tuple correction CLOSED statically; mutation proof held by new B1

`tests/integration/database.test.ts:4437-4475` selects terminal, answer form,
verdict state, verdict unavailability, confidence band, and band ceiling from
the `serve.answer` row joined through the current work item. Every observed
member of the tuple comes from that persisted row. The expected cap is computed
from the same `settings.servePolicy` passed to this run; no band literal is
minted. The assertions require DOWNGRADED, the hypothesis form with both exact
synthesizer texts, `CONTESTED`, null unavailability, the computed mono cap, and
the cited-set basis together.

The upstream log records three green executions, but I do not re-certify them
as independently executed evidence. The l3 and l4 files each show one failing
new assertion and no second failure: persisted label `SUPPORTED` versus
`CONTESTED` at line 4462, and persisted band `TEST_TOP_BAND` versus
`TEST_CAPPED_BAND` at line 4472. Their content has the right discriminating
shape. It cannot be credited as D42-admissible mutation evidence until B1 is
repaired.

The refusal to call the persisted `band_ceiling.basis` row a T12 pin is correct.
This fixture serves one node, so cited and load-bearing sets coincide; the row
is a persisted shape guard, while T12's set discrimination remains in the
multi-node unit cases.

### N2/N3/N4 — CLOSED statically

An independent production-source path search for `confidence_band`,
`confidenceBand`, `band_ceiling`, and `bandCeiling` yields the same 17 paths as
the corrected reader table, including all six previously omitted paths. The
captured baseline output for RED rows 1, 5, and 8 is exactly the two-segment
reasoning error now stated in the filing. Independent counts are 11 occurrences
in `tests/integration/database.test.ts` and 3 under `acceptance/**`.

The three-band fixture at `tests/unit/t12-t13-band-basis.test.ts:461-510` makes
TOP→MID observably different from TOP→FLOOR. The r3 product diff contains no
production change, so this closes the earlier test blind spot without changing
the sealed two-band vocabulary or runtime behavior. Again, the recorded b1 RED
is content-consistent but awaits a D42-valid transcript under B1.

### Cluster and zone disposition

The filed cluster records 139/142 on each of three runs. The same three names
are present in the base failure set, and the recorded payloads still show the
same three `obs-capture` edge violations, the same three environment-read
violations, and the same unexpected advisory-lock query. Because r3 changes
only the two test files, the payload comparison plus the focused tuple record is
adequate for this round; a second zone run would not add a production-diff
discriminator. I did not verify the historical host-load claim or the eventual
D15/W12 product proof.

## Blocking finding

### B1 — None of the 21 r3 mutation transcripts was emitted by `tools/mutate.sh`

Files/lines: `logs/s08/mutant-harness.py:174-256`, especially `:222-248`;
every `logs/s08/r3-mut-*.log:1`; mission `tools/mutate.sh:2-30`; worker filing
`s08-band-downgrade.md:751-755`.

D42 is explicit: a mutation transcript is emitted by the mission tool, and a
hand-written summary is inadmissible however plausible. The official tool emits
a raw first line shaped `commit=<tip> tree=<tree>  mutate.sh  <timestamp>` and
then emits its own OLD/NEW, gates, command/output/exit, restore, hashes, and
porcelain. S08's Python harness instead executes the suite and reconstructs a
Markdown record afterward with `log.write_text(...)`; its first line is
`# mutant ...`. A fresh census found 21 transcripts, zero in official-tool
format, and 21 in the bespoke format.

Concrete failure scenario: the reviewer credits l3/l4 as persisted-tuple pins
and b1 as closing the double-step blind spot because the reconstructed records
say RED. Expected under D42: the raw mission tool owns the evidence boundary.
Actual: the same seat that ran and graded the mutations authored the evidence
record, so the entire 19-RED/2-GREEN/no-survivor campaign is inadmissible. Static
agreement among its diff, output, and summary cannot convert it into runtime
evidence.

Required final rework: from the unchanged clean committed tip, run all 21
OLD/NEW pairs through the mission's `tools/mutate.sh`, retain its raw outputs,
name the actual failed assertion or state explicitly that execution threw before
one, regenerate the index and stable report/hash, and rerun the D41 comparator.
No product-code change is requested.

## Non-blocking findings

### N1-PACKET/RECORD — l1 and l2 were not killed by a completion assertion

Files/lines: packet `s08-codex-r3.md:32-34`; worker filing
`s08-band-downgrade.md:680-687`; worker self-report
`s08-band-downgrade-self.md:313-316`; mission `DECISIONS.md:1695-1704`; l1
transcript `:245-290`; l2 transcript `:260-281`; test call/assertion
`tests/integration/database.test.ts:4413-4417`.

Concrete scenario: l1 or l2 mutates the label boundary and
`executeWorkItem(...)` is awaited at line 4413. The packet, filing, self-report,
and D43 example say the pre-existing `result.kind === "COMPLETED"` assertion at
line 4417 killed the mutant. The recorded stacks show the opposite: l1 throws
`ANSWER_PERSIST_FAILED`; l2 throws `VERDICT_LABEL_BASIS_UNRESOLVED`. Neither
call resolves, so line 4417 is never executed and no assertion killed either
mutant.

The important conclusion remains correct: l1/l2 are loudness evidence, not pins
of the new tuple assertions; l3/l4 are the discriminating pins. Correct the
worker filing and self-report, and append an orchestrator-owned correction to
the packet/decision record so D43's general rule is not taught with a false
example. Route this as a same-day record ticket.

### N2-PACKET/REPORT — “~27 s each” contradicts the filed run durations

Files/lines: packet `s08-codex-r3.md:30-31`; worker filing
`s08-band-downgrade.md:666-668`; `logs/s08/r3-persisted-tuple-three-runs.log`.

The three recorded Vitest durations are, verbatim:

```text
TUPLE_DURATION=14.15s
TUPLE_DURATION=6.60s
TUPLE_DURATION=6.76s
```

The 3/3 green count is recorded correctly, but none of the runs is approximately
27 seconds and the whole file spans about 31 seconds. Correct the stable report
and the orchestrator's packet/ledger record from the generated values. Route
this as a same-day documentation ticket; it does not alter the code verdict.

## Not verified

I did not execute the tuple test, unit cluster, typecheck, mutation campaign,
acceptance fixture, zone, D15 batch, T3C integration pairing, or W12 flagship.
All runtime outcomes in this verdict are explicitly inspections of filed
upstream records. I did not review or alter another lane's composition work.

# PREDICTIONS

Another lens is most likely to accept the polished mutation files because every
individual field appears present and D41 is green; checking the producer will
show that green only means on-tip. A lens following D43's prose rather than the
stack will repeat the false completion-assertion attribution. After official
tool reruns, I expect l3, l4, and b1 to reproduce their single discriminating
failures, the two neighbours to remain green, and l1/l2 to remain thrown-error
loudness evidence; the first thing I would check is the raw first line and the
actual failure site of each new transcript.
