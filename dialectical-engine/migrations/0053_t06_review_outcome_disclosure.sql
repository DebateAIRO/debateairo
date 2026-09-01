-- T6 / S4-2 / J14: the SECOND route into hidden-unjudgeable gets its disclosure.
--
-- T6's outcome filter means a node whose only cross-maker review came back
-- `cannot-assess` carries no judged basis. It lands in exactly the class the
-- transport-death route lands in — no basis, excluded from the served number —
-- but its review CALL SUCCEEDED, so there is no truthful value for
-- `terminal_transport_outcome`. Before this migration such a node left the
-- served graph with no record and no mark: a silent skip, which the goal's
-- Scope law forbids ("Every degradation or skip emits a visible condition
-- mark", goal 26; ruled in scope by J14 on the J5 pattern).
--
-- The class is NOT split. Both routes produce the same standing consequence, so
-- they keep the same mark; only the REASON differs, and the record already
-- exists to carry reasons. `review_outcome` names the stored `ledger.node_review`
-- outcome that left the node unjudged, citing that vocabulary verbatim rather
-- than re-spelling it (T6's do-not-tidy guard).
--
-- The reason requirement is STRENGTHENED, never relaxed. Today a class-H or
-- class-D row may legally carry no transport outcome at all — the requirement
-- lives only in the application layer. From here the database itself demands
-- that every class-H and class-D row name EXACTLY ONE reason: a transport
-- outcome or a review outcome, never both and never neither. The constraint is
-- added VALID, not NOT VALID, so existing rows are checked now rather than
-- letting a legacy row project as disclosed (T8's B1 lesson).
ALTER TABLE serve.condition_mark
  ADD COLUMN IF NOT EXISTS review_outcome text;

ALTER TABLE serve.condition_mark
  DROP CONSTRAINT IF EXISTS condition_mark_review_outcome_check,
  ADD CONSTRAINT condition_mark_review_outcome_check CHECK (
    review_outcome IS NULL OR (
      mark IN ('HIDDEN-UNJUDGEABLE', 'DERIVED-STANDING-UNREVIEWED')
      AND review_outcome IN ('agree', 'dispute', 'cannot-assess')
    )
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_unjudged_reason_check,
  ADD CONSTRAINT condition_mark_unjudged_reason_check CHECK (
    mark NOT IN ('HIDDEN-UNJUDGEABLE', 'DERIVED-STANDING-UNREVIEWED')
    OR ((terminal_transport_outcome IS NOT NULL) <> (review_outcome IS NOT NULL))
  );
