// The NETOPIA review window of the owner's runbook (deploy/preview-auth-dev/v1/MAIN-SITE.md, 5.8). REVIEW_OPEN lets a
// stranger read the public pages of dezbatere.ro without the site password, REVIEW_CLOSE and PWON close them again,
// and REVIEW_MACTEST tries the window on the Mac. The scripts live only in the runbook, so they are checked here as
// text and run in bash: the lines they share are the same in every copy; the address pattern opens every public page
// the website links (a new public page fails here until the window opens it, or the test names it as closed on purpose)
// and nothing else; every step that asks whether the password is on asks at /login, which the window never opens; the
// window's lines go in and come out again byte for byte; and every script parses.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
    'apps/ui/components/billing/PricingPlaceForm.tsx', 'apps/ui/components/billing/CancelFlow.tsx'
  ];

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
    // PWOFF2's robots check reads a header of the open site, so it keeps / on purpose.
    expect(runbook.split('\n').filter(line => ROOT_PROBE.test(line))).toEqual([
      `[ "$(curl -sI "https://$HOST/" | tr -d '\\r' | grep -ci '^x-robots-tag: noindex, nofollow$' || true)" = 1 ] || BAD="$BAD noindex"`
    ]);
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
