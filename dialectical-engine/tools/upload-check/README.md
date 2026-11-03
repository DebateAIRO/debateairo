# The pre-upload check on the Mac

## In plain words

Before a release goes to the test server, this command tries three things the server does during an upload, on the
exact commit about to be uploaded, the way the server does them. It was built after R22's upload on 2 November 2026,
which stopped six times on faults no test had seen. Three of those six are the kind this check can find.

- **It runs only when the owner asks.** It is never a required step of an upload, and it is not part of the automatic
  checks on GitHub.
- **It never touches the server**, reads no secret, and spends no money.
- **It is quick.** On 2 November each run took about one minute on this Mac, the website build the longest part, plus
  any wait for a quiet Mac. It uses a few GB of temporary disk (a whole installed release), all deleted at the end.

The upload guide's own section about it is "Before an upload: the Mac check (when the owner asks)" in
`deploy/preview-release/v1/README.md`. It also lists what none of the checks can see, and the three house rules for
those faults.

## How to run it

From the `dialectical-engine/` folder of a checkout that holds the commit (here R22's commit; put the release's own
commit in its place):

```sh
node tools/upload-check/run.mjs --rev af7e457b5
```

What it needs:

- **Node v26.8.2 and pnpm 11.20.0 exactly**, the versions the server's tools require. Anything else is refused before
  anything starts.
- **The internet**, for one package download (the "online fill": it fills a fresh package store once, and every
  install after it must download nothing, as the server's staging does).
- **Port 5434 free.** The start checks expect their database on that port, so the throwaway database must listen there.
- **A quiet Mac.** Before it starts, it waits until no other test run and no test database is going, and at least 40%
  of the memory is free, looking every 15 seconds for up to an hour. This Mac has frozen under parallel heavy work, so
  ask the other open sessions to hold their test runs first. Never run two of these checks at once.

While it runs, it prints one progress line per check (`check 1 of 3: tools-folder`, and so on) on the error output
(stderr), apart from the report. The report comes at the end, on the normal output.

Everything it makes goes into one new folder under the Mac's temporary folder, named `upload-check-<commit>-<time>`.
The one exception is a small connection file that tsx opens in the Mac's temporary folder while check 3 runs and
removes itself when it ends; a path inside the work folder would be longer than a Mac allows for it. That folder is deleted when the run ends: when it finishes, on Ctrl-C, on a stop (`kill`) and when its terminal or
app is closed. First everything the run started is stopped (the package installs, the website build, the throwaway
database), then the folder is deleted. If the folder still cannot be deleted, the run says so in one line that starts
`UPLOAD_CHECK_WORK_FOLDER_LEFT` and names the folder.

A forced kill (`kill -9`, or the Mac losing power) cannot be caught, so it leaves the folder behind. When no upload
check is running, this one line finds every leftover folder, prints its name and deletes it:

```sh
find "${TMPDIR%/}" -maxdepth 1 -name 'upload-check-*' -print -exec rm -rf {} +
```

## The three checks

1. **`tools-folder`.** On the server, the shared tools folder holds only three folders of the code:
   `deploy/preview-lifecycle`, `deploy/preview-auth-dev` and `deploy/preview-release`. The check copies exactly those
   three, as they are at the commit (with `git archive`, so nothing else on the Mac can help), into an empty folder,
   and loads every tool there on its own. A tool that reaches outside the three folders fails here, as one did on
   2 November (fault 3). Seven tools always run from a release folder, where the packages are installed; they are
   named in one fixed list (`RELEASE_FOLDER_TOOLS` in `tools-folder.mjs`) and are loaded in check 2 instead.
2. **`website-build`.** It installs a release the way the guide's step A3 does: one online fill, an install that must
   say `downloaded 0`, then the generated files. Then it builds the website with the settings the release tool itself
   gives the build, and loads the seven release-folder tools there. On 2 November the server's build applied the plain
   7-day package rule to packages the owner had allowed early (fault 2). This check can only see that kind of fault
   while an early allowance (the owner's permission to use a package version before it is 7 days old) is in force.
3. **`start-checks`.** It starts a throwaway database (PostgreSQL) that looks like the server's to the start checks:
   the same database name, port and cluster name. It applies every database step (migration) of the commit, makes the
   production logins (their names and roles) with the product's own tool, and seals a settings version from made-up
   values. Then it runs the API's and the runner's own start checks as those logins, not as the database's
   all-powerful administrator. On 2 November the runner's start check expected one database role, and row security
   gives its login two (fault 5).

## How to read the report

The report is a few plain lines. Its first line names the commit. Then each check has one line, with its own lines
indented beneath it, and the last line is the verdict. For example, the report for the code on the morning of
2 November, which had two of the faults, read like this (shortened):

- `Upload check of f8d39fc26c43`: the commit, by its first 12 characters.
- `tools-folder: REFUSED (1.466 s)`, then four lines such as
  `preview-release/v1/release-artifacts.mjs: ERR_MODULE_NOT_FOUND`: four tools asked for a file that is not in the
  shared tools folder (fault 3).
- `website-build: not checked (25.576 s)`, then `website build: this commit has no uiBuildEnvironment export`: the
  commit is too old for check 2.
- `start-checks: REFUSED (14.193 s)`, then a few lines on how the throwaway database was set up, then
  `api runtime login: passed`, then `runner login: refused` with the product's own reason beneath it (the runner login
  is a member of two roles, where that day's check expected one: fault 5), then `api system logins: passed`.
- `NOT PASSED`: the verdict.

The full reports of the three proof runs of 2 November are in the description of the pull request that added this
README.

**Each check says one of three things:**

- **`passed`**: it did what the server does, and nothing failed.
- **`REFUSED`**: something failed. The lines beneath say what. A tool line names the tool and how it failed
  (`ERR_MODULE_NOT_FOUND`: the tool asked for a file that is not there). A start-check line names the login that was
  refused and the reason the product's own check gave.
- **`not checked`**: the check could not do its work, and one line says why. The usual reason is a commit older than
  something the check uses: check 2 needs the release tool's shared build settings (`uiBuildEnvironment`), so it says
  `not checked` for R22 and older. **`not checked` never counts as passed.** A `not checked` that does not name a
  missing export is a fault in the commit's own setup (for example a database step, or migration, that fails on an
  empty database). Bring it to the owner.

**The lines worth knowing:**

- `early allowances in force: …` (check 2) says how many of the owner's early package allowances apply today, and until
  when. `none` means check 2 cannot see the package-rule fault today, because there is nothing for it to catch.
- `3 recovery roles granted …` (check 3): the check gives the API's logins the three recovery roles (password reset,
  backup email, two-step-login recovery), as section 3 of `docs/releases/2026-10-23-row-level-security.md` says the
  server's deployment does.
