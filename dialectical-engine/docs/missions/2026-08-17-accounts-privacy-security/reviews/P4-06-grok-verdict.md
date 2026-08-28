# P4-06 — Grok 4.6 verdict

Review session: `01a03c98-a24a-7310-9bd4-bc9b1671c98d`  
Terminal-verdict fork: `01a03c9b-7d8d-7ec2-ac1b-8f96c5d226e8`  
Verdict: **GREENLIGHT**

Grok confirmed `Judge.judge` and `Judge.review` are the only direct packet
builders for those roles and both now use the shared
`debateai.untrusted-prompt-fields.v1` JSON envelope. Field names are
compile-time closed, values are escaped, fixed order is preserved, and both
system prompts state that field content is untrusted data rather than
instructions.

The regression captures both packets from a real `Judge` with a provider
double; it is not a helper-only test. Output schemas, provider calls, repair
packets, and already-structured composer/conformance paths remain unchanged.
