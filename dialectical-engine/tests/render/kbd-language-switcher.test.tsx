// @vitest-environment jsdom
// Keyboard-only check (2026-10-22): the language panel is portaled to the end of <body>. Tab out of its search
// field used to leave the page (the panel closed with focus nowhere), and a blur without a relatedTarget closed it
// without giving focus back. Keyboard dismissals now land on the trigger; a Tab or click to another control keeps it.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LanguageSwitcher } from '../../apps/ui/components/LanguageSwitcher.js';
let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); document.body.innerHTML = '<div id="root"></div><button id="outside">outside</button>'; root = createRoot(document.getElementById('root')!); });
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
const trigger = () => document.querySelector<HTMLButtonElement>('.languageSwitcherButton')!;
const panel = () => document.querySelector('[role="dialog"]');
const search = () => document.querySelector<HTMLInputElement>('[role="combobox"]')!;
async function open() {
    await act(async () => root.render(<LanguageSwitcher/>));
    await act(async () => { trigger().focus(); trigger().click(); });
    expect(panel()).not.toBeNull(); expect(document.activeElement).toBe(search());
}
async function key(target: Element, init: KeyboardEventInit) {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    await act(async () => { target.dispatchEvent(event); await Promise.resolve(); });
    return event;
}

it('Escape closes the panel onto its trigger', async () => {
    await open();
    await key(search(), { key: 'Escape' });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
});

it('Tab out of the search field closes the panel from the trigger instead of leaving the page', async () => {
    await open();
    const event = await key(search(), { key: 'Tab' });
    expect(panel()).toBeNull();
    // Not prevented: the browser's own Tab then moves on from the trigger to whatever follows it.
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(trigger());
});

it('Shift+Tab out of the search field lands on the trigger', async () => {
    await open();
    const event = await key(search(), { key: 'Tab', shiftKey: true });
    expect(panel()).toBeNull();
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger());
});

it('focus leaving for nowhere (no relatedTarget, no press) closes the panel onto the trigger', async () => {
    await open();
    await act(async () => { search().blur(); await Promise.resolve(); });
    expect(panel()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(trigger());
});

it('choosing a language with Enter gives focus back to the trigger while the page reloads', async () => {
    await open();
    await key(search(), { key: 'ArrowDown' });
    await key(search(), { key: 'Enter' });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
});

it('a click on another control closes the panel and leaves focus there', async () => {
    await open();
    const outside = document.getElementById('outside')!;
    await act(async () => { outside.dispatchEvent(new Event('pointerdown', { bubbles: true })); outside.focus(); await Promise.resolve(); });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(outside);
});

it('a press on empty page space closes the panel without pulling focus back', async () => {
    await open();
    await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); search().blur(); await Promise.resolve(); });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(document.body);
});
