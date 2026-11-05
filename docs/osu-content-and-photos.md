# OSU course and faculty services

The catalog already uses `https://content.osu.edu/v2/classes/` for official terms,
courses, sections, meetings, and instructor email identities. Search results can
include a course because its prerequisite mentions the search string, so course
details filter subject and catalog number exactly and follow pagination.

Faculty photos use `https://opic.osu.edu/<name.number>?width=96`, following the
pattern in [BuckeyeRatings photo.ts](https://github.com/IvanKuria/buckeye-ratings/blob/0f0d5bec292c30c2563337c3cff4689e59ef543a/src/lib/photo.ts).
The local `/api/instructors/photo?identity=<name.number>` endpoint loads them
server-side. `InstructorAvatar` derives the identity only from an OSU email,
loads photos lazily, and displays initials when no photo is available.

The proxy accepts only numbered identities and follows at most three redirects
within the fixed OPIC HTTPS origin. A redirect into `/assets/leaf/` means the
default Buckeye image and is treated as missing. PNG alone does not mean missing:
real JPEG, PNG, and WebP responses are accepted. HTML responses are rejected.
Requests time out after five seconds and streamed bodies are limited to 2 MiB.

Each server process deduplicates concurrent requests and limits them to twelve.
An LRU cache is bounded to 256 entries and 16 MiB: real photos last 24 hours,
missing photos six hours, and transient errors thirty seconds. Successful HTTP
responses cache for 24 hours; missing responses cache for six hours. Errors do
not receive public HTTP caching. No photos are stored in the repository or
database.

Live checks on 2026-11-05: `blanas.2` returned a JPEG photo; `bucci.2` redirected
to the default leaf asset. Photo availability is independent of rating coverage
and does not establish an RMP identity match.
