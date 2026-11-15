import { parseDocument, DomUtils } from "htmlparser2";
import type { SyllabusDocument } from "./types.ts";
export type SyllabusTranslationMode = "replace" | "bilingual";
export function splitSyllabusText(text: string, max = 3800) {
  const chunks: string[] = [];
  let current = "";
  for (const char of text) {
    if (current.length + char.length > max) {
      chunks.push(current);
      current = "";
    }
    current += char;
  }
  if (current) chunks.push(current);
  return chunks;
}
const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const blockTags = new Set([
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "td",
  "th",
  "figcaption",
  "caption",
]);
export async function translateSyllabus(
  source: SyllabusDocument,
  translate: (text: string) => Promise<string>,
  options: {
    mode: SyllabusTranslationMode;
    target: "en" | "zh-CN";
    signal: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  },
) {
  const documents = source.components.map((component) =>
    parseDocument(component.officialHtml ?? component.html),
  );
  const blocks = documents.flatMap((doc) => {
    const preferred = DomUtils.findAll(
      (node) => blockTags.has(node.name),
      doc.children,
    ).filter(
      (node) =>
        !DomUtils.findOne(
          (child) => blockTags.has(child.name),
          node.children,
          true,
        ),
    );
    const nodes = preferred.length
      ? preferred
      : DomUtils.findAll(
          (node) =>
            ["div", "span"].includes(node.name) &&
            !node.children.some((child) => "name" in child),
          doc.children,
        );
    return nodes.filter((node) => {
      let parent = node.parent;
      while (parent) {
        if (
          "name" in parent &&
          ["script", "style", "code", "pre"].includes(parent.name)
        )
          return false;
        parent = parent.parent;
      }
      return /\p{L}{2}/u.test(DomUtils.textContent(node));
    });
  });
  const covered = new Set(blocks);
  for (const doc of documents) {
    const visit = (nodes: typeof doc.children) => {
      for (const node of [...nodes]) {
        if (
          "name" in node &&
          "children" in node &&
          (["script", "style", "code", "pre"].includes(node.name) ||
            covered.has(node))
        )
          continue;
        if (node.type === "text" && /\p{L}{2}/u.test(node.data)) {
          const wrapper = parseDocument(
            "<span>" + escape(node.data) + "</span>",
          ).children[0];
          DomUtils.replaceElement(node, wrapper);
          if ("name" in wrapper && "children" in wrapper) blocks.push(wrapper);
        } else if ("children" in node) visit(node.children);
      }
    };
    visit(doc.children);
  }
  if (
    !blocks.length ||
    blocks.length > 600 ||
    blocks.reduce((sum, node) => sum + DomUtils.textContent(node).length, 0) >
      350000
  )
    throw Error("document_budget");
  let next = 0,
    done = 0;
  options.onProgress?.(0, blocks.length);
  async function worker() {
    while (next < blocks.length) {
      options.signal.throwIfAborted();
      const block = blocks[next++],
        original = DomUtils.textContent(block).trim();
      const parts: string[] = [];
      for (const chunk of splitSyllabusText(original)) {
        options.signal.throwIfAborted();
        parts.push(await translate(chunk));
      }
      options.signal.throwIfAborted();
      const translated =
        '<span class="syllabus-translation" lang="' +
        options.target +
        '"' +
        (options.mode === "bilingual"
          ? ' style="display:block;margin-top:6px"'
          : "") +
        ">" +
        escape(parts.join("")) +
        "</span>";
      let html: string;
      if (options.mode === "bilingual")
        html =
          DomUtils.getInnerHTML(block, { encodeEntities: "utf8" }) + translated;
      else {
        const assets = DomUtils.findAll((node) => {
          if (node.name === "a" && node.attribs.href) return true;
          if (node.name !== "img") return false;
          let parent = node.parent;
          while (parent && parent !== block) {
            if ("name" in parent && parent.name === "a") return false;
            parent = parent.parent;
          }
          return true;
        }, block.children);
        html =
          translated +
          (assets.length
            ? '<span class="syllabus-translation-references">' +
              assets
                .map((node) =>
                  DomUtils.getOuterHTML(node, { encodeEntities: "utf8" }),
                )
                .join(" ") +
              "</span>"
            : "");
      }
      block.children = parseDocument(html).children;
      block.children.forEach((node, index) => {
        node.parent = block;
        node.prev = block.children[index - 1] ?? null;
        node.next = block.children[index + 1] ?? null;
      });
      options.onProgress?.(++done, blocks.length);
    }
  }
  await Promise.all([worker(), worker()]);
  return {
    ...source,
    translation: { mode: options.mode, target: options.target },
    components: source.components.map((component, index) => ({
      ...component,
      html: DomUtils.getInnerHTML(documents[index], { encodeEntities: "utf8" }),
      officialHtml: DomUtils.getInnerHTML(documents[index]),
    })),
  };
}
