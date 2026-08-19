# S5 — LLM Execution Isolation & Prompt-Injection Containment (research asset, Wave 1)

Read-only inventory, 2026-08-17. No offensive testing: the only binaries invoked were `--help` on the operator's own three CLIs (no model calls).

## 0. Two model-access paths (both in scope)

| Path | Transport | Wired at |
|---|---|---|
| **Acceptance/ceremony (the live debate path today)** | HTTP → local relay → **`spawn()` of a vendor CLI** | `acceptance/relay-core.ts:89`; started `acceptance/main.ts:417-418` |
| **Production runner** | HTTP `fetch` → configured vLLM/OpenAI endpoint, **no subprocess** | `apps/runner/src/main.ts:21-23`; gateway `packages/providers/src/index.ts:224` |

CONT-01 hardened only the first. The second has no subprocess risk but shares every prompt-construction and output-handling weakness below.

## 1. Current containment — verified

`acceptance/relay-core.ts:86-97`:
```ts
const scratchDirectory = await mkdtemp(join(await realpath(tmpdir()), `relay-${makerSlug}-`));
const child = spawn(command.binary, [...command.prefixArguments, ...adapter.buildArguments(prompt)], {
  cwd: scratchDirectory,
  env: { ...process.env, PWD: scratchDirectory, OLDPWD: scratchDirectory },
  stdio: ["ignore", "pipe", "pipe"]
});
```

**Isolated:** fresh empty `mkdtemp` cwd per call incl. boot handshakes and discovery probes; `PWD`/`OLDPWD` rewritten; stdin closed; scratch reaped after close, never read back; relay HTTP binds loopback only (`:202`).

**NOT isolated:**
- **Full parent environment inherited** — `{...process.env}`, only PWD/OLDPWD overridden. Deliberate per CONT-01 ("HOME and env stay untouched") so vendor auth keeps working.
- **`HOME` inherited** → all three vendor credential stores are on the child's filesystem (`~/.claude/.credentials.json`, `~/.codex/auth.json`, `~/.grok/auth.json`, each 0600, owned by the spawning user).
- **cwd is not a jail** — an empty cwd removes the *default* search root; absolute-path reads still work.
- **No `--setting-sources`** on the claude relay: user-scope settings/memory still load. Currently benign (`~/.claude/settings.json` has no `hooks`; no `~/.claude/CLAUDE.md`), but a future user-level hook would execute inside the relay child.

