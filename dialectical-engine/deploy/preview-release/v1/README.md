# Preview release staging tool v1

## In plain words

Putting a new version on the v3 preview needs a handful of JSON files: a fingerprint of every
file in each release folder (the "source manifest"), a fingerprint of the built website (the
"UI build manifest"), the plan each service starts from (the "launch plan"), and the plan the
database check runs from (the "native plan"). The reviewed preview code in
`deploy/preview-auth-dev/v1` already knows how to make and check all of them, but it had no
command to run, so earlier releases were staged with throwaway scripts and hand-edited JSON.

`release-artifacts.mjs` is that command. It:

- only calls the reviewed functions (it adds no new way to hash, build or check anything);
- fills every changed field (revision, tree, fingerprints, operator digest, mail program path)
  from the files those functions produced, never from typing;
- runs the reviewed checks on each plan **before** writing it;
- never overwrites a file, and writes only new root-owned, read-only-for-others (0644) JSON files
  below `/opt/debateai-v3-preview/artifacts/<release>/`;
- reads only root-owned 0644 JSON files, so it can never read `ui.env`, `api.env` or a secret
  (those are 0640 or 0600 and it refuses them), and it refuses links;
- runs only as root on the Linux server, with Node v26.8.2, `umask 022`, and an emptied
  environment (`env -i`). On a Mac it refuses.

The website is built with a fixed list of public values (the site address, the Turnstile site key,
the model list, `NODE_ENV=production`). They are the same constants the reviewed start-up
check demands from `ui.env`, so the build and the running site cannot disagree. `build-env`
prints them with their sha256 so you can compare `ui.env` by hash, without printing it.

The model list is one of two reviewed lists, picked by name with `--models` (on `build-env` and
`ui-build`): `glm-only` (the default: GLM only, the list the preview has used so far) or
`multi-model` (Free: GLM and DeepSeek; Premium: GLM, DeepSeek, MiMo and Qwen). The list is baked into
the website when it is built, so changing it means a new build. The build writes the list it used
into `.next/preview-model-roster.json` (covered by the build manifest), and the UI start-up check
refuses unless `ui.env` names the same list. Which list belongs at which moment is in
`deploy/preview-gate/v3/README.md`, "Switching on the new models, in order".

Only the values above are set. Three other public flags are read only at build time and are left
unset, which means their built-in defaults: `NEXT_PUBLIC_VERDICT_FIRST_UI` (verdict-first layout
off), `NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED` (off) and `NEXT_PUBLIC_API_BASE` (`/api`).
`ui.env` cannot carry them, so changing one is a source change, not a server setting.

Why a new folder and not `preview-auth-dev/v1`: every file in `preview-auth-dev/v1` is part of the
operator digest (the fingerprint the launchers, the native operator and the release guard compare).
Keeping this tool outside it means adding or fixing the tool never adds a file to that set (28
files since the hosted-billing release added `publish-register-v3.ts`, `egress-proxy.mjs` and
`debateai-preview-egress.service`). The digest itself still changes whenever any of those files
changes, as it does in this release.

What it does **not** do: package the release folders, stop or start anything, touch the database,
install `native-plan.json`, or pin a release. Those stay the operator steps below.

## Commands

Run as root on the server. Every command ends with one JSON line on stdout on success, or one
line `{"event":"PREVIEW_RELEASE_REFUSED","reason":…}` on stderr and exit 1. `ui-build` and
`source-manifest` also pass through the build's and git's own output before that line (paths, no
secrets). Every check of `--out` runs before the slow work. A file left half-written by a killed
run makes the next run refuse with `OUTPUT_EXISTS`: delete that one file by hand (no reader
accepts it). `launch-plan` and `native-plan` re-check the release folder byte for byte before
writing, so they take a few minutes each. `ui-build` refuses a folder that already has a build
(`.next`), so it can never rebuild the website a running service serves.

| Command | What it does |
|---|---|
| `source-manifest --repository <clean git clone> --root <release root> --role api\|ui\|runner --out <file>` | runs `generateSourceManifest` with uid 0 and writes it; prints `{path,sha256,bytes}` |
| `build-env [--models glm-only\|multi-model]` | prints the fixed public UI build values (for that model list; default `glm-only`) and their sha256; reads no file |
| `ui-build --source <ui source manifest> [--models glm-only\|multi-model] --out <file>` | checks the UI root against its manifest, builds with the fixed values and that model list (default `glm-only`), records the list in the build, re-checks that the build changed no inventoried source byte, checks the build, writes the build manifest |
| `verify --source <file> [--ui-build <file>]` | re-runs `verifySourceManifest` (and `verifyUiBuildManifest`) against the exact file bytes |
| `operator-digest --source <file>` | prints `operatorManifestSha256` (the shared function the launchers use) and the operator file count |
| `launch-plan --service api\|ui\|runner --from <existing plan> --root <release root> --source-manifest <file> [--ui-build <file>] --native-attestation <file> --out <dir>/<service>-launch.json` | new launch plan: release fields from the manifests, everything else from `--from`; for `--service runner` the API plan may be `--from` (identity from the runner OS account, runner.env custody); `validateLaunchPlan` before writing |
| `native-plan --operation apply-and-plan\|verify --from <existing native plan> --source-manifest <candidate api manifest> --out <file>` | new native plan for a candidate API root; `verify` carries the `approval` of `--from` over unchanged; the reviewed `validateNativePlan` before writing |
| `native-plan --operation plan --from <live verify plan> --source-manifest <candidate api manifest> [--checker glm\|deepseek --deepseek-enabled-on-gate yes] [--role-rotation on\|off] [--call-concurrency '<JSON object>'] [--debate-shape off\|'<JSON object>'] [--question-language '<JSON object>'] [--length-guidance '<JSON object>'] --out <file>` | register publication, step 1: the base is the publication the preview runs now (`approval.publication` of the live verify plan: its version and snapshot hash, never typed); no approval. The answer checker stays GLM unless `--checker deepseek` is given together with `--deepseek-enabled-on-gate yes` (your statement that the gate's GO switches DeepSeek on). Role rotation stays on unless `--role-rotation off` is given: the rotation row is then published disabled (the preview's rollback for rotation; a later plan without the flag switches it back on, and its delta shows that row changing). `--call-concurrency` sets the call-concurrency row as one JSON object; without it the current value is kept, or there is no row if the base has none (see "Publishing the call-concurrency row" below). `--hosted-billing '<JSON object>'` composes a HOSTED version with publish kit v3 from the owner's billing switch, ceilings and room-read budget (see "Hosted preview with NETOPIA sandbox billing" below); a plan from a hosted base needs it (`HOSTED_BILLING_REQUIRED`). `publish` carries the plan's choices; `verify` and `apply-and-plan` carry `--from`'s hosted inputs. `--debate-shape` sets the debate shape row. `off` publishes it disabled: the start values with `enabled: false`, so the API asks today's shape, and a runner on that version still finishes the debates admitted with the shape. A JSON object (the whole policy, with its kind) publishes that policy; the register's own parser checks it on the server before any row is built. Without the option the current row is kept, or there is none. `--question-language` sets the optional `questionLanguagePolicy` row (the policy without its `kind`; `deploy/vps/register/README.md`); `"fastCheck": null` in it switches the fast language check off. Before anything is sealed the kit asks the API's own question-language boot refusals while the debate shape is in force (a reserved prompt-frame token in the instruction, a fast-check model the preview gate does not list). Without the option the base's row is kept, or there is none (the code's start values). Length guidance (LG-C) is optional: `--length-guidance '<JSON object>'` carries the whole policy, with its `kind`; use `"$(cat dialectical-engine/tools/preview-practice/length-policy-start.json)"` for the owners' start values (the preview practice's start file). The policy is about 4-5 KB, inside the native plan's 32 KiB limit. There is no `off` word: a version without the row is the rollback. Left out, the base's length-guidance row is kept as it is, or none. Only `plan` takes the flag; `publish` carries the plan's choice. |
| `native-plan --operation publish --from <the plan above> --proposal <what the native operator printed for it> --source-manifest <same manifest> --out <file>` | step 2, after the owner reviewed the proposal: re-hashes every value the proposal shows and its `deltaSha256`, checks it belongs to that plan (release, operator digest, base), copies the approval from it, picks a fresh `publicationId`, and prints the approval it wrote |
| `native-plan --operation verify --from <the publish plan> --publication <what the native operator printed for publish> --source-manifest <manifest> --out <file>` | step 3: the verify plan for the NEW publication (same id, base and snapshot as the publish plan) |
| `launch-plan … --publication <what the native operator printed for publish>` | launch plans that carry the new publication instead of the old plan's; the `--native-attestation` proof must already name it |

## Operator sequence for one release

This follows the release runbook: steps 1-3 (package, build, fingerprints) need no downtime;
the native-plan steps belong to its steps 5b and 7 (downtime, owner yes).

