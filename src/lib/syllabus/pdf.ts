import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { officialSyllabusUrl } from "./normalize.ts";
import { prepareSyllabusPdfLayout } from "./pdf-layout.ts";
import type { SyllabusDocument } from "./types.ts";

export function syllabusPdfFileName(document: SyllabusDocument) {
  return `${document.entry.termName}-${document.entry.title}.pdf`.replace(
    /[^a-z0-9. -]/gi,
    "_",
  );
}

/** All layout, image conversion, font embedding and PDF assembly happens on this device. */
export async function createSyllabusPdf(document: SyllabusDocument) {
  const [pdfModule, fontsModule, htmlModule, layout] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
    import("html-to-pdfmake"),
    prepareSyllabusPdfLayout(document),
  ]);
  const pdfMake = pdfModule.default,
    htmlToPdfmake = htmlModule.default;
  pdfMake.addVirtualFileSystem(fontsModule.default);
  for (const face of layout.fonts) {
    pdfMake.addVirtualFileSystem({ [face.file]: face.data });
    pdfMake.addFonts({
      [face.key]: {
        normal: face.file,
        bold: face.file,
        italics: face.file,
        bolditalics: face.file,
      },
    });
  }
  pdfMake.addTableLayouts({
    syllabus: {
      hLineWidth: () => 0.75,
      vLineWidth: () => 0.75,
      hLineColor: () => "#dddddd",
      vLineColor: () => "#dddddd",
      paddingLeft: () => 3.75,
      paddingRight: () => 3.75,
      paddingTop: () => 3.75,
      paddingBottom: () => 3.75,
    },
  });
  const converted = htmlToPdfmake(layout.html, {
    window: window as unknown as NonNullable<
      Parameters<typeof htmlToPdfmake>[1]
    >["window"],
    tableAutoSize: true,
    defaultStyles: {
      h1: { margin: 0 },
      h2: { margin: 0 },
      h3: { margin: 0 },
      p: { margin: 0 },
      table: { margin: 0 },
      a: { color: "#ba0c2f", decoration: [] },
    },
  });
  const definition: TDocumentDefinitions = {
    pageSize: "LETTER",
    pageMargins: [18, 18, 18, 36],
    info: {
      title: `${document.entry.termName} ${document.entry.title}`,
      subject: document.entry.subtitle,
      creator: "WahO! — browser-local syllabus export",
    },
    defaultStyle: { font: "Roboto", fontSize: 12, lineHeight: 1.5 },
    pageBreakBefore: (node, container) =>
      Boolean(
        node.headlineLevel && !container.getFollowingNodesOnPage().length,
      ),
    content: Array.isArray(converted) ? converted : [converted],
    footer: (page, count) => ({
      columns: [
        {
          text: "OSU · Simple Syllabus",
          link: officialSyllabusUrl(document.entry.code),
        },
        { text: `${page} / ${count}`, alignment: "right" },
      ],
      font: "Roboto",
      fontSize: 8,
      color: "#777777",
      margin: [18, 12, 18, 0],
    }),
  };
  return {
    blob: await pdfMake.createPdf(definition).getBlob(),
    fileName: syllabusPdfFileName(document),
  };
}
