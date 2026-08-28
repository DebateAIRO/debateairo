# DEV-04 Grok 4.6 review packet

## Scope

Review only Kanban `t_8e0e8ddf`, **DEV-04 · Generate persistent local secret files safely**.

Owned implementation/test changes:

- `package.json` (`dev:auth:generate-secrets` only)
- `apps/runner/src/dev-secret-files.ts`
- `apps/runner/src/dev-secret-files-cli.ts`
- `tests/integration/dev-secret-files.test.ts`
- `tests/architecture/dev-secret-files.test.ts`
- DEV-04 reconciliation in `DEV-01-local-auth-topology.md`, `IMPLEMENTATION-STATUS.md`, and the existing topology architecture test

Ignore unrelated dirty-tree files. Do not edit, run the command in the repository root, create a worktree, commit, push, or mutate Kanban.

## Required outcome

- One dev-only fixed-path command creates exactly three absent 32-byte raw secret files: private KEK, email blind-index key, and audit-source-IP salt.
- It creates the durable audit-key and user-DEK stores.
- The custody root, secret directory, and both stores are exact mode `0700`; secret files are exact mode `0600`; every accepted object is owned by the current user.
- Valid existing files are reused byte- and inode-exactly. Wrong size/type/mode/ownership, symlinks, hard links, duplicate bytes/inodes, or unsafe stores fail closed rather than being chmod-repaired, overwritten, or rotated.
- Concurrent first invocation publishes only complete files and leaves no normal-path temporary residue.
- Key material never enters stdout/stderr or a tracked file. The CLI root is fixed to repository-relative `.local/dev-auth` and cannot be redirected by environment.
- This does not claim the complete local auth stack exists.

## Design details

`pnpm dev:auth:generate-secrets` invokes `generateDevelopmentSecretFiles({ repositoryRoot: process.cwd() })`. The library creates/validates the fixed `.local/dev-auth` hierarchy, opens accepted existing files with `O_NOFOLLOW`, and validates file type, UID, exact mode, byte length, and single-link custody from the open handle.

Missing files are generated with `randomBytes(32)` into a unique sibling `wx`/`0600` temporary file, fully written and `fsync`ed, then atomically published with `link`. A concurrent loser observes `EEXIST`, removes only its own temporary file, and revalidates the winner. Stable multi-link files are refused; a short bounded retry only permits the winner's temporary hard link to disappear. All in-memory key buffers are zeroed after use. The complete set is then checked for distinct inodes and constant-time distinct material.

The CLI prints only `DEV_AUTH_SECRETS_READY=3:2`. It never prints paths or material. `.local/dev-auth/` was already ignored by DEV-03.

## TDD and verification

- Initial RED: integration import failed `ERR_MODULE_NOT_FOUND`; architecture reads failed `ENOENT` because the command did not exist.
- Intermediate test-only RED: the fixture tried to recreate an already-created store.
- Intermediate environment RED: direct `tsx` spawning opened a sandbox-forbidden IPC socket; the same entrypoint is now invoked through Node's absolute `--import tsx` loader without weakening production.
- Full-strength overwrite mutant: forced all files through an unlink/relink rotation path. The idempotency title went RED (`generatedSecretCount` `3` instead of `0`) before exact source restoration.
- Full-strength permission mutant: removed the exact `0600` check. The permissive-file title went RED because provisioning resolved instead of rejecting, then the exact source hash was restored.
- Grok review BLOCK (`01a03d72-ce10-7c30-b93e-5dd4ea04a047`): the CLI fixture inherited simultaneous `FORCE_COLOR`/`NO_COLOR`; Node wrote a warning to captured stderr, so the claimed empty-stderr proof was environment-dependent. The exact forced environment reproduced the RED locally. The fixture now removes only those two presentation variables from its child environment, and the same forced title plus the full focused group are GREEN. Production bytes did not change.
- GREEN focused integration + DEV-04/DEV-01 architecture: `8/8`.
- GREEN root `pnpm typecheck`.
- GREEN `git diff --check`.
- No standing secret command was run in the repository root; tests used private temporary repositories.

Current SHA-256:

- `package.json`: `5877c7300d61d9e8e98e192b689353431f9a20907ef08c44c5bfd3cadfe89bae`
- secret library: `dafa154a29e181d6a0882abe81efba9c5205d8fc4eba476d4c063bc37b45aa3e`
- CLI: `703eb17afb28e0fbb83bb5997d2911a1fcd9281cd95de592130a0276c4e5114a`
- integration test: `d7c0f27fa07bbec48cf74887bb10c35c7ca19b19ccc91fe98115a38102ba0279`
- DEV-04 architecture: `6894d9baea2e0004a41f062bfda135990e1e039a08528f40ac7b27d646f9db90`
- DEV-01 architecture: `78a9c9e3f2193341b3dd586bb8a578746d12925ed2709113e4b7702381d18ab5`
- topology prose: `46795110b06dd858589f23846b1cde2cc202b46e746250fafac29c5e6cd8c446`
- status artifact: `37a5c72f80c2920c7b08e7407d66f8e5f8391dfa1f7788d7fc85445ecb38659e`

## Requested verdict

Return exactly `GREENLIGHT`, or `BLOCK` with file/line evidence and the smallest repair. Prioritize P0/P1 concerns in custody escape, partial publication, concurrent invocation, overwrite/rotation, permissions/ownership, symlink/hard-link handling, key distinctness/zeroization, CLI output, and topology honesty.
