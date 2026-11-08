const PHOTO_ENDPOINT = "https://opic.osu.edu/";

export type InstructorPhotoPlan = {
  delivery: "osu-direct";
  version: 1;
  resource: "instructor-photo";
  endpoints: { photo: string };
  width: number;
};

export function validPhotoIdentity(value: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}\.\d{1,10}$/.test(value);
}

/** Static discovery only; this service never fetches or stores image bytes. */
export function instructorPhotoPlan(): InstructorPhotoPlan {
  return {
    delivery: "osu-direct",
    version: 1,
    resource: "instructor-photo",
    endpoints: { photo: PHOTO_ENDPOINT },
    width: 96,
  };
}

export function isInstructorPhotoPlan(
  value: unknown,
): value is InstructorPhotoPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as InstructorPhotoPlan;
  return (
    plan.delivery === "osu-direct" &&
    plan.version === 1 &&
    plan.resource === "instructor-photo" &&
    plan.endpoints?.photo === PHOTO_ENDPOINT &&
    Number.isInteger(plan.width) &&
    plan.width >= 16 &&
    plan.width <= 512
  );
}

export function instructorPhotoUrl(
  plan: InstructorPhotoPlan,
  identity: string,
): string | null {
  if (!isInstructorPhotoPlan(plan) || !validPhotoIdentity(identity))
    return null;
  const url = new URL(encodeURIComponent(identity), plan.endpoints.photo);
  url.searchParams.set("width", String(plan.width));
  // OPIC's default leaf loads successfully; request 404 so the initials fallback runs.
  url.searchParams.set("d", "404");
  return url.href;
}
