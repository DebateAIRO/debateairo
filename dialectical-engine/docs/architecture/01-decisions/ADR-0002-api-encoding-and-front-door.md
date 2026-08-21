# ADR-0002 — API encoding and the single front door

| Field | Value |
|---|---|
| **Status** | **RULED — DR-117 (V + the human stack sitting, FINAL).** **Fastify + TypeScript** as the single front door, **SSE** for realtime; resource-shaped JSON, one versioned namespace, contract-first, additive-only. This is the original C4 instantiation, **restored as the ruled text**; the FastAPI episode of DR-105 is **SUPERSEDED** and recorded at §"The superseded episode". See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 · re-instantiated 2026-08-07 (DR-105) · **restored and ruled 2026-08-07 (DR-117)** |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04. **Ruled at the DR-117 stack sitting**, executed as PRE-10 rev 2. |
| **Source of record** | Plan.md rev 3, §2.3 and §5.1, with §5.7 and §2.6; PROG-V3-R1 ledger **DR-116, DR-117** |

## Context

The interface boundary contract is explicit that it is *not* endpoint design and
that the encoding question — "whether that is REST, GraphQL, one document or
twelve" — is the architecture loop's to propose and V's to ratify (ui §0). This
ADR is that proposal for the **encoding and the front door**; the frozen resource
vocabulary itself is `04-api-contract.md`'s deliverable (ui §5 W1; Plan.md §5.7).

Four constraints shape the choice, and one of them is not the obvious one:

- **AC-60 — one transport** (ui §1.4 L5, DR-048): server-side rendering and the
  browser read the same contract through the same front door; no second proxy
  and no hook that fires on only some paths. V2's three-path seam is the named
  failure (ui digest §3.2).
- **AC-56 — the disclosure split** (DR-054; spec §12.6 S-22…S-24): the browser
  receives typed projections; the complete fact bundle and the conformance
  record are fetchable through an authorized handle. This is the harder
  constraint, because it makes authorization a **payload-class** decision rather
  than a per-field one (ADR-0013).
- **AC-54 — machine-injected honesty fields** (DR-058; spec §12.1b S-9a–c):
  honesty fields are injected into the output structure outside the composition
  model's discretion, so that silent truncation of an honesty surface is
  impossible by construction.
- **AC-61 — the bidirectional field inventory** (DR-047 clause 4; ui §1.4 L6):
  the audit must walk a declared inventory of served fields and event names.

**AC-62** (real pagination; reads carry no write side effects; ui §2 surfaces 1
and 14) and **AC-84** (research findings land as data, not as changes to the
serve contract; charter §6, A5.5) constrain the shape of reads and the
versioning policy respectively.

## Options considered

### Option A — Fastify (TypeScript), resource-shaped JSON over HTTP, one versioned namespace `/v1`, contract declared once as schemas in `packages/contract` and published as OpenAPI *(chosen; RULED at DR-117)*

`apps/api` is the only implementation of the contract. The interface never
proxies `/api/*` and never talks to a second address; the SSR path calls the same
API through the same typed client, forwarding the asker's session scope
(AC-57 · DR-066(1)) and **never as a privileged caller** (Plan.md §5.1, §6.6
UI-5). One code path means a hook cannot fire on two of three paths — AC-60 by
construction rather than by discipline.

Schema-first is what makes the contract auditable: the same declarations
generate the client types, the runtime validators, the OpenAPI document and the
field inventory AC-61's audit walks (ADR-0010).

### Option B — GraphQL *(rejected)*

Genuine appeal: per-field selection makes "no served field without a consumer"
nearly free. Rejected on two counts.

1. **The disclosure boundary is the harder constraint.** AC-56 splits the
   payload into default projections and an authorized bundle; a resolver graph
   turns one authorization gate into a per-field decision over an unbounded
   query space.
2. **AC-54 is structurally at odds with it.** A query language whose premise is
   that the client chooses which fields to receive cannot guarantee that the
   reader is never shipped an answer missing its badges.

Resource shapes additionally make AC-62's real pagination and AC-56's bounded
payload ordinary rather than special.

### Option C — tRPC / RPC-only *(rejected)*

