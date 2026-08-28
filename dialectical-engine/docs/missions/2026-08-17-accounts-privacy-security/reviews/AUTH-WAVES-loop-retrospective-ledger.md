# Auth-wave implementation loop — running retrospective ledger

Status: **LIVE; append-only observations until the wave closes**  
Owner request: retain detailed evidence of what worked, what did not, and how to improve this coding/review loop.

This is process evidence, not a product-readiness claim. The final retrospective must preserve unsuccessful attempts and distinguish the categories below rather than flattening every RED into a product defect.

## Accounting rules

- Record implementation elapsed time separately from reviewer elapsed time.
- Distinguish genuine product/design defects, test-fixture defects, stale assertions, sandbox/permission failures, TTY/reviewer-tool failures, and expected mutation REDs.
- Record whether a reviewer found an issue the author missed, repeated already-supplied evidence, or spent more time than the implementation.
- Preserve the first failing condition and the final fixed invariant; do not report only the final GREEN command.
- Track expensive broad runs, interrupted/hung processes, reruns, and whether a narrower deterministic gate would have provided the same confidence.
- Never treat a sandbox denial, missing host permission, or reviewer UI failure as a product regression.

## Observations retained so far

### Earlier local-auth tranche

- **DEV-03:** Grok found a genuine concurrent first-invocation race. The review added product value; the implementation needed a structural concurrency repair rather than a test waiver.
- **DEV-04:** review identified a portability problem in the test environment rather than a production defect. The test-only repair was valid, but the review cost exceeded the implementation cost.
- **DEV-05:** the implementation reached complete register coverage, exact sealed-state reuse/drift refusal, authority separation, and concurrency evidence. Grok independently returned `GREENLIGHT` with four nonblocking P2 debts.

### DEV-05 review orchestration

- The first schema/single-shot Grok attempt returned without inspecting files and produced no usable verdict.
- A headless agentic retry failed with `Device not configured`.
- The successful PTY review required a trust/DSR interaction; the approval interaction also enabled Grok's always-approve mode for that session. The actions remained read-only, but the control was broader than the task required.
- The successful review took **12m41s** and independently reran a supplied focused gate (`7/7`). Verdict restatement took a further **20s** because the TUI did not surface the captured final text reliably.
- Improvement candidate: pass an explicit bounded command budget and a receipts-first rule; require independent reruns only when the reviewer identifies a concrete evidence gap.

### DEV-06 implementation, current

- The reproduce-first gate was non-vacuous: `3` assertions failed because `deploy/dev-auth/sendmail-capture.mjs` did not exist; the pre-existing topology assertion remained GREEN.
- The first implementation gate exposed a genuine portability defect in the new custody check: comparing the full canonical path rejected macOS's safe `/var` → `/private/var` alias. The repair narrowed ownership to the exact spool leaf (non-symlink directory, current owner, exact mode), which is the boundary the executable owns.
- Current focused status at this ledger update: `5/5` GREEN for production-sender verification capture, opaque UUID naming, exact modes, silent output, unsafe-mode refusal, symlink refusal, bounded input, no-network source, and topology wiring.
- The first `pnpm lint` attempt failed before repository analysis because the sandbox denied `tsx`'s local IPC socket (`listen EPERM`). The byte-identical host-permitted rerun was GREEN (`28` edges, zero violations; zero source blockers). Classify this as environment/tooling friction, not a product or test failure.
- The first bounded headless Grok review failed in its `read_file` tool channel and exited without a verdict. The interactive fallback completed the substantive review in **5m42s** and the same-session no-tool restatement took **9.1s**.
- The interactive review required approval for one read-only hash/mode command despite `--permission-mode dontAsk`; pressing Enter again enabled session-wide always-approve. This is a recurring reviewer-permission UX hazard. No edit occurred.
- Unlike DEV-05, Grok consumed the supplied receipts and did **not** rerun tests. It independently reconciled hashes/mode and returned `GREENLIGHT`, no P0/P1, with five P2 evidence/ergonomics debts and three P3 hardening notes. This receipts-first behavior reduced redundant compute even though analysis time still exceeded the focused implementation gate.

### DEV-07 implementation and workstation boundary

- Re-reading all four planning waves did not change their tick/X classification: Waves 1–4 remain completed planning artifacts, Phase 1 remains implemented, and the local-auth stack remains incomplete. DEV-07 is the next small Kanban atom within that existing ✗ row rather than a new wave.
- The initial focused RED was clean and fast (**0.69s**): the integration suite could not import either missing executable and both architecture assertions failed on missing source/runbook. No existing test failed.
- The first implementation attempt produced `2/4` GREEN and two distinct evidence failures. Loopback bind failed with sandbox `EPERM` (environment-only); the runbook's sentence warning users *not* to set an insecure environment variable contained the exact forbidden literal and therefore failed its source assertion (test/document wording defect, not product behavior).
- The implementation pass found and repaired two author-side design issues before review: a randomly named generation lock did not serialize concurrent certificate creation, and a WebSocket response path initially stripped the `Connection`/`Upgrade` headers required by the private Next development server. Both were structural code defects caught by self-review, not by Grok.
- Root typecheck then found two `IncomingHttpHeaders` test-union errors (`string | string[] | undefined`); production behavior was unchanged. The focused restored gate is `5/5` GREEN and covers exact SAN/mode/reuse, no trust installation, exact Origin/Host, Secure-cookie pass-through, forged forwarding-header removal, wrong-Host/plain-HTTP refusal, and the Next WebSocket upgrade.
- The Origin-rewrite mutation was non-vacuously RED: changing the front door to replace `http://localhost:<port>` with the trusted HTTPS Origin caused the fake API to return `200` plus a Secure `__Host-` session cookie instead of the expected `403`; exact source restore returned `5/5` GREEN and the original SHA-256.
- The affected DEV-01–07 gate completed `33/33` GREEN in **13.46s**. Repository architecture/source lint was GREEN (`28` edges, zero violations; zero source blockers). Running these together was effective: it covered all local-auth helper contracts without invoking the much larger unrelated suite.
- Homebrew installation of `mkcert` completed in **17.7s** and also triggered a Homebrew metadata auto-update. The subsequent `mkcert -install` request was correctly rejected by the approval boundary because installing a persistent local CA changes the workstation trust store system-wide and V had not explicitly approved that blast radius. No workaround or TLS weakening was attempted. This is an authorization boundary, not a product/test failure; trusted-browser evidence and final Grok review remain pending explicit approval.
- The first bounded headless Grok path again failed to yield a usable verdict, so the review moved to one interactive `grok-4.6` session. Grok spent **7m20s** inspecting the frozen files and receipts. A one-time approval for its first read-only reconciliation command worked as intended; the same key sequence at a second read-only prompt was misregistered by the TUI and cancelled the completed analysis turn. No repository edit occurred. This is reviewer-interface/custody friction, not a product or test failure.
- The same Grok session recovered without restarting the substantive review. A no-tool synthesis took **46.7s**, and a requested compact restatement took another **13.3s**. Both completed successfully, but the TUI failed to display the final text. The exact responses were recovered read-only from that session's `chat_history.jsonl`; no second review or evidence rerun was launched.
- Grok returned `GREENLIGHT`, no P0/P1 findings, five P2 notes, and three P3 notes. Its useful independent contributions were the ancestor-custody limitation, non-exact reusable-certificate SAN set, coarse mkcert diagnostics, explicit UI-port/runbook coupling, live-Next-HMR evidence gap, single-cookie assertion gap, and WebSocket lifecycle debt. None invalidated the DEV-07 code. It correctly kept the pending trust-store/browser ceremony separate from the code verdict.
- Review-loop improvement: prefer a noninteractive review mode that writes the final verdict to a deterministic file. If an interactive TUI is unavoidable, approve read-only commands individually using an unambiguous control, and capture the session transcript automatically before dismissing it. The current review added useful residual-risk notes but spent substantially longer on tooling and transcript recovery than on the focused `5/5` product gate.

