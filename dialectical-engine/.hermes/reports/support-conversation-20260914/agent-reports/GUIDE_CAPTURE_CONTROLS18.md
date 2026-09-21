# GUIDE_CAPTURE_CONTROLS18 self-report

## Identity

- Ticket: `t_6831cb23`
- Native session: `/root/preview` (`01a09f02-346a-7fb0-aa70-0424f1fdd21e`)
- Assigned revision: `6cbe0e7ad18b20eca35876f4a91478cfbba82307`
- Verdict: `PASS_CAPTURE_AND_INVOCATION_CONTROLS`
- Heavy lease: released immediately after the finite controls and cleanup check

## SKILLS LOADED

- Read for this node: `GUIDE_CAPTURE_CONTROLS18.md`, then `COMMON.md`.
- Retained from the existing author session as directed by the packet: systematic debugging, test-driven development, and verification-before-completion skill bodies. They were not reread for this bounded continuation.

## Measurements

- Prepared controls: 4/4 passed.
- Long-reply fixture attempts: 4 total; three preserved failures and one corrected pass.
- Successful fixture: article 798px; original nested pane 240px; top and footer reachable at scroll positions 14 and 544; Support attempts 0.
- Browser cleanup: awaited close; bounded read-only process check returned no known failed PID and no matching Playwright Chromium child.
- Usage/token accounting: UNAVAILABLE.

## Failure and correction

The decisive failure was not a product autoscroll defect. The browser created a 798px element screenshot, but the 240px ancestor overflow pane prevented footer pixels from rendering into that PNG. A footer-only mutation left the PNG hash unchanged. The successor therefore records original-pane scroll reachability separately from a labeled evidence-only expanded-pane complete capture. It does not claim that the expanded evidence layout is the user's actual layout.

## Self-report question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The evidence chain shows three avoidable costs. First, geometry and PNG dimensions were accepted as a proxy for rendered content; the browser could return the expected dimensions while ancestor clipping painted blank pixels. The harness needs pixel-sensitive fixtures at both extremes of every scrollable answer before any paid capture. Second, operational commands had been assembled in multiple places, which allowed a relative capacity-helper path to survive. A generated absolute command contract should be the only launch interface, and it should reject before spawn. Third, routine setup failures consumed attempts: the screenshot parent was not materialized and browser sandbox requirements were discovered only at launch. The runner should create and attest new output parents, classify browser execution requirements, and verify namespace absence before acquiring the heavy lease.

The practical upgrade is a single preflight state machine. One prompt should produce a final immutable binding, mechanically generate all absolute commands, run zero-cost contract and browser fixtures, classify every failure by phase, and stop before capacity or Support traffic unless every deterministic control passes. The same state machine should preserve old evidence automatically, keep runtime/private logs out of receipts, and emit a strict receipt with artifact hashes. Paid sampling then becomes the last operation rather than the first integration test.

The remaining boundary is deliberate: these controls do not bind the pending final product, KB digest, affected plan, or 151 retained controls. The final reviewed KB still requires a supported owned preview reload because the API loads the corpus at startup.