End-to-end types without a declared contract artifact. The pack requires a
nameable, freezable resource vocabulary (ui §5 W1) and an auditable field
inventory (AC-61); a procedure surface yields neither.

### Option D — NestJS *(rejected)*

Decorator and dependency-injection indirection works against charter A3.6's
maintenance test — name the single place where a behaviour is decided — which
AC-85 carries.

### Option E — FastAPI (Python) *(ruled in at DR-105; ruled out at DR-117)*

Worked in full at PRE-10 rev 1 and reversed at the stack sitting. Recorded at
§"The superseded episode"; **not a live alternative.**

## Decision

**Fastify (TypeScript) as the single API service; resource-shaped JSON over HTTP;
one versioned namespace `/v1`; the wire contract declared once as schemas in
`packages/contract` and published as OpenAPI.** SSR is a caller of the same front
door and never a privileged one. Versioning is **additive-only within `/v1`**: a
non-additive shape change is a new version (AC-84 · charter A5.5; Plan.md §5.7).

Status: **RULED at DR-117** by all the humans in the loop.

### Realtime is SSE on this same front door (DR-117)

DR-117 names the realtime transport explicitly — **SSE** — and it is the same
decision AC-60 already forced rather than a new one: the stream is *"one stream
on the same front door"* with a closed event vocabulary declared in
`packages/contract` (ADR-0008; P14). Three clauses so nothing drifts:

1. **The SSE endpoint is a route of `apps/api`**, in the same `/v1` namespace,
   subject to the same authorization tiers (ADR-0013). It is **not** a second
   service and **not** a second address.
2. **Event names and payload shapes are declared in `packages/contract`** like
   every other wire shape, so E1 (no event without a declared consumer) and E2
   (one name per meaning) are decided by the same audit that decides fields
   (ADR-0008, ADR-0010; AC-61).
3. **The stream carries projection-grade payloads or bare signals, never
   bundle-grade** (ADR-0008). A stream that shipped the fact bundle would route
   around AC-56's disclosure split.

**One deployment consequence is recorded rather than discovered later:** SSE
passes through the Cloudflare proxy of
[ADR-0018](ADR-0018-deployment-topology.md), and proxy buffering is the classic
way a working stream becomes a broken one. **The proxy path is part of the one
transport, not an exception to it** — there is no direct-to-origin bypass for
the stream, and if the proxy needs configuration to pass SSE unbuffered, that
configuration is deployment work, **not a licence to open a second path**.

## Consequences

**Accepted:**

- V2's three-path transport seam cannot recur: there is one implementation of
  the contract, so a per-path divergence has nowhere to live (AC-60).
- Authorization is evaluated **once per request against a payload class**, not
  per field — which is what makes ADR-0013's three tiers implementable at all.
- The field inventory AC-61 walks and the event registry AC-61/E1 requires are
  build artifacts of the same declarations (ADR-0008, ADR-0010).
- `packages/contract` is the only package the interface may import types from
  (Plan.md §2.6 structural rule 2) — AC-59's "no adapter" restated as a
  dependency-graph property, not a review note.
- **Realtime does not add a transport.** SSE is a route, not a second front door
  ([ADR-0018](ADR-0018-deployment-topology.md) carries the proxy clause).

**Costs and risks:**

- Per-field selection is given up. AC-61's "no served field without a consumer"
  therefore has to be **audited** rather than obtained for free — the cost is
  paid in ADR-0010's three named mechanisms.
- Resource shapes make over-fetching possible in principle. The mitigation is
  structural rather than optional: the fact bundle and conformance record are
  **not** in the default answer read (Plan.md §5.3), so the default payload is
  bounded by the projection/bundle split of ADR-0007 and ADR-0013.
- **SSE through a proxy is an operational risk with a code-shaped temptation.**
  The wrong fix for a buffered stream is a second address that bypasses the
  proxy; that fix is forbidden by AC-60 and by
  [ADR-0018](ADR-0018-deployment-topology.md), and it is written here because it
  is the shape a hurried engineer reaches for.
- ~~If V ratifies a different language, this ADR is re-instantiated (Plan.md
  §9); the *shape* decisions survive and only the framework row does not.~~
  **This happened, and the prediction held exactly** — see §"The superseded
  episode". The sentence stays as a proven statement rather than a hypothetical.