### P2-01 recovery state-machine design

- DEV-07 moved to an honest `needs_input` Kanban block rather than being falsely completed: repository code and Grok review are GREEN, while the persistent macOS trust-store action still needs V's explicit approval. P2-01 is the only running implementation ticket and is independent of that workstation state.
- The source reconciliation prevented a scope error before authoring: the research report proposes T0–T4, but the authoritative implementation roadmap approves only T0–T3 and separately marks capability degradation as missing. P2-01 therefore ratifies T0–T3, makes T3 the restricted weak-recovery completion required by the Kanban decomposition, and makes automated T4 grant/final refusal a forbidden bypass rather than inventing unresolved human-review/staffing policy.
- Focused reproduce-first evidence was fast and exact: `2/2` assertions failed only because the state-machine JSON and JSON Schema were absent. The first implemented gate was `2/2` GREEN. Author self-review then found two genuine design omissions before Grok: contested claimants needed an explicit freeze/notify/do-not-adjudicate rule, and attempt expiry needed a guard proving it cannot precede a pinned T3 due time. Both were added with state/tier/proof/policy reference-integrity checks.
- Four one-at-a-time artifact mutants were non-vacuously RED: caller-selected tier, retry-reset delay, current-channel-only notice fan-out, and T3 full-access completion. Exact restoration returned the contract to SHA-256 `31b538f3415d135a0d710331d0899520503a32fb3749c655e1ba0ec9cae7f9f3` and the focused gate to `2/2` GREEN.
- Root typecheck was GREEN. The complete architecture invocation was `185/186` GREEN; its sole unrelated failure was the pre-existing S9 source scanner traversing two `.worktrees/obs-lane-*` trees and generated `.next-*` bundles, producing 103 historical/generated dev-token matches. P2-01 introduced none of those matches. This is a harness isolation defect and must not be flattened into a recovery-contract regression or silently fixed inside this ticket.
- The first lint attempt again failed before repository analysis because sandboxed `tsx` could not create its local IPC socket (`EPERM`). The byte-identical host-permitted run was GREEN: 28 architecture edges, zero violations, and zero source blockers. This recurring permission rerun should be eliminated from the loop or pre-authorized for the exact lint command.
- The deterministic headless Grok path worked on its first substantive attempt for P2-01. It inspected the frozen contract, schema, tests, roadmap, research, status, and hashes read-only, printed a parseable verdict, and exited normally; no TUI, approval keystroke, transcript recovery, duplicate review, or reviewer-run test was needed. This is a material process improvement over DEV-05 through DEV-07.
- Grok returned `GREENLIGHT` with no P0/P1. Its most valuable contribution was independently adjudicating the only live scope conflict: research's earlier T3-full/T4-restricted table versus the later mission architecture's weak-recovery capability degradation. It confirmed that restricted T3 is the later roadmap rule and that T4 remains unratified, preventing the final report from relying only on the author's interpretation.
- The reviewer also found useful nonblocking design/evidence debt: contested claims lack a first-class transition; the architecture gate does not perform general schema-instance validation; T1/T2 time limits and T3 due-vs-expiry priority are underspecified; tier tightening has no notification effect; surviving-session freeze semantics and monitoring windows are unnamed; and some schema identity/uniqueness constraints are loose. These did not invalidate the design ticket and should be routed into later P2 tickets rather than expanding P2-01 after GREENLIGHT.
- The complete architecture run remained honestly `185/186`, not relabeled GREEN. Grok agreed that the failure is unrelated S9 scanner pollution from nested worktrees/generated Next output. This is useful evidence that a broad run exposed a real harness-isolation problem while adding no recovery-product signal.
- Review-loop improvement retained: headless, fixed-file, read-only review with a frozen packet and explicit verdict grammar is the default to preserve. The remaining packet defect was minor but real: it promised neighboring P2 ticket text “as reproduced below” without actually reproducing it, forcing the reviewer to derive scope from Wave 3 and the status document.

### P2-02 sealed recovery-policy register

