/** pdfmake multiplies a font's ascent/descent height, while CSS uses the em. */
export function pdfFontHeightRatio(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12) throw new Error("Invalid PDF font");
  const tables = new Map<string, number>();
  const count = view.getUint16(4);
  for (let index = 0; index < count; index++) {
    const at = 12 + index * 16;
    if (at + 16 > bytes.byteLength) throw new Error("Invalid font directory");
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    tables.set(tag, view.getUint32(at + 8));
  }
  const head = tables.get("head"),
    hhea = tables.get("hhea");
  if (
    head === undefined ||
    hhea === undefined ||
    head + 20 > bytes.byteLength ||
    hhea + 8 > bytes.byteLength
  )
    throw new Error("Missing font metrics");
  const em = view.getUint16(head + 18);
  const height = view.getInt16(hhea + 4) - view.getInt16(hhea + 6);
  if (!em || height <= 0) throw new Error("Invalid font metrics");
  return height / em;
}
