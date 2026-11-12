import { officialSyllabusFrame } from "./official-render.ts";
import { readSyllabusAssetBytes, syllabusAssetKind } from "./asset-policy.ts";
import type { SyllabusDocument } from "./types.ts";
import decompress from "woff2-encoder/decompress";

const fontOrigin = "https://bux-fonts.s3.us-east-1.amazonaws.com/bux-webfonts2";
type Face = { key: string; file: string; url: string };

function faceFor(style: CSSStyleDeclaration): Face | null {
  const family = style.fontFamily.includes("BuckeyeSerif")
    ? "BuckeyeSerif"
    : style.fontFamily.includes("BuckeyeSans")
      ? "BuckeyeSans"
      : null;
  if (!family) return null;
  const weight = Number(style.fontWeight) || 400;
  const variant =
    weight >= 850
      ? "Black"
      : weight >= 750
        ? "ExtraBold"
        : weight >= 650
          ? "Bold"
          : weight >= 550
            ? "SemiBold"
            : "Regular";
  const italic = style.fontStyle === "italic";
  const name = italic
    ? variant === "Regular"
      ? "Italic"
      : `${variant}Italic`
    : variant;
  // html-to-pdfmake normalizes family names to initial uppercase + lowercase.
  const key = `Bux${family === "BuckeyeSerif" ? "serif" : "sans"}${name.toLowerCase()}`;
  return {
    key,
    file: `${family}2-${name}.ttf`,
    url: `${fontOrigin}/${family}/${family}2-${name}.woff2`,
  };
}

async function assetBytes(url: string, limit: number) {
  const signal = AbortSignal.timeout(15_000);
  try {
    return await readSyllabusAssetBytes(
      await fetch(url, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal,
      }),
      limit,
    );
  } catch (error) {
    if (!syllabusAssetKind(url) || signal.aborted) throw error;
    return readSyllabusAssetBytes(
      await fetch(`/api/syllabus/assets?url=${encodeURIComponent(url)}`, {
        signal,
      }),
      limit,
    );
  }
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

async function embedImage(image: HTMLImageElement) {
  const bytes = await assetBytes(image.src, 8_000_000);
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error("Image too large");
    const scale = Math.min(1, 2400 / bitmap.width, 3200 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image rendering unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    image.loading = "eager";
    image.src = canvas.toDataURL("image/png");
    await image.decode();
  } finally {
    bitmap.close();
  }
}

