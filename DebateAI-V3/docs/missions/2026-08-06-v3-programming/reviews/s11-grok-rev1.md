GROK REVIEW: APPROVED

Gates:
1. vitest unit+integration+architecture: 261/261 GREEN (real embedded PostgreSQL)
2. typecheck (`tsc --noEmit`): PASS
3. lint architecture: edgeRowsChecked=27, violations=[]
4. lint source: blocking=[]
5. S11 law surface: P5 fold + QUERY-gated retirement + model_version=response.model + register-loud thresholds + append-only carriers + walker-derived s11Surface

Findings:
1. NON-BLOCKING — Provider model-version trigger dedup keys by destination `provider_ref:model_version` forever (`NOT EXISTS` any prior key). After RESOLVE, a later return to a previously seen model identity will not re-fire; only first transition to that identity is observed.
2. NON-BLOCKING — `runLivenessSweep` hardcodes question class `"standard"` for every distinct `register_version`. Multi-class register members would still stamp/sweep under the standard receipt only.
3. NON-BLOCKING — Initial QUERY is DB-time (`clock_timestamp()` in `startRun`); revisit QUERY timestamps still take caller `ask.as_of`. Sweep has no missing-QUERY wall-clock/`run.as_of` fallback (`HAVING max(query.occurred_at) IS NOT NULL`), so the rework root is fixed; revisit activity clock remains content-supplied.
4. NON-BLOCKING — Recorded `STALE` state events remain sticky after trigger RESOLVE until ARCHIVED/ARCHIVED_REVIVED; pure rejudge seam (`planAffectedReassessment` / `propagateAffectedNodes`) is correctly UNATTACHED by the walker.
