const { isPresetEligible, normalizePresetAutomation } = require("./policy.cjs");
const { buildCreativePrompt, normalizeCreativeStrategy, selectSubject } = require("./creativeStrategy.cjs");

function dateKeyInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function hourInZone(date, timeZone) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return Number(value);
}

function findCropForPreset(data, preset) {
  return (data.crops || []).find((crop) => crop.etsyPresetId === preset.id)
    || (data.crops || []).find((crop) =>
      (preset.supportedProductTypes || []).includes(crop.productType)
    )
    || null;
}

function subjectTitle(preset, subject, fallback) {
  const pattern = String(preset.titlePattern || "").trim();
  if (!pattern) return fallback;
  const displaySubject = String(subject || "Design").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return pattern.replaceAll("{subject}", displaySubject);
}

function buildProposals(data, options = {}) {
  const settings = data.automationSettings || {};
  const now = options.now ? new Date(options.now) : new Date();
  const timeZone = settings.timeZone || "America/Los_Angeles";
  const dateKey = dateKeyInZone(now, timeZone);
  const existingKeys = new Set((data.automationJobs || []).map((job) => job.dedupeKey));
  const blockers = [];
  const proposals = [];
  let remainingGlobal = Math.max(0, Number(settings.dailyListingLimit || 0));
  let remainingBudget = Math.max(0, Number(settings.dailyOpenAiBudgetUsd || 0));

  const eligiblePresets = (data.productPresets || []).filter(isPresetEligible);
  if (!eligiblePresets.length) {
    blockers.push("No Etsy digital preset is both enabled and certified for Canary or Autonomous use.");
  }

  for (const preset of eligiblePresets) {
    if (remainingGlobal <= 0) break;
    const policy = normalizePresetAutomation(preset.automationPolicy);
    const crop = findCropForPreset(data, preset);
    if (!crop) {
      blockers.push(`${preset.name}: no matching crop is assigned.`);
      continue;
    }
    const count = Math.min(policy.dailyLimit, remainingGlobal);
    for (let index = 1; index <= count; index += 1) {
      const dedupeKey = `${dateKey}:${preset.id}:${index}`;
      if (existingKeys.has(dedupeKey)) continue;
      if (policy.estimatedCostUsd > remainingBudget) {
        blockers.push(`${preset.name}: estimated OpenAI cost would exceed today's budget.`);
        break;
      }
      const strategy = normalizeCreativeStrategy(preset.creativeStrategy);
      const selection = selectSubject(data, preset, { seed: dedupeKey });
      const cropReferences = (data.assets || []).filter((asset) => asset.cropId === crop.id && asset.isReference);
      const selectedIds = Object.keys(preset.referenceRoles || {});
      const references = selectedIds.length ? cropReferences.filter((asset) => selectedIds.includes(asset.id)) : cropReferences;
      proposals.push({
        dateKey,
        dedupeKey,
        presetId: preset.id,
        presetName: preset.name,
        presetVersion: policy.version,
        certificationStatus: policy.certificationStatus,
        cropId: crop.id,
        cropName: crop.name,
        executionMode: settings.executionMode || "shadow",
        estimatedCostUsd: policy.estimatedCostUsd,
        taxonomyId: preset.taxonomyId || "",
        price: Number(preset.price || 0),
        subject: selection.subject,
        subjectSelectionReason: selection.reason,
        performanceEvidence: selection.stats,
        imagePrompt: buildCreativePrompt(preset, crop, selection.subject, references),
        referenceAssetIds: references.map((asset) => asset.id),
        referenceRoles: { ...(preset.referenceRoles || {}) },
        similarityThreshold: strategy.similarityThreshold,
        title: subjectTitle(preset, selection.subject, preset.defaultTitleTemplate || crop.name),
      });
      remainingGlobal -= 1;
      remainingBudget -= policy.estimatedCostUsd;
      if (remainingGlobal <= 0) break;
    }
  }

  return {
    dateKey,
    timeZone,
    proposals,
    blockers,
    estimatedCostUsd: Number(proposals.reduce((sum, item) => sum + item.estimatedCostUsd, 0).toFixed(2)),
    remainingBudgetUsd: Number(remainingBudget.toFixed(2)),
  };
}