- The reproduce-first gate was exact and fast: the focused suite failed before collecting tests because `packages/register/src/recovery-policy.ts` did not exist. The first implementation reached `3/3` GREEN and root typecheck GREEN.
- Source reconciliation prevented false precision. The research explicitly says all specific 7/14-day and 24/72-hour choices are engineering judgment with no evidentiary optimum. The row therefore seals the ratified min/max envelopes with server-pinned selection, labels the basis `PROVISIONAL_ENGINEERING_JUDGEMENT_WITHIN_RATIFIED_BOUNDS`, and pins only already-ruled exact values such as the 24-hour post-cancel lock and 30-day restricted window.
- Author self-review found two genuine register-integrity gaps before Grok. First, reading the policy key alone did not prove that it belonged to an intact sealed version; the reader now requires `sealed=true` and declared row count equal to actual count. Second, the generic bootstrap helper's prior `ON CONFLICT DO NOTHING` shape could append a newly introduced row to a stale partial/sealed version. It now serializes, accepts only an empty version or an exact byte/provenance match, and refuses partial/drift state without adding rows.
- The first PostgreSQL gate failed `3/3` before test logic because the sandbox denied loopback bind (`EPERM`); the byte-identical host-permitted rerun was GREEN. The final focused ceremony is `9/9`, covering fresh bootstrap, exact sealed counts, byte-stable reuse, full development seeding, conflicting/partial refusal, concurrent first invocation, and service-principal denial.
- Five one-at-a-time source mutants were RED and hash-restored before the bootstrap self-review: shortened T3 envelope, subset notification fan-out, permanent remote lockout, disabled sealed-count verification, and removed API boot read. A sixth real PostgreSQL mutant disabled the empty-or-exact bootstrap branch; idempotent reuse hit a duplicate-key failure and partial state wrongly resolved instead of returning the typed mismatch. Exact restoration returned both titles GREEN.
- Root typecheck is GREEN. Repository lint is GREEN (`28` edges, zero violations; zero source blockers). The complete architecture suite is honestly `188/189`; the sole failure is the same unrelated S9 scanner pollution from nested observability worktrees and generated Next bundles.
- One proportional command combined root typecheck with the large registration unit shard. Typecheck completed GREEN, but the command-output projection omitted the Vitest session identifier when the 24-second RSS title crossed the initial yield, so the final shard result could not be recovered. Process inspection later showed no remaining Vitest process. No result is claimed and no duplicate broad shard was launched. Improvement: every potentially long command must write a durable reporter receipt or preserve the returned session ID before projecting output.
- The deterministic headless Grok review again completed without TUI, approval prompt, transcript recovery, duplicate review, or reviewer-run tests. It took about **11 minutes** from launch to verdict—substantially longer than the focused `3/3` and PostgreSQL `9/9` gates, but with much lower orchestration overhead than DEV-05 through DEV-07.
- Grok returned `GREENLIGHT`, no P0/P1. It independently cleared the range-based/provisional policy choice, exact sealed-version and bootstrap integrity, development seeding, boot ordering, and honest Phase-2 `✗` status. It found no product repair the author had missed after self-review.
- Review value was concentrated in precise downstream debt: the later issued-code TTL, range-to-point pinning responsibility, the unadvertised single-active-attempt ceiling, frozen-object/assertion coverage, magic row-count arithmetic, and the mostly mock-only unsealed branch. It also caught a packet citation error (`§11.2` did not exist; the intended register section is §10.7). Only review documentation changed after the verdict.
- Loop conclusion for this atom: strong author self-review plus non-vacuous mutations caught the two material integrity defects before external review; Grok then served as independent policy-authority reconciliation and residual-debt discovery. For similarly small sealed-policy tickets, the 11-minute high-reasoning review may be more expensive than necessary unless the packet contains an unresolved policy conflict.

## Final report questions

1. Which reviewer findings changed production behavior, and which only repaired evidence?
2. Which broad runs found defects that focused gates missed, and which merely repeated known coverage?
3. How much wall-clock time was coding, waiting for tests, reviewer inspection, reviewer orchestration, and sandbox recovery?
4. Which tests were nondeterministic, environment-sensitive, or too coupled to implementation text?
5. Where did mutation testing prove a real invariant, and where did redundant guards make the first mutant vacuous?
6. Which tickets should be merged, split, reordered, or reviewed with a lighter evidence protocol next time?

### P2-03 opaque recovery persistence

- V explicitly requested that the loop retain detailed sample data. This ledger
  is therefore the live source for the final report, not a retrospective
  reconstruction. Ticket timings, failure classification, mutations, reviewer
  value, reviewer overhead, and process changes remain mandatory fields.
- The scope cut worked: P2-03 stayed database-only and did not absorb classifier,
  endpoint, notification, proof, or completion runtime. The chosen row contains
  only independent DB-minted internal/public UUIDs, one exact AEAD envelope, and
  a DB-clock timestamp; it has no plaintext/correlatable identity column.
- Reproduce-first evidence was non-vacuous: all `3/3` focused PostgreSQL tests
  failed because the tables/file were absent and an actual runtime LOGIN saw
  `42P01`, not the intended post-migration `42501` privilege denial.
- First implementation passed the focused real-PostgreSQL suite `3/3`; adding
  the neighboring exact identity inventory and stricter sequence/TRUNCATE/event
  clock assertions produced a restored `7/7` GREEN gate.
- Four source mutants were RED and exact-restored: plaintext envelope bypass,
  missing request immutability trigger, runtime SELECT grant drift, and missing
  unique public-handle index. None required a product redesign after restore.
- The sandbox again caused a false-negative lint invocation: `tsx` IPC creation
  failed with `EPERM` before repository analysis. The host-permitted identical
  retry was GREEN (28 edges, zero violations; zero source blockers). This is now
  a repeated, measurable source of loop noise and should be pre-authorized or
  executed directly in the permitted profile on future tickets.
- Author self-review intentionally records the main residual instead of hiding
  it: no capability yet creates the request and initial history event atomically,
  and no channel-reference key custody exists. Those are later tickets, so the
  overall Phase-2 status remains `✗` even though P2-03 itself can close.
- The headless Grok review inspected the frozen scope for about **5m22s**, found
  no P0/P1, and independently cleared the exact schema/ACL/immutability boundary.
  Its useful P2 follow-ups were forced-vs-default DB minting, extra-envelope-key
  coverage, missing owner mutation cases, broader role witnesses, global
  sequence non-disclosure, append-only later tier storage, and the distinction
  between envelope shape and proven encryption.
