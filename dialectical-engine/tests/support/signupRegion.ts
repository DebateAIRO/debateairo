// The root test typecheck has no React resolution; the render runner supplies React.
// @ts-expect-error -- React resolves in the UI render test project.
import { act } from "react";
import { regionContinentOf } from "@debateai/kernel";

async function click(selector: string): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (button === null) throw new Error(`Missing region control: ${selector}`);
  await act(async () => button.click());
}

export async function pickRegion(code: string, usState?: string): Promise<void> {
  const continent = regionContinentOf(code);
  if (continent === null) throw new Error(`Unknown region code: ${code}`);
  await click("#signup-region-trigger");
  if (document.querySelector(".regionBack") !== null) await click(".regionBack");
  await click(`.regionContinent[data-continent="${continent}"]`);
  await click(`.regionCountry[data-code="${code}"]`);
  if (code === "US" && usState !== undefined) {
    const select = document.querySelector<HTMLSelectElement>("#signup-region-state");
    if (select === null) throw new Error("Missing US state select");
    await act(async () => {
      select.value = usState;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
}
