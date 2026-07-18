# Stopped-Path Product Proof Contract v1

Status: normative acceptance contract; no product proof is executed by this document
Contract identifier: `stopped-path-product-proof/v1`
Related input contract: `lifecycle-input-persistence/v1`

## 1. Purpose and boundary

This contract defines the evidence required to claim that DebateAI created an authentic stopped path through the normal product path and rendered that same state in the browser. It prevents a database row, API fixture, synthetic event, or staged screenshot from being presented as end-to-end product proof.

A conforming proof MUST establish one continuous causal chain:

```text
normal product stimulus
  -> authentic persisted score and evidence inputs
  -> correlated lifecycle decision
  -> normal lifecycle persistence
  -> product event observation
  -> product API serialization
  -> browser hide/restore behavior and visible stopping reason
```

The proof MUST use a newly isolated, explicitly non-product database. It MUST NOT read, copy, query, mutate, migrate, or delete a product/live database. The proof is acceptance evidence only; it does not authorize provider spend, product-data access, migrations, deletion, source edits, or deployment.

## 2. Normative terms

The key words MUST, MUST NOT, REQUIRED, SHOULD, and MAY are normative.

- **Proof run**: one bounded execution with one immutable manifest and one proof-run ID.
- **Isolated database**: a newly created database selected before the coordinator imports its database configuration, outside every configured product/live database location.
- **Normal product path**: supported browser, HTTP API, coordinator, worker, scoring, evidence, lifecycle, persistence, event, and serialization code used without replacement or interception.
- **Decision subject**: the exact `(debate_id, node_id)` whose path becomes stopped.
- **Qualifying stopped path**: a persisted node for which `path_status == "abandoned"`, `stopping_status == "abandon"`, and `stopping_reason` is a non-empty authentic policy reason.
- **Authentic lifecycle inputs**: persisted score and evidence inputs that map to `GroundedLifecycleInputs` under `lifecycle-input-persistence/v1` with complete source/run provenance.
- **Raw artifact**: bytes captured directly from the relevant boundary without manual rewriting, reconstruction, or normalization that changes meaning.
- **Audit artifact**: a derived, read-only report that names its source raw artifact and source hash.
- **Immutable artifact**: an artifact whose SHA-256 is recorded after capture and which is never edited in place afterward.

## 3. Absolute prohibitions

A proof is invalid if any of the following occurs:

1. Direct assignment to `Node.path_status`, `Node.stopping_status`, or `Node.stopping_reason` outside the normal lifecycle writer.
2. SQL, ORM, shell, migration, fixture, factory, or test helper seeding a stopped state or lifecycle decision.
3. SQL or ORM seeding of score inputs, evidence inputs, provenance, run identities, or a policy result for the decision subject.
4. Monkeypatching, dependency override, import replacement, function replacement, debugger mutation, browser route interception, service-worker interception, or fake clock used to force the result.
5. A fake API response, locally constructed DTO, edited event, replayed event from another run, or browser state injected through JavaScript/local storage.
6. A fake UI payload, Storybook/static component state, test fixture, source-test literal, or screenshot of non-product markup.
7. Reconstructed evidence: invented citations, rewritten source text, guessed hashes, synthetic evidence nodes, default evidence values, or a model assertion relabeled as verified evidence.
8. Neutral or default scores, including all-`0.5` inputs, standing in for an authoritative persisted score.
9. Calling the lifecycle mapper, exploration policy, lifecycle writer, serializer, or event bus directly from a proof script to bypass the product flow.
10. Reading or copying a product/live database for use as the isolated database.
11. Deleting, truncating, resetting, cleaning, or overwriting any database or evidence directory. A proof uses a new unique path and preserves its artifacts.
12. Editing raw JSON, SSE, database snapshots, screenshots, traces, logs, or hashes after capture.
13. Combining artifacts from different proof runs, debate IDs, node IDs, source identities, or source revisions.
14. Reporting success from tests alone, policy reachability alone, a database row alone, an API response alone, or browser appearance alone.

If a prohibited action is required to obtain a stopped path, the correct result is `NOT PROVEN`, with the blocker recorded. It is not permission to weaken this contract.

## 4. Authorization and safety preflight

Before the product process starts, the proof operator MUST create a preflight record containing:

- proof contract identifier and proof-run ID;
- exact source revision when clean, or content hashes for every relevant dirty source file when not clean;
- coordinator and web launch commands;
- database URL/path selected for the run;
- a denylist of known product/live database URLs and paths;
- an assertion that the selected path is not equal to, nested under, a symlink/junction to, or copied from any denied location;
- whether the selected database path already exists;
- API base URL and web URL;
- configured provider/model identities, with secrets redacted;
- explicit spend authorization reference if normal execution will make provider calls;
- expected debate mode and lifecycle configuration;
- operating-system time in UTC for evidence ordering only; and
- the names of all capture processes.