/** Snapshot the isolated official DOM at Letter width, independent of the viewer mode/zoom. */
export async function prepareSyllabusPdfLayout(syllabus: SyllabusDocument) {
  const frame = document.createElement("iframe");
  frame.title = "PDF export layout";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.sandbox.add("allow-same-origin");
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;pointer-events:none";
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Layout timed out")),
        15_000,
      );
      frame.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      frame.srcdoc = officialSyllabusFrame(syllabus.components, "en");
      document.body.append(frame);
    });
    const doc = frame.contentDocument,
      view = frame.contentWindow;
    if (!doc || !view) throw new Error("Layout unavailable");
    await doc.fonts.ready;
    const images = [...doc.images];
    if (images.length > 40) throw new Error("Too many images");
    // Two images at a time keeps mobile memory bounded; a missing image fails visibly.
    for (let index = 0; index < images.length; index += 2)
      await Promise.all(images.slice(index, index + 2).map(embedImage));
    const faces = new Map<string, Face>();
    let count = 0;
    function clone(node: Node): Node | null {
      if (++count > 30_000) throw new Error("Document too large");
      if (node.nodeType === 3)
        return document.createTextNode(node.textContent ?? "");
      if (node.nodeType !== 1) return null;
      const source = node as HTMLElement;
      const computed = view!.getComputedStyle(source);
      if (computed.display === "none" || computed.visibility === "hidden")
        return null;
      const tag = source.tagName.toLowerCase();
      const target = document.createElement(
        tag.startsWith("app-") || tag === "section" || tag === "main"
          ? "div"
          : tag,
      );
      const face = faceFor(computed);
      if (face) faces.set(face.key, face);
      const style = target.style;
      style.fontFamily = face?.key ?? "Roboto";
      style.fontSize = computed.fontSize;
      style.fontWeight = computed.fontWeight;
      style.fontStyle = computed.fontStyle;
      const fontSize = parseFloat(computed.fontSize),
        lineHeight = parseFloat(computed.lineHeight);
      if (fontSize && lineHeight)
        style.lineHeight = `${(lineHeight / fontSize) * 100}%`;
      style.color = computed.color;
      style.textAlign = computed.textAlign;
      style.textDecoration = tag === "a" ? "none" : computed.textDecorationLine;
      if (computed.backgroundColor !== "rgba(0, 0, 0, 0)")
        style.backgroundColor = computed.backgroundColor;
      style.marginTop = `${parseFloat(computed.marginTop) + parseFloat(computed.paddingTop)}px`;
      style.marginBottom = `${parseFloat(computed.marginBottom) + parseFloat(computed.paddingBottom)}px`;
      style.marginLeft = `${parseFloat(computed.marginLeft) + parseFloat(computed.paddingLeft)}px`;
      style.marginRight = `${parseFloat(computed.marginRight) + parseFloat(computed.paddingRight)}px`;
      // Preserve real rows of columns instead of flattening the official flex layout.
      const children = [...source.children].filter(
        (child) => (child as HTMLElement).getBoundingClientRect().width > 0,
      );
      if (
        target.tagName === "DIV" &&
        computed.display === "flex" &&
        computed.flexDirection === "row" &&
        children.length > 1 &&
        children.every(
          (child) =>
            Math.abs(
              child.getBoundingClientRect().top -
                children[0].getBoundingClientRect().top,
            ) < 1,
        )
      )
        target.setAttribute("data-pdfmake-type", "columns");
      const parent = source.parentElement;
      if (
        parent &&
        view!.getComputedStyle(parent).display === "flex" &&
        parent.children.length > 1
      ) {
        target.setAttribute(
          "data-pdfmake",
          JSON.stringify({
            width: `${(source.getBoundingClientRect().width / parent.getBoundingClientRect().width) * 100}%`,
          }),
        );
      }
      if (tag === "a")
        target.setAttribute("href", (source as HTMLAnchorElement).href);
      if (/^h[1-3]$/.test(tag))
        target.setAttribute(
          "data-pdfmake",
          JSON.stringify({ headlineLevel: Number(tag[1]) }),
        );
      if (tag === "img") {
        target.setAttribute("src", (source as HTMLImageElement).src);
        style.width = `${source.getBoundingClientRect().width}px`;
        style.height = `${source.getBoundingClientRect().height}px`;
      }
      if (tag === "table") {
        style.width = "100%";
        target.setAttribute("data-pdfmake", '{"layout":"syllabus"}');
      }
      if (tag === "td" || tag === "th") {
        for (const attr of ["colspan", "rowspan"])
          if (source.hasAttribute(attr))
            target.setAttribute(attr, source.getAttribute(attr)!);
        const table = source.closest("table");
        if (table)
          style.width = `${(source.getBoundingClientRect().width / table.getBoundingClientRect().width) * 100}%`;
      }
      if (tag === "ul" || tag === "ol")
        style.listStyleType = computed.listStyleType;
      for (const child of source.childNodes) {
        const copied = clone(child);
        if (copied) target.append(copied);
      }
      return target;
    }
    const root = clone(doc.querySelector(".doc")!) as HTMLElement;
    // html-to-pdfmake treats a <caption> as a one-cell row, which breaks multi-column
    // tables (the official ART schedule includes an empty caption). Keep it outside.
    for (const caption of root.querySelectorAll("caption")) {
      if (caption.textContent?.trim() || caption.querySelector("img")) {
        const heading = document.createElement("div");
        heading.append(...caption.childNodes);
        caption.closest("table")?.before(heading);
      }
      caption.remove();
    }
    const loaded = await Promise.all(
      [...faces.values()].map(async (face) => ({
        ...face,
        // Reconstruct transformed WOFF2 glyphs before pdfmake/fontkit subsets them.
        data: base64(await decompress(await assetBytes(face.url, 2_000_000))),
      })),
    );
    return { html: root.innerHTML, fonts: loaded };
  } finally {
    frame.remove();
  }
}
