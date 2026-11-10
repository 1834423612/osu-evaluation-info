"use client";

import { browserStorage } from "@/lib/preferences/browser-storage";

import {
  createTranslationGuideStore,
  TRANSLATION_GUIDE_KEY,
} from "@/lib/translation/onboarding";

// Storage is accessed only after hydration; the server snapshot is always null.
export const translationGuide = createTranslationGuideStore({
  read: () => browserStorage().getItem(TRANSLATION_GUIDE_KEY),
  write: (value) => browserStorage().setItem(TRANSLATION_GUIDE_KEY, value),
});
