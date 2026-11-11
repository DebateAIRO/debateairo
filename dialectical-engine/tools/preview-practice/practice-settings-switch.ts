/**
 * Preview practice: the settings text for the version a practice (or Task 90's world) runs on (V4 start step, Task 90b; the paid
 * sitting of 9 Nov, findings 2 and 3; side-by-side spec §13, addition D14-D16).
 *
 * Plain words: once the owners switch on a settings version that carries the line-up (its previewLineUpPolicy row), the line-up
 * comes from that version, and the settings' preview configuration may carry only its gate part (the sockets, the scope, the
 * level): the live boot refuses rosters or a thinking-level table beside such a version (PREVIEW_LINE_UP_ENV_CONFLICT, D15). The
 * live runner.env may still hold the full form, so the practice's copy (README S-2, on the server) and Task 90's world
 * (tests/support/r22-world.ts) drop those three members, and nothing else, when the version carries the line-up. README S-2's
 * server lines do the same in python; tests/unit/practice-settings-switch.test.ts checks the two agree.
 */
import type { PreviewLineUp } from "@debateai/providers";
import { PracticeRefusal } from "./practice-settings.js";

/** The configuration's members that hold a line-up (the two old forms); the gate part is everything else. */
export const PRACTICE_LINE_UP_MEMBERS = Object.freeze(["free_model_ids", "premium_model_ids", "thinking_levels"] as const);

const CONFIG_KEY = "PREVIEW_PROVIDER_TEST_CONFIG_JSON";

/**
 * The settings text with its preview configuration's line-up members dropped: the gate part alone, every other line (and the
 * order of the gate part's members) byte for byte. A text without exactly one configuration line, or whose value is not a JSON
 * object, refuses PRACTICE_SETTINGS_VALUE_INVALID naming the key, never a value. Already the gate part alone: unchanged.
 */
export function practiceSocketsOnlySettingsText(text: string): string {
  const lines = text.split("\n");
  const at = lines.flatMap((line, index) => (line.startsWith(`${CONFIG_KEY}=`) ? [index] : []));
  const refuse = (): never => { throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", CONFIG_KEY); };
  if (at.length !== 1) refuse();
  const index = at[0]!;
  let config: unknown;
  try { config = JSON.parse(lines[index]!.slice(CONFIG_KEY.length + 1)); } catch { refuse(); }
  if (typeof config !== "object" || config === null || Array.isArray(config)) refuse();
  const gate = Object.fromEntries(Object.entries(config as Record<string, unknown>)
    .filter(([member]) => !(PRACTICE_LINE_UP_MEMBERS as readonly string[]).includes(member)));
  return [...lines.slice(0, index), `${CONFIG_KEY}=${JSON.stringify(gate)}`, ...lines.slice(index + 1)].join("\n");
}

/**
 * The settings text for a version: the text itself (byte for byte) when the version carries no line-up row (`row` null: the env's
 * line-up is the one), else the gate part alone (practiceSocketsOnlySettingsText), as the live boot requires on such a version.
 */
export function practiceSettingsTextForVersion(text: string, row: PreviewLineUp | null): string {
  return row === null ? text : practiceSocketsOnlySettingsText(text);
}
