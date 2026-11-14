# OSU SEI/SSLE full-dataset profiling report

English · [简体中文](../../zh-CN/evaluations/data-quality/profile-report.md)

Source file: `osu_sei_ssle_all.jsonl`  
SHA-256: `e369886d944210f7e0d1f9938badc03561586566a61851530943a3cf9d180219`  
File size: 31.86 MB  
Analyzed rows: **68,729**

## Executive findings

The full 68,729-row export is internally very clean. There are **0 exact duplicate rows** and **0 conflicts** for the proposed evaluation natural key.

Validated cardinalities:

- **248** SUBJECT values
- **4,189** raw Catalog values
- **8,738** `(SUBJECT, Catalog)` course keys in the current export
- **62,484** sections keyed by `(Term, Class Number)`
- **7,108** instructors keyed by `Namen`
- **68,729** instructor-section evaluations keyed by `(Term, Class Number, Namen)`
- **13** terms, Summer 2022 through Summer 2026
- **18** colleges and **125** department strings

### Natural-key validation

1. `(Term, Class Number)` identifies exactly one section in this dataset.
   - Sections: **62,484**
   - Keys mapping to multiple `(SUBJECT, Catalog)` pairs: **0**
   - Keys with conflicting Class / College / Department / Medium / Campus / Class Size Category: **0**

2. `(Term, Class Number, Namen)` identifies exactly one evaluation.
   - Unique keys: **68,729**
   - Conflicting/duplicate keys: **0**

3. `Namen` is the correct instructor identity key for this dataset, but display names are historical attributes.
   - Unique `Namen`: **7,108**
   - `Namen` values appearing with more than one display-name spelling/form: **181**
   - Exact display-name pairs shared by more than one `Namen`: **46**
   - Therefore `First Name + Last Name` must not be used as an instructor primary/unique key.

4. Class Number must be scoped by Term.
   - Raw distinct Class Numbers: **30,392**
   - Class Numbers reused in multiple terms: **18,482**
   - Maximum number of terms sharing one Class Number value: **9**

### Multi-instructor sections

- Sections with >1 instructor: **4,102** (6.56% of sections)
- Evaluation rows on those sections: **10,347** (15.05% of all rows)
- Maximum instructors on one section: **31**

This confirms that `section` and `evaluation` must be separate entities. A section cannot have a single instructor column.

## Instrument split

**SEI:** 50,365 rows, through Summer 2025.  
**SSLE:** 18,364 rows, Autumn 2025 onward.

The rating column is numerically 1–5 throughout, but it represents two different measures:

- SEI: overall-rating question
- SSLE: mean across SSLE items

The normalized database should therefore store both `instrument` and `metric_kind`, and summary views must not silently combine SEI and SSLE.

### Standard Deviation correction

`Standard Deviation = N/A` is **not** a reliable SSLE detector.

- Total N/A: **19,377**
- SSLE N/A: **18,364 / 18,364 (100%)
- SEI N/A: **1,013**

The SEI N/A rows are all low-response rows in this export:

- 1 response: 976
- 2 responses: 33
- 3 responses: 4

Because other SEI rows with 1–3 responses _do_ contain an SD, the importer must preserve N/A as SQL `NULL` without inferring a single cause.

## Numerical data quality

- Rating range: **1.00–5.00**
- N of Responses range: **1–862**
- InvitedCount range: **5–1184**
- ResponseRatio range: **0.78%–100.00%**
- Non-null SD range: **0.00–2.83**
- Rows where responses > invited: **0**
- ResponseRatio formula mismatches over 0.01 percentage point: **0**
- Maximum absolute difference between stored ratio and `responses / invited × 100`: **0.005010 percentage point**

The full file has **1,124,012 responses** across **2,490,803 invitations**, a pooled response rate of **45.13%**.

## Course and section modeling findings

### Course titles change

There are **271** `(SUBJECT, Catalog)` course keys with multiple Class-title strings (maximum 3). Therefore `Class` should be stored on the section / title-observation layer, not used as part of the normal course identity when Catalog is known.

### Department is not a course-level invariant

There are **796** course keys that appear under multiple DEPARTMENT strings. In contrast, COLLEGE is invariant for every current `(SUBJECT, Catalog)` key. To avoid overfitting this snapshot, both College and Department are retained on `section` in schema v2.

### Catalog N/A

