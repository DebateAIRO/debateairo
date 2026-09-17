# [ruled D35] F-S09-7 · an enumeration written from the same reading as the code cannot falsify it
Source: agent-reports/s09-envelope.md (r2). The lane's in-memory site enumerator and the closed
form were both written from one misreading of the gateway's attempt accounting, so they agreed;
five mutants were caught against that shared wrong oracle. Only the ledger — the system's own
record of what it spent — exposed it. Ruled D35: where a quantity can be measured from the
system, that measurement is the oracle; an independent enumeration is a cross-check, and mutation
testing cannot detect a false premise shared by test and code.
status: done (ruling recorded; carried into the closure report and the self-report)
