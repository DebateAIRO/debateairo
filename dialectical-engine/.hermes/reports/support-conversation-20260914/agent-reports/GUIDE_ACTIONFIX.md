# GUIDE_ACTIONFIX self-report

## Result

Commit `b0b91a01cf161d17eef75577cbae94c629b7bc49` separates source relevance from action relevance in three authorized files. Forty bilingual guide-family controls cover the relevant frozen public-guide surface, and four service controls prove both prose-only and positive navigation behavior at the answer boundary.

## Case report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The defect came from conflating two questions: which reviewed article can answer the visitor, and which navigation target the visitor actually requested. Because several capabilities share `app-navigation`, article score was a lossy proxy for action intent. That proxy repeatedly forced reviewers and live gates to rediscover unrelated action leakage after otherwise correct source selection.

The upgrade is to keep two explicit evidence channels: source relevance and action-target relevance. The action channel is closed, bilingual, ordered, and route-independent. This avoids a chain of prompt exceptions and prevents a valid shared article from authorizing every capability that cites it.

For a stronger one-prompt workflow, the frozen guide matrix should generate focused product tests directly and require source policy and action policy as separate fields. The author packet can then run one generated RED, implement against the semantic contract, run one focused GREEN, and hand the exact final revision to composition. The sandbox listener preflight should also be automatic so an environmental EPERM does not consume an extra diagnostic cycle.

## Skills retained

`superpowers:using-superpowers`, mission `heartbeat-protocol`, mission `heartbeat-worker`, `superpowers:receiving-code-review`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` were retained from the same author session.