There are **6** rows / **3** sections with `Catalog = N/A`.

Schema v2 stores:

- `catalog = NULL`
- `catalog_raw = 'N/A'`
- a special title-qualified `course_key` for unknown-catalog rows

This prevents future unrelated unknown-catalog courses under the same subject from being merged accidentally.

### Class Size Category cannot be reconstructed from InvitedCount

Observed current ranges by stored category:

| Category | Rows   | %      | Invited min | median | max  |
| -------- | ------ | ------ | ----------- | ------ | ---- |
| M        | 30,542 | 44.44% | 5           | 29.0   | 60   |
| S        | 28,522 | 41.50% | 5           | 13.0   | 21   |
| L        | 9,665  | 14.06% | 5           | 96.0   | 1184 |

There is substantial overlap, so the category is not safely derivable from the displayed `InvitedCount`. `Class Size Category` is perfectly section-invariant in this export, while `InvitedCount` differs across instructors on only **1** section (response counts differ on **2,448** sections). The overlap is therefore more consistent with Blue/OSU comparison-group or combined-class logic than with a simple threshold on this row's InvitedCount:

- `M` with invited < 20: **2,891**
- `L` with invited ≤ 60: **1,148**
- `S` with invited > 20: **2**

The source value should be preserved directly.

`InvitedCount` remains on `evaluation`, not `section`: although it is identical across instructors for nearly every current section, one real section (`SU 24`, class `4280`) has instructor-specific invited counts (28 vs 30). Moving it to section would therefore lose source fidelity.

## Term distribution

| Term  | Instrument | Rows  | Sections | Unique instructors | Responses | Invited | Response rate |
| ----- | ---------- | ----- | -------- | ------------------ | --------- | ------- | ------------- |
| SU 22 | SEI        | 1,141 | 1,033    | 801                | 13,254    | 33,080  | 40.07%        |
| AU 22 | SEI        | 8,019 | 7,292    | 3,631              | 168,390   | 295,203 | 57.04%        |
| SP 23 | SEI        | 7,721 | 7,081    | 3,543              | 146,575   | 269,935 | 54.30%        |
| SU 23 | SEI        | 1,175 | 1,029    | 817                | 11,845    | 32,818  | 36.09%        |
| AU 23 | SEI        | 8,360 | 7,617    | 3,729              | 150,844   | 307,870 | 49.00%        |
| SP 24 | SEI        | 8,027 | 7,354    | 3,608              | 130,229   | 280,011 | 46.51%        |
| SU 24 | SEI        | 1,179 | 1,043    | 821                | 10,208    | 33,829  | 30.18%        |
| AU 24 | SEI        | 6,179 | 5,708    | 3,191              | 124,550   | 281,323 | 44.27%        |
| SP 25 | SEI        | 7,368 | 6,700    | 3,425              | 114,172   | 266,441 | 42.85%        |
| SU 25 | SEI        | 1,196 | 1,047    | 823                | 11,053    | 35,927  | 30.77%        |
| AU 25 | SSLE       | 8,563 | 7,719    | 3,782              | 119,347   | 310,180 | 38.48%        |
| SP 26 | SSLE       | 8,491 | 7,716    | 3,853              | 111,493   | 302,873 | 36.81%        |
| SU 26 | SSLE       | 1,310 | 1,145    | 881                | 12,052    | 41,313  | 29.17%        |

## Campus distribution

| Campus | Rows   | % rows | Sections | Unique instructors |
| ------ | ------ | ------ | -------- | ------------------ |
| COL    | 59,634 | 86.77% | 53,553   | 6,559              |
| NWK    | 3,451  | 5.02%  | 3,427    | 348                |
| MRN    | 1,618  | 2.35%  | 1,583    | 188                |
| MNS    | 1,495  | 2.18%  | 1,454    | 203                |
| LMA    | 1,460  | 2.12%  | 1,416    | 169                |
| WST    | 1,071  | 1.56%  | 1,051    | 87                 |

## Delivery mode distribution

| Medium            | Rows   | %      |
| ----------------- | ------ | ------ |
| In Person         | 48,081 | 69.96% |
| Distance Learning | 16,525 | 24.04% |
| Hybrid Delivery   | 3,599  | 5.24%  |
| Distance Enhanced | 524    | 0.76%  |

## Field completeness

