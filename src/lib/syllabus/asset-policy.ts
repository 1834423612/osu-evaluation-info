const fontPath =
  /^\/bux-webfonts2\/(BuckeyeSans|BuckeyeSerif)\/\1[2]-(Regular|Italic|SemiBold|SemiBoldItalic|Bold|BoldItalic|ExtraBold|ExtraBoldItalic|Black|BlackItalic)\.woff2$/;

/** Only known public syllabus images and OSU BUX font files may use the relay. */
export function syllabusAssetKind(value: string): "image" | "font" | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return null;
    if (
      url.hostname === "osu.simplesyllabus.com" &&
      /^\/ui\/account-image\/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(
        url.pathname,
      )
    )
      return "image";
    if (
      url.hostname === "bux-fonts.s3.us-east-1.amazonaws.com" &&
      fontPath.test(url.pathname)
    )
      return "font";
  } catch {}
  return null;
}

export function syllabusAssetMime(bytes: Uint8Array, kind: "image" | "font") {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (kind === "font") return ascii(0, 4) === "wOF2" ? "font/woff2" : null;
  if (
    bytes[0] === 137 &&
    ascii(1, 4) === "PNG" &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (/^GIF8[79]a$/.test(ascii(0, 6))) return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function readSyllabusAssetBytes(
  response: Response,
  limit: number,
) {
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length")) > limit
  )
    throw new Error("Asset unavailable");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Asset too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
