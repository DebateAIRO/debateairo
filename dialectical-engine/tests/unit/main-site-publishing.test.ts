// Public debates in the owner's runbook (deploy/preview-auth-dev/v1/MAIN-SITE.md, 5.9): PUBCHECK and PUBAFTER read
// where publishing stands, PUBKEYS makes the corpus key and the key store, PUBLOGIN gives the clean-up login a password
// nobody sees, PUBBACKUP puts the new key and store in a checked backup, PUBON switches publishing on with its own way
// back, and PUBOFF switches it off again as far as that is possible. The steps live only in the runbook, so they are
// checked here as text and run in bash against a throwaway server: the names file's own publishing helpers, the
// server's commands stood in for, and the files the code checks made for real. No step prints a key, a password or an
// address. Data is made up.
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const runbook = read('deploy/preview-auth-dev/v1/MAIN-SITE.md');
const guide = read('deploy/preview-release/v1/README.md');
const flat = runbook.replace(/\s+/g, ' ');

/** Every fenced block of the runbook, in order. */
function fencedBlocks(text: string): string[] {
  const out: string[] = [];
  let open: string[] | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (open === null) open = [];
      else { out.push(open.join('\n')); open = null; }
    } else if (open !== null) open.push(line);
  }
  return out;
}
const blocks = fencedBlocks(runbook);
/** The one block with a line `# <step>: …`. */
function script(step: string): string {
  const found = blocks.filter(block => block.split('\n').some(line => line.startsWith(`# ${step}: `)));
  if (found.length !== 1) throw new Error(`${found.length} blocks name ${step}`);
  return found[0]!;
}
const STEPS = ['PUBCHECK', 'PUBKEYS', 'PUBLOGIN', 'PUBBACKUP', 'PUBON', 'PUBAFTER', 'PUBOFF'] as const;

/** The names file after its first line, as LOCKS0 writes it. */
const locks0 = script('LOCKS0').split('\n');
const namesBody = locks0.slice(locks0.indexOf(`{ printf '. %s\\n' "$NAMES"; cat <<'EOF'`) + 1, locks0.indexOf('EOF'));
/** Publishing's helpers: from the first one to the end of the names file, without the two lines of names. */
const pubHelpers = namesBody.slice(namesBody.findIndex(line => line.startsWith('pubstate() {')));
const helper = (name: string) => namesBody.find(line => line.startsWith(`${name}() {`))!;

const USER = userInfo().username;
const GROUP = spawnSync('id', ['-gn'], { encoding: 'utf8' }).stdout.trim();
const RUNTIME_PASSWORD = 'PASSWORD-MARK-runtime';
const RUNTIME_URL = `postgresql://debateai_prod_api_runtime:${RUNTIME_PASSWORD}@127.0.0.1:5434/debateai?sslmode=verify-full&sslrootcert=/etc/debateai-v3-preview/postgres-tls/ca.crt`;

/**
 * The server's commands, stood in for. `stat` answers from `ls -ldn` (the same on the Mac and on Linux), with root as
 * the owner of this guide's copies and of the API file, and the API's user everywhere else; `systemctl` lists the
 * API's write paths from a file, and a reload adds the drop-in's; the start helpers start the API by the code's own
 * rule for the journal line; `psqlq` answers each of the steps' queries from files; `lc` writes an online backup of the
 * corpus key and the store; `runuser` runs the command as the test's user, and the `postgres` administrator's psql
 * keeps what it was sent.
 */
const STUBS = [
  `stat() { local f=$3 l p o=0 i c n u g s w; l=$(ls -ldn "$f" 2>/dev/null) || return 1; read -r p n u g s _ <<<"$l"; p=\${p:1:9}; for i in 0 1 2 3 4 5 6 7 8; do c=\${p:$i:1}; o=$((o * 2)); [ "$c" = - ] || o=$((o + 1)); done; case "$f" in "$M"|"$M"/*|"$A") w=root; g=root;; *) w=$AU; g=$AGRP;; esac; c=$2; c=\${c//%a/$(printf '%o' "$o")}; c=\${c//%U/$w}; c=\${c//%G/$g}; c=\${c//%h/$n}; c=\${c//%s/$s}; printf '%s\\n' "$c"; }`,
  'chown() { :; }',
  `chmod() { case "$1" in --reference=*) command chmod "$(stat -c %a "\${1#--reference=}")" "$2";; *) command chmod "$@";; esac; }`,
  'install() { local m=0755 d=; while [ $# -gt 0 ]; do case "$1" in -d) d=1; shift;; -m) m=$2; shift 2;; -o|-g) shift 2;; *) break;; esac; done; [ -n "$d" ] || return 1; local x; for x; do mkdir -p "$x" && command chmod "$m" "$x"; done; }',
  'pgstub() { case " $* " in *" -f - "*) cat > "$D/sql";; *) echo 1;; esac; }',
  'runuser() { local u=; [ "$1" = -u ] && u=$2; while [ "$1" != -- ]; do shift; done; shift; if [ "$u" = postgres ]; then pgstub "$@"; else "$@"; fi; }',
  'systemctl() { case "$1" in show) cat "$D/rw" 2>/dev/null || true;; daemon-reload) [ ! -e "$PDROP" ] || sed -n \'s/^ReadWritePaths=//p\' "$PDROP" >> "$D/rw";; is-active) echo active;; esac; }',
  'psqlq() { printf \'%s\\n\' "$1" >> "$D/queries"; case "$1" in',
  "  *cannot-sign-in*) cat \"$D/role\" 2>/dev/null || true;;",
  "  *pg_hba_file_rules*) echo 'scram-sha-256 127.0.0.1 255.255.255.255';;",
  "  *pg_authid*) echo no;; *rolvaliduntil*) echo never;; *pg_stat_activity*) echo 0;;",
  '  *owner_designation*) cat "$D/staffkeys";; *publication_snapshot*) cat "$D/counts";; *pg_database*) echo 1;;',
  '  *) echo "unexpected query" >&2; return 1;; esac; }',
  `gs() { echo '{"state":"active","window_open":true,"today_spend_usd":"amount-mark"}'; }`,
  'curl() { cat "$D/login"; }',
  'inv() { cat "$D/journal" 2>/dev/null || true; }',
  'said() { [ "$(inv "$API" | grep -c "$@" || true)" -gt 0 ]; }',
  `startapi() { if [ -e "$D/api-refuses" ]; then rm -f "$D/api-refuses"; echo PREVIEW_API_STARTUP_REFUSED > "$D/journal"; echo 'the API did not start'; return 1; fi; { echo 'PREVIEW_API_STARTED {}'; [ "$(pubstate "$A")" = A ] || [ "$(pubstate "$A")" = B ] || echo '[PUBLICATION_CUSTODY_NOT_CONFIGURED]'; } > "$D/journal"; echo 'PREVIEW_API_STARTED {}'; }`,
  'apiup() { startapi || return 1; }', 'apistart() { startapi; }', 'webup() { :; }',
  helper('upfail'),
  `lc() { [ "$1" = backup.mjs ] && [ "$2" = --online ] || return 1; local out=$3; [ ! -e "$D/backup-fails" ] || { echo '{"event":"PREVIEW_ONLINE_BACKUP_FAILED","reason":"KEYS_FAILED"}'; return 1; }; echo dump > "$out/online-debateai.dump"; echo roles > "$out/online-globals.sql"; tar -C / -cf "$out/online-keys.tar" "\${KP#/}" "\${PS#/}"; ( cd "$out" && sha256sum online-debateai.dump online-globals.sql online-keys.tar > online.sha256 ); echo '{"event":"PREVIEW_ONLINE_BACKUP_OK","databases":["debateai","postgres"],"keys":["KEK_PATH","CORPUS_KEK_PATH","PUBLICATION_KEY_STORE_PATH"],"files":[{"name":"online-debateai.dump","bytes":5,"sha256":"x"}]}'; }`,
  "df() { echo Avail; echo 999999M; }", "du() { printf '100\\t%s\\n' \"$2\"; }",
  // Tries a clean-up line as the API would; the real try is run on its own below.
  'pubprobe() { if grep -qE \'^PUBLICATION_CLEANUP_DATABASE_URL=postgres(ql)?://debateai_prod_api_publication_cleanup:\' "$1"; then cat "$D/probe"; else echo "no line to try"; fi; }'
];

