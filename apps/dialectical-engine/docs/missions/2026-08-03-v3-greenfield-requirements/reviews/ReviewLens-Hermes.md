REVIEW LENS HANDOFF COMPLETE
Lens: human-readability/stranger test (Hermes)
Verdict: LENS CHANGES REQUESTED

## Findings

1. **blocker — The packet fails its own stranger test because core terms and authorities are never made self-contained.**
   - **Exact file + section:** `00-intake-H0.md` — title and opening (lines 1–5), “Loop-ownership election (ruling R7)” (lines 57–74), “Wayfinder integration” (lines 86–102), and “Inherited context” (lines 104–117); `wayfinder/map.md` — “Notes” (lines 18–47); tickets 01–16 — each `Question`, `Why`, `Method`, or `Settles` passage that relies on battery stage names or project shorthand without an in-packet definition.
   - **Evidence:** A stranger is asked to infer what `H0`, `V`, `V2`, `V3`, “Graph Spine v2 §5.1”, “One-Prompt Machine”, `R7`, “Claude-Router seat”, `/grilling`, `/domain-modeling`, “ARCHITECTURE loop”, “battery outputs”, “clean-room”, “organs”, “QBAF/DF-QuAD”, `qbaf_debug`, “trusted-run reconstruction”, “ways-of-knowing labels”, “five typed abstentions”, “lineage”, “retained substance”, and “liveness/removal threshold” mean. Some terms can be reconstructed only by opening prior-mission files not linked from the passage; others are not defined in any allowed input. Ticket-specific blocking examples are 01 lines 15–19, 02 lines 9–22, 03 lines 9–27, 04 lines 9–20, 05 lines 9–28, 06 lines 9–20, 08 lines 9–18, 09 lines 11–19, 10 lines 9–24, 11 lines 9–18, 12 lines 9–24, 13 lines 9–17, 14 lines 9–19, 15 lines 9–21, and 16 lines 9–25. Ticket 07 also assumes the reader already understands the three “seats” and what adopting a MACHINE/HYBRID/LLM label requires. A stranger therefore cannot reliably restate each decision and its consequence from intake + map + tickets.
   - **Concrete change:** Add a short plain-language “How to read this packet” section and glossary in one authoritative file, then link every shorthand use to it. Expand the mission’s authority terms and stage names on first use. Define every output family and knob in ordinary language, especially the five abstention types, lineage, ways-of-knowing, retained substance, liveness, and the kept scoring behaviors. Link directly to the prior report section when prior-mission meaning is required.

2. **blocker — The map does not provide a complete route from the current state to the four-artifact destination.**
   - **Exact file + section:** `wayfinder/map.md` — “Destination” (lines 7–14), “Notes” (lines 41–43), “Decisions so far” (lines 49–68), and “Not yet specified” (lines 70–91); all issue files’ `Status:`/`Blocked by:` headers.
   - **Evidence:** The map never indexes all 17 tickets, never names the current frontier, and never gives an ordered route through research, V rulings, authoring, review, and acceptance. Tickets 02, 04, 07, 09, 11, 13, and 14 are not discoverable from a complete board/index in the map. A stranger cannot tell which of the eleven unblocked tickets should happen now, which decisions feed which destination artifact, or what “Arrived” can be checked against beyond the subjective phrase “ARCHITECTURE could start without asking V anything new.” The sentence that this effort “CARRIES the authoring” does not identify an owner, ticket, dependency, or acceptance gate.
   - **Concrete change:** Replace narrative routing with a complete map index containing all 17 ticket links, type, status, blockers, owned decision/artifact, and frontier order. Show the dependency chain through authoring and the three review lenses. Give each destination artifact an objective completion checklist and an explicit acceptance owner.

