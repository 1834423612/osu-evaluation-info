import { detectPlanLayout, parsePlanLines, type PdfLine } from "./parser";
import type { Plan } from "./model";
import { planningLines } from "./pdf-lines";
export async function extractPlan(
  file: File,
  source: Plan["source"] | "auto",
  signal?: AbortSignal,
  origin: Plan["pdfOrigin"] = "export",
) {
  if (file.size > 20 * 1024 * 1024) throw Error("size");
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    if (new TextDecoder().decode(data.subarray(0, 5)) !== "%PDF-")
      throw Error("format");
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const task = pdfjs.getDocument({
      data,
      useSystemFonts: false,
      disableFontFace: true,
    });
    const cancel = () => {
      void task.destroy();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 60_000);
    const lines: PdfLine[] = [];
    try {
      if (signal?.aborted) throw Error("cancelled");
      const pdf = await task.promise;
      if (pdf.numPages > 100) throw Error("pages");
      for (let n = 1; n <= pdf.numPages; n++) {
        if (signal?.aborted) throw Error("cancelled");
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        lines.push(...planningLines(content.items, n));
        page.cleanup();
        if (lines.length > 30000) throw Error("content");
      }
      const detected =
        source === "auto" ? detectPlanLayout(lines, file.name) : source;
      if (!detected) throw Error("layout");
      const result = parsePlanLines(lines, detected, origin);
      const mode = /(?:^|[_ -])planned(?:[_ -]|$)/i.test(file.name)
        ? "planned"
        : /(?:^|[_ -])official(?:[_ -]|$)/i.test(file.name)
          ? "official"
          : null;
      if (mode && result.plan.auditMode === "unknown") {
        result.plan.auditMode = mode;
        result.plan.documents.forEach((d) => {
          d.auditMode = mode;
        });
      }
      return result;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      lines.length = 0;
      await task.destroy();
    }
  } finally {
    // PDF.js may transfer/detach this buffer. Wipe it when still owned here.
    // JavaScript strings and browser-internal copies cannot be securely zeroed.
    if (data.byteLength) data.fill(0);
  }
}
