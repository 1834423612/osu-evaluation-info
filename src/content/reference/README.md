# OSU reference content

English · [简体中文](../../../docs/zh-CN/content/reference.md)

Each topic has a folder and independent `en.ts` / `zh.ts` articles. `en.ts` and `zh.ts` in this directory define page labels, ordering, and the topic registry. Rendering and the contextual drawer share `src/components/reference/reference-content.tsx`; styles are in `reference.module.css`.

Keep topic IDs stable: page deep links and contextual information buttons use them. Sections support short paragraphs, entries, numbered questions, scales and an optional collapsed formula. Question entries are paraphrases, not verbatim questionnaires or official translations.

Sources were checked on 2026-11-12. The SEI report guide is historical; the registrar SSLE page covers the current seven core items, two written prompts and three additional required questions. Keep the distinct response scales and item order when updating. Source links belong to each topic.

`scoring/` describes project policy, not a university standard. Reconcile it with `SCORING_POLICY` and `teacherScoreTone` when implementation changes. The imported SSLE mean is a report field; do not infer it by pooling current survey scales.
