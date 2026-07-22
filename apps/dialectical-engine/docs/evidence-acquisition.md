# Evidence acquisition (P1.1)

The first **real retrieval** path in the dialectical engine. Before this,
every `EVIDENCE` node was a regex-extracted substring of the generating
model's own prose (`app/evidence/extraction.py`), so `evidence_quality` was
structurally 0 and the verdict evidence gate could never flip. Evidence
acquisition adds a `v2_evidence` job type that asks a **search-capable worker**
to retrieve independent sources for evidence-eligible claims and materializes
them as `EVIDENCE` nodes with genuine retrieval provenance.

Retrieval rides the CLIs the system already runs — no new API keys. The Claude
loop worker's `claude -p` invocation gains `--allowedTools WebSearch` for
`v2_evidence` jobs (`scripts/subscription_loop.py::claude_once`); all other job
types and other CLIs are untouched.

## Feature flags & budgets

| Env var | Default | Meaning |
| --- | --- | --- |
| `DIALECTICAL_EVIDENCE_ACQUISITION` | **off** | Master gate. Off ⇒ no `v2_evidence` job is ever queued; POV/expand completion is byte-identical to the pre-Task-10 flow. |
| `DIALECTICAL_EVIDENCE_SEARCH_MODELS` | `claude-sonnet-5-high-loop` | Comma-separated, ordered list of search-capable models. Evidence jobs round-robin over the **online** subset and fail over **only** within this set. |
| `DIALECTICAL_EVIDENCE_MAX_PER_NODE` | `2` | Max `v2_evidence` jobs per argument node (clamped 0–20). |
| `DIALECTICAL_EVIDENCE_MAX_PER_DEBATE` | `6` | Max `v2_evidence` jobs per debate (clamped 0–200). |

One job returns **at most 3 sources** (`EVIDENCE_MAX_SOURCES_PER_JOB`), i.e. up
to 3 `EVIDENCE` nodes per completed job.

## Eligibility

A claim is evidence-eligible when the **same deterministic claim-type
classifier scoring uses** (`app.scoring.normalizer.classify_claim_type`)
returns `empirical` or `causal` for the node's active-generation prose. Every
other type (normative, definitional, comparative, prediction, mixed, unknown)
is skipped. Eligibility, budgets, and model choice all run inside
`dialectical_v2.maybe_queue_evidence_job`, which is **best-effort**: a queueing
failure never damages the POV/expand completion that called it.

## Flow

```
v2_pov / v2_expand completion
  └─ materialize_*  ─ per completed argument node ─►
       _extract_and_maybe_acquire_evidence(node)
         ├─ extract_and_persist_evidence_for_completed_node   (always on; method "model-claim")
         └─ maybe_queue_evidence_job(node)                    (flag-gated)
              ├─ flag off? claim not empirical/causal? budget hit? ─► no job
              └─ choose_evidence_model (round-robin online search models)
                   └─ queue v2_evidence job (role "v2_evidence", pinned model)

worker (Claude loop, --allowedTools WebSearch) runs the search
  └─ POST /complete  ─► complete_v2_worker_job("v2_evidence")
        ├─ validate_evidence_contract           (strict; malformed ⇒ retryable failure)
        ├─ materialize_evidence_nodes           (EVIDENCE nodes, method "retrieval", positions 2000+)
        ├─ record_provenance("retrieval_evidence")
        ├─ publish "evidence_acquired"
        └─ trigger_citation_resolution(node_ids)  (fire-and-forget thread)
              └─ per node: SSRF-guarded httpx GET ─► stamp resolution_status
```

Evidence jobs do **not** block synthesis: `v2_evidence` is absent from the
whole-tree quiescence set (`V2_GENERATION_JOB_TYPES`), so a debate synthesizes
on its POV/expand tree while retrieval proceeds asynchronously.

## Source contract

Workers return exactly one strict JSON object:

```json
{
  "sources": [
    {
      "url": "https://…",              // canonical http/https URL, SSRF-safe
      "quote": "verbatim ≤300 chars",  // copied from the source, non-empty
      "publisher": "site/org name",     // non-empty
      "date": "2023-05-01",             // ISO date or null
      "retrieval_query": "…",           // the query searched
      "stance": "supports"              // supports | refutes | mixed
    }
  ],
  "provenance": {"model_id": "…", "worker_id": "…", "prompt_id": "…", "job_id": "…"}
}
```

`validate_evidence_contract` mirrors `validate_pov_contract`'s strictness:

- `≤3` sources; more ⇒ `ValueError` ⇒ retryable failure.
- Each source must have a fetchable http(s) URL (`evidence_url_is_safe`), a
  non-empty quote (truncated to 300 chars), a publisher, and a valid stance.
- Provenance (`model_id`/`worker_id`/`prompt_id`/`job_id`) is always required.
- An **empty** `sources` list is a valid, honest "found nothing" completion (0
  `EVIDENCE` nodes) — not a failure.

Materialized metadata (stored in `Node.evidence_metadata`, DB column
`metadata`): `{method: "retrieval", url, quote, publisher, date,
retrieval_query, stance, resolution_status}`. The regex extractor stamps its
nodes with `method: "model-claim"` at their creation site, so the two evidence
sources coexist and independence bookkeeping (plan P1.5 / Task 13) can tell
them apart. Retrieval evidence uses the reserved position band `2000+`;
extractor evidence uses `1000+`; argument children use `0,1` — they never
collide.

## Citation resolution statuses

After completion, a fire-and-forget thread (`trigger_citation_resolution`,
same pattern as `trigger_internal_scoring_after_completion`) fetches each
source URL with an async httpx client (15 s timeout, ≤3 redirects, ~1 MB
response cap) behind an SSRF guard (http/https only, standard ports only,
refuses `localhost`/`*.localhost` and any loopback/private/link-local/reserved
IP literal). It stamps `resolution_status`:

| Status | Meaning |
| --- | --- |
| `pending` | Set at materialization, before the check runs. |
| `resolved_quote_found` | Fetched OK and the quote's normalized first 80 chars appear in the page text. |
| `resolved_quote_missing` | Fetched OK but the quote was not found. |
| `unreachable` | SSRF-refused, non-2xx, oversize, timeout, or transport error. |

The check is best-effort: any failure only stamps a status — it never fails
the job or the node.

## Failure posture: AUXILIARY

`v2_evidence` is an **AUXILIARY** job type
(`orchestrator.AUXILIARY_JOB_TYPES`). It is a generation-class job (deadline
floor) and a failover job (ladder over the search-capable list only), but it is
**neither node-degradable nor debate-fatal**. When the failover ladder is
exhausted, `terminalize_job_failure` records the job-ledger entry, emits an
`evidence_unavailable` SSE note, and **leaves the node complete and the debate
untouched** — a claim simply ends up with no retrieval evidence. When no search
model is online, jobs stay `pending` (their role is unrouted, so the reroute
sweep never moves them onto a non-search model) until one comes online.

## ⚠️ Flip-order warning

**`DIALECTICAL_VERDICT_EVIDENCE_GATE` must stay OFF** until acquisition **and**
verification demonstrably populate evidence (plan §1.2/§3.6). Acquisition
(this task) only *retrieves and resolves* sources; it does not *verify*
entailment or feed DF-QuAD. Turning on the verdict evidence gate before the
verifier (Task 11) and DF-QuAD wiring (Task 12) land would gate verdicts on an
`evidence_quality` signal that is still structurally near-zero. Enable in order:
acquisition → verification → DF-QuAD → then flip the gate using the
flip-readiness shadow telemetry.
