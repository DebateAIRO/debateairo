# DEFINITION OF DONE — mission 2026-08-21-observability-loop

**Designed with V, 2026-08-27. This supersedes ticket-completion as the measure of the mission.**
A slice closing is evidence. **This** is the thing being evidenced. If every ticket closes and a criterion below still fails, the mission is not done.

Stated as things V can watch happen, not as artifacts that exist.

---

## A · SEEING IT

**D1 · Break it, see it.** Kill a job mid-run and a row appears in `obs.occurrence` with the correct code, within a declared bound. Repeat on every capture surface — runner task, provider call, API request, scheduler job, browser client. **Nothing is silently dropped on any of them.**

**D2 · Follow it home.** *(V-ruled: identity **plus** cause chain.)* From any stored error you can reach the run and the work item that produced it **without guessing**, and the record preserves the **original** error underneath any wrapper — so you land on the thing that actually failed, not the thing that reported it. A record whose correlation fields are a placeholder does **not** satisfy D2, and neither does one that reports a wrapper's own error while the original is discarded.

**D3 · Catch "it just doesn't work."** V's own words, and the half that is not about thrown errors. A job that stalls, a queue that stops draining, a run that never completes — surfaced **even though nothing threw**.

**D4 · It says when it is blind.** Every event the system could not record is counted and visible. **Silence never passes as health.** A period with zero occurrences is distinguishable from a period where capture was off.

## B · TRUSTING IT

**D5 · It cannot leak.** An adversarial error carrying a password, a credential-bearing DSN, a card number, an email, an API key and a session id — planted in the message, in a multi-level cause chain, in own properties **and in stack-frame text** — is stored with none of it present. Proven by reading raw bytes, not by asserting a shape.

**D6 · It never touches the security zone.** No modification, no import, and **no filesystem metadata of any kind** on the work-in-progress accounts feature. Machine-checked, not promised.

**D7 · One action turns it all off.** A single command stops capture, the daemon and the fix executor, and the product keeps running normally without them.

## C · THE LOOP

**D8 · It is alive and survives a reboot.** The listener runs permanently, restarts itself, and its liveness is externally observable.

**D9 · It files a ticket for a real error, carrying the root it traced.** Not a notification — a ticket a human can act on, naming what failed and why.

**D10 · It opens a pull request for a larger fix, and waits.** Approval-first: it proposes, V decides, and it does not proceed without V.

**D11 · It merges a QUICK fix into `dev` — never `main` — unattended.** *(V-ruled: auto-merge **is** part of done.)* Bounded strictly to **very quick and easy fixes**: within the declared QUICK size bound, touching no architecture and no security surface, and never `main`. Anything that does not clear that bar becomes D10 instead. **The bound is the criterion — an agent that merges something above QUICK has failed D11 even if the change was correct.**

## D · HOW V VERIFIES IT

**D12 · One scripted demo, run by V.** *(V-ruled.)* A single command that deliberately breaks things across every surface and shows V, in sequence: the rows appearing, the roots traced, the gap counters moving, the ticket filed, the PR opened, and a QUICK fix merging into `dev`. **V watches it and judges it.** The acceptance and chaos suites gate merges; this demo is what convinces.

---

## WHAT THIS DEFINITION CHANGED

**It surfaced a deliverable that no slice owns.** D12 is not S16 (acceptance + chaos harness) and not S26 (acceptance: listener) — those prove correctness to CI. D12 is a **single V-runnable narrative** across the whole system. It needs an owner, a contract and a place in the merge order. **This is the fourth time this mission has found a stated requirement with no slice attached** — the first three were the durable write path, the declared-kind projection, and the API correlation seam.

**It sharpens two things already in flight.** D2's "identity plus cause chain" is exactly the declared-kind projection (addendum 2 / S03c) plus OBS-R064's cause preservation (S06) — so both are now load-bearing for the definition of done, not merely for a slice's GREEN. D4 is why the capture-gap counters and the `capture_status` column matter; a gap counter that cannot fire (the vacuous-predicate defect V ruled on) fails D4 directly.

**It bounds the riskiest capability by its bound, not by its intent.** D11 is in scope, and the criterion is the size bar rather than the agent's judgement about the size bar.