## The superseded episode — FastAPI (DR-105 → DR-116 → DR-117)

**DR-105** ruled the engine Python/FastAPI; **DR-116** made that ruling
CONDITIONAL and sent the stack to a human sitting with both options fully
worked; **DR-117** superseded it. The full three-ruling history is at
[ADR-0001](ADR-0001-language-and-runtime.md) §"The superseded episode" and is
not repeated here.

**What the FastAPI instantiation had decided, and why it is worth keeping:**
this ADR's own prior cost bullet predicted that only the framework row would
move, and rev 1 proved it — the encoding, the namespace, contract-first,
additive-only, SSR-never-privileged and `04-api-contract.md`'s whole resource
vocabulary came through untouched. What changed was the mechanism under
"declared once":

| Clause | Fastify (operative) | FastAPI (superseded) |
|---|---|---|
| The one declaration | schemas in `packages/contract` | pydantic models in `packages/contract` |
| The OpenAPI document | generated from those schemas | generated from those models — **and, critically, a build artifact never checked in**, because a checked-in document is a second declaration |
| The interface's types | **the same declarations**, imported in-workspace | **generated** from the document, types-only, never hand-edited, with a **byte-equality regeneration gate** |
| AC-59's force | structural (one declaration, two consumers) | gate-enforced (one declaration, one generated mirror, one diff gate) |

**One clause from the episode is retained as operative guidance even under
Fastify:** if the OpenAPI document is ever materialized to disk for tooling, it
is a **build artifact regenerated in CI, never a checked-in source of truth.**
Under the operative stack nothing depends on that document for types — the
declarations are shared directly — so the risk is smaller, but a stale
checked-in contract document is a defect in either instantiation.

**Status: record, not option.** It may be cited as history and as the
measurement of what a cross-language wire boundary costs. It may not be cited as
a live alternative.

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-60 — one transport | ui §1.4 L5 (DR-048) | `apps/api` as the only contract implementation; SSR uses the same client and addresses; **SSE is a route on it**; the law holds through the Cloudflare proxy |
| AC-56 — wire boundary, projections vs authorized bundle | DR-054; spec §12.6 S-22…S-24 | payload classes over resources rather than per-field resolution |
| AC-57 — asker-scoped authorization | DR-066(1) | session scope forwarded on the SSR path; SSR never privileged |
| AC-54 — honesty fields machine-injected | DR-058; spec §12.1b | non-optional fields on the resource; no client-chosen field set |
| AC-61 — bidirectional field/event inventory | DR-047 clause 4; ui §1.4 L6, §1.3 E1 | one schema declaration generating the inventory the audit walks — **fields and SSE event names alike** |
| AC-62 — real pagination, side-effect-free reads | ui §2 surfaces 1 and 14 | keyset pagination on the index; reads perform no writes (ADR-0007) |
| AC-59 — no adapter | DR-048; spec §12.6 | `packages/contract` as the sole declaration of any wire shape |
| AC-84 — findings land as data, not as serve-contract changes | charter §6, A5.3, A5.5 | additive-only within `/v1` |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.

**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **The resource vocabulary itself** is frozen in `04-api-contract.md` (ui §5
  W1), not here. **That document was untouched by both DR-105 and DR-117** — the
  API direction is a Plan.md §9 survivor, in both directions of the reversal.
- **RULED — Q-26 (DR-095)** — "kept component" = **kept SURFACE, rebuilt
  insides**: pages, canvas, drawers, badges and navigation stay, components are
  rebuilt inside as the flex rows require, each altered component approved at
  its mockup review (DR-064). It governs the interface side of the boundary, not
  the encoding — this ADR is unchanged by it.
- **RULED — Q-01 / Q-02 (DR-068 / DR-069)** — kept UI source is carried into
  the repo, with **no fence**. `packages/contract` is therefore consumed across
  **no boundary at all** — one declaration, one workspace, one checkout — which
  is the strongest form of the plan's own analysis that AC-59 requires one
  contract *declaration*, not one *checkout*
  ([ADR-0016](ADR-0016-repository-layout-no-fence.md)).
- **The SSE event vocabulary's members** are `04-api-contract.md`'s and
  ADR-0008's, minted under E1/E2 — DR-117 names the transport, not the names.
