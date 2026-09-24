# CONSOLIDATED findings — 2026-09-01 security hardening (orchestrator triage)

Filled after all seven lane files exist (PLAN §3 A.8). Columns: lane id → mission id, severity after re-grade (PLAN §1.5), disposition FIX-NOW / ASK-V / DEFER, fix task.

| Lane ID | Mission ID | Sev | Disposition | Title | Fix task |
|---|---|---|---|---|---|
| L1-F1 | HIGH | FIX-NOW | No per-user spend/rate control on POST /v1/asks | B10 |
| L1-F2 | MEDIUM | FIX-NOW | Anonymous public reads unlimited, 100 decrypts/call | B10 |
| L1-F3 | MEDIUM | FIX-NOW | recovery/start has no per-source limiter | B25a (V-12) |
| L1-F4 | MEDIUM | FIX-NOW | Malformed/oversized bodies → 500; 1 MiB limit on auth routes | B5 |
| L1-F5 | LOW | FIX-NOW | 400 envelope leaks zod issue list | B25b |
| L1-F6 | LOW | FIX-NOW | Framework 404/414 envelopes bypass typed shape, echo param | B25c |
| L1-F7 | LOW | FIX-NOW | gapRef unbounded free text | B25d |
| L2-F1 | MEDIUM | FIX-NOW | Dev custody under OneDrive (inventory) | B4 |
| L2-F2 | MEDIUM | FIX-NOW | B4 resolver gaps (markers, realpath, regex, message) | B4 (amended) |
| L2-F3 | MEDIUM | FIX-NOW | pg_dump-only backup cannot restore encrypted runs; no escrow | C3 (amended) |
| L2-F4 | LOW | FIX-NOW | localeCompare in audit canonical form | B12 |
| L2-F5 | LOW | FIX-NOW | Binding/rate keys reuse the blind-index key | B13 |
| L2-F6 | LOW | FIX-NOW | Production key loaders follow symlinks, no uid/nlink | B14 |
| L2-F7 | LOW | FIX-NOW | KEK never zeroised; read buffers not zeroed | B15 |
| L2-F8 | LOW | FIX-NOW | Key-domain check only when publication enabled | C1 amendment (crypto lane) |
| L2-F9 | LOW | FIX-NOW | Argon2 breaker latches forever unobserved | B17 |
| L2-F10 | LOW | FIX-NOW (doc) | Audit IP salt is a key: keep out of DB backups | C3 (escrow) |
| L2-F11 | LOW | ASK-V | KEK rotation structurally impossible (no kek_id) | V-3 / B18 |
| L2-F12 | INFO | FIX-NOW | Unkeyed shared token hash across token kinds | B19 |
| L3-F1 | MEDIUM | FIX-NOW | Proxy buffers unbounded request bodies | B23 |
| L3-F2 | MEDIUM | FIX-NOW | Unmatched Upgrade sockets never closed | B23 |
| L3-F3 | LOW | FIX-NOW | CSP unsafe-inline; B9 gaps | B9 (corrected) |
| L3-F4 | LOW | FIX-NOW | /_next/image live with sharp | B9 (images.unoptimized) |
| L3-F5 | LOW | FIX-NOW | SSR cookie value not grammar-checked | B23 |
| L3-F6 | LOW | FIX-NOW | Positional trust of x-debateai-client-ip | B23b |
| L3-F7 | LOW | FIX-NOW | content-length vs content-encoding mismatch | B23b |
| L3-F8 | LOW | FIX-NOW | Enrolment token in query string | B27 |
| L3-F9 | LOW | FIX-NOW | X-Powered-By | B9 |
| L3-F10 | INFO | FIX-NOW | Dead NEXT_OUTPUT_EXPORT knob | B9 |
| L3-F11 | LOW→MEDIUM(VPS) | FIX-NOW | Everyone is 127.0.0.1 behind a proxy | C2 + C2b |
| L3-F12 | LOW | FIX-NOW | Proxy fetch without abort/timeout | B23 |
| L4-F1 | MEDIUM | ASK-V (handoff) | Runner concatenates instructions + model output | V-11 |
| L4-F2 | HIGH*/MEDIUM | FIX-NOW | Prompt size unbounded on runner path | B26b |
| L4-F3 | MEDIUM | FIX-NOW | Provider response unbounded before parse | B26a |
| L4-F4 | MEDIUM | ASK-V (handoff) | Model text leaks via failure payloads/stderr | V-11 |
| L4-F5 | MEDIUM | FIX-NOW | Hatchet TLS none accepted everywhere | C1 |
| L4-F6 | LOW | ASK-V (handoff) | Workflow input unvalidated | V-11 |
| L4-F7 | LOW | FIX-NOW | http: provider base_url to any host | C1 |
| L4-F8 | LOW | FIX-NOW (partial) | Attempt loop: no backoff, ceiling checked once | B26c |
| L4-F9 | LOW | ASK-V (handoff) | Claim window vs run length | V-11 / live-loop |
| L4-F10 | LOW | ASK-V (handoff) | Provider model identity unchecked | V-11 |
| L4-F11 | LOW | ASK-V (handoff) | Unversioned composer/conformance envelopes | V-11 |
| L4-F12 | INFO | DEFER | Evaluator-worker unwired library | none |
| L5-F1 | LOW | FIX-NOW | 27 definer functions PUBLIC EXECUTE | B22 |
| L5-F2 | HIGH | FIX-NOW (coordinated) | serve.answer verdict text plaintext for encrypted runs | B21 |
| L5-F3 | MEDIUM | FIX-NOW | No sslmode enforcement in any loader | C1 (extended) |
| L5-F4 | MEDIUM | FIX-NOW | TRUNCATE guards 23/101 | B22 |
| L5-F5 | MEDIUM | FIX-NOW | CONTENT_ENCRYPTION_ENABLED defaults false, no prod floor | C1 |
| L5-F6 | MEDIUM | FIX-NOW | C3 per-role search_path breaks provisioner | C3 (corrected) |
| L5-F7 | MEDIUM | FIX-NOW | C3 pg_hba vs Docker bridge contradiction | C3 (native Postgres) |
| L5-F8 | LOW | FIX-NOW | Backup/drill design gaps | C3 (corrected) |
| L5-F9 | LOW | DEFER (post-sync) | Migration ledger has no content checksum | B28 |
| L5-F10 | LOW | FIX-NOW | 14 invoker functions without search_path | B22 |
| L5-F11 | LOW | FIX-NOW | Credentials in SQL text during provisioning | C3 (log_statement none) |
| L5-F12 | INFO | DEFER | No RLS; app-enforced ownership | Phase 3 programme |
| L6-F1 | MEDIUM | FIXED | pnpm audit findings (re-graded) | B1 |
| L6-F2 | LOW | FIXED | esbuild 0.24.3 does not exist | B1 (0.28.1) |
| L6-F3 | MEDIUM | FIX-NOW | minimumReleaseAge not set | B24a |
| L6-F4 | MEDIUM | ASK-V | Default branch main is stale | V-5 (+B24b) |
| L6-F5 | MEDIUM | ASK-V | No branch protection, no org 2FA | V-6b |
| L6-F6 | MEDIUM | ASK-V | Secret scanning/PVR/Dependabot updates off | V-2/V-6b |
| L6-F7 | LOW | FIX-NOW | Actions not SHA-pinned | B24e |
| L6-F8 | LOW | ASK-V | 527 MB tracked traces/transcripts, usernames | V-7 |
| L6-F9 | LOW | FIXED | Phantom web importer, nested lockfile | B1 |
| L6-F10 | LOW | FIX-NOW | Floating ranges in apps/ui | B24f |
| L6-F11 | LOW | ASK-V | Dormant husky hooks | V-8 |
| L6-F12 | LOW | FIX-NOW | Unknown build scripts skipped silently | B24a (strictDepBuilds) |
| L6-F13 | LOW | FIX-NOW (partial) | Node 25 vs engines 22; jsdom excludes 25 | B24c (.nvmrc) |
| L6-F14 | LOW | FIX-NOW | postgres image not digest-pinned | B24d |
| L6-F15 | INFO | none | Lockfile integrity complete | none |
| L7-F1 | MEDIUM | FIX-NOW | TLS front door teardown hangs/crashes | B29a |
| L7-F2 | MEDIUM | FIX-NOW | Static Postgres superuser reused by hatchet-lite | B29b |
| L7-F3 | MEDIUM→LOW | FIX-NOW | Hatchet seeded admin login, no override | B29c |
| L7-F4 | LOW | FIX-NOW | vLLM without --api-key | B29c |
| L7-F5 | LOW | FIX-NOW | 1-year Hatchet dev token, no rotation | B29e |
| L7-F6 | LOW | FIX-NOW | Graceful shutdown has no deadline/escape | B29d |
| L7-F7 | LOW | FIX-NOW | Recipient e-mail on sendmail argv | B25e + B27 |
| L7-F8 | LOW | FIX-NOW | Mail-capture spool never pruned | B27 |
| L7-F9 | LOW | FIX-NOW | Front-door hop-by-hop/chunked hygiene | B29f |
| L7-F10 | LOW | FIX-NOW | Custody parent-dir policy inconsistent | B4 + B29e |
| L7-F11 | INFO | applied | Plan corrections for B3/B4 | done |

Totals: HIGH 2 (L1-F1, L5-F2; L4-F2 conditional) · MEDIUM 25 · LOW 47 · INFO 8. Dispositions: FIX-NOW 62 · ASK-V 15 · DEFER 3 · FIXED 3.
