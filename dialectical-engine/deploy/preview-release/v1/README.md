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
`r<site version>-<first 12 hex of the release's git revision>`, for example r17-d50e33165a1b
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
`deploy/preview-gate/v3/README.md`, "One deploy session: from GLM only to all five AIs". Since the line-up became a
settings value (side-by-side spec §13 addition D24), the list only sets the new-debate page's fallback list (an older
API), its maximum depth (set = the preview's shallower ceiling) and the ask proxy's time limit: the AIs a debate uses come from its settings version, and the "AI providers" page
follows the API ("The providers page", in "Changing debate settings without an upload").

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
| `launch-plan --service api\|ui\|runner --slot A\|B --from <existing plan> --root <release root> --source-manifest <file> [--ui-build <file>] --native-attestation <file> --out <dir>/<service>-launch.json` | new launch plan: release fields from the manifests, the ports from the slot (A: website 3100, API 3101; B: 3200, 3201; never from `--from`), the env file `/etc/debateai-v3-preview/auth-dev-v1/<service>-<label>.env` of the release the root names (`--root` ends in `-<label>-<service>`), everything else from `--from`; for `--service runner` the API plan may be `--from` (identity from the runner OS account, `runner-<label>.env` custody); `validateLaunchPlan` before writing |
| `native-plan --operation apply-and-plan\|verify --from <existing native plan> --source-manifest <candidate api manifest> --out <file>` | new native plan for a candidate API root; `verify` carries the `approval` of `--from` over unchanged; the reviewed `validateNativePlan` before writing |
| `native-plan --operation plan --from <live verify plan> --source-manifest <candidate api manifest> [--checker glm\|deepseek --deepseek-enabled-on-gate yes] [--role-rotation on\|off] [--call-concurrency '<JSON object>'] [--debate-shape off\|'<JSON object>'] [--question-language '<JSON object>'] [--length-guidance '<JSON object>'] [--line-up <file>] [--answer-seats '<JSON object>'] --out <file>` | register publication, step 1: the base is the publication the preview runs now (`approval.publication` of the live verify plan: its version and snapshot hash, never typed); no approval. The answer checker stays GLM unless `--checker deepseek` is given together with `--deepseek-enabled-on-gate yes` (your statement that the gate's GO switches DeepSeek on). Role rotation stays on unless `--role-rotation off` is given: the rotation row is then published disabled (the preview's rollback for rotation; a later plan without the flag switches it back on, and its delta shows that row changing). `--call-concurrency` sets the call-concurrency row as one JSON object; without it the current value is kept, or there is no row if the base has none (see "Publishing the call-concurrency row" below). `--hosted-billing '<JSON object>'` composes a HOSTED version with publish kit v3 from the owner's billing switch, ceilings and room-read budget (see "Hosted preview with NETOPIA sandbox billing" below); a plan from a hosted base needs it (`HOSTED_BILLING_REQUIRED`). `publish` carries the plan's choices; `verify` and `apply-and-plan` carry `--from`'s hosted inputs. `--debate-shape` sets the debate shape row. `off` publishes it disabled: the start values with `enabled: false`, so the API asks today's shape, and a runner on that version still finishes the debates admitted with the shape. A JSON object (the whole policy, with its kind) publishes that policy; the register's own parser checks it on the server before any row is built. Without the option the current row is kept, or there is none. `--question-language` sets the optional `questionLanguagePolicy` row (the policy without its `kind`; `deploy/vps/register/README.md`); `"fastCheck": null` in it switches the fast language check off. Before anything is sealed the kit asks the API's own question-language boot refusals while the debate shape is in force (a reserved prompt-frame token in the instruction, a fast-check model the preview gate does not list). Without the option the base's row is kept, or there is none (the code's start values). Length guidance (LG-C) is optional: `--length-guidance '<JSON object>'` carries the whole policy, with its `kind`; use `"$(cat dialectical-engine/tools/preview-practice/length-policy-start.json)"` for the owners' start values (the preview practice's start file). The policy is about 4-5 KB, inside the native plan's 32 KiB limit. There is no `off` word: a version without the row is the rollback. Left out, the base's length-guidance row is kept as it is, or none. Only `plan` takes the flag; `publish` carries the plan's choice. The line-up and the answer seats (side-by-side spec §13 addition D23) are optional too. `--line-up <file>` names a root-owned 0644 JSON file in the artifacts folder holding the plan member that `dialectical-engine/tools/preview-practice/check-thinking-levels.ts --print-line-up --settings <api.env>` prints (`{"lineUp":{…}}`), or the bare line-up (`free_model_ids`, `premium_model_ids`, `thinking_levels`); it seals the `previewLineUpPolicy` row. Left out, the base's line-up row is kept as it is, or none (the env's line-up). `--answer-seats '{"writer":"preview:…","checker":"preview:…"}'` (optional `storyteller` and `storyChecker`, which otherwise follow the writer and the checker) chooses the four answer seats from the reviewed preview refs; never beside `--checker` (one way to set the checker), never with the writer as its own checker, and never with the storyteller as its own story checker (a seat left out counts as the seat it follows: storyteller → writer, story checker → checker). Left out, the seats are today's. Only `plan` takes these two flags; `publish` carries the plan's choices. |
| `native-plan --operation publish --from <the plan above> --proposal <what the native operator printed for it> --source-manifest <same manifest> --out <file>` | step 2, after the owner reviewed the proposal: re-hashes every value the proposal shows and its `deltaSha256`, checks it belongs to that plan (release, operator digest, base), copies the approval from it, picks a fresh `publicationId`, and prints the approval it wrote |
| `native-plan --operation verify --from <the publish plan> --publication <what the native operator printed for publish> --source-manifest <manifest> --out <file>` | step 3: the verify plan for the NEW publication (same id, base and snapshot as the publish plan) |
| `launch-plan … --publication <what the native operator printed for publish>` | launch plans that carry the new publication instead of the old plan's; the `--native-attestation` proof must already name it |
| `database-ahead --older-source-manifest <old candidate api manifest> --newer-source-manifest <new candidate api manifest> --out <artifacts folder>/database-ahead-<older label>.json` | the database steps the newer release adds (each with both `n1` header lines) and its whole forward chain, for the older release's native verify (side-by-side spec §5); root installs it as `/etc/debateai-v3-preview/auth-dev-v1/database-ahead-<older label>.json` and pins it with `prestart.mjs accept-ahead`; no new step: `DATABASE_AHEAD_NOT_NEEDED`, nothing written |

## Operator sequence for one release

This follows the release runbook: steps 1-3 (package, build, fingerprints) need no downtime;
the native-plan steps belong to its steps 5b and 7 (downtime, owner yes).

**On the hosted preview (since 19 October 2026)** a whole release follows "A normal release on a hosted base" at the
end of this guide. It runs steps 2 to 5 below as they are, and replaces steps 6 and 7 and the publish sequence with
its hosted form. From the transition release T on, the server runs one unit per service per release: T follows
"Transition release T (one last drained upload)", and every release after it "Side-by-side release (from T+1)".

**0. Names for this release.** Open one root shell first (`sudo -i`) and keep it for every
step below. `LABEL` below is the example of the release built from dev 23402d10e: change it for
each release (lower-case letters, digits, dashes); everything else is derived. The `rel` function runs the tool from the candidate API release, so the tool
that stages a release is that release's own reviewed copy.

```sh
umask 022
LABEL=23402d10e-parti-v1
SLOT=A   # change: the release's slot (A: website 3100, API 3101; B: 3200, 3201)
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
before every start. With the lifecycle installed, the live plans are named in its lock. The two `jq` lines below are for
the old layout only (lock v1, one release under `.services`): lock v2 (from transition T on) keeps each release's plans
under `.releases.<label>.services`, and "Side-by-side release (from T+1)" reads them in SB1.

```sh
# old layout only (lock v1): on lock v2 these print null; use SB1's old-plans.txt instead
OLDA=$(jq -r .services.api.basePlan.path /etc/debateai-v3-preview/lifecycle/release-lock.json)
OLDU=$(jq -r .services.ui.basePlan.path /etc/debateai-v3-preview/lifecycle/release-lock.json)
rel launch-plan --service api --slot "$SLOT" --from "$OLDA" --root "$CAPI" --source-manifest "$ART/candidate-api-source.json" --native-attestation "$ART/native-first-verify.json" --out "$ART/api-launch.json"
rel launch-plan --service ui --slot "$SLOT" --from "$OLDU" --root "$CUI" --source-manifest "$ART/candidate-ui-source.json" --ui-build "$ART/candidate-ui-build.json" --native-attestation "$ART/native-first-verify.json" --out "$ART/ui-launch.json"
```

The runner (GAP-RUNNER): the server has no runner plan yet, so the first one is derived from the
API plan. `--service runner --from <the API plan>` copies the release fields as for the API and takes
`serviceUid`/`serviceGid` only from the `debateai-preview-runner` OS account (`getent passwd` and
`getent group`; refused if missing, root, nobody, a login shell, or a group whose gid differs), with
`environment` = `/etc/debateai-v3-preview/auth-dev-v1/runner-<label>.env` root:<runner gid> 0640. A UI plan as
`--from` refuses. Once the lifecycle lock names a runner plan, later releases use that plan instead
(`.services.runner.basePlan.path`), which keeps its own identity.

```sh
rel launch-plan --service runner --slot "$SLOT" --from "$OLDA" --root "$CRUN" --source-manifest "$ART/candidate-runner-source.json" --native-attestation "$ART/native-first-verify.json" --out "$ART/runner-launch.json"
```

Then `prestart.mjs pin --from "$ART/runner-launch.json"` and the runner unit, release drop-in and
`runner-<label>.env` as `deploy/preview-auth-dev/v1/README.md` "Runner start" says; the runner is started by hand.

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
   again (step 1) from the verify plan that names the newest publication. Kit v3 from the release that
   carries Phase 2 on refuses instead with `PREVIEW_REGISTER_BASE_NOT_ACTIVE: …` when the base is not the
   active settings version: plan again from the verify plan that names the active version ("Changing
   debate settings without an upload", SV0).

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

> **From the release that carries Phase 2 on (side-by-side spec §13), steps 5 and 6 are not how a settings change
> reaches the preview.** A change of debate settings only (models, thinking levels, lengths, shape, per-debate
> budgets) is published and then ACTIVATED, with no `sed`, no re-pin and no restart: "Changing debate settings without
> an upload (settings activation)" below. An upload's own site version is set through Plan D's per-release env files
> (`release-env.mjs derive` writes `REGISTER_VERSION` and `RELEASE_KEY` into `<service>-<label>.env`, SB5), never by
> editing a live file. Kit v3 then composes from the active version, not the newest one.

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

**Since the transition release T, this is the drained recipe of the old layout.** It ran on one fixed unit per
service, the release lock of schema v1 and one `native-plan.json`: R19 and the releases before it. T itself is
uploaded with it one last time, with the changes in "Transition release T (one last drained upload)" below; every
release after T follows "Side-by-side release (from T+1)", or, when its release check says `DRAINED_PATH`,
"Drained upload on the template layout". The scripts here are kept exactly as they ran: they name the fixed units,
`native-plan.json` and the v1 lock, and their `launch-plan` lines have no `--slot`, which today's release tool requires.

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

> **From the release that carries Phase 2 on (side-by-side spec §13), B5 to B7 are not how a settings change reaches
> the preview.** A change of debate settings only (models, thinking levels, lengths, shape, per-debate budgets) is
> published and then ACTIVATED, with no env edit, no re-pin and no restart: "Changing debate settings without an upload
> (settings activation)" below. An upload's own site version is set through Plan D's per-release env files
> (`release-env.mjs derive`, SB5 of "Side-by-side release (from T+1)"), never by editing a shared env file.

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

## Changing debate settings without an upload (settings activation)

**In plain words.** From the release that carries Phase 2 (side-by-side spec §13) on, a change to how debates run is no
longer an upload, and no longer a re-pin of `REGISTER_VERSION` with a restart. The owner publishes a new settings
version (a sealed register version, as always), the live release dry-boots it ("check"), and after the owner's fresh yes
one command makes it the active version. The next question asked uses it; nothing restarts, nothing stops, and every
debate already admitted finishes on the version it was admitted with. Going back is the same command with an older
version: a new activation row, never an edit.

**What can change this way (debate settings).** The models' role refs (the answer writer, the checker, the storyteller and
its checker); the thinking levels and the token bounds sealed in the register; the length guidance; the debate shape;
the question language settings; role rotation; the per-debate budgets (the per-debate ceiling of `costEnvelopePolicy`,
which travels in the plan's `HB` JSON as `perRunCeilingMicros`); the per-debate lane limits of `callConcurrencyPolicy`
(`perDebate`, `perModelPerDebate`); the line-up (`--line-up`, below); later, the prompts. The preview's site version
already carries the call-concurrency row, so the per-debate lane limits can change by activation.

**What cannot (site rules: an upload).** A settings-only change of a site rule (logins, rate limits, countries, plan
prices, the daily budget, funding) is refused and needs an upload. So are billing on or off, the room-read budget, the
band, the runner's per-model limit (`perModelPerRunner`), the provider set, and anything that would need an env change.
The check refuses such a version (`SETTINGS_SITE_MEMBER_DIFFERS`, `SETTINGS_NEEDS_ENV_CHANGE`) even when nothing else
changed: a site rule changes with a new site version in a new release (side by side, with its practice).

**When.** Only on the template layout, once a release with Phase 2 is current (T+1 and later: `release-check.mjs status`
works, and `settings-version.mjs status` answers). Before that, a register change is a publication plus the re-pin of
"Publishing a new register version on the preview (publish kit v2)" or of the hosted-base recipe.

**What the kit checks.** Kit v3 composes from the ACTIVE settings version (`publish-register-base.ts`
`assertBaseIsActive`): the plan's base must be the pointer, or the current release's own site version while nothing was
ever activated. A version sealed above the base is no reason to refuse any more: a published candidate that was never
activated, or one activated and then rolled back, is not the version debates use. Any other base refuses, before
anything is written:
`PREVIEW_REGISTER_BASE_NOT_ACTIVE: the selected base is not the active settings version; plan again from the active version`.

**The order.**

| Step | What | The site | The way back |
|---|---|---|---|
| SV0 | names, the archive `$S`, the from-plan of the active version | up | nothing to undo |
| SV1 | the plan and its proposal (a moment of the verify plan swapped, then put back) | up | nothing to undo |
| – | the owner reads the delta and gives its `deltaSha256` | up | – |
| SV2 | publish; the verify plan of the new version kept for the next plan | up | nothing to undo (the version stays sealed, unused) |
| SV3 | the check: both dry-boot halves of the live release, the verdict | up | nothing to undo |
| – | **the owner's fresh yes, in the live chat**, naming the version and the verdict | up | – |
| SV4 | the activation | up | SV6 |
| SV5 | the checks after it (read-only) | up | SV6 |
| SV6 | going back: activate the version before (a new row) | up | – |

Each step is one script, run on its own as root with `bash -s`, `set -euo pipefail` first and the change's names file
second (SV0 makes it, `/root/preview-archive/settings-names.sh`; one settings change at a time). SV5 moves it into `$S`
when the change is done.

### SV0. Names, the archive and the from-plan

**Never activate while an upload is between its SB3 and its SB13** (or a drained upload between SB3 and DR6): the
upload's plan was made from the version active at SB3, and its switch stops (`SB13_NOT_DONE: settings were activated
since SB3`) rather than undo the activation; an activation that lands even after that read refuses the switch itself
(`--expect-active`, `SETTINGS_ACTIVE_VERSION_MOVED`). A drained upload checks it before DR2 too, before its downtime
starts. Finish or give up the upload first.

The plan must start from the active version. While the active version is the current release's own site version, the
from-plan is that release's verify plan (`native-plan-<label>.json`, copied into `$S`). After an activation of another
version, it is that version's verify plan, which SV2 keeps as
`/opt/debateai-v3-preview/artifacts/settings-v<version>/native-plan-verify.json` when it publishes the version. Beside
it sits the publish plan that made the version (`native-plan-publish.json`: the release's own in its artifacts folder,
or SV2's copy in `settings-v<version>`): it holds the choices a plan does not take from its base (the checker or the
answer seats, role rotation off), so a new plan keeps them unless the owner changes them.

```sh
set -euo pipefail
# SV0: this change's names file, its archive folder S, the copy of the live verify plan, the from-plan. Nothing live changes.
NAMES=/root/preview-archive/settings-names.sh
E=/etc/debateai-v3-preview/auth-dev-v1; LOCK=/etc/debateai-v3-preview/lifecycle/release-lock.json
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
lc() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/$1" "${@:2}"; }
[ ! -e "$NAMES" ] || { echo "SV0_NOT_DONE: $NAMES exists: another settings change is open (finish it, or move the file into its S)"; exit 1; }
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "SV0_NOT_DONE: release-check.mjs status refused: ask"; exit 1; }
LABEL=$(jq -r '[.releases[] | select(.state == "CURRENT") | .label] | if length == 1 then .[0] else "" end' <<<"$ST")
[ -n "$LABEL" ] || { echo "SV0_NOT_DONE: the release table does not name exactly one current release"; exit 1; }
KEY=$(jq -r --arg l "$LABEL" '.releases[$l].releaseKey' "$LOCK"); SITE=${KEY%%-*}; SITE=${SITE#r}
SS=$(lc settings-version.mjs status 2>&1) || { echo "$SS"; echo "SV0_NOT_DONE: settings-version.mjs status refused (this release has no settings operator?): ask"; exit 1; }
AV=$(sed -n 's/^DEBATEAI_SETTINGS_STATUS //p' <<<"$SS" | jq -r '.effectiveActive // empty')
printf '%s\n' "$AV" | grep -qxE '[1-9][0-9]*' || { echo "$SS"; echo "SV0_NOT_DONE: no active version read"; exit 1; }
NP=$E/native-plan-$LABEL.json
[ "$(jq -r .operation "$NP")" = verify ] || { echo "SV0_NOT_DONE: $NP is not the current release's verify plan: ask"; exit 1; }
if [ "$AV" = "$SITE" ]; then FROM=; CP=/opt/debateai-v3-preview/artifacts/auth-dev-$LABEL/native-plan-publish.json; else FROM=/opt/debateai-v3-preview/artifacts/settings-v$AV/native-plan-verify.json; CP=/opt/debateai-v3-preview/artifacts/settings-v$AV/native-plan-publish.json; fi
[ -z "$FROM" ] || [ "$(jq -r '.approval.publication.registerVersion' "$FROM")" = "$AV" ] || { echo "SV0_NOT_DONE: no kept verify plan names the active version $AV ($FROM): ask"; exit 1; }
[ "$(jq -r .approval.snapshotSha256 "$CP")" = "$(jq -r .approval.publication.snapshotSha256 "${FROM:-$NP}")" ] || { echo "SV0_NOT_DONE: the publish plan $CP did not make the active version $AV: ask"; exit 1; }
TS=$(date -u +%Y%m%dT%H%M%SZ); S=/root/preview-archive/settings-$TS
SART=/opt/debateai-v3-preview/artifacts/settings-$(printf '%s' "$TS" | tr 'TZ' 'tz')
install -d -o root -g root -m 0700 "$S"; install -d -o root -g root -m 0755 "$SART"
cp -a "$NP" "$S/native-plan.before.json"
[ -n "$FROM" ] || FROM=$S/native-plan.before.json
umask 077
{ printf 'LABEL=%s\nKEY=%s\nSITE=%s\nAV=%s\nS=%s\nSART=%s\nFROM=%s\nCP=%s\n' "$LABEL" "$KEY" "$SITE" "$AV" "$S" "$SART" "$FROM" "$CP"
  cat <<'EOF'
umask 022
E=/etc/debateai-v3-preview/auth-dev-v1
NP=$E/native-plan-$LABEL.json
CAPI=/opt/debateai-v3-preview/releases/auth-dev-candidate-$LABEL-api
ART=/opt/debateai-v3-preview/artifacts/auth-dev-$LABEL
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
HB_ON='{"billing":"on","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
rel() { /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin TZ=UTC /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$CAPI/dialectical-engine/deploy/preview-release/v1/release-artifacts.mjs" "$@"; }
nat() { ( cd "$CAPI/dialectical-engine" && /bin/sh -c 'exec 5<&0; p=$1; shift; printf %s "$p" 5<&- | "$@" 3<&0 0<&5 5<&-' sh '{"peerUrl":"postgresql://postgres@localhost/debateai?host=/run/debateai-v3-preview/postgresql&port=5434"}' /usr/sbin/runuser -u postgres -- /usr/bin/env -i PATH=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin:/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs" --credential-fd 3 < /dev/null > "$1" ); echo "exit $?"; }
put() { install -o root -g root -m 0644 "$1" "$NP.new" && mv "$NP.new" "$NP" && cmp "$1" "$NP"; }
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
lc() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/$1" "${@:2}"; }
EOF
} > "$NAMES"
chmod 0600 "$NAMES"
umask 022
echo "current release $LABEL ($KEY, site version $SITE); active version $AV; from-plan $FROM; its choices $CP; S=$S SART=$SART"
echo SV0_DONE
```

### SV1. The plan and its proposal

Fill in the owner's choices at the top; an empty choice keeps the base's row as it is. Three choices are not taken from
the base by the kit, so the script reads them from the active version's plans (SV0's `FROM` and `CP`): the hosted inputs
(`HB`, billing on), the checker or the answer seats (`DS` for the live DeepSeek checker, or `SEATS`), and role rotation
off (`ROT`). Left as read, a plan never switches the checker back to GLM, billing off, or rotation on by accident. `HB`
may change `perRunCeilingMicros` only; its `dailyCeilingMicros` and `askRoomReads` are site rules (the script and the
check refuse a change). The JSON options have the shape the kit's section above gives (`--call-concurrency`,
`--length-guidance`, `--debate-shape`, `--answer-seats`); `--question-language` is added the same way. `SEATS` replaces
the DeepSeek checker (one way to set the checker): set `DS=''` with it. For a new line-up, make its file first ("The line-up file" below). The native operator reads only
this release's own plan file, so the plan is put in place for the one run and the verify plan goes back at once (a
restart in between would refuse: prestart accepts only a verify plan).

```sh
set -euo pipefail
. /root/preview-archive/settings-names.sh
# SV1: the plan (the active version as base, the live checker, billing-on inputs, the owner's choices) and its proposal.
HB=$(jq -c .hostedBilling "$FROM")                         # the active version's hosted inputs; only perRunCeilingMicros may change
DS=$(jq -r 'if .answerSeats == null and .checkerChoice.checker == "deepseek" then "yes" else empty end' "$CP")   # yes = the DeepSeek checker
SEATS=$(jq -c '.answerSeats // empty' "$CP")               # the answer seats JSON, or empty
ROT=$(jq -r '.roleRotation // empty' "$CP")                # off, or empty (rotation on)
LINEUP=''                                                  # a line-up file in $SART (see "The line-up file"), or empty
CC=''                                                      # call-concurrency JSON, or empty
LG=''                                                      # length-guidance JSON, or empty
SHAPE=''                                                   # debate-shape JSON or off, or empty
cmp -s "$S/native-plan.before.json" "$NP" || { echo "SV1_NOT_DONE: the live verify plan moved since SV0"; exit 1; }
[ "$(jq -cS '{billing,dailyCeilingMicros,askRoomReads}' <<<"$HB")" = "$(jq -cS '.hostedBilling | {billing,dailyCeilingMicros,askRoomReads}' "$FROM")" ] || { echo "SV1_NOT_DONE: HB changes a site rule (billing, the day's ceiling or the room-read budget): only perRunCeilingMicros may change"; exit 1; }
[ ! -e "$SART/native-plan-plan.json" ] && [ ! -e "$SART/register-proposal.json" ] || { echo "SV1_NOT_DONE: an earlier plan or proposal exists in $SART (look first)"; exit 1; }
rel native-plan --operation plan --from "$FROM" --source-manifest "$ART/candidate-api-source.json" ${DS:+--checker deepseek --deepseek-enabled-on-gate yes} ${SEATS:+--answer-seats "$SEATS"} ${ROT:+--role-rotation "$ROT"} --hosted-billing "$HB" ${LINEUP:+--line-up "$LINEUP"} ${CC:+--call-concurrency "$CC"} ${LG:+--length-guidance "$LG"} ${SHAPE:+--debate-shape "$SHAPE"} --out "$SART/native-plan-plan.json" || { echo "SV1_NOT_DONE: the release tool refused the plan"; exit 1; }
put "$SART/native-plan-plan.json" || { put "$S/native-plan.before.json"; echo "SV1_NOT_DONE: put of the plan failed (the verify plan is back)"; exit 1; }
OUT=$(nat "$SART/register-proposal.json"); echo "nat: $OUT"
put "$S/native-plan.before.json" || { echo "SV1_NOT_DONE: PUT THE VERIFY PLAN BACK BY HAND: put \"$S/native-plan.before.json\""; exit 1; }
[ "$OUT" = "exit 0" ] || { head -c 2000 "$SART/register-proposal.json"; echo; echo "SV1_NOT_DONE: the native operator refused the plan (the line above; BASE_NOT_ACTIVE: run SV0 again)"; exit 1; }
[ "$(jq -r .baseRegisterVersion "$SART/register-proposal.json")" = "$AV" ] || { echo "SV1_NOT_DONE: the proposal is not based on the active version $AV"; exit 1; }
sha256sum "$SART/native-plan-plan.json" "$SART/register-proposal.json" > "$S/plan-proposal.sha256"
jq -r '.delta[] | "\(.change) \(.rowKey) (\(.reason))\n  old: \(.oldValueJsonText)\n  new: \(.newValueJsonText)"' "$SART/register-proposal.json"
jq -c '{baseRegisterVersion,addedKeys,changedKeys,deltaSha256}' "$SART/register-proposal.json"
echo SV1_DONE
```

The owner reads every delta entry, old value against new, and only the rows the change is about may differ
(`nodeRuntimeVersion`'s source reference aside). The yes names the printed `deltaSha256`: SV2's `YES`.

### SV2. Publish, and keep the new version's verify and publish plans

Publishing writes a new sealed version and nothing else: the running API and runner never read it until it is activated.
A re-run of `nat` with the same publish plan after a crash replays the same version; never make a second publish plan
for a run that may have committed.

```sh
set -euo pipefail
. /root/preview-archive/settings-names.sh
# SV2: publish SV1's plan with the owner's yes; the verify plan of the new version, kept for the next plan from it.
YES=''                                                     # the deltaSha256 the owner approved
printf '%s\n' "$YES" | grep -qxE '[0-9a-f]{64}' || { echo "SV2_NOT_DONE: YES is not the approved deltaSha256"; exit 1; }
sha256sum -c --quiet "$S/plan-proposal.sha256" || { echo "SV2_NOT_DONE: the plan or the proposal changed since SV1"; exit 1; }
cmp -s "$S/native-plan.before.json" "$NP" || { echo "SV2_NOT_DONE: the live verify plan moved since SV0"; exit 1; }
[ -e "$SART/native-plan-publish.json" ] || rel native-plan --operation publish --from "$SART/native-plan-plan.json" --proposal "$SART/register-proposal.json" --approved-delta-sha256 "$YES" --source-manifest "$ART/candidate-api-source.json" --out "$SART/native-plan-publish.json" || { echo "SV2_NOT_DONE: the release tool refused the publish plan (PROPOSAL_NOT_APPROVED: YES is not the proposal's hash)"; exit 1; }
put "$SART/native-plan-publish.json" || { put "$S/native-plan.before.json"; echo "SV2_NOT_DONE: put of the publish plan failed (the verify plan is back)"; exit 1; }
OUT=$(nat "$SART/register-published.json"); echo "nat: $OUT"
put "$S/native-plan.before.json" || { echo "SV2_NOT_DONE: PUT THE VERIFY PLAN BACK BY HAND: put \"$S/native-plan.before.json\""; exit 1; }
[ "$OUT" = "exit 0" ] || { head -c 2000 "$SART/register-published.json"; echo; echo "SV2_NOT_DONE: the native operator refused the publish (nothing was written unless the line above says otherwise): ask"; exit 1; }
V=$(jq -r .publication.registerVersion "$SART/register-published.json")
printf '%s\n' "$V" | grep -qxE '[1-9][0-9]*' || { echo "SV2_NOT_DONE: no published version read"; exit 1; }
VART=/opt/debateai-v3-preview/artifacts/settings-v$V
install -d -o root -g root -m 0755 "$VART" || { echo "SV2_NOT_DONE: the folder $VART could not be made (version $V IS published): ask"; exit 1; }
rel native-plan --operation verify --from "$SART/native-plan-publish.json" --publication "$SART/register-published.json" --source-manifest "$ART/candidate-api-source.json" --out "$VART/native-plan-verify.json" || { echo "SV2_NOT_DONE: the release tool refused the verify plan of $V"; exit 1; }
install -o root -g root -m 0644 "$SART/native-plan-publish.json" "$VART/native-plan-publish.json" || { echo "SV2_NOT_DONE: the publish plan was not kept in $VART (version $V IS published): run this line again"; exit 1; }
printf '%s\n' "$V" > "$S/new-register-version"
echo "published settings version $V (not active); its verify and publish plans: $VART"
echo SV2_DONE
```

### SV3. The check (the dry boot) and its verdict

`settings-version.mjs check <label> <version>` runs both halves of the live release against the version, each from the
release's own folder as its unit's user with its own env file (the runner half, then the API half; no AI call), keeps
both lines as a receipt (`/opt/debateai-v3-preview/artifacts/lifecycle-current-<label>/settings-check-<version>-<UTC>.json`)
and records the verdict. Exit 0 is PASS, 2 is FAIL (every code with one plain hint), 1 is refused (nothing recorded; a
half that could not run says why).

**Re-checking the active version can only record PASS.** The version new debates use now can be checked again on the
current release (for example after a gate or env change). When it passes, the PASS is recorded. When it fails, the FAIL
is not recorded (ruling R77): a FAIL there would stop every new debate at once. The check exits 1 with
`SETTINGS_VERDICT_ACTIVE_PAIR`, every code it found with its hint, and then the line
`DEBATEAI_SETTINGS_ACTIVE_PAIR NOT RECORDED: this is the active version: activate another passed version first, then re-check`.
Nothing is written and new debates keep running on that version. To act on the failure, activate another version the
release has passed first (its own site version always passes: SV6's script with that number, after the owner's fresh
yes), then check the old one again.

```sh
set -euo pipefail
. /root/preview-archive/settings-names.sh
# SV3: the check of the published version against the live release; PASS goes on to the owner's yes.
V=$(cat "$S/new-register-version")
RC=0; OUT=$(lc settings-version.mjs check "$LABEL" "$V" 2>&1) || RC=$?
printf '%s\n' "$OUT" > "$S/settings-check.json"
jq -r 'if .event == "PREVIEW_SETTINGS_CHECKED" then "verdict \(.verdict) for version \(.version) on \(.releaseKey) (receipt \(.receipt))", (.hints[] | "  \(.code): \(.hint)") else tostring end' <<<"$OUT" 2>/dev/null || echo "$OUT"
case "$RC" in
  0) ;;
  2) echo "SV3_NOT_DONE: FAIL (codes and hints above): the version cannot be activated; publish a corrected one (SV1)"; exit 1;;
  *) echo "SV3_NOT_DONE: the check refused (the line above); nothing was recorded: ask"; exit 1;;
esac
echo SV3_DONE
```

**The owner's fresh yes.** An activation changes what every new question uses, so it needs the owner's yes **fresh in
the live chat**, right before SV4, naming the version (`V`), the verdict PASS and what changes for new debates. A yes
given earlier, or for another version, is not enough.

### SV4. The activation

`settings-version.mjs activate <version> --by <owner> --reason "<why>"` first proves that each spending gate runs this
release's gate code (the gate-code fingerprint: each gate's two installed gate files and its GO record equal this
release's own copies, else `SETTINGS_GATE_HELPER_DIFFERS`, nothing asked), then reads both gates' read-only `/remaining`
and hands the answers to the operator, which refuses unless every model, thinking level and answer ceiling the version can
seat is switched on at its gate (live condition 6). Both gates must answer: a gate that is down refuses
(`SETTINGS_GATE_UNANSWERED:<gate>`). Only then is the pointer moved, in one transaction with the release switch's lock.
`--by` is the owner's name as it should be recorded (letters, digits, space, `._@-`), `--reason` a short note.

```sh
set -euo pipefail
. /root/preview-archive/settings-names.sh
# SV4: the activation, after the owner's fresh yes in the live chat. Exit 0 = active (or already active).
BY=''                                                      # the owner's name, as recorded
WHY=''                                                     # why, in a few words (no line breaks)
V=$(cat "$S/new-register-version")
[ -n "$BY" ] && [ -n "$WHY" ] || { echo "SV4_NOT_DONE: BY or WHY is empty"; exit 1; }
RC=0; OUT=$(lc settings-version.mjs activate "$V" --by "$BY" --reason "$WHY" 2>&1) || RC=$?
printf '%s\n' "$OUT" | tee "$S/settings-activate.txt"
case "$RC" in
  0) ;;
  1) echo "SV4_NOT_DONE: refused: read the code above (a gate that is off or did not answer, a gate not on this release's code, the version's kind, or a refusal of the tool itself), fix that, then run SV4 again"; exit 1;;
  3) echo "SV4_NOT_DONE: SETTINGS_ACTIVATION_CONFLICT: the release or the pointer moved meanwhile (a switch?): read settings-version.mjs status, then ask"; exit 1;;
  4) echo "SV4_NOT_DONE: SETTINGS_VERSION_NOT_PASSED: the current release has not passed $V (run SV3)"; exit 1;;
  *) echo "SV4_NOT_DONE: refused (the line above): ask"; exit 1;;
esac
grep -qE "^(DEBATEAI_SETTINGS_ACTIVATED|SETTINGS_ACTIVATION_UNCHANGED) .*\"version\":\"$V\"" <<<"$OUT" || { echo "SV4_NOT_DONE: no activation receipt for $V"; exit 1; }
echo SV4_DONE
```

The receipt is the line `DEBATEAI_SETTINGS_ACTIVATED {"version":"<V>","previous":"<the version before>","releaseKey":…,"activationSeq":…}`
(or `SETTINGS_ACTIVATION_UNCHANGED {"version":"<V>"}` when `V` was active already).

### SV5. The checks after the activation (read-only)

A team member starts one short test debate on the site and gives its id (the last part of the debate page's address).
The API reads the pointer for each new question with at most a 1 s cache, so the debate is stamped `V`; the debates that
were already running keep the version they were admitted with.

```sh
set -euo pipefail
. /root/preview-archive/settings-names.sh
# SV5: read-only. The pointer is V, the team member's new test debate is stamped V; then this change's names file moves into S.
RID=''                                                     # the test debate's id
V=$(cat "$S/new-register-version")
printf '%s\n' "$RID" | grep -qxE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || { echo "SV5_NOT_DONE: RID is not a debate id"; exit 1; }
SS=$(lc settings-version.mjs status 2>&1) || { echo "$SS"; echo "SV5_NOT_DONE: settings-version.mjs status refused"; exit 1; }
echo "$SS"
[ "$(sed -n 's/^DEBATEAI_SETTINGS_STATUS //p' <<<"$SS" | jq -r .pointer)" = "$V" ] || { echo "SV5_NOT_DONE: the pointer is not $V"; exit 1; }
[ "$(psqlq "SELECT register_version FROM core.run WHERE run_id = '$RID'")" = "$V" ] || { echo "SV5_NOT_DONE: the test debate is not stamped $V (asked before the activation? ask a new one)"; exit 1; }
psqlq "SELECT r.register_version||' '||count(*) FROM core.run r JOIN core.work_item w ON w.run_id = r.run_id WHERE w.state IN ('READY', 'CLAIMED') GROUP BY r.register_version ORDER BY r.register_version" | sed 's/^/open debates on version: /'
mv /root/preview-archive/settings-names.sh "$S/settings-names.sh"
echo SV5_DONE
```

### SV6. Going back

Going back is an activation of the version that was active before (the `previous` of SV4's receipt): a new row, never an
edit. It is checked like any activation: the current release must have passed it (its own site version always passes),
the owner's fresh yes, and the live gate check (both gates must answer; only a release switch's revert or rollback
restores a version without asking the gates). Debates admitted on `V` finish on `V`.

```sh
set -euo pipefail
# SV6: activate the version before, after the owner's fresh yes in the live chat (a new row; nothing is edited).
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
lc() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/$1" "${@:2}"; }
OLDV=''                                                    # the version to go back to (SV4's "previous")
BY=''                                                      # the owner's name, as recorded
WHY=''                                                     # why, in a few words
printf '%s\n' "$OLDV" | grep -qxE '[1-9][0-9]*' && [ -n "$BY" ] && [ -n "$WHY" ] || { echo "SV6_NOT_DONE: OLDV, BY or WHY is not filled in"; exit 1; }
RC=0; OUT=$(lc settings-version.mjs activate "$OLDV" --by "$BY" --reason "$WHY" 2>&1) || RC=$?
echo "$OUT"
[ "$RC" = 0 ] || { echo "SV6_NOT_DONE: refused (exit $RC, the line above): ask"; exit 1; }
echo SV6_DONE
```

### The line-up file (`--line-up`)

The release tool reads a line-up only from a root-owned 0644 JSON file in the artifacts folder, named in lower case
(`<artifacts root>/<folder>/<name>.json`). To publish exactly the line-up the preview runs today (the first time, while
the API's env file still carries it), print it from that env file with the release's own checker, as root, with umask
022, straight into this change's `$SART`:

```sh
set -euo pipefail
. /root/preview-archive/settings-names.sh
# The line-up the API's env file carries, as the plan member {"lineUp":{…}}, into $SART/line-up.json (root 0644).
[ ! -e "$SART/line-up.json" ] || { echo "LINEUP_NOT_DONE: $SART/line-up.json exists (look first)"; exit 1; }
TMP=$SART/line-up.json.printing
( umask 022; cd "$CAPI/dialectical-engine" && /usr/bin/env -i PATH=/usr/bin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node --import ./node_modules/tsx/dist/loader.mjs tools/preview-practice/check-thinking-levels.ts --print-line-up --settings "$E/api-$LABEL.env" > "$TMP" ) || { echo "LINEUP_NOT_DONE: the checker refused the value (run it without the redirect to read why; $TMP is only a draft)"; exit 1; }
jq -e '.lineUp.free_model_ids and .lineUp.premium_model_ids' "$TMP" > /dev/null || { cat "$TMP"; echo "LINEUP_NOT_DONE: no line-up printed (the env file has only the gate part: the line-up lives in the settings version)"; exit 1; }
[ "$(stat -c '%U %a' "$TMP")" = "root 644" ] || { echo "LINEUP_NOT_DONE: the draft is not root 0644"; exit 1; }
mv "$TMP" "$SART/line-up.json"
echo "line-up file: $SART/line-up.json (SV1's LINEUP)"
```

To change the line-up, edit a copy of that file (a new name in `$SART`, lower case), try it with the practice first
(tools/preview-practice/README.md, "Trying a new line-up before an activation"), and give its path as SV1's `LINEUP`.

### What the server writes about settings versions

Content-free lines (codes, versions, ids), in each unit's journal (`journalctl -u 'debateai-preview-runner@*'`,
`journalctl -u 'debateai-preview-api@*'`) or on the operator's screen:

| Line | Where | What it means |
|---|---|---|
| `DEBATEAI_SETTINGS_CHECK {"half":…,"releaseKey":…,"version":…,"verdict":…,"codes":[…],…}` | each check half (kept in SV3's receipt) | one half's dry boot of the version: PASS, or FAIL with every refusal code |
| `DEBATEAI_SETTINGS_VERDICT {"releaseKey":…,"version":…,"verdict":…,"digest":…,"codes":[…]}` | the operator, after both halves | the verdict recorded for (release, version); the latest one for the pair decides |
| `DEBATEAI_SETTINGS_ACTIVATED {"version":…,"previous":…,"releaseKey":…,"activationSeq":…}` | SV4, SV6 | the activation receipt: new questions use `version` from now on |
| `DEBATEAI_SETTINGS_REFUSED {"command":…,"code":…,"codes":[…],"passed":[…]}` | any operator command | a refusal: the code, the gate codes, or the versions the release has passed |
| `DEBATEAI_RUNNER_SETTINGS {"releaseKey":…,"siteVersion":…,"loaded":[…],"unsupported":[…]}` | runner, once, right after its ready line | the settings versions the runner preloaded at boot (its open debates' and every version its release passed); `unsupported` lists a version it cannot run with its code |
| `{"kind":"DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED","version":…,"code":…}` | runner, once per version | a settings version this release's code cannot run, and the check that refused it; should never happen after a PASS: report it |
| `{"kind":"DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED","runId":…,"version":…,"code":…}` | runner, once per debate | a debate on such a version was set aside before any AI call, with its waiver: the asker reads the "update on our side" sentence and kept the allowance (the line above comes first for the first such debate) |
| `{"kind":"DEBATEAI_ADMISSION_SETTINGS","code":"ADMISSION_SETTINGS_UNSUPPORTED","version":…,"cause":…}` | API, per version | the API cannot admit on the active version (`cause`: the loader's code): asks wait in line ("switching") or get the plain "try again in a minute"; report it |
| `{"kind":"DEBATEAI_ADMISSION_SETTINGS","code":"ADMISSION_SETTINGS_NOT_PASSED","version":…}` | API, per refused ask | an ask without a waiting line met a version this release has not passed (a switch or an activation in between): refused plainly, nothing written or charged; the person asks again |
| `{"kind":"DEBATEAI_ADMISSION_SETTINGS","code":"ADMISSION_ESTIMATOR_FALLBACK","version":…,"cause":…}` | API, once per version | the cost estimate for another debate's version could not be built; it was priced on the asking version's terms instead |
| `{"kind":"DEBATEAI_ADMISSION_SETTINGS","code":"ADMISSION_ACTIVE_VERSION_UNAVAILABLE","version":…,"reason":…}` | API, at most once a minute, and at its start when its release is current | new asks wait ("switching") because the current release has not passed the active version (`NOT_PASSED`) or cannot load it (`UNSUPPORTED`): activate a passed version ("Settings and uploads") |
| `{"kind":"DEBATEAI_ADMISSION_SETTINGS","code":"ADMISSION_ACTIVE_VERSION_UNCHECKED","version":…,"cause":…}` | API, once at its start when its release is current | the start-up look at the active version could not finish (`cause`: `UNTYPED`, most likely the database, or a code; `version` null when the pointer itself could not be read); the API starts anyway and the first ask looks again: nothing unless it repeats at every start |
| `{"kind":"DEBATEAI_ADMISSION_SETTINGS","code":"ADMISSION_VIEW_FALLBACK","version":…,"cause":…}` | API, once per version | a page read (signing in, the ask form) could not load a newly active version or read the pointer (`version` null), most likely the database: the page was answered with the settings it last showed (else the release's site version), never an error; the next read tries again. Repeated: check the database |
| `DEBATEAI_SETTINGS_ACTIVE_PAIR NOT RECORDED: …` | the operator, after a `SETTINGS_VERDICT_ACTIVE_PAIR` refusal | a check of the active version failed and its FAIL was not recorded (SV3): new debates still use that version |

**Two API processes.** Where more than one API process serves (hosted), each reads the pointer with its own 1 s cache, so
for about a second after an activation two processes may disagree on the active version. A page that talks to both in
that second may show the plain "the settings changed, please choose again" note (even twice); nothing is written or
charged.

### Running the operator commands by hand

`settings-version.mjs` is the way: it checks the release's files first, runs each half as its unit's user, and hands the
operator the gate answers and the release's line-up. Run `tools/settings-version/cli.ts` (`pnpm settings:verdict`,
`settings:activate`, `settings:status`) directly only to read a refusal more closely, as `postgres` through the server's
socket from the current release's API folder. Then `activate` needs `--seatable-env <file>` (the release's line-up and
target models, the file `settings-version.mjs` writes as `lifecycle-current-<label>/settings-activate-<UTC>-seatable-env.json`)
and one `--gate-remaining <gate>=<file>` per gate; without `--seatable-env` it refuses with a usage error, never a
silent skip.

### Settings and uploads

- **The switch (SB13, DR6) passes `--activate`.** From the first T+1 switch on there is always an active version. A new
  release passes only its own site version until someone checks another one with it, so a switch without `--activate`
  refuses `SETTINGS_VERSION_NOT_PASSED` before anything is written. The first T+1 switch, with nothing ever activated,
  activates the new release's own site version by itself (owner answer Q-S2). SB13 and DR6 therefore name
  `--activate "$ACT"`, `ACT` being the new release's own site version (the number in `KEY`): the upload's version
  becomes the active one in the switch's own transaction. To keep another version active instead, check it with the new
  release first (`settings-version.mjs check <new label> <version>`, after SB10 pinned it), and set `ACT` to it. The
  switch runs the live gate check before it writes anything whenever the version the switch activates differs from the
  active one (the new release's own site version included: it may carry a new line-up; ruling R80); both gates must
  answer. SB13 and DR6 also pass the active version they read as `--expect-active`, so an activation that lands after
  their read refuses the switch (`SETTINGS_ACTIVE_VERSION_MOVED`, nothing written).
- **The way back activates by itself.** A rollback (WB2, and WB3's retry) keeps the active version when the target
  release has passed it (it activates nothing); else it activates the version that was active the last time the target
  was current, while the target still passes it; else the target's own site version: never a version it only checked
  and never ran (ruling R78). A switch that reverts by itself (`SWITCH_REVERTED`) puts back what was active before;
  after a switch between two releases on one site version it activates nothing. Neither asks the gates: putting back a
  known state must work while a gate is down.
- **If new debates wait ("switching") and do not start.** The API prints
  `{"kind":"DEBATEAI_ADMISSION_SETTINGS","code":"ADMISSION_ACTIVE_VERSION_UNAVAILABLE","version":…,"reason":…}` at most
  once a minute, and once at its start when its release is current: the current release has not passed the active
  version (`NOT_PASSED`), or this release's code cannot load it (`UNSUPPORTED`, for example after an env change and a
  restart). Nothing is lost: the asks wait in line, uncharged. To recover, activate a passed version:
  `lc settings-version.mjs status` names the versions the current release passed (its own site version always passes);
  run SV6's script with one of them after the owner's fresh yes. The waiting asks start within a minute.
- **An upload follows the active version.** SB1 records the active settings version (`$S/active-before`; a release
  without the settings operator: its own site version). SB3 plans from it, as SV1 does: from the old release's verify
  plan while that is its site version, else from the kept `settings-v<version>` plans, with the hosted inputs, the
  checker or answer seats and rotation read from them, so the new site version keeps every activated debate setting.
  SB9 and DR5 publish only a proposal based on it.
- **Never activate while an upload is between SB3 and SB13** (or DR6). SB13 and DR6 (and DR2, before the drained
  path's downtime starts) read the active version again and stop, nothing changed, when it is not the one SB3 planned
  from: switching would undo that activation.

### The line-up, the thinking levels and the answer seats (side-by-side spec §13 addition)

**In plain words.** The line-up (which AIs debate on Free and on Premium), how hard each AI thinks (the thinking
levels) and the four answer seats are debate settings. From the first upload that carries the line-up row (T+1, below)
on, a change to any of them is an activation (SV0 to SV5), never an edit of `PREVIEW_PROVIDER_TEST_CONFIG_JSON` and
never a restart. Debates already running keep the line-up and the thinking levels they started with; going back is
SV6. Examples of what the owner can ask for this way:

- **"Take Qwen off Free."** A new line-up file without Qwen in `free_model_ids` (below), as SV1's `LINEUP`.
- **"Qwen low for pros & cons."** The same file with Qwen's `pros_cons` step at `low`; Qwen's usual level and its other
  steps stay as they are.
- **"Haiku in the writer seat."** SV1's `SEATS='{"writer":"preview:claude-haiku-5-5","checker":"preview:deepseek-v4-1-flash"}'`
  with `DS=''` (`SEATS` replaces the DeepSeek checker). With role rotation on (the kit's default) each debate's writer
  and checker are picked from that debate's line-up and the seat is the stand-in; for Haiku to write every answer, set
  `ROT=off` as well.

**The two plan members.** SV1's choices reach the publish kit as two members of the plan (`native-operator.mjs`):
- `lineUp`: exactly `free_model_ids`, `premium_model_ids` and `thinking_levels` (the table, or `null` for every AI at
  its default), from `--line-up <file>`. It seals the `previewLineUpPolicy` row. Left out, the active version's row is
  kept as it is.
- `answerSeats`: `writer` and `checker`, optionally `storyteller` and `storyChecker` (which otherwise follow the writer
  and the checker), each a reviewed preview ref (`preview:fixture-a`, `preview:fixture-b`, `preview:deepseek-v4-1-flash`,
  `preview:mimo-v2-6-pro`, `preview:qwen-3-8-flash`, `preview:claude-haiku-5-5`), from `--answer-seats '<JSON>'`. The
  same seat ref as writer and checker is refused (`answer-seats-writer-is-checker`), and so is a storyteller that is its
  own story checker, counting a seat left out as the seat it follows (storyteller → writer, story checker → checker):
  `{"writer":"preview:claude-haiku-5-5","checker":"preview:fixture-b","storyteller":"preview:fixture-b"}` is refused
  (`answer-seats-storyteller-is-story-checker`; ruling R28). Refs, not models: `preview:fixture-a` and
  `preview:fixture-b` are both GLM. Left out, the seats of the active version's publish plan are kept (SV1 reads them from `CP`).

**The thinking menus.** Only a word on an AI's reviewed menu is accepted: GLM `high`, `low`; DeepSeek `high`, `low`,
`none`; Qwen `default`, `low`, `medium`, `none`; MiMo `default`, `none`; Claude Haiku `high`, `medium`, `low`. The step
names are those of `deploy/preview-auth-dev/v1/README.md` ("The optional `thinking_levels` table"). Any other word
(`max`, `xhigh`, Qwen at `high`) is refused at SV1, and so is a list with one maker only or an AI that is not a reviewed
row. The release tool checks only the file's shape; the native operator's run then stops before anything is sealed and
prints the code (Ruling R72), for example `PREVIEW_THINKING_LEVELS_INVALID:level:Qwen/Qwen3.8-Flash`,
`PREVIEW_LINE_UP_POLICY_INVALID:maker_rule`, `PREVIEW_LINE_UP_POLICY_INVALID:free_model_ids:unreviewed` or, for the seats,
`PREVIEW_REGISTER_SNAPSHOT_REFUSED: answer-seats-writer-is-checker` (or `…: answer-seats-storyteller-is-story-checker`). To see a line-up debate before publishing it, use the
practice's trial (tools/preview-practice/README.md, "Trying a new line-up before an activation"). A new word needs a
reviewed gate change first (new gate code, root's restart of the gate): an upload, not an activation.

**A model that is not switched on at its gate yet** (for example a model the gate's GO has never listed). Two steps,
in this order:
1. Root switches it on at its spending gate: its probe, then a new GO with the model added to `enabled_models`, then
   `stop` and `activate` (`deploy/preview-gate/v3/README.md`, "Switching on DeepSeek, MiMo and Qwen"; Claude Haiku:
   `README-anthropic.md`, install steps 5, 6 and 8 (its GO, `init` and `activate`, the probe) and "Switch it on" step 1;
   that section's step 2, the env rosters and a restart, is replaced from T+1 by this activation: a roster in the env now
   refuses the start). This stays root's step, and it comes first.
2. Then the activation: SV1 (the plan with the new line-up or seat), SV2 (publish), SV3 (the check), the owner's fresh
   yes, SV4 (activate). SV4 refuses while any model the version can seat is off at its gate.

Taking a model away goes the other way: first activate a version that no longer seats it, then (once the debates on the
older version have finished) take it out of `enabled_models`. A model that no declared target serves, or whose company has no
gate socket in the env, is refused by the check (`SETTINGS_NEEDS_ENV_CHANGE:TARGET:<model>`,
`SETTINGS_NEEDS_ENV_CHANGE:GATE_SOCKET:<provider>`): that is an upload. (The check's `SETTINGS_GATE_UNREVIEWED` concerns
an older sealed version whose code accepted a model or level the current code no longer reviews; a new plan with an
unreviewed AI already stops at SV1.)

**A new line-up file from the active one.** Once the active version carries the row (T+1 and later), its line-up is
read from the database into this change's `$SART`, as root 0644; before T+1, "The line-up file" above prints it from the
env file instead.

```sh
set -euo pipefail
. /root/preview-archive/settings-names.sh
# The active version's line-up row, as the plan member {"lineUp":{…}}, into $SART/line-up-now.json (root 0644).
[ ! -e "$SART/line-up-now.json" ] || { echo "LINEUP_NOT_DONE: $SART/line-up-now.json exists (look first)"; exit 1; }
ROW=$(psqlq "SELECT jsonb_build_object('lineUp', value_json - 'kind') FROM register.register_row WHERE register_version = $AV AND row_key = 'previewLineUpPolicy'")
[ -n "$ROW" ] || { echo "LINEUP_NOT_DONE: the active version $AV has no line-up row (before T+1: \"The line-up file\" above)"; exit 1; }
( umask 022; jq -c . <<<"$ROW" > "$SART/line-up-now.json" )
jq -r '.lineUp | "free: \(.free_model_ids | join(", "))\npremium: \(.premium_model_ids | join(", "))\nthinking table: \(if .thinking_levels == null then "none" else (.thinking_levels | keys | join(", ")) end)"' "$SART/line-up-now.json"
echo "the active line-up: $SART/line-up-now.json"
```

Then each change is a new file beside it (a new lower-case name in `$SART`, root 0644 under the names file's umask),
given as SV1's `LINEUP`, for example:

```sh
. /root/preview-archive/settings-names.sh
# "Take Qwen off Free":
jq -c '.lineUp.free_model_ids -= ["Qwen/Qwen3.8-Flash"]' "$SART/line-up-now.json" > "$SART/line-up-no-qwen-free.json"
# "Qwen low for pros & cons" (its level and other steps are kept):
jq -c '.lineUp.thinking_levels["Qwen/Qwen3.8-Flash"].steps.pros_cons = "low"' "$SART/line-up-now.json" > "$SART/line-up-qwen-low.json"
```

The owner reads the change in SV1's delta as `previewLineUpPolicy` `changed`, with the old and the new value. A trial
debate first is optional (tools/preview-practice/README.md, "Trying a new line-up before an activation").

**What the env setting no longer does.** From T+1 on, `PREVIEW_PROVIDER_TEST_CONFIG_JSON` in each release's
`api-<label>.env` and `runner-<label>.env` carries only the gate part (`budget_socket`, `deployment`,
`requested_thinking_level`, `scope_id`, optional `anthropic_budget_socket`). Writing rosters or a `thinking_levels` table
back into it does not change the line-up: both processes refuse to start (`PREVIEW_LINE_UP_ENV_CONFLICT`; the
launchers print only `PREVIEW_API_STARTUP_REFUSED` / `PREVIEW_RUNNER_STARTUP_REFUSED`).

### The first upload with this change (T+1)

**In plain words.** Once, in the first side-by-side upload (T+1, the release that brings Phase 2 and the line-up row,
owner answer Q-L1), the line-up moves out of the env setting into the settings version. On that day nothing changes for
debates: T+1's own site version carries exactly the line-up and thinking table T runs. T's own files are not touched,
so every way back (WB1, WB2) runs T as before, on its own env line-up. Four additions to "Side-by-side release (from
T+1)", in this order (on the drained path: the first two the same, the third right after DR1, the fourth after DR5 and
before DR6):

1. **Before SB3: today's line-up into the release's artifacts folder.** The new release's own checker prints the old
   release's env line-up as the plan member.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# T+1 only, before SB3: the old release's env line-up, as the plan member {"lineUp":{…}}, into $ART/line-up.json (root 0644).
[ ! -e "$ART/line-up.json" ] || { echo "LINEUP_NOT_DONE: $ART/line-up.json exists (look first)"; exit 1; }
cmp -s "$S/api-$OLABEL.env.before" "$E/api-$OLABEL.env" || { echo "LINEUP_NOT_DONE: api-$OLABEL.env moved since SB1"; exit 1; }
TMP=$ART/line-up.json.printing
( umask 022; cd "$CAPI/dialectical-engine" && /usr/bin/env -i PATH=/usr/bin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node --import ./node_modules/tsx/dist/loader.mjs tools/preview-practice/check-thinking-levels.ts --print-line-up --settings "$E/api-$OLABEL.env" > "$TMP" ) || { echo "LINEUP_NOT_DONE: the checker refused the value (run it without the redirect to read why; $TMP is only a draft)"; exit 1; }
jq -e '.lineUp.free_model_ids and .lineUp.premium_model_ids' "$TMP" > /dev/null || { cat "$TMP"; echo "LINEUP_NOT_DONE: no line-up printed (the old release's setting has only the gate part: this is not the first upload with the line-up row)"; exit 1; }
[ "$(stat -c '%U %a' "$TMP")" = "root 644" ] || { echo "LINEUP_NOT_DONE: the draft is not root 0644"; exit 1; }
mv "$TMP" "$ART/line-up.json"
jq -r '.lineUp | "free: \(.free_model_ids | join(", "))\npremium: \(.premium_model_ids | join(", "))\nthinking table: \(if .thinking_levels == null then "none" else (.thinking_levels | keys | join(", ")) end)"' "$ART/line-up.json"
echo "line-up file: $ART/line-up.json (SB3's LINEUP)"
```

2. **SB3 with `LINEUP="$ART/line-up.json"`.** T+1's site version is planned with that `lineUp`. The owner reads
   `previewLineUpPolicy` as `added` in the delta, with exactly the lists and the table printed above; SB6's yes names
   it ("the line-up moves into the settings version, unchanged"). Later uploads leave `LINEUP` empty: the row comes
   with the active version.
3. **Right after SB5: the new release's two env files in the sockets-only form.** SB5's `derive` copied the old
   release's `PREVIEW_PROVIDER_TEST_CONFIG_JSON` byte for byte, line-up included; beside a site version that carries the
   row it would refuse the start (`PREVIEW_LINE_UP_ENV_CONFLICT`, owner answer Q-L2). This keeps only its gate part, in
   `api-$LABEL.env` and `runner-$LABEL.env` alike, and prints no value. The old release's files stay as they are (SB5's
   SAME check compares only the gate sockets and the scope across the two releases, so it still holds). `ui-$LABEL.env`
   keeps its model list: the website's start-up check accepts the sockets-only API setting beside any reviewed list.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# T+1 only, right after SB5: PREVIEW_PROVIDER_TEST_CONFIG_JSON of api- and runner-<LABEL>.env keeps only its gate part. No value is printed.
K=PREVIEW_PROVIDER_TEST_CONFIG_JSON
for SVC in api runner; do [ "$(grep -c "^$K=" "$E/$SVC-$LABEL.env")" = 1 ] || { echo "SOCKETS_NOT_DONE: $K is not in $SVC-$LABEL.env exactly once"; exit 1; }; done
[ "$(sed -n "s/^$K=//p" "$E/api-$LABEL.env")" = "$(sed -n "s/^$K=//p" "$E/runner-$LABEL.env")" ] || { echo "SOCKETS_NOT_DONE: the API's and the runner's values differ (SB5's SAME check stops that): ask"; exit 1; }
G=$(sed -n "s/^$K=//p" "$E/api-$LABEL.env" | jq -ce '{budget_socket, deployment, requested_thinking_level, scope_id} + (if has("anthropic_budget_socket") then {anthropic_budget_socket} else {} end) | select(all(.[]; type == "string" and length > 0))') || { echo "SOCKETS_NOT_DONE: the value has no complete gate part: ask"; exit 1; }
for SVC in api runner; do
  F=$E/$SVC-$LABEL.env; D=$S/$SVC-$LABEL.env.derived
  [ -e "$D" ] || { cp -p "$F" "$D"; chmod 0600 "$D"; }
  MODE=$(stat -c '%a %U:%G' "$F")
  cp -p "$F" "$F.sockets"
  G="$G" awk -v k="$K" 'index($0, k "=") == 1 { print k "=" ENVIRON["G"]; next } { print }' "$F" > "$F.sockets"
  diff <(grep -v "^$K=" "$D") <(grep -v "^$K=" "$F.sockets") > /dev/null || { echo "SOCKETS_NOT_DONE: another line of $SVC-$LABEL.env would change ($F.sockets is only a draft)"; exit 1; }
  [ "$(stat -c '%a %U:%G' "$F.sockets")" = "$MODE" ] || { echo "SOCKETS_NOT_DONE: the draft's mode or owner differs ($F.sockets)"; exit 1; }
  mv "$F.sockets" "$F"
done
[ "$(sed -n "s/^$K=//p" "$E/api-$LABEL.env")" = "$G" ] && [ "$(sed -n "s/^$K=//p" "$E/runner-$LABEL.env")" = "$G" ] || { echo "SOCKETS_NOT_DONE: a file does not carry the gate part (the copies before: $S/*-$LABEL.env.derived)"; exit 1; }
[ "$(jq -cS '{budget_socket, anthropic_budget_socket, scope_id}' <<<"$G")" = "$(sed -n "s/^$K=//p" "$E/api-$OLABEL.env" | jq -cS '{budget_socket, anthropic_budget_socket, scope_id}')" ] || { echo "SOCKETS_NOT_DONE: the gate part differs from the old release's: ask"; exit 1; }
for SVC in api runner; do
  C=$( cd "$CAPI/dialectical-engine" && /usr/bin/env -i PATH=/usr/bin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node --import ./node_modules/tsx/dist/loader.mjs tools/preview-practice/check-thinking-levels.ts --settings "$E/$SVC-$LABEL.env" 2>&1 ) || { echo "$C"; echo "SOCKETS_NOT_DONE: the checker refused $SVC-$LABEL.env"; exit 1; }
  grep -q 'No line-up in this setting' <<<"$C" || { echo "SOCKETS_NOT_DONE: $SVC-$LABEL.env is not in the sockets-only form"; exit 1; }
done
echo "api-$LABEL.env and runner-$LABEL.env: sockets-only (the line-up lives in the settings version)"
```

4. **After SB10 (the new release is pinned) and before SB11: the check of T+1's own site version.** Both halves of the
   new release dry-boot it, each with its own env file and its own declared targets, so every model the version can
   seat is served by both processes' targets and has its gate socket (and so its company is on the providers page, which
   lists what the API reaches). A version without the row beside the sockets-only setting fails here
   (`PREVIEW_LINE_UP_REQUIRED`: SB3 ran without `LINEUP`); so does a model no target serves. On FAIL nothing has started:
   WB1 (drained path: rbD-B), then a corrected upload.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# T+1 only, after SB10, before SB11: both halves of the new release dry-boot its own site version (no AI call).
V=$(cat "$S/new-register-version")
RC=0; OUT=$(lc settings-version.mjs check "$LABEL" "$V" 2>&1) || RC=$?
printf '%s\n' "$OUT" > "$S/settings-check-site-$V.json"
jq -r 'if .event == "PREVIEW_SETTINGS_CHECKED" then "verdict \(.verdict) for version \(.version) on \(.releaseKey) (receipt \(.receipt))", (.hints[] | "  \(.code): \(.hint)") else tostring end' <<<"$OUT" 2>/dev/null || echo "$OUT"
[ "$RC" = 0 ] || { echo "SITECHECK_NOT_DONE: not PASS (exit $RC, the lines above): stop; WB1 takes the new release away (drained path: rbD-B)"; exit 1; }
echo "the new release passes its own site version $V"
```

### The providers page

- **It follows the API by itself.** The "AI providers" legal page (`/providers`) names the companies the API's declared
  targets (`PROVIDER_DISCOVERY_TARGETS_JSON`) reach, read from the API at request time (`GET /v1/public/ai-providers`),
  companies only, no models. Today: DeepInfra and Anthropic. When the API does not answer, the page shows its last good
  answer, however old; if it never had one, every company of the reviewed catalogue: it never hides one.
- **A line-up or model change never needs a website upload.** Activations change no page; nor does a new model of a
  company the page already names.
- **Adding a company is an upload**, never an activation: its code, a reviewed spending gate, its targets in the env,
  and its legal facts checked by a person into the catalogue (`apps/ui/lib/legal/pages.ts`). The page lists it from that
  release on, when that release's API serves.
- **Advance notice first (manual).** The page promises "We tell you before a new provider receives any data". So before
  any upload that adds a company, the owner tells the users, and the upload waits until that notice has gone out; the
  page cannot do this by itself, because it lists a company only once the release that reaches it serves (owner to
  confirm: ruling R21).
- **A company leaves the targets one release later.** Drop a company's targets only in an upload after the release in
  which it stopped being seated (by an activation or an upload), never in that same upload. During a side-by-side switch
  the old release's runner finishes its own debates (up to the 6 h ceiling) while the page already follows the new
  release's API: dropping the company at once would take it off the page while it may still receive text. The tools
  hold the first half of the order: a release without the company's targets refuses a settings version that still seats
  one of its models (the check names `SETTINGS_NEEDS_ENV_CHANGE:TARGET:<model>`).
- **The website build's model list** (`ui-build --models`, `NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON`) now only sets the
  new-debate page's fallback list (shown when an older API sends no line-up with the room read), the new-debate page's
  maximum depth (a build with the flag set offers the preview's shallower ceiling) and the ask proxy's time limit for the
  preview's ask (1,260 s); the providers page no longer reads it. The UI start-up check still demands that
  `ui.env` and the build name the same list.

## Transition release T (one last drained upload)

**In plain words.** R19 has no fences: a restarted R19 runner would pick up a newer release's debates and could mark
them failed. So the first fenced release, **T**, goes up the old way one last time: a quiet moment, everything stopped,
a cold copy of the database. In the same downtime the server's layout changes once (side-by-side spec, "The
transition"):
- the API, the website and the runner become template units, one instance per release
  (`debateai-preview-<service>@<label>.service`), each with its own env file (`<service>-<label>.env`), its own
  native plan (`native-plan-<label>.json`) and its own entry in a release lock of schema v2;
- the release table (migration 0123) gets T as its first current release;
- Caddy gets two website slots (A = 3100/3101, B = 3200/3201) with health checks, and a loopback readiness listener on
  127.0.0.1:3090;
- PostgreSQL's `max_connections` goes from 200 to 320 (a restart, inside the cold-copy window).

From T+1 on, every upload follows "Side-by-side release (from T+1)" below.

**T's commit must contain D5** (each release's own native plan `native-plan-<label>.json`, `release-artifacts.mjs
database-ahead` and `prestart.mjs accept-ahead`): the scripts below use them. It does: the side-by-side integration branch
carries D5, so a dev commit taken after that branch was merged has it.

**Going back from T is never side by side** (spec §11). R19 cannot run beside a newer database, so the way back from
T's migrations on is rbB-T: the cold copy, which loses every debate and payment since TB2. That is why T carries no
product change: a problem in T is fixed forward.

**How each step runs.** Exactly as in "A normal release on a hosted base" above: one script per step, run on its own as
root with `bash -s`, `set -euo pipefail` first and the names file second (TA0 and TA1 make it), every guard written
`… || { echo "<STEP>_NOT_DONE: …"; exit 1; }`, the last line `<STEP>_DONE`, and nothing more after a `_NOT_DONE`
(read the way back and decide with the owner). The scripts print no env value other than `REGISTER_VERSION`,
`RELEASE_KEY`, `DEBATEAI_DEPLOYMENT_MODE`, `MAIL_SENDMAIL_PATH`, `PAYMENT_MARKS_AVAILABLE` (not secret) and ports. Every
trap of that section still holds:
- `nat` always exits 0: its line is captured and tested (`OUT=$(nat "$F"); [ "$OUT" = "exit 0" ] || …`), never chained;
- a pin writes `pinnedAt`, so a lock is compared without the pin times, or not re-pinned at all;
- the build roster is `all-models`;
- no runner prepare-only check (its proof is valid 180 seconds);
- a release's migrations go in before its first start (verify, publish and every start refuse while one is pending);
- every plan carries the hosted inputs (`--hosted-billing "$HB_ON" --checker deepseek --deepseek-enabled-on-gate yes`).

And four more, new with T:
- **One native plan per release.** A release's native operator reads only its own
  `/etc/debateai-v3-preview/auth-dev-v1/native-plan-<label>.json` (D5). R19's `native-plan.json` is never touched by T,
  so no step swaps a live verify plan and no step has to put one back.
- **Nothing starts before the release table names it.** prestart refuses every start of a release that the release
  table does not call STAGED or CURRENT (a runner also DRAINING). A hosted API with no current release treats itself as
  draining (its streams end, no loops, asks wait). So TB6 records T as current (`release-switch.mjs seed`) before T's
  API starts. From then on the team unlock and the creator also pick the current release's API through the release
  table and lock v2: both need the table readable and the current release pinned.
- **Caddy is restarted, never reloaded** (`admin off`, and its drop-in empties `ExecReload`), and `caddy.env` (a bcrypt
  hash) is loaded with `systemd-run`, never with the shell's `.`.
- **Two copies of the lifecycle tools.** Until TB5 the installed operator folder
  (`/opt/debateai-v3-preview/operator/lifecycle-v1`, `lc`) is R19's, which has none of the new tools, so the scripts
  before TB5 run T's own copy from its checked API folder (`tl`). TB5 replaces the installed folder with T's.

**The order, and the way back from each point.**

| Step | What | The site | The way back from here |
|---|---|---|---|
| TA0 | preflight and captures (read-only, plus one harmless timer probe) | up | nothing to undo |
| TA1 | names file, archive `$S`, the copies the way back needs, TA0's captures moved into `$S/preflight` | up | nothing to undo |
| TA2–TA7 | A2–A7 of the hosted-base recipe (package, dependencies, manifests, two builds with `--models all-models --release-key "$KEY"`, verify) | up | nothing to undo |
| TA8 | register plan and proposal, in T's own native-plan file | up | nothing to undo (R19's file untouched) |
| TA9 | the owner reads the delta (A9) | up | – |
| TA10 | gate files (A10) | up | – |
| TA-units | the API and website templates rendered from R19's live units, into `$S/templates` | up | nothing to undo |
| TA-caddy | the two-slot Caddyfile, into `$S`, checked, not installed | up | nothing to undo |
| TA-env | T's three env files derived from R19's live files | up | nothing to undo (the live files untouched) |
| TA-op | T's operator folder built beside the installed one, compared with T's checked API folder | up | nothing to undo (unused until TB5) |
| Practice | on the Mac (owner rule) | up | none |
| TB0 | preflight again, right before the downtime | up | – |
| TB0g | only when TA10 listed a gate file: the gate redeploy, right after TB0 at the same quiet moment | up | the gate's own (rbA-T and rbB-T keep the new gate: see TB0g) |
| TB1 | stop R19's runner, backup timer, website, API (the drain guard also counts waiting debates) | **down** | rbA-T |
| TB2 | cold copy; `max_connections` 320 | down | rbA-T |
| TB3 | migrations, with T's own native plan | down | **only the cold copy: rbB-T** |
| TB4 | publish; verify plan, first proof, three launch plans for slot A | down | rbB-T |
| TB5 | the one-time layout: operator folder, R19's fixed units aside, template units, target | down | rbB-T |
| TB6 | lock v2 and three pins, instance drop-ins, unit checks, T seeded current, API then website (the downtime ends) | up | rbB-T |
| TB7 | Caddy with two slots (about one second) | up | TB7 puts the old Caddyfile back by itself; then rbB-T if needed |
| TB8 | T's runner, by hand | up | rbB-T |
| TB9 | checks (read-only) | up | rbB-T |
| TB10 | on the Mac: the PR that makes `tests/n1-baseline.json` name T | up | – (T+1 needs it) |

**The owner's yes, fresh in the live chat right before TB0g (or TB1 when TA10 listed no gate file)** (TB0g to TB9 run
on it). It names:
- the downtime;
- the cold copy;
- `max_connections` 320 (a PostgreSQL restart);
- the gate redeploy, when TA10 listed a gate file;
- the migrations by number;
- the publish of register V with its delta hash;
- the one-time layout change (template units, lock v2, the release table with T as current, Caddy with two slots);
- the switch to T's commit, with its release key.

For example: "Yes, upload T (r20) to the test site now: stop the services, take the cold copy, set max_connections to
320, redeploy both gates with T's gate file, apply migrations 0123 to 0125, publish register 18 with delta 1a2b…, change
the layout once (template units, lock v2, the release table with T current, Caddy with two slots), switch to
`<commit>` as `r18-<12 hex>` and start everything again."

### TA0. Preflight and captures

R19's A0, plus the server facts the transition depends on, saved into a root-only folder that TA1 moves into `$S`. The
only change it makes besides that folder: one transient timer that would run `/bin/true` in 2099, stopped at once (it
shows whether systemd writes a persistent timer's stamp when the timer starts; the stamp file it leaves is harmless).

```sh
set -euo pipefail
# TA0: preflight for T. Reads only, writes only its own capture folder P (TA1 moves it into S), plus one stopped probe timer.
NN=rNN                                                    # T's number, e.g. r20
E=/etc/debateai-v3-preview/auth-dev-v1; ONP=$E/native-plan.json; LOCK=/etc/debateai-v3-preview/lifecycle/release-lock.json
C=/etc/debateai-v3-preview/public/Caddyfile; EDGE=/etc/debateai-v3-preview/ui-edge.caddy.secret; P=/root/preview-archive/$NN-preflight
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
gs() { /usr/bin/python3 -I "$1/preview_budget_authority.py" status --private "$2"; }
printf '%s\n' "$NN" | grep -qxE 'r[0-9]+' || { echo "TA0_NOT_DONE: NN is not filled in"; exit 1; }
[ ! -e "$P" ] || { echo "TA0_NOT_DONE: $P exists (look first)"; exit 1; }
date -u
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] || { echo "TA0_NOT_DONE: a debate is queued or running"; exit 1; }
echo "waiting debates (core.run_waiting_v): $(psqlq "SELECT count(*) FROM core.run_waiting_v")"
echo "ledger $(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")"
V0=$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1") || { echo "TA0_NOT_DONE: the database is unreadable"; exit 1; }; echo "register $V0"
for F in api.env runner.env; do [ "$(grep -c "^REGISTER_VERSION=$V0\$" "$E/$F")" = 1 ] && [ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$E/$F")" = 1 ] || { echo "TA0_NOT_DONE: $F is not hosted on register $V0"; exit 1; }; done
[ "$(jq -r .operation "$ONP")" = verify ] && [ "$(jq -r '.hostedBilling.billing // "none"' "$ONP")" = on ] || { echo "TA0_NOT_DONE: native-plan.json is not a billing-on verify plan"; exit 1; }
[ "$(jq -r '.schema // "none"' "$LOCK")" != preview-lifecycle-release-lock-v2 ] || { echo "TA0_NOT_DONE: the lock is already v2: T is done (use the side-by-side section)"; exit 1; }
jq -r '.services | to_entries[] | "\(.key) \(.value.sourceRevision) v\(.value.publication.registerVersion) \(.value.basePlan.path)"' "$LOCK"
[ "$(jq -r '[.services[].publication.registerVersion] | unique | join(" ")' "$LOCK")" = "$V0" ] || { echo "TA0_NOT_DONE: the lock's three plans are not all on register $V0"; exit 1; }
for SVC in api ui runner; do jq -r ".services.$SVC.sourceRoot" "$LOCK" | grep -qxE "/opt/debateai-v3-preview/releases/auth-dev-candidate-[a-z0-9-]+-$SVC" || { echo "TA0_NOT_DONE: the lock's $SVC folder does not end in -$SVC (launch-plan cannot read its label)"; exit 1; }; done
[ "$(psqlq "SELECT pg_has_role('debateai_prod_api_runtime','debateai_billing_runtime','MEMBER')")" = t ] || { echo "TA0_NOT_DONE: the API's login is not a billing member (H0)"; exit 1; }
for G in /opt/debateai-v3-preview/operator/deepinfra-budget-v3:/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 /opt/debateai-v3-preview/operator/anthropic-budget-v1:/var/lib/debateai-v3-preview/provider-anthropic-authority-v1; do
  J=$(gs "${G%%:*}" "${G#*:}") || { echo "TA0_NOT_DONE: a gate's status is unreadable"; exit 1; }; echo "$(basename "${G%%:*}") $(jq -c '{state,in_flight,today_spend_usd}' <<<"$J")"
  [ "$(jq -r .state <<<"$J")" = active ] && [ "$(jq -r .in_flight <<<"$J")" = 0 ] || { echo "TA0_NOT_DONE: a gate is not active, or has a call in flight"; exit 1; }
done
for U in api ui runner provider-budget anthropic-budget postgresql hatchet hatchet-gateway turnstile egress; do systemctl show -p Id -p ActiveState -p NRestarts debateai-preview-$U | tr '\n' ' '; echo; done
AV=$(df --output=avail -BG / | tail -1 | tr -dc 0-9); echo "disk free ${AV} GB"
[ "$AV" -ge 15 ] || { echo "TA0_NOT_DONE: less than 15 GB free"; exit 1; }
# The transition's own facts.
SV=$(systemctl --version | head -n 1 | awk '{print $2}'); echo "systemd $SV, $(/usr/bin/caddy version | head -n 1), $(curl --version | head -n 1 | cut -d' ' -f1-2)"
[ "$SV" -ge 254 ] || { echo "TA0_NOT_DONE: systemd is older than 254 (RestartMode=direct, MemoryPeak): ask"; exit 1; }
TSU=$(systemctl show -p TimeoutStopUSec --value debateai-preview-api); echo "API TimeoutStopUSec $TSU"
case "$TSU" in 3[0-9]s|[4-9][0-9]s|1min*|2min*) ;; *) echo "TA0_NOT_DONE: the API's stop timeout leaves no room for the 25 s stop recorder: ask"; exit 1;; esac
for K in api:REGISTER_VERSION api:API_PORT api:MAIL_SENDMAIL_PATH runner:REGISTER_VERSION runner:RUNNER_WORKER_ID runner:HATCHET_WORKER_NAME ui:PORT ui:DIALECTICAL_API_BASE; do
  [ "$(grep -c "^${K#*:}=" "$E/${K%%:*}.env")" = 1 ] || { echo "TA0_NOT_DONE: ${K%%:*}.env does not hold ${K#*:} exactly once (release-env.mjs derive changes it in place)"; exit 1; }
done
diff <(grep -E '^(PREVIEW_PROVIDER_TEST_CONFIG_JSON|PREVIEW_TEAM_USER_IDS_JSON)=' "$E/api.env") <(grep -E '^(PREVIEW_PROVIDER_TEST_CONFIG_JSON|PREVIEW_TEAM_USER_IDS_JSON)=' "$E/runner.env") >/dev/null || { echo "TA0_NOT_DONE: api.env and runner.env differ in the preview configuration or the team (SAME_API_RUNNER)"; exit 1; }
[ "$(systemctl cat debateai-preview-ui | grep -v '^[[:space:]]*#' | grep -c 'auth-dev-v1/api\.env' || true)" = 0 ] || { echo "TA0_NOT_DONE: the website unit names api.env (the template would keep it): ask"; exit 1; }
HARD=$(grep -rlE '^(Requires|BindsTo|Requisite|PartOf|Upholds)=.*debateai-preview-(api|ui|runner)\.service' /etc/systemd/system 2>/dev/null | grep -vE '^/etc/systemd/system/debateai-preview-(api|ui|runner)\.service(\.d/.*)?$' || true)
[ -z "$HARD" ] || { echo "$HARD"; echo "TA0_NOT_DONE: another unit hard-depends on a fixed unit (above): ask"; exit 1; }
[ "$(stat -c '%a %U' "$C")" = "644 root" ] || { echo "TA0_NOT_DONE: the Caddyfile is not root-owned 0644"; exit 1; }
case "$(stat -c '%a %U' "$EDGE")" in "600 root"|"640 root") ;; *) echo "TA0_NOT_DONE: the edge secret is not root-owned 0600 or 0640"; exit 1;; esac
[ "$(stat -c '%a %U:%G' /root/preview-archive)" = "700 root:root" ] || { echo "TA0_NOT_DONE: /root/preview-archive is not root-only 0700 (the receipt and every copy live there)"; exit 1; }
[ -z "$(ss -ltnH '( sport = :3090 or sport = :3200 or sport = :3201 )')" ] || { echo "TA0_NOT_DONE: something listens on 3090, 3200 or 3201"; exit 1; }
# The boot target's drop-in folder is shared: the Anthropic gate's 50-anthropic-gate.conf lives there (README-anthropic.md,
# "Switch it on"). Only the switch's own file must not exist yet; the folder and the gate's file stay as they are.
[ ! -e /etc/systemd/system/debateai-preview.target.d/60-current-release.conf ] || { echo "TA0_NOT_DONE: debateai-preview.target.d/60-current-release.conf exists already (look first)"; exit 1; }
# The switch's writer (release-switch.mjs, ensureDirectory) writes that file only into a root-owned 0755 folder that is no link.
[ "$(stat -c '%F %U %a' /etc/systemd/system/debateai-preview.target.d)" = "directory root 755" ] && [ "$(realpath /etc/systemd/system/debateai-preview.target.d)" = /etc/systemd/system/debateai-preview.target.d ] || { echo "TA0_NOT_DONE: the boot target's drop-in folder is not root 0755 (the switch's writer refuses it): ask"; exit 1; }
CF=$(psqlq "SHOW config_file") || { echo "TA0_NOT_DONE: SHOW config_file is unreadable (nothing written yet)"; exit 1; }
case "$CF" in /etc/debateai-v3-preview/postgresql/*) ;; *) echo "TA0_NOT_DONE: the PostgreSQL config is not under /etc/debateai-v3-preview/postgresql (the cold copy would not hold it): ask"; exit 1;; esac
[ "$(psqlq "SHOW max_connections")" = 200 ] && [ "$(psqlq "SELECT sourcefile FROM pg_settings WHERE name = 'max_connections'")" = "$CF" ] && [ "$(grep -cE '^[[:space:]]*max_connections[[:space:]]*=' "$CF")" = 1 ] && [ "$(grep -cE '^max_connections = 200([^0-9]|$)' "$CF")" = 1 ] || { echo "TA0_NOT_DONE: max_connections is not set by exactly one line 'max_connections = 200' of $CF (TB2 changes that one line): ask"; exit 1; }
install -d -o root -g root -m 0700 "$P"
umask 077
for SVC in api ui runner; do systemctl cat "debateai-preview-$SVC.service" > "$P/$SVC.cat"; systemctl show "debateai-preview-$SVC.service" > "$P/$SVC.show"; done
cp -p "$C" "$P/Caddyfile.live"
printf '%s\n' "$CF" > "$P/pg-config-file"
echo "max_connections $(psqlq "SHOW max_connections"), reserved $(psqlq "SELECT current_setting('superuser_reserved_connections')||'+'||coalesce(current_setting('reserved_connections', true), '0')"), config $CF" | tee "$P/pg-limits"
echo "role connection limits:"; psqlq "SELECT rolname||' '||rolconnlimit FROM pg_roles WHERE rolname LIKE 'debateai%' ORDER BY 1" | tee "$P/pg-role-limits"
echo "connections in use, by login:"; psqlq "SELECT coalesce(usename, '(none)')||' '||count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' GROUP BY usename ORDER BY 1" | tee "$P/pg-connections"
echo "databases of this cluster:"; psqlq "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1" | tee "$P/pg-databases"
if grep -qx hatchet "$P/pg-databases"; then echo "HATCHET_DATABASE_IN_THIS_CLUSTER yes"; else echo "HATCHET_DATABASE_IN_THIS_CLUSTER no"; fi
for U in api:2147483648 ui:1073741824 runner:3221225472; do
  MP=$(systemctl show -p MemoryPeak --value "debateai-preview-${U%%:*}"); echo "${U%%:*} MemoryPeak $MP (new cap ${U#*:})" | tee -a "$P/memory"
  case "$MP" in ''|*[!0-9]*) ;; *) [ "$MP" -lt "${U#*:}" ] || { echo "TA0_NOT_DONE: the ${U%%:*}'s memory peak reaches its new MemoryMax: ask"; exit 1; };; esac
done
grep '^MemAvailable:' /proc/meminfo | tee -a "$P/memory"
echo "files under /etc/systemd/system naming a fixed unit:"; { grep -rlE 'debateai-preview-(api|ui|runner)\.service' /etc/systemd/system 2>/dev/null || true; } | sort | tee "$P/fixed-unit-mentions"
echo "links to a fixed unit:"; find /etc/systemd/system -path '*.wants/*' \( -name debateai-preview-api.service -o -name debateai-preview-ui.service -o -name debateai-preview-runner.service \) | sort | tee "$P/fixed-unit-links"
# A baseline: R19's three live units pass systemd-analyze verify (TB5 and TB6 verify T's units the same way).
systemd-analyze verify /etc/systemd/system/debateai-preview-api.service /etc/systemd/system/debateai-preview-ui.service /etc/systemd/system/debateai-preview-runner.service > "$P/verify-r19.txt" 2>&1 || { cut -c1-300 "$P/verify-r19.txt"; echo "TA0_NOT_DONE: systemd-analyze verify refuses R19's own live units (above), so TB6's verify of T's instances could not pass either: ask"; exit 1; }
echo "systemd-analyze verify of R19's three units: OK"
# The default migration reader (release-check.mjs, release-artifacts.mjs) reads a migration only when every folder from
# it up to its release folder is root's, not group- or world-writable and no link: read that path in R19's API folder.
RAPI=$(jq -r .services.api.sourceRoot "$LOCK")
[ "$(realpath "$RAPI")" = "$RAPI" ] || { echo "TA0_NOT_DONE: R19's API folder is reached through a link (the migration reader refuses that): ask"; exit 1; }
# The boot target: TB5 replaces the file with T's copy (no fixed API or website). A line of the live file that R19's own
# copy does not have (a Wants= added by hand) would be lost there: ask first. The drop-ins in debateai-preview.target.d stay.
LT=/etc/systemd/system/debateai-preview.target; RT=$RAPI/dialectical-engine/deploy/preview-lifecycle/v1/systemd/debateai-preview.target
[ -f "$LT" ] && [ -f "$RT" ] || { echo "TA0_NOT_DONE: the live debateai-preview.target or R19's copy of it is missing: ask ($P exists: move it aside)"; exit 1; }
unitlines() { grep -vE '^[[:space:]]*(#|$)' "$1" | LC_ALL=C sort -u; }
XT=$(LC_ALL=C comm -13 <(unitlines "$RT") <(unitlines "$LT"))
[ -z "$XT" ] || { echo "$XT"; echo "TA0_NOT_DONE: the live debateai-preview.target has a line R19's copy does not (above); TB5 replaces the file with T's and would lose it: ask ($P exists: move it aside)"; exit 1; }
echo "lines of R19's boot target the live one lacks (T's copy has them, except the fixed API and website): $(LC_ALL=C comm -23 <(unitlines "$RT") <(unitlines "$LT") | tr '\n' ';')"
cp -p "$LT" "$P/debateai-preview.target.live"
echo "boot target drop-ins (they stay): $(find /etc/systemd/system/debateai-preview.target.d -maxdepth 1 -name '*.conf' -printf '%f ' 2>/dev/null || true)" | tee "$P/target-dropins"
RM=$(find "$RAPI/dialectical-engine/migrations" -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort | tail -n 1)
[ -n "$RM" ] || { echo "TA0_NOT_DONE: no migration file in R19's API folder"; exit 1; }
D=$(dirname "$RM"); while :; do SM=$(stat -c '%F %U %a' "$D"); echo "reader path: $D $SM" | tee -a "$P/reader-path"; case "$SM" in "directory root "*) ;; *) echo "TA0_NOT_DONE: $D is not a root-owned folder (the migration reader refuses it): ask"; exit 1;; esac; [ $(( 8#${SM##* } & 8#022 )) = 0 ] || { echo "TA0_NOT_DONE: $D is group- or world-writable (the migration reader refuses it): ask"; exit 1; }; [ "$D" = "$RAPI" ] && break; [ "$D" != / ] || { echo "TA0_NOT_DONE: the migration is not inside R19's API folder: ask"; exit 1; }; D=$(dirname "$D"); done
[ "$(stat -c '%F %U %a %h' "$RM")" = "regular file root 644 1" ] || { echo "TA0_NOT_DONE: $RM is not a root-owned 0644 file with one link: ask"; exit 1; }
# D5's chain child (release-artifacts.mjs database-ahead, from T+1's SB5) runs as nobody, from the verified release
# folder, through that folder's own tsx loader: nobody must run node with it and read the folder.
getent passwd nobody >/dev/null || { echo "TA0_NOT_DONE: there is no nobody account (the database-ahead child runs as nobody): ask"; exit 1; }
NB=$(cd "$RAPI/dialectical-engine" && runuser -u nobody -- /usr/bin/env -i PATH=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin:/usr/bin:/bin TSX_DISABLE_CACHE=1 TSX_TSCONFIG_PATH="$RAPI/dialectical-engine/tsconfig.json" /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node --import "$RAPI/dialectical-engine/node_modules/tsx/dist/loader.mjs" --input-type=module -e "process.stdout.write('ok')" 2>&1 || true)
[ "$NB" = ok ] || { echo "$NB" | cut -c1-300; echo "TA0_NOT_DONE: nobody cannot run node with a release folder's own tsx loader (above): ask"; exit 1; }
UR=$(cd / && runuser -u nobody -- /usr/bin/find "$RAPI/dialectical-engine/packages/db/src" "$RAPI/dialectical-engine/migrations" "$RAPI/dialectical-engine/tsconfig.json" ! -readable -print 2>&1 | head -n 5 || true)
[ -z "$UR" ] || { echo "$UR"; echo "TA0_NOT_DONE: nobody cannot read part of a release folder (above): ask"; exit 1; }
echo "nobody runs a release folder's tsx loader and reads its database code: OK"
# Facts the retirement tools rely on (Linux only).
JX=0; JO=$(journalctl -u debateai-preview-alert@ta0-probe-none.service --since=-1min -q -o cat --no-pager) || JX=$?
echo "journalctl -q for a unit with no entries: exit $JX, ${#JO} bytes"
[ "$JX" = 0 ] && [ -z "$JO" ] || { echo "TA0_NOT_DONE: journalctl -q does not exit 0 with no output for a unit with no entries (the retirement receipt relies on it): ask"; exit 1; }
SX=0; SL=$(systemctl show -p LoadState --value debateai-preview-ta0-probe-none.timer) || SX=$?
echo "systemctl show of a unit that does not exist: LoadState=$SL, exit $SX"
echo "PID 1's 'deactivated successfully' line for the backup service: $(journalctl -u debateai-preview-backup.service MESSAGE_ID=7ad2d189f7e94e70a38c781354912448 -n 1 -o json --output-fields=MESSAGE_ID,UNIT,INVOCATION_ID,_PID -q --no-pager | jq -c '{pid: ._PID, unit: .UNIT, invocation: (.INVOCATION_ID | type == "string")}' || true)"
echo "start lines in the API's current invocation: $(journalctl -u debateai-preview-api _SYSTEMD_INVOCATION_ID="$(systemctl show -p InvocationID --value debateai-preview-api)" -o cat -q --no-pager | grep -c '^PREVIEW_API_STARTED ' || true)"
echo "alert units seen in the journal: $(journalctl -F _SYSTEMD_UNIT 2>/dev/null | grep -c '^debateai-preview-alert@' || true)"
PU=debateai-ta0-probe-$(date -u +%Y%m%d%H%M%S)
systemd-run --quiet --unit="$PU" --on-calendar='2099-01-01 00:00:00 UTC' --timer-property=Persistent=true /bin/true
sleep 2
if [ -e "/var/lib/systemd/timers/stamp-$PU.timer" ]; then echo "STAMP_AT_START yes" | tee "$P/timer-stamp"; else echo "STAMP_AT_START no" | tee "$P/timer-stamp"; fi
systemctl stop "$PU.timer" || true
echo TA0_DONE
```

How to read what it printed:
- `waiting debates` must be 0 at TB1; a number now only tells you to pick another quiet hour.
- `HATCHET_DATABASE_IN_THIS_CLUSTER no` means Hatchet's database lives outside this cluster: the online backup of later
  uploads (SB7) would not hold it. Tell the owner.
- The role limits, the connections in use and the memory lines are the numbers the connection budget (320, at least
  120 free during a switch) and the caps (runner 3G, API 2G, website 1G) were set from: show them to the owner.
- The two lists under `/etc/systemd/system` name every file and link that still mentions a fixed unit. TB5 moves the
  links aside with the units; an `After=` or `Wants=` of a unit that is gone is harmless (the hard dependencies were
  refused above).
- `boot target drop-ins (they stay)` lists what already lives in `debateai-preview.target.d` (on the live preview the
  Anthropic gate's `50-anthropic-gate.conf`). T adds only `60-current-release.conf` there (TB6's seed); TB5 replaces only
  the file `debateai-preview.target`, and rbB-T moves only those two of T's back out.
- PID 1's line must show `pid` `"1"`, the backup unit and `invocation` `true` (the receipt's journal evidence); the start
  line count must be at least 1 (the switch reads start lines the same way). If either is missing, tell the owner
  before TB1.
- `reader path` lists owner and mode of every folder from a migration up to R19's API folder: the staging makes every
  release folder the same way, so a newer release's migrations will be readable by the release check and the
  database-ahead tool. The `nobody` line proves the database-ahead child can run there (it never runs as root).
- `STAMP_AT_START yes`: a reboot that skips a backstop time still fires it at the next boot. `no`: that catch-up is not
  proven on this systemd; after a reboot during a drain, run `systemctl start debateai-preview-runner-retire@<label>.service`
  by hand once the backstop time has passed (`release-check.mjs status` shows which release drains). Either way, after
  a reboot during a drain no runner runs until SB14b starts them.

### TA1. Names, the archive `$S` and the copies the way back needs

A1's names file, plus T's own names: its release key, its slot (A), its per-release native plan, the tool wrappers and
the edge helpers. `AU` and `AGRP` are written in as values: after TB5 the fixed API unit they were read from is gone.

```sh
set -euo pipefail
# TA1: T's names file, its archive folder S, the copies the way back needs, and TA0's captures moved into S/preflight.
NN=rNN                                                    # T's number, the same as in TA0
REV='<the full 40-character dev commit>'                  # on the Mac: git fetch origin dev && git rev-parse refs/remotes/origin/dev
OSTORE='<the pnpm store the live release installed from>'
LOCK=/etc/debateai-v3-preview/lifecycle/release-lock.json; E=/etc/debateai-v3-preview/auth-dev-v1; ONP=$E/native-plan.json
NAMES=/root/preview-archive/$NN-names.sh; SP=/root/preview-archive/$NN-S.txt; P=/root/preview-archive/$NN-preflight
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
[ ! -e "$NAMES" ] && [ ! -e "$SP" ] || { echo "TA1_NOT_DONE: $NAMES or $SP exists (look first)"; exit 1; }
[ -s "$P/api.show" ] && [ -s "$P/ui.show" ] && [ -s "$P/runner.show" ] && [ -s "$P/Caddyfile.live" ] && [ -s "$P/pg-config-file" ] && [ -s "$P/debateai-preview.target.live" ] || { echo "TA1_NOT_DONE: TA0's captures are missing (TA0 first)"; exit 1; }
printf '%s\n' "$NN" | grep -qxE 'r[0-9]+' && printf '%s\n' "$REV" | grep -qxE '[0-9a-f]{40}' || { echo "TA1_NOT_DONE: NN or REV is not filled in"; exit 1; }
[ -d "$OSTORE/v11" ] || { echo "TA1_NOT_DONE: OSTORE is not a pnpm store"; exit 1; }
[ "$(jq -r '.schema // "none"' "$LOCK")" != preview-lifecycle-release-lock-v2 ] || { echo "TA1_NOT_DONE: the lock is already v2: T is done"; exit 1; }
OCAPI=$(jq -r .services.api.sourceRoot "$LOCK"); OCUI=$(jq -r .services.ui.sourceRoot "$LOCK"); OCRUN=$(jq -r .services.runner.sourceRoot "$LOCK")
OREV=$(jq -r .services.api.sourceRevision "$LOCK"); OLABEL=${OCAPI#/opt/debateai-v3-preview/releases/auth-dev-candidate-}; OLABEL=${OLABEL%-api}
OPLANS=$(dirname "$(jq -r .services.api.basePlan.path "$LOCK")")
[ "$OCUI" = "/opt/debateai-v3-preview/releases/auth-dev-candidate-$OLABEL-ui" ] && [ "$OCRUN" = "/opt/debateai-v3-preview/releases/auth-dev-candidate-$OLABEL-runner" ] && [ "$(jq -r '[.services[].sourceRevision] | unique | length' "$LOCK")" = 1 ] || { echo "TA1_NOT_DONE: the lock's three services are not one release"; exit 1; }
for F in api ui runner; do [ "$(jq -r ".services.$F.basePlan.path" "$LOCK")" = "$OPLANS/$F-launch.json" ] || { echo "TA1_NOT_DONE: the lock's $F plan is not in $OPLANS"; exit 1; }; done
[ "$(jq -r .operation "$ONP")" = verify ] && [ "$(jq -r .sourceRevision "$ONP")" = "$OREV" ] && [ "$REV" != "$OREV" ] || { echo "TA1_NOT_DONE: native-plan.json is not the live release's verify plan, or REV is the live release"; exit 1; }
LABEL=${REV:0:9}-$NN-v1
printf '%s\n' "$LABEL" | grep -qxE '[a-z0-9][a-z0-9-]{0,62}[a-z0-9]' || { echo "TA1_NOT_DONE: $LABEL is not a release label of at most 64 characters"; exit 1; }
REG0=$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1") || { echo "TA1_NOT_DONE: the database is unreadable"; exit 1; }
KEY="r$((REG0 + 1))-${REV:0:12}"
printf '%s\n' "$KEY" | grep -qxE 'r[1-9][0-9]*-[0-9a-f]{12}' || { echo "TA1_NOT_DONE: $KEY is not a release key"; exit 1; }
AU=$(systemctl show -p User --value debateai-preview-api)
[ -n "$AU" ] && [ "$AU" != root ] || { echo "TA1_NOT_DONE: the API's user is empty or root"; exit 1; }
AGRP=$(id -gn "$AU")
[ ! -e "/opt/debateai-v3-preview/artifacts/auth-dev-$LABEL" ] && [ ! -e "/opt/debateai-v3-preview/releases/auth-dev-candidate-$LABEL-api" ] || { echo "TA1_NOT_DONE: this release's artifacts folder or folders exist"; exit 1; }
for F in "native-plan-$LABEL.json" "api-$LABEL.env" "ui-$LABEL.env" "runner-$LABEL.env"; do [ ! -e "$E/$F" ] || { echo "TA1_NOT_DONE: $E/$F exists (look first)"; exit 1; }; done
[ -d "/opt/debateai-v3-preview/artifacts/auth-dev-$OLABEL/source-reference" ] || { echo "TA1_NOT_DONE: the old release's reference clone is missing"; exit 1; }
S=/root/preview-archive/$NN-$(date -u +%Y%m%dT%H%M%SZ)
install -d -o root -g root -m 0700 "$S"
umask 077
printf '%s\n' "$S" > "$SP"
{ printf 'REV=%s\nLABEL=%s\nKEY=%s\nSLOT=A\nUIP=3100\nAPIP=3101\nOREV=%s\nOLABEL=%s\nOCAPI=%s\nOCUI=%s\nOCRUN=%s\nOPLANS=%s\nOSTORE=%s\nAU=%s\nAGRP=%s\nS=$(cat %s)\n' "$REV" "$LABEL" "$KEY" "$OREV" "$OLABEL" "$OCAPI" "$OCUI" "$OCRUN" "$OPLANS" "$OSTORE" "$AU" "$AGRP" "$SP"
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
TL=$CAPI/dialectical-engine/deploy/preview-lifecycle/v1
E=/etc/debateai-v3-preview/auth-dev-v1
NP=$E/native-plan-$LABEL.json
ONP=$E/native-plan.json
LOCK=/etc/debateai-v3-preview/lifecycle/release-lock.json
C=/etc/debateai-v3-preview/public/Caddyfile
EDGE=/etc/debateai-v3-preview/ui-edge.caddy.secret
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
lc() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/$1" "${@:2}"; }
tl() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$TL/$1" "${@:2}"; }
cslots() { /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin TZ=UTC /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$CAPI/dialectical-engine/deploy/preview-release/v1/caddy-slots.mjs" "$@"; }
cad() { systemd-run --quiet --pipe --wait --collect -p EnvironmentFile=/etc/debateai-v3-preview/public/caddy.env /usr/bin/caddy "$@"; }
readyz() { printf 'X-Debateai-Edge-Secret: %s\n' "$(cat "$EDGE")" | curl -s -m 5 -H @- -w '\n%{http_code}' "http://127.0.0.1:$1/readyz" || true; }
edgekey() { { curl -s -m 15 -o /dev/null -D - http://127.0.0.1:3090/readyz || true; } | tr -d '\r' | awk 'NR == 1 { s = $2 } tolower($1) == "x-debateai-release:" { k = $2 } END { print (s == "" ? "000" : s) " " (k == "" ? "none" : k) }'; }
gs() { /usr/bin/python3 -I "$1/preview_budget_authority.py" status --private "$2"; }
EOF
} > "$NAMES"
chmod 0600 "$NAMES" "$SP"
. "$NAMES"
umask 077
cp -p "$E/api.env" "$S/api.env.before"; cp -p "$E/runner.env" "$S/runner.env.before"; cp -p "$E/ui.env" "$S/ui.env.before"
chmod 0600 "$S/api.env.before" "$S/runner.env.before" "$S/ui.env.before"
cp -p "$LOCK" "$S/release-lock.before.json"
cp -a "$ONP" "$S/native-plan.before.json"
jq -r '.services.api.basePlan.path, .services.ui.basePlan.path, .services.runner.basePlan.path' "$LOCK" > "$S/old-plans.txt"
# The debateai-preview-* glob does not match debateai-preview.target: the boot target and its drop-in folder (the gate's) are named.
( cd /etc/systemd/system && tar -czf "$S/systemd-before.tgz" debateai-preview-* debateai-preview.target debateai-preview.target.d ) || { echo "TA1_NOT_DONE: the copy of the systemd files failed (the boot target or its drop-in folder is missing?): ask (the names file and S exist: move them aside before running TA1 again)"; exit 1; }
psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration" > "$S/ledger-before"
psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1" > "$S/register-before"
mv "$P" "$S/preflight"
umask 022
cmp -s "$S/native-plan.before.json" "$ONP" && cmp -s "$S/release-lock.before.json" "$LOCK" && cmp -s "$S/api.env.before" "$E/api.env" && cmp -s "$S/runner.env.before" "$E/runner.env" && cmp -s "$S/ui.env.before" "$E/ui.env" || { echo "TA1_NOT_DONE: a copy differs from the live file"; exit 1; }
echo "S=$S ART=$ART; T is $LABEL, key $KEY, slot A; the old release is $OLABEL, its plans in $OPLANS; ledger $(cat "$S/ledger-before"), register $(cat "$S/register-before")"
echo TA1_DONE
```

### TA2–TA7. Package, dependencies, manifests, builds, verify

A2, A3 and A4–A7 of "A normal release on a hosted base", unchanged: their scripts read this names file. A5 and A6 take
`KEY` from the names file (it is the same `r<register + 1>-<12 hex of REV>` A5 computes). A7 must print six
`PREVIEW_RELEASE_VERIFIED` lines naming `REV`. A2 lists the new migrations (T brings 0123 and the other database steps
of the side-by-side build) and the changed gate and lifecycle files (TA10, TB5).

### TA8. The register plan and its proposal, in T's own native-plan file

`native-plan.json` stays R19's verify plan: T's native operator reads `native-plan-$LABEL.json` only, so the plan goes
there, and nothing has to be stopped or put back while `nat` runs.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TA8: the plan (billing-on inputs, the live checker) and the native operator's proposal, in T's own native-plan file.
REG0=$(cat "$S/register-before")
[ "$(jq -cS . <<<"$HB_ON")" = '{"askRoomReads":{"capacity":65536,"limit":60,"windowMs":60000},"billing":"on","dailyCeilingMicros":10000000,"perRunCeilingMicros":3000000}' ] || { echo "TA8_NOT_DONE: HB_ON is not the billing-on JSON"; exit 1; }
cmp -s "$S/native-plan.before.json" "$ONP" || { echo "TA8_NOT_DONE: the live native-plan.json moved since TA1"; exit 1; }
[ ! -e "$NP" ] || { echo "TA8_NOT_DONE: $NP exists (look first)"; exit 1; }
[ ! -e "$ART/native-plan-plan.json" ] && [ ! -e "$ART/register-proposal.json" ] || { echo "TA8_NOT_DONE: an earlier plan or proposal exists (look first)"; exit 1; }
rel native-plan --operation plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --checker deepseek --deepseek-enabled-on-gate yes --hosted-billing "$HB_ON" --out "$ART/native-plan-plan.json" || { echo "TA8_NOT_DONE: the release tool refused the plan"; exit 1; }
[ "$(jq -r .operation "$ART/native-plan-plan.json")" = plan ] && [ "$(jq -r '.hostedBilling.billing // "none"' "$ART/native-plan-plan.json")" = on ] && [ "$(jq -r .sourceRoot "$ART/native-plan-plan.json")" = "$CAPI" ] || { echo "TA8_NOT_DONE: the plan is not T's billing-on plan"; exit 1; }
put "$ART/native-plan-plan.json" || { echo "TA8_NOT_DONE: put of the plan failed"; exit 1; }
OUT=$(nat "$ART/register-proposal.json"); echo "nat: $OUT"
[ "$OUT" = "exit 0" ] || { head -c 2000 "$ART/register-proposal.json"; echo; echo "TA8_NOT_DONE: the native operator refused the plan"; exit 1; }
cmp -s "$S/native-plan.before.json" "$ONP" || { echo "TA8_NOT_DONE: the live native-plan.json moved"; exit 1; }
[ "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" = "$REG0" ] || { echo "TA8_NOT_DONE: the proposal is not based on register $REG0"; exit 1; }
sha256sum "$ART/native-plan-plan.json" "$ART/register-proposal.json" > "$S/plan-proposal.sha256"
jq -c '{baseRegisterVersion,addedKeys,changedKeys,removedKeys,deltaSha256}' "$ART/register-proposal.json"
echo TA8_DONE
```

### TA9. The owner reads the delta

A9, unchanged. The owner's yes before TB1 names the printed `deltaSha256`.

### TA10. Gate files

A10, unchanged. If A2 listed a changed gate file (T carries B13's change of `preview_budget_authority.py`: the gate
names two more refusals, so its file hash changes and each gate's GO is written again at install), the gate is
redeployed right before the downtime, as TB0g (after TB0, at the same quiet moment, so the downtime does not hold it).
R19 reads the two new refusals exactly as it reads a stop today, so the new gate is safe for R19 and for rbA-T.

### TA-units. The API and website templates

`unit-templates.mjs render` copies R19's live units (as TA0 captured them) into the template files, changing only the
env file path to the instance's own file (`…/<service>-%i.env`), on every line that names it (`EnvironmentFile=` and
any other, such as `ReadOnlyPaths=`), and leaving out the base unit's `[Install]`, the old `50-lifecycle.conf` (the
repo's `@.service.d/50-lifecycle.conf` replaces it) and the old release drop-in (each instance gets its own). It refuses
any line that still names something of one release: another service's env file, port 3100 or 3101,
`lifecycle-current`, a fixed unit name (except the website's own lines on the fixed API: see the note below), or an
instance specifier. The script then makes the same two changes to each
live file itself (the path, and the base unit's `[Install]` left out) and requires the result to equal the template
byte for byte. The owner reads the file list and the changed lines it prints.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TA-units: the API and website templates rendered from R19's live units into S/templates. Nothing is installed (TB5 does).
UD=/etc/systemd/system
noinst() { awk '{ t = $0; sub(/^[ \t\r]+/, "", t); sub(/[ \t\r]+$/, "", t) } t ~ /^\[/ { inst = (t == "[Install]") } !inst'; }
for SVC in api ui; do [ ! -e "$S/templates/$SVC" ] || { echo "TA_UNITS_NOT_DONE: $S/templates/$SVC exists (look first)"; exit 1; }; done
for SVC in api ui; do cmp -s <(systemctl cat "debateai-preview-$SVC.service") "$S/preflight/$SVC.cat" || { echo "TA_UNITS_NOT_DONE: the live $SVC unit changed since TA0: ask"; exit 1; }; done
# systemctl show prints EnvironmentFiles, BindPaths, BindReadOnlyPaths, TemporaryFileSystem and DeviceAllow once per entry
# (unit-templates.mjs reads them as lists). Any other property TB6's compare reads, printed twice, would stop TB6 inside
# the downtime: it stops here instead. ONE is that list (the guide test holds it to unit-templates.mjs).
ONE='Id LoadState User Group SupplementaryGroups ProtectSystem ProtectHome PrivateTmp PrivateDevices ProtectProc ProcSubset NoNewPrivileges RestrictAddressFamilies IPAddressAllow IPAddressDeny ReadWritePaths ReadOnlyPaths InaccessiblePaths CapabilityBoundingSet AmbientCapabilities SystemCallFilter SystemCallArchitectures RestrictNamespaces RestrictSUIDSGID LockPersonality MemoryDenyWriteExecute UMask LimitNOFILE LimitCORE TasksMax Environment UnsetEnvironment PassEnvironment KillMode TimeoutStopUSec Restart RestartUSec StartLimitBurst StartLimitIntervalUSec ProtectKernelTunables ProtectKernelModules ProtectKernelLogs ProtectControlGroups ProtectClock ProtectHostname RestrictRealtime StateDirectory RuntimeDirectory PrivateNetwork PrivateUsers DevicePolicy RestrictFileSystems NoExecPaths ExecPaths SocketBindAllow SocketBindDeny LogsDirectory'
for SVC in api ui; do
  echo "$SVC.show, one line per entry: $(for K in EnvironmentFiles BindPaths BindReadOnlyPaths TemporaryFileSystem DeviceAllow; do printf '%s %s, ' "$K" "$(grep -c "^$K=" "$S/preflight/$SVC.show" || true)"; done)"
  DUP=$(cut -d= -f1 "$S/preflight/$SVC.show" | LC_ALL=C sort | uniq -d | grep -xF -f <(tr ' ' '\n' <<<"$ONE") || true)
  [ -z "$DUP" ] || { echo "$DUP"; echo "TA_UNITS_NOT_DONE: $SVC.show holds a one-value property twice (above): TB6's compare would refuse it: ask"; exit 1; }
done
install -d -o root -g root -m 0700 "$S/templates" "$S/templates/api" "$S/templates/ui"
for SVC in api ui; do
  RT=$(tl unit-templates.mjs render --service "$SVC" --cat "$S/preflight/$SVC.cat" --out "$S/templates/$SVC" 2>&1) || { echo "$RT"; echo "TA_UNITS_NOT_DONE: the $SVC template was refused (the line above names the file and line): ask"; exit 1; }
  echo "$RT"
done
for SVC in api ui; do
  T=$S/templates/$SVC
  echo "== $SVC: the live drop-ins left out:"
  for F in "$UD/debateai-preview-$SVC.service.d"/*.conf; do [ -e "$F" ] || continue; [ -e "$T/debateai-preview-$SVC@.service.d/$(basename "$F")" ] || basename "$F"; done
  echo "== $SVC: the changed lines (the env file path on every line that names it, and the base unit's [Install] left out):"
  OTHER=0
  for F in "$T/debateai-preview-$SVC@.service" "$T/debateai-preview-$SVC@.service.d"/*.conf; do
    [ -e "$F" ] || continue
    case "$F" in *.conf) SRC=$UD/debateai-preview-$SVC.service.d/$(basename "$F"); CUT=cat;; *) SRC=$UD/debateai-preview-$SVC.service; CUT=noinst;; esac
    diff "$SRC" "$F" | grep -E '^[<>]' || true
    cmp -s <(sed "s#$E/$SVC.env#$E/$SVC-%i.env#g" "$SRC" | "$CUT") "$F" || { echo "   $(basename "$F") differs beyond the env path and the [Install] section"; OTHER=$((OTHER + 1)); }
  done
  [ "$OTHER" = 0 ] || { echo "TA_UNITS_NOT_DONE: $OTHER file(s) of the $SVC template differ from the live files beyond render's two changes: ask"; exit 1; }
done
echo TA_UNITS_DONE
```

Note (R20, 2026-10-22): the live website unit carried `After=debateai-preview-api.service` and
`Requires=debateai-preview-api.service`. The older tool refused them as a fixed unit name, and the owner approved
rendering from a copy without those two lines. The tool now leaves such a website line out itself (an `After=`,
`Requires=`, `Wants=` or `BindsTo=` line whose only value is the fixed API), because the repo's
`debateai-preview-ui@.service.d/50-lifecycle.conf` binds each website to its own release's API. The script's
byte-for-byte check above still counts those left-out lines as a difference, so on a live website unit that has them it
stops with `TA_UNITS_NOT_DONE`: the owner reads the two lines in the printed diff and decides, as on R20.

Expect two `PREVIEW_UNIT_TEMPLATE_RENDERED` lines, each listing `debateai-preview-<service>@.service` and the copied
drop-ins (for the API: the hosted egress drop-in, the old nine-z drop-in and, from H9, the billing notice spool
drop-in), then for each service its left-out drop-ins (`50-lifecycle.conf`, `zzzzzzzzzz-lifecycle-release.conf`), every
line naming `…/<service>.env` (the `EnvironmentFile=` lines, and others such as `ReadOnlyPaths=`) going to
`…/<service>-%i.env`, and the base unit's `[Install]` lines left out. A line `… differs beyond the env path and the
[Install] section` stops the step.

### TA-caddy. The two-slot Caddyfile

`caddy-slots.mjs transform` writes the changed copy into `$S` (never the live file): every
`reverse_proxy 127.0.0.1:3100 {` (the notify handle's and the main route's) becomes a two-slot proxy importing the
shared health rules, the main route's block starts with `respond /readyz 404` (the public route never answers readiness:
every request it proxies carries the edge secret), and the loopback listener 127.0.0.1:3090 is appended (GET `/readyz`
only, everything else 404). The handler order check leaves out that one `/readyz` route and checks it on its own.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TA-caddy: the two-slot Caddyfile in S, validated and read back through caddy adapt. The live file and Caddy are not touched.
[ ! -e "$S/Caddyfile.two-slot" ] || { echo "TA_CADDY_NOT_DONE: $S/Caddyfile.two-slot exists (a refused run's file stays: move it aside first)"; exit 1; }
cmp -s "$C" "$S/preflight/Caddyfile.live" || { echo "TA_CADDY_NOT_DONE: the live Caddyfile changed since TA0: ask"; exit 1; }
TR=$(cslots transform --in "$C" --out "$S/Caddyfile.two-slot" 2>&1) || { echo "$TR"; echo "TA_CADDY_NOT_DONE: the transform refused (reason above)"; exit 1; }
echo "$TR"
[ "$(jq -r '[.event, .edgeListener] | map(tostring) | join(" ")' <<<"$TR")" = "PREVIEW_CADDY_TWO_SLOTS 3090" ] || { echo "TA_CADDY_NOT_DONE: the transform did not report the two slots"; exit 1; }
cad validate --config "$S/Caddyfile.two-slot" --adapter caddyfile >/dev/null 2>&1 || { echo "TA_CADDY_NOT_DONE: Caddy's validation refused the two-slot file (an older Caddy without health_passes or health_fails?): ask"; exit 1; }
order() { cad adapt --config "$1" --adapter caddyfile 2>/dev/null | jq -r 'walk(if type == "object" and has("routes") then .routes |= map(select([.match[]?.path[]?] != ["/readyz"])) else . end) | [.apps.http.servers[].routes[] | select(.match[0].host[0]=="v3-preview.dezbatere.ro") | .handle[] | .. | objects | select(has("handler")) | .handler] | join(" > ")'; }
O1=$(order "$C"); O2=$(order "$S/Caddyfile.two-slot")
echo "handlers, live:     $O1"; echo "handlers, two slots: $O2"
[ -n "$O2" ] && [ "$O1" = "$O2" ] || { echo "TA_CADDY_NOT_DONE: the main route's handler order changed: ask"; exit 1; }
AD=$(cad adapt --config "$S/Caddyfile.two-slot" --adapter caddyfile 2>/dev/null)
UP=$(jq -r '[.. | objects | select(.handler? == "reverse_proxy") | [.upstreams[]?.dial] | map(tostring) | join(" ")] | unique | join(",")' <<<"$AD")
RW=$(jq -r '[.. | objects | select(.handler? == "rewrite") | .uri] | unique | join(",")' <<<"$AD")
HC=$(jq -r '[.. | objects | select(has("health_checks")) | .health_checks.active | "\(.uri) passes \(.passes) fails \(.fails) secret \((.headers // {} | keys | map(ascii_downcase) | index("x-debateai-edge-secret")) != null)"] | unique | join(",")' <<<"$AD")
LI=$(jq -r '[.apps.http.servers[] | .listen[]? | select(test(":3090$"))] | join(",")' <<<"$AD")
PR=$(jq -r '[.apps.http.servers[].routes[] | select(.match[0].host[0]=="v3-preview.dezbatere.ro") | .. | objects | select(has("handle") and [.match[]?.path[]?] == ["/readyz"]) | [.handle[] | "\(.handler) \(.status_code)"] | join(",")] | join(";")' <<<"$AD")
echo "upstreams: $UP; listener rewrite: $RW; health check: $HC; listener: $LI; public /readyz: $PR"
[ "$UP" = "127.0.0.1:3100 127.0.0.1:3200" ] || { echo "TA_CADDY_NOT_DONE: the proxies' upstreams are not the two slots' websites"; exit 1; }
[ "$RW" = "/readyz?" ] || { echo "TA_CADDY_NOT_DONE: the listener's rewrite is not /readyz? (the bare ? clears the query): ask"; exit 1; }
[ "$HC" = "/readyz passes 1 fails 1 secret true" ] || { echo "TA_CADDY_NOT_DONE: the health check is not /readyz, 1 pass, 1 fail, with the edge secret header: ask"; exit 1; }
[ "$LI" = "127.0.0.1:3090" ] || { echo "TA_CADDY_NOT_DONE: the readiness listener is not 127.0.0.1:3090 only: ask"; exit 1; }
[ "$PR" = "static_response 404" ] || { echo "TA_CADDY_NOT_DONE: the public route does not refuse /readyz with exactly one 404 of its own: ask"; exit 1; }
echo TA_CADDY_DONE
```

The adapted configuration holds the basic-auth hash: the script keeps it in a variable and prints only handler names,
addresses and the health-check fields. Whether Caddy fills in `{file.…}` inside `health_headers` can only be seen with
Caddy running: TB7 checks it, and puts the old file back if not.

### TA-env. T's three env files

`release-env.mjs derive` copies each live file into `<service>-$LABEL.env` and changes only the values one release owns:
the site version and release key, slot A's ports, the runner's worker id and worker name, and the API's mail helper in
T's own folder. Every other line stays byte for byte, so T uses the same gates, scope, team and secrets.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TA-env: api-, ui- and runner-<LABEL>.env derived from R19's live files for slot A and T's key. The live files are not touched.
VK=${KEY#r}; VK=${VK%%-*}
for SVC in api ui runner; do [ ! -e "$E/$SVC-$LABEL.env" ] || { echo "TA_ENV_NOT_DONE: $E/$SVC-$LABEL.env exists (a WRITE_VERIFY_FAILED file stays: move it aside first)"; exit 1; }; done
for SVC in api ui runner; do cmp -s "$S/$SVC.env.before" "$E/$SVC.env" || { echo "TA_ENV_NOT_DONE: the live $SVC.env moved since TA1"; exit 1; }; done
for SVC in api ui runner; do
  W=$(tl release-env.mjs derive --service "$SVC" --from "$E/$SVC.env" --label "$LABEL" --slot "$SLOT" --release-key "$KEY" 2>&1) || { echo "$W"; echo "TA_ENV_NOT_DONE: derive refused the $SVC file (reason above)"; exit 1; }
  echo "$W"
  [ "$(jq -r '[.event, .label, .releaseKey] | map(tostring) | join(" ")' <<<"$W")" = "PREVIEW_RELEASE_ENV_WRITTEN $LABEL $KEY" ] || { echo "TA_ENV_NOT_DONE: the $SVC file is not T's"; exit 1; }
  [ "$(stat -c '%a %U:%G' "$E/$SVC-$LABEL.env")" = "$(stat -c '%a %U:%G' "$E/$SVC.env")" ] || { echo "TA_ENV_NOT_DONE: the $SVC file's mode or owner differs from the live file's"; exit 1; }
  [ "$(grep -c "^RELEASE_KEY=$KEY\$" "$E/$SVC-$LABEL.env")" = 1 ] || { echo "TA_ENV_NOT_DONE: the $SVC file does not name $KEY once"; exit 1; }
done
for SVC in api runner; do [ "$(grep -c "^REGISTER_VERSION=$VK\$" "$E/$SVC-$LABEL.env")" = 1 ] && [ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$E/$SVC-$LABEL.env")" = 1 ] || { echo "TA_ENV_NOT_DONE: the $SVC file is not hosted on version $VK"; exit 1; }; done
[ "$(grep -c "^MAIL_SENDMAIL_PATH=$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs\$" "$E/api-$LABEL.env")" = 1 ] || { echo "TA_ENV_NOT_DONE: the API file's mail helper is not T's"; exit 1; }
tl release-env.mjs same --labels "$LABEL" --slots "$SLOT" || { echo "TA_ENV_NOT_DONE: a SAME check of T's files is BAD (above)"; exit 1; }
for SVC in api ui runner; do cmp -s "$S/$SVC.env.before" "$E/$SVC.env" || { echo "TA_ENV_NOT_DONE: the live $SVC.env changed"; exit 1; }; done
grep -E '^(REGISTER_VERSION|RELEASE_KEY|DEBATEAI_DEPLOYMENT_MODE|MAIL_SENDMAIL_PATH|API_PORT|PORT)=' "$E/api-$LABEL.env" "$E/runner-$LABEL.env" "$E/ui-$LABEL.env"
echo TA_ENV_DONE
```

Each `derive` line lists the keys it changed: for the API `REGISTER_VERSION`, `RELEASE_KEY` and `MAIL_SENDMAIL_PATH`
(`API_PORT` stays 3101: slot A is today's port), for the runner `REGISTER_VERSION`, `RELEASE_KEY`, `RUNNER_WORKER_ID` and
`HATCHET_WORKER_NAME`, for the website `RELEASE_KEY`.

### TA-op. T's operator folder, beside the installed one

The three deploy folders of T's reference clone, unpacked into `/opt/debateai-v3-preview/operator/lifecycle-v1.<label>`
and compared byte for byte with T's checked API folder, outside the downtime. Nothing uses that folder until TB5 swaps
it in (TB5 compares it once more first); the installed folder stays R19's.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TA-op: T's operator folder built beside the installed one and compared with T's checked API folder. Nothing is installed (TB5 swaps it in).
NEWOP=/opt/debateai-v3-preview/operator/lifecycle-v1.$LABEL
[ ! -e "$NEWOP" ] || { echo "TA_OP_NOT_DONE: $NEWOP exists (a refused run's folder stays: move it aside first)"; exit 1; }
[ -d "$CAPI/dialectical-engine/deploy/preview-lifecycle" ] && [ -d "$ART/source-reference" ] || { echo "TA_OP_NOT_DONE: T's checked API folder or its reference clone is missing (TA2-TA7 first)"; exit 1; }
install -d -o root -g root -m 0755 "$NEWOP"
git -C "$ART/source-reference" archive --format=tar "$REV" dialectical-engine/deploy/preview-lifecycle dialectical-engine/deploy/preview-auth-dev dialectical-engine/deploy/preview-release | tar -x -C "$NEWOP" --no-same-owner || { echo "TA_OP_NOT_DONE: the deploy folders did not unpack into $NEWOP (it stays for a look; nothing installed)"; exit 1; }
chown -R root:root "$NEWOP"; find "$NEWOP" -type d -exec chmod 0755 {} +; find "$NEWOP" -type f -exec chmod 0644 {} +
for D in preview-lifecycle preview-auth-dev preview-release; do diff -r "$NEWOP/dialectical-engine/deploy/$D" "$CAPI/dialectical-engine/deploy/$D" >/dev/null || { echo "TA_OP_NOT_DONE: the new operator folder's $D differs from T's checked API folder ($NEWOP stays for a look; nothing installed)"; exit 1; }; done
[ -f "$NEWOP/dialectical-engine/deploy/preview-lifecycle/v1/release-switch.mjs" ] && [ -f "$NEWOP/dialectical-engine/deploy/preview-lifecycle/v1/prestart.mjs" ] || { echo "TA_OP_NOT_DONE: the new operator folder lacks T's tools"; exit 1; }
echo "T's operator folder: $NEWOP ($(find "$NEWOP" -type f | wc -l) files, equal to T's checked API folder); the installed one is still R19's"
echo TA_OP_DONE
```

### The practice (on the Mac; owner rule: before every upload)

As "The practice" of the hosted-base recipe, on exactly `REV`, at a quiet hour. Its changed rows must equal TA8's
`addedKeys` and `changedKeys` (except `nodeRuntimeVersion`).

### TB0. Preflight again, right before the downtime

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TB0: read-only. Nothing moved since phase A, T's staged pieces are in place, nothing of phase B exists yet, the way back is ready.
REG0=$(cat "$S/register-before"); CF=$(cat "$S/preflight/pg-config-file")
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] || { echo "TB0_NOT_DONE: a debate is queued or running"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM core.run_waiting_v")" = 0 ] || { echo "TB0_NOT_DONE: a debate is waiting in line: pick another moment, or ask"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$(cat "$S/ledger-before")" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "TB0_NOT_DONE: the ledger or the register moved since TA1"; exit 1; }
cmp -s "$S/native-plan.before.json" "$ONP" && cmp -s "$S/release-lock.before.json" "$LOCK" || { echo "TB0_NOT_DONE: native-plan.json or the lock moved since TA1"; exit 1; }
for F in api.env runner.env ui.env; do cmp -s "$S/$F.before" "$E/$F" || { echo "TB0_NOT_DONE: $F moved since TA1"; exit 1; }; done
sha256sum -c --quiet "$S/plan-proposal.sha256" && cmp -s "$ART/native-plan-plan.json" "$NP" || { echo "TB0_NOT_DONE: the plan, the proposal or T's native-plan file changed since TA8"; exit 1; }
for KIND in candidate fallback; do for ROLE in api ui runner; do [ -s "$ART/$KIND-$ROLE-source.json" ] && [ -d "$RELS/auth-dev-$KIND-$LABEL-$ROLE/dialectical-engine" ] || { echo "TB0_NOT_DONE: $KIND $ROLE is not staged"; exit 1; }; done; [ -s "$ART/$KIND-ui-build.json" ] || { echo "TB0_NOT_DONE: the $KIND website build is missing"; exit 1; }; done
for F in native-plan-apply-and-plan.json native-plan-publish.json register-published.json native-plan-verify.json native-first-verify.json api-launch.json ui-launch.json runner-launch.json; do [ ! -e "$ART/$F" ] || { echo "TB0_NOT_DONE: $F already exists (look first)"; exit 1; }; done
[ ! -e "$S/pg18-cold.sha256" ] && [ ! -e "$S/operator-lifecycle-v1.before" ] && [ ! -e "$S/systemd-T.list" ] && [ ! -e "$S/release-lock.v1.json" ] || { echo "TB0_NOT_DONE: a file of phase B exists in S (look first)"; exit 1; }
[ ! -e /etc/systemd/system/debateai-preview-api@.service ] && [ ! -e /etc/systemd/system/debateai-preview-runner@.service ] && [ ! -e /etc/systemd/system/debateai-preview.target.d/60-current-release.conf ] || { echo "TB0_NOT_DONE: a template unit or the switch's boot target drop-in is installed already (look first)"; exit 1; }
cmp -s /etc/systemd/system/debateai-preview.target "$S/preflight/debateai-preview.target.live" || { echo "TB0_NOT_DONE: the live debateai-preview.target changed since TA0 (TB5 replaces it): ask"; exit 1; }
[ "$(sed -n 1p "$S/old-plans.txt")" = "$(jq -r .services.api.basePlan.path "$LOCK")" ] && [ "$(sed -n 2p "$S/old-plans.txt")" = "$(jq -r .services.ui.basePlan.path "$LOCK")" ] && [ "$(sed -n 3p "$S/old-plans.txt")" = "$(jq -r .services.runner.basePlan.path "$LOCK")" ] || { echo "TB0_NOT_DONE: old-plans.txt is not the lock's three plans"; exit 1; }
for F in $(cat "$S/old-plans.txt"); do [ -s "$F" ] && [ "$(jq -r .publication.registerVersion "$F")" = "$REG0" ] || { echo "TB0_NOT_DONE: the old plan $F is missing or not on $REG0"; exit 1; }; done
for D in "$OCAPI" "$OCUI" "$OCRUN"; do [ -d "$D/dialectical-engine" ] || { echo "TB0_NOT_DONE: the old release's folder $D is missing"; exit 1; }; done
for U in api ui runner; do [ "$(grep -cF "$OLABEL" /etc/systemd/system/debateai-preview-$U.service.d/zzzzzzzzzz-lifecycle-release.conf || true)" -ge 1 ] || { echo "TB0_NOT_DONE: the $U drop-in does not name the old release"; exit 1; }; done
for U in api ui runner; do cmp -s <(systemctl cat "debateai-preview-$U.service") "$S/preflight/$U.cat" || { echo "TB0_NOT_DONE: the live $U unit changed since TA0"; exit 1; }; done
[ -s "$S/templates/api/debateai-preview-api@.service" ] && [ -s "$S/templates/ui/debateai-preview-ui@.service" ] && [ -s "$S/Caddyfile.two-slot" ] || { echo "TB0_NOT_DONE: TA-units or TA-caddy is not done"; exit 1; }
cmp -s "$C" "$S/preflight/Caddyfile.live" || { echo "TB0_NOT_DONE: the live Caddyfile changed since TA0"; exit 1; }
for SVC in api ui runner; do [ "$(grep -c "^RELEASE_KEY=$KEY\$" "$E/$SVC-$LABEL.env")" = 1 ] || { echo "TB0_NOT_DONE: $SVC-$LABEL.env is missing or not T's (TA-env first)"; exit 1; }; done
[ ! -e "$L/release-check.mjs" ] || { echo "TB0_NOT_DONE: the installed operator folder already has the new tools (look first)"; exit 1; }
NEWOP=/opt/debateai-v3-preview/operator/lifecycle-v1.$LABEL
for D in preview-lifecycle preview-auth-dev preview-release; do diff -r "$NEWOP/dialectical-engine/deploy/$D" "$CAPI/dialectical-engine/deploy/$D" >/dev/null || { echo "TB0_NOT_DONE: T's operator folder ($NEWOP, TA-op) is missing or its $D differs from T's checked API folder"; exit 1; }; done
[ "$(grep -cE '^max_connections = 200([^0-9]|$)' "$CF")" = 1 ] || { echo "TB0_NOT_DONE: $CF no longer holds the one max_connections = 200 line"; exit 1; }
[ -z "$(ss -ltnH '( sport = :3090 or sport = :3200 or sport = :3201 )')" ] || { echo "TB0_NOT_DONE: something listens on 3090, 3200 or 3201"; exit 1; }
CID=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true)
IP=$(docker inspect "$CID" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' 2>/dev/null || true)
ALLOW=$(systemctl show -p IPAddressAllow --value debateai-preview-hatchet-gateway.service)
[ -n "$CID" ] && [ -n "$IP" ] && echo " $ALLOW " | grep -qF -e " $IP/32 " -e " $IP " || { echo "TB0_NOT_DONE: Hatchet's address is unread or not in the gateway's IPAddressAllow"; exit 1; }
[ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] && [ "$(gs "$GD" "$PD" | jq -r .in_flight)" = 0 ] && [ "$(gs "$GAN" "$PAN" | jq -r .in_flight)" = 0 ] || { echo "TB0_NOT_DONE: a gate is not active, or has a call in flight"; exit 1; }
echo "new migrations: $(tr '\n' ' ' < "$S/new-migrations.txt"); disk free $(df --output=avail -BG / | tail -1 | tr -dc 0-9) GB"
echo TB0_DONE
```

### TB0g. The gate redeploy (only when TA10 listed a gate file)

Right after TB0, at the same quiet moment (nothing queued, running or waiting), before the downtime starts: follow
`deploy/preview-gate/v3/README.md`, "Redeploy (2026-10-12): calls on their way together count once", steps 1 to 6, for
both gates (the DeepInfra gate, then the Anthropic gate with its README's names), with the gate files of T's reference
clone and the owner's yes for T (it names the gate redeploy). Each gate's GO changes only its two hashes. R19 reads the
two new refusals as it reads a stop today, so R19 keeps serving meanwhile; a debate someone starts in those minutes makes
TB1 refuse (wait for it, or ask). Both gates must be `active` again before TB1 (TB8's runner reads each gate's capacity
once, at its start). Its way back is that section's own; rbA-T and rbB-T leave the new gate files in place.

### TB1. The downtime starts

B1's four stops of R19's fixed units. The drain guard also counts waiting debates: T's API would wake a waiting R19
debate onto a release name nobody serves.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TB1: DOWNTIME START. Guards first (nothing is stopped if one fails), then R19's runner, backup timer, website and API.
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] || { echo "TB1_NOT_DONE: a debate is queued or running (nothing was stopped)"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM core.run_waiting_v")" = 0 ] || { echo "TB1_NOT_DONE: a debate is waiting in line (nothing was stopped): ask"; exit 1; }
cmp -s "$S/native-plan.before.json" "$ONP" && cmp -s "$S/release-lock.before.json" "$LOCK" || { echo "TB1_NOT_DONE: native-plan.json or the lock moved (nothing was stopped)"; exit 1; }
for F in api.env runner.env ui.env; do cmp -s "$S/$F.before" "$E/$F" || { echo "TB1_NOT_DONE: $F moved (nothing was stopped)"; exit 1; }; done
[ "$(gs "$GD" "$PD" | jq -r .in_flight)" = 0 ] && [ "$(gs "$GAN" "$PAN" | jq -r .in_flight)" = 0 ] || { echo "TB1_NOT_DONE: a gate has a call in flight (nothing was stopped)"; exit 1; }
[ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "TB1_NOT_DONE: a gate is not active (TB0g not finished?; nothing was stopped)"; exit 1; }
date -u +%s >> "$S/downtime-start-epoch"; echo "DOWNTIME START $(date -u)"
systemctl stop debateai-preview-runner || { echo "TB1_NOT_DONE: systemctl stop of R19's runner failed"; exit 1; }
for U in debateai-preview-backup.timer debateai-preview-ui debateai-preview-api; do systemctl stop "$U" || { echo "TB1_NOT_DONE: systemctl stop $U failed"; exit 1; }; done
RS=$(systemctl is-active debateai-preview-runner || true); echo "runner $RS"
case "$RS" in inactive|failed) ;; *) echo "TB1_NOT_DONE: the runner is still $RS"; exit 1;; esac
for U in debateai-preview-ui debateai-preview-api debateai-preview-backup.timer; do [ "$(systemctl is-active "$U" || true)" = inactive ] || { echo "TB1_NOT_DONE: $U is not inactive"; exit 1; }; done
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] || { echo "TB1_NOT_DONE: a debate was admitted during the stop (it would land in the cold copy): ask"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM core.run_waiting_v")" = 0 ] || { echo "TB1_NOT_DONE: a debate entered the waiting line during the stop: ask"; exit 1; }
CC=x; for i in $(seq 1 15); do CC=$(psqlq "SELECT count(*) FROM pg_stat_activity WHERE datname='debateai' AND backend_type='client backend' AND pid<>pg_backend_pid()"); [ "$CC" = 0 ] && break; sleep 2; done
[ "$CC" = 0 ] || { echo "TB1_NOT_DONE: $CC database client(s) still connected"; exit 1; }
echo TB1_DONE
```

### TB2. The cold copy, and `max_connections` 320

B2, with one more change inside the window: after the copy and before PostgreSQL starts again, the one
`max_connections = 200` line of its configuration (TA0 found exactly one, in the file PostgreSQL reads) becomes 320. If
PostgreSQL does not come back with 320, the copy's line is put back and PostgreSQL starts again on 200.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TB2: stop the gateway, Hatchet, PostgreSQL; tar the data folder and its config into S; max_connections 320; start them again.
PGP=/var/lib/postgresql/18; SOCK=/run/debateai-v3-preview/postgresql
LEDGER0=$(cat "$S/ledger-before"); REG0=$(cat "$S/register-before"); CF=$(cat "$S/preflight/pg-config-file")
for U in runner ui api; do case "$(systemctl is-active debateai-preview-$U || true)" in inactive|failed) ;; *) echo "TB2_NOT_DONE: $U is running (TB1 first)"; exit 1;; esac; done
[ "$(psqlq "SELECT count(*) FROM pg_stat_activity WHERE datname='debateai' AND backend_type='client backend' AND pid<>pg_backend_pid()")" = 0 ] || { echo "TB2_NOT_DONE: database clients connected"; exit 1; }
[ ! -e "$S/pg18-v3-preview-cold.tgz" ] && [ ! -e "$S/pg18-v3-preview-config.tgz" ] && [ ! -e "$S/pg18-cold.sha256" ] && [ ! -e "$S/postgresql.conf.before-320" ] || { echo "TB2_NOT_DONE: an earlier cold copy exists in S (look first)"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "TB2_NOT_DONE: the ledger or the register moved since TA1"; exit 1; }
[ "$(grep -cE '^[[:space:]]*max_connections[[:space:]]*=' "$CF")" = 1 ] && [ "$(grep -cE '^max_connections = 200([^0-9]|$)' "$CF")" = 1 ] || { echo "TB2_NOT_DONE: $CF does not hold exactly one max_connections = 200 line (nothing stopped)"; exit 1; }
SIZE=$(du -sm "$PGP/v3-preview" | cut -f1); AVAIL=$(df --output=avail -BM / | tail -1 | tr -dc 0-9)
[ "$AVAIL" -gt $((SIZE * 2 + 2048)) ] || { echo "TB2_NOT_DONE: not enough free space for the copy"; exit 1; }
CID0=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true)
IP0=$(docker inspect "$CID0" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' 2>/dev/null || true)
[ -n "$CID0" ] && [ -n "$IP0" ] || { echo "TB2_NOT_DONE: the Hatchet container or its address is unread"; exit 1; }
systemctl stop debateai-preview-hatchet-gateway debateai-preview-hatchet debateai-preview-postgresql || { echo "TB2_NOT_DONE: a stop failed (look at the three units first)"; exit 1; }
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = inactive ] || { echo "TB2_NOT_DONE: $U is not inactive (nothing copied)"; exit 1; }; done
umask 077
tar -C "$PGP" -czf "$S/pg18-v3-preview-cold.tgz" v3-preview || { echo "TB2_NOT_DONE: the data tar failed; the database is STOPPED"; exit 1; }
tar -C /etc/debateai-v3-preview -czf "$S/pg18-v3-preview-config.tgz" postgresql || { echo "TB2_NOT_DONE: the config tar failed; the database is STOPPED"; exit 1; }
sha256sum "$S/pg18-v3-preview-cold.tgz" "$S/pg18-v3-preview-config.tgz" > "$S/pg18-cold.sha256"
cp -p "$CF" "$S/postgresql.conf.before-320" || { echo "TB2_NOT_DONE: the copy of $CF failed (nothing edited); the database is STOPPED (start it: systemctl start debateai-preview-postgresql, then B2's restart part by hand)"; exit 1; }
umask 022
sha256sum -c --quiet "$S/pg18-cold.sha256" || { echo "TB2_NOT_DONE: the copy does not match its own sha256; the database is STOPPED"; exit 1; }
cat "$S/pg18-cold.sha256"
sed -i -E 's/^max_connections = 200([^0-9]|$)/max_connections = 320\1/' "$CF" || { if cmp -s "$S/postgresql.conf.before-320" "$CF"; then W="unchanged"; else W="CHANGED (its copy is $S/postgresql.conf.before-320)"; fi; echo "TB2_NOT_DONE: the max_connections edit failed; $CF is $W; the database is STOPPED (start it: systemctl start debateai-preview-postgresql, then B2's restart part by hand)"; exit 1; }
[ "$(grep -cE '^[[:space:]]*max_connections[[:space:]]*=' "$CF")" = 1 ] && [ "$(grep -cE '^max_connections = 320([^0-9]|$)' "$CF")" = 1 ] && diff <(grep -vE '^max_connections = ' "$S/postgresql.conf.before-320") <(grep -vE '^max_connections = ' "$CF") >/dev/null || { cp -p "$S/postgresql.conf.before-320" "$CF"; echo "TB2_NOT_DONE: the edit was not exactly the one line; the config is back as it was; the database is STOPPED (start it: systemctl start debateai-preview-postgresql, then B2's restart part by hand)"; exit 1; }
back200() { systemctl stop debateai-preview-postgresql || true; cp -p "$S/postgresql.conf.before-320" "$CF"; systemctl start debateai-preview-postgresql || true; for i in $(seq 1 30); do /usr/lib/postgresql/18/bin/pg_isready -q -h "$SOCK" -p 5434 && break; sleep 2; done; echo "TB2_NOT_DONE: $1; the config is back at 200 and PostgreSQL was started on it; Hatchet and the gateway are NOT started (B2's restart part by hand, then rbA-T, or ask)"; exit 1; }
systemctl start debateai-preview-postgresql || back200 "PostgreSQL did not start with max_connections 320"
for i in $(seq 1 30); do /usr/lib/postgresql/18/bin/pg_isready -q -h "$SOCK" -p 5434 && break; sleep 2; done
/usr/lib/postgresql/18/bin/pg_isready -h "$SOCK" -p 5434 || back200 "PostgreSQL is not ready with max_connections 320"
[ "$(psqlq "SHOW max_connections")" = 320 ] || back200 "SHOW max_connections is not 320"
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] || { echo "TB2_NOT_DONE: the ledger changed across the copy"; exit 1; }
systemctl start debateai-preview-hatchet || { echo "TB2_NOT_DONE: Hatchet did not start"; exit 1; }
CID=; for i in $(seq 1 30); do CID=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true); [ -n "$CID" ] && break; sleep 2; done
IP=$(docker inspect "$CID" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' || true)
[ "$CID" = "$CID0" ] && [ "$IP" = "$IP0" ] || { echo "TB2_NOT_DONE: the Hatchet container or address changed; the gateway is NOT started: stop and ask"; exit 1; }
ALLOW=$(systemctl show -p IPAddressAllow --value debateai-preview-hatchet-gateway.service)
echo " $ALLOW " | grep -qF -e " $IP/32 " -e " $IP " || { echo "TB2_NOT_DONE: Hatchet's address is not in the gateway's IPAddressAllow; the gateway is NOT started"; exit 1; }
W=$(/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin /usr/local/bin/node /opt/debateai-v3-preview/operator/gateway/gateway-route-witness.mjs check 2>&1) || { echo "$W" | cut -c1-400; echo "TB2_NOT_DONE: the gateway witness check refused; the gateway is NOT started"; exit 1; }
echo "$W" | grep -q PASS || { echo "TB2_NOT_DONE: the gateway witness did not say PASS; the gateway is NOT started"; exit 1; }
systemctl start debateai-preview-hatchet-gateway.service || { echo "TB2_NOT_DONE: the gateway did not start"; exit 1; }
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = active ] || { echo "TB2_NOT_DONE: $U is not active"; exit 1; }; done
echo "max_connections $(psqlq "SHOW max_connections")"
echo TB2_DONE
```

The config tar holds the line at 200: rbA-T keeps 320 (harmless for R19), rbB-T restores the config with the data.

### TB3. The migrations, with T's own native plan

`apply-and-plan` takes `hostedBilling` from `--from` (R19's verify plan, copied in TA1) and refuses `--hosted-billing`;
its own proposal is discarded (TB4 publishes TA8's plan). `put` writes T's own file; R19's `native-plan.json` is never
touched.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TB3: apply T's migrations (forward-only) through T's own native-plan file. From the native operator's start on, the way back is rbB-T.
LEDGER0=$(cat "$S/ledger-before"); REG0=$(cat "$S/register-before")
[ -s "$S/new-migrations.txt" ] || { echo "TB3_NOT_DONE: T adds no migration (it must bring 0123): ask"; exit 1; }
for U in runner ui api; do case "$(systemctl is-active debateai-preview-$U || true)" in inactive|failed) ;; *) echo "TB3_NOT_DONE: $U is running"; exit 1;; esac; done
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = active ] || { echo "TB3_NOT_DONE: $U is not active (TB2 not finished)"; exit 1; }; done
sha256sum -c --quiet "$S/pg18-cold.sha256" && [ "$(psqlq "SHOW max_connections")" = 320 ] || { echo "TB3_NOT_DONE: no checked cold copy in S, or max_connections is not 320 (TB2 first)"; exit 1; }
cmp -s "$S/native-plan.before.json" "$ONP" && cmp -s "$ART/native-plan-plan.json" "$NP" || { echo "TB3_NOT_DONE: native-plan.json moved, or T's native-plan file is not TA8's plan"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "TB3_NOT_DONE: the ledger or the register moved"; exit 1; }
[ ! -e "$ART/native-plan-apply-and-plan.json" ] && [ ! -e "$ART/native-apply-and-plan.json" ] || { echo "TB3_NOT_DONE: earlier apply-and-plan files exist (look first)"; exit 1; }
rel native-plan --operation apply-and-plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-apply-and-plan.json" || { echo "TB3_NOT_DONE: the release tool refused the plan (nothing applied)"; exit 1; }
[ "$(jq -r .operation "$ART/native-plan-apply-and-plan.json")" = apply-and-plan ] && [ "$(jq -r .sourceRevision "$ART/native-plan-apply-and-plan.json")" = "$REV" ] && [ "$(jq -r '.hostedBilling.billing // "none"' "$ART/native-plan-apply-and-plan.json")" = on ] || { echo "TB3_NOT_DONE: the plan is not T's billing-on apply-and-plan (nothing applied)"; exit 1; }
put "$ART/native-plan-apply-and-plan.json" || { echo "TB3_NOT_DONE: put failed (nothing applied)"; exit 1; }
OUT=$(nat "$ART/native-apply-and-plan.json"); echo "nat: $OUT"
LEDGER=$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration"); echo "ledger $LEDGER"
[ "$OUT" = "exit 0" ] || { head -c 1200 "$ART/native-apply-and-plan.json"; echo; echo "TB3_NOT_DONE: the native operator refused (from here the way back is rbB-T)"; exit 1; }
for M in $(cat "$S/new-migrations.txt"); do [ "$(psqlq "SELECT count(*) FROM public.debateai_schema_migration WHERE name = '$M'")" = 1 ] || { echo "TB3_NOT_DONE: $M is not in the ledger"; exit 1; }; done
[ "$LEDGER" = "$(( ${LEDGER0%%|*} + $(grep -c . "$S/new-migrations.txt") ))|$(LC_ALL=C sort "$S/new-migrations.txt" | tail -n 1)" ] || { echo "TB3_NOT_DONE: the ledger is not the old one plus exactly T's migrations"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM core.read_current_release()")" = 0 ] || { echo "TB3_NOT_DONE: the release table is missing, or already names a current release"; exit 1; }
[ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] && cmp -s "$S/native-plan.before.json" "$ONP" || { echo "TB3_NOT_DONE: the newest register or native-plan.json moved"; exit 1; }
echo TB3_DONE
```

### TB4. Publish, the verify plan, the first proof, the three launch plans

B4 on T's own native-plan file. The published version must be the one T's release key names (`r<V>-…`): every env file
and every launch plan was made for it. The three launch plans take slot A (`--slot "$SLOT"`): ports 3100 and 3101, and
each service's own `<service>-$LABEL.env`.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TB4: publish TA8's plan with the owner's yes; the verify plan for the new version, the first proof and the three launch
# plans for slot A from R19's plans with --publication. No runner prepare-only check.
YES='<the deltaSha256 the owner approved, in full>'
REG0=$(cat "$S/register-before"); VNEXT=$((REG0 + 1)); VK=${KEY#r}; VK=${VK%%-*}
[ "$VK" = "$VNEXT" ] || { echo "TB4_NOT_DONE: $KEY does not name version $VNEXT"; exit 1; }
for U in runner ui api; do case "$(systemctl is-active debateai-preview-$U || true)" in inactive|failed) ;; *) echo "TB4_NOT_DONE: $U is running"; exit 1;; esac; done
cmp -s "$S/native-plan.before.json" "$ONP" && cmp -s "$ART/native-plan-apply-and-plan.json" "$NP" || { echo "TB4_NOT_DONE: native-plan.json moved, or T's native-plan file is not TB3's"; exit 1; }
[ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "TB4_NOT_DONE: the newest register is not $REG0"; exit 1; }
for M in $(cat "$S/new-migrations.txt"); do [ "$(psqlq "SELECT count(*) FROM public.debateai_schema_migration WHERE name = '$M'")" = 1 ] || { echo "TB4_NOT_DONE: $M is not applied (TB3 first)"; exit 1; }; done
sha256sum -c --quiet "$S/plan-proposal.sha256" || { echo "TB4_NOT_DONE: the plan or the proposal changed since TA8"; exit 1; }
[ "$(jq -r .deltaSha256 "$ART/register-proposal.json")" = "$YES" ] && [ "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" = "$REG0" ] || { echo "TB4_NOT_DONE: the proposal is not the approved one"; exit 1; }
for F in native-plan-publish.json register-published.json native-plan-verify.json native-first-verify.json api-launch.json ui-launch.json runner-launch.json; do [ ! -e "$ART/$F" ] || { echo "TB4_NOT_DONE: $F exists (look first)"; exit 1; }; done
OLDA=$(sed -n 1p "$S/old-plans.txt"); OLDU=$(sed -n 2p "$S/old-plans.txt"); OLDR=$(sed -n 3p "$S/old-plans.txt")
[ "$OLDA" = "$(jq -r .services.api.basePlan.path "$LOCK")" ] && [ "$OLDU" = "$(jq -r .services.ui.basePlan.path "$LOCK")" ] && [ "$OLDR" = "$(jq -r .services.runner.basePlan.path "$LOCK")" ] || { echo "TB4_NOT_DONE: old-plans.txt is not the lock's three plans"; exit 1; }
rel native-plan --operation publish --from "$ART/native-plan-plan.json" --proposal "$ART/register-proposal.json" --approved-delta-sha256 "$YES" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-publish.json" || { echo "TB4_NOT_DONE: the release tool refused the publish plan (nothing published)"; exit 1; }
put "$ART/native-plan-publish.json" || { echo "TB4_NOT_DONE: put of the publish plan failed (nothing published)"; exit 1; }
OUT=$(nat "$ART/register-published.json"); echo "nat: $OUT"
[ "$OUT" = "exit 0" ] || { head -c 800 "$ART/register-published.json"; echo; echo "TB4_NOT_DONE: the publish was refused (PREVIEW_REGISTER_BASE_NOT_CURRENT needs a new plan and a new yes)"; exit 1; }
V=$(jq -r .publication.registerVersion "$ART/register-published.json"); echo "new REGISTER_VERSION=$V"
[ "$V" = "$VNEXT" ] && [ "$V" = "$VK" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$V" ] || { echo "TB4_NOT_DONE: the published version is not the one $KEY names"; exit 1; }
printf '%s\n' "$V" > "$S/new-register-version"
echo "PUBLISHED_$V"
rel native-plan --operation verify --from "$ART/native-plan-publish.json" --publication "$ART/register-published.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-verify.json" || { echo "TB4_NOT_DONE: the release tool refused the verify plan (version $V IS published)"; exit 1; }
put "$ART/native-plan-verify.json" || { echo "TB4_NOT_DONE: put of the verify plan failed (version $V IS published)"; exit 1; }
OUT=$(nat "$ART/native-first-verify.json"); echo "nat: $OUT"
[ "$OUT" = "exit 0" ] && [ "$(jq -r .publication.registerVersion "$ART/native-first-verify.json")" = "$V" ] || { echo "TB4_NOT_DONE: the first proof was refused or does not name $V (version $V IS published)"; exit 1; }
rel launch-plan --service api --slot "$SLOT" --from "$OLDA" --root "$CAPI" --source-manifest "$ART/candidate-api-source.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/api-launch.json" || { echo "TB4_NOT_DONE: the API launch plan was refused"; exit 1; }
rel launch-plan --service ui --slot "$SLOT" --from "$OLDU" --root "$CUI" --source-manifest "$ART/candidate-ui-source.json" --ui-build "$ART/candidate-ui-build.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/ui-launch.json" || { echo "TB4_NOT_DONE: the website launch plan was refused"; exit 1; }
rel launch-plan --service runner --slot "$SLOT" --from "$OLDR" --root "$CRUN" --source-manifest "$ART/candidate-runner-source.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/runner-launch.json" || { echo "TB4_NOT_DONE: the runner launch plan was refused"; exit 1; }
for SVC in api ui runner; do [ "$(jq -r '[.publication.registerVersion, .uiPort, .apiPort, .environment.path] | map(tostring) | join(" ")' "$ART/$SVC-launch.json")" = "$V $UIP $APIP $E/$SVC-$LABEL.env" ] || { echo "TB4_NOT_DONE: the $SVC launch plan is not version $V, slot $SLOT, $SVC-$LABEL.env"; exit 1; }; done
MX=$(jq -r '.. | objects | select(has("mailExecutable")) | .mailExecutable' "$ART/api-launch.json" | head -n 1); echo "mailExecutable $MX"
[ "$MX" = "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs" ] && [ -f "$MX" ] && [ "$(grep -c "^MAIL_SENDMAIL_PATH=$MX\$" "$E/api-$LABEL.env")" = 1 ] || { echo "TB4_NOT_DONE: the API plan's mail program is not T's, or api-$LABEL.env names another"; exit 1; }
cmp -s "$ART/native-plan-verify.json" "$NP" && cmp -s "$S/native-plan.before.json" "$ONP" || { echo "TB4_NOT_DONE: T's native-plan file is not version $V's verify plan, or native-plan.json moved"; exit 1; }
echo TB4_DONE
```

If TB4 stops after `PUBLISHED_<V>`, the version stays published. Forward by hand, as B4's note says (never publish a
second time; continue from the first line whose `--out` is missing, with `V=$(cat "$S/new-register-version")` and
`OLDA`, `OLDU`, `OLDR` from `$S/old-plans.txt`; finish with `cmp "$ART/native-plan-verify.json" "$NP"`), or back:
rbB-T.

### TB5. The one-time layout

The installed operator folder becomes T's (TA-op built it beside the installed one from the three deploy folders of T's
reference clone; TB5 compares it byte for byte with T's checked API folder once more and swaps it in), R19's fixed units and their drop-in folders move into `$S/systemd-old/`, and the template
units, the retire units, the team unlock (it no longer orders itself after a fixed API) and the target (no fixed API or
website) are installed. Every file put aside is listed in `$S/systemd-old.txt` and every installed name in
`$S/systemd-T.list`: rbB-T reads both. Nothing starts.

The three app instances are checked in TB6, once their release drop-ins exist: an instance loads only with its drop-in
(the runner template has no `ExecStart=`), and an older template drop-in sets `Restart=no`, which only the instance's
release drop-in (it sorts last) sets back, exactly as on R19's units. So `systemd-analyze verify` and
`unit-templates.mjs compare` run there.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TB5: the one-time layout. Operator folder, R19's fixed units aside, template units, retire units, team unlock, target; reload.
UD=/etc/systemd/system; OP=/opt/debateai-v3-preview/operator/lifecycle-v1; NEWOP=/opt/debateai-v3-preview/operator/lifecycle-v1.$LABEL
for U in runner ui api; do case "$(systemctl is-active debateai-preview-$U || true)" in inactive|failed) ;; *) echo "TB5_NOT_DONE: R19's $U is running"; exit 1;; esac; done
cmp -s "$ART/native-plan-verify.json" "$NP" && [ -s "$ART/api-launch.json" ] && [ -s "$ART/ui-launch.json" ] && [ -s "$ART/runner-launch.json" ] || { echo "TB5_NOT_DONE: TB4 is not done"; exit 1; }
[ ! -e "$S/operator-lifecycle-v1.before" ] && [ ! -e "$S/systemd-old" ] && [ ! -e "$S/systemd-T.list" ] || { echo "TB5_NOT_DONE: TB5 ran before (look first)"; exit 1; }
[ -d "$NEWOP/dialectical-engine/deploy" ] || { echo "TB5_NOT_DONE: T's operator folder $NEWOP is missing (TA-op builds it, outside the downtime)"; exit 1; }
for N in debateai-preview-api@.service debateai-preview-ui@.service debateai-preview-runner@.service debateai-preview-api@.service.d debateai-preview-ui@.service.d debateai-preview.target.d/60-current-release.conf; do [ ! -e "$UD/$N" ] || { echo "TB5_NOT_DONE: $UD/$N exists (look first)"; exit 1; }; done
[ -s "$S/templates/api/debateai-preview-api@.service" ] && [ -s "$S/templates/ui/debateai-preview-ui@.service" ] || { echo "TB5_NOT_DONE: the rendered templates are missing (TA-units)"; exit 1; }
for D in preview-lifecycle preview-auth-dev preview-release; do diff -r "$NEWOP/dialectical-engine/deploy/$D" "$CAPI/dialectical-engine/deploy/$D" >/dev/null || { echo "TB5_NOT_DONE: T's operator folder's $D differs from T's checked API folder since TA-op (nothing installed; $NEWOP stays for a look)"; exit 1; }; done
mv "$OP" "$S/operator-lifecycle-v1.before" || { echo "TB5_NOT_DONE: R19's operator folder did not move aside (nothing installed; T's folder stays in $NEWOP)"; exit 1; }
mv "$NEWOP" "$OP" || { echo "TB5_NOT_DONE: T's operator folder did not move in: NO operator folder is installed (R19's is $S/operator-lifecycle-v1.before, T's is $NEWOP): move R19's back by hand, then ask"; exit 1; }
[ -f "$L/release-switch.mjs" ] && [ -f "$L/prestart.mjs" ] || { echo "TB5_NOT_DONE: the installed operator folder is not T's (way back: rbB-T)"; exit 1; }
umask 077
install -d -o root -g root -m 0700 "$S/systemd-old" "$S/systemd-old-wants"
printf '' > "$S/systemd-old.txt"; printf '' > "$S/systemd-T.list"
for N in debateai-preview-api.service debateai-preview-api.service.d debateai-preview-ui.service debateai-preview-ui.service.d debateai-preview-runner.service debateai-preview-runner.service.d; do
  if [ -e "$UD/$N" ] || [ -L "$UD/$N" ]; then mv "$UD/$N" "$S/systemd-old/$N" || { echo "TB5_NOT_DONE: $N did not move aside; the operator folder is T's and the files in $S/systemd-old.txt are aside (way back: rbB-T)"; exit 1; }; printf '%s\n' "$N" >> "$S/systemd-old.txt"; fi
done
( cd "$UD" && find . -path './*.wants/*' \( -name debateai-preview-api.service -o -name debateai-preview-ui.service -o -name debateai-preview-runner.service \) | sed 's#^\./##' ) > "$S/systemd-old-wants.txt"
while read -r F; do install -d -o root -g root -m 0700 "$S/systemd-old-wants/$(dirname "$F")"; mv "$UD/$F" "$S/systemd-old-wants/$F" || { echo "TB5_NOT_DONE: the link $F did not move aside (R19's unit files are aside, and the links listed before it in $S/systemd-old-wants.txt): ask"; exit 1; }; done < "$S/systemd-old-wants.txt"
umask 022
inst() { if [ -e "$UD/$2" ] || [ -L "$UD/$2" ]; then mv "$UD/$2" "$S/systemd-old/$2" || return 1; printf '%s\n' "$2" >> "$S/systemd-old.txt" || return 1; fi; install -o root -g root -m 0644 "$1" "$UD/$2" && printf '%s\n' "$2" >> "$S/systemd-T.list"; }
DEP=$OP/dialectical-engine/deploy; LSD=$DEP/preview-lifecycle/v1/systemd
inst "$DEP/preview-auth-dev/v1/debateai-preview-runner@.service" debateai-preview-runner@.service || { echo "TB5_NOT_DONE: the runner template did not install (way back: rbB-T)"; exit 1; }
for SVC in api ui; do
  inst "$S/templates/$SVC/debateai-preview-$SVC@.service" "debateai-preview-$SVC@.service" || { echo "TB5_NOT_DONE: the $SVC template did not install (way back: rbB-T)"; exit 1; }
  install -d -o root -g root -m 0755 "$UD/debateai-preview-$SVC@.service.d"; printf '%s\n' "debateai-preview-$SVC@.service.d" >> "$S/systemd-T.list"
  for F in "$S/templates/$SVC/debateai-preview-$SVC@.service.d"/*.conf; do [ -e "$F" ] || continue; install -o root -g root -m 0644 "$F" "$UD/debateai-preview-$SVC@.service.d/"; done
  install -o root -g root -m 0644 "$LSD/debateai-preview-$SVC@.service.d/50-lifecycle.conf" "$UD/debateai-preview-$SVC@.service.d/50-lifecycle.conf"
done
for N in debateai-preview-runner-retire@.service debateai-preview-runner-retire@.timer debateai-preview-runner-retire-check@.service debateai-preview-runner-retire-check@.timer debateai-preview-team-unlock.service debateai-preview.target; do inst "$LSD/$N" "$N" || { echo "TB5_NOT_DONE: $N did not install (way back: rbB-T)"; exit 1; }; done
systemctl daemon-reload || { echo "TB5_NOT_DONE: systemctl daemon-reload failed: the template units are in place but systemd has not read them; nothing runs (way back: rbB-T)"; exit 1; }
echo "put aside: $(tr '\n' ' ' < "$S/systemd-old.txt") $(tr '\n' ' ' < "$S/systemd-old-wants.txt")"
echo "installed: $(tr '\n' ' ' < "$S/systemd-T.list")"
for SVC in api ui; do systemctl show -p FragmentPath -p LoadState "debateai-preview-$SVC@$LABEL.service" | tr '\n' ' '; echo; done
LX=0; LS=$(systemctl show -p LoadState --value "debateai-preview-runner-retire@$LABEL.timer") || LX=$?
echo "T's backstop timer with no time written yet: LoadState=$LS (systemctl show exit $LX)"
[ "$LX" = 0 ] || { echo "TB5_NOT_DONE: systemctl show refuses a timer it cannot load (the retirement tools read timers that way): ask"; exit 1; }
systemd-analyze verify "$UD/debateai-preview-runner-retire@$LABEL.service" "$UD/debateai-preview-runner-retire-check@$LABEL.service" "$UD/debateai-preview.target" > "$S/verify-tb5.txt" 2>&1 || { cut -c1-300 "$S/verify-tb5.txt"; echo "TB5_NOT_DONE: systemd-analyze verify found an error (above; way back: rbB-T)"; exit 1; }
echo TB5_DONE
```

The website instance's `FragmentPath` is `/etc/systemd/system/debateai-preview-ui@.service`; the backstop timer reads
`LoadState=bad-setting` (or `error`) until a switch writes its time, with exit 0.

### TB6. Lock v2, the pins, the instance drop-ins, T current; the API, then the website

The v1 lock moves into `$S` (prestart refuses a v1 lock on disk), the three pins create lock v2 with one release
(label `$LABEL`, key `$KEY`, slot A), and each instance gets its release drop-in. Then the checks TB5 could not do, then
`release-switch.mjs seed` records T as the release table's first current release (and writes the boot target's
drop-in) before anything of T starts. The downtime ends when the website answers `/login` on 3100: Caddy still has the
single-slot file.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TB6: lock v2 and three pins, the instance drop-ins, reload, the unit checks, T seeded current, then the API (its start
# line naming REV and KEY), the website (/login 200 on 3100: the downtime ends) and the backup timer. Not the runner (TB8).
UD=/etc/systemd/system; V=$(cat "$S/new-register-version")
[ -s "$S/systemd-T.list" ] && [ -f "$UD/debateai-preview-api@.service" ] && [ -f "$L/release-switch.mjs" ] || { echo "TB6_NOT_DONE: TB5 is not done"; exit 1; }
cmp -s "$ART/native-plan-verify.json" "$NP" && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$V" ] || { echo "TB6_NOT_DONE: TB4 is not done"; exit 1; }
cmp -s "$S/release-lock.before.json" "$LOCK" && [ ! -e "$S/release-lock.v1.json" ] || { echo "TB6_NOT_DONE: the lock is not R19's v1 lock, or TB6 ran before (look first)"; exit 1; }
for SVC in api ui runner; do [ "$(grep -c "^RELEASE_KEY=$KEY\$" "$E/$SVC-$LABEL.env")" = 1 ] || { echo "TB6_NOT_DONE: $SVC-$LABEL.env does not name $KEY"; exit 1; }; done
for SVC in api runner; do [ "$(grep -c "^REGISTER_VERSION=$V\$" "$E/$SVC-$LABEL.env")" = 1 ] || { echo "TB6_NOT_DONE: $SVC-$LABEL.env is not on version $V"; exit 1; }; done
mv "$LOCK" "$S/release-lock.v1.json"
for SVC in api ui runner; do
  PLAN=$ART/$SVC-launch.json
  PIN=$(pre pin --from "$PLAN" 2>&1) || { echo "$PIN"; echo "TB6_NOT_DONE: the pin of $SVC was refused; nothing was started (way back: rbB-T)"; exit 1; }
  echo "$PIN"
  [ "$(jq -r '[.event, .label, .slot, .releaseKey, .sourceRevision, .registerVersion] | map(tostring) | join(" ")' <<<"$PIN")" = "PREVIEW_LIFECYCLE_RELEASE_PINNED $LABEL $SLOT $KEY $REV $V" ] || { echo "TB6_NOT_DONE: the $SVC pin is not T on slot $SLOT with $KEY; nothing was started (way back: rbB-T)"; exit 1; }
done
[ "$(jq -r --arg l "$LABEL" '[.schema, (.releases | keys | join(",")), .releases[$l].releaseKey, .releases[$l].slot, (.releases[$l].services | keys | join(","))] | map(tostring) | join(" ")' "$LOCK")" = "preview-lifecycle-release-lock-v2 $LABEL $KEY $SLOT api,runner,ui" ] || { echo "TB6_NOT_DONE: the lock is not v2 with T alone; nothing was started (way back: rbB-T)"; exit 1; }
for SVC in api ui runner; do
  DD=$UD/debateai-preview-$SVC@$LABEL.service.d
  [ -d "$DD" ] || { install -d -o root -g root -m 0755 "$DD"; printf '%s\n' "debateai-preview-$SVC@$LABEL.service.d" >> "$S/systemd-T.list"; }
  pre dropin --service "$SVC" --label "$LABEL" > "$DD/zzzzzzzzzz-lifecycle-release.conf.new" || { echo "TB6_NOT_DONE: the $SVC drop-in was refused; nothing was started (way back: rbB-T)"; exit 1; }
  chmod 0644 "$DD/zzzzzzzzzz-lifecycle-release.conf.new"; mv "$DD/zzzzzzzzzz-lifecycle-release.conf.new" "$DD/zzzzzzzzzz-lifecycle-release.conf"
  [ "$(grep -c -- "--label $LABEL" "$DD/zzzzzzzzzz-lifecycle-release.conf")" -ge 1 ] || { echo "TB6_NOT_DONE: the $SVC drop-in does not name T; nothing was started (way back: rbB-T)"; exit 1; }
done
# The seed writes only this one file into the shared folder (the gate's 50-anthropic-gate.conf stays): list the file, never the folder.
printf '%s\n' debateai-preview.target.d/60-current-release.conf >> "$S/systemd-T.list"
systemctl daemon-reload
for SVC in api ui runner; do systemd-analyze verify "$UD/debateai-preview-$SVC@$LABEL.service" > "$S/verify-$SVC.txt" 2>&1 || { cut -c1-300 "$S/verify-$SVC.txt"; echo "TB6_NOT_DONE: systemd-analyze verify found an error in the $SVC instance (above); nothing was started (way back: rbB-T)"; exit 1; }; done
for SVC in api ui; do
  CMP=$(lc unit-templates.mjs compare --service "$SVC" --label "$LABEL" --before "$S/preflight/$SVC.show" 2>&1) || { echo "$CMP"; echo "TB6_NOT_DONE: the $SVC instance's effective settings differ from R19's unit (the differs list above); nothing was started (way back: rbB-T)"; exit 1; }
  echo "$CMP"
done
systemctl show -p FragmentPath -p DropInPaths -p MemoryMax "debateai-preview-runner@$LABEL.service" | tr '\n' ' '; echo
SEED=$(lc release-switch.mjs seed --label "$LABEL" 2>&1) || { echo "$SEED"; echo "TB6_NOT_DONE: the seed was refused, or its boot target drop-in failed (bad: TARGET); nothing was started (way back: rbB-T)"; exit 1; }
echo "$SEED"
[ "$(jq -r '[.event, .label, .releaseKey, (.bad | length)] | map(tostring) | join(" ")' <<<"$SEED")" = "PREVIEW_RELEASE_SEEDED $LABEL $KEY 0" ] || { echo "TB6_NOT_DONE: T is not the seeded current release; nothing was started (way back: rbB-T)"; exit 1; }
grep -qxF "Wants=debateai-preview-api@$LABEL.service debateai-preview-ui@$LABEL.service" "$UD/debateai-preview.target.d/60-current-release.conf" || { echo "TB6_NOT_DONE: the boot target does not name T's pair; nothing was started (way back: rbB-T)"; exit 1; }
systemctl daemon-reload
T0=$(date +%s)
systemctl start "debateai-preview-api@$LABEL" || echo "systemctl start of T's API returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u "debateai-preview-api@$LABEL" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; [ "$(systemctl is-active "debateai-preview-api@$LABEL" || true)" = failed ] && break; sleep 3; done
journalctl -u "debateai-preview-api@$LABEL" --since "@$T0" -o cat --no-pager | grep -E 'PREVIEW_LIFECYCLE_PRESTART_(READY|REFUSED)|PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED' | cut -c1-300 || true
[ "$(journalctl -u "debateai-preview-api@$LABEL" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" = 0 ] || { echo "TB6_NOT_DONE: T's API refused to start; the website and the runner are left stopped (way back: rbB-T)"; exit 1; }
[ "$(journalctl -u "debateai-preview-api@$LABEL" --since "@$T0" -o cat --no-pager | grep 'PREVIEW_API_STARTED' | grep "\"sourceRevision\":\"$REV\"" | grep -c "\"releaseKey\":\"$KEY\"" || true)" -ge 1 ] && [ "$(systemctl is-active "debateai-preview-api@$LABEL" || true)" = active ] || { echo "TB6_NOT_DONE: T's API did not start on REV with $KEY; the website and the runner are left stopped (way back: rbB-T)"; exit 1; }
systemctl start "debateai-preview-ui@$LABEL" || echo "systemctl start of T's website returned non-zero"
c=000; for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$UIP/login" || true); [ "$c" = 200 ] && break; sleep 3; done
[ "$c" = 200 ] || { echo "TB6_NOT_DONE: T's website does not answer /login with 200; the runner is left stopped (way back: rbB-T)"; exit 1; }
echo "DOWNTIME END $(date -u) ($(( $(date +%s) - $(tail -n 1 "$S/downtime-start-epoch") )) s)"
systemctl start debateai-preview-backup.timer && [ "$(systemctl is-active debateai-preview-backup.timer || true)" = active ] || { echo "TB6_NOT_DONE: the backup timer did not start (the API and the website are up)"; exit 1; }
RZ=$(readyz "$UIP"); echo "T's website /readyz (Host 127.0.0.1:$UIP, as Caddy's health check sends it): ${RZ##*$'\n'} $(jq -c '{releaseKey, reasons}' <<<"${RZ%$'\n'*}" 2>/dev/null || echo '(no JSON)')"
[ "${RZ##*$'\n'}" = 200 ] && [ "$(jq -r .releaseKey <<<"${RZ%$'\n'*}" 2>/dev/null)" = "$KEY" ] || { echo "TB6_NOT_DONE: T's website /readyz is not 200 for $KEY (the site is up on slot A; do not run TB7): ask"; exit 1; }
echo TB6_DONE
```

Note from R20 (2026-10-22): TB6 stopped inside the downtime with `differs: ["RestrictFileSystems"]` for both the API
and the website. The settings were the same; only the printing differed: the full `systemctl show` saved at TA0 leaves
an empty setting out, while `systemctl show -p` prints an empty deny list as a bare `~`. The owner approved resuming
with a copy of the TA0 capture that had a `RestrictFileSystems=~` line added, and the compare then said SAME. The tool
now reads a bare `~` as empty (for RestrictFileSystems, RestrictAddressFamilies and SystemCallFilter), so this stop
should not come back; a `~` followed by names is still a real list and is still compared.

From TB6 on, the team unlock and the creator read the current release's API from the release table and lock v2.

### TB7. Caddy with two slots

Caddy runs with `admin off`: the new file goes in with a restart (about one second), never a reload. On any miss the
old file goes back and Caddy restarts again: the site keeps running T on slot A, and side by side is not ready.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TB7: the two-slot Caddyfile in place, restart; then the edge, the public site, the notify POST and the listener's 404s.
T0=$(date +%s)
[ "$(systemctl is-active "debateai-preview-api@$LABEL" || true)" = active ] && [ "$(systemctl is-active "debateai-preview-ui@$LABEL" || true)" = active ] || { echo "TB7_NOT_DONE: T's API or website is not active (TB6 first; nothing changed)"; exit 1; }
RZ=$(readyz "$UIP"); [ "${RZ##*$'\n'}" = 200 ] && [ "$(jq -r .releaseKey <<<"${RZ%$'\n'*}" 2>/dev/null)" = "$KEY" ] || { echo "TB7_NOT_DONE: T's website /readyz is not 200 for $KEY (nothing changed)"; exit 1; }
cmp -s "$C" "$S/preflight/Caddyfile.live" || { echo "TB7_NOT_DONE: the live Caddyfile changed since TA0 (nothing changed): ask"; exit 1; }
[ -s "$S/Caddyfile.two-slot" ] && [ ! -e "$S/Caddyfile.before-two-slot" ] || { echo "TB7_NOT_DONE: the two-slot file is missing, or TB7 ran before (look first)"; exit 1; }
cad validate --config "$S/Caddyfile.two-slot" --adapter caddyfile >/dev/null 2>&1 || { echo "TB7_NOT_DONE: Caddy's validation refused the two-slot file (nothing changed)"; exit 1; }
cp -p "$C" "$S/Caddyfile.before-two-slot"
back() { R="is back"; install -o root -g root -m 0644 "$S/Caddyfile.before-two-slot" "$C.new" && mv "$C.new" "$C" && cmp -s "$S/Caddyfile.before-two-slot" "$C" || R="did NOT go back (the live file may still be the two-slot one)"; systemctl restart caddy || true; CA=$(systemctl is-active caddy || true); echo "TB7_NOT_DONE: $1; the old Caddyfile $R; after its restart Caddy is $CA (active: the site runs T on slot A and side by side is not ready; anything else: the site is DOWN, look at caddy now) (ask)"; exit 1; }
install -o root -g root -m 0644 "$S/Caddyfile.two-slot" "$C.new"
mv "$C.new" "$C"
systemctl restart caddy || back "caddy did not restart on the two-slot file"
cmp -s "$S/Caddyfile.two-slot" "$C" || back "the two-slot file is not the live file"
[ "$(systemctl is-active caddy || true)" = active ] || back "caddy is not active on the two-slot file"
EK="000 none"; for i in $(seq 1 30); do EK=$(edgekey); [ "$EK" = "200 $KEY" ] && break; sleep 1; done
echo "edge 127.0.0.1:3090/readyz: $EK"
[ "$EK" = "200 $KEY" ] || back "the edge did not answer 200 with x-debateai-release $KEY within 30 s (no slot healthy: is the edge secret filled in inside health_headers?)"
PC=$(curl -s -o /dev/null -m 15 -w '%{http_code}' https://v3-preview.dezbatere.ro/ || true); echo "public / without the password: $PC"
[ "$PC" = 401 ] || back "the public site does not answer 401 without the password (got $PC)"
RP=$(curl -s -o /dev/null -m 15 -w '%{http_code}' https://v3-preview.dezbatere.ro/readyz || true); echo "public /readyz without the password: $RP"
[ "$RP" = 404 ] || back "the public route does not refuse /readyz with its own 404 before the password (got $RP)"
NC=$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notify || true); echo "notify POST: $NC"
[ "$NC" = 503 ] || back "NETOPIA's notify POST does not reach T's API (got $NC, expected 503)"
for PTH in / /login /livez /readyz/; do XC=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "http://127.0.0.1:3090$PTH" || true); echo "listener GET $PTH: $XC"; [ "$XC" = 404 ] || back "the listener answered GET $PTH with $XC, not 404"; done
XC=$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST http://127.0.0.1:3090/readyz || true); echo "listener POST /readyz: $XC"
[ "$XC" = 404 ] || back "the listener answered POST /readyz with $XC, not 404"
XC=$(curl -s -o /dev/null -m 15 -w '%{http_code}' --path-as-is http://127.0.0.1:3090/readyz/../api || true); echo "listener GET /readyz/../api: $XC"
[ "$XC" = 404 ] || back "the listener answered /readyz/../api with $XC, not 404"
XC=$(curl -s -o /dev/null -m 15 -w '%{http_code}' 'http://127.0.0.1:3090/readyz?probe=1' || true); echo "listener GET /readyz with a query: $XC"
[ "$XC" = 200 ] || back "the listener did not answer /readyz with a query string (the rewrite clears it) with 200"
echo "Caddy restarted with two slots, checked $(( $(date +%s) - T0 )) s after this step began"
echo TB7_DONE
```

### TB8. T's runner, by hand

B7 on T's instance. Nothing older than T can be claimed (TB1 drained R19), so T's runner re-sends nothing at its start.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TB8: start T's runner by hand. Refuses on any start-up, register, engine, capacity or login refusal line.
V=$(cat "$S/new-register-version"); RU=debateai-preview-runner@$LABEL
case "$(systemctl is-active "$RU" || true)" in inactive|failed) ;; *) echo "TB8_NOT_DONE: T's runner is already running"; exit 1;; esac
[ "$(systemctl is-active "debateai-preview-api@$LABEL" || true)" = active ] && [ "$(systemctl is-active "debateai-preview-ui@$LABEL" || true)" = active ] || { echo "TB8_NOT_DONE: T's API or website is not active (TB6 first)"; exit 1; }
[ "$(jq -r --arg l "$LABEL" '.releases[$l].services.runner.sourceRevision' "$LOCK")" = "$REV" ] && [ "$(jq -r --arg l "$LABEL" '.releases[$l].services.runner.publication.registerVersion' "$LOCK")" = "$V" ] || { echo "TB8_NOT_DONE: the runner's pin is not T on $V"; exit 1; }
[ "$(grep -c "^REGISTER_VERSION=$V\$" "$E/runner-$LABEL.env")" = 1 ] && [ "$(grep -c "^RELEASE_KEY=$KEY\$" "$E/runner-$LABEL.env")" = 1 ] || { echo "TB8_NOT_DONE: runner-$LABEL.env is not T's on $V"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE run_id IS NOT NULL AND (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))")" = 0 ] || { echo "TB8_NOT_DONE: something is claimable; the runner is not started (ask)"; exit 1; }
[ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "TB8_NOT_DONE: a spending gate is not active (TB0g?); the runner is not started"; exit 1; }
T0=$(date +%s)
systemctl start "$RU" || echo "systemctl start of T's runner returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u "$RU" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
STL=$(journalctl -u "$RU" --since "@$T0" -o cat --no-pager | grep '^PREVIEW_RUNNER_STARTED ' | grep "\"sourceRevision\":\"$REV\"" | grep "\"releaseKey\":\"$KEY\"" | head -n 1 || true)
[ -n "$STL" ] || { echo "TB8_NOT_DONE: no PREVIEW_RUNNER_STARTED naming REV and $KEY"; exit 1; }
echo "startupDispatched: $(grep -o '"startupDispatched":[0-9]*' <<<"$STL" | cut -d: -f2)"
sleep 20
BADL=$(journalctl -u "$RU" --since "@$T0" -o cat --no-pager | grep -E 'GATE_CAPACITY_UNREAD|UNAUTHENTICATED|STARTUP_REFUSED|PRESTART_REFUSED|STOPPED_ON_FAILURE|_MISMATCH|_UNSEALED|ENGINE_REQUIRES|ENGINE_[A-Z_]*REFUSED|REGISTER_[A-Z_]*REFUSED' || true)
[ -z "$BADL" ] || { echo "$BADL" | cut -c1-300; echo "TB8_NOT_DONE: a refusal, capacity or login line in the runner's journal (above)"; exit 1; }
[ "$(systemctl is-active "$RU" || true)" = active ] && [ "$(systemctl show -p NRestarts --value "$RU")" = 0 ] || { echo "TB8_NOT_DONE: the runner is not active with NRestarts 0 after 20 s"; exit 1; }
echo TB8_DONE
```

### TB9. The checks (read-only)

B8's checks on T's instances, plus the release table, the memory caps, the boot target and the edge.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# TB9: read-only. Every check prints OK or BAD; the last line is the verdict.
V=$(cat "$S/new-register-version"); BAD=0
ok() { echo "OK   $1"; }; bad() { echo "BAD  $1"; BAD=$((BAD + 1)); }
for SVC in api runner; do M=$(journalctl --no-pager -o cat -u "debateai-preview-$SVC@$LABEL" _SYSTEMD_INVOCATION_ID="$(systemctl show -p InvocationID --value "debateai-preview-$SVC@$LABEL")" | grep -o '"deploymentMode":"[a-z]*"' | sort -u || true); if [ "$M" = '"deploymentMode":"hosted"' ]; then ok "HOSTED_$SVC"; else bad "HOSTED_$SVC"; fi; done
for U in "api@$LABEL" "ui@$LABEL" "runner@$LABEL" provider-budget anthropic-budget postgresql hatchet hatchet-gateway turnstile egress; do if [ "$(systemctl is-active "debateai-preview-$U" || true)" = active ] && [ "$(systemctl show -p NRestarts --value "debateai-preview-$U")" = 0 ]; then ok "ACTIVE_$U"; else bad "ACTIVE_$U"; fi; done
if [ "$(systemctl --failed --no-legend --plain | grep -c debateai || true)" = 0 ]; then ok NO_FAILED_DEBATEAI_UNIT; else bad NO_FAILED_DEBATEAI_UNIT; fi
if [ "$(systemctl is-active debateai-preview-backup.timer || true)" = active ]; then ok BACKUP_TIMER_ACTIVE; else bad BACKUP_TIMER_ACTIVE; fi
for SVC in api runner; do if [ "$(grep -c "^REGISTER_VERSION=$V\$" "$E/$SVC-$LABEL.env")" = 1 ] && [ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$E/$SVC-$LABEL.env")" = 1 ] && [ "$(grep -c "^RELEASE_KEY=$KEY\$" "$E/$SVC-$LABEL.env")" = 1 ]; then ok "ENV_${V}_HOSTED_$SVC"; else bad "ENV_${V}_HOSTED_$SVC"; fi; done
for SVC in api runner; do if [ "$(ps -o args= -p "$(systemctl show -p MainPID --value "debateai-preview-$SVC@$LABEL")" | grep -c "auth-dev-candidate-$LABEL-$SVC/" || true)" = 1 ]; then ok "RUNS_THIS_RELEASE_$SVC"; else bad "RUNS_THIS_RELEASE_$SVC"; fi; done
echo "ledger $(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration"), max_connections $(psqlq "SHOW max_connections")"
if [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$V" ]; then ok "REGISTER_$V"; else bad "REGISTER_$V"; fi
if [ "$(psqlq "SHOW max_connections")" = 320 ]; then ok MAX_CONNECTIONS_320; else bad MAX_CONNECTIONS_320; fi
if [ "$(jq -r --arg l "$LABEL" --arg r "$REV" --arg v "$V" '[.schema, (.releases | keys | join(",")), ([.releases[$l].services[] | select(.sourceRevision == $r and .publication.registerVersion == $v)] | length)] | map(tostring) | join(" ")' "$LOCK")" = "preview-lifecycle-release-lock-v2 $LABEL 3" ]; then ok LOCK_V2_T_THREE_TIMES; else bad LOCK_V2_T_THREE_TIMES; fi
if cmp -s "$ART/native-plan-verify.json" "$NP" && cmp -s "$S/native-plan.before.json" "$ONP"; then ok NATIVE_PLANS; else bad NATIVE_PLANS; fi
ST=$(lc release-check.mjs status 2>&1 || true)
if [ "$(jq -r --arg l "$LABEL" '[.releases[] | select(.label == $l and .state == "CURRENT" and .slot == "A" and .units.api == "active" and .units.ui == "active" and .units.runner == "active")] | length' <<<"$ST" 2>/dev/null)" = 1 ]; then ok STATUS_T_CURRENT; else bad STATUS_T_CURRENT; fi
for U in runner:3221225472 api:2147483648 ui:1073741824; do if [ "$(systemctl show -p MemoryMax --value "debateai-preview-${U%%:*}@$LABEL")" = "${U#*:}" ]; then ok "MEMORYMAX_${U%%:*}"; else bad "MEMORYMAX_${U%%:*}"; fi; done
if grep -qxF "Wants=debateai-preview-api@$LABEL.service debateai-preview-ui@$LABEL.service" /etc/systemd/system/debateai-preview.target.d/60-current-release.conf; then ok TARGET_NAMES_T; else bad TARGET_NAMES_T; fi
if [ "$(edgekey)" = "200 $KEY" ]; then ok EDGE_T; else bad EDGE_T; fi
if [ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ]; then ok BOTH_GATES_ACTIVE; else bad BOTH_GATES_ACTIVE; fi
NC=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' https://v3-preview.dezbatere.ro/api/v1/billing/netopia/notify || true)
if [ "$NC" = 503 ]; then ok NOTIFY_503; else bad "NOTIFY_503 (got $NC)"; fi
BC=$(systemd-run --quiet --pipe --wait --collect --uid="$AU" --gid="$AGRP" --property=EnvironmentFile="$E/api-$LABEL.env" --setenv=NODE_USE_ENV_PROXY=1 --setenv=HTTPS_PROXY=http://127.0.0.1:3180 '--setenv=NO_PROXY=localhost,127.0.0.1,[::1],v3-preview.dezbatere.ro' --working-directory="$CAPI/dialectical-engine" "$N" --import tsx apps/api/src/billing/check-cli.ts 2>&1 || true)
echo "$BC" | grep -vE 'DeprecationWarning|trace-deprecation' || true
if echo "$BC" | grep -q '^1 of 16 checks need attention\.$' && [ "$(echo "$BC" | grep -c '^✗' || true)" = 1 ] && echo "$BC" | grep '^✗' | grep -q placeholders; then ok BILLING_CHECK_15_OF_16; else bad BILLING_CHECK_15_OF_16; fi
[ "$BAD" = 0 ] || { echo "TB9_NOT_DONE: $BAD check(s) BAD"; exit 1; }
echo TB9_DONE
```

Then the release's own checks, and the owner starts one short real debate on the site: it must finish, on T's runner.

### TB10. The N-1 baseline names the live release (on the Mac)

After TB9 the live release is `REV` (`LABEL`, in the names file). The N-1 compatibility job
(`.github/workflows/n1-compatibility.yml`) runs the database suites of the commit `tests/n1-baseline.json` names against
every later schema, so that file must name `REV` before the next upload: the next upload's SB4 (`N1_BASELINE`) refuses
until a `REV` that contains this change. On the Mac, in the repository checkout, with the owner's yes for the PR (the
standing order: latest dev first, push, PR to dev, fix CI, merge), fill in the three values and run:

```sh
NN=rNN; REV='<the 40-character commit of T, the release that is now live>'; LABEL='<its label, from the names file>'
git fetch origin dev && git switch -c "chore/n1-baseline-$NN" origin/dev
jq --arg c "$REV" --arg r "$LABEL" '.commit = $c | .reason = $r | .knownRed = []' dialectical-engine/tests/n1-baseline.json > "$TMPDIR/n1-baseline.json" && mv "$TMPDIR/n1-baseline.json" dialectical-engine/tests/n1-baseline.json
[ "$(node dialectical-engine/tools/n1-baseline.mjs commit)" = "$REV" ] && git diff --stat && git add dialectical-engine/tests/n1-baseline.json && git commit -m "chore(n1): the N-1 baseline names $LABEL ($NN)"
git push -u origin "chore/n1-baseline-$NN" && gh pr create --base dev --title "chore(n1): the N-1 baseline names $LABEL" --body "tests/n1-baseline.json names $REV, the release live on the test site, so the N-1 compatibility job checks that commit's database suites on every later schema."
```

The diff must change exactly the two lines `commit` and `reason`, and empty `knownRed` (the previous release's own stale
tests; `setAside` stays). Once CI is green, merge it (the job itself runs on this PR: it checks `REV`'s suites against
dev's schema). If it is red only on a test of `REV` that is red on `REV`'s own schema too (run that file at `REV`
without `DEBATEAI_TEST_SCHEMA_FROM` to tell), fix the test on dev in this PR and add its full name to `knownRed` with
the reason; a test that tests the migration chain itself goes to `setAside` instead (tools/n1-baseline.mjs). Never list
a failure that only the schema migrated ahead causes: that is the incompatibility the job exists to catch.

### The way back from T

**rbA-T: before TB3** (no migration ran, nothing published, the layout unchanged). R19's rbA on T's names: it starts R19
exactly as it was. `max_connections` stays 320 and a redeployed gate stays (both harmless for R19); T's per-release
files stay where they are, unused. Give it `yes` or `no` for the runner (`bash -s -- yes`). If TB2 stopped half way,
finish B2's restart part by hand first (PostgreSQL, Hatchet, the witness `check` must say `PASS`, then the gateway).

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# rbA-T: start R19 as it was. Only before TB3.
RUNNER=${1:-}
[ "$RUNNER" = yes ] || [ "$RUNNER" = no ] || { echo "RBA_T_NOT_DONE: say yes or no for the runner (bash -s -- yes)"; exit 1; }
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = active ] || { echo "RBA_T_NOT_DONE: $U is not active (bring the database side back first)"; exit 1; }; done
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$(cat "$S/ledger-before")" ] || { echo "RBA_T_NOT_DONE: a migration ran: use rbB-T"; exit 1; }
[ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$(cat "$S/register-before")" ] || { echo "RBA_T_NOT_DONE: a version was published: use rbB-T"; exit 1; }
cmp -s "$S/native-plan.before.json" "$ONP" && cmp -s "$S/release-lock.before.json" "$LOCK" || { echo "RBA_T_NOT_DONE: native-plan.json or the lock moved: use rbB-T"; exit 1; }
[ ! -e "$S/systemd-T.list" ] && [ ! -e "$S/operator-lifecycle-v1.before" ] || { echo "RBA_T_NOT_DONE: TB5 changed the layout: use rbB-T"; exit 1; }
for F in api.env runner.env ui.env; do cmp -s "$S/$F.before" "$E/$F" || { echo "RBA_T_NOT_DONE: $F moved: ask"; exit 1; }; done
for U in api ui runner; do [ "$(grep -cF "$OLABEL" /etc/systemd/system/debateai-preview-$U.service.d/zzzzzzzzzz-lifecycle-release.conf || true)" -ge 1 ] || { echo "RBA_T_NOT_DONE: the $U drop-in does not name R19: use rbB-T"; exit 1; }; done
T0=$(date +%s)
systemctl start debateai-preview-api || echo "systemctl start api returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep 'PREVIEW_API_STARTED' | grep -c "\"sourceRevision\":\"$OREV\"" || true)" -ge 1 ] || { echo "RBA_T_NOT_DONE: no PREVIEW_API_STARTED naming R19"; exit 1; }
systemctl start debateai-preview-ui || echo "systemctl start ui returned non-zero"
c=000; for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login || true); [ "$c" = 200 ] && break; sleep 3; done
[ "$c" = 200 ] || { echo "RBA_T_NOT_DONE: the website does not answer /login with 200"; exit 1; }
echo "DOWNTIME END (rbA-T) $(date -u)"
systemctl start debateai-preview-backup.timer || { echo "RBA_T_NOT_DONE: the backup timer did not start (the API and the website are up)"; exit 1; }
if [ "$RUNNER" = yes ]; then
  [ "$(psqlq "SELECT count(*) FROM core.work_item WHERE run_id IS NOT NULL AND (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))")" = 0 ] && [ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "RBA_T_NOT_DONE: something is claimable or a gate is not active; the runner is left stopped"; exit 1; }
  T1=$(date +%s); systemctl start debateai-preview-runner || echo "systemctl start runner returned non-zero"
  for i in $(seq 1 80); do [ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
  [ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep 'PREVIEW_RUNNER_STARTED' | grep -c "\"sourceRevision\":\"$OREV\"" || true)" -ge 1 ] && [ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep -cE 'GATE_CAPACITY_UNREAD|UNAUTHENTICATED' || true)" = 0 ] || { echo "RBA_T_NOT_DONE: R19's runner did not start cleanly"; exit 1; }
fi
echo RBA_T_DONE
```

**rbB-T: from TB3 on, at any later point.** It works out which of TB5, TB6 and TB7 ran and undoes only those, in this
order:
1. T's website and API stop (the downtime starts again); T's runner stops only once no work is READY or CLAIMED (a
   busy runner is never stopped: after 10 minutes it gives up and asks);
2. the old Caddyfile goes back (when TB7 installed the new one) and Caddy restarts;
3. T's units, instance drop-ins and target move into `$S/systemd-T/` (of the shared `debateai-preview.target.d` only
   T's `60-current-release.conf`: the Anthropic gate's `50-anthropic-gate.conf` stays), and R19's units, drop-in folders
   and links come back from `$S/systemd-old/` (when TB5 ran);
4. R19's operator folder comes back (T's moves to `$S/operator-lifecycle-v1.T`) and the v1 lock comes back (lock v2
   moves to `$S/release-lock.v2-T.json`);
5. the cold copy's data **and** config folders come back (the current ones are moved aside as
   `….after-<stamp>`, never deleted), so `max_connections` is 200 again;
6. R19's API, website, backup timer and runner start.

**Everything written to the database after TB2 is lost with it**: T's version, the release table, and anything people
did on the site since. Nothing is deleted. If rbB-T stops half way, read the line it printed: everything before it is
done, nothing after it is; finish with the owner.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# rbB-T: from TB3 on. Stop T (its runner only with no open work), put back what TB7, TB5 and TB6 changed, restore the cold
# copy's data and config folders, start R19. Nothing is deleted: what T used moves into S.
TS=$(date -u +%Y%m%dT%H%M%SZ); PGP=/var/lib/postgresql/18; PGC=/etc/debateai-v3-preview/postgresql; SOCK=/run/debateai-v3-preview/postgresql
UD=/etc/systemd/system; OP=/opt/debateai-v3-preview/operator/lifecycle-v1
LEDGER0=$(cat "$S/ledger-before"); REG0=$(cat "$S/register-before")
sha256sum -c --quiet "$S/pg18-cold.sha256" || { echo "RBB_T_NOT_DONE: the cold copy is missing or does not match its sha256 (nothing stopped)"; exit 1; }
for F in api.env.before runner.env.before ui.env.before release-lock.before.json native-plan.before.json old-plans.txt; do [ -s "$S/$F" ] || { echo "RBB_T_NOT_DONE: $S/$F is missing (nothing stopped)"; exit 1; }; done
for F in $(cat "$S/old-plans.txt"); do [ -s "$F" ] || { echo "RBB_T_NOT_DONE: the old plan $F is missing (nothing stopped)"; exit 1; }; done
for D in "$OCAPI" "$OCUI" "$OCRUN"; do [ -d "$D/dialectical-engine" ] || { echo "RBB_T_NOT_DONE: R19's folder $D is missing (nothing stopped)"; exit 1; }; done
cmp -s "$S/native-plan.before.json" "$ONP" || { echo "RBB_T_NOT_DONE: native-plan.json moved (nothing stopped): ask"; exit 1; }
for F in api.env runner.env ui.env; do cmp -s "$S/$F.before" "$E/$F" || { echo "RBB_T_NOT_DONE: the live $F moved (nothing stopped): ask"; exit 1; }; done
CC=$S/rbB-config-check-$TS; install -d -o root -g root -m 0700 "$CC"; tar -C "$CC" -xzf "$S/pg18-v3-preview-config.tgz"
CD=$(diff -r "$CC/postgresql" "$PGC" | grep -vE '^(diff -r |[0-9]+(,[0-9]+)?[acd][0-9]+(,[0-9]+)?$|---$)' || true)
[ -z "$CD" ] || [ "$(printf '%s\n' "$CD" | grep -vcE '^[<>] max_connections = (200|320)([^0-9]|$)' || true)" = 0 ] || { echo "RBB_T_NOT_DONE: the live PostgreSQL config differs from the copy's by more than max_connections (nothing stopped; look first)"; exit 1; }
if [ -e "$S/systemd-old.txt" ]; then while read -r NM; do [ -e "$S/systemd-old/$NM" ] || [ -L "$S/systemd-old/$NM" ] || { echo "RBB_T_NOT_DONE: $S/systemd-old/$NM is missing (nothing stopped)"; exit 1; }; done < "$S/systemd-old.txt"; fi
MODE0=$(stat -c '%a %U:%G' "$PGP/v3-preview"); CMODE0=$(stat -c '%a %U:%G' "$PGC")
date -u +%s >> "$S/downtime-start-epoch"; echo "DOWNTIME START (rbB-T) $(date -u)"
systemctl stop "debateai-preview-ui@$LABEL" "debateai-preview-api@$LABEL" debateai-preview-backup.timer || true
for U in "debateai-preview-ui@$LABEL" "debateai-preview-api@$LABEL"; do case "$(systemctl is-active "$U" || true)" in inactive|failed) ;; *) echo "RBB_T_NOT_DONE: $U is still running"; exit 1;; esac; done
case "$(systemctl is-active "debateai-preview-runner@$LABEL" || true)" in
  inactive|failed) ;;
  *) OW=x; for i in $(seq 1 120); do OW=$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')"); [ "$OW" = 0 ] && break; sleep 5; done
     [ "$OW" = 0 ] || { echo "RBB_T_NOT_DONE: T's runner still holds $OW open item(s) after 10 minutes; the site is DOWN, nothing else changed: ask (run rbB-T again once they finish; a busy runner is never stopped)"; exit 1; }
     systemctl stop "debateai-preview-runner@$LABEL" || true;;
esac
case "$(systemctl is-active "debateai-preview-runner@$LABEL" || true)" in inactive|failed) ;; *) echo "RBB_T_NOT_DONE: T's runner is still running"; exit 1;; esac
if [ -e "$S/Caddyfile.before-two-slot" ] && ! cmp -s "$S/Caddyfile.before-two-slot" "$C"; then
  install -o root -g root -m 0644 "$S/Caddyfile.before-two-slot" "$C.new" && mv "$C.new" "$C" || { echo "RBB_T_NOT_DONE: the old Caddyfile did not go in (T's two-slot file is still live; the app services are stopped): ask"; exit 1; }
  cmp -s "$S/Caddyfile.before-two-slot" "$C" && systemctl restart caddy || { echo "RBB_T_NOT_DONE: the old Caddyfile did not go back, or Caddy did not restart on it"; exit 1; }
fi
if [ -e "$S/systemd-T.list" ]; then
  # T's boot target drop-in is one file of the shared debateai-preview.target.d (the gate's drop-in stays in place).
  install -d -o root -g root -m 0700 "$S/systemd-T" "$S/systemd-T/debateai-preview.target.d"
  while read -r NM; do if [ -e "$UD/$NM" ] || [ -L "$UD/$NM" ]; then mv "$UD/$NM" "$S/systemd-T/$NM" || { echo "RBB_T_NOT_DONE: T's $NM did not move into $S/systemd-T (the names before it in $S/systemd-T.list are there, R19's units are still in $S/systemd-old; the app services are stopped): ask"; exit 1; }; fi; done < "$S/systemd-T.list"
  while read -r NM; do mv "$S/systemd-old/$NM" "$UD/$NM" || { echo "RBB_T_NOT_DONE: R19's $NM did not come back from $S/systemd-old (T's units are in $S/systemd-T, the names before it in $S/systemd-old.txt are back; the app services are stopped): ask"; exit 1; }; done < "$S/systemd-old.txt"
  # TB5 lists the links only after the unit files moved: a TB5 that stopped before that moved no link.
  if [ -e "$S/systemd-old-wants.txt" ]; then
    while read -r F; do mv "$S/systemd-old-wants/$F" "$UD/$F" || { echo "RBB_T_NOT_DONE: the link $F did not come back from $S/systemd-old-wants (R19's units are back, the links before it in $S/systemd-old-wants.txt too; the app services are stopped): ask"; exit 1; }; done < "$S/systemd-old-wants.txt"
  fi
fi
if [ -e "$S/operator-lifecycle-v1.before" ]; then
  mv "$OP" "$S/operator-lifecycle-v1.T" || { echo "RBB_T_NOT_DONE: T's operator folder did not move to $S/operator-lifecycle-v1.T (R19's units are back; R19's operator folder is still $S/operator-lifecycle-v1.before): ask"; exit 1; }
  mv "$S/operator-lifecycle-v1.before" "$OP" || { echo "RBB_T_NOT_DONE: R19's operator folder did not come back: NO operator folder is installed (R19's is $S/operator-lifecycle-v1.before, T's $S/operator-lifecycle-v1.T): ask"; exit 1; }
fi
if [ -e "$S/release-lock.v1.json" ]; then
  if [ -e "$LOCK" ]; then mv "$LOCK" "$S/release-lock.v2-T.json" || { echo "RBB_T_NOT_DONE: lock v2 did not move to $S/release-lock.v2-T.json (R19's units and operator folder are back): ask"; exit 1; }; fi
  mv "$S/release-lock.v1.json" "$LOCK" || { echo "RBB_T_NOT_DONE: R19's v1 lock did not come back: NO lock is installed (R19's is $S/release-lock.v1.json, T's $S/release-lock.v2-T.json): ask"; exit 1; }
fi
cmp -s "$S/release-lock.before.json" "$LOCK" || { echo "RBB_T_NOT_DONE: the lock is not R19's v1 lock; the app services are stopped"; exit 1; }
systemctl daemon-reload
for U in api ui runner; do [ "$(grep -cF "$OLABEL" "$UD/debateai-preview-$U.service.d/zzzzzzzzzz-lifecycle-release.conf" || true)" -ge 1 ] || { echo "RBB_T_NOT_DONE: R19's $U unit is not back; the app services are stopped"; exit 1; }; done
CID0=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true)
systemctl stop debateai-preview-hatchet-gateway debateai-preview-hatchet debateai-preview-postgresql || { echo "RBB_T_NOT_DONE: a stop failed (look first)"; exit 1; }
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = inactive ] || { echo "RBB_T_NOT_DONE: $U is not inactive (nothing restored)"; exit 1; }; done
[ ! -e "$PGP/v3-preview.after-$TS" ] && [ ! -e "$PGC.after-$TS" ] || { echo "RBB_T_NOT_DONE: a folder named after-$TS exists"; exit 1; }
mv "$PGP/v3-preview" "$PGP/v3-preview.after-$TS" || { echo "RBB_T_NOT_DONE: the data folder could not be moved aside; the database is STOPPED"; exit 1; }
tar -C "$PGP" -xzf "$S/pg18-v3-preview-cold.tgz" || { echo "RBB_T_NOT_DONE: the data restore failed; the old folder is $PGP/v3-preview.after-$TS; the database is STOPPED"; exit 1; }
mv "$PGC" "$PGC.after-$TS" || { echo "RBB_T_NOT_DONE: the config folder could not be moved aside; the database is STOPPED"; exit 1; }
tar -C /etc/debateai-v3-preview -xzf "$S/pg18-v3-preview-config.tgz" || { echo "RBB_T_NOT_DONE: the config restore failed; the old folder is $PGC.after-$TS; the database is STOPPED"; exit 1; }
[ "$(stat -c '%a %U:%G' "$PGP/v3-preview")" = "$MODE0" ] && [ "$(stat -c '%a %U:%G' "$PGC")" = "$CMODE0" ] || { echo "RBB_T_NOT_DONE: a restored folder's mode or owner differs; the database is STOPPED"; exit 1; }
systemctl start debateai-preview-postgresql || { echo "RBB_T_NOT_DONE: PostgreSQL did not start on the restored folders"; exit 1; }
for i in $(seq 1 30); do /usr/lib/postgresql/18/bin/pg_isready -q -h "$SOCK" -p 5434 && break; sleep 2; done
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] && [ "$(psqlq "SHOW max_connections")" = 200 ] || { echo "RBB_T_NOT_DONE: the restored database is not ledger $LEDGER0, register $REG0, 200 connections"; exit 1; }
systemctl start debateai-preview-hatchet || { echo "RBB_T_NOT_DONE: Hatchet did not start"; exit 1; }
CID=; for i in $(seq 1 30); do CID=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true); [ -n "$CID" ] && break; sleep 2; done
IP=$(docker inspect "$CID" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' || true)
[ -n "$CID" ] && { [ -z "$CID0" ] || [ "$CID" = "$CID0" ]; } || { echo "RBB_T_NOT_DONE: the Hatchet container is missing or changed; the gateway is NOT started: stop and ask"; exit 1; }
ALLOW=$(systemctl show -p IPAddressAllow --value debateai-preview-hatchet-gateway.service)
echo " $ALLOW " | grep -qF -e " $IP/32 " -e " $IP " || { echo "RBB_T_NOT_DONE: Hatchet's address is not in the gateway's IPAddressAllow; the gateway is NOT started"; exit 1; }
W=$(/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin /usr/local/bin/node /opt/debateai-v3-preview/operator/gateway/gateway-route-witness.mjs check 2>&1) && echo "$W" | grep -q PASS || { echo "$W" | cut -c1-400; echo "RBB_T_NOT_DONE: the gateway witness did not say PASS; the gateway is NOT started"; exit 1; }
systemctl start debateai-preview-hatchet-gateway.service || { echo "RBB_T_NOT_DONE: the gateway did not start"; exit 1; }
T0=$(date +%s)
systemctl start debateai-preview-api || echo "systemctl start api returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u debateai-preview-api --since "@$T0" -o cat --no-pager | grep 'PREVIEW_API_STARTED' | grep -c "\"sourceRevision\":\"$OREV\"" || true)" -ge 1 ] || { echo "RBB_T_NOT_DONE: no PREVIEW_API_STARTED naming R19"; exit 1; }
systemctl start debateai-preview-ui || echo "systemctl start ui returned non-zero"
c=000; for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login || true); [ "$c" = 200 ] && break; sleep 3; done
[ "$c" = 200 ] || { echo "RBB_T_NOT_DONE: the website does not answer /login with 200; the runner is left stopped"; exit 1; }
echo "DOWNTIME END (rbB-T) $(date -u)"
systemctl start debateai-preview-backup.timer || { echo "RBB_T_NOT_DONE: the backup timer did not start; the runner is left stopped"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE run_id IS NOT NULL AND (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))")" = 0 ] && [ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "RBB_T_NOT_DONE: something is claimable or a gate is not active; the runner is left stopped (ask)"; exit 1; }
T1=$(date +%s); systemctl start debateai-preview-runner || echo "systemctl start runner returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep 'PREVIEW_RUNNER_STARTED' | grep -c "\"sourceRevision\":\"$OREV\"" || true)" -ge 1 ] && [ "$(journalctl -u debateai-preview-runner --since "@$T1" -o cat --no-pager | grep -cE 'GATE_CAPACITY_UNREAD|UNAUTHENTICATED' || true)" = 0 ] || { echo "RBB_T_NOT_DONE: R19's runner did not start cleanly"; exit 1; }
echo "kept for the owner: $PGP/v3-preview.after-$TS and $PGC.after-$TS (the database as T left it; they hold secrets), $S/systemd-T, $S/operator-lifecycle-v1.T, $S/release-lock.v2-T.json"
echo RBB_T_DONE
```

After rbB-T the next plan is made from `$S/native-plan.before.json` again, and the next upload is a transition again (T
fixed forward, with a new number).

## Side-by-side release (from T+1)

**In plain words.** From T+1 on, an upload stops nothing that is running. The new release (`LABEL`) starts next to the
current one (`OLABEL`), in the other slot, with its own units, env files, native plan and lock entry. The migrations go
in while the old release keeps serving (each one is `-- n1: expand`, and the old release proves the database "one release
ahead" against a list root pins for it). Then one command switches the site: the new pair takes the traffic, the old
website and API stop, and the old runner finishes its own debates and retires by itself (side-by-side spec §4, §6, §12).
Going back is the same switch in the other direction ("The way back, side by side" below). A release whose release
check says `DRAINED_PATH` (a migration that is not `n1: expand`) takes "Drained upload on the template layout" instead.

**How each step runs.** As in the transition: one script per step, `set -euo pipefail`, the names file (SB1 makes it),
`<STEP>_NOT_DONE` guards, `<STEP>_DONE` last, no env value printed except `REGISTER_VERSION`, `RELEASE_KEY`,
`DEBATEAI_DEPLOYMENT_MODE`, `MAIL_SENDMAIL_PATH`, `PAYMENT_MARKS_AVAILABLE` (not secret) and ports. The traps of the
transition hold. Two more:
- **One switch command at a time.** Each `release-switch.mjs` command takes
  `/etc/debateai-v3-preview/lifecycle/release-switch.lock`; another one meanwhile refuses `RELEASE_SWITCH_BUSY`. A lock
  left by an ssh drop names its path and how to clear it (WB4).
- **The old release's tools are the installed ones.** `lc` runs the shared operator folder. SB4 says whether the new
  release changed it (`LIFECYCLE_FILES`); only then, after the owner reviewed the change, SB10 swaps the folder.

**The database-ahead pieces (D5).** When the new release adds migrations, the old release must still be able to
(re)start beside the newer database: `release-artifacts.mjs database-ahead` writes the list of the new steps and the new
release's whole forward chain (schema `preview-database-ahead-v1`, `steps` 1 to 64, `newerChain` 1 to 128, at most
65,536 bytes) as `$ART/database-ahead-$OLABEL.json`; root installs it as
`/etc/debateai-v3-preview/auth-dev-v1/database-ahead-$OLABEL.json` and pins it on the old release with
`prestart.mjs accept-ahead`, before the migrations. The new release is pinned only later (SB10), so accept-ahead holds
the file to the new release's own source manifest it names (root-owned, the sha256 the file names, an API manifest of
the new label and revision listing each step's bytes); SB8 checks the same before it runs. From then on the old
release's prestart verifies with `--database-ahead` and its proof names the file.

**The order, and the way back from each point.**

| Step | What | The site | The way back from here |
|---|---|---|---|
| SB1 | names file (the old release read from the release table), archive `$S`, copies | up | nothing to undo |
| A2–A7, SB1b | staging, as in the hosted-base recipe; SB1b instead of A5 | up | nothing to undo |
| SB2 | the practice (owner rule), at a quiet hour | up | none |
| SB3 | register plan and proposal, in the new release's own native-plan file | up | nothing to undo |
| SB4 | the release check (read-only) | up | nothing to undo |
| SB5 | the three env files; the database-ahead file | up | nothing to undo (unused files) |
| SB5b | only when the payment marks list changes: the list in the new release's ui file | up | nothing to undo (an unused file; the one before is in `$S`) |
| SB6 | the owner's fresh yes | up | – |
| MT1, PM2, MT2 | only the first upload that lists the marks: Caddy's rule (see "Payment marks: the files and Caddy's rule") | up (one Caddy restart, about a second) | PM2 puts the old Caddyfile back itself |
| SB7 | the online backup | up | nothing to undo |
| SB8 | the database-ahead pin, then the migrations (the old release keeps serving) | up | the old release serves on; WB1 once SB10 staged the new one |
| SB9 | publish | up | WB1 (the version stays published, unused) |
| SB10 | verify plan, first proof, launch plans, pins, instance drop-ins, stage (and the operator folder swap, when reviewed) | up | WB1 (and the folder moved back) |
| SB11 | the new runner | up | WB1 |
| SB12 | the new API and website, not ready | up | WB1 |
| SB13 | the switch | up | WB2 |
| SB13b | the team member's test debate runs on the new release (read-only) | up | WB2 |
| SB13c | on the Mac: the PR that makes `tests/n1-baseline.json` name the new release | up | – (the next upload needs it) |
| SB14 | later: the old release retired; its receipt | up | WB2 (its runner restarts in database-ahead mode) |
| SB14b | only after a reboot or a runner crash during the drain: the runners start again | up | – |
| SB15 | later, on the owner's yes: the release before the old one, archived | up | move its folders back |

After SB8 the online backup is a last resort only (spec §11): going back is the switch the other way, never a restore.

### SB1. Names, the archive `$S` and the copies the way back needs

The old release is the release table's CURRENT one, read through `release-check.mjs status`, never typed; the new
release takes the other slot. `KEY` is `r<newest register + 1>-<first 12 hex of REV>`.

```sh
set -euo pipefail
# SB1: this release's names file, its archive folder S and the copies the way back needs. Nothing live changes.
NN=rNN                                                    # this release's number, e.g. r21
REV='<the full 40-character dev commit>'                  # on the Mac: git fetch origin dev && git rev-parse refs/remotes/origin/dev
OSTORE='<the pnpm store the live release installed from>'
LOCK=/etc/debateai-v3-preview/lifecycle/release-lock.json; E=/etc/debateai-v3-preview/auth-dev-v1
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
NAMES=/root/preview-archive/$NN-names.sh; SP=/root/preview-archive/$NN-S.txt
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
lc() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/$1" "${@:2}"; }
[ ! -e "$NAMES" ] && [ ! -e "$SP" ] || { echo "SB1_NOT_DONE: $NAMES or $SP exists (look first)"; exit 1; }
printf '%s\n' "$NN" | grep -qxE 'r[0-9]+' && printf '%s\n' "$REV" | grep -qxE '[0-9a-f]{40}' || { echo "SB1_NOT_DONE: NN or REV is not filled in"; exit 1; }
[ -d "$OSTORE/v11" ] || { echo "SB1_NOT_DONE: OSTORE is not a pnpm store"; exit 1; }
[ "$(jq -r '.schema // "none"' "$LOCK")" = preview-lifecycle-release-lock-v2 ] || { echo "SB1_NOT_DONE: the lock is not v2: the transition (T) comes first"; exit 1; }
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "SB1_NOT_DONE: release-check.mjs status refused, or its bad list names a draining runner stopped with open work (above: run its next command, then this step again)"; exit 1; }
jq -r '.releases[] | "\(.label) \(.releaseKey) slot \(.slot) \(.state) units \(.units.api)/\(.units.ui)/\(.units.runner) open work \(.openWork)"' <<<"$ST"
OLABEL=$(jq -r '[.releases[] | select(.state == "CURRENT") | .label] | if length == 1 then .[0] else "" end' <<<"$ST")
[ -n "$OLABEL" ] || { echo "SB1_NOT_DONE: the release table does not name exactly one current release"; exit 1; }
OSLOT=$(jq -r --arg o "$OLABEL" '.releases[] | select(.label == $o) | .slot' <<<"$ST")
case "$OSLOT" in A) SLOT=B; UIP=3200; APIP=3201; OUIP=3100;; B) SLOT=A; UIP=3100; APIP=3101; OUIP=3200;; *) echo "SB1_NOT_DONE: the old release's slot is unread"; exit 1;; esac
OKEY=$(jq -r --arg o "$OLABEL" '.releases[$o].releaseKey' "$LOCK"); OREV=$(jq -r --arg o "$OLABEL" '.releases[$o].services.api.sourceRevision' "$LOCK")
OCAPI=$(jq -r --arg o "$OLABEL" '.releases[$o].services.api.sourceRoot' "$LOCK"); OCUI=$(jq -r --arg o "$OLABEL" '.releases[$o].services.ui.sourceRoot' "$LOCK"); OCRUN=$(jq -r --arg o "$OLABEL" '.releases[$o].services.runner.sourceRoot' "$LOCK")
[ "$OCAPI" = "/opt/debateai-v3-preview/releases/auth-dev-candidate-$OLABEL-api" ] && [ "$OCUI" = "/opt/debateai-v3-preview/releases/auth-dev-candidate-$OLABEL-ui" ] && [ "$OCRUN" = "/opt/debateai-v3-preview/releases/auth-dev-candidate-$OLABEL-runner" ] || { echo "SB1_NOT_DONE: the old release's three folders are not its own"; exit 1; }
OPLANS=$(dirname "$(jq -r --arg o "$OLABEL" '.releases[$o].services.api.basePlan.path' "$LOCK")")
for F in api ui runner; do [ "$(jq -r --arg o "$OLABEL" --arg f "$F" '.releases[$o].services[$f].basePlan.path' "$LOCK")" = "$OPLANS/$F-launch.json" ] || { echo "SB1_NOT_DONE: the old release's $F plan is not in $OPLANS"; exit 1; }; done
ONP=$E/native-plan-$OLABEL.json
[ "$(jq -r .operation "$ONP")" = verify ] && [ "$(jq -r .sourceRevision "$ONP")" = "$OREV" ] && [ "$REV" != "$OREV" ] || { echo "SB1_NOT_DONE: $ONP is not the old release's verify plan, or REV is the old release"; exit 1; }
LABEL=${REV:0:9}-$NN-v1
printf '%s\n' "$LABEL" | grep -qxE '[a-z0-9][a-z0-9-]{0,62}[a-z0-9]' || { echo "SB1_NOT_DONE: $LABEL is not a release label of at most 64 characters"; exit 1; }
REG0=$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1") || { echo "SB1_NOT_DONE: the database is unreadable"; exit 1; }
KEY="r$((REG0 + 1))-${REV:0:12}"
printf '%s\n' "$KEY" | grep -qxE 'r[1-9][0-9]*-[0-9a-f]{12}' || { echo "SB1_NOT_DONE: $KEY is not a release key"; exit 1; }
AU=$(systemctl show -p User --value "debateai-preview-api@$OLABEL")
[ -n "$AU" ] && [ "$AU" != root ] || { echo "SB1_NOT_DONE: the API's user is empty or root"; exit 1; }
AGRP=$(id -gn "$AU")
[ ! -e "/opt/debateai-v3-preview/artifacts/auth-dev-$LABEL" ] && [ ! -e "/opt/debateai-v3-preview/releases/auth-dev-candidate-$LABEL-api" ] || { echo "SB1_NOT_DONE: this release's artifacts folder or folders exist"; exit 1; }
for F in "native-plan-$LABEL.json" "api-$LABEL.env" "ui-$LABEL.env" "runner-$LABEL.env" "database-ahead-$OLABEL.json"; do [ ! -e "$E/$F" ] || { echo "SB1_NOT_DONE: $E/$F exists (look first)"; exit 1; }; done
[ -d "/opt/debateai-v3-preview/artifacts/auth-dev-$OLABEL/source-reference" ] || { echo "SB1_NOT_DONE: the old release's reference clone is missing"; exit 1; }
S=/root/preview-archive/$NN-$(date -u +%Y%m%dT%H%M%SZ)
install -d -o root -g root -m 0700 "$S"
umask 077
printf '%s\n' "$S" > "$SP"
{ printf 'REV=%s\nLABEL=%s\nKEY=%s\nSLOT=%s\nUIP=%s\nAPIP=%s\nOREV=%s\nOLABEL=%s\nOKEY=%s\nOSLOT=%s\nOUIP=%s\nOCAPI=%s\nOCUI=%s\nOCRUN=%s\nOPLANS=%s\nOSTORE=%s\nAU=%s\nAGRP=%s\nS=$(cat %s)\n' "$REV" "$LABEL" "$KEY" "$SLOT" "$UIP" "$APIP" "$OREV" "$OLABEL" "$OKEY" "$OSLOT" "$OUIP" "$OCAPI" "$OCUI" "$OCRUN" "$OPLANS" "$OSTORE" "$AU" "$AGRP" "$SP"
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
NP=$E/native-plan-$LABEL.json
ONP=$E/native-plan-$OLABEL.json
LOCK=/etc/debateai-v3-preview/lifecycle/release-lock.json
C=/etc/debateai-v3-preview/public/Caddyfile
EDGE=/etc/debateai-v3-preview/ui-edge.caddy.secret
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
lc() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/$1" "${@:2}"; }
cslots() { /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin TZ=UTC /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$CAPI/dialectical-engine/deploy/preview-release/v1/caddy-slots.mjs" "$@"; }
cad() { systemd-run --quiet --pipe --wait --collect -p EnvironmentFile=/etc/debateai-v3-preview/public/caddy.env /usr/bin/caddy "$@"; }
readyz() { printf 'X-Debateai-Edge-Secret: %s\n' "$(cat "$EDGE")" | curl -s -m 5 -H @- -w '\n%{http_code}' "http://127.0.0.1:$1/readyz" || true; }
edgekey() { { curl -s -m 15 -o /dev/null -D - http://127.0.0.1:3090/readyz || true; } | tr -d '\r' | awk 'NR == 1 { s = $2 } tolower($1) == "x-debateai-release:" { k = $2 } END { print (s == "" ? "000" : s) " " (k == "" ? "none" : k) }'; }
gs() { /usr/bin/python3 -I "$1/preview_budget_authority.py" status --private "$2"; }
activev() { local o=${OKEY%%-*}; if [ -f "$L/settings-version.mjs" ] && [ -f "$OCAPI/dialectical-engine/tools/settings-version/cli.ts" ]; then lc settings-version.mjs status | sed -n 's/^DEBATEAI_SETTINGS_STATUS //p' | jq -er .effectiveActive; else printf '%s\n' "${o#r}"; fi; }
EOF
} > "$NAMES"
chmod 0600 "$NAMES" "$SP"
. "$NAMES"
umask 077
for SVC in api ui runner; do cp -p "$E/$SVC-$OLABEL.env" "$S/$SVC-$OLABEL.env.before"; chmod 0600 "$S/$SVC-$OLABEL.env.before"; done
cp -p "$LOCK" "$S/release-lock.before.json"
cp -a "$ONP" "$S/native-plan.before.json"
jq -r --arg o "$OLABEL" '.releases[$o].services.api.basePlan.path, .releases[$o].services.ui.basePlan.path, .releases[$o].services.runner.basePlan.path' "$LOCK" > "$S/old-plans.txt"
( cd /etc/systemd/system && tar -czf "$S/systemd-before.tgz" debateai-preview-* debateai-preview.target debateai-preview.target.d ) || { echo "SB1_NOT_DONE: the copy of the systemd files failed (the boot target or its drop-in is missing?): ask"; exit 1; }
psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration" > "$S/ledger-before"
psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1" > "$S/register-before"
activev > "$S/active-before" || { echo "SB1_NOT_DONE: settings-version.mjs status refused (the active settings version is unread): ask"; exit 1; }
grep -qxE '[1-9][0-9]*' "$S/active-before" || { echo "SB1_NOT_DONE: no active settings version read"; exit 1; }
umask 022
cmp -s "$S/native-plan.before.json" "$ONP" && cmp -s "$S/release-lock.before.json" "$LOCK" || { echo "SB1_NOT_DONE: a copy differs from the live file"; exit 1; }
for SVC in api ui runner; do cmp -s "$S/$SVC-$OLABEL.env.before" "$E/$SVC-$OLABEL.env" || { echo "SB1_NOT_DONE: the copy of $SVC-$OLABEL.env differs"; exit 1; }; done
echo "S=$S ART=$ART; new release $LABEL, key $KEY, slot $SLOT; old release $OLABEL ($OKEY, slot $OSLOT); ledger $(cat "$S/ledger-before"), register $(cat "$S/register-before"), active settings $(cat "$S/active-before")"
echo SB1_DONE
```

Then stage the new release with A2, A3 and A4–A7 of "A normal release on a hosted base" (their scripts read this names
file): the bundle since `OREV`, the reference clone, six folders, the store, six manifests, two builds with
`--models all-models --release-key "$KEY"` (`KEY` from this names file), and six `PREVIEW_RELEASE_VERIFIED` lines. One
exception: A5 compares the build values with the shared `ui.env`, which is no longer any live release's file. Run SB1b
instead of A5.

### SB1b. The build values, against the old release's own `ui-<label>.env`

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB1b: A5 on the template layout: the public build values of the all-models list against ui-<OLABEL>.env, by hash only.
[ ! -e "$S/build-env-all-models.json" ] || { echo "SB1B_NOT_DONE: an earlier build-env output exists"; exit 1; }
rel build-env --models all-models --release-key "$KEY" > "$S/build-env-all-models.json"
for K in NODE_ENV PUBLIC_APP_URL NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON TURNSTILE_SITE_KEY; do
  T=$(jq -r --arg k "$K" '.values[$k].sha256' "$S/build-env-all-models.json"); U=$(sed -n "s/^$K=//p" "$E/ui-$OLABEL.env" | tr -d '\n' | sha256sum | cut -d' ' -f1)
  echo "$K tool ${T:0:16} ui-$OLABEL.env ${U:0:16}"; [ "$T" = "$U" ] || { echo "SB1B_NOT_DONE: $K differs from ui-$OLABEL.env"; exit 1; }
done
[ "$(jq -r '.values.RELEASE_KEY.value' "$S/build-env-all-models.json")" = "$KEY" ] || { echo "SB1B_NOT_DONE: build-env did not print this release's key"; exit 1; }
echo SB1B_DONE
```

### SB2. The practice (on the Mac; owner rule: before every upload)

As "The practice" of the hosted-base recipe, on exactly `REV`, with the live register exported from the server, at a
quiet hour (it shares the gates' slots and daily pots with users, and counts toward the cap of 8 debates):

```sh
HB_ON='{"billing":"on","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question en-nuclear --register-next --hosted-billing "$HB_ON" --checker deepseek --deepseek-enabled-on-gate yes --transcript --out "$P/debate-report"
```

The pass bar and the row match are the hosted-base recipe's.

### SB3. The register plan and its proposal, in the new release's own native-plan file

The old release's verify plan (`native-plan-$OLABEL.json`, copied in SB1) is only read: nothing is swapped, so this
step needs no "nothing running" guard.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB3: the plan (billing-on inputs, the live checker) and the native operator's proposal, in the new release's own native-plan file.
LINEUP=''                                                 # the first upload with the line-up row (T+1) only: "$ART/line-up.json"; else empty
REG0=$(cat "$S/register-before"); AV=$(cat "$S/active-before"); OSITE=${OKEY%%-*}; OSITE=${OSITE#r}
[ "$(jq -cS . <<<"$HB_ON")" = '{"askRoomReads":{"capacity":65536,"limit":60,"windowMs":60000},"billing":"on","dailyCeilingMicros":10000000,"perRunCeilingMicros":3000000}' ] || { echo "SB3_NOT_DONE: HB_ON is not the billing-on JSON"; exit 1; }
cmp -s "$S/native-plan.before.json" "$ONP" || { echo "SB3_NOT_DONE: the old release's verify plan moved since SB1"; exit 1; }
[ ! -e "$NP" ] || { echo "SB3_NOT_DONE: $NP exists (look first)"; exit 1; }
[ ! -e "$ART/native-plan-plan.json" ] && [ ! -e "$ART/register-proposal.json" ] || { echo "SB3_NOT_DONE: an earlier plan or proposal exists (look first)"; exit 1; }
# The base is the active settings version (kit v3): the old release's own verify plan while that is its site version,
# else the verify plan SV2 kept for the activated version; the choices a plan does not carry from its base come with it.
if [ "$AV" = "$OSITE" ]; then FROM=$S/native-plan.before.json; CP=$OART/native-plan-publish.json; else FROM=/opt/debateai-v3-preview/artifacts/settings-v$AV/native-plan-verify.json; CP=/opt/debateai-v3-preview/artifacts/settings-v$AV/native-plan-publish.json; fi
[ "$(jq -r .approval.publication.registerVersion "$FROM")" = "$AV" ] && [ "$(jq -r .approval.snapshotSha256 "$CP")" = "$(jq -r .approval.publication.snapshotSha256 "$FROM")" ] || { echo "SB3_NOT_DONE: no kept verify and publish plan names the active settings version $AV ($FROM): ask"; exit 1; }
HB=$(jq -c .hostedBilling "$FROM")
[ "$(jq -cS '{billing,dailyCeilingMicros,askRoomReads}' <<<"$HB")" = "$(jq -cS '{billing,dailyCeilingMicros,askRoomReads}' <<<"$HB_ON")" ] || { echo "SB3_NOT_DONE: the active version's site inputs differ from HB_ON: ask"; exit 1; }
SEATS=$(jq -c '.answerSeats // empty' "$CP"); ROT=$(jq -r '.roleRotation // empty' "$CP"); DS=$(jq -r 'if .answerSeats == null and .checkerChoice.checker == "deepseek" then "yes" else empty end' "$CP")
echo "active settings version $AV; per-debate inputs $(jq -c '{perRunCeilingMicros}' <<<"$HB"); checker $([ -n "$DS" ] && echo deepseek || echo "${SEATS:-glm}"); rotation ${ROT:-on}"
rel native-plan --operation plan --from "$FROM" --source-manifest "$ART/candidate-api-source.json" ${DS:+--checker deepseek --deepseek-enabled-on-gate yes} ${SEATS:+--answer-seats "$SEATS"} ${ROT:+--role-rotation "$ROT"} --hosted-billing "$HB" ${LINEUP:+--line-up "$LINEUP"} --out "$ART/native-plan-plan.json" || { echo "SB3_NOT_DONE: the release tool refused the plan"; exit 1; }
[ "$(jq -r .operation "$ART/native-plan-plan.json")" = plan ] && [ "$(jq -r '.hostedBilling.billing // "none"' "$ART/native-plan-plan.json")" = on ] && [ "$(jq -r .sourceRoot "$ART/native-plan-plan.json")" = "$CAPI" ] || { echo "SB3_NOT_DONE: the plan is not this release's billing-on plan"; exit 1; }
put "$ART/native-plan-plan.json" || { echo "SB3_NOT_DONE: put of the plan failed"; exit 1; }
OUT=$(nat "$ART/register-proposal.json"); echo "nat: $OUT"
[ "$OUT" = "exit 0" ] || { head -c 2000 "$ART/register-proposal.json"; echo; echo "SB3_NOT_DONE: the native operator refused the plan (PREVIEW_REGISTER_BASE_NOT_ACTIVE: settings were activated since SB1: ask)"; exit 1; }
[ "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" = "$AV" ] && cmp -s "$S/native-plan.before.json" "$ONP" || { echo "SB3_NOT_DONE: the proposal is not based on the active settings version $AV, or the old plan moved"; exit 1; }
sha256sum "$ART/native-plan-plan.json" "$ART/register-proposal.json" > "$S/plan-proposal.sha256"
jq -c '{baseRegisterVersion,addedKeys,changedKeys,removedKeys,deltaSha256}' "$ART/register-proposal.json"
echo SB3_DONE
```

**The base is the active settings version (side-by-side spec §13).** SB1 recorded it in `$S/active-before`. While it
is the old release's own site version, the plan starts from the old release's verify plan, as before; after an
activation of another version, from that version's kept plans (`/opt/debateai-v3-preview/artifacts/settings-v<version>/`,
SV2 of "Changing debate settings without an upload"). The hosted inputs, the checker or the answer seats and role
rotation are read from the same plans (a plan does not take them from its base), so the upload's site version keeps
every activated debate setting; their site part must still equal `HB_ON`. `LINEUP` stays empty, except once: the first
upload with the line-up row (T+1) sets it to the file its first step printed ("The first upload with this change
(T+1)" in "Changing debate settings without an upload"); from then on the line-up row comes with the active version.

The owner reads the delta exactly as A9 says; the yes in SB6 names its `deltaSha256`. Gate files: A10's check. A changed
gate file follows spec §9's rule for gate rows: a change that only widens (adds a model, raises a bound) is deployed now,
before SB4, as the gate README says; one that narrows waits until the old release has retired.

### SB4. The release check (read-only)

`release-check.mjs check` gives the verdict: `SIDE_BY_SIDE` (every check passes), `DRAINED_PATH` (a new migration lacks
`-- n1: expand` or `-- n1: keeps-verifier`) or `NOT_READY` (anything else). It checks, by name: `N1_HEADERS`,
`N1_BASELINE` (the new release's own `tests/n1-baseline.json`, read from its checked folder, names the live release's
commit: the N-1 job then ran the live code on the new schema), `CURRENT_PINNED`, `PREVIOUS_RETIRED`, `GATES_ACTIVE`, `GATE_ROWS_N1`, `CONNECTIONS` (320, at least 120 free), `DISK`
(15 GB), `MEMORY` (4 GiB available), `HATCHET`, `NO_MAINTENANCE`, `SLOT_FREE`, `LIFECYCLE_FILES`, `SETTINGS` (the
switch's settings step, read-only: before SB10 pins the new release it only names the active version; SB13's
`--activate` makes the new release's own site version active).

`N1_BASELINE` fails with `set the N-1 baseline first` when the PR of the last upload's N-1 step (TB10 after T, SB13c
after a side-by-side upload) is not in `REV`: merge it into dev, take a `REV` after it, and start again from SB1.

Two checks may need the owner first, and then a second run with their answer filled in at the top:
- `GATE_ROWS_N1` fails with `no snapshot of the switch: review <sha256>` (the first upload after T: T was seeded, never
  switched to) or `changed since the switch: review <sha256>`. The owner checks the gate files (A10's check) and gives
  the printed digest as `GRR`.
- `LIFECYCLE_FILES` fails with `changed: <files>` when the new release changed the shared operator folder
  (`deploy/preview-lifecycle`, `deploy/preview-auth-dev`, `deploy/preview-release`). The owner reviews those files; with
  `LIFE=yes` the check passes (`changed (reviewed)`) and SB10 swaps the folder.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB4: the release check. SIDE_BY_SIDE goes on; DRAINED_PATH and NOT_READY stop here.
GRR=''                                                    # the digest GATE_ROWS_N1 printed, once the owner reviewed those gate files; else empty
LIFE=''                                                   # yes, once the owner reviewed the LIFECYCLE_FILES change; else empty
RC=0; OUT=$(lc release-check.mjs check --label "$LABEL" --older-manifest "$OART/candidate-api-source.json" --newer-manifest "$ART/candidate-api-source.json" ${GRR:+--gate-rows-reviewed "$GRR"} ${LIFE:+--lifecycle-reviewed} 2>&1) || RC=$?
printf '%s\n' "$OUT" > "$S/release-check.json"
jq -r 'if .event == "PREVIEW_RELEASE_CHECK" then ((.checks[] | "\(if .ok then "OK " else "BAD" end) \(.name): \(.detail)"), "verdict \(.verdict)") else tostring end' <<<"$OUT" 2>/dev/null || echo "$OUT"
[ "$RC" != 1 ] || { echo "SB4_NOT_DONE: the release check refused (the line above): ask"; exit 1; }
jq -r '.checks[] | select(.name == "LIFECYCLE_FILES") | .detail' <<<"$OUT" > "$S/lifecycle-files.txt"
case "$(jq -r .verdict <<<"$OUT")" in
  SIDE_BY_SIDE) ;;
  DRAINED_PATH) echo "SB4_NOT_DONE: DRAINED_PATH: a new migration is not n1: expand (named above): use \"Drained upload on the template layout\""; exit 1;;
  *) echo "SB4_NOT_DONE: NOT_READY: a check is BAD (above): stop and ask"; exit 1;;
esac
echo SB4_DONE
```

### SB5. The three env files, and the database-ahead file

`release-env.mjs derive` copies each of the old release's files into `<service>-$LABEL.env`, changing only the values
one release owns (version and key, the new slot's ports, the runner's worker id and name, the API's mail helper). The
SAME checks then hold the two releases to the same gates, scope, mode, workflow and team, and to different keys,
worker ids and ports (`--slots` in the order of `--labels`).

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB5: api-, ui- and runner-<LABEL>.env from the old release's files, the SAME checks of both releases, and (only with new
# migrations) the database-ahead file the old release will be pinned to in SB8.
VK=${KEY#r}; VK=${VK%%-*}
for SVC in api ui runner; do [ ! -e "$E/$SVC-$LABEL.env" ] || { echo "SB5_NOT_DONE: $E/$SVC-$LABEL.env exists (a WRITE_VERIFY_FAILED file stays: move it aside first)"; exit 1; }; done
for SVC in api ui runner; do cmp -s "$S/$SVC-$OLABEL.env.before" "$E/$SVC-$OLABEL.env" || { echo "SB5_NOT_DONE: $SVC-$OLABEL.env moved since SB1"; exit 1; }; done
for SVC in api ui runner; do
  W=$(lc release-env.mjs derive --service "$SVC" --from "$E/$SVC-$OLABEL.env" --label "$LABEL" --slot "$SLOT" --release-key "$KEY" 2>&1) || { echo "$W"; echo "SB5_NOT_DONE: derive refused the $SVC file (reason above)"; exit 1; }
  echo "$W"
  [ "$(jq -r '[.event, .label, .releaseKey] | map(tostring) | join(" ")' <<<"$W")" = "PREVIEW_RELEASE_ENV_WRITTEN $LABEL $KEY" ] || { echo "SB5_NOT_DONE: the $SVC file is not this release's"; exit 1; }
done
for SVC in api runner; do [ "$(grep -c "^REGISTER_VERSION=$VK\$" "$E/$SVC-$LABEL.env")" = 1 ] || { echo "SB5_NOT_DONE: $SVC-$LABEL.env is not on version $VK"; exit 1; }; done
lc release-env.mjs same --labels "$OLABEL,$LABEL" --slots "$OSLOT,$SLOT" || { echo "SB5_NOT_DONE: a SAME check is BAD (above)"; exit 1; }
if [ -s "$S/new-migrations.txt" ]; then
  [ ! -e "$ART/database-ahead-$OLABEL.json" ] || { echo "SB5_NOT_DONE: $ART/database-ahead-$OLABEL.json exists (look first)"; exit 1; }
  rel database-ahead --older-source-manifest "$OART/candidate-api-source.json" --newer-source-manifest "$ART/candidate-api-source.json" --out "$ART/database-ahead-$OLABEL.json" || { echo "SB5_NOT_DONE: the release tool refused the database-ahead file (MIGRATION_NOT_N1_EXPAND names the steps: drained path)"; exit 1; }
  [ "$(jq -r '[.schema, .olderLabel, .newerLabel] | map(tostring) | join(" ")' "$ART/database-ahead-$OLABEL.json")" = "preview-database-ahead-v1 $OLABEL $LABEL" ] || { echo "SB5_NOT_DONE: the database-ahead file is not the old release's, for this one"; exit 1; }
  [ "$(jq -r '.steps[].name' "$ART/database-ahead-$OLABEL.json")" = "$(LC_ALL=C sort "$S/new-migrations.txt")" ] || { echo "SB5_NOT_DONE: the database-ahead file's steps are not this release's new migrations"; exit 1; }
  echo "database-ahead: $(jq -r '.steps | length' "$ART/database-ahead-$OLABEL.json") step(s), chain of $(jq -r '.newerChain | length' "$ART/database-ahead-$OLABEL.json")"
fi
grep -E '^(REGISTER_VERSION|RELEASE_KEY|API_PORT|PORT)=' "$E/api-$LABEL.env" "$E/runner-$LABEL.env" "$E/ui-$LABEL.env"
echo SB5_DONE
```

### SB5b. The payment marks list, in the new release's ui file (only when the list changes)

The website shows the payment marks its setting `PAYMENT_MARKS_AVAILABLE` names: `netopia`, `visa` and `mastercard`,
joined by commas (`deploy/vps/README.md` §14.7; NETOPIA's mark always comes first on the page, whatever the order
here). Each release has its own `ui-<label>.env`, derived from the old release's file in SB5, so once a release's file
holds the line every later release carries it: SB5b runs only when the list changes, the first time in the first upload
whose code has these steps (T+1 at the earliest; "Payment marks: the files and Caddy's rule" below has the order). It
is also needed in the first upload after going back to a release whose ui file has no line: the next upload derives its
file from that one, so without SB5b the marks would vanish at its switch, with no error. A release before T+1 refuses
the name (its website starter lets through only the settings it lists, and stops with `PREVIEW_UI_STARTUP_REFUSED`), so
the line never goes into an older release's file; that matters on the way back too, which starts the old release from
its own file as it is.

PM1 comes first: every listed mark's file must be in `/etc/debateai-v3-preview/public/payment-marks/` (a listed mark
without its file shows a broken image). An empty value is refused by the test site's settings reader (every
`<name>=` line needs a value): to show no marks, leave the line out and skip this step. SB5b runs after SB5 and before
SB10, whose launch plans start the website from this file; it stops once `ui-launch.json` exists. At T+1 `lc` is still
T's installed tools, whose SAME checks do not know the list yet, so the script checks the list's form itself: one to
three of the names, lower-case, no spaces, each once.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB5b: PAYMENT_MARKS_AVAILABLE in the new release's own ui file (only when the list changes; never a release before T+1).
MARKS='<the list PM1 printed, e.g. visa,mastercard>'
PMD=/etc/debateai-v3-preview/public/payment-marks
U=$E/ui-$LABEL.env
printf '%s\n' "$MARKS" | grep -qxE '(netopia|visa|mastercard)(,(netopia|visa|mastercard)){0,2}' || { echo "SB5B_NOT_DONE: MARKS is not one to three of netopia, visa, mastercard joined by commas (lower-case, no spaces; for no marks, skip this step)"; exit 1; }
[ -z "$(tr ',' '\n' <<<"$MARKS" | sort | uniq -d)" ] || { echo "SB5B_NOT_DONE: MARKS names a mark twice"; exit 1; }
for M in ${MARKS//,/ }; do [ -f "$PMD/$M.svg" ] || { echo "SB5B_NOT_DONE: $PMD/$M.svg is missing (PM1 first; nothing changed)"; exit 1; }; done
[ -f "$U" ] && [ "$(stat -c '%a %U' "$U")" = "640 root" ] || { echo "SB5B_NOT_DONE: $U is not root's 0640 file (SB5 first)"; exit 1; }
[ ! -e "$ART/ui-launch.json" ] || { echo "SB5B_NOT_DONE: $ART/ui-launch.json exists: SB10 made the launch plans already (nothing changed): ask"; exit 1; }
grep -q "'PAYMENT_MARKS_AVAILABLE'" "$CUI/dialectical-engine/deploy/preview-auth-dev/v1/environment.mjs" || { echo "SB5B_NOT_DONE: this release's website does not know PAYMENT_MARKS_AVAILABLE (a release before T+1 would refuse to start; nothing changed)"; exit 1; }
[ ! -e "$S/ui-$LABEL.env.before-marks" ] || { echo "SB5B_NOT_DONE: $S/ui-$LABEL.env.before-marks exists: SB5b ran for this release before (look first)"; exit 1; }
cp -p "$U" "$S/ui-$LABEL.env.before-marks"
( umask 077; awk '!/^PAYMENT_MARKS_AVAILABLE=/' "$U" > "$U.new"; printf 'PAYMENT_MARKS_AVAILABLE=%s\n' "$MARKS" >> "$U.new" )
chown --reference="$U" "$U.new"
chmod --reference="$U" "$U.new"
mv "$U.new" "$U"
[ "$(grep -c '^PAYMENT_MARKS_AVAILABLE=' "$U")" = 1 ] && grep -qxF "PAYMENT_MARKS_AVAILABLE=$MARKS" "$U" || { echo "SB5B_NOT_DONE: the line is not in $U exactly once (the file before is $S/ui-$LABEL.env.before-marks): ask"; exit 1; }
diff <(awk '!/^PAYMENT_MARKS_AVAILABLE=/' "$S/ui-$LABEL.env.before-marks") <(awk '!/^PAYMENT_MARKS_AVAILABLE=/' "$U") >/dev/null && [ "$(stat -c '%a %U:%G' "$U")" = "$(stat -c '%a %U:%G' "$S/ui-$LABEL.env.before-marks")" ] || { echo "SB5B_NOT_DONE: another line, the mode or the owner of $U changed (the file before is $S/ui-$LABEL.env.before-marks): ask"; exit 1; }
lc release-env.mjs same --labels "$OLABEL,$LABEL" --slots "$OSLOT,$SLOT" || { echo "SB5B_NOT_DONE: a SAME check is BAD (above; the file before is $S/ui-$LABEL.env.before-marks)"; exit 1; }
echo "ui-$LABEL.env: PAYMENT_MARKS_AVAILABLE=$MARKS"
echo SB5B_DONE
```

### SB6. The owner's fresh yes

Right before SB7, fresh in the live chat; SB7 to SB13 run on it. It names:
- side by side (no downtime, nothing running is stopped but the old website and API after the switch);
- the online backup;
- the migrations by number (or "no migrations");
- the publish of register V with its delta hash;
- the new commit and its release key;
- the switch;
- the Caddy payment-marks rule (PM2), when this upload adds it.

For example: "Yes, upload r21 to the test site side by side: take the online backup, apply migrations 0126 and 0127,
publish register 19 with delta 3c4d…, start `<commit>` as `r19-<12 hex>` in slot B and switch to it."

### SB7. The online backup

Every database of the preview cluster, the roles and the key stores the old release's API and runner files name, each
checked, while everything keeps running. The key stores are live: GNU tar refuses a file that changed while it was read
(`KEYS_FAILED`); then run SB7 again with a new folder name in `OB` (the first folder keeps what it wrote).

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB7: the online backup (pg_dump of every database, pg_dumpall --globals-only, the key stores, sha256 sums). Nothing stops.
OB=$S/online                                              # after KEYS_FAILED: a NEW name, e.g. $S/online-2
[ ! -e "$OB" ] || { echo "SB7_NOT_DONE: $OB exists (after KEYS_FAILED give OB a new name)"; exit 1; }
install -d -o root -g root -m 0700 "$OB"
BK=$(lc backup.mjs --online "$OB" --env "$E/api-$OLABEL.env" --env "$E/runner-$OLABEL.env" 2>&1) || { echo "$BK"; echo "SB7_NOT_DONE: the online backup failed (KEYS_FAILED: run SB7 again with a new OB)"; exit 1; }
jq -c '{event, databases, keys, files: [.files[] | {name, bytes}]}' <<<"$BK"
[ "$(jq -r .event <<<"$BK")" = PREVIEW_ONLINE_BACKUP_OK ] || { echo "SB7_NOT_DONE: the backup did not report OK"; exit 1; }
( cd "$OB" && sha256sum -c --quiet online.sha256 ) || { echo "SB7_NOT_DONE: the backup's files do not match its sums"; exit 1; }
if [ "$(jq -r '.databases | index("hatchet") != null' <<<"$BK")" = true ]; then echo "Hatchet's database is in the backup"; else echo "Hatchet's database is NOT in the backup (TA0 said where it lives)"; fi
printf '%s\n' "$OB" > "$S/online-backup-folder"
echo SB7_DONE
```

### SB8. The database-ahead pin, then the migrations

The old release keeps serving throughout. First its database-ahead file is installed and pinned on it (so any restart
of the old release from now on verifies in database-ahead mode), then `apply-and-plan` runs through the new release's own
native-plan file. A release without new migrations skips this step (`SB8_SKIPPED`). The ledger must then be the old one
plus exactly the database-ahead file's steps it did not hold yet: after an upload that applied a step and was rolled
back, a fix release that keeps that step adds only its own new ones (the kept step is already in the ledger).

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB8: pin the database-ahead file on the old release, then apply this release's migrations while the old one serves.
LEDGER0=$(cat "$S/ledger-before"); REG0=$(cat "$S/register-before")
OB=$(cat "$S/online-backup-folder")
( cd "$OB" && sha256sum -c --quiet online.sha256 ) || { echo "SB8_NOT_DONE: no checked online backup (SB7 first)"; exit 1; }
[ -s "$S/new-migrations.txt" ] || { echo "SB8_SKIPPED: this release adds no migration"; exit 0; }
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "SB8_NOT_DONE: release-check.mjs status refused, or its bad list names a draining runner stopped with open work (run its next command, then this step again)"; exit 1; }
[ "$(jq -r --arg o "$OLABEL" '.releases[] | select(.label == $o) | "\(.state) \(.units.api) \(.units.ui)"' <<<"$ST")" = "CURRENT active active" ] || { echo "SB8_NOT_DONE: the old release is not current with its API and website up"; exit 1; }
cmp -s "$S/native-plan.before.json" "$ONP" && cmp -s "$ART/native-plan-plan.json" "$NP" || { echo "SB8_NOT_DONE: the old verify plan moved, or this release's native-plan file is not SB3's plan"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "SB8_NOT_DONE: the ledger or the register moved since SB1"; exit 1; }
[ -s "$ART/database-ahead-$OLABEL.json" ] && [ ! -e "$E/database-ahead-$OLABEL.json" ] || { echo "SB8_NOT_DONE: the database-ahead file is missing (SB5), or already installed (look first)"; exit 1; }
[ ! -e "$ART/native-plan-apply-and-plan.json" ] && [ ! -e "$ART/native-apply-and-plan.json" ] || { echo "SB8_NOT_DONE: earlier apply-and-plan files exist (look first)"; exit 1; }
install -o root -g root -m 0644 "$ART/database-ahead-$OLABEL.json" "$E/database-ahead-$OLABEL.json"
cmp -s "$ART/database-ahead-$OLABEL.json" "$E/database-ahead-$OLABEL.json" || { echo "SB8_NOT_DONE: the installed database-ahead file differs"; exit 1; }
DA=$E/database-ahead-$OLABEL.json; NM=$ART/candidate-api-source.json
[ "$(jq -r '[.olderLabel, .olderSourceRevision, .newerLabel, .newerSourceRevision, .newerSourceManifest.path] | map(tostring) | join(" ")' "$DA")" = "$OLABEL $OREV $LABEL $REV $NM" ] || { echo "SB8_NOT_DONE: the database-ahead file does not name the old release at OREV and this release's manifest at REV (nothing applied)"; exit 1; }
[ "$(jq -r .newerSourceManifest.sha256 "$DA")" = "$(sha256sum "$NM" | cut -d' ' -f1)" ] && [ "$(stat -c '%U %a %h' "$NM")" = "root 644 1" ] || { echo "SB8_NOT_DONE: this release's manifest is not the root-owned 0644 file with the sha256 the database-ahead file names (accept-ahead would refuse; nothing applied)"; exit 1; }
[ "$(jq -r '[.role, .sourceRoot, .sourceRevision, .uid] | map(tostring) | join(" ")' "$NM")" = "api $CAPI $REV 0" ] || { echo "SB8_NOT_DONE: the manifest is not this release's root-owned API manifest at REV (nothing applied)"; exit 1; }
for M in $(jq -r '.steps[] | "\(.name)=\(.sha256)"' "$DA"); do [ "$(jq -r --arg p "dialectical-engine/migrations/${M%%=*}" '[.files[] | select(.path == $p) | .sha256] | join(" ")' "$NM")" = "${M#*=}" ] || { echo "SB8_NOT_DONE: the manifest does not list ${M%%=*} with the bytes the database-ahead file names (nothing applied)"; exit 1; }; done
AH=$(pre accept-ahead --label "$OLABEL" --from "$E/database-ahead-$OLABEL.json" 2>&1) || { echo "$AH"; echo "SB8_NOT_DONE: the pin was refused (nothing applied)"; exit 1; }
echo "$AH"
[ "$(jq -r '[.event, .label, .newerLabel] | map(tostring) | join(" ")' <<<"$AH")" = "PREVIEW_LIFECYCLE_DATABASE_AHEAD_PINNED $OLABEL $LABEL" ] && [ "$(jq -r --arg o "$OLABEL" '.releases[$o].databaseAhead.newerLabel' "$LOCK")" = "$LABEL" ] || { echo "SB8_NOT_DONE: the lock does not pin the database-ahead file on the old release (nothing applied)"; exit 1; }
# The steps the ledger must gain: the database-ahead file's steps it does not hold yet. A step an aborted earlier upload
# already applied, and this fix release keeps, is in the ledger and in the file alike (final fix wave A1).
NEWSTEPS=$(for M in $(jq -r '.steps[].name' "$DA"); do [ "$(psqlq "SELECT count(*) FROM public.debateai_schema_migration WHERE name = '$M'")" = 1 ] || echo "$M"; done)
echo "steps the ledger gains: $(printf '%s ' $NEWSTEPS)"
rel native-plan --operation apply-and-plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-apply-and-plan.json" || { echo "SB8_NOT_DONE: the release tool refused the plan (nothing applied)"; exit 1; }
[ "$(jq -r .operation "$ART/native-plan-apply-and-plan.json")" = apply-and-plan ] && [ "$(jq -r .sourceRevision "$ART/native-plan-apply-and-plan.json")" = "$REV" ] && [ "$(jq -r '.hostedBilling.billing // "none"' "$ART/native-plan-apply-and-plan.json")" = on ] || { echo "SB8_NOT_DONE: the plan is not this release's billing-on apply-and-plan (nothing applied)"; exit 1; }
put "$ART/native-plan-apply-and-plan.json" || { echo "SB8_NOT_DONE: put failed (nothing applied)"; exit 1; }
OUT=$(nat "$ART/native-apply-and-plan.json"); echo "nat: $OUT"
LEDGER=$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration"); echo "ledger $LEDGER"
[ "$OUT" = "exit 0" ] || { head -c 1200 "$ART/native-apply-and-plan.json"; echo; echo "SB8_NOT_DONE: the native operator refused (the old release still serves; ask)"; exit 1; }
for M in $(cat "$S/new-migrations.txt"); do [ "$(psqlq "SELECT count(*) FROM public.debateai_schema_migration WHERE name = '$M'")" = 1 ] || { echo "SB8_NOT_DONE: $M is not in the ledger"; exit 1; }; done
TOP=$( { printf '%s\n' "${LEDGER0#*|}"; jq -r '.steps[].name' "$DA"; } | LC_ALL=C sort | tail -n 1)
[ "$LEDGER" = "$(( ${LEDGER0%%|*} + $(printf '%s\n' "$NEWSTEPS" | grep -c . || true) ))|$TOP" ] || { echo "SB8_NOT_DONE: the ledger is not the old one plus exactly the database-ahead file's steps it did not hold yet"; exit 1; }
[ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] && cmp -s "$S/native-plan.before.json" "$ONP" || { echo "SB8_NOT_DONE: the newest register or the old verify plan moved"; exit 1; }
[ "$(edgekey)" = "200 $OKEY" ] || { echo "SB8_NOT_DONE: the site does not answer from the old release any more: ask"; exit 1; }
echo SB8_DONE
```

### SB9. Publish

The running releases ignore the new version: each reads its own at its start. The version must be the one the new
release's key names.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB9: publish SB3's plan with the owner's yes. The old release keeps serving on its own version.
YES='<the deltaSha256 the owner approved, in full>'
REG0=$(cat "$S/register-before"); AV=$(cat "$S/active-before"); VNEXT=$((REG0 + 1)); VK=${KEY#r}; VK=${VK%%-*}
[ "$VK" = "$VNEXT" ] || { echo "SB9_NOT_DONE: $KEY does not name version $VNEXT"; exit 1; }
[ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "SB9_NOT_DONE: the newest register is not $REG0"; exit 1; }
for M in $(cat "$S/new-migrations.txt"); do [ "$(psqlq "SELECT count(*) FROM public.debateai_schema_migration WHERE name = '$M'")" = 1 ] || { echo "SB9_NOT_DONE: $M is not applied (SB8 first)"; exit 1; }; done
sha256sum -c --quiet "$S/plan-proposal.sha256" || { echo "SB9_NOT_DONE: the plan or the proposal changed since SB3"; exit 1; }
[ "$(jq -r .deltaSha256 "$ART/register-proposal.json")" = "$YES" ] && [ "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" = "$AV" ] || { echo "SB9_NOT_DONE: the proposal is not the approved one, or not based on the active settings version $AV"; exit 1; }
[ ! -e "$ART/native-plan-publish.json" ] && [ ! -e "$ART/register-published.json" ] || { echo "SB9_NOT_DONE: an earlier publish file exists (look first)"; exit 1; }
rel native-plan --operation publish --from "$ART/native-plan-plan.json" --proposal "$ART/register-proposal.json" --approved-delta-sha256 "$YES" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-publish.json" || { echo "SB9_NOT_DONE: the release tool refused the publish plan (nothing published)"; exit 1; }
put "$ART/native-plan-publish.json" || { echo "SB9_NOT_DONE: put of the publish plan failed (nothing published)"; exit 1; }
OUT=$(nat "$ART/register-published.json"); echo "nat: $OUT"
[ "$OUT" = "exit 0" ] || { head -c 800 "$ART/register-published.json"; echo; echo "SB9_NOT_DONE: the publish was refused (PREVIEW_REGISTER_BASE_NOT_ACTIVE: settings were activated since SB3; PREVIEW_REGISTER_BASE_NOT_CURRENT: no release yet; each needs a new plan and a new yes)"; exit 1; }
V=$(jq -r .publication.registerVersion "$ART/register-published.json"); echo "new REGISTER_VERSION=$V"
[ "$V" = "$VK" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$V" ] || { echo "SB9_NOT_DONE: the published version is not the one $KEY names"; exit 1; }
printf '%s\n' "$V" > "$S/new-register-version"
echo "PUBLISHED_$V"
cmp -s "$S/native-plan.before.json" "$ONP" || { echo "SB9_NOT_DONE: the old verify plan moved"; exit 1; }
echo SB9_DONE
```

### SB10. Verify plan, first proof, launch plans, pins, instance drop-ins, stage

The three launch plans take the new slot. Each pin adds the new release's entry and leaves the old release's entry
byte for byte (no re-pin, so no new `pinnedAt`). `release-switch.mjs stage` records the new release STAGED: prestart
starts nothing of it before that. When SB4's `LIFECYCLE_FILES` said `changed (reviewed)`, the shared operator folder is
swapped first, so the pins, drop-ins and the stage are written by the tools the new release was reviewed with (the old
release uses them too from then on; its folder moves to `$S/operator-lifecycle-v1.before`). When the new release's ui
file names payment marks, SB10 first checks that Caddy serves them (PM2 ran), and stops otherwise with nothing changed.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB10: the verify plan and first proof, three launch plans for the new slot, the operator folder swap (only when reviewed),
# three pins (added beside the old release), the instance drop-ins, reload, the unit checks, stage. Nothing starts.
UD=/etc/systemd/system; OP=/opt/debateai-v3-preview/operator/lifecycle-v1; NEWOP=/opt/debateai-v3-preview/operator/lifecycle-v1.$LABEL
V=$(cat "$S/new-register-version")
cmp -s "$ART/native-plan-publish.json" "$NP" && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$V" ] || { echo "SB10_NOT_DONE: SB9 is not done"; exit 1; }
for F in native-plan-verify.json native-first-verify.json api-launch.json ui-launch.json runner-launch.json; do [ ! -e "$ART/$F" ] || { echo "SB10_NOT_DONE: $F exists (look first)"; exit 1; }; done
if grep -q '^PAYMENT_MARKS_AVAILABLE=' "$E/ui-$LABEL.env"; then grep -qF '@paymentMarks path /payment-marks/netopia.svg /payment-marks/visa.svg /payment-marks/mastercard.svg' "$C" || { echo "SB10_NOT_DONE: ui-$LABEL.env names payment marks but Caddy does not serve them (PM2 first, or put $S/ui-$LABEL.env.before-marks back); nothing changed"; exit 1; }; fi
OLDA=$(sed -n 1p "$S/old-plans.txt"); OLDU=$(sed -n 2p "$S/old-plans.txt"); OLDR=$(sed -n 3p "$S/old-plans.txt")
[ "$OLDA" = "$(jq -r --arg o "$OLABEL" '.releases[$o].services.api.basePlan.path' "$LOCK")" ] && [ "$OLDU" = "$(jq -r --arg o "$OLABEL" '.releases[$o].services.ui.basePlan.path' "$LOCK")" ] && [ "$OLDR" = "$(jq -r --arg o "$OLABEL" '.releases[$o].services.runner.basePlan.path' "$LOCK")" ] || { echo "SB10_NOT_DONE: old-plans.txt is not the old release's three plans"; exit 1; }
rel native-plan --operation verify --from "$ART/native-plan-publish.json" --publication "$ART/register-published.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-verify.json" || { echo "SB10_NOT_DONE: the release tool refused the verify plan"; exit 1; }
put "$ART/native-plan-verify.json" || { echo "SB10_NOT_DONE: put of the verify plan failed"; exit 1; }
OUT=$(nat "$ART/native-first-verify.json"); echo "nat: $OUT"
[ "$OUT" = "exit 0" ] && [ "$(jq -r .publication.registerVersion "$ART/native-first-verify.json")" = "$V" ] || { echo "SB10_NOT_DONE: the first proof was refused or does not name $V"; exit 1; }
rel launch-plan --service api --slot "$SLOT" --from "$OLDA" --root "$CAPI" --source-manifest "$ART/candidate-api-source.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/api-launch.json" || { echo "SB10_NOT_DONE: the API launch plan was refused"; exit 1; }
rel launch-plan --service ui --slot "$SLOT" --from "$OLDU" --root "$CUI" --source-manifest "$ART/candidate-ui-source.json" --ui-build "$ART/candidate-ui-build.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/ui-launch.json" || { echo "SB10_NOT_DONE: the website launch plan was refused"; exit 1; }
rel launch-plan --service runner --slot "$SLOT" --from "$OLDR" --root "$CRUN" --source-manifest "$ART/candidate-runner-source.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/runner-launch.json" || { echo "SB10_NOT_DONE: the runner launch plan was refused"; exit 1; }
for SVC in api ui runner; do [ "$(jq -r '[.publication.registerVersion, .uiPort, .apiPort, .environment.path] | map(tostring) | join(" ")' "$ART/$SVC-launch.json")" = "$V $UIP $APIP $E/$SVC-$LABEL.env" ] || { echo "SB10_NOT_DONE: the $SVC launch plan is not version $V, slot $SLOT, $SVC-$LABEL.env"; exit 1; }; done
MX=$(jq -r '.. | objects | select(has("mailExecutable")) | .mailExecutable' "$ART/api-launch.json" | head -n 1)
[ "$MX" = "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs" ] && [ "$(grep -c "^MAIL_SENDMAIL_PATH=$MX\$" "$E/api-$LABEL.env")" = 1 ] || { echo "SB10_NOT_DONE: the API plan's mail program is not this release's, or api-$LABEL.env names another"; exit 1; }
if grep -q '^changed' "$S/lifecycle-files.txt"; then
  [ ! -e "$S/operator-lifecycle-v1.before" ] && [ ! -e "$NEWOP" ] || { echo "SB10_NOT_DONE: an earlier operator folder swap exists (look first)"; exit 1; }
  install -d -o root -g root -m 0755 "$NEWOP"
  git -C "$ART/source-reference" archive --format=tar "$REV" dialectical-engine/deploy/preview-lifecycle dialectical-engine/deploy/preview-auth-dev dialectical-engine/deploy/preview-release | tar -x -C "$NEWOP" --no-same-owner
  chown -R root:root "$NEWOP"; find "$NEWOP" -type d -exec chmod 0755 {} +; find "$NEWOP" -type f -exec chmod 0644 {} +
  for D in preview-lifecycle preview-auth-dev preview-release; do diff -r "$NEWOP/dialectical-engine/deploy/$D" "$CAPI/dialectical-engine/deploy/$D" >/dev/null || { echo "SB10_NOT_DONE: the new operator folder's $D differs from this release's checked API folder ($NEWOP stays for a look)"; exit 1; }; done
  mv "$OP" "$S/operator-lifecycle-v1.before"
  mv "$NEWOP" "$OP"
  echo "OPERATOR_FOLDER_SWAPPED (the old one is $S/operator-lifecycle-v1.before)"
fi
OLDENTRY=$(jq -cS --arg o "$OLABEL" '.releases[$o]' "$LOCK")
for SVC in api ui runner; do
  PLAN=$ART/$SVC-launch.json
  PIN=$(pre pin --from "$PLAN" 2>&1) || { echo "$PIN"; echo "SB10_NOT_DONE: the pin of $SVC was refused (way back: WB1 is not needed yet; ask)"; exit 1; }
  echo "$PIN"
  [ "$(jq -r '[.event, .label, .slot, .releaseKey, .sourceRevision, .registerVersion] | map(tostring) | join(" ")' <<<"$PIN")" = "PREVIEW_LIFECYCLE_RELEASE_PINNED $LABEL $SLOT $KEY $REV $V" ] || { echo "SB10_NOT_DONE: the $SVC pin is not this release on slot $SLOT with $KEY"; exit 1; }
done
[ "$(jq -cS --arg o "$OLABEL" '.releases[$o]' "$LOCK")" = "$OLDENTRY" ] || { echo "SB10_NOT_DONE: a pin changed the old release's lock entry: ask"; exit 1; }
[ "$(jq -r --arg l "$LABEL" '[.releases[$l].releaseKey, .releases[$l].slot, (.releases[$l].services | keys | join(","))] | map(tostring) | join(" ")' "$LOCK")" = "$KEY $SLOT api,runner,ui" ] || { echo "SB10_NOT_DONE: the lock does not pin this release's three services"; exit 1; }
for SVC in api ui runner; do
  DD=$UD/debateai-preview-$SVC@$LABEL.service.d
  install -d -o root -g root -m 0755 "$DD"
  pre dropin --service "$SVC" --label "$LABEL" > "$DD/zzzzzzzzzz-lifecycle-release.conf.new" || { echo "SB10_NOT_DONE: the $SVC drop-in was refused"; exit 1; }
  chmod 0644 "$DD/zzzzzzzzzz-lifecycle-release.conf.new"; mv "$DD/zzzzzzzzzz-lifecycle-release.conf.new" "$DD/zzzzzzzzzz-lifecycle-release.conf"
  [ "$(grep -c -- "--label $LABEL" "$DD/zzzzzzzzzz-lifecycle-release.conf")" -ge 1 ] || { echo "SB10_NOT_DONE: the $SVC drop-in does not name this release"; exit 1; }
done
systemctl daemon-reload
for SVC in api ui runner; do systemd-analyze verify "$UD/debateai-preview-$SVC@$LABEL.service" > "$S/verify-$SVC.txt" 2>&1 || { cut -c1-300 "$S/verify-$SVC.txt"; echo "SB10_NOT_DONE: systemd-analyze verify found an error in the $SVC instance (above)"; exit 1; }; done
SG=$(lc release-switch.mjs stage --label "$LABEL" 2>&1) || { echo "$SG"; echo "SB10_NOT_DONE: the stage was refused (reason above)"; exit 1; }
echo "$SG"
[ "$(jq -r '[.event, .label, .releaseKey] | map(tostring) | join(" ")' <<<"$SG")" = "PREVIEW_RELEASE_STAGED $LABEL $KEY" ] || { echo "SB10_NOT_DONE: the release table does not name this release STAGED"; exit 1; }
cmp -s "$ART/native-plan-verify.json" "$NP" && cmp -s "$S/native-plan.before.json" "$ONP" || { echo "SB10_NOT_DONE: a native-plan file moved"; exit 1; }
echo SB10_DONE
```

### SB11. The new runner

It starts beside the old runner. Its start line must name the new key, and it re-sends nothing (no work carries its
key yet). The old release's work stays the old runner's (fences).

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB11: start the new release's runner by hand. Refuses on any start-up, register, engine, capacity or login refusal line.
V=$(cat "$S/new-register-version"); RU=debateai-preview-runner@$LABEL
case "$(systemctl is-active "$RU" || true)" in inactive|failed) ;; *) echo "SB11_NOT_DONE: the new runner is already running"; exit 1;; esac
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "SB11_NOT_DONE: release-check.mjs status refused, or its bad list names a draining runner stopped with open work (run its next command, then this step again)"; exit 1; }
[ "$(jq -r --arg l "$LABEL" '.releases[] | select(.label == $l) | .state' <<<"$ST")" = STAGED ] && [ "$(jq -r --arg o "$OLABEL" '.releases[] | select(.label == $o) | .state' <<<"$ST")" = CURRENT ] || { echo "SB11_NOT_DONE: this release is not STAGED, or the old one is not CURRENT"; exit 1; }
[ "$(grep -c "^REGISTER_VERSION=$V\$" "$E/runner-$LABEL.env")" = 1 ] && [ "$(grep -c "^RELEASE_KEY=$KEY\$" "$E/runner-$LABEL.env")" = 1 ] || { echo "SB11_NOT_DONE: runner-$LABEL.env is not this release's on $V"; exit 1; }
[ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "SB11_NOT_DONE: a spending gate is not active; the runner is not started"; exit 1; }
T0=$(date +%s)
systemctl start "$RU" || echo "systemctl start of the new runner returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u "$RU" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
STL=$(journalctl -u "$RU" --since "@$T0" -o cat --no-pager | grep '^PREVIEW_RUNNER_STARTED ' | grep "\"releaseKey\":\"$KEY\"" | head -n 1 || true)
[ -n "$STL" ] || { echo "SB11_NOT_DONE: no PREVIEW_RUNNER_STARTED naming $KEY"; exit 1; }
grep -q '"startupDispatched":0[,}]' <<<"$STL" || { echo "SB11_NOT_DONE: the new runner re-sent work at its start (startupDispatched is not 0): ask"; exit 1; }
sleep 20
BADL=$(journalctl -u "$RU" --since "@$T0" -o cat --no-pager | grep -E 'GATE_CAPACITY_UNREAD|UNAUTHENTICATED|STARTUP_REFUSED|PRESTART_REFUSED|STOPPED_ON_FAILURE|_MISMATCH|_UNSEALED|ENGINE_REQUIRES|ENGINE_[A-Z_]*REFUSED|REGISTER_[A-Z_]*REFUSED' || true)
[ -z "$BADL" ] || { echo "$BADL" | cut -c1-300; echo "SB11_NOT_DONE: a refusal, capacity or login line in the new runner's journal (above)"; exit 1; }
[ "$(systemctl is-active "$RU" || true)" = active ] && [ "$(systemctl show -p NRestarts --value "$RU")" = 0 ] || { echo "SB11_NOT_DONE: the new runner is not active with NRestarts 0 after 20 s"; exit 1; }
echo SB11_DONE
```

### SB12. The new API and website, in the spare slot

Both start and stay not-ready: the new website's own `/readyz` (asked directly, with the edge secret) answers 503 with
the new key and only `NOT_CURRENT`, and the site keeps answering from the old release.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB12: start the new API (its start line naming REV and KEY), then the new website; both stay not-ready until the switch.
[ "$(systemctl is-active "debateai-preview-runner@$LABEL" || true)" = active ] || { echo "SB12_NOT_DONE: the new runner is not active (SB11 first)"; exit 1; }
for SVC in api ui; do case "$(systemctl is-active "debateai-preview-$SVC@$LABEL" || true)" in inactive|failed) ;; *) echo "SB12_NOT_DONE: the new $SVC already runs"; exit 1;; esac; done
[ "$(edgekey)" = "200 $OKEY" ] || { echo "SB12_NOT_DONE: the site does not answer from the old release"; exit 1; }
T0=$(date +%s)
systemctl start "debateai-preview-api@$LABEL" || echo "systemctl start of the new API returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u "debateai-preview-api@$LABEL" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; [ "$(systemctl is-active "debateai-preview-api@$LABEL" || true)" = failed ] && break; sleep 3; done
[ "$(journalctl -u "debateai-preview-api@$LABEL" --since "@$T0" -o cat --no-pager | grep 'PREVIEW_API_STARTED' | grep "\"sourceRevision\":\"$REV\"" | grep -c "\"releaseKey\":\"$KEY\"" || true)" -ge 1 ] && [ "$(systemctl is-active "debateai-preview-api@$LABEL" || true)" = active ] || { journalctl -u "debateai-preview-api@$LABEL" --since "@$T0" -o cat --no-pager | grep -E 'PRESTART_REFUSED|STARTUP_REFUSED' | cut -c1-300 || true; echo "SB12_NOT_DONE: the new API did not start on REV with $KEY (WB1 takes it away)"; exit 1; }
systemctl start "debateai-preview-ui@$LABEL" || echo "systemctl start of the new website returned non-zero"
RC=000; RB=''; for i in $(seq 1 60); do RZ=$(readyz "$UIP"); RC=${RZ##*$'\n'}; RB=${RZ%$'\n'*}; [ "$RC" = 503 ] && [ "$(jq -c '[.releaseKey, .reasons]' <<<"$RB" 2>/dev/null)" = "[\"$KEY\",[\"NOT_CURRENT\"]]" ] && break; sleep 2; done
echo "new website /readyz on $UIP: $RC $(jq -c '{releaseKey, reasons}' <<<"$RB" 2>/dev/null || echo '(no JSON)')"
[ "$RC" = 503 ] && [ "$(jq -c '[.releaseKey, .reasons]' <<<"$RB" 2>/dev/null)" = "[\"$KEY\",[\"NOT_CURRENT\"]]" ] || { echo "SB12_NOT_DONE: the new website is not up and waiting with only NOT_CURRENT (WB1 takes it away)"; exit 1; }
[ "$(edgekey)" = "200 $OKEY" ] || { echo "SB12_NOT_DONE: the site no longer answers from the old release: ask"; exit 1; }
echo SB12_DONE
```

### SB13. The switch

`release-switch.mjs switch` checks everything first (the new release STAGED with its three units up, its runner's start
line on its key with nothing re-sent, its website waiting, the edge on the old key, both gates active, no maintenance
flag). Then one database write makes the new release current (take traffic from the database clock + 8 s: the old API's
5 s stale read bound, one 2 s health interval and 1 s more), the edge must show the new key three times in a row, one more
health interval passes, and only then the old website and API stop. While the edge does not show the new key yet, the new
website's own `/readyz` is read too: a reason that waiting cannot clear (anything but `BOOTING`, `NOT_CURRENT` or
`BEFORE_TAKE_TRAFFIC_FROM`) switches back at once, `SWITCH_REVERTED` with reason `WEBSITE_NOT_READY` and the website's
reasons, instead of after the whole 30 seconds.
It arms the old release's backstop (switch + 27,000 s, an absolute UTC time) and points the boot target at the new pair.
The old runner is never stopped: it finishes its debates and retires by itself.

**The settings step (side-by-side spec §13).** The same database write passes the settings pointer the tool saw and
activates `--activate <v>` in the same transaction. A new release has passed only its own site version (until a
`settings-version.mjs check` passes another one with it), and from the first T+1 switch on there is always an active
version, so without `--activate` the switch would refuse `SETTINGS_VERSION_NOT_PASSED` (naming what the new release
passed) before anything is written. The script names `ACT`, the new release's own site version (the number in `KEY`):
the upload's own version becomes active with the switch. The first T+1 switch, with nothing ever activated, would
activate it even without the argument (owner answer Q-S2). Set `ACT` to another version only on the owner's word, after
`settings-version.mjs check "$LABEL" <version>` passed it (SB10 must have pinned the new release first). Whenever the
version the switch activates differs from the active one (the upload's own site version too: SB3's `LINEUP` can give it
a new line-up), the switch first runs the live gate check of an activation (both gates must answer; ruling R80).
Before the switch, the script reads the active version again: it must still be the one SB3 planned from
(`$S/active-before`, the proposal's base), else it stops with nothing changed, since activating `ACT` would undo the
activation made meanwhile. It hands that version to the switch as `--expect-active "$AVN"`: an activation landing after
this read still refuses the switch (`SETTINGS_ACTIVE_VERSION_MOVED`) before anything is written. "Changing debate
settings without an upload" has the whole settings flow.

What a visitor sees during the switch is watched by the operator, with the owner's own password, from the Mac. Before
SB13, in a second terminal, the owner puts the site's user and password in a private netrc file with an editor (one
line `machine v3-preview.dezbatere.ro login <user> password <password>`; never on a command line):

```sh
NRC="$HOME/.config/debateai-preview.netrc"; install -d -m 0700 "$(dirname "$NRC")"; [ -e "$NRC" ] || install -m 0600 /dev/null "$NRC"; ${EDITOR:-nano} "$NRC"
```

then starts this loop, which prints nothing while every answer is 200, and stops it with Ctrl-C after SB13:

```sh
NRC="$HOME/.config/debateai-preview.netrc"; echo "watching /login from $(date -u +%H:%M:%S)"; while :; do c=$(curl -s --netrc-file "$NRC" -o /dev/null -m 15 -w '%{http_code}' https://v3-preview.dezbatere.ro/login || true); [ "$c" = 200 ] || echo "$(date -u +%H:%M:%S) $c"; sleep 0.5; done
```

Any line it printed during the switch is an error a visitor saw: tell the owner.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB13: the switch. Exit 0 = done with nothing bad; 2 = done, but a check after the write failed (read bad); 1 = refused.
[ ! -e /etc/debateai-v3-preview/lifecycle/maintenance-pending ] || { echo "SB13_NOT_DONE: infrastructure maintenance is pending (nothing changed)"; exit 1; }
AVN=$(activev) || { echo "SB13_NOT_DONE: settings-version.mjs status refused (nothing changed): ask"; exit 1; }
[ "$AVN" = "$(cat "$S/active-before")" ] && [ "$AVN" = "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" ] || { echo "SB13_NOT_DONE: settings were activated since SB3 (active $AVN; nothing changed): ask"; exit 1; }
ACT=${KEY%%-*}; ACT=${ACT#r}                              # the settings version the switch activates: this release's own site version
SC=0; SW=$(lc release-switch.mjs switch --to "$LABEL" --from "$OLABEL" --activate "$ACT" --expect-active "$AVN" 2>&1) || SC=$?
echo "$SW"
printf '%s\n' "$SW" > "$S/switch.json"
case "$SC" in
  0) ;;
  2) echo "SB13_NOT_DONE: the switch is done, but a check after it failed: read bad above (BACKSTOP or TARGET: WB4's switch --finish)"; exit 1;;
  *) echo "SB13_NOT_DONE: the switch refused or reverted (reason above): read \"The way back, side by side\""; exit 1;;
esac
[ "$(jq -r '[.event, .toKey, .fromKey, (.bad | length), .edgeFailures] | map(tostring) | join(" ")' <<<"$SW")" = "PREVIEW_RELEASE_SWITCHED $KEY $OKEY 0 0" ] || { echo "SB13_NOT_DONE: the switch line is not this switch with nothing bad"; exit 1; }
echo "backstop for $OLABEL at $(jq -r .backstopAt <<<"$SW")"
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "SB13_NOT_DONE: release-check.mjs status refused, or its bad list names a draining runner stopped with open work (run its next command, then this step again)"; exit 1; }
jq -r '.releases[] | "\(.label) \(.state) units \(.units.api)/\(.units.ui)/\(.units.runner) open work \(.openWork)"' <<<"$ST"
[ "$(jq -r --arg l "$LABEL" '.releases[] | select(.label == $l) | .state' <<<"$ST")" = CURRENT ] || { echo "SB13_NOT_DONE: the release table does not name this release current"; exit 1; }
case "$(jq -r --arg o "$OLABEL" '.releases[] | select(.label == $o) | "\(.state) \(.units.api) \(.units.ui)"' <<<"$ST")" in "DRAINING inactive inactive"|"RETIRED inactive inactive") ;; *) echo "SB13_NOT_DONE: the old release is not draining with its pair stopped"; exit 1;; esac
[ "$(edgekey)" = "200 $KEY" ] || { echo "SB13_NOT_DONE: the edge does not answer from this release"; exit 1; }
grep -qxF "Wants=debateai-preview-api@$LABEL.service debateai-preview-ui@$LABEL.service" /etc/systemd/system/debateai-preview.target.d/60-current-release.conf || { echo "SB13_NOT_DONE: the boot target does not name this release's pair"; exit 1; }
echo SB13_DONE
```

Then a team member starts one short test debate on the site, and SB13b checks that it runs on the new release.

### SB13b. The team member's test debate runs on the new release

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB13b: read-only. The newest debate is stamped with the new key and its work is claimed or done (only runner@LABEL can).
NEWEST=$(psqlq "SELECT r.release_key||'|'||coalesce((SELECT w.state FROM core.work_item w WHERE w.run_id = r.run_id ORDER BY w.created_at_seq DESC LIMIT 1), 'none') FROM core.run r ORDER BY r.created_at_seq DESC LIMIT 1")
echo "newest debate: $NEWEST"
[ "${NEWEST%%|*}" = "$KEY" ] || { echo "SB13B_NOT_DONE: the newest debate is not stamped $KEY (is it the test debate?): ask"; exit 1; }
case "${NEWEST#*|}" in CLAIMED|DONE) ;; *) echo "SB13B_NOT_DONE: it is not running yet (${NEWEST#*|}): run SB13b again in a minute"; exit 1;; esac
[ "$(journalctl -u "debateai-preview-runner@$LABEL" _SYSTEMD_INVOCATION_ID="$(systemctl show -p InvocationID --value "debateai-preview-runner@$LABEL")" -o cat --no-pager | grep '^PREVIEW_RUNNER_STARTED ' | grep -c "\"releaseKey\":\"$KEY\"" || true)" -ge 1 ] || { echo "SB13B_NOT_DONE: the new runner's journal does not name $KEY"; exit 1; }
if [ "$(systemctl is-active "debateai-preview-runner@$OLABEL" || true)" = active ]; then
  [ "$(journalctl -u "debateai-preview-runner@$OLABEL" _SYSTEMD_INVOCATION_ID="$(systemctl show -p InvocationID --value "debateai-preview-runner@$OLABEL")" -o cat --no-pager | grep '^PREVIEW_RUNNER_STARTED ' | grep -c "\"releaseKey\":\"$OKEY\"" || true)" -ge 1 ] || { echo "SB13B_NOT_DONE: the old runner's journal does not name $OKEY"; exit 1; }
  echo "the old runner still finishes its debates"
else echo "the old runner has stopped (retired, or check SB14)"; fi
[ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "SB13B_NOT_DONE: a spending gate is not active"; exit 1; }
echo SB13B_DONE
```

### SB13c. The N-1 baseline names the live release (on the Mac)

After SB13b the live release is `REV` (`LABEL`, in the names file). The N-1 compatibility job
(`.github/workflows/n1-compatibility.yml`) runs the database suites of the commit `tests/n1-baseline.json` names against
every later schema, so that file must name `REV` before the next upload: the next upload's SB4 (`N1_BASELINE`) refuses
until a `REV` that contains this change. On the Mac, in the repository checkout, with the owner's yes for the PR (the
standing order: latest dev first, push, PR to dev, fix CI, merge), fill in the three values and run:

```sh
NN=rNN; REV='<the 40-character commit of the release that is now live>'; LABEL='<its label, from the names file>'
git fetch origin dev && git switch -c "chore/n1-baseline-$NN" origin/dev
jq --arg c "$REV" --arg r "$LABEL" '.commit = $c | .reason = $r | .knownRed = []' dialectical-engine/tests/n1-baseline.json > "$TMPDIR/n1-baseline.json" && mv "$TMPDIR/n1-baseline.json" dialectical-engine/tests/n1-baseline.json
[ "$(node dialectical-engine/tools/n1-baseline.mjs commit)" = "$REV" ] && git diff --stat && git add dialectical-engine/tests/n1-baseline.json && git commit -m "chore(n1): the N-1 baseline names $LABEL ($NN)"
git push -u origin "chore/n1-baseline-$NN" && gh pr create --base dev --title "chore(n1): the N-1 baseline names $LABEL" --body "tests/n1-baseline.json names $REV, the release live on the test site, so the N-1 compatibility job checks that commit's database suites on every later schema."
```

The diff must change exactly the two lines `commit` and `reason`, and empty `knownRed` (the previous release's own stale
tests; `setAside` stays). Once CI is green, merge it (the job itself runs on this PR: it checks `REV`'s suites against
dev's schema). If it is red only on a test of `REV` that is red on `REV`'s own schema too (run that file at `REV`
without `DEBATEAI_TEST_SCHEMA_FROM` to tell), fix the test on dev in this PR and add its full name to `knownRed` with
the reason; a test that tests the migration chain itself goes to `setAside` instead (tools/n1-baseline.mjs). Never list
a failure that only the schema migrated ahead causes: that is the incompatibility the job exists to catch.

### SB14. Later: the old release retired, and its receipt

The old runner retires by itself once its pair is stopped, none of its work is READY or CLAIMED and no debate task or
model call runs (exit 0, no email). At the latest, 7.5 hours after the switch the backstop asks it to retire, and 25 minutes after that
root stops it and emails the owner. Run SB14 now and then; it writes the receipt once the release is RETIRED.

The backstop never cuts a model call. It stops new claims and calls, waits up to 20 minutes for the calls in flight, and
sets the debates still open aside (no quota use). If a model call still runs after that, the runner prints
`RUNNER_BACKSTOP_CALL_IN_FLIGHT` (with `calls`, how many) and does not retire by itself: ending its process would cut
the call and halt the spending gate both releases share. Root's forced stop ends it 25 minutes after the backstop's
request, re-opens a gate the stop halted, and emails the owner. Nothing to do by hand.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB14: read the release table; once the old release is RETIRED, write its retirement receipt (a new root-only file).
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "SB14_NOT_DONE: release-check.mjs status refused, or its bad list names a draining runner stopped with open work (run its next command, then this step again)"; exit 1; }
jq -r '.releases[] | "\(.label) \(.state) retire requested \(.retireRequested) runner \(.units.runner) open work \(.openWork)"' <<<"$ST"
OS=$(jq -r --arg o "$OLABEL" '.releases[] | select(.label == $o) | .state' <<<"$ST")
[ "$OS" = RETIRED ] || { echo "SB14_NOT_DONE: $OLABEL is still $OS: run SB14 again later"; exit 1; }
[ ! -e "$S/retirement-receipt.json" ] || { echo "SB14_NOT_DONE: the receipt exists already"; exit 1; }
RCP=$(lc release-check.mjs receipt --label "$OLABEL" --out "$S/retirement-receipt.json" 2>&1) || { echo "$RCP"; echo "SB14_NOT_DONE: no receipt (reason above): ask"; exit 1; }
echo "$RCP"
jq -c '{label, retiredReason, evidence: .runner.evidence, alertRunsSinceSwitch}' "$S/retirement-receipt.json"
echo SB14_DONE
```

A refusal names what is missing: `RECEIPT_RUNNER_NOT_CLEAN` (the runner did not end cleanly), `RECEIPT_RETIRED_LINES_MISSING`
(no retirement lines), `RECEIPT_ALERT_SENT` (a failure email for that runner since the switch). `retiredReason` is
`RUNNER_RETIRED` for a runner that retired by itself.

### SB14b. After a reboot or a runner crash during a drain

**In plain words.** No runner starts by itself: a runner instance has no `[Install]` section, and the boot target starts
only the current release's website and API. So after a server restart (or when a runner crashed) during a drain, the
draining release's runner is down: its claimed work is never handed out again, its backstop finds no runner to ask, and
25 minutes later root only emails "stranded". The current release's runner is down too after a restart, so new debates
wait. `release-check.mjs status` says so: its `bad` list names each draining release whose runner is stopped while it
still has open work, with the command that starts it (`next`), and it exits 2; the stranded email names the same command.

SB14b, with the latest upload's names file (the current release is `LABEL`, the draining one `OLABEL`): both spending
gates must be active (a gate a crash left halted is re-opened first, its README's "Re-open after a halt", with the
owner's yes), then the draining release's runner starts, then the current one's. The draining runner starts in
database-ahead mode when the database is newer (its prestart, from its lock pin), finishes or sets aside its own debates
(with no quota use) and retires by itself, as it would have without the restart. A release that is neither current nor
draining is left as it is. Nothing is stopped.

When the restart comes after the backstop's time (7.5 hours after the switch), the request to retire already stands: the
draining runner prints `RETIRE_REQUEST_STANDING` (with `openWork`) as it starts, claims nothing, sets its open debates
aside at its first check about a minute later (no quota use) and retires. A draining runner whose journal says
`RUNNER_BACKSTOP_CALL_IN_FLIGHT` did not crash: the backstop set its debates aside while a model call was still running,
so it waits on purpose (see SB14). Root's forced stop ends it 25 minutes after the backstop's request; SB14b leaves it
running ("already running").

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB14B: after a reboot or a runner crash during a drain. Both gates active, then the draining release's runner, then the current one's.
SX=0; ST=$(lc release-check.mjs status 2>&1) || SX=$?
[ "$SX" = 0 ] || [ "$SX" = 2 ] || { echo "$ST"; echo "SB14B_NOT_DONE: release-check.mjs status refused"; exit 1; }
jq -r '.releases[] | "\(.label) \(.state) runner \(.units.runner) open work \(.openWork)"' <<<"$ST"
jq -r '.bad[] | "BAD \(.code) \(.label): \(.next)"' <<<"$ST"
[ "$(jq -r --arg l "$LABEL" '.releases[] | select(.label == $l) | .state' <<<"$ST")" = CURRENT ] || { echo "SB14B_NOT_DONE: $LABEL is not the current release (use the latest upload's names file): ask"; exit 1; }
[ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "SB14B_NOT_DONE: a spending gate is not active (re-open it first, with the owner's yes); no runner was started"; exit 1; }
for RL in "$OLABEL" "$LABEL"; do
  RU=debateai-preview-runner@$RL
  RS=$(jq -r --arg r "$RL" '.releases[] | select(.label == $r) | .state' <<<"$ST")
  case "$RS" in CURRENT|DRAINING) ;; *) echo "$RL is ${RS:-not pinned}: its runner is left as it is"; continue;; esac
  case "$(systemctl is-active "$RU" || true)" in inactive|failed) ;; *) echo "$RU is already running"; continue;; esac
  T0=$(date +%s)
  systemctl start "$RU" || echo "systemctl start $RU returned non-zero"
  for i in $(seq 1 80); do [ "$(journalctl -u "$RU" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE|RETIRED)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
  BADL=$(journalctl -u "$RU" --since "@$T0" -o cat --no-pager | grep -E 'GATE_CAPACITY_UNREAD|UNAUTHENTICATED|STARTUP_REFUSED|PRESTART_REFUSED|STOPPED_ON_FAILURE' || true)
  [ -z "$BADL" ] || { echo "$BADL" | cut -c1-300; echo "SB14B_NOT_DONE: $RU refused to start (above): ask"; exit 1; }
  echo "$RU: $(journalctl -u "$RU" --since "@$T0" -o cat --no-pager | grep -oE '^PREVIEW_RUNNER_(STARTED|RETIRED)' | tr '\n' ' ')"
done
SX=0; ST=$(lc release-check.mjs status 2>&1) || SX=$?
[ "$SX" = 0 ] || { echo "$ST"; echo "SB14B_NOT_DONE: release-check.mjs status still names a stopped draining runner, or refused (above): ask"; exit 1; }
echo SB14B_DONE
```

A draining runner with nothing left to do prints `PREVIEW_RUNNER_RETIRED` at once and stops (its stop recorder writes
RETIRED); one with open work prints `PREVIEW_RUNNER_STARTED` and keeps running until it retires. Then SB14 as usual.

### SB15. Later, on the owner's yes: the archive

`release-archive.mjs archive` moves a RETIRED release's folders, `/etc` files and unit drop-ins into two root-only
archive folders (one rename each, never a copy, never a delete) and unpins it. Archive the release **before** the old
one: keep `OLABEL` itself until the next release is live, because it is the way back (WB2). After the first upload
following T there is none in the lock yet (R19 was never in lock v2; its folders stay until the owner decides).

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SB15: archive the release that retired before OLABEL (owner's yes). Nothing is deleted.
PREV='<the label of the release that was current before OLABEL>'
printf '%s\n' "$PREV" | grep -qxE '[a-z0-9][a-z0-9-]{0,62}[a-z0-9]' && [ "$PREV" != "$OLABEL" ] && [ "$PREV" != "$LABEL" ] || { echo "SB15_NOT_DONE: PREV is not filled in, or is the old or the new release"; exit 1; }
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "SB15_NOT_DONE: release-check.mjs status refused, or its bad list names a draining runner stopped with open work (run its next command, then this step again)"; exit 1; }
[ "$(jq -r --arg p "$PREV" '.releases[] | select(.label == $p) | .state' <<<"$ST")" = RETIRED ] || { echo "SB15_NOT_DONE: $PREV is not a RETIRED release of the lock"; exit 1; }
AR=$(lc release-archive.mjs archive --label "$PREV" 2>&1) || { echo "$AR"; echo "SB15_NOT_DONE: the archive refused (DAEMON_RELOAD_FAILED: the label is already unpinned; run systemctl daemon-reload by hand)"; exit 1; }
echo "$AR"
[ "$(jq -r '[.event, .label] | map(tostring) | join(" ")' <<<"$AR")" = "PREVIEW_RELEASE_ARCHIVED $PREV" ] && [ "$(jq -r --arg p "$PREV" '.releases | has($p)' "$LOCK")" = false ] || { echo "SB15_NOT_DONE: $PREV is not archived and unpinned"; exit 1; }
echo SB15_DONE
```

To undo an archive, move its folders back from the two paths the line names (`to`, `configTo`) and pin its three plans
again.

### The way back, side by side

Going back is the same switch in the other direction (spec §11): no restore and no outage. Which script depends on where
the upload stopped:

| Where it stopped | The way back |
|---|---|
| before SB10's stage | nothing of the new release runs: stop here. Migrations already applied stay (each is expand-only, and the old release runs beside them with its database-ahead pin). |
| SB10 (staged) to SB12, or SB13 refused before its write (`SWITCH_PRECONDITION_FAILED`, `RELEASE_SWITCH_CONFLICT`) | WB1: the new release goes away |
| after SB13 (the new release is current) | WB2: the old release serves again |
| SB13 said `SWITCH_REVERTED` | read the new website's `/readyz` reasons (with reason `WEBSITE_NOT_READY` the line names them in `websiteReasons`), fix, then WB3 (retry) |
| SB13 said `SWITCH_OUTCOME_UNKNOWN`, or `bad` names `BACKSTOP` or `TARGET` | WB4 (finish) |
| SB13 said `SWITCH_REVERT_FAILED` or `SWITCH_REVERT_UNCONFIRMED` | stop and ask: read `release-check.mjs status` first |

**The settings each way back activates (side-by-side spec §11, §13).** Nothing to do by hand, and no gate is asked:
putting back a known state must work while a gate is down. WB2's rollback keeps the active version when the old release
has passed it (it activates nothing); else it activates the version that was active the last time the old release was
current, while the old release still passes it; else the old release's own site version: never a version it only checked
and never ran (ruling R78). WB3's retry is the same rollback command towards the new release, in the same order (after
`SWITCH_REVERTED` that is the version its switch activated). A switch
that reverts by itself (`SWITCH_REVERTED`) puts back the version that was active before it; between two releases on one
site version it activates nothing. WB1 and WB4 activate nothing (WB4 never writes the switch). Afterwards
`lc settings-version.mjs status` prints the pointer.

If SB10 swapped the operator folder, moving it back (`mv /opt/debateai-v3-preview/operator/lifecycle-v1
"$S/operator-lifecycle-v1.<new label>"`, then `mv "$S/operator-lifecycle-v1.before" /opt/debateai-v3-preview/operator/lifecycle-v1`)
is the owner's call after WB1 or WB2: the old release ran with the new tools since SB10. After SB8 the online backup is a
last resort only.

**WB1: before the switch.** `rollback --before-switch` stops the new release's runner, website and API (the one runner
it may stop: it refuses while the new release holds open work) and records it RETIRED (`NOT_SWITCHED`); it never switches.
A release staged again while it still drains (a rollback given up half way) goes back to DRAINING instead, its runner
untouched and its backstop armed again.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# WB1: the new release goes away before the switch. Nothing user-facing changes.
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "WB1_NOT_DONE: release-check.mjs status refused, or its bad list names a draining runner stopped with open work (run its next command, then this step again)"; exit 1; }
[ "$(jq -r --arg o "$OLABEL" '.releases[] | select(.label == $o) | .state' <<<"$ST")" = CURRENT ] || { echo "WB1_NOT_DONE: $OLABEL is not current: the switch happened (WB2)"; exit 1; }
[ "$(jq -r --arg l "$LABEL" '.releases[] | select(.label == $l) | .state' <<<"$ST")" = STAGED ] || { echo "WB1_NOT_DONE: $LABEL is not STAGED (before SB10's stage nothing runs: stop here)"; exit 1; }
RB=$(lc release-switch.mjs rollback --before-switch --label "$LABEL" 2>&1) || { echo "$RB"; echo "WB1_NOT_DONE: the rollback refused (openWork: the new release already holds work: ask)"; exit 1; }
echo "$RB"
[ "$(jq -r '[.event, .beforeSwitch, (.bad | length)] | map(tostring) | join(" ")' <<<"$RB")" = "PREVIEW_RELEASE_ROLLED_BACK true 0" ] || { echo "WB1_NOT_DONE: the rollback did not finish cleanly (bad above)"; exit 1; }
echo "outcome $(jq -r .outcome <<<"$RB")"
[ "$(edgekey)" = "200 $OKEY" ] || { echo "WB1_NOT_DONE: the site does not answer from the old release: ask"; exit 1; }
echo WB1_DONE
```

**WB2: after the switch.** `rollback --to <old> --from <new>` turns off the old release's stale backstop and check
timers, stages it again, starts its runner first (in database-ahead mode, from its lock pin), then its API and its
website (503 with only `NOT_CURRENT`), and switches with the roles reversed. The new runner keeps finishing the debates
it already started (O1); it retires by itself like any old release.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# WB2: the old release serves again, by the switch the other way. Exit 0 or 2 (read bad), 1 = refused.
SX=0; ST=$(lc release-check.mjs status 2>&1) || SX=$?
[ "$SX" = 0 ] || { [ "$SX" = 2 ] && [ "$(jq -r '[.bad[].label] | unique | join(" ")' <<<"$ST" 2>/dev/null)" = "$OLABEL" ]; } || { echo "$ST"; echo "WB2_NOT_DONE: release-check.mjs status refused, or its bad list names another release than $OLABEL (whose runner the rollback starts first)"; exit 1; }
[ "$(jq -r --arg l "$LABEL" '.releases[] | select(.label == $l) | .state' <<<"$ST")" = CURRENT ] || { echo "WB2_NOT_DONE: $LABEL is not current (before the switch: WB1)"; exit 1; }
RC=0; RB=$(lc release-switch.mjs rollback --to "$OLABEL" --from "$LABEL" 2>&1) || RC=$?
echo "$RB"
[ "$RC" != 1 ] || { echo "WB2_NOT_DONE: the rollback refused (reason above; ROLLBACK_*_NOT_STARTED names the old unit that did not come up): ask"; exit 1; }
[ "$RC" = 0 ] || { echo "WB2_NOT_DONE: the switch back is done, but a check after it failed: read bad above"; exit 1; }
[ "$(jq -r '[.event, .toKey] | map(tostring) | join(" ")' <<<"$RB")" = "PREVIEW_RELEASE_ROLLED_BACK $OKEY" ] && [ "$(edgekey)" = "200 $OKEY" ] || { echo "WB2_NOT_DONE: the site does not answer from the old release"; exit 1; }
echo "started again: $(jq -r '.started | join(" ")' <<<"$RB")"
echo WB2_DONE
```

**WB3: after `SWITCH_REVERTED`.** The edge never showed the new release (or the new website said it would not become
ready), so the tool switched back by itself: the old
release serves, the new one is DRAINING with its three units still running (nothing was stopped) and its backstop armed.
First read why the new website was not ready (the `reasons` WB3 prints), fix that, then WB3 retries: the database switches
only to a STAGED release, so the retry is `rollback --to <new> --from <old>`, which disarms that backstop, stages the new
release again and switches. To give up instead, stop the new website and API (`systemctl stop debateai-preview-ui@<label>
debateai-preview-api@<label>`): its runner finishes what it admitted and retires by itself.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# WB3: after SWITCH_REVERTED, once the reason is fixed: the switch again, through the rollback command (it stages the new release again).
RZ=$(readyz "$UIP"); echo "new website /readyz on $UIP: ${RZ##*$'\n'} $(jq -c '{releaseKey, reasons}' <<<"${RZ%$'\n'*}" 2>/dev/null || echo '(no JSON)')"
SX=0; ST=$(lc release-check.mjs status 2>&1) || SX=$?
[ "$SX" = 0 ] || { [ "$SX" = 2 ] && [ "$(jq -r '[.bad[].label] | unique | join(" ")' <<<"$ST" 2>/dev/null)" = "$LABEL" ]; } || { echo "$ST"; echo "WB3_NOT_DONE: release-check.mjs status refused, or its bad list names another release than $LABEL (whose runner the rollback starts first)"; exit 1; }
[ "$(jq -r --arg o "$OLABEL" '.releases[] | select(.label == $o) | .state' <<<"$ST")" = CURRENT ] && [ "$(jq -r --arg l "$LABEL" '.releases[] | select(.label == $l) | .state' <<<"$ST")" = DRAINING ] || { echo "WB3_NOT_DONE: this is not the state SWITCH_REVERTED leaves (old CURRENT, new DRAINING): ask"; exit 1; }
RC=0; RB=$(lc release-switch.mjs rollback --to "$LABEL" --from "$OLABEL" 2>&1) || RC=$?
echo "$RB"
[ "$RC" = 0 ] || { echo "WB3_NOT_DONE: the retry did not finish cleanly (reason or bad above)"; exit 1; }
[ "$(edgekey)" = "200 $KEY" ] || { echo "WB3_NOT_DONE: the edge does not answer from the new release"; exit 1; }
echo WB3_DONE
```

**WB4: when the switch's outcome is unknown, or its last steps failed.** `SWITCH_OUTCOME_UNKNOWN` means the database
write may have landed but the command did not get to its end (a lost ssh session, say); `bad` naming `BACKSTOP` or
`TARGET` means a step after the write failed. If the release table names the new release current, `switch --finish`
runs the steps after the write again (each one repeats safely: edge, the old pair's stop and its record, the backstop,
the boot target, the checks); it never writes the switch itself. If the table still names the old release current, the
write did not land: read the refusal and run SB13 again. After DR6's drained switch, run WB4 with `bash -s -- drained`:
it passes `--old-pair-stopped` to `switch --finish` (the old runner was stopped on purpose there too, as the refusal's
`next` says).

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# WB4: finish a switch whose database write landed. Never writes the switch itself. After DR6: bash -s -- drained.
DRAINED=${1:-}
[ -z "$DRAINED" ] || [ "$DRAINED" = drained ] || { echo "WB4_NOT_DONE: the one argument is drained (after DR6's switch), or none"; exit 1; }
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "WB4_NOT_DONE: release-check.mjs status refused, or its bad list names a draining runner stopped with open work (run its next command, then this step again)"; exit 1; }
[ "$(jq -r --arg l "$LABEL" '.releases[] | select(.label == $l) | .state' <<<"$ST")" = CURRENT ] || { echo "WB4_NOT_DONE: the release table does not name $LABEL current: the write did not land (run SB13, or DR6's switch, again after reading its refusal)"; exit 1; }
RC=0; FN=$(lc release-switch.mjs switch --finish --to "$LABEL" --from "$OLABEL" ${DRAINED:+--old-pair-stopped} 2>&1) || RC=$?
echo "$FN"
[ "$RC" = 0 ] || { echo "WB4_NOT_DONE: the finish did not end cleanly (FINISH_EDGE_UNCONFIRMED: nothing was stopped; bad: read it): ask"; exit 1; }
[ "$(jq -r '[.event, .toKey, (.bad | length)] | map(tostring) | join(" ")' <<<"$FN")" = "PREVIEW_RELEASE_SWITCH_FINISHED $KEY 0" ] && [ "$(edgekey)" = "200 $KEY" ] || { echo "WB4_NOT_DONE: the switch is not finished on $KEY"; exit 1; }
[ -z "$DRAINED" ] || echo "drained switch finished: now run DR6's lines from release-retire.mjs mark-retired on"
echo WB4_DONE
```

A `release-switch.mjs` command that refuses `RELEASE_SWITCH_BUSY` with `holderAlive` false left its lock behind (an ssh
drop). When no switch runs (`pgrep -f '[r]elease-switch.mjs'` prints nothing), move the lock aside and run the command
again. The brackets keep the pattern from matching the shell that runs the line itself (run through `bash -c` or ssh,
that shell's own command line holds the plain name, so a plain `pgrep -f release-switch.mjs` always finds a process and
the lock would never move):

```sh
pgrep -f '[r]elease-switch.mjs' || mv /etc/debateai-v3-preview/lifecycle/release-switch.lock "/root/preview-archive/release-switch.lock.stale-$(date -u +%Y%m%dT%H%M%SZ)"
```

### Drained upload on the template layout

**When.** SB4 said `DRAINED_PATH`: a new migration lacks `-- n1: expand` or `-- n1: keeps-verifier`, so the old release
could not run beside the new database (spec §5's escape hatch). Then the upload goes the old way once more, on the
template layout: a quiet moment, the old release stopped with nothing open, a cold copy, the migrations, and a switch
with the old pair already stopped. SB1 to SB4 stand as they are (the names, the staging, the practice, the plan); SB5's
database-ahead file is not made. To change the payment marks on this path, run SB5b right after DR1. The first time
the marks are listed, MT1, PM2 and MT2 ("Payment marks: the files and Caddy's rule") go after DR1 and SB5b, before DR2.

**The owner's yes, fresh in the live chat right before DR2.** It names the downtime, the cold copy, the migrations by
number (and which one is not expand-only), the publish with its delta hash, and the new commit with its release key.
When this upload adds the Caddy payment-marks rule, the yes before DR2 names PM2 too, and comes before MT1.

| Step | What | The site | The way back from here |
|---|---|---|---|
| DR1 | the three env files | up | nothing to undo |
| MT1, PM2, MT2 | only the first upload that lists the marks: Caddy's rule (see "Payment marks: the files and Caddy's rule") | up (one Caddy restart, about a second) | PM2 puts the old Caddyfile back itself |
| DR2 | wait for nothing open or waiting; stop the old website and API, then the old runner (nothing open) and the backup timer | **down** | rbD-A |
| DR3 | cold copy | down | rbD-A |
| DR4 | migrations | down | **only the cold copy: rbD-B** |
| DR5 | publish, verify plan, first proof, launch plans, pins, drop-ins, stage | down | rbD-B |
| DR6 | the new runner, API and website; the switch with the old pair stopped; the old release marked retired (the downtime ends) | up | rbD-B |

#### DR1. The three env files

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# DR1: api-, ui- and runner-<LABEL>.env from the old release's files, and the SAME checks of both releases. No database-ahead file.
for SVC in api ui runner; do [ ! -e "$E/$SVC-$LABEL.env" ] || { echo "DR1_NOT_DONE: $E/$SVC-$LABEL.env exists (look first)"; exit 1; }; done
for SVC in api ui runner; do
  W=$(lc release-env.mjs derive --service "$SVC" --from "$E/$SVC-$OLABEL.env" --label "$LABEL" --slot "$SLOT" --release-key "$KEY" 2>&1) || { echo "$W"; echo "DR1_NOT_DONE: derive refused the $SVC file (reason above)"; exit 1; }
  echo "$W"
  [ "$(jq -r '[.event, .label, .releaseKey] | map(tostring) | join(" ")' <<<"$W")" = "PREVIEW_RELEASE_ENV_WRITTEN $LABEL $KEY" ] || { echo "DR1_NOT_DONE: the $SVC file is not this release's"; exit 1; }
done
lc release-env.mjs same --labels "$OLABEL,$LABEL" --slots "$OSLOT,$SLOT" || { echo "DR1_NOT_DONE: a SAME check is BAD (above)"; exit 1; }
echo DR1_DONE
```

#### DR2. The downtime starts: nothing open, the old release stopped

The old website and API stop first (no new debate can be admitted), then the old runner, but only once none of its work
is READY or CLAIMED: it is the drained path's one planned runner stop, with nothing to do. The settings guard of DR6
runs here too, before the downtime starts: when settings were activated since SB3, DR2 stops with nothing stopped (a new
plan from SB3 and a new yes), instead of DR6 stopping later with the site down.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# DR2: DOWNTIME START. Guards first, then the old website and API, the old runner (zero open work) and the backup timer.
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] || { echo "DR2_NOT_DONE: a debate is queued or running (nothing was stopped)"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM core.run_waiting_v")" = 0 ] || { echo "DR2_NOT_DONE: a debate is waiting in line (nothing was stopped): ask"; exit 1; }
[ "$(gs "$GD" "$PD" | jq -r .in_flight)" = 0 ] && [ "$(gs "$GAN" "$PAN" | jq -r .in_flight)" = 0 ] || { echo "DR2_NOT_DONE: a gate has a call in flight (nothing was stopped)"; exit 1; }
[ "$(lc release-check.mjs status | jq -r --arg o "$OLABEL" '.releases[] | select(.label == $o) | .state')" = CURRENT ] || { echo "DR2_NOT_DONE: the old release is not current (nothing was stopped)"; exit 1; }
AVN=$(activev) || { echo "DR2_NOT_DONE: settings-version.mjs status refused (nothing was stopped): ask"; exit 1; }
[ "$AVN" = "$(cat "$S/active-before")" ] && [ "$AVN" = "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" ] || { echo "DR2_NOT_DONE: settings were activated since SB3 (active $AVN; nothing was stopped): a new plan from SB3 and a new yes"; exit 1; }
date -u +%s >> "$S/downtime-start-epoch"; echo "DOWNTIME START $(date -u)"
systemctl stop "debateai-preview-ui@$OLABEL" "debateai-preview-api@$OLABEL" debateai-preview-backup.timer || { echo "DR2_NOT_DONE: the stop of the old pair failed"; exit 1; }
for U in "debateai-preview-ui@$OLABEL" "debateai-preview-api@$OLABEL" debateai-preview-backup.timer; do case "$(systemctl is-active "$U" || true)" in inactive|failed) ;; *) echo "DR2_NOT_DONE: $U is still running"; exit 1;; esac; done
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")" = 0 ] && [ "$(psqlq "SELECT count(*) FROM core.run_waiting_v")" = 0 ] || { echo "DR2_NOT_DONE: a debate was admitted during the stop; the old runner keeps running: ask (rbD-A starts the pair again)"; exit 1; }
systemctl stop "debateai-preview-runner@$OLABEL" || { echo "DR2_NOT_DONE: the stop of the old runner failed"; exit 1; }
case "$(systemctl is-active "debateai-preview-runner@$OLABEL" || true)" in inactive|failed) ;; *) echo "DR2_NOT_DONE: the old runner is still running"; exit 1;; esac
CC=x; for i in $(seq 1 15); do CC=$(psqlq "SELECT count(*) FROM pg_stat_activity WHERE datname='debateai' AND backend_type='client backend' AND pid<>pg_backend_pid()"); [ "$CC" = 0 ] && break; sleep 2; done
[ "$CC" = 0 ] || { echo "DR2_NOT_DONE: $CC database client(s) still connected"; exit 1; }
echo DR2_DONE
```

#### DR3. The cold copy

B2 on the template layout (`max_connections` is already 320 since T).

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# DR3: stop the gateway, Hatchet, PostgreSQL; tar the data folder and its config into S; check; start them again.
PGP=/var/lib/postgresql/18; SOCK=/run/debateai-v3-preview/postgresql
LEDGER0=$(cat "$S/ledger-before"); REG0=$(cat "$S/register-before")
for U in "runner@$OLABEL" "ui@$OLABEL" "api@$OLABEL" "runner@$LABEL" "ui@$LABEL" "api@$LABEL"; do case "$(systemctl is-active "debateai-preview-$U" || true)" in inactive|failed) ;; *) echo "DR3_NOT_DONE: $U is running (DR2 first)"; exit 1;; esac; done
[ "$(psqlq "SELECT count(*) FROM pg_stat_activity WHERE datname='debateai' AND backend_type='client backend' AND pid<>pg_backend_pid()")" = 0 ] || { echo "DR3_NOT_DONE: database clients connected"; exit 1; }
[ ! -e "$S/pg18-v3-preview-cold.tgz" ] && [ ! -e "$S/pg18-v3-preview-config.tgz" ] && [ ! -e "$S/pg18-cold.sha256" ] || { echo "DR3_NOT_DONE: an earlier cold copy exists in S (look first)"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "DR3_NOT_DONE: the ledger or the register moved since SB1"; exit 1; }
SIZE=$(du -sm "$PGP/v3-preview" | cut -f1); AVAIL=$(df --output=avail -BM / | tail -1 | tr -dc 0-9)
[ "$AVAIL" -gt $((SIZE * 2 + 2048)) ] || { echo "DR3_NOT_DONE: not enough free space for the copy"; exit 1; }
CID0=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true)
IP0=$(docker inspect "$CID0" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' 2>/dev/null || true)
[ -n "$CID0" ] && [ -n "$IP0" ] || { echo "DR3_NOT_DONE: the Hatchet container or its address is unread"; exit 1; }
systemctl stop debateai-preview-hatchet-gateway debateai-preview-hatchet debateai-preview-postgresql || { echo "DR3_NOT_DONE: a stop failed (look at the three units first)"; exit 1; }
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = inactive ] || { echo "DR3_NOT_DONE: $U is not inactive (nothing copied)"; exit 1; }; done
umask 077
tar -C "$PGP" -czf "$S/pg18-v3-preview-cold.tgz" v3-preview || { echo "DR3_NOT_DONE: the data tar failed; the database is STOPPED"; exit 1; }
tar -C /etc/debateai-v3-preview -czf "$S/pg18-v3-preview-config.tgz" postgresql || { echo "DR3_NOT_DONE: the config tar failed; the database is STOPPED"; exit 1; }
sha256sum "$S/pg18-v3-preview-cold.tgz" "$S/pg18-v3-preview-config.tgz" > "$S/pg18-cold.sha256"
umask 022
sha256sum -c --quiet "$S/pg18-cold.sha256" || { echo "DR3_NOT_DONE: the copy does not match its own sha256; the database is STOPPED"; exit 1; }
systemctl start debateai-preview-postgresql || { echo "DR3_NOT_DONE: PostgreSQL did not start"; exit 1; }
for i in $(seq 1 30); do /usr/lib/postgresql/18/bin/pg_isready -q -h "$SOCK" -p 5434 && break; sleep 2; done
/usr/lib/postgresql/18/bin/pg_isready -h "$SOCK" -p 5434 || { echo "DR3_NOT_DONE: PostgreSQL is not ready"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] || { echo "DR3_NOT_DONE: the ledger changed across the copy"; exit 1; }
systemctl start debateai-preview-hatchet || { echo "DR3_NOT_DONE: Hatchet did not start"; exit 1; }
CID=; for i in $(seq 1 30); do CID=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true); [ -n "$CID" ] && break; sleep 2; done
IP=$(docker inspect "$CID" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' || true)
[ "$CID" = "$CID0" ] && [ "$IP" = "$IP0" ] || { echo "DR3_NOT_DONE: the Hatchet container or address changed; the gateway is NOT started: stop and ask"; exit 1; }
ALLOW=$(systemctl show -p IPAddressAllow --value debateai-preview-hatchet-gateway.service)
echo " $ALLOW " | grep -qF -e " $IP/32 " -e " $IP " || { echo "DR3_NOT_DONE: Hatchet's address is not in the gateway's IPAddressAllow; the gateway is NOT started"; exit 1; }
W=$(/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin /usr/local/bin/node /opt/debateai-v3-preview/operator/gateway/gateway-route-witness.mjs check 2>&1) && echo "$W" | grep -q PASS || { echo "$W" | cut -c1-400; echo "DR3_NOT_DONE: the gateway witness did not say PASS; the gateway is NOT started"; exit 1; }
systemctl start debateai-preview-hatchet-gateway.service || { echo "DR3_NOT_DONE: the gateway did not start"; exit 1; }
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = active ] || { echo "DR3_NOT_DONE: $U is not active"; exit 1; }; done
echo DR3_DONE
```

#### DR4. The migrations

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# DR4: apply this release's migrations through its own native-plan file. From the native operator's start on, the way back is rbD-B.
LEDGER0=$(cat "$S/ledger-before"); REG0=$(cat "$S/register-before")
for U in "runner@$OLABEL" "ui@$OLABEL" "api@$OLABEL"; do case "$(systemctl is-active "debateai-preview-$U" || true)" in inactive|failed) ;; *) echo "DR4_NOT_DONE: $U is running"; exit 1;; esac; done
sha256sum -c --quiet "$S/pg18-cold.sha256" || { echo "DR4_NOT_DONE: no checked cold copy in S (DR3 first)"; exit 1; }
cmp -s "$S/native-plan.before.json" "$ONP" && cmp -s "$ART/native-plan-plan.json" "$NP" || { echo "DR4_NOT_DONE: the old verify plan moved, or this release's native-plan file is not SB3's plan"; exit 1; }
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "DR4_NOT_DONE: the ledger or the register moved"; exit 1; }
[ ! -e "$ART/native-plan-apply-and-plan.json" ] && [ ! -e "$ART/native-apply-and-plan.json" ] || { echo "DR4_NOT_DONE: earlier apply-and-plan files exist (look first)"; exit 1; }
rel native-plan --operation apply-and-plan --from "$S/native-plan.before.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-apply-and-plan.json" || { echo "DR4_NOT_DONE: the release tool refused the plan (nothing applied)"; exit 1; }
put "$ART/native-plan-apply-and-plan.json" || { echo "DR4_NOT_DONE: put failed (nothing applied)"; exit 1; }
OUT=$(nat "$ART/native-apply-and-plan.json"); echo "nat: $OUT"
LEDGER=$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration"); echo "ledger $LEDGER"
[ "$OUT" = "exit 0" ] || { head -c 1200 "$ART/native-apply-and-plan.json"; echo; echo "DR4_NOT_DONE: the native operator refused (from here the way back is rbD-B)"; exit 1; }
[ "$LEDGER" = "$(( ${LEDGER0%%|*} + $(grep -c . "$S/new-migrations.txt") ))|$(LC_ALL=C sort "$S/new-migrations.txt" | tail -n 1)" ] || { echo "DR4_NOT_DONE: the ledger is not the old one plus exactly this release's migrations"; exit 1; }
echo DR4_DONE
```

#### DR5. Publish, verify plan, first proof, launch plans, pins, drop-ins, stage

SB9 and SB10 in one step, on a stopped site. The operator folder swap of SB10 applies here too, when SB4 said
`changed (reviewed)`: run it by hand from SB10 first. As in SB10, DR5 first checks that Caddy serves the payment marks
when the new release's ui file names them, and stops otherwise with nothing changed.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# DR5: publish with the owner's yes, the verify plan and first proof, three launch plans for the new slot, three pins, the
# instance drop-ins, reload, stage. Nothing starts.
YES='<the deltaSha256 the owner approved, in full>'
UD=/etc/systemd/system; REG0=$(cat "$S/register-before"); VK=${KEY#r}; VK=${VK%%-*}
[ "$VK" = "$((REG0 + 1))" ] || { echo "DR5_NOT_DONE: $KEY does not name version $((REG0 + 1))"; exit 1; }
cmp -s "$ART/native-plan-apply-and-plan.json" "$NP" || { echo "DR5_NOT_DONE: DR4 is not done"; exit 1; }
sha256sum -c --quiet "$S/plan-proposal.sha256" && [ "$(jq -r .deltaSha256 "$ART/register-proposal.json")" = "$YES" ] && [ "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" = "$(cat "$S/active-before")" ] || { echo "DR5_NOT_DONE: the proposal is not the approved one, or not based on the active settings version"; exit 1; }
for F in native-plan-publish.json register-published.json native-plan-verify.json native-first-verify.json api-launch.json ui-launch.json runner-launch.json; do [ ! -e "$ART/$F" ] || { echo "DR5_NOT_DONE: $F exists (look first)"; exit 1; }; done
if grep -q '^PAYMENT_MARKS_AVAILABLE=' "$E/ui-$LABEL.env"; then grep -qF '@paymentMarks path /payment-marks/netopia.svg /payment-marks/visa.svg /payment-marks/mastercard.svg' "$C" || { echo "DR5_NOT_DONE: ui-$LABEL.env names payment marks but Caddy does not serve them (PM2 first, or put $S/ui-$LABEL.env.before-marks back); nothing changed"; exit 1; }; fi
OLDA=$(sed -n 1p "$S/old-plans.txt"); OLDU=$(sed -n 2p "$S/old-plans.txt"); OLDR=$(sed -n 3p "$S/old-plans.txt")
rel native-plan --operation publish --from "$ART/native-plan-plan.json" --proposal "$ART/register-proposal.json" --approved-delta-sha256 "$YES" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-publish.json" || { echo "DR5_NOT_DONE: the release tool refused the publish plan (nothing published)"; exit 1; }
put "$ART/native-plan-publish.json" || { echo "DR5_NOT_DONE: put of the publish plan failed (nothing published)"; exit 1; }
OUT=$(nat "$ART/register-published.json"); echo "nat: $OUT"
[ "$OUT" = "exit 0" ] || { head -c 800 "$ART/register-published.json"; echo; echo "DR5_NOT_DONE: the publish was refused (PREVIEW_REGISTER_BASE_NOT_ACTIVE: settings were activated since SB3: a new plan and a new yes)"; exit 1; }
V=$(jq -r .publication.registerVersion "$ART/register-published.json"); echo "new REGISTER_VERSION=$V"
[ "$V" = "$VK" ] || { echo "DR5_NOT_DONE: the published version is not the one $KEY names"; exit 1; }
printf '%s\n' "$V" > "$S/new-register-version"
echo "PUBLISHED_$V"
rel native-plan --operation verify --from "$ART/native-plan-publish.json" --publication "$ART/register-published.json" --source-manifest "$ART/candidate-api-source.json" --out "$ART/native-plan-verify.json" || { echo "DR5_NOT_DONE: the release tool refused the verify plan (version $V IS published)"; exit 1; }
put "$ART/native-plan-verify.json" || { echo "DR5_NOT_DONE: put of the verify plan failed (version $V IS published)"; exit 1; }
OUT=$(nat "$ART/native-first-verify.json"); echo "nat: $OUT"
[ "$OUT" = "exit 0" ] || { echo "DR5_NOT_DONE: the first proof was refused (version $V IS published)"; exit 1; }
rel launch-plan --service api --slot "$SLOT" --from "$OLDA" --root "$CAPI" --source-manifest "$ART/candidate-api-source.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/api-launch.json" || { echo "DR5_NOT_DONE: the API launch plan was refused"; exit 1; }
rel launch-plan --service ui --slot "$SLOT" --from "$OLDU" --root "$CUI" --source-manifest "$ART/candidate-ui-source.json" --ui-build "$ART/candidate-ui-build.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/ui-launch.json" || { echo "DR5_NOT_DONE: the website launch plan was refused"; exit 1; }
rel launch-plan --service runner --slot "$SLOT" --from "$OLDR" --root "$CRUN" --source-manifest "$ART/candidate-runner-source.json" --native-attestation "$ART/native-first-verify.json" --publication "$ART/register-published.json" --out "$ART/runner-launch.json" || { echo "DR5_NOT_DONE: the runner launch plan was refused"; exit 1; }
OLDENTRY=$(jq -cS --arg o "$OLABEL" '.releases[$o]' "$LOCK")
for SVC in api ui runner; do
  PLAN=$ART/$SVC-launch.json
  PIN=$(pre pin --from "$PLAN" 2>&1) || { echo "$PIN"; echo "DR5_NOT_DONE: the pin of $SVC was refused"; exit 1; }
  [ "$(jq -r '[.event, .label, .slot, .releaseKey] | map(tostring) | join(" ")' <<<"$PIN")" = "PREVIEW_LIFECYCLE_RELEASE_PINNED $LABEL $SLOT $KEY" ] || { echo "DR5_NOT_DONE: the $SVC pin is not this release on slot $SLOT"; exit 1; }
done
[ "$(jq -cS --arg o "$OLABEL" '.releases[$o]' "$LOCK")" = "$OLDENTRY" ] || { echo "DR5_NOT_DONE: a pin changed the old release's lock entry: ask"; exit 1; }
for SVC in api ui runner; do
  DD=$UD/debateai-preview-$SVC@$LABEL.service.d
  install -d -o root -g root -m 0755 "$DD"
  pre dropin --service "$SVC" --label "$LABEL" > "$DD/zzzzzzzzzz-lifecycle-release.conf.new" || { echo "DR5_NOT_DONE: the $SVC drop-in was refused"; exit 1; }
  chmod 0644 "$DD/zzzzzzzzzz-lifecycle-release.conf.new"; mv "$DD/zzzzzzzzzz-lifecycle-release.conf.new" "$DD/zzzzzzzzzz-lifecycle-release.conf"
done
systemctl daemon-reload
SG=$(lc release-switch.mjs stage --label "$LABEL" 2>&1) || { echo "$SG"; echo "DR5_NOT_DONE: the stage was refused"; exit 1; }
echo "$SG"
echo DR5_DONE
```

#### DR6. The new release starts; the switch with the old pair stopped; the old release retired

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# DR6: the new runner, API and website (not ready), then the switch with --old-pair-stopped, then the old release marked
# RETIRED (DRAINED: its runner was stopped with nothing open). The downtime ends when the edge answers from the new release.
for SVC in runner api ui; do case "$(systemctl is-active "debateai-preview-$SVC@$LABEL" || true)" in inactive|failed) ;; *) echo "DR6_NOT_DONE: the new $SVC already runs"; exit 1;; esac; done
T0=$(date +%s)
systemctl start "debateai-preview-runner@$LABEL" || echo "systemctl start of the new runner returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u "debateai-preview-runner@$LABEL" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u "debateai-preview-runner@$LABEL" --since "@$T0" -o cat --no-pager | grep '^PREVIEW_RUNNER_STARTED ' | grep "\"releaseKey\":\"$KEY\"" | grep -c '"startupDispatched":0[,}]' || true)" -ge 1 ] || { echo "DR6_NOT_DONE: no PREVIEW_RUNNER_STARTED naming $KEY with nothing re-sent (way back: rbD-B)"; exit 1; }
T1=$(date +%s)
systemctl start "debateai-preview-api@$LABEL" || echo "systemctl start of the new API returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u "debateai-preview-api@$LABEL" --since "@$T1" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u "debateai-preview-api@$LABEL" --since "@$T1" -o cat --no-pager | grep 'PREVIEW_API_STARTED' | grep -c "\"releaseKey\":\"$KEY\"" || true)" -ge 1 ] || { echo "DR6_NOT_DONE: the new API did not start on $KEY (way back: rbD-B)"; exit 1; }
systemctl start "debateai-preview-ui@$LABEL" || echo "systemctl start of the new website returned non-zero"
RC=000; for i in $(seq 1 60); do RZ=$(readyz "$UIP"); RC=${RZ##*$'\n'}; [ "$RC" = 503 ] && [ "$(jq -c '[.releaseKey, .reasons]' <<<"${RZ%$'\n'*}" 2>/dev/null)" = "[\"$KEY\",[\"NOT_CURRENT\"]]" ] && break; sleep 2; done
[ "$RC" = 503 ] || { echo "DR6_NOT_DONE: the new website is not up and waiting (way back: rbD-B)"; exit 1; }
AVN=$(activev) || { echo "DR6_NOT_DONE: settings-version.mjs status refused (nothing changed): ask"; exit 1; }
[ "$AVN" = "$(cat "$S/active-before")" ] && [ "$AVN" = "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" ] || { echo "DR6_NOT_DONE: settings were activated since SB3 (active $AVN): the site is DOWN since DR2 and nothing was switched; ask now: the way back is rbD-B (DR4's migrations ran)"; exit 1; }
ACT=${KEY%%-*}; ACT=${ACT#r}                              # the settings version the switch activates: this release's own site version (SB13)
SC=0; SW=$(lc release-switch.mjs switch --to "$LABEL" --from "$OLABEL" --old-pair-stopped --activate "$ACT" --expect-active "$AVN" 2>&1) || SC=$?
echo "$SW"
case "$SC" in
  0) ;;
  2) echo "DR6_NOT_DONE: the switch is done, but a check after it failed: bad $(jq -c .bad <<<"$SW" 2>/dev/null || echo '(unread)') (BACKSTOP or TARGET: WB4 with bash -s -- drained; anything else: ask)"; exit 1;;
  *) echo "DR6_NOT_DONE: the switch refused (reason above; after SWITCH_OUTCOME_UNKNOWN: WB4 with bash -s -- drained; otherwise the way back is rbD-B)"; exit 1;;
esac
[ "$(jq -r '[.event, .toKey, .fromKey, (.bad | length)] | map(tostring) | join(" ")' <<<"$SW")" = "PREVIEW_RELEASE_SWITCHED $KEY $OKEY 0" ] || { echo "DR6_NOT_DONE: the switch line is not this switch with nothing in bad"; exit 1; }
MR=$(lc release-retire.mjs mark-retired --label "$OLABEL" 2>&1) || { echo "$MR"; echo "DR6_NOT_DONE: the old release could not be marked retired (reason above): ask"; exit 1; }
echo "$MR"
[ "$(edgekey)" = "200 $KEY" ] || { echo "DR6_NOT_DONE: the edge does not answer from the new release"; exit 1; }
echo "DOWNTIME END $(date -u) ($(( $(date +%s) - $(tail -n 1 "$S/downtime-start-epoch") )) s)"
systemctl start debateai-preview-backup.timer || { echo "DR6_NOT_DONE: the backup timer did not start (the site is up)"; exit 1; }
echo DR6_DONE
```

Then SB13b (the team member's test debate) and, later, SB15 as usual. The old release has no retirement receipt (it
never retired by itself); its `RETIRED` row says `DRAINED`.

The switch accepts the old runner stopped only on this path (`--old-pair-stopped`). After `SWITCH_OUTCOME_UNKNOWN` (its
`next` names `switch --finish … --old-pair-stopped`), or `BACKSTOP`/`TARGET` in `bad`, run WB4 with `bash -s -- drained`:
its finish passes the same flag, so the stopped old runner is expected there too. Then run DR6's lines from
`release-retire.mjs mark-retired` on by hand.

**rbD-A: before DR4** (no migration ran). The old release is still CURRENT and untouched: start it again.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# rbD-A: start the old release again. Only before DR4.
for U in postgresql hatchet hatchet-gateway; do [ "$(systemctl is-active debateai-preview-$U || true)" = active ] || { echo "RBD_A_NOT_DONE: $U is not active (bring the database side back first)"; exit 1; }; done
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$(cat "$S/ledger-before")" ] || { echo "RBD_A_NOT_DONE: a migration ran: use rbD-B"; exit 1; }
T0=$(date +%s)
systemctl start "debateai-preview-api@$OLABEL" || echo "systemctl start of the old API returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u "debateai-preview-api@$OLABEL" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u "debateai-preview-api@$OLABEL" --since "@$T0" -o cat --no-pager | grep 'PREVIEW_API_STARTED' | grep -c "\"releaseKey\":\"$OKEY\"" || true)" -ge 1 ] || { echo "RBD_A_NOT_DONE: the old API did not start on $OKEY"; exit 1; }
systemctl start "debateai-preview-ui@$OLABEL" || echo "systemctl start of the old website returned non-zero"
EK=x; for i in $(seq 1 40); do EK=$(edgekey); [ "$EK" = "200 $OKEY" ] && break; sleep 3; done
[ "$EK" = "200 $OKEY" ] || { echo "RBD_A_NOT_DONE: the edge does not answer from the old release"; exit 1; }
echo "DOWNTIME END (rbD-A) $(date -u)"
systemctl start debateai-preview-backup.timer || { echo "RBD_A_NOT_DONE: the backup timer did not start"; exit 1; }
[ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "RBD_A_NOT_DONE: a gate is not active; the old runner is left stopped"; exit 1; }
T1=$(date +%s); systemctl start "debateai-preview-runner@$OLABEL" || echo "systemctl start of the old runner returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u "debateai-preview-runner@$OLABEL" --since "@$T1" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u "debateai-preview-runner@$OLABEL" --since "@$T1" -o cat --no-pager | grep '^PREVIEW_RUNNER_STARTED ' | grep -c "\"releaseKey\":\"$OKEY\"" || true)" -ge 1 ] || { echo "RBD_A_NOT_DONE: the old runner did not start cleanly"; exit 1; }
echo RBD_A_DONE
```

**rbD-B: from DR4 on.** The new release stops (its runner only with nothing open), the cold copy's data and config
folders come back (the current ones moved aside, never deleted), the lock goes back to its copy from SB1 (the new
release's entry leaves it; the old one's is byte for byte the same), the new release's instance drop-ins move into
`$S/systemd-new/`, the old release's retire timers are turned off (the switch armed them; mark-retired may not have
run) and the boot target's drop-in goes back to SB1's copy (the switch pointed it at the new pair; the current one moves
into `$S`), and the old release starts again. Everything written to the database after DR3 is lost with it.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# rbD-B: from DR4 on. Stop the new release, restore DR3's cold copy (data and config), the lock of SB1, start the old release.
TS=$(date -u +%Y%m%dT%H%M%SZ); PGP=/var/lib/postgresql/18; PGC=/etc/debateai-v3-preview/postgresql; SOCK=/run/debateai-v3-preview/postgresql; UD=/etc/systemd/system
LEDGER0=$(cat "$S/ledger-before"); REG0=$(cat "$S/register-before")
sha256sum -c --quiet "$S/pg18-cold.sha256" && [ -s "$S/release-lock.before.json" ] || { echo "RBD_B_NOT_DONE: the cold copy or the lock copy is missing (nothing stopped)"; exit 1; }
MODE0=$(stat -c '%a %U:%G' "$PGP/v3-preview"); CMODE0=$(stat -c '%a %U:%G' "$PGC")
systemctl stop "debateai-preview-ui@$LABEL" "debateai-preview-api@$LABEL" debateai-preview-backup.timer || true
case "$(systemctl is-active "debateai-preview-runner@$LABEL" || true)" in
  inactive|failed) ;;
  *) OW=x; for i in $(seq 1 120); do OW=$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')"); [ "$OW" = 0 ] && break; sleep 5; done
     [ "$OW" = 0 ] || { echo "RBD_B_NOT_DONE: the new runner still holds $OW open item(s) after 10 minutes; the site is DOWN: ask (a busy runner is never stopped)"; exit 1; }
     systemctl stop "debateai-preview-runner@$LABEL" || true;;
esac
for U in "runner@$LABEL" "ui@$LABEL" "api@$LABEL" "runner@$OLABEL" "ui@$OLABEL" "api@$OLABEL"; do case "$(systemctl is-active "debateai-preview-$U" || true)" in inactive|failed) ;; *) echo "RBD_B_NOT_DONE: $U is still running"; exit 1;; esac; done
for TM in "debateai-preview-runner-retire@$OLABEL.timer" "debateai-preview-runner-retire-check@$OLABEL.timer"; do if [ "$(systemctl show -p LoadState --value "$TM")" = loaded ]; then systemctl disable --now "$TM" || { echo "RBD_B_NOT_DONE: systemctl disable --now $TM failed; the new release is stopped, nothing restored yet"; exit 1; }; fi; done
TG=$UD/debateai-preview.target.d/60-current-release.conf; TGC=$S/rbD-target-$TS
install -d -o root -g root -m 0700 "$TGC"
tar -C "$TGC" -xzf "$S/systemd-before.tgz" debateai-preview.target.d/60-current-release.conf || { echo "RBD_B_NOT_DONE: SB1's copy of the boot target drop-in is missing; the new release is stopped, nothing restored yet"; exit 1; }
grep -qxF "Wants=debateai-preview-api@$OLABEL.service debateai-preview-ui@$OLABEL.service" "$TGC/debateai-preview.target.d/60-current-release.conf" || { echo "RBD_B_NOT_DONE: SB1's copy of the boot target drop-in does not name the old pair; nothing restored yet: ask"; exit 1; }
if ! cmp -s "$TGC/debateai-preview.target.d/60-current-release.conf" "$TG"; then
  if [ -e "$TG" ]; then mv "$TG" "$S/60-current-release.conf.after-$TS" || { echo "RBD_B_NOT_DONE: the boot target drop-in did not move aside; nothing restored yet"; exit 1; }; fi
  install -o root -g root -m 0644 "$TGC/debateai-preview.target.d/60-current-release.conf" "$TG" || { echo "RBD_B_NOT_DONE: SB1's boot target drop-in did not go back (the switch's one is $S/60-current-release.conf.after-$TS)"; exit 1; }
fi
install -d -o root -g root -m 0700 "$S/systemd-new"
for SVC in api ui runner; do if [ -e "$UD/debateai-preview-$SVC@$LABEL.service.d" ]; then mv "$UD/debateai-preview-$SVC@$LABEL.service.d" "$S/systemd-new/"; fi; done
mv "$LOCK" "$S/release-lock.after-$TS.json"; cp -p "$S/release-lock.before.json" "$LOCK"
cmp -s "$S/release-lock.before.json" "$LOCK" || { echo "RBD_B_NOT_DONE: the lock did not go back to its copy"; exit 1; }
systemctl daemon-reload
CID0=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true)
systemctl stop debateai-preview-hatchet-gateway debateai-preview-hatchet debateai-preview-postgresql || { echo "RBD_B_NOT_DONE: a stop failed (look first)"; exit 1; }
mv "$PGP/v3-preview" "$PGP/v3-preview.after-$TS" || { echo "RBD_B_NOT_DONE: the data folder could not be moved aside; the database is STOPPED"; exit 1; }
tar -C "$PGP" -xzf "$S/pg18-v3-preview-cold.tgz" || { echo "RBD_B_NOT_DONE: the data restore failed; the database is STOPPED"; exit 1; }
mv "$PGC" "$PGC.after-$TS" || { echo "RBD_B_NOT_DONE: the config folder could not be moved aside; the database is STOPPED"; exit 1; }
tar -C /etc/debateai-v3-preview -xzf "$S/pg18-v3-preview-config.tgz" || { echo "RBD_B_NOT_DONE: the config restore failed; the database is STOPPED"; exit 1; }
[ "$(stat -c '%a %U:%G' "$PGP/v3-preview")" = "$MODE0" ] && [ "$(stat -c '%a %U:%G' "$PGC")" = "$CMODE0" ] || { echo "RBD_B_NOT_DONE: a restored folder's mode or owner differs; the database is STOPPED"; exit 1; }
systemctl start debateai-preview-postgresql || { echo "RBD_B_NOT_DONE: PostgreSQL did not start on the restored folders"; exit 1; }
for i in $(seq 1 30); do /usr/lib/postgresql/18/bin/pg_isready -q -h "$SOCK" -p 5434 && break; sleep 2; done
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration")" = "$LEDGER0" ] && [ "$(psqlq "SELECT register_version FROM register.register_version ORDER BY register_version DESC LIMIT 1")" = "$REG0" ] || { echo "RBD_B_NOT_DONE: the restored database is not ledger $LEDGER0, register $REG0"; exit 1; }
systemctl start debateai-preview-hatchet || { echo "RBD_B_NOT_DONE: Hatchet did not start"; exit 1; }
CID=; for i in $(seq 1 30); do CID=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true); [ -n "$CID" ] && break; sleep 2; done
[ -n "$CID" ] && { [ -z "$CID0" ] || [ "$CID" = "$CID0" ]; } || { echo "RBD_B_NOT_DONE: the Hatchet container is missing or changed; the gateway is NOT started: stop and ask"; exit 1; }
W=$(/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin /usr/local/bin/node /opt/debateai-v3-preview/operator/gateway/gateway-route-witness.mjs check 2>&1) && echo "$W" | grep -q PASS || { echo "$W" | cut -c1-400; echo "RBD_B_NOT_DONE: the gateway witness did not say PASS; the gateway is NOT started"; exit 1; }
systemctl start debateai-preview-hatchet-gateway.service || { echo "RBD_B_NOT_DONE: the gateway did not start"; exit 1; }
T0=$(date +%s)
systemctl start "debateai-preview-api@$OLABEL" || echo "systemctl start of the old API returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u "debateai-preview-api@$OLABEL" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u "debateai-preview-api@$OLABEL" --since "@$T0" -o cat --no-pager | grep 'PREVIEW_API_STARTED' | grep -c "\"releaseKey\":\"$OKEY\"" || true)" -ge 1 ] || { echo "RBD_B_NOT_DONE: the old API did not start on $OKEY"; exit 1; }
systemctl start "debateai-preview-ui@$OLABEL" || echo "systemctl start of the old website returned non-zero"
EK=x; for i in $(seq 1 40); do EK=$(edgekey); [ "$EK" = "200 $OKEY" ] && break; sleep 3; done
[ "$EK" = "200 $OKEY" ] || { echo "RBD_B_NOT_DONE: the edge does not answer from the old release"; exit 1; }
echo "DOWNTIME END (rbD-B) $(date -u)"
systemctl start debateai-preview-backup.timer || { echo "RBD_B_NOT_DONE: the backup timer did not start"; exit 1; }
[ "$(gs "$GD" "$PD" | jq -r .state)" = active ] && [ "$(gs "$GAN" "$PAN" | jq -r .state)" = active ] || { echo "RBD_B_NOT_DONE: a gate is not active; the old runner is left stopped (ask)"; exit 1; }
T1=$(date +%s); systemctl start "debateai-preview-runner@$OLABEL" || echo "systemctl start of the old runner returned non-zero"
for i in $(seq 1 80); do [ "$(journalctl -u "debateai-preview-runner@$OLABEL" --since "@$T1" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
[ "$(journalctl -u "debateai-preview-runner@$OLABEL" --since "@$T1" -o cat --no-pager | grep '^PREVIEW_RUNNER_STARTED ' | grep -c "\"releaseKey\":\"$OKEY\"" || true)" -ge 1 ] || { echo "RBD_B_NOT_DONE: the old runner did not start cleanly"; exit 1; }
echo "kept for the owner: $PGP/v3-preview.after-$TS and $PGC.after-$TS (they hold secrets), $S/systemd-new, $S/release-lock.after-$TS.json (and $S/60-current-release.conf.after-$TS when the switch had run)"
echo RBD_B_DONE
```

### Infrastructure maintenance

PostgreSQL, Hatchet, Caddy and the gates' software are shared by both releases, so maintenance on them is planned only
while no release drains (spec §4): a restart would cut a draining runner's calls. `release-check.mjs maintenance` must
pass first; the flag `/etc/debateai-v3-preview/lifecycle/maintenance-pending` then exists while the work is planned and
done (no switch or rollback starts, and the release check says `NO_MAINTENANCE` BAD), and moves into `$S` after. The
maintenance itself follows its own reviewed steps. Both scripts read the names file of the release that is current now,
or, for PM2 inside them, the uploading release's (see "Payment marks: the files and Caddy's rule").

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# MT1: no release drains, then the maintenance flag. Nothing else changes.
MF=/etc/debateai-v3-preview/lifecycle/maintenance-pending
[ ! -e "$MF" ] || { echo "MT1_NOT_DONE: the maintenance flag exists already (look first)"; exit 1; }
MA=$(lc release-check.mjs maintenance 2>&1) || { echo "$MA"; echo "MT1_NOT_DONE: a release is draining (named above): plan the maintenance once it has retired"; exit 1; }
echo "$MA"
install -o root -g root -m 0600 /dev/null "$MF"
echo "MAINTENANCE_PENDING since $(date -u)"
echo MT1_DONE
```

After the maintenance:

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# MT2: the maintenance is over: the flag moves into S, and the release table is read once.
MF=/etc/debateai-v3-preview/lifecycle/maintenance-pending
[ -e "$MF" ] || { echo "MT2_NOT_DONE: there is no maintenance flag"; exit 1; }
mv "$MF" "$S/maintenance-pending.done-$(date -u +%Y%m%dT%H%M%SZ)"
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "MT2_NOT_DONE: release-check.mjs status refused, or its bad list names a draining runner stopped with open work (run its next command, then this step again; the flag is already moved)"; exit 1; }
jq -r '.releases[] | "\(.label) \(.state) units \(.units.api)/\(.units.ui)/\(.units.runner)"' <<<"$ST"
echo MT2_DONE
```

### Payment marks: the files and Caddy's rule

**In plain words.** The website's footer and checkout show the NETOPIA, Visa and Mastercard marks at
`/payment-marks/netopia.svg`, `/payment-marks/visa.svg` and `/payment-marks/mastercard.svg` (`deploy/vps/README.md`
§14.7). Their official files are never in the repository or a release folder: the repository is public, the brands'
terms forbid redistributing their artwork, and a release folder must equal git exactly. Root keeps them in
`/etc/debateai-v3-preview/public/payment-marks/` (a root-owned 0755 folder, each file root-owned 0644), outside every
release, and Caddy serves exactly those three names from there, behind the test-site password. The website shows the
marks its setting `PAYMENT_MARKS_AVAILABLE` names, in its release's own ui file. Three steps:
- PM1 copies the files in. It runs any time after SB1, and again whenever a file changes (for example when NETOPIA's
  logo arrives). It never removes a file. Once PM2's rule is in, Caddy serves a new file at once, with no restart.
- PM2 adds Caddy's rule, once, inside a maintenance window (MT1 before it, MT2 after it), on the owner's yes.
- SB5b ("Side-by-side release" above) writes the list into the new release's ui file. The website reads it when it
  starts, so the footer changes with the switch.

**The first time (the first upload whose code has these steps, T+1 at the earliest).** PM1 (any time after SB1) → SB5b →
SB6 (the owner's yes names PM2) → MT1, PM2, MT2 → SB7 … SB13 (on the drained path: DR1, SB5b, then MT1, PM2, MT2, then
DR2). All of them run with that upload's names file (SB1's): its `cslots` is that release's own tool, which knows
`add-payment-marks` (T's does not; MT1 and MT2 only need its `lc` and `$S`). T's website never shows the marks; the new
release's shows them from the switch on. **Later**, the rule stays: a change of the list is PM1 and SB5b only, in the
next upload. SB5b is needed again after going back to a release whose ui file has no line (the next upload derives its
file from that one, so the marks would vanish at its switch, with no error).

#### PM1. The files

From the Mac, copy the official files with `scp` into a folder of your own on the server (for example
`payment-marks-in` in your home folder there). The files on the Mac are in `DebateAIRO/docs/business/payment-marks/`
(never in the repository). Only `netopia.svg`, `visa.svg` and `mastercard.svg` are read; PM1 stops on a file that is
not a plain SVG of at most 512 KiB, or that holds a script, a `javascript:` link, a `foreignObject` or an `on…=`
handler. It prints the list of the marks now in the folder: that is the value for SB5b. Run it with the names file of
the newest release (its `$S` keeps every file PM1 replaces).

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# PM1: the payment marks' files into root's own folder outside every release. Caddy, the releases and their env files are not touched.
IN='<the folder you copied the files to>'
PMD=/etc/debateai-v3-preview/public/payment-marks
[ -d "$IN" ] || { echo "PM1_NOT_DONE: IN is not the folder you copied the files to"; exit 1; }
FOUND=''
for M in netopia visa mastercard; do
  F=$IN/$M.svg
  if [ ! -e "$F" ] && [ ! -L "$F" ]; then continue; fi
  [ "$(stat -c '%F %h' "$F")" = "regular file 1" ] || { echo "PM1_NOT_DONE: $F is not a regular file with one link"; exit 1; }
  [ "$(stat -c '%s' "$F")" -le 524288 ] || { echo "PM1_NOT_DONE: $F is larger than 512 KiB"; exit 1; }
  grep -q '<svg' <(head -c 2048 "$F") || { echo "PM1_NOT_DONE: $F has no <svg in its first 2048 bytes"; exit 1; }
  if grep -qiE '<script|javascript:|<foreignObject|[[:space:]]on[a-z]+[[:space:]]*=' "$F"; then echo "PM1_NOT_DONE: $F holds a script, a javascript: link, a foreignObject or an on...= handler (ask for a clean file)"; exit 1; fi
  FOUND="$FOUND $M"
done
[ -n "$FOUND" ] || { echo "PM1_NOT_DONE: none of netopia.svg, visa.svg, mastercard.svg is in $IN"; exit 1; }
if [ ! -e "$PMD" ] && [ ! -L "$PMD" ]; then install -d -m 0755 -o root -g root "$PMD"; fi
[ "$(stat -c '%F %U %G %a' "$PMD")" = "directory root root 755" ] && [ "$(realpath "$PMD")" = "$PMD" ] || { echo "PM1_NOT_DONE: $PMD is not root's own 0755 folder (look first)"; exit 1; }
TS=$(date -u +%Y%m%dT%H%M%SZ)
for M in $FOUND; do
  F=$IN/$M.svg; T=$PMD/$M.svg
  if [ -e "$T" ] && cmp -s "$F" "$T"; then echo "$M.svg: unchanged ($(stat -c '%s' "$T") bytes, sha256 $(sha256sum "$T" | cut -c1-16))"; continue; fi
  if [ -e "$T" ]; then cp -p "$T" "$S/payment-mark-$M.svg.before-$TS"; echo "$M.svg: the one it replaces is in $S/payment-mark-$M.svg.before-$TS"; fi
  install -o root -g root -m 0644 "$F" "$T.new"
  mv "$T.new" "$T"
  cmp -s "$F" "$T" || { echo "PM1_NOT_DONE: $T is not the copied file: ask"; exit 1; }
  echo "$M.svg: copied ($(stat -c '%s' "$T") bytes, sha256 $(sha256sum "$T" | cut -c1-16))"
done
LIST=''
for M in netopia visa mastercard; do if [ -f "$PMD/$M.svg" ]; then LIST=${LIST:+$LIST,}$M; fi; done
echo "the marks in $PMD, the value for SB5b: $LIST"
echo PM1_DONE
```

#### PM2. Caddy's rule (once)

The first time only, between MT1 and MT2, after the owner's fresh yes names it (SB6). `caddy-slots.mjs
add-payment-marks` writes a copy of the live two-slot file into `$S` with only the marks rule added: the three names,
from root's folder, right before the public route's main proxy (after the readiness refusal and the password). As in
TB7, the new file goes in with a restart (about one second), never a reload; on any miss the old file goes back and
Caddy restarts again: the site runs on as before, without the rule. PM2 first checks the site answers 200, and keeps
its copy of the live file before the tool reads it; it installs nothing if the live file changed meanwhile.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# PM2: Caddy's payment-marks rule in place, inside the maintenance window, restart; then the edge, the password and /readyz.
T0=$(date +%s)
PMD=/etc/debateai-v3-preview/public/payment-marks
PMJ='["/payment-marks/netopia.svg","/payment-marks/visa.svg","/payment-marks/mastercard.svg"]'
[ -e /etc/debateai-v3-preview/lifecycle/maintenance-pending ] || { echo "PM2_NOT_DONE: there is no maintenance flag (MT1 first; nothing changed)"; exit 1; }
grep -q 'add-payment-marks' "$CAPI/dialectical-engine/deploy/preview-release/v1/caddy-slots.mjs" || { echo "PM2_NOT_DONE: this names file's caddy-slots.mjs has no add-payment-marks: use the names file of a release from T+1 on (nothing changed)"; exit 1; }
EK=$(edgekey); echo "edge 127.0.0.1:3090/readyz before PM2: $EK"
[ "${EK%% *}" = 200 ] || { echo "PM2_NOT_DONE: the site is not healthy before PM2 (the edge answered $EK, not 200; nothing changed): ask"; exit 1; }
[ "$(stat -c '%F %U %G %a' "$PMD")" = "directory root root 755" ] && [ "$(realpath "$PMD")" = "$PMD" ] || { echo "PM2_NOT_DONE: $PMD is not root's own 0755 folder (PM1 first; nothing changed)"; exit 1; }
[ ! -e "$S/Caddyfile.payment-marks" ] && [ ! -e "$S/Caddyfile.before-payment-marks" ] || { echo "PM2_NOT_DONE: $S/Caddyfile.payment-marks or $S/Caddyfile.before-payment-marks exists (PM2 ran before, or a refused run's file stays: look first)"; exit 1; }
[ "$(stat -c '%a %U' "$C")" = "644 root" ] || { echo "PM2_NOT_DONE: the Caddyfile is not root-owned 0644 (nothing changed)"; exit 1; }
cp -p "$C" "$S/Caddyfile.before-payment-marks"
TR=$(cslots add-payment-marks --in "$C" --out "$S/Caddyfile.payment-marks" 2>&1) || { echo "$TR"; echo "PM2_NOT_DONE: the tool refused (reason above; CADDY_ALREADY_PAYMENT_MARKS: the live file mentions payment-marks already, look at it first; nothing changed)"; exit 1; }
echo "$TR"
[ "$(jq -r '[.event, .folder, (.files | join(","))] | map(tostring) | join(" ")' <<<"$TR")" = "PREVIEW_CADDY_PAYMENT_MARKS $PMD netopia.svg,visa.svg,mastercard.svg" ] || { echo "PM2_NOT_DONE: the tool did not report the marks rule for $PMD (nothing changed)"; exit 1; }
cad validate --config "$S/Caddyfile.payment-marks" --adapter caddyfile >/dev/null 2>&1 || { echo "PM2_NOT_DONE: Caddy's validation refused the new file (nothing changed): ask"; exit 1; }
order() { cad adapt --config "$1" --adapter caddyfile 2>/dev/null | jq -r --argjson m "$PMJ" 'walk(if type == "object" and has("routes") then .routes |= map(select([.match[]?.path[]?] != $m)) else . end) | [.apps.http.servers[].routes[] | select(.match[0].host[0]=="v3-preview.dezbatere.ro") | .handle[] | .. | objects | select(has("handler")) | .handler] | join(" > ")'; }
O1=$(order "$C"); O2=$(order "$S/Caddyfile.payment-marks")
echo "handlers, live:       $O1"; echo "handlers, with marks: $O2 (the marks route left out)"
[ -n "$O2" ] && [ "$O1" = "$O2" ] || { echo "PM2_NOT_DONE: the main route's handler order changed beyond the marks route (nothing changed): ask"; exit 1; }
AD=$(cad adapt --config "$S/Caddyfile.payment-marks" --adapter caddyfile 2>/dev/null)
FS=$(jq -r '[.. | objects | select(.handler? == "file_server")] | length' <<<"$AD")
VR=$(jq -r '[.. | objects | select(.handler? == "vars" and has("root")) | .root] | unique | join(",")' <<<"$AD")
MR=$(jq -r --argjson m "$PMJ" '[.. | objects | select(has("routes")) | .routes[]? | [.match[]?.path[]?] | select(any(.[]; startswith("/payment-marks")))] == [$m]' <<<"$AD")
echo "file servers: $FS; roots: $VR; one route for exactly the three marks: $MR"
[ "$FS" = 1 ] || { echo "PM2_NOT_DONE: the new file has $FS file servers, not exactly one (nothing changed): ask"; exit 1; }
[ "$VR" = "$PMD" ] || { echo "PM2_NOT_DONE: the new file serves files from $VR, not only $PMD (nothing changed): ask"; exit 1; }
[ "$MR" = true ] || { echo "PM2_NOT_DONE: not exactly one route matches exactly the three marks' paths (nothing changed): ask"; exit 1; }
back() { R="is back"; install -o root -g root -m 0644 "$S/Caddyfile.before-payment-marks" "$C.new" && mv "$C.new" "$C" && cmp -s "$S/Caddyfile.before-payment-marks" "$C" || R="did NOT go back (the live file may still be the one with the marks rule)"; systemctl restart caddy || true; CA=$(systemctl is-active caddy || true); echo "PM2_NOT_DONE: $1; the old Caddyfile $R; after its restart Caddy is $CA (active: the site runs as before, without the marks rule; anything else: the site is DOWN, look at caddy now) (ask)"; exit 1; }
cmp -s "$C" "$S/Caddyfile.before-payment-marks" || { echo "PM2_NOT_DONE: the live Caddyfile changed during PM2 (nothing changed): ask"; exit 1; }
install -o root -g root -m 0644 "$S/Caddyfile.payment-marks" "$C.new"
mv "$C.new" "$C"
systemctl restart caddy || back "caddy did not restart on the new file"
cmp -s "$S/Caddyfile.payment-marks" "$C" || back "the new file is not the live file"
[ "$(systemctl is-active caddy || true)" = active ] || back "caddy is not active on the new file"
EK="000 none"; for i in $(seq 1 30); do EK=$(edgekey); [ "${EK%% *}" = 200 ] && [ "${EK#* }" != none ] && break; sleep 1; done
echo "edge 127.0.0.1:3090/readyz: $EK"
[ "${EK%% *}" = 200 ] && [ "${EK#* }" != none ] || back "the edge did not answer 200 with a release key within 30 s"
PC=$(curl -s -o /dev/null -m 15 -w '%{http_code}' https://v3-preview.dezbatere.ro/ || true); echo "public / without the password: $PC"
[ "$PC" = 401 ] || back "the public site does not answer 401 without the password (got $PC)"
VC=$(curl -s -o /dev/null -m 15 -w '%{http_code}' https://v3-preview.dezbatere.ro/payment-marks/visa.svg || true); echo "public /payment-marks/visa.svg without the password: $VC"
[ "$VC" = 401 ] || back "the marks are not behind the password (visa.svg without it answered $VC, not 401)"
RP=$(curl -s -o /dev/null -m 15 -w '%{http_code}' https://v3-preview.dezbatere.ro/readyz || true); echo "public /readyz without the password: $RP"
[ "$RP" = 404 ] || back "the public route does not refuse /readyz with its own 404 before the password (got $RP)"
echo "Caddy restarted with the payment-marks rule, checked $(( $(date +%s) - T0 )) s after this step began"
echo PM2_DONE
```

If PM2 stops, do not go on to SB7 (or DR2) with the list in place: run PM2 again once the cause is fixed (a stopped
run leaves its copies `$S/Caddyfile.before-payment-marks` and `$S/Caddyfile.payment-marks`: move them aside first), or
put `$S/ui-$LABEL.env.before-marks` back as `ui-$LABEL.env`. SB10 and DR5 refuse to go on while the ui file names marks
that Caddy does not serve.

Then MT2. In the browser, with the test-site password, open `https://v3-preview.dezbatere.ro/payment-marks/visa.svg`:
the mark shows (one PM1 copied in). If it does not show, stop here, before SB7 (or DR2), and ask.
`https://v3-preview.dezbatere.ro/payment-marks/amex.svg` answers 404 from the website: any other path under
`/payment-marks/` goes on to the website as before. The footer shows the marks only from the switch to a release whose
ui file names them (SB5b).