- Grok's resident actor then exited unexpectedly after announcing its final hash
  check but before emitting the verdict. A single same-session, one-turn,
  no-tool recovery produced the final `GREENLIGHT` in **14.5s**. This was not a
  second substantive review. The incident is another example where reviewer
  analysis added value but verdict transport was less reliable than the product
  gates; final-report recommendations should require deterministic verdict-file
  output from the reviewer process itself.

### P2-04 enumeration-resistant recovery start

- The ticket remained a small vertical atom: one public endpoint, typed client,
  service floor, database capability, production wiring, and bounded evidence.
  It did not absorb risk classification, notices, proof adjudication, delay,
  cancellation, completion, or restricted-mode enforcement.
- Reproduce-first was non-vacuous. The focused unit run failed because the
  recovery service/client method did not exist and the S7 route inventory had no
  start-recovery route; neighboring existing assertions remained GREEN.
- One orchestration mistake added avoidable noise: `pnpm contract:generate` was
  attempted although the repository script is `pnpm generate:contract`. The
  corrected command then hit the recurring sandbox-only `tsx` IPC `EPERM`; its
  host-permitted identical retry was GREEN. This is both a command-discovery
  error and known environment friction, not a product regression.
- The first combined PostgreSQL run found two test-model defects. A fixture
  created a user already suspended and then tried to attach channels, correctly
  hitting the existing active-parent guard. A privilege assertion expected the
  authorization role to lack ordinary runtime calls even though migration 0039
  explicitly grants runtime membership to that role. The repaired test now
  performs the legal active→children→suspended sequence and honestly records
  inherited authorization access while proving unrelated erasure denial.
- Product self-review after that run found a useful optimization/security-shape
  improvement: a repeat request was still loading the user's DEK before the
  authoritative unique-write guard returned `NOT_CREATED`. Adding a prepare-time
  no-live-request exclusion makes repeat/absent paths use the dummy-envelope
  branch, while the partial unique index and write capability remain the race-safe
  authority. This was caught before Grok.
- The restored focused unit/contract/authorization gate is `37/37` GREEN. The
  restored fresh/replay PostgreSQL + P2-03 + exact identity inventory gate is
  `9/9` GREEN. Root typecheck and diff-check are GREEN.
- Four one-at-a-time mutants were non-vacuously RED and restored: missing timing
  floor (`47/25ms` observed instead of `600ms`), suspended-account admission,
  false successful-audit outcome, and missing repeat prepare suppression (three
  user-key loads instead of two). This mutation set exercised behavior rather
  than only source strings.
- The first final lint invocation again failed before analysis on the sandboxed
  `tsx` IPC socket. The host-permitted identical run was GREEN (28 edges, zero
  violations; zero source blockers). The repetition across DEV-06, P2-01,
  P2-02, P2-03, and now P2-04 is strong sample evidence that future orchestration
  should route this exact lint command directly through the approved profile.
- Kanban tooling produced one avoidable syntax failure: `hermes ticket show` was
  attempted instead of the namespaced `hermes kanban --board … show` form. The
  subsequent heartbeat also first hit the expected sandbox denial on the board
  lock before the approved Hermes invocation succeeded. Compact help lookup
  resolved the syntax without changing task state.
- Honest residuals are explicit in the review packet: the 600ms rule is a
  healthy-storage minimum rather than unconditional latency equality; the
  authorization principal intentionally inherits runtime capability; there is
  no start-request source limiter beyond one live request/account; and no notice
  or later recovery action exists yet. Overall Phase 2 therefore stays `✗`.
- The first and only Grok 4.6 invocation never began substantive review. After
  local plugin discovery it returned HTTP `402 Payment Required` with
  `Grok Build usage balance exhausted`. No file was inspected and no verdict was
  emitted. The ticket is therefore review-pending/capability-blocked rather than
  falsely closed or substituted with Codex self-approval. This is external
  reviewer-capacity failure, not a product/test/reviewer finding, and is useful
  sample data for the loop: reviewer availability must be checked before coding
  a ticket whose definition of done hard-requires that reviewer.

### P2-08 bounded authentication-risk signals

- The initial scope cut was good: P2-08 owns encrypted/opaque persistence,
  bounded evaluation, and retention; P2-09 owns the actual recovery-tier
  decision. The ticket does not store classifier output or accept caller tiers.
- Reproduce-first unit evidence was clean (`3/3` failed because the evaluator
  module was absent). The first PostgreSQL attempt hit the recurring sandbox
  loopback `EPERM`; the permitted identical run reached product behavior.
- Two early PostgreSQL REDs were fixture-model defects and valuable evidence of
  strict contracts working: a parameterized multi-command query was invalid,
  and two separate `clock_timestamp()` calls differed by microseconds and
  violated exact elapsed retention. Neither justified weakening the migration.
- The first database-only implementation went GREEN `3/3`, but author
  self-review caught a real completion gap before packet freeze: production
  cleanup was not wired and, more importantly, neither login nor recovery start
  emitted a signal. Focused repository tests alone would have falsely called
  the ticket complete. Startup/minute single-flight cleanup and both live
  emitters were then added with direct evidence.
- The final database proof is materially stronger than catalog-only checks: it
  covers recovery and session-derived writes, absent/mismatched session scope,
  cross-account ciphertext, 129-row saturation before user-key load, 1,001
  expired rows in exact 1,000+1 batches, a live retention control, and distinct
  runtime/erasure LOGIN behavior. Adjacent P2/identity gates are GREEN.
- Four post-implementation mutants were non-vacuously RED and restored:
  cross-account join widening, expiry-predicate removal, N+1 acceptance, and
  skipped real-login emission. Recovery emission also had a genuine
  pre-implementation RED. One attempted title filter used `N+1` as a regex and
  skipped all tests because `+` was interpreted as a quantifier; the full
  three-test unit file was immediately run and produced the intended RED. The
  skipped command is retained as orchestration error, not mutation evidence.
