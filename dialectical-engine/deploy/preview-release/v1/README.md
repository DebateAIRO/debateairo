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
the model list, `NODE_ENV=production`) and the release key it is built for. They are the same
values the reviewed start-up check demands from `ui.env`, so the build and the running site cannot
disagree. `build-env` prints them with their sha256 so you can compare `ui.env` by hash, without
printing it.

The release key (`--release-key`, required on `build-env` and `ui-build`) is
`r<site version>-<first 12 hex of the release's git revision>`, for example `r17-d50e33165a1b`
(side-by-side spec §1). The website keeps the 12 hex from its build and refuses to serve under
another release's key, so `ui-build` refuses (`RELEASE_KEY_REFUSED`) a key whose 12 hex are not
the UI source manifest's revision. Each release's `ui-<label>.env` names the same key, and the
UI start-up check refuses any key but its launch plan's.

The model list is one of three reviewed lists, picked by name with `--models` (on `build-env` and
`ui-build`): `glm-only` (the default: GLM only), `multi-model` (Free: GLM and DeepSeek; Premium: GLM,
DeepSeek, MiMo and Qwen) or `all-models` (Free and Premium: GLM, DeepSeek, MiMo, Qwen and Haiku; the list
the preview runs, R18 and R19 were built with it). The list is baked into
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
| `build-env --release-key <key> [--models glm-only\|multi-model\|all-models]` | prints the fixed public UI build values (for that model list, default `glm-only`, and that release key) and their sha256; reads no file |
| `ui-build --source <ui source manifest> --release-key <key> [--models glm-only\|multi-model\|all-models] --out <file>` | refuses a key of another revision (`RELEASE_KEY_REFUSED`), checks the UI root against its manifest, builds with the fixed values, that model list (default `glm-only`) and that release key, records the list in the build, re-checks that the build changed no inventoried source byte, checks the build, writes the build manifest |
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

**On the hosted preview (since 19 October 2026)** a whole release follows "A normal release on a hosted base" at the
end of this guide. It runs steps 2 to 5 below as they are, and replaces steps 6 and 7 and the publish sequence with
its hosted form.

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
contract generated in each. The tool starts after that. When `pnpm-lock.yaml` changed since the live release, the
offline install first needs a store copy holding the new packages ("A normal release on a hosted base", A3).

**2. Source manifests** for all six folders (about 2 minutes each):

```sh
for KIND in candidate fallback; do for ROLE in api ui runner; do
  rel source-manifest --repository "$ART/source-reference" --root "$R/auth-dev-$KIND-$LABEL-$ROLE" --role "$ROLE" --out "$ART/$KIND-$ROLE-source.json" || break 2
done; done
```

Expect six lines `{"path":…,"sha256":…,"bytes":…}`.

**3. Check the public build values against `ui.env`, by hash only.** First the tool's values,
then the same keys from `ui.env` (this prints hashes, never the file):

Give `build-env` the same `--models` you will give `ui-build` in step 4 (none means `glm-only`). The preview's
`ui.env` names `all-models`.

`$KEY` is this release's key: `r<register version this release runs with>-<first 12 hex of its source revision>`
(set `REGV` to that register version; the source revision is read from the UI source manifest of step 2). Give the
same `--release-key "$KEY"` to `build-env` here and to both `ui-build`s in step 4.

```sh
REGV=17   # change: the register version this release runs with
KEY="r$REGV-$(jq -r .sourceRevision "$ART/candidate-ui-source.json" | cut -c1-12)"
rel build-env --release-key "$KEY"
for K in NODE_ENV PUBLIC_APP_URL NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON TURNSTILE_SITE_KEY; do printf '%s ' "$K"; sed -n "s/^$K=//p" /etc/debateai-v3-preview/auth-dev-v1/ui.env | tr -d '\n' | sha256sum | cut -d' ' -f1; done
```

Each hash must equal the `sha256` that `build-env` printed for that key. A hash starting
`e3b0c442` means the key is missing from `ui.env`: stop and ask. `RELEASE_KEY` is not in this loop: the shared
`ui.env` holds the live release's key, not the new one. Check instead that `build-env` printed `$KEY` as
`RELEASE_KEY`'s `value`; the release's own `ui-<label>.env` gets the same key when it is derived
(`release-env.mjs derive … --release-key "$KEY"`).

**4. Build the website** in the candidate and the fallback UI folders (about 10 minutes each).
The build log goes to a file; the last line is the result:

```sh
for KIND in candidate fallback; do
  rel ui-build --source "$ART/$KIND-ui-source.json" --release-key "$KEY" --out "$ART/$KIND-ui-build.json" > "$ART/$KIND-ui-build.log" 2>&1; echo "$KIND exit $?"; tail -n 1 "$ART/$KIND-ui-build.log"
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
On the preview these seals arrived with R19 (register 17, 21 October 2026). Rolling the CODE back to R18 (the release
before them) needs the version published before them (on the preview: 16) in both `api.env` and `runner.env`: an R18
runner refuses a version with the new seals (`REGISTER_PROMPT_CONTRACT_HASH_MISMATCH`, the other way). On the preview
a re-pin is not enough. R19 also applied migrations 0121 and 0122, and R18 refuses that database: its native verify
knows only its own migration list. The way back is the cold copy taken just before them ("A normal release on a hosted
base", rbB), and it brings back register 16 with it. Never roll the code back while a debate admitted with the length
row runs: the older code refuses a receipt that carries `length`.

**R2a moves the engine seal.** A register version for this code carries `engineContractHash` `bb9e93c372bad372468b03f60eceebf92047889e247b8ccacfb8c949b9da9e7a` (was
`b98a45d5933d82205d5c6514082d4151bfb8f3f45b3677f6319794ae2a885e24`, R1d's seal over no contract). Nothing reads it
without an `engineVersionPolicy` row, so the runner boots either way.

**R2b moves the engine seal again.** A register version for this code carries `engineContractHash` `8298e1b36638369d2e1bd58111eec69d1c997f9475965ed183c8750491053473` (was `bb9e93c372bad372468b03f60eceebf92047889e247b8ccacfb8c949b9da9e7a`
after R2a, or `b98a45d5933d82205d5c6514082d4151bfb8f3f45b3677f6319794ae2a885e24` from a release before R2a): R2b appends the
comparing judges' prompt contract. Nothing reads it without an `engineVersionPolicy` row, so the runner boots either way.

**R3 moves the engine seal again.** A register version for this code carries `engineContractHash` `ba2f15d5d89b2f7b4c3168e2f7908f5d3130aa55fc4929ad0825b15028500a4d` (was `8298e1b36638369d2e1bd58111eec69d1c997f9475965ed183c8750491053473` after R2b): R3 appends the map's eight engine-2 contracts and the fixed-words position contracts. Nothing reads it without an `engineVersionPolicy` row, so the runner boots either way. A practice register saved with an engine row before this seal must be rebuilt: the runner refuses a stale seal at boot. Rebuild it by running the practice with `--register-next` (tools/preview-practice/README.md, "Optional flags"), which composes this code's next version, with this code's own seal, in the throwaway database.

There is no `debateShapePolicy` row: leave out `--debate-shape`, so the shape stays off. Any other added or
changed row: stop and ask.

**The order.** It was written for the local-mode preview. On the hosted preview (since 19 October 2026) follow "A
normal release on a hosted base" at the end of this guide instead. It is the same order, with three changes:
- the plan and the practice carry `--hosted-billing "$HB_ON" --checker deepseek --deepseek-enabled-on-gate yes`
  (step 3's plan without `--hosted-billing` is refused there: `HOSTED_BILLING_REQUIRED`);
- a cold copy of the database comes before the migrations;
- the runner is started by hand.

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

Rollback: before step 2's migrations nothing has changed, and the old release starts again as it was. Once they are
applied, the old code refuses the database, so the only way back is the cold copy taken just before them (R17's way;
on the hosted preview, rbB in "A normal release on a hosted base"). A version published after them goes with it.
Switching the shape on later is a separate publication (`--debate-shape`), after these steps.

## Publishing a new register version on the preview (publish kit v2)

**When.** Whenever the release's code builds a register different from the version the preview runs:
a changed value (e.g. dev b75e4c294: `composerContractHash` moved to the answer-writer prompt v2, and
`countryPolicy` closed Tennessee) or a new key (e.g. `outboundMailPolicy`, which must also be added
to `PREVIEW_SOURCE_ROW_KEYS_V2` in `deploy/preview-auth-dev/v1/publish-register-v2.ts`).

**What changed from v1.** The v1 composer (`publish-register.ts`, kept unchanged) could make only one
publication: 66 source rows on a 65-row base, adding three fixed keys. It refuses the live 68-row
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

`nat` prints `exit N` and itself always returns 0. So an `&&` after it never stops on a refusal: read the
printed line. In a script, test it: `OUT=$(nat …); [ "$OUT" = "exit 0" ] || { …; exit 1; }`.

1. **Plan** (read-only; the services can stay up). The base is the live publication:

   ```sh
   rel native-plan --operation plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-plan.json"
   put "$ART/native-plan-plan.json" && nat "$ART/register-proposal.json"
   put "$S/native-plan.before.json"   # at once: a restart's prestart accepts only a verify plan
   jq '{baseRegisterVersion,addedKeys,changedKeys,deltaSha256}' "$ART/register-proposal.json"
   ```

   **On the hosted preview** (since 19 October 2026) that `plan` line is refused (`HOSTED_BILLING_REQUIRED`). The
   plan must carry the owner's hosted inputs with billing on and the live checker. H6's billing-off JSON would switch
   billing off:

   ```sh
   HB_ON='{"billing":"on","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
   rel native-plan --operation plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --checker deepseek --deepseek-enabled-on-gate yes --hosted-billing "$HB_ON" --out "$ART/native-plan-plan.json"
   ```

   `publish`, `verify` and `apply-and-plan` carry the hosted inputs over from their `--from`, and refuse
   `--hosted-billing`. A whole release on the hosted preview is in "A normal release on a hosted base".

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
   more than 30 minutes, stop and ask. The runner is never restarted automatically.

   The release runbook's downtime, which step 3 follows, stops the runner too, so here it is usually not running. A runner from
   before #177 even shows `failed` after that planned stop. These lines therefore restart a running runner, and
   start a stopped (`inactive` or `failed`) one. They used `try-restart` until 21 October 2026, and that left a
   stopped runner down. If the runner was stopped on purpose before this release, for another reason, do not
   paste them: its next start by hand uses the new version.

   ```sh
   ( set -euo pipefail
     [ "${PINNED:-}" = yes ] || { echo "RUNNER_NOT_DONE: the pin block above did not finish (PINNED is not yes)"; exit 1; }
     RUNNING=$(runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc "SELECT count(*) FROM core.work_item WHERE state = 'CLAIMED'"); echo "debates running now: $RUNNING"
     [ "$RUNNING" = 0 ] || { echo "RUNNER_NOT_DONE: a debate is running; wait and paste these lines again"; exit 1; }
     RS=$(systemctl is-active debateai-preview-runner || true); echo "runner before: $RS"
     case "$RS" in
       active) systemctl restart debateai-preview-runner ;;
       inactive|failed) systemctl start debateai-preview-runner ;;
       *) echo "RUNNER_NOT_DONE: the runner is $RS: look first"; exit 1 ;;
     esac
     sleep 20
     [ "$(systemctl is-active debateai-preview-runner || true)" = active ] || { echo "RUNNER_NOT_DONE: the runner is not active after its start: read its journal"; exit 1; }
     echo "runner started on the new version" )
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

**Rolling back.** This holds only for a release that applied no migration. Once a release's
`apply-and-plan` ran, the old code refuses the database, and the way back is the cold copy taken
before it ("A normal release on a hosted base", rbB). Without a migration: re-install the archived
`$S/native-plan.before.json`, set `REGISTER_VERSION` back to the old version, and re-pin the old
launch plans (re-pinning rewrites `pinnedAt`, so compare the lock with its copy without those
times). On the hosted base use rbB instead: after this lighter way back a published version sits above the live
one, so the next release's A0 refuses until the owner decides how to go on. The new version stays sealed, unused. Later
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

**Done once, on 19 October 2026.** The preview was switched on release R18 (`438b4fd91`, no new code):
register 15 is hosted with billing off, and register 16 has billing on. That first run corrected the
steps below where the server differed from what they said:
- the real Caddy file and how it is reloaded (H1, H4, rollback);
- Postfix's size limit (H1);
- a folder for this switch's outputs, when the release's own folder is already full (H1);
- a runner that reports `failed` after a planned stop (H6, rollback);
- the runner's prepare-only check, which cannot pass at that point (H6);
- one guard that did not stop its block (H6);
- the database login of H0.

A later switch can follow the steps as they now stand. A release after the switch follows "A normal release on a
hosted base" at the end of this guide.

What the repository adds for it (each in `deploy/preview-auth-dev/v1/README.md`):
- publish kit v3 (`publish-register-v3.ts`), chosen by `native-plan --hosted-billing '<JSON>'`;
- the environment rules for hosted mode (`environment.mjs`): sandbox-only billing values at fixed
  paths, the moved billing clock refused, the optional billing notice spool at one fixed folder (H9);
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

| Input | Where it goes | The preview's value (the owner, 14 October 2026) |
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
  `debateai_billing_runtime` (migration 0093); measured missing on 2026-10-13. The production principal
  provisioner (`pnpm db:provision-principals`) cannot run on the preview as it is built. It needs a
  `debateai_prod_migrator` session with a bounded password and 19 database addresses in TLS form,
  while the preview reaches the database as the `postgres` peer only. It would also rotate every
  managed password. What was done instead, on 2026-10-14 with the owner's yes, is one grant as
  `postgres`, which changes no password:

  ```sh
  runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc "GRANT debateai_billing_runtime TO debateai_prod_api_runtime WITH ADMIN FALSE, INHERIT TRUE, SET TRUE"
  ```

  Then this prints `t` (it did on 2026-10-14 and 2026-10-19):

  ```sh
  runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc "SELECT pg_has_role('debateai_prod_api_runtime','debateai_billing_runtime','MEMBER')"
  ```

- **The billing tables** exist (migrations up to 0114, measured 2026-10-13). A release that adds a
  migration still needs its `apply-and-plan` first, as always.

### H1. Names and copies, in the release's root shell

H0 must be finished first, and the copies below must hold the current passwords (after any later
rotation, take them again). Use the root shell of step 0 (`LABEL`, `ART`, `CAPI`, `CUI`, `CRUN`, `rel`)
and the publish sequence's names (`NP`, `nat`, `put`).

The switch needs no new release. On 19 October 2026 it ran on the release the preview already ran
(R18): set `LABEL` to the running release's label (the lock's `api` plan path names it). Then give this
switch its own root-only archive folder `S`, so no older release's `native-plan.before.json` is
overwritten. H6's outputs go into their own folder `ART1`, as H7's go into `ART2`. A release that is
already running has its own `native-plan-plan.json`, `register-proposal.json` and `*-launch.json` in
`$ART`. The tool never overwrites a file, and the launch plans' names are fixed. `$ART` itself is kept
only for the source manifests and the UI build.

```sh
jq -r .services.api.basePlan.path /etc/debateai-v3-preview/lifecycle/release-lock.json   # names the running release's $ART
S=/root/preview-archive/hosted-$(date -u +%Y%m%dT%H%M%SZ); ( set -euo pipefail; [ ! -e "$S" ]; install -d -o root -g root -m 0700 "$S"; echo "archive $S" )
ART1="$ART-hosted-off"; ( set -euo pipefail; [ ! -e "$ART1" ]; install -d -o root -g root -m 0755 "$ART1"; echo "created $ART1" )
```

Then:

```sh
E=/etc/debateai-v3-preview/auth-dev-v1
B=/etc/debateai-v3-preview/billing
N=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
AU=$(systemctl show -p User --value debateai-preview-api); AGRP=$(id -gn "$AU"); echo "the API runs as: $AU ($AGRP)"
```

`$AU` must be a named account, never empty and never `root`: stop otherwise.

**The preview's Caddy file is not `/etc/caddy/Caddyfile`.** That file is Caddy's unused stock example.
The unit's drop-in `/etc/systemd/system/caddy.service.d/20-protected-preview.conf` starts Caddy with
`/etc/debateai-v3-preview/public/Caddyfile` and reads `/etc/debateai-v3-preview/public/caddy.env` (the
basic-auth user and its bcrypt hash). Its global block says `admin off` and the drop-in empties
`ExecReload`, so Caddy cannot be reloaded, only restarted. Check this before H4:

