// @vitest-environment jsdom

import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";

import {
  Assistant,type SupportAssistantClient
} from "../../apps/ui/components/support/Assistant.js";

const SESSION = Object.freeze({ sessionId:"scroll-session",token:"scroll-token",identityBound:false });
let root: Root | null = null;

function client(): SupportAssistantClient {
  return Object.freeze({
    createSession:vi.fn().mockResolvedValue(SESSION),
    sendMessage:vi.fn().mockResolvedValue({
      messageId:"latest-answer",outcome:"ANSWER_GROUNDED",text:"Latest grounded reply.",
      sources:[{ id:"app-navigation",label:"Navigate Dialectical Engine" }],actions:[]
    }),
    rate:vi.fn().mockResolvedValue(null),
    escalate:vi.fn().mockResolvedValue({ token:"case",text:"Case opened." })
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function submit(text: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[name="support-message"]')!;
  input.value = text;
  await act(async () => document.querySelector<HTMLFormElement>("form")!
    .dispatchEvent(new Event("submit",{ bubbles:true,cancelable:true })));
  await settle();
}

describe("Support full-page conversation following",() => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("brings an appended reply sentinel into the full-page pane when already following",async () => {
    const scrollIntoView = vi.fn();
    vi.stubGlobal("HTMLElement",HTMLElement);
    Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{
      configurable:true,value:scrollIntoView
    });
    await act(async () => root!.render(<Assistant fullPage client={client()} />));
    scrollIntoView.mockClear();

    await submit("Where is Help?");

    expect(document.body.textContent).toContain("Latest grounded reply.");
    expect(scrollIntoView).toHaveBeenCalledWith({ block:"end",behavior:"smooth" });
  });

  it("does not force the pane away from older content after the reader scrolls up",async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{
      configurable:true,value:scrollIntoView
    });
    await act(async () => root!.render(<Assistant fullPage client={client()} />));
    const pane = document.querySelector<HTMLElement>(".supportChatScroll")!;
    Object.defineProperties(pane,{
      scrollHeight:{ configurable:true,value:1200 },
      clientHeight:{ configurable:true,value:400 },
      scrollTop:{ configurable:true,value:100,writable:true }
    });
    await act(async () => pane.dispatchEvent(new Event("scroll",{ bubbles:true })));
    scrollIntoView.mockClear();

    await submit("Where is Help?");

    expect(document.body.textContent).toContain("Latest grounded reply.");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
