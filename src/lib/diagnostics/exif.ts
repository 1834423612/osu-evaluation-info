// Reads a bounded JPEG APP1/TIFF metadata segment, never the image pixel data.
export function readJpegExif(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8)
    throw new Error("jpeg_required");
  let start = -1,
    end = 0;
  for (let p = 2; p + 4 < bytes.length;) {
    if (bytes[p] !== 255) break;
    const marker = bytes[p + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(p + 2);
    if (length < 2 || p + 2 + length > bytes.length) break;
    if (
      marker === 0xe1 &&
      length >= 8 &&
      String.fromCharCode(...bytes.slice(p + 4, p + 10)) === "Exif\0\0"
    ) {
      start = p + 10;
      end = p + 2 + length;
      break;
    }
    p += 2 + length;
  }
  if (start < 0) return { present: false };
  const little = view.getUint16(start) === 0x4949;
  const ok = (p: number, n: number) => p >= start && p + n <= end;
  const u16 = (p: number) => {
    if (!ok(p, 2)) throw Error("invalid_exif");
    return view.getUint16(p, little);
  };
  const u32 = (p: number) => {
    if (!ok(p, 4)) throw Error("invalid_exif");
    return view.getUint32(p, little);
  };
  if (
    ![0x4949, 0x4d4d].includes(view.getUint16(start)) ||
    u16(start + 2) !== 42
  )
    throw Error("invalid_exif");
  const result: Record<string, unknown> = { present: true },
    seen = new Set<number>();
  const tags: Record<number, string> = {
    0x010f: "make",
    0x0110: "model",
    0x0112: "orientation",
    0x0131: "software",
    0x0132: "dateTime",
    0x9003: "dateTimeOriginal",
    0xa434: "lensModel",
    0xa002: "pixelWidth",
    0xa003: "pixelHeight",
  };
  function ifd(offset: number, gps = false, depth = 0) {
    const p = start + offset;
    if (depth > 2 || seen.has(p) || !ok(p, 2)) return;
    seen.add(p);
    const count = Math.min(u16(p), 128);
    for (let i = 0; i < count; i++) {
      const entry = p + 2 + i * 12;
      if (!ok(entry, 12)) break;
      const tag = u16(entry),
        type = u16(entry + 2),
        n = u32(entry + 4);
      if (tag === 0x8769 || tag === 0x8825) {
        ifd(u32(entry + 8), tag === 0x8825, depth + 1);
        continue;
      }
      const name = gps
        ? (
            {
              1: "latitudeRef",
              2: "latitude",
              3: "longitudeRef",
              4: "longitude",
            } as Record<number, string>
          )[tag]
        : tags[tag];
      if (!name || n > 256) continue;
      const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 } as Record<number, number>)[
        type
      ];
      if (!size) continue;
      const valueAt = n * size <= 4 ? entry + 8 : start + u32(entry + 8);
      if (!ok(valueAt, n * size)) continue;
      let value: unknown;
      if (type === 2)
        value = new TextDecoder()
          .decode(bytes.slice(valueAt, valueAt + n))
          .replace(/\0+$/g, "")
          .slice(0, 256);
      else if (n <= 4) {
        const arr = [];
        for (let k = 0; k < n; k++) {
          const at = valueAt + k * size;
          arr.push(
            type === 5
              ? u32(at + 4)
                ? u32(at) / u32(at + 4)
                : null
              : type === 3
                ? u16(at)
                : type === 4
                  ? u32(at)
                  : bytes[at],
          );
        }
        value = n === 1 ? arr[0] : arr;
      }
      if (value !== undefined) result[gps ? "gps_" + name : name] = value;
    }
  }
  ifd(u32(start + 4));
  return result;
}
