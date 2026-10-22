// Side-by-side spec §6: the preview's front door (Caddy) is changed once, so that both website slots are its
// upstreams. A request that arrives while neither slot is ready waits (lb_try_duration) instead of failing, and an
// active health check on each website's /readyz decides which slot takes it. Root polls /readyz through a
// loopback-only listener that has no password.
import { afterAll, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
const caddySlots = await import('../../deploy/' + 'preview-release/v1/caddy-slots.mjs');
const plans = await import('../../deploy/' + 'preview-auth-dev/v1/launch-plan.mjs');

const { EDGE_LISTENER, SLOT_UPSTREAMS, PUBLIC_READYZ_REFUSAL, main } = caddySlots;
const transformCaddyfile = caddySlots.transformCaddyfile as (liveText: unknown) => string;
const PREVIEW_SLOTS = plans.PREVIEW_SLOTS as Readonly<Record<'A' | 'B', Readonly<{ uiPort: string; apiPort: string }>>>;
const me = { uid: process.getuid!(), gid: process.getgid!() };

const EDGE_SECRET = 'header_up X-Debateai-Edge-Secret {file./etc/debateai-v3-preview/ui-edge.caddy.secret}';
const PROXY_HEADERS = ['header_up Host v3-preview.dezbatere.ro', 'header_up X-Forwarded-For {remote_host}', 'header_up X-Forwarded-Proto https', EDGE_SECRET, 'header_up -Authorization'];
// The preview's Caddyfile as recorded (initial testing 2026-10-03) plus the H4 notify handle (hosted switch
// 2026-10-19). The password lines are placeholders the server fills from caddy.env.
const LIVE_PREVIEW = [
  '# Protected preview only.',
  '{',
  '\temail {$PREVIEW_ACME_EMAIL}',
  '\tadmin off',
  '\tauto_https disable_redirects',
  '\tlog {',
  '\t\toutput discard',
  '\t}',
  '}',
  '',
  'v3-preview.dezbatere.ro {',
  '\ttls {',
  '\t\tprotocols tls1.2 tls1.3',
  '\t}',
  '\troute {',
  '\t\t@wrongHost not host v3-preview.dezbatere.ro',
  '\t\trespond @wrongHost "NOT_FOUND" 404',
  '\t\t@netopia_notify {',
  '\t\t\tmethod POST',
  '\t\t\tpath /api/v1/billing/netopia/notify',
  '\t\t}',
  '\t\thandle @netopia_notify {',
  '\t\t\trequest_body {',
  '\t\t\t\tmax_size 1MB',
  '\t\t\t}',
  '\t\t\treverse_proxy 127.0.0.1:3100 {',
  ...PROXY_HEADERS.map(line => `\t\t\t\t${line}`),
  '\t\t\t}',
  '\t\t}',
  '\t\t@wrongOrigin expression `{http.request.header.Origin} != "" && {http.request.header.Origin} != "https://v3-preview.dezbatere.ro"`',
  '\t\trespond @wrongOrigin "ORIGIN_REFUSED" 403',
  '\t\tbasic_auth {',
  '\t\t\t{$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}',
  '\t\t}',
  '\t\theader {',
  '\t\t\tCache-Control "no-store"',
  '\t\t\t-Server',
  '\t\t}',
  '\t\trequest_body {',
  '\t\t\tmax_size 1MB',
  '\t\t}',
  '\t\treverse_proxy 127.0.0.1:3100 {',
  ...PROXY_HEADERS.map(line => `\t\t\t${line}`),
  '\t\t}',
  '\t}',
  '}',
  '',
  'http://v3-preview.dezbatere.ro {',
  '\tredir https://v3-preview.dezbatere.ro{uri} 308',
  '}',
  ''
].join('\n');

const SNIPPET_LINES = [
  '(debateai_slots) {',
  '\tlb_policy first',
  '\tlb_try_duration 10s',
  '\tlb_try_interval 250ms',
  '\thealth_uri /readyz',
  '\thealth_interval 2s',
  '\thealth_timeout 1s',
  '\thealth_status 200',
  '\thealth_passes 1',
  '\thealth_fails 1',
  '\thealth_headers {',
  `\t\tX-Debateai-Edge-Secret {file./etc/debateai-v3-preview/ui-edge.caddy.secret}`,
  '\t}',
  '}'
];

/** Line diff (longest common subsequence): the lines of `before` that are not in `after`, in order. */
function diffLines(before: string, after: string) {
  const a = before.split('\n'), b = after.split('\n');
  // keep[i * width + j]: the longest common run of a[i..] and b[j..].
  const width = b.length + 1, keep = new Array<number>((a.length + 1) * width).fill(0);
  const at = (i: number, j: number) => keep[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) keep[i * width + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  const removed: string[] = [], added: string[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; } else if (j < b.length && (i === a.length || at(i, j + 1) >= at(i + 1, j))) added.push(b[j++] ?? ''); else removed.push(a[i++] ?? '');
  }
  return { removed, added };
}
const diffRemovedLines = (before: string, after: string) => diffLines(before, after).removed;
/** The loopback listener as the transform writes it (tab file): readiness only, everything else 404 (controller ruling, D9). */
const LISTENER_LINES = [
  ':3090 {',
  '\tbind 127.0.0.1',
  '\t@readyz {',
  '\t\tmethod GET',
  '\t\tpath /readyz',
  '\t}',
  '\thandle @readyz {',
  '\t\trewrite * /readyz?',
  '\t\treverse_proxy 127.0.0.1:3100 127.0.0.1:3200 {',
  '\t\t\timport debateai_slots',
  ...PROXY_HEADERS.map(line => `\t\t\t${line}`),
  '\t\t}',
  '\t}',
  '\thandle {',
  '\t\trespond 404',
  '\t}',
  '}'
];
/** The public route's refusal of /readyz (final fix wave W2), first in the main route's block, with its comment. */
const PUBLIC_READYZ_LINES = ['\t\t# Readiness is never read through the public name: Caddy checks the slots directly, root asks 127.0.0.1:3090.', '\t\trespond /readyz 404'] as const;
/** The lines of the block that opens at `lines[open]`, its opening and closing lines included. */
function blockAt(lines: readonly string[], open: number) {
  let depth = 0;
  for (let index = open; index < lines.length; index++) {
    for (const char of lines[index] ?? '') depth += char === '{' ? 1 : char === '}' ? -1 : 0;
    if (depth === 0) return lines.slice(open, index + 1);
  }
  throw new Error('block never closes');
}
/**
 * What the listener does with one request, read from its text by Caddy's documented rules for this shape: `handle`
 * blocks are mutually exclusive and a bare `handle` runs only when no matched one does; the path matcher sees the path
 * only (never the query string), cleaned like Caddy's CleanPath (path.Clean with doubled slashes merged, Caddy #4407,
 * and a trailing slash KEPT: `/readyz/` stays `/readyz/`), compared case-insensitively; a request no handle takes gets
 * Caddy's empty 200, which this listener must never need. Returns 'proxy' only when the request reaches a block holding
 * a reverse_proxy. posix.normalize cleans exactly like that CleanPath for these paths (both keep a trailing slash).
 */
function listenerRoute(out: string, method: string, rawUri: string): 'proxy' | 'refuse' | 'unhandled' {
  const lines = out.split('\n'), site = blockAt(lines, lines.indexOf(':3090 {'));
  const matcher = blockAt(site, site.indexOf('\t@readyz {')).slice(1, -1).map(line => line.trim());
  const wantMethod = matcher.find(line => line.startsWith('method '))?.slice(7), wantPath = matcher.find(line => line.startsWith('path '))?.slice(5);
  expect(matcher.every(line => /^(method|path) /.test(line))).toBe(true);
  const cleaned = posix.normalize(rawUri.split('?')[0] ?? '');
  const handle = (name: string) => { const at = site.indexOf(name); return at < 0 ? null : blockAt(site, at); };
  const chosen = method === wantMethod && cleaned.toLowerCase() === wantPath?.toLowerCase() ? handle('\thandle @readyz {') : handle('\thandle {');
  if (!chosen) return 'unhandled';
  return chosen.some(line => /^\s*reverse_proxy /.test(line)) ? 'proxy' : chosen.some(line => /^\s*respond 40[34]$/.test(line)) ? 'refuse' : 'unhandled';
}
/**
 * The URI the website is asked for after the readiness handle's `rewrite * <to>`, by Caddy's rewrite rule: only the
 * parts `<to>` names change; a `<to>` with a `?` sets the query to what follows it, so a bare trailing `?` clears it,
 * and a `<to>` without one keeps the request's query string.
 */
function listenerUpstreamUri(out: string, rawUri: string) {
  const lines = out.split('\n'), site = blockAt(lines, lines.indexOf(':3090 {'));
  const rewrites = blockAt(site, site.indexOf('\thandle @readyz {')).filter(line => /^\s*rewrite /.test(line)).map(line => line.trim().split(' '));
  expect(rewrites).toHaveLength(1);
  const [, matcher, to = ''] = rewrites[0]!;
  expect(matcher).toBe('*');
  const [path, query] = [rawUri.split('?')[0], rawUri.includes('?') ? rawUri.slice(rawUri.indexOf('?') + 1) : ''];
  const [newPath, newQuery] = to.includes('?') ? [to.slice(0, to.indexOf('?')) || path, to.slice(to.indexOf('?') + 1)] : [to, query];
  return newQuery === '' ? newPath : `${newPath}?${newQuery}`;
}
const once = transformCaddyfile(LIVE_PREVIEW);

describe('transformCaddyfile', () => {
  it('turns every slot-A proxy into a two-slot proxy with the shared health rules', () => {
    const out = transformCaddyfile(LIVE_PREVIEW);
    // The fixture's two slot-A proxies (the notify handle and the main route), then the loopback listener's own.
    const twoSlot = /reverse_proxy 127\.0\.0\.1:3100 127\.0\.0\.1:3200 \{\n\s+import debateai_slots\n/g;
    expect(out.slice(0, out.indexOf(':3090 {')).match(twoSlot)).toHaveLength(2);
    expect(out.match(twoSlot)).toHaveLength(3);
    expect(out).not.toMatch(/reverse_proxy 127\.0\.0\.1:3100 \{/);
    expect(diffRemovedLines(LIVE_PREVIEW, out)).toEqual(['\t\t\treverse_proxy 127.0.0.1:3100 {', '\t\treverse_proxy 127.0.0.1:3100 {']);
    // Each import sits one level inside its own proxy block, so the header lines after it are unchanged.
    expect(out).toContain('\t\t\treverse_proxy 127.0.0.1:3100 127.0.0.1:3200 {\n\t\t\t\timport debateai_slots\n\t\t\t\theader_up Host v3-preview.dezbatere.ro\n');
    expect(out).toContain('\t\treverse_proxy 127.0.0.1:3100 127.0.0.1:3200 {\n\t\t\timport debateai_slots\n\t\t\theader_up Host v3-preview.dezbatere.ro\n');
  });

  it('puts the shared rules right after the global options block, exactly as the snippet file has them', () => {
    expect(readFileSync(resolve('deploy/preview-release/v1/caddy/debateai-slots.caddy'), 'utf8')).toBe(`${SNIPPET_LINES.join('\n')}\n`);
    const out = transformCaddyfile(LIVE_PREVIEW);
    const live = LIVE_PREVIEW.split('\n'), close = live.indexOf('}');
    expect(out.split('\n').slice(0, close + 2 + SNIPPET_LINES.length)).toEqual([...live.slice(0, close + 1), '', ...SNIPPET_LINES]);
    // The global block itself is untouched: still admin off (Caddy is restarted, never reloaded).
    expect(out.split('\n').slice(0, close + 1)).toEqual(live.slice(0, close + 1));
  });

  it("adds a loopback-only listener with the main route's header lines", () => {
    const out = transformCaddyfile(LIVE_PREVIEW);
    expect(out.endsWith([
      'http://v3-preview.dezbatere.ro {', '\tredir https://v3-preview.dezbatere.ro{uri} 308', '}', '',
      ...LISTENER_LINES,
      ''
    ].join('\n'))).toBe(true);
    expect(EDGE_LISTENER).toEqual({ port: 3090, bind: '127.0.0.1' });
    expect(Object.isFrozen(EDGE_LISTENER)).toBe(true);
    // The listener has no password and no wrong-host check: its one proxy carries the main route's own headers instead.
    const site = out.slice(out.indexOf(':3090 {'));
    expect(site).not.toMatch(/basic_auth|route /);
  });

  it('the loopback listener proxies only GET /readyz; every other request gets 404 and is never proxied', () => {
    const out = transformCaddyfile(LIVE_PREVIEW);
    expect(listenerRoute(out, 'GET', '/readyz')).toBe('proxy');
    for (const [method, path] of [['GET', '/'], ['GET', '/api/v1/debates'], ['GET', '/api/v1/staff/alerts'], ['GET', '/login'], ['POST', '/readyz'], ['HEAD', '/readyz'],
      ['GET', '/readyz/../api'], ['GET', '/readyz/../api/v1/debates'], ['GET', '/readyz/x'], ['GET', '/readyz/'], ['GET', '/readyz//'], ['GET', '/readyzz'], ['GET', '/livez'], ['DELETE', '/readyz']] as const) {
      expect([method, path, listenerRoute(out, method, path)]).toEqual([method, path, 'refuse']);
    }
    // The edge secret and the proxy live only inside the readiness handle: the 404 handle adds no header and proxies nothing.
    const lines = out.split('\n'), site = blockAt(lines, lines.indexOf(':3090 {'));
    const ready = blockAt(site, site.indexOf('\thandle @readyz {'));
    const rest = site.filter(line => !ready.includes(line));
    expect(rest.join('\n')).not.toMatch(/reverse_proxy|X-Debateai-Edge-Secret|header_up/);
    expect(ready.filter(line => /reverse_proxy /.test(line))).toEqual(['\t\treverse_proxy 127.0.0.1:3100 127.0.0.1:3200 {']);
    // Whatever path took the handle, the website is asked for exactly /readyz, with no query string (D9 review).
    expect(ready[1]).toBe('\t\trewrite * /readyz?');
    for (const uri of ['/readyz', '/readyz?debug=1', '/READYZ?a=b&c', '/api/../readyz?x', '/readyz/.']) {
      expect([uri, listenerRoute(out, 'GET', uri)]).toEqual([uri, 'proxy']);
      expect([uri, listenerUpstreamUri(out, uri)]).toEqual([uri, '/readyz']);
    }
  });

  it('the public route refuses /readyz itself, first in the main route, before the password and the proxy (final fix wave W2)', () => {
    expect(PUBLIC_READYZ_REFUSAL).toBe('respond /readyz 404');
    const out = transformCaddyfile(LIVE_PREVIEW), lines = out.split('\n');
    // Exactly once in the whole file: never in the notify handle, never in the loopback listener (which serves /readyz).
    expect(lines.filter(line => line.includes('/readyz 404'))).toEqual([PUBLIC_READYZ_LINES[1]]);
    const site = blockAt(lines, lines.indexOf('v3-preview.dezbatere.ro {'));
    const route = blockAt(site, site.indexOf('\troute {'));
    // In a `route`, Caddy runs the directives as written: the refusal comes before the wrong-host check, the password
    // (basic_auth) and every reverse_proxy, so a visitor gets Caddy's own 404, with or without the password.
    expect(route.slice(0, 3)).toEqual(['\troute {', ...PUBLIC_READYZ_LINES]);
    const at = (needle: string) => route.findIndex(line => line.includes(needle));
    expect(at(PUBLIC_READYZ_REFUSAL)).toBeLessThan(at('basic_auth {'));
    expect(at(PUBLIC_READYZ_REFUSAL)).toBeLessThan(at('reverse_proxy '));
    const listener = blockAt(lines, lines.indexOf(':3090 {'));
    expect(listener.join('\n')).not.toContain(PUBLIC_READYZ_REFUSAL);
  });

  it('a main proxy at the site level gets the refusal as the site block\'s first line (Caddy orders respond before reverse_proxy)', () => {
    const flat = ['{', '\tadmin off', '}', '', 'v3-preview.dezbatere.ro {', '\theader -Server', '\treverse_proxy 127.0.0.1:3100 {', `\t\t${EDGE_SECRET}`, '\t}', '}', ''].join('\n');
    const lines = transformCaddyfile(flat).split('\n');
    const site = blockAt(lines, lines.indexOf('v3-preview.dezbatere.ro {'));
    expect(site.slice(0, 3)).toEqual(['v3-preview.dezbatere.ro {', '\t# Readiness is never read through the public name: Caddy checks the slots directly, root asks 127.0.0.1:3090.', `\t${PUBLIC_READYZ_REFUSAL}`]);
    // A proxy outside any site block (directly after the global options) is not a shape this change was written for.
    expect(() => transformCaddyfile(['{', '\tadmin off', '}', 'reverse_proxy 127.0.0.1:3100 {', `\t${EDGE_SECRET}`, '}', ''].join('\n'))).toThrow('CADDY_SHAPE_REFUSED');
  });

  it('changes nothing else: every other line stays, and the only new lines are the snippet, the imports and the listener', () => {
    const out = transformCaddyfile(LIVE_PREVIEW);
    const { removed, added } = diffLines(LIVE_PREVIEW, out);
    expect(removed).toHaveLength(2);
    const expected = ['', ...SNIPPET_LINES,
      PUBLIC_READYZ_LINES[0], PUBLIC_READYZ_LINES[1],
      '\t\t\treverse_proxy 127.0.0.1:3100 127.0.0.1:3200 {', '\t\t\t\timport debateai_slots',
      '\t\treverse_proxy 127.0.0.1:3100 127.0.0.1:3200 {', '\t\t\timport debateai_slots',
      ...LISTENER_LINES, ''];
    expect([...added].sort()).toEqual([...expected].sort());
  });

  it('its upstreams are exactly the two slots\' website ports', () => {
    expect(SLOT_UPSTREAMS).toBe(`127.0.0.1:${PREVIEW_SLOTS.A.uiPort} 127.0.0.1:${PREVIEW_SLOTS.B.uiPort}`);
    expect(transformCaddyfile(LIVE_PREVIEW)).toContain(`reverse_proxy ${SLOT_UPSTREAMS} {`);
  });

  it('keeps the file\'s own indentation: a file indented with spaces gets spaces', () => {
    const spaced = LIVE_PREVIEW.replace(/\t/g, '    ');
    expect(transformCaddyfile(spaced)).toBe(transformCaddyfile(LIVE_PREVIEW).replace(/\t/g, '    '));
  });

  it('ends the file with one newline even when the live file has none', () => {
    expect(transformCaddyfile(LIVE_PREVIEW.slice(0, -1))).toBe(transformCaddyfile(LIVE_PREVIEW));
  });

  it.each([
    ['a second run', once, 'CADDY_ALREADY_TWO_SLOTS'],
    ['a file that already names the shared rules', LIVE_PREVIEW.replace('\t\t\t-Server\n', '\t\t\t-Server\n\t\t\t# import debateai_slots\n'), 'CADDY_ALREADY_TWO_SLOTS'],
    ['a file that already listens on the loopback port', `${LIVE_PREVIEW}\n:3090 {\n\trespond 404\n}\n`, 'CADDY_ALREADY_TWO_SLOTS'],
    ['a file that already proxies to slot B', LIVE_PREVIEW.replace('reverse_proxy 127.0.0.1:3100 {\n\t\t\theader_up Host', 'reverse_proxy 127.0.0.1:3200 {\n\t\t\theader_up Host'), 'CADDY_ALREADY_TWO_SLOTS'],
    ['another upstream', LIVE_PREVIEW.replace('\t\treverse_proxy 127.0.0.1:3100 {\n\t\t\theader_up Host', '\t\treverse_proxy 127.0.0.1:3101 {\n\t\t\theader_up Host'), 'CADDY_SHAPE_REFUSED'],
    ['a second upstream on a slot-A line', LIVE_PREVIEW.replace('\t\treverse_proxy 127.0.0.1:3100 {\n\t\t\theader_up Host', '\t\treverse_proxy 127.0.0.1:3100 127.0.0.1:4000 {\n\t\t\theader_up Host'), 'CADDY_SHAPE_REFUSED'],
    ['a proxy without a block', LIVE_PREVIEW.replace('\t\t\t-Server\n', '\t\t\t-Server\n\t\t}\n\t\thandle /x {\n\t\t\treverse_proxy 127.0.0.1:3100\n'), 'CADDY_SHAPE_REFUSED'],
    ['no admin off', LIVE_PREVIEW.replace('\tadmin off\n', ''), 'CADDY_SHAPE_REFUSED'],
    ['admin off outside the global block', LIVE_PREVIEW.replace('\tadmin off\n', '').replace('\ttls {\n', '\tadmin off\n\ttls {\n'), 'CADDY_SHAPE_REFUSED'],
    ['no global block', LIVE_PREVIEW.slice(LIVE_PREVIEW.indexOf('v3-preview.dezbatere.ro {')), 'CADDY_SHAPE_REFUSED'],
    ['a global block that never closes', '{\n\tadmin off\n', 'CADDY_SHAPE_REFUSED'],
    ['no slot-A proxy', LIVE_PREVIEW.replace(/\t*reverse_proxy 127\.0\.0\.1:3100 \{\n/g, '\t\thandle {\n'), 'CADDY_SHAPE_REFUSED'],
    ['no edge secret line', LIVE_PREVIEW.replace(`\t\t\t${EDGE_SECRET}\n\t\t\theader_up -Authorization\n\t\t}`, '\t\t\theader_up -Authorization\n\t\t}'), 'CADDY_SHAPE_REFUSED'],
    ['not text', 42, 'CADDY_SHAPE_REFUSED']
  ] as const)('refuses %s', (_name, text, code) => {
    expect(() => transformCaddyfile(text)).toThrow(code);
  });

  it('the edge secret check reads the last proxy block only (the one the listener copies)', () => {
    // Without the secret in the notify block alone, the main block still has it: the transform goes ahead.
    const notifyWithout = LIVE_PREVIEW.replace(`\t\t\t\t${EDGE_SECRET}\n`, '');
    expect(transformCaddyfile(notifyWithout)).toContain(`\t\t\t${EDGE_SECRET}\n\t\t\theader_up -Authorization\n\t\t}\n\t}\n\thandle {\n`);
  });
});

describe('caddy-slots.mjs (root CLI)', () => {
  const roots: string[] = [];
  afterAll(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  const ROOT_ACTOR = { platform: 'linux', uid: 0, version: 'v26.8.2', umask: 0o022, env: { PATH: '/usr/bin:/bin' } };
  const sink = () => { const lines: string[] = []; return { lines, stream: { write: (text: string) => { lines.push(text); return true; } } }; };
  const setup = (text = LIVE_PREVIEW, mode = 0o644) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'caddy-slots-')));
    roots.push(root);
    chmodSync(root, 0o755);
    const live = join(root, 'Caddyfile');
    writeFileSync(live, text); chmodSync(live, mode);
    const run = async (argv: string[], actor: Record<string, unknown> = ROOT_ACTOR, deps: Record<string, unknown> = {}) => {
      const stdout = sink(), stderr = sink();
      const code = await main(argv, { actor, layout: { ownerUid: me.uid }, deps, stdout: stdout.stream, stderr: stderr.stream });
      return { code, stdout: stdout.lines.join(''), stderr: stderr.lines.join('') };
    };
    return { root, live, out: join(root, 'Caddyfile.two-slots'), run };
  };
  const reason = (result: { stderr: string }) => JSON.parse(result.stderr).reason;

  it('writes the new file 0644 next to nothing, leaves the live file alone, and prints what it changed', async () => {
    const { live, out, run } = setup();
    const result = await run(['transform', '--in', live, '--out', out]);
    expect(result).toEqual({ code: 0, stderr: '', stdout: `${JSON.stringify({ event: 'PREVIEW_CADDY_TWO_SLOTS', proxiesChanged: 2, edgeListener: 3090 })}\n` });
    expect(readFileSync(out, 'utf8')).toBe(transformCaddyfile(LIVE_PREVIEW));
    expect(statSync(out).mode & 0o777).toBe(0o644);
    expect(readFileSync(live, 'utf8')).toBe(LIVE_PREVIEW);
  });

  it('refuses an output that is already there, and keeps it', async () => {
    const { live, out, run } = setup();
    writeFileSync(out, 'KEEP\n');
    const result = await run(['transform', '--in', live, '--out', out]);
    expect([result.code, reason(result), result.stdout]).toEqual([1, 'OUTPUT_EXISTS', '']);
    expect(readFileSync(out, 'utf8')).toBe('KEEP\n');
    // The live file as its own output is the same case.
    expect(reason(await run(['transform', '--in', live, '--out', live]))).toBe('OUTPUT_EXISTS');
  });

  it('reads the written file back and refuses one that differs, keeping it for the operator to move aside', async () => {
    const { live, out, run } = setup();
    // A write that lost its tail (a full disk, a crash half way): the file is there, but it is not what the transform made.
    const short = async (path: string, bytes: Buffer) => { writeFileSync(path, bytes.subarray(0, bytes.length - 2), { flag: 'wx', mode: 0o644 }); chmodSync(path, 0o644); };
    const result = await run(['transform', '--in', live, '--out', out], ROOT_ACTOR, { write: short });
    expect([result.code, reason(result), result.stdout]).toEqual([1, 'OUTPUT_READBACK_REFUSED', '']);
    // Kept (never unlinked by the tool); until the operator moves it aside a rerun refuses.
    expect(existsSync(out)).toBe(true);
    expect(reason(await run(['transform', '--in', live, '--out', out]))).toBe('OUTPUT_EXISTS');
    // Equal bytes that the custody reader refuses (not 0644) are refused the same way.
    const other = setup();
    const private600 = async (path: string, bytes: Buffer) => { writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 }); chmodSync(path, 0o600); };
    expect(reason(await other.run(['transform', '--in', other.live, '--out', other.out], ROOT_ACTOR, { write: private600 }))).toBe('OUTPUT_READBACK_REFUSED');
  });

  it('refuses a live file of the wrong shape, or already changed, and writes nothing', async () => {
    for (const [text, code] of [[once, 'CADDY_ALREADY_TWO_SLOTS'], [LIVE_PREVIEW.replace('\tadmin off\n', ''), 'CADDY_SHAPE_REFUSED']] as const) {
      const { live, out, run } = setup(text);
      const result = await run(['transform', '--in', live, '--out', out]);
      expect(result).toEqual({ code: 1, stdout: '', stderr: `${JSON.stringify({ event: 'PREVIEW_CADDY_REFUSED', reason: code })}\n` });
      expect(existsSync(out)).toBe(false);
    }
  });

  it('reads only a root-owned file nobody else can write, and writes only into a folder only root can write', async () => {
    const loose = setup(LIVE_PREVIEW, 0o666);
    expect(reason(await loose.run(['transform', '--in', loose.live, '--out', loose.out]))).toBe('INPUT_REFUSED');
    const { root, live, run } = setup();
    expect(reason(await run(['transform', '--in', join(root, 'missing'), '--out', join(root, 'x')]))).toBe('INPUT_REFUSED');
    const open = join(root, 'open'); mkdirSync(open); chmodSync(open, 0o777);
    expect(reason(await run(['transform', '--in', live, '--out', join(open, 'Caddyfile.two-slots')]))).toBe('OUTPUT_PATH_REFUSED');
    expect(reason(await run(['transform', '--in', live, '--out', join(root, 'nowhere', 'Caddyfile')]))).toBe('OUTPUT_PATH_REFUSED');
    expect(existsSync(join(open, 'Caddyfile.two-slots'))).toBe(false);
  });

  it('refuses wrong arguments, and anyone but root with the measured Node and an emptied environment', async () => {
    const { live, out, run } = setup();
    for (const argv of [[], ['transform'], ['transform', '--in', live], ['transform', '--in', live, '--out', out, '--in', live], ['transform', '--in', 'Caddyfile', '--out', out],
      ['transform', '--in', live, '--out', `${out}/`], ['transform', '--in', live, '--out', `${live}/../x`], ['other', '--in', live, '--out', out], ['transform', '--in', live, '--x', out]]) {
      expect(reason(await run(argv))).toBe('ARGUMENTS_REFUSED');
    }
    for (const actor of [{ ...ROOT_ACTOR, uid: 1000 }, { ...ROOT_ACTOR, platform: 'darwin' }, { ...ROOT_ACTOR, version: 'v24.0.0' }, { ...ROOT_ACTOR, env: { PATH: '/usr/bin', HOME: '/root' } }]) {
      expect(reason(await run(['transform', '--in', live, '--out', out], actor))).toBe('ACTOR_REFUSED');
    }
    expect(existsSync(out)).toBe(false);
  });
});
