import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewAskProxyCeiling } from '../../apps/ui/lib/previewAskProxyCeiling.js';
import * as route from '../../apps/ui/app/api/[...path]/route.js';

/**
 * The long ask ceiling follows the name the website is configured to answer as (its PUBLIC_APP_URL, read when the
 * request is served): the browser's Origin must be exactly that name, and the name must be a listed one. With no name
 * given, it is the test name, as before.
 */
const models = '["zai-org/GLM-5.3-Flash"]';
const PREVIEW = 'https://v3-preview.dezbatere.ro', MAIN = 'https://dezbatere.ro';
const ask = (origin: string | null) => ({ method: 'POST', path: ['v1', 'asks'], origin });
const original = { base: process.env.DIALECTICAL_API_BASE, models: process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON, origin: process.env.PUBLIC_APP_URL };
const restore = (key: string, value: string | undefined) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  restore('DIALECTICAL_API_BASE', original.base); restore('NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON', original.models); restore('PUBLIC_APP_URL', original.origin);
});

describe('the ask ceiling under the configured public name', () => {
  it('admits the main name when the website answers as it', () => {
    expect(previewAskProxyCeiling(ask(MAIN), models, MAIN)).toBe(1_260_000);
    expect(previewAskProxyCeiling(ask(PREVIEW), models, PREVIEW)).toBe(1_260_000);
  });

  it('refuses an Origin that is not the configured name, and a configured name that is not listed', () => {
    expect(previewAskProxyCeiling(ask(PREVIEW), models, MAIN)).toBeUndefined();
    expect(previewAskProxyCeiling(ask(MAIN), models, PREVIEW)).toBeUndefined();
    for (const configured of ['https://evil.test', 'https://www.dezbatere.ro', 'https://dezbatere.ro/', 'http://dezbatere.ro', ''])
      expect(previewAskProxyCeiling(ask(configured), models, configured), configured).toBeUndefined();
    expect(previewAskProxyCeiling(ask(null), models, MAIN)).toBeUndefined();
  });

  it('keeps the other conditions under the main name', () => {
    expect(previewAskProxyCeiling({ method: 'GET', path: ['v1', 'asks'], origin: MAIN }, models, MAIN)).toBeUndefined();
    expect(previewAskProxyCeiling({ method: 'POST', path: ['v1', 'answers'], origin: MAIN }, models, MAIN)).toBeUndefined();
    expect(previewAskProxyCeiling(ask(MAIN), undefined, MAIN)).toBeUndefined();
    expect(previewAskProxyCeiling(ask(MAIN), '["other/model"]', MAIN)).toBeUndefined();
  });

  it('behaves as before with no configured name', () => {
    expect(previewAskProxyCeiling(ask(PREVIEW), models, undefined)).toBe(1_260_000);
    expect(previewAskProxyCeiling(ask(MAIN), models, undefined)).toBeUndefined();
    expect(previewAskProxyCeiling(ask(PREVIEW), models)).toBe(1_260_000);
    expect(previewAskProxyCeiling(ask(MAIN), models)).toBeUndefined();
  });

  it.each([
    { configured: MAIN, origin: MAIN, want: 1_260_000 },
    { configured: MAIN, origin: PREVIEW, want: 55_000 },
    { configured: undefined, origin: MAIN, want: 55_000 },
    { configured: undefined, origin: PREVIEW, want: 1_260_000 },
    { configured: 'https://evil.test', origin: 'https://evil.test', want: 55_000 }
  ])('the route reads PUBLIC_APP_URL when it serves an ask: %j', async ({ configured, origin, want }) => {
    process.env.DIALECTICAL_API_BASE = 'http://acceptance.local:8790';
    process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON = models;
    restore('PUBLIC_APP_URL', configured);
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const request = new Request(`${origin}/api/v1/asks`, { method: 'POST', headers: { origin }, body: '{}' });
    const response = await route.POST(request, { params: Promise.resolve({ path: ['v1', 'asks'] }) });
    expect(response.status).toBe(200);
    expect(timeout).toHaveBeenCalledWith(want);
  });
});
