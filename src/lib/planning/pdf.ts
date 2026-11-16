import { parsePlanLines, type PdfLine } from "./parser";
import type { Plan } from "./model";
import { planningLines } from "./pdf-lines";
export async function extractPlan(
  file: File,
  source: Plan["source"],
  signal?: AbortSignal,
  origin: Plan["pdfOrigin"] = "export",
) {
  if (file.size > 20 * 1024 * 1024) throw Error("size");
  const data = new Uint8Array(await file.arrayBuffer());
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
  try {
    if (signal?.aborted) throw Error("cancelled");
    const pdf = await task.promise;
    if (pdf.numPages > 100) throw Error("pages");
    const lines: PdfLine[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      if (signal?.aborted) throw Error("cancelled");
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      lines.push(...planningLines(content.items, n));
      page.cleanup();
      if (lines.length > 30000) throw Error("content");
    }
    return parsePlanLines(lines, source, origin);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    await task.destroy();
  }
}
