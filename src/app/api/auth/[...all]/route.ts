import { handleAuthRequest } from "@/lib/auth/handler";
export const runtime = "nodejs";
export const GET = (request: Request) => handleAuthRequest(request);
export const POST = (request: Request) => handleAuthRequest(request);
