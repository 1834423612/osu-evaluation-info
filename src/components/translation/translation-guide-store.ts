"use client";

import {
  createTranslationGuideStore,
  TRANSLATION_GUIDE_KEY,
} from "@/lib/translation/onboarding";

// Storage is accessed only after hydration; the server snapshot is always null.
export const translationGuide = createTranslationGuideStore({
  read: () => localStorage.getItem(TRANSLATION_GUIDE_KEY),
  write: (value) => localStorage.setItem(TRANSLATION_GUIDE_KEY, value),
});
