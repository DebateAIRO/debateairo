# S10 carrier and derived-data retirement inventory

Status: implemented carrier/lease inventory with focused RED→GREEN receipts. This packet makes no legal-compliance, anonymity, physical-media, RAM, provider, swap, core-dump, or backup-erasure claim.

## Required invariant

For a new encrypted run, no durable controller-readable field may expose private content, permit an offline plaintext guess, or provide a deterministic equality relation to another run or carrier after the run key is destroyed. Encrypted question indexes are `NULL`; lookup uses a bounded owner-scoped decrypt/normalize/compare scan. Envelope-backed integrity fields are computed by the database from canonical encrypted-envelope bytes after a run/carrier/row/purpose-bound MAC is verified. Content-derived fields without an envelope are overwritten with a fresh opaque database value. Values are not copied between carriers.

The MAC secret is a one-way HMAC derivation from the external run content key. Only the distinct content-provision capability can create the run and seed this non-decrypting secret; ordinary runtime, authorization, erasure, and publication roles cannot execute the provision saga or read/mutate the secret table. Private/account PREPARE deletes the secret under the content lease before key destruction. A backup retaining this non-decrypting secret is an integrity-boundary residual, not a confidentiality key: it cannot decrypt an envelope or recompute a plaintext guess, but possession by a database controller would weaken the forward envelope-authenticity claim.

The key-destruction claim is limited to durable secret-store absence and fresh-process unreadability. Public publication snapshots are a separate corpus-key domain and remain intentionally readable.

## Derived-carrier disposition

| Durable field / path | Pre-S10 failure | Landed boundary | Focused witness |
| --- | --- | --- | --- |
| `ledger.raw_artifact.parse_error` | Node JSON errors echoed malformed private output beside ciphertext | Detailed diagnostic is inside the raw-artifact AEAD payload; plaintext is only `CONTENT_PARSE_FAILED` or `CONTENT_SCHEMA_FAILED` | Distinctive email/question absent from full DB row and checkpointed data directory; owner decrypt recovers detail before shred |
| `ledger.raw_artifact.input_hash` and `ledger.ledger_entry.input_hash` | Same prompt digest copied across rows | Raw-artifact value is a database digest of its authenticated, row-bound encrypted envelope; envelope-less ledger-entry value is fresh opaque randomness | Same low-entropy input is unequal across rows and absent bytewise from DB/data-dir |
| `ledger.raw_artifact.content_hash` | Unkeyed digest of raw model text | Database digest of the authenticated encrypted envelope with a distinct purpose binding | Low-entropy output is not confirmable from retained DB bytes |
| `ledger.propagation_run.input_hash` and `graph_fingerprint` | Unkeyed content/graph commitments | Both envelope-less values are independently overwritten with fresh opaque database randomness | Version trigger and cross-purpose inequality receipt |
| `evidence.query_set.content_hash` | Unkeyed digest of private queries | Database digest of the authenticated query-set envelope bound to the query-set row | Identical content is unrelated across rows/runs; private bytes are absent from DB/data-dir |
| `memory.question_key.frozen_query_set_hash` | Copied query-set hash | Database digest of the independently encrypted/authenticated memory-row envelope; `NULL` remains `NULL` | Evidence-to-memory equality is false |
| `serve.fact_bundle.content_hash` | Deterministic fact-bundle digest | Database digest of the authenticated fact-bundle envelope bound to the fact-bundle row | Same facts are not an offline oracle |
| `memory.pull_record.content_hash` | Copied fact-bundle hash and prior pull hash | Database digest of each independently encrypted/authenticated pull envelope | Fact-bundle-to-pull and pull-to-pull equality are false |
| `core.critique_packet` fingerprint/context hashes | Unkeyed packet/content commitments | All three envelope-less fields are independently overwritten with fresh opaque database randomness | Same low-entropy input produces three unrelated stored values |
| `evaluator.pipeline_event.input_hash` | Unkeyed shared prompt commitment | Envelope-less value is overwritten with fresh opaque database randomness for an encrypted run | Role-switched copied/arbitrary bytes do not survive the trigger |
| Run and memory QBI v1 | Retired global key still left a durable equality oracle | Fresh encrypted rows persist `question_blind_index=NULL` and explicit version 2; all SQL equality lookup is retired; 0040 fails closed on every encrypted v1 row | Same question in two runs and core-vs-memory yields `[NULL,NULL,NULL]`; seeded v1 preflight is refused |
| Completed private tombstones | Candidate scans selected the keyless erased row | SQL excludes pending intents and completed tombstones before external key I/O; lease revalidates again | Erased sibling is never key-loaded and active sibling remains readable |

