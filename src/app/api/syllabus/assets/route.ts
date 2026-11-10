import { createRequestPool } from "@/lib/catalog/request-pool";
import { anonymousSyllabusFetch } from "@/lib/syllabus/anonymous-fetch";
import {
  readSyllabusAssetBytes,
  syllabusAssetKind,
  syllabusAssetMime,
} from "@/lib/syllabus/asset-policy";

export const runtime = "nodejs";
const pool = createRequestPool<{
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
}>({ concurrency: 2, maxQueued: 16, minStartIntervalMs: 100 });

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  const kind = syllabusAssetKind(url);
  if (!kind) return new Response(null, { status: 400 });
  try {
    const asset = await pool.read(
      url,
      async (signal) => {
        const response = await anonymousSyllabusFetch(url, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
        });
        const bytes = await readSyllabusAssetBytes(
          response,
          kind === "font" ? 2_000_000 : 8_000_000,
        );
        const mime = syllabusAssetMime(bytes, kind);
        if (!mime) throw new Error("Unexpected asset type");
        return { bytes, mime };
      },
      { signal: request.signal },
    );
    return new Response(asset.bytes, {
      headers: {
        "Content-Type": asset.mime,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
