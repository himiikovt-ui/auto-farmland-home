const {
  CERTIFICATION_STATUSES,
  boundedNumber,
  nextCertificationAllowed,
  normalizePresetAutomation,
} = require("./policy.cjs");
const { buildProposals, queueDailyJobs, runQueuedJobs } = require("./jobRunner.cjs");

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function registerAutomationRoutes(app, deps) {
  const { readData, writeData, makeId, nowIso } = deps;

  app.get("/api/automation/status", (request, response) => {
    const data = readData();
    response.json({
      settings: data.automationSettings,
      jobs: (data.automationJobs || []).slice(0, 50),
      runs: (data.automationRuns || []).slice(0, 20),
      safety: {
        externalExecutionUnlocked: false,
        autoPublishUnlocked: false,
        autoDeactivateUnlocked: false,
        message: "Only shadow simulation is unlocked. External actions remain hard-locked.",
      },
    });
  });

  app.patch("/api/automation/settings", (request, response) => {
    const data = readData();
    const current = data.automationSettings;
    const requestedMode = request.body.executionMode ?? current.executionMode;
    if (requestedMode !== "shadow") {
      response.status(409).json({
        ok: false,
        error: "Draft and live automation remain locked while the shadow pipeline is being certified.",
      });
      return;
    }
    const timeZone = String(request.body.timeZone ?? current.timeZone).trim();
    if (!validTimeZone(timeZone)) {
      response.status(400).json({ ok: false, error: "Enter a valid IANA time zone." });
      return;
    }
    data.automationSettings = {
      ...current,
      enabled: request.body.enabled == null ? current.enabled : Boolean(request.body.enabled),
      schedulerEnabled: request.body.schedulerEnabled == null
        ? current.schedulerEnabled
        : Boolean(request.body.schedulerEnabled),
      executionMode: "shadow",
      timeZone,
      runHourLocal: Math.floor(boundedNumber(request.body.runHourLocal, current.runHourLocal, 0, 23)),
      dailyListingLimit: Math.floor(
        boundedNumber(request.body.dailyListingLimit, current.dailyListingLimit, 1, 25)
      ),
      dailyOpenAiBudgetUsd: boundedNumber(
        request.body.dailyOpenAiBudgetUsd,
        current.dailyOpenAiBudgetUsd,
        0,
        500
      ),
      maxRetries: Math.floor(boundedNumber(request.body.maxRetries, current.maxRetries, 0, 10)),
      autoDeactivateEnabled: false,
      decisionWindowDays: 60,
      updatedAt: nowIso(),
    };
    data.auditLog.unshift({
      id: makeId("audit"),
      action: "automation_settings_updated",
      actor: "operator",
      details: { ...data.automationSettings },
      createdAt: nowIso(),
    });
    writeData(data);
    response.json({ ok: true, message: "Shadow automation settings saved.", settings: data.automationSettings });
  });

  app.patch("/api/automation/presets/:id", (request, response) => {
    const data = readData();
    const preset = (data.productPresets || []).find((item) => item.id === request.params.id);
    if (!preset) {
      response.status(404).json({ ok: false, error: "Preset not found." });
      return;
    }
    const current = normalizePresetAutomation(preset.automationPolicy);
    const next = normalizePresetAutomation({
      ...current,
      enabled: request.body.enabled == null ? current.enabled : Boolean(request.body.enabled),
      dailyLimit: request.body.dailyLimit ?? current.dailyLimit,
      estimatedCostUsd: request.body.estimatedCostUsd ?? current.estimatedCostUsd,
      minQualityScore: request.body.minQualityScore ?? current.minQualityScore,
      maxRetries: request.body.maxRetries ?? current.maxRetries,
      canaryTarget: request.body.canaryTarget ?? current.canaryTarget,
    });
    if (next.enabled && !["canary", "autonomous"].includes(next.certificationStatus)) {
      response.status(409).json({
        ok: false,
        error: "Move this preset to Canary before enabling its daily automation.",
      });
      return;
    }
    preset.automationPolicy = next;
    preset.updatedAt = nowIso();
    writeData(data);
    response.json({ ok: true, message: "Preset automation policy saved.", preset });
  });

  app.post("/api/automation/presets/:id/certify", (request, response) => {
    const data = readData();
    const preset = (data.productPresets || []).find((item) => item.id === request.params.id);
    if (!preset) {
      response.status(404).json({ ok: false, error: "Preset not found." });
      return;
    }
    const policy = normalizePresetAutomation(preset.automationPolicy);
    const target = String(request.body.targetStatus || "");
    if (!CERTIFICATION_STATUSES.includes(target) || !nextCertificationAllowed(policy.certificationStatus, target)) {
      response.status(409).json({
        ok: false,
        error: `Cannot move directly from ${policy.certificationStatus} to ${target || "that status"}.`,
      });
      return;
    }
    if (["candidate", "canary", "autonomous"].includes(target)) {
      const crop = (data.crops || []).find((item) => item.etsyPresetId === preset.id);
      if (!preset.taxonomyId || !(preset.tags || []).length || !(preset.creativeStrategy?.creativeDirection || crop?.promptTemplate) || !(preset.creativeStrategy?.subjects || []).length) {
        response.status(409).json({
          ok: false,
          error: "Certification requires a taxonomy ID, reusable tags, a subject pool, and an assigned creative direction.",
        });
        return;
      }
    }
    if (target === "autonomous") {
      const completedCanaries = (data.automationJobs || []).filter(
        (job) => job.presetId === preset.id && job.status === "simulated"
      ).length;
      if (completedCanaries < policy.canaryTarget) {
        response.status(409).json({
          ok: false,
          error: `Complete ${policy.canaryTarget} shadow canary jobs first (${completedCanaries} complete).`,
        });
        return;
      }
      if (request.body.confirmation !== `CERTIFY ${preset.id}`) {
        response.status(409).json({
          ok: false,
          error: `Type CERTIFY ${preset.id} to approve Autonomous status.`,
        });
        return;
      }
    }
    const previousStatus = policy.certificationStatus;
    policy.certificationStatus = target;
    if (target === "paused" || ["experimental", "candidate"].includes(target)) policy.enabled = false;
    preset.automationPolicy = policy;
    preset.updatedAt = nowIso();
    data.auditLog.unshift({
      id: makeId("audit"),
      action: "preset_certification_changed",
      actor: "operator",
      details: { presetId: preset.id, from: previousStatus, to: target },
      createdAt: nowIso(),
    });
    writeData(data);
    response.json({ ok: true, message: `Preset moved to ${target}.`, preset });
  });

  app.post("/api/automation/preview", (request, response) => {
    const data = readData();
    response.json({
      ok: true,
      message: "Preview built. No jobs or external actions were created.",
      preview: buildProposals(data),
    });
  });

  app.post("/api/automation/run-now", (request, response) => {
    const data = readData();
    const queued = queueDailyJobs(data, { makeId, nowIso }, { actor: "operator" });
    if (!queued.ok) {
      response.status(409).json({ ok: false, error: queued.reason, preview: queued.preview });
      return;
    }
    const execution = runQueuedJobs(data, { makeId, nowIso }, { actor: "operator" });
    writeData(data);
    response.json({
      ok: true,
      message: execution.completed.length
        ? `${execution.completed.length} shadow job(s) simulated with zero external actions.`
        : "No new jobs were due; today's dedupe keys are already present.",
      queued: queued.queued,
      execution,
    });
  });
}

module.exports = { registerAutomationRoutes };
