# Syllabus history and comparisons

English · [简体中文](../zh-CN/syllabus/history.md)

A syllabus source can publish a new version without changing its readable words. The old history UI counted text lines only, so an updated source could legitimately show zero additions and deletions. The missing explanation made source changes look like a broken comparison.

## What the comparison means

History now offers **Document** and **Line diff** views. Document view preserves headings, lists and tables, marks insertions in green and deletions in red with a strikethrough. Both views use sanitized archived content. Comparison detects archived link destinations and image URLs/alt text; it does not fetch or version remote PDF/image bytes at an unchanged URL, so identical archived text cannot establish that those remote files are unchanged. Links, images, document layout and source metadata can change while the readable text remains identical; the comparison labels these cases rather than implying that the wording changed.

Identical archive copies are folded in the displayed history when their source identity, modification time, component metadata and canonical rendering agree. A later official modification time remains a source version even when the words are unchanged. The original stored rows are retained. The visible history limit applies after duplicate folding.

Volatile Simple Syllabus editor IDs such as `editor-0.12345` are removed before rendering and hashing. Stable anchor IDs remain intact. This avoids creating new content hashes solely because an editor generated another transient ID. Existing content hashes and archive rows are never rewritten.

## Recorded audit: November 26, 2026

The read-only audit inspected 16,954 archived versions across 8,332 syllabus document IDs. There were 7,062 document IDs with multiple versions and 8,622 adjacent distinct-hash comparisons.

| Comparison | Pairs | Meaning |
| --- | ---: | --- |
| Readable text changed | 47 | Real wording changes; line counts are meaningful. |
| Original rendering markup changed, words unchanged | 6,921 | Includes added classes and semantic table markup; wording counts remain zero. |
| Source metadata and transient editor IDs changed | 1,637 | Source records advanced without changing canonical readable content. |
| Legacy archive gained original-render content | 17 | Archive representation became richer; this alone does not establish an official wording edit. |

The three zero-text groups total 8,575 comparisons. In the first-pass implementation, 8,574 appeared as original-render-only differences and one as sanitized-HTML-only differences. The latter was `PHR 3440`, whose table gained header semantics without changing its words. `CHEM 1110` also provided a source-modification-time example with identical canonical readable content. These observations describe this dated archive, not every future upstream change.

This is primarily a mismatch between what “source updated” means and what a text-only diff counts. The new labels and comparison modes explain the distinction. They do not assert that every formatting change was a deliberate instructor edit.
