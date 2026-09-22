# GUIDE_GAP self-report

## Requested question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Result

- **Ticket:** `t_2c5f0117`
- **Agent / native reviewer session:** `/root/baseline` / `01a09ef7-e096-7c31-9b35-806840028cf0`
- **Parent thread:** `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- **Stable product revision:** `479763da1f586a217f36204cc81138aaa81c6f81`
- **Source revision:** `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`
- **Disposition:** `GAPS_CONFIRMED_IMPLEMENTATION_NEEDED`; no CP1 acceptance or implementation verdict.

The app already has a genuine free-text composer and a closed source/action renderer. The model path currently receives reviewed public KB context plus one redacted current user message, which is a sound public-guide base. The costly mismatch is that the surrounding Support UI/API still has a consented private debate-status feature. It lists question lines/run IDs, stores an attached-debate selection, and wires Support to private run status. The newer owner instruction forbids that authority even when identity- and consent-bound. The narrow correction is to remove this Support-specific private path while retaining human cases and server-side operational security controls as separate systems.

Current route disposition is broad, but menu guidance is incomplete. Add reviewed bilingual single-turn guidance for Pricing/theme/Account behavior, Replay/Workspace/Scoring/Honesty and view labels, Settings subsections, and the Help/human-case distinction. Keep dynamic private destinations as prose instructions, not links. Suggested pills may remain optional composer primers.

This can become more “one prompt” in the user's sense by building one reviewed public menu index that binds each visible label to facts, prerequisites, limitations, and a safe destination disposition. The runtime should retrieve from that index for natural single-turn questions; the verifier should generate its EN/RO cases from the same records. That reduces repeated hand-maintained prompt lists, route searches, and mismatches between UI labels, KB text, and action catalogs. Follow-up context still belongs to CP2 and should later carry only bounded ordinary conversation text.

Recovery checks should focus on rendered behavior. A mixed credential plus navigation request can correctly refuse credential handling and still show the verified first-party navigation action. Negated/unrelated mentions, including modal-negation paraphrases, must not trigger recovery. This needs semantic class coverage rather than another literal phrase list. Until the canonical Forgot destination is known, fixed no-action guidance is safe but incomplete.

## Efficiency observations

- Repeated token cost came from rediscovering UI labels and reconciling them with separate article, capability, action, test, and evidence lists. A generated menu-to-guide manifest can make those joins mechanical.
- Keep one source of truth for route/opener eligibility and generate runtime resolution plus table tests from it. This prevents prose, resolver, and screenshot expectations from drifting.
- Test the public/private boundary at ports: request-schema rejection, zero own-context calls, and captured model payload absence. This is cheaper and stronger than repeatedly sampling many prose variants.
- Test safety by visible response/action/call predicates. Internal classifier names are implementation details and caused avoidable disputes when safe combined refusal-and-navigation behavior was labeled differently.
- Preserve a small CP1 free-text matrix organized by menu family and language, then reserve multi-turn variance for CP2. This keeps checkpoint evidence finite.

## SKILLS LOADED

Actual retained BODY reads in this native session:

- `superpowers:using-superpowers`
- `heartbeat-protocol`
- `heartbeat-reviewer`
- `superpowers:verification-before-completion`
- `superpowers:systematic-debugging`
- `superpowers:test-driven-development`

## Boundaries

Read-only code/document review only. No private user/account/content data, product/source/Git/index edit, heavy command, test, build, install, server, browser, HTTP, model, auth, or reset traffic. Active FEEDBACK_FIX3 files were excluded. Forgot destination remains unresolved and was not reinvestigated. Usage: `UNAVAILABLE`.
