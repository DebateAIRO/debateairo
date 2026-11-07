/*
 * journey-d1 A (owner's screen review, 3 Nov 2026): the one soft 1-second highlight (v4-base.css .v4Highlight) that a block
 * gets when it changes on screen, or when a greyed button is pressed and the line that says why is shown again. One copy,
 * so the panel's pause, the phone's bottom stack and the tray cannot drift apart.
 */

/** Plays the shared 1-second highlight on `line` again, without re-mounting it. Nothing happens for null. */
export function replayHighlight(line: HTMLElement | null): void {
  if (line === null) return;
  line.classList.remove("v4Highlight");
  // Reading the layout restarts the animation when the class goes back on.
  void line.offsetWidth;
  line.classList.add("v4Highlight");
  line.addEventListener("animationend", () => line.classList.remove("v4Highlight"), { once: true });
}
