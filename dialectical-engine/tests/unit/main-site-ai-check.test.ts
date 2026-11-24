// The AI check for publication and reports in the owner's runbook (deploy/preview-auth-dev/v1/MAIN-SITE.md). On the
// server it goes through the Anthropic gate (apps/api/src/publication-check/gate-transport.ts), and the API file's
// SUPPORT_MODEL_TARGET_JSON stays absent, so that line is no sign of it. STAFFCHECK (1.6) says whether the running release
// sends the check through the gate and the API file names the gate's socket; AICHECK (6b.1) also reads the gate's GO and
// state and what the checks did in the last day, and never prints an amount. The steps live only in the runbook, so they
// run here in bash against throwaway files, with the server's commands stood in for. Data is made up.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const runbook = read('deploy/preview-auth-dev/v1/MAIN-SITE.md');
const flat = runbook.replace(/\s+/g, ' ');
/** The shipped file whose presence in a release says that release sends the check through the gate. */
const ROUTE_FILE = 'apps/api/src/publication-check/gate-transport.ts';
const SOCKET = '/run/debateai-v3-preview/anthropic-budget-v1.sock';
const API_UID = 994;

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
/** The one block with a line `# <step>: …`. */
function script(step: string): string {
  const found = fencedBlocks(runbook).filter(block => block.split('\n').some(line => line.startsWith(`# ${step}: `)));
  if (found.length !== 1) throw new Error(`${found.length} blocks name ${step}`);
  return found[0]!;
}
function swapped(text: string, swaps: Readonly<Record<string, string>>): string {
  let out = text;
  for (const [from, to] of Object.entries(swaps)) {
    expect(out, from).toContain(from);
    out = out.replace(from, to);
  }
  return out;
}
function bash(text: string) {
  const out = spawnSync('bash', ['-c', text], { encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` } });
  return { status: out.status, out: out.stdout, lines: out.stdout.trim().split('\n'), last: out.stdout.trim().split('\n').at(-1) };
}

type Server = Readonly<{
  /** The running release sends the check through the gate (its code holds the route's file). */
  route?: boolean;
  /** The API file's preview configuration names the Anthropic gate's socket. */
  socket?: boolean;
  /** Lines the API file holds beside its usual ones. */
  extra?: readonly string[];
  /** The Anthropic gate's GO: who may call it and which models it serves; null: no GO file. */
  go?: Readonly<{ allowed_peer_uids: readonly number[]; enabled_models: readonly string[] }> | null;
  /** The gate's state and whether its window is open. */
  gate?: Readonly<{ state: string; window_open: boolean }>;
}>;
/** A scratch server: the current release's folder and API file, the gate's GO, and the answers of the stood-in commands. */
function withServer<T>(server: Server, body: (dir: string) => T): T {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-ai-check-')));
  try {
    const capi = join(dir, 'rels/auth-dev-candidate-cur-api');
    mkdirSync(join(capi, 'dialectical-engine', dirname(ROUTE_FILE)), { recursive: true });
    if (server.route !== false) writeFileSync(join(capi, 'dialectical-engine', ROUTE_FILE), read(ROUTE_FILE));
    const config = { deployment: 'v3-preview', budget_socket: '/run/debateai-v3-preview/deepinfra-budget-v3.sock', requested_thinking_level: 'high',
      scope_id: 'preview-team-fixture', ...(server.socket === false ? {} : { anthropic_budget_socket: SOCKET }) };
    mkdirSync(join(dir, 'etc'));
    writeFileSync(join(dir, 'etc/api-cur.env'), ['PUBLIC_APP_URL=https://dezbatere.ro', 'DEBATEAI_DEPLOYMENT_MODE=hosted',
      `PREVIEW_PROVIDER_TEST_CONFIG_JSON=${JSON.stringify(config)}`, 'STAFF_ACCESS_POLICY_VERSION=2', ...(server.extra ?? []), ''].join('\n'));
    const go = server.go === undefined ? { allowed_peer_uids: [API_UID, 992], enabled_models: ['claude-haiku-5-5'] } : server.go;
    // The GO also holds the owner's figures; AICHECK reads only its callers and its models, and prints neither.
    if (go !== null) writeFileSync(join(dir, 'go.json'), JSON.stringify({ provider: 'anthropic', daily_budget_usd: '7.77', max_paid_posts_per_day: 321, ...go }));
    const gate = server.gate ?? { state: 'active', window_open: true };
    // The gate's status as the real one prints it, its amounts included.
    writeFileSync(join(dir, 'status.json'), JSON.stringify({ ...gate, reason: null, provider: 'anthropic', enabled_models: ['claude-haiku-5-5'],
      today: '2026-11-24', daily_budget_usd: '7.77', today_spend_usd: '1.234567', remaining_today_usd: '6.535433', today_posts: 12,
      max_paid_posts_per_day: 321, today_unbilled_releases: 1, in_flight: 0, today_booked_max: 0, today_booked_max_usd: '0.000000',
      today_by_model: { 'claude-haiku-5-5': { spend_usd: '1.234567', posts: 12 } } }));
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** STAFFCHECK, with the release table, the API's state and the server's folders stood in for. */
function staffcheck(dir: string) {
  return bash(swapped(script('STAFFCHECK'), {
    'lc() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/$1" "${@:2}"; }':
      `lc() { echo '{"releases":[{"label":"cur","state":"CURRENT"}]}'; }; systemctl() { echo active; }`,
    'E=/etc/debateai-v3-preview/auth-dev-v1': `E='${dir}/etc'`,
    'RELS=/opt/debateai-v3-preview/releases': `RELS='${dir}/rels'`
  }));
}

/** AICHECK, with the names file replaced by the names and helpers it uses, stood in for. */
function aicheck(dir: string) {
  const names = [
    `D='${dir}'; A="$D/etc/api-cur.env"; CAPI="$D/rels/auth-dev-candidate-cur-api"; AU=debateai-api`,
    'GAN=/opt/debateai-v3-preview/operator/anthropic-budget-v1; PAN=/var/lib/debateai-v3-preview/provider-anthropic-authority-v1',
    `id() { echo ${API_UID}; }`,
    'gs() { [ "$1/$2" = "$GAN/$PAN" ] && cat "$D/status.json"; }',
    'psqlq() { printf "%s\\n" "$1" >> "$D/queries"; case "$1" in',
    "  *serve.publication_check_record*) printf 'ALLOW - 4\\nUNAVAILABLE JUDGE_TRANSPORT_FAILED 1\\n';;",
    "  *identity.public_flag*) printf 'NOT_FOUND 1\\n';;",
    "  *identity.free_public_ask*) echo '2 1 0';;",
    "  *serve.synthesis_check_result*) echo 'answered 3, UNAVAILABLE DEADLINE 1, deleted 1';;",
    '  *) echo "unexpected query" >&2; return 1;; esac; }'
  ];
  const result = bash(swapped(script('AICHECK'), {
    '. /root/preview-archive/main-site/names.sh': names.join('\n'),
    'GO=/etc/debateai-v3-preview/provider-anthropic-go-v1.json': `GO='${dir}/go.json'`
  }));
  const queries = existsSync(join(dir, 'queries')) ? readFileSync(join(dir, 'queries'), 'utf8') : '';
  return { ...result, queries };
}
const AI_LINE = 'the AI check for publication and reports: ';

describe('STAFFCHECK says whether the AI check for publication and reports can run, never by the support target line', () => {
  it('on: the release sends the check through the Anthropic gate and the API file names its socket', () => withServer({}, dir => {
    const result = staffcheck(dir);
    expect(result.lines).toContain(`${AI_LINE}on, through the Anthropic gate (6b.1's AICHECK reads whether the gate lets it through)`);
    expect(result.lines).toContain('team allowance lines: 0');
    expect(result.last).toBe('STAFFCHECK_DONE');
  }));

  it('off, and why: no socket in the API file, or a release with no way through the gate; the support target line changes nothing', () => {
    withServer({ socket: false, extra: ['SUPPORT_MODEL_TARGET_JSON={"provider_ref":"x"}'] }, dir => {
      const result = staffcheck(dir);
      expect(result.lines).toContain(`${AI_LINE}off: the API file names no Anthropic gate socket`);
      expect(result.last).toBe('STAFFCHECK_DONE');
    });
    withServer({ route: false }, dir => {
      const result = staffcheck(dir);
      expect(result.lines).toContain(`${AI_LINE}off: this release has no way to it (a release that sends it through the Anthropic gate brings it)`);
      expect(result.last).toBe('STAFFCHECK_DONE');
    });
    expect(script('STAFFCHECK')).not.toContain('SUPPORT_MODEL_TARGET_JSON');
  });

  it('looks for the file that carries the route in the release, and the release keeps it at that path', () => {
    expect(existsSync(resolve(ROOT, ROUTE_FILE))).toBe(true);
    expect(read(ROUTE_FILE)).toContain('export function createPreviewPublicationJudgeTransport(');
    expect(script('STAFFCHECK')).toContain(`/dialectical-engine/${ROUTE_FILE}" ] || GR=1`);
    expect(script('AICHECK')).toContain(`[ -f "$CAPI/dialectical-engine/${ROUTE_FILE}" ]`);
  });
});