**0. Names for this release.** Open one root shell first (`sudo -i`) and keep it for every
step below. `LABEL` below is the example of the release built from dev 23402d10e: change it for
each release (lower-case letters, digits, dashes); everything else is derived. The `rel` function runs the tool from the candidate API release, so the tool
that stages a release is that release's own reviewed copy.

```sh
umask 022
LABEL=23402d10e-parti-v1
ART=/opt/debateai-v3-preview/artifacts/auth-dev-$LABEL
R=/opt/debateai-v3-preview/releases
CAPI=$R/auth-dev-candidate-$LABEL-api; CUI=$R/auth-dev-candidate-$LABEL-ui; CRUN=$R/auth-dev-candidate-$LABEL-runner
rel() { /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin TZ=UTC /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$CAPI/dialectical-engine/deploy/preview-release/v1/release-artifacts.mjs" "$@"; }
```

**1. Package** (runbook step 1, unchanged): the clean reference clone at `$ART/source-reference`,
six root-owned release folders `$R/auth-dev-{candidate,fallback}-$LABEL-{api,ui,runner}` exported
with `git archive`, dependencies installed offline with `pnpm install --frozen-lockfile`, and the
contract generated in each. The tool starts after that.

**2. Source manifests** for all six folders (about 2 minutes each):

```sh
for KIND in candidate fallback; do for ROLE in api ui runner; do
  rel source-manifest --repository "$ART/source-reference" --root "$R/auth-dev-$KIND-$LABEL-$ROLE" --role "$ROLE" --out "$ART/$KIND-$ROLE-source.json" || break 2
done; done
```

Expect six lines `{"path":…,"sha256":…,"bytes":…}`.

**3. Check the public build values against `ui.env`, by hash only.** First the tool's values,
then the same keys from `ui.env` (this prints hashes, never the file):

Give `build-env` the same `--models` you will give `ui-build` in step 4 (none means `glm-only`).

```sh
rel build-env
for K in NODE_ENV PUBLIC_APP_URL NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON TURNSTILE_SITE_KEY; do printf '%s ' "$K"; sed -n "s/^$K=//p" /etc/debateai-v3-preview/auth-dev-v1/ui.env | tr -d '\n' | sha256sum | cut -d' ' -f1; done
```

Each hash must equal the `sha256` that `build-env` printed for that key. A hash starting
`e3b0c442` means the key is missing from `ui.env`: stop and ask.

**4. Build the website** in the candidate and the fallback UI folders (about 10 minutes each).
The build log goes to a file; the last line is the result:

```sh
for KIND in candidate fallback; do
  rel ui-build --source "$ART/$KIND-ui-source.json" --out "$ART/$KIND-ui-build.json" > "$ART/$KIND-ui-build.log" 2>&1; echo "$KIND exit $?"; tail -n 1 "$ART/$KIND-ui-build.log"
done
```

**5. Re-check everything** (proves the build changed no inventoried source byte), then print the
operator digest:

```sh
for KIND in candidate fallback; do
  rel verify --source "$ART/$KIND-api-source.json"
  rel verify --source "$ART/$KIND-ui-source.json" --ui-build "$ART/$KIND-ui-build.json"
  rel verify --source "$ART/$KIND-runner-source.json"
done
rel operator-digest --source "$ART/candidate-api-source.json"
```

Expect six `PREVIEW_RELEASE_VERIFIED` lines, all with the same `sourceRevision`, and one digest
line. `operatorFileCount` is the number of files in `deploy/preview-auth-dev/v1` of this release.

