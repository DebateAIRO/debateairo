import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

/**
 * deploy/vps/backup.sh, run for real through bash with every outside program replaced by a stub
 * written here (sudo, pg_dump, pg_dumpall, age, sha256sum, rclone, scp, and date for the weekday).
 * The stubs for rclone and scp keep the "remote" in a local directory, so a test can make the
 * copy vanish or arrive damaged and see whether the script still prints its receipt.
 *
 * Findings fixed here (security review 2026-10-04):
 *  - no off-host destination printed a warning, then BACKUP_OK, and exited 0;
 *  - BACKUP_OK followed any copy command that exited 0, with nothing checking the remote;
 *  - prune() died under pipefail when a directory held no artefact yet (grep found nothing), so
 *    every weekday run before the first Sunday stopped before the off-host copy.
 */

const execute = promisify(execFile);
const SCRIPT = resolve(process.cwd(), "deploy/vps/backup.sh");

/** The real `date`, found on this machine's PATH, so the stub can hand everything but the weekday to it. */
function realProgram(name: string): string {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory === "") continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not in this directory
    }
  }
  throw new Error(`${name} is not on PATH`);
}

const STUBS = (realDate: string): Record<string, string> => ({
  sudo: `#!/bin/sh
# sudo -u <user> <program...>: run the program as ourselves.
shift 2
exec "$@"
`,
  pg_dumpall: `#!/bin/sh
printf -- '-- globals stub\\n'
`,
  pg_dump: `#!/bin/sh
printf 'dump stub\\n'
`,
  age: `#!/bin/sh
# age -r <recipient>: a recognisable header, then the plaintext. Encryption is not under test.
printf 'age-stub %s\\n' "$2"
cat
`,
  sha256sum: `#!/bin/sh
printf '%064d  %s\\n' 0 "$1"
`,
  date: `#!/bin/sh
if [ "$*" = "-u +%u" ]; then printf '%s\\n' "$FAKE_DOW"; exit 0; fi
exec "${realDate}" "$@"
`,
  rclone: `#!/usr/bin/env bash
# rclone stand-in. "<name>:<path>" lives at $FAKE_REMOTE_ROOT/<path>.
set -euo pipefail
printf 'rclone %s\\n' "$*" >> "$FAKE_REMOTE_LOG"
command="$1"; shift
local_of() { printf '%s/%s' "$FAKE_REMOTE_ROOT" "\${1#*:}"; }
case "$command" in
  copy)
    source="$1"; target="$(local_of "$2")"
    if [ "\${FAKE_REMOTE_MODE:-}" = "drop" ]; then exit 0; fi
    mkdir -p "$target"
    cp -R "$source"/. "$target"/
    if [ "\${FAKE_REMOTE_MODE:-}" = "corrupt" ]; then
      find "$target" -name '*.tar.age' -exec sh -c 'printf x >> "$1"' _ {} \\;
    fi ;;
  check)
    source="$1"; target="$(local_of "$2")"; shift 2
    status=0; previous=""
    for argument in "$@"; do
      if [ "$previous" = "--include" ]; then cmp -s "$source$argument" "$target$argument" || status=1; fi
      previous="$argument"
    done
    exit "$status" ;;
  *) exit 2 ;;
esac
`,
  scp: `#!/usr/bin/env bash
# scp stand-in. "<host>:<path>" lives at $FAKE_REMOTE_ROOT/<path>.
set -euo pipefail
printf 'scp %s\\n' "$*" >> "$FAKE_REMOTE_LOG"
operands=(); skip=""
for argument in "$@"; do
  if [ -n "$skip" ]; then skip=""; continue; fi
  case "$argument" in -o) skip=1 ;; -*) ;; *) operands+=("$argument") ;; esac
done
source="\${operands[0]}"; target="\${operands[1]}"
case "$target" in
  *:*)
    remote="$FAKE_REMOTE_ROOT/\${target#*:}"
    if [ "\${FAKE_REMOTE_MODE:-}" = "drop" ]; then exit 0; fi
    mkdir -p "$remote"
    cp -R "$source" "$remote"/
    if [ "\${FAKE_REMOTE_MODE:-}" = "corrupt" ]; then
      find "$remote" -name '*.tar.age' -exec sh -c 'printf x >> "$1"' _ {} \\;
    fi ;;
  *)
    cp "$FAKE_REMOTE_ROOT/\${source#*:}" "$target" ;;
esac
`
});

