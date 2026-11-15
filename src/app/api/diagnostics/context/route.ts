import { diagnosticContext } from "@/lib/diagnostics/server-context";
import { userJson } from "@/lib/user-data/http";
export const runtime = "nodejs";
export function GET(request: Request) {
  const response = userJson(diagnosticContext(request.headers));
  response.headers.set(
    "Vary",
    "User-Agent, Accept-Language, Sec-CH-UA, Sec-CH-UA-Platform",
  );
  return response;
}