- Reusing the existing single-flight reconciler kept the cleanup patch small,
  but its erasure-specific name is mild design debt. A later refactor could
  extract a generic background single-flight primitive without widening this
  security ticket.
- The 90-day ceiling is explicitly provisional. The source architecture only
  classifies risk signals as C2 and supplies no verified optimum. Treating the
  number as counsel-approved would be artifact dishonesty; the final report
  should recommend a first-class retention decision record before production.
- The first permitted lint run found a real architecture violation after all
  focused behavior gates were GREEN: the DB package still exported numeric
  policy literals. Retention, evaluator cap, and cleanup batch now come from
  the exact sealed recovery-policy row, and a cross-source assertion binds the
  SQL interval to that carrier. This is a strong example of a static policy
  gate finding something behavioral tests were not designed to catch.
- Signal writes intentionally follow the successful login/recovery commit and
  fail open with fixed operator markers. This protects authentication
  availability but means history is best effort rather than transactionally
  complete. That tradeoff must remain visible to P2-09 and monitoring design.
- Loop improvement: add a mandatory “live callsite and lifecycle” checklist to
  every persistence ticket before mutation/review. Schema + repository + tests
  were insufficient to reveal the missing emitters; self-review did.
- Grok availability was already known to be quota-blocked from P2-04. P2-08
  still prepares a deterministic packet, but the loop must not waste repeated
  long reviewer launches or fabricate a verdict. Review-capacity preflight
  should be a wave-level gate, not rediscovered per ticket.
- The one approved P2-08 attempt confirmed the same failure in under a second
  of remote work: HTTP `402` immediately after local plugin discovery, before
  any packet read. The ticket was moved to a typed `capability` block with all
  local receipts preserved. This was the correct honest stop condition, but it
  also confirms that review availability should have prevented the invocation
  entirely once P2-04 established the unchanged quota state.

### P2-10 passkey credential storage

- Scope reconciliation avoided a large false-completion claim. The existing
  table had only dormant `passkey` placeholders; P2-10 therefore extends that
  single carrier but does not add a WebAuthn route, ceremony, challenge,
  assertion verifier, operator session, or recovery path.
- Reproduce-first was exact: all `3/3` focused PostgreSQL tests failed because
  the seven fields and migration were absent. The initial sandboxed invocation
  again failed before tests on loopback `EPERM`; the identical permitted run
  provided the real RED. This recurring branch is environment noise that the
  loop should route directly through the already-approved test profile.
- The first implementation attempt found a genuine author/tool-knowledge error:
  PostgreSQL has no `jsonb_object_length(jsonb)` function. Replacing it with
  exact reconstructed-object equality both restored compatibility and made the
  no-extra-vendor-field invariant stronger.
- The next real-PG run found a fixture-model error rather than a product flaw:
  the authorization role intentionally inherits runtime and therefore retains
  the existing `mfa_factor` SELECT privilege. The test was corrected to prove
  runtime/authorization read, erasure denial, and write denial for all three;
  production ACLs were not weakened or altered to satisfy a false expectation.
- The restored focused gate is `3/3` GREEN; the adjacent identity/Phase-1 MFA
  gate is `11/11` GREEN; root typecheck and diff-check are GREEN. Existing TOTP
  behavior remains covered while passkeys stay storage-only.
- Three effective one-at-a-time mutants were RED and exact-restored: HTTP origin
  admission, counter rollback, and extra `vendor` public-key metadata. The first
  HTTP mutant stayed GREEN because it allowed the no-port form while the test
  used a port. That vacuous attempt is retained; adding both variants made the
  same structural mutant non-vacuously RED. This is useful evidence for testing
  boundary equivalence classes rather than one representative string.
- The credential counter is bounded to the WebAuthn unsigned 32-bit domain;
  RP/origin/key/eligibility bindings are immutable; device labels are exact
  factor-bound AEAD envelopes; and no attestation, AAGUID, vendor, biometric,
  face, or fingerprint column exists.
- Honest residual: the storage is intentionally unusable until later ceremony
  and challenge-bound capability tickets. The existing runtime table read is
  inherited technical debt from TOTP; no new write privilege was introduced.
- Review-loop lesson: for a small schema atom, the focused database test and
  mutations complete in seconds, while reviewer availability is the dominant
  external risk. Packet preparation remains valuable, but repeated remote
  launches after a known quota failure should be replaced by one explicit
  availability preflight or a wave-level reviewer-capacity gate.
- The single required Grok 4.6 attempt confirmed the unchanged external block:
  HTTP `402` immediately after local plugin discovery, before any repository
  read or verdict. The attempt added no product-review signal. P2-10 is
  therefore locally complete but capability-blocked, reinforcing that reviewer
  quota should be checked once per wave before ticket implementation begins.
- The first Hermes block command put `--kind capability` after the variadic
  reason position and argparse rejected the reason as unrecognized. Moving the
  option before the task ID succeeded. This was a harmless orchestration syntax
  error, but it is another candidate for the requested compact-command wrapper.

### P2-14 product-role catalog and growth-path policy

- Authority reconciliation prevented an invented administrator role. Wave 2
  supersedes the charter's broader labels with three launch identities
  (`anonymous`, `user`, `operator`), four explicitly unbuilt growth identities,
  and the already-existing non-human worker/service identity. The normalized
  sealed ID is `worker_service`; it is reused rather than replaced.
- The scope stayed catalog-only. P2-14 adds no role assignment endpoint,
  operator session, specialist workflow, database LOGIN, or public role picker.
  Operator is passkey-required but `RESERVED_UNASSIGNABLE` with zero grants;
  growth and service entries also expose zero product grants. Only the already
  real anonymous→user verified-registration-and-MFA transition is present.
- Reproduce-first was exact and fast: the architecture file failed to import
  because `product-role-policy.ts` did not exist. The implementation then made
  the focused catalog/boot contract GREEN `3/3` and the adjacent authorization
  gate GREEN `34/34`, including a request-body `role` injection refusal.