type Staged = Readonly<{ root: string; bin: string; backup: string; remote: string; log: string; config: string }>;
type Destination = Readonly<{ rclone?: string; scp?: string }>;

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function stage(destination: Destination, extraStubs: Record<string, string> = {}): Promise<Staged> {
  const root = await mkdtemp(join(tmpdir(), "backup-script-"));
  roots.push(root);
  const bin = join(root, "bin");
  const custody = join(root, "custody");
  const keys = join(root, "keys");
  const remote = join(root, "remote");
  for (const directory of [bin, remote, join(custody, "user-deks"), join(custody, "publication-keys"), join(custody, "audit-keys"), keys]) {
    await mkdir(directory, { recursive: true });
  }
  for (const [name, body] of Object.entries({ ...STUBS(realProgram("date")), ...extraStubs })) {
    await writeFile(join(bin, name), body);
    await chmod(join(bin, name), 0o755);
  }
  await writeFile(join(custody, "user-deks", "dek.json"), "{}\n");
  const keyNames = ["kek.bin", "corpus-kek.bin", "blind-index-key.bin", "audit-source-ip-salt.bin", "support-kek.bin", "records-key.bin"];
  for (const name of keyNames) await writeFile(join(keys, name), `${name}\n`);
  const backup = join(root, "backups");
  const lines = [
    "BACKUP_DATA_RECIPIENT=age1testdatarecipient",
    "BACKUP_ESCROW_RECIPIENT=age1testescrowrecipient",
    `BACKUP_DIR=${backup}`,
    `USER_DEK_STORE_PATH=${join(custody, "user-deks")}`,
    `PUBLICATION_KEY_STORE_PATH=${join(custody, "publication-keys")}`,
    `AUDIT_KEY_STORE_PATH=${join(custody, "audit-keys")}`,
    `KEK_PATH=${join(keys, "kek.bin")}`,
    `CORPUS_KEK_PATH=${join(keys, "corpus-kek.bin")}`,
    `BLIND_INDEX_KEY_PATH=${join(keys, "blind-index-key.bin")}`,
    `AUDIT_SOURCE_IP_SALT_PATH=${join(keys, "audit-source-ip-salt.bin")}`,
    `SUPPORT_KEK_PATH=${join(keys, "support-kek.bin")}`,
    `RECORDS_KEY_PATH=${join(keys, "records-key.bin")}`,
    ...(destination.rclone === undefined ? [] : [`BACKUP_RCLONE_REMOTE=${destination.rclone}`]),
    ...(destination.scp === undefined ? [] : [`BACKUP_SCP_TARGET=${destination.scp}`])
  ];
  const config = join(root, "backup.conf");
  await writeFile(config, `${lines.join("\n")}\n`);
  return { root, bin, backup, remote, log: join(root, "remote.log"), config };
}

