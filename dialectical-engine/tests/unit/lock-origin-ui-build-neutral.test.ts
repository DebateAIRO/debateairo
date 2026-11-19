import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One website build serves both public names: nothing that names the site is baked in when the website is built. The
 * public name is read only by the ask proxy, at run time; the Turnstile site key only by three pages rendered per
 * request; and the build inlines only its release code (and the public model list, which names no site).
 */
const ROOT = resolve(import.meta.dirname, '../..');
const UI = join(ROOT, 'apps/ui');
const SKIPPED = new Set(['node_modules', 'public', 'messages', 'assets']);
const CODE = /\.(?:ts|tsx|mts|mjs|js)$/u;
function sources(folder: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(folder)) {
    if (SKIPPED.has(entry) || entry.startsWith('.next')) continue;
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (CODE.test(entry)) out.push(path);
  }
  return out;
}
const files = sources(UI).map(path => ({ path: relative(UI, path), text: readFileSync(path, 'utf8') }));
const readers = (pattern: RegExp) => files.filter(({ text }) => pattern.test(text)).map(({ path }) => path).sort();

describe('the website build is the same for both public names', () => {
  it('reads PUBLIC_APP_URL only as the ask proxy\'s configured name, when a request is served', () => {
    expect(readers(/process\.env(?:\.PUBLIC_APP_URL\b|\[\s*["'`]PUBLIC_APP_URL)/u)).toEqual(['app/api/[...path]/route.ts']);
    expect(readers(/\bPUBLIC_APP_URL\b/u)).toEqual(['app/api/[...path]/route.ts', 'lib/previewAskProxyCeiling.ts']);
    const route = files.find(({ path }) => path === 'app/api/[...path]/route.ts')!.text;
    expect(route.match(/PUBLIC_APP_URL/gu)).toHaveLength(1);
    expect(route).toContain('previewAskProxyCeiling({method:request.method,path,origin:request.headers.get("origin")},process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON,process.env.PUBLIC_APP_URL)');
  });

  it('reads the Turnstile site key only in three pages rendered per request', () => {
    const pages = ['app/login/page.tsx', 'app/sign-up/page.tsx', 'app/social/complete/page.tsx'];
    expect(readers(/process\.env\.TURNSTILE_SITE_KEY/u)).toEqual(pages);
    for (const page of pages) {
      const text = files.find(({ path }) => path === page)!.text;
      expect(text, page).toMatch(/await headers\(\)/u);
      expect(text, page).not.toMatch(/export const (?:dynamic|revalidate)\b/u);
    }
    expect(readers(/TURNSTILE_SITE_KEY/u)).toEqual(pages);
  });

  it('inlines only the release code through next.config.mjs', () => {
    const config = readFileSync(join(UI, 'next.config.mjs'), 'utf8');
    const block = /^\s*env:\s*\{([^{}]*)\},?\s*$/mu.exec(config);
    expect(block).not.toBeNull();
    expect([...block![1]!.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*:/gu)].map(match => match[1])).toEqual(['NEXT_PUBLIC_DEBATEAI_RELEASE_CODE']);
    expect(config.match(/^\s*env:/gmu)).toHaveLength(1);
  });

  it('reads no public build value that could name the site', () => {
    const names = [...new Set(files.flatMap(({ text }) => [...text.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/gu)].map(match => match[1]!)))].sort();
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter(name => /URL|ORIGIN|HOST|DOMAIN|SITE_KEY|TURNSTILE/u.test(name))).toEqual([]);
  });
});
