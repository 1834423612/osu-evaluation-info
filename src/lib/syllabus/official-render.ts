import sanitizeHtml from "sanitize-html";
import { SYLLABUS_ORIGIN } from "./normalize.ts";
import type { SyllabusComponent } from "./types.ts";

const numericCss = /^[\d.\s%,a-z-]+$/i;
const colorCss =
  /^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,\s%]+\)|var\(--[\w-]+\))$/i;

/** Keep the published layout, never Angular behavior or arbitrary CSS capabilities. */
export function cleanOfficialSyllabusHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "h1",
      "h2",
      "span",
      "div",
      "app-heading-component-variation",
      "app-heading-component-name",
      "app-heading-component-editor-content",
      "app-heading-component-editor-list",
      "app-heading-cell-container",
      "app-heading-cell",
      "app-form-editor",
    ],
    allowedAttributes: {
      "*": ["class", "id", "style"],
      a: ["href", "title", "target", "rel"],
      img: [
        "src",
        "alt",
        "width",
        "height",
        "loading",
        "decoding",
        "referrerpolicy",
      ],
      td: ["colspan", "rowspan", "style", "class"],
      th: ["colspan", "rowspan", "scope", "style", "class"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        color: [colorCss],
        "background-color": [colorCss],
        "border-color": [colorCss],
        width: [numericCss],
        "max-width": [numericCss],
        "min-width": [numericCss],
        height: [numericCss],
        "min-height": [numericCss],
        "max-height": [numericCss],
        padding: [numericCss],
        "padding-top": [numericCss],
        "padding-bottom": [numericCss],
        "padding-left": [numericCss],
        "padding-right": [numericCss],
        margin: [numericCss],
        "margin-top": [numericCss],
        "margin-bottom": [numericCss],
        "margin-left": [numericCss],
        "margin-right": [numericCss],
        "font-size": [numericCss],
        "font-weight": [/^(?:[1-9]00|normal|bold|bolder|lighter)$/],
        "font-style": [/^(?:normal|italic)$/],
        "font-family": [/^[\w\s,"'-]+$/],
        "line-height": [numericCss],
        "letter-spacing": [numericCss],
        "text-align": [/^(?:left|right|center|justify|start|end)$/],
        "text-decoration": [/^(?:none|underline|line-through)$/],
        "vertical-align": [/^(?:top|middle|bottom|baseline)$/],
        display: [/^(?:block|inline|inline-block|flex|table|table-cell|none)$/],
        flex: [numericCss],
        "flex-basis": [numericCss],
        "align-self": [/^(?:auto|start|end|center|baseline|stretch)$/],
        border: [
          /^[\d.px\s]+(?:solid|dashed|dotted)\s+(?:#[\da-f]{3,8}|[a-z]+)$/i,
        ],
        "border-width": [numericCss],
        "border-style": [/^(?:none|solid|dashed|dotted)$/],
        "border-collapse": [/^(?:collapse|separate)$/],
        "list-style-type": [
          /^(?:none|disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman)$/,
        ],
      },
    },
    nonTextTags: [
      "script",
      "style",
      "iframe",
      "object",
      "svg",
      "math",
      "template",
      "noscript",
      "textarea",
    ],
    transformTags: {
      a: (_tag, attrs) => {
        let href = "";
        try {
          href = new URL(attrs.href ?? "", SYLLABUS_ORIGIN).href;
        } catch {}
        return {
          tagName: "a",
          attribs: {
            href,
            target: "_blank",
            rel: "noopener noreferrer",
            ...(attrs.title ? { title: attrs.title } : {}),
          },
        };
      },
      img: (_tag, attrs) => {
        let src = "";
        try {
          src = new URL(attrs.src ?? "", SYLLABUS_ORIGIN).href;
        } catch {}
        return {
          tagName: "img",
          attribs: {
            src,
            alt: attrs.alt ?? "",
            style: attrs.style ?? "",
            class: attrs.class ?? "",
            loading: "lazy",
            decoding: "async",
            referrerpolicy: "no-referrer",
          },
        };
      },
    },
  });
}

export function officialSyllabusFrame(
  components: SyllabusComponent[],
  locale: string,
) {
  const language = locale === "zh" ? "zh-CN" : "en";
  // The iframe has no scripts or forms; approved layout CSS is local and versioned.
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; font-src https://bux-fonts.s3.us-east-1.amazonaws.com; img-src https: data:; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="/syllabus/official.css"></head><body><main class="doc app-doc-publish component-holder">${components.map((component) => `<section id="syllabus-${component.id}">${cleanOfficialSyllabusHtml(component.officialHtml ?? component.html)}</section>`).join("")}</main></body></html>`;
}