function queueDailyJobs(data, deps, options = {}) {
  const settings = data.automationSettings || {};
  if (!settings.enabled) {
    return { ok: false, reason: "Global automation is off.", queued: [], preview: buildProposals(data, options) };
  }
  if (settings.executionMode !== "shadow") {
    return {
      ok: false,
      reason: "Draft and live execution remain locked. Switch back to Shadow mode.",
      queued: [],
      preview: buildProposals(data, options),
    };
  }

  const preview = buildProposals(data, options);
  const queued = preview.proposals.map((proposal) => ({
    id: deps.makeId("automation-job"),
    type: "etsy_listing_cycle",
    status: "queued",
    attempts: 0,
    maxRetries: Number(settings.maxRetries || 2),
    ...proposal,
    createdAt: deps.nowIso(),
    updatedAt: deps.nowIso(),
  }));
  data.automationJobs.unshift(...queued);
  if (queued.length) {
    data.auditLog.unshift({
      id: deps.makeId("audit"),
      action: "automation_jobs_queued",
      actor: options.actor || "operator",
      details: { dateKey: preview.dateKey, jobIds: queued.map((job) => job.id) },
      createdAt: deps.nowIso(),
    });
  }
  return { ok: true, queued, preview };
}

function simulateJob(data, job, deps) {
  const preset = (data.productPresets || []).find((item) => item.id === job.presetId);
  const crop = (data.crops || []).find((item) => item.id === job.cropId);
  if (!preset || !crop) throw new Error("The job's preset or crop no longer exists.");
  if (!isPresetEligible(preset)) throw new Error("The preset is no longer eligible for automation.");

  const listing = (data.listingDrafts || []).find((item) => item.cropId === crop.id);
  job.status = "simulated";
  job.attempts += 1;
  job.startedAt = deps.nowIso();
  job.completedAt = deps.nowIso();
  job.updatedAt = deps.nowIso();
  job.result = {
    externalActions: 0,
    title: job.title || subjectTitle(preset, job.subject, listing?.title || preset.defaultTitleTemplate || crop.name),
    taxonomyId: preset.taxonomyId || listing?.taxonomyId || "",
    tags: [...(preset.tags || [])].slice(0, 13),
    price: Number(preset.price || listing?.price || 0),
    subject: job.subject || "",
    subjectSelectionReason: job.subjectSelectionReason || "",
    performanceEvidence: job.performanceEvidence || null,
    imagePrompt: job.imagePrompt || crop.promptTemplate || "",
    referenceAssetIds: [...(job.referenceAssetIds || [])],
    referenceRoles: { ...(job.referenceRoles || {}) },
    similarityThreshold: job.similarityThreshold,
    note: "Shadow simulation only. No image generation, Etsy draft, upload, or activation occurred.",
  };
  return job;
}

function runQueuedJobs(data, deps, options = {}) {
  const jobs = (data.automationJobs || []).filter((job) => job.status === "queued");
  const completed = [];
  const failed = [];
  for (const job of jobs) {
    try {
      if (job.executionMode !== "shadow") {
        throw new Error("Only shadow jobs are unlocked.");
      }
      completed.push(simulateJob(data, job, deps));
    } catch (error) {
      job.attempts = Number(job.attempts || 0) + 1;
      job.status = job.attempts > Number(job.maxRetries || 0) ? "failed" : "blocked";
      job.error = error.message;
      job.updatedAt = deps.nowIso();
      failed.push(job);
    }
  }
  if (completed.length || failed.length) {
    const run = {
      id: deps.makeId("automation-run"),
      mode: "shadow",
      actor: options.actor || "operator",
      completedJobIds: completed.map((job) => job.id),
      failedJobIds: failed.map((job) => job.id),
      externalActions: 0,
      createdAt: deps.nowIso(),
    };
    data.automationRuns.unshift(run);
    data.auditLog.unshift({
      id: deps.makeId("audit"),
      action: "automation_shadow_run",
      actor: run.actor,
      details: { runId: run.id, completed: completed.length, failed: failed.length, externalActions: 0 },
      createdAt: deps.nowIso(),
    });
    return { run, completed, failed };
  }
  return { run: null, completed, failed };
}

function schedulerDue(data, now = new Date()) {
  const settings = data.automationSettings || {};
  if (!settings.enabled || !settings.schedulerEnabled || settings.executionMode !== "shadow") return false;
  return hourInZone(now, settings.timeZone || "America/Los_Angeles") >= Number(settings.runHourLocal || 0);
}

module.exports = {
  dateKeyInZone,
  hourInZone,
  buildProposals,
  queueDailyJobs,
  runQueuedJobs,
  schedulerDue,
};
