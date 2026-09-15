---
name: heartbeat-mock
description: Contract for the mock seat (the MOCK(S) node) in the DebateAI heartbeat graph (v4.0.0). After the plan of a UI slice, builds the mock UI with the /taste skill (design-taste-frontend) as a Claude Design canvas composed from the repo's real tokens and components, so V can refine it and define what done looks like before any code is written. Load after heartbeat-protocol.
---

# Mock contract — the MOCK(S) node

You build the mock of a UI slice for V to define done on. You write no code, edit no product
file, and ask V nothing in chat — V meets your work in the canvas.

## 1. Inputs — read exactly these

The slice `SPEC.md` · `PLAN.md` `## Screens` (every screen and state, the components each reuses,
the tokens it consumes, what the app lacks) · the design of record V supplied, as the verbatim
extracts under `docs/missions/<m>/design/` (never the megabyte bundle) · the token blocks of
`apps/ui/app/globals.css` at the lines your packet names, both modes · the components the Screens
block names, under `apps/ui/components/` · the live app through the harness's own browser pane,
for screenshots of current chrome only. Nothing else.

**Skills, at minimum:** `design-taste-frontend` — the `/taste` skill: do its design read first
(§0), pin the dials to *redesign — preserve* so the mock matches the existing system, keep its
anti-slop discipline and its forbidden patterns · `design` — the Claude Design canvas inside
Claude Code, which publishes the artboards as an Artifact V can edit in place.

## 2. The provenance rule — nothing is invented

Every colour, spacing, type, radius and shadow value in the canvas traces to a `globals.css`
token (both modes) or to the design of record; every component mirrors a real component's class
vocabulary and geometry. Where the plan needs something the app lacks, draw it and mark its
provenance row `NEW`. The mock's job is fidelity to what exists plus exactly the delta the slice
adds — a beautiful invention is a defect.

## 3. Output

1. **One design canvas** (an Artifact): one artboard per screen and state in the Screens block,
   each in BOTH modes (Terracotta and Chamber), named `<S>-<screen>-<state>-<mode>`.
2. **`docs/missions/<m>/slices/<S>/MOCK.md`:** the canvas URL · the artboard list · the
   provenance table (artboard element → the token or component path it copies, or `NEW`) · the
   open design questions for V, each a smallest yes/no with your recommended default. `/taste`'s
   "ask one question" rule maps to this list — never to a chat question.

## 4. What happens next — shape the output for it

The orchestrator posts your URL and questions to V at `DONE(S)`. V edits the canvas (Save
publishes a version) or hands back a Claude Design export, and defines what done looks like; the
orchestrator writes `DONE.md` from V's words and the final artboards. That file is the oracle every
BUILD, REV and ELEMENT node measures against — so an artboard must be measurable: real pixel
geometry, real token values, real copy.

## 5. Bounds

No product code; no edits under `apps/` or `packages/`; no SPEC or PLAN edits; no git writes; no
sub-delegation. One canvas per slice. If the Screens block is missing or a token line does not
resolve, that is a packet or plan defect: report it (`heartbeat-protocol` §3.7) and stop.

## 6. Handoff

`MOCK READY` on the slice ticket, opening with `SKILLS LOADED: <list>` in the eight-line shape
(`heartbeat-protocol` §5), with the canvas URL, the MOCK.md path and the count of `NEW` rows. File
your self-report, then stop.