async function backup(
  staged: Staged,
  options: Readonly<{ dayOfWeek: string; mode?: "drop" | "corrupt" }>
): Promise<{ code: number; stdout: string; stderr: string }> {
  const environment: Record<string, string> = {
    PATH: `${staged.bin}${delimiter}${process.env.PATH ?? ""}`,
    DEBATEAI_BACKUP_CONFIG: staged.config,
    TMPDIR: staged.root,
    FAKE_DOW: options.dayOfWeek,
    FAKE_REMOTE_ROOT: staged.remote,
    FAKE_REMOTE_LOG: staged.log,
    ...(options.mode === undefined ? {} : { FAKE_REMOTE_MODE: options.mode })
  };
  try {
    const { stdout, stderr } = await execute("bash", [SCRIPT], { env: environment });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: string; stderr?: string };
    return { code: typeof failure.code === "number" ? failure.code : -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

const remoteLog = async (staged: Staged): Promise<string[]> =>
  (await readFile(staged.log, "utf8").catch(() => "")).split("\n").filter(Boolean);
const artefacts = async (directory: string): Promise<string[]> =>
  (await readdir(directory)).filter((name) => name.endsWith(".tar.age")).sort();

/** Seeds `count` artefacts in `directory`, the n-th one n days old, so ls -t orders them. */
async function seed(directory: string, count: number): Promise<string[]> {
  await mkdir(directory, { recursive: true });
  const names: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const name = `debateai-2020${String(index).padStart(4, "0")}T000000Z.tar.age`;
    const when = new Date(Date.now() - index * 86_400_000);
    await writeFile(join(directory, name), "old\n");
    await utimes(join(directory, name), when, when);
    names.push(name);
  }
  return names;
}

const SUNDAY = "7";
const TUESDAY = "2";

describe("deploy/vps/backup.sh: exactly one off-host destination, checked before any work", () => {
  // Sunday, so the old prune bug (empty weekly/) cannot be what stops these runs.
  it("refuses to run with no destination: nonzero, no receipt, nothing written", async () => {
    const staged = await stage({});
    const result = await backup(staged, { dayOfWeek: SUNDAY });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/^BACKUP_REFUSED no off-host destination/mu);
    expect(result.stdout).not.toContain("BACKUP_OK");
    await expect(readdir(staged.backup)).rejects.toThrow();
  });

  it("refuses to run with both destinations set: nonzero, no receipt, no copy attempted", async () => {
    const staged = await stage({ rclone: "offsite:debateai", scp: "backup@offsite.test:/srv/debateai" });
    const result = await backup(staged, { dayOfWeek: SUNDAY });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/^BACKUP_REFUSED both BACKUP_RCLONE_REMOTE and BACKUP_SCP_TARGET are set/mu);
    expect(result.stdout).not.toContain("BACKUP_OK");
    expect(await remoteLog(staged)).toEqual([]);
  });
});

