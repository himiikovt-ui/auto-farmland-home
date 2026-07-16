const {
  DECISION,
  LISTING_STATUS,
  LIVE_LISTING_STATUSES,
  normalizeDesignStatus,
  isReferenceAsset,
  CONNECTION_STATUS,
} = require("../engine/status.cjs");

// 60-Day Keep / Kill / Remix engine + the dashboard "Needs You" aggregator.
// Nothing here deletes anything. It only recommends.

function daysBetween(fromIso, toDate = new Date()) {
  const from = new Date(fromIso || Date.now()).getTime();
  return Math.floor((toDate.getTime() - from) / (1000 * 60 * 60 * 24));
}

// Sum metric rows for a listing.
function rollupMetrics(listing, metricsDaily) {
  return (metricsDaily || [])
    .filter((row) => row.listingId === listing.id)
    .reduce(
      (acc, row) => ({
        impressions: acc.impressions + Number(row.impressions || 0),
        views: acc.views + Number(row.views || 0),
        clicks: acc.clicks + Number(row.clicks || 0),
        favorites: acc.favorites + Number(row.favoritesOrWatchers || 0),
        orders: acc.orders + Number(row.orders || 0),
        grossRevenue: acc.grossRevenue + Number(row.grossRevenue || 0),
        netProfit: acc.netProfit + Number(row.netProfit || 0),
      }),
      { impressions: 0, views: 0, clicks: 0, favorites: 0, orders: 0, grossRevenue: 0, netProfit: 0 }
    );
}

// Core rule engine. Returns { recommendation, reason, daysLive, totals }.
function evaluateListing(listing, metricsDaily) {
  const totals = rollupMetrics(listing, metricsDaily);
  const daysLive = daysBetween(listing.publishedAt || listing.createdAt);
  const weakTraffic = totals.impressions < 200 && totals.views < 50;

  let recommendation = DECISION.KEEP;
  let reason = "Still gathering signal.";

  if (daysLive >= 60 && totals.orders === 0 && weakTraffic) {
    recommendation = DECISION.KILL;
    reason = "60+ days live with no orders and weak traffic. Recommend kill/archive.";
  } else if (daysLive >= 60 && totals.orders === 0 && !weakTraffic) {
    recommendation = DECISION.REVISE_TITLE;
    reason = "Traffic is okay but nothing converts. Try revising title / price / mockup.";
  } else if (totals.orders > 0 && totals.netProfit > 0) {
    recommendation = DECISION.REMIX;
    reason = "Orders and positive profit. Keep and remix variants to scale.";
  } else if (totals.orders > 0) {
    recommendation = DECISION.REVISE_PRICE;
    reason = "Selling but not profitable yet. Revise price / cost assumptions.";
  }

  return {
    listingId: listing.id,
    recommendation,
    reason,
    daysLive,
    dueForReview: daysLive >= 60,
    totals,
  };
}

// Listings whose kill_review_date has passed (or 60+ days live) and are live.
function listingsDueForReview(data) {
  return (data.listings || [])
    .filter((listing) => LIVE_LISTING_STATUSES.includes(listing.status))
    .map((listing) => evaluateListing(listing, data.listingMetricsDaily))
    .filter((result) => result.dueForReview);
}