**Env var NAMES a child sees** (names only): the spawning process requires **`DATABASE_URL`** (a credentialed `postgresql://` URL, `acceptance/main.ts:410`), plus ambient `SSH_AUTH_SOCK` (**a live agent socket — a child can sign with the operator's SSH keys without reading any key file**), `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_*` session/OAuth-scope vars. If a relay were ever spawned from the runner process, `VLLM_AUTHORIZATION` and `HATCHET_CLIENT_TOKEN` join them.

**Timeout / hung CLI** (`:101-118`): one timer at `JUDGE.deadlineMs`; on expiry **`child.kill("SIGTERM")` only — no SIGKILL escalation, no `unref`**. The promise settles only in the `close` handler, so a child that ignores SIGTERM (or whose grandchild holds the stdout pipe) **never resolves** — the HTTP handler awaits forever and the scratch cleanup never runs. The caller survives only via the gateway's own `AbortSignal.timeout`; the vendor process is orphaned. `stdout` accumulates **unbounded**; `stderr` is discarded (`child.stderr.resume()`), so CLI diagnostics are unrecoverable for forensics. `readBody` has **no request-size limit**. **The relay HTTP endpoint has no authentication** — any local process can POST an arbitrary prompt billed to the operator's vendor accounts. `max_tokens` is accepted and **silently ignored** on the CLI path (`requestSchema` is `.passthrough()`, only `messages` is used), so `bound.tokenCeiling` is a real cap on HTTP and a no-op on CLI.

## 2. Per-vendor argv

**Claude** (`acceptance/claude-relay.ts:98-104`): `-p <prompt> --output-format json --no-session-persistence --tools "" --model opus`. `--tools ""` verified against the installed binary (*"Use "" to disable all tools"*) — genuinely removes Read/Bash/Edit; **strongest of the three**. Missing `--setting-sources` and `--strict-mcp-config` (user MCP servers still load; MCP tools are a separate surface from built-in `--tools`). **UNKNOWN** whether `--tools ""` also suppresses MCP-provided tools.

**Grok** (`acceptance/grok-relay.ts:79-87`): `--single <prompt> --output-format json --verbatim --no-memory --no-subagents --disable-web-search --tools ""`. **This is the vendor that went agentic and read the repo** — run `8f1175db…` failed `NODE_REVIEW_UNAVAILABLE`; three ledger artifacts quoted in `CONT-01-packet.md:16-32`; statements matched the real workspace, so **real file access, not role-play — despite these flags**. **Gap: `grok --help` exposes `--sandbox <PROFILE>` (env `GROK_SANDBOX=`) governing "filesystem and network access". The relay does not pass it.** Grok is the only vendor with an unused sandbox control.

**Codex** (`acceptance/model-shim.ts:146-154`): `exec --skip-git-repo-check --sandbox read-only --ignore-rules --ignore-user-config --json <prompt>`. **Codex is agentic by default**; before CONT-01 it ran with no containment flags since FAIR-02. `--sandbox read-only` governs "model-generated **shell commands**" — **writes blocked, reads are not**. Codex retains a shell and can read any path the user can, via absolute paths. **UNKNOWN** whether `read-only` also blocks outbound network — this decides whether "read secrets" also means "exfiltrate secrets in one hop". Codex writes rollout JSONL under `~/.codex/sessions` (read back by the shim for lineage) — **prompt and output persisted to the operator's home directory, outside the relay's control**.

**Net:** all three could read files today — grok unsandboxed, codex read-only-but-readable, claude only if `--tools ""` breaks in a CLI update (exactly the failure mode CONT-01 documented).

## 3. What data reaches a model — minimal, per job

Every call is scoped to one node; **no call carries the whole tree, and none carries another user's content.** Root judge gets the question only; expansion gets instruction + question + **one** parent statement; cross-root gets two statements; review gets question + author maker + the node; composer/conformance/R9 get the fact bundle and served nodes; evaluator paths get blinded samples.

**Positive:** identity blinding is real and tested — opaque sha256 refs (`packages/evaluator/src/consumer.ts:163-167`), critique blinding asserted (`tests/unit/critique-s08.test.ts:220`), outbound bytes asserted free of provider/maker refs (`tests/integration/evaluator-consumer-database.test.ts:325-329`). **Counter-observation:** the review prompt deliberately discloses the author's maker (`packages/judgement/src/index.ts:198`) while critique/evaluator paths blind it — deliberate, but worth recording in the minimization inventory.

**Size caps: exactly one exists** — `BLIND_SAMPLE_EXCERPT_MAX_BYTES = 4_096` with UTF-8-safe truncation. Everywhere else **none**: `question_line` and model `statement` are `.min(1)` with **no `.max()`**. A long question or statement propagates uncapped into every downstream prompt.

## 4. Instruction/data separation — **the weakest link**

**(a) The role boundary is flattened into forgeable plain text.** `acceptance/relay-core.ts:59-64`:
```ts
return messages.map((message) => `[${message.role}]\n${message.content}`).join("\n\n");
```
The OpenAI role structure — the only thing separating instructions from data — becomes literal `[system]`/`[user]` markers in **one argv string**, with **no escaping of the marker syntax inside content**. Text containing `\n\n[system]\n…` produces a transcript indistinguishable from a genuine system turn. Since the question is interpolated verbatim (`judgement:122`) and parent statements at `runner:1828/1834/1874`, **both the user and any model can forge a system turn on the CLI path**. A structural regression introduced by the CLI transport, absent on the direct-HTTP path.

**(b) Untrusted text concatenated into instructions with no delimiter** — `runner:1824-1836` joins instruction + question + parent statement with `\n`; nothing marks where model-authored text ends. Same at `:1871-1876` and `judgement:196-200`.

**(c) No "treat the following as data" guard anywhere on the debate path.** The system prompts are pure schema contracts (judge `judgement:105-120`, review `:192`, composer `runner:2241`, conformance `:2296`, R9 `:2318`). The **only** instruction-hygiene language in the repo is on the evaluator path (`consumer.ts:214`: *"untrusted anonymous samples… Never infer identity, authorship, routing, or numeric values"*) — not a data-boundary instruction, and not on the debate path.

**Partial mitigations by accident:** composer/conformance/R9/evaluator pass untrusted text through `JSON.stringify`, which escapes quotes/newlines so a payload cannot break the envelope — but does not stop the model reading and obeying the sentence inside. The judge and review prompts (highest volume) use **raw interpolation, not JSON**, so even that is absent. No byte/control-character validation at runtime.

## 5. Model output handling — strict, and the dangerous sinks are genuinely absent

**Parsing** (`packages/judgement/src/s04.ts:142-153`): three strategies (raw `JSON.parse` → single fenced block → quote-aware balanced-brace scanner), each `safeParse`d against a **`.strict()`** Zod schema; unknown keys rejected; failure typed and loud (`JUDGE_SCHEMA_FAILURE`), never a silent default; rejected artifacts persisted with `parseStatus` and repaired up to `maxAttempts`.

**Sinks, verified:**
- **SQL fully parameterised, zero interpolation** — ~90 call sites all `$1..$N`; the only non-parameterised query executes the repo's own migration files.
- **No shell path from model output** — outside `relay-core.ts:89`, every spawn/exec is dev/test tooling with fixed literal argv; `shell: true` appears nowhere.
- **No HTML injection sink** — `dangerouslySetInnerHTML`, `.innerHTML`, `eval(`, `new Function(`, `document.write`, `srcDoc`, `__html` → **all zero hits**; no markdown-to-HTML dependency.
- **URLs/citations accepted, never validated, but currently never dereferenced** — `locator` has **no `new URL()`, no scheme allowlist** anywhere; it survives into the served contract but `grep -rni "locator"` over both UIs returns **zero**, and no server code fetches it. **Safe by omission**: the first UI feature that renders a citation as a link inherits a `javascript:`/`data:` sink with no validation in front of it.
- **No model-derived filesystem paths.**

**Best output guard in the codebase** — `packages/evaluator/src/consumer.ts:150-157,227-232`: `containsSelfRoutingField` recursively rejects any model-output key matching `/(numeric|ordinal|rank|route|routing|score|weight)/i` with `SELF_ROUTING_FORBIDDEN`. It exists **only on the evaluator path**.

## 6. Blast radius after a successful injection TODAY

**Achievable now:**
1. **Corrupt debate content and poison a review verdict** — the injected text is what the reviewer reads; outcome + free-text reasons are whatever the model returns, schema-valid, persisted, rendered. Zero preconditions, highest likelihood.
2. **Steer the served answer** — the composer sees node text, and the conformance/R9 "verifiers" are themselves LLM calls reading the same poisoned material. **A single injection can pass its own review.**
3. **Forge a system turn on the CLI path** via the unescaped `[role]` flattening — converts (1) and (2) from persuasion into protocol confusion; cheapest escalation available.
4. **Denial of service / cost** — no length cap on question or statement; `max_tokens` ignored by the relay; unbounded stdout; a SIGTERM-ignoring child hangs the relay forever.
5. **Fabricated citations** — `locator` unvalidated; `way_of_knowing: "LOOKED_UP"` is honored whenever a non-empty locator is present, so an injected fake source is recorded as lookup-grade.

**Achievable if the model regains tool use — and grok demonstrably did:**
6. **Filesystem read** — grok has no `--sandbox`; codex read-only blocks writes not reads; absolute paths bypass the empty cwd. Targets: the repo, all three vendor credential files.
7. **Environment secrets** — `DATABASE_URL` is in the child's env by construction; `SSH_AUTH_SOCK` is a live agent socket.
8. **Database reach** — the acceptance Postgres listens on loopback with credentials **hardcoded in tracked source** (`acceptance/standing-db.ts:7-8`), so a child with a shell needs neither the env var nor a leak.
9. **API impersonation** — any non-empty string is a valid identity, and the operator's token is passed in argv (`acceptance/run-acceptance.ts:27,72`), visible to any local process via `ps`.
10. **Free model invocation** — the relay endpoint is unauthenticated on loopback.

**Verified NOT reachable today:** SQL injection, shell from model output, XSS/HTML, SSRF via citation, model-derived file writes.

## 7. Existing defenses & tests

**Spawn-containment tests are good** (CONT-01): a probe CLI reports its cwd/PWD/OLDPWD/dir listing; each relay test asserts the scratch pattern, **not inside the project**, `pwd === oldpwd === cwd`, and empty listing; the codex test additionally polls that the dir is **deleted** after close, and pins **exact argv** (`model-shim.test.ts:106-115`). Timeout → HTTP 504 contract tested for claude and codex. Test-only seam guard asserted for claude and grok.

**Gaps in those tests:**
- **Claude's and Grok's containment flags are never asserted** — only `-p`/`--output-format`/`json` are checked; `--tools ""`, `--no-session-persistence`, `--no-memory`, `--no-subagents`, `--disable-web-search` are untested. Only codex has the exact-array pin. Given CONT-01's own root cause ("vendor flags can silently change meaning on CLI updates"), **this is the highest-value missing assertion**.
- **No test asserts anything about `env`** beyond PWD/OLDPWD — nothing checks a secret is absent from the child's environment.
- Nothing asserts SIGTERM fired; no coverage of a SIGTERM-ignoring child; grok has no timeout test.
- **The acceptance suite is not in `pnpm test`** — root `vitest.config.ts:14` covers `tests/**` only; `acceptance/vitest.config.ts` is a separate project with no package script. **The containment tests only run when an operator invokes them by hand.**

**Injection-specific tests: none.** Zero repo-wide hits for `jailbreak` or `ignore previous|disregard.*instruction|you are now`. Nearest analogues are output-side (hostile model output smuggling routing fields → `SELF_ROUTING_FORBIDDEN`; identity not leaking into outbound prompts; serve sanitizer stripping raw prompts and secret-bearing reasons). **No test feeds a hostile instruction into a prompt and asserts it is not obeyed.**

**Adjacent controls:** `tests/architecture/scaffold.test.ts:27-30` enforces **no `process.env` reads outside `runtime-environment.ts`** and **exactly one `ProviderGateway` interface** — a real single-chokepoint guarantee for model calls. `tools/check-text-control-bytes.ts` forbids C0/DEL bytes but scans `git ls-files` only and has **no runtime caller**. No architecture rule forbids `dangerouslySetInnerHTML` or raw SQL — both are clean by convention, not by gate.

## 8. UNKNOWN
1. Whether codex's `read-only` sandbox blocks **outbound network** for model-generated commands (decides read-secret vs exfiltrate-secret).
2. Whether claude's `--tools ""` also suppresses **MCP-provided** tools.
3. Grok's valid `--sandbox` profile names (help prints the flag, not its enum).
4. The exact env of the operator's shell at ceremony time.
5. Whether any deployed environment sets `VLLM_AUTHORIZATION`/`HATCHET_CLIENT_TOKEN` in a process that also spawns relays.

## RISK SUMMARY

1. CONT-01 is real and verified — empty scratch cwd + PWD/OLDPWD rewrite + codex sandbox flags, with regression tests.
2. It removed *ambient* filesystem context but **did not build a jail**: absolute-path reads still work, grok has **no** sandbox flag, and `HOME` plus all three vendor credential files remain reachable.
3. **Full parent env is inherited**; `DATABASE_URL` and `SSH_AUTH_SOCK` are in it — and the acceptance DB password is a literal in tracked source, so DB reach doesn't even need the env.
4. Highest-likelihood injection outcome today: corrupted debate content and a poisoned review verdict — **the conformance/R9 verifiers are LLM calls reading the same poisoned text, so injection can pass its own review.**
5. The classic sinks are genuinely clean: SQL parameterised, no shell path from output, zero HTML-injection sinks, no server-side citation fetch. A real, defensible position.
6. Output validation is strict; **input validation is essentially absent** — no length cap on question or statement, no runtime encoding/control-byte check, no URL validation on `locator`.

**Top 3 containment gaps for Wave 2:**
- **G1 — Env + process containment.** Replace `{...process.env}` with an explicit allowlist (`HOME`, `PATH`, `TMPDIR`, `LANG`, vendor-auth vars only); drop `SSH_AUTH_SOCK` and `DATABASE_URL`; pass `--sandbox` to grok and `--setting-sources`/`--strict-mcp-config` to claude; add SIGKILL escalation, stdout byte cap, request-size cap; move the acceptance DB password out of tracked source.
- **G2 — Instruction/data separation.** Stop flattening roles into a forgeable `[role]` argv string (or escape the marker); wrap untrusted text in explicit escaped delimiters on the judge/review path; add runtime length and control-byte caps on `question_line` and model `statement`.
- **G3 — Assert containment, then adversarially test it.** Exact-argv pins for claude and grok; an env-absence assertion; a SIGTERM-ignoring-child test; wire `acceptance/vitest.config.ts` into the default test run; and — once greenlit — an adversarial corpus asserting an injected instruction is not obeyed and cannot alter a review outcome.
