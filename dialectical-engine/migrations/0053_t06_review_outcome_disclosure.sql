-- T6 / S4-2 / J14 (+ ADDENDUM) : the SECOND route into hidden-unjudgeable gets
-- its disclosure, and that disclosure must be TRUE.
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
-- outcome or a review outcome, never both and never neither. The constraints
-- are added VALID, not NOT VALID, so existing rows are checked now rather than
-- letting a legacy row project as disclosed (T8's B1 lesson).
--
-- J14 ADDENDUM (codex r1 B1) — exactly-one is not the same as TRUE. The XOR
-- alone still admitted two fabrications, because nothing tied the chosen branch
-- to the actual review row:
--
--   (a) `agree` and `dispute` were spellable in the review arm, although BOTH
--       SEED judged standing and neither can ever be the reason a node is
--       unjudged; and
--   (b) the review arm named an outcome with no provenance at all, so a row
--       could claim "the review said cannot-assess" about a node whose review
--       said something else, or about a node with no review whatsoever.
--
-- Both are closed HERE, in the database, not only in the writer:
--
--   * `review_outcome` is narrowed to the single value that can be a reason.
--   * The review arm must carry `review_ref` (the `node_review_id`) and
--     `review_node_ref` (the node that review is OF); `review_node_ref` is
--     pinned to this row's own `subject_ref`, and the three columns
--     `(review_ref, review_node_ref, review_outcome)` are a COMPOSITE foreign
--     key into `ledger.node_review (node_review_id, node_id, outcome)`.
--
-- The composite key is what makes the lie unspellable rather than merely
-- refused: PostgreSQL will not accept the triple unless a review row exists
-- with that id, for that node, with that outcome. `review_node_ref` exists
-- solely to make that key expressible — `subject_ref` is `text` (it also names
-- answer-scoped subjects), so it cannot itself be a uuid FK column; the CHECK
-- below keeps the two in lockstep.
--
-- The TRANSPORT arm's truth ("no review landed for this node") is a cross-table
-- NEGATIVE and is not expressible as a CHECK. J14's addendum (3) explicitly
-- declines to mandate a trigger for it: the atomic writer guard
-- (`resolveTrueUnjudgedReasons`, run inside `ServeRepository.persist`'s own
-- write transaction) plus negative production probes are the accepted floor.
-- That limit is stated here so a reader of the DDL alone is not misled.

-- The composite-key target. `node_id` is already UNIQUE on this table, so the
-- triple is trivially unique; the explicit constraint exists because a foreign
-- key needs a matching unique index to reference. Additive and non-semantic:
-- it forbids nothing that was previously legal.
ALTER TABLE ledger.node_review
  DROP CONSTRAINT IF EXISTS node_review_row_identity_key,
  ADD CONSTRAINT node_review_row_identity_key UNIQUE (node_review_id, node_id, outcome);

ALTER TABLE serve.condition_mark
  ADD COLUMN IF NOT EXISTS review_outcome text,
  ADD COLUMN IF NOT EXISTS review_ref uuid,
  ADD COLUMN IF NOT EXISTS review_node_ref uuid;

ALTER TABLE serve.condition_mark
  DROP CONSTRAINT IF EXISTS condition_mark_review_outcome_check,
  ADD CONSTRAINT condition_mark_review_outcome_check CHECK (
    review_outcome IS NULL OR (
      mark IN ('HIDDEN-UNJUDGEABLE', 'DERIVED-STANDING-UNREVIEWED')
      AND review_outcome = 'cannot-assess'
    )
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_unjudged_reason_check,
  ADD CONSTRAINT condition_mark_unjudged_reason_check CHECK (
    mark NOT IN ('HIDDEN-UNJUDGEABLE', 'DERIVED-STANDING-UNREVIEWED')
    OR ((terminal_transport_outcome IS NOT NULL) <> (review_outcome IS NOT NULL))
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_review_provenance_check,
  ADD CONSTRAINT condition_mark_review_provenance_check CHECK (
    (review_outcome IS NOT NULL) = (review_ref IS NOT NULL)
    AND (review_outcome IS NOT NULL) = (review_node_ref IS NOT NULL)
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_review_subject_check,
  ADD CONSTRAINT condition_mark_review_subject_check CHECK (
    review_ref IS NULL OR subject_ref = review_node_ref::text
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_review_row_fk,
  ADD CONSTRAINT condition_mark_review_row_fk
    FOREIGN KEY (review_ref, review_node_ref, review_outcome)
    REFERENCES ledger.node_review (node_review_id, node_id, outcome);