3. **blocker — Two destination artifacts have no ticket that owns their final authoring, so the stated destination is not reachable on the board.**
   - **Exact file + section:** `wayfinder/map.md` — “Destination” artifacts (1) and (2) (lines 9–12) and “Execution override” (lines 41–43); `issues/02-scoring-behavior-extraction.md` — “Deliverable” (lines 29–32); `issues/04-node-graph-data-model.md` — “Deliverable” (lines 29–32); `issues/05-battery-coverage-matrix.md` — “Deliverable” (lines 35–38); compare `issues/15-race-victory-criteria.md` lines 23–25 and `issues/16-ui-flex-negotiation.md` lines 9–14, which explicitly own destination artifacts (4) and (3).
   - **Evidence:** Tickets 15 and 16 explicitly produce destination artifacts 4 and 3. No ticket produces the final requirements spec (artifact 1) or final clean-room carryover manifest (artifact 2). Tickets 02, 04, and 05 produce research inputs, not those destination documents. No dependency joins the research and V rulings into final authoring. A stranger following every ticket can finish the board without producing half the promised pack.
   - **Concrete change:** Add or designate explicit authoring tickets for artifacts 1 and 2, with blockers covering every required research/ruling ticket, exact output paths, acceptance criteria, and review-gate dependencies. Index ownership in the map rather than restating the artifact content there.

4. **major — Decisions are duplicated instead of indexed, and one duplicated ruling already differs in strength.**
   - **Exact file + section:** `00-intake-H0.md` — “Standing V decisions” (lines 20–30) and “Charting rulings” (lines 126–149); `wayfinder/map.md` — “Notes” (lines 21–47) and “Decisions so far” (lines 49–66).
   - **Evidence:** GREENFIELD, KEEP-V2-UI/MAY-FLEX, CLEAN-ROOM, coverage, experiment timing, behavior-only scope, review authority, and blitz pace are restated in both files. This violates the lens rule that the map index rather than restate what another artifact owns. Drift is already visible: intake line 25 says the frozen-control-arm role is “confirmed pending the race-scope grilling question,” while map lines 53–55 state without qualification that V2 “becomes the frozen control arm.” The map also repeats the excluded semantics and inherited partition rather than pointing to one owning register.
   - **Concrete change:** Choose one owner for each ruling (intake for charting rulings, later the relevant closed ticket), keep the full wording only there, and make the map a link plus one-line status/index. Preserve the “pending race-scope” qualifier until ticket 15 resolves it, or record an explicit later ruling that removed the qualifier.

5. **major — The board inventory is arithmetically wrong.**
   - **Exact file + section:** `00-intake-H0.md` — final charting summary (lines 151–153); issue headers 01–17.
   - **Evidence:** Intake claims “17 tickets (6 research, 9 grilling, 1 task).” Those classes total 16, and the files actually contain 6 research tickets (01–06), 10 grilling tickets (07–16), and 1 task ticket (17). This prevents a stranger from trusting the map’s board custody or knowing whether a ticket/class is missing.
   - **Concrete change:** Correct the summary to `6 research, 10 grilling, 1 task`, and derive/show the same inventory in the map’s complete ticket index.

6. **major — The packet contradicts itself about the named set of four defects.**
   - **Exact file + section:** `wayfinder/map.md` — “Notes” (lines 31–35); `issues/02-scoring-behavior-extraction.md` — “Why” (lines 18–22); `issues/14-staleness-expiry-policy.md` — “Settles” (lines 15–19).
   - **Evidence:** The map and ticket 02 define the four indicted semantics as unjudged-node fallback, hardcoded aggregation choice, exact-string dedup, and provenance-blind serving. Ticket 14 then calls the old engine’s “no outcome memory” defect “one of the four.” It is not one of that named four. A stranger cannot tell whether the race must repair four defects, five defects, or a different four.
   - **Concrete change:** Create one authoritative numbered defect register and link every reference to it. Either classify “no outcome memory” separately and state its race obligation, or issue an explicit ruling that changes the four-item set everywhere.

7. **major — Status and frontier semantics are not board-coherent enough for an outside reader to route work safely.**
   - **Exact file + section:** every ticket header (`Status: open`, `Blocked by:`); `issues/17-v3-repo-bootstrap.md` — “Notes” (lines 15–19); `wayfinder/map.md` — “Notes” pace paragraph (lines 21–23) and “Not yet specified” (lines 70–91).
   - **Evidence:** All 17 tickets say `Status: open`, including 07, 08, 15, and 16, which name blockers. The packet defines no status vocabulary explaining whether `open` includes blocked work. Ticket 17 says it must be worked late, but has `Blocked by: none`, so the board permits it on the first frontier. The map does not state a frontier or encode the “late” constraint. A stranger or mechanical dispatcher could select the wrong work while still obeying every header.
   - **Concrete change:** Define the status vocabulary; mark dependency-blocked work with an unambiguous blocked/not-ready state or state explicitly that `open` is non-routable when `Blocked by` is nonempty. Encode ticket 17’s real predecessor(s) or a named milestone blocker. Publish the current frontier in the map.