## Adjacent-field classification

| Family | Classification and boundary |
| --- | --- |
| Ledger propagation JSON | Opaque graph refs, closed enums, numeric reductions, and policy rows. Private claim/provider prose remains in encrypted carrier rows. |
| Evidence source | Locator, archived version, public-source integrity hash, and quote/number refs are intentional C4 public-source provenance. Private query, amendment, excerpt, and absence prose remains in the four evidence envelopes. This provenance is outside the private-content irrecoverability claim. |
| Evaluator per-run | Addon/tagger/harvest pipeline input is v2. Shadow-seat input, profile/rank, relative-cost, and model-usage derivations contain only model/provider IDs, policy rows, numeric observations/counts, closed enums, and opaque refs—not question/node/raw/provider prose. |
| Cross-run evaluator | Only current public corpus presentation fields enter one call through the type-distinct `PublicAggregateProvider`. Its production factory immutably binds the register-validated local endpoint, provider ref, maker, isolated deployment family, and configured consumer model; per-run calls cannot supply or override those labels. Each DB-selected job model is checked before HTTP and the OpenAI-compatible response model is checked before acceptance. The factory uses the low-level relay under publication-domain leases and has no private-run cipher, ledger, or raw-artifact dependency. The shared consumer row has no raw-artifact ref or sample/adjacent arrays and retains only aggregate counts. Fewer than three current-public samples returns `CONSUMER_INSUFFICIENT_PUBLIC_SAMPLE`. |
| Settlement/budget ledger | For an encrypted run, the database overwrites each envelope-less `ledger.ledger_entry.input_hash` with a fresh opaque v2 value. Scorecard derivations are numeric/closed-enum aggregate facts and opaque row refs. |
| Diagnostics/metadata | Parse detail is encrypted. Plaintext parse status, retry reason, timeout/outcome, usage, and scope values are closed operational codes/numbers. Public corpus metadata is separately classified C4. |

## Fourteen private envelope carriers

The complete physical-row inventory is `core.run`, `core.node`, `core.stranger_restatement`, `ledger.raw_artifact`, `serve.fact_bundle`, `serve.composed_text`, `ledger.node_review`, `memory.question_key`, `memory.pull_record`, `core.investigation_request`, `evidence.query_set`, `evidence.query_amendment`, `evidence.evidence_item`, and `evidence.absence_row`.

The focused integration receipt scans complete rows, not just sentinel columns, injects malformed content and low-entropy duplicate input, checkpoints PostgreSQL, scans `data_directory`, proves every locator version is 2 and required equalities are absent, then destroys the run key and proves all envelopes fail in a fresh key load. It does not claim erasure of PostgreSQL WAL/backups or physical media.

## Lease coverage inventory

Every path that loads a prepared private run cipher, decrypts a private run carrier, or sends private plaintext to a provider uses the session-level run lease protocol. Covered surfaces are DB run projections, graph replay/write, liveness, memory candidate/read/write/disclosure, serve read/render/index/write, judgement carrier reads/writes, evaluator addon/tagger/harvest, evidence, ledger, critique, settlement, API publish assembly, evaluator-worker tagging, and runner orchestration/provider gateway. Multi-run operations acquire sorted run leases.

The lease is held on a dedicated PostgreSQL connection across external key load, decrypt, local plaintext use, provider call, carrier persistence or response construction, second liveness validation, prepared-key zeroization, and unlock. Re-entrant calls borrow the same lease through `AsyncLocalStorage`; they do not open a second advisory-lock session. Private/account PREPARE acquires the same sorted leases before row locks and makes the tombstone visible before releasing them. No external key-store or provider I/O occurs while database row locks are held. Public corpus decrypt uses only the corpus-key domain.

Focused receipts force pauses after key load and after decrypt, inspect the competing erasure backend's advisory wait, cover reader-win and erasure-win orders, prove prepared-key buffers are zeroized, terminate a private-run lease-holder backend and reacquire from a fresh connection, deny fresh-process reads after shred, and keep a sibling run readable. A separate PostgreSQL receipt terminates the backend holding a publication lease during public provider work, proves cleanup cannot destroy the publication key while the holder is alive, then proves a successor acquires the namespace, durably destroys the key, and persists no evaluator output from the failed call.
