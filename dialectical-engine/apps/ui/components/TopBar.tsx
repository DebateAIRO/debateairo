"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRecoveryAcknowledgementPending } from "@/lib/authNavigationGuard";

const SCREEN_TITLES: Record<string, string> = {
  "/": "Library",
  "/new": "New debate",
  "/settings": "Settings",
  "/admin/workers": "Workers"
};

const AUTH_PATHS = new Set(["/login", "/sign-up", "/verify-email", "/enroll-mfa"]);

export function BrandMark({
  href = "/",
  homeNavigationAvailable = true
}: {
  href?: string;
  homeNavigationAvailable?: boolean;
}) {
  const mark = (
    <>
      <span className="brandDiamond" aria-hidden>
        <span className="brandDiamondCore" />
      </span>
      <span className="brandText">
        <span className="brandName">Dialectical Engine</span>
        <span className="brandDomain">dezbatere.ro</span>
      </span>
    </>
  );

  if (href === "/" && !homeNavigationAvailable) {
    return (
      <span className="brand" aria-label="Dialectical Engine — home" aria-disabled="true">
        {mark}
      </span>
    );
  }

  return (
    <Link className="brand" href={href} aria-label="Dialectical Engine — home">
      {mark}
    </Link>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const recoveryAcknowledgementPending = useRecoveryAcknowledgementPending();

  // The debate view renders its own contextual chrome — and a published debate
  // is that same view, so the public route suppresses this bar for the same
  // reason the private one does.
  if (pathname?.startsWith("/debate/") || pathname?.startsWith("/public/debate/")) return null;

  if (pathname !== null && AUTH_PATHS.has(pathname)) {
    return (
      <header className="authTopBar">
        <BrandMark homeNavigationAvailable={!recoveryAcknowledgementPending} />
      </header>
    );
  }

  const title = SCREEN_TITLES[pathname ?? "/"] ?? "";

  return (
    <header className="topBar">
      <BrandMark homeNavigationAvailable={!recoveryAcknowledgementPending} />
      {title ? (
        <div className="topBarContext">
          <span className="topBarDivider" aria-hidden />
          <span className="topBarTitle">{title}</span>
        </div>
      ) : (
        <div className="topBarContext" />
      )}
      <div className="topBarActions">
        <Link className="btn" href="/login">
          Account
        </Link>
        <Link className="btn btnDark" href="/new">
          + New debate
        </Link>
        <Link className="iconBtn" href="/settings" aria-label="Settings" title="Settings">
          ⚙
        </Link>
      </div>
    </header>
  );
}
