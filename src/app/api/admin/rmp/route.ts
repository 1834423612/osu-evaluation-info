import { authorizeAdminRequest, assertAdminOrigin } from "@/lib/auth/admin";
import {
  adminDetailSchema,
  adminFiltersSchema,
  courseDecisionInput,
} from "@/lib/rmp/admin-input";
import {
  listRmpAdmin,
  rmpAdminDetail,
  searchOfficialCourses,
  decideRmpCourse,
} from "@/lib/rmp/admin-service";
import { RmpDecisionError } from "@/lib/rmp/admin-store";
import {
  readJson,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
import { checkBudget } from "@/lib/user-data/rate-limit";
export const runtime = "nodejs";
async function authorize(request: Request) {
  const access = await authorizeAdminRequest(request);
  if (!access.development)
    await checkBudget(access.actor, "rmp-admin", 60, 120);
  return access;
}
export async function GET(request: Request) {
  return userRoute(async () => {
    const access = await authorize(request),
      params = new URL(request.url).searchParams;
    if (params.get("access") === "1")
      return userJson({
        authorized: true,
        development: access.development,
        developmentCourseView:
          access.development && !!process.env.RMP_ADMIN_SCHEMA,
      });
    if (params.has("catalog")) {
      const term = params.get("catalog")?.trim() ?? "";
      if (term.length < 2 || term.length > 80)
        throw new UserDataError("invalid");
      return userJson({
        items: await searchOfficialCourses(
          term,
          adminFiltersSchema.shape.campus.parse(params.get("campus") ?? "ALL"),
        ),
        development: access.development,
      });
    }
    if (params.has("professorId")) {
      const input = adminDetailSchema.parse(Object.fromEntries(params)),
        detail = await rmpAdminDetail(
          input.professorId,
          input.campus,
          input.token,
        );
      if (!detail) throw new UserDataError("not_found", 404);
      return userJson({ ...detail, development: access.development });
    }
    return userJson({
      ...(await listRmpAdmin(
        adminFiltersSchema.parse(Object.fromEntries(params)),
      )),
      development: access.development,
    });
  });
}
export async function POST(request: Request) {
  return userRoute(async () => {
    const access = await authorize(request);
    assertAdminOrigin(request, access);
    const input = await readJson(request, courseDecisionInput, 32768);
    try {
      return userJson(await decideRmpCourse(input, access.actor));
    } catch (error) {
      if (error instanceof RmpDecisionError)
        throw new UserDataError(
          error.code,
          error.code === "conflict" ? 409 : 400,
        );
      throw error;
    }
  });
}
