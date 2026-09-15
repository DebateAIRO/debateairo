# ObservationAgent Module-Owned Status and FixAgent Evidence Boundary

**Status:** approved in chat on 2026-09-05; written-spec review pending.

**Scope:** ObservationAgent shared compatibility and OBS-07 only. This design does not implement FixAgent, SupportAgent, live acceptance, deployment, or security hardening.

## 1. Context

The local ObservationAgent chain is implemented and independently verified through OBS-06. OBS-07 is clean and stopped before edits because two required behaviors cannot be expressed through the inherited shared interfaces:

1. OBS-07 owns routing, channels, acknowledgement, escalation, storm state, and a loopback status page, but the shared status contract only accepts states, numbers, timestamps, and a small fixed template set. It cannot truthfully represent the required board, loopback endpoint, capture path, routing matrix, or external reference.
2. The contributed router factory receives delivery capabilities but not its already-validated target fragment or current module thresholds. The initial `AGENT_SELF` signal is routed before a module probe receives those values.

The user made two architectural decisions:

- each component or ObservationAgent module owns the meaning of its own status;
- FixAgent work comes from explicit possibly-defective signals and the captured error evidence stream, never from scraping human-readable status.

“Possibly defective” maps to the existing typed invariant `suspected_defect = true`. “Whole stack trace” means every normalized, repo-relative frame plus the complete normalized cause chain. It never means raw exception text or arbitrary captured content.

## 2. Goals

1. Preserve module ownership of status semantics while keeping one generic, strict ObservationAgent storage and rendering envelope.
2. Let the single contributed router initialize from its owning validated configuration before the first routed signal and observe current thresholds after reload.
3. Let the router publish its own bounded status without contacting a channel.
4. Make all OBS-07 status required by its frozen SPEC representable without adding OBS-07-specific meaning to shared core.
5. Preserve signal-journal-before-router ordering, delivery ATTEMPT-before-effect ordering, atomic status snapshots, legacy routing behavior, and the privacy wall.
6. Freeze the future FixAgent input boundary as two typed feeds: captured errors and explicit suspected-defect signals.
7. Resume OBS-07 without changing another slice's behavior or implementing another agent.

## 3. Non-goals and safety boundaries

- No FixAgent or SupportAgent implementation.
- No raw error message, prompt, response, query text, payload, cookie, token, email, user identifier, ciphertext, or arbitrary product string in ObservationAgent signal or status storage.
- No ObservationAgent read of `obs.occurrence_detail` and no ObservationAgent write to `obs.occurrence`.
- No FixAgent scraping of `oactl`, HTML, digest Markdown, notification text, or delivery logs.
- No free-form status strings or module-defined HTML.
- No second router, module override of the core `status` verb, arbitrary environment access, or module-side reread of deployment files.
- No live V acceptance, credentials, channel contact, service install/start/restart, push, shared-branch merge, or action involving PR #8/security-hardening.

## 4. Considered approaches

### A. Selected: module-owned typed status plus dual FixAgent feeds

Modules own status facts. Shared core validates a closed set of privacy-safe projection shapes, namespaces them by module, persists one atomic snapshot, and renders them. The contributed router receives its owning configuration before first use and exposes a status snapshot through the same envelope. FixAgent later consumes typed error occurrences and typed suspected-defect signals independently.

This keeps ownership local, preserves privacy, and avoids coupling automation to presentation text.

### B. Rejected: arbitrary string projections or raw stack text in signals

This would make OBS-07 easy to render, but it would reopen the injection and privacy boundary. A module could persist product text, credentials, prompts, or raw exception messages in `status.json`, HTML, notifications, or the FixAgent feed.

### C. Rejected: per-module status commands or FixAgent status scraping

Allowing modules to replace `oactl status` creates conflicting owners and inconsistent snapshots. Scraping CLI or HTML copy makes FixAgent behavior depend on presentation text, loses typed correlation, and turns ordinary infrastructure warnings into accidental repair work.

## 5. Ownership model

| Concern | Owner | Shared core responsibility |
|---|---|---|
| Component health meaning | The module that probes the component | Validate, namespace, persist, and render its projections |
| Detector decision and `suspected_defect` | The detector module | Validate the closed signal and enforce defect-kind consistency |
| Channel selection, acknowledgement, escalation, storm state | OBS-07 routing module | Supply durable signal/delivery capabilities and collect router status |
| `oactl status` | ObservationAgent core | Render the atomic snapshot; never invent module semantics |
| Loopback status page | OBS-07 status-page module | Supply the same stored snapshot; core does not own HTML semantics |
| Captured thrown-error evidence | Existing `obs` capture pipeline | ObservationAgent neither duplicates nor reads private detail |
| Automated diagnosis/repair intake | Future FixAgent | Consume only the two typed feeds in section 9 |

The status snapshot is an aggregate view, not a global status owner. Every module projection remains under its module namespace. OBS-07 router projections remain under the routing module namespace and cannot overwrite another module's keys.

## 6. Closed status projection contract

All existing state, metric, timestamp, and fixed numeric-template projections remain compatible. Shared core adds only generic, bounded shapes needed by module-owned status:

