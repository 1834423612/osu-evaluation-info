export const OFFICIAL_ENDPOINTS = {
  search: "https://content.osu.edu/v2/classes/search",
  terms: "https://content.osu.edu/v2/classes/searchableTermsV2",
  availability: "https://content.osu.edu/v2/classes/availability",
} as const;

export type CatalogResource = "catalog" | "course" | "facets" | "availability";
export type OfficialEndpointPlan = {
  delivery: "osu-direct";
  version: 1;
  resource: CatalogResource;
  endpoints: { search: string; terms: string; availability: string };
};

/** Discovery is static and never makes an upstream request. */
export function officialEndpointPlan(
  resource: CatalogResource,
): OfficialEndpointPlan {
  return {
    delivery: "osu-direct",
    version: 1,
    resource,
    endpoints: { ...OFFICIAL_ENDPOINTS },
  };
}

export function isOfficialEndpointPlan(
  value: unknown,
  resource: CatalogResource,
): value is OfficialEndpointPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as OfficialEndpointPlan;
  return (
    plan.delivery === "osu-direct" &&
    plan.version === 1 &&
    plan.resource === resource &&
    Object.entries(OFFICIAL_ENDPOINTS).every(
      ([key, url]) =>
        plan.endpoints?.[key as keyof typeof OFFICIAL_ENDPOINTS] === url,
    )
  );
}

export function officialPlanResponse(resource: CatalogResource) {
  return Response.json(officialEndpointPlan(resource), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