describe('AICHECK reads the gate the check goes through, and what the checks did, and prints no amount', () => {
  it('ready: the gate lets the API call it with the model; the day\'s calls and the checks\' outcomes by name and count', () => withServer({}, dir => {
    const result = aicheck(dir);
    expect(result.lines).toContain('the Anthropic gate: {"state":"active","window_open":true,"enabled_models":["claude-haiku-5-5"],"calls_today":12,"in_flight":0,"refused_unbilled_today":1}');
    expect(result.lines).toContain('ALLOW - 4');
    expect(result.lines).toContain('UNAVAILABLE JUDGE_TRANSPORT_FAILED 1');
    expect(result.lines).toContain('NOT_FOUND 1');
    expect(result.lines).toContain('Free debates (waiting, public in the last day, kept private in the last day): 2 1 0');
    expect(result.lines).toContain('end-of-debate checks in the last day: answered 3, UNAVAILABLE DEADLINE 1, deleted 1');
    expect(result.last).toBe('AICHECK_DONE');
    // Names, states and counts only: none of the gate's or the GO's amounts.
    for (const amount of ['7.77', '1.234567', '6.535433', '0.000000', 'usd', 'cost']) expect(result.out, amount).not.toContain(amount);
    // The queries read outcomes, causes, verdicts and counts, never a cost or a token count.
    expect(result.queries).not.toMatch(/cost_usd|_tokens|charge/u);
  }));

  it.each([
    ['a release with no way through the gate', { route: false }, 'not ready: this release sends the check through no gate (the upload of a release that does comes first)'],
    ['no socket in the API file', { socket: false }, 'not ready: the API file names no Anthropic gate socket (anthropic_budget_socket in PREVIEW_PROVIDER_TEST_CONFIG_JSON)'],
    ['a GO that leaves out the API\'s user', { go: { allowed_peer_uids: [992], enabled_models: ['claude-haiku-5-5'] } }, `not ready: the Anthropic gate's GO does not let the API's user (debateai-api, uid ${API_UID}) call it`],
    ['a GO without the model', { go: { allowed_peer_uids: [API_UID], enabled_models: [] } }, 'not ready: the Anthropic gate\'s GO does not enable claude-haiku-5-5'],
    ['a halted gate', { gate: { state: 'halted', window_open: false } }, 'not ready: the Anthropic gate is not active with its window open (GATES, 6.2)'],
    ['a gate whose window is shut', { gate: { state: 'active', window_open: false } }, 'not ready: the Anthropic gate is not active with its window open (GATES, 6.2)']
  ] as const)('not ready with %s', (_name, server, line) => withServer(server, dir => {
    const result = aicheck(dir);
    expect(result.lines).toContain(line);
    expect(result.last).toBe('AICHECK_NOT_DONE: the check cannot go through the Anthropic gate (the lines above say why): ask');
    for (const amount of ['7.77', '1.234567']) expect(result.out, amount).not.toContain(amount);
  }));

  it('not ready without the GO file', () => withServer({ go: null }, dir => {
    const result = aicheck(dir);
    expect(result.lines).toContain(`not ready: ${dir}/go.json is missing`);
    expect(result.last).toBe('AICHECK_NOT_DONE: the check cannot go through the Anthropic gate (the lines above say why): ask');
  }));

  it('is read-only and marked so, and comes before the opening and again in its test behind the password', () => {
    expect(script('AICHECK').split('\n')[2]).toBe('# AICHECK: whether the AI check for publication and reports can go through the Anthropic gate, and what it did in the last day (read-only; prints names, states and counts, never an amount).');
    expect(script('AICHECK')).not.toMatch(/\b(apiup|apistart|webup|mv|cp|rm|install|chown|chmod|systemctl)\b/u);
    const opening = runbook.slice(runbook.indexOf('### 6b.1 Before you open'), runbook.indexOf('### 6b.3 '));
    expect(opening).toContain('# AICHECK: ');
    expect(opening.replace(/\s+/g, ' ')).toContain('The AI check for publication and reports can go through the Anthropic gate: AICHECK (end of 6b.1) ends with `AICHECK_DONE`');
    expect(opening.replace(/\s+/g, ' ')).toContain('run AICHECK (6b.1) and note `calls_today`');
    expect(opening.replace(/\s+/g, ' ')).toContain('Run AICHECK again: `calls_today` has gone up, the publication checks show an `ALLOW -` line');
  });
});

