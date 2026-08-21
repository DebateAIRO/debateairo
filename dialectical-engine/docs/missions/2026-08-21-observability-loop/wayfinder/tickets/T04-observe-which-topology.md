# T04 — Observe which topology
<!-- label: wayfinder:grilling | HITL | status: CLOSED | blocks: parts of ARCH charter (fog) | blocked-by: none -->

## Question

Mission docker-hatchet (fired 11:18 today) will containerize the app and
introduce Hatchet job orchestration. The observability layer's capture
points, worker wrappers, log drains, and listener placement differ by
topology. Specify against the current process topology, the
post-containerization topology, or both — and which mission implements
first?

## Resolution (V, 2026-08-21, in-session)

BOTH, POST-HATCHET PRIMARY. Capture layer + error tables topology-neutral;
listener agent + does-not-work detection specified against the
post-containerization world with a thin interim binding for today. No hard
ordering between the missions (neutral core makes either order work).

### Addendum (V steer, 2026-08-21, mid-turn)

V verbatim: "Basically, Hatchet will store some logs and errors yes, but we
need our own observability as well, and an agent that listens to both and
creates pull requests in order to fix them errors." Sharpens the ruling:
Hatchet's failure/log surface is ONE SOURCE, never a substitute; our own
error store is built regardless; the listener agent consumes BOTH sources
and opens PRs for errors from either. New fog: cross-source dedup (the same
error appearing as a Hatchet job failure AND one of our error events must be
one incident, not two fixes).
