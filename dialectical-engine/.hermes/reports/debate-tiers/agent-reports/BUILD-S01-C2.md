# BUILD-S01-C2 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause 1 — the shared runner conceals the evidence its packet demands

`PLAN.md:518-527` captures each Vitest run in `o` but never emits `o`, so redirecting `run_suites` cannot produce the full-output log required for the RED frames. The function also ends with `echo CLUSTER_RED`, so shell `rc` is 0 on both RED and GREEN; I nearly treated `rc=0` as the verdict on the initial BROKEN run. PRICE: one runner-design pass, two inspection calls, and about 4 minutes; token usage is UNMEASURED because this seat exposes no accounting footer. DEAD END NOT TAKEN: re-running a failed case merely to capture its frame would have violated the packet.

VERDICT: give `run_suites` a log descriptor, emit each captured `o` there, and explicitly return nonzero after `CLUSTER_RED` / CONFIDENCE high / STRONGEST COUNTER: callers already key on the marker, so changing the exit code may expose scripts that accidentally depended on zero.

## Cause 2 — the reading floor points in both directions

The seat packet says packet then `COMMON.md`; `COMMON.md:1` says common then packet. The packet also requires every skill reference and the 2,167-line spine even though `heartbeat-protocol/SKILL.md` says a worker should stop after the thin role contract. PRICE: 2,167 spine lines plus the skill references loaded before work; token usage is UNMEASURED, and the contradiction cost one sequencing decision but no retry. I followed the direct seat prompt: packet, common, skills, spine.

VERDICT: packets should name one ordered reading manifest and the role router should point to bounded spine sections, not the whole archive / CONFIDENCE high / STRONGEST COUNTER: a full spine read prevents an old thin skill from hiding a superseding amendment.

## Cause 3 — the Tooling Traps “index” is not an index-sized read

The mandated `grep -n '^## \|^- '` over `.hermes/TOOLING-TRAPS.md` emits every heading and every top-level bullet across a 3,000-line append-only file. Most output is unrelated to this seat. PRICE: one very large tool result before the nine named sections could be read; tokens are UNMEASURED. The direct section ranges were small and sufficient.

VERDICT: generate a heading-only index with start/end offsets and have packets name those offsets / CONFIDENCE high / STRONGEST COUNTER: top-level bullets sometimes contain a trap with no dedicated heading and would disappear unless promoted first.

## Cause 4 — isolated RED cases pay the whole-cluster runtime

The packet requires the nine-suite cluster command after S01-12, S01-14, and S01-16, even though only the new suite can change during those RED steps. The baseline/BROKEN run plus three RED runs cost 34.8 seconds. An initial three-run verdict cost 25.1 seconds, then a type-only correction invalidated it and the final three runs cost another 25.4 seconds. Output stayed bounded only because the scratch script filtered stdout while retaining full logs.

VERDICT: keep the three whole-cluster verdict runs, but let step-local RED evidence run only the target suite unless a dependency interaction is part of the property / CONFIDENCE medium / STRONGEST COUNTER: whole-cluster RED runs expose an unexpected neighbouring regression at the moment it is introduced.

## What nearly went wrong, and what worked

I nearly misclassified inherited typecheck rc=1 as mine; the binding delta was zero diagnostics in `tests/render/ux01-new-debate-form.test.tsx`. The narrow check also nearly let two diagnostics in this seat's own paths survive: `Set<"free" | "premium">.has(string)` and TS6142 on the mandated `.ts` suite's TSX import. A final allowed-path grep caught both; the causes were removed, the three-run gate was repeated, and the unpushed local commit was replaced so the lane still carries one C2 commit. PRICE: one correction pass, about 29 seconds including typecheck and repeated cluster runs, no test retry. VERDICT: every BUILD packet with an inherited-red compiler should assert both its named exception and zero diagnostics in its own allowed paths before the first commit / CONFIDENCE high / STRONGEST COUNTER: a later whole-slice delta gate already owns the global comparison and duplicated parsing can drift.

I also had to preserve EXACT provenance literals while treating refusal text as prefix-only. Consolidating the required arms into three observable assertions kept the refutation duty to three property-level mutants without dropping Free/Premium or missing/unknown coverage. The exact S01-12→S01-19 ordering and the two-member sub-class B inventory prevented adjacent edits to the already-compatible regex case and `LibraryComposer`.
