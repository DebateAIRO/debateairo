# 10 — Seat-share allocator, coded dark and ready to bind

Type: task
Status: open
Blocked by: 07, 08

## Question

The 80/20 law is seat-share, not dice (charting ruling 8): on a premium answer
(high-stakes risk tier + big depth — ruling 7/Q7 mapping), most agent seats spawn
from the better-ranked model for the question's domain, fewer from the runner-up; if
the better model is also the cheaper one (ticket 08's signal), both premium and
normal answers mostly use it. Design the concrete allocation formula (seats per
(rank, cost, tier)), integrate with panel discovery (DR-181: panel = discovered
healthy models) and the existing routing guards, and code it entirely behind the
dark-launch switch (ruling 11): NOTHING dispatches from evaluator data until V binds
it. Deliverable includes the bind-readiness checklist V will review at go-live —
the formula itself gets V's ratification at bind time, not now.
