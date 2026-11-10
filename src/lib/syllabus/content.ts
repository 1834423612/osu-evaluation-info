import sanitizeHtml from "sanitize-html";
import { Parser } from "htmlparser2";
import { SYLLABUS_ORIGIN } from "./normalize.ts";
import type { SyllabusDocument } from "./types.ts";

/** Rebuild a small semantic HTML subset. Discard Angular, inline CSS and active content. */
export function cleanSyllabusHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "div",
      "span",
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "sup",
      "sub",
      "blockquote",
      "a",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "hr",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      ["div", "span", "p"].includes(frame.tag) &&
      !frame.text.trim() &&
      !frame.mediaChildren?.length,
    nonTextTags: [
      "script",
      "style",
      "textarea",
      "option",
      "noscript",
      "iframe",
      "object",
      "svg",
      "math",
      "template",
    ],
    transformTags: {
      img: (_tag, attributes) => {
        let href = "";
        try {
          href = new URL(attributes.src ?? "", SYLLABUS_ORIGIN).href;
        } catch {
          /* Keep the image's description. */
        }
        return {
          tagName: "a",
          text: `[${attributes.alt || "Syllabus image"}]`,
          attribs: { href, target: "_blank", rel: "noopener noreferrer" },
        };
      },
      a: (_tag, attributes) => {
        let href = attributes.href ?? "";
        try {
          href = new URL(href, SYLLABUS_ORIGIN).href;
        } catch {
          href = "";
        }
        return {
          tagName: "a",
          attribs: {
            href,
            target: "_blank",
            rel: "noopener noreferrer",
            ...(attributes.title ? { title: attributes.title } : {}),
          },
        };
      },
    },
  });
}

export function syllabusText(html: string) {
  let text = "";
  const parser = new Parser(
    {
      ontext(value) {
        text += value;
      },
      onclosetag(tag) {
        if (/^(p|div|h[1-6]|li|tr|td|th|br)$/.test(tag)) text += "\n";
      },
      onopentag(tag) {
        if (tag === "br") text += "\n";
      },
    },
    { decodeEntities: true },
  );
  parser.write(cleanSyllabusHtml(html));
  parser.end();
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type SyllabusSection = {
  id: string;
  title: string;
  html: string;
  text: string;
  category:
    "instructor" | "grading" | "schedule" | "materials" | "policies" | "other";
};

/** Reusable by course comparison, search and other UI without another upstream read. */
export function extractSyllabusSections(
  document: SyllabusDocument,
): SyllabusSection[] {
  return document.components.map((component, index) => {
    const html = cleanSyllabusHtml(component.html),
      plain = syllabusText(html);
    let title = "",
      inHeading = false;
    const parser = new Parser({
      onopentag(tag) {
        if (!title && /^h[1-6]$/.test(tag)) inHeading = true;
      },
      ontext(value) {
        if (inHeading) title += value;
      },
      onclosetag(tag) {
        if (/^h[1-6]$/.test(tag)) inHeading = false;
      },
    });
    parser.write(html);
    parser.end();
    title =
      title
        .trim()
        .replace(/^Syllabus\s*[-–:]\s*/i, "")
        .replace(/\s+/g, " ")
        .trim() || `Section ${index + 1}`;
    const category = /grad|assess|evaluation|assignment/i.test(title)
      ? "grading"
      : /schedule|calendar/i.test(title)
        ? "schedule"
        : /reading|material|textbook/i.test(title)
          ? "materials"
          : /instructor|contact|office hours/i.test(title)
            ? "instructor"
            : /polic|accommodation|conduct/i.test(title)
              ? "policies"
              : "other";
    return { id: component.id, title, html, text: plain, category };
  });
}

/** Exact source excerpts for other course UIs; no inferred workload or grading scores. */
export function extractSyllabusHighlights(document: SyllabusDocument) {
  return extractSyllabusSections(document)
    .filter((section) =>
      ["grading", "materials", "schedule"].includes(section.category),
    )
    .map((section) => ({
      sectionId: section.id,
      category: section.category,
      title: section.title,
      excerpt: section.text
        .replace(/^Syllabus\s*[-–:]\s*/i, "")
        .replace(section.title, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240),
    }))
    .filter((section) => section.excerpt);
}
