const CONNECTED_STATUSES = new Set(["connected", "authorized", "ready", "token_stored", "active"]);

function latestBy(items, field = "createdAt") {
  return [...(items || [])].sort((a, b) => String(b?.[field] || "").localeCompare(String(a?.[field] || "")))[0] || null;
}

function metric(value, options = {}) {
  const available = options.available !== false;
  return {
    available,
    value: available ? Number(value || 0) : null,
    display: available ? options.format?.(Number(value || 0)) ?? String(Number(value || 0)) : "Not tracked yet",
    note: options.note || "",
  };
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function realManualSnapshots(data, cropIds) {
  return (data.performanceSnapshots || []).filter((snapshot) =>
    cropIds.has(snapshot.cropId)
      && !/demo|recommendation testing/i.test(String(snapshot.notes || ""))
  );
}

function assignedPresets(data, cropIds) {
  const ids = new Set(
    (data.crops || [])
      .filter((crop) => cropIds.has(crop.id) && crop.etsyPresetId)
      .map((crop) => crop.etsyPresetId)
  );
  return (data.productPresets || []).filter((preset) => ids.has(preset.id)).map((preset) => {
    const use = latestBy(
      (data.listingDrafts || []).filter((listing) => listing.presetId === preset.id),
      "updatedAt"
    );
    return {
      id: preset.id,
      name: preset.name,
      productType: preset.productType,
      status: preset.automationPolicy?.certificationStatus || "configured",
      enabled: Boolean(preset.automationPolicy?.enabled),
      lastUsedAt: use?.updatedAt || null,
      taxonomyId: preset.taxonomyId || null,
    };
  });
}

function listingView(listing, data) {
  const crop = (data.crops || []).find((item) => item.id === listing.cropId);
  const pipeline = latestBy(
    (data.pipelineRuns || []).filter((run) => run.listingDraftId === listing.id),
    "startedAt"
  );
  const remoteState = listing.externalState || "local";
  const recoveredDuplicate = /already attached to this listing/i.test(String(pipeline?.error || ""));
  const needsAttention = pipeline?.status === "failed" && !recoveredDuplicate;
  return {
    id: listing.id,
    cropId: listing.cropId,
    cropName: crop?.name || "Listing",
    title: listing.title || crop?.name || "Untitled listing",
    state: remoteState,
    status: needsAttention ? "needs_attention" : remoteState === "active" ? "active" : listing.externalListingId ? "draft" : "local",
    externalId: listing.externalListingId || null,
    url: listing.externalListingUrl || listing.externalEditUrl || null,
    updatedAt: listing.updatedAt || listing.createdAt || null,
    warning: needsAttention ? pipeline.error || "Pipeline needs attention." : null,
  };
}

function recentActivity(data, cropIds) {
  const rows = [];
  for (const run of data.pipelineRuns || []) {
    if (!cropIds.has(run.cropId)) continue;
    rows.push({
      id: run.id,
      label: run.status === "failed" ? "Etsy draft needs attention" : `Etsy pipeline ${run.status}`,
      status: run.status,
      at: run.completedAt || run.startedAt,
    });
  }
  for (const run of data.providerRuns || []) {
    if (!cropIds.has(run.cropId)) continue;
    rows.push({
      id: run.id,
      label: `${run.provider || "Image"} generation ${run.status || "completed"}`,
      status: run.status || "completed",
      at: run.createdAt,
    });
  }
  return rows.sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 5);
}

