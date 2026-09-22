# GUIDE_COMPACT_UI_PROBE5 evidence

- Ticket/session: `t_ea7d37a8` / `/root/preview`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `REWORK_COMPACT_RO_POST_READY_UNCLASSIFIED`
- Child exit: `1`

## Result

The exact reviewed PROBE5 command ran once and the repaired checkpoint persisted its fixed state. Full English and same-session full Romanian both completed with visible composers and restored mode state. Storage-reset compact Romanian then passed `BEFORE_INTERACTION`, `AFTER_INTERACTION`, and `READY`: the widget was expanded, `aria-expanded` was true, the panel and compact root were visible, and one composer was visible.

The probe failed before it recorded the compact Romanian transition or any compact private-control result. Its safe projection retained only `GUIDE_UI_PROBE_UNCLASSIFIED_FAILURE` with unavailable phase, surface, and language. Full English and Romanian private-control checks passed; compact Romanian’s result and underlying error were not retained.

The source narrows the competing failure window more precisely. `openGuideSupportSurface` persists the `READY` checkpoint, then calls `selectLanguage(language)`, and only returns afterward (`GUIDE_HARNESS_BIND15/controls.mjs:314-321`). The caller invokes `assertNoPrivateControls(surface)` only after that return (`GUIDE_PROBE_CHECKPOINT_FIX/probe-zero-request-ui.mjs:191-206`). The probe's `setLanguage()` locator is scoped exclusively to `.supportDesk .supportLanguage`, while the compact surface is rooted under `.supportAssistantCompact` (`GUIDE_PROBE_CHECKPOINT_FIX/probe-zero-request-ui.mjs:90-92, 184-205`). Therefore the retained evidence does not establish that the compact private-control assertion was entered. The failure could be in the post-READY language-selection stage; the lost exception still prevents claiming the exact cause.

The route guard blocked one status attempt and one page-case-list read. Create-session, send-message, other-Support, and actual forwarded Support counts were zero. Fixed console counts were HTTP 401: 3, HTTP 404: 0, JS/hydration: 0, OTHER: 2. No synthetic reply, capacity read, chat question, model request, database access, or service change occurred.

## Custody

Before and after the failed child, the exact clean product was retained by detached supervisor PID/PGID `77769`, PPID `1`, from the expected worktree. Expected preview listeners remained present, unrelated listener records were preserved, and ordinary system TLS `GET https://localhost:3100/help` returned HTTP 200 without a custom CA or insecure mode. The ongoing private runtime log was neither read nor hashed.

## Next bounded discriminator

First reconcile the compact language selector with the actual compact producer and add fixed phase codes around post-READY language selection and the subsequent private-control assertion. A separate inertly reviewed probe-only correction should prove that the compact selector targets the actual producer and that failures in selection versus private-control inspection remain distinguishable without raw DOM or exception text. No retry, product cause, readiness, or acceptance claim is made here.
