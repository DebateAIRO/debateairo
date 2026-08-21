# Codex Windows Sandbox — Evidence Package for Support

Machine: Windows 11 Home 10.0.26200 · user vladm · 2026-07-25
Repo: C:\Users\vladm\Desktop\debate\DebateV2 (git worktree-based multi-lane workflow)

## Installations present (two coexisting)

1. Standalone: `C:\Users\vladm\.codex\packages\standalone\releases\{0.144.0,0.145.0}-x86_64-pc-windows-msvc`
   - PATH launcher: `C:\Users\vladm\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe` (resolves `codex` in shells)
   - "current" symlinked exe: `C:\Users\vladm\.codex\packages\standalone\current\bin\codex.exe` → reports codex-cli 0.145.0
2. Windows-Store/MSIX: `C:\Program Files\WindowsApps\OpenAI.Codex_26.721.3996.0_x64__2p2nqsd0c76g0`
   - Its absolute-path helper spawns SUCCEED in the sandbox log while bare-name spawns fail.

`codex doctor` (on the PATH launcher): all checks green incl. "sandbox: restricted fs + restricted network"; flags 0.145.0 update (since applied) and 1,623 rollout files / 780 MB.

## Failure 1 — helper resolution ("program not found")

Invocation: `codex exec -C <repo> -s workspace-write <prompt>` via PATH launcher (both 0.144.0 and 0.145.0).
Sandbox log (C:\Users\vladm\.codex\.sandbox\sandbox.2026-07-25.log):
- `setup refresh: setup refresh failed to launch helper: helper=codex-windows-sandbox-setup.exe, cwd=C:\Users\vladm\Desktop\debate\DebateV2, error=program not found`
- Same log shows an ABSOLUTE-path spawn succeed: `spawning C:\Program Files\WindowsApps\OpenAI.Codex_...\app\resources\codex-windows-sandbox-setup.exe ... setup binary completed`.
- The helper EXISTS in both standalone releases under `codex-resources\`, but spawn-by-bare-name fails because that directory is not on PATH.
Effect on agent: all sandboxed shell calls fail; agent-visible errors included `git worktree add` → `.git/refs/heads/<branch>.lock: permission denied` and Hermes kanban DB writes denied. Agent (correctly) reported failures.

## Failure 2 — with helper on PATH, ACLs deny git worktree metadata

Workaround applied: prepend `...\0.145.0-...\codex-resources` to PATH → helper launches, "setup binary completed", "processed 3 write roots".
New failure: coder in worktree `.worktrees/resp-s3` blocked on
`Git metadata ACL denies .git/worktrees/resp-s3/index.lock`
i.e. the write roots cover the worktree working dir but NOT the main repo's `.git\worktrees\<lane>\` metadata directory that `git -C <worktree>` must write (index, locks). Any commit from a linked worktree fails under workspace-write.

## Failure 3 — advisory standalone exe hangs on a trivial probe

Per advisory, invoked explicitly:
`& "$env:USERPROFILE\.codex\packages\standalone\current\bin\codex.exe" exec -C <repo> -s workspace-write "<2-command git probe prompt>"`
Result: NO output, hung ≥5 minutes on a probe whose task was two git commands (empty commit + reset in a worktree); killed by timeout (exit 143).

## Additional observation — collab/multi-agent mode

`codex exec` orchestrator spawning coder subagents (collab feature, 0.145.0/command-runner 0.146.0-alpha.3.1): runtime caps at 3 subagents; across three runs (workspace-write and danger-full-access), coder subagents produced zero commits in ~20-minute windows while single-session `codex exec` on the same machine completed comparable lane tasks (25-file and 14-file commits) reliably under danger-full-access.

## Attached

- Last 100 sandbox-log lines: .hermes/planning/responsive-ui-20260724/residue/sandbox-log-last100.txt
- v1 coder residue diffs: .hermes/planning/responsive-ui-20260724/residue/v1-s{3,4,5}.patch

## Asks for Codex support

1. Helper spawn should resolve the packaged codex-resources path absolutely (not bare-name via PATH).
2. workspace-write write-roots should include `<repo>\.git\worktrees\<lane>\` for linked-worktree git operations (or expose a config to add write roots).
3. Why does the standalone `current` exe hang in exec mode on this machine (log attached)?
4. Guidance on coexisting MSIX + standalone installs (helper resolution appears to cross between them).
