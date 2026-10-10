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
the free model list, `NODE_ENV=production`). They are the same constants the reviewed start-up
check demands from `ui.env`, so the build and the running site cannot disagree. `build-env`
prints them with their sha256 so you can compare `ui.env` by hash, without printing it.

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
| `build-env` | prints the fixed public UI build values and their sha256; reads no file |
| `ui-build --source <ui source manifest> --out <file>` | checks the UI root against its manifest, builds with the fixed values, re-checks that the build changed no inventoried source byte, checks the build, writes the build manifest |
| `verify --source <file> [--ui-build <file>]` | re-runs `verifySourceManifest` (and `verifyUiBuildManifest`) against the exact file bytes |
| `operator-digest --source <file>` | prints `operatorManifestSha256` (the shared function the launchers use) and the operator file count |
| `launch-plan --service api\|ui\|runner --from <existing plan> --root <release root> --source-manifest <file> [--ui-build <file>] --native-attestation <file> --out <dir>/<service>-launch.json` | new launch plan: release fields from the manifests, everything else from `--from`; `validateLaunchPlan` before writing |
| `native-plan --operation apply-and-plan\|verify --from <existing native plan> --source-manifest <candidate api manifest> --out <file>` | new native plan for a candidate API root; `verify` carries the `approval` of `--from` over unchanged; the reviewed `validateNativePlan` before writing |

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
CAPI=$R/auth-dev-candidate-$LABEL-api; CUI=$R/auth-dev-candidate-$LABEL-ui
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

`jq` must be installed (`command -v jq`); if it is missing, the variables come out empty and the
tool refuses. Without the lifecycle, set `OLDA` and `OLDU` to the live plans named in the newest
release drop-in instead. Fallback plans go in their own folder (the plan file name is fixed per
service), with `--root` and `--source-manifest` of the fallback folders.

The verify plan keeps the live register publication. Its `nodeRuntimeVersion` row therefore
still names the earlier source revision and operator digest; the native verify does not compare
that row, and a new publication is a separate, reviewed step.

Then pin and restart exactly as `deploy/preview-lifecycle/v1/README.md` "Pinning a NEW release"
says (`prestart.mjs pin --from "$ART/api-launch.json"`, the same for ui, regenerate both release
drop-ins, `daemon-reload`, restart api then ui).
