// A constant validator tests conditional requests without minting a visitor identifier.
const etag = '"course-atlas-diagnostic-v1"';
export function GET(request: Request) {
  return new Response(
    request.headers.get("if-none-match") === etag
      ? null
      : "diagnostic-cache-v1",
    {
      status: request.headers.get("if-none-match") === etag ? 304 : 200,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
