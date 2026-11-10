import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { cleanSyllabusHtml } from "./content.ts";
import { officialSyllabusUrl } from "./normalize.ts";
import type { SyllabusDocument } from "./types.ts";

/** Called only after a user action. No upload, remote PDF service or server rendering. */
export async function downloadSyllabusPdf(document: SyllabusDocument) {
  const [pdfModule, fontsModule, htmlModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
    import("html-to-pdfmake"),
  ]);
  const pdfMake = pdfModule.default,
    htmlToPdfmake = htmlModule.default;
  pdfMake.addVirtualFileSystem(fontsModule.default);
  const converted = htmlToPdfmake(
    document.components
      .map((component) => cleanSyllabusHtml(component.html))
      .join("\n"),
    {
      window: window as unknown as NonNullable<
        Parameters<typeof htmlToPdfmake>[1]
      >["window"],
      tableAutoSize: true,
      defaultStyles: {
        h1: { fontSize: 20, marginBottom: 12 },
        h2: { fontSize: 15, marginTop: 14, marginBottom: 8 },
        p: { margin: [0, 0, 0, 5] },
        table: { marginBottom: 10 },
      },
    },
  );
  const content = Array.isArray(converted) ? converted : [converted];
  const definition: TDocumentDefinitions = {
    pageSize: "LETTER",
    pageMargins: [42, 42, 42, 48],
    info: {
      title: `${document.entry.termName} ${document.entry.title}`,
      subject: document.entry.subtitle,
      creator: "WahO! — browser-local syllabus export",
    },
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.2 },
    content: [
      {
        text: `${document.entry.termName} · ${document.entry.title}`,
        fontSize: 10,
        color: "#666666",
        margin: [0, 0, 0, 8],
      },
      ...content,
      {
        text: "Official syllabus",
        link: officialSyllabusUrl(document.entry.code),
        fontSize: 9,
        color: "#ba0c2f",
        margin: [0, 16, 0, 0],
      },
    ],
    footer: (page, count) => ({
      text: `${page} / ${count}`,
      alignment: "center",
      fontSize: 9,
      color: "#777777",
      margin: [0, 16, 0, 0],
    }),
  };
  const fileName =
    `${document.entry.termName}-${document.entry.title}.pdf`.replace(
      /[^a-z0-9. -]/gi,
      "_",
    );
  const blob = await pdfMake.createPdf(definition).getBlob();
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  window.document.body.append(link);
  link.click();
  link.remove();
  // The reader retains a real user-activated link for browsers that suppress automatic saves.
  return { url, fileName };
}
