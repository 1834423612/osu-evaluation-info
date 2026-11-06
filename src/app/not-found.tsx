"use client";

import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { BrandMascot } from "@/components/brand/brand-mascot";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";

export default function NotFound() {
  const { locale } = usePreferences();
  return (
    <>
      <AppHeader />
      <main className="saved-shell">
        <div className="empty-results">
          <BrandMascot />
          <span className="brand-eyebrow">404 · COURSE ATLAS</span>
          <h1 className="status-heading">
            {text(
              locale,
              "This page is off the map.",
              "这个页面还不在地图上。",
            )}
          </h1>
          <p>
            {text(
              locale,
              "Head back and find your next course.",
              "回到课程查询，继续探索。",
            )}
          </p>
          <Button asChild>
            <Link href="/">{text(locale, "Explore courses", "探索课程")}</Link>
          </Button>
        </div>
      </main>
      <AppFooter />
    </>
  );
}
