export async function readJsonBody(
  request: Request,
  maxBytes = 65_536,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new RangeError("Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new RangeError("Missing request body");
  const decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RangeError("Request too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
