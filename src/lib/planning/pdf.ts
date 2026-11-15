import { parsePlanLines, type PdfLine } from "./parser";
import type { Plan } from "./model";
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
      const rows = new Map<number, Array<{ x: number; text: string }>>();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        const row = rows.get(y) ?? [];
        row.push({ x: item.transform[4], text: item.str });
        rows.set(y, row);
      }
      for (const [, row] of [...rows].sort((a, b) => b[0] - a[0])) {
        lines.push({
          page: n,
          text: row
            .sort((a, b) => a.x - b.x)
            .map((x) => x.text)
            .join(" "),
        });
      }
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
