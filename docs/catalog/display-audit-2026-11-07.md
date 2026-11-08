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

## Enrollment totals

The following were observed directly in the official JSON, before normalization:

| Course / campus         | Term                 | Exact-course sections returned | Enrollment total in each section |
| ----------------------- | -------------------- | ------------------------------ | -------------------------------- |
| ANTHROP 2200 / Columbus | Autumn 2026 (`1268`) | 12                             | 69                               |
| ANTHROP 2200 / Columbus | Spring 2027 (`1272`) | 13                             | 42                               |

Official requests:

- [Autumn 2026](https://content.osu.edu/v2/classes/search?q=2200&client=class-search-ui&term=1268&subject=anthrop&p=1&campus=col)
- [Spring 2027](https://content.osu.edu/v2/classes/search?q=2200&client=class-search-ui&term=1272&subject=anthrop&p=1&campus=col)

These values are an observation at investigation time, not fixed course data.
`normalizeSection` reads `enrollmentTotal` from the corresponding raw section;
`mergeCatalogCourse` reconciles sections by term/class number. Neither copies a
course-wide total or another section's total. Regression checks cover different
counts, zero, repeated upstream counts, waitlist counts, and updates to one section
without changing the other sections. The duplicate values in these two responses
therefore originate in the official feed. The application preserves the returned
values and does not estimate individual counts or seats from them.
