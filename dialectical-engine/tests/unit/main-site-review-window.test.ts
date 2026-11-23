// The NETOPIA review window of the owner's runbook (deploy/preview-auth-dev/v1/MAIN-SITE.md, 5.8). REVIEW_OPEN lets a
// stranger read the public pages of dezbatere.ro without the site password, REVIEW_CLOSE and PWON close them again,
// and REVIEW_MACTEST tries the window on the Mac. The scripts live only in the runbook, so they are checked here as
// text and run in bash: the lines they share are the same in every copy; the address pattern opens every public page
// the website links (a new public page fails here until the window opens it, or the test names it as closed on purpose)
// and nothing else; every step that asks whether the password is on asks at /login, which the window never opens; the
// window's lines go in and come out again byte for byte; and every script parses. Then the names file's start helpers
// (3.0) run against a small model of how systemd starts the website and its API, with the steps that use them. Then a
// Caddyfile shaped as a server's own (spaces, a robots header after the password, Caddy's payment-marks rule) goes
// through REVIEW_OPEN's, PWOFF2's and REVIEW_MACTEST's checks. Last, the Team page's address and the team unlock of 5.7:
// REKEYCHECK reads whether the unlock can write, and UNLOCK waits for its first ready row.
import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { LEGAL_PAGES, TERMS_VERSIONS } from '../../apps/ui/lib/legal/pages.js';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const runbook = read('deploy/preview-auth-dev/v1/MAIN-SITE.md');

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
  if (open !== null) throw new Error('the runbook ends inside a fenced block');
  return out;
}
const blocks = fencedBlocks(runbook);

/** The one block with a line `# <step>: …`, the line every script of the runbook names itself with. */
function script(step: string): string {
  const found = blocks.filter(block => block.split('\n').some(line => line.startsWith(`# ${step}: `)));
  if (found.length !== 1) throw new Error(`${found.length} blocks name ${step}`);
  return found[0]!;
}

/** The lines from the first one starting with `from` to the first line at or after it that `last` accepts. */
function part(text: string, from: string, last: (line: string) => boolean): string {
  const lines = text.split('\n');
  const start = lines.findIndex(line => line.startsWith(from));
  const end = lines.findIndex((line, index) => index >= start && last(line));
  if (start < 0 || end < 0) throw new Error(`no part from ${from}`);
  return lines.slice(start, end + 1).join('\n');
}
const marksPart = (text: string) => part(text, "# The review window's marks", line => line.startsWith('wstrip() {'));
const closingPart = (text: string) => part(text, '# Closing the window', line => line === '}');
const opensPart = (text: string) => part(text, '# What the window opens.', line => line === '}');

const OPEN = script('REVIEW_OPEN');
const CLOSE = script('REVIEW_CLOSE');
const PWON = script('PWON');
const MACTEST = script('REVIEW_MACTEST');

const bash = (source: string, args: readonly string[] = []) => execFileSync('bash', ['-c', source, 'bash', ...args], {
  encoding: 'utf8',
  env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` }
});

describe('the lines the window scripts share', () => {
  it('the marks and the undo are the same text in REVIEW_OPEN, REVIEW_CLOSE, PWON and REVIEW_MACTEST', () => {
    for (const other of [CLOSE, PWON, MACTEST]) expect(marksPart(other)).toBe(marksPart(OPEN));
  });

  it('closing the window is the same text in REVIEW_CLOSE and PWON', () => {
    expect(closingPart(PWON)).toBe(closingPart(CLOSE));
  });

  it('what the window opens is the same text in REVIEW_OPEN and REVIEW_MACTEST', () => {
    expect(opensPart(MACTEST)).toBe(opensPart(OPEN));
  });

  it('every guard that refuses while the window is open asks what wopen asks', () => {
    expect(marksPart(OPEN)).toContain(`wopen() { grep -qE 'review_locked|review_quiet|review window begin' "$1"; }`);
    const guard = `! grep -qE 'review_locked|review_quiet|review window begin' "$C" || `;
    for (const step of ['NAME5', 'PWOFF1', 'SIGNUPS']) {
      expect(script(step)).toContain(`${guard}{ echo "${step}_NOT_DONE: the NETOPIA review window is open`);
    }
    expect(script('CLOSED')).toContain(`${guard}flag 'the site password: the NETOPIA review window is open`);
    expect(PWON).toContain('if wopen "$C"; then wclose PWON; fi');
  });

  it('the staff steps either refuse on dezbatere.ro, where the window opens, or never touch Caddy', () => {
    for (const step of ['NAME2', 'STAFFOFF', 'STAFFON']) {
      expect(script(step)).toContain('[ "$HOST" = v3-preview.dezbatere.ro ] || { echo "' + step + '_NOT_DONE: ');
    }
    const name3 = script('NAME3').split('\n').filter(line => !line.startsWith('#'));
    expect(name3[2]).toBe('cmp -s "$C" "$M/name/Caddyfile.phase1" || { echo "NAME3_NOT_DONE: the live Caddyfile is not the prepared one (nothing was stopped): look"; exit 1; }');
    for (const step of ['REKEYCHECK', 'STAFFMAIN', 'REKEY']) {
      const body = script(step).split('\n').filter(line => !line.startsWith('#')).join('\n');
      expect(body).not.toMatch(/\$C\b|[Cc]addy/u);
    }
  });
});

/** REVIEW_OPEN's address pattern, as Caddy's CEL `matches` gets it (RE2); it uses nothing JavaScript reads otherwise. */
const PATTERN_SOURCE = /^PAT='([^']*)'$/m.exec(OPEN)![1]!;
const PATTERN = new RegExp(PATTERN_SOURCE);

/** The pattern's fixed addresses: its first group's alternatives, the static-file folder last. */
function patternAlternatives(source: string): string[] {
  expect(source.startsWith('^(')).toBe(true);
  const out: string[] = [];
  let depth = 0, current = '';
  for (const character of source.slice(2)) {
    if (character === '(' || character === '[') depth++;
    if (character === ')' || character === ']') depth--;
    if (depth < 0) { out.push(current); return out; }
    if (character === '|' && depth === 0) { out.push(current); current = ''; } else current += character;
  }
  throw new Error('the pattern does not close its first group');
}