- Persistence reused the generic immutable `register.register_row` carrier;
  adding a parallel SQL role table/migration would duplicate the sealed-policy
  authority. The real migration receipt starts fresh PostgreSQL, applies every
  migration, persists the row in the exact sealed bootstrap version, reads the
  closed catalog, reseeds byte-stably, rejects partial/drifted state, serializes
  concurrent first use, and denies a service principal. It is GREEN `4/4`.
- Three full-strength one-at-a-time mutants were RED and exact-restored: changing
  caller role input from `DENIED` to `ACCEPTED`, granting reserved operator
  `READ_DEPLOYMENT`, and replacing `worker_service` with an invented
  `administrator`. The policy source returned to SHA-256 `0052c6c…` and the
  restored focused gate is GREEN.
- Root typecheck is GREEN. The first lint invocation again failed before
  analysis because sandboxed `tsx` could not create its IPC socket; the
  byte-identical host-permitted run is GREEN (28 edges, zero violations; zero
  source blockers). `git diff --check` is GREEN.
- Loop improvement: strict tuple schemas are valuable for small governed
  catalogs because unknown, reordered, extra, or newly powered entries cannot
  drift silently. The cost is intentional register-version churn: a deployed
  sealed version cannot be patched in place and must move to a new configured
  version. That operational step belongs in deployment orchestration, not an
  `ON CONFLICT` escape hatch.
- Reviewer capacity remains the dominant external risk. One deterministic
  packet was prepared and one Grok attempt made. This time the CLI failed even
  earlier than the prior `402`: it reported `Not signed in`/no credentials for
  `cli-chat-proxy` before reading any file. No retry or substitute reviewer was
  launched; the ticket remains locally complete but capability-blocked. This
  strengthens the case for a wave-level reviewer-auth/quota preflight.

### DEV-08 local-auth data plane (user-reframed completion target)

- The user materially clarified the wave-level outcome: registration with MFA,
  login with MFA, a durably saved debate, and account deletion must work as one
  real local journey. KEY-02 escrow was therefore paused before implementation;
  its RED-only test was removed and Hermes records the priority/capability
  block. This prevented policy work from displacing the product scenario.
- Status reconciliation found that the product routes and security contracts
  already exist, while the status authority correctly remained `✗` for a
  bootable local stack. DEV-02 through DEV-07 had built the pieces, but no
  command composed even the persistent data plane. DEV-08 deliberately owns
  only that first small slice; API/UI/TLS and the journey remain later tickets.
- The first environment probe incorrectly looked like “Docker is missing”
  because `docker` was not on `PATH`. A stronger inventory found Docker Desktop
  and its bundled CLI under `/Applications/Docker.app`. This is valuable loop
  evidence: command discovery and engine health are separate preflight facts.
- Focused TDD was non-vacuous. The initial unit file failed at import because
  `dev-auth-data-plane.ts` did not exist. The first implementation made the
  three orchestration cases and the existing mail-capture controls GREEN, with
  root typecheck GREEN.
- The implementation starts only missing `postgres`/`hatchet-lite` services,
  suppresses all child output, passes the local migrator URL only through child
  environment, reuses existing custody, and unwinds only newly started services
  in reverse order. The mail preflight validates the private spool without
  persisting a fake readiness email or account.
- The first real invocation failed safely at dependency start. Direct Compose
  inspection initially obscured the cause because the Docker engine itself was
  unresponsive. Docker's host log then established the exact external failure:
  the virtualization engine could not install Rosetta and stopped before
  Compose. No container, database, credential, account, or partial custody was
  left behind.
- The launcher was tightened after that observation: Docker engine health now
  has its own 15-second bounded step and fixed
  `DEV_AUTH_DATA_PLANE_DOCKER_ENGINE_UNAVAILABLE` result. The restored real
  command returns that exact refusal instead of hanging or mislabelling it as a
  Compose failure.
- Review capacity changed again: Grok is logged out, and the user requested
  Claude Opus 5.0 reviewers. No Claude reviewer capability is exposed in this
  workspace, so no substitute or fabricated verdict may close the ticket. Both
  runtime validation and external review remain honest gates.
- Loop improvement: run a four-part readiness preflight before coding the next
  orchestrator ticket—executable discovery, daemon health, reviewer
  authentication/capacity, and authority/acceptance reconciliation. Each is a
  distinct failure domain and should produce a typed board reason.

### DEV-09 exact private API environment

- The ticket stayed deliberately smaller than “start the API.” It assembles one
  strict secret-bearing environment file from already-owned inputs and starts
  no process. This kept Hatchet token issuance, service lifecycle, and browser
  acceptance as visible later work instead of hiding them behind a broad
  bootstrap label.
- Authority reconciliation avoided inventing a Hatchet credential ceremony.
  The operator owns exactly one private `HATCHET_CLIENT_TOKEN` input; the
  assembler verifies its JWT shape and exact advertised local endpoints, then
  derives the UUID tenant from the token. A caller cannot provide a competing
  tenant value.
- The initial focused test was genuinely RED because the assembler module did
  not exist. The final focused suite is GREEN `4/4`, root typecheck is GREEN,
  and `git diff --check` is GREEN. The generated 29-key environment also passes
  the real production `loadApiEnvironment()` parser.
- Custody is fail closed: `.local`, the custody root, credentials, key files,
  stores, mail path, and output are owner/mode checked; credential inputs must
  be regular single-linked files; database usernames and passwords are exact,
  pairwise distinct, and role-bound. Publication, content encryption, and the
  evaluator development menu remain disabled.
- Publication is atomic and concurrency-safe. Four concurrent first writers
  produce one CREATED receipt and three REUSED receipts. Existing output is
  accepted only byte-for-byte; drift is rejected without overwrite. The CLI
  prints only the key count plus CREATED/REUSED state.
- Three one-at-a-time mutations were non-vacuously RED and restored to source
  SHA-256 `fca5ebe593240f96256b80083b5e7f18f0ac960dffbb7c822a920a0349e568c4`:
  removing hardlink refusal accepted the linked Hatchet credential; removing
  the UUID tenant guard accepted a caller-chosen subject; and removing the
  byte-drift guard silently reused modified output.
