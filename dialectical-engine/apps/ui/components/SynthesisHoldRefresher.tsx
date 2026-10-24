"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SynthesisHoldRefresher({ active, intervalMs = 5000 }: {
  active: boolean;
  intervalMs?: number;
}) {
  const { refresh } = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, refresh]);
  return null;
}
