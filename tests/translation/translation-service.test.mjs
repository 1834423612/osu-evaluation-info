import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TRANSLATION_LENGTH,
  MAX_TRANSLATED_LENGTH,
  TranslationUnavailableError,
  parseTranslationResponse,
  translationAction,
  translationLanguagePair,
  validTranslationResult,
  translateWithFallback,
} from "../../src/lib/translation/service.ts";

test("translation actions distinguish bilingual hiding from replaced text", () => {
  assert.equal(translationAction("bilingual", true, true), "hide-translation");
  assert.equal(translationAction("bilingual", false, true), "show-translation");
  assert.equal(translationAction("replace", true, true), "show-original");
  assert.equal(translationAction("replace", false, true), "show-translation");
  assert.equal(translationAction("replace", false, false), "translate");
});

test("chooses the opposite content language regardless of the interface language", () => {
  assert.deepEqual(
    translationLanguagePair("This professor explains everything clearly."),
    {
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
    },
  );
  assert.deepEqual(
    translationLanguagePair("这位教授讲得很清楚。课程代码是 MATH 1151。"),
    {
      sourceLanguage: "zh",
      targetLanguage: "en",
    },
  );
});

test("parses the compact dict-chrome-ex JSON result", () => {
  assert.equal(
    parseTranslationResponse(
      ["这位教授把一切都解释得很清楚。"],
      "dict-chrome-ex",
      "This professor explains everything clearly.",
    ),
    "这位教授把一切都解释得很清楚。",
  );
  assert.equal(
    parseTranslationResponse([["你好", "en"]], "dict-chrome-ex", "Hello"),
    "你好",
  );
});

test("parses gtx segments and joins multiple translated fragments", () => {
  assert.equal(
    parseTranslationResponse(
      [
        [
          ["第一句", "First sentence."],
          [" 第二句", " Second sentence."],
        ],
        null,
        "en",
      ],
      "gtx",
      "First sentence. Second sentence.",
    ),
    "第一句 第二句",
  );
});

test("rejects malformed, empty, unchanged, oversized and unsupported data", () => {
  assert.equal(parseTranslationResponse({}, "dict-chrome-ex", "Source"), null);
  assert.equal(parseTranslationResponse([], "clients5", "Source"), null);
  assert.equal(
    parseTranslationResponse([" Source "], "clients5", "Source"),
    null,
  );
  assert.equal(
    parseTranslationResponse(
      ["x".repeat(MAX_TRANSLATED_LENGTH + 1)],
      "clients5",
      "Source",
    ),
    null,
  );
  assert.equal(
    parseTranslationResponse(["Translation"], "gtx", "Source"),
    null,
  );
});

test("does not display metadata or an error string as translated Chinese", () => {
  assert.equal(validTranslationResult("en", "Hello", "zh-CN"), false);
  assert.equal(
    validTranslationResult("Service unavailable", "Hello", "zh-CN"),
    false,
  );
  assert.equal(validTranslationResult("你好", "Hello", "zh-CN"), true);
  assert.equal(validTranslationResult("Hello", "你好", "en"), true);
});

test("uses only the fixed provider order and falls through on non-JSON or invalid data", async () => {
  const calls = [];
  const responses = [
    new Response("service unavailable", { status: 429 }),
    Response.json(["Source"]),
    Response.json([[["译文", "Source"]], null, "en"]),
  ];
  const translation = await translateWithFallback(
    "Source",
    "zh-CN",
    async (url) => {
      calls.push(new URL(url).origin + new URL(url).pathname);
      return responses.shift();
    },
  );
  assert.equal(translation, "译文");
  assert.deepEqual(calls, [
    "https://translate.googleapis.com/translate_a/t",
    "https://clients5.google.com/translate_a/t",
    "https://translate.googleapis.com/translate_a/single",
  ]);
});

test("surfaces unavailability after every provider fails", async () => {
  await assert.rejects(
    translateWithFallback("Source", "en", async () => {
      throw new Error("offline");
    }),
    TranslationUnavailableError,
  );
});

test("rejects over-limit input without calling an upstream", async () => {
  let called = false;
  await assert.rejects(
    translateWithFallback(
      "x".repeat(MAX_TRANSLATION_LENGTH + 1),
      "en",
      async () => {
        called = true;
        return Response.json(["translated"]);
      },
    ),
    TranslationUnavailableError,
  );
  assert.equal(called, false);
});
