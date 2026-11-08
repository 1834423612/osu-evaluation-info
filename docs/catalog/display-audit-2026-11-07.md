# Course display and official enrollment audit

The investigation compared the existing read-only directory cache, raw OSU class
responses, normalization, merging, and the display components.

- Combined student levels such as `Undergraduate / Graduate` were shortened by
  the header's first matching substring. Display now splits all levels, deduplicates
  them, and translates each separately in both the card and detail header.
- The directory cache contained 131 people. Appointment titles already included
  Associate Professor, Assistant Professor, Emeritus, research jobs, and multiple
  concurrent jobs. Presentation now uses these titles rather than assigning one
  broad category. A check of all 131 records found no explicit appointment falling
  back to generic Staff. No database records were modified.
- The inspected ANTHROP 2200 online meetings explicitly reported `Distance Learning`
  and location `Online`, with all weekdays false and start/end times null. Those
  meetings display Online class without an empty weekday strip or a time placeholder.
  Published days and times remain visible. Missing weekdays alone never establish
  an online class.

## Enrollment totals — corrected November 8, 2026

The November 7 investigation inspected only `/classes/search`. Its repeated
`enrollmentTotal` values (69 for Autumn 2026 ANTHROP 2200 and 42 for Spring 2027)
were incorrectly treated as reliable official enrollment. They are search
placeholders and must never appear as actual seats or enrollment counts.

The supplied browser HAR establishes the separate, per-section source:

`GET https://content.osu.edu/v2/classes/availability?classSection=0040&courseId=151332&courseOfferingNumber=1&sessionCode=1&termCode=1268`

The captured response for section `0040` has 44 enrolled, capacity 70, 26 available,
waitlist total 0 and waitlist capacity 999. Other captured sections report different
counts (for example `0030`: 69/70, 1 available; `0250`: 127/210, 83 available).
A separate live read confirmed the `0040` response during this correction. These
are observations at fetch time, not permanent course facts. Leading zeros in
`classSection`, offering number, session and term are all part of request identity.

Normalization now clears every count and status from search and snapshot metadata.
Only a validated `/classes/availability` response can populate a section's live
counts. Tests cover source separation, exact identifiers, zero, missing fields,
waitlists, cancellation, deduplication, bounded concurrency and staggered starts.
See [API behavior](api.md#live-only-enrollment) for the query and watch lifecycle.

Course identities and credit ranges are shown in lists, detail headers and saved
section cards. Fees retain original descriptions and apply campus-qualified
`CRSF` alternatives to the current campus; section `ALX` textbook fees remain
associated with their sections. Different campus or section charges are never
summed into a claimed total.

Verification of the correction covered lint (including CSS selector/property
checks), TypeScript, automated tests and a production build. Browser checks covered
Chinese and English at 320, 390, 800 and 1440 pixels, one-hour idle retention,
refresh failure/recovery, known waitlist totals with missing capacity, clipboard
copying, selected-only watch rounds, large-selection confirmation, hidden-tab
pause/resume, course-focus pause/resume and selection persistence. Additional phone
checks covered saved sections and legacy instructor/course relations, including
ensuring that live counts are never saved. Browser responses used controlled
HAR-shaped fixtures; a local API request to the actual official availability
service independently returned 44 enrolled / 70 capacity and 26 available for
section `0040`. No database records were changed.
