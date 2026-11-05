import { getInstructorPhoto, validPhotoIdentity } from "@/lib/people/photo";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const identity = new URL(request.url).searchParams.get("identity") ?? "";
  if (!validPhotoIdentity(identity)) return new Response(null, { status: 400 });
  const photo = await getInstructorPhoto(identity);
  if (photo.status !== "available")
    return new Response(null, {
      status: photo.status === "missing" ? 404 : 503,
      headers: {
        "Cache-Control":
          photo.status === "missing" ? "public, max-age=21600" : "no-store",
      },
    });
  return new Response(photo.body.slice().buffer, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
