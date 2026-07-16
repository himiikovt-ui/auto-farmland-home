const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCreativePrompt, selectSubject } = require("./creativeStrategy.cjs");

function preset(overrides = {}) {
  return {
    id: "preset-1",
    creativeStrategy: {
      subjects: ["cat", "dog", "bird"],
      cooldownRuns: 2,
      explorationPercent: 25,
      minViewsBeforeBias: 100,
      creativeDirection: "Soft paper-cut sticker art.",
      ...overrides,
    },
    referenceRoles: { "ref-style": "Style", "ref-texture": "Texture" },
  };
}

test("rotates away from recently used subjects", () => {
  const data = {
    automationJobs: [
      { presetId: "preset-1", subject: "cat", createdAt: "2026-07-16T02:00:00Z" },
      { presetId: "preset-1", subject: "dog", createdAt: "2026-07-16T01:00:00Z" },
    ],
  };
  assert.equal(selectSubject(data, preset(), { seed: "rotation" }).subject, "bird");
});

test("uses qualified performance winners outside exploration allocation", () => {
  const data = {
    automationJobs: [],
    listings: [
      { id: "cat-listing", presetId: "preset-1", subject: "cat" },
      { id: "dog-listing", presetId: "preset-1", subject: "dog" },
    ],
    listingMetricsDaily: [
      { listingId: "cat-listing", views: 1000, orders: 50, grossRevenue: 125 },
      { listingId: "dog-listing", views: 1000, orders: 5, grossRevenue: 12.5 },
    ],
  };
  const selected = selectSubject(data, preset({ explorationPercent: 0 }), { seed: "winner" });
  assert.equal(selected.subject, "cat");
  assert.equal(selected.reason, "Performance winner");
});

test("builds a subject-specific prompt with reference roles", () => {
  const prompt = buildCreativePrompt(preset(), { promptTemplate: "fallback" }, "bird", [
    { id: "ref-style", fileName: "mood.jpg" },
    { id: "ref-texture", fileName: "paper.png" },
  ]);
  assert.match(prompt, /subject is: bird/i);
  assert.match(prompt, /mood\.jpg for style guidance/i);
  assert.match(prompt, /paper\.png for texture guidance/i);
  assert.match(prompt, /different from prior runs/i);
});
