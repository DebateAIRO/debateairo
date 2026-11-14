import type { LocaleCode } from "@/lib/i18n/locales";

export type LanguageSwitcherKeyResult = Readonly<{
  highlightedIndex: number;
  close: boolean;
  selectIndex: number | null;
}>;

export function languageSwitcherCaret(open: boolean): "▴" | "▾" {
  return open ? "▴" : "▾";
}

export function highlightedLocaleIndex(
  localeCodes: readonly LocaleCode[],
  highlightedCode: LocaleCode
): number {
  const index = localeCodes.indexOf(highlightedCode);
  return index < 0 ? 0 : index;
}

/**
 * The list is drawn in `columns` columns, in reading order (keyboard audit round 4, 12 Nov 2026): with more than one,
 * Down/Up move by a drawn row (past the end, to the other end of the same column) and Left/Right by one place in the
 * direction they point (mirrored in right-to-left). With one column Up/Down move by one, as they always did.
 */
export function handleLanguageSwitcherKey(
  key: string,
  highlightedIndex: number,
  itemCount: number,
  columns = 1,
  rtl = false
): LanguageSwitcherKeyResult {
  const safeIndex = itemCount === 0 ? -1 : Math.min(Math.max(highlightedIndex, 0), itemCount - 1);
  if (key === "Escape") return { highlightedIndex: safeIndex, close: true, selectIndex: null };
  if (itemCount === 0) return { highlightedIndex: -1, close: false, selectIndex: null };
  const step = (by: number): LanguageSwitcherKeyResult =>
    ({ highlightedIndex: (safeIndex + by + itemCount) % itemCount, close: false, selectIndex: null });
  if (columns > 1) {
    const column = safeIndex % columns;
    if (key === "ArrowDown") {
      const below = safeIndex + columns;
      return { highlightedIndex: below < itemCount ? below : column, close: false, selectIndex: null };
    }
    if (key === "ArrowUp") {
      const above = safeIndex - columns;
      const lastInColumn = itemCount - 1 - ((itemCount - 1 - column) % columns);
      return { highlightedIndex: above >= 0 ? above : lastInColumn, close: false, selectIndex: null };
    }
    if (key === "ArrowRight") return step(rtl ? -1 : 1);
    if (key === "ArrowLeft") return step(rtl ? 1 : -1);
  }
  if (key === "ArrowDown") return step(1);
  if (key === "ArrowUp") return step(-1);
  if (key === "Home") return { highlightedIndex: 0, close: false, selectIndex: null };
  if (key === "End") return { highlightedIndex: itemCount - 1, close: false, selectIndex: null };
  if (key === "Enter") return { highlightedIndex: safeIndex, close: false, selectIndex: safeIndex };
  return { highlightedIndex: safeIndex, close: false, selectIndex: null };
}
