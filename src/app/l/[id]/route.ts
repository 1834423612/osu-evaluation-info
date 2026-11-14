import { readPageLink } from "@/lib/user-data/page-links";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ]!,
  );
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params,
      prefetch = /prefetch/i.test(
        request.headers.get("sec-purpose") ??
          request.headers.get("purpose") ??
          "",
      ),
      bot =
        /bot|slack|discord|whatsapp|telegram|facebookexternalhit|twitter/i.test(
          request.headers.get("user-agent") ?? "",
        );
    const link = await readPageLink(
      id,
      prefetch ? undefined : bot ? "preview" : "open",
    );
    const target = new URL(link.href, new URL(request.url).origin);
    if (link.course) target.searchParams.set("via", link.id);
    if (bot)
      return new Response(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>' +
          escape(link.title) +
          '</title><meta property="og:title" content="' +
          escape(link.title) +
          '"><meta property="og:description" content="' +
          escape(
            link.course?.description.slice(0, 200) ?? "Shared WahO! page",
          ) +
          '"></head><body><a href="' +
          escape(target.pathname + target.search + target.hash) +
          '">' +
          escape(link.title) +
          "</a></body></html>",
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "Content-Security-Policy":
              "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          },
        },
      );
    return new Response(null, {
      status: 307,
      headers: {
        Location: target.pathname + target.search + target.hash,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new Response("Link unavailable", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await readPageLink((await params).id);
    return new Response(null, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}
