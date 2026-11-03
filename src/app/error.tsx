"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="empty-results">
      <h1>Something interrupted this page.</h1>
      <p>页面暂时无法加载。</p>
      <Button onClick={reset}>Try again · 重试</Button>
    </main>
  );
}