- `known gap: …` (check 3): on the server, the logins were made by hand, in step B4 of R22's own upload guide (outside
  this repository). So this check trusts the product's list of production logins to match the server's. It cannot see
  a difference between the two.

**The last line and the exit code:**

| Last line | Exit code | Meaning |
|---|---|---|
| `ALL PASSED` | 0 | every check passed |
| `NOT PASSED` | 1 | at least one check was refused or not checked |
| a line starting `UPLOAD_CHECK_` | 2 | the run could not happen at all (see below) |

A `NOT PASSED` is a reason to bring the report to the owner before the upload.

**When the run could not happen** (exit code 2), the one line says why:

- `UPLOAD_CHECK_USAGE`: the command was not `--rev <commit>`.
- `UPLOAD_CHECK_REV_UNKNOWN`: this checkout has no such commit (fetch it first).
- `UPLOAD_CHECK_RUNTIME_REFUSED`: the wrong Node or pnpm version.
- `UPLOAD_CHECK_HOST_BUSY`: the Mac stayed busy for the whole hour.
- `UPLOAD_CHECK_WORK_FOLDER_EXISTS`, `UPLOAD_CHECK_RUN_FAILED`, `UPLOAD_CHECK_CLEANUP_FAILED`: the work folder could not
  be made, a check broke, or the work folder could not be removed. The line names the folder or the error.

Inside a check, a refusal of its own also starts with `UPLOAD_CHECK_`, for example `UPLOAD_CHECK_PORT_BUSY` when
something already listens on port 5434 (check 3 then starts nothing).

## What it does not do

- It does not run the upload guide's steps and does not copy the server. Faults 1, 4 and 6 of 2 November lived there;
  the guide's three house rules cover them.
- It does not test the AIs' answers.
- It leaves out the server-only checks that folders belong to root.

## The files

- `run.mjs`: the one command. It waits its turn, makes the work folder, runs the three checks in order, prints the
  report and always cleans up.
- `tools-folder.mjs`: check 1.
- `website-build.mjs`: check 2.
- `start-checks.mjs` and `start-checks-driver.ts`: check 3. The driver is copied into the installed release and runs
  there with that release's own packages, so the start checks are the commit's own code.

Their tests are `tests/unit/upload-check-*.test.ts` (checks 1 and 2, and the command) and
`tests/integration/upload-check-start-checks.test.ts` (check 3, with a real throwaway database).