// The dashboard "Needs You" — only human-actionable exceptions, grouped.
function getNeedsYou(data, adapterRegistry) {
  const assets = (data.assets || []).filter((asset) => !isReferenceAsset(asset));
  const listings = data.listings || [];
  const orders = data.orders || [];

  const designsAwaitingReview = assets.filter(
    (asset) => ["generated", "review"].includes(normalizeDesignStatus(asset.status))
  );
  const remixRequested = assets.filter(
    (asset) => normalizeDesignStatus(asset.status) === "remix_requested"
  );
  const readyToPublish = listings.filter((l) => l.status === LISTING_STATUS.READY_TO_PUBLISH);
  const failedPublishes = listings.filter((l) => l.status === LISTING_STATUS.PUBLISH_FAILED);
  const listingsNeedingAttention = listings.filter((l) => l.status === LISTING_STATUS.NEEDS_ATTENTION);
  const ordersNeedingAttention = orders.filter((o) => o.needsAttentionReason || o.status === "needs_attention");
  const fulfillmentFailures = orders.filter((o) => o.status === "fulfillment_failed");
  const dueForReview = listingsDueForReview(data);

  // Disconnected accounts (honest connection state).
  const disconnectedMarketplaces = (data.marketplaceAccounts || []).filter(
    (a) => a.status !== CONNECTION_STATUS.CONNECTED
  );
  const disconnectedPod = (data.podAccounts || []).filter(
    (a) => a.status !== CONNECTION_STATUS.CONNECTED
  );

  const categories = [
    { key: "designs_awaiting_review", label: "Designs awaiting review", count: designsAwaitingReview.length, ids: designsAwaitingReview.map((a) => a.id) },
    { key: "remix_requested", label: "Remix requests to act on", count: remixRequested.length, ids: remixRequested.map((a) => a.id) },
    { key: "listings_ready_to_publish", label: "Listings ready to publish", count: readyToPublish.length, ids: readyToPublish.map((l) => l.id) },
    { key: "publish_failed", label: "Failed publishing attempts", count: failedPublishes.length, ids: failedPublishes.map((l) => l.id) },
    { key: "listings_need_attention", label: "Listings needing attention", count: listingsNeedingAttention.length, ids: listingsNeedingAttention.map((l) => l.id) },
    { key: "orders_need_attention", label: "Orders needing attention", count: ordersNeedingAttention.length, ids: ordersNeedingAttention.map((o) => o.id) },
    { key: "fulfillment_failures", label: "Fulfillment failures", count: fulfillmentFailures.length, ids: fulfillmentFailures.map((o) => o.id) },
    { key: "due_for_60_day_review", label: "Listings due for 60-day review", count: dueForReview.length, ids: dueForReview.map((r) => r.listingId) },
    { key: "disconnected_marketplaces", label: "Disconnected marketplace accounts", count: disconnectedMarketplaces.length, ids: disconnectedMarketplaces.map((a) => a.id) },
    { key: "disconnected_pod", label: "Disconnected POD accounts", count: disconnectedPod.length, ids: disconnectedPod.map((a) => a.id) },
  ];

  return {
    total: categories.reduce((sum, category) => sum + category.count, 0),
    categories: categories.filter((category) => category.count > 0),
    allCategories: categories,
  };
}

