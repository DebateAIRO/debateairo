# FIX-13 worker sandbox

`fix-worker.sb` is deliberately non-runnable and grants nothing. The daemon
creates a path-bound profile with `buildFixWorkerProfile()` after V provisions
the separate worker account. The generated profile allows reads only from the
disposable worktree and system runtime directories, writes only to its scratch
directory, and denies the control root, policy bundle, git credentials, and all
network operations.

The daemon never supplies credentials or control artifacts to the worker. Its
stdin is closed, its environment is reduced to `PATH`, `PWD`, and optional
`LANG`, and its sole accepted output is a unified diff on stdout.