The selected database path MUST NOT exist before the proof run. Parent-directory creation is allowed; deleting or reusing an old database is not. Coordinator initialization MUST create the database through the normal startup path. The proof MUST stop before provider execution when spend authorization is absent or insufficient.

The API and browser MUST connect to the coordinator configured with this exact isolated database. The run MUST include a configuration capture proving that linkage without exposing credentials.

## 5. Required normal product stimulus

The proof stimulus MUST originate through a supported user/product boundary:

1. Start the normal coordinator and web application against the isolated database.
2. Open a fresh browser context with no mocked routes or persisted application state.
3. Create the debate through the normal web flow or its supported public HTTP endpoint.
4. Let normal coordinator routing, workers, scoring, evidence verification, lifecycle resolution, and persistence run without direct internal invocation.
5. Use only supported product interactions to wait for or request ordinary progress.
6. Observe the resulting state through the event stream, public debate API, and browser.

Calling `create_debate()`, `spawn_child_argument_jobs()`, `ExplorationPolicy.decide()`, `map_lifecycle_inputs()`, or persistence functions from a proof harness is not a normal product stimulus. Such calls MAY be used by automated tests, but those tests are not this product proof.

If a provider is part of the normal path, its real result and lineage MUST be retained. A provider timeout, parse failure, disabled verifier, same-lineage judge, or unavailable provider MUST remain pending/unverifiable and cannot be converted into grounded input.

## 6. Authentic lifecycle preconditions

Before the qualifying stop can count, the decision subject MUST have:

- a score snapshot accepted as authoritative under `lifecycle-input-persistence/v1`;
- an evidence snapshot accepted as authoritative under the same contract;
- exact debate and node correlation;
- exact current score input hash;
- exact active scoring-contract identity and contract hash;
- exact evidence source identity, including evidence node, claim node, generation, reference, content hash, and evidence kind;
- authentic source-record identity and producer identity;
- run ID, positive sequence, or both for each component;
- an explicit decision timestamp and schema version;
- fresh score and evidence at that timestamp; and
- semantic evidence status `grounded` for an abandonment decision.

The lifecycle decision record or downstream audit projection MUST retain the two component resolutions and all identities used. Missing, stale, malformed, mismatched, pending, or unverifiable inputs MUST preserve an active path and make the proof report `NOT PROVEN` rather than substitute a prior or neutral value.

## 7. Qualifying persistence predicate

The database proof for the decision subject MUST show all of the following in the isolated database:

```text
node.debate_id       == manifest.debate_id
node.id              == manifest.node_id
node.path_status     == "abandoned"
node.stopping_status == "abandon"
trim(node.stopping_reason) != ""
```

The same audit MUST correlate the node to the lifecycle decision and to the exact score/evidence snapshots described in section 6. The reason persisted on the node MUST equal the normal policy decision reason serialized by the product writer; a manually authored or post-processed reason is invalid.

Max-depth return, existing-child return, archived/stale status, failed job, hidden CSS, and an omitted node are not qualifying stopped paths. A policy unit test returning `abandon` without normal persistence is not qualifying persistence.

## 8. Required artifact set

All artifacts MUST live beneath one new proof-run directory. No artifact may be silently replaced. If capture must be retried, create a new attempt subdirectory and preserve the failed attempt.

### 8.1 Manifest and source evidence

Required:

- `manifest.json`: proof-run ID, contract identifiers, commands, URLs, isolated database path, source hashes, configuration hashes, capture start/end times, debate ID, node ID, and artifact inventory.
- `source-hashes.json`: SHA-256 for the lifecycle mapper, resolver/writer, policy, serialization, API, event, and rendered UI files actually executed.
- `authorization.json`: redacted references for database isolation and any provider spend authority.
- `processes.json`: process IDs, commands, start/end times, exit states, and bound ports for coordinator, web, workers, event capture, and browser capture.

A Git commit hash alone is insufficient when the tree is dirty. Relevant executed files MUST have content hashes.

### 8.2 Database before/after evidence

Required:

- `db-after-init.sqlite3`: immutable consistent snapshot after normal startup initialization and before debate creation.
- `db-after-product.sqlite3`: immutable consistent snapshot after the qualifying product run is quiescent.
- `db-audit.json`: read-only query results for the debate, decision subject, lifecycle fields, lifecycle decision/correlation records, score input, evidence input, source records, and run/sequence identities.
- `db-audit.stderr.log`: exact audit stderr.
- `db-hashes.json`: SHA-256 values for both snapshots and the live isolated database immediately before and immediately after the read-only audit.