function buildEtsyAccount(data, integrationStatus) {
  const integration = data.integrations?.etsy || {};
  const status = integrationStatus?.etsy || {};
  const authorized = Boolean(status.authorized);
  if (!authorized) return null;

  const listings = (data.listingDrafts || []).map((listing) => listingView(listing, data));
  const cropIds = new Set((data.crops || []).map((crop) => crop.id));
  const snapshots = realManualSnapshots(data, cropIds);
  const revenue = snapshots.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const spend = snapshots.reduce((sum, row) => sum + Number(row.spend || 0), 0);
  const views = snapshots.reduce((sum, row) => sum + Number(row.views || 0), 0);
  const orders = snapshots.reduce((sum, row) => sum + Number(row.orders || 0), 0);
  const latestWarning = listings.find((listing) => listing.needsAttention || listing.status === "needs_attention");

  return {
    id: `etsy-${status.shopId || integration.shopId || "shop"}`,
    platform: "etsy",
    platformLabel: "Etsy",
    name: status.shopName || integration.shopName || "Etsy shop",
    shopUrl: status.shopUrl || integration.shopUrl || null,
    connectionStatus: "connected",
    connectionLabel: "Connected",
    connectedAt: status.connectedAt || integration.connectedAt || null,
    lastSuccessfulSync: null,
    warning: latestWarning?.warning || null,
    skinIndex: 0,
    listings,
    presets: assignedPresets(data, cropIds),
    activity: recentActivity(data, cropIds),
    performanceSnapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      revenue: Number(snapshot.revenue || 0),
      spend: Number(snapshot.spend || 0),
      views: Number(snapshot.views || 0),
      orders: Number(snapshot.orders || 0),
    })),
    manualTransactions: [
      {
        id: "etsy-starting-costs",
        createdAt: "2026-07-16T00:00:00.000Z",
        description: "Etsy setup fee and manual listing",
        amount: -39.2,
        source: "Manual entry",
      },
    ],
    metrics: {
      revenue: metric(revenue, { available: snapshots.length > 0, format: money, note: "Manually tracked" }),
      spend: metric(spend, { available: snapshots.length > 0, format: money, note: "Manually tracked" }),
      profit: metric(revenue - spend, { available: snapshots.length > 0, format: money, note: "Estimated from manual entries" }),
      views: metric(views, { available: snapshots.length > 0, note: "Manually tracked" }),
      orders: metric(orders, { available: snapshots.length > 0, note: "Manually tracked" }),
      activeListings: metric(listings.filter((listing) => listing.state === "active").length),
      draftListings: metric(listings.filter((listing) => listing.state === "draft" || listing.externalId).filter((listing) => listing.state !== "active").length),
      listingsCreated: metric(listings.length),
    },
  };
}

function buildMarketplaceAccounts(data) {
  return (data.marketplaceAccounts || [])
    .filter((account) => CONNECTED_STATUSES.has(String(account.status || "").toLowerCase()))
    .map((account, index) => ({
      id: account.id,
      platform: account.platform || "marketplace",
      platformLabel: account.platform || "Marketplace",
      name: account.name || "Connected account",
      shopUrl: account.shopUrl || null,
      connectionStatus: "connected",
      connectionLabel: "Connected",
      connectedAt: account.connectedAt || null,
      lastSuccessfulSync: account.lastSuccessfulSync || null,
      warning: account.lastError || null,
      skinIndex: index + 1,
      listings: [],
      presets: [],
      activity: [],
      performanceSnapshots: [],
      manualTransactions: [],
      metrics: {
        revenue: metric(0, { available: false }),
        spend: metric(0, { available: false }),
        profit: metric(0, { available: false }),
        views: metric(0, { available: false }),
        orders: metric(0, { available: false }),
        activeListings: metric(0),
        draftListings: metric(0),
        listingsCreated: metric(0),
      },
    }));
}

export function buildFarmDashboardModel({ data = {}, integrationStatus = {} } = {}) {
  const accounts = [buildEtsyAccount(data, integrationStatus), ...buildMarketplaceAccounts(data)].filter(Boolean);
  const activeListings = accounts.reduce((sum, account) => sum + account.metrics.activeListings.value, 0);
  const trackedAccounts = accounts.filter((account) => account.metrics.revenue.available);
  const revenue = trackedAccounts.reduce((sum, account) => sum + account.metrics.revenue.value, 0);
  const views = trackedAccounts.reduce((sum, account) => sum + account.metrics.views.value, 0);
  const reviewCrop = (data.crops || []).find((crop) =>
    (data.assets || []).some((asset) => asset.cropId === crop.id && !asset.isReference && ["review", "generated"].includes(asset.status))
  ) || (data.crops || [])[0] || null;

  return {
    loading: !data.schemaVersion,
    metrics: [
      { key: "revenue", label: "Total revenue", ...metric(revenue, { available: trackedAccounts.length > 0, format: money, note: "Connected or manual sources" }) },
      { key: "views", label: "Total views", ...metric(views, { available: trackedAccounts.length > 0, note: "Connected or manual sources" }) },
      { key: "active", label: "Active listings", ...metric(activeListings) },
      { key: "accounts", label: "Connected accounts", ...metric(accounts.length) },
    ],
    accounts,
    reviewCropId: reviewCrop?.id || null,
    warnings: accounts.flatMap((account) => account.warning ? [{ accountId: account.id, message: account.warning }] : []),
  };
}

export function buildEmptyFarmDashboardModel() {
  return buildFarmDashboardModel({ data: { schemaVersion: 5 }, integrationStatus: {} });
}
