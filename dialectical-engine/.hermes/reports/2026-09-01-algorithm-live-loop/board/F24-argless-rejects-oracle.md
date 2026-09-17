# [unassigned] F24 · argument-less `.rejects.toThrow()` is a rejection oracle that cannot discriminate (T8 F-T8-7)

Source: T8 r3. Requiring the error to NAME its constraint immediately exposed two
additional latent fixture bugs (core.node depth/ordinal/path defaults dropped by a later
migration; root-node trigger domain at 0002_s02.sql:58) that the argument-less form had
been reporting as success. The form is used as a rejection oracle across the suite.
DISPOSITION: V DECISIONS PACKET row at closure — a repo-wide sweep replacing argument-less
rejection oracles with named-error assertions is out of this goal's scope but cheap and
high-yield; T8's paired M14 logs are the demonstration (old form 8/8 green under the
mutant; hardened form correctly red).
status: waiting_human (V) · escalation_target: v_packet · created 2026-09-01
