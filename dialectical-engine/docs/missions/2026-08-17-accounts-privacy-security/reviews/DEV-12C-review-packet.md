# DEV-12C review packet

## Ticket

**DEV-12C · Wire every configured provider gateway into the production runner**

Kanban: `t_5f072855` (Done)

## Intended behavior

The run stores every maker that answered discovery. The production runner must
therefore construct a gateway for every member of the exact sealed configured
provider set; a one-gateway composition root would silently discard responders.

## Implementation

- Provider-target parsing is shared by API discovery and the runner.
- The runner reads the sealed configured-provider set and refuses missing,
  duplicate, extra, or maker-mismatched targets.
- Target 1 is the primary gateway, target 2 is the critique gateway, and targets
  3..N populate the existing `additionalMakers` engine seam.
- The old primary runner environment fields remain as an exact drift witness and
  must match target 1.

## Evidence

- RED: focused architecture import failed with `ERR_MODULE_NOT_FOUND` because no
  production provider topology existed.
- GREEN: N=1, N=2, and N=4 topology cases plus the real entrypoint passed `4/4`.
- Combined discovery, runner topology, and terminal-evaluator architecture passed
  `8/8`.
- Root `pnpm typecheck`: GREEN.
- `git diff --check`: GREEN.

## Review disposition

On 2026-08-27 the user explicitly authorized this wave to proceed without Grok.
No independent-review claim is made.

## Remaining boundary

The local auth supervisor still starts neither a provider lifecycle nor the
runner process. The development register currently configures one deterministic
local maker. Publication remains disabled. Those are later atomic cards.