describe('the addresses the window opens', () => {
  const OPENS = [
    '/', '/?tab=public', '/?tab=yours', '/pricing', '/pricing?country=RO', '/pricing?country=US&postal_code=10001',
    '/pricing?country=CA&postal_code=K1A+0B1', '/pricing?country=GB&postal_code=SW1A%201AA', '/terms', '/terms?lang=ro',
    '/terms?_rsc=1ld0r', '/terms/versions', `/terms/versions/${'a'.repeat(64)}`, '/privacy', '/privacy?lang=fr',
    '/privacy/versions', `/privacy/versions/${'0'.repeat(64)}`, '/privacy/us-health-data', '/legal', '/cookies',
    '/providers', '/ai-transparency', '/cancel', '/withdraw', '/icon.svg', '/icon.svg?a1b2c3d4',
    '/consumer-protection/anpc-sal.png', '/payment-marks/netopia.svg', '/payment-marks/visa.svg',
    '/payment-marks/mastercard.svg', '/_next/static/chunks/main-app-1a2b3c.js', '/_next/static/css/abc123.css',
    '/_next/static/media/a34f9d1faa5f3315-s.p.woff2', '/_next/static/iCOIa4MxzDAQrqMXi5_oc/_buildManifest.js',
    '/_next/static/chunks/app/terms/versions/%5Bsha256%5D/page-b02e93be48dee8d9.js',
    '/_next/static/chunks/app/debate/%5bid%5d/page-1.js', '/_next/static/chunks/webpack-1.js?dpl=abc'
  ];
  const CLOSED = [
    '', '/login', '/login?next=%2Fv4', '/sign-up', '/settings', '/settings/security', '/settings/card',
    '/settings/notices', '/checkout', '/checkout?plan=PLUS', '/checkout/return', '/new', '/v4', '/v4/debate/x/report',
    '/v4/debate/x/report/pdf', '/help', '/export', '/admin/team', '/admin/reviews', '/admin/invitation', '/recover',
    '/recover-authenticator', '/reset-password', '/enroll-mfa', '/verify-email', '/verify-backup-email',
    '/verify-recovery-email', '/social/complete', '/public/debate/x', '/debate/x', '/debate/x/report', '/robots.txt',
    '/favicon.ico', '/apple-touch-icon.png', '/TERMS', '/Terms', '/Pricing', '/terms/', '/terms.', '/terms%2e',
    '/terms%2F', '//terms', '///', '/terms/../login', '/settings/..', '/settings/%2e%2e', '/settings%2F..',
    '/_next/static', '/_next/static/', '/_next/static/../../login', '/_next/static/./x.js', '/_next/static/.hidden',
    '/_next/static/%2e%2e/%2e%2e/login', '/_next/static/..%2f..%2flogin', '/_next/static/a%2fb',
    '/_next/static/a/../../../login', '/_next/static//x.js', '/_next/static/..\\..\\login', '/_next/static/a\\..',
    '/pricing/..%2Fsettings', '/terms/versions/..%2F..%2Fsettings', '/terms/versions/%2e%2e', '/terms/versions/ABCDEF',
    '/terms/versions/', '/pricing?next=/settings', '/pricing?x=a:b', '/pricing?x=a#b', '/pricing??x', '/pricing?x=1/..',
    'https://dezbatere.ro/terms', 'http://x/terms', '*', '/api/v1/session', '/api/v1/geo/availability',
    '/api/v1/billing/plans', '/api/v1/billing/cancel-link', '/api/v1/billing/cancel-by-token',
    '/_next/data/x/settings.json', '/_next/image?url=%2Ficon.svg&w=64&q=75', '/payment-marks/amex.svg',
    '/payment-marks/visa.SVG', '/consumer-protection/', '/icon.svg/', '/icon.svgx', '/terms\n', '/terms ', '/terms%20',
    '/pricingx', '/legal/x', '/cancel/x', '/withdraw/', '/privacy/us-health-data/x', '/terms;x', '/terms?lang=ro;x'
  ];

  it('opens every public address and none of the closed ones, the tricks included', () => {
    expect(OPENS.filter(address => !PATTERN.test(address))).toEqual([]);
    expect(CLOSED.filter(address => PATTERN.test(address))).toEqual([]);
  });

  it('opens exactly these pages and files, and each still exists in the website', () => {
    const PAGES: Readonly<Record<string, string>> = {
      '/': 'apps/ui/app/page.tsx', '/pricing': 'apps/ui/app/pricing/page.tsx', '/terms': 'apps/ui/app/terms/page.tsx',
      '/terms/versions': 'apps/ui/app/terms/versions/page.tsx',
      '/terms/versions/[0-9a-f]+': 'apps/ui/app/terms/versions/[sha256]/page.tsx',
      '/privacy': 'apps/ui/app/privacy/page.tsx', '/privacy/versions': 'apps/ui/app/privacy/versions/page.tsx',
      '/privacy/versions/[0-9a-f]+': 'apps/ui/app/privacy/versions/[sha256]/page.tsx',
      '/privacy/us-health-data': 'apps/ui/app/privacy/us-health-data/page.tsx', '/legal': 'apps/ui/app/legal/page.tsx',
      '/cookies': 'apps/ui/app/cookies/page.tsx', '/providers': 'apps/ui/app/providers/page.tsx',
      '/ai-transparency': 'apps/ui/app/ai-transparency/page.tsx', '/cancel': 'apps/ui/app/cancel/page.tsx',
      '/withdraw': 'apps/ui/app/withdraw/page.tsx', '/icon[.]svg': 'apps/ui/app/icon.svg',
      '/consumer-protection/anpc-sal[.]png': 'apps/ui/public/consumer-protection/anpc-sal.png',
      // Served by Caddy's payment-marks rule where a site has one (the release guide's PM2), and drawn only without
      // NETOPIA's hosted logo; elsewhere the address reaches the website's not-found page.
      '/payment-marks/(netopia|visa|mastercard)[.]svg': 'apps/ui/components/SiteFooter.tsx',
      '/_next/static(/([A-Za-z0-9_~-]|%5[BbDd])([A-Za-z0-9._~-]|%5[BbDd])*)+': 'apps/ui/next.config.mjs'
    };
    expect(patternAlternatives(PATTERN_SOURCE)).toEqual(Object.keys(PAGES));
    expect(Object.values(PAGES).filter(path => !existsSync(resolve(ROOT, path)))).toEqual([]);
  });

  it('opens every legal page the footers and the side navigation link, and every Terms version page', () => {
    expect(LEGAL_PAGES.length).toBeGreaterThan(0);
    expect(LEGAL_PAGES.map(({ href }) => href).filter(href => !PATTERN.test(href))).toEqual([]);
    expect(TERMS_VERSIONS.flatMap(({ href }) => href ?? []).filter(href => !PATTERN.test(href))).toEqual([]);
  });

  /** A page the public pages link that stays behind the password, and why. */
  const CLOSED_ON_PURPOSE: Readonly<Record<string, string>> = {
    '/login': 'sign-in stays behind the site password',
    '/login?next=%2Fv4': 'sign-in stays behind the site password',
    '/sign-up': 'sign-up stays behind the site password',
    '/settings': 'an account page; a stranger has no account',
    '/help': 'the help assistant; the footer hides its link while the help check answers 401'
  };
  const PUBLIC_SOURCES = [
    'apps/ui/app/page.tsx', 'apps/ui/app/not-found.tsx', 'apps/ui/app/pricing/page.tsx', 'apps/ui/app/cancel/page.tsx',
    'apps/ui/app/withdraw/page.tsx', 'apps/ui/app/terms/page.tsx', 'apps/ui/app/privacy/page.tsx',
    'apps/ui/app/legal/page.tsx', 'apps/ui/components/SiteFooter.tsx', 'apps/ui/components/AiNotice.tsx',
    'apps/ui/components/legal/LegalBodies.tsx', 'apps/ui/components/legal/LegalArchiveBodies.tsx',
    'apps/ui/components/legal/LegalPageLayout.tsx', 'apps/ui/components/consent/CookieBar.tsx',
    'apps/ui/components/consent/CookiePreferencesCard.tsx', 'apps/ui/components/landing/LandingChrome.tsx',
    'apps/ui/components/landing/LandingHero.tsx', 'apps/ui/components/landing/LandingMethod.tsx',
    'apps/ui/components/landing/LandingPricing.tsx', 'apps/ui/components/billing/PricingCards.tsx',
    'apps/ui/components/billing/PricingPlaceForm.tsx', 'apps/ui/components/billing/CancelFlow.tsx',
    'apps/ui/components/BetaNotice.tsx'
  ];

  it('the window\'s text names only the versions the versions pages list', () => {
    // The archive holds each Privacy text a versions page lists; the Terms list is TERMS_VERSIONS.
    const manifest = JSON.parse(read('packages/legal-manifest/src/manifest.json')) as { archive: Record<string, Record<string, Record<string, { version: string }>>> };
    const privacyVersions = new Set(Object.values(manifest.archive.PRIVACY!.en!).map(entry => entry.version));
    const flat = runbook.replace(/\s+/g, ' ');
    if (privacyVersions.size === 1) {
      for (const gone of ['one earlier version of the Privacy Policy', '(with earlier versions)', '(with their earlier versions)']) expect(flat, gone).not.toContain(gone);
      expect(flat).toContain(`the Privacy Policy's versions page (\`/privacy/versions\`) with its one entry, version ${[...privacyVersions][0]}`);
    }
    if (TERMS_VERSIONS.length === 1) {
      expect(TERMS_VERSIONS[0]!.href).toBe('/terms');
      expect(flat).toContain(`nothing is linked from \`/terms/versions\` (its one entry, version ${TERMS_VERSIONS[0]!.version}, is \`/terms\` itself)`);
    }
    // The window's logo line counts both of NETOPIA's pictures, as the footer draws them.
    expect(OPEN).toContain('np-black-0[.]svg[?]id=[0-9]+');
    expect(OPEN).toContain('np-white-0[.]svg[?]id=[0-9]+');
  });

  it('every site address the public pages write is open, or closed on purpose', () => {
    const written = PUBLIC_SOURCES.flatMap(path => [...read(path).matchAll(/"(\/[^"\s]*)"/gu)]
      .map(match => ({ path, address: match[1]!.split('#')[0]! })));
    expect(written.map(({ address }) => address)).toEqual(expect.arrayContaining(['/pricing', '/cancel', '/withdraw', '/consumer-protection/anpc-sal.png']));
    expect(written.filter(({ address }) => !PATTERN.test(address) && CLOSED_ON_PURPOSE[address] === undefined)).toEqual([]);
  });

  it("the public pages' own API requests are the ones the window answers", () => {
    const quiet = /^QUIETURI='(.*)'$/m.exec(OPEN)![1]!;
    const cancel = /^CANCEL='(.*)'$/m.exec(OPEN)![1]!;
    expect(read('apps/ui/lib/api.ts')).toContain('export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";');
    const contract = read('packages/contract/src/client.ts');
    expect(contract).toContain('readSession: () => request("/v1/session", SessionSchema)');
    expect(quiet).toContain('{http.request.orig_uri} == "/api/v1/session"');
    expect(read('apps/ui/components/support/availability.ts')).toContain('fetch("/api/v1/geo/availability", {');
    expect(quiet).toContain('{http.request.orig_uri} == "/api/v1/geo/availability"');
    for (const path of ['/v1/billing/cancel-link', '/v1/billing/cancel-by-token']) {
      expect(contract).toContain(`"${path}"`);
      expect(cancel).toContain(`{http.request.orig_uri} == "/api${path}"`);
    }
  });

  it('the language needs no address of its own: the middleware neither redirects nor rewrites', () => {
    const middleware = read('apps/ui/middleware.ts');
    expect(middleware).toContain('NextResponse.next(');
    expect(middleware).not.toMatch(/NextResponse\.(redirect|rewrite)\(/u);
  });

  it('the two rules use no backslash, no backtick and only the placeholders Caddy is asked about', () => {
    const rules = bash(`set -euo pipefail\n${opensPart(OPEN)}\nprintf '%s\\n' "$PUB" "$QUIET"`).trim().split('\n');
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(rule).not.toMatch(/[\\`]/u);
      expect([...new Set(rule.match(/\{[^}]*\}/gu))].sort()).toEqual([
        '{http.request.header.Authorization}', '{http.request.header.Cookie}', '{http.request.method}', '{http.request.orig_uri}',
        ...(rule === rules[1] ? ['{http.request.header.RSC}'] : [])
      ].sort());
    }
  });
});

describe('the probes and the scripts', () => {
  it('no step asks for the password at / any more, only at /login, which the window never opens', () => {
    const ROOT_PROBE = /"https:\/\/\$HOST\/"|https:\/\/dezbatere\.ro\/\)|"https:\/\/\$H\/"/u;
    // The robots checks of PWOFF2 and OPENCHECK read a header of the open site, so they keep / on purpose.
    expect(runbook.split('\n').filter(line => ROOT_PROBE.test(line))).toEqual([
      `[ "$(curl -sI "https://$HOST/" | tr -d '\\r' | grep -ci '^x-robots-tag: noindex, nofollow$' || true)" = 1 ] || bad "/ does not send the robots header exactly once"`,
      `[ "$(curl -sI "https://$HOST/" | tr -d '\\r' | grep -ci '^x-robots-tag: noindex, nofollow$' || true)" = 1 ] || BAD="$BAD noindex"`
    ]);
    expect(script('OPENCHECK')).toContain('bad "/ does not send the robots header exactly once"');
    expect(PWON.match(/"https:\/\/\$H\/login"/gu)).toHaveLength(2);
  });

  it('every script of the runbook parses', () => {
    const scripts = blocks.filter(block => block.startsWith('set -euo pipefail\n') || block.startsWith('#!/usr/bin/env bash\n'));
    expect(scripts.length).toBeGreaterThan(40);
    expect(scripts).toEqual(expect.arrayContaining([OPEN, CLOSE, PWON, MACTEST]));
    const broken = scripts.filter(block => {
      try { execFileSync('bash', ['-n'], { input: block, stdio: ['pipe', 'pipe', 'pipe'] }); return false; } catch { return true; }
    });
    expect(broken.map(block => block.split('\n')[1])).toEqual([]);
  });

  it("REVIEW_MACTEST's file checks pass on the Caddyfile the kit's own tools build", () => {
    // Its file part, up to Caddy itself, with node called directly where the owner's Mac uses a login zsh.
    const filePart = MACTEST.slice(0, MACTEST.indexOf('\n# 5. Caddy itself.'));
    const out = bash(`zsh() { shift; bash -c "$1"; }\n${filePart}`, [resolve(ROOT)]);
    expect(out).toMatch(/^file checks passed: one diff hunk \(\d+c\d+,\d+\), and the undo gives back the file before, byte for byte$/mu);
  });

  it("the window's lines come out exactly, keep a later change outside them, and a hand-edited window is refused", () => {
    const insert = OPEN.split('\n').find(line => line.startsWith('awk -v n="$BL" -v f="$RW.lines"'))!;
    const harness = [
      'set -euo pipefail', marksPart(OPEN), opensPart(OPEN), 'T=$(mktemp -d); trap \'rm -rf "$T"\' EXIT',
      'for I in "$(printf \'\\t\\t\')" "        "; do',
      '  printf \'%s\\n\' "x {" "${I}respond @wrongOrigin \\"ORIGIN_REFUSED\\" 403" "${I}basic_auth {" "${I}${I}{\\$PREVIEW_BASIC_AUTH_USER} {\\$PREVIEW_BASIC_AUTH_HASH}" "${I}}" "}" > "$T/before"',
      '  RK=$T/before; RW=$T/window; BL=3; wlines "$I" > "$RW.lines"', `  ${insert}`,
      '  [ "$(diff "$RK" "$RW" | grep -c \'^[0-9]\' || true)" = 1 ] && wopen "$RW" && ! wopen "$RK" || { echo NOT_ONE_HUNK; exit 1; }',
      '  wstrip "$RW" > "$T/undone" && cmp -s "$T/undone" "$RK" || { echo NOT_EXACT; exit 1; }',
      '  { cat "$RW"; echo "later {"; echo "}"; } > "$T/later"; wstrip "$T/later" > "$T/undone"',
      '  [ "$(diff "$RK" "$T/undone" | sed -n \'s/^> //p\' | tr \'\\n\' \' \')" = \'later { } \' ] || { echo LATER_LOST; exit 1; }',
      '  grep -v \'^[[:space:]]*# review window end$\' "$RW" > "$T/no-end"; ! wstrip "$T/no-end" > /dev/null || { echo NO_END_TAKEN; exit 1; }',
      '  ! wstrip "$RK" > /dev/null || { echo NO_WINDOW_TAKEN; exit 1; }',
      '  cat "$RW" "$RW" > "$T/twice"; ! wstrip "$T/twice" > /dev/null || { echo TWICE_TAKEN; exit 1; }',
      'done', 'echo WINDOW_LINES_OK'
    ].join('\n');
    expect(bash(harness).trim()).toBe('WINDOW_LINES_OK');
  });
});

// The website's unit is bound to its API (BindsTo= and After=, in the lifecycle's ui drop-in): systemd passes a restart of
// the API on to the website only while the website runs, and nothing starts a stopped website when the API starts. So a
// step that restarts only the API, with the website running, waits for both (apiup); a step that stopped both starts the
// API alone (apistart), then the website (webup), and says which of the two did not start.
describe("the names file's start helpers, and the steps that stop the website", () => {
  const LOCKS0 = script('LOCKS0');
  const locks0 = LOCKS0.split('\n');
  /** The names file after its first line, as LOCKS0 writes it. */
  const body = locks0.slice(locks0.indexOf(`{ printf '. %s\\n' "$NAMES"; cat <<'EOF'`) + 1, locks0.indexOf('EOF'));
  const helpers = body.slice(body.findIndex(line => line.startsWith('apistart() {')), body.findIndex(line => line.startsWith('relay() {')));

  /**
   * systemd as the units relate the two: stopping the API stops the website; restarting the API restarts the website
   * only when it runs; starting the website starts its API first. <api-refuses> and <web-fails> in the folder make the
   * next start of that one fail. The website answers its Log in page only while it is active.
   */
  const MODEL = [
    'API=debateai-preview-api@cur-r30-v1; WEB=debateai-preview-ui@cur-r30-v1; UIP=3100',
    'st() { cat "$D/$1" 2>/dev/null || echo inactive; }',
    `apigo() { : > "$D/journal"; if [ -e "$D/api-refuses" ]; then echo failed > "$D/$API"; echo 'PREVIEW_API_STARTUP_REFUSED {"code":"PREVIEW_STAFF_ORIGIN_MISMATCH"}' >> "$D/journal"; else echo active > "$D/$API"; echo 'PREVIEW_API_STARTED {}' >> "$D/journal"; fi; }`,
    'webgo() { if [ -e "$D/web-fails" ]; then echo failed > "$D/$WEB"; else echo active > "$D/$WEB"; fi; }',
    'systemctl() { case "$1" in',
    '  is-active) st "$2"; [ "$(st "$2")" = active ];;',
    '  stop) shift; for u in "$@"; do echo inactive > "$D/$u"; done; [ "$(st "$API")" = active ] || echo inactive > "$D/$WEB";;',
    '  restart|start) if [ "$2" = "$API" ]; then w=$(st "$WEB"); apigo; if [ "$1" = restart ] && [ "$w" = active ]; then if [ "$(st "$API")" = active ]; then webgo; else echo inactive > "$D/$WEB"; fi; fi',
    '    else [ "$(st "$API")" = active ] || apigo; if [ "$(st "$API")" = active ]; then webgo; else echo inactive > "$D/$WEB"; fi; fi;;',
    '  *) ;; esac; }',
    'journalctl() { case " $* " in *" -u $API "*) cat "$D/journal";; esac; }',
    'curl() { if [ "$(st "$WEB")" = active ]; then printf 200; else printf 000; fi; }',
    'sleep() { :; }'
  ];
  const world = (state: { api: string; web: string; apiRefuses?: boolean; webFails?: boolean }, lines: string[]) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-start-')));
    try {
      writeFileSync(join(dir, 'debateai-preview-api@cur-r30-v1'), `${state.api}\n`);
      writeFileSync(join(dir, 'debateai-preview-ui@cur-r30-v1'), `${state.web}\n`);
      if (state.apiRefuses) writeFileSync(join(dir, 'api-refuses'), '');
      if (state.webFails) writeFileSync(join(dir, 'web-fails'), '');
      const out = spawnSync('bash', ['-c', [`D='${dir}'`, ...MODEL, ...helpers, ...lines].join('\n')], { encoding: 'utf8' });
      const after = `api ${readFileSync(join(dir, 'debateai-preview-api@cur-r30-v1'), 'utf8').trim()}, website ${readFileSync(join(dir, 'debateai-preview-ui@cur-r30-v1'), 'utf8').trim()}`;
      return { lines: out.stdout.trim().split('\n'), after };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const call = (helper: string) => [`if ${helper}; then echo UP; else echo DOWN; fi`];

  it('the helpers parse, and the units relate the website to its API as the model does', () => {
    expect(spawnSync('bash', ['-n'], { input: body.join('\n') }).status).toBe(0);
    expect(helpers.map(line => line.split('(')[0]).filter(name => /^[a-z]+$/.test(name!))).toEqual(['apistart', 'apiup', 'webup', 'upfail']);
    const ui = read('deploy/preview-lifecycle/v1/systemd/debateai-preview-ui@.service.d/50-lifecycle.conf');
    expect(ui).toContain('\nBindsTo=debateai-preview-api@%i.service\n');
    expect(ui).toContain('\nAfter=debateai-preview-api@%i.service\n');
    expect(ui).not.toMatch(/^(PartOf|Requires|Wants)=/m);
    // Nothing on the API's side pulls the website in.
    for (const file of readdirSync(resolve(ROOT, 'deploy/preview-lifecycle/v1/systemd/debateai-preview-api@.service.d')))
      expect(read(`deploy/preview-lifecycle/v1/systemd/debateai-preview-api@.service.d/${file}`), file).not.toContain('debateai-preview-ui');
  });

  it('with the website running, apiup restarts both and waits for both, as the steps that restart only the API need', () => {
    expect(world({ api: 'active', web: 'active' }, call('apiup'))).toEqual({ lines: ['PREVIEW_API_STARTED {}', 'UP'], after: 'api active, website active' });
    // A website that does not come back is still a failure of the step, which then puts its file back.
    expect(world({ api: 'active', web: 'active', webFails: true }, call('apiup')).lines.slice(-2))
      .toEqual(['the API started, but the website does not answer its Log in page (systemctl is-active of the website: failed)', 'DOWN']);
    expect(world({ api: 'active', web: 'active', apiRefuses: true }, call('apiup')).lines.slice(-2))
      .toEqual(['the API did not start (systemctl is-active of the API: failed)', 'DOWN']);
  });

  it('with both stopped, apiup fails although the API started; apistart then webup start both and say which did not', () => {
    // The fault: the website stays stopped, so apiup waits for a page nothing starts.
    const stuck = world({ api: 'inactive', web: 'inactive' }, call('apiup'));
    expect(stuck.lines).toEqual(['PREVIEW_API_STARTED {}', 'the API started, but the website does not answer its Log in page (systemctl is-active of the website: inactive)', 'DOWN']);
    expect(stuck.after).toBe('api active, website inactive');
    expect(world({ api: 'inactive', web: 'inactive' }, [...call('apistart'), ...call('webup')])).toEqual({ lines: ['PREVIEW_API_STARTED {}', 'UP', 'UP'], after: 'api active, website active' });
    expect(world({ api: 'inactive', web: 'inactive', apiRefuses: true }, call('apistart')).lines.slice(-2)).toEqual(['the API did not start (systemctl is-active of the API: failed)', 'DOWN']);
    expect(world({ api: 'inactive', web: 'inactive', webFails: true }, [...call('apistart'), ...call('webup')]).lines.slice(-2))
      .toEqual(['the website did not start (its Log in page answered 000; systemctl is-active of the website: failed)', 'DOWN']);
  });

  it('NAME3 and NAME5 stop both, then start the API alone and then the website, and end truthfully', () => {
    for (const step of ['NAME3', 'NAME5']) {
      const lines = script(step).split('\n');
      const stop = lines.findIndex(line => line.startsWith('systemctl stop "$WEB" "$API" || '));
      const first = lines.findIndex(line => /^(apistart|apiup) \|\| /.test(line));
      const said = lines.findIndex(line => line.startsWith('said -xF '));
      expect(stop, step).toBeGreaterThan(0);
      expect(first, step).toBeGreaterThan(stop);
      expect(said, step).toBe(first + 2);
      // Before it stops anything: a names file without apistart (an earlier version of this guide) is a stop.
      const guard = lines.findIndex(line => line.startsWith('declare -F apistart >/dev/null || '));
      expect(guard, step).toBe(stop - 1);
      expect(spawnSync('bash', ['-c', ['set -euo pipefail', lines[guard]!, 'echo GOES_ON'].join('\n')], { encoding: 'utf8' }).stdout.trim())
        .toBe(`${step}_NOT_DONE: the names file is from an earlier version of this guide (no apistart; nothing was stopped): run LOCKS0 (3.0) again, then ${step}`);
      const run = (state: { apiRefuses?: boolean; webFails?: boolean }) => world({ api: 'active', web: 'active', ...state },
        ['set -euo pipefail', 'said() { :; }', 'MMODE=allow-list', lines[guard]!, lines[stop]!, ...lines.slice(first, said + 1), 'echo STARTED_AND_CHECKED']);
      expect(run({}), step).toEqual({ lines: ['PREVIEW_API_STARTED {}', 'STARTED_AND_CHECKED'], after: 'api active, website active' });
      const way = step === 'NAME3' ? 'run NAME5 now' : 'ask at once';
      expect(run({ apiRefuses: true }).lines.at(-1), step).toBe(`${step}_NOT_DONE: the API did not start (the line above names the setting): the site is DOWN: ${way}`);
      expect(run({ webFails: true }).lines.slice(-2), step).toEqual(['the website did not start (its Log in page answered 000; systemctl is-active of the website: failed)',
        `${step}_NOT_DONE: the API started, but the website did not (the line above names the setting): the site is DOWN: ${way}`]);
    }
  });

  it('no step calls apiup after it stopped the website, and "the API did not start" comes only from apistart', () => {
    for (const block of blocks) {
      const lines = block.split('\n');
      const stop = lines.findIndex(line => /systemctl stop [^|]*"\$WEB"/.test(line));
      if (stop >= 0) expect(lines.slice(stop + 1).filter(line => /\bapiup\b/.test(line)), lines[1]).toEqual([]);
    }
    const said = runbook.split('\n').filter(line => line.includes('_NOT_DONE: ') && line.includes('the API did not start'));
    expect(said.length).toBe(2);
    for (const line of said) expect(line).toMatch(/^apistart \|\| \{ echo "NAME[35]_NOT_DONE: the API did not start /);
    // The guide says why, and how a server with the old names file gets these helpers.
    const flat = runbook.replace(/\s+/g, ' ');
    expect(flat).toContain('systemd passes a restart on only to a unit that is running');
    expect(flat).toContain('On a server whose names file was written before `upfail` came, run LOCKS0 once, with `rNN` left as it is, before the next of those steps, NAME3 or NAME5.');
  });

  it('apiup fails with 1 when the API refused and with 2 when only the website did not answer, and upfail words each', () => {
    const run = (state: { apiRefuses?: boolean; webFails?: boolean }) => world({ api: 'active', web: 'active', ...state },
      ['R=0; apiup || R=$?', 'echo "code $R"', 'if [ "$R" != 0 ]; then upfail "$R" \'the plan\'; echo; fi']).lines;
    expect(run({}).at(-1)).toBe('code 0');
    expect(run({ apiRefuses: true }).slice(-2)).toEqual(['code 1', 'the API refused the plan (its code is above)']);
    expect(run({ webFails: true }).slice(-2)).toEqual(['code 2', 'the API started on the plan, but the website did not answer its Log in page (the line above)']);
  });

  /** The steps that restart only the API, with the website running. */
  const API_ONLY = ['MAIL_ALLOW', 'MAIL_OPEN', 'MAIL_CLOSE', 'STAFFOFF', 'STAFFON', 'STAFFMAIN', 'ASKS_OPEN', 'ASKS_CLOSE', 'BUYERS', 'PAY_SWITCH', 'PAY_BACK'];

  it('every step that restarts only the API refuses an older names file before it changes anything, and its last line is true when the API refuses or the website does not answer', () => {
    // Exactly these steps call apiup.
    const callers = blocks.filter(block => block.split('\n').some(line => !line.startsWith('#') && /\bapiup\b/.test(line)) && !block.includes("cat <<'EOF'"));
    expect(callers.map(block => /^# ([A-Z0-9_]+): /m.exec(block)![1]).sort()).toEqual([...API_ONLY].sort());
    expect(runbook).not.toContain('if ! apiup; then');
    // Putting the file before back makes the next start work, as the file before did; every other change is a stand-in.
    const STUBS = ['fixed() { rm -f "$D/api-refuses" "$D/web-fails"; }', 'install() { fixed; }', 'cp() { fixed; }', 'mv() { :; }', 'back() { fixed; }',
      'swap() { fixed; }', 'sandboxdrop() { :; }', 'livedrop() { :; }', 'modecheck() { :; }', 'M=/m; MP=/m/plan; K=/m/kept; A=/m/api; QL=x'];
    for (const step of API_ONLY) {
      const lines = script(step).split('\n');
      const guard = lines.findIndex(line => line.startsWith('declare -F upfail >/dev/null || '));
      const change = lines.findIndex(line => !line.startsWith('#') && /cp -p|install -|\bswap\b|\bmv\b|> "\$/.test(line));
      expect(guard, step).toBeGreaterThan(0);
      expect(guard, step).toBeLessThan(change);
      expect(spawnSync('bash', ['-c', ['set -euo pipefail', lines[guard]!, 'echo GOES_ON'].join('\n')], { encoding: 'utf8' }).stdout.trim(), step)
        .toBe(`${step}_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then ${step}`);
      const start = lines.indexOf('R=0; apiup || R=$?');
      expect(lines[start + 1], step).toMatch(/^if \[ "\$R" != 0 \]; then WHY=\$\(upfail "\$R" '[^']+'\); .*\{ apistart && webup; \} \|\| \{/);
      const run = (state: { apiRefuses?: boolean; webFails?: boolean }, fixes = true) => world({ api: 'active', web: 'active', ...state },
        ['set -euo pipefail', ...STUBS, ...(fixes ? [] : ['fixed() { :; }']), lines[start]!, lines[start + 1]!, 'echo REACHED']);
      expect(run({}).lines.at(-1), step).toBe('REACHED');
      // The API refused: systemd stopped the website with it, and the way back starts both again.
      const refused = run({ apiRefuses: true });
      expect(refused.after, step).toBe('api active, website active');
      expect(refused.lines.at(-1), step).toMatch(new RegExp(`^${step}_NOT_DONE: the API refused [^;]+ \\(its code is above\\); .*, and the API and the website started on (it|them)\\b`));
      // Only the website did not answer: the line never says the API refused.
      const website = run({ webFails: true });
      expect(website.after, step).toBe('api active, website active');
      expect(website.lines.at(-1), step).toMatch(new RegExp(`^${step}_NOT_DONE: the API started on [^,]+, but the website did not answer its Log in page \\(the line above\\); .*, and the API and the website started on (it|them)\\b`));
      expect(website.lines.at(-1), step).not.toContain('refused');
      // Nothing comes back: the line says the site is down.
      expect(run({ apiRefuses: true }, false).lines.at(-1), step).toMatch(new RegExp(`^${step}_NOT_DONE: the API refused .*: the site is DOWN: ask at once$`));
    }
  });

  it('LOCKS0 writes the names file, and run again writes it anew from this guide, keeping its first line and the file before', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-locks0-')));
    try {
      mkdirSync(join(dir, 'etc'));
      writeFileSync(join(dir, 'etc', 'api-cur-r30-v1.env'), 'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro\n');
      for (const nn of ['r30', 'r31']) writeFileSync(join(dir, `${nn}-names.sh`), [`LABEL=cur-r30-v1; KEY=r5-000000000000; SLOT=A; UIP=3100; E='${dir}/etc'`,
        `lc() { printf '%s\\n' '{"releases":[{"label":"cur-r30-v1","state":"CURRENT"}]}'; }`, ''].join('\n'));
      const locks = (nn: string | null) => {
        const text = locks0.map(line => line.startsWith('NAMES=') && nn !== null ? line.replace('rNN-names.sh', `${nn}-names.sh`) : line)
          .join('\n').replaceAll('/root/preview-archive/', `${dir}/`);
        const out = spawnSync('bash', ['-c', ['install() { local a; for a; do :; done; mkdir -p "$a"; }', text].join('\n')], { encoding: 'utf8' });
        return out.stdout.trim().split('\n').at(-1);
      };
      const names = join(dir, 'main-site', 'names.sh');
      const kept = () => readdirSync(join(dir, 'main-site')).filter(name => name.startsWith('names.sh.before-'));
      // The first time: rNN filled in.
      expect(locks(null)).toBe(`LOCKS0_NOT_DONE: ${dir}/rNN-names.sh is missing (fill in rNN)`);
      expect(locks('r30')).toBe('LOCKS0_DONE');
      expect(readFileSync(names, 'utf8').split('\n')[0]).toBe(`. ${dir}/r30-names.sh`);
      expect(kept()).toEqual([]);
      // A names file from an earlier version of this guide: no apistart. Run again with rNN left as it is: the first line
      // stays, the file before is kept beside it, and the new one has the helpers.
      const old = `. ${dir}/r30-names.sh\nM=${dir}/main-site\napiup() { :; }\n`;
      writeFileSync(names, old);
      expect(locks(null)).toBe('LOCKS0_DONE');
      const now = readFileSync(names, 'utf8');
      expect(now.split('\n')[0]).toBe(`. ${dir}/r30-names.sh`);
      expect(now).toContain('\napistart() {');
      expect(kept()).toHaveLength(1);
      expect(readFileSync(join(dir, 'main-site', kept()[0]!), 'utf8')).toBe(old);
      // Never over a copy kept before (two runs in one second): the copy goes aside here so the next run can keep its own.
      rmSync(join(dir, 'main-site', kept()[0]!));
      // With rNN filled in, the first line names that upload.
      expect(locks('r31')).toBe('LOCKS0_DONE');
      expect(readFileSync(names, 'utf8').split('\n')[0]).toBe(`. ${dir}/r31-names.sh`);
      // A first line that reads no upload's names file: nothing changes.
      writeFileSync(names, 'echo hello\n');
      expect(locks(null)).toBe(`LOCKS0_NOT_DONE: the first line of ${dir}/main-site/names.sh does not read an upload's names file (nothing changed): fill in rNN, or look`);
      expect(readFileSync(names, 'utf8')).toBe('echo hello\n');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

/**
 * A Caddyfile shaped as a server's own file can be: indented with spaces, the HTTPS header group first, a header group
 * after the password that sends the robots header already, and Caddy's own rule for the payment marks. Like the real
 * file it holds only the names of values and paths, never a secret.
 */
const SERVER_SHAPE = [
  '{', '    email {$PREVIEW_ACME_EMAIL}', '    admin off', '    auto_https disable_redirects', '}', '',
  'dezbatere.ro {', '\theader {', '\t\tStrict-Transport-Security "max-age=31536000"', '\t\t-Server', '\t}',
  '    route {', '        respond /readyz 404', '        @wrongHost not host dezbatere.ro', '        respond @wrongHost "NOT_FOUND" 404',
  '        @wrongOrigin expression `{http.request.header.Origin} != "" && {http.request.header.Origin} != "https://dezbatere.ro"`',
  '        respond @wrongOrigin "ORIGIN_REFUSED" 403', '        basic_auth {', '            {$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}', '        }',
  '        header {', '            Cache-Control "no-store"', '            X-Robots-Tag "noindex, nofollow"', '            -Server', '        }',
  '        @paymentMarks path /payment-marks/netopia.svg /payment-marks/visa.svg /payment-marks/mastercard.svg',
  '        handle @paymentMarks {', '            root * /etc/debateai-v3-preview/public/payment-marks', '            uri strip_prefix /payment-marks', '            file_server', '        }',
  '        reverse_proxy 127.0.0.1:3100 127.0.0.1:3200 {', '            header_up X-Debateai-Edge-Secret {file./etc/debateai-v3-preview/ui-edge.caddy.secret}', '        }',
  '    }', '}', '', 'http://dezbatere.ro {', '    redir https://dezbatere.ro{uri} 308', '}', ''
].join('\n');
const ROBOTS = '            X-Robots-Tag "noindex, nofollow"\n';

/** Runs a bash source with arguments; its exit status and what it printed. */
const bashRun = (source: string, args: readonly string[] = []) => {
  const out = spawnSync('bash', ['-c', source, 'bash', ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` } });
  return { status: out.status, lines: out.stdout.trim().split('\n') };
};
/** A scratch folder for one test. */
const withFolder = <T>(run: (dir: string) => T): T => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-window-')));
  try { return run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

describe('a robots header the server\'s own Caddyfile sends already', () => {
  const robotsPart = (text: string) => part(text, '# The robots header the Caddyfile may send already', line => line.startsWith('robots() {'));
  const robotsOf = (file: string) => withFolder(dir => {
    writeFileSync(join(dir, 'Caddyfile'), file);
    return bashRun(`set -euo pipefail\n${robotsPart(OPEN)}\nrobots "$1"`, [join(dir, 'Caddyfile')]).lines.join('\n');
  });

  it('is read by the same lines in REVIEW_OPEN, REVIEW_MACTEST, PWOFF1 and PWOFF2', () => {
    for (const step of ['REVIEW_MACTEST', 'PWOFF1', 'PWOFF2']) expect(robotsPart(script(step)), step).toBe(robotsPart(OPEN));
  });

  it('is accepted only as X-Robots-Tag "noindex, nofollow" in a plain header group after the password, inside the dezbatere.ro block', () => {
    expect(robotsOf(SERVER_SHAPE)).toBe('group');
    expect(robotsOf(SERVER_SHAPE.replace(ROBOTS, ''))).toBe('none');
    expect(robotsOf(SERVER_SHAPE.replace('X-Robots-Tag "noindex, nofollow"', 'X-Robots-Tag "none"'))).toBe('other');
    expect(robotsOf(SERVER_SHAPE.replace(ROBOTS, ROBOTS + ROBOTS))).toBe('other');
    // Before the password, in a header group with a matcher, as a one-line header, or outside the block: refused.
    expect(robotsOf(SERVER_SHAPE.replace(ROBOTS, '').replace('\t\t-Server\n', '\t\t-Server\n\t\tX-Robots-Tag "noindex, nofollow"\n'))).toBe('other');
    expect(robotsOf(SERVER_SHAPE.replace('        header {\n            Cache-Control', '        header @pages {\n            Cache-Control'))).toBe('other');
    expect(robotsOf(SERVER_SHAPE.replace(ROBOTS, '').replace('        @paymentMarks path', '        header X-Robots-Tag "noindex, nofollow"\n        @paymentMarks path'))).toBe('other');
    expect(robotsOf(SERVER_SHAPE.replace(ROBOTS, '').replace('    redir https://dezbatere.ro{uri} 308', '    header X-Robots-Tag "noindex, nofollow"\n    redir https://dezbatere.ro{uri} 308'))).toBe('other');
  });

  it('REVIEW_OPEN goes on with that header group and refuses any other robots line, after it found the password line', () => {
    expect(OPEN).not.toContain("grep -qi 'x-robots-tag'");
    const lines = OPEN.split('\n');
    const from = lines.findIndex(line => line.startsWith(`[ "$(grep -cx 'dezbatere\\.ro {' "$C" || true)" = 1 ]`));
    const guard = lines.findIndex(line => line.startsWith('[ "$(robots "$C")" != other ] || '));
    expect(from).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(from);
    expect(guard).toBeLessThan(lines.findIndex(line => line.startsWith('install -d -o root -g root -m 0700 "$RV"')));
    const checks = (file: string) => withFolder(dir => {
      writeFileSync(join(dir, 'Caddyfile'), file);
      return bashRun(['set -euo pipefail', robotsPart(OPEN), `C='${join(dir, 'Caddyfile')}'`, ...lines.slice(from, guard + 1), 'echo CHECKS_PASSED'].join('\n')).lines.at(-1);
    });
    expect(checks(SERVER_SHAPE)).toBe('CHECKS_PASSED');
    expect(checks(SERVER_SHAPE.replace(ROBOTS, ''))).toBe('CHECKS_PASSED');
    expect(checks(SERVER_SHAPE.replace('X-Robots-Tag "noindex, nofollow"', 'X-Robots-Tag "noindex"')))
      .toBe('REVIEW_OPEN_NOT_DONE: the live Caddyfile has a robots line other than X-Robots-Tag "noindex, nofollow" in the header group after the password; nothing changed: ask');
  });

  it('PWOFF1 reads it before its copies, and PWOFF2 wants the robots line added only when the file before sends none', () => {
    const pwoff1 = script('PWOFF1').split('\n');
    const read1 = pwoff1.findIndex(line => line.startsWith('RB=$(robots "$C"); [ "$RB" != other ] || '));
    expect(read1).toBeGreaterThan(0);
    expect(read1).toBeLessThan(pwoff1.findIndex(line => line.startsWith('cp -p "$C" "$M/password/Caddyfile.before-open"')));
    const pwoff2 = script('PWOFF2').split('\n');
    const from = pwoff2.indexOf('diff "$K" "$O" || true');
    const to = pwoff2.findIndex(line => line.startsWith('[ "$(printf \'%s\\n\' "$RM" | head -n 1 | cut -d\' \' -f1)" = basic_auth ]'));
    expect(to).toBeGreaterThan(from);
    const AUTH = '        basic_auth {\n            {$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}\n        }\n';
    const LINE = '        respond @wrongHost "NOT_FOUND" 404\n';
    const edit = (before: string, copy: string) => withFolder(dir => {
      writeFileSync(join(dir, 'kept'), before); writeFileSync(join(dir, 'copy'), copy);
      return bashRun(['set -euo pipefail', robotsPart(OPEN), `K='${join(dir, 'kept')}'; O='${join(dir, 'copy')}'`, ...pwoff2.slice(from, to + 1), 'echo CHECKS_PASSED'].join('\n')).lines.at(-1);
    });
    const none = SERVER_SHAPE.replace(ROBOTS, '');
    const added = (file: string) => file.replace(AUTH, '').replace(LINE, `${LINE}        header X-Robots-Tag "noindex, nofollow"\n`);
    expect(edit(SERVER_SHAPE, SERVER_SHAPE.replace(AUTH, ''))).toBe('CHECKS_PASSED');
    expect(edit(none, added(none))).toBe('CHECKS_PASSED');
    expect(edit(SERVER_SHAPE, added(SERVER_SHAPE))).toBe('PWOFF2_NOT_DONE: the copy must add no line (the header group after the password sends the robots header already) and take out the basic_auth block, nothing else (8.2; nothing changed)');
    expect(edit(none, none.replace(AUTH, ''))).toBe('PWOFF2_NOT_DONE: the copy must add the one robots line and take out the basic_auth block, nothing else (8.2; nothing changed)');
    expect(edit(SERVER_SHAPE.replace('"noindex, nofollow"', '"none"'), SERVER_SHAPE.replace('"noindex, nofollow"', '"none"').replace(AUTH, '')))
      .toMatch(/^PWOFF2_NOT_DONE: the Caddyfile kept by PWOFF1 has a robots line other than /);
    // The owner's edit in 8.2 names both cases.
    const flat = runbook.replace(/\s+/g, ' ');
    expect(flat).toContain('`sends the robots header already`: add nothing.');
    expect(flat).toContain('`sends no robots header`: right after the line `respond @wrongHost "NOT_FOUND" 404`, add one line');
  });
});

describe('REVIEW_MACTEST on a copy of the server\'s live Caddyfile', () => {
  const filePart = MACTEST.slice(0, MACTEST.indexOf('\n# 5. Caddy itself.'));

  it('tests the copy given as its second argument, with REVIEW_OPEN\'s file checks and the robots guard', () => withFolder(dir => {
    writeFileSync(join(dir, 'Caddyfile.live'), SERVER_SHAPE);
    const out = bashRun(`zsh() { shift; bash -c "$1"; }\n${filePart}`, [resolve(ROOT), join(dir, 'Caddyfile.live')]);
    expect(out.status).toBe(0);
    expect(out.lines).toContain(`the file under test: ${join(dir, 'Caddyfile.live')} (the copy of the server's live Caddyfile)`);
    expect(out.lines).toContain('the robots header in the file before the window: group (none, or group: sent already by the header group after the password)');
    expect(out.lines.at(-1)).toMatch(/^file checks passed: one diff hunk \(\d+c\d+,\d+\), and the undo gives back the file before, byte for byte$/u);
    writeFileSync(join(dir, 'Caddyfile.other'), SERVER_SHAPE.replace('"noindex, nofollow"', '"none"'));
    expect(bashRun(`zsh() { shift; bash -c "$1"; }\n${filePart}`, [resolve(ROOT), join(dir, 'Caddyfile.other')]).lines.at(-1))
      .toBe('REVIEW_MACTEST_NOT_DONE: the file has a robots line other than X-Robots-Tag "noindex, nofollow" in the header group after the password: REVIEW_OPEN refuses it too');
    // Without the second argument it still tests the recorded file, which sends no robots header.
    expect(bashRun(`zsh() { shift; bash -c "$1"; }\n${filePart}`, [resolve(ROOT)]).lines).toContain('the robots header in the file before the window: none (none, or group: sent already by the header group after the password)');
  }));

  it('gives the local copies their local ports however admin off is indented, and a stand-in for root\'s payment-mark folder', () => withFolder(dir => {
    const lines = MACTEST.split('\n');
    const from = lines.findIndex(line => line.startsWith('# 6. Local copies'));
    const to = lines.indexOf('done', from);
    const local = (file: string) => {
      for (const name of ['before-window', 'window']) writeFileSync(join(dir, `Caddyfile.${name}`), file);
      const out = bashRun(['set -euo pipefail', 'nd() { echo "REVIEW_MACTEST_NOT_DONE: $1"; exit 1; }', 'wstrip() { cat "$1"; }', `T='${dir}'; RW=$T/Caddyfile.window`, ...lines.slice(from + 1, to + 1), 'echo LOCAL_DONE'].join('\n'));
      return { last: out.lines.at(-1), text: out.status === 0 ? readFileSync(join(dir, 'local.window'), 'utf8') : '' };
    };
    const spaces = local(SERVER_SHAPE);
    expect(spaces.last).toBe('LOCAL_DONE');
    expect(spaces.text).toContain('    admin off\n\tlocal_certs\n\tskip_install_trust\n\thttp_port 18080\n\thttps_port 18443\n');
    expect(spaces.text).toContain(`root * ${dir}/payment-marks\n`);
    expect(spaces.text).toContain(`{file.${dir}/edge.secret}`);
    expect(readFileSync(join(dir, 'payment-marks/netopia.svg'), 'utf8')).toMatch(/^<svg /u);
    expect(local(SERVER_SHAPE.replace('    admin off', '\tadmin off')).text).toContain('\tadmin off\n\tlocal_certs\n');
    expect(local(SERVER_SHAPE.replace('    admin off\n', '')).last).toBe('REVIEW_MACTEST_NOT_DONE: the before-window file has not one global admin off line, so its local copy would not get local ports');
  }));

  it('expects the NETOPIA mark open to a stranger, from the website or from Caddy\'s own payment-marks rule', () => withFolder(dir => {
    expect(MACTEST).toContain('\nprobe mark GET /payment-marks/netopia.svg\n');
    expect(MACTEST).not.toContain('probe open GET /payment-marks/netopia.svg');
    mkdirSync(join(dir, 'payment-marks'));
    writeFileSync(join(dir, 'payment-marks/netopia.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
    const probe = part(MACTEST, 'probe() {', line => line === '}');
    // curl answers as the scenario says: the stand-in file (Caddy's rule), the website, a not-found, or another body.
    const answer = (scenario: string) => bashRun(['set -euo pipefail', `T='${dir}'; FAILS=0; H=dezbatere.ro; B=https://dezbatere.ro:18443`,
      `curl() { : > "$T/head"; case '${scenario}' in file) cp "$T/payment-marks/netopia.svg" "$T/body"; printf 200;; website) printf 'UPSTREAM GET /payment-marks/netopia.svg\\n' > "$T/body"; printf 200;; missing) : > "$T/body"; printf 404;; other) printf 'something else\\n' > "$T/body"; printf 200;; esac; }`,
      probe, 'probe mark GET /payment-marks/netopia.svg'].join('\n')).lines[0];
    expect(answer('file')).toBe('ok    mark GET /payment-marks/netopia.svg');
    expect(answer('website')).toBe('ok    mark GET /payment-marks/netopia.svg');
    expect(answer('missing')).toBe('FAIL  mark GET /payment-marks/netopia.svg: answered 404, password box 0, not passed on');
    expect(answer('other')).toBe('FAIL  mark GET /payment-marks/netopia.svg: answered 200, password box 0, not passed on');
  }));

  it('the guide says how to take the copy, and that it holds no secret', () => {
    const flat = runbook.replace(/\s+/g, ' ');
    expect(flat).toContain("`ssh <PREVIEW_SSH> 'sudo -n cat /etc/debateai-v3-preview/public/Caddyfile' > ~/Caddyfile.live`");
    expect(flat).toContain('`bash ~/review-mactest.sh <the full path of the dialectical-engine folder> ~/Caddyfile.live`');
    expect(flat).toContain('The file holds no secret: only the names of the values in `caddy.env`');
  });
});

describe('the Team page and the team unlock (5.7)', () => {
  it('the guides give the Team page by its address, since no menu links to it', () => {
    expect(runbook).not.toContain('Admin → Team');
    expect(existsSync(resolve(ROOT, 'apps/ui/app/admin/team/page.tsx'))).toBe(true);
    expect(runbook.replace(/\s+/g, ' ')).toContain('1. Open https://dezbatere.ro/admin/team, the Team page (type the address: no menu links to it).');
    expect(read('deploy/preview-lifecycle/v1/README.md')).toContain('on the Team page (`/admin/team`; no menu links to it)');
  });

  it('REKEYCHECK tries the unlock\'s own login exactly as the unlock starts its helper', () => {
    const rekeycheck = script('REKEYCHECK');
    const flags = '--clear-groups --inh-caps=-all --no-new-privs -- /usr/bin/env -i';
    expect(rekeycheck.split(`setpriv --reuid="$RU" --regid="$RG" ${flags} `).length - 1).toBe(2);
    expect(read('deploy/preview-lifecycle/v1/unlock-team-tools.mjs')).toContain("'--clear-groups', '--inh-caps=-all', '--no-new-privs', '--', layout.env, '-i', nodePath, join(here, 'readiness-writer-actor.mjs')");
    // The helper refuses any group but its own, so adding the user to the socket folder's group cannot help.
    expect(read('deploy/preview-lifecycle/v1/readiness-writer-actor.mjs')).toContain('process.getgroups().some(group => group !== gid)');
    const lifecycle = read('deploy/preview-lifecycle/v1/README.md').replace(/\s+/g, ' ');
    expect(lifecycle).toContain('**What the socket folder must allow.** The unlock starts its helper as `debateai-readiness`\'s own uid and gid with no other group (`setpriv --clear-groups`)');
    expect(lifecycle).toContain('b to e cannot pass: use the fallback (f) until a reviewed change to the socket folder or to the helper');
  });

  it('REKEYCHECK says NOT READY with the step to do when the unlock can write neither way, or would refuse its fallback', () => {
    const lines = script('REKEYCHECK').split('\n');
    const chk = lines.find(line => line.startsWith("BAD=''; NB=0; chk() {"))!;
    const from = lines.indexOf('TU=debateai-preview-team-unlock');
    const to = lines.findIndex(line => line.startsWith('elif [ -z "$OWN" ]; then chk '));
    const last = lines.find(line => line.startsWith('[ -z "$BAD" ] || { echo "REKEYCHECK_NOT_DONE: '))!;
    const order = lines.find(line => line.startsWith('if [ "$FB" = 0 ]; then echo "the team unlock writes'))!;
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const STUBS = [
      `systemctl() { case "$*" in *LoadState*) echo loaded;; *ExecStart*) if [ -e "$D/fallback" ]; then echo 'ExecStart={ argv[]=/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login /node unlock-team-tools.mjs run }'; else echo 'ExecStart={ argv[]=/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /node unlock-team-tools.mjs run }'; fi;; esac; }`,
      'id() { [ -e "$D/user" ] || return 1; case "$1" in -u) echo 998;; -g) echo 997;; esac; }',
      `setpriv() { printf '%s\\n' "$*" >> "$D/setpriv"; case "$*" in *readiness-writer-actor.mjs*) echo '{"schema":"preview-lifecycle-readiness-v1","ok":false,"code":"STAFF_READINESS_INPUT_REFUSED"}';; *psql*) if [ -e "$D/socket" ]; then echo 'debateai_staff_readiness_writer|debateai_staff_readiness_writer'; else echo 'psql: error: connection to server on socket "/run/debateai-v3-preview/postgresql/.s.PGSQL.5434" failed: Permission denied' >&2; printf '\\tIs the server running locally and accepting connections on that socket?\\n' >&2; return 2; fi;; esac; }`,
      "stat() { echo '750 postgres:debateai-preview-db-client'; }", 'N=/node; L=/lifecycle'
    ];
    const run = (flags: readonly string[]) => withFolder(dir => {
      for (const flag of flags) writeFileSync(join(dir, flag), '');
      const out = bashRun(['set -euo pipefail', `D='${dir}'`, ...STUBS, chk, ...lines.slice(from, to + 1), last, order, 'echo REKEYCHECK_DONE'].join('\n'));
      const called = existsSync(join(dir, 'setpriv')) ? readFileSync(join(dir, 'setpriv'), 'utf8') : '';
      return { lines: out.lines, called };
    });
    const ownOrder = 'the team unlock writes as its own login: in 5.7, UNLOCK (step 3) comes before REKEY (step 4)';
    const fallbackOrder = 'the team unlock writes with its fallback: in 5.7, REKEY (step 4) comes first, then UNLOCK (step 3) right after REKEY_DONE';
    const install = '. Until it can, install the unlock\'s fallback (the lifecycle guide, install step 7 f), then run REKEYCHECK again';
    // Neither way: the user is missing and no fallback is installed (as on a server where step 7 was never done).
    const missing = run([]);
    expect(missing.lines).toEqual([`NOT READY: the team unlock cannot write as its own login: the dedicated user debateai-readiness is missing, or has uid or gid 0 (step 7 b)${install}`,
      `REKEYCHECK_NOT_DONE: the team unlock cannot write as its own login: the dedicated user debateai-readiness is missing, or has uid or gid 0 (step 7 b)${install}`]);
    // The user exists but, with no other group, cannot reach the socket: psql's own answer and the folder's mode.
    const socket = run(['user']);
    expect(socket.lines[0]).toBe(`NOT READY: the team unlock cannot write as its own login: debateai-readiness, with no other group, does not get in as debateai_staff_readiness_writer (psql said: psql: error: connection to server on socket "/run/debateai-v3-preview/postgresql/.s.PGSQL.5434" failed: Permission denied; the socket folder is 750 postgres:debateai-preview-db-client; step 7 e says what each answer means)${install}`);
    expect(socket.called).toContain('--reuid=998 --regid=997 --clear-groups --inh-caps=-all --no-new-privs -- /usr/bin/env -i /usr/lib/postgresql/18/bin/psql -w --host=/run/debateai-v3-preview/postgresql --port=5434 --username=debateai_staff_readiness_writer -d debateai');
    // With the fallback installed in that case, the unlock can work: the order is REKEY first.
    expect(run(['user', 'fallback']).lines).toEqual([fallbackOrder, 'REKEYCHECK_DONE']);
    expect(run(['fallback']).lines).toEqual([fallbackOrder, 'REKEYCHECK_DONE']);
    expect(run(['user', 'socket']).lines).toEqual([ownOrder, 'REKEYCHECK_DONE']);
    // Both: the fallback would refuse to start.
    expect(run(['user', 'socket', 'fallback']).lines.at(-1)).toBe('REKEYCHECK_NOT_DONE: the team unlock\'s fallback is installed, but its own login works, so the unlock would refuse to start (STAFF_WRITER_FALLBACK_NOT_NEEDED): move the fallback out (the lifecycle guide, install step 7 f, back to the default), then run REKEYCHECK again');
  });

  it('UNLOCK ends with UNLOCK_DONE only once the unlock wrote a fresh ready row, never on its start line alone', () => {
    const unlock = script('UNLOCK');
    expect(unlock.split('\n').at(-1)).toBe('exit 1');
    const STUBS = [
      `systemctl() { case "$1" in is-active) cat "$D/state" 2>/dev/null || echo inactive;; show) case "$*" in *ExecStart*) echo 'ExecStart={ argv[]=/usr/bin/env -i PATH=x /node unlock-team-tools.mjs run }';; esac;; start) if [ -e "$D/fails" ]; then echo failed > "$D/state"; else echo active > "$D/state"; fi;; *) ;; esac; }`,
      'journalctl() { cat "$D/journal" 2>/dev/null || true; }', 'runuser() { cat "$D/ready" 2>/dev/null || echo 0; }', 'sleep() { :; }'
    ];
    const UNLOCKED = '{"event":"PREVIEW_TEAM_TOOLS_UNLOCKED","until":"2026-11-23T11:00:00.000Z","writer":"peer-readiness-writer","windowMinutes":60}';
    const locked = (reason: string) => `{"event":"PREVIEW_TEAM_TOOLS_LOCKED","outcome":"FAILED","reason":"${reason}","roleReset":false}`;
    const run = (journal: readonly string[], ready: number, fails = false) => withFolder(dir => {
      writeFileSync(join(dir, 'journal'), journal.map(line => `${line}\n`).join(''));
      writeFileSync(join(dir, 'ready'), `${ready}\n`);
      if (fails) writeFileSync(join(dir, 'fails'), '');
      return bashRun(['set -euo pipefail', `D='${dir}'`, ...STUBS, unlock].join('\n')).lines.at(-1);
    });
    expect(run([UNLOCKED], 1)).toBe('UNLOCK_DONE');
    // The start line alone, with no ready row: not unlocked.
    expect(run([UNLOCKED], 0)).toBe('UNLOCK_NOT_DONE: the team unlock runs, but wrote no fresh ready row within five minutes: run  systemctl stop debateai-preview-team-unlock , then ask');
    // It stopped before or after its start line: the reason, and what to do.
    expect(run([locked('STAFF_READINESS_USER_MISSING')], 0)).toBe('UNLOCK_NOT_DONE: the team unlock stopped (STAFF_READINESS_USER_MISSING): the unlock cannot write as its own login: run REKEYCHECK (5.7), which names the step to do (the lifecycle guide, install step 7), then UNLOCK again');
    expect(run([UNLOCKED, locked('STAFF_READINESS_DATABASE_UNAVAILABLE')], 1)).toBe('UNLOCK_NOT_DONE: the team unlock stopped (STAFF_READINESS_DATABASE_UNAVAILABLE): the unlock cannot write as its own login: run REKEYCHECK (5.7), which names the step to do (the lifecycle guide, install step 7), then UNLOCK again');
    expect(run([locked('STAFF_WRITER_FALLBACK_NOT_NEEDED')], 0)).toMatch(/^UNLOCK_NOT_DONE: the team unlock stopped \(STAFF_WRITER_FALLBACK_NOT_NEEDED\): its own login works, so its fallback refuses to start/);
    expect(run([], 0, true)).toBe('UNLOCK_NOT_DONE: the team unlock stopped (the unit is failed): ask, and give this line and the lines above');
    // The ready row it waits for is the one the unlock's writer publishes.
    expect(read('migrations/0088_staff_alert_delivery.sql')).toContain('INSERT INTO staff.independent_alert_readiness(singleton,config_sha256,generation,ack_adapter_id,rehearsal_id,published_at,valid_until)');
    expect(read('deploy/preview-lifecycle/v1/readiness-writer-actor.mjs')).toContain("publish: { sql: 'SELECT staff.publish_independent_alert_readiness(");
    // Step 3 gives the fallback's order, and REKEY sends the owner to UNLOCK.
    const flat = runbook.replace(/\s+/g, ' ');
    expect(flat).toContain('`writes with its fallback`: do step 4 (REKEY) first. Right after `REKEY_DONE`, run UNLOCK, then step 5 within the permit\'s 15 minutes.');
    expect(script('REKEY')).toContain('REKEY_NOT_DONE: the team tools are locked: run UNLOCK (step 3) until it ends with UNLOCK_DONE, then REKEY again; nothing changed');
    expect(flat).not.toContain('Wait about half a minute.');
  });
});
