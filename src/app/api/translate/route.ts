import { after } from "next/server";
import { translationRuntime } from "@/lib/translation/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    return await translationRuntime.handle(request);
  } finally {
    after(() => translationRuntime.flushUsage());
  }
}
