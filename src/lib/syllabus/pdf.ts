import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { officialSyllabusUrl } from "./normalize.ts";
import { prepareSyllabusPdfLayout } from "./pdf-layout.ts";
import { normalizeSyllabusPdfLinks, syllabusPdfColor } from "./pdf-content.ts";
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
  const conversionOptions = {
    window: window as unknown as NonNullable<
      Parameters<typeof htmlToPdfmake>[1]
    >["window"],
    tableAutoSize: true,
    collapseMargins: true,
    removeExtraBlanks: true,
    customTag: ({
      element,
      ret,
    }: {
      element: HTMLElement;
      ret: Record<string, unknown>;
    }) => {
      if (element.tagName === "TABLE" && ret.table) {
        const table = ret.table as Record<string, unknown>;
        const rows = [...element.querySelectorAll("tr")];
        const headers = rows.findIndex(
          (row) =>
            ![...row.cells].every(
              (cell) =>
                cell.tagName === "TH" ||
                Boolean(cell.querySelector("strong,b")),
            ),
        );
        table.headerRows = headers < 0 ? rows.length : headers;
        table.keepWithHeaderRows = 1;
        table.dontBreakRows = true;
      }
      const rule = element.getAttribute("data-syllabus-heading-rule");
      if (!rule) return ret;
      const { width, lineWidth, color } = JSON.parse(rule) as {
        width: number;
        lineWidth: number;
        color: string;
      };
      const margin = ret.margin;
      const headlineLevel = ret.headlineLevel;
      delete ret.margin;
      delete ret.headlineLevel;
      return {
        stack: [
          ret,
          {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: lineWidth / 2,
                x2: width,
                y2: lineWidth / 2,
                lineWidth,
                lineColor: syllabusPdfColor(color),
              },
            ],
          },
        ],
        margin,
        headlineLevel,
      };
    },
    defaultStyles: {
      h1: { margin: 0 },
      h2: { margin: 0 },
      h3: { margin: 0 },
      p: { margin: 0 },
      table: { margin: 0 },
      // The converter appends decorations; [] becomes a nested empty decoration
      // that pdfmake rejects on documents containing links.
      a: { color: "#ba0c2f", decoration: undefined },
    },
  };
  const converted = htmlToPdfmake(layout.html, conversionOptions);
  normalizeSyllabusPdfLinks(converted);
  const definition: TDocumentDefinitions = {
    pageSize: "LETTER",
    // 48 CSS px at 96 dpi = 36 PDF points: matches the official .doc container.
    pageMargins: [36, 36, 36, 36],
    info: {
      title: `${document.entry.termName} ${document.entry.title}`,
      subject: document.entry.subtitle,
      creator: "WahO! — browser-local syllabus export",
    },
    defaultStyle: { font: "Roboto", fontSize: 12, lineHeight: 1.28 },
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
      margin: [36, 12, 36, 0],
    }),
  };
  return {
    blob: await pdfMake.createPdf(definition).getBlob(),
    fileName: syllabusPdfFileName(document),
  };
}
