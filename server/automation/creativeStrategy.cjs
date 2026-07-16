function bounded(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function cleanSubjects(values) {
  const input = Array.isArray(values) ? values : String(values || "").split(",");
  return [...new Set(input.map((value) => String(value).trim().toLowerCase()).filter(Boolean))].slice(0, 100);
}

function normalizeCreativeStrategy(value = {}) {
  return {
    subjects: cleanSubjects(value.subjects),
    creativeDirection: String(value.creativeDirection || "").trim(),
    variationInstructions: String(value.variationInstructions || "Change the composition, poses, accessories, and supporting details on every run.").trim(),
    cooldownRuns: Math.floor(bounded(value.cooldownRuns, 7, 0, 50)),
    explorationPercent: Math.floor(bounded(value.explorationPercent, 25, 0, 100)),
    minViewsBeforeBias: Math.floor(bounded(value.minViewsBeforeBias, 100, 0, 1000000)),
    similarityThreshold: bounded(value.similarityThreshold, 0.82, 0.5, 0.99),
  };
}

function stableNumber(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function subjectStats(data, presetId) {
  const rows = new Map();
  const add = (subject, views = 0, orders = 0, revenue = 0) => {
    const key = String(subject || "").trim().toLowerCase();
    if (!key) return;
    const current = rows.get(key) || { subject: key, views: 0, orders: 0, revenue: 0 };
    current.views += Number(views || 0);
    current.orders += Number(orders || 0);
    current.revenue += Number(revenue || 0);
    rows.set(key, current);
  };

  const listings = [...(data.listings || []), ...(data.listingDrafts || [])];
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  for (const metric of data.listingMetricsDaily || []) {
    const listing = listingById.get(metric.listingId);
    if (listing?.presetId !== presetId) continue;
    add(listing.subject || listing.generationSubject, metric.views, metric.orders, metric.grossRevenue);
  }
  for (const snapshot of data.performanceSnapshots || []) {
    const listing = listingById.get(snapshot.listingId || snapshot.listingDraftId);
    if (listing && listing.presetId !== presetId) continue;
    add(snapshot.subject || listing?.subject || listing?.generationSubject, snapshot.views, snapshot.orders, snapshot.revenue);
  }
  return [...rows.values()].map((row) => ({
    ...row,
    conversionRate: row.views > 0 ? row.orders / row.views : 0,
  }));
}

function selectSubject(data, preset, options = {}) {
  const strategy = normalizeCreativeStrategy(preset.creativeStrategy);
  if (!strategy.subjects.length) return { subject: "", reason: "No subjects configured", stats: null };

  const history = (data.automationJobs || [])
    .filter((job) => job.presetId === preset.id && job.subject)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const cooling = new Set(history.slice(0, strategy.cooldownRuns).map((job) => String(job.subject).toLowerCase()));
  let candidates = strategy.subjects.filter((subject) => !cooling.has(subject));
  if (!candidates.length) candidates = [...strategy.subjects];

  const stats = subjectStats(data, preset.id);
  const statsBySubject = new Map(stats.map((row) => [row.subject, row]));
  const qualified = candidates
    .map((subject) => statsBySubject.get(subject))
    .filter((row) => row && row.views >= strategy.minViewsBeforeBias)
    .sort((a, b) => (b.conversionRate - a.conversionRate) || (b.orders - a.orders) || (b.revenue - a.revenue));
  const roll = stableNumber(options.seed || new Date().toISOString()) % 100;
  if (qualified.length && roll >= strategy.explorationPercent) {
    return { subject: qualified[0].subject, reason: "Performance winner", stats: qualified[0] };
  }

  const usage = new Map(strategy.subjects.map((subject) => [subject, 0]));
  history.forEach((job) => usage.set(String(job.subject).toLowerCase(), (usage.get(String(job.subject).toLowerCase()) || 0) + 1));
  const leastUsed = Math.min(...candidates.map((subject) => usage.get(subject) || 0));
  const fresh = candidates.filter((subject) => (usage.get(subject) || 0) === leastUsed);
  const subject = fresh[stableNumber(`${options.seed || ""}:explore`) % fresh.length];
  return { subject, reason: qualified.length ? "Exploration allocation" : "Balanced rotation", stats: statsBySubject.get(subject) || null };
}

function buildCreativePrompt(preset, crop, subject, referenceAssets = []) {
  const strategy = normalizeCreativeStrategy(preset.creativeStrategy);
  const roleLines = referenceAssets.map((asset) => {
    const role = (preset.referenceRoles || {})[asset.id] || "Style";
    return `Use ${asset.fileName || asset.id} for ${String(role).toLowerCase()} guidance only.`;
  });
  return [
    strategy.creativeDirection || crop?.promptTemplate || "Create an original, commercially usable design.",
    subject ? `This run's subject is: ${subject}.` : "",
    strategy.variationInstructions,
    "Create an original composition that is visibly different from prior runs; do not copy specific characters or layouts from references.",
    ...roleLines,
  ].filter(Boolean).join("\n\n");
}

module.exports = {
  cleanSubjects,
  normalizeCreativeStrategy,
  subjectStats,
  selectSubject,
  buildCreativePrompt,
};