8. **major — Several decision tickets introduce choices that cannot be traced or restated from the packet.**
   - **Exact file + section:** `issues/03-golden-vector-plan.md` — `MUST-DIFFER (indicted semantic #n)` (lines 19–27); `issues/10-abstention-semantics.md` — five typed abstentions (lines 9–24); `issues/12-human-rules-and-knobs.md` — knob list (lines 9–24); `issues/15-race-victory-criteria.md` — measures (lines 15–21); `issues/16-ui-flex-negotiation.md` — output-family list (lines 9–14).
   - **Evidence:** The four semantics are not numbered, so ticket 03’s `#n` cannot be resolved. The five abstention types are never enumerated. Ticket 12 cites a “quick-fire verdict,” “blind-verification coverage,” “steering authority per hop,” and “Grok’s seat questions” without direct source links or operational definitions. Ticket 15 uses “retained substance” as a victory measure without saying how it is observed. Ticket 16 asks V to negotiate output families whose shapes are not defined. These are not merely technical details: they are the objects V must decide, so ambiguity can produce different rulings.
   - **Concrete change:** Add direct source links and plain definitions to each ticket; number the defect register; enumerate the five abstention types; define each knob’s allowed values and consequence; and give every race measure a measurable definition or assign a prerequisite ticket that will do so before grilling.

9. **minor — The packet does not distinguish facts, standing rulings, candidate recommendations, and still-open questions consistently.**
   - **Exact file + section:** `00-intake-H0.md` — “Inherited context” (lines 104–117); `wayfinder/map.md` — “Notes” and “Decisions so far” (lines 16–66); `issues/06-contested-decision-briefs.md` — “Why” (lines 14–20); `issues/12-human-rules-and-knobs.md` — “Question” (lines 7–19).
   - **Evidence:** The intake correctly says contested rows are preserved and never adjudicated by agents, and ticket 06 says recommendations are inputs only. But the map mixes rulings, inherited report facts, method, exclusions, and open knobs in adjacent bullets without typed labels. Ticket 12 places seat proposals beside V-opened knobs, making their authority look equal. A stranger can restate a proposal as a decision.
   - **Concrete change:** Label every indexed item as `FACT`, `V RULING`, `CANDIDATE/SEAT PROPOSAL`, or `OPEN DECISION`, with one owning source link and date/authority where applicable.

## Refutations attempted

- I tried to find missing ticket numbers or nonexistent named blockers and could not: issue files 01–17 are contiguous, and blockers 01, 05, and 06 all exist.
- I checked the declared dependency edges and could not break their local references: 07←05, 08←06, 15←05, and 16←01 match the corresponding `Blocked by:` lines.
- I tried to find broken real Markdown links among the map and 17 tickets and found none; the only nonexistent target is the intentionally commented template `issues/NN-slug.md`.
- I tried to find a conflict between the map’s explicit out-of-scope list and tickets 03, 16, and 17 and could not: ticket 03 says not to build a harness, ticket 16 produces a contract/change list rather than UI changes, and ticket 17 produces a bootstrap plan rather than creating the repository.
- I checked whether the coverage partition can account for all battery questions and could not break it: the cited groups are 38 unanimous plus 24 contested, and tickets 07 and 08 state complementary ownership of those rows and the nine rules.

## What proof would flip the verdict

A revised intake + map + ticket set would flip this verdict if it demonstrates all of the following in the reviewed files themselves:

1. A stranger-facing glossary/reading guide defines the mission authority, method, stages, scoring terms, output families, abstention types, lineage, knobs, and measures without requiring undocumented project knowledge.
2. The map is a complete 17-ticket index and current-frontier route, with statuses, blockers, decision/artifact ownership, and objective destination acceptance gates.
3. Explicit tickets own and wire the final authoring of all four destination artifacts, especially the requirements spec and carryover manifest.
4. Each ruling has one authoritative owner; the map links rather than duplicates it; the frozen-control-arm qualifier is resolved consistently.
5. The inventory is corrected to 6 research + 10 grilling + 1 task, and a single numbered defect register resolves the “four defects” contradiction.
6. Status semantics prevent blocked or deliberately-late tickets from being routed early.
7. Every V-facing choice has a plain definition, provenance link, allowed decision shape, and observable consequence.
