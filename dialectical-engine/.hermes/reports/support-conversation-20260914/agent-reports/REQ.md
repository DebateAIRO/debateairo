# REQ case file — requirements adaptation

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded: 2026-09-14T11:17:18+03:00. Node `REQ`, ticket `t_7a8d2d0e`, native session `/root/requirements`, source `446c685e977104ecf2b0b5ee0519f7123968429f` on `integration/debate-tiers`.

## Cause and price

1. The approved seven-task plan was organized by technical layer, while the owner asked for three functional checkpoints. The first checkpoint depends on narrow pieces originally placed in later tasks: deterministic security navigation, response validation, API action fields and UI rendering. If left in the old order, CP1 would be a catalog that a user could not safely exercise. Price observed in this node: one cross-plan dependency reconstruction across seven plan tasks and three checkpoints; exact token use is UNAVAILABLE because the harness exposes no usage counter.
2. Knowledge publication currently collapses two different facts into one gate: `status=shipped` and `ratifiedBy=V`. That cannot honestly load new peer-reviewed content for the owner's local CP1 preview because checkpoint acceptance has not happened yet. The repair is a real peer-review provenance record for preview eligibility, blank owner-ratification fields until acceptance, and a separate release assertion before production. Price avoided: a fabricated ratifier and the rework pass it would force.
3. The current answer path trusts a non-empty model string after removing source lines, then stores and returns it. The owner requires credential and false account-action protection immediately, so CP1 must screen every model completion before either sink. Price of deferral would be duplicated safety work and a checkpoint that violates its own product boundary.
4. The existing route knowledge is split between API and UI allow-lists. Repeating another list would create drift. CP1 therefore owns one browser-safe catalog and makes API and UI consume it. Price avoided: two future route sweeps for each navigation change.
5. The owner-confirmed Forgot password flow remains unlocated after source and target investigation. Treating the missing location as feature absence or inventing a URL would create a false product claim. Independent CP1 work can continue, but the checkpoint gate stays blocked until the exact URL or opener is supplied and exercised.

## What nearly went wrong

- The brainstorming workflow normally asks for a new approval. Mission authority explicitly says the existing Support interface and implementation plan are already approved, so a repeated approval request would have stalled an authorized node.
- The old plan places broad history beside retrieval changes. Pulling all history into CP1 would enlarge the checkpoint and collide with later persistence/accounting work. The adaptation brings forward only the context, response and action behavior required for a safe vertical demonstration.
- `SupportMessageCipherPort.write` returns the canonical redacted plaintext record. Ignoring that return and sending the pre-write variable could make ciphertext and HTTP disagree. CP1 names the returned record as the HTTP source.
- A source-level recovery-start API is not proof of a user-facing Forgot password destination. The specification records the distinction.

## Dead ends and packet friction

- A repository-wide search found recovery services and saved MFA recovery-code UI, but no verifiable Forgot password control. Repeating the same search cannot resolve a deployment/branch location that is not present in the inspected source.
- The source tree contained 157 pre-existing dirty entries at claim time. Broad status review produced noise unrelated to this bounded node; subsequent reads were limited to the mission inputs and current support surfaces.
- The first board read failed because Hermes creates a lock below `~/.hermes`, outside the workspace sandbox. Re-running the authorized board command with normal escalation succeeded. One failed read and one retry were spent; no unsafe bypass was used.
- The requirements packet was clear about allowed files and checkpoint scope. The only unresolved product input is the Forgot password destination, already escalated by the investigation seat.

## Upgrades for a better one-prompt machine

1. Put the checkpoint mapping directly in the owner prompt or generated intake: each approved-plan task should declare `checkpoint`, `brought-forward prerequisites`, and `deferred remainder`. That removes a reconstruction pass.
2. Give knowledge front matter independent `reviewed_by`, `reviewed_on`, and `review_evidence` fields. Keep `ratified_by` and `ratified_on` optional and paired. Make preview eligibility and release eligibility separate named checks.
3. Generate API and UI action validation from one browser-safe catalog export. Add a coverage test that accounts for every page route by pathname rather than asserting a brittle count.
4. Make response policy a mandatory sink adapter: model completion in, canonical safe reply out. Storage and HTTP should accept only that canonical type, so future callers cannot bypass screening accidentally.
5. Persist open external dependencies as typed checkpoint blockers while allowing unaffected clusters to run. A node should report `executable work` and `acceptance blockers` separately.
6. Include the current ticket comment cursor and source dirty count in dispatch packets. That would remove two preliminary queries from every seat while keeping the board as authority.

## Measurements and limitations

- Inputs read: four mission/product documents plus five workflow/role skill documents and the Codex tool reference.
- Current product facts revalidated: 11 page routes in the product map; 12 current bilingual topics represented by 24 content files; 157 dirty entries at claim; one unresolved navigation destination.
- Heavy commands, tests, builds, provider calls and live stack starts: 0, as required by the packet.
- Rework passes consumed: 0 of 3 at this filing.
- Exact wall-clock duration and token usage: UNAVAILABLE from the agent harness. Timestamps, commands and artifact hashes are recorded in the sibling evidence report.
