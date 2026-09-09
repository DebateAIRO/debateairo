// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { ConsentToggle } from "../../apps/ui/components/support/ConsentToggle.js";
import { DebatePicker } from "../../apps/ui/components/support/DebatePicker.js";

const EN_LABEL = "Let the assistant see the status of my debates for this conversation (never their content).";

describe("SUP-03 per-conversation own-context consent", () => {
  let root: Root | null = null;

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

  it("renders the exact toggle off by default only for an authenticated identity", () => {
    const signedIn = renderToStaticMarkup(<ConsentToggle signedIn language="en" />);
    expect(signedIn).toContain(EN_LABEL);
    expect(signedIn).toContain('type="checkbox"');
    expect(signedIn).not.toContain("checked");
    expect(renderToStaticMarkup(<ConsentToggle signedIn={false} language="en" />)).toBe("");
  });

  it("reports explicit on and off transitions without retaining consent outside the component", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    await act(async () => root!.render(
      <ConsentToggle signedIn language="en" onChange={onChange} />
    ));
    const toggle = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(toggle.checked).toBe(false);
    await act(async () => toggle.click());
    expect(onChange).toHaveBeenNthCalledWith(1,true);
    expect(toggle.checked).toBe(true);
    await act(async () => toggle.click());
    expect(onChange).toHaveBeenNthCalledWith(2,false);
    expect(toggle.checked).toBe(false);
  });

  it("keeps question text in the browser and selects only the run id", async () => {
    const onSelect = vi.fn();
    const onLatest = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{
          answer_id: "answer-1",run_ref: "11111111-1111-4111-8111-111111111111",
          question_line: "Private question stays here",created_at_sequence: 2
        }],
        open_runs: [{
          run_ref: "22222222-2222-4222-8222-222222222222",
          question_line: "Still private",created_at_sequence: 1
        }],
        limit: 100,offset: 0,total: 2
      })
    });
    vi.stubGlobal("fetch",fetch);
    await act(async () => root!.render(
      <DebatePicker signedIn language="en" onSelect={onSelect} onLatest={onLatest} />
    ));
    await act(async () => { await Promise.resolve();await Promise.resolve(); });

    expect(fetch).toHaveBeenCalledWith("/api/v1/answers?limit=100&offset=0",expect.anything());
    expect(document.body.textContent).toContain("Private question stays here");
    const debate = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Private question stays here")
    ) as HTMLButtonElement;
    await act(async () => debate.click());
    expect(onSelect).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(onSelect).not.toHaveBeenCalledWith(expect.objectContaining({
      question: expect.anything()
    }));
    const latest = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "My latest debate"
    ) as HTMLButtonElement;
    await act(async () => latest.click());
    expect(onLatest).toHaveBeenCalledWith();
  });

  it("mounts consent and picker through the same help-page assistant conversation", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile("apps/ui/components/support/Assistant.tsx","utf8")
    );
    expect(source).toContain("<ConsentToggle");
    expect(source).toContain("<DebatePicker");
    expect(source).not.toMatch(/body:\s*JSON[.]stringify\([^)]*question_line/su);
  });
});
