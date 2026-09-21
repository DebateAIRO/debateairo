# GUIDE_ORACLE_REVIEW17 — broad guide source authority

- Ticket: `t_dc69946d`; run `207`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Reviewed on: `2026-09-20T17:32:55.865263Z`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Freeze: `2eccc9edaebcacf09147a516f69ea5c44960088e`
- Verdict: **PASS_JUSTIFIED_BOUNDED_ORACLE_CORRECTION**

## Exact observed answer

Canonical row 26 asked `Unde pot afla cum funcționează o dezbatere?`. The accepted Romanian answer cited only `app-navigation`, exposed no actions, matched API and DOM, and contained three factual parts:

1. learn from the landing Method section and the sample debate with its transcript;
2. use a help control in the debate library to ask how the product works;
3. explore Home or the sample debate.

All three are useful for the broad where-to-learn question under a bounded, source-grounded reading. The reviewed Romanian `app-navigation` article says the landing page links to Method and Transcripts (`app-navigation.ro.md:16`), Home is the debate library (`:18`), and Help/Compact Help provide free-text Support as local page controls (`:20`). The actual signed-in library page renders `SupportWidget` (`apps/ui/app/page.tsx:125`), and MENU-COVERAGE assigns `help-compact` / `Ajutor compact` to `app-navigation`. The answer says generic `control de ajutor`; it does not name or relocate the debate-local `Cum funcționează` control. It also does not claim that any navigation action already ran.

My preliminary reading conflated that generic Compact Help reference with the debate-page `How it works` control and would have rejected it as mislocated. Inspecting the exact library producer and menu record disproved that interpretation. This report preserves the correction explicitly rather than converting the preliminary inference into a finding.

Source membership alone is not proof of answer quality. Here, membership and separate clause-level review both pass. The accepted draft remains historical failed-run evidence because the sealed harness rejected its primary source; this review does not retroactively relabel LIVE8 as successful.

## Broad bilingual oracle

The current broad EN/RO prompts ask where someone can learn how a debate works. They are not restricted to an already-open debate. `app-navigation` is therefore a justified primary alternative in both languages alongside `guide-how-it-works` and `debate-workspace-menus`:

- the bilingual app-navigation pair covers Method, Transcripts/sample, Home/library, Help and Compact Help;
- the Guide/workspace pair covers interpretation and controls within an already-open debate;
- production supplied `app-navigation`, `guide-how-it-works`, and `debate-workspace-menus` for the exact Romanian request, and `app-navigation` was first;
- the production validator permits a non-empty subset of supplied sources, while the harness currently admits only the two local-debate sources as primary.

The bounded correction is to add `app-navigation` to `expectedSourceIds` for only the paired broad guide rows, sequences 25 and 26. The first response source must still belong to the production-derived proof context. No unrelated or merely catalog-known source becomes valid.

## Named local-control boundary

The following narrower fixtures are materially different:

- EN: `In an already open debate, what does the How it works control explain?`
- RO: `Într-o dezbatere deja deschisă, ce explică controlul Cum funcționează?`

MENU-COVERAGE maps `debate-how-it-works` to `guide-how-it-works` as a prose-only local control. The producer renders `How it works` inside the debate page at `DebatePageClient.tsx:1179`. `debate-workspace-menus.ro.md:17-19` says that this control opens the on-page guide and that these controls act on the debate already open in the browser. `guide-how-it-works` supplies the guide's reviewed debate-reading facts. `app-navigation` alone must fail these explicit local-control fixtures.

Generic Compact Help and named debate `How it works` must remain separate in every positive and negative fixture. A broad app-navigation answer may explain Method/Transcripts or library Compact Help. It must not use app-navigation alone to assert the purpose or state of the debate-local guide.

## Required BIND17 regressions

The append-only harness correction must prove:

1. both broad EN/RO rows accept `app-navigation` only when it is in the production-derived proof context;
2. both continue accepting `guide-how-it-works` and `debate-workspace-menus` when present;
3. an accurate app-navigation broad fixture identifies or explains Method/Transcripts or library Compact Help;
4. a valid source attached to an empty or generic non-answer still fails;
5. the explicit already-open-debate EN/RO fixtures reject app-navigation-only authority and require Guide/workspace authority;
6. a fixture that conflates Compact Help with the named debate `How it works` control fails;
7. unrelated, absent, empty, duplicate, and proof-external sources fail;
8. source/action membership, API/DOM equality, accepted-draft attribution, language, privacy, injection, credential, session, pacing, traffic and the 42-model ceiling remain unchanged.

These are semantic/source-bound cases rather than exact matching of one favorable completion. The correction preserves all 54 prompts, count and order. It may copy only the oracle-bearing harness and row-proof consumers into a new BIND17 namespace and rebind their digest and evidence. Product, KB, attestation, runtime and model behavior remain unchanged.

## Product and evidence disposition

No product or KB change is justified by this observed answer. The response is supported by reviewed public facts, and its single source was in the actual supplied context. This conclusion does not establish how a future model completion will choose sources or phrase claims. A fresh complete actual run and independent final product/manual review remain required.

All 131 REVIEW17 indexed inputs and all seven diagnosis receipt artifacts matched their recorded hashes and sizes. The product checkout remained clean at `152eed4da1cd3e66b74d8301159ba76427552409`.

## Limits

This is a static authorization for a narrow append-only harness oracle correction. No harness or product change, test, browser, runtime, HTTP, Support/model request, status/capacity read, DB action, private data access or Git action occurred. BIND16 browser behavior and PROBE6 may be retained only if their defining bytes and behavior stay unchanged under later binding. LIVE8 remains failed historical evidence. Forgot remains unresolved and actionless; CP1 remains incomplete and CP2 gated. No testability, readiness or acceptance is claimed.