Snapshots MUST be created with a consistent database backup mechanism while the source is quiescent; byte-copying a live WAL database without its required state is invalid. The audit MUST open the after snapshot read-only. Its before-audit and after-audit hashes MUST match, proving that the audit itself did not mutate evidence.

The expected difference between `db-after-init.sqlite3` and `db-after-product.sqlite3` is normal product activity. Immutability means each captured snapshot remains unchanged after capture; it does not mean the live isolated database cannot change during the product run.

### 8.3 API evidence

Required:

- `api-debate.raw.headers`: raw response status and headers from `GET /api/debates/{debate_id}`.
- `api-debate.raw.json`: raw response bytes from the normal coordinator API.
- `api-debate-audit.json`: derived locator showing the exact tree path to the decision subject and its `path_status`, `stopping_status`, and `stopping_reason`.

The API artifact MUST be captured after persistence and before browser acceptance capture. Its node ID and three lifecycle values MUST exactly equal the database audit. A web proxy MAY be used only if it is the normal browser path; if used, capture both the coordinator response and proxied response and prove semantic equality.

### 8.4 Event evidence

Required:

- `events.raw.sse`: the unedited SSE bytes received from `GET /api/debates/{debate_id}/events` for this run.
- `events-audit.json`: ordered event names, zero-based raw-stream ordinal, receive timestamp, payload hash, and the event that caused or carried observation of the stopped state.

The event capture MUST subscribe through the normal event endpoint; it MUST NOT read `event_bus` internals. The relevant event MUST correlate the same debate and node. When a normal event such as `tree_ready` carries a serialized tree, that payload MUST contain the same lifecycle values as the database and API. When the event only instructs the client to refresh, the audit MUST correlate its ordinal and receive time to the immediately following raw API refresh that first exposes the stopped state.

A reconstructed event or an event emitted directly by the proof harness is invalid. If no normal product event makes the transition observable to the browser, the event gate fails and the proof is `NOT PROVEN` until product wiring supplies one.

### 8.5 Browser evidence

Required from a fresh browser context using the normal web application:

- `browser-visible-before.png`: stopped path visible before the hide action.
- `browser-hidden.png`: same view after the supported control hides stopped paths.
- `browser-restored.png`: same view after the supported control restores them.
- `browser-reason.png`: detail view showing the real persisted stopping reason for the same node.
- `browser-dom.json`: browser-evaluated text/attributes and stable product locators for the decision subject and toggle at each state.
- `browser-network.har` or equivalent immutable request log proving the browser loaded the matching debate API/event stream.
- `browser-trace.zip` or equivalent action trace retaining navigation and hide/restore interactions.
- `browser-console.log`: complete console errors/warnings for the acceptance interval.

The sequence MUST prove all of these behaviors:

1. the qualifying stopped node is visible and identifiable;
2. its displayed reason is derived from the API `stopping_reason` and is not placeholder text;
3. the supported stopped-path control hides that exact node without deleting or mutating it;
4. the same control restores the exact node;
5. active paths are not accidentally hidden by the stopped-path control; and
6. the restored browser state still matches a fresh API read.

Screenshots alone are insufficient. DOM, network, and trace evidence MUST tie the pixels to the same debate ID and node ID. Browser scripts may inspect the rendered DOM for capture, but MUST NOT assign application state, intercept requests, or invoke internal component functions.

### 8.6 Logs and failures

Required:

- exact coordinator, web, worker, and capture-process stdout/stderr for the proof interval;
- a redacted provider request/response lineage index when provider execution was authorized;
- `failures.json`, including every failed attempt, retry, timeout, parse failure, browser error, and discarded candidate; and
- `artifact-hashes.json`, a SHA-256 inventory of every final raw and derived artifact.

Secrets and raw personal/product data MUST NOT be included. Redaction must be deterministic and documented; it MUST NOT alter IDs, hashes, statuses, reasons, timestamps, or fields used for acceptance.

## 9. Cross-surface correlation matrix

The final report MUST include a matrix with one row per identity and one column for database, lifecycle decision, API, event, and browser:

