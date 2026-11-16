// Offline extraction of hash-verified public PDFs. Private files are never traversed.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { planningLines } from "../../src/lib/planning/pdf-lines.ts";
const cache = resolve(process.argv[2] ?? ".planning-cache");
const state = JSON.parse(await readFile(join(cache, "state.json"), "utf8"));
await mkdir(join(cache, "extracted"), { recursive: true });
let extracted = 0,
  failed = 0;
for (const record of Object.values(state.sources)) {
  for (const source of [...(record.versions ?? []), record]) {
    if (
      source.contentType !== "application/pdf" ||
      !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")
    )
      continue;
    let task;
    try {
      const data = await readFile(join(cache, source.sha256));
      if (
        data.length > 8 * 1024 * 1024 ||
        createHash("sha256").update(data).digest("hex") !== source.sha256
      )
        throw Error("digest");
      task = getDocument({
        data: new Uint8Array(data),
        verbosity: 0,
        useSystemFonts: false,
        disableFontFace: true,
        isEvalSupported: false,
      });
      const pdf = await task.promise;
      if (pdf.numPages > 100) throw Error("pages");
      const blocks = [];
      for (let page = 1; page <= pdf.numPages; page++) {
        const p = await pdf.getPage(page);
        blocks.push(
          ...planningLines((await p.getTextContent()).items, page).map((r) => ({
            kind: "text",
            text: r.text,
            cells: r.cells,
            width: p.getViewport({ scale: 1 }).width,
            page,
          })),
        );
        p.cleanup();
        if (blocks.length > 30000) throw Error("content");
      }
      await writeFile(
        join(cache, "extracted", source.sha256 + ".json"),
        JSON.stringify({
          sha256: source.sha256,
          parserVersion: "pdfjs-geometry-v2",
          extractedAt: new Date().toISOString(),
          pageCount: pdf.numPages,
          blocks,
        }) + "\n",
      );
      extracted++;
    } catch {
      failed++;
    } finally {
      await task?.destroy();
    }
  }
}
console.log(JSON.stringify({ extracted, failed }));
if (failed) process.exitCode = 1;
