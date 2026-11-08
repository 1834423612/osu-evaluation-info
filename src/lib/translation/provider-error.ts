import type { HealthReason } from "./health.ts";

/** Safe classification only: never persist upstream bodies, URLs, prompts or credentials. */
export class TranslationProviderError extends Error {
  kind: HealthReason;
  httpStatus?: number;
  retryAfterMs?: number;
  constructor(kind: HealthReason, httpStatus?: number, retryAfterMs?: number) {
    super("Translation provider attempt failed.");
    this.name = "TranslationProviderError";
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.retryAfterMs = retryAfterMs;
  }
}
