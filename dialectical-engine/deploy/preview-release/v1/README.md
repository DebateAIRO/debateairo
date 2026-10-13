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
Keeping this tool outside it means adding or fixing the tool never adds a file to that set (23
files today). The digest itself still changes whenever any of those 23 files changes, as it does
in this release.

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
| `native-plan --operation plan --from <live verify plan> --source-manifest <candidate api manifest> [--checker glm\|deepseek --deepseek-enabled-on-gate yes] [--role-rotation on\|off] [--call-concurrency '<JSON object>'] --out <file>` | register publication, step 1: the base is the publication the preview runs now (`approval.publication` of the live verify plan: its version and snapshot hash, never typed); no approval. The answer checker stays GLM unless `--checker deepseek` is given together with `--deepseek-enabled-on-gate yes` (your statement that the gate's GO switches DeepSeek on). Role rotation stays on unless `--role-rotation off` is given: the rotation row is then published disabled (the preview's rollback for rotation; a later plan without the flag switches it back on, and its delta shows that row changing). `--call-concurrency` sets the call-concurrency row as one JSON object; without it the current value is kept, or there is no row if the base has none (see "Publishing the call-concurrency row" below). `publish` carries the plan's choices |
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
