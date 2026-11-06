import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateMetric,
  buildMetrics,
  nameDotNumberFromEmail,
  evaluationRowsForEmail,
  buildInstructorSummaries,
} from "../../src/lib/evaluations/scoring.ts";

// Fixed dates make the coverage and decay expectations independent of test day.
const NOW = new Date("2026-11-03T12:00:00Z");

function observation({
  instrument = "SSLE",
  term = "SP 26",
  sortKey = 20261,
  responses = 100,
  mean = 4.5,
  invited = responses * 2,
  records = 1,
  identity = "example.1",
} = {}) {
  return {
    subject: "EXAMPLE",
    catalog: "1000",
    name_dot_number: identity,
    first_name: "Example",
    last_name: "Instructor",
    instrument,
    term,
    term_sort_key: sortKey,
    responses,
    invited,
    weighted_rating_total: mean * responses,
    records,
  };
}

function recentTerms(mean, responsesPerTerm = 100) {
  return [
    observation({ mean, responses: responsesPerTerm }),
    observation({
      term: "SU 26",
      sortKey: 20262,
      mean,
      responses: responsesPerTerm,
    }),
  ];
}

describe("evaluation aggregation", () => {
  it("includes historical teachers when future sections have no assigned instructors", () => {
    const summaries = buildInstructorSummaries({ instructors: [] }, [
      observation(),
    ]);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].nameDotNumber, "example.1");
    assert.equal(summaries[0].currentlyListed, false);
    assert.equal(summaries[0].primary.score, 4.5);
  });

  it("deduplicates official email variants and distinguishes missing history from identity", () => {
    const summaries = buildInstructorSummaries(
      {
        instructors: [
          { name: "Current Name", email: "EXAMPLE.1@buckeyemail.osu.edu" },
          { name: "Current Name", email: "example.1@osu.edu" },
          { name: "Another Teacher", email: "another.2@osu.edu" },
        ],
      },
      [observation()],
    );
    assert.equal(summaries.length, 2);
    assert.equal(summaries[0].currentlyListed, true);
    assert.equal(summaries[0].name, "Current Name");
    assert.equal(summaries[1].match, "exact-email");
    assert.equal(summaries[1].primary, null);
  });

  it("keeps SEI and SSLE evidence separate and prefers the latest instrument", () => {
    const metrics = buildMetrics(
      [
        observation({
          instrument: "SEI",
          term: "SU 25",
          sortKey: 20252,
          responses: 900,
          mean: 1,
        }),
        observation({ responses: 30, mean: 5 }),
      ],
      NOW,
    );

    assert.deepEqual(
      metrics.map(({ instrument, score, responseCount }) => ({
        instrument,
        score,
        responseCount,
      })),
      [
        { instrument: "SSLE", score: 5, responseCount: 30 },
        { instrument: "SEI", score: 1, responseCount: 900 },
      ],
    );
    assert.equal(metrics[0].trend.length, 1);
    assert.equal(metrics[1].trend.length, 1);
  });

  it("returns no score for empty evidence, another instrument, or zero responses", () => {
    assert.deepEqual(buildMetrics([], NOW), []);
    assert.equal(aggregateMetric([], "SSLE", NOW), null);
    assert.equal(
      aggregateMetric([observation({ instrument: "SEI" })], "SSLE", NOW),
      null,
    );
    assert.deepEqual(
      buildMetrics([observation({ responses: 0, invited: 30 })], NOW),
      [],
    );
  });

  it("weights by responses rather than averaging section averages", () => {
    const metric = aggregateMetric(
      [
        observation({ responses: 10, mean: 5, invited: 10 }),
        observation({ responses: 90, mean: 1, invited: 190 }),
      ],
      "SSLE",
      NOW,
    );

    // Ten 5-point responses plus ninety 1-point responses yield 1.4, not 3.
    assert.equal(metric.score, 1.4);
    assert.equal(metric.unadjustedScore, 1.4);
    assert.equal(metric.trend[0].score, 1.4);
    assert.equal(metric.responseCount, 100);
    assert.equal(metric.invitedCount, 200);
    assert.equal(metric.responseRate, 50); // Percentage, not a fraction.
    assert.equal(metric.sectionCount, 2);
    assert.equal(metric.termCount, 1);
  });

  it("gives observations two years apart a 1:2 recency weight", () => {
    const metric = aggregateMetric(
      [
        observation({ term: "SU 26", sortKey: 20262, mean: 1 }),
        observation({ term: "SU 28", sortKey: 20282, mean: 5 }),
      ],
      "SSLE",
      new Date("2028-11-03T12:00:00Z"),
    );

    // Equal response counts: the newer 5 contributes twice the older 1.
    assert.equal(metric.score, 3.67);
    assert.equal(metric.unadjustedScore, 3);
    // Per-term chart values keep their observed means, without extra decay.
    assert.deepEqual(
      metric.trend.map((point) => point.score),
      [1, 5],
    );
  });

  it("sorts term observations chronologically without changing sample totals", () => {
    const metric = aggregateMetric(
      [
        observation({ term: "SU 26", sortKey: 20262, responses: 30 }),
        observation({ term: "AU 25", sortKey: 20253, responses: 20 }),
        observation({ responses: 10 }),
      ],
      "SSLE",
      NOW,
    );
    assert.deepEqual(
      metric.trend.map((point) => point.term),
      ["AU 25", "SP 26", "SU 26"],
    );
    assert.equal(metric.firstTerm, "AU 25");
    assert.equal(metric.lastTerm, "SU 26");
    assert.equal(metric.responseCount, 60);
  });
});

