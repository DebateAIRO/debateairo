"use client";

import type { ReactNode, ReactElement } from "react";
import { useSupportOffered } from "./availability.js";

export function WhenSupportOffered({ children }: Readonly<{ children: ReactNode }>): ReactElement | null {
  return useSupportOffered() === "offered" ? <>{children}</> : null;
}
