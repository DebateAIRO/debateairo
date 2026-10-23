// @vitest-environment jsdom
// Keyboard-only check (2026-10-22): the Account menu's panel is portaled to the end of <body>, so Tab past its
// last item used to leave the page with the menu still open (the blur had no relatedTarget), and Escape was then
// dead because the key no longer reached the menu. Focus must come back to the trigger instead of <body>.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import chrome from '../../apps/ui/messages/en/chrome.json';
let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); document.body.innerHTML = '<div id="root"></div><button id="outside">outside</button>'; root = createRoot(document.getElementById('root')!); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function mount() { const { AccountMenu } = await import(/* @vite-ignore */ '../../apps/ui/components/' + 'AccountMenu.tsx'); await act(async () => root.render(<AccountMenu authenticated catalog={chrome} client={{ logout: vi.fn(), revokeAllSessions: vi.fn() }} redirectTo={null}/>)); }
const trigger = () => document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
const menu = () => document.querySelector('[role="menu"]');
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
async function key(target: Element, init: KeyboardEventInit) { await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await Promise.resolve(); }); }
async function open() { await key(trigger(), { key: 'ArrowDown' }); expect(menu()).not.toBeNull(); expect(document.activeElement).toBe(items()[0]); }

it('Tab past the last item closes the menu from the trigger, so focus never leaves for <body>', async () => {
    await mount(); await open();
    await key(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(items().at(-1));
    await key(document.activeElement!, { key: 'Tab' });
    expect(menu()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(trigger());
});

it('Shift+Tab before the first item closes the menu and stays on the trigger', async () => {
    await mount(); await open();
    let event!: KeyboardEvent;
    await act(async () => { event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }); document.activeElement!.dispatchEvent(event); });
    expect(menu()).toBeNull();
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger());
});

it('Tab between items keeps the menu open', async () => {
    await mount(); await open();
    await key(document.activeElement!, { key: 'Tab' });
    expect(menu()).not.toBeNull();
});

it('focus leaving for nowhere (no relatedTarget) closes the menu and returns focus to the trigger', async () => {
    await mount(); await open();
    await act(async () => { (document.activeElement as HTMLElement).blur(); await Promise.resolve(); });
    expect(menu()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(trigger());
});

it('a press on the panel itself keeps it open, and Escape from <body> still closes it onto the trigger', async () => {
    await mount(); await open();
    const panel = menu()!;
    await act(async () => { panel.dispatchEvent(new Event('pointerdown', { bubbles: true })); (document.activeElement as HTMLElement).blur(); document.dispatchEvent(new Event('pointerup', { bubbles: true })); await Promise.resolve(); });
    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
    await key(document.body, { key: 'Escape' });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
});

it('Tabbing or clicking to another control keeps that control focused', async () => {
    await mount(); await open();
    const outside = document.getElementById('outside')!;
    await act(async () => { outside.focus(); await Promise.resolve(); });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(outside);
});