describe("deploy/vps/backup.sh: BACKUP_OK only after the off-host copy is verified", () => {
  it("rclone: copies, checks exactly this run's artefact and escrow envelope, then prints the receipt", async () => {
    const staged = await stage({ rclone: "offsite:debateai" });
    const result = await backup(staged, { dayOfWeek: SUNDAY });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^BACKUP_OK [0-9a-f]{64} \d+ \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/mu);
    const [artefact] = await artefacts(join(staged.backup, "daily"));
    expect(await readFile(join(staged.remote, "debateai", "daily", artefact!), "utf8"))
      .toBe(await readFile(join(staged.backup, "daily", artefact!), "utf8"));
    const log = await remoteLog(staged);
    expect(log.map((line) => line.split(" ")[1])).toEqual(["copy", "check"]);
    expect(log[1]).toContain(`--one-way --include /daily/${artefact}`);
    expect(log[1]).toMatch(/--include \/escrow\/debateai-escrow-\d{8}T\d{6}Z\.tar\.age/u);
  });

  it("rclone: a copy that exits 0 but never arrives fails the run, with no receipt", async () => {
    const staged = await stage({ rclone: "offsite:debateai" });
    const result = await backup(staged, { dayOfWeek: SUNDAY, mode: "drop" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/^BACKUP_FAILED rclone check/mu);
    expect(result.stdout).not.toContain("BACKUP_OK");
  });

  it("rclone: a copy that arrives damaged fails the run, with no receipt", async () => {
    const staged = await stage({ rclone: "offsite:debateai" });
    const result = await backup(staged, { dayOfWeek: SUNDAY, mode: "corrupt" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/^BACKUP_FAILED rclone check/mu);
    expect(result.stdout).not.toContain("BACKUP_OK");
  });

  it("scp: uploads, reads this run's files back, and prints the receipt only when they match", async () => {
    const staged = await stage({ scp: "backup@offsite.test:/srv/debateai" });
    const result = await backup(staged, { dayOfWeek: SUNDAY });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^BACKUP_OK /mu);
    const [artefact] = await artefacts(join(staged.backup, "daily"));
    const log = await remoteLog(staged);
    expect(log).toHaveLength(3);
    expect(log[1]).toContain(`backup@offsite.test:/srv/debateai/daily/${artefact}`);
    expect(log[2]).toMatch(/backup@offsite\.test:\/srv\/debateai\/escrow\/debateai-escrow-\d{8}T\d{6}Z\.tar\.age/u);
  });

  it("scp: a copy that exits 0 but never arrives fails the run, with no receipt", async () => {
    const staged = await stage({ scp: "backup@offsite.test:/srv/debateai" });
    const result = await backup(staged, { dayOfWeek: SUNDAY, mode: "drop" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/^BACKUP_FAILED could not read daily\/debateai-/mu);
    expect(result.stdout).not.toContain("BACKUP_OK");
  });

  it("scp: a copy that arrives damaged fails the run, with no receipt", async () => {
    const staged = await stage({ scp: "backup@offsite.test:/srv/debateai" });
    const result = await backup(staged, { dayOfWeek: SUNDAY, mode: "corrupt" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/^BACKUP_FAILED daily\/debateai-\S+ read back from the off-host target differs/mu);
    expect(result.stdout).not.toContain("BACKUP_OK");
  });

  it("checks the escrow envelope only on the night one is written", async () => {
    const staged = await stage({ rclone: "offsite:debateai" });
    expect((await backup(staged, { dayOfWeek: SUNDAY })).code).toBe(0);
    const second = await backup(staged, { dayOfWeek: SUNDAY });
    expect(second.code, second.stderr).toBe(0);
    const checks = (await remoteLog(staged)).filter((line) => line.startsWith("rclone check"));
    expect(checks).toHaveLength(2);
    expect(checks[0]).toContain("/escrow/");
    expect(checks[1]).not.toContain("/escrow/");
  });

  it("a night whose copy failed does not mark the escrow envelope done: the next night verifies one", async () => {
    const staged = await stage({ rclone: "offsite:debateai" });
    expect((await backup(staged, { dayOfWeek: SUNDAY, mode: "drop" })).code).not.toBe(0);
    const next = await backup(staged, { dayOfWeek: SUNDAY });
    expect(next.code, next.stderr).toBe(0);
    expect(next.stdout).toContain("BACKUP_ESCROW_WRITTEN");
    const checks = (await remoteLog(staged)).filter((line) => line.startsWith("rclone check"));
    expect(checks).toHaveLength(2);
    expect(checks[1]).toContain("/escrow/");
  });
});

describe("deploy/vps/backup.sh: retention", () => {
  it("a weekday run with an empty weekly directory reaches the off-host copy and the receipt", async () => {
    const staged = await stage({ rclone: "offsite:debateai" });
    const result = await backup(staged, { dayOfWeek: TUESDAY });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^BACKUP_OK /mu);
    expect(await artefacts(join(staged.backup, "weekly"))).toEqual([]);
    expect((await remoteLog(staged)).map((line) => line.split(" ")[1])).toEqual(["copy", "check"]);
  });

  it("keeps a single weekly artefact on a weekday", async () => {
    const staged = await stage({ rclone: "offsite:debateai" });
    const weekly = await seed(join(staged.backup, "weekly"), 1);
    const result = await backup(staged, { dayOfWeek: TUESDAY });
    expect(result.code, result.stderr).toBe(0);
    expect(await artefacts(join(staged.backup, "weekly"))).toEqual(weekly);
  });

  it("prunes past 14 daily and 8 weekly, oldest first, and leaves other files alone", async () => {
    const staged = await stage({ rclone: "offsite:debateai" });
    const daily = await seed(join(staged.backup, "daily"), 20);
    const weekly = await seed(join(staged.backup, "weekly"), 10);
    await writeFile(join(staged.backup, "daily", "notes.txt"), "keep me\n");
    const result = await backup(staged, { dayOfWeek: TUESDAY });
    expect(result.code, result.stderr).toBe(0);
    const keptDaily = await artefacts(join(staged.backup, "daily"));
    expect(keptDaily).toHaveLength(14);
    // Tonight's artefact plus the 13 youngest seeded ones; seeded index 1 is the youngest.
    expect(keptDaily.filter((name) => daily.includes(name))).toEqual(daily.slice(0, 13).sort());
    expect(await artefacts(join(staged.backup, "weekly"))).toEqual(weekly.slice(0, 8).sort());
    expect(await readdir(join(staged.backup, "daily"))).toContain("notes.txt");
  });

  it("a real error inside prune still fails the run (grep exit 2 is not 'no match')", async () => {
    const staged = await stage({ rclone: "offsite:debateai" }, { grep: "#!/bin/sh\nexit 2\n" });
    const result = await backup(staged, { dayOfWeek: TUESDAY });
    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toContain("BACKUP_OK");
    expect(await remoteLog(staged)).toEqual([]);
  });
});
