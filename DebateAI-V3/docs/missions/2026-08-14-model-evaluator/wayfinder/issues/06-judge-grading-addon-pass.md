# 06 — Targeted add-on pass: grading the judges' gradings

Type: task
Status: open
Blocked by: 05

## Question

The one hole harvesting leaves (charting ruling 9): nobody grades the JUDGES' work.
Design and build the small blind pass where judges' gradings themselves get graded —
different-lineage grader, authorship stripped, one bounded pass per run (not a full
re-benchmark). Decide: sampling (every run vs. every Nth) to control subscription
spend, the grade schema it writes (as answer_outcome rows with step JUDGING or a
dedicated metric), and how it composes with the existing DB-level different-maker
trigger. Output feeds ticket 07's bias metrics.
