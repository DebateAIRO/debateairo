# [unassigned] F-S08-2 · Q51's locator limb reads a different node set from the form and the band
Source: agent-reports/s08-band-downgrade.md (r1 findings). Pre-existing hole, higher stakes
after T12: the form and band now read the cited, conformance-verified set while Q51's locator
check still reads the load-bearing serve set, so a node can be judged for locators in one set
and excluded from the band in the other. Not fixed in S08 (out of charge, and T9 rewrites the
gate chain around it).
DISPOSITION: route to the T9 lane's review as a question — after T9's gate retirement, does
the locator limb still read a divergent set? If yes, ticket a fix before W12.
status: done # CLOSED 2026-09-02 by S07's gate retirement: the locator limb is deleted, so nothing diverges; residual recorded (ServeNode.locator is carried, never read)