**6. Native plan for applying the database step** (runbook step 5b: downtime, owner yes; `$S`
is the runbook's root-only archive folder from its step 4c):

```sh
NP=/etc/debateai-v3-preview/auth-dev-v1/native-plan.json
cp -a "$NP" "$S/native-plan.before.json"
rel native-plan --operation apply-and-plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-apply-and-plan.json"
install -o root -g root -m 0644 "$ART/native-plan-apply-and-plan.json" "$NP.new" && mv "$NP.new" "$NP" && cmp "$ART/native-plan-apply-and-plan.json" "$NP"
```

Then run the native operator once as in runbook step 5c.

**7. Native plan for verify, first proof, launch plans, pin** (runbook step 7).

The verify plan keeps the old plan's `approval` unchanged. In verify mode the native operator
uses only `approval.runtimeObservedAt` and `approval.publication` (the live register receipt),
and `prestart.mjs pin` compares that publication with the launch plans, which carry the same
receipt over from the old plans.

```sh
rel native-plan --operation verify --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-verify.json"
install -o root -g root -m 0644 "$ART/native-plan-verify.json" "$NP.new" && mv "$NP.new" "$NP" && cmp "$ART/native-plan-verify.json" "$NP"
cd "$CAPI/dialectical-engine" && /bin/sh -c 'exec 5<&0; p=$1; shift; printf %s "$p" 5<&- | "$@" 3<&0 0<&5 5<&-' sh '{"peerUrl":"postgresql://postgres@localhost/debateai?host=/run/debateai-v3-preview/postgresql&port=5434"}' /usr/sbin/runuser -u postgres -- /usr/bin/env -i PATH=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin:/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs" --credential-fd 3 < /dev/null > "$ART/native-first-verify.json"; echo "exit $?"; cd /
```

The proof only has to be the right proof for the base plans: `prestart.mjs` makes a fresh one
before every start. With the lifecycle installed, the live plans are named in its lock:

```sh
OLDA=$(jq -r .services.api.basePlan.path /etc/debateai-v3-preview/lifecycle/release-lock.json)
OLDU=$(jq -r .services.ui.basePlan.path /etc/debateai-v3-preview/lifecycle/release-lock.json)
rel launch-plan --service api --from "$OLDA" --root "$CAPI" --source-manifest "$ART/candidate-api-source.json" --native-attestation "$ART/native-first-verify.json" --out "$ART/api-launch.json"
rel launch-plan --service ui --from "$OLDU" --root "$CUI" --source-manifest "$ART/candidate-ui-source.json" --ui-build "$ART/candidate-ui-build.json" --native-attestation "$ART/native-first-verify.json" --out "$ART/ui-launch.json"
```

The runner (GAP-RUNNER): the server has no runner plan yet, so the first one is derived from the
API plan. `--service runner --from <the API plan>` copies the release fields as for the API and takes
`serviceUid`/`serviceGid` only from the `debateai-preview-runner` OS account (`getent passwd` and
`getent group`; refused if missing, root, nobody, a login shell, or a group whose gid differs), with
`environment` = `/etc/debateai-v3-preview/auth-dev-v1/runner.env` root:<runner gid> 0640. A UI plan as
`--from` refuses. Once the lifecycle lock names a runner plan, later releases use that plan instead
(`.services.runner.basePlan.path`), which keeps its own identity.

```sh
rel launch-plan --service runner --from "$OLDA" --root "$CRUN" --source-manifest "$ART/candidate-runner-source.json" --native-attestation "$ART/native-first-verify.json" --out "$ART/runner-launch.json"
```

Then `prestart.mjs pin --from "$ART/runner-launch.json"` and the runner unit, release drop-in and
runner.env as `deploy/preview-auth-dev/v1/README.md` "Runner start" says; the runner is started by hand.

`jq` must be installed (`command -v jq`); if it is missing, the variables come out empty and the
tool refuses. Without the lifecycle, set `OLDA` and `OLDU` to the live plans named in the newest
release drop-in instead. Fallback plans go in their own folder (the plan file name is fixed per
service), with `--root` and `--source-manifest` of the fallback folders.

The verify plan keeps the live register publication. Its `nodeRuntimeVersion` row therefore
still names the earlier source revision and operator digest; the native verify does not compare
that row, and a new publication is a separate, reviewed step. That step is "Publishing a new register version"
below; when the release changes the register, do it instead of this step 7.

Then pin and restart exactly as `deploy/preview-lifecycle/v1/README.md` "Pinning a NEW release"
says (`prestart.mjs pin --from "$ART/api-launch.json"`, the same for ui, regenerate both release
drop-ins, `daemon-reload`, restart api then ui).

## Releasing the debate-shape code (a new register version, even with the shape off)

**In plain words.** The debate-shape release changes two of the instructions the AIs are sent, so their
fingerprints in the settings (the register) change too. The new runner checks those fingerprints when it starts
and refuses a settings version that does not carry them (`REGISTER_PROMPT_CONTRACT_HASH_MISMATCH`). So this
release needs a **new register version** before it can run at all, **even with the debate shape switched off**.
With register 12 still pinned, the API would start and accept debates, but the runner would refuse to start, and
those debates would wait with nobody to run them.

**What the new version changes** (and nothing else):

- `judgeContractHash`: `e7f7e4b0e7066fb2b873c4435b2bd593a0a399f8de506604c35b92222fdb1365` becomes
  `aac534075f292189027590dcbde6256a9684f085814ad2ab2bb4cb4be9c22612`;
- `composerContractHash`: `4b141d3ab287366c4969f89e04649c5f1cc951d433206ffa0295527eba4df90f` becomes
  `879d2c5d0213832fe466537603e5171e53248cce41188473550616d2dd5b4a47` (the answer writer `serve.synthesizer.v4`
  with its answer-length variant `serve.synthesizer.length.v2`: since 2026-10-15 the writer says in natural words
  of the question's language that a provisional answer may still change, instead of translating "not yet settled"
  word for word. This branch's earlier value, `9a46af29…` (v3 with `serve.synthesizer.length.v1`), is history: a
  plan or progress line that names it was made from older code);
- `mapContractHash` is new: `25b4c106a9b5e444d19aee0a31b7fea95f377ee91fb1f9eef64c623938e59392` (read only
  beside a debate-shape row);
- `nodeRuntimeVersion` keeps its value with a new source reference, as at every publication.

**Length guidance (LG-C) moves three of these seals again.** A register version for this code carries
`judgeContractHash` `810d611a72cbf486d7027ca444e2181541a60c4843c42ebaed549eb4577bf1ee` (was `aac534075f292189027590dcbde6256a9684f085814ad2ab2bb4cb4be9c22612`),
`conformanceContractHash` `108f1b29fb3c4739568a083c806ef5abdb9289e8b621bc9d895d52e5fcad22f6` (was `660ec7cba5aa70bbd29e190580b7385802cd21bc6b212d11646b54c1d84ee22f`)
and `mapContractHash` `d46c0c12d8164c9b01db78ff64ab58515e8a2f98887d5a433c090b40dcd39b71` (was `25b4c106a9b5e444d19aee0a31b7fea95f377ee91fb1f9eef64c623938e59392`); the
composer seal is unchanged. It needs them whether or not it carries the `lengthGuidancePolicy` row (`--length-guidance`).
Rolling the CODE back to R18 (the release before these seals) also needs `REGISTER_VERSION` re-pinned in both
`api.env` and `runner.env` to the version published before them (on the preview: 14), and both restarted: an R18
runner refuses a version with the new seals (`REGISTER_PROMPT_CONTRACT_HASH_MISMATCH`, the other way). Never roll the
code back while a debate admitted with the length row runs: the older code refuses a receipt that carries `length`.

**R2a moves the engine seal.** A register version for this code carries `engineContractHash` `bb9e93c372bad372468b03f60eceebf92047889e247b8ccacfb8c949b9da9e7a` (was
`b98a45d5933d82205d5c6514082d4151bfb8f3f45b3677f6319794ae2a885e24`, R1d's seal over no contract). Nothing reads it
without an `engineVersionPolicy` row, so the runner boots either way.

**R2b moves the engine seal again.** A register version for this code carries `engineContractHash` `8298e1b36638369d2e1bd58111eec69d1c997f9475965ed183c8750491053473` (was `bb9e93c372bad372468b03f60eceebf92047889e247b8ccacfb8c949b9da9e7a`
after R2a, or `b98a45d5933d82205d5c6514082d4151bfb8f3f45b3677f6319794ae2a885e24` from a release before R2a): R2b appends the
comparing judges' prompt contract. Nothing reads it without an `engineVersionPolicy` row, so the runner boots either way.

**R3 moves the engine seal again.** A register version for this code carries `engineContractHash` `ba2f15d5d89b2f7b4c3168e2f7908f5d3130aa55fc4929ad0825b15028500a4d` (was `8298e1b36638369d2e1bd58111eec69d1c997f9475965ed183c8750491053473` after R2b): R3 appends the map's eight engine-2 contracts and the fixed-words position contracts. Nothing reads it without an `engineVersionPolicy` row, so the runner boots either way. A practice register saved with an engine row before this seal must be rebuilt: the runner refuses a stale seal at boot. Rebuild it by running the practice with `--register-next` (tools/preview-practice/README.md, "Optional flags"), which composes this code's next version, with this code's own seal, in the throwaway database.

There is no `debateShapePolicy` row: leave out `--debate-shape`, so the shape stays off. Any other added or
changed row: stop and ask.

**The order.**

1. **Practice first, with `--register-next`** (`tools/preview-practice/README.md`). Without it the practice
   debate stops at `REGISTER_PROMPT_CONTRACT_HASH_MISMATCH`. Its progress line must name exactly the rows above.
2. **Apply migrations 0117 and 0118** (after the mail language's 0116 if the preview does not have it yet) with the
   release's database step (step 6 above, `apply-and-plan`, then the native operator once). Without 0117 every debate page fails: the page asks for the debate's map, and
   the table it reads does not exist yet.
3. **Publish the new version from this code, without `--debate-shape`**: the plan, the owner's review of the
   delta, then the publish, as "Publishing a new register version on the preview" below describes. The plan
   keeps the checker and rotation choices of version 12.
4. **Wait until no debate is queued or running.** A debate in flight was started under the old fingerprints;
   the runner finds its earlier attempts by them, so a debate crossing the switch would ask the AIs again and
   pay twice.
5. **Restart the API and the runner together** on the new version: `REGISTER_VERSION` moves in both `api.env`
   and `runner.env`, and the launch plans carry the new publication. Start the website with the API or after
   it, never before. Never restart the API alone on version 12: it does not check the fingerprints, so it
   would accept debates the runner cannot start.

Rollback: the new version stays sealed and unused; the old release goes back on version 12 in both env files.
Switching the shape on later is a separate publication (`--debate-shape`), after these steps.

## Publishing a new register version on the preview (publish kit v2)

**When.** Whenever the release's code builds a register different from the version the preview runs:
a changed value (e.g. dev b75e4c294: `composerContractHash` moved to the answer-writer prompt v2, and
`countryPolicy` closed Tennessee) or a new key (e.g. `outboundMailPolicy`, which must also be added
to `PREVIEW_SOURCE_ROW_KEYS_V2` in `deploy/preview-auth-dev/v1/publish-register-v2.ts`).

**What changed from v1.** The v1 composer (`publish-register.ts`, unchanged but for S04's questionCheckPolicy, which the API reads at start-up) could make only one
publication: 67 source rows on a 65-row base, adding four fixed keys. It refuses the live 68-row
version. Kit v2 (`publish-register-v2.ts`) composes from the version the preview runs now. The
proposal it prints lists every added or changed row with its old and new value in full. A base row
the source no longer builds is refused, except `staffAccessPolicy` and `internalAllowancePolicy`,
which are carried over unchanged. `plan` and `publish` refuse a base that is not the newest sealed
version. Nothing sealed is edited: each publication is a new version.

**Why the approval cannot drift from the review.** The release tool recomputes every hash in the
proposal from the values it shows, plus `deltaSha256`, before copying the approval into the publish
plan. At `publish`, the native operator rebuilds the snapshot from the database and the release.
It refuses unless the base, the snapshot hash and the delta hash all equal the approved ones. A
proposal file edited after review therefore fails in one of two places:
- in the tool, if its hashes no longer match what it shows;
- in the operator, if its hashes no longer match what the code builds.

**The sequence.** It runs in one root shell with the names from step 0 above. The release must
already be staged up to step 5. Define `nat` once. It is the exact native-operator call of step 7,
writing its one output line to the file you name:

```sh
NP=/etc/debateai-v3-preview/auth-dev-v1/native-plan.json
nat() { ( cd "$CAPI/dialectical-engine" && /bin/sh -c 'exec 5<&0; p=$1; shift; printf %s "$p" 5<&- | "$@" 3<&0 0<&5 5<&-' sh '{"peerUrl":"postgresql://postgres@localhost/debateai?host=/run/debateai-v3-preview/postgresql&port=5434"}' /usr/sbin/runuser -u postgres -- /usr/bin/env -i PATH=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin:/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs" --credential-fd 3 < /dev/null > "$1" ); echo "exit $?"; }
put() { install -o root -g root -m 0644 "$1" "$NP.new" && mv "$NP.new" "$NP" && cmp "$1" "$NP"; }
cp -a "$NP" "$S/native-plan.before.json"
```

1. **Plan** (read-only; the services can stay up). The base is the live publication:

   ```sh
   rel native-plan --operation plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-plan.json"
   put "$ART/native-plan-plan.json" && nat "$ART/register-proposal.json"
   put "$S/native-plan.before.json"   # at once: a restart's prestart accepts only a verify plan
   jq '{baseRegisterVersion,addedKeys,changedKeys,deltaSha256}' "$ART/register-proposal.json"
   ```

2. **The owner reviews the delta.** Read every entry, old value against new:

   ```sh
   jq -r '.delta[] | "\(.change) \(.rowKey) (\(.reason))\n  old: \(.oldValueJsonText)\n  new: \(.newValueJsonText)"' "$ART/register-proposal.json"
   ```

   For dev b75e4c294 on the live v9, expect exactly three changed rows:
   - `composerContractHash`: `d96e7cc9…c866` becomes `340e11a6…8b70`;
   - `countryPolicy`: gains `us_states.TN`;
   - `nodeRuntimeVersion`: its source reference only.

   Anything else means stop and ask. The owner's yes names the printed `deltaSha256`; keep it as
   `YES=<that hash>`. Re-running `plan` gives a new time, so a new hash, and needs a new yes.

3. **Downtime, then publish.** Choose a moment when no debate is writing its answer: run the
   `unfinished` count of `deploy/vps/README.md` §"Upgrading to the answer-writer prompt v2 release"
   and wait for 0, because the answer writer's fingerprint keys the runner's earlier writer
   attempts. Then stop the API and the UI, exactly as the release runbook's downtime step does:

   ```sh
   rel native-plan --operation publish --from "$ART/native-plan-plan.json" --proposal "$ART/register-proposal.json" --approved-delta-sha256 "$YES" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-publish.json"
   ```

   It refuses with `PROPOSAL_NOT_APPROVED` unless the proposal's `deltaSha256` is `$YES`, and it
   prints the approval it wrote. Then:

   ```sh
   put "$ART/native-plan-publish.json" && nat "$ART/register-published.json"
   V=$(jq -r .publication.registerVersion "$ART/register-published.json"); echo "new REGISTER_VERSION=$V"
   ```

   Re-running `nat` with the same publish plan after a crash replays the same version. It never
   makes a second one. Never make a second publish plan for a run that may have committed: a fresh
   `publicationId` meets the version already written and refuses.

   **If `nat` refuses here**, nothing was written:
   - put the verify plan back with `put "$S/native-plan.before.json"`;
   - start the old release unchanged;
   - read the refusal line.
   `PREVIEW_REGISTER_BASE_NOT_CURRENT: …` means a version newer than the plan's base exists: plan
   again (step 1) from the verify plan that names the newest publication.

4. **Verify the new publication and make launch plans that carry it**, for the API, the website
   and the runner. The runner reads the register too (its call limits among other rows), so it
   needs its own plan with the new publication. `OLDR` is the runner plan the lifecycle lock names
   (as `OLDA` and `OLDU` in step 7). If the lock has no runner yet, `jq` prints `null` and the
   next line uses the API plan instead, as step 7 explains for the first runner plan.

   ```sh
   rel native-plan --operation verify --from "$ART/native-plan-publish.json" --publication "$ART/register-published.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-verify.json"
   put "$ART/native-plan-verify.json" && nat "$ART/native-first-verify.json"
   rel launch-plan --service api --from "$OLDA" --root "$CAPI" --source-manifest "$ART/candidate-api-source.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/api-launch.json"
   rel launch-plan --service ui --from "$OLDU" --root "$CUI" --source-manifest "$ART/candidate-ui-source.json" --ui-build "$ART/candidate-ui-build.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/ui-launch.json"
   OLDR=$(jq -r .services.runner.basePlan.path /etc/debateai-v3-preview/lifecycle/release-lock.json); echo "$OLDR"
   if [ "$OLDR" = null ]; then OLDR=$OLDA; fi
   rel launch-plan --service runner --from "$OLDR" --root "$CRUN" --source-manifest "$ART/candidate-runner-source.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/runner-launch.json"
   ```

5. **Point both environment files at the new version.** In `api.env` and in the runner's
   `runner.env` (`deploy/preview-auth-dev/v1/README.md` "runner.env recipe"), replace the
   `REGISTER_VERSION=` line with `$V`. Each launcher refuses to start unless that line equals
   its plan's publication. The edit does not print the files:

   ```sh
   sed -i "s/^REGISTER_VERSION=.*/REGISTER_VERSION=$V/" /etc/debateai-v3-preview/auth-dev-v1/api.env
   grep -c "^REGISTER_VERSION=$V\$" /etc/debateai-v3-preview/auth-dev-v1/api.env   # must print 1
   sed -i "s/^REGISTER_VERSION=.*/REGISTER_VERSION=$V/" /etc/debateai-v3-preview/auth-dev-v1/runner.env
   grep -c "^REGISTER_VERSION=$V\$" /etc/debateai-v3-preview/auth-dev-v1/runner.env   # must print 1
   ```

6. **Pin all three, then restart the API, the website, then the runner.** This follows
   `deploy/preview-lifecycle/v1/README.md` §"Pinning a NEW release", with the runner added: pin
   the three plans first, then regenerate the three release drop-ins from the finished lock,
   `daemon-reload`, and restart in that order. Each start's prestart re-verifies natively against
   the verify plan of step 4. The API and the runner each refuse to start if `REGISTER_VERSION`
   differs from their pinned publication. The `&&` chain stops at the first refusal, and it sets
   `PINNED=yes` only after every pin, drop-in and restart in it succeeded. The runner block below
   restarts the runner only when `PINNED` is `yes`. So no service restarts on a half-pinned lock:
   not the API, not the website, not the runner.

   ```sh
   PINNED=no
   L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
   N=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node
   $N $L/prestart.mjs pin --from "$ART/api-launch.json" \
     && $N $L/prestart.mjs pin --from "$ART/ui-launch.json" \
     && $N $L/prestart.mjs pin --from "$ART/runner-launch.json" \
     && $N $L/prestart.mjs dropin --service api > /etc/systemd/system/debateai-preview-api.service.d/zzzzzzzzzz-lifecycle-release.conf \
     && $N $L/prestart.mjs dropin --service ui > /etc/systemd/system/debateai-preview-ui.service.d/zzzzzzzzzz-lifecycle-release.conf \
     && $N $L/prestart.mjs dropin --service runner > /etc/systemd/system/debateai-preview-runner.service.d/zzzzzzzzzz-lifecycle-release.conf \
     && systemctl daemon-reload \
     && systemctl restart debateai-preview-api \
     && systemctl restart debateai-preview-ui \
     && PINNED=yes \
     && echo "pinned; API and website restarted"
   ```

   Each `pin` prints one `PREVIEW_LIFECYCLE_RELEASE_PINNED` line naming the new register version.

   **Then the runner, only when every pin succeeded and no debate is running.** Paste the next
   lines in the same root shell, after the block above printed `pinned; API and website
   restarted`. If that block stopped early, `PINNED` is still `no` and the runner is left exactly
   as it was: step 5 already pointed `runner.env` at the new version, and a runner restarted
   without its new pin would refuse to start and stay down. Restarting the runner in the middle of a
   debate cuts that debate off; another copy may later pick it up again and pay for calls twice. So
   the next lines first count the debates the runner is working on right now (`CLAIMED`), and
   restart the runner only when that count is 0. If they print a number above 0, nothing is
   restarted: wait a few minutes and paste the same lines again. If the number stays above 0 for
   more than 30 minutes, stop and ask. The runner is never restarted automatically;
   `try-restart` restarts it only if it is running, so a runner stopped on purpose stays stopped
   and its next start by hand uses the new version.

   ```sh
   RUNNING=$(runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc "SELECT count(*) FROM core.work_item WHERE state = 'CLAIMED'"); echo "debates running now: $RUNNING"
   [ "${PINNED:-}" = yes ] && [ "$RUNNING" = 0 ] && systemctl try-restart debateai-preview-runner && echo "runner restarted (if it was running)"
   ```

**Publishing the call-concurrency row.** The register row `callConcurrencyPolicy` says how many AI
calls a debate may run at the same time (spec 2026-10-12, parallel calls; values and bounds in
`deploy/vps/register/README.md`, "The call-concurrency setting").

**Step 0, before anything else: redeploy BOTH spending gates.** With many calls on their way at
once, the old gate code counts one short network blip as many failures, and five of them halt the
gate (`provider_unreachable`). The new gate code counts calls that were on their way together once.
So, first, redeploy the DeepInfra gate and the Anthropic gate exactly as
`deploy/preview-gate/v3/README.md` §"Redeploy (2026-10-12): calls on their way together count once"
says (stop, install the gate files from this release, write the GO again, restart the gate's
service, `activate` with the owner's yes). The gate file in this release already holds the
thinking-levels gate changes from dev (#149): one redeploy covers both, and it is needed even if the
thinking-levels redeploy was done before, because the file's hash changed again. Then check both
gates against THIS release's gate files (in the candidate API folder `$CAPI` named in step 0 of
the operator sequence; the gate README installs the same two files from the same place). An old
gate file with its old GO would agree with each other, so each gate's two installed files and the
two hashes in its GO must all equal this release's files. The first line must print
`release gate files found`, each gate's line must say `match this release`, and each `state` line
must say `active`:

```sh
NEW=$CAPI/dialectical-engine/packages/providers/ops; test -f "$NEW/preview_budget_authority.py" && test -f "$NEW/preview_budget_helper.py" && echo "release gate files found"
NB=$(sha256sum "$NEW/preview_budget_authority.py" | cut -d' ' -f1); NH=$(sha256sum "$NEW/preview_budget_helper.py" | cut -d' ' -f1)
same() { [ -n "$NB" ] && [ -n "$NH" ] && [ "$(sha256sum "$1/preview_budget_authority.py" | cut -d' ' -f1)" = "$NB" ] && [ "$(sha256sum "$1/preview_budget_helper.py" | cut -d' ' -f1)" = "$NH" ] && [ "$(jq -r .bridge_sha256 "$2")" = "$NB" ] && [ "$(jq -r .helper_sha256 "$2")" = "$NH" ]; }
if same /opt/debateai-v3-preview/operator/deepinfra-budget-v3 /etc/debateai-v3-preview/provider-deepinfra-go-v3.json; then echo "deepinfra gate files and GO match this release"; else echo "deepinfra does NOT match this release: stop"; fi
echo "deepinfra state $(/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 | jq -r .state)"
if same /opt/debateai-v3-preview/operator/anthropic-budget-v1 /etc/debateai-v3-preview/provider-anthropic-go-v1.json; then echo "anthropic gate files and GO match this release"; else echo "anthropic does NOT match this release: stop"; fi
echo "anthropic state $(/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1 | jq -r .state)"
```

Anything else means stop: do not publish the row until both gates run the new code.

Then add one option to step 1's `plan` command and follow the same steps 1 to 6: the plan carries the policy, the owner
sees `callConcurrencyPolicy` in the delta (`added` the first time, `changed` for a new value),
`publish` copies it from the plan. The runner is the only reader of this row, so do not skip
the runner's lines: step 4 makes its launch plan with the new publication, step 5 points
`runner.env` at the new version, and step 6 pins it and restarts it after the API and the
website. Until the runner restarts on the new version, it keeps the old limits. Give the
three values without the row kind, in single quotes, with no line break. The owner's start values:

```sh
rel native-plan --operation plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --call-concurrency '{"perDebate":12,"perModelPerDebate":3,"perModelPerRunner":{"default":50,"deepinfra":150,"anthropic":50}}' --out "$ART/native-plan-plan.json"
```

The tool refuses (`ARGUMENTS_REFUSED` naming `--call-concurrency`, nothing written) text that is
not one JSON object, a missing or extra key, a number outside its bounds or not whole, a vendor
name that is not lower case, runner limits without `default`, and the option on any operation but
`plan`. To turn parallel calls off later, publish again the same way with
`--call-concurrency '{"perDebate":1,"perModelPerDebate":1,"perModelPerRunner":{"default":1000}}'`.
A plan without the option keeps the current value: once a version holds the row, the kit copies it
unchanged from the version the plan is based on, and the delta does not list it. So a publication
made for another reason never needs the option, and never changes the setting.

**Rolling back.** Re-install the archived `$S/native-plan.before.json`, set `REGISTER_VERSION` back
to the old version, and re-pin the old launch plans. The new version stays sealed, unused. Later
publications must then be based on that newest version, not on the one running after the
rollback, because `plan` and `publish` refuse a base with a newer version above it. So run the next
`plan` with `--from` set to the kept `$ART/native-plan-verify.json` of step 4, which names it. The
proposal's delta is then measured against that unused version, not against the running one: the
owner reviews it knowing that. A
fallback release built before kit v2 cannot verify on a base above 65 rows. Roll back to it only
together with its own old native plan.

**What only the server proves:**
- the operator run itself: peer identity, `refusePendingForwardSteps`, the real `publishGeneral`
  receipt and `verifyNativeState`;
- that the API boots on the new version;
- that the answer writer then records under `340e11a6…`.

The unit tests (`preview-register-publish-v2`, `preview-release-artifacts`) and the PostgreSQL 18
integration test (`tests/integration/preview-register-publish-v2.test.ts`: add keys, change a value,
replay, stale base, wrong delta) are source evidence only.

## Hosted preview with NETOPIA sandbox billing (owner rulings 2026-10-13)

**In plain words.** The preview runs in local mode today, and billing exists only in hosted mode. This
section switches the preview to hosted mode so the owner can test the paid plans on it: payments go to
NETOPIA's sandbox (test cards, no real money), invoices to a Quaderno sandbox account, and SmartBill
stays a dummy address that never resolves (`https://smartbill.invalid`; SmartBill has no sandbox, so a
Romanian purchase fails harmlessly and issues nothing). The spending gates, the team, the website and
the debates stay as they are. It is two register publications: first hosted with billing off and
NETOPIA's settings in place (the provider-only mode: only NETOPIA's notify route is served), then
billing on. The repository side (the tools and these steps) is ready; every step below runs on the
server, by the owner or whoever runs it. No tool and no agent reads a key: the owner types or copies
each key file. The owner approved documenting these steps here.

What the repository adds for it (each in `deploy/preview-auth-dev/v1/README.md`):
- publish kit v3 (`publish-register-v3.ts`), chosen by `native-plan --hosted-billing '<JSON>'`;
- the environment rules for hosted mode (`environment.mjs`): sandbox-only billing values at fixed
  paths, the moved billing clock refused;
- the egress proxy (`egress-proxy.mjs`, unit template `debateai-preview-egress.service`): the API keeps
  its Internet denial and reaches only NETOPIA's and Quaderno's sandboxes, by host name;
- the templated-mail family in `mail-handoff.mjs`: billing and legal emails to the allow-listed
  recipients only.

**What hosted mode changes for the team.** Read these before the owner's yes.
- Every debate, the owner's included, counts against the owner's two site ceilings below, and, once
  billing is on, against the person's plan: an account without a paid plan runs on Free's month. Team
  debates are paid with sandbox plans bought with NETOPIA's test cards; team funding (the internal
  allowance) is not built.
- The country gate is on (register 12 already carries `countryPolicy`): sign-up and payment follow the
  visitor's address, and Tor and unknown addresses are refused.
- Every existing account sees the Terms and Privacy accept screen once, the next time it opens a
  signed-in page.
- Sign-up refuses the special-use email endings (`.test`, `.example`, `.invalid`, `.localhost`).
- Billing emails, and the owner's reports, go only to the addresses allowed in
  `/etc/debateai-v3-preview/auth-dev-v1/mail-recipient.json`. Buy only from accounts on those
  addresses, and give the owner-report file one of them.
- Moving the billing clock (`BILLING_STAGE_CLOCK_OFFSET_DAYS`) stays refused (the owner is still
  deciding), so a renewal cannot be tested on this host yet.

**The owner's inputs.** Decide them before step H6. Amounts are micro-dollars: $1 is `1000000`.

| Input | Where it goes | Suggested (pending the owner's yes) |
|---|---|---|
| Ceiling per debate | `perRunCeilingMicros` in `--hosted-billing` | `3000000` ($3) |
| Ceiling per day, for the whole site | `dailyCeilingMicros` in `--hosted-billing` | `10000000` ($10) |
| The room read's budget (`GET /v1/asks/room`) | `askRoomReads` in `--hosted-billing` | `{"limit":60,"windowMs":60000,"capacity":65536}` (the hosted kit's example) |
| NETOPIA sandbox POS signature, API key, public key | step H6, step H5 | from NETOPIA's sandbox admin |
| Quaderno sandbox account (its label) and API key | steps H3 and H7, step H5 | the label in `https://<label>.sandbox-quadernoapp.com/api` |
| SmartBill series | step H7 | `DBAI` (the dummy never receives it) |
| The owner-report address | step H5 | one of the allow-listed addresses |

The kit refuses a debate ceiling above the day's and, as a typing guard only, above $50 per debate or
$200 per day (`ARGUMENTS_REFUSED` naming `--hosted-billing`). The day must also hold one full debate
plus its story: with $3 per debate that is at least $3.66, and the plan refuses a smaller day
(`STORY_DAILY_CEILING_INSUFFICIENT`, from the API's own boot rule).

### H0. Server work this section only names

- **The API's database login.** `debateai_prod_api_runtime` must be a member of
  `debateai_billing_runtime` (migration 0093); measured missing on 2026-10-13. Re-run the preview's
  principal provisioner. It also rotates the managed passwords: carry the new API and runner passwords
  into `api.env` and `runner.env` without printing them. Then this prints `t`:

  ```sh
  runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc "SELECT pg_has_role('debateai_prod_api_runtime','debateai_billing_runtime','MEMBER')"
  ```

- **The billing tables** exist (migrations up to 0114, measured 2026-10-13). A release that adds a
  migration still needs its `apply-and-plan` first, as always.

### H1. Names and copies, in the release's root shell

H0 must be finished first: the provisioner rotates the database passwords, and the copies below
must hold the current ones (after any later rotation, take them again). Use the root shell of step 0
(`LABEL`, `ART`, `CAPI`, `CUI`, `CRUN`, `rel`) and the publish sequence's names (`S`, `NP`, `nat`,
`put`). Then:

```sh
E=/etc/debateai-v3-preview/auth-dev-v1
B=/etc/debateai-v3-preview/billing
N=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
AU=$(systemctl show -p User --value debateai-preview-api); AGRP=$(id -gn "$AU"); echo "the API runs as: $AU ($AGRP)"
```

`$AU` must be a named account, never empty and never `root`: stop otherwise. Keep the state the
rollback returns to (all four files must be new, so a second run never overwrites them):

```sh
( set -euo pipefail
  for F in native-plan.before-hosted.json api.env.before-hosted runner.env.before-hosted release-lock.before-hosted.json Caddyfile.before-hosted; do [ ! -e "$S/$F" ]; done
  cp -a "$NP" "$S/native-plan.before-hosted.json"
  cp -a "$E/api.env" "$S/api.env.before-hosted"
  cp -a "$E/runner.env" "$S/runner.env.before-hosted"
  cp -a /etc/debateai-v3-preview/lifecycle/release-lock.json "$S/release-lock.before-hosted.json"
  cp -a /etc/caddy/Caddyfile "$S/Caddyfile.before-hosted"
  echo "rollback state kept" )
```

Read-only checks (names and counts only, never a value):

```sh
grep -cE '^INTERNAL_ALLOWANCE_[A-Z_]+=' "$E/api.env"   # must print 0
grep -cE '^(GEOIP_COUNTRY_DB_PATH|TOR_EXIT_LIST_PATH|NETOPIA_[A-Z_]+|QUADERNO_[A-Z_]+|SMARTBILL_[A-Z_]+|OWNER_REPORT_EMAIL_PATH|BILLING_STAGE_CLOCK_OFFSET_DAYS)=' "$E/api.env"   # must print 0
grep -c '^TURNSTILE_SOCKET_PATH=/run/debateai-preview-turnstile/siteverify.sock$' "$E/api.env"   # must print 1
grep -c '^DEBATEAI_DEPLOYMENT_MODE=local$' "$E/api.env" "$E/runner.env"   # 1 for each file
systemctl show -p IPAddressAllow -p IPAddressDeny -p RestrictAddressFamilies -p ProtectSystem -p InaccessiblePaths debateai-preview-api
postconf -h message_size_limit   # 0 (no limit) or at least 12582912
```

The first must be 0: a hosted API refuses to start when the staff settings name an internal
allowance the database does not select (`INTERNAL_FUNDING_UNAVAILABLE`), and team funding is not
built. The last line must show the API's Internet denial with loopback allowed (`IPAddressDeny`
`0.0.0.0/0 ::/0`, `IPAddressAllow` loopback), `AF_INET` among the families, and no
`InaccessiblePaths` entry covering `/var/lib/debateai-geoip` or `/etc/debateai-v3-preview/billing`.
The Postfix limit matters because a billing email may carry the Terms PDF: the hand-off admits up to
12 MiB, and Postfix's default (10240000 bytes) would bounce a message near the API's 8 MiB attachment
limit. Anything else: stop and ask.

### H2. Country files

A hosted API opens DB-IP's country file and the Tor exit list at start. The hosted kit's refresh
writes them into `/var/lib/debateai-geoip` as its own user; on the preview it runs a root-owned copy
of the kit's script (`deploy/vps/README.md` §5 "Country data" says what each line means). If
`debateai-geoip-refresh.service` already exists on this server, stop and ask.

```sh
( set -euo pipefail
  K="$CAPI/dialectical-engine/deploy/vps"; G=/opt/debateai-v3-preview/operator/geoip-v1
  [ ! -e /etc/systemd/system/debateai-geoip-refresh.service ]
  getent passwd debateai-geoip >/dev/null || adduser --system --group --no-create-home --home /nonexistent debateai-geoip
  install -d -o root -g root -m 0755 "$G"
  install -o root -g root -m 0755 "$K/geoip-refresh.sh" "$G/geoip-refresh.sh"
  install -o root -g root -m 0644 "$K/systemd/debateai-geoip-refresh.service" "$K/systemd/debateai-geoip-refresh.timer" /etc/systemd/system/
  install -d -o root -g root -m 0755 /etc/systemd/system/debateai-geoip-refresh.service.d
  printf '[Service]\nExecStart=\nExecStart=%s/geoip-refresh.sh\n' "$G" > /etc/systemd/system/debateai-geoip-refresh.service.d/10-preview-path.conf
  systemctl daemon-reload
  systemctl start debateai-geoip-refresh.service
  systemctl enable --now debateai-geoip-refresh.timer
  echo "country data refresh installed" )
journalctl -u debateai-geoip-refresh.service -n 20 --no-pager | grep -E 'GEOIP_REFRESH_(OK|SKIPPED|REFUSED)'
ls -l /var/lib/debateai-geoip/
```

Expect `GEOIP_REFRESH_OK country-db` and `GEOIP_REFRESH_OK tor-list`, and both files 0644. Never
create either file by hand (the kit's section says why). After a release that changes
`geoip-refresh.sh`, install the new copy the same way.

### H3. The egress proxy

The API keeps `IPAddressDeny=any`. In hosted mode its launcher sends every https call through the
loopback proxy `127.0.0.1:3180`, which lets through only NETOPIA's two sandbox hosts and the owner's one
Quaderno sandbox account (`deploy/preview-auth-dev/v1/README.md` "Hosted egress"). systemd cannot allow a
host name, and these services change addresses, so the proxy decides by name and refuses any inside
address a name resolves to. It admits one Quaderno sandbox account only, the owner's: `QACCOUNT` is
its label, the part before `.sandbox-quadernoapp.com` in the account's API address (step H7 writes the
same account into `api.env`; keep `QACCOUNT` set in this shell). Install the one file, the unit and the
API's ordering drop-in:

```sh
read -r -p 'Quaderno sandbox account label: ' QACCOUNT
( set -euo pipefail
  SRC="$CAPI/dialectical-engine/deploy/preview-auth-dev/v1"; EG=/opt/debateai-v3-preview/operator/egress-v1
  ss -ltnH 'sport = :3180' | grep -q . && { echo "port 3180 is taken: stop"; exit 1; }
  install -d -o root -g root -m 0755 "$EG"
  install -o root -g root -m 0644 "$SRC/egress-proxy.mjs" "$EG/egress-proxy.mjs" && cmp "$SRC/egress-proxy.mjs" "$EG/egress-proxy.mjs"
  printf '%s\n' "$QACCOUNT" | grep -qxE '[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?'
  sed "s/@QUADERNO_ACCOUNT@/$QACCOUNT/" "$SRC/debateai-preview-egress.service" > /etc/systemd/system/debateai-preview-egress.service
  chmod 0644 /etc/systemd/system/debateai-preview-egress.service
  grep -q -- "--quaderno-account $QACCOUNT\$" /etc/systemd/system/debateai-preview-egress.service
  install -d -o root -g root -m 0755 /etc/systemd/system/debateai-preview-api.service.d
  printf '[Unit]\nWants=debateai-preview-egress.service\nAfter=debateai-preview-egress.service\n' > /etc/systemd/system/debateai-preview-api.service.d/60-hosted-egress.conf
  systemctl daemon-reload
  systemctl enable --now debateai-preview-egress.service
  systemctl is-active debateai-preview-egress.service
  echo "egress proxy installed" )
ss -ltnH 'sport = :3180'   # one line: 127.0.0.1:3180
```

Prove it from inside the same Internet denial the API has, as the API's user (one call to NETOPIA's
sandbox address, which charges nothing, and one to a host the proxy must refuse):

```sh
systemd-run --pipe --wait --collect --uid="$AU" --gid="$AGRP" -p IPAddressDeny=any -p IPAddressAllow=localhost "$N" -e "require('http').setGlobalProxyFromEnv({HTTPS_PROXY:'http://127.0.0.1:3180',NO_PROXY:'localhost,127.0.0.1,[::1]'});fetch('https://secure-sandbox.netopia-payments.com/',{signal:AbortSignal.timeout(15000)}).then(r=>console.log('netopia answered',r.status),()=>console.log('netopia FAILED')).then(()=>fetch('https://example.com/',{signal:AbortSignal.timeout(15000)})).then(r=>console.log('example answered: WRONG',r.status),()=>console.log('example refused: right'))"
journalctl -u debateai-preview-egress.service -n 5 --no-pager
```

Expect `netopia answered` (any HTTP status) and `example refused: right`, and in the proxy's journal
one `OPENED` line for `secure-sandbox.netopia-payments.com` and one `HOST_REFUSED` line for
`example.com`. Any other result: stop.

If an update of `egress-proxy.mjs` comes with a release, install it the same way and
`systemctl restart debateai-preview-egress.service`. Known gap: every loopback process can reach the
proxy (the runner too); the host list confines it to NETOPIA's sandbox and the one Quaderno sandbox
account.

### H4. Caddy: NETOPIA's notify message past the basic-auth gate

NETOPIA posts each payment message to `https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notify`
(the website's `/api` proxy in front of the API's route). NETOPIA has no basic-auth password, so that
one POST must pass the gate; everything else stays behind it. In `/etc/caddy/Caddyfile` (keep a copy
first: H1 kept `$S/Caddyfile.before-hosted`), inside the preview's site block, add the named matcher and its `handle`, and move the site's
existing `basic_auth` and `reverse_proxy` blocks, unchanged, into a plain `handle` after it. The
notify `handle` proxies to the same upstream with the same `header_up` lines as the existing
`reverse_proxy` block, copied unchanged (a missing edge line makes the website refuse the hop):

```
	@netopia_notify {
		method POST
		path /api/v1/billing/netopia/notify
	}
	handle @netopia_notify {
		reverse_proxy <the existing upstream> {
			<the existing reverse_proxy block's header_up lines, unchanged>
		}
	}
	handle {
		<the existing basic_auth block, unchanged>
		<the existing reverse_proxy block, unchanged>
	}
```

The two `handle` blocks are mutually exclusive, so `basic_auth` never runs for that one POST and
always runs for everything else. A `basic_auth` left outside the second `handle` would still gate the
notify message. Then:

```sh
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy && echo "caddy reloaded"
for M in GET POST; do printf '%s / ' "$M"; curl -s -o /dev/null -w '%{http_code}\n' -X "$M" https://v3-preview.dezbatere.ro/; done
printf 'GET notify '; curl -s -o /dev/null -w '%{http_code}\n' https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notify
printf 'POST other '; curl -s -o /dev/null -w '%{http_code}\n' -X POST https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notifyx
printf 'POST notify '; curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' --data '{}' https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notify
```

The first four must print `401` (the gate). The last must NOT be `401`: `404` while the API is still
in local mode (the route is not served), `503` once it runs hosted with NETOPIA's settings (an
unsigned message: "try again", logged once as `billing.notice.unverified` with
`NOTICE_HEADER_MISSING`). To undo: put `$S/Caddyfile.before-hosted` back and reload.