1. **Closed channel set** — an ordered, duplicate-free subset of `digest`, `status`, `osascript`, `sendmail`, and `kanban`; at most five values.
2. **Closed component value** — one existing `ObservationComponent` value, used for facts such as a storm root.
3. **UUID value** — a UUID or `null`, used for acknowledgement and signal references.
4. **Safe identifier** — a value classified as `board` or `external_ref`, 1–64 ASCII characters, matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. It cannot carry whitespace, quoting, markup, a URL, or path separators.
5. **Loopback endpoint** — an integer port from 1024 through 65535 and a path matching `^/[a-z0-9][a-z0-9/_-]{0,127}$`. Rendering always derives `http://127.0.0.1:<port><path>`; a module cannot supply the host or scheme.
6. **State-child path** — one through eight relative path segments, each matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. Core resolves the display value beneath the fixed state directory and rejects `..`, absolute paths, escapes, and an overlong result.
7. **Count/seconds threshold template** — finite non-negative integer count and seconds fields, used for facts such as `storm 5/60s` without a free-text template.

Every projection retains the existing bounded key and optional bounded view. The stored schema stays strict, rejects unknown fields, caps total projections, and rejects duplicate `(view,key)` pairs within a module. A router snapshot and ordinary module snapshot are combined only after both validate; collisions fail closed.

Renderers are fixed core code. They HTML-escape rendered values even though the schemas already exclude markup. The loopback page receives the stored snapshot and fixed impact templates only; it never accepts module HTML.

## 7. Router ownership and initialization

Discovery retains one optional router contribution as an owned record:

```ts
type RouterContribution = Readonly<{
  moduleName: string;
  targetFragmentBasename: string;
  factory: SignalRouterFactory;
}>;
```

A contributed router must belong to a discovered module and name that module's target fragment. Zero contributions installs the unchanged legacy osascript router. More than one contribution, a missing/mismatched fragment, or an invalid factory fails startup before a probe or channel effect.

After target and threshold validation, but before the initial `AGENT_SELF` signal, core invokes the factory with:

- the fixed state directory;
- the typed delivery coordinator and osascript executor;
- the owning module name;
- the owning immutable target fragment and configuration;
- the owning immutable module-threshold object and current threshold version.

The router must validate its OBS-07-specific fragment and threshold schema inside `create`. Shared core does not learn board, channel, escalation, or storm semantics.

`onSignal` and `onTick` retain the existing routing policy and mute inputs and additionally receive the current owning module thresholds and threshold version. A threshold reload therefore reaches the router without reconstruction, file rereads, or stale defaults. Target configuration is immutable for the process lifetime, matching the existing target loader.

The router interface adds:

```ts
status(): readonly ModuleStatusProjection[];
```

`status()` is a pure local snapshot: no sendmail, Hermes, database, filesystem scan, or other channel contact. Core calls it after `onTick` and before the atomic status write, validates it, and combines it under the router owner's module namespace.

## 8. Runtime data flow and failure behavior

```text
validated module signal intent
  -> closed signal validation
  -> signal journal fsync
  -> best-effort Postgres signal mirror
  -> component/open-set update
  -> initialized router onSignal
       -> zero or more typed delivery actions
       -> ATTEMPT journal fsync
       -> bounded channel effect, when disposition is EXECUTE
       -> RESULT journal fsync
       -> best-effort delivery mirror

each cycle
  -> threshold reload
  -> module probes/samples/signals
  -> router onTick with current thresholds
  -> module projections + router status()
  -> strict validation and collision check
  -> atomic status.json replacement
```

No channel effect can precede signal durability. No Postgres outage can erase the local signal or delivery record. A channel failure becomes a typed FAILED delivery and cannot block a later independent channel action.

Invalid router bootstrap configuration stops startup before the initial signal is routed. Invalid runtime status output is not persisted or rendered; the prior atomic status snapshot remains intact and the cycle fails through the existing ObservationAgent self-observability boundary. A router exception cannot remove the already-fsynced signal.

The legacy router remains behavior-preserving when no contribution exists: existing severity, delay, mute, rate-limit, clear, journaling, and delivery semantics continue to pass the inherited OBS-01 through OBS-06 suite.

## 9. FixAgent evidence boundary

FixAgent eventually receives two independent typed inputs:

1. **Captured-error feed:** first-party `obs.occurrence` records from the existing error-capture pipeline, including every normalized repo-relative frame, normalized cause-chain codes, fixed template identifiers/parameters, and correlation references authorized to the listener interface.
2. **Silent-defect feed:** rows from `observation.defect_signal_v`, which contains only signals for which a detector explicitly emitted `suspected_defect = true`, plus their matching CLEARED rows.

Status state, severity alone, channel failure, capacity pressure, infrastructure outage, and operational degradation never create FixAgent work. A detector owns the possibly-defective decision; shared core validates the invariant that `suspected_defect` and `defect_kind` agree.

FixAgent correlates the two feeds with typed run, work-item, attempt, ledger, parent-occurrence, and source-event references. It does not join on rendered text. A silent defect may have no captured stack; that absence remains truthful rather than manufacturing one. A thrown error may enter the captured-error feed without an ObservationAgent defect signal.

