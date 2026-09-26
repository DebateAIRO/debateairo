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

export function handleLanguageSwitcherKey(
  key: string,
  highlightedIndex: number,
  itemCount: number
): LanguageSwitcherKeyResult {
  const safeIndex = itemCount === 0 ? -1 : Math.min(Math.max(highlightedIndex, 0), itemCount - 1);
  if (key === "Escape") return { highlightedIndex: safeIndex, close: true, selectIndex: null };
  if (itemCount === 0) return { highlightedIndex: -1, close: false, selectIndex: null };
  if (key === "ArrowDown") {
    return { highlightedIndex: (safeIndex + 1) % itemCount, close: false, selectIndex: null };
  }
  if (key === "ArrowUp") {
    return { highlightedIndex: (safeIndex - 1 + itemCount) % itemCount, close: false, selectIndex: null };
  }
  if (key === "Home") return { highlightedIndex: 0, close: false, selectIndex: null };
  if (key === "End") return { highlightedIndex: itemCount - 1, close: false, selectIndex: null };
  if (key === "Enter") return { highlightedIndex: safeIndex, close: false, selectIndex: safeIndex };
  return { highlightedIndex: safeIndex, close: false, selectIndex: null };
}
