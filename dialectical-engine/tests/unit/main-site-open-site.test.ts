// Part 6b of the owner's runbook (deploy/preview-auth-dev/v1/MAIN-SITE.md): the whole site open before real payments,
// with PREVIEW_ASKS_OPEN_TO=everyone-with-listed-buyers, where anyone signed in may ask and only the accounts on the team
// line may buy. The steps live only in the runbook, so they run here in bash against throwaway env files, with the
// server's commands stood in for: ASKS_OPEN takes the third value and keeps the team line, behind the site password, on
// the sandbox and the main name only, and checks the API's count line; ASKS_CLOSE and MAIL_CLOSE need the site password
// on whatever the payments; BUYERS writes one list into both files alike, never prints or keeps the address, reads the
// list's cap from the release's code, and puts both files back on any refusal; OPENCHECK reads the open site, the day's
// mail and the plans of accounts not on the list; PWOFF1 accepts 6b's pairing beside part 8's; CLOSED flags the third
// value. The files the steps write are then read by the release check's own SAME checks and the shared parser.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PREVIEW_TEAM_MAX_MEMBERS, parsePreviewAsksOpenTo, parsePreviewTeamUserIds } from '@debateai/providers';
import { previewAsksOpenBootLine, previewListedBuyersBootLine } from '../../apps/api/src/preview-asks-open.js';
import { PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE } from '../../apps/api/src/preview-approved-buyers.js';
import { maskedAddress } from '../../apps/api/src/staff/preview-buyers.js';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const runbook = read('deploy/preview-auth-dev/v1/MAIN-SITE.md');
const flat = runbook.replace(/\s+/g, ' ');
const releaseEnv = await import('../../deploy/' + 'preview-lifecycle/v1/release-env.mjs');
const sameChecks = releaseEnv.sameChecks as (releases: readonly unknown[]) => readonly Readonly<{ check: string; ok: boolean }>[];
const environmentKit = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');
const parseEnvironmentText = environmentKit.parseEnvironmentText as (text: string) => Record<string, string>;

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
/** The names file's one-line helpers, as LOCKS0 writes them. */
const namesBody = script('LOCKS0').split('\n');
const helper = (name: string) => namesBody.find(line => line.startsWith(`${name}() {`))!;

const VALUE = 'everyone-with-listed-buyers';
const OWNER = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const FRIEND = '33333333-3333-4333-8333-333333333333';
const FRIEND_OWNER_REF = '44444444-4444-4444-8444-444444444444';
const FRIEND_ADDRESS = 'friend@example.invalid';
const KEY = ['r18', '0123456789ab'].join('-');
const CONFIG = JSON.stringify({ deployment: 'v3-preview', free_model_ids: ['zai-org/GLM-5.3-Flash'], requested_thinking_level: 'high',
  budget_socket: '/run/debateai-v3-preview/deepinfra-budget-v3.sock', scope_id: 'preview-team-v2-20261009' });
const SANDBOX = 'NETOPIA_API_BASE_URL=https://secure.sandbox.netopia-payments.com';
const LIVE = ['NETOPIA_API_BASE_URL=https://secure.netopia-payments.com/api', 'PREVIEW_LIVE_PAYMENTS=real-money'];
const ROBOTS = 'x-robots-tag: noindex, nofollow';
const SENTENCE = 'Buying a plan is open only to invited accounts for now. You can keep using the Free plan.';

type Files = Readonly<{ team?: readonly string[] | null; runnerTeam?: readonly string[] | null; value?: string | undefined; runnerValue?: string;
  host?: string; live?: boolean; staff?: boolean }>;
const line = (team: readonly string[]) => `PREVIEW_TEAM_USER_IDS_JSON=${JSON.stringify(team)}`;
function envFiles(files: Files): Readonly<{ api: string; runner: string; ui: string }> {
  const team = files.team === undefined ? [OWNER, PARTNER] : files.team;
  const runnerTeam = files.runnerTeam === undefined ? team : files.runnerTeam;
  const host = files.host ?? 'dezbatere.ro';
  const common = ['NODE_ENV=production', 'DEBATEAI_DEPLOYMENT_MODE=hosted', `PREVIEW_PROVIDER_TEST_CONFIG_JSON=${CONFIG}`,
    'HATCHET_WORKFLOW_NAME=debateai-preview-run', 'REGISTER_VERSION=18', `RELEASE_KEY=${KEY}`];
  const worker = `debateai-preview-runner-${KEY}`;
  const api = [`PUBLIC_APP_URL=https://${host}`, ...common, 'API_PORT=3101', ...(files.live ? LIVE : [SANDBOX]),
    ...(files.staff ? ['STAFF_ACCESS_POLICY_VERSION=2'] : []), ...(team === null ? [] : [line(team)]),
    ...(files.value ? [`PREVIEW_ASKS_OPEN_TO=${files.value}`] : []), ''];
  const runnerValue = files.runnerValue ?? files.value;
  const runner = [...common, `RUNNER_WORKER_ID=${worker}`, `HATCHET_WORKER_NAME=${worker}`, ...(runnerTeam === null ? [] : [line(runnerTeam)]),
    ...(runnerValue ? [`PREVIEW_ASKS_OPEN_TO=${runnerValue}`] : []), ''];
  const ui = ['NODE_ENV=production', `PUBLIC_APP_URL=https://${host}`, `RELEASE_KEY=${KEY}`, 'PORT=3100', 'DIALECTICAL_API_BASE=http://127.0.0.1:3101', ''];
  return { api: api.join('\n'), runner: runner.join('\n'), ui: ui.join('\n') };
}

/**
 * The server's commands, stood in for. The API's start is a small model: it writes the journal lines the API prints (the
 * asks line, and with the third value the count of the team line), or refuses when `api-refuses` is in the folder. Files
 * in the folder give curl, psql, the gates and the release check their answers.
 */