The current ObservationAgent change does not create the FixAgent reader or modify `obs.occurrence_detail`. Any future listener projection needed to expose normalized cause-chain codes belongs to the FixAgent/capture contract and must retain the same privacy boundary.

## 10. OBS-07 use of the contract

OBS-07 remains the sole owner of:

- severity-to-channel routing;
- acknowledgements, mute/rate-limit outcomes, and escalation counters;
- durable OPEN-to-channel and ticket external-reference history;
- storm membership, root, fifth-signal clock, suppression, summary, and recovery;
- sendmail and create/comment-only Kanban executors;
- loopback-only status page and refresh behavior;
- its target fragment and threshold defaults.

Its router status uses the generic shapes from section 6 to express:

- `board ops-alerts` as a safe board identifier;
- `status http://127.0.0.1:9797/status` as a derived loopback endpoint;
- `storm 5/60s` as a count/seconds template;
- routing rows as closed channel sets;
- capture directory as a state-child path;
- acknowledgement/signal references as UUIDs;
- last outcomes as existing closed states;
- attempts, escalation count, member count, and delay as existing metrics;
- storm root as a closed component;
- detected/delivered times as existing timestamps;
- ticket ids as safe external references.

OBS-07 cannot override the core `status` verb and cannot introduce arbitrary text projections.

## 11. Strict-TDD verification contract

### Shared compatibility REDs

1. The current schemas reject the required board, loopback endpoint, state-child path, channel set, and 5/60-second status facts.
2. The current router factory cannot observe its owning validated fragment or thresholds before the initial signal.
3. The current router cannot contribute a status snapshot.
4. A synthetic arbitrary-string projection must remain rejected.

### Required GREEN proofs

1. Every new projection round-trips through runtime validation, stored validation, atomic snapshot writing, `oactl status`, JSON, and fixed HTML rendering.
2. Exact required OBS-07 lines render from typed values without storing those lines as free text.
3. Invalid identifiers, URLs, ports, UUIDs, channel values, paths, extra fields, duplicate keys, and projection overflow fail closed.
4. A discovered router receives only its own fragment/configuration and module thresholds before the first persisted signal reaches `onSignal`.
5. A threshold reload reaches subsequent `onSignal` and `onTick` calls with the new version and values.
6. Router status is namespaced to its owner, makes no channel call, cannot overwrite another module's status, and is included in the same atomic snapshot.
7. With no contributed router, inherited behavior and every OBS-01 through OBS-06 regression remain unchanged.
8. Signal persistence still precedes router invocation; delivery ATTEMPT still precedes effects; RESULT still precedes mirror.
9. The defect view still exposes only explicit `suspected_defect = true` signals and matching clears; ordinary unhealthy status never appears there.

### Required reversible refutations

- permit an arbitrary string projection;
- permit a non-loopback endpoint or escaping state path;
- initialize the router without its owned validated inputs;
- route the initial signal before router initialization;
- keep stale module thresholds after reload;
- allow router status to collide with module status;
- let router status contact a channel;
- route a `suspected_defect = false` operational signal into the defect view.

Each refutation must produce its intended focused RED and be restored byte-for-byte. Every authoritative cluster runs three consecutive times after the final edit. Final gates include the full inherited ObservationAgent suite, both established ObservationAgent TypeScript commands, contract generation, root-diagnostic delta, trace containment, source/privacy/audit checks, path/mode/scope checks, and `git diff --check`.

## 12. Sequencing and review

1. Commit this design document alone and obtain user review of the written artifact.
2. Write a detailed implementation plan and strict-TDD compatibility brief.
3. The original exact GPT-5.6-sol shared-foundation worker implements the generic shared change in its isolated OBS-01 lane as one local commit.
4. The controller independently verifies the commit and creates an immutable review package.
5. Replay OBS-02 through OBS-06 in order while preserving patch identity where mechanically possible. Any semantic conflict returns to the owning GPT worker.
6. Advance the clean OBS-07 lane to the repaired OBS-06 candidate and resume the existing exact GPT-5.6-sol OBS-07 worker under its authoritative SPEC/PLAN/DECISIONS.
7. Independently verify the completed assembled OBS-01 through OBS-07 code without live V actions.
8. Retry Claude Opus 5 reviews only when the provider and explicit external-code-egress approval route are available. Review transport does not idle provisional local implementation.

No step authorizes push, merge, live V acceptance, credential access, service mutation, FixAgent/SupportAgent implementation, or any interaction with PR #8/security-hardening.

## 13. Acceptance

This architecture is ready for implementation planning when:

- the written spec contains no placeholder, contradiction, ambiguous ownership, or free-text escape hatch;
- the user confirms that it matches the approved module-owned status and dual-feed FixAgent boundary;
- the design-document commit contains no code or unrelated file.

The compatibility implementation is complete only after the shared commit, downstream replay, resumed OBS-07 implementation, independent non-live verification, and clean-lane evidence all satisfy their respective authoritative plans. Review and live V gates remain separately pending where unavailable or prohibited.