| Identity/value | Database | Decision | API | Event | Browser |
| --- | --- | --- | --- | --- | --- |
| proof-run ID | manifest linkage | audit linkage | capture linkage | capture linkage | trace linkage |
| debate ID | exact | exact | exact | exact | route/network exact |
| node ID | exact | exact | exact | exact or refresh-linked | DOM exact |
| schema version | exact | exact | audit reference | audit reference | not inferred |
| decision timestamp | exact | exact | if served | event ordering | trace ordering |
| score input hash | exact | exact | if served | audit reference | not inferred |
| scoring contract hash | exact | exact | if served | audit reference | not inferred |
| score run/sequence | exact | exact | if served | audit reference | not inferred |
| evidence content hash | exact | exact | if served | audit reference | not inferred |
| evidence run/sequence | exact | exact | if served | audit reference | not inferred |
| path status | `abandoned` | abandonment result | `abandoned` | same or refresh-linked | stopped visual state |
| stopping status | `abandon` | `abandon` | `abandon` | same or refresh-linked | stopped visual state |
| stopping reason | exact text | exact source | exact text | same or refresh-linked | exact displayed text |

`not inferred` means a surface is not expected to invent a backend identity it does not expose. The value must still be joined through raw network artifacts to the same node. Any conflicting non-empty value fails the run.

## 10. Immutable audit procedure

After the product reaches a quiescent state:

1. Stop new user actions and record the quiescence criterion.
2. Capture the final consistent database snapshot through the approved isolated-database backup method.
3. Hash the snapshot before audit.
4. Open the snapshot in enforced read-only mode.
5. Produce `db-audit.json` using SELECT-only statements recorded in `audit-queries.sql` or equivalent source.
6. Close the audit connection.
7. Hash the snapshot again and require equality with step 3.
8. Capture raw API and event files without editing them.
9. Complete the browser visible/hide/restore/reason sequence.
10. Hash every artifact and then write a final manifest that references those hashes.
11. Hash the final manifest and never edit it in place. A correction creates a superseding manifest with explicit lineage; it does not replace the original.

The audit tool MUST reject any non-read-only database open. It MUST NOT issue PRAGMA or maintenance statements that can write, checkpoint, vacuum, migrate, repair, or normalize the database.

## 11. Acceptance gates

A run is `PROVEN` only when every gate is green:

1. **Isolation gate**: selected database was new, non-product, startup-created, and never confused with a denied database.
2. **Normal-path gate**: no direct service/policy/mapper/writer invocation or interception was used as product stimulus.
3. **Input-authenticity gate**: score and evidence are grounded, fresh, exactly correlated, and provenance-complete under `lifecycle-input-persistence/v1`.
4. **Persistence gate**: the qualifying stopped-path predicate and exact decision/source correlations exist in the immutable database audit.
5. **API gate**: raw API response contains the same node and exact lifecycle values.
6. **Event gate**: raw normal event evidence carries or causally precedes the API observation for the same transition.
7. **Browser gate**: fresh browser evidence proves visible reason plus hide and restore of the same stopped node while preserving active paths.
8. **Consistency gate**: database, decision, API, event, and browser values agree; timestamps/ordinals form a possible causal order.
9. **Immutability gate**: before/after snapshots, read-only audit hashes, raw artifacts, and final artifact inventory verify without mutation.
10. **Honesty gate**: logs and `failures.json` disclose all attempts and contain no forbidden shortcut, hidden provider failure, or reconstructed evidence.
11. **Regression gate**: the separately authorized automated acceptance suite passes on the exact executed source.

A waiver, planning approval, unit-test pass, code-review pass, or policy-reachability demonstration MUST NOT be labeled `PROVEN`. If acceptance chooses to waive a missing gate, the outcome is `ACCEPTED BY EXPLICIT WAIVER`, naming each missing gate; it remains distinct from product proof.

## 12. Required final report

The final report MUST state exactly one outcome:

- `PROVEN`
- `NOT PROVEN`
- `ACCEPTED BY EXPLICIT WAIVER`

It MUST include:

- proof-run ID and contract identifiers;
- source/configuration hashes;
- authorization references and confirmation of no product database access;
- debate ID and node ID;
- qualifying database predicate values;
- lifecycle input and decision correlations;
- the cross-surface matrix from section 9;
- artifact directory and final manifest SHA-256;
- exact commands and exit codes;
- failed attempts and known caveats;
- each acceptance gate with `PASS`, `FAIL`, or `WAIVED`; and
- a statement that no direct lifecycle assignment, SQL/ORM seeding, monkeypatch, fake UI payload, reconstructed evidence, deletion, or product/live database action occurred.

A `NOT PROVEN` result MUST preserve the evidence collected and identify the smallest missing normal-product capability. It MUST NOT recommend seeding or direct mutation as a substitute.

## 13. LIP-00 non-execution statement

LIP-00 defines this contract and the pure lifecycle-input contract only. It does not run a product proof, alter orchestration, add persistence, change APIs/events/UI, call providers, or access any database. A later explicitly authorized ticket owns implementation wiring, and a separate later acceptance ticket owns execution of this proof against an isolated non-product database.