```sh
systemctl cat caddy | grep -E '^(ExecStart|ExecReload|EnvironmentFile)='   # names /etc/debateai-v3-preview/public/Caddyfile and an empty ExecReload=
C=/etc/debateai-v3-preview/public/Caddyfile
```

Keep the state the rollback returns to (every file must be new, so a second run never overwrites one):

```sh
( set -euo pipefail
  for F in native-plan.before-hosted.json api.env.before-hosted runner.env.before-hosted release-lock.before-hosted.json Caddyfile.before-hosted postfix-main.cf.before-hosted; do [ ! -e "$S/$F" ]; done
  cp -a "$NP" "$S/native-plan.before-hosted.json"
  cp -a "$E/api.env" "$S/api.env.before-hosted"
  cp -a "$E/runner.env" "$S/runner.env.before-hosted"
  cp -a /etc/debateai-v3-preview/lifecycle/release-lock.json "$S/release-lock.before-hosted.json"
  cp -a "$C" "$S/Caddyfile.before-hosted"
  cp -a /etc/postfix/main.cf "$S/postfix-main.cf.before-hosted"
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

The first must be 0: team funding is not built on the preview. (Since side-by-side §9 an API whose
staff settings differ from the database's funding selection still starts, with one
`api.funding.selection_differs` line in its journal.) The last line must show the API's Internet denial with loopback allowed (`IPAddressDeny`
`0.0.0.0/0 ::/0`, `IPAddressAllow` loopback), `AF_INET` among the families, and no
`InaccessiblePaths` entry covering `/var/lib/debateai-geoip` or `/etc/debateai-v3-preview/billing`.
The Postfix limit matters because a billing email may carry the Terms PDF: the hand-off admits up to
12 MiB, and Postfix's default (10240000 bytes) would bounce a message near the API's 8 MiB attachment
limit. The preview had that default on 19 October 2026. Raise it (a reload, no downtime; the copy of
`main.cf` above is the way back):

```sh
( set -euo pipefail
  CUR=$(postconf -h message_size_limit)
  if [ "$CUR" != 0 ] && [ "$CUR" -lt 12582912 ]; then postconf -e message_size_limit=12582912; systemctl reload postfix; fi
  NOW=$(postconf -h message_size_limit); [ "$NOW" = 0 ] || [ "$NOW" -ge 12582912 ]
  echo "postfix limit: $NOW" )
```

Anything else: stop and ask.

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
one POST must pass the gate; everything else stays behind it.

The preview's site block in `$C` (H1) is one `route` block, and Caddy runs its lines in order:
1. the wrong-host refusal;
2. the origin check;
3. `basic_auth`;
4. the headers;
5. the body limit;
6. `reverse_proxy`.

Add the notify matcher and its `handle` right after the line `respond @wrongHost "NOT_FOUND" 404`,
before the origin check and `basic_auth`. Its `reverse_proxy` is a copy of the site's own block, with
the same upstream and `header_up` lines (a missing edge line makes the website refuse the hop), plus the
site's 1 MB body limit. This is what was added on 19 October 2026:

```caddyfile
        @netopia_notify {
            method POST
            path /api/v1/billing/netopia/notify
        }
        handle @netopia_notify {
            request_body {
                max_size 1MB
            }
            reverse_proxy 127.0.0.1:3100 {
                header_up Host v3-preview.dezbatere.ro
                header_up X-Forwarded-For {remote_host}
                header_up X-Forwarded-Proto https
                header_up X-Debateai-Edge-Secret {file./etc/debateai-v3-preview/ui-edge.caddy.secret}
                header_up -Authorization
            }
        }
```

`reverse_proxy` ends the request, so nothing after this `handle` runs for that one POST. Every other
request goes on to the origin check and `basic_auth` exactly as before. The block sits before the
origin check, which guards browsers. A message from server to server normally carries no `Origin`
header, but if NETOPIA's ever does, payments must not start being refused. The message itself is
checked by the API (NETOPIA's signature), not by the gate.

Make the new file as a copy with the block inserted. The inserter refuses a file without that anchor
line, or one that already has the block. It prints only the added lines:

```sh
( set -euo pipefail; [ ! -e "$S/Caddyfile.hosted" ]
/usr/bin/python3 -I - "$C" "$S/Caddyfile.hosted" <<'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8").read()
anchor = '        respond @wrongHost "NOT_FOUND" 404\n'
if text.count(anchor) != 1 or '@netopia_notify' in text:
    sys.exit("anchor not found exactly once, or already edited: stop")
block = """        @netopia_notify {
            method POST
            path /api/v1/billing/netopia/notify
        }
        handle @netopia_notify {
            request_body {
                max_size 1MB
            }
            reverse_proxy 127.0.0.1:3100 {
                header_up Host v3-preview.dezbatere.ro
                header_up X-Forwarded-For {remote_host}
                header_up X-Forwarded-Proto https
                header_up X-Debateai-Edge-Secret {file./etc/debateai-v3-preview/ui-edge.caddy.secret}
                header_up -Authorization
            }
        }
"""
open(dst, "w", encoding="utf-8").write(text.replace(anchor, anchor + block))
PY
chmod 0644 "$S/Caddyfile.hosted"
diff "$C" "$S/Caddyfile.hosted" | grep '^[<>]' || true )
grep -A 6 '^        reverse_proxy' "$C"   # the live block: its upstream and header_up lines must equal the inserted ones
```

Expect 16 lines starting with `>` and none with `<`. If the live `reverse_proxy` block differs from
the inserted one, stop and edit the copy by hand so the two match.

Check the copy before it goes live. `caddy.env` holds a bcrypt hash (`$2a$…`), so load it the way
systemd does, with `systemd-run`. Never load it with the shell's `.`: the shell would read `$2` as a
variable and break the hash.

```sh
cad() { systemd-run --quiet --pipe --wait --collect -p EnvironmentFile=/etc/debateai-v3-preview/public/caddy.env /usr/bin/caddy "$@"; }
cad validate --config "$S/Caddyfile.hosted" --adapter caddyfile >/dev/null 2>&1 && echo "caddy validate: ok"
cad adapt --config "$S/Caddyfile.hosted" --adapter caddyfile 2>/dev/null | jq -r '[.apps.http.servers[].routes[] | select(.match[0].host[0]=="v3-preview.dezbatere.ro") | .handle[] | .. | objects | select(has("handler")) | .handler] | join(" > ")'
```

The second line prints the handlers' order (names only, no hash). On 19 October 2026 it printed
`subroute > subroute > static_response > subroute > request_body > reverse_proxy > static_response >
authentication > ...`: the notify's `request_body > reverse_proxy` come before `authentication`, the
password gate.

Put it in place. Caddy runs with `admin off`, so it is restarted, not reloaded, which takes about a
second:

```sh
( set -euo pipefail; install -o root -g root -m 0644 "$S/Caddyfile.hosted" "$C.new"; mv "$C.new" "$C"; cmp "$S/Caddyfile.hosted" "$C"; systemctl restart caddy; sleep 3; systemctl is-active caddy )
for M in GET POST; do printf '%s / ' "$M"; curl -s -o /dev/null -w '%{http_code}\n' -X "$M" https://v3-preview.dezbatere.ro/; done
printf 'GET notify '; curl -s -o /dev/null -w '%{http_code}\n' https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notify
printf 'POST other '; curl -s -o /dev/null -w '%{http_code}\n' -X POST https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notifyx
printf 'POST notify '; curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' --data '{}' https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notify
```

The first four must print `401` (the gate). The last must NOT be `401`:
- `404` while the API is still in local mode (the route is not served; measured on 19 October 2026);
- `503` once it runs hosted with NETOPIA's settings. That is an unsigned message ("try again"), logged
  once as `billing.notice.unverified` with `NOTICE_HEADER_MISSING`.

Anything else: undo. The undo puts `$S/Caddyfile.before-hosted` back with the same `install`/`mv`
line, then runs `systemctl restart caddy`.

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

This is "Publishing a new register version on the preview" above, steps 1 to 6, with the changes
below. Every file this publication writes goes into `$ART1` (H1), not `$ART`. In steps 1 to 6, read
`$ART1` wherever an output is written or read: the plan, the proposal, the publish and verify plans,
the proofs and the three launch plans. Keep `$ART` for the source manifests and the UI build.

**Step 1, the plan, carries the owner's inputs** (the preview's values below). The kit rebuilds the
answer checker and role rotation from the plan, never from the base. So if the live version runs the
DeepSeek checker or rotation off, add the same `--checker deepseek --deepseek-enabled-on-gate yes` or
`--role-rotation off` here (and in H7). Otherwise the delta shows those rows changing back. The last
release's own plan line shows which: on 19 October 2026 the preview ran the DeepSeek checker (R17's and
R18's plans), so both hosted plans carried it. The call-concurrency row is carried from the base as
always:

```sh
HB='{"billing":"off","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
rel native-plan --operation plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --checker deepseek --deepseek-enabled-on-gate yes --hosted-billing "$HB" --out "$ART1/native-plan-plan.json"
```

**Step 2, the owner's review.** Besides what the release itself changes, expect exactly:
- `storyCostEnvelopePolicy` added (the story's money row: $0.05 per story, 20% over at most);
- `costEnvelopePolicy` changed, reason `owner-hosted-billing-input`: the two ceilings become the
  owner's values and `provisional_reason` names them as the preview's sandbox ceilings (`provisional`
  stays `true`); every other member (the band 9500 / 11500 / 1 among them) stays;
- `admissionPolicy` changed, reason `owner-hosted-billing-input`: `ask_room_reads` added, nothing else;
- `nodeRuntimeVersion`: its source reference only.

The proposal's composer is `preview-register-composer-v3`. `publish` (step 3) copies the inputs from
the plan; it refuses `--hosted-billing` itself. On 19 October 2026, on base 14, the delta held exactly
these four rows (`deltaSha256` `91b9bf14…a397`), and version 15 was published.

**Step 3, the downtime: a runner from before #177 reports `failed` when stopped.** The release
runbook's downtime also stops the runner. A runner built before #177 (R18 and older) exits 1 on that
planned stop, so `systemctl is-active debateai-preview-runner` prints `failed`, not `inactive`. The
owner then gets a "debateai-preview-runner failed" email from the alert unit. Both are harmless. Accept
`inactive` or `failed` as "stopped". Step 6's runner lines start a runner that is `inactive` or
`failed`, once `PINNED` is `yes` and no debate runs. (Until 21 October 2026 they used `try-restart`,
which restarts only a running unit, so a runner left `failed` stayed down.)

**Step 5 also switches the mode and adds the hosted settings.** In place of step 5's lines, with `V`
from step 3 (the POS signature is not a secret: NETOPIA prints it in its admin):

```sh
( set -euo pipefail
  [ -n "${V:-}" ]
  for F in "$E/api.env" "$E/runner.env"; do
    sed -i "s/^REGISTER_VERSION=.*/REGISTER_VERSION=$V/; s/^DEBATEAI_DEPLOYMENT_MODE=local\$/DEBATEAI_DEPLOYMENT_MODE=hosted/" "$F"
    [ "$(grep -c "^REGISTER_VERSION=$V\$" "$F")" = 1 ] && [ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$F")" = 1 ] || exit 1
  done
  printf '%s\n' 'GEOIP_COUNTRY_DB_PATH=/var/lib/debateai-geoip/dbip-country-lite.mmdb' 'TOR_EXIT_LIST_PATH=/var/lib/debateai-geoip/tor-exit-list.txt' \
    'NETOPIA_API_BASE_URL=https://secure-sandbox.netopia-payments.com' "NETOPIA_API_KEY_PATH=$B/netopia-api-key" "NETOPIA_IPN_KEYS_PATH=$B/netopia-ipn-keys.pem" >> "$E/api.env"
  echo "api.env and runner.env: version $V, hosted" )
[ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$E/api.env")" = 1 ] && [ "$(grep -c '^NETOPIA_POS_SIGNATURE=' "$E/api.env")" = 0 ] && read -r -p 'NETOPIA sandbox POS signature: ' POS && [ -n "$POS" ] && printf 'NETOPIA_POS_SIGNATURE=%s\n' "$POS" >> "$E/api.env"; unset POS
grep -oE '^[A-Z_][A-Z0-9_]*=' "$E/api.env" | sort | uniq -d   # must print nothing
```

The `|| exit 1` matters. Under `set -e`, a failed test in the middle of an `a && b` list does not
stop the block, so without it the block would print its last line even when an env file was not
switched.

Then run the two SAME checks of `deploy/preview-auth-dev/v1/README.md` "Operator checks before the
first start" (the preview configuration and team; the mode and register version): both must print
`SAME`. The launchers refuse anything outside the rules, with `PREVIEW_API_STARTUP_REFUSED` and nothing
more: a live NETOPIA base, a key file elsewhere, three of NETOPIA's four settings, or the moved clock.

**Do not run the runner's prepare-only launcher here** (`launch-runner.mjs --plan`, no `--start`). It
refuses a database proof (native attestation) older than 180 seconds (`native-attestation.mjs`). The
launch plans carry the proof made in step 4, and building them takes longer than that, so the check
always prints `PREVIEW_RUNNER_PREPARATION_REFUSED` at this point. The running release's own plan
refuses too, for the same reason (measured 19 October 2026). The real start makes a fresh proof first
(prestart) and checks `runner.env` there, refusing a wrong one with `PREVIEW_RUNNER_STARTUP_REFUSED`.

Then step 6 (pin all three, restart the API and the website, then the runner when no debate is
running, as step 3's note says).

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

With billing off, the NETOPIA lines must be ticks: the settings, the key files, the key accepted and
the notify address. Until step H7, six lines show a cross; on 19 October 2026 the check ended with
"6 of 16 checks need attention":
- the Quaderno, SmartBill and owner lines, whose settings are missing;
- `BILLING_STAGE_LIVE_INVOICER_REFUSED` (it compares NETOPIA's sandbox with the Quaderno and SmartBill
  settings that H7 adds);
- the plans line (EUR and RON prices are placeholders on this host).

Start a short debate as usual: it must finish as it did in local mode.

### H7. Billing on

1. **The plan**, the same command with `"billing":"on"`. Every output of this second publication
   (plans, proposal, receipts, launch plans) goes into a new folder `$ART2`, because the tool never
   overwrites a file and the launch plans' names are fixed: in steps 1 to 6 read `$ART2` wherever an
   output is written or read, and keep `$ART` only for the source manifests and the UI build. Run the
   publish sequence's preamble again first (it archives the provider-only verify plan as
   `$S/native-plan.before.json`; H1's `native-plan.before-hosted.json` stays untouched). Keep this
   step's own way back too: the env files and the lock as they are with billing off. Give the plan
   H6's checker and rotation flags (`--checker deepseek --deepseek-enabled-on-gate yes` on 19 October
   2026).

   ```sh
   ART2="$ART-billing-on"; ( set -euo pipefail; [ ! -e "$ART2" ]; install -d -o root -g root -m 0755 "$ART2"; echo "created $ART2" )
   ( set -euo pipefail; for F in api.env.before-billing-on runner.env.before-billing-on release-lock.before-billing-on.json; do [ ! -e "$S/$F" ]; done
     cp -a "$E/api.env" "$S/api.env.before-billing-on"; cp -a "$E/runner.env" "$S/runner.env.before-billing-on"; cp -a /etc/debateai-v3-preview/lifecycle/release-lock.json "$S/release-lock.before-billing-on.json"; echo "billing-off state kept" )
   HB='{"billing":"on","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
   rel native-plan --operation plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --checker deepseek --deepseek-enabled-on-gate yes --hosted-billing "$HB" --out "$ART2/native-plan-plan.json"
   ```

   The owner's review expects `billingPolicy` changed (reason
   `owner-hosted-billing-input`: `enabled` becomes `true` and `"US"` joins `withdrawal_countries`, on
   this sandbox host only) and `nodeRuntimeVersion`'s source reference; with the same ceilings, nothing
   else. That is what the delta held on 19 October 2026 (`deltaSha256` `20967aed…c61c`), and version 16
   was published.

2. **Steps 3 and 4** unchanged. **Step 5:** `REGISTER_VERSION` in both files as step 5 says, and the
   rest of the billing settings in `api.env`:

   ```sh
   ( set -euo pipefail
     [ -n "${V:-}" ] && [ -n "${QACCOUNT:-}" ] || exit 1
     [ "$(grep -cE '^(QUADERNO_|SMARTBILL_|OWNER_REPORT_EMAIL_PATH=)' "$E/api.env" || true)" = 0 ]
     for F in "$E/api.env" "$E/runner.env"; do sed -i "s/^REGISTER_VERSION=.*/REGISTER_VERSION=$V/" "$F"; [ "$(grep -c "^REGISTER_VERSION=$V\$" "$F")" = 1 ]; done
     printf '%s\n' "QUADERNO_API_BASE_URL=https://$QACCOUNT.sandbox-quadernoapp.com/api" "QUADERNO_API_KEY_PATH=$B/quaderno-api-key" \
       'SMARTBILL_API_BASE_URL=https://smartbill.invalid' "SMARTBILL_CREDENTIALS_PATH=$B/smartbill-credentials" \
       'SMARTBILL_SERIES=DBAI' "OWNER_REPORT_EMAIL_PATH=$B/owner-report-email" >> "$E/api.env"
     echo "api.env and runner.env: version $V, billing settings added" )
   grep -oE '^[A-Z_][A-Z0-9_]*=' "$E/api.env" | sort | uniq -d   # must print nothing
   ```

   Without the `|| exit 1` on the first line, an empty `V` would not stop the block (the failed test
   sits in the middle of an `&&` list), and `sed` would write an empty `REGISTER_VERSION=`. A
   `QUADERNO_`/`SMARTBILL_` count of 0 makes `grep -c` exit 1, hence the `|| true` inside that test.
   `QACCOUNT` is H3's: set it again if this is a new shell.

3. **Step 6**, with H6's note on a runner that reports `failed` when stopped. Two minutes after the
   API's start, read its billing journal (the kit's §14.9 "Before step 1", for this unit):

   ```sh
   journalctl --no-pager -u debateai-preview-api _SYSTEMD_INVOCATION_ID="$(systemctl show --property=InvocationID --value debateai-preview-api)" | grep -E 'credentials_refused|notice\.unverified|status_failed|BILLING_[A-Z_]+_PENDING'
   ```

   Only `billing.notice.unverified` lines with `NOTICE_HEADER_MISSING` (one per check run, and one
   every 5 minutes from the notify alarm, H10) are expected; any other line: look it up in `deploy/vps/README.md` §14.8's journal table. Among all of
   that start's billing lines, `billing.card.purged` (the daily card cleanup) and
   `billing.tax_summary.queued` are normal too (both seen on 19 October 2026).

4. **The billing check** again (the command of H6). Every line must be a tick except the plans line
   ("…placeholders…": this host keeps the engine's own price list), as on the hosted kit's sandbox
   server (`deploy/vps/README.md` §14.9). On 19 October 2026 it ended "1 of 16 checks need attention",
   that plans line. The check reads Quaderno's key file but does not call Quaderno, so the first
   quote on the pricing page is the first proof that Quaderno's sandbox accepts the key.

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
which stays refused. `mail-recipient.json` allows four addresses (stored as SHA-256 hashes). Two of
them are verification-forward aliases, and mail to those arrives in the forward target's inbox
(`verificationForwardTarget`, the one address the file holds in plain text).

### H9. The billing notice spool (optional, from the release that carries PR #192)

NETOPIA sends the saved card only in its first message about a payment; the 5 copies it sends again
carry none. When the database cannot store that first message, the API can keep it on disk, sealed
with the records key, and store it later (at its next start and every 10 minutes; one still not
stored 14 days after it arrived is deleted unread). This is `deploy/vps/README.md` §14.5's spool, in the
preview's own folder `/var/lib/debateai-v3-preview/api/billing-notice-spool`: owned by the API's
user, `0700`, so the runner cannot read it, and outside the nightly backup (which copies only the
database). Without it the API works as before and writes one `billing.notice.spool_off` line at each
start.

The launcher admits `BILLING_NOTICE_SPOOL_PATH` only in hosted mode, only beside NETOPIA's four
settings, and only with exactly that folder; anything else stops the start with
`PREVIEW_API_STARTUP_REFUSED`. The API itself refuses to start when it cannot write the folder.

Do it during a release whose API carries PR #192 (NETOPIA's retry rules). Use that release's root
shell (step 0's `CAPI`) with H1's second block pasted again (`E`, `AU`, `AGRP`). Step 1 can run any
time before the release restarts the API (no downtime: `daemon-reload` changes nothing in a running
service). Step 2 goes just before that restart (with the `REGISTER_VERSION` lines of "Publishing a new
register version" step 5, when the release publishes one), and the restart switches the spool on.

1. **The folder and the API's write permission.** The API's unit lets it write only the folders it
   names, so a small drop-in adds this one:

   ```sh
   SP=/var/lib/debateai-v3-preview/api/billing-notice-spool
   ( set -euo pipefail
     [ -n "${AU:-}" ] && [ "$AU" != root ] && [ -n "${AGRP:-}" ] && [ -n "${CAPI:-}" ] || exit 1
     grep -q BILLING_NOTICE_SPOOL_PATH "$CAPI/dialectical-engine/packages/register/src/runtime-environment.ts"   # stops here when this release does not carry PR #192
     install -d -m 0700 -o "$AU" -g "$AGRP" "$SP"
     install -o root -g root -m 0644 "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/debateai-preview-api-notice-spool.conf" /etc/systemd/system/debateai-preview-api.service.d/zzzzzzzzzz-billing-notice-spool.conf
     systemctl daemon-reload
     echo "spool folder and write permission in place" )
   stat -c '%a %U %G %n' "$SP"
   systemctl show -p ReadWritePaths debateai-preview-api
   ```

   `stat` prints `700 <API user> <API group>`. `systemctl show` must list
   `-/var/lib/debateai-v3-preview/api/billing-notice-spool` among the API's other folders. If it does
   not, stop: with step 2's line the API would refuse to start.

2. **The setting**, just before the release's restart:

   ```sh
   ( set -euo pipefail
     [ -n "${SP:-}" ] && [ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$E/api.env")" = 1 ] && [ "$(grep -c '^NETOPIA_API_BASE_URL=' "$E/api.env")" = 1 ] || exit 1
     grep -q '^BILLING_NOTICE_SPOOL_PATH=' "$E/api.env" || printf '\nBILLING_NOTICE_SPOOL_PATH=%s\n' "$SP" >> "$E/api.env"
     echo "spool line in api.env" )
   grep -c '^BILLING_NOTICE_SPOOL_PATH=' "$E/api.env"   # must print 1
   grep -oE '^[A-Z_][A-Z0-9_]*=' "$E/api.env" | sort | uniq -d   # must print nothing
   ```

   The line starts on a new line and is added only once.

3. **A minute after the restart** (the API writes `billing.notice.spool_off` once it listens):

   ```sh
   systemctl is-active debateai-preview-api   # active
   journalctl --no-pager -u debateai-preview-api _SYSTEMD_INVOCATION_ID="$(systemctl show --property=InvocationID --value debateai-preview-api)" | grep -cE 'billing\.notice\.spool_(off|failed)|BILLING_NOTICE_SPOOL_REPLAY_FAILED'   # must print 0
   ```

   No `billing.notice.spool_off` line means the API started with the spool. A
   `billing.notice.spool_replay` line with `stored`/`kept`/`expired` is normal: it appears only when
   the folder held messages. `deploy/vps/README.md` §14.8's journal table explains the others.

**The way back** (no release needed): see how many messages wait in the folder, take the line out,
restart the API. Files left in the folder are stored when the spool is switched on again, if they
are less than 14 days old (older ones are then deleted unread).

```sh
E=/etc/debateai-v3-preview/auth-dev-v1; SP=/var/lib/debateai-v3-preview/api/billing-notice-spool
find "$SP" -type f | wc -l   # 0: nothing waits
sed -i '/^BILLING_NOTICE_SPOOL_PATH=/d' "$E/api.env"; grep -c '^BILLING_NOTICE_SPOOL_PATH=' "$E/api.env"   # 0
systemctl restart debateai-preview-api
```

Take the line out first, too, before going back to a release from before PR #192: its launcher
does not know the setting and refuses to start (`PREVIEW_API_STARTUP_REFUSED`). "Rolling back to
local mode" below already restores an `api.env` without it. The drop-in and the folder may stay.

### Rolling back to local mode on register 12

The heading keeps its old name. The register this returns to is the one the preview ran before H6:
14 on 19 October 2026, not 12.

**This undoes the hosted switch only, and only from the release that made it** (R18), on a database no later release
has changed. It is not the way back from a release on the hosted base: that is the release's own rbB ("A normal
release on a hosted base"). Since R19 (21 October 2026) it cannot run as written. R19 applied migrations 0121 and
0122, and the pre-hosted release R18 refuses that database. R19's runner, in turn, refuses register 14 (its prompt
seals). To go back to local mode while R19 is the live release, first run R19's rbB (only with the owner's yes that
everything written since R19's cold copy is lost). It restores that copy, taken before 0121 and 0122, and with it R18
on register 16, hosted. Then run this section. Once a later release is live, R19's names file and copy are stale: ask
the owner first.

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
Then run step 6's runner lines (only when `PINNED` is `yes` and no debate is running): they restart a
running runner, and start one left `inactive` or `failed` (H6's step 3 note). Then check that
`grep -c '^DEBATEAI_DEPLOYMENT_MODE=local$' "$E/api.env" "$E/runner.env"` prints 1 for each file.

The egress proxy, the Caddy exemption and Postfix's limit may stay: in local mode the API makes no
https call and answers the notify path `404`. To remove them:
- run `systemctl disable --now debateai-preview-egress.service` and delete `60-hosted-egress.conf`;
- put `$S/Caddyfile.before-hosted` back into `/etc/debateai-v3-preview/public/Caddyfile` and run
  `systemctl restart caddy` (Caddy runs with `admin off`, so there is no reload);
- for Postfix, put `$S/postfix-main.cf.before-hosted` back and run `systemctl reload postfix`.

**After a rollback, later publications still use kit v3.** The newest sealed version is a hosted one,
and kit v2 refuses it as a base (billing on, or the story money row it does not build). Plan from the
kept verify plan that names it, with `--hosted-billing` (`"billing":"off"` to stay off); the release
tool refuses a plan from a hosted base without it (`HOSTED_BILLING_REQUIRED`).

**What only the server proves:**
- the API and the runner booting hosted on the new versions;
- the egress proxy's real DNS and TLS path to NETOPIA's and Quaderno's sandboxes;
- the Caddy exemption;
- the billing check's ticks;
- the database login fix (H0);
- real mail delivery of a templated message through Postfix to an allow-listed inbox;
- the US purchase end to end.

On 19 October 2026 the boots, NETOPIA's path, the exemption, the ticks and the login were proven.
Quaderno's path, mail delivery and the purchase come with H8. The unit tests
(`preview-register-publish-v3`, `preview-release-artifacts`, `preview-auth-dev-environment`,
`preview-egress-proxy`, `preview-auth-dev-mail`) and the PostgreSQL 18 integration test
(`tests/integration/preview-register-publish-v3.test.ts`: provider-only then billing on, each version
passing the hosted API's boot-readiness check) are source evidence only.

### H10. The alarm on NETOPIA's notify address

Every 5 minutes the server knocks on its own notify address (the same unsigned message as the billing
check) and reports to Healthchecks.io, which emails the owner when the address stops answering or the
reports stop. The program and its units live outside the release tree (`/usr/local/lib/debateai-notify-alarm`),
so a release does not touch them and needs no step for them. Setup, the test site's Node drop-in and the
meaning of each email: `deploy/notify-alarm/README.md`. Each knock writes one harmless
`billing.notice.unverified` line with `NOTICE_HEADER_MISSING` in the API's journal.

## A normal release on a hosted base (since R19, 21 October 2026)

**In plain words.** Since 19 October 2026 the preview runs in hosted mode with NETOPIA sandbox billing on
(register 16, "Hosted preview with NETOPIA sandbox billing" above). So every release from then on is a release on a
hosted base. The sequences earlier in this guide were written while the preview ran in local mode, and on this host
three of their habits now go wrong:
- a register plan without the owner's hosted inputs is refused (`HOSTED_BILLING_REQUIRED`), and one with the
  billing-OFF inputs of H6 would switch billing off;
- a release that brings database steps (migrations) has no way back unless a cold copy of the database is taken just
  before them;
- `try-restart` leaves a stopped runner down.

R19 was the first release on the hosted base: dev `d50e33165`, migrations 0121 and 0122, register 17. It ran the order
below with one script per step. Every script worked the first time, and the site was down 11 minutes 38 seconds. This
section is that recipe, written so that any later release can follow it.

**How each step runs.**
- Each step below is one script. It starts with `set -euo pipefail` and reads the release's names file (step A1).
  Run each one on its own, as root, with `bash -s` (R19 sent each file over `ssh … 'sudo -n bash -s' < step.sh` and
  kept its output next to it). Replace `rNN` with the release's number (`r20`, `r21`, …) and fill in the few
  `<…>` values; everything else is derived.
- The last line says `<STEP>_DONE`, or `<STEP>_NOT_DONE: <why>`: then the script has exited 1 at the first surprise.
  After a `_NOT_DONE`, run nothing further: read "The way back" below and decide with the owner.
- Every guard is written `… || { echo "<STEP>_NOT_DONE: …"; exit 1; }`. A bare test inside an `a && b` list does
  not stop a script under `set -e` (R17's `cmp … && echo X` lines did not stop either).
- The scripts print no env value other than `REGISTER_VERSION`, `DEBATEAI_DEPLOYMENT_MODE` and `MAIL_SENDMAIL_PATH`.
- Long steps (A3, A4, A6, A7) may run in the background, as R19 did: save the script in `$S/jobs` (made once with
  `install -d -o root -g root -m 0700 "$S/jobs"`), start it with `nohup bash "$S/jobs/<step>.sh" > "$S/jobs/<step>.log"
  2>&1 < /dev/null &`, and read the log with `tail`.

**The plan's inputs on this host never change** (the owner's, 14 and 19 October 2026). The hosted kit rebuilds
billing, the ceilings and the answer checker from the plan every time, never from the base:

```sh
HB_ON='{"billing":"on","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
```

- Every plan carries `--hosted-billing "$HB_ON" --checker deepseek --deepseek-enabled-on-gate yes`.
- Never H6's billing-OFF JSON: the delta would show `billingPolicy` switching billing off.
- Never without the checker flags: the delta would show the answer checker going back to GLM (`evaluatorRoleRef`,
  `storyCheckerRoleRef`).
- Leave out `--role-rotation` (rotation stays on), `--call-concurrency` (the row is carried from the base) and
  `--debate-shape`. Add `--length-guidance` only when the owner chose it for this release (R19 had none).

**The traps** (each one stopped, or nearly stopped, an earlier release):
- **`nat` always exits 0.** It prints `exit N` and returns 0 itself, so `put … && nat …` never stops on a refusal.
  Take its line and test it: `OUT=$(nat "$F"); [ "$OUT" = "exit 0" ] || { …; exit 1; }`.
- **A pin writes `pinnedAt`.** After a re-pin the lock is never byte-equal to its copy. Compare it without the pin
  times: `diff <(jq -S 'del(.services[].pinnedAt)' "$S/release-lock.before.json") <(jq -S 'del(.services[].pinnedAt)' "$LOCK")`.
- **The build roster is `all-models`**, the list in `ui.env` (Free and Premium list all five AIs, Haiku
  included). It is not `multi-model`, which hashes to `f6b1851e…`: the UI start-up check would refuse that build.
- **Skip the runner's prepare-only check** (`launch-runner.mjs --plan` without `--start`). It refuses a database
  proof older than 180 seconds, and the launch plans take longer than that to make. The real start makes a fresh
  proof.
- **With a migration pending, `verify`, `publish` and every start refuse.** So B3 comes before B4 and before any
  start. `plan` (A8) is not affected: it composes from the code and the sealed base (R19 planned with 0121 and 0122
  pending).
- **0122 must be in before the first start of R3+ code.** Every map read of R3+ code (R19 and later) joins
  `core.map_item_rests_on`, which 0122 makes: without it every debate page fails. In general, a release's
  migrations go in before its first start.
- Also: a runner from before #177 (R18 and older) reports `failed` after a planned stop and sends one false "runner
  failed" email. R19 and later exit 0 on a planned stop, so they show `inactive`. Accept both as "stopped".
- Also: the API writes `PREVIEW_API_STARTED` only after its launcher has re-hashed the release, a minute or more after
  `systemctl start`. Wait for it (B6 waits up to 4 minutes); do not read the journal at once.

**The order, and the way back from each point.**

| Step | What | The site | The way back from here |
|---|---|---|---|
| A0 | preflight (read-only) | up | nothing to undo |
| A1 | names file, archive `$S`, the copies the way back needs | up | nothing to undo |
| A2 | package: bundle, reference clone, six folders | up | nothing to undo |
| A3 | dependencies: a store copy with the new lockfile packages, then `downloaded 0` in all six | up | nothing to undo |
| A4-A7 | manifests, build values, two UI builds, verify and digest | up | nothing to undo |
| A8 | register plan and proposal (read-only) | up | the live verify plan is put back at once |
| A9 | the owner reads the delta; their yes names its `deltaSha256` | up | – |
| A10 | gate files: hash check | up | – |
| Practice | on the Mac, `--register-next` with the plan's flags | up | none (a throwaway database) |
| B0 | preflight again, right before the downtime | up | – |
| B1 | stop the runner, the backup timer, the website, the API | **down** | rbA: start the old release as it was |
| B2 | cold copy of the database cluster | down | rbA |
| B3 | migrations (`apply-and-plan`) | down | **only the cold copy: rbB** |
| B4 | publish with the owner's yes; verify plan, first proof, three launch plans | down | rbB |
| B5 | the two env edits | down | rbB |
| B6 | pin three; start the API, then the website (the downtime ends), then the backup timer | up | rbB |
| B7 | start the runner by hand | up | rbB |
| B8 | checks (read-only) | up | rbB |

- **Phase B needs the owner's yes, fresh in the live chat right before B1.** It names:
  - the downtime;
  - the cold copy;
  - the migrations by number;
  - the publish with the delta hash;
  - the switch to the new commit.

  R19's was: "Yes, upload R19 to the test site now: stop the services, take the cold copy of the database, apply
  migrations 0121 and 0122, publish register 17 with delta cde2b04a…, switch to d50e33165 and start everything again."
- **A release that adds no migration** skips B3 only (B3 then prints `B3_SKIPPED` and changes nothing). Keep B2: it
  takes seconds, and it keeps rbB possible after the publish.

### A0. Preflight (read-only)

```sh
set -euo pipefail
# A0: preflight. Reads only; runs before the names file exists.
E=/etc/debateai-v3-preview/auth-dev-v1; NP=$E/native-plan.json; LOCK=/etc/debateai-v3-preview/lifecycle/release-lock.json
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
gs() { /usr/bin/python3 -I "$1/preview_budget_authority.py" status --private "$2"; }
date -u
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] || { echo "A0_NOT_DONE: a debate is queued or running"; exit 1; }
echo "ledger $(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")"
V0=$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1") || { echo "A0_NOT_DONE: the database is unreadable"; exit 1; }; echo "register $V0"
for F in api.env runner.env; do [ "$(grep -c "^REGISTER_VERSION=$V0\$" "$E/$F")" = 1 ] && [ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$E/$F")" = 1 ] || { echo "A0_NOT_DONE: $F is not hosted on register $V0"; exit 1; }; done
[ "$(jq -r .operation "$NP")" = verify ] && [ "$(jq -r '.hostedBilling.billing // "none"' "$NP")" = on ] || { echo "A0_NOT_DONE: native-plan.json is not a billing-on verify plan"; exit 1; }
jq -r '.services | to_entries[] | "\(.key) \(.value.sourceRevision) v\(.value.publication.registerVersion) \(.value.basePlan.path)"' "$LOCK"
[ "$(jq -r '[.services[].publication.registerVersion] | unique | join(" ")' "$LOCK")" = "$V0" ] || { echo "A0_NOT_DONE: the lock's three plans are not all on register $V0"; exit 1; }
[ "$(psqlq "SELECT pg_has_role('debateai_prod_api_runtime','debateai_billing_runtime','MEMBER')")" = t ] || { echo "A0_NOT_DONE: the API's login is not a billing member (H0)"; exit 1; }
for P in /opt/debateai-v3-preview/operator/deepinfra-budget-v3:/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 /opt/debateai-v3-preview/operator/anthropic-budget-v1:/var/lib/debateai-v3-preview/provider-anthropic-authority-v1; do
  J=$(gs "${P%%:*}" "${P#*:}") || { echo "A0_NOT_DONE: a gate's status is unreadable"; exit 1; }; echo "$(basename "${P%%:*}") $(jq -c '{state,in_flight,today_spend_usd}' <<<"$J")"
  [ "$(jq -r .state <<<"$J")" = active ] && [ "$(jq -r .in_flight <<<"$J")" = 0 ] || { echo "A0_NOT_DONE: a gate is not active, or has a call in flight"; exit 1; }