type Server = Readonly<{ dir: string; api: string; kp: string; ps: string; pub: string; drop: string }>;
/** A throwaway server: the API's key folder and keys, its stores and the fence's folder, the API file, the release. */
function withServer<T>(body: (server: Server) => T): T {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-publishing-')));
  try {
    const keys = join(dir, 'etc/debateai-v3-preview/api');
    const lib = join(dir, 'var/lib/debateai-v3-preview');
    mkdirSync(keys, { recursive: true });
    chmodSync(keys, 0o700);
    for (const store of ['api/user-deks', 'api/audit-keys', 'api/restore-fence', 'data-exports']) mkdirSync(join(lib, store), { recursive: true });
    for (const key of ['kek.bin', 'blind-index-key.bin', 'audit-source-ip-salt.bin', 'records-key.bin', 'support-kek.bin']) {
      writeFileSync(join(keys, key), randomBytes(32), { mode: 0o600 });
    }
    const capi = join(dir, 'rels/api/dialectical-engine');
    for (const file of ['packages/register/src/runtime-environment.ts', 'packages/db/src/publication.ts', 'apps/api/src/publication-check/gate-transport.ts']) {
      mkdirSync(dirname(join(capi, file)), { recursive: true });
      writeFileSync(join(capi, file), read(file));
    }
    mkdirSync(join(dir, 'etc/auth-dev-v1'), { recursive: true });
    const api = join(dir, 'etc/auth-dev-v1/api-cur.env');
    writeFileSync(api, [
      'PUBLIC_APP_URL=https://dezbatere.ro', 'NODE_ENV=production', 'DEBATEAI_DEPLOYMENT_MODE=hosted',
      `KEK_PATH=${keys}/kek.bin`, `BLIND_INDEX_KEY_PATH=${keys}/blind-index-key.bin`, `AUDIT_SOURCE_IP_SALT_PATH=${keys}/audit-source-ip-salt.bin`,
      `RECORDS_KEY_PATH=${keys}/records-key.bin`, `SUPPORT_KEK_PATH=${keys}/support-kek.bin`,
      `USER_DEK_STORE_PATH=${lib}/api/user-deks`, `AUDIT_KEY_STORE_PATH=${lib}/api/audit-keys`, `DATA_EXPORT_STORE_PATH=${lib}/data-exports`,
      `RESTORE_FENCE_PATH=${lib}/api/restore-fence/fence`, 'CONTENT_ENCRYPTION_ENABLED=true', 'PUBLICATION_ENABLED=false',
      `DATABASE_URL=${RUNTIME_URL}`, `AUTHORIZATION_DATABASE_URL=${RUNTIME_URL.replace('api_runtime', 'api_authorization')}`,
      'STAFF_ACCESS_POLICY_VERSION=2', 'STAFF_WEBAUTHN_ORIGIN=https://dezbatere.ro', 'STAFF_WEBAUTHN_RP_ID=dezbatere.ro',
      `PREVIEW_PROVIDER_TEST_CONFIG_JSON={"deployment":"v3-preview","anthropic_budget_socket":"/run/debateai-v3-preview/anthropic-budget-v1.sock"}`, ''
    ].join('\n'));
    chmodSync(api, 0o640);
    mkdirSync(join(dir, 'main-site'), { mode: 0o700 });
    mkdirSync(join(dir, 'systemd/debateai-preview-api@.service.d'), { recursive: true });
    writeFileSync(join(dir, 'rw'), `-${lib}/api/restore-fence ${lib}/api/user-deks ${lib}/api/audit-keys ${lib}/data-exports\n`);
    writeFileSync(join(dir, 'login'), '401');
    writeFileSync(join(dir, 'staffkeys'), '1\n');
    writeFileSync(join(dir, 'counts'), '0 0 0 0 0 0 0 0 0\n');
    writeFileSync(join(dir, 'probe'), 'accepted\n');
    writeFileSync(join(dir, 'journal'), 'PREVIEW_API_STARTED {}\n[PUBLICATION_CUSTODY_NOT_CONFIGURED]\nPREVIEW_MAIL_MODE {"mode":"allow-list","origin":"https://dezbatere.ro"}\n');
    return body({ dir, api, kp: join(keys, 'corpus-kek.bin'), ps: join(lib, 'api/publication-keys'), pub: join(dir, 'main-site/pub'),
      drop: join(dir, 'systemd/debateai-preview-api@.service.d/zzzzzzzzzz-keys-publication.conf') });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every line any step printed in this file, to check below that none holds a secret. */
const printed: string[] = [];
/** One step, with the names file replaced by its stand-in names, the names file's own publishing helpers and the stubs. */
function run(server: Server, step: typeof STEPS[number]) {
  const names = [
    `D='${server.dir}'; M="$D/main-site"; A='${server.api}'; LABEL=cur; HOST=dezbatere.ro; API=debateai-preview-api@cur; WEB=debateai-preview-ui@cur`,
    `CAPI="$D/rels/api"; L='${resolve(ROOT, 'deploy/preview-lifecycle/v1')}'; N='${process.execPath}'; AU='${USER}'; AGRP='${GROUP}'; GAN=/gate; PAN=/authority`,
    `KP='${server.kp}'; PS='${server.ps}'; PUB="$M/pub"; KF=$PUB/keys.env; LF=$PUB/cleanup.line; BF=$PUB/backup-folder`,
    `CLN=debateai_prod_api_publication_cleanup; PDROP='${server.drop}'`,
    ...pubHelpers.filter(line => !line.startsWith('pubprobe() {')),
    ...STUBS
  ];
  // A function as the replacement, so the `$'` in the helpers is not read as a replacement pattern.
  const text = script(step).replace('. /root/preview-archive/main-site/names.sh', () => names.join('\n'))
    .replace('runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAtq -v ON_ERROR_STOP=1 -f -', () => 'pgstub -f -');
  const out = spawnSync('bash', ['-c', text], { encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` } });
  printed.push(out.stdout, out.stderr);
  return { status: out.status, out: out.stdout, lines: out.stdout.trim().split('\n'), last: out.stdout.trim().split('\n').at(-1) };
}
const apiFile = (server: Server) => readFileSync(server.api, 'utf8');
const sorted = (text: string) => text.split('\n').filter(Boolean).sort();

describe('the steps of 5.9 as text', () => {
  it('each step is one block that parses, names itself on its third line and needs the names file\'s publishing helpers first', () => {
    for (const step of STEPS) {
      const lines = script(step).split('\n');
      expect(spawnSync('bash', ['-n'], { input: lines.join('\n') }).status, step).toBe(0);
      expect(lines.slice(0, 2), step).toEqual(['set -euo pipefail', '. /root/preview-archive/main-site/names.sh']);
      expect(lines[2], step).toMatch(new RegExp(`^# ${step}: `));
      const guard = lines.findIndex(line => line.startsWith('declare -F pubprobe >/dev/null || '));
      const change = lines.findIndex(line => !line.startsWith('#') && /cp -p|install -|\bmv\b|> "\$|runuser|systemctl daemon-reload/.test(line));
      expect(guard, step).toBeGreaterThan(2);
      if (change >= 0) expect(guard, step).toBeLessThan(change);
      expect(spawnSync('bash', ['-c', ['set -euo pipefail', lines[guard]!, 'echo GOES_ON'].join('\n')], { encoding: 'utf8' }).stdout.trim(), step)
        .toBe(`${step}_NOT_DONE: the names file is from an earlier version of this guide (no pubprobe); nothing changed: run LOCKS0 (3.0) again, then ${step}`);
    }
    expect(spawnSync('bash', ['-n'], { input: namesBody.join('\n') }).status).toBe(0);
  });

  it('PUBCHECK and PUBAFTER only read: no file, unit or login changes in them', () => {
    for (const step of ['PUBCHECK', 'PUBAFTER'] as const) {
      const body = script(step).split('\n').filter(line => !line.startsWith('#')).join('\n');
      expect(body, step).not.toMatch(/\b(apiup|apistart|webup|mv|cp|rm|install|chown|chmod|runuser|tee)\b|systemctl (restart|start|stop|daemon-reload)|ALTER ROLE| > "\$/u);
    }
    for (const name of ['pubstate', 'keyok', 'storeok', 'storewrite', 'keyfiles', 'povl', 'pubapart', 'pubrole', 'pubhba', 'pubcounts', 'staffkey', 'aion', 'mailmode', 'pubbackup', 'pubprobe']) {
      expect(helper(name), name).toBeDefined();
      expect(helper(name), name).not.toMatch(/\b(mv|cp|rm|install|chown|chmod)\b|ALTER |INSERT |UPDATE |DELETE /u);
    }
  });

  it('the helpers read the same names, queries and rules as the code they stand for', () => {
    // PWOFF1's count of the Owner's working staff keys.
    expect(script('PWOFF1')).toContain(helper('staffkey').replace(/^staffkey\(\) \{ psqlq "/u, '').replace(/"; \}$/u, ''));
    // STAFFCHECK's rule for the AI check: the release's route and the API file's socket.
    expect(script('STAFFCHECK')).toContain('apps/api/src/publication-check/gate-transport.ts');
    expect(helper('aion')).toContain('apps/api/src/publication-check/gate-transport.ts');
    expect(helper('aion')).toContain(".anthropic_budget_socket // empty");
    // PRECHECK's three states.
    expect(guide).toContain("PE=$(grep -c '^PUBLICATION_ENABLED=true$' \"$A\" || true); PK=$(grep -c '^CORPUS_KEK_PATH=' \"$A\" || true); PS=$(grep -c '^PUBLICATION_KEY_STORE_PATH=' \"$A\" || true)");
    expect(helper('pubstate')).toContain("grep -c '^PUBLICATION_ENABLED=true$' \"$1\"");
    // The API's role check of the clean-up login, condition by condition.
    const check = read('packages/db/src/publication.ts');
    const role = helper('pubrole');
    for (const piece of ["'serve.claim_publication_key_cleanup(integer)'", "'serve.complete_publication_key_cleanup(uuid,uuid,text)'",
      "'serve.claim_publication_key_provision_cleanup(integer)'", "'serve.complete_publication_key_provision_cleanup(uuid,uuid)'",
      "'debateai_publication_cleanup','USAGE'", "'debateai_runtime','MEMBER'", "'debateai_authorization_runtime','MEMBER'",
      "'uuid, uuid, uuid, uuid, uuid, text, text, uuid, text, jsonb, timestamp with time zone, uuid, uuid, uuid'",
      "'serve.publication_key_cleanup_intent','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'"]) {
      expect(check, piece).toContain(piece.replace(/','/gu, "','"));
      expect(role, piece).toContain(piece.replace(/','/gu, "', '"));
    }
    for (const flag of ['rolsuper', 'rolcreaterole', 'rolcreatedb', 'rolreplication', 'rolbypassrls']) expect(role).toContain(`r.${flag}`);
    // The key store's file, which keyfiles counts.
    expect(read('packages/crypto/src/index.ts')).toContain('const location = join(directory, "publication-key.v1.json");');
    expect(helper('keyfiles')).toContain('-name publication-key.v1.json');
    // The corpus key: 0600, as the support keys' own check of every protected key path wants, and 32 bytes.
    const support = read('apps/api/src/support/keys.ts');
    expect(support).toContain('const PRIVATE_FILE_MODE = 0o600;');
    expect(support).toContain('|| (metadata.mode & 0o777) !== PRIVATE_FILE_MODE');
    expect(read('apps/api/src/main.ts')).toMatch(/protectedKeyPaths: \[\n\s+environment\.KEK_PATH,\n\s+environment\.CORPUS_KEK_PATH,/u);
    expect(helper('keyok')).toContain('= "600 $AU 1 32"');
    // Every key and store the code keeps apart from the corpus key, the store and the fence is in pubapart's list.
    const fence = read('apps/api/src/restore-fence.ts');
    const apart = helper('pubapart');
    const named = [...fence.slice(fence.indexOf('const stores = ['), fence.indexOf('...extraSecretPaths]')).matchAll(/environment\.([A-Z_]+)/gu)].map(match => match[1]!);
    const connectors = read('apps/api/src/billing/connectors.ts');
    const billing = [...connectors.slice(connectors.indexOf('export function billingCustodyPaths'), connectors.indexOf('].filter((path)')).matchAll(/environment\.([A-Z_]+_PATH)/gu)].map(match => match[1]!);
    expect(billing).toHaveLength(5);
    for (const key of [...named, ...billing, 'UI_API_PROOF_PATH']) {
      if (['PUBLICATION_KEY_STORE_PATH', 'CORPUS_KEK_PATH', 'CORPUS_KEK_PREVIOUS_PATH', 'CONTENT_BLIND_INDEX_KEY_PATH'].includes(key)) continue;
      expect(apart, key).toMatch(new RegExp(`for k in (?:[A-Z_]+ )*${key}[ ;]`, 'u'));
    }
    expect(read('packages/register/src/runtime-environment.ts')).toContain('throw new TypeError("CONTENT_BLIND_INDEX_V1_KEY_MUST_BE_RETIRED");');
    expect(script('PUBON')).toContain("grep -c '^CORPUS_KEK_PREVIOUS_PATH=' \"$A\"");
    // The online backup copies the corpus key and the store once a file it is given names them; the password helper exists.
    expect(read('deploy/preview-lifecycle/v1/backup.mjs')).toMatch(/KEY_STORE_KEYS = Object\.freeze\(\[[^\]]*'PUBLICATION_KEY_STORE_PATH'[^\]]*'CORPUS_KEK_PATH'/u);
    expect(read('deploy/preview-lifecycle/v1/jit-creator-actor.mjs')).toContain('export function scramSha256Verifier(password, ');
    // The journal lines the steps read are the API's own.
    const main = read('apps/api/src/main.ts');
    expect(main).toContain('if (publicationCipher === undefined) console.error("[PUBLICATION_CUSTODY_NOT_CONFIGURED]");');
    expect(main).toContain('else if (!publicationCustody.cleanup) console.error("[PUBLICATION_KEY_CLEANUP_NOT_CONFIGURED]");');
    expect(main).toContain('.catch(() => console.error("[PUBLICATION_KEY_CLEANUP_PENDING]"));');
    expect(main).toContain('() => console.error("[PUBLIC_PAGE_WORK_PENDING]"));');
  });

  it('the store\'s drop-in sorts after the server\'s own drop-in and before the release\'s, as the fence\'s does', () => {
    const name = /PDROP=\/etc\/systemd\/system\/debateai-preview-api@\.service\.d\/([a-z-]+\.conf)$/mu.exec(namesBody.join('\n'))![1]!;
    expect([name, 'zzzzzzzzz-auth-dev-task12-final.conf', 'zzzzzzzzzz-lifecycle-release.conf', 'zzzzzzzzzz-fence-restore.conf'].sort())
      .toEqual(['zzzzzzzzz-auth-dev-task12-final.conf', 'zzzzzzzzzz-fence-restore.conf', name, 'zzzzzzzzzz-lifecycle-release.conf']);
  });

  it('no line of a step sends a key, a password or the clean-up line to the screen', () => {
    for (const step of STEPS) {
      for (const line of script(step).split('\n')) {
        if (/cat "\$(KP|LF)"|cat "\$KF" "\$LF"/u.test(line)) expect(line, step).toMatch(/> "\$A\.new"/u);
        expect(line, step).not.toMatch(/echo "?\$\(cat "\$(KP|LF|KF)"/u);
        expect(line, step).not.toMatch(/(echo|printf)[^|>]*\$(PASSWORD|password|V)\b/u);
        if (line.includes('/dev/urandom')) expect(line, step).toContain('> "$1.new"');
      }
    }
  });
});

describe('5.9 on a throwaway server, from today\'s state to publishing on and off again', { timeout: 180_000 }, () => {
  it('PUBCHECK says what is missing today, and every step before PUBON changes nothing the site shows', () => withServer(server => {
    const before = apiFile(server);
    const check = run(server, 'PUBCHECK');
    expect(check.last).toBe('PUBCHECK_DONE');
    expect(check.lines).toContain('release cur; publishing in the API file: off, nothing of it set up (state C; lines: PUBLICATION_ENABLED 1, CORPUS_KEK_PATH 0, PUBLICATION_KEY_STORE_PATH 0, PUBLICATION_CLEANUP_DATABASE_URL 0)');
    for (const line of ['corpus key: not made yet', 'key store: not made yet', 'the API may write the key store: no', 'the clean-up line: not made yet',
      'the clean-up login: there, and the API\'s role check would accept its roles and grants', 'a PUBBACKUP that holds this corpus key and the key store: no',
      'the staff screens, and a working staff key of the Owner under dezbatere.ro: yes', 'the site password: on',
      'still to do, in this order: PUBKEYS PUBLOGIN PUBBACKUP PUBON']) expect(check.lines, line).toContain(line);
    expect(check.out).toContain('the AI check for publication and reports: on, through the Anthropic gate (the gate: active, window open true;');
    expect(check.out).toContain('mail: allow-list');
    // PUBON before the steps: nothing changed.
    const early = run(server, 'PUBON');
    expect(early.last).toBe('PUBON_NOT_DONE: ' + `${server.pub}/keys.env is not the two lines PUBKEYS keeps (PUBKEYS first); nothing changed`);
    // PUBKEYS: the key as the code checks it, the empty store, the drop-in, the two lines.
    const keys = run(server, 'PUBKEYS');
    expect(keys.last).toBe('PUBKEYS_DONE');
    expect(statSync(server.kp).mode & 0o777).toBe(0o600);
    expect(statSync(server.kp).size).toBe(32);
    expect(statSync(server.ps).mode & 0o777).toBe(0o700);
    expect(readdirSync(server.ps)).toEqual([]);
    expect(readFileSync(server.drop, 'utf8').split('\n').slice(1)).toEqual(['[Service]', `ReadWritePaths=-${server.ps}`, '']);
    expect(readFileSync(join(server.pub, 'keys.env'), 'utf8')).toBe(`CORPUS_KEK_PATH=${server.kp}\nPUBLICATION_KEY_STORE_PATH=${server.ps}\n`);
    const key = readFileSync(server.kp);
    expect(run(server, 'PUBKEYS').lines).toEqual(expect.arrayContaining(['corpus key: there already, as the code needs; it is never made again',
      'key store: there already, with 0 publication keys in it', 'the API may write the key store already: no drop-in needed', 'PUBKEYS_DONE']));
    expect(readFileSync(server.kp).equals(key)).toBe(true);
    // PUBLOGIN: a password nobody sees, its line, and only its SCRAM verifier sent to the database.
    const login = run(server, 'PUBLOGIN');
    expect(login.last).toBe('PUBLOGIN_DONE');
    const line = readFileSync(join(server.pub, 'cleanup.line'), 'utf8');
    expect(statSync(join(server.pub, 'cleanup.line')).mode & 0o777).toBe(0o600);
    const url = new URL(line.trim().replace(/^PUBLICATION_CLEANUP_DATABASE_URL=/u, ''));
    expect(url.username).toBe('debateai_prod_api_publication_cleanup');
    expect(url.password).toMatch(/^[0-9a-f]{64}$/u);
    const runtime = new URL(RUNTIME_URL);
    expect([url.host, url.pathname, url.search]).toEqual([runtime.host, runtime.pathname, runtime.search]);
    const sql = readFileSync(join(server.dir, 'sql'), 'utf8');
    expect(sql.split('\n').slice(0, 4)).toEqual(["SET log_statement = 'none';", 'SET log_min_duration_statement = -1;', "SET log_min_error_statement = 'panic';", "SET password_encryption = 'scram-sha-256';"]);
    const verifier = /^ALTER ROLE debateai_prod_api_publication_cleanup PASSWORD '(SCRAM-SHA-256\$4096:([^$]+)\$([^:]+):([^']+))' VALID UNTIL 'infinity';$/mu.exec(sql)!;
    expect(verifier).not.toBeNull();
    expect(sql).not.toContain(url.password);
    const salted = pbkdf2Sync(url.password, Buffer.from(verifier[2]!, 'base64'), 4096, 32, 'sha256');
    expect(createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest('base64')).toBe(verifier[3]);
    expect(createHmac('sha256', salted).update('Server Key').digest('base64')).toBe(verifier[4]);
    rmSync(join(server.dir, 'sql'));
    expect(run(server, 'PUBLOGIN').lines.slice(-2)).toEqual(['the clean-up line is kept already, and it signs in and passes the API\'s role check: nothing changed', 'PUBLOGIN_DONE']);
    expect(existsSync(join(server.dir, 'sql'))).toBe(false);
    // PUBBACKUP: the backup holds this very key and the store.
    const backup = run(server, 'PUBBACKUP');
    expect(backup.last).toBe('PUBBACKUP_DONE');
    expect(backup.out).toContain('"keys":["KEK_PATH","CORPUS_KEK_PATH","PUBLICATION_KEY_STORE_PATH"]');
    const named = readFileSync(join(server.pub, 'backup-folder'), 'utf8');
    expect(named.startsWith(`${server.pub}/backup-`)).toBe(true);
    expect(named.slice(server.pub.length)).toMatch(/^\/backup-\d{8}T\d{6}Z\n$/u);
    // Nothing the site shows changed: the API file and the API are as before.
    expect(apiFile(server)).toBe(before);
    const ready = run(server, 'PUBCHECK');
    expect(ready.lines.slice(-2)).toEqual(['still to do, in this order: PUBON', 'PUBCHECK_DONE']);
    expect(ready.lines).toContain('the clean-up line PUBLOGIN kept, tried as the API will use it: accepted');
  }));

  it('PUBON refuses, with nothing changed, without the password, the staff key, the AI check, content encryption, the backup or an accepted line', () => withServer(server => {
    for (const step of ['PUBKEYS', 'PUBLOGIN', 'PUBBACKUP'] as const) expect(run(server, step).last).toBe(`${step}_DONE`);
    const before = apiFile(server);
    const refused = (setUp: () => void, undo: () => void, last: string) => {
      setUp();
      const out = run(server, 'PUBON');
      undo();
      expect(out.last).toBe(last);
      expect(apiFile(server)).toBe(before);
    };
    refused(() => writeFileSync(join(server.dir, 'login'), '200'), () => writeFileSync(join(server.dir, 'login'), '401'),
      'PUBON_NOT_DONE: the site does not ask for the password: publishing goes on only behind it (PWON, 8.4, first); nothing changed');
    refused(() => writeFileSync(join(server.dir, 'staffkeys'), '0\n'), () => writeFileSync(join(server.dir, 'staffkeys'), '1\n'),
      'PUBON_NOT_DONE: the staff screens are off, or the Owner has no working staff key under dezbatere.ro, so nobody could hide a public debate by hand: 5.7 first; nothing changed');
    const route = join(server.dir, 'rels/api/dialectical-engine/apps/api/src/publication-check/gate-transport.ts');
    refused(() => rmSync(route), () => writeFileSync(route, 'x'),
      'PUBON_NOT_DONE: the AI check for publication and reports is off (STAFFCHECK, 1.6), so nothing could pass it; nothing changed: ask');
    refused(() => writeFileSync(join(server.dir, 'probe'), 'the database refuses its password\n'), () => writeFileSync(join(server.dir, 'probe'), 'accepted\n'),
      'PUBON_NOT_DONE: the clean-up line is not accepted (the database refuses its password): PUBLOGIN again; nothing changed');
    const folder = join(server.pub, 'backup-folder');
    refused(() => writeFileSync(folder, '/nowhere\n'), () => writeFileSync(folder, `${readdirSync(server.pub).filter(name => name.startsWith('backup-2')).map(name => join(server.pub, name))[0]}\n`),
      'PUBON_NOT_DONE: no PUBBACKUP holds this corpus key and the key store (PUBBACKUP first); nothing changed');
    // A new corpus key made after the backup: the backup no longer holds this key.
    const key = readFileSync(server.kp);
    refused(() => writeFileSync(server.kp, randomBytes(32)), () => writeFileSync(server.kp, key),
      'PUBON_NOT_DONE: no PUBBACKUP holds this corpus key and the key store (PUBBACKUP first); nothing changed');
    const off = before.replace('CONTENT_ENCRYPTION_ENABLED=true', 'CONTENT_ENCRYPTION_ENABLED=false');
    refused(() => writeFileSync(server.api, off), () => writeFileSync(server.api, before),
      'PUBON_NOT_DONE: the API file does not hold CONTENT_ENCRYPTION_ENABLED=true once, which publishing needs; nothing changed: ask');
    const half = `${before}PUBLICATION_KEY_STORE_PATH=${server.ps}\n`;
    refused(() => writeFileSync(server.api, half), () => writeFileSync(server.api, before),
      'PUBON_NOT_DONE: the API file holds some of the publication lines but not all of them; nothing changed: ask');
  }));

  it('PUBON switches on, and puts the file before back when the API refuses; PUBAFTER reads the result; PUBOFF goes back as far as is honest', () => withServer(server => {
    for (const step of ['PUBKEYS', 'PUBLOGIN', 'PUBBACKUP'] as const) expect(run(server, step).last).toBe(`${step}_DONE`);
    const before = apiFile(server);
    const line = readFileSync(join(server.pub, 'cleanup.line'), 'utf8');
    // The API refuses: the file before is back, and the API and the website started on it.
    writeFileSync(join(server.dir, 'api-refuses'), '');
    const refused = run(server, 'PUBON');
    expect(refused.last).toBe('PUBON_NOT_DONE: the API refused the file with publishing on (its code is above); the file before is back, and the API and the website started on it, with publishing off: run PUBCHECK, then ask');
    expect(apiFile(server)).toBe(before);
    // The switch.
    const on = run(server, 'PUBON');
    expect(on.last).toBe('PUBON_DONE');
    const after = apiFile(server);
    expect(sorted(after)).toEqual(sorted(before.replace('PUBLICATION_ENABLED=false\n', '') + `PUBLICATION_ENABLED=true\nCORPUS_KEK_PATH=${server.kp}\nPUBLICATION_KEY_STORE_PATH=${server.ps}\n${line}`));
    expect(statSync(server.api).mode & 0o777).toBe(0o640);
    expect(readdirSync(server.pub).filter(name => name.startsWith('api-cur.env.before-pubon-')).length).toBeGreaterThan(0);
    expect(run(server, 'PUBON').lines.slice(-2)).toEqual(['publishing is on already; nothing changed', 'PUBON_DONE']);
    const look = run(server, 'PUBAFTER');
    expect(look.last).toBe('PUBAFTER_DONE');
    expect(look.lines).toEqual(expect.arrayContaining(['since the API\'s start: failed passes of the key clean-up 0 (one every 30 seconds), failed passes of the public pages 0 (one every 15 seconds)',
      'publication keys in the store: 0; the database expects 0', 'publication keys made since the newest PUBBACKUP: 0 (PUBBACKUP again puts them in a backup)']));
    // A failing key clean-up is a stop.
    writeFileSync(join(server.dir, 'journal'), 'PREVIEW_API_STARTED {}\n[PUBLICATION_KEY_CLEANUP_PENDING]\n');
    expect(run(server, 'PUBAFTER').last).toBe('PUBAFTER_NOT_DONE: something is not as expected (the lines above): ask');
    // Nothing was ever published: PUBOFF takes the four lines out, and the file is today's again (its order aside).
    const clean = run(server, 'PUBOFF');
    expect(clean.last).toBe('PUBOFF_DONE');
    expect(clean.out).toContain('in the API file: publishing off, and its four lines out, as no debate was ever published');
    expect(sorted(apiFile(server))).toEqual(sorted(before));
    expect(run(server, 'PUBOFF').lines.slice(-2)).toEqual(['publishing is off already, and the API file names none of its keys; nothing changed', 'PUBOFF_DONE']);
    // On again, then a debate goes public: PUBOFF now keeps the keys' lines, and PUBON only puts the true line back.
    expect(run(server, 'PUBON').last).toBe('PUBON_DONE');
    mkdirSync(join(server.ps, 'publications/11111111-1111-4111-8111-111111111111'), { recursive: true });
    writeFileSync(join(server.ps, 'publications/11111111-1111-4111-8111-111111111111/publication-key.v1.json'), '{}');
    writeFileSync(join(server.dir, 'counts'), '1 1 1 2 1 0 0 0 1\n');
    const seen = run(server, 'PUBAFTER');
    expect(seen.lines).toEqual(expect.arrayContaining(['publication keys in the store: 1; the database expects 1', 'publication keys made since the newest PUBBACKUP: 1 (PUBBACKUP again puts them in a backup)']));
    const kept = run(server, 'PUBOFF');
    expect(kept.last).toBe('PUBOFF_DONE');
    expect(kept.lines).toContain('kept: 1 debates recorded as public, 2 Free debates waiting; the next upload\'s PRECHECK stops on state B: ask before it (5.9b)');
    const b = apiFile(server);
    expect(b).toContain('PUBLICATION_ENABLED=false\n');
    expect(b).toContain(`CORPUS_KEK_PATH=${server.kp}\n`);
    expect(b).toContain(line);
    expect(run(server, 'PUBCHECK').lines).toEqual(expect.arrayContaining(['still to do, in this order: PUBON', 'PUBCHECK_DONE']));
    expect(run(server, 'PUBCHECK').out).toContain('publishing in the API file: off, with the keys kept (5.9b) (state B;');
    // The API refuses publishing off: the file with publishing on comes back.
    expect(run(server, 'PUBON').last).toBe('PUBON_DONE');
    const again = apiFile(server);
    expect(sorted(again)).toEqual(sorted(b.replace('PUBLICATION_ENABLED=false\n', 'PUBLICATION_ENABLED=true\n')));
    writeFileSync(join(server.dir, 'api-refuses'), '');
    expect(run(server, 'PUBOFF').last).toBe('PUBOFF_NOT_DONE: the API refused the file with publishing off (its code is above); the file before is back, and the API and the website started on it, with publishing on: ask');
    expect(apiFile(server)).toBe(again);
  }));

  it('PUBKEYS refuses, with nothing made, a key that is not as the code needs, a store that would overlap the fence, and another key folder', () => withServer(server => {
    writeFileSync(server.kp, randomBytes(32), { mode: 0o644 });
    expect(run(server, 'PUBKEYS').last).toBe(`PUBKEYS_NOT_DONE: ${server.kp} is there, but is not the API user's 0600 file of 32 bytes with one link; nothing changed: ask`);
    expect(existsSync(server.ps)).toBe(false);
    rmSync(server.kp);
    const before = apiFile(server);
    writeFileSync(server.api, before.replace(/^RESTORE_FENCE_PATH=.*$/mu, `RESTORE_FENCE_PATH=${server.ps}/fence`));
    expect(run(server, 'PUBKEYS').last).toBe('PUBKEYS_NOT_DONE: the corpus key or the key store would not be apart from: RESTORE_FENCE_PATH (the code refuses that); nothing changed: ask');
    writeFileSync(server.api, before.replace(/^AUDIT_KEY_STORE_PATH=.*$/mu, `AUDIT_KEY_STORE_PATH=${dirname(server.ps)}`));
    expect(run(server, 'PUBKEYS').last).toBe('PUBKEYS_NOT_DONE: the corpus key or the key store would not be apart from: AUDIT_KEY_STORE_PATH (the code refuses that); nothing changed: ask');
    writeFileSync(server.api, before.replace(/^KEK_PATH=.*$/mu, 'KEK_PATH=/elsewhere/kek.bin'));
    expect(run(server, 'PUBKEYS').last).toBe(`PUBKEYS_NOT_DONE: ${dirname(server.kp)} is not the API's own 0700 key folder, the one its KEK_PATH names; nothing changed: ask`);
    expect(existsSync(server.kp) || existsSync(server.ps) || existsSync(server.drop)).toBe(false);
  }));

  it('PUBCHECK and PUBLOGIN refuse a clean-up login that the API\'s role check would refuse, and change nothing', () => withServer(server => {
    writeFileSync(join(server.dir, 'role'), 'runtime-member no-cleanup-functions\n');
    const check = run(server, 'PUBCHECK');
    expect(check.lines).toContain('NOT AS THE CODE NEEDS: the clean-up login debateai_prod_api_publication_cleanup is not as the API\'s role check needs (runtime-member no-cleanup-functions): changing its grants is a reviewed step');
    expect(check.last).toBe('PUBCHECK_NOT_DONE: something is not as the code needs (the NOT AS THE CODE NEEDS lines above); no step of 5.9 changes it: ask');
    expect(run(server, 'PUBLOGIN').last).toBe('PUBLOGIN_NOT_DONE: the clean-up login is not as the API\'s role check needs (runtime-member no-cleanup-functions); changing its grants is a reviewed step; nothing changed: ask');
    expect(existsSync(join(server.dir, 'sql')) || existsSync(join(server.pub, 'cleanup.line'))).toBe(false);
  }));

  it('PUBLOGIN keeps the scheme of the API\'s own line, and sets no password when that line is not the API\'s own login', () => withServer(server => {
    const before = apiFile(server);
    writeFileSync(server.api, before.replace(`DATABASE_URL=${RUNTIME_URL}`, `DATABASE_URL=${RUNTIME_URL.replace('postgresql://', 'postgres://')}`));
    expect(run(server, 'PUBLOGIN').last).toBe('PUBLOGIN_DONE');
    expect(readFileSync(join(server.pub, 'cleanup.line'), 'utf8')).toMatch(/^PUBLICATION_CLEANUP_DATABASE_URL=postgres:\/\/debateai_prod_api_publication_cleanup:[0-9a-f]{64}@127\.0\.0\.1:5434\/debateai\?/u);
    rmSync(join(server.pub, 'cleanup.line'));
    rmSync(join(server.dir, 'sql'));
    writeFileSync(server.api, before.replace(`DATABASE_URL=${RUNTIME_URL}`, `DATABASE_URL=${RUNTIME_URL.replace('api_runtime', 'api_system')}`));
    expect(run(server, 'PUBLOGIN').last).toBe('PUBLOGIN_NOT_DONE: the password was not set (the API file\'s DATABASE_URL is not one line for the API\'s own login, or the database refused): ask');
    expect(existsSync(join(server.pub, 'cleanup.line')) || existsSync(join(server.pub, 'cleanup.line.new'))).toBe(false);
    expect(readFileSync(join(server.dir, 'sql'), 'utf8')).toBe('');
  }));

  it('PUBBACKUP needs PUBKEYS first, and says KEYS_FAILED plainly', () => withServer(server => {
    expect(run(server, 'PUBBACKUP').last).toBe(`PUBBACKUP_NOT_DONE: ${server.pub}/keys.env is not the two lines PUBKEYS keeps (PUBKEYS first); nothing changed`);
    expect(run(server, 'PUBKEYS').last).toBe('PUBKEYS_DONE');
    writeFileSync(join(server.dir, 'backup-fails'), '');
    expect(run(server, 'PUBBACKUP').last).toMatch(/^PUBBACKUP_NOT_DONE: the online backup failed \(KEYS_FAILED: a key changed while it was read: run PUBBACKUP again\); what it wrote stays in .*, unused$/u);
    expect(existsSync(join(server.pub, 'backup-folder'))).toBe(false);
  }));

  it('no step printed a key, a password, the clean-up line or an amount', () => withServer(server => {
    for (const step of ['PUBCHECK', 'PUBKEYS', 'PUBLOGIN', 'PUBBACKUP', 'PUBON', 'PUBAFTER', 'PUBOFF'] as const) run(server, step);
    const line = readFileSync(join(server.pub, 'cleanup.line'), 'utf8').trim();
    const password = new URL(line.replace(/^PUBLICATION_CLEANUP_DATABASE_URL=/u, '')).password;
    const key = readFileSync(server.kp);
    const all = printed.join('\n');
    for (const secret of [RUNTIME_PASSWORD, password, line, key.toString('hex'), key.toString('base64'), 'SCRAM-SHA-256', 'amount-mark', '127.0.0.1']) {
      expect(all, secret.slice(0, 12)).not.toContain(secret);
    }
  }));
});

describe('pubprobe tries a clean-up line as the API will, and says one plain answer', { timeout: 180_000 }, () => {
  it('runs the release\'s own role check through tsx, and names a refused connection without the line', () => {
    const probe = helper('pubprobe');
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-pubprobe-')));
    try {
      const secret = 'PASSWORD-MARK-probe';
      writeFileSync(join(dir, 'line'), `PUBLICATION_CLEANUP_DATABASE_URL=postgresql://debateai_prod_api_publication_cleanup:${secret}@127.0.0.1:9/debateai?sslmode=disable\n`);
      writeFileSync(join(dir, 'empty'), '\n');
      const text = [`CAPI='${dirname(ROOT)}'; AU=x; N='${process.execPath}'`, 'runuser() { while [ "$1" != -- ]; do shift; done; shift; "$@"; }', probe,
        `pubprobe '${join(dir, 'line')}' || echo "exit $?"`, `pubprobe '${join(dir, 'empty')}' || echo "exit $?"`].join('\n');
      const out = spawnSync('bash', ['-c', text], { encoding: 'utf8', timeout: 60_000 });
      expect(out.stdout.trim().split('\n')).toEqual(['it does not connect (ECONNREFUSED)', 'exit 1', 'no line to try', 'exit 1']);
      expect(out.stdout + out.stderr).not.toContain(secret);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the words of 5.9, and where the rest of the guide points to it', () => {
  const section = flat.slice(flat.indexOf('### 5.9 Public debates'), flat.indexOf('## 6. Friends'));

  it('says in plain words what changes, what does not, what happens to the debates of today, and what cannot be undone', () => {
    for (const sentence of [
      'Today nothing on this server can become public.',
      'A Free debate **started from then on** goes public by itself once it has finished, when the end-of-debate check and then the AI check for publication allow it (5.1b says how each works).',
      '**What does not change.** The site password stays on: only people who know it can read a public debate.',
      'None of them goes public by itself, not even a Free debate that finishes after the switch: a Free debate is marked to go public only when it is started while publishing is on.',
      'Its owner cannot take it back: the site has no "unpublish", for one debate or for all.',
      'Switching publishing off (5.9b) only stops the public pages: every public debate stays recorded as public, and switching on again shows them again.',
      'None asks you to type a key or a password: the scripts make the corpus key and the clean-up login\'s password on the server, and no script shows either of them, to you or to anyone.',
      'Claude runs nothing on the server.',
      'The rule: **the corpus key and the key store are in a checked backup before the first debate goes public.**',
      'PUBON refuses until the newest PUBBACKUP holds this very corpus key and the store.',
      'Taking them out too would leave the database with keys nothing can destroy: every deletion of an account or a debate that ever had a public page would wait for ever.',
      'The next upload\'s PRECHECK stops with `BAD (publication)`: its state B (both key lines, publishing not on) needs a reviewed check before an upload. Ask before that upload.'
    ]) expect(section, sentence.slice(0, 60)).toContain(sentence);
  });

  it('quotes the website\'s own words for what the owner sees', () => {
    const say = (language: string, file: string, key: string) => (JSON.parse(read(`apps/ui/messages/${language}/${file}.json`)) as Record<string, string>)[key]!;
    for (const [file, key] of [['newDebate', 'newDebate.freePublicNotice'], ['v4', 'v4.publicMark.KEPT_PRIVATE'], ['home', 'home.publishedUnavailable'],
      ['public', 'public.publication.privateStatus'], ['public', 'public.publication.acknowledgePublish'], ['public', 'public.publication.approvalRequired']] as const) {
      expect(section, key).toContain(say('en', file, key));
    }
    for (const [file, key] of [['newDebate', 'newDebate.freePublicNotice'], ['v4', 'v4.publicMark.KEPT_PRIVATE'], ['home', 'home.publishedUnavailable'],
      ['public', 'public.publication.privateStatus'], ['public', 'public.publication.acknowledgePublish'], ['public', 'public.publication.publishEllipsis'],
      ['public', 'public.publication.publishPublicly'], ['home', 'home.publicDebates'], ['v4', 'v4.publicMark.public'], ['v4', 'v4.publicMark.seePage']] as const) {
      expect(section, key).toContain(say('ro', file, key));
    }
    expect(section).toContain(say('en', 'public', 'public.publication.publishedSuccess'));
  });

  it('puts 5.9 in the order, and the guide\'s other parts point to it where they depend on publishing', () => {
    expect(runbook).toContain('| 5.9 | public debates: publishing switched on (after 5.7), still behind the site password |');
    expect(flat).toContain('- **Public debates only after 5.7, behind the password, and outside an upload.** PUBON (5.9) refuses');
    expect(flat).toContain('(none on this server until publishing is switched on, 5.9)');
    expect(flat).toContain('On this server the first two points need publishing on (5.9): until PUBON, no debate is public, no Free debate goes public, and the Report button has nothing to act on.');
    expect(flat).toContain('With publishing on (5.9), run PUBBACKUP (5.9, step 4) first, before SB1');
    expect(flat).toContain('| `corpus-kek`, `publication-secret-domains`, `database-roles`, `publication-key-store`, `publication-key-cleanup` | publication\'s keys and its clean-up login: with publishing on (5.9)');
    expect(flat).toContain('PUBON and PUBOFF put the file before back by themselves; PUBCHECK (5.9) reads each part the start checks; ask |');
    expect(flat).toContain('**Publishing (5.9) is not one of these steps.**');
    expect(flat).toContain('- Public debates: publishing is on (5.9), or you have decided to open without it.');
    expect(flat).toContain('PUBON and PUBOFF) needs its `upfail`');
    const flatGuide = guide.replace(/\s+/g, ' ');
    expect(flatGuide).toContain('**While publishing is on** (MAIN-SITE.md 5.9:');
    expect(flatGuide).toContain('`publication state A` (publishing on, MAIN-SITE.md 5.9) or `C` (before it),');
    expect(flatGuide).toContain('as MAIN-SITE.md\'s PUBOFF leaves the file once a debate was public: stop');
  });
});
