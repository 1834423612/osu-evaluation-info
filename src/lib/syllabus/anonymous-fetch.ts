import { SYLLABUS_ORIGIN } from "./normalize.ts";

// The official CDN rejects Node's default user agent on doc-full-page-get.
// This is a public browser compatibility header, never a captured credential.
export const anonymousSyllabusFetch: typeof fetch = (input, init = {}) =>
  fetch(input, {
    ...init,
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
      Referer: `${SYLLABUS_ORIGIN}/en-US/syllabus-library`,
    },
    credentials: "omit",
    redirect: "error",
  });