done
for U in api ui runner provider-budget anthropic-budget postgresql hatchet hatchet-gateway turnstile egress; do systemctl show -p Id -p ActiveState -p NRestarts debateai-preview-$U | tr '\n' ' '; echo; done
AV=$(df --output=avail -BG / | tail -1 | tr -dc 0-9); echo "disk free ${AV} GB"
[ "$AV" -ge 15 ] || { echo "A0_NOT_DONE: less than 15 GB free (R19 used about 4 GB)"; exit 1; }
echo A0_DONE
```

R19 (21 October 2026): unfinished 0, ledger `139|0120_reply_measures.sql`, register 16, the lock's three
`…-billing-on` plans of R18, both gates active with nothing in flight, 35 GB free.

### A1. Names, the archive `$S` and the copies the way back needs

The old release is the one the lock names now: its folders, commit and plans are read from the lock, never typed.
`OSTORE` is the pnpm store the live release installed from. R19 made its own copy,
`/opt/debateai-v3-preview/artifacts/auth-dev-d50e33165-r19-v1/pnpm-store`. A release that made no copy installed
from the one before it.

```sh
set -euo pipefail
# A1: this release's names file, its archive folder S, and the copies the way back needs. Nothing live changes.
NN=rNN                                                    # this release's number, e.g. r20
REV='<the full 40-character dev commit>'                  # on the Mac: git fetch origin dev && git rev-parse refs/remotes/origin/dev
OSTORE='<the pnpm store the live release installed from>'
LOCK=/etc/debateai-v3-preview/lifecycle/release-lock.json; E=/etc/debateai-v3-preview/auth-dev-v1; NP=$E/native-plan.json
NAMES=/root/preview-archive/$NN-names.sh; SP=/root/preview-archive/$NN-S.txt
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
[ ! -e "$NAMES" ] && [ ! -e "$SP" ] || { echo "A1_NOT_DONE: $NAMES or $SP exists (look first)"; exit 1; }
printf '%s\n' "$NN" | grep -qxE 'r[0-9]+' && printf '%s\n' "$REV" | grep -qxE '[0-9a-f]{40}' || { echo "A1_NOT_DONE: NN or REV is not filled in"; exit 1; }
[ -d "$OSTORE/v11" ] || { echo "A1_NOT_DONE: OSTORE is not a pnpm store"; exit 1; }
OCAPI=$(jq -r .services.api.sourceRoot "$LOCK"); OCUI=$(jq -r .services.ui.sourceRoot "$LOCK"); OCRUN=$(jq -r .services.runner.sourceRoot "$LOCK")
OREV=$(jq -r .services.api.sourceRevision "$LOCK"); OLABEL=${OCAPI#/opt/debateai-v3-preview/releases/auth-dev-candidate-}; OLABEL=${OLABEL%-api}
OPLANS=$(dirname "$(jq -r .services.api.basePlan.path "$LOCK")")
[ "$OCUI" = "/opt/debateai-v3-preview/releases/auth-dev-candidate-$OLABEL-ui" ] && [ "$OCRUN" = "/opt/debateai-v3-preview/releases/auth-dev-candidate-$OLABEL-runner" ] && [ "$(jq -r '[.services[].sourceRevision] | unique | length' "$LOCK")" = 1 ] || { echo "A1_NOT_DONE: the lock's three services are not one release"; exit 1; }
for F in api ui runner; do [ "$(jq -r ".services.$F.basePlan.path" "$LOCK")" = "$OPLANS/$F-launch.json" ] || { echo "A1_NOT_DONE: the lock's $F plan is not in $OPLANS"; exit 1; }; done
[ "$(jq -r .operation "$NP")" = verify ] && [ "$(jq -r .sourceRevision "$NP")" = "$OREV" ] && [ "$REV" != "$OREV" ] || { echo "A1_NOT_DONE: native-plan.json is not the live release's verify plan, or REV is the live release"; exit 1; }
LABEL=${REV:0:9}-$NN-v1
[ ! -e "/opt/debateai-v3-preview/artifacts/auth-dev-$LABEL" ] && [ ! -e "/opt/debateai-v3-preview/releases/auth-dev-candidate-$LABEL-api" ] || { echo "A1_NOT_DONE: this release's artifacts folder or folders exist"; exit 1; }
[ -d "/opt/debateai-v3-preview/artifacts/auth-dev-$OLABEL/source-reference" ] || { echo "A1_NOT_DONE: the old release's reference clone is missing"; exit 1; }
S=/root/preview-archive/$NN-$(date -u +%Y%m%dT%H%M%SZ)
install -d -o root -g root -m 0700 "$S"
umask 077
printf '%s\n' "$S" > "$SP"
{ printf 'REV=%s\nLABEL=%s\nOREV=%s\nOLABEL=%s\nOCAPI=%s\nOCUI=%s\nOCRUN=%s\nOPLANS=%s\nOSTORE=%s\nS=$(cat %s)\n' "$REV" "$LABEL" "$OREV" "$OLABEL" "$OCAPI" "$OCUI" "$OCRUN" "$OPLANS" "$OSTORE" "$SP"
  cat <<'EOF'
umask 022
RELS=/opt/debateai-v3-preview/releases
R=$RELS
ART=/opt/debateai-v3-preview/artifacts/auth-dev-$LABEL
OART=/opt/debateai-v3-preview/artifacts/auth-dev-$OLABEL
CAPI=$RELS/auth-dev-candidate-$LABEL-api
CUI=$RELS/auth-dev-candidate-$LABEL-ui
CRUN=$RELS/auth-dev-candidate-$LABEL-runner
STORE=$ART/pnpm-store
N=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
E=/etc/debateai-v3-preview/auth-dev-v1
NP=$E/native-plan.json
LOCK=/etc/debateai-v3-preview/lifecycle/release-lock.json
AU=$(systemctl show -p User --value debateai-preview-api); AGRP=$(id -gn "$AU")
HB_ON='{"billing":"on","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
GD=/opt/debateai-v3-preview/operator/deepinfra-budget-v3
PD=/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
GAN=/opt/debateai-v3-preview/operator/anthropic-budget-v1
PAN=/var/lib/debateai-v3-preview/provider-anthropic-authority-v1
rel() { /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin TZ=UTC /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$CAPI/dialectical-engine/deploy/preview-release/v1/release-artifacts.mjs" "$@"; }
nat() { ( cd "$CAPI/dialectical-engine" && /bin/sh -c 'exec 5<&0; p=$1; shift; printf %s "$p" 5<&- | "$@" 3<&0 0<&5 5<&-' sh '{"peerUrl":"postgresql://postgres@localhost/debateai?host=/run/debateai-v3-preview/postgresql&port=5434"}' /usr/sbin/runuser -u postgres -- /usr/bin/env -i PATH=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin:/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs" --credential-fd 3 < /dev/null > "$1" ); echo "exit $?"; }
put() { install -o root -g root -m 0644 "$1" "$NP.new" && mv "$NP.new" "$NP" && cmp "$1" "$NP"; }
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
pre() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/prestart.mjs" "$@"; }
gs() { /usr/bin/python3 -I "$1/preview_budget_authority.py" status --private "$2"; }
EOF
} > "$NAMES"
chmod 0600 "$NAMES" "$SP"
. "$NAMES"
umask 077
cp -p "$E/api.env" "$S/api.env.before"; cp -p "$E/runner.env" "$S/runner.env.before"; cp -p "$E/ui.env" "$S/ui.env.before"
chmod 0600 "$S/api.env.before" "$S/runner.env.before" "$S/ui.env.before"
cp -p "$LOCK" "$S/release-lock.before.json"
cp -a "$NP" "$S/native-plan.before.json"
jq -r '.services.api.basePlan.path, .services.ui.basePlan.path, .services.runner.basePlan.path' "$LOCK" > "$S/old-plans.txt"
( cd /etc/systemd/system && tar -czf "$S/systemd-before.tgz" debateai-preview-* )
psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration" > "$S/ledger-before"
psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1" > "$S/register-before"
umask 022
cmp -s "$S/native-plan.before.json" "$NP" && cmp -s "$S/release-lock.before.json" "$LOCK" && cmp -s "$S/api.env.before" "$E/api.env" && cmp -s "$S/runner.env.before" "$E/runner.env" && cmp -s "$S/ui.env.before" "$E/ui.env" || { echo "A1_NOT_DONE: a copy differs from the live file"; exit 1; }
echo "S=$S ART=$ART old release $OLABEL, its plans in $OPLANS; ledger $(cat "$S/ledger-before"), register $(cat "$S/register-before")"
echo A1_DONE
```

Every later step starts with these two lines:

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
```

### A2. Package

On the Mac (changes no checkout): a bundle of dev since the live release, and its sha256. `OREV` is the commit A0
printed for the lock's three plans.

```sh
OREV='<the commit A0 printed for the lock>'
git fetch origin dev && git bundle create "$TMPDIR/rNN.bundle" refs/remotes/origin/dev "^$OREV" && git bundle verify "$TMPDIR/rNN.bundle" && shasum -a 256 "$TMPDIR/rNN.bundle"
```

Copy it to the server (R19: `/home/ubuntu/r19-d50e33165.bundle`), then:

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# A2: the bundle checked, the reference clone at REV, the new migrations listed, six release folders by git archive.
BUN='<the path of the bundle on the server>'; BSHA='<the sha256 the Mac printed>'
[ "$(sha256sum "$BUN" | cut -d' ' -f1)" = "$BSHA" ] || { echo "A2_NOT_DONE: the bundle is not the Mac's"; exit 1; }
[ ! -e "$ART" ] || { echo "A2_NOT_DONE: $ART exists"; exit 1; }
install -d -o root -g root -m 0755 "$ART"
git clone -q --no-checkout "$OART/source-reference" "$ART/source-reference"
git -C "$ART/source-reference" fetch -q "$BUN" refs/remotes/origin/dev
git -C "$ART/source-reference" checkout -q --detach "$REV"
[ "$(git -C "$ART/source-reference" rev-parse HEAD)" = "$REV" ] && [ -z "$(git -C "$ART/source-reference" status --porcelain --untracked-files=no)" ] || { echo "A2_NOT_DONE: the reference clone is not clean at REV"; exit 1; }
git -C "$ART/source-reference" merge-base --is-ancestor "$OREV" HEAD || { echo "A2_NOT_DONE: REV is not built on the live release"; exit 1; }
git -C "$ART/source-reference" diff --name-only --no-renames --diff-filter=A "$OREV" "$REV" -- 'dialectical-engine/migrations/[0-9]*.sql' | sed 's#.*/##' > "$S/new-migrations.txt"
echo "new migrations: $(tr '\n' ' ' < "$S/new-migrations.txt")"
echo "package files changed:"; git -C "$ART/source-reference" diff --name-only "$OREV" "$REV" -- '*package.json' dialectical-engine/pnpm-workspace.yaml dialectical-engine/pnpm-lock.yaml
echo "gate and lifecycle files changed (A10):"; git -C "$ART/source-reference" diff --name-only "$OREV" "$REV" -- dialectical-engine/deploy/preview-gate dialectical-engine/deploy/preview-lifecycle dialectical-engine/packages/providers/ops
for KIND in candidate fallback; do for ROLE in api ui runner; do
  D=$RELS/auth-dev-$KIND-$LABEL-$ROLE
  [ ! -e "$D" ] || { echo "A2_NOT_DONE: $D exists"; exit 1; }
  install -d -o root -g root -m 0755 "$D"
  git -C "$ART/source-reference" archive --format=tar "$REV" | tar -x -C "$D" --no-same-owner
  chown -R root:root "$D"; find "$D" -type d -exec chmod go-w {} +; find "$D" -type f -exec chmod go-w {} +
done; done
echo A2_DONE
```

`$S/new-migrations.txt` decides B3: R19's held `0121_engine_verdict.sql` and `0122_engine_map_check.sql`. An empty
file means no B3.

### A3. Dependencies: a store copy, then offline

When `pnpm-lock.yaml` changed since the live release (A2 lists it), the store the live release installed from lacks
the new packages, and the offline install fails. R17 (for `eld`) and R19 (five packages, `follow-redirects` 1.16.1
among them) solved it the same way:
1. copy that store, and never touch the original;
2. run ONE online install against the copy, in a separate fill folder (pnpm checks every new download against the
   lockfile's sha512);
3. install all six folders offline from the copy.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# A3: store copy, one online fill against the copy, then the six folders offline (downloaded 0), then generate:contract.
[ "$(df --output=avail -BG / | tail -1 | tr -dc 0-9)" -ge 15 ] || { echo "A3_NOT_DONE: less than 15 GB free"; exit 1; }
[ ! -e "$STORE" ] && [ ! -e "$ART/store-fill" ] || { echo "A3_NOT_DONE: this release's store or fill folder exists"; exit 1; }
O0=$(find "$OSTORE" -type f | wc -l)
cp -a "$OSTORE" "$STORE"
install -d -o root -g root -m 0755 "$ART/store-fill"
git -C "$ART/source-reference" archive --format=tar "$REV" dialectical-engine | tar -x -C "$ART/store-fill" --no-same-owner
( cd "$ART/store-fill/dialectical-engine" && umask 022 && /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin CI=true NEXT_TELEMETRY_DISABLED=1 TZ=UTC PNPM_CONFIG_STORE_DIR="$STORE" /usr/local/bin/node tools/source-map-hotfix.mjs install ) > "$ART/store-fill-install.log" 2>&1 || { echo "A3_NOT_DONE: the online fill failed (see $ART/store-fill-install.log)"; exit 1; }
echo "fill: $(grep -oE 'resolved [0-9]+, reused [0-9]+, downloaded [0-9]+, added [0-9]+, done' "$ART/store-fill-install.log" | tail -n 1)"
[ "$(find "$OSTORE" -type f | wc -l)" = "$O0" ] || { echo "A3_NOT_DONE: the old store changed"; exit 1; }
for D in "$RELS"/auth-dev-*-"$LABEL"-*; do
  G="$ART/$(basename "$D")"
  ( cd "$D/dialectical-engine" && umask 022 && /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin CI=true NEXT_TELEMETRY_DISABLED=1 TZ=UTC PNPM_CONFIG_OFFLINE=true PNPM_CONFIG_STORE_DIR="$STORE" /usr/local/bin/node tools/source-map-hotfix.mjs install ) > "$G-install.log" 2>&1 || { echo "A3_NOT_DONE: the offline install failed in $D"; exit 1; }
  [ "$(grep -oE 'downloaded [0-9]+, added [0-9]+, done' "$G-install.log" | tail -n 1 | cut -d, -f1)" = "downloaded 0" ] || { echo "A3_NOT_DONE: $D did not install with downloaded 0"; exit 1; }
  ( cd "$D/dialectical-engine" && umask 022 && /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin CI=true TZ=UTC /usr/local/bin/node tools/source-map-hotfix.mjs generate ) > "$G-generate.log" 2>&1 || { echo "A3_NOT_DONE: generate:contract failed in $D"; exit 1; }
  echo "$(basename "$D"): $(grep -oE 'resolved [0-9]+, reused [0-9]+, downloaded [0-9]+, added [0-9]+, done' "$G-install.log" | tail -n 1)"
done
[ "$(sha256sum "$RELS"/auth-dev-*-"$LABEL"-*/dialectical-engine/packages/contract/generated/openapi.json | cut -d' ' -f1 | sort -u | wc -l)" = 1 ] || { echo "A3_NOT_DONE: the six openapi.json differ"; exit 1; }
echo A3_DONE
```

- R19's fill printed `resolved 446, reused 441, downloaded 5`, and then all six printed `downloaded 0`.
- pnpm 11 keeps its index in one file, `v11/index.db`, and the server has no `sqlite3`. So name the new packages from
  the lockfile diff on the Mac.
- When the lockfile did not change, skip the copy and the fill. Install from `$OSTORE` directly: put `$OSTORE` for
  `$STORE` in the offline line, as R18 did.

### A4-A7. Manifests, build values, UI builds, verify

These are steps 2 to 5 of "Operator sequence for one release" above, pasted into a root shell after
`. /root/preview-archive/rNN-names.sh`. Each `--out` goes to `$ART`. One thing differs: **the model list is `all-models`**, so give `--models all-models` to `build-env` and to
both `ui-build`s. Both also take `--release-key "$KEY"`, where `KEY` is `r<the register version this release will
publish, one above A1's>-<first 12 hex of REV>`. Check the build values against `ui.env` by hash:

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# A5: the public build values of the all-models list against ui.env, by hash only.
[ ! -e "$S/build-env-all-models.json" ] || { echo "A5_NOT_DONE: an earlier build-env output exists"; exit 1; }
KEY="r$(( $(cat "$S/register-before") + 1 ))-${REV:0:12}"
rel build-env --models all-models --release-key "$KEY" > "$S/build-env-all-models.json"
for K in NODE_ENV PUBLIC_APP_URL NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON TURNSTILE_SITE_KEY; do
  T=$(jq -r --arg k "$K" '.values[$k].sha256' "$S/build-env-all-models.json"); U=$(sed -n "s/^$K=//p" "$E/ui.env" | tr -d '\n' | sha256sum | cut -d' ' -f1)
  echo "$K tool ${T:0:16} ui.env ${U:0:16}"; [ "$T" = "$U" ] || { echo "A5_NOT_DONE: $K differs from ui.env"; exit 1; }
done
# RELEASE_KEY: the new release's key, not the shared ui.env's (that is the live release's); its own ui-<label>.env gets it when derived.
[ "$(jq -r '.values.RELEASE_KEY.value' "$S/build-env-all-models.json")" = "$KEY" ] || { echo "A5_NOT_DONE: build-env did not print this release's key"; exit 1; }
echo A5_DONE
```

- A6, the builds: `rel ui-build --source "$ART/$KIND-ui-source.json" --models all-models --release-key "$KEY" --out "$ART/$KIND-ui-build.json"`,
  for the candidate and the fallback, after setting `KEY` exactly as A5 does.
- A7 must print six `PREVIEW_RELEASE_VERIFIED` lines naming `REV`, and the operator digest.
  - The digest changes whenever a file in `deploy/preview-auth-dev/v1` changed.
  - `nativeSha256` changes with new migrations.
- On 21 October 2026 the live list hashed to `cd299616…1c27`.

### A8. The register plan and its proposal (read-only; the site stays up)

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# A8: the plan (billing-on inputs, the live checker), the native operator's proposal, the live verify plan put back at once.
[ "$(jq -cS . <<<"$HB_ON")" = '{"askRoomReads":{"capacity":65536,"limit":60,"windowMs":60000},"billing":"on","dailyCeilingMicros":10000000,"perRunCeilingMicros":3000000}' ] || { echo "A8_NOT_DONE: HB_ON is not the billing-on JSON"; exit 1; }
cmp -s "$S/native-plan.before.json" "$NP" || { echo "A8_NOT_DONE: native-plan.json moved since A1"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] || { echo "A8_NOT_DONE: a debate is queued or running"; exit 1; }
[ ! -e "$ART/native-plan-plan.json" ] && [ ! -e "$ART/register-proposal.json" ] || { echo "A8_NOT_DONE: an earlier plan or proposal exists (look first)"; exit 1; }
rel native-plan --operation plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --checker deepseek --deepseek-enabled-on-gate yes --hosted-billing "$HB_ON" --out "$ART/native-plan-plan.json" || { echo "A8_NOT_DONE: the release tool refused the plan"; exit 1; }
[ "$(jq -r .operation "$ART/native-plan-plan.json")" = plan ] && [ "$(jq -r '.hostedBilling.billing // "none"' "$ART/native-plan-plan.json")" = on ] || { echo "A8_NOT_DONE: the plan is not a billing-on plan"; exit 1; }
restore() { put "$S/native-plan.before.json" && echo VERIFY_PLAN_RESTORED; }
trap 'restore || echo "VERIFY_PLAN_NOT_RESTORED: put $S/native-plan.before.json back by hand"' EXIT
put "$ART/native-plan-plan.json" || { echo "A8_NOT_DONE: put of the plan failed"; exit 1; }
OUT=$(nat "$ART/register-proposal.json"); echo "nat: $OUT"
trap - EXIT
restore || { echo "A8_NOT_DONE: put $S/native-plan.before.json back by hand"; exit 1; }
[ "$OUT" = "exit 0" ] || { head -c 2000 "$ART/register-proposal.json"; echo; echo "A8_NOT_DONE: the native operator refused the plan"; exit 1; }
sha256sum "$ART/native-plan-plan.json" "$ART/register-proposal.json" > "$S/plan-proposal.sha256"
jq -c '{baseRegisterVersion,addedKeys,changedKeys,removedKeys,deltaSha256}' "$ART/register-proposal.json"
echo A8_DONE
```

`native-plan.json` holds the plan only while `nat` runs (R19: 53 seconds), and the trap puts the live verify plan back
on any exit. A restart's prestart accepts only a verify plan, which is why A8 refuses while a debate is queued or
running.

### A9. The owner reads the delta

Print every entry, old value against new, as step 2 of the publish sequence above does. Then check the rows the
hosted kit must leave alone:

```sh
jq -r '.delta[] | "\(.change) \(.rowKey) (\(.reason))\n  old: \(.oldValueJsonText)\n  new: \(.newValueJsonText)"' "$ART/register-proposal.json"
jq -r '["billingPolicy","costEnvelopePolicy","admissionPolicy","storyCostEnvelopePolicy","evaluatorRoleRef","storyCheckerRoleRef","answerRoleRotationPolicy","callConcurrencyPolicy","debateShapePolicy","lengthGuidancePolicy","engineVersionPolicy"] as $w | [.delta[].rowKey | select(. as $k | $w | index($k))] | if length == 0 then "WATCH_LIST_ABSENT" else "STOP: " + join(" ") end' "$ART/register-proposal.json"
```

- Expect exactly the rows this release's code moves, as the release's own notes list them, plus
  `nodeRuntimeVersion` (its source reference only).
- The second line must print `WATCH_LIST_ABSENT`. A row on that list is there only by an owner decision for this
  release (for example `lengthGuidancePolicy` with `--length-guidance`). Anything else: stop.
- R19's delta, on base 16:
  - added `engineContractHash`;
  - changed the judge, conformance, map and serve contract hashes;
  - changed `countryPolicy` (it gained the 24 closed payment regions);
  - changed `nodeRuntimeVersion`;
  - 73 rows; `deltaSha256` `cde2b04ad226cf25d2efb490d427dfb8c27ad9d443b6d7cee67f4367e2548a17`.
- The owner's yes names the printed `deltaSha256`. Re-running `plan` stamps a new time, so it makes a new hash and
  needs a new yes.

### A10. Gate files

Run the check of "Publishing the call-concurrency row", Step 0 above (the `same` lines). Both gates must print
`match this release`, and both `state` lines `active`. If A2 listed a changed gate file, stop: that gate is
redeployed first, as `deploy/preview-gate/v3/README.md` says, with the owner's yes. In R19 nothing had changed, so
there was nothing to install.

### The practice (on the Mac; owner rule: before every upload)

Follow `tools/preview-practice/README.md`, "Practising the hosted preview" and its steps S-0 to S-7. Practise on
exactly `REV`, with the live register exported from the server (S-1), and with the plan's own flags (`$D` and `$P`
as in S-5 and S-6):

```sh
HB_ON='{"billing":"on","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question en-nuclear --register-next --hosted-billing "$HB_ON" --checker deepseek --deepseek-enabled-on-gate yes --transcript --out "$P/debate-report"
```

- Add `--length-policy` if, and only if, the plan carries `--length-guidance`. Then run `formats` as S-6 says.
- **Pass bar** (the owner's):
  - a FAIL is a step that failed for good, or a debate left unfinished;
  - repaired slips, a story served with reservation, slow AIs and one unbilled "too busy" are warnings.
- **The match.** The changed rows the practice prints (and `register.codeNext` in `report.json`) must equal A8's
  `addedKeys` and `changedKeys`, except `nodeRuntimeVersion`: the server measures its source reference again.
- R19's practice: PASS_WITH_WARNINGS, 33 minutes, $0.24 DeepInfra and $0.06 Anthropic, and the rows matched.

### B0. Preflight again, right before the downtime

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# B0: read-only. Nothing moved since phase A, everything staged is in place, nothing of phase B exists yet, and the
# way back is ready (old plans, old folders, drop-ins, the mail line, Hatchet allowed at the gateway).
REG0=$(cat "$S/register-before")
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] || { echo "B0_NOT_DONE: a debate is queued or running"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$(cat "$S/ledger-before")" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$(cat "$S/register-before")" ] || { echo "B0_NOT_DONE: the ledger or the register moved since A1"; exit 1; }
cmp -s "$S/native-plan.before.json" "$NP" && cmp -s "$S/release-lock.before.json" "$LOCK" || { echo "B0_NOT_DONE: native-plan.json or the lock moved since A1"; exit 1; }
for F in api.env runner.env ui.env; do cmp -s "$S/$F.before" "$E/$F" || { echo "B0_NOT_DONE: $F moved since A1"; exit 1; }; done
sha256sum -c --quiet "$S/plan-proposal.sha256" || { echo "B0_NOT_DONE: the plan or the proposal changed since A8"; exit 1; }
for KIND in candidate fallback; do for ROLE in api ui runner; do [ -s "$ART/$KIND-$ROLE-source.json" ] && [ -d "$RELS/auth-dev-$KIND-$LABEL-$ROLE/dialectical-engine" ] || { echo "B0_NOT_DONE: $KIND $ROLE is not staged"; exit 1; }; done; [ -s "$ART/$KIND-ui-build.json" ] || { echo "B0_NOT_DONE: the $KIND UI build is missing"; exit 1; }; done
for F in native-plan-apply-and-plan.json native-plan-publish.json register-published.json native-plan-verify.json native-first-verify.json api-launch.json ui-launch.json runner-launch.json; do [ ! -e "$ART/$F" ] || { echo "B0_NOT_DONE: $F already exists (look first)"; exit 1; }; done
[ ! -e "$S/pg18-cold.sha256" ] || { echo "B0_NOT_DONE: a cold copy already exists in S (look first)"; exit 1; }
[ "$(sed -n 1p "$S/old-plans.txt")" = "$(jq -r .services.api.basePlan.path "$LOCK")" ] && [ "$(sed -n 2p "$S/old-plans.txt")" = "$(jq -r .services.ui.basePlan.path "$LOCK")" ] && [ "$(sed -n 3p "$S/old-plans.txt")" = "$(jq -r .services.runner.basePlan.path "$LOCK")" ] || { echo "B0_NOT_DONE: old-plans.txt is not the lock's three plans"; exit 1; }
for F in $(cat "$S/old-plans.txt"); do [ -s "$F" ] && [ "$(jq -r .publication.registerVersion "$F")" = "$REG0" ] || { echo "B0_NOT_DONE: the old plan $F is missing or not on $REG0"; exit 1; }; done
for D in "$OCAPI" "$OCUI" "$OCRUN"; do [ -d "$D/dialectical-engine" ] || { echo "B0_NOT_DONE: the old release's folder $D is missing"; exit 1; }; done
for U in api ui runner; do [ "$(grep -cF "$OLABEL" /etc/systemd/system/debateai-preview-$U.service.d/zzzzzzzzzz-lifecycle-release.conf || true)" -ge 1 ] || { echo "B0_NOT_DONE: the $U drop-in does not name the old release"; exit 1; }; done
[ "$(grep -c "^MAIL_SENDMAIL_PATH=$OCAPI/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs\$" "$E/api.env")" = 1 ] || { echo "B0_NOT_DONE: api.env's mail line does not name the old release once"; exit 1; }
CID=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true)
IP=$(docker inspect "$CID" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' 2>/dev/null || true)
ALLOW=$(systemctl show -p IPAddressAllow --value debateai-preview-hatchet-gateway.service)
[ -n "$CID" ] && [ -n "$IP" ] && echo " $ALLOW " | grep -qF -e " $IP/32 " -e " $IP " || { echo "B0_NOT_DONE: Hatchet's address is unread or not in the gateway's IPAddressAllow (B2 could not start the gateway again)"; exit 1; }
[ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] && [ "$(gs "$GD" "$PD" | jq -r .in_flight)" = 0 ] && [ "$(gs "$GAN" "$PAN" | jq -r .in_flight)" = 0 ] || { echo "B0_NOT_DONE: a gate is not active, or has a call in flight"; exit 1; }
echo "new migrations: $(tr '\n' ' ' < "$S/new-migrations.txt"); disk free $(df --output=avail -BG / | tail -1 | tr -dc 0-9) GB"
echo B0_DONE
```

### B1. The downtime starts: stop the runner, the backup timer, the website, the API

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# B1: DOWNTIME START. Guards first (nothing is stopped if one fails), then the four stops.
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] || { echo "B1_NOT_DONE: a debate is queued or running (nothing was stopped)"; exit 1; }
cmp -s "$S/native-plan.before.json" "$NP" && cmp -s "$S/release-lock.before.json" "$LOCK" || { echo "B1_NOT_DONE: native-plan.json or the lock moved (nothing was stopped)"; exit 1; }
for F in api.env runner.env ui.env; do cmp -s "$S/$F.before" "$E/$F" || { echo "B1_NOT_DONE: $F moved (nothing was stopped)"; exit 1; }; done
[ "$(gs "$GD" "$PD" | jq -r .in_flight)" = 0 ] && [ "$(gs "$GAN" "$PAN" | jq -r .in_flight)" = 0 ] || { echo "B1_NOT_DONE: a gate has a call in flight (nothing was stopped)"; exit 1; }
date -u +%s >> "$S/downtime-start-epoch"; echo "DOWNTIME START $(date -u)"
for U in debateai-preview-runner debateai-preview-backup.timer debateai-preview-ui debateai-preview-api; do systemctl stop "$U" || { echo "B1_NOT_DONE: systemctl stop $U failed"; exit 1; }; done
RS=$(systemctl is-active debateai-preview-runner || true); echo "runner $RS"
case "$RS" in inactive|failed) ;; *) echo "B1_NOT_DONE: the runner is still $RS"; exit 1;; esac
for U in debateai-preview-ui debateai-preview-api debateai-preview-backup.timer; do [ "$(systemctl is-active "$U" || true)" = inactive ] || { echo "B1_NOT_DONE: $U is not inactive"; exit 1; }; done
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] || { echo "B1_NOT_DONE: a debate was admitted during the stop (it would land in the cold copy): ask"; exit 1; }
C=x; for i in $(seq 1 15); do C=$(psqlq "SELECT count(*) FROM pg_stat_activity WHERE datname='debateai' AND backend_type='client backend' AND pid<>pg_backend_pid()"); [ "$C" = 0 ] && break; sleep 2; done
[ "$C" = 0 ] || { echo "B1_NOT_DONE: $C database client(s) still connected"; exit 1; }
echo B1_DONE
```

The runner of R18 and older prints `failed` here and sends one false "runner failed" email. That is the planned
stop.

### B2. The cold copy of the database cluster

This is R17's method (W2-02). After B3 this copy is the only way back.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# B2: stop the gateway, Hatchet, PostgreSQL; tar the data folder and its config into S; check; start them again.
PGP=/var/lib/postgresql/18; SOCK=/run/debateai-v3-preview/postgresql
LEDGER0=$(cat "$S/ledger-before"); REG0=$(cat "$S/register-before")
for U in runner ui api; do case "$(systemctl is-active debateai-preview-$U || true)" in inactive|failed) ;; *) echo "B2_NOT_DONE: $U is running (B1 first)"; exit 1;; esac; done
[ "$(psqlq "SELECT count(*) FROM pg_stat_activity WHERE datname='debateai' AND backend_type='client backend' AND pid<>pg_backend_pid()")" = 0 ] || { echo "B2_NOT_DONE: database clients connected"; exit 1; }
[ ! -e "$S/pg18-v3-preview-cold.tgz" ] && [ ! -e "$S/pg18-v3-preview-config.tgz" ] && [ ! -e "$S/pg18-cold.sha256" ] || { echo "B2_NOT_DONE: an earlier cold copy exists in S (look first)"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "B2_NOT_DONE: the ledger or the register moved since A1"; exit 1; }
SIZE=$(du -sm "$PGP/v3-preview" | cut -f1); AVAIL=$(df --output=avail -BM / | tail -1 | tr -dc 0-9)
[ "$AVAIL" -gt $((SIZE * 2 + 2048)) ] || { echo "B2_NOT_DONE: not enough free space for the copy"; exit 1; }
CID0=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true)
IP0=$(docker inspect "$CID0" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' 2>/dev/null || true)
[ -n "$CID0" ] && [ -n "$IP0" ] || { echo "B2_NOT_DONE: the Hatchet container or its address is unread"; exit 1; }
systemctl stop debateai-preview-hatchet-gateway debateai-preview-hatchet debateai-preview-postgresql || { echo "B2_NOT_DONE: a stop failed (look at the three units first)"; exit 1; }
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = inactive ] || { echo "B2_NOT_DONE: $U is not inactive (nothing copied)"; exit 1; }; done
umask 077
tar -C "$PGP" -czf "$S/pg18-v3-preview-cold.tgz" v3-preview || { echo "B2_NOT_DONE: the data tar failed; the database is STOPPED"; exit 1; }
tar -C /etc/debateai-v3-preview -czf "$S/pg18-v3-preview-config.tgz" postgresql || { echo "B2_NOT_DONE: the config tar failed; the database is STOPPED"; exit 1; }
sha256sum "$S/pg18-v3-preview-cold.tgz" "$S/pg18-v3-preview-config.tgz" > "$S/pg18-cold.sha256"
umask 022
sha256sum -c --quiet "$S/pg18-cold.sha256" || { echo "B2_NOT_DONE: the copy does not match its own sha256; the database is STOPPED"; exit 1; }
cat "$S/pg18-cold.sha256"
systemctl start debateai-preview-postgresql || { echo "B2_NOT_DONE: PostgreSQL did not start"; exit 1; }
for i in $(seq 1 30); do /usr/lib/postgresql/18/bin/pg_isready -q -h "$SOCK" -p 5434 && break; sleep 2; done
/usr/lib/postgresql/18/bin/pg_isready -h "$SOCK" -p 5434 || { echo "B2_NOT_DONE: PostgreSQL is not ready"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] || { echo "B2_NOT_DONE: the ledger changed across the copy"; exit 1; }
systemctl start debateai-preview-hatchet || { echo "B2_NOT_DONE: Hatchet did not start"; exit 1; }
CID=; for i in $(seq 1 30); do CID=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true); [ -n "$CID" ] && break; sleep 2; done
IP=$(docker inspect "$CID" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' || true)
[ "$CID" = "$CID0" ] && [ "$IP" = "$IP0" ] || { echo "B2_NOT_DONE: the Hatchet container or address changed; the gateway is NOT started: stop and ask"; exit 1; }
ALLOW=$(systemctl show -p IPAddressAllow --value debateai-preview-hatchet-gateway.service)
echo " $ALLOW " | grep -qF -e " $IP/32 " -e " $IP " || { echo "B2_NOT_DONE: Hatchet's address is not in the gateway's IPAddressAllow; the gateway is NOT started"; exit 1; }
W=$(/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin /usr/local/bin/node /opt/debateai-v3-preview/operator/gateway/gateway-route-witness.mjs check 2>&1) || { echo "$W" | cut -c1-400; echo "B2_NOT_DONE: the gateway witness check refused; the gateway is NOT started"; exit 1; }
echo "$W" | grep -q PASS || { echo "B2_NOT_DONE: the gateway witness did not say PASS; the gateway is NOT started"; exit 1; }
systemctl start debateai-preview-hatchet-gateway.service || { echo "B2_NOT_DONE: the gateway did not start"; exit 1; }
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = active ] || { echo "B2_NOT_DONE: $U is not active"; exit 1; }; done
echo B2_DONE
```

The witness runs `check` only, never `write`. R19's copy was 18 MB and took 8 seconds.

### B3. The migrations

`apply-and-plan` takes `hostedBilling` from `--from`, the live verify plan, and it refuses `--hosted-billing`
(`ARGUMENTS_REFUSED`). Its own proposal is discarded: B4 publishes A8's plan, which the owner approved.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# B3: apply this release's migrations (forward-only). From the native operator's start on, the way back is rbB.
LEDGER0=$(cat "$S/ledger-before"); REG0=$(cat "$S/register-before")
[ -s "$S/new-migrations.txt" ] || { echo "B3_SKIPPED: this release adds no migration"; exit 0; }
for U in runner ui api; do case "$(systemctl is-active debateai-preview-$U || true)" in inactive|failed) ;; *) echo "B3_NOT_DONE: $U is running"; exit 1;; esac; done
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = active ] || { echo "B3_NOT_DONE: $U is not active (B2 not finished)"; exit 1; }; done
sha256sum -c --quiet "$S/pg18-cold.sha256" || { echo "B3_NOT_DONE: no checked cold copy in S (B2 first)"; exit 1; }
cmp -s "$S/native-plan.before.json" "$NP" || { echo "B3_NOT_DONE: native-plan.json is not the live verify plan"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "B3_NOT_DONE: the ledger or the register moved"; exit 1; }
[ ! -e "$ART/native-plan-apply-and-plan.json" ] && [ ! -e "$ART/native-apply-and-plan.json" ] || { echo "B3_NOT_DONE: earlier apply-and-plan files exist (look first)"; exit 1; }
rel native-plan --operation apply-and-plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-apply-and-plan.json" || { echo "B3_NOT_DONE: the release tool refused the plan (nothing applied)"; exit 1; }
[ "$(jq -r .operation "$ART/native-plan-apply-and-plan.json")" = apply-and-plan ] && [ "$(jq -r .sourceRevision "$ART/native-plan-apply-and-plan.json")" = "$REV" ] && [ "$(jq -r '.hostedBilling.billing // "none"' "$ART/native-plan-apply-and-plan.json")" = on ] || { echo "B3_NOT_DONE: the plan is not this release's billing-on apply-and-plan (nothing applied)"; exit 1; }
restore() { put "$S/native-plan.before.json" && echo VERIFY_PLAN_RESTORED; }
trap 'restore || echo "VERIFY_PLAN_NOT_RESTORED: put $S/native-plan.before.json back by hand"' EXIT
put "$ART/native-plan-apply-and-plan.json" || { echo "B3_NOT_DONE: put failed (nothing applied)"; exit 1; }
OUT=$(nat "$ART/native-apply-and-plan.json"); echo "nat: $OUT"
trap - EXIT
restore || { echo "B3_NOT_DONE: put $S/native-plan.before.json back by hand"; exit 1; }
LEDGER=$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration"); echo "ledger $LEDGER"
[ "$OUT" = "exit 0" ] || { head -c 1200 "$ART/native-apply-and-plan.json"; echo; echo "B3_NOT_DONE: the native operator refused (from here the way back is rbB)"; exit 1; }
for M in $(cat "$S/new-migrations.txt"); do [ "$(psqlq "SELECT count(*) FROM public.debateai_schema_migration WHERE name = '$M'")" = 1 ] || { echo "B3_NOT_DONE: $M is not in the ledger"; exit 1; }; done
[ "$LEDGER" = "$(( ${LEDGER0%%|*} + $(grep -c . "$S/new-migrations.txt") ))|$(LC_ALL=C sort "$S/new-migrations.txt" | tail -n 1)" ] || { echo "B3_NOT_DONE: the ledger is not the old one plus exactly this release's migrations"; exit 1; }
[ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "B3_NOT_DONE: the newest register moved"; exit 1; }
echo B3_DONE
```