describe("evidence coverage and recommendation signals", () => {
  it("suppresses a positive signal when the raw sample is too small", () => {
    const metric = aggregateMetric(recentTerms(5, 14), "SSLE", NOW);
    assert.equal(metric.score, 5);
    assert.equal(metric.responseCount, 28);
    assert.equal(metric.confidence, "limited");
    assert.equal(metric.recommendation, "insufficient");
  });

  it("requires 30 time-decayed responses even when raw responses reach 30", () => {
    const metric = aggregateMetric(recentTerms(5, 15), "SSLE", NOW);
    assert.equal(metric.responseCount, 30);
    assert.ok(metric.weightedResponseCount < 30);
    assert.equal(metric.recommendation, "insufficient");
  });

  it("requires multiple terms even with many responses and evaluation records", () => {
    const metric = aggregateMetric(
      [observation({ responses: 500, mean: 5, records: 10 })],
      "SSLE",
      NOW,
    );
    assert.equal(metric.termCount, 1);
    assert.equal(metric.recommendation, "insufficient");
    assert.equal(metric.confidence, "limited");
  });

  it("does not recommend from old evidence despite a large, favorable sample", () => {
    const metric = aggregateMetric(
      [
        observation({
          instrument: "SEI",
          term: "SP 23",
          sortKey: 20231,
          responses: 500,
          mean: 5,
        }),
        observation({
          instrument: "SEI",
          term: "SU 23",
          sortKey: 20232,
          responses: 500,
          mean: 5,
        }),
      ],
      "SEI",
      NOW,
    );
    assert.equal(metric.score, 5);
    assert.ok(metric.weightedResponseCount > 30);
    assert.equal(metric.recommendation, "insufficient");
    assert.equal(metric.confidence, "limited");
  });

  it("distinguishes moderate coverage from high coverage at 100 responses and three records", () => {
    const moderate = aggregateMetric(
      [
        observation({ responses: 49, records: 2 }),
        observation({ term: "SU 26", sortKey: 20262, responses: 50 }),
      ],
      "SSLE",
      NOW,
    );
    const high = aggregateMetric(
      [
        observation({ responses: 50, records: 2 }),
        observation({ term: "SU 26", sortKey: 20262, responses: 50 }),
      ],
      "SSLE",
      NOW,
    );
    assert.equal(moderate.responseCount, 99);
    assert.equal(moderate.confidence, "moderate");
    assert.equal(high.responseCount, 100);
    assert.equal(high.confidence, "high");
  });

  for (const [score, signal] of [
    [4.2, "positive"],
    [4.199, "mixed"],
    [3.301, "mixed"],
    [3.3, "caution"],
  ]) {
    it(`classifies the unrounded ${score} score as ${signal}`, () => {
      const metric = aggregateMetric(recentTerms(score), "SSLE", NOW);
      assert.equal(metric.recommendation, signal);
      // Scores just inside the interval round onto a threshold but stay mixed.
      if (score === 4.199) assert.equal(metric.score, 4.2);
      if (score === 3.301) assert.equal(metric.score, 3.3);
    });
  }
});

describe("faculty identity", () => {
  it("matches exact OSU email identities and normalizes case and whitespace", () => {
    assert.equal(nameDotNumberFromEmail(" Smith.123@OSU.edu "), "smith.123");
    assert.equal(
      nameDotNumberFromEmail("smith.123@buckeyemail.osu.edu"),
      "smith.123",
    );
  });

  it("does not match display names, unnumbered names, or lookalike domains", () => {
    for (const value of [
      null,
      undefined,
      "Jane Smith",
      "smith@osu.edu",
      "smith.123@example.com",
      "smith.123@osu.edu.example.com",
    ]) {
      assert.equal(nameDotNumberFromEmail(value), null);
    }
  });

  it("keeps exact identity separate from the presence of course history", () => {
    const rows = [{ name_dot_number: "smith.123", rating: 4 }];
    assert.deepEqual(evaluationRowsForEmail("smith.123@osu.edu", []), {
      nameDotNumber: "smith.123",
      match: "exact-email",
      rows: [],
    });
    assert.deepEqual(evaluationRowsForEmail("smith.123@osu.edu", rows), {
      nameDotNumber: "smith.123",
      match: "exact-email",
      rows,
    });
    assert.deepEqual(evaluationRowsForEmail("Jane Smith", rows), {
      nameDotNumber: null,
      match: "unmatched",
      rows: [],
    });
  });
});
