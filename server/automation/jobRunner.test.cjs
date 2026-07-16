const assert = require("node:assert/strict");
const test = require("node:test");
const { ensureAutomationData } = require("./policy.cjs");
const { buildProposals, queueDailyJobs, runQueuedJobs } = require("./jobRunner.cjs");

const nowIso = () => "2026-07-15T16:00:00.000Z";
let sequence = 0;
const makeId = (prefix) => `${prefix}-${++sequence}`;

function fixture() {
  const data = {
    productPresets: [{
      id: "preset-journal",
      name: "Journal",
      platform: "etsy",
      listingType: "download",
      productType: "printable",
      supportedProductTypes: ["printable"],
      taxonomyId: "12475",
      tags: ["journal printable"],
      price: 2,
      automationPolicy: {
        enabled: true,
        certificationStatus: "canary",
        dailyLimit: 1,
        estimatedCostUsd: 0.2,
      },
    }],
    crops: [{
      id: "crop-journal",
      name: "Pastoral Journal",
      productType: "printable",
      etsyPresetId: "preset-journal",
      promptTemplate: "A pastoral journal page",
    }],
    listingDrafts: [{ id: "listing-journal", cropId: "crop-journal", title: "Pastoral Journal Page" }],
  };
  ensureAutomationData(data, nowIso);
  data.automationSettings.enabled = true;
  data.automationSettings.dailyListingLimit = 1;
  data.automationSettings.dailyOpenAiBudgetUsd = 5;
  return data;
}

test("builds one budgeted daily proposal for an eligible canary", () => {
  const preview = buildProposals(fixture(), { now: "2026-07-15T18:00:00.000Z" });
  assert.equal(preview.proposals.length, 1);
  assert.equal(preview.proposals[0].presetId, "preset-journal");
  assert.equal(preview.proposals[0].taxonomyId, "12475");
  assert.equal(preview.estimatedCostUsd, 0.2);
});

test("queues idempotently and simulates with zero external actions", () => {
  const data = fixture();
  const deps = { makeId, nowIso };
  const first = queueDailyJobs(data, deps, { now: "2026-07-15T18:00:00.000Z" });
  const second = queueDailyJobs(data, deps, { now: "2026-07-15T18:00:00.000Z" });
  assert.equal(first.queued.length, 1);
  assert.equal(second.queued.length, 0);

  const execution = runQueuedJobs(data, deps);
  assert.equal(execution.completed.length, 1);
  assert.equal(execution.completed[0].status, "simulated");
  assert.equal(execution.completed[0].result.externalActions, 0);
  assert.equal(execution.completed[0].result.taxonomyId, "12475");
});

test("global off and budget limits stop queue creation", () => {
  const data = fixture();
  data.automationSettings.enabled = false;
  const disabled = queueDailyJobs(data, { makeId, nowIso });
  assert.equal(disabled.ok, false);
  assert.match(disabled.reason, /off/i);

  data.automationSettings.enabled = true;
  data.automationSettings.dailyOpenAiBudgetUsd = 0.1;
  const preview = buildProposals(data);
  assert.equal(preview.proposals.length, 0);
  assert.match(preview.blockers.join(" "), /budget/i);
});
