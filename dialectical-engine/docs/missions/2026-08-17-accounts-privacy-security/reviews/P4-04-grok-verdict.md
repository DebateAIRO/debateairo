# P4-04 — Grok 4.6 verdict

Review session: `01a03c8a-56a2-7bc2-ac88-bbab78853b35`  
Initial terminal-verdict fork: `01a03c8c-ddc3-7c01-8667-4e65356e8be8`  
Corrected-byte recheck: `01a03c8e-276c-70c2-9cbd-22340dfe58b9`  
Final verdict: **GREENLIGHT**

The initial review `BLOCK`ed a helper-only forged-marker test. The test was
replaced with a real `POST /v1/chat/completions` through `startModelShim`; it
parses the prompt echoed from the fake CLI's actual argv and proves the forged
`[system]` marker remains inside one user `content` value.

The same reviewer confirmed the correction closes the evidence gap. The shared
encoder emits one ordered `debateai.relay-messages.v1` JSON document and no
adapter re-flattens it. This is structural role encoding, not a claim that
semantic prompt injection is solved.
