import type { MessageCatalog } from "../i18n/translate.js";

/** Every sentence and link the room notice can print. */
export const ROOM_KEYS = Object.freeze([
  "newDebate.room.siteFull",
  "newDebate.room.siteClose",
  "newDebate.room.alreadyWaiting",
  "newDebate.room.personDayFull",
  "newDebate.room.personWeekFull",
  "newDebate.room.personMonthFull",
  "newDebate.room.personDayFullTopPlan",
  "newDebate.room.personWeekFullTopPlan",
  "newDebate.room.personMonthFullTopPlan",
  "newDebate.room.freeMonthFull",
  "newDebate.room.personClose",
  "newDebate.room.upgradeLink",
  "newDebate.room.openWaiting"
] as const);

/**
 * The part of a `newDebate` catalogue the home composer's room notice prints.
 * The composer is a client component, so every prop ships to the browser:
 * these values, not the whole catalogue (the M8 precedent,
 * `dailyLimitMessageCatalog`). The home page, a SERVER component, calls this,
 * which is why it lives apart from the hooks in `room.ts`.
 */
export function composerRoomCatalog(catalog: MessageCatalog): MessageCatalog {
  return Object.freeze(Object.fromEntries(
    ROOM_KEYS.flatMap((key) => (Object.hasOwn(catalog, key) ? [[key, catalog[key]!]] : []))
  ));
}
