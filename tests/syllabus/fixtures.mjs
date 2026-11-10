export const termId = "97895acd-b121-469b-a6bc-1bd0b9059f69";
export const entityId = "8b896204-936a-41f3-8fc8-f0a0e63c7ee9";
export const snapshotId = "6edc5037-bd43-4e05-8f95-d08385a3976f";
export const componentId = "c69b8e20-e448-435d-bc41-64d5e0987c9e";
export const term = {
  id: termId,
  name: "Autumn 2026",
  code: "1268",
  status: "current",
  published: true,
  startsAt: null,
  endsAt: null,
};
export const rawEntry = {
  code: "example123",
  title: "ART 2000 15115",
  entity_id: entityId,
  term_id: termId,
  term_name: "Autumn 2026",
  sub_title: "Sample course",
  visibility: "general_public",
  family_name: "syllabus",
  entity_type: "section",
};
export function envelope(
  items,
  pagination = {
    total: items.length,
    returned: items.length,
    page: 0,
    page_size: 50,
  },
) {
  return { sys: { success: true }, items, pagination };
}
export const state = envelope([
  {
    state: {
      terms: [
        {
          entity_id: termId,
          name: "Autumn 2026",
          status: "current",
          is_published: true,
        },
      ],
    },
  },
]);
export function documentFixture(overrides = {}) {
  return envelope([
    {
      doc_data: {
        ...rawEntry,
        is_published: true,
        is_working: false,
        published_snapshot_id: snapshotId,
        modified: "2026-11-01T10:00:00Z",
        components: [
          {
            component_id: componentId,
            snapshot_id: snapshotId,
            is_public: true,
            locale: "en-US",
            sort_order: 0,
            component_type: "content",
            html: "<h2>Syllabus - Grading</h2><p>Exams: 40% &amp; essays: 60%.</p>",
          },
        ],
        ...overrides,
      },
    },
  ]);
}
