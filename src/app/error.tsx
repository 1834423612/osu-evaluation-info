"use client";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { SceneMascot } from "@/components/brand/scene-mascot";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { locale } = usePreferences();
  return (
    <>
      <AppHeader />
      <main className="saved-shell">
        <div className="empty-results">
          <SceneMascot scene="error" />
          <h1 className="status-heading">
            {text(
              locale,
              "Something interrupted this page.",
              "页面暂时无法加载。",
            )}
          </h1>
          <p>
            {text(
              locale,
              "Take a moment, then try again.",
              "稍等片刻，再试一次。",
            )}
          </p>
          <Button onClick={retry}>{text(locale, "Try again", "重试")}</Button>
        </div>
      </main>
      <AppFooter />
    </>
  );
}