describe('the runbook says what really happens to a Free debate and a report, and what is the sign of the check', () => {
  it('no line reads the support target line as the sign that the check is set up', () => {
    expect(runbook).not.toContain("the Report button's AI check line");
    expect(flat).toContain('the API file\'s `SUPPORT_MODEL_TARGET_JSON` plays no part on this server (it stays absent)');
  });

  it('an unchecked Free debate stays private and waits, retried by the API, on no staff screen: never "a publication review on the Team page"', () => {
    expect(flat).not.toContain('publication review on the Team page');
    expect(flat).toContain('nothing goes public: the finished debate stays private and waits. The API tries its check again by itself, a minute after a failure, then after longer and longer waits, up to an hour. No staff screen lists a waiting Free debate, and nobody can publish one by hand');
    expect(flat).toContain('Each finished one stays private and waits; the API tries its check again by itself, and the debate goes public once the check allows it, however long after it finished. No staff screen lists the waiting ones, and nobody can publish one by hand.');
  });

  it('says the checks take the gate\'s slots from the debates\' calls and the question check, as many as the code sends at once', () => {
    const decision = flat.slice(flat.indexOf('1. **The AI check for publication and reports**'), flat.indexOf('2. **Your numbers**'));
    expect(decision).toContain('and they take the gate\'s few slots (`max_concurrent_calls` in its GO) from those calls. A check that runs by itself sends one call at a time: a Free debate\'s, a contribution\'s or an AI-written report\'s check one call, and the end-of-debate check one finished debate at a time. An owner\'s Publish sends two. So one check holds at most one slot (an owner\'s Publish two). But the checks run apart from each other: when two run at the same moment (for example the end-of-debate check and a Free debate\'s check), they hold two slots together, all that a gate of two has, for the few seconds a call takes.');
    expect(decision).toContain('a debate\'s call or a person\'s question check may wait in the gate\'s queue for one of its calls to end, and on a gate whose slots are all taken such a call is refused after the gate\'s wait of a minute');
    expect(decision).toContain('A Free debate, a contribution or an AI-written report whose check keeps failing is tried again by itself, after its first hour about once an hour, and each try\'s calls count in the day\'s calls.');
    // The numbers the runbook gives are the code's.
    const route = read(ROUTE_FILE);
    expect(route).toMatch(/const CONTENT_CHECK_GATE_BACKGROUND_CALLS_AT_ONCE = 1;/u);
    expect(route).toMatch(/const CONTENT_CHECK_GATE_PUBLISH_CALLS_AT_ONCE = 2;/u);
    // The end-of-debate check's worker takes the background number on the gate, and four at once without it.
    expect(read('apps/api/src/synthesis-check/worker.ts')).toMatch(/const SYNTHESIS_CHECK_MAX_IN_FLIGHT = 4;/u);
    expect(read('apps/api/src/main.ts')).toMatch(/const synthesisCheckWorker = new SynthesisCheckWorker\(\{[^]*?\.\.\.contentCheckCallsAtOnce\(contentCheckRoute, "BACKGROUND"\),[^]*?\n\}\);/u);
    expect(read('packages/providers/ops/preview_budget_authority.py')).toMatch(/^SLOT_WAIT_SECONDS = 60$/mu);
    expect(flat).toContain('A debate whose own check keeps failing is tried again less and less often, and holds back no other debate, contribution or report.');
  });

  it('explains every line AICHECK can print: UNSURE among the publication checks, `not yet` among the reports, and the wait after failures', () => {
    expect(flat).toContain('`ALLOW -`, `BLOCK -` and `UNSURE -` are the check\'s answers; `UNSURE` means it was not sure, and like `BLOCK` it keeps what it checked private for good');
    expect(flat).toContain('`not yet` counts reports the check has given no verdict on: one it is still reading, or one that went to a person without it');
    expect(script('AICHECK')).toContain("coalesce(verdict, 'not yet')");
    expect(flat).toContain('If AICHECK showed `UNAVAILABLE` lines just before, the API may still be in its wait after those failures, and it can take up to an hour.');
  });

  it('quotes the Report button\'s answers in the words the website prints', () => {
    const say = (language: string, state: string) => (JSON.parse(read(`apps/ui/messages/${language}/v4.json`)) as Record<string, string>)[`v4.public.flag.${state}`]!;
    expect(say('ro', 'NOT_FOUND').startsWith('Nu am dat curs acestei raportări')).toBe(true);
    expect(say('en', 'NOT_FOUND').startsWith('We have not acted on this report')).toBe(true);
    expect(say('ro', 'WITH_A_PERSON')).toContain('O persoană o va citi');
    expect(say('en', 'WITH_A_PERSON')).toContain('A person will read this');
    expect(flat).toContain('("Nu am dat curs acestei raportări", in English "We have not acted on this report"). "O persoană o va citi" ("A person will read this") means the check did not answer or was unsure.');
  });
});

