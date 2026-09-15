# [unassigned] F23 · JSONB receipts are type-system-invisible schemas (T8 F-T8-6)

Source: T8 r2 report. A JSONB receipt column (e.g. ledger.propagation_run.operator_by_parent)
carries a schema the type system never checks and a column-name grep never surfaces — a
value frozen inside one survives every rename/deletion sweep. T8's B1 arm (b) was exactly
this class.
DISPOSITION: joins the standing enumeration checklist for every future deletion/rename
lane (packet clause: "enumerate JSONB/serialized receipt columns that can carry the
vocabulary"); V-packet row at closure for whether a repo-level receipt-schema registry is
wanted. status: waiting_human (V, repo-level half) · packet-clause half ACTIVE now
