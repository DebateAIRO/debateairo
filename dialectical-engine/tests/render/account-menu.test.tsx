// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import chrome from '../../apps/ui/messages/en/chrome.json';
let root: Root;
beforeEach(()=> { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); document.body.innerHTML='<div id="root"></div><button id="outside">outside</button>'; root=createRoot(document.getElementById('root')!); sessionStorage.clear(); });
afterEach(async()=>{await act(async()=>root.unmount()); vi.unstubAllGlobals();});
async function mount(client: any) { const { AccountMenu }=await import(/* @vite-ignore */ '../../apps/ui/components/' + 'AccountMenu.tsx'); await act(async()=>root.render(<AccountMenu authenticated catalog={chrome} client={client} redirectTo={null}/>)); }
async function click(selector:string) { await act(async()=> (document.querySelector(selector) as HTMLElement).click()); }
it('every normal, landing, Help and debate header uses the shared menu, without the synthetic role',()=>{
 for(const file of ['TopBar.tsx','landing/LandingChrome.tsx','support/Assistant.tsx','../app/debate/[id]/DebatePageClient.tsx']) expect(readFileSync(`apps/ui/components/${file}`,'utf8')).toContain('<AccountMenu');
 expect(readFileSync('apps/ui/components/TopBar.tsx','utf8')).not.toContain('chrome.askerRolePlaceholder');
});
it('keyboard opens and moves through items; Escape restores focus and outside keeps the destination',async()=>{
 expect(existsSync('apps/ui/components/AccountMenu.tsx')).toBe(true);
 await mount({logout:vi.fn(), revokeAllSessions:vi.fn()});
 const trigger=document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
 await act(async()=>trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 expect(document.activeElement?.textContent).toBe('Account');
 await act(async()=>document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 expect(document.activeElement?.textContent).toBe('Security');
 await act(async()=>document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 expect(document.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
 await click('[aria-haspopup="menu"]');
 await act(async()=>{document.getElementById('outside')!.dispatchEvent(new Event('pointerdown',{bubbles:true})); document.getElementById('outside')!.focus(); await new Promise(resolve=>setTimeout(resolve,10));});
 expect(document.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(document.getElementById('outside'));
});
it('a double logout sends one request and clears the transcript and existing event only after success',async()=>{
 expect(existsSync('apps/ui/components/AccountMenu.tsx')).toBe(true);
 let resolve!:()=>void; const client={logout:vi.fn(()=>new Promise<void>(r=>resolve=r)), revokeAllSessions:vi.fn()};
 const ended=vi.fn(); window.addEventListener('debateai:staff-session-ended',ended);
 sessionStorage.setItem('debateai.support.conversation.v2','private');
 await mount(client); await click('[aria-haspopup="menu"]');
 const logout=document.querySelector<HTMLButtonElement>('[data-account-logout]')!;
 await act(async()=>{logout.click(); logout.click();});
 expect(client.logout).toHaveBeenCalledTimes(1); expect(ended).not.toHaveBeenCalled(); expect(sessionStorage.getItem('debateai.support.conversation.v2')).toBe('private');
 await act(async()=>resolve()); expect(ended).toHaveBeenCalledTimes(1); expect(sessionStorage.getItem('debateai.support.conversation.v2')).toBeNull(); window.removeEventListener('debateai:staff-session-ended',ended);
});
it('a failed logout keeps the menu and transcript available with safe localized feedback',async()=>{
 expect(existsSync('apps/ui/components/AccountMenu.tsx')).toBe(true);
 await mount({logout:vi.fn().mockRejectedValue(new Error('PRIVATE SERVER MESSAGE')),revokeAllSessions:vi.fn()});
 await click('[aria-haspopup="menu"]'); await click('[data-account-logout]');
 expect(document.querySelector('[role="menu"]')).not.toBeNull(); expect(document.querySelector('[role="alert"]')).not.toBeNull(); expect(document.body.textContent).not.toContain('PRIVATE SERVER MESSAGE');
});
it('outside pointer dismissal preserves a clicked input and its typing focus',async()=>{await mount({logout:vi.fn(),revokeAllSessions:vi.fn()});const input=document.createElement('input');document.body.append(input);await click('[aria-haspopup="menu"]');await act(async()=>{input.dispatchEvent(new Event('pointerdown',{bubbles:true}));input.focus();await new Promise(resolve=>setTimeout(resolve,10));});expect(document.querySelector('[role="menu"]')).toBeNull();expect(document.activeElement).toBe(input);input.value='draft survives';expect(input.value).toBe('draft survives');});
it('endSession does not turn revoke-all into a pending logout',async()=>{const {endSession}=await import('../../apps/ui/lib/endSession');let finish!:()=>void;const client={logout:vi.fn(()=>new Promise<void>(r=>finish=r)),revokeAllSessions:vi.fn().mockResolvedValue({revoked:3})};const logout=endSession(client,{redirectTo:null});const all=endSession(client,{all:true,redirectTo:null});expect(client.logout).toHaveBeenCalledTimes(1);expect(client.revokeAllSessions).toHaveBeenCalledTimes(1);finish();await Promise.all([logout,all]);});