// --- Multi-land dashboard sections ------------------------------------------
// The dashboard is organized by what a HUMAN should do next, across all lands:
//   needsReview          — approve/judge something
//   readyToPublish       — push something out (or run its manual checklist)
//   needsAttention       — a real blocker or missing setup
//   growthOpportunities  — repurposing/scaling candidates, never urgent
function getEngineSections(data) {
  const now = new Date();
  const assets = (data.assets || []).filter((asset) => !isReferenceAsset(asset));
  const blogPosts = data.blogPosts || [];
  const activeBlogPosts = blogPosts.filter((post) => post.status !== "archived");
  const podPlans = data.podProductPlans || [];
  const activePodPlans = podPlans.filter((plan) => plan.status !== "archived");
  const listings = data.listings || [];
  const orders = data.orders || [];
  const channels = data.channels || [];

  // Needs Review
  const designsAwaitingReview = assets.filter((asset) =>
    ["generated", "review"].includes(normalizeDesignStatus(asset.status))
  );
  const blogNeedsReview = blogPosts.filter((post) => post.status === "needs_review");
  const podPlansMissingInfo = activePodPlans.filter(
    (plan) => !plan.title || !(Number(plan.price) > 0) || !plan.description
  );

  // Ready to Publish
  const blogReadyToPublish = blogPosts.filter((post) =>
    ["approved", "ready_to_publish"].includes(post.status)
  );
  const podReadyForPrintful = podPlans.filter((plan) => plan.status === "ready_for_printful");
  const listingsReadyToPublish = listings.filter(
    (listing) => listing.status === LISTING_STATUS.READY_TO_PUBLISH
  );

  // Needs Attention
  const blockedChannels = channels.filter((channel) =>
    ["developer_account_blocked", "approval_pending", "setup_needed"].includes(channel.status)
  );
  const blogNeedsUpdate = blogPosts.filter(
    (post) =>
      post.status === "needs_update" ||
      (post.status === "published" && post.nextUpdateDate && new Date(post.nextUpdateDate) <= now)
  );
  const blogMissingSeo = activeBlogPosts.filter(
    (post) => !post.title || !post.slug || !post.primaryKeyword
  );
  const podNeedsAttention = podPlans.filter((plan) => plan.status === "needs_attention");
  const failedPublishes = listings.filter((l) => l.status === LISTING_STATUS.PUBLISH_FAILED);
  const ordersNeedingAttention = orders.filter(
    (o) => o.needsAttentionReason || ["needs_attention", "fulfillment_failed"].includes(o.status)
  );

  // Growth Opportunities
  const usedDesignIds = new Set(
    [...podPlans.map((plan) => plan.designId), ...listings.map((listing) => listing.designId)].filter(Boolean)
  );
  const designsReadyForPod = assets.filter(
    (asset) => normalizeDesignStatus(asset.status) === "approved" && !usedDesignIds.has(asset.id)
  );
  const blogUndecidedPublished = blogPosts.filter(
    (post) => post.status === "published" && !post.decisionStatus
  );
  const blogRepurposeQueue = blogPosts.filter((post) =>
    String(post.decisionStatus || "").startsWith("turn_into_")
  );

  const item = (key, label, list) => ({ key, label, count: list.length, ids: list.map((x) => x.id) });
  const keep = (items) => items.filter((entry) => entry.count > 0);

  const sections = {
    needsReview: keep([
      item("designs_awaiting_review", "Designs awaiting approval", designsAwaitingReview),
      item("blog_needs_review", "Blog drafts needing review", blogNeedsReview),
      item("pod_plans_missing_info", "POD product plans missing info", podPlansMissingInfo),
    ]),
    readyToPublish: keep([
      item("blog_ready_to_publish", "Blog posts ready to publish", blogReadyToPublish),
      item("pod_ready_for_printful", "POD plans ready for Printful", podReadyForPrintful),
      item("listings_ready_to_publish", "Marketplace listings ready to publish", listingsReadyToPublish),
    ]),
    needsAttention: keep([
      {
        key: "channels_blocked",
        label: "Channels blocked or waiting on setup",
        count: blockedChannels.length,
        ids: blockedChannels.map((channel) => channel.key),
        detail: blockedChannels.map((channel) => `${channel.name}: ${channel.status}`).join(" · "),
      },
      item("blog_needs_update", "Published posts needing an update", blogNeedsUpdate),
      item("blog_missing_seo", "Posts missing title, slug, or keyword", blogMissingSeo),
      item("pod_needs_attention", "POD plans needing a manual check", podNeedsAttention),
      item("publish_failed", "Failed publishing attempts", failedPublishes),
      item("orders_need_attention", "Orders needing attention", ordersNeedingAttention),
    ]),
    growthOpportunities: keep([
      item("blog_can_become_products", "Published posts that can become pins/products", blogUndecidedPublished),
      item("designs_ready_for_pod", "Approved designs that can become POD products", designsReadyForPod),
      item("blog_repurpose_queue", "Posts with a repurposing decision to execute", blogRepurposeQueue),
    ]),
  };

  const attentionTotal =
    sections.needsReview.reduce((sum, entry) => sum + entry.count, 0) +
    sections.readyToPublish.reduce((sum, entry) => sum + entry.count, 0) +
    sections.needsAttention.reduce((sum, entry) => sum + entry.count, 0);

  return { sections, attentionTotal };
}

module.exports = {
  evaluateListing,
  listingsDueForReview,
  getNeedsYou,
  getEngineSections,
  rollupMetrics,
};