describe('the runbook says what the end-of-debate check does by itself on this server, and what a used-up gate stops', () => {
  const byItself = flat.slice(flat.indexOf('**What still happens by itself:**'), flat.indexOf('**Never open the site to everyone (part 8)'));
  const decision = flat.slice(flat.indexOf('1. **The AI check for publication and reports**'), flat.indexOf('2. **Your numbers**'));
  const say = (language: string, file: string, key: string) => (JSON.parse(read(`apps/ui/messages/${language}/${file}.json`)) as Record<string, string>)[key]!;

  it('5.1b: the answer held until the check answers, the deletion with no person, and the staff approval and where it is given', () => {
    expect(byItself).toContain('- **The end-of-debate check.** It runs on this server too, through the Anthropic gate, whenever the AI check above is on (STAFFCHECK, 1.6).');
    expect(byItself).toContain('A finished debate\'s answer is held ("checking") until the check answers: usually a few seconds, at most about two minutes on a busy gate. If the check cannot answer (the gate refused it, was busy, or its day is used up), the answer shows unchecked, nothing is deleted, and the check runs again when the owner presses Publish.');
    expect(byItself).toContain('A debate it finds touching "tendencies to suicide or harming other people" is deleted for good, with no person involved. The Terms (section 9) say so, and the owner sees the notice the site shows ("Am șters această dezbatere", in English "We deleted this debate"). Nobody can bring it back.');
    expect(byItself).toContain('Any of its other flags means that the owner\'s Publish of that debate needs a staff approval. The owner presses **Cereți aprobarea** ("Ask for approval") on the debate\'s page. A staff member with the Publication reviews permission decides on the **Publication reviews** page (Cereri de publicare)');
    expect(byItself).toContain('That works only while the staff screens are on and your staff key works under the name the site answers as: STAFFCHECK says `staff tools are on`, and after the rename only once 5.7 is done. Until then the request waits, and nobody can decide it.');
    expect(byItself).toContain('A Free debate does not wait for that approval. Its own way to the public page (the first point above) reads the AI check for publication, not this check\'s flags: a Free debate this check flagged for anything but the deletion still goes public by itself when that AI check allows it.');
    // The words quoted are the website's, and the hold's bound is the check's own time on the gate: D (at most 60 s) and the gate's slot wait.
    expect(say('ro', 'home', 'home.removal.title')).toBe('Am șters această dezbatere');
    expect(say('en', 'home', 'home.removal.title')).toBe('We deleted this debate');
    expect(say('ro', 'public', 'public.publicationReview.askButton')).toBe('Cereți aprobarea');
    expect(say('en', 'public', 'public.publicationReview.askButton')).toBe('Ask for approval');
    expect(say('ro', 'staff', 'staff.reviews.link')).toBe('Cereri de publicare');
    expect(say('en', 'staff', 'staff.reviews.link')).toBe('Publication reviews');
    expect(read('packages/register/src/publication-check-policy.ts')).toContain('deadline_ms: z.number().int().min(1_000).max(60_000)');
    expect(read('apps/api/src/main.ts')).toContain('createSynthesisAnswerAccess({ repository: synthesisCheckRepository, deadlineMs: backgroundCheckDeadlineMs })');
    expect(read('packages/contract/src/synthesis-check.ts')).toContain('return outcome.verdict === "FLAGGED" && outcome.categories.includes("SUICIDE_OR_HARM_TO_OTHERS");');
    expect(read('apps/api/src/staff/routes.ts')).toContain("{ route: 'POST /v1/admin/publication-reviews/{reviewRef}/approve', auth: 'staff', staffCapability: 'PUBLICATION_REVIEW'");
  });

  it('decision 1: the end-of-debate check comes with the AI check, and a used-up gate stops new questions, the debates\' Claude Haiku calls and the checks until its next day', () => {
    expect(decision).toContain('The end-of-debate check comes with it, the same way: it holds each finished debate\'s answer until it answers, deletes a debate it finds touching "tendencies to suicide or harming other people", and sends an owner\'s Publish of a debate with another flag to a staff approval (5.1b says all of it).');
    expect(decision).toContain('When the gate\'s pot or its day\'s calls are used up, everything that goes through the gate stops until its next day (midnight, Bucharest time). Nobody can ask a new question: the question check answers "unavailable". The debates\' Claude Haiku calls are refused. And the checks fail closed: no Free debate goes public, every report waits for a person, the end-of-debate check deletes nothing and finished answers show unchecked, and an owner\'s Publish answers that the check is not available.');
    // The gate refuses every caller on its day's two limits, and its day is Bucharest's; the question check then answers 503 "unavailable".
    const gate = read('packages/providers/ops/preview_budget_authority.py');
    expect(gate).toMatch(/day = bucharest_day\(moment\)\n\s+ledger = store\.ledger\(day\)/u);
    expect(gate).toContain("raise SafetyError('DAILY_CALL_LIMIT_REACHED')");
    expect(gate).toContain("raise SafetyError('TEAM_DAILY_BUDGET_REACHED')");
    expect(read('apps/api/src/question-check/ask-gate.ts')).toContain('body: { error: "QUESTION_CHECK_UNAVAILABLE", message: "QUESTION_CHECK_UNAVAILABLE" }');
  });

  it('AICHECK names every cause a publication check\'s UNAVAILABLE line can carry, and explains its end-of-debate line', () => {
    const causes = /export type JudgeFailureCause = ([^;]+);/u.exec(read('apps/api/src/publication-check/check.ts'))![1]!.match(/JUDGE_[A-Z_]+/gu)!;
    expect(causes.length).toBe(8);
    // Each one in code type, alone or after `UNAVAILABLE `.
    for (const cause of causes) expect(flat, cause).toMatch(new RegExp(`[\` ]${cause}\``, 'u'));
    expect(flat).toContain('With every one of them nothing is published and nothing is hidden, and the API tries again.');
    expect(flat).toContain('- `end-of-debate checks in the last day` (5.1b): `answered` counts the checks that gave an answer. The answer itself (clear, flagged, or no conclusion to read) is sealed with each debate\'s own key, so this line cannot tell them apart.');
    const codes = read('packages/contract/src/synthesis-check.ts');
    for (const code of ['DEADLINE', 'TRANSPORT_FAILED', 'HTTP_STATUS', 'ANSWER_NOT_JSON', 'ANSWER_SCHEMA', 'MONEY_REFUSED', 'NOT_CONFIGURED']) {
      expect(codes, code).toContain(`"${code}"`);
      expect(flat, code).toContain(`\`${code}\``);
    }
    expect(flat).toContain('`deleted` counts the debates the check deleted for touching "tendencies to suicide or harming other people".');
    expect(flat).toContain('The end-of-debate checks count your test debate among the `answered` ones (`answered 0` with `UNAVAILABLE` causes: ask).');
  });
});
