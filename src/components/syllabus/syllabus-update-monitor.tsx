"use client";
import { useEffect } from "react";
import { useSavedSyllabi } from "@/hooks/use-saved-syllabi";
import { checkSavedSyllabi } from "@/lib/syllabus/update-check";

export function SyllabusUpdateMonitor() {
  const { savedSyllabi } = useSavedSyllabi();
  const ids = savedSyllabi
    .map((item) => item.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!ids) return;
    const check = () => {
      if (document.visibilityState === "visible") void checkSavedSyllabi();
    };
    check();
    const timer = setInterval(check, 5 * 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [ids]);
  return null;
}