const STUBS = [
  'A=$D/etc/api-cur.env; RF=$D/etc/runner-cur.env; UF=$D/etc/ui-cur.env; API=debateai-preview-api@cur; WEB=debateai-preview-ui@cur',
  `LABEL=cur; SLOT=A; KEY=${KEY}; M=$D/m; C=$D/Caddyfile; MP=$D/mail-plan.json; CAPI='${dirname(ROOT)}'`,
  // A release before the Team page's list: its code folder holds the cap's file and not the list's routes.
  '[ ! -d "$D/capi" ] || CAPI=$D/capi',
  `HOST=$(sed -n 's|^PUBLIC_APP_URL=https://||p' "$A")`,
  'inv() { cat "$D/journal" 2>/dev/null || true; }', helper('said'), helper('upfail'),
  'gatesok() { [ ! -e "$D/gates-closed" ]; }', 'gates() { echo "the gates (stand-in)"; }',
  `lc() { printf '%s\\n' "$*" >> "$D/lc-calls"; if [ -e "$D/same-bad" ]; then echo 'BAD SAME_API_RUNNER_PREVIEW_TEAM_USER_IDS_JSON:cur'; return 1; fi; echo 'OK (stand-in)'; }`,
  'apiup() { local v n; : > "$D/journal"; echo start >> "$D/starts"',
  '  if [ -e "$D/api-refuses" ]; then echo "PREVIEW_API_STARTUP_REFUSED PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_NOT_SANDBOX"; return 1; fi',
  `  v=$(sed -n 's/^PREVIEW_ASKS_OPEN_TO=//p' "$A"); [ -z "$v" ] || printf '{"event":"api.preview.asks_open","to":"%s"}\\n' "$v" >> "$D/journal"`,
  `  if [ "$v" = ${VALUE} ] && [ ! -e "$D/no-count-line" ]; then n=$(sed -n 's/^PREVIEW_TEAM_USER_IDS_JSON=//p' "$A" | jq length); printf '{"event":"api.preview.listed_buyers","count":%s}\\n' "$n" >> "$D/journal"; fi`,
  '  echo "PREVIEW_API_STARTED {}" >> "$D/journal"; }',
  'apistart() { echo apistart >> "$D/starts"; }', 'webup() { :; }', 'chown() { :; }', 'chmod() { :; }',
  'install() { local a; for a; do :; done; mkdir -p "$a"; }',
  'curl() { local a u="" h=no; for a; do case "$a" in -sI) h=yes;; http*) u=$a;; esac; done',
  '  if [ "$h" = yes ]; then cat "$D/headers"; return 0; fi',
  '  case "$u" in */login) cat "$D/login";; http://127.0.0.1:3090/readyz) cat "$D/edge";; */readyz) cat "$D/readyz";; *) printf 000;; esac; }',
  'notify() { cat "$D/notify-now"; }',
  'psqlq() { printf "%s\\n" "$1" >> "$D/queries"; case "$1" in',
  `  *'FROM identity."user" WHERE owner_ref'*) cat "$D/user-id";;`,
  // The Team page's list (0186): whether the database holds it, how many are on it, with the team line, its changes, the API login's grant.
  `  *"to_regclass('staff.preview_buyer_event')"*) cat "$D/buyer-table";;`,
  '  *"SELECT count(*) FROM (SELECT DISTINCT ON (user_id) kind"*) cat "$D/approved";;',
  '  *" UNION SELECT user_id::text"*) cat "$D/may-buy";;',
  `  *"FILTER (WHERE kind = 'ADDED')"*) cat "$D/buyer-changes";;`,
  '  *has_function_privilege*) cat "$D/buyer-grant";;',
  `  *'NOT EXISTS (SELECT 1 FROM identity."user" x'*) cat "$D/erased";;`,
  '  *outbound_mail_daily_count*) cat "$D/mail";;',
  `  *"g.created_at >= to_timestamp("*) cat "$D/since";;`,
  `  *"WHERE s.owner_ref = '"*) cat "$D/held";;`,
  `  *"'ERASURE_STOPPED', 'CREATED')"*) cat "$D/plans";;`,
  `  *"g.kind IN ('INITIAL', 'UPGRADE') AND NOT EXISTS"*) cat "$D/pages";;`,
  '  *core.work_item*) echo 0;;', '  *staff.owner_designation*) echo 1;;',
  '  *) echo "unexpected query" >&2; return 1;; esac; }',
  `RUNAPI() { local a; IFS= read -r a; if [ "$a" = '${FRIEND_ADDRESS}' ]; then echo 'owner_ref: ${FRIEND_OWNER_REF}'; else echo 'owner_ref: none'; fi; }`
];

type World = Readonly<{ dir: string; api: () => string; runner: () => string; file: (path: string) => string }>;
type Setup = Files & Readonly<{
  /** The release is one before the Team page's list (database step 0186): its code has no routes for it. */
  beforeList?: boolean;
  /** Asks were opened by ASKS_OPEN: its names file, with the team line kept before the opening. */
  opened?: readonly string[]; openedAt?: string | null;
  /** The copies BUYERS kept before each change, oldest first. */
  kept?: readonly (readonly string[])[];
  journal?: readonly string[]; flags?: readonly string[]; answers?: Readonly<Record<string, string>>;
}>;

/** A scratch world: the three env files, the names file's folder, and the answers of the stood-in commands. */
function world(setup: Setup): World {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-6b-')));
  const etc = join(dir, 'etc');
  mkdirSync(etc);
  for (const sub of ['m/asks', 'm/password', 'm/name']) mkdirSync(join(dir, sub), { recursive: true });
  const env = envFiles(setup);
  writeFileSync(join(etc, 'api-cur.env'), env.api);
  writeFileSync(join(etc, 'runner-cur.env'), env.runner);
  writeFileSync(join(etc, 'ui-cur.env'), env.ui);
  if (setup.opened) {
    const archive = join(dir, 'm/asks/open-20261124T080000Z');
    mkdirSync(archive);
    writeFileSync(join(archive, 'api-cur.env.before-open'), envFiles({ ...setup, team: setup.opened, value: undefined }).api);
    writeFileSync(join(archive, 'runner-cur.env.before-open'), envFiles({ ...setup, team: setup.opened, value: undefined }).runner);
    const at = setup.openedAt === undefined ? 'ASKS_AT=1795939200\n' : setup.openedAt === null ? '' : `ASKS_AT=${setup.openedAt}\n`;
    writeFileSync(join(dir, 'm/asks/names.sh'), `ASKS_ARCHIVE=${archive}\nASKS_LABEL=cur\n${at}`);
    for (const [index, team] of (setup.kept ?? []).entries()) {
      const copy = join(archive, `buyers-2026112${index}T090000Z`);
      mkdirSync(copy);
      writeFileSync(join(copy, 'api-cur.env.before'), envFiles({ ...setup, team }).api);
    }
  }
  const team = setup.team === undefined ? [OWNER, PARTNER] : setup.team;
  const journal = setup.journal ?? (setup.value ? [JSON.stringify({ event: 'api.preview.asks_open', to: setup.value }),
    ...(setup.value === VALUE ? [JSON.stringify({ event: 'api.preview.listed_buyers', count: team?.length ?? 0 })] : [])] : []);
  writeFileSync(join(dir, 'journal'), journal.map(entry => `${entry}\n`).join(''));
  const answers: Record<string, string> = {
    login: '401', headers: `HTTP/2 200\r\n${ROBOTS}\r\nstrict-transport-security: max-age=31536000\r\n`, readyz: '404', edge: '200',
    'notify-now': '400', 'user-id': `${FRIEND}\n`, held: '0\n', plans: '0\n', pages: '0\n', since: '0\n',
    mail: '2026-11-23 120 6 false false\n2026-11-24 8 0 false false\n', tty: `${FRIEND_ADDRESS}\n`,
    'buyer-table': 't\n', approved: '0\n', 'may-buy': '2\n', 'buyer-changes': '0 0\n', 'buyer-grant': 't\n', erased: '0\n',
    'm/name/notify-code.before-dezbatere': '400', Caddyfile: 'dezbatere.ro {\n}\n', 'm/password/Caddyfile.open': 'dezbatere.ro {\n}\n',
    ...setup.answers
  };
  for (const [name, text] of Object.entries(answers)) writeFileSync(join(dir, name), text);
  for (const flag of setup.flags ?? []) writeFileSync(join(dir, flag), '');
  if (setup.beforeList) {
    const providers = join(dir, 'capi/dialectical-engine/packages/providers/src');
    mkdirSync(providers, { recursive: true });
    writeFileSync(join(providers, 'preview-test.ts'), read('packages/providers/src/preview-test.ts'));
  }
  return { dir, api: () => readFileSync(join(etc, 'api-cur.env'), 'utf8'), runner: () => readFileSync(join(etc, 'runner-cur.env'), 'utf8'),
    file: (path: string) => readFileSync(join(dir, path), 'utf8') };
}

