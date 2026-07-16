const CERTIFICATION_STATUSES = [
  "experimental",
  "candidate",
  "canary",
  "autonomous",
  "paused",
];

const EXECUTION_MODES = ["shadow", "draft", "live"];

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function defaultAutomationSettings(nowIso) {
  return {
    enabled: false,
    schedulerEnabled: false,
    executionMode: "shadow",
    timeZone: "America/Los_Angeles",
    runHourLocal: 9,
    dailyListingLimit: 1,
    dailyOpenAiBudgetUsd: 5,
    maxRetries: 2,
    autoDeactivateEnabled: false,
    decisionWindowDays: 60,
    updatedAt: nowIso(),
  };
}

function defaultPresetAutomation() {
  return {
    enabled: false,
    certificationStatus: "experimental",
    version: 1,
    dailyLimit: 1,
    estimatedCostUsd: 0.2,
    minQualityScore: 85,
    maxRetries: 2,
    canaryTarget: 3,
    autoPublish: false,
  };
}

function normalizePresetAutomation(value = {}) {
  const defaults = defaultPresetAutomation();
  const status = CERTIFICATION_STATUSES.includes(value.certificationStatus)
    ? value.certificationStatus
    : defaults.certificationStatus;
  return {
    ...defaults,
    ...value,
    enabled: Boolean(value.enabled),
    certificationStatus: status,
    version: Math.floor(boundedNumber(value.version, 1, 1, 100000)),
    dailyLimit: Math.floor(boundedNumber(value.dailyLimit, 1, 1, 25)),
    estimatedCostUsd: boundedNumber(value.estimatedCostUsd, 0.2, 0, 100),
    minQualityScore: Math.floor(boundedNumber(value.minQualityScore, 85, 0, 100)),
    maxRetries: Math.floor(boundedNumber(value.maxRetries, 2, 0, 10)),
    canaryTarget: Math.floor(boundedNumber(value.canaryTarget, 3, 1, 25)),
    autoPublish: false,
  };
}

function ensureAutomationData(data, nowIso) {
  data.automationSettings = {
    ...defaultAutomationSettings(nowIso),
    ...(data.automationSettings || {}),
  };
  if (!EXECUTION_MODES.includes(data.automationSettings.executionMode)) {
    data.automationSettings.executionMode = "shadow";
  }
  data.automationSettings.enabled = Boolean(data.automationSettings.enabled);
  data.automationSettings.schedulerEnabled = Boolean(data.automationSettings.schedulerEnabled);
  data.automationSettings.autoDeactivateEnabled = false;
  data.automationJobs ||= [];
  data.automationRuns ||= [];
  data.auditLog ||= [];

  for (const preset of data.productPresets || []) {
    preset.automationPolicy = normalizePresetAutomation(preset.automationPolicy);
  }
  return data;
}

function isPresetEligible(preset) {
  const policy = normalizePresetAutomation(preset?.automationPolicy);
  return Boolean(
    preset
      && preset.platform === "etsy"
      && preset.listingType === "download"
      && policy.enabled
      && ["canary", "autonomous"].includes(policy.certificationStatus)
  );
}

function nextCertificationAllowed(current, target) {
  if (!CERTIFICATION_STATUSES.includes(target)) return false;
  if (target === "paused") return true;
  if (current === "paused") return ["experimental", "candidate", "canary", "autonomous"].includes(target);
  const rank = { experimental: 0, candidate: 1, canary: 2, autonomous: 3 };
  return rank[target] != null && rank[current] != null && Math.abs(rank[target] - rank[current]) <= 1;
}

module.exports = {
  CERTIFICATION_STATUSES,
  EXECUTION_MODES,
  boundedNumber,
  defaultAutomationSettings,
  defaultPresetAutomation,
  normalizePresetAutomation,
  ensureAutomationData,
  isPresetEligible,
  nextCertificationAllowed,
};