### H5. The key files (the owner, by hand; never printed, never on a command line)

One folder, owned by the API's user, `0700`; each secret one line, `0600`, written as the API's user;
NETOPIA's public-key file owned by root, `0644` (the API refuses one its own user could change). The
helper below reads one line from its input and refuses a file that exists:

```sh
( set -euo pipefail; [ ! -e "$B" ]; install -d -o "$AU" -g "$AGRP" -m 0700 "$B"; echo "created $B" )
put_secret() { runuser -u "$AU" -- /bin/sh -c 'umask 077; f=$1; [ ! -e "$f" ] || { echo "$f exists: stop" >&2; exit 1; }; IFS= read -r v && [ -n "$v" ] && printf "%s\n" "$v" > "$f.new" && mv -n "$f.new" "$f" && echo "saved $f"' sh "$1"; }
read -rs -p 'NETOPIA sandbox API key (hidden): ' V && echo && printf '%s\n' "$V" | put_secret "$B/netopia-api-key"; unset V
read -rs -p 'Quaderno sandbox API key (hidden): ' V && echo && printf '%s\n' "$V" | put_secret "$B/quaderno-api-key"; unset V
printf '%s\n' 'sandbox@example.invalid:not-a-token' | put_secret "$B/smartbill-credentials"
read -r -p 'Owner-report address (an allow-listed one): ' V && printf '%s\n' "$V" | put_secret "$B/owner-report-email"; unset V
```