- Two external gates remain independent of the implementation. Docker Desktop
  still stops before Compose because its Rosetta installation fails, and the
  user-requested Claude Opus 5.0 reviewer is not available in this workspace.
  Neither has been replaced with a fabricated local verdict.
- Loop improvement: separate “credential authority exists” from “environment
  can be rendered.” DEV-09 can prove exact composition without minting a token,
  while the next ticket must own issuance/reachability and must not call this
  vertical slice complete until the real register→MFA→login→saved-debate→delete
  browser journey passes.

### DEV-10A supported local Hatchet token authority

- Upstream inspection was necessary before coding because the repository had
  no token-issuance surface. Hatchet's official Lite Dockerfile confirms that
  the image contains `./hatchet-admin`, and the official admin source defines
  `token create`; the pinned TypeScript SDK exposes tenant and workflow-list
  clients. The implementation uses those supported seams rather than scraping
  the dashboard, reading container logs, or writing Hatchet tables directly.
- Reproduce-first was exact: the new integration file failed because
  `dev-hatchet-token.ts` did not exist. The restored focused gate is GREEN
  `5/5`, root typecheck is GREEN, and `git diff --check` is GREEN.
- Issuance is one-time under a private process lock. The command requires the
  exact running Compose service and executes the image admin binary with one
  fixed name and one-year duration. Existing credentials are never silently
  replaced; every reuse is live-attested.
- Static JWT parsing is only a preflight, not trust. It rejects foreign
  issuer/audience/server/gRPC authority, malformed UUID subject/token identity,
  wrong algorithm, and near-expiry credentials. The actual trust decision then
  calls the pinned SDK's exact tenant read and workflow-list API before any file
  is published.
- Custody remains mode-`0700` directories and one mode-`0600`, single-linked,
  atomically renamed and fsynced `hatchet.env`. The return/CLI surface contains
  only ATTESTED/REACHABLE and CREATED/REUSED. A failed live attestation leaves
  no credential file.
- Three one-at-a-time mutations were non-vacuously RED and exact-restored:
  removing the exact server URL accepted a foreign authority; removing the live
  attestation published without calling Hatchet; removing the single-link check
  accepted aliased credential custody. Restored source SHA-256 is
  `bb235ad28d16ef72ec24a7f2edbce5331bdf8e8ca1401252a520bdc61b94524c`.
- The first real CLI attempt failed safely with
  `DEV_HATCHET_TOKEN_CUSTODY_INVALID`: the prerequisite data-plane command has
  never created `.local/dev-auth` because Docker Desktop still stops before
  Compose on the Rosetta failure. No token, account, or service was created.
- Reviewer availability remains independent: the user requested Claude Opus
  5.0, but no such reviewer is callable here. The ticket cannot acquire an
  external verdict locally, and no substitute verdict is recorded.
- Loop improvement: “syntactically valid JWT” and “live service authority” must
  stay separate assertions. The former protects local routing/custody; only the
  latter proves the credential belongs to the expected tenant and API.
- The first final lint run found a real cross-ticket architecture defect after
  the focused behavior tests were already GREEN: both DEV-08 and DEV-10A read
  inherited child-process environment directly. The repair added one narrow,
  whitelisted register loader and explicit immutable injection into both
  operation factories. The repaired combined gate is `12/12` GREEN; root
  typecheck, lint (28 edges/zero violations/zero blockers), and diff-check are
  GREEN. This is another concrete reason lint belongs before ticket freeze, not
  as optional cleanup after the Kanban state changes.

### DEV-10B exact production API host process

- The ticket remained one process, not “start the stack.” It consumes DEV-09's
  exact private environment, starts only the real API entrypoint, and leaves UI,
  TLS, runner, account creation, and browser acceptance as explicit later work.
- Reproduce-first was exact: the focused test failed at module import because
  `dev-api-process.ts` did not exist. The restored focused gate is `7/7` GREEN;
  the combined DEV-08/09/10A/10B boundary gate is `19/19` GREEN.
- A host process was selected deliberately. The authoritative environment uses
  host-loopback PostgreSQL/Hatchet endpoints and absolute host custody paths;
  silently placing that file in a container would point credentials and
  endpoints at the wrong authority. Containerization remains a separately
  specified topology change rather than an implicit string rewrite.
- Readiness is not “port open.” Before spawn, any listener is a typed occupied
  refusal. After spawn, only exact JSON `401 SESSION_REQUIRED` on `/v1/session`
  proves both service identity and deny-default auth behavior. Wrong response,
  timeout, and early child exit unwind only the owned child.
- The child receives only the central whitelisted development-command
  environment plus the exact 29 API keys. Child stdio is discarded, and the
  CLI receipt contains only loopback host/port and `DENY_DEFAULT`.
- Three one-at-a-time mutants were non-vacuously RED and restored: skipping the
  pre-existing listener guard adopted an existing service; accepting any JSON
  401 treated a wrong service as ready; and omitting failure cleanup left the
  owned child unterminated.
- Pre-freeze self-review found a separate asynchronous-spawn edge: a rejected
  exit promise could make cleanup mask the original start failure. Production
  termination now treats an already-settled failed spawn as cleaned, while an
  injected regression proves the orchestrator still invokes cleanup exactly
  once and preserves the originating failure.
- Real runtime proof is still unavailable because `.local/dev-auth/api.env`
  cannot exist until the Docker-blocked data-plane and Hatchet authority steps
  run. This is a dependency refusal, not evidence that the complete stack works.
- Claude Opus 5.0 remains unavailable, so no external verdict is fabricated.

### DEV-10C exact private UI host process

- The ticket owns only the private Next development process on port 3001. It
  does not stop or replace the user's existing port-3000 process, and it does
  not claim that plain HTTP is the browser auth origin.
- Reproduce-first failed at import because `dev-ui-process.ts` was absent. The
  restored focused gate is `6/6` GREEN; DEV-10B+10C is `13/13` GREEN; the full
  apps/ui node inventory is `42/42` GREEN and its typecheck is GREEN.
- Startup is dependency-ordered. The exact anonymous API `401` must exist before
  spawn, and any existing port-3001 listener is rejected rather than adopted.
  The child receives only the central command allowlist plus four fixed,
  non-secret UI values.
