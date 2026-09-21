# GUIDE_ACCOUNT self-report

## Assignment

- Node: `GUIDE_ACCOUNT`
- Ticket: `t_bcd735ee`
- Session: `/root/preview`
- Model: `gpt-5.6-sol`
- Base: `479763da1f586a217f36204cc81138aaa81c6f81`
- Final commit: `163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703`
- Product scope: exactly `apps/ui/components/TopBar.tsx` and `tests/render/support-topbar.test.tsx`

## Implementation

The only runtime change replaces the global Account link destination `/login` with `/settings`. The new render test pins the complete small contract around that change: adjacent global destinations, presentation-only ASKER, minimal auth chrome, debate-route suppression, and zero fetches.

The TDD frame caught the intended defect before implementation. Installed Vitest is `4.1.10`; the packet's `--minWorkers=1` option is unsupported in this version, so the raw packet command failed before test collection. The equivalent supported single-worker argv is:

```text
pnpm exec vitest run tests/render/support-topbar.test.tsx --maxWorkers=1
```

That command produced the meaningful RED (`/login` versus `/settings`) and final 7/7 GREEN. The invalid-argv log, behavioral RED and GREEN are retained separately so tooling failure cannot masquerade as feature evidence.

## Efficiency findings

This lane was efficient because the plan supplied an exact two-file contract, one visible before/after behavior, a focused command and an independent review boundary. The only avoidable repeat was the stale Vitest flag. Future packets should derive supported runner flags from the installed major version or use the repository's canonical single-worker argv. That turns the intended RED/GREEN sequence back into two executions instead of three.

The render test covers all directly adjacent invariants in one file, so reviewers do not need separate source-string checks or a broad UI suite. Keeping the ASKER assertion behavioral—element kind, ancestry and zero fetches—also prevents a misleading implementation-mirroring test.

## Skills loaded

Same-session retained reads:

- `superpowers:using-superpowers`
- `.claude/skills/heartbeat-protocol/SKILL.md`
- `.claude/skills/heartbeat-worker/SKILL.md`
- `superpowers:test-driven-development`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`

## Required self-report question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The evidence here is simple: exact ownership and a narrow acceptance contract reduce both code and review cost. The next upgrade is to generate packet test argv from repository-supported runner capabilities, then bind one behavioral test to the visible requirement and its nearest invariants. For changes this small, that creates a reliable one-prompt path from failing behavior to scoped commit without a broad audit.

Usage: UNAVAILABLE.
