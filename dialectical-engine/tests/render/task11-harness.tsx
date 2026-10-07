import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
export async function mount(view: React.ReactNode) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const host=document.createElement("div"); document.body.append(host); const root=createRoot(host); await act(async()=>root.render(view)); return {host,root}; }
export async function unmount(root:Root,host:HTMLElement) { await act(async()=>root.unmount()); host.remove(); vi.unstubAllGlobals(); }
export async function input(host:HTMLElement, selector:string, value:string) { const field=host.querySelector<HTMLInputElement>(selector)!; await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(field,value);field.dispatchEvent(new Event("input",{bubbles:true}));}); }
export async function click(host:HTMLElement,text:string) { const button=[...host.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===text)!; await act(async()=>button.click()); }