| Field                               | Unique | NULL | Empty | N/A   | Max length |
| ----------------------------------- | ------ | ---- | ----- | ----- | ---------- |
| Last Name                           | 5,202  | 0    | 0     | 0     | 22         |
| First Name                          | 2,792  | 0    | 0     | 0     | 23         |
| SUBJECT                             | 248    | 0    | 0     | 0     | 7          |
| Catalog                             | 4,189  | 0    | 0     | 6     | 8          |
| Class                               | 8,110  | 0    | 0     | 0     | 100        |
| Class Number                        | 30,392 | 0    | 0     | 0     | 5          |
| Term                                | 13     | 0    | 0     | 0     | 5          |
| COLLEGE                             | 18     | 0    | 0     | 0     | 29         |
| DEPARTMENT                          | 125    | 0    | 0     | 0     | 30         |
| MEDIUM                              | 4      | 0    | 0     | 0     | 17         |
| CAMPUS                              | 6      | 0    | 0     | 0     | 3          |
| Class Size Category                 | 3      | 0    | 0     | 0     | 1          |
| N of Responses                      | 344    | 0    | 0     | 0     | 3          |
| Instructor's Average Overall Rating | 362    | 0    | 0     | 0     | 4          |
| Standard Deviation                  | 200    | 0    | 0     | 19377 | 4          |
| InvitedCount                        | 513    | 0    | 0     | 0     | 4          |
| ResponseRatio                       | 4,076  | 0    | 0     | 0     | 6          |
| Namen                               | 7,108  | 0    | 0     | 0     | 22         |

## Examples of instructor display-name drift

- `bellner.1` → Bruce W. Bellner; Bruce Bellner; Bruce W Bellner
- `farris.94` → Clair FARRIS; CLAIR FARRIS; Clair Farris
- `braun.43` → Catherine (Katie) Braun; Katie Braun; Catherine Braun
- `smith.17149` → Brianna Smith; BRIANNA Smith; Brianna SMITH
- `mckinley.217` → CATHERINE MCKINLEY; Catherine MCKINLEY; Catherine McKinley
- `allen.515` → Ted Allen; Theodore Allen
- `anderson.4389` → Chris Anderson; Christopher Anderson
- `awai-jennings.1` → Clint Awai-Jennings; Clinton Awai-Jennings

## Examples of title drift under the same course key

- `STAT 7410` → Linear Models / Theory of the Linear Models / Theory of the Linear Model
- `MECHENG 4906.01` → ME Capstone Design I: Product Design Capstone / ME Capstone Design II: Special Projects / ME Capstone Design I: Product Design
- `PHR 5410` → Communicating Vaccine Science / Vaccine Hesitancy: Towards Effective Communication / Understanding and Changing Vaccine Hesitancy Perspectives
- `PUBAFRS 2150` → Nonprofit Organizing for Diversity and Justice / The Nonprofit Sector and Civil Society / Introduction to Nonprofit Organizations
- `ACCTMIS 3100H` → Quantitative Analysis in Accounting / Honors Professional Research in Accounting / Honors Research in Accounting
- `NRSPRCT 8781` → Methods & Measurement for Evaluation of Evidence-based Nursing Practice / Methods and Measurement in Clinical Practice Scholarship
- `NRSPRCT 8610` → Health Informatics and Technology for the DNP / Informatics for Leadership in Health and Healthcare
- `NRSPRCT 8480` → Evidenced Based Quality Improvement for the DNP / Quality Improvement for the Doctor of Nursing Practice

## Schema v2 decisions driven by the full dataset

- PostgreSQL remains the recommended database.
- Keep a raw JSONB snapshot layer plus normalized current entities.
- `term + class_number` is enforced as the section unique key.
- `section + instructor` is enforced as the evaluation unique key.
- `Namen` is enforced as the instructor unique identity key.
- Instructor display names are tracked as term-level observations.
- SEI and SSLE are explicitly separated by `instrument` and `metric_kind`.
- Standard deviation is nullable without using NULL to infer instrument.
- Course identity is `(subject, catalog)` when catalog is known; unknown catalog rows use a title-qualified source key.
- Source-state tracking allows future overlapping historical Blue datasets and lets the database distinguish currently-present source records from captured historical records.
- Materialized summaries include only evaluations active in at least one source state, while raw runs preserve all prior snapshots.