/** Runs one step of the runbook in the world, with its names file line replaced by the stand-ins, and `swap` applied. */
function run(step: string, w: World, swap: Readonly<Record<string, string>> = {}) {
  let text = script(step);
  for (const [from, to] of Object.entries(swap)) {
    expect(text, `${step}: ${from}`).toContain(from);
    text = text.replace(from, to);
  }
  text = text.replace('. /root/preview-archive/main-site/names.sh', [`D='${w.dir}'`, ...STUBS].join('\n')).replaceAll('< /dev/tty', '< "$D/tty"');
  const out = spawnSync('bash', ['-c', text], { encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` } });
  return { status: out.status, out: out.stdout, lines: out.stdout.trim().split('\n'), last: out.stdout.trim().split('\n').at(-1) };
}
const withWorld = <T>(setup: Setup, body: (w: World) => T): T => {
  const w = world(setup);
  try { return body(w); } finally { rmSync(w.dir, { recursive: true, force: true }); }
};
/** The release check's own SAME verdict and the shared parser's, on the files a step left. */
function checked(w: World) {
  const api = parseEnvironmentText(w.api()), runner = parseEnvironmentText(w.runner()), ui = parseEnvironmentText(w.file('etc/ui-cur.env'));
  const bad = sameChecks([{ label: 'cur', slot: 'A', api, runner, ui }]).filter(result => !result.ok).map(result => result.check);
  const context = { previewConfigured: true, teamKeyPresent: api.PREVIEW_TEAM_USER_IDS_JSON !== undefined, hosted: true };
  return { bad, asks: parsePreviewAsksOpenTo(api.PREVIEW_ASKS_OPEN_TO, context), team: parsePreviewTeamUserIds(api.PREVIEW_TEAM_USER_IDS_JSON, true) };
}

describe('the stood-in API prints the lines the real API prints', () => {
  it('the asks line and the count line, as preview-asks-open.ts writes them', () => {
    const model = spawnSync('bash', ['-c', `printf '{"event":"api.preview.asks_open","to":"%s"}\\n' ${VALUE}; printf '{"event":"api.preview.listed_buyers","count":%s}\\n' 2`], { encoding: 'utf8' }).stdout;
    expect(model).toBe(`${previewAsksOpenBootLine(VALUE)}\n${previewListedBuyersBootLine(VALUE, [OWNER, PARTNER])}\n`);
    expect(previewListedBuyersBootLine('everyone-with-test-payments', [OWNER])).toBeNull();
  });
});

describe('ASKS_OPEN with the third value (6b)', () => {
  const V6B = { 'V=everyone-with-test-payments ': `V=${VALUE} ` };

  it('keeps the team line in both files as the list, adds the value, records the opening, and checks the count line', () => withWorld({}, w => {
    const before = w.api();
    const result = run('ASKS_OPEN', w, V6B);
    expect(result.lines).toContain('payments: sandbox');
    expect(result.lines).toContain('listed buyers: 2 (the team line)');
    expect(result.last).toBe('ASKS_OPEN_DONE');
    expect(w.api()).toBe(`${before}PREVIEW_ASKS_OPEN_TO=${VALUE}\n`);
    expect(w.runner()).toContain(`\n${line([OWNER, PARTNER])}\n`);
    const archive = readdirSync(join(w.dir, 'm/asks')).find(name => name.startsWith('open-'))!;
    expect(w.file(`m/asks/${archive}/api-cur.env.before-open`)).toBe(before);
    const names = w.file('m/asks/names.sh');
    expect(names.startsWith(`ASKS_ARCHIVE=${w.dir}/m/asks/open-`)).toBe(true);
    expect(names.slice(`ASKS_ARCHIVE=${w.dir}/m/asks/`.length)).toMatch(/^open-\d{8}T\d{6}Z\nASKS_LABEL=cur\nASKS_AT=\d+\n$/u);
    expect(w.file('lc-calls')).toBe('release-env.mjs same --labels cur --slots A\n');
    expect(checked(w)).toEqual({ bad: [], asks: VALUE, team: [OWNER, PARTNER] });
  }));

  it('refuses, with nothing changed, on live payments, on the test name, with the password off, or with two different team lines', () => {
    const cases: ReadonlyArray<readonly [Setup, string]> = [
      [{ live: true }, `ASKS_OPEN_NOT_DONE: ${VALUE} does not go with payments live (part 10: PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING, ..._BILLING_OFF, ..._TEST_PAYMENTS_NOT_SANDBOX, ..._LISTED_BUYERS_NOT_SANDBOX)`],
      [{ host: 'v3-preview.dezbatere.ro' }, `ASKS_OPEN_NOT_DONE: ${VALUE} opens only on dezbatere.ro with no live payments line (the API answers as v3-preview.dezbatere.ro; nothing changed): part 5 first`],
      [{ answers: { login: '200' } }, `ASKS_OPEN_NOT_DONE: the site password is off; ${VALUE} is set only behind it: PWON first`],
      [{ runnerTeam: [OWNER] }, 'ASKS_OPEN_NOT_DONE: the API and runner files do not hold the same one team line; nothing changed: ask'],
      [{ flags: ['gates-closed'] }, 'ASKS_OPEN_NOT_DONE: a spending gate is not active with its window open (above)']
    ];
    for (const [setup, last] of cases) withWorld(setup, w => {
      const api = w.api(), runner = w.runner();
      expect(run('ASKS_OPEN', w, V6B).last, last).toBe(last);
      expect(w.api()).toBe(api);
      expect(w.runner()).toBe(runner);
      expect(existsSync(join(w.dir, 'starts'))).toBe(false);
    });
  });

  it('puts both files back when the API refuses, and says so when the API started without the count line', () => {
    withWorld({ flags: ['api-refuses'] }, w => {
      const api = w.api();
      expect(run('ASKS_OPEN', w, V6B).last).toBe('ASKS_OPEN_NOT_DONE: the API refused the files with asks open (its code is above); both files are back, and the API and the website started on them');
      expect(w.api()).toBe(api);
    });
    withWorld({ flags: ['no-count-line'] }, w => {
      expect(run('ASKS_OPEN', w, V6B).last).toBe('ASKS_OPEN_NOT_DONE: the API does not say the 2 listed buyers the files hold: ask');
    });
  });

  it('refuses, with nothing changed, while an account allowed on the Team page in an earlier opening is still on its list, or when that list does not read', () => {
    const DOES_NOT_READ = 'ASKS_OPEN_NOT_DONE: the Team page\'s list of approved buyers does not read (the database did not answer); nothing changed: ask';
    const cases: ReadonlyArray<readonly [Setup, string]> = [
      [{ answers: { approved: '2\n' } }, 'ASKS_OPEN_NOT_DONE: 2 account(s) allowed on the Team page in an earlier opening are still on its list; nothing changed: remove them on the Team page (Who may buy while payments are in test mode; removing works while the team tools are locked), then ASKS_OPEN again'],
      [{ answers: { approved: '' } }, DOES_NOT_READ],
      [{ answers: { 'buyer-table': '' } }, DOES_NOT_READ]
    ];
    for (const [setup, last] of cases) withWorld(setup, w => {
      const api = w.api(), runner = w.runner();
      expect(run('ASKS_OPEN', w, V6B).last, last).toBe(last);
      expect([w.api(), w.runner()]).toEqual([api, runner]);
      expect(existsSync(join(w.dir, 'starts'))).toBe(false);
      expect(existsSync(join(w.dir, 'm/asks/names.sh'))).toBe(false);
    });
  });

  it('on an empty Team page list it opens and says buyers are allowed there from now on; an older database or release is not asked about it', () => {
    withWorld({}, w => {
      expect(run('ASKS_OPEN', w, V6B).lines.slice(-3)).toEqual(['listed buyers: 2 (the team line)',
        'the Team page\'s list of approved buyers: empty; from now on you allow buyers there (6b.3)', 'ASKS_OPEN_DONE']);
    });
    withWorld({ answers: { 'buyer-table': 'f\n' } }, w => {
      expect(run('ASKS_OPEN', w, V6B).lines.slice(-2)).toEqual(['listed buyers: 2 (the team line)', 'ASKS_OPEN_DONE']);
      expect(w.file('queries')).not.toContain('FROM staff.preview_buyer_event');
    });
    withWorld({ beforeList: true }, w => {
      expect(run('ASKS_OPEN', w, V6B).lines.slice(-2)).toEqual(['listed buyers: 2 (the team line)', 'ASKS_OPEN_DONE']);
    });
    // The friends' value never reads the Team page's list.
    withWorld({ answers: { approved: '2\n' } }, w => {
      expect(run('ASKS_OPEN', w).last).toBe('ASKS_OPEN_DONE');
      expect(existsSync(join(w.dir, 'queries'))).toBe(false);
    });
  });

  it('with the friends\' value it still takes the team line out of both files', () => withWorld({}, w => {
    expect(run('ASKS_OPEN', w).last).toBe('ASKS_OPEN_DONE');
    expect(w.api()).not.toContain('PREVIEW_TEAM_USER_IDS_JSON=');
    expect(w.runner()).not.toContain('PREVIEW_TEAM_USER_IDS_JSON=');
    expect(checked(w)).toMatchObject({ bad: [], asks: 'everyone-with-test-payments' });
  }));
});

describe('ASKS_CLOSE and MAIL_CLOSE need the site password on, whatever the payments', () => {
  it('ASKS_CLOSE refuses on an open site on the sandbox, with nothing changed', () => withWorld({ value: VALUE, opened: [OWNER, PARTNER], answers: { login: '200' } }, w => {
    const api = w.api();
    expect(run('ASKS_CLOSE', w).last).toBe('ASKS_CLOSE_NOT_DONE: the Log in page does not ask for the site password (the site is open, or not answering); nothing changed: PWON first');
    expect(w.api()).toBe(api);
  }));

  it('ASKS_CLOSE, with the password on, puts back the team line kept before the opening in place of the list', () => withWorld({ value: VALUE, team: [OWNER, PARTNER, FRIEND], opened: [OWNER, PARTNER] }, w => {
    expect(run('ASKS_CLOSE', w).last).toBe('ASKS_CLOSE_DONE');
    for (const text of [w.api(), w.runner()]) {
      expect(text).not.toContain('PREVIEW_ASKS_OPEN_TO=');
      expect(text.split('\n').filter(entry => entry.startsWith('PREVIEW_TEAM_USER_IDS_JSON='))).toEqual([line([OWNER, PARTNER])]);
    }
    expect(checked(w)).toEqual({ bad: [], asks: undefined, team: [OWNER, PARTNER] });
  }));

  it('ASKS_CLOSE says how many accounts are still on the Team page\'s list, and closes whatever the count', () => {
    const closing = (answers: Readonly<Record<string, string>>) => withWorld({ value: VALUE, opened: [OWNER, PARTNER], answers }, w => {
      const result = run('ASKS_CLOSE', w);
      expect(checked(w)).toEqual({ bad: [], asks: undefined, team: [OWNER, PARTNER] });
      return result.lines.slice(-2);
    });
    expect(closing({ approved: '3\n' })).toEqual(['accounts still on the Team page\'s list of approved buyers: 3 (they count for nothing now; the next opening with listed buyers waits until you remove them there)', 'ASKS_CLOSE_DONE']);
    expect(closing({ approved: '' })).toEqual(['accounts still on the Team page\'s list of approved buyers: did not read (they count for nothing now; the next opening with listed buyers waits until you remove them there)', 'ASKS_CLOSE_DONE']);
    expect(closing({ 'buyer-table': 'f\n' })).toEqual(['open work now: 0', 'ASKS_CLOSE_DONE']);
  });

  it('MAIL_CLOSE refuses on an open site on the sandbox before it changes anything, and goes on with the password on', () => {
    const lines = script('MAIL_CLOSE').split('\n');
    const guard = lines.findIndex(entry => entry.includes('MAIL_CLOSE_NOT_DONE: the Log in page does not ask for the site password'));
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(lines.findIndex(entry => entry.startsWith('cp -p ')));
    const guardOnly = (login: string) => withWorld({ answers: { login } }, w => {
      const text = ['set -euo pipefail', `D='${w.dir}'`, ...STUBS, lines[guard]!, 'echo GOES_ON'].join('\n');
      return spawnSync('bash', ['-c', text], { encoding: 'utf8' }).stdout.trim();
    });
    expect(guardOnly('200')).toBe('MAIL_CLOSE_NOT_DONE: the Log in page does not ask for the site password (the site is open, or not answering); nothing changed: PWON first');
    expect(guardOnly('401')).toBe('GOES_ON');
  });
});

describe('BUYERS', () => {
  const open = (team: readonly string[], more: Setup = {}): Setup => ({ value: VALUE, team, opened: [OWNER, PARTNER], ...more });
  /** An addition runs only on a release before the Team page's list; a release that carries it adds buyers there. */
  const before = (team: readonly string[], more: Setup = {}): Setup => open(team, { beforeList: true, ...more });
  const REMOVE = { 'W=add ': 'W=remove ' };

  it('on a release that carries the Team page\'s list, refuses an addition with nothing changed, and still removes', () => {
    withWorld(open([OWNER, PARTNER]), w => {
      const api = w.api(), runner = w.runner();
      const result = run('BUYERS', w);
      expect(result.last).toBe('BUYERS_NOT_DONE: this release carries the Team page\'s list: allow the account there (6b.3), with no restart; BUYERS only takes off an account an earlier BUYERS run put on the team line; nothing changed');
      expect([w.api(), w.runner()]).toEqual([api, runner]);
      expect(existsSync(join(w.dir, 'starts'))).toBe(false);
      expect(existsSync(join(w.dir, 'queries'))).toBe(false);
    });
    withWorld(open([OWNER, FRIEND]), w => {
      expect(run('BUYERS', w, REMOVE).last).toBe('BUYERS_DONE');
      expect(checked(w)).toEqual({ bad: [], asks: VALUE, team: [OWNER] });
    });
  });

  it('adds the account in both files alike, checks the count line, keeps the files before, and never prints or keeps the address', () => withWorld(before([OWNER, PARTNER]), w => {
    const before = w.api();
    const result = run('BUYERS', w);
    expect(result.lines.slice(-2)).toEqual(['listed buyers now: 3', 'BUYERS_DONE']);
    for (const text of [w.api(), w.runner()]) expect(text.split('\n').filter(entry => entry.startsWith('PREVIEW_TEAM_USER_IDS_JSON='))).toEqual([line([OWNER, PARTNER, FRIEND])]);
    expect(checked(w)).toEqual({ bad: [], asks: VALUE, team: [OWNER, PARTNER, FRIEND] });
    expect(w.file('lc-calls')).toBe('release-env.mjs same --labels cur --slots A\n');
    const archive = readdirSync(join(w.dir, 'm/asks')).find(name => name.startsWith('open-'))!;
    const kept = readdirSync(join(w.dir, 'm/asks', archive)).filter(name => name.startsWith('buyers-'));
    expect(kept).toHaveLength(1);
    expect(w.file(`m/asks/${archive}/${kept[0]}/api-cur.env.before`)).toBe(before);
    // The address is never printed, and no file but the stand-in for the keyboard holds it; no id is printed either.
    expect(result.out).not.toContain(FRIEND_ADDRESS);
    for (const id of [OWNER, PARTNER, FRIEND, FRIEND_OWNER_REF]) expect(result.out).not.toContain(id);
    const holders = spawnSync('grep', ['-rl', FRIEND_ADDRESS, w.dir], { encoding: 'utf8' }).stdout.trim().split('\n');
    expect(holders).toEqual([join(w.dir, 'tty')]);
  }));

  it('removes the account, and says whether it still holds a plan that goes on until withdrawn or cancelled', () => {
    withWorld(open([OWNER, FRIEND], { answers: { held: '1\n' } }), w => {
      const result = run('BUYERS', w, REMOVE);
      expect(result.lines.slice(-3)).toEqual(['listed buyers now: 1',
        'LOOK: this account still holds an open sandbox plan or an unfinished payment page; it goes on until it is withdrawn (WITHDRAWOTHER, 3.3, within 14 days of its purchase, after you tell them) or they cancel it',
        'BUYERS_DONE']);
      expect(checked(w)).toEqual({ bad: [], asks: VALUE, team: [OWNER] });
      expect(w.file('queries')).toContain(`WHERE s.owner_ref = '${FRIEND_OWNER_REF}'`);
    });
    withWorld(open([FRIEND]), w => {
      const result = run('BUYERS', w, REMOVE);
      expect(result.lines.slice(-3)).toEqual(['listed buyers now: 0', 'this account holds no open sandbox plan and no unfinished payment page', 'BUYERS_DONE']);
      expect(w.api()).toContain('\nPREVIEW_TEAM_USER_IDS_JSON=[]\n');
      expect(checked(w)).toEqual({ bad: [], asks: VALUE, team: [] });
    });
  });

  it('refuses with nothing changed: not open, a wrong W, no such account, listed already, not listed, or past the cap', () => {
    const full = Array.from({ length: PREVIEW_TEAM_MAX_MEMBERS }, (_, index) => `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`);
    const cases: ReadonlyArray<readonly [Setup, Readonly<Record<string, string>>, string]> = [
      [{ opened: [OWNER, PARTNER] }, {}, `BUYERS_NOT_DONE: the two files do not both hold ${VALUE} (ASKS_OPEN first, 6b.2); nothing changed`],
      [open([OWNER]), { 'W=add ': 'W=list ' }, 'BUYERS_NOT_DONE: W is not add or remove; nothing changed'],
      [before([OWNER], { answers: { tty: 'nobody@example.invalid\n' } }), {}, 'BUYERS_NOT_DONE: no account with that address; nothing changed'],
      [before([OWNER, FRIEND]), {}, 'BUYERS_NOT_DONE: that account is on the list already; nothing changed'],
      [open([OWNER]), REMOVE, 'BUYERS_NOT_DONE: that account is not on the list; nothing changed'],
      [before(full), {}, 'BUYERS_NOT_DONE: the list would hold more accounts than PREVIEW_TEAM_MAX_MEMBERS allows; nothing changed: take one off first'],
      [open([OWNER], { runnerTeam: [OWNER, PARTNER] }), {}, 'BUYERS_NOT_DONE: the API and runner files do not hold the same one list; nothing changed: ask']
    ];
    for (const [setup, swap, last] of cases) withWorld(setup, w => {
      const api = w.api(), runner = w.runner();
      const result = run('BUYERS', w, swap);
      expect(result.last, last).toBe(last);
      expect(result.out).not.toContain(String(PREVIEW_TEAM_MAX_MEMBERS));
      expect(w.api()).toBe(api);
      expect(w.runner()).toBe(runner);
      expect(existsSync(join(w.dir, 'starts'))).toBe(false);
    });
  });

  it('puts both files back on a BAD release check or a refused start, and says when the count line is missing', () => {
    withWorld(before([OWNER], { flags: ['same-bad'] }), w => {
      const api = w.api(), runner = w.runner();
      expect(run('BUYERS', w).last).toBe('BUYERS_NOT_DONE: a SAME check is BAD (above); both files are back, nothing restarted');
      expect([w.api(), w.runner()]).toEqual([api, runner]);
      expect(existsSync(join(w.dir, 'starts'))).toBe(false);
    });
    withWorld(before([OWNER], { flags: ['api-refuses'] }), w => {
      const api = w.api(), runner = w.runner();
      expect(run('BUYERS', w).last).toBe('BUYERS_NOT_DONE: the API refused the new list (its code is above); both files are back, and the API and the website started on them');
      expect([w.api(), w.runner()]).toEqual([api, runner]);
    });
    withWorld(before([OWNER], { flags: ['no-count-line'] }), w => {
      expect(run('BUYERS', w).last).toBe('BUYERS_NOT_DONE: the API does not say the 2 listed buyers the files hold: ask');
    });
  });

  it('reads the cap from the release\'s code by its name, and the guide names it, never its value', () => {
    const source = read('packages/providers/src/preview-test.ts');
    const capLine = script('BUYERS').split('\n').find(entry => entry.startsWith('CAP=$(sed -n '))!;
    const cap = spawnSync('bash', ['-c', `CAPI='${dirname(ROOT)}'\n${capLine}\nprintf '%s' "$CAP"`], { encoding: 'utf8' }).stdout;
    expect(Number(cap)).toBe(PREVIEW_TEAM_MAX_MEMBERS);
    expect(source).toContain(`export const PREVIEW_TEAM_MAX_MEMBERS = ${PREVIEW_TEAM_MAX_MEMBERS} as const;`);
    expect(flat).toContain('The list holds at most `PREVIEW_TEAM_MAX_MEMBERS` accounts, the team included');
    expect(flat).not.toMatch(new RegExp(`at most ${PREVIEW_TEAM_MAX_MEMBERS}\\b`, 'u'));
  });
});

describe('OPENCHECK', () => {
  /** Opened with the team; then BUYERS added the friend, then took the partner off. */
  const OPEN: Setup = { value: VALUE, team: [OWNER, FRIEND], opened: [OWNER, PARTNER], kept: [[OWNER, PARTNER], [OWNER, PARTNER, FRIEND]] };
  const OK_LINES = [
    'listed buyers in the files: 2', 'the four spending gates: active, with their window open',
    'mail on 2026-11-23 (UTC): 120 handed to the mail program, 6% of daily_limit; sign-up mail stopped: no; all mail stopped: no',
    'mail on 2026-11-24 (UTC): 8 handed to the mail program, 0% of daily_limit; sign-up mail stopped: no; all mail stopped: no',
    'accounts on the Team page\'s list: 0; accounts that may buy, the team line included: 2',
    'changes on the Team page\'s list since the opening: 0 added, 0 removed',
    'accounts not on the list now: open sandbox plans 0, unfinished payment pages 0',
    'checkouts and upgrades started since the opening by accounts never on the list: 0', 'OPENCHECK_DONE'
  ];

  it('passes on the open site, prints no id, and asks the database about the list now and every list since the opening', () => withWorld({ ...OPEN, answers: { login: '200' } }, w => {
    const result = run('OPENCHECK', w);
    expect(result.lines).toEqual(OK_LINES);
    for (const id of [OWNER, PARTNER, FRIEND]) expect(result.out).not.toContain(id);
    const queries = w.file('queries').split('\n').filter(Boolean);
    const now = `jsonb_array_elements_text('${JSON.stringify([OWNER, FRIEND])}'::jsonb)`;
    const ever = `jsonb_array_elements_text('${JSON.stringify([OWNER, PARTNER, FRIEND].sort())}'::jsonb)`;
    // The plans, the payment pages, and how many may buy with the Team page's list.
    expect(queries.filter(query => query.includes(now))).toHaveLength(3);
    expect(queries.filter(query => query.includes(ever) && query.includes('g.created_at >= to_timestamp(1795939200)'))).toHaveLength(1);
    expect(queries.find(query => query.includes('outbound_mail_daily_count'))).toContain("r.register_version = 18 AND r.row_key = 'outboundMailPolicy'");
  }));

  it('fails when a never-listed account started a checkout since the opening, and only looks at older plans', () => {
    withWorld({ ...OPEN, answers: { login: '200', since: '1\n' } }, w => {
      const result = run('OPENCHECK', w);
      expect(result.lines).toContain('CHECK_FAILED: an account that was never on the list started a checkout or an upgrade since the opening: the buyer rule did not hold: PWON now (6.5 (b)), then ask');
      expect(result.last).toBe('OPENCHECK_NOT_DONE: a check failed (above): when it is the buyer rule or the open site\'s answers, PWON now (6.5 (b)); then ask');
    });
    withWorld({ ...OPEN, answers: { login: '200', plans: '2\n', pages: '1\n' } }, w => {
      const result = run('OPENCHECK', w);
      expect(result.lines).toContain('accounts not on the list now: open sandbox plans 2, unfinished payment pages 1');
      expect(result.lines).toContain('LOOK: plans or payment pages of accounts not on the list (from before the opening, of accounts you took off it, or of accounts suspended while on it): each goes on until it is withdrawn or cancelled; settle them as 3.3 says');
      expect(result.last).toBe('OPENCHECK_DONE');
    });
  });

  it('fails on the open site\'s answers, the API\'s lines, the gates and an opening it cannot date', () => {
    const cases: ReadonlyArray<readonly [Setup, string]> = [
      [{ ...OPEN }, 'CHECK_FAILED: the Log in page does not answer 200 without the site password'],
      [{ ...OPEN, answers: { login: '200', headers: `HTTP/2 200\r\n${ROBOTS}\r\n${ROBOTS}\r\n` } }, 'CHECK_FAILED: / does not send the robots header exactly once'],
      [{ ...OPEN, answers: { login: '200', readyz: '200' } }, 'CHECK_FAILED: /readyz is not refused from outside'],
      [{ ...OPEN, answers: { login: '200', 'notify-now': '401' } }, 'CHECK_FAILED: a NETOPIA notice is not passed through as before'],
      [{ ...OPEN, answers: { login: '200', 'm/password/Caddyfile.open': 'dezbatere.ro {\nbasic_auth\n}\n' } }, 'CHECK_FAILED: the live Caddyfile is not the one PWOFF2 put in place (or SIGNUPS kept)'],
      [{ ...OPEN, answers: { login: '200' }, journal: [JSON.stringify({ event: 'api.preview.asks_open', to: VALUE }), JSON.stringify({ event: 'api.preview.listed_buyers', count: 3 })] },
        'CHECK_FAILED: the running API does not say the 2 listed buyers the files hold (restarted since the last change of the list?)'],
      [{ ...OPEN, answers: { login: '200' }, flags: ['gates-closed'] }, 'CHECK_FAILED: a spending gate is not active with its window open (GATES, 6.2, shows which)'],
      [{ ...OPEN, answers: { login: '200' }, openedAt: null }, 'CHECK_FAILED: the opening\'s time or the kept copies of the list do not read (ASKS_OPEN of this guide writes them): ask'],
      [{ ...OPEN, live: true, answers: { login: '200' } }, 'CHECK_FAILED: payments are not NETOPIA\'s sandbox']
    ];
    for (const [setup, failed] of cases) withWorld(setup, w => {
      const result = run('OPENCHECK', w);
      expect(result.lines, failed).toContain(failed);
      expect(result.last).toMatch(/^OPENCHECK_NOT_DONE: /u);
    });
  });

  it('shows a day whose mail stopped as a line to look at', () => withWorld({ ...OPEN, answers: { login: '200', mail: '2026-11-23 2000 100 true true\n2026-11-24 8 0 false false\n' } }, w => {
    const result = run('OPENCHECK', w);
    expect(result.lines).toContain('mail on 2026-11-23 (UTC): 2000 handed to the mail program, 100% of daily_limit; sign-up mail stopped: yes; all mail stopped: yes');
    expect(result.lines).toContain('LOOK: mail stopped on 2026-11-23: new sign-ups could not finish that day (and with all mail stopped, password resets and receipts waited too): decide with SIGNUPS (6.5 (c)), or ask');
    expect(result.last).toBe('OPENCHECK_DONE');
  }));

  it('reads the Team page\'s list: its count, with the team line against the cap, its changes since the opening, and asks for no id', () => withWorld({ ...OPEN, answers: { login: '200', approved: '3\n', 'may-buy': '5\n', 'buyer-changes': '4 1\n' } }, w => {
    const result = run('OPENCHECK', w);
    expect(result.lines).toContain('accounts on the Team page\'s list: 3; accounts that may buy, the team line included: 5');
    expect(result.lines).toContain('changes on the Team page\'s list since the opening: 4 added, 1 removed');
    expect(result.last).toBe('OPENCHECK_DONE');
    const queries = w.file('queries').split('\n').filter(Boolean);
    expect(queries.find(query => query.includes('FILTER (WHERE'))).toContain('recorded_at >= to_timestamp(1795939200)');
    expect(queries.find(query => query.includes('has_function_privilege'))).toBe("SELECT has_function_privilege('debateai_prod_api_runtime', 'staff.preview_buyer_listed(uuid)', 'EXECUTE')");
    // Accounts not on the list now leave out the Team page's list too; a start since the opening leaves out an account on it in the two minutes before.
    expect(queries.find(query => query.includes("'ERASURE_STOPPED', 'CREATED')"))).toContain('staff.preview_buyer_listed(u.user_id)');
    expect(queries.find(query => query.includes('g.created_at >= to_timestamp(1795939200) AND EXISTS'))).toContain("n.recorded_at < g.created_at - interval '2 minutes'");
    // The cap is read from the release and never printed.
    expect(result.out).not.toMatch(new RegExp(`\\b${PREVIEW_TEAM_MAX_MEMBERS}\\b`, 'u'));
  }));

  it('fails past the cap and when the API\'s login may not read the list; looks at refusals the API logged and at purchases of accounts erased since', () => {
    withWorld({ ...OPEN, answers: { login: '200', 'may-buy': `${PREVIEW_TEAM_MAX_MEMBERS + 1}\n` } }, w => {
      const result = run('OPENCHECK', w);
      expect(result.lines).toContain('CHECK_FAILED: more accounts may buy than PREVIEW_TEAM_MAX_MEMBERS allows: remove some on the Team page, then ask');
      expect(result.last).toMatch(/^OPENCHECK_NOT_DONE: /u);
    });
    withWorld({ ...OPEN, answers: { login: '200', 'buyer-grant': 'f\n' } }, w => {
      expect(run('OPENCHECK', w).lines).toContain('CHECK_FAILED: the API\'s login may not read the Team page\'s list, so every account allowed there is refused at the pay button (503): ask');
    });
    withWorld({ ...OPEN, answers: { login: '200', approved: '' } }, w => {
      expect(run('OPENCHECK', w).lines).toContain('CHECK_FAILED: the Team page\'s list does not read (the database did not answer, or the cap does not read from this release\'s code)');
    });
    withWorld({ ...OPEN, answers: { login: '200', 'buyer-table': '' } }, w => {
      expect(run('OPENCHECK', w).lines).toContain('CHECK_FAILED: whether the database holds the Team page\'s list does not read (the database did not answer)');
    });
    const unreadable = JSON.stringify({ event: 'api.preview.buyer_check_unavailable' });
    withWorld({ ...OPEN, answers: { login: '200', erased: '1\n' }, journal: [JSON.stringify({ event: 'api.preview.asks_open', to: VALUE }),
      JSON.stringify({ event: 'api.preview.listed_buyers', count: 2 }), unreadable, unreadable] }, w => {
      const result = run('OPENCHECK', w);
      expect(result.lines).toContain('LOOK: since its start the API could not read the Team page\'s list 2 time(s), and refused those purchases with nothing charged: if it happens again, ask');
      expect(result.lines).toContain('LOOK: 1 checkout(s) or upgrade(s) since the opening by accounts erased since: whether they were on the list no longer reads; if you know of no such erasure, ask');
      expect(result.last).toBe('OPENCHECK_DONE');
    });
  });

  it('on an older database asks nothing of the Team page\'s list; on an older release says its accounts cannot buy there', () => {
    withWorld({ ...OPEN, beforeList: true, answers: { login: '200', 'buyer-table': 'f\n' } }, w => {
      const result = run('OPENCHECK', w);
      expect(result.lines.filter(entry => entry.includes('Team page'))).toEqual([]);
      expect(result.last).toBe('OPENCHECK_DONE');
      expect(w.file('queries')).not.toContain('FROM staff.preview_buyer');
      expect(w.file('queries')).not.toContain('staff.preview_buyer_listed');
    });
    withWorld({ ...OPEN, beforeList: true, answers: { login: '200', approved: '2\n', 'may-buy': '4\n' } }, w => {
      const result = run('OPENCHECK', w);
      expect(result.lines).toContain('LOOK: the accounts on the Team page\'s list cannot buy on this release, which does not carry that list (after a way back): they can again once a release that carries it is the current one');
      expect(w.file('queries')).not.toContain('has_function_privilege');
      expect(result.last).toBe('OPENCHECK_DONE');
    });
    // A release that carries the list on a database without it: its database step is missing.
    withWorld({ ...OPEN, answers: { login: '200', 'buyer-table': 'f\n' } }, w => {
      const result = run('OPENCHECK', w);
      expect(result.lines).toContain('CHECK_FAILED: this release carries the Team page\'s list, but the database does not hold it: ask');
      expect(result.last).toMatch(/^OPENCHECK_NOT_DONE: /u);
    });
  });
});

describe('PWOFF1 accepts 6b\'s pairing beside part 8\'s', () => {
  const CADDY = ['dezbatere.ro {', '    route {', '        respond @wrongOrigin "ORIGIN_REFUSED" 403', '        basic_auth {',
    '            {$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}', '        }', '        reverse_proxy 127.0.0.1:3100', '    }', '}', ''].join('\n');
  const MAIL = JSON.stringify({ schema: 'preview-auth-dev-mail-v2', recipients: 'open', publicAppUrl: 'https://dezbatere.ro' });
  const MODE = 'PREVIEW_MAIL_MODE {"mode":"open","origin":"https://dezbatere.ro"}';
  const pwoff1 = (setup: Setup) => withWorld({ staff: true, ...setup, answers: { Caddyfile: CADDY, 'mail-plan.json': MAIL, ...setup.answers } }, w => {
    const asks = setup.value ? [JSON.stringify({ event: 'api.preview.asks_open', to: setup.value })] : [];
    const count = setup.value === VALUE ? [JSON.stringify({ event: 'api.preview.listed_buyers', count: (setup.team ?? [OWNER, PARTNER])?.length ?? 0 })] : [];
    writeFileSync(join(w.dir, 'journal'), [...asks, ...(setup.journal ?? count), MODE].map(entry => `${entry}\n`).join(''));
    const result = run('PWOFF1', w);
    return { last: result.last, copied: existsSync(join(w.dir, 'm/password/Caddyfile.before-open')) };
  });

  it('takes everyone-with-listed-buyers on the sandbox, and everyone with real payments, as before', () => {
    expect(pwoff1({ value: VALUE })).toEqual({ last: 'PWOFF1_DONE', copied: true });
    expect(pwoff1({ value: 'everyone', team: null, live: true })).toEqual({ last: 'PWOFF1_DONE', copied: true });
  });

  it('refuses, before any copy, every other pairing and a 6b state the API or the gates do not confirm', () => {
    const cases: ReadonlyArray<readonly [Setup, string]> = [
      [{ value: VALUE, live: true }, 'PWOFF1_NOT_DONE: with everyone-with-listed-buyers the API file must name NETOPIA\'s sandbox'],
      [{ value: VALUE, journal: [JSON.stringify({ event: 'api.preview.listed_buyers', count: 5 })] }, 'PWOFF1_NOT_DONE: the running API does not say the number of listed buyers the API file holds: ask'],
      [{ value: VALUE, flags: ['gates-closed'] }, 'PWOFF1_NOT_DONE: a spending gate is not active with its window open (GATES, 6.2)'],
      [{ value: VALUE, runnerValue: 'everyone' }, 'PWOFF1_NOT_DONE: asks are not open with one same value in both files (8.1 or 6b first)'],
      [{ value: 'everyone', team: null }, 'PWOFF1_NOT_DONE: the API file names NETOPIA\'s sandbox'],
      [{ value: 'everyone-with-test-payments', team: null }, 'PWOFF1_NOT_DONE: asks are open to everyone-with-test-payments: the password comes off only with everyone (8.1, real payments) or everyone-with-listed-buyers (6b, NETOPIA\'s sandbox)'],
      [{}, 'PWOFF1_NOT_DONE: asks are not open with one same value in both files (8.1 or 6b first)'],
      [{ value: VALUE, answers: { login: '200' } }, 'PWOFF1_NOT_DONE: the site does not ask for the password now: look']
    ];
    for (const [setup, last] of cases) expect(pwoff1(setup), last).toEqual({ last, copied: false });
  });
});

describe('CLOSED flags the third value', () => {
  const closed = script('CLOSED').split('\n');
  const lines = closed.filter(entry => entry.includes('listed buyers (6b)') || entry.includes('kept before asks were last opened'));
  const flags = (setup: Setup) => withWorld(setup, w => {
    const text = ['set -euo pipefail', `D='${w.dir}'`, ...STUBS, "flag() { echo \"NOT CLOSED: $1\"; }", ...lines, 'echo END'].join('\n');
    return spawnSync('bash', ['-c', text], { encoding: 'utf8' }).stdout.trim().split('\n');
  });

  it('as an open asks line or a count line of the running API, and a team line that is not the one kept before the opening', () => {
    expect(lines).toHaveLength(2);
    expect(flags({ opened: [OWNER, PARTNER], journal: [] })).toEqual(['END']);
    expect(flags({})).toEqual(['END']);
    expect(flags({ value: VALUE, opened: [OWNER, PARTNER] })).toEqual(['NOT CLOSED: the team: asks are open with listed buyers (6b): PWON, then ASKS_CLOSE', 'END']);
    expect(flags({ team: [OWNER, PARTNER, FRIEND], opened: [OWNER, PARTNER], journal: [] }))
      .toEqual(['NOT CLOSED: the team: the team line is not the one kept before asks were last opened (ASKS_CLOSE puts it back)', 'END']);
  });
});

describe('CLOSED counts the Team page\'s list without flagging it', () => {
  const closed = script('CLOSED').split('\n');
  const from = closed.findIndex(entry => entry.startsWith('# The Team page\'s list of approved buyers (6b.3)'));
  const lines = closed.slice(from, closed.findIndex(entry => entry.startsWith('[ -z "$OPEN" ]')));
  const said = (answers: Readonly<Record<string, string>>) => withWorld({ answers }, w => {
    const text = ['set -euo pipefail', `D='${w.dir}'`, ...STUBS, 'flag() { echo "NOT CLOSED: $1"; }', ...lines, 'echo END'].join('\n');
    return spawnSync('bash', ['-c', text], { encoding: 'utf8' }).stdout.trim().split('\n');
  });

  it('prints the count, "did not read" when the database does not answer, and nothing on a database without the list', () => {
    expect(from).toBeGreaterThan(0);
    expect(said({ approved: '3\n' })).toEqual(['accounts on the Team page\'s list of approved buyers: 3 (inert while asks are closed)', 'END']);
    expect(said({ approved: '' })).toEqual(['accounts on the Team page\'s list of approved buyers: did not read (inert while asks are closed)', 'END']);
    expect(said({ 'buyer-table': '' })).toEqual(['accounts on the Team page\'s list of approved buyers: did not read (inert while asks are closed)', 'END']);
    expect(said({ 'buyer-table': 'f\n' })).toEqual(['END']);
  });
});

describe('the words of 6b', () => {
  it('names both new refusal codes in part 10, and both are the code\'s own, printed by name', () => {
    const part10 = runbook.slice(runbook.indexOf('## 10. Every named refusal code of these locks'));
    const named = (read('deploy/preview-auth-dev/v1/startup-refusals.mjs').match(/\/\^PREVIEW_[^\n]*\$\//u) ?? [''])[0];
    const pattern = new RegExp(named.slice(1, -1), 'u');
    for (const [code, file] of [['PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_WITHOUT_TEAM', 'packages/providers/src/preview-test.ts'],
      ['PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_NOT_SANDBOX', 'apps/api/src/preview-asks-open.ts']] as const) {
      expect(part10).toContain(`| \`${code}\` |`);
      expect(read(file)).toContain(`"${code}"`);
      expect(pattern.test(code), code).toBe(true);
    }
  });

  it('quotes the sentence a person not on the list sees exactly as the website writes it', () => {
    const catalogue = JSON.parse(read('apps/ui/messages/en/billing.json')) as Record<string, string>;
    expect(catalogue['billing.checkout.invitedBuyersOnly']).toBe(SENTENCE);
    expect(flat).toContain(`"${SENTENCE}"`);
    expect(flat).not.toContain('the page shows its general error');
  });

  it('puts 6b in the order table and the order rules, and says what NETOPIA is told while it is open', () => {
    expect(runbook).toContain('\n| 6b | the whole site open while payments are NETOPIA\'s sandbox:');
    expect(runbook).toContain('\n## 6b. The whole site open before real payments, buying only for listed accounts\n');
    for (const heading of ['6b.1 Before you open', '6b.2 The steps, in order', '6b.3 Add or remove a buyer on the Team page',
      '6b.3b Add or remove a buyer at the server (BUYERS)', '6b.4 The morning check (OPENCHECK)',
      '6b.5 The brakes, and the way back', '6b.6 Before part 7']) expect(runbook.split('\n')).toContain(`### ${heading}`);
    expect(flat).toContain('**The one exception is 6b:** the password may come off before real payments only with `everyone-with-listed-buyers`');
    expect(flat).toContain('no page of the site asks for an access password');
    expect(flat).toContain('While payments are in test mode, only accounts we invite can buy a plan');
    expect(flat).toContain('Never list the tester when it will buy as a Romanian buyer');
  });

  it('quotes the Team page\'s box in the words the website prints, and its shortened address as the API makes it', () => {
    const staff = JSON.parse(read('apps/ui/messages/en/staff.json')) as Record<string, string>;
    const said = (key: string) => staff[`staff.previewBuyers.${key}`]!;
    expect(flat).toContain(`**${said('title')}**`);
    for (const key of ['address', 'add', 'remove', 'confirm', 'cancel']) expect(flat, key).toContain(`**${said(key)}**`);
    for (const key of ['added', 'removed', 'unknown', 'onTeam', 'already', 'stale', 'nothingChanged']) expect(flat, key).toContain(`"${said(key)}"`);
    const confirm = said('confirmAdd').replace('{address}', maskedAddress('stefan.nour@example.com')!);
    expect(flat).toContain(`"${confirm}"`);
    expect(flat).toContain('stefan.nour@example.com reads `ste•••n.n•••our@example.com`');
    expect(maskedAddress('stefan.nour@example.com')).toBe('ste•••n.n•••our@example.com');
    // A very short name never shows whole: the guide says what the API prints for one of two characters and of four.
    expect(flat).toContain(`a name of one or two characters before the @ shows only the dots (\`${maskedAddress('ab@example.com')}\`)`);
    expect(maskedAddress('anna@example.com')).toBe('a•••@example.com');
    expect(flat).toContain('and one of three or four only its first character');
    // The page's sentences for an unreadable list, in part 10 and in 6b.
    const billing = JSON.parse(read('apps/ui/messages/en/billing.json')) as Record<string, string>;
    expect(flat).toContain(`the page says "${billing['billing.checkout.genericError']}"`);
    const part10 = runbook.slice(runbook.indexOf('## 10. Every named refusal code of these locks'));
    expect(part10).toContain('| `PREVIEW_BUYERS_UNAVAILABLE` (HTTP 503');
    expect(part10).toContain(`\`${PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE}\``);
    expect(read('apps/api/src/billing/refusal.ts')).toContain('"PREVIEW_BUYERS_UNAVAILABLE"');
    expect(script('OPENCHECK')).toContain(`grep -cxF '${PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE}'`);
  });

  it('the release guide says what an upload does while 6b is open, on both paths', () => {
    const guide = read('deploy/preview-release/v1/README.md').replace(/\s+/g, ' ');
    expect(guide.split("**While MAIN-SITE.md's 6b is open**").length - 1).toBe(2);
    expect(guide).toContain('Run MAIN-SITE.md\'s PWON before DR2');
    expect(guide).toContain('before any way back to a release older than that one (WB2 included) come MAIN-SITE.md\'s PWON, then ASKS_CLOSE');
    // The Team page's list: nothing to copy, additions wait from SB3, and its alerts arrive before a way back to a release without it.
    expect(guide).toContain('Removing an account there works at any time; adding one waits from SB3 until the upload is over');
    expect(guide).toContain('the security alert of every addition, and every removal made with the tools unlocked, that day must have arrived (MAIN-SITE.md 5.6)');
    expect(guide).toContain('never change the list (MAIN-SITE.md\'s BUYERS, and additions on its Team page\'s list) from SB3 on');
    expect(flat).toContain('before any WB2 to such a release, check that the alert of every addition, and every removal made with the tools unlocked, that day has arrived');
    expect(flat).toContain('first check that the security alert of every addition, and every removal made with the tools unlocked, that day has arrived at your alert address (5.6)');
    // After that way back, the older release's audit history on the Team page answers an error while the list's changes are in it.
    expect(flat).toContain('its audit history there shows an error while the list\'s changes are in it, until the next upload brings back a release that carries the list (5.6)');
  });
});
