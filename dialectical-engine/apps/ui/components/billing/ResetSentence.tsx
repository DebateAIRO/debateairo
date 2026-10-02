"use client";

import { useEffect, useState } from "react";
import { formatReset } from "@/lib/billing/formatReset";

/** Stands for `{time}` in a translated sentence; the sentence is split around it. */
export const RESET_TIME_MARK = "\u0000";

/**
 * A translated sentence with its `{time}` formatted in the BROWSER, in the
 * viewer's time zone. The server does not know that zone, so the time is
 * filled in after mount and the server markup never disagrees with the client.
 * Pass `text = t(catalog, key, { time: RESET_TIME_MARK })`.
 */
export function ResetSentence({
  text,
  at,
  locale,
  className
}: {
  text: string;
  at: string;
  locale: string;
  className?: string;
}) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const instant = new Date(at);
    setTime(Number.isNaN(instant.getTime()) ? "" : formatReset(instant, new Date(), locale));
  }, [at, locale]);
  const [before = "", after = ""] = text.split(RESET_TIME_MARK);
  return (
    <span className={className}>
      {before}
      <time dateTime={at}>{time}</time>
      {after}
    </span>
  );
}
