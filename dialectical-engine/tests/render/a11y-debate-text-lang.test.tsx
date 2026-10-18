// @vitest-environment jsdom
/*
 * a11y repair (2026-10-17): a debate's own text (topic, claims, arguments) is tagged with the
 * language it was argued in, so a screen reader reads it in that language's voice while the
 * controls around it stay in the interface's. Outside a debate page nothing is tagged.
 */
import { afterEach, describe, expect, it } from "vitest";
import { DebateTextLocaleProvider, useDebateTextLang } from "../../apps/ui/components/debateTextLang.js";
import { mount, unmount } from "./task11-harness.js";

function Claim() {
  const textLang = useDebateTextLang();
  return (
    <div>
      <p id="claim" {...textLang}>Munca de acasă este mai productivă.</p>
      <button type="button" id="details">Details</button>
    </div>
  );
}

let mounted: Awaited<ReturnType<typeof mount>> | null = null;
afterEach(async () => {
  if (mounted) await unmount(mounted.root, mounted.host);
  mounted = null;
});

describe("useDebateTextLang", () => {
  it("tags debate text with the debate's language and leaves the controls alone", async () => {
    mounted = await mount(<DebateTextLocaleProvider value="ro"><Claim /></DebateTextLocaleProvider>);
    const claim = document.getElementById("claim")!;
    expect(claim.getAttribute("lang")).toBe("ro");
    expect(claim.getAttribute("dir")).toBe("ltr");
    expect(document.getElementById("details")!.hasAttribute("lang")).toBe(false);
  });

  it("gives a right-to-left language its direction", async () => {
    mounted = await mount(<DebateTextLocaleProvider value="ar"><Claim /></DebateTextLocaleProvider>);
    expect(document.getElementById("claim")!.getAttribute("lang")).toBe("ar");
    expect(document.getElementById("claim")!.getAttribute("dir")).toBe("rtl");
  });

  it("tags nothing outside a debate page", async () => {
    mounted = await mount(<Claim />);
    const claim = document.getElementById("claim")!;
    expect(claim.hasAttribute("lang")).toBe(false);
    expect(claim.hasAttribute("dir")).toBe(false);
  });
});