- Readiness proves two independent facts: `/login` is the intended auth UI, and
  `/api/v1/session` reaches the local API while preserving its deny-default
  response. Port openness alone is insufficient.
- Three one-at-a-time mutations were non-vacuously RED and restored: starting
  without the exact API, accepting a lookalike login page, and omitting owned
  child cleanup on timeout/exit.
- The real CLI returns `DEV_UI_PROCESS_API_UNAVAILABLE` before spawn because the
  Docker-blocked API dependency is absent. No listener was created and the
  existing port-3000 process was untouched.
- Claude Opus 5.0 remains unavailable; no local self-review is labelled as the
  requested external verdict.

### DEV-10D trusted HTTPS readiness

- The user narrowed the authoritative finish line again: one real browser must
  register with mandatory MFA, log out and back in with mandatory MFA, create
  and reload its debate, then delete the account and observe the ruled private
  and public debate aftermath. Infrastructure tickets remain prerequisites and
  must never be reported as completion.
- Reproduce-first was exact: the new focused suite was `0/5` because the
  attested front-door orchestrator and system-trust public probe did not exist.
  The restored focused suite is `5/5` GREEN; the combined existing proxy,
  readiness, and architecture boundary is `10/10` GREEN with loopback
  permission.
- Readiness is now three separate gates: every pre-existing public-port listener
  is refused without adoption; the private UI and proxied API identities must
  be exact before start; and the public origin must pass those same identities
  through Node's normal system trust. The production public probe contains no
  custom CA and no certificate-verification bypass.
- Three one-at-a-time mutations were non-vacuously RED and exact-restored:
  skipping the occupied-port guard adopted the existing service; accepting any
  non-null public response admitted a lookalike; and omitting cleanup left the
  owned front door open after invalid readiness or timeout.
- A real bounded CLI attempt returned `DEV_TLS_PUBLIC_PORT_OCCUPIED`. The
  pre-existing plain-HTTP Next process remained the same PID (`96795`) before
  and after, proving the new command did not replace or stop it.
- This ticket cannot create workstation trust. `mkcert -install` remains an
  explicit owner-authorized action, while Docker Desktop still fails before
  Compose on its Rosetta setting. Claude Opus 5.0 is unavailable, so no external
  verdict is fabricated. Overall browser journey status remains `✗`.

### DEV-10E owned data-plane lifecycle

- Re-reading the planning stack left the classification unchanged: Waves 1–4
  and all ten Phase-1 product slices are `✓`; the bootable local browser journey
  is `✗`. The next smallest enabling defect was lifecycle ownership, not another
  auth feature.
- DEV-08 already knew which Compose services it started during failure cleanup,
  but discarded that set after successful bootstrap. A future supervisor would
  therefore have to stop every dependency or leak its own. DEV-10E retains that
  exact successful-start set behind a new idempotent handle while preserving
  the standalone leave-running CLI contract.
- RED was `2/5`: the lifecycle function did not exist. Restored focused evidence
  is `5/5` GREEN. Three one-at-a-time mutations were non-vacuously RED and
  restored: forward instead of reverse shutdown, repeated shutdown, and calling
  cleanup for a fully reused dependency set.
- No Docker service was started, stopped, or adopted during this ticket. The
  workstation Rosetta failure and manual certificate-trust approval remain
  external gates. No user account or browser journey exists yet, so overall
  status remains `✗`.

### DEV-10F bounded auth-stack supervisor

- DEV-10E made ownership composable; DEV-10F then added the missing explicit
  supervisor instead of shelling out to long-lived CLIs whose child ownership
  would be lost. The central command environment is injected once and no secret
  value appears in the supervisor receipt or logs.
- Startup order is exact: public-port preflight → owned data plane → supported
  Hatchet token → exact API environment → production API → private UI →
  system-trust TLS. Every stage delegates its already-tested exact readiness
  check; the supervisor adds only ordering, ownership, and aggregate lifecycle.
- Initial RED was a missing module. The first GREEN `10/10` pass was not frozen:
  self-review found that a rejected ready-child exit promise skipped cleanup in
  the CLI. A new focused RED reproduced it; supervision now always stops in a
  `finally` arm. Restored DEV-10F is `11/11`, and the combined supervisor,
  data-plane unit, and architecture boundary is `17/17`.
- Four one-at-a-time mutations were non-vacuously RED and restored: skipping
  occupied-port refusal, forward cleanup, repeated cleanup, and advertising
  ready without the trusted TLS step. A separate regression proves signal,
  typed child exit, and rejected runtime promise all clean the full stack.
- The real command returned `DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED` before Docker
  access and left the unrelated PID `96795` unchanged. No local service or
  account was created. The receipt explicitly states `RUNNER_NOT_STARTED`, so
  the full browser journey stays `✗`.

### DEV-11A first live supervised-stack execution

- The user's DONE definition was re-applied before execution: mandatory MFA on
  registration and login, durable debate create/reload, then account deletion
  with the ruled private/public aftermath. Infrastructure readiness alone is
  not completion.
- Docker was healthy on the second live attempt. The old repo-owned UI-only
  listener on port 3000 was stopped, and no unrelated process was adopted.
- Live execution exposed three integration defects that mocked orchestration
  had missed: PostgreSQL 18 rejected the legacy `/var/lib/postgresql/data`
  volume mount; the Hatchet admin command ignored the generated `/config`; and
  the UI launcher ran Next from the repository root, then treated first-compile
  timeout/reset as terminal. Each defect received a focused RED before the
  narrow production repair.
- The restored combined boundary is `31/31` GREEN, with root typecheck, lint
  (28 edges, zero violations, zero blocking source findings), and diff-check
  GREEN. The real data plane now reports every migration/principal/register/
  secret/mail attestation READY, and the Hatchet token reports
  `ATTESTED:REACHABLE` without logging its value.
- The supervisor now reaches the final TLS stage. The existing mkcert root is
  not present in macOS trust. Installing it is a persistent workstation trust
  mutation, so the attempted escalation was refused and no verification bypass
  was introduced. DEV-11A and the browser journey remain `✗` pending explicit
  owner approval.