R19: about 1.5 minutes. The ledger went from `139|0120_reply_measures.sql` to `141|0122_engine_map_check.sql`, and
four new tables appeared: `ledger.point_investigation`, `ledger.verdict_vote`, `core.map_item_rests_on` and
`core.map_answer_check`. A release can add a check of its own tables here.

### B4. Publish, the verify plan, the first proof, the three launch plans

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# B4: publish A8's plan with the owner's yes; then the verify plan for the new version, the first proof and the three
# launch plans from the lock's plans with --publication. No runner prepare-only check (its proof is valid 180 s).
YES='<the deltaSha256 the owner approved, in full>'
REG0=$(cat "$S/register-before"); VNEXT=$((REG0 + 1))
for U in runner ui api; do case "$(systemctl is-active debateai-preview-$U || true)" in inactive|failed) ;; *) echo "B4_NOT_DONE: $U is running"; exit 1;; esac; done
cmp -s "$S/native-plan.before.json" "$NP" || { echo "B4_NOT_DONE: native-plan.json is not the live verify plan"; exit 1; }
[ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "B4_NOT_DONE: the newest register is not $REG0"; exit 1; }
for M in $(cat "$S/new-migrations.txt"); do [ "$(psqlq "SELECT count(*) FROM public.debateai_schema_migration WHERE name = '$M'")" = 1 ] || { echo "B4_NOT_DONE: $M is not applied (B3 first)"; exit 1; }; done
sha256sum -c --quiet "$S/plan-proposal.sha256" || { echo "B4_NOT_DONE: the plan or the proposal changed since A8"; exit 1; }
[ "$(jq -r .deltaSha256 "$ART/register-proposal.json")" = "$YES" ] && [ "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" = "$REG0" ] || { echo "B4_NOT_DONE: the proposal is not the approved one"; exit 1; }
for F in native-plan-publish.json register-published.json native-plan-verify.json native-first-verify.json api-launch.json ui-launch.json runner-launch.json; do [ ! -e "$ART/$F" ] || { echo "B4_NOT_DONE: $F exists (look first)"; exit 1; }; done
OLDA=$(sed -n 1p "$S/old-plans.txt"); OLDU=$(sed -n 2p "$S/old-plans.txt"); OLDR=$(sed -n 3p "$S/old-plans.txt")
[ "$OLDA" = "$(jq -r .services.api.basePlan.path "$LOCK")" ] && [ "$OLDU" = "$(jq -r .services.ui.basePlan.path "$LOCK")" ] && [ "$OLDR" = "$(jq -r .services.runner.basePlan.path "$LOCK")" ] || { echo "B4_NOT_DONE: old-plans.txt is not the lock's three plans"; exit 1; }
DONE=no
cleanup() { [ "$DONE" = yes ] || { put "$S/native-plan.before.json" && echo "the old verify plan is back"; } || echo "the old verify plan is NOT back: put it by hand"; }
trap cleanup EXIT
rel native-plan --operation publish --from "$ART/native-plan-plan.json" --proposal "$ART/register-proposal.json" --approved-delta-sha256 "$YES" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-publish.json" || { echo "B4_NOT_DONE: the release tool refused the publish plan (nothing published)"; exit 1; }
put "$ART/native-plan-publish.json" || { echo "B4_NOT_DONE: put of the publish plan failed (nothing published)"; exit 1; }
OUT=$(nat "$ART/register-published.json"); echo "nat: $OUT"
[ "$OUT" = "exit 0" ] || { head -c 800 "$ART/register-published.json"; echo; echo "B4_NOT_DONE: the publish was refused (PREVIEW_REGISTER_BASE_NOT_CURRENT needs a new plan and a new yes)"; exit 1; }
V=$(jq -r .publication.registerVersion "$ART/register-published.json"); echo "new REGISTER_VERSION=$V"
[ "$V" = "$VNEXT" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$V" ] || { echo "B4_NOT_DONE: the published version is not $VNEXT"; exit 1; }
printf '%s\n' "$V" > "$S/new-register-version"
echo "PUBLISHED_$V"
rel native-plan --operation verify --from "$ART/native-plan-publish.json" --publication "$ART/register-published.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-verify.json" || { echo "B4_NOT_DONE: the release tool refused the verify plan (version $V IS published)"; exit 1; }
put "$ART/native-plan-verify.json" || { echo "B4_NOT_DONE: put of the verify plan failed (version $V IS published)"; exit 1; }
OUT=$(nat "$ART/native-first-verify.json"); echo "nat: $OUT"
[ "$OUT" = "exit 0" ] && [ "$(jq -r .publication.registerVersion "$ART/native-first-verify.json")" = "$V" ] || { echo "B4_NOT_DONE: the first proof was refused or does not name $V (version $V IS published)"; exit 1; }
rel launch-plan --service api --from "$OLDA" --root "$CAPI" --source-manifest "$ART/candidate-api-source.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/api-launch.json" || { echo "B4_NOT_DONE: the API launch plan was refused"; exit 1; }
rel launch-plan --service ui --from "$OLDU" --root "$CUI" --source-manifest "$ART/candidate-ui-source.json" --ui-build "$ART/candidate-ui-build.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/ui-launch.json" || { echo "B4_NOT_DONE: the website launch plan was refused"; exit 1; }
rel launch-plan --service runner --from "$OLDR" --root "$CRUN" --source-manifest "$ART/candidate-runner-source.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/runner-launch.json" || { echo "B4_NOT_DONE: the runner launch plan was refused"; exit 1; }
for F in api ui runner; do [ "$(jq -r .publication.registerVersion "$ART/$F-launch.json")" = "$V" ] || { echo "B4_NOT_DONE: the $F launch plan does not carry $V"; exit 1; }; done
MX=$(jq -r '.. | objects | select(has("mailExecutable")) | .mailExecutable' "$ART/api-launch.json" | head -n 1); echo "mailExecutable $MX"
[ "$MX" = "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs" ] && [ -f "$MX" ] || { echo "B4_NOT_DONE: the API plan's mail program is not this release's"; exit 1; }
cmp -s "$ART/native-plan-verify.json" "$NP" || { echo "B4_NOT_DONE: native-plan.json is not version $V's verify plan"; exit 1; }
DONE=yes; trap - EXIT
echo B4_DONE
```

- **If B4 stops after `PUBLISHED_<V>`**, the new version stays published, and the trap has put the old verify plan
  back. There are two ways on:
  - forward, by hand, in a root shell after `. /root/preview-archive/rNN-names.sh`. Never publish a second time: a
    fresh `publicationId` meets the version already written and is refused.
    1. Set `V=$(cat "$S/new-register-version")`, and `OLDA`, `OLDU`, `OLDR` from `$S/old-plans.txt` (lines 1 to 3).
    2. Continue from the first B4 line whose output file is missing. The tool never overwrites a file, so a line
       whose `--out` exists refuses with `OUTPUT_EXISTS`.
    3. If `native-plan-verify.json` exists, start with `put "$ART/native-plan-verify.json"`. If
       `native-first-verify.json` is missing, run `nat` for it and check its `exit 0`.
    4. Finish with `cmp "$ART/native-plan-verify.json" "$NP"`: B5 and B6 need the new verify plan in place.
  - back: rbB.
- R19 published register 17 (publication `f783ddf7-…`) in about 6 minutes.

### B5. The two env edits

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# B5: REGISTER_VERSION in api.env and runner.env; MAIL_SENDMAIL_PATH (api.env) to this release's mail program. Nothing else.
REG0=$(cat "$S/register-before"); V=$(cat "$S/new-register-version")
for U in runner ui api; do case "$(systemctl is-active debateai-preview-$U || true)" in inactive|failed) ;; *) echo "B5_NOT_DONE: $U is running"; exit 1;; esac; done
cmp -s "$ART/native-plan-verify.json" "$NP" || { echo "B5_NOT_DONE: native-plan.json is not version $V's verify plan (B4 first)"; exit 1; }
for F in api.env runner.env ui.env; do cmp -s "$S/$F.before" "$E/$F" || { echo "B5_NOT_DONE: $F differs from its copy before the edit"; exit 1; }; done
for F in api.env runner.env; do [ "$(grep -c "^REGISTER_VERSION=$REG0\$" "$E/$F")" = 1 ] && [ "$(grep -c '^REGISTER_VERSION=' "$E/$F")" = 1 ] || { echo "B5_NOT_DONE: REGISTER_VERSION is not $REG0 exactly once in $F"; exit 1; }; done
MX=$(jq -r '.. | objects | select(has("mailExecutable")) | .mailExecutable' "$ART/api-launch.json" | head -n 1)
[ "$MX" = "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs" ] && [ "$(grep -c "^MAIL_SENDMAIL_PATH=$OCAPI/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs\$" "$E/api.env")" = 1 ] && [ "$(grep -c '^MAIL_SENDMAIL_PATH=' "$E/api.env")" = 1 ] || { echo "B5_NOT_DONE: the mail line is not the old release's, once"; exit 1; }
[ "$(grep -F "$OLABEL" "$E/api.env" | grep -vc '^MAIL_SENDMAIL_PATH=' || true)" = 0 ] && [ "$(grep -cF "$OLABEL" "$E/runner.env" || true)" = 0 ] || { echo "B5_NOT_DONE: another env line names the old release"; exit 1; }
MA=$(stat -c '%a %U:%G' "$E/api.env"); MR=$(stat -c '%a %U:%G' "$E/runner.env")
sed -i "s/^REGISTER_VERSION=$REG0\$/REGISTER_VERSION=$V/" "$E/api.env" "$E/runner.env"
sed -i "s#^MAIL_SENDMAIL_PATH=$OCAPI/#MAIL_SENDMAIL_PATH=$CAPI/#" "$E/api.env"
for F in api.env runner.env; do [ "$(grep -c "^REGISTER_VERSION=$V\$" "$E/$F")" = 1 ] && [ "$(grep -c '^REGISTER_VERSION=' "$E/$F")" = 1 ] && [ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$E/$F")" = 1 ] || { echo "B5_NOT_DONE: $F is not version $V, hosted (way back: rbB)"; exit 1; }; done
[ "$(grep -c "^MAIL_SENDMAIL_PATH=$MX\$" "$E/api.env")" = 1 ] || { echo "B5_NOT_DONE: the mail line is not this release's (way back: rbB)"; exit 1; }
grep -E '^(REGISTER_VERSION|DEBATEAI_DEPLOYMENT_MODE|MAIL_SENDMAIL_PATH)=' "$E/api.env" "$E/runner.env"
diff <(grep -vE '^(REGISTER_VERSION|MAIL_SENDMAIL_PATH)=' "$S/api.env.before") <(grep -vE '^(REGISTER_VERSION|MAIL_SENDMAIL_PATH)=' "$E/api.env") >/dev/null && diff <(grep -vE '^REGISTER_VERSION=' "$S/runner.env.before") <(grep -vE '^REGISTER_VERSION=' "$E/runner.env") >/dev/null && cmp -s "$S/ui.env.before" "$E/ui.env" || { echo "B5_NOT_DONE: another line changed (way back: rbB)"; exit 1; }
[ -z "$(grep -oE '^[A-Z_][A-Z0-9_]*=' "$E/api.env" | sort | uniq -d)" ] && [ -z "$(grep -oE '^[A-Z_][A-Z0-9_]*=' "$E/runner.env" | sort | uniq -d)" ] || { echo "B5_NOT_DONE: a duplicate key"; exit 1; }
[ "$(stat -c '%a %U:%G' "$E/api.env")" = "$MA" ] && [ "$(stat -c '%a %U:%G' "$E/runner.env")" = "$MR" ] || { echo "B5_NOT_DONE: a mode or an owner changed"; exit 1; }
diff <(grep -E '^(PREVIEW_PROVIDER_TEST_CONFIG_JSON|PREVIEW_TEAM_USER_IDS_JSON)=' "$E/api.env") <(grep -E '^(PREVIEW_PROVIDER_TEST_CONFIG_JSON|PREVIEW_TEAM_USER_IDS_JSON)=' "$E/runner.env") >/dev/null && diff <(grep -E '^(DEBATEAI_DEPLOYMENT_MODE|REGISTER_VERSION)=' "$E/api.env" | sort) <(grep -E '^(DEBATEAI_DEPLOYMENT_MODE|REGISTER_VERSION)=' "$E/runner.env" | sort) >/dev/null || { echo "B5_NOT_DONE: a SAME check differs (config and team; mode and version)"; exit 1; }
echo B5_DONE
```

The hosted keys, the NETOPIA, Quaderno and SmartBill paths, the B-1 thinking table and Haiku's `slip_fix` line all
stay byte for byte: the `diff` lines prove it. The last two lines are the two SAME checks of
`deploy/preview-auth-dev/v1/README.md` "Operator checks before the first start".

### B6. Pin, then start the API, then the website (the downtime ends)

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# B6: pin the three plans, regenerate the three drop-ins, daemon-reload; start the API (wait for its start line naming
# REV), then the website (/login 200: the downtime ends), then the backup timer. Not the runner (B7).
V=$(cat "$S/new-register-version")
for U in runner ui api; do case "$(systemctl is-active debateai-preview-$U || true)" in inactive|failed) ;; *) echo "B6_NOT_DONE: $U is running"; exit 1;; esac; done
cmp -s "$ART/native-plan-verify.json" "$NP" && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$V" ] || { echo "B6_NOT_DONE: B4 is not done"; exit 1; }
[ "$(grep -c "^REGISTER_VERSION=$V\$" "$E/api.env")" = 1 ] && [ "$(grep -c "^REGISTER_VERSION=$V\$" "$E/runner.env")" = 1 ] && [ "$(grep -c "^MAIL_SENDMAIL_PATH=$CAPI/" "$E/api.env")" = 1 ] || { echo "B6_NOT_DONE: B5 is not done"; exit 1; }
pin1() { local out; out=$(pre pin --from "$1") || { echo "$out"; return 1; }; echo "$out"; echo "$out" | grep -q '"event":"PREVIEW_LIFECYCLE_RELEASE_PINNED"' && echo "$out" | grep -q "\"sourceRevision\":\"$REV\"" && echo "$out" | grep -q "\"registerVersion\":\"$V\""; }
drop1() { local Dp=/etc/systemd/system/debateai-preview-$1.service.d/zzzzzzzzzz-lifecycle-release.conf; pre dropin --service "$1" > "$Dp.new" && chmod 0644 "$Dp.new" && mv "$Dp.new" "$Dp" && [ "$(grep -cF "$LABEL" "$Dp")" -ge 1 ] && [ "$(grep -cF "$OLABEL" "$Dp" || true)" = 0 ]; }
PINNED=no
pin1 "$ART/api-launch.json" && pin1 "$ART/ui-launch.json" && pin1 "$ART/runner-launch.json" && drop1 api && drop1 ui && drop1 runner && systemctl daemon-reload && PINNED=yes
[ "$PINNED" = yes ] || { echo "B6_NOT_DONE: a pin, a drop-in or daemon-reload did not finish; nothing was started (way back: rbB)"; exit 1; }
[ "$(jq -r --arg r "$REV" --arg v "$V" '[.services[] | select(.sourceRevision == $r and .publication.registerVersion == $v)] | length' "$LOCK")" = 3 ] || { echo "B6_NOT_DONE: the lock does not name this release on $V three times"; exit 1; }
T0=$(date +%s)
systemctl start debateai-preview-api || echo "systemctl start api returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; [ "$(systemctl is-active debateai-preview-api || true)" = failed ] && break; sleep 3; done
journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep -E 'PREVIEW_LIFECYCLE_PRESTART_(READY|REFUSED)|PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED' | cut -c1-300 || true
[ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" = 0 ] || { echo "B6_NOT_DONE: the API refused to start; the website and the runner are left stopped"; exit 1; }
[ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep 'PREVIEW_API_STARTED' | grep -c "\"sourceRevision\":\"$REV\"" || true)" -ge 1 ] && [ "$(systemctl is-active debateai-preview-api || true)" = active ] || { echo "B6_NOT_DONE: the API did not start on this release; the website and the runner are left stopped"; exit 1; }
systemctl start debateai-preview-ui || echo "systemctl start ui returned non-zero"
c=000; for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login || true); [ "$c" = 200 ] && break; sleep 3; done
[ "$c" = 200 ] || { echo "B6_NOT_DONE: the website does not answer /login with 200; the runner is left stopped"; exit 1; }
echo "DOWNTIME END $(date -u) ($(( $(date +%s) - $(tail -n 1 "$S/downtime-start-epoch") )) s)"
systemctl start debateai-preview-backup.timer && [ "$(systemctl is-active debateai-preview-backup.timer || true)" = active ] || { echo "B6_NOT_DONE: the backup timer did not start (the API and the website are up)"; exit 1; }
echo B6_DONE
```

### B7. The runner, by hand

B1 stopped the runner, so it is started with `systemctl start`, never `try-restart` (which restarts only a running
unit and would leave it down). It starts only when nothing is claimable and both gates are active.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# B7: start this release's runner by hand. Refuses on any start-up, register, engine, capacity or login refusal line.
V=$(cat "$S/new-register-version")
case "$(systemctl is-active debateai-preview-runner || true)" in inactive|failed) ;; *) echo "B7_NOT_DONE: the runner is already running"; exit 1;; esac
[ "$(systemctl is-active debateai-preview-api || true)" = active ] && [ "$(systemctl is-active debateai-preview-ui || true)" = active ] || { echo "B7_NOT_DONE: the API or the website is not active (B6 first)"; exit 1; }
[ "$(jq -r .services.runner.sourceRevision "$LOCK")" = "$REV" ] && [ "$(jq -r .services.runner.publication.registerVersion "$LOCK")" = "$V" ] && [ "$(grep -c "^REGISTER_VERSION=$V\$" "$E/runner.env")" = 1 ] || { echo "B7_NOT_DONE: the runner's pin or runner.env is not this release on $V"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE run_id IS NOT NULL AND (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))")" = 0 ] || { echo "B7_NOT_DONE: something is claimable; the runner is not started (ask)"; exit 1; }
[ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "B7_NOT_DONE: a spending gate is not active; the runner is not started"; exit 1; }
T0=$(date +%s)
systemctl start debateai-preview-runner || echo "systemctl start runner returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u debateai-preview-runner --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u debateai-preview-runner --since "@$T0" -o cat --no-pager | grep 'PREVIEW_RUNNER_STARTED' | grep -c "\"sourceRevision\":\"$REV\"" || true)" -ge 1 ] || { echo "B7_NOT_DONE: no PREVIEW_RUNNER_STARTED naming REV"; exit 1; }
sleep 20
BADL=$(journalctl -u debateai-preview-runner --since "@$T0" -o cat --no-pager | grep -E 'GATE_CAPACITY_UNREAD|UNAUTHENTICATED|STARTUP_REFUSED|PRESTART_REFUSED|STOPPED_ON_FAILURE|_MISMATCH|_UNSEALED|ENGINE_REQUIRES|ENGINE_[A-Z_]*REFUSED|REGISTER_[A-Z_]*REFUSED' || true)
[ -z "$BADL" ] || { echo "$BADL" | cut -c1-300; echo "B7_NOT_DONE: a refusal, capacity or login line in the runner's journal (above)"; exit 1; }
[ "$(systemctl is-active debateai-preview-runner || true)" = active ] && [ "$(systemctl show -p NRestarts --value debateai-preview-runner)" = 0 ] || { echo "B7_NOT_DONE: the runner is not active with NRestarts 0 after 20 s"; exit 1; }
echo B7_DONE
```

