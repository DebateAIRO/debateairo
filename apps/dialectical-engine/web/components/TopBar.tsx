"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SCREEN_TITLES: Record<string, string> = {
  "/": "Library",
  "/new": "New debate",
  "/settings": "Settings",
  "/admin/workers": "Workers"
};

export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Dialectical Engine — home">
      <span className="brandDiamond" aria-hidden>
        <span className="brandDiamondCore" />
      </span>
      <span className="brandText">
        <span className="brandName">Dialectical Engine</span>
        <span className="brandDomain">dezbatere.ro</span>
      </span>
    </Link>
  );
}

export function TopBar() {
  const pathname = usePathname();

  // The debate view renders its own contextual chrome.
  if (pathname?.startsWith("/debate/")) return null;

  const title = SCREEN_TITLES[pathname ?? "/"] ?? "";

  return (
    <>
      <header className="topBar">
        <BrandMark />
        {title ? (
          <div className="topBarContext">
            <span className="topBarDivider" aria-hidden />
            <span className="topBarTitle">{title}</span>
          </div>
        ) : (
          <div className="topBarContext" />
        )}
        <div className="topBarActions">
          <Link className="btn btnDark" href="/new">
            + New debate
          </Link>
          <Link className="iconBtn" href="/settings" aria-label="Settings" title="Settings">
            ⚙
          </Link>
        </div>
      </header>
      <style>{`
        @media (max-width: 480px) {
          .topBar {
            flex: 0 0 auto;
            flex-wrap: wrap;
            height: auto;
            min-height: 60px;
            row-gap: 8px;
            padding-block: 8px;
          }

          .topBarContext {
            flex: 1 1 0;
          }

          .topBarDivider {
            flex: 0 0 1px;
          }

          .topBarTitle {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .topBarActions {
            flex: 1 0 100%;
            justify-content: flex-end;
          }
        }
      `}</style>
    </>
  );
}
