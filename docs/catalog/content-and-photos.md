# OSU course and faculty services

The catalog uses the public OSU content endpoints discovered through the existing
application routes. Browsers fetch official course/section data directly; see
[the catalog transport contract](api.md). Subject/catalog checks and pagination
remain exact, including queries where a prerequisite mentions another course.

Faculty photos use the same discovery pattern. `GET /api/instructors/photo`
returns a public, cacheable dictionary:

```json
{
  "delivery": "osu-direct",
  "version": 1,
  "resource": "instructor-photo",
  "endpoints": { "photo": "https://opic.osu.edu/" },
  "width": 96
}
```

This endpoint never fetches, caches or forwards image bytes. The client shares
in-flight discovery across avatars and retains the configuration for one hour;
HTTP caching uses max-age 3600 and stale-while-revalidate 86400. Teacher identities
are not sent to the discovery endpoint. Invalid discovery is rejected and can be
retried on the next load.

`InstructorAvatar` derives `name.number` only from an OSU email and builds the
photo URL from the approved OPIC endpoint. Its native image loads directly from
`https://opic.osu.edu/<name.number>?width=96` with lazy loading, async decoding and
no referrer. The browser handles official image caching and redirects. No Next
image optimizer or application image proxy participates. A changed identity never
keeps displaying the previous teacher's photo. Missing email identities, failed
discovery, and image load errors leave the initials avatar visible.

OPIC does not provide fetch CORS headers, so photos are displayed through a native
image element rather than fetched into JavaScript. The official default Buckeye
leaf redirect is displayed as the official fallback image. The former server-side
leaf detection, byte cache and redirect proxy have been removed. No photos are
stored in this repository or database. Photo availability does not establish an
RMP identity match.

The November 8 live check returned a JPEG for `blanas.2` and an official leaf
redirect for `bucci.2`. Browser checks cover direct image loads, failed-image
initials, shared discovery and both desktop and phone views.