R19's runner was back 2 minutes after the website. Debates cannot start until it runs, though the site is up.

### B8. The checks (read-only)

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# B8: read-only. Every check prints OK or BAD; the last line is the verdict.
V=$(cat "$S/new-register-version"); BAD=0
ok() { echo "OK   $1"; }; bad() { echo "BAD  $1"; BAD=$((BAD + 1)); }
for U in api runner; do M=$(journalctl --no-pager -o cat -u debateai-preview-$U _SYSTEMD_INVOCATION_ID="$(systemctl show -p InvocationID --value debateai-preview-$U)" | grep -o '"deploymentMode":"[a-z]*"' | sort -u || true); if [ "$M" = '"deploymentMode":"hosted"' ]; then ok "HOSTED_$U"; else bad "HOSTED_$U"; fi; done
for U in api ui runner provider-budget anthropic-budget postgresql hatchet hatchet-gateway turnstile egress; do if [ "$(systemctl is-active debateai-preview-$U || true)" = active ] && [ "$(systemctl show -p NRestarts --value debateai-preview-$U)" = 0 ]; then ok "ACTIVE_$U"; else bad "ACTIVE_$U"; fi; done
if [ "$(systemctl --failed --no-legend --plain | grep -c debateai || true)" = 0 ]; then ok NO_FAILED_DEBATEAI_UNIT; else bad NO_FAILED_DEBATEAI_UNIT; fi
if [ "$(systemctl is-active debateai-preview-backup.timer || true)" = active ]; then ok BACKUP_TIMER_ACTIVE; else bad BACKUP_TIMER_ACTIVE; fi
for F in api.env runner.env; do if [ "$(grep -c "^REGISTER_VERSION=$V\$" "$E/$F")" = 1 ] && [ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$E/$F")" = 1 ]; then ok "ENV_${V}_HOSTED_$F"; else bad "ENV_${V}_HOSTED_$F"; fi; done
for U in api runner; do if [ "$(ps -o args= -p "$(systemctl show -p MainPID --value debateai-preview-$U)" | grep -c "auth-dev-candidate-$LABEL-$U/" || true)" = 1 ]; then ok "RUNS_THIS_RELEASE_$U"; else bad "RUNS_THIS_RELEASE_$U"; fi; done
echo "ledger $(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")"
if [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$V" ]; then ok "REGISTER_$V"; else bad "REGISTER_$V"; fi
if [ "$(jq -r --arg r "$REV" --arg v "$V" '[.services[] | select(.sourceRevision == $r and .publication.registerVersion == $v)] | length' "$LOCK")" = 3 ]; then ok LOCK_THREE_TIMES; else bad LOCK_THREE_TIMES; fi
if cmp -s "$ART/native-plan-verify.json" "$NP"; then ok NP_IS_THE_NEW_VERIFY_PLAN; else bad NP_IS_THE_NEW_VERIFY_PLAN; fi
if [ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ]; then ok BOTH_GATES_ACTIVE; else bad BOTH_GATES_ACTIVE; fi
NC=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notify || true)
if [ "$NC" = 503 ]; then ok NOTIFY_503; else bad "NOTIFY_503 (got $NC)"; fi
BC=$(systemd-run --quiet --pipe --wait --collect --uid="$AU" --gid="$AGRP" --property=EnvironmentFile="$E/api.env" --setenv=NODE_USE_ENV_PROXY=1 --setenv=HTTPS_PROXY=http://127.0.0.1:3180 '--setenv=NO_PROXY=localhost,127.0.0.1,[::1],v3-preview.dezbatere.ro' --working-directory="$CAPI/dialectical-engine" "$N" --import tsx apps/api/src/billing/check-cli.ts 2>&1 || true)
echo "$BC" | grep -vE 'DeprecationWarning|trace-deprecation' || true
if echo "$BC" | grep -q '^1 of 16 checks need attention\.$' && [ "$(echo "$BC" | grep -c '^✗' || true)" = 1 ] && echo "$BC" | grep '^✗' | grep -q placeholders; then ok BILLING_CHECK_15_OF_16; else bad BILLING_CHECK_15_OF_16; fi
journalctl --no-pager -u debateai-preview-api _SYSTEMD_INVOCATION_ID="$(systemctl show --property=InvocationID --value debateai-preview-api)" | grep -oE 'credentials_refused|notice\.unverified|status_failed|BILLING_[A-Z_]+_PENDING' | sort | uniq -c || echo "(no billing line)"
if [ "$BAD" = 0 ]; then echo B8_DONE; else echo "B8_NOT_DONE: $BAD check(s) BAD"; exit 1; fi
```

- The billing check asks NETOPIA's sandbox one status question about a made-up order, so nothing is charged. Its one
  cross is the plans line: this host keeps placeholder EUR and RON prices.
- In the billing journal only `billing.notice.unverified` lines (one per check run, and one every 5 minutes from the
  notify alarm, H10) are expected.
- Then add the release's own checks. R19 added two:
  - the 24 regions in register 17's `countryPolicy`, equal to the approved proposal's value;
  - the region decisions of R19's own code on that live row.
- Finally, the owner starts one short real debate on the site, and it must finish.

### The way back

**rbA: before B3 (no migration ran, nothing published, nothing pinned, no env edit).** It starts the old release
exactly as it was. Give it one word, `yes` or `no`, for the runner (`bash -s -- yes`). If B2 stopped half way, it
refuses: finish B2's restart part by hand first (PostgreSQL, Hatchet, the witness `check` must say `PASS`, then the
gateway).

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# rbA: start the old release as it was. Only before B3.
RUNNER=${1:-}
[ "$RUNNER" = yes ] || [ "$RUNNER" = no ] || { echo "RBA_NOT_DONE: say yes or no for the runner (bash -s -- yes)"; exit 1; }
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = active ] || { echo "RBA_NOT_DONE: $U is not active (bring the database side back first)"; exit 1; }; done
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$(cat "$S/ledger-before")" ] || { echo "RBA_NOT_DONE: a migration ran: use rbB"; exit 1; }
[ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$(cat "$S/register-before")" ] || { echo "RBA_NOT_DONE: a version was published: use rbB"; exit 1; }
cmp -s "$S/native-plan.before.json" "$NP" && cmp -s "$S/release-lock.before.json" "$LOCK" || { echo "RBA_NOT_DONE: native-plan.json or the lock moved: use rbB"; exit 1; }
for F in api.env runner.env ui.env; do cmp -s "$S/$F.before" "$E/$F" || { echo "RBA_NOT_DONE: $F moved: use rbB"; exit 1; }; done
for U in api ui runner; do [ "$(grep -cF "$OLABEL" /etc/systemd/system/debateai-preview-$U.service.d/zzzzzzzzzz-lifecycle-release.conf || true)" -ge 1 ] || { echo "RBA_NOT_DONE: the $U drop-in does not name the old release: use rbB"; exit 1; }; done
T0=$(date +%s)
systemctl start debateai-preview-api || echo "systemctl start api returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep 'PREVIEW_API_STARTED' | grep -c "\"sourceRevision\":\"$OREV\"" || true)" -ge 1 ] || { echo "RBA_NOT_DONE: no PREVIEW_API_STARTED naming the old release"; exit 1; }
systemctl start debateai-preview-ui || echo "systemctl start ui returned non-zero"
c=000; for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login || true); [ "$c" = 200 ] && break; sleep 3; done
[ "$c" = 200 ] || { echo "RBA_NOT_DONE: the website does not answer /login with 200"; exit 1; }
echo "DOWNTIME END (rbA) $(date -u)"
systemctl start debateai-preview-backup.timer || { echo "RBA_NOT_DONE: the backup timer did not start (the API and the website are up)"; exit 1; }
if [ "$RUNNER" = yes ]; then
  [ "$(psqlq "SELECT count(*) FROM core.work_item WHERE run_id IS NOT NULL AND (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))")" = 0 ] && [ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "RBA_NOT_DONE: something is claimable or a gate is not active; the runner is left stopped"; exit 1; }
  T1=$(date +%s); systemctl start debateai-preview-runner || echo "systemctl start runner returned non-zero"
  for i in $(seq 1 80); do [ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
  [ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep 'PREVIEW_RUNNER_STARTED' | grep -c "\"sourceRevision\":\"$OREV\"" || true)" -ge 1 ] && [ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep -cE 'GATE_CAPACITY_UNREAD|UNAUTHENTICATED' || true)" = 0 ] || { echo "RBA_NOT_DONE: the old runner did not start cleanly"; exit 1; }
fi
echo RBA_DONE
```

**rbB: from B3 on, at any later point (also after B4 to B8).** Once a migration ran, the old code refuses the
database: its native verify knows only its own migration list. So a re-pin alone cannot work, and the way back is
the cold copy. rbB does the following, in order:
1. it stops everything;
2. it restores B2's cold copy (the current data folder is moved aside, never deleted: it holds secrets, and deleting
   it is the owner's call);
3. it puts back the old verify plan and the three env files from `$S`;
4. it re-pins the old release's three plans, which rebuilds the lock;
5. it writes the drop-ins, then starts the API, the website and the runner.

**Everything written to the database after B2 is lost with it**: the new version, the new tables, and anything
people did on the site since then.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# rbB: restore the cold copy and the old release. From B3 on.
TS=$(date -u +%Y%m%dT%H%M%SZ); PGP=/var/lib/postgresql/18; SOCK=/run/debateai-v3-preview/postgresql
LEDGER0=$(cat "$S/ledger-before"); REG0=$(cat "$S/register-before")
sha256sum -c --quiet "$S/pg18-cold.sha256" || { echo "RBB_NOT_DONE: the cold copy is missing or does not match its sha256 (nothing stopped)"; exit 1; }
for F in native-plan.before.json api.env.before runner.env.before ui.env.before release-lock.before.json old-plans.txt; do [ -s "$S/$F" ] || { echo "RBB_NOT_DONE: $S/$F is missing (nothing stopped)"; exit 1; }; done
OLDA=$(sed -n 1p "$S/old-plans.txt"); OLDU=$(sed -n 2p "$S/old-plans.txt"); OLDR=$(sed -n 3p "$S/old-plans.txt")
[ -s "$OLDA" ] && [ -s "$OLDU" ] && [ -s "$OLDR" ] && [ -d "$OCAPI/dialectical-engine" ] && [ -d "$OCUI/dialectical-engine" ] && [ -d "$OCRUN/dialectical-engine" ] || { echo "RBB_NOT_DONE: the old release's plans or folders are missing (nothing stopped)"; exit 1; }
CC="$S/rbB-config-check-$TS"; install -d -o root -g root -m 0700 "$CC"; tar -C "$CC" -xzf "$S/pg18-v3-preview-config.tgz"
diff -r "$CC/postgresql" /etc/debateai-v3-preview/postgresql >/dev/null || { echo "RBB_NOT_DONE: the live PostgreSQL config differs from the copy's (nothing stopped; look first)"; exit 1; }
MODE0=$(stat -c '%a %U:%G' "$PGP/v3-preview")
for U in debateai-preview-runner debateai-preview-backup.timer debateai-preview-ui debateai-preview-api; do systemctl stop "$U" || true; done
for U in runner ui api; do case "$(systemctl is-active debateai-preview-$U || true)" in inactive|failed) ;; *) echo "RBB_NOT_DONE: $U is still running"; exit 1;; esac; done
CID0=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true)
systemctl stop debateai-preview-hatchet-gateway debateai-preview-hatchet debateai-preview-postgresql || { echo "RBB_NOT_DONE: a stop failed (look first)"; exit 1; }
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = inactive ] || { echo "RBB_NOT_DONE: $U is not inactive (nothing restored)"; exit 1; }; done
[ ! -e "$PGP/v3-preview.after-$TS" ] || { echo "RBB_NOT_DONE: $PGP/v3-preview.after-$TS exists"; exit 1; }
mv "$PGP/v3-preview" "$PGP/v3-preview.after-$TS" || { echo "RBB_NOT_DONE: the data folder could not be moved aside; the database is STOPPED"; exit 1; }
tar -C "$PGP" -xzf "$S/pg18-v3-preview-cold.tgz" || { echo "RBB_NOT_DONE: the restore failed; the old folder is $PGP/v3-preview.after-$TS; the database is STOPPED"; exit 1; }
[ "$(stat -c '%a %U:%G' "$PGP/v3-preview")" = "$MODE0" ] || { echo "RBB_NOT_DONE: the restored folder's mode or owner differs; the database is STOPPED"; exit 1; }
systemctl start debateai-preview-postgresql || { echo "RBB_NOT_DONE: PostgreSQL did not start on the restored folder"; exit 1; }
for i in $(seq 1 30); do /usr/lib/postgresql/18/bin/pg_isready -q -h "$SOCK" -p 5434 && break; sleep 2; done
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "RBB_NOT_DONE: the restored database is not ledger $LEDGER0, register $REG0"; exit 1; }
systemctl start debateai-preview-hatchet || { echo "RBB_NOT_DONE: Hatchet did not start"; exit 1; }
CID=; for i in $(seq 1 30); do CID=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true); [ -n "$CID" ] && break; sleep 2; done
IP=$(docker inspect "$CID" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' || true)
[ -n "$CID" ] && { [ -z "$CID0" ] || [ "$CID" = "$CID0" ]; } || { echo "RBB_NOT_DONE: the Hatchet container is missing or changed; the gateway is NOT started: stop and ask"; exit 1; }
ALLOW=$(systemctl show -p IPAddressAllow --value debateai-preview-hatchet-gateway.service)
echo " $ALLOW " | grep -qF -e " $IP/32 " -e " $IP " || { echo "RBB_NOT_DONE: Hatchet's address is not in the gateway's IPAddressAllow; the gateway is NOT started"; exit 1; }
W=$(/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin /usr/local/bin/node /opt/debateai-v3-preview/operator/gateway/gateway-route-witness.mjs check 2>&1) && echo "$W" | grep -q PASS || { echo "$W" | cut -c1-400; echo "RBB_NOT_DONE: the gateway witness did not say PASS; the gateway is NOT started"; exit 1; }
systemctl start debateai-preview-hatchet-gateway.service || { echo "RBB_NOT_DONE: the gateway did not start"; exit 1; }
put "$S/native-plan.before.json" || { echo "RBB_NOT_DONE: the old verify plan could not be put back"; exit 1; }
for F in api.env runner.env ui.env; do M0=$(stat -c '%a %U:%G' "$E/$F"); cat "$S/$F.before" > "$E/$F"; cmp -s "$S/$F.before" "$E/$F" && [ "$(stat -c '%a %U:%G' "$E/$F")" = "$M0" ] || { echo "RBB_NOT_DONE: $F was not restored with its mode"; exit 1; }; done
pin1() { local out; out=$(pre pin --from "$1") || { echo "$out"; return 1; }; echo "$out"; echo "$out" | grep -q '"event":"PREVIEW_LIFECYCLE_RELEASE_PINNED"' && echo "$out" | grep -q "\"sourceRevision\":\"$OREV\"" && echo "$out" | grep -q "\"registerVersion\":\"$REG0\""; }
drop1() { local Dp=/etc/systemd/system/debateai-preview-$1.service.d/zzzzzzzzzz-lifecycle-release.conf; pre dropin --service "$1" > "$Dp.new" && chmod 0644 "$Dp.new" && mv "$Dp.new" "$Dp" && [ "$(grep -cF "$OLABEL" "$Dp")" -ge 1 ] && [ "$(grep -cF "$LABEL" "$Dp" || true)" = 0 ]; }
PINNED=no
pin1 "$OLDA" && pin1 "$OLDU" && pin1 "$OLDR" && drop1 api && drop1 ui && drop1 runner && systemctl daemon-reload && PINNED=yes
[ "$PINNED" = yes ] || { echo "RBB_NOT_DONE: the re-pin, a drop-in or daemon-reload did not finish; the app services are stopped"; exit 1; }
diff <(jq -S 'del(.services[].pinnedAt)' "$S/release-lock.before.json") <(jq -S 'del(.services[].pinnedAt)' "$LOCK") >/dev/null || { echo "RBB_NOT_DONE: the rebuilt lock differs from its copy beyond the pin times; the app services are stopped"; exit 1; }
T0=$(date +%s)
systemctl start debateai-preview-api || echo "systemctl start api returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep 'PREVIEW_API_STARTED' | grep -c "\"sourceRevision\":\"$OREV\"" || true)" -ge 1 ] || { echo "RBB_NOT_DONE: no PREVIEW_API_STARTED naming the old release"; exit 1; }
systemctl start debateai-preview-ui || echo "systemctl start ui returned non-zero"
c=000; for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login || true); [ "$c" = 200 ] && break; sleep 3; done
[ "$c" = 200 ] || { echo "RBB_NOT_DONE: the website does not answer /login with 200; the runner is left stopped"; exit 1; }
echo "DOWNTIME END (rbB) $(date -u)"
systemctl start debateai-preview-backup.timer || { echo "RBB_NOT_DONE: the backup timer did not start; the runner is left stopped"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE run_id IS NOT NULL AND (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))")" = 0 ] && [ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "RBB_NOT_DONE: something is claimable or a gate is not active; the runner is left stopped (ask)"; exit 1; }
T1=$(date +%s); systemctl start debateai-preview-runner || echo "systemctl start runner returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep 'PREVIEW_RUNNER_STARTED' | grep -c "\"sourceRevision\":\"$OREV\"" || true)" -ge 1 ] && [ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep -cE 'GATE_CAPACITY_UNREAD|UNAUTHENTICATED' || true)" = 0 ] || { echo "RBB_NOT_DONE: the old runner did not start cleanly"; exit 1; }
echo "kept for the owner: $PGP/v3-preview.after-$TS (the database as the new release left it; it holds secrets)"
echo RBB_DONE
```

- **After rbB, the next plan** is made from the restored verify plan (`$S/native-plan.before.json`): its base is the
  version the cold copy brought back.
- **The new release's folders and `$ART`** stay where they are, unused. Keep the old release's folders and plans
  until the next release is live: rbB needs them.
- **Afterwards** (not part of the upload, with the owner's yes): move the practice's server copies (S-7) into `$S`.
  R19 also left `$ART/store-fill`; it is harmless and unused.