NETOPIA's public key: copy the PEM block from NETOPIA's sandbox admin into a root-only file first
(for example `/root/netopia-sandbox-public.pem`), or use the key NETOPIA publishes in its shop plugins,
which the kit carries as `deploy/vps/netopia/published-ipn-key.pem` (check its fingerprint with
NETOPIA first, `deploy/vps/README.md` §14.2). Then:

```sh
P=/root/netopia-sandbox-public.pem
( set -euo pipefail; [ ! -e "$B/netopia-ipn-keys.pem" ]; install -o root -g root -m 0644 "$P" "$B/netopia-ipn-keys.pem"; echo "saved the public key" )
stat -c '%a %U %n' "$B" "$B"/*
```

Expect `700 <API user>` for the folder, `600 <API user>` for the four secrets and `644 root` for the
public key. To replace a key later, remove that one file first, then write it again.

### H6. Hosted, billing off: the provider-only version

This is "Publishing a new register version on the preview" above, steps 1 to 6, with three changes.

**Step 1, the plan, carries the owner's inputs** (the values below are the suggested ones: use the
owner's). The kit rebuilds the answer checker and role rotation from the plan, never from the base: if
the live version runs the DeepSeek checker or rotation off, add the same `--checker deepseek
--deepseek-enabled-on-gate yes` or `--role-rotation off` here (and in H7), or the delta shows those rows
changing back. The call-concurrency row is carried from the base as always:

```sh
HB='{"billing":"off","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
rel native-plan --operation plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --hosted-billing "$HB" --out "$ART/native-plan-plan.json"
```

**Step 2, the owner's review.** Besides what the release itself changes, expect exactly:
- `storyCostEnvelopePolicy` added (the story's money row: $0.05 per story, 20% over at most);
- `costEnvelopePolicy` changed, reason `owner-hosted-billing-input`: the two ceilings become the
  owner's values and `provisional_reason` names them as the preview's sandbox ceilings (`provisional`
  stays `true`); every other member (the band 9500 / 11500 / 1 among them) stays;
- `admissionPolicy` changed, reason `owner-hosted-billing-input`: `ask_room_reads` added, nothing else;
- `nodeRuntimeVersion`: its source reference only.

The proposal's composer is `preview-register-composer-v3`. `publish` (step 3) copies the inputs from
the plan; it refuses `--hosted-billing` itself.

**Step 5 also switches the mode and adds the hosted settings.** In place of step 5's lines, with `V`
from step 3 (the POS signature is not a secret: NETOPIA prints it in its admin):

```sh
( set -euo pipefail
  [ -n "${V:-}" ]
  for F in "$E/api.env" "$E/runner.env"; do
    sed -i "s/^REGISTER_VERSION=.*/REGISTER_VERSION=$V/; s/^DEBATEAI_DEPLOYMENT_MODE=local\$/DEBATEAI_DEPLOYMENT_MODE=hosted/" "$F"
    [ "$(grep -c "^REGISTER_VERSION=$V\$" "$F")" = 1 ] && [ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$F")" = 1 ]
  done
  printf '%s\n' 'GEOIP_COUNTRY_DB_PATH=/var/lib/debateai-geoip/dbip-country-lite.mmdb' 'TOR_EXIT_LIST_PATH=/var/lib/debateai-geoip/tor-exit-list.txt' \
    'NETOPIA_API_BASE_URL=https://secure-sandbox.netopia-payments.com' "NETOPIA_API_KEY_PATH=$B/netopia-api-key" "NETOPIA_IPN_KEYS_PATH=$B/netopia-ipn-keys.pem" >> "$E/api.env"
  echo "api.env and runner.env: version $V, hosted" )
[ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$E/api.env")" = 1 ] && [ "$(grep -c '^NETOPIA_POS_SIGNATURE=' "$E/api.env")" = 0 ] && read -r -p 'NETOPIA sandbox POS signature: ' POS && [ -n "$POS" ] && printf 'NETOPIA_POS_SIGNATURE=%s\n' "$POS" >> "$E/api.env"; unset POS
grep -oE '^[A-Z_][A-Z0-9_]*=' "$E/api.env" | sort | uniq -d   # must print nothing
```

Then run the two SAME checks of `deploy/preview-auth-dev/v1/README.md` "Operator checks before the
first start" (the preview configuration and team; the mode and register version): both must print
`SAME`. The launchers refuse anything outside the rules (a live NETOPIA base, a key file elsewhere,
three of NETOPIA's four settings, the moved clock), with `PREVIEW_API_STARTUP_REFUSED` and nothing
more. The runner's prepare-only launcher checks runner.env without starting it:

```sh
runuser -u debateai-preview-runner -- "$N" "$CRUN/dialectical-engine/deploy/preview-auth-dev/v1/launch-runner.mjs" --plan "$ART/runner-launch.json"
```

One `preview-auth-dev-runner-prepared-v1` line means accepted. Then step 6 unchanged (pin all three,
restart the API, the website, then the runner when no debate is running).

**Check the hosted start, provider-only:**

```sh
journalctl -u debateai-preview-api -n 100 --no-pager | grep -o '"deploymentMode":"[a-z]*"' | tail -n 1   # "deploymentMode":"hosted"
journalctl -u debateai-preview-runner -n 100 --no-pager | grep -o '"deploymentMode":"[a-z]*"' | tail -n 1   # "deploymentMode":"hosted"
printf 'POST notify '; curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' --data '{}' https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notify   # 503
```

Then run the billing check as the API's user with the API's settings. It goes through the egress
proxy like the API (Node's proxy switch), except the notify probe, which goes to this site directly:

```sh
systemd-run --pipe --wait --collect --uid="$AU" --gid="$AGRP" --property=EnvironmentFile="$E/api.env" --setenv=NODE_USE_ENV_PROXY=1 --setenv=HTTPS_PROXY=http://127.0.0.1:3180 '--setenv=NO_PROXY=localhost,127.0.0.1,[::1],v3-preview.dezbatere.ro' --working-directory="$CAPI/dialectical-engine" "$N" --import tsx apps/api/src/billing/check-cli.ts
```

With billing off, the NETOPIA lines (settings, key files, the key accepted, the notify address) must
be ticks; the Quaderno, SmartBill and owner lines show their settings missing until step H7. Start a
short debate as usual: it must finish as it did in local mode.

### H7. Billing on

1. **The plan**, the same command with `"billing":"on"`. Every output of this second publication
   (plans, proposal, receipts, launch plans) goes into a new folder `$ART2`, because the tool never
   overwrites a file and the launch plans' names are fixed: in steps 1 to 6 read `$ART2` wherever an
   output is written or read, and keep `$ART` only for the source manifests and the UI build. Run the
   publish sequence's preamble again first (it archives the provider-only verify plan as
   `$S/native-plan.before.json`; H1's `native-plan.before-hosted.json` stays untouched).

   ```sh
   ART2="$ART-billing-on"; ( set -euo pipefail; [ ! -e "$ART2" ]; install -d -o root -g root -m 0755 "$ART2"; echo "created $ART2" )
   HB='{"billing":"on","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
   rel native-plan --operation plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --hosted-billing "$HB" --out "$ART2/native-plan-plan.json"
   ```

   The owner's review expects `billingPolicy` changed (reason
   `owner-hosted-billing-input`: `enabled` becomes `true` and `"US"` joins `withdrawal_countries`, on
   this sandbox host only) and `nodeRuntimeVersion`'s source reference; with the same ceilings, nothing
   else.

2. **Steps 3 and 4** unchanged. **Step 5:** `REGISTER_VERSION` in both files as step 5 says, and the
   rest of the billing settings in `api.env`:

   ```sh
   ( set -euo pipefail
     [ -n "${V:-}" ] && [ -n "${QACCOUNT:-}" ]
     [ "$(grep -cE '^(QUADERNO_|SMARTBILL_|OWNER_REPORT_EMAIL_PATH=)' "$E/api.env")" = 0 ]
     for F in "$E/api.env" "$E/runner.env"; do sed -i "s/^REGISTER_VERSION=.*/REGISTER_VERSION=$V/" "$F"; [ "$(grep -c "^REGISTER_VERSION=$V\$" "$F")" = 1 ]; done
     printf '%s\n' "QUADERNO_API_BASE_URL=https://$QACCOUNT.sandbox-quadernoapp.com/api" "QUADERNO_API_KEY_PATH=$B/quaderno-api-key" \
       'SMARTBILL_API_BASE_URL=https://smartbill.invalid' "SMARTBILL_CREDENTIALS_PATH=$B/smartbill-credentials" \
       'SMARTBILL_SERIES=DBAI' "OWNER_REPORT_EMAIL_PATH=$B/owner-report-email" >> "$E/api.env"
     echo "api.env and runner.env: version $V, billing settings added" )
   grep -oE '^[A-Z_][A-Z0-9_]*=' "$E/api.env" | sort | uniq -d   # must print nothing
   ```

3. **Step 6** unchanged. Two minutes after the API's start, read its billing journal (the kit's
   §14.9 "Before step 1", for this unit):

   ```sh
   journalctl --no-pager -u debateai-preview-api _SYSTEMD_INVOCATION_ID="$(systemctl show --property=InvocationID --value debateai-preview-api)" | grep -E 'credentials_refused|notice\.unverified|status_failed|BILLING_[A-Z_]+_PENDING'
   ```

   Only `billing.notice.unverified` lines with `NOTICE_HEADER_MISSING` (one per check run) are
   expected; any other line: look it up in `deploy/vps/README.md` §14.8's journal table.

4. **The billing check** again (the command of H6). Every line must be a tick except the plans line
   ("…placeholders…": this host keeps the engine's own price list), as on the hosted kit's sandbox
   server (`deploy/vps/README.md` §14.9).

### H8. The US test purchase

As in `deploy/vps/README.md` §14.9 step 1, without the clock move. On an account whose address is
allow-listed: open the pricing page, choose Plus, pick the United States as the country, answer the
"Do you live in …" question with yes, give a state, press **Continue to payment**, and on NETOPIA's
sandbox page pay with the test card 9900 0048 1022 5098 (any future expiry, CVV 111). Expect: back on
the site, the plan active within seconds; the confirmation (M1, with the Terms attached) and the
receipt (M2) at that allow-listed inbox; Settings shows the saved card; the invoice in Quaderno's
sandbox. Then, on a second allow-listed account (the first already has Plus), the 3-D Secure test card
9900 0091 8421 4768: write down how the bank's check looked. A Romanian buyer's purchase goes to the
dummy SmartBill and fails harmlessly: do not pay as one here. Renewals need the moved billing clock,
which stays refused.

### Rolling back to local mode on register 12

Restores the files kept in H1 and the release pinned before H6, then restarts. The hosted versions
stay sealed and unused; the billing rows written in the sandbox stay in the database (local mode reads
none of them).

```sh
A0=$(jq -r .services.api.basePlan.path "$S/release-lock.before-hosted.json"); U0=$(jq -r .services.ui.basePlan.path "$S/release-lock.before-hosted.json"); R0=$(jq -r .services.runner.basePlan.path "$S/release-lock.before-hosted.json"); echo "$A0 $U0 $R0"
PINNED=no
put "$S/native-plan.before-hosted.json" \
  && cp -a "$S/api.env.before-hosted" "$E/api.env" \
  && cp -a "$S/runner.env.before-hosted" "$E/runner.env" \
  && $N $L/prestart.mjs pin --from "$A0" \
  && $N $L/prestart.mjs pin --from "$U0" \
  && $N $L/prestart.mjs pin --from "$R0" \
  && $N $L/prestart.mjs dropin --service api > /etc/systemd/system/debateai-preview-api.service.d/zzzzzzzzzz-lifecycle-release.conf \
  && $N $L/prestart.mjs dropin --service ui > /etc/systemd/system/debateai-preview-ui.service.d/zzzzzzzzzz-lifecycle-release.conf \
  && $N $L/prestart.mjs dropin --service runner > /etc/systemd/system/debateai-preview-runner.service.d/zzzzzzzzzz-lifecycle-release.conf \
  && systemctl daemon-reload \
  && systemctl restart debateai-preview-api \
  && systemctl restart debateai-preview-ui \
  && PINNED=yes \
  && echo "rolled back: local mode, the pre-hosted release and register version"
```

If `R0` prints `null`, the lock had no runner before: leave the runner pin and drop-in lines out.
Then restart the runner exactly as step 6's runner lines say (only when `PINNED` is `yes` and no
debate is running), and check that `grep -c '^DEBATEAI_DEPLOYMENT_MODE=local$' "$E/api.env" "$E/runner.env"`
prints 1 for each file. The egress proxy and the Caddy exemption may stay (in local mode the API
makes no https call and answers the notify path `404`); to remove them: `systemctl disable --now
debateai-preview-egress.service`, delete `60-hosted-egress.conf`, put `$S/Caddyfile.before-hosted`
back and reload Caddy.

**After a rollback, later publications still use kit v3.** The newest sealed version is a hosted one,
and kit v2 refuses it as a base (billing on, or the story money row it does not build). Plan from the
kept verify plan that names it, with `--hosted-billing` (`"billing":"off"` to stay off); the release
tool refuses a plan from a hosted base without it (`HOSTED_BILLING_REQUIRED`).

**What only the server proves:** the API and the runner booting hosted on the new versions; the
egress proxy's real DNS and TLS path to NETOPIA's and Quaderno's sandboxes; the Caddy exemption; the
billing check's ticks; the provisioner fix; real mail delivery of a templated message through Postfix
to an allow-listed inbox; and the US purchase end to end. The unit tests
(`preview-register-publish-v3`, `preview-release-artifacts`, `preview-auth-dev-environment`,
`preview-egress-proxy`, `preview-auth-dev-mail`) and the PostgreSQL 18 integration test
(`tests/integration/preview-register-publish-v3.test.ts`: provider-only then billing on, each version
passing the hosted API's boot-readiness check) are source evidence only.
