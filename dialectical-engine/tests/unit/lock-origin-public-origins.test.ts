import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript-classic';
import { describe, expect, it } from 'vitest';
import { PREVIEW_ASK_ORIGINS } from '../../apps/ui/lib/previewAskProxyCeiling.js';
import { PREVIEW_MAIN_ORIGIN, previewMainOriginAdmitted } from '../../apps/api/src/preview-origin.js';
const { PUBLIC_ORIGINS, PUBLIC_SITES } = await import('../../deploy/' + 'preview-auth-dev/v1/public-origins.mjs');

/**
 * The public names live in one list (deploy/preview-auth-dev/v1/public-origins.mjs). The website and the API keep their
 * own small copies, because they must not import operator files; these tests pin the copies to the list and make sure
 * no other public name can slip into the kit or the two apps unnoticed.
 */
const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const MAIN_SITE = PUBLIC_SITES.find((site: { hostedOnly: boolean }) => site.hostedOnly);
const TEST_SITE = PUBLIC_SITES.find((site: { hostedOnly: boolean }) => !site.hostedOnly);
const GUARD = 'previewGate !== undefined && environment.PUBLIC_APP_URL !== "https://v3-preview.dezbatere.ro"';

describe('the copies of the public names', () => {
  it('the website\'s ask origins are the list', () => {
    expect([...PREVIEW_ASK_ORIGINS]).toEqual([...PUBLIC_ORIGINS]);
    expect(Object.isFrozen(PREVIEW_ASK_ORIGINS)).toBe(true);
  });

  it('the API\'s main origin is the list\'s hosted-only name, admitted only in hosted mode', () => {
    expect(PUBLIC_SITES.filter((site: { hostedOnly: boolean }) => site.hostedOnly)).toHaveLength(1);
    expect(PREVIEW_MAIN_ORIGIN).toBe(MAIN_SITE.origin);
    expect(previewMainOriginAdmitted({ PUBLIC_APP_URL: MAIN_SITE.origin, DEPLOYMENT_MODE: 'hosted' })).toBe(true);
    expect(previewMainOriginAdmitted({ PUBLIC_APP_URL: MAIN_SITE.origin, DEPLOYMENT_MODE: 'local' })).toBe(false);
    for (const origin of [TEST_SITE.origin, 'https://dezbatere.ro/', 'https://www.dezbatere.ro', 'https://evil.test', ''])
      expect(previewMainOriginAdmitted({ PUBLIC_APP_URL: origin, DEPLOYMENT_MODE: 'hosted' }), origin).toBe(false);
  });

  it('the API\'s start guard keeps its pinned line, names the test name, and lets through only the hosted main name', () => {
    const source = read('apps/api/src/main.ts');
    const file = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const guards = file.statements.filter((statement): statement is ts.IfStatement => ts.isIfStatement(statement) && statement.expression.getText(file) === GUARD);
    expect(guards).toHaveLength(1);
    const guard = guards[0]!;
    // The literal in the pinned line is the list's test name.
    const literal = (guard.expression as ts.BinaryExpression).right as ts.BinaryExpression;
    expect(ts.isStringLiteral(literal.right) && literal.right.text).toBe(TEST_SITE.origin);
    expect(guard.elseStatement).toBeUndefined();
    const body = guard.thenStatement;
    expect(ts.isBlock(body) && body.statements.length).toBe(1);
    const inner = (body as ts.Block).statements[0]!;
    expect(ts.isIfStatement(inner)).toBe(true);
    expect((inner as ts.IfStatement).expression.getText(file)).toBe('!previewMainOriginAdmitted(environment)');
    expect((inner as ts.IfStatement).thenStatement.getText(file)).toBe('throw new TypeError("PREVIEW_PROVIDER_ORIGIN_INVALID");');
    expect((inner as ts.IfStatement).elseStatement).toBeUndefined();
    expect(source).toContain('import { previewMainOriginAdmitted } from "./preview-origin.js";');
  });
});

describe('no other public name', () => {
  const FOLDERS = ['deploy/preview-auth-dev/v1', 'apps/api/src', 'apps/ui/lib'];
  const SKIPPED = new Set(['node_modules', '.next', 'generated', 'dist']);
  /** Every file in the folders except documentation. */
  function files(folder: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(ROOT, folder))) {
      if (SKIPPED.has(entry)) continue;
      const path = join(ROOT, folder, entry);
      if (statSync(path).isDirectory()) out.push(...files(relative(ROOT, path)));
      else if (!entry.endsWith('.md')) out.push(relative(ROOT, path));
    }
    return out;
  }
  const ORIGIN_LITERAL = /https?:\/\/[A-Za-z0-9.-]*dezbatere\.ro(?![A-Za-z0-9.-])[^\s"'`)]*/gu;
  const found = FOLDERS.flatMap(files).flatMap(path => [...read(path).matchAll(ORIGIN_LITERAL)].map(match => ({ path, origin: match[0] })));

  it('every site address in the kit and the two apps is a listed origin', () => {
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter(({ origin }) => !PUBLIC_ORIGINS.includes(origin))).toEqual([]);
  });

  it('the main name is written only in the list and its two pinned copies', () => {
    expect([...new Set(found.filter(({ origin }) => origin === MAIN_SITE.origin).map(({ path }) => path))].sort())
      .toEqual(['apps/api/src/preview-origin.ts', 'apps/ui/lib/previewAskProxyCeiling.ts', 'deploy/preview-auth-dev/v1/public-origins.mjs']);
  });
});
