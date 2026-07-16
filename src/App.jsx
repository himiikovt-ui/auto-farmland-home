import { useEffect, useMemo, useState } from "react";
import "./App.css";
import FarmDashboard from "./farm/FarmDashboard";
import { buildFarmDashboardModel } from "./farm/farmViewModel";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const EMPTY_LIST = [];

const PIPELINE_STATUSES = ["draft", "review", "approved", "scheduled", "published"];

const DECISIONS = ["repeat", "remix", "kill"];

// Multi-land navigation. Auto Farmland is a multi-channel passive income
// engine — Blog Land is the priority-1 channel (usable today), POD Land is the
// Printful-mediated eBay lane, and blocked/future lands live on the Channels
// board instead of cluttering the rail. Internal screen keys stay stable.
const NAV_GROUPS = [
  { title: "Your farm", items: ["Dashboard", "Etsy", "Presets"] },
  { title: "System", items: ["Settings"] },
];

const SCREEN_LABELS = {
  Dashboard: "Farm",
  Seeds: "Seeds",
  Batches: "Batches",
  Designs: "Designs & Assets",
  Blog: "Blog Land",
  Pod: "POD Land",
  Listings: "Listings / Products",
  Etsy: "Create & Publish",
  Channels: "Channels & Lands",
  Presets: "Listing Presets",
  Orders: "Orders",
  Metrics: "Performance",
  Settings: "Settings",
  // Preserved (reached contextually, not from the main rail):
  Crop: "Listing Workflow",
  Legacy: "Legacy Content Farm",
  Streams: "Income Streams",
  Studio: "Planting Shed",
  Library: "Plots & Formats",
  Performance: "Crop Report",
  Backend: "Tool Shed",
};

// Blog Land lifecycle + decisions (mirror server/engine/status.cjs).
const BLOG_STATUS_OPTIONS = [
  "idea",
  "outline",
  "draft",
  "needs_review",
  "approved",
  "ready_to_publish",
  "published",
  "needs_update",
  "archived",
];

const BLOG_DECISION_OPTIONS = [
  "keep",
  "update",
  "expand",
  "turn_into_pinterest_pins",
  "turn_into_gumroad_product",
  "turn_into_printable",
  "turn_into_video",
  "turn_into_product_listing",
  "archive",
];

const SEARCH_INTENT_OPTIONS = ["informational", "commercial", "transactional", "navigational"];

const PUBLISH_TARGET_OPTIONS = ["local_markdown", "wordpress", "ghost", "webflow", "static_site"];

// POD Land (Printful-mediated eBay) lifecycle.
const POD_PLAN_STATUS_OPTIONS = [
  "draft",
  "ready_for_printful",
  "uploaded_to_printful",
  "synced_to_ebay",
  "active_on_ebay",
  "needs_attention",
  "archived",
];

const CHANNEL_STATUS_OPTIONS = [
  "ready_to_start",
  "active",
  "setup_needed",
  "approval_pending",
  "developer_account_blocked",
  "not_started",
  "planned",
  "paused",
  // Etsy Personal Access ladder (kept in step by the readiness sync):
  "personal_access_ready_for_oauth",
  "etsy_credentials_present",
  "etsy_connected",
  "etsy_ready_for_draft_test",
];

// Engine design + listing lifecycles (mirror server/engine/status.cjs).
const DESIGN_STATUS_OPTIONS = [
  "generated",
  "review",
  "approved",
  "rejected",
  "needs_edit",
  "remix_requested",
  "archived",
];

const DECISION_OPTIONS = [
  "keep",
  "kill",
  "remix",
  "bundle",
  "revise_title",
  "revise_price",
  "revise_mockup",
  "archive",
];

// Collapse legacy asset statuses onto the engine vocabulary for display.
const LEGACY_DESIGN_STATUS = {
  final: "approved",
  live: "approved",
  generating: "generated",
  awaiting_import: "generated",
};

function engineDesignStatus(asset) {
  if (!asset) return "generated";
  const status = asset.status;
  if (DESIGN_STATUS_OPTIONS.includes(status)) return status;
  return LEGACY_DESIGN_STATUS[status] || "review";
}

const STREAM_TYPES = [
  "short_video_account",
  "youtube_channel",
  "etsy_shop",
  "pod_shop",
  "affiliate_stream",
  "fiverr_gig",
  "digital_product",
  "trading_bot_research",
];

const STREAM_STATUSES = ["active", "testing", "paused", "retired"];

function titleCase(value) {
  if (!value) {
    return "";
  }

  return value
    .split("_")
    .join(" ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function flattenTaxonomy(nodes, parents = []) {
  return (Array.isArray(nodes) ? nodes : []).flatMap((node) => {
    const name = node.name || node.short_name || "Category";
    const pathParts = [...parents, name];
    const current = node.id || node.taxonomy_id
      ? [{ id: String(node.id || node.taxonomy_id), name: pathParts.join(" › ") }]
      : [];
    return [...current, ...flattenTaxonomy(node.children, pathParts)];
  });
}

function formatDateTime(value) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDefaultScheduleTime() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);

  const pad = (number) => String(number).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getMetricScore(item) {
  const metrics = item.metrics || {};

  return (
    Number(metrics.views || 0) +
    Number(metrics.likes || 0) * 10 +
    Number(metrics.comments || 0) * 25 +
    Number(metrics.shares || 0) * 30 +
    Number(metrics.saves || 0) * 20 +
    Number(metrics.followsGained || 0) * 50 +
    Number(metrics.revenue || 0) * 100
  );
}

function App() {
  const [activeScreen, setActiveScreen] = useState("Dashboard");
  const [selectedCropId, setSelectedCropId] = useState("crop-cottage-cats");
  const [requestedCropStep, setRequestedCropStep] = useState(null);
  const [openCreateOnEtsy, setOpenCreateOnEtsy] = useState(false);
  const [selectedBlogPostId, setSelectedBlogPostId] = useState(null);

  const [health, setHealth] = useState(null);
  const [summary, setSummary] = useState(null);
  const [backendData, setBackendData] = useState(null);
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [engineDashboard, setEngineDashboard] = useState(null);
  const [adapterStatus, setAdapterStatus] = useState(null);
  const [etsyStatus, setEtsyStatus] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [batchForm, setBatchForm] = useState({
    accountId: "acct-fish",
    formatId: "fmt-creature-fact",
    goal: "Create cozy fish fact shorts for this week",
    quantity: 5,
    targetLengthSeconds: 25,
    automationMode: "assisted",
  });

  const incomeStreams = backendData?.incomeStreams || EMPTY_LIST;
  const accounts = backendData?.accounts || EMPTY_LIST;
  const formats = backendData?.formats || EMPTY_LIST;
  const batches = backendData?.batches || EMPTY_LIST;
  const contentItems = backendData?.contentItems || EMPTY_LIST;
  const crops = backendData?.crops || EMPTY_LIST;
  const assets = backendData?.assets || EMPTY_LIST;
  const listingDrafts = backendData?.listingDrafts || EMPTY_LIST;
  const performanceSnapshots = backendData?.performanceSnapshots || EMPTY_LIST;
  const providerRuns = backendData?.providerRuns || EMPTY_LIST;
  const pipelineRuns = backendData?.pipelineRuns || EMPTY_LIST;
  const productPresets = backendData?.productPresets || EMPTY_LIST;
  const listings = backendData?.listings || EMPTY_LIST;
  const marketplaceAccounts = backendData?.marketplaceAccounts || EMPTY_LIST;
  const podAccounts = backendData?.podAccounts || EMPTY_LIST;
  const orders = backendData?.orders || EMPTY_LIST;
  const listingMetricsDaily = backendData?.listingMetricsDaily || EMPTY_LIST;
  const decisions = backendData?.decisions || EMPTY_LIST;
  const seeds = backendData?.seeds || EMPTY_LIST;
  const blogPosts = backendData?.blogPosts || EMPTY_LIST;
  const podProductPlans = backendData?.podProductPlans || EMPTY_LIST;
  const channels = backendData?.channels || EMPTY_LIST;
  const farmModel = useMemo(
    () => buildFarmDashboardModel({ data: backendData || {}, integrationStatus: integrationStatus || {} }),
    [backendData, integrationStatus]
  );

  const topPerformer = useMemo(() => {
    const candidates = contentItems.filter((item) =>
      ["published", "analyzed"].includes(item.status)
    );

    if (candidates.length === 0) {
      return null;
    }

    return candidates.reduce((best, current) => {
      return getMetricScore(current) > getMetricScore(best) ? current : best;
    }, candidates[0]);
  }, [contentItems]);

  const stats = useMemo(() => {
    return {
      streams: incomeStreams.length,
      activeStreams: incomeStreams.filter((stream) => stream.status === "active")
        .length,
      accounts: accounts.length,
      batches: batches.length,
      contentItems: contentItems.length,
      needsYou: summary?.needsYou?.length || 0,
      scheduled: contentItems.filter((item) => item.status === "scheduled").length,
      published: contentItems.filter((item) =>
        ["published", "analyzed"].includes(item.status)
      ).length,
      revenue: summary?.totalRevenue || 0,
    };
  }, [incomeStreams, accounts, batches, contentItems, summary]);

  useEffect(() => {
    refreshAll();
    // The initial load intentionally runs once; actions refresh their own data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getAccount(accountId) {
    return accounts.find((account) => account.id === accountId);
  }

  function getFormat(formatId) {
    return formats.find((format) => format.id === formatId);
  }

  function getBatch(batchId) {
    return batches.find((batch) => batch.id === batchId);
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    return data;
  }

  async function checkHealth() {
    const data = await fetchJson("/api/health");
    setHealth(data);
  }

  async function loadData() {
    const data = await fetchJson("/api/data");
    setBackendData(data);

    if (data.accounts?.length > 0 && data.formats?.length > 0) {
      setBatchForm((current) => ({
        ...current,
        accountId: current.accountId || data.accounts[0].id,
        formatId: current.formatId || data.formats[0].id,
      }));
    }
  }

  async function loadSummary() {
    const data = await fetchJson("/api/summary");
    setSummary(data);
  }

  async function loadIntegrationStatus() {
    const data = await fetchJson("/api/integrations/status");
    setIntegrationStatus(data);
  }

  async function loadEngineDashboard() {
    const data = await fetchJson("/api/engine/dashboard");
    setEngineDashboard(data);
  }

  async function loadAdapterStatus() {
    const data = await fetchJson("/api/engine/adapters/status");
    setAdapterStatus(data);
  }

  async function loadEtsyStatus() {
    const data = await fetchJson("/api/etsy/status");
    setEtsyStatus(data);
  }

  async function refreshAll() {
    try {
      setLoading(true);
      setError("");

      await Promise.all([
        checkHealth(),
        loadData(),
        loadSummary(),
        loadIntegrationStatus(),
        loadEngineDashboard(),
        loadAdapterStatus(),
        loadEtsyStatus(),
      ]);
    } catch{
      setError(
        "Could not connect to backend. Make sure the backend is running with: npm run server (node server\\index.cjs)"
      );
    } finally {
      setLoading(false);
    }
  }

  async function runEtsyAction(path, options = {}) {
    try {
      setLoading(true);
      setError("");
      const result = await fetchJson(path, options);
      await Promise.all([loadData(), loadSummary(), loadIntegrationStatus(), loadEngineDashboard()]);
      return result;
    } catch (caughtError) {
      setError(caughtError.message || "The farm action could not be completed.");
      throw caughtError;
    } finally {
      setLoading(false);
    }
  }

  // Generic engine action: run a request, then refresh engine state + data.
  async function runEngineAction(path, options = {}) {
    try {
      setLoading(true);
      setError("");
      const result = await fetchJson(path, options);
      await Promise.all([loadData(), loadEngineDashboard(), loadAdapterStatus(), loadEtsyStatus()]);
      return result;
    } catch (caughtError) {
      setError(caughtError.message || "The action could not be completed.");
      throw caughtError;
    } finally {
      setLoading(false);
    }
  }

  function openCrop(cropId, step = null) {
    setSelectedCropId(cropId);
    setRequestedCropStep(step);
    setActiveScreen("Crop");
  }

  function openBlogPost(postId) {
    setSelectedBlogPostId(postId);
    setActiveScreen("Blog");
  }

  async function createBatch(event) {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");

      await fetchJson("/api/batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: batchForm.accountId,
          formatId: batchForm.formatId,
          goal: batchForm.goal,
          quantity: Number(batchForm.quantity),
          targetLengthSeconds: Number(batchForm.targetLengthSeconds),
          automationMode: batchForm.automationMode,
        }),
      });

      await loadData();
      await loadSummary();
      setActiveScreen("Studio");
    } catch (caughtError) {
      setError(caughtError.message || "Could not create batch.");
    } finally {
      setLoading(false);
    }
  }

  async function updateContentItem(itemId, updates) {
    try {
      setError("");

      await fetchJson(`/api/content-items/${itemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      await loadData();
      await loadSummary();
    } catch (caughtError) {
      setError(caughtError.message || "Could not update content item.");
    }
  }

  async function createIncomeStream(streamFields) {
    try {
      setError("");

      await fetchJson("/api/income-streams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(streamFields),
      });

      await loadData();
      await loadSummary();
    } catch (caughtError) {
      setError(caughtError.message || "Could not plant income stream.");
    }
  }

  async function updateIncomeStream(streamId, updates) {
    try {
      setError("");

      await fetchJson(`/api/income-streams/${streamId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      await loadData();
      await loadSummary();
    } catch (caughtError) {
      setError(caughtError.message || "Could not update income stream.");
    }
  }

  async function updateMetric(item, metricName, value) {
    const numberValue = Number(value);

    await updateContentItem(item.id, {
      metrics: {
        ...item.metrics,
        [metricName]: Number.isNaN(numberValue) ? 0 : numberValue,
      },
    });
  }

  return (
    <main className={activeScreen === "Dashboard" ? "app farmHomeApp" : "app"}>
      {activeScreen !== "Dashboard" && <aside className="sidebar">
        <div className="logoBlock">
          <div className="logoMark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
              <path
                d="M12 21v-8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M12 13c0-4 2.5-6.5 7-7-.5 4.5-3 7-7 7Z"
                fill="currentColor"
              />
              <path
                d="M12 11C12 7.5 10 5.5 6 5c.4 4 2.5 6 6 6Z"
                fill="currentColor"
                opacity="0.65"
              />
            </svg>
          </div>
          <div>
            <h1>Auto Farmland</h1>
            <p>Etsy listing pipeline</p>
          </div>
        </div>

        <nav className="nav">
          {NAV_GROUPS.map((group) => (
            <div className="navGroup" key={group.title}>
              <p className="navGroupTitle">{group.title}</p>
              {group.items.map((screen) => {
                const needsCount = screen === "Dashboard" ? farmModel.warnings.length : 0;
                return (
                  <button
                    key={screen}
                    className={
                      activeScreen === screen ? "navButton active" : "navButton"
                    }
                    onClick={() => {
                      if (screen === "Etsy") setOpenCreateOnEtsy(false);
                      setActiveScreen(screen);
                    }}
                  >
                    <span>{SCREEN_LABELS[screen]}</span>
                    {needsCount > 0 && <span className="navBadge">{needsCount}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebarCard">
          <p className="eyebrow">The engine</p>
          <p>
            Plant seeds, grow assets in batches, turn the best into outputs for
            each land — blog posts today, POD products via Printful, more lands
            as they unblock.
          </p>
        </div>
      </aside>}

      <section className="content">
        {activeScreen !== "Dashboard" && (
          <header className="topbar">
            <div>
              <p className="eyebrow">Auto Farmland</p>
              <h2>{SCREEN_LABELS[activeScreen]}</h2>
            </div>

            <div className="topbarActions">
              <button className="ghostButton" onClick={refreshAll}>
                Refresh
              </button>
            </div>
          </header>
        )}

        {activeScreen !== "Dashboard" && error && (
          <div className="backendError globalError">
            <strong>Issue</strong>
            <p>{error}</p>
          </div>
        )}

        {loading && <div className="loadingLine" aria-label="Working" />}

        {activeScreen === "Dashboard" && (
          <FarmDashboard
            model={farmModel}
            error={error}
            onCreateListing={() => {
              setOpenCreateOnEtsy(true);
              setActiveScreen("Etsy");
            }}
            onReviewQueue={() => farmModel.reviewCropId ? openCrop(farmModel.reviewCropId, "review") : setActiveScreen("Etsy")}
            onViewPresets={() => setActiveScreen("Presets")}
            onConnectAccount={() => setActiveScreen("Settings")}
            warningCount={farmModel.warnings.length}
            onOpenListing={(listing) => openCrop(
              listing.cropId,
              listing.status === "needs_attention" || listing.externalId ? "publish" : "listing"
            )}
            renderPresetManager={({ onBack, backLabel, platform, hideBack, onEditModeChange, onRunComplete }) => (
              <PresetsScreen
                productPresets={platform ? productPresets.filter((preset) => preset.platform === platform) : productPresets}
                crops={crops}
                assets={assets}
                runEngineAction={runEngineAction}
                embedded
                onBack={onBack}
                backLabel={backLabel}
                groupByPlatform={!platform}
                hideBack={hideBack}
                onEditModeChange={onEditModeChange}
                onRunComplete={onRunComplete}
              />
            )}
            renderListingReview={({ listing, onBack }) => (
              <EtsyCropDetailScreen
                key={`embedded-${listing.cropId}-${listing.id}`}
                crop={crops.find((crop) => crop.id === listing.cropId)}
                batches={batches}
                assets={assets}
                listingDrafts={listingDrafts}
                performanceSnapshots={performanceSnapshots}
                pipelineRuns={pipelineRuns}
                productPresets={productPresets}
                integrationStatus={integrationStatus}
                runEtsyAction={runEtsyAction}
                setActiveScreen={setActiveScreen}
                initialStep="publish"
                embedded
                onBack={onBack}
              />
            )}
            renderCreatePublish={({ onBack, onOpenCrop }) => (
              <EtsyFarmScreen
                crops={crops}
                assets={assets}
                batches={batches}
                providerRuns={providerRuns}
                integrationStatus={integrationStatus}
                openCrop={onOpenCrop}
                runEtsyAction={runEtsyAction}
                initialShowCreate
                embedded
                onBack={onBack}
              />
            )}
            renderCropWorkflow={({ cropId, initialStep, onBack, backLabel }) => (
              <EtsyCropDetailScreen
                key={`farm-tool-${cropId}-${initialStep || "auto"}`}
                crop={crops.find((crop) => crop.id === cropId)}
                batches={batches}
                assets={assets}
                listingDrafts={listingDrafts}
                performanceSnapshots={performanceSnapshots}
                pipelineRuns={pipelineRuns}
                productPresets={productPresets}
                integrationStatus={integrationStatus}
                runEtsyAction={runEtsyAction}
                setActiveScreen={setActiveScreen}
                initialStep={initialStep}
                embedded
                onBack={onBack}
                backLabel={backLabel}
              />
            )}
            renderSettings={({ onBack }) => (
              <SettingsScreen
                health={health}
                integrationStatus={integrationStatus}
                adapterStatus={adapterStatus}
                backendData={backendData}
                refreshAll={refreshAll}
                runEngineAction={runEngineAction}
                embedded
                onBack={onBack}
              />
            )}
          />
        )}

        {activeScreen === "Engine" && (
          <EngineDashboardScreen
            engineDashboard={engineDashboard}
            channels={channels}
            setActiveScreen={setActiveScreen}
          />
        )}

        {activeScreen === "Seeds" && (
          <SeedsScreen
            seeds={seeds}
            blogPosts={blogPosts}
            podProductPlans={podProductPlans}
            runEngineAction={runEngineAction}
            openBlogPost={openBlogPost}
          />
        )}

        {activeScreen === "Blog" && (
          <BlogLandScreen
            blogPosts={blogPosts}
            seeds={seeds}
            assets={assets}
            runEngineAction={runEngineAction}
            selectedPostId={selectedBlogPostId}
            onSelectPost={setSelectedBlogPostId}
          />
        )}

        {activeScreen === "Pod" && (
          <PodLandScreen
            podProductPlans={podProductPlans}
            assets={assets}
            seeds={seeds}
            channels={channels}
            runEngineAction={runEngineAction}
          />
        )}

        {activeScreen === "Designs" && (
          <DesignsScreen
            assets={assets}
            crops={crops}
            productPresets={productPresets}
            marketplaceAccounts={marketplaceAccounts}
            runEngineAction={runEngineAction}
            setActiveScreen={setActiveScreen}
          />
        )}

        {activeScreen === "Batches" && (
          <BatchesScreen
            batches={batches}
            assets={assets}
            listings={listings}
            crops={crops}
          />
        )}

        {activeScreen === "Presets" && (
          <PresetsScreen
            productPresets={productPresets}
            crops={crops}
            assets={assets}
            runEngineAction={runEngineAction}
          />
        )}

        {activeScreen === "Listings" && (
          <ListingsScreen
            listings={listings}
            assets={assets}
            productPresets={productPresets}
            listingMetricsDaily={listingMetricsDaily}
            runEngineAction={runEngineAction}
          />
        )}

        {activeScreen === "Channels" && (
          <ChannelsScreen
            channels={channels}
            marketplaceAccounts={marketplaceAccounts}
            podAccounts={podAccounts}
            adapterStatus={adapterStatus}
            etsyStatus={etsyStatus}
            runEngineAction={runEngineAction}
          />
        )}

        {activeScreen === "Orders" && (
          <OrdersScreen orders={orders} listings={listings} />
        )}

        {activeScreen === "Metrics" && (
          <MetricsDecisionsScreen
            engineDashboard={engineDashboard}
            listings={listings}
            decisions={decisions}
            runEngineAction={runEngineAction}
          />
        )}

        {activeScreen === "Etsy" && (
          <EtsyFarmScreen
            crops={crops}
            assets={assets}
            batches={batches}
            providerRuns={providerRuns}
            integrationStatus={integrationStatus}
            openCrop={openCrop}
            runEtsyAction={runEtsyAction}
            initialShowCreate={openCreateOnEtsy}
          />
        )}

        {activeScreen === "Legacy" && (
          <DashboardScreen
            stats={stats}
            summary={summary}
            contentItems={contentItems}
            topPerformer={topPerformer}
            getAccount={getAccount}
            getFormat={getFormat}
            setActiveScreen={setActiveScreen}
            updateContentItem={updateContentItem}
          />
        )}

        {activeScreen === "Crop" && (
          <EtsyCropDetailScreen
            key={`${selectedCropId}-${listingDrafts.find((draft) => draft.cropId === selectedCropId)?.id || "draftless"}-${requestedCropStep || "auto"}`}
            crop={crops.find((crop) => crop.id === selectedCropId) || crops[0]}
            batches={batches}
            assets={assets}
            listingDrafts={listingDrafts}
            performanceSnapshots={performanceSnapshots}
            pipelineRuns={pipelineRuns}
            productPresets={productPresets}
            integrationStatus={integrationStatus}
            runEtsyAction={runEtsyAction}
            setActiveScreen={setActiveScreen}
            initialStep={requestedCropStep}
          />
        )}

        {activeScreen === "Streams" && (
          <StreamsScreen
            incomeStreams={incomeStreams}
            accounts={accounts}
            batches={batches}
            createIncomeStream={createIncomeStream}
            updateIncomeStream={updateIncomeStream}
          />
        )}

        {activeScreen === "Studio" && (
          <StudioScreen
            accounts={accounts}
            formats={formats}
            batches={batches}
            contentItems={contentItems}
            batchForm={batchForm}
            setBatchForm={setBatchForm}
            createBatch={createBatch}
            getAccount={getAccount}
            getFormat={getFormat}
            getBatch={getBatch}
            updateContentItem={updateContentItem}
          />
        )}

        {activeScreen === "Library" && (
          <LibraryScreen accounts={accounts} formats={formats} batches={batches} />
        )}

        {activeScreen === "Performance" && (
          <PerformanceScreen
            contentItems={contentItems}
            getAccount={getAccount}
            getFormat={getFormat}
            updateContentItem={updateContentItem}
            updateMetric={updateMetric}
          />
        )}

        {(activeScreen === "Settings" || activeScreen === "Backend") && (
          <SettingsScreen
            health={health}
            integrationStatus={integrationStatus}
            adapterStatus={adapterStatus}
            backendData={backendData}
            refreshAll={refreshAll}
            runEngineAction={runEngineAction}
          />
        )}
      </section>
    </main>
  );
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function StatusBadge({ value }) {
  return <span className={`statusBadge status-${value}`}>{titleCase(value)}</span>;
}

function ElapsedProgress({ label, elapsed, expectedSeconds = 60 }) {
  const percent = Math.min(95, Math.max(4, (Number(elapsed || 0) / expectedSeconds) * 100));
  return (
    <div className="elapsedProgress" role="status" aria-live="polite">
      <div className="elapsedProgressHeader">
        <span>{label}</span>
        <span>{elapsed}s elapsed</span>
      </div>
      <div className="elapsedTrack" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function EtsyFarmScreen({ crops, assets, batches, providerRuns, integrationStatus, openCrop, runEtsyAction, initialShowCreate = false, embedded = false, onBack }) {
  const [filters, setFilters] = useState({ niche: "", productType: "", provider: "", performance: "" });
  const [showCreate, setShowCreate] = useState(initialShowCreate);
  const [integrationNotice, setIntegrationNotice] = useState("");
  const [form, setForm] = useState({
    name: "", niche: "", targetCustomer: "", productType: "digital_download",
    aestheticNotes: "", promptTemplate: "", podCandidate: false,
  });

  const filteredCrops = crops.filter((crop) => {
    const cropProviders = providerRuns.filter((run) => run.cropId === crop.id).map((run) => run.provider);
    const matchesNiche = !filters.niche || crop.niche.toLowerCase().includes(filters.niche.toLowerCase());
    const matchesType = !filters.productType || crop.productType === filters.productType;
    const matchesProvider = !filters.provider || cropProviders.includes(filters.provider);
    const matchesPerformance = !filters.performance || (filters.performance === "decided" ? crop.decision || crop.recommendation : !crop.decision && !crop.recommendation);
    return matchesNiche && matchesType && matchesProvider && matchesPerformance;
  });

  async function createCrop(event) {
    event.preventDefault();
    try {
      const result = await runEtsyAction("/api/crops", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      setShowCreate(false);
      openCrop(result.crop.id);
    } catch {
      // The parent surfaces the API error.
    }
  }

  return (
    <section className={embedded ? "screen embeddedToolScreen embeddedEtsyFarm" : "screen"}>
      <div className="farmHero compactFarmHero">
        {embedded && <button type="button" className="entryBackButton" onClick={onBack}>← Back to farm</button>}
        <div>
          <p className="eyebrow">Land · Etsy</p>
          <h3>Your Listings</h3>
        </div>
        <button className="primaryButton" onClick={() => setShowCreate((value) => !value)}>
          {showCreate ? "Close" : "New Listing"}
        </button>
      </div>

      <article className="panel integrationPanel">
        <div className="panelHeader">
          <div><p className="eyebrow">Live connections</p><h3>Pipeline readiness</h3></div>
          <span className="smallMuted">Secrets stay in the local backend.</span>
        </div>
        {integrationNotice && <div className="successNotice">{integrationNotice}</div>}
        <div className="connectionGrid">
          <div className="connectionCard">
            <div className="rowBetween"><strong>OpenAI Images</strong><StatusBadge value={integrationStatus?.openai?.configured ? "connected" : "needs_setup"} /></div>
            <p>{integrationStatus?.openai?.configured ? `${integrationStatus.openai.model} is configured.` : "Add OPENAI_API_KEY to .env.local."}</p>
            <button className="ghostButton" disabled={!integrationStatus?.openai?.configured} onClick={async () => { try { const result = await runEtsyAction("/api/integrations/openai/verify", { method: "POST" }); setIntegrationNotice(result.message); } catch { /* parent shows error */ } }}>Verify OpenAI</button>
          </div>
          <div className="connectionCard">
            <div className="rowBetween"><strong>Etsy shop</strong><StatusBadge value={integrationStatus?.etsy?.authorized ? "connected" : integrationStatus?.etsy?.configured ? "authorize" : "needs_setup"} /></div>
            <p>{integrationStatus?.etsy?.authorized ? `${integrationStatus.etsy.shopName || "Shop"} is authorized.` : integrationStatus?.etsy?.configured ? "Credentials found. Complete Etsy consent next." : "Add Etsy credentials and an HTTPS redirect URI to .env.local."}</p>
            {integrationStatus?.etsy?.configured && !integrationStatus?.etsy?.authorized && <a className="primaryButton buttonLink" href={`${API_BASE}/api/auth/etsy/start`} target="_blank" rel="noreferrer">Connect Etsy</a>}
            {integrationStatus?.etsy?.authorized && <button className="ghostButton" onClick={async () => { try { const result = await runEtsyAction("/api/integrations/etsy/verify", { method: "POST" }); setIntegrationNotice(result.message); } catch { /* parent shows error */ } }}>Verify Etsy</button>}
          </div>
        </div>
      </article>

      {showCreate && (
        <form className="panel createForm etsyCreateForm" onSubmit={createCrop}>
          <div className="panelHeader"><h3>New Listing</h3></div>
          <div className="etsyFormGrid">
            <label>Crop name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Moonlit mushroom printable set" /></label>
            <label>Niche<input value={form.niche} onChange={(event) => setForm({ ...form, niche: event.target.value })} placeholder="woodland nursery decor" /></label>
            <label>Product type<select value={form.productType} onChange={(event) => setForm({ ...form, productType: event.target.value })}><option value="digital_download">Digital download</option><option value="printable">Printable</option><option value="sticker_sheet">Sticker sheet</option><option value="wall_art">Wall art</option><option value="pod_candidate">POD candidate</option></select></label>
            <label>Target customer<input value={form.targetCustomer} onChange={(event) => setForm({ ...form, targetCustomer: event.target.value })} placeholder="Parents building a cozy woodland nursery" /></label>
            <label className="spanTwo">Aesthetic / style notes<textarea value={form.aestheticNotes} onChange={(event) => setForm({ ...form, aestheticNotes: event.target.value })} /></label>
            <label className="spanTwo">Prompt template<textarea value={form.promptTemplate} onChange={(event) => setForm({ ...form, promptTemplate: event.target.value })} /></label>
            <label className="checkLabel"><input type="checkbox" checked={form.podCandidate} onChange={(event) => setForm({ ...form, podCandidate: event.target.checked })} /> Keep POD expansion available</label>
          </div>
          <button className="primaryButton formSubmit" type="submit">Plant Crop</button>
        </form>
      )}

      <details className="filterDisclosure">
        <summary>Filters</summary>
        <div className="panel filterBar">
        <label>Niche<input value={filters.niche} onChange={(event) => setFilters({ ...filters, niche: event.target.value })} placeholder="Filter niche" /></label>
        <label>Product<select value={filters.productType} onChange={(event) => setFilters({ ...filters, productType: event.target.value })}><option value="">All products</option><option value="digital_download">Digital download</option><option value="printable">Printable</option><option value="sticker_sheet">Sticker sheet</option><option value="wall_art">Wall art</option></select></label>
        <label>Provider<select value={filters.provider} onChange={(event) => setFilters({ ...filters, provider: event.target.value })}><option value="">All providers</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="manual">Manual</option></select></label>
        <label>Decision<select value={filters.performance} onChange={(event) => setFilters({ ...filters, performance: event.target.value })}><option value="">Any performance</option><option value="decided">Has recommendation</option><option value="undecided">Needs signal</option></select></label>
      </div>

      </details>

      <div className="cropGrid etsyCropGrid">
        {filteredCrops.map((crop) => {
          const cropAssets = assets.filter((asset) => asset.cropId === crop.id);
          const cropBatches = batches.filter((batch) => batch.cropId === crop.id);
          return (
            <button className="cropCard" key={crop.id} onClick={() => openCrop(crop.id)}>
              <div className="rowBetween"><StatusBadge value={crop.status} />{crop.podCandidate && <span className="podFlag">POD later</span>}</div>
              <h3>{crop.name}</h3>
              <p>{crop.targetCustomer || "Target customer not set"}</p>
              <div className="cropMeta"><span>{titleCase(crop.productType)}</span><span>{cropBatches.length} batches</span><span>{cropAssets.length} assets</span></div>
              <span className="cropLink">Open Crop →</span>
            </button>
          );
        })}
        {!filteredCrops.length && <EmptyState message="No crops match these filters." />}
      </div>
    </section>
  );
}

function EtsyCropDetailScreen({ crop, batches, assets, listingDrafts, performanceSnapshots, pipelineRuns, productPresets, integrationStatus, runEtsyAction, setActiveScreen, initialStep, embedded = false, onBack, backLabel }) {
  const cropBatches = crop ? batches.filter((batch) => batch.cropId === crop.id) : [];
  const cropAssets = crop ? assets.filter((asset) => asset.cropId === crop.id) : [];
  const listing = crop ? listingDrafts.find((draft) => draft.cropId === crop.id) : null;
  const latestPerformance = crop ? performanceSnapshots.filter((snapshot) => snapshot.cropId === crop.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] : null;
  const latestPipeline = crop ? pipelineRuns.filter((run) => run.cropId === crop.id).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0] : null;
  const etsyListingPresets = productPresets.filter((preset) => preset.platform === "etsy" && preset.listingType === "download");
  const [batchForm, setBatchForm] = useState({ provider: "openai", model: "gpt-image-2", batchSize: 4, prompt: crop?.promptTemplate || "", negativePrompt: "legible text, dates, calendar grid, watermark, logo, signature, copied composition", dimensions: "1024x1536", quality: "medium", referenceAssetIds: [] });
  const [listingForm, setListingForm] = useState(listing ? { ...listing, tags: (listing.tags || []).join(", ") } : null);
  const [performanceForm, setPerformanceForm] = useState(latestPerformance ? { ...latestPerformance } : { views: 0, favorites: 0, clicks: 0, orders: 0, revenue: 0, spend: 0, notes: "" });
  const [notice, setNotice] = useState("");
  const [draftReviewed, setDraftReviewed] = useState(false);
  const [publishConfirmation, setPublishConfirmation] = useState("");
  const [taxonomyOptions, setTaxonomyOptions] = useState([]);
  const [taxonomyQuery, setTaxonomyQuery] = useState("journal");
  const [generating, setGenerating] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [workflowStep, setWorkflowStep] = useState(() => (
    initialStep || (listing?.externalListingId ? "publish"
      : listing ? "listing"
        : cropAssets.some((asset) => !asset.isReference) ? "review" : "create")
  ));

  // Live elapsed-seconds counter while a generation is in flight, so it's
  // always obvious the app is working (real generation + any rate-limit
  // waits can take 30–60s).
  useEffect(() => {
    if (!generating) return undefined;
    const startedAt = Date.now();
    const id = setInterval(() => setGenElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [generating]);

  const [critiquing, setCritiquing] = useState(false);
  const [critElapsed, setCritElapsed] = useState(0);
  const [critiqueResult, setCritiqueResult] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [manualLearning, setManualLearning] = useState("");
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineElapsed, setPipelineElapsed] = useState(0);
  const [pipelineLabel, setPipelineLabel] = useState("Preparing Etsy draft");

  useEffect(() => {
    if (!critiquing) return undefined;
    const startedAt = Date.now();
    const id = setInterval(() => setCritElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [critiquing]);

  useEffect(() => {
    if (!pipelineBusy) return undefined;
    const startedAt = Date.now();
    const id = setInterval(() => setPipelineElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [pipelineBusy]);

  if (!crop) {
    return <section className="screen"><EmptyState message="This listing is not connected to a crop." /><button className="primaryButton" onClick={embedded ? onBack : () => setActiveScreen("Etsy")}>{embedded ? "Back to collection" : "Open Etsy Farm"}</button></section>;
  }

  async function generateBatch(event) {
    event.preventDefault();
    setNotice("");
    setGenElapsed(0);
    setGenerating(true);
    try {
      const result = await runEtsyAction(`/api/crops/${crop.id}/batches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batchForm) });
      setNotice(result.message);
      setWorkflowStep("review");
    } catch { /* parent shows error */ } finally {
      setGenerating(false);
    }
  }

  async function runCritique() {
    setCritiqueResult(null);
    setCritElapsed(0);
    setCritiquing(true);
    try {
      const result = await runEtsyAction(`/api/crops/${crop.id}/critique`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason, prompt: batchForm.prompt, negativePrompt: batchForm.negativePrompt }),
      });
      setCritiqueResult(result.critique);
      setNotice(result.message);
    } catch { /* parent shows error */ } finally {
      setCritiquing(false);
    }
  }

  function applyImprovedPrompt() {
    if (!critiqueResult?.improvedPrompt) return;
    const additions = (critiqueResult.negativePromptAdditions || []).join(", ");
    setBatchForm((current) => ({
      ...current,
      prompt: critiqueResult.improvedPrompt,
      negativePrompt: [current.negativePrompt, additions].filter(Boolean).join(", "),
    }));
    setNotice("Improved prompt applied to the Seed Batch form above. Generate when ready.");
  }

  async function saveLearnings(nextList) {
    try {
      await runEtsyAction(`/api/crops/${crop.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ styleLearnings: nextList }),
      });
    } catch { /* parent shows error */ }
  }
  function toggleLearning(learning) {
    saveLearnings((crop.styleLearnings || []).map((entry) => (entry.id === learning.id ? { ...entry, active: entry.active === false } : entry)));
  }
  function deleteLearning(learning) {
    saveLearnings((crop.styleLearnings || []).filter((entry) => entry.id !== learning.id));
  }
  function addManualLearning() {
    const text = manualLearning.trim();
    if (!text) return;
    const entry = { id: `learn-manual-${Date.now()}`, text, active: true, source: "manual", createdAt: new Date().toISOString() };
    saveLearnings([...(crop.styleLearnings || []), entry]);
    setManualLearning("");
  }

  async function updateAsset(assetId, status) {
    try {
      const result = await runEtsyAction(`/api/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      setNotice(result.message);
    } catch { /* parent shows error */ }
  }

  async function remixAsset(asset) {
    try {
      const result = await runEtsyAction(`/api/crops/${crop.id}/batches`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: asset.provider === "manual" ? "openai" : asset.provider, model: asset.model === "manual-import" ? "mock-image-v1" : asset.model, batchSize: 1, prompt: `${asset.prompt || crop.promptTemplate}. Create a distinct remix with a fresh composition.`, negativePrompt: asset.negativePrompt, dimensions: asset.dimensions, quality: asset.quality }),
      });
      setNotice(result.message);
    } catch { /* parent shows error */ }
  }

  async function importImage(event, isMockup = false, isReference = false) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await runEtsyAction("/api/assets/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cropId: crop.id, batchId: cropBatches[0]?.id, fileName: file.name, dataUrl: reader.result, isMockup, isReference }) });
        setNotice(result.message);
      } catch { /* parent shows error */ }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function createListing() {
    try {
      const result = await runEtsyAction(`/api/crops/${crop.id}/listing-draft`, { method: "POST" });
      setNotice(result.message);
    } catch { /* parent shows error */ }
  }

  async function saveListing(event) {
    event.preventDefault();
    try {
      const result = await runEtsyAction(`/api/listing-drafts/${listing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(listingForm) });
      setNotice(result.message);
      setWorkflowStep("publish");
    } catch { /* parent shows error */ }
  }

  function applyListingPreset(presetId) {
    const preset = etsyListingPresets.find((entry) => entry.id === presetId);
    if (!preset || !listingForm) return;
    const currentTags = String(listingForm.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
    const previousPresetTags = new Set(
      (listingForm.presetTagsApplied || []).map((tag) => String(tag).trim().toLowerCase())
    );
    const customTags = currentTags.filter((tag) => !previousPresetTags.has(tag.toLowerCase()));
    const seen = new Set();
    const mergedTags = [...customTags, ...(preset.tags || [])]
      .map((tag) => String(tag).trim().slice(0, 20))
      .filter((tag) => {
        const key = tag.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 13);
    setListingForm({
      ...listingForm,
      presetId: preset.id,
      taxonomyId: preset.taxonomyId || listingForm.taxonomyId || "",
      taxonomyPath: preset.taxonomyPath || "",
      tags: mergedTags.join(", "),
      presetTagsApplied: [...(preset.tags || [])],
    });
    setTaxonomyQuery(String(preset.taxonomyPath || preset.name || "").split(">").pop().trim());
    setNotice(`${preset.name} applied: category #${preset.taxonomyId} and ${mergedTags.length} Etsy tags filled.`);
  }

  async function exportListing() {
    try {
      const result = await runEtsyAction(`/api/listing-drafts/${listing.id}/export`, { method: "POST" });
      setNotice(`${result.message} ${result.exportPath}`);
    } catch { /* parent shows error */ }
  }

  async function savePerformance(event) {
    event.preventDefault();
    try {
      const result = await runEtsyAction(`/api/crops/${crop.id}/performance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(performanceForm) });
      setNotice(`${result.recommendation.decision}: ${result.recommendation.reason}`);
    } catch { /* parent shows error */ }
  }

  async function runListingPipeline() {
    if (!listing || !listingForm) return;
    setPipelineLabel(listing.externalListingId ? "Resuming Etsy draft" : "Creating Etsy draft");
    setPipelineElapsed(0);
    setPipelineBusy(true);
    try {
      await runEtsyAction(`/api/listing-drafts/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listingForm),
      });
      const result = await runEtsyAction(`/api/crops/${crop.id}/etsy-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingDraftId: listing.id }),
      });
      setNotice(result.message);
    } catch { /* parent shows error */ } finally {
      setPipelineBusy(false);
    }
  }

  async function activateListing() {
    if (!listing?.externalListingId) return;
    setPipelineLabel("Publishing and verifying Etsy listing");
    setPipelineElapsed(0);
    setPipelineBusy(true);
    try {
      const result = await runEtsyAction(`/api/listing-drafts/${listing.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: draftReviewed, confirmation: publishConfirmation }),
      });
      setNotice(result.message);
      setDraftReviewed(false);
      setPublishConfirmation("");
    } catch { /* parent shows error */ } finally {
      setPipelineBusy(false);
    }
  }

  async function loadTaxonomy() {
    try {
      const result = await runEtsyAction("/api/integrations/etsy/taxonomy");
      setTaxonomyOptions(flattenTaxonomy(result.results || result));
      setNotice("Etsy categories loaded. Search and choose the closest product category.");
    } catch { /* parent shows error */ }
  }

  const conversionRate = latestPerformance?.clicks ? (Number(latestPerformance.orders || 0) / Number(latestPerformance.clicks) * 100).toFixed(1) : "0.0";
  const profit = Number(latestPerformance?.revenue || 0) - Number(latestPerformance?.spend || 0);
  const approvedCount = cropAssets.filter((asset) => !asset.isReference && ["approved", "final"].includes(asset.status)).length;
  const workflowSteps = [
    { key: "create", label: "Create", done: cropAssets.some((asset) => !asset.isReference) },
    { key: "review", label: "Review", done: approvedCount > 0 },
    { key: "listing", label: "Listing", done: Boolean(listing) },
    { key: "publish", label: "Publish", done: listing?.externalState === "active" },
    { key: "performance", label: "Performance", done: Boolean(latestPerformance) },
  ];

  return (
    <section className={embedded ? "screen cropDetail embeddedListingWorkflow" : "screen cropDetail"} data-step={workflowStep}>
      <button className="backButton" onClick={embedded ? onBack : () => setActiveScreen("Etsy")}>{embedded ? backLabel || "← Back to collection" : "← Etsy Farm"}</button>
      <div className="cropTitleRow">
        <div><p className="eyebrow">Crop</p><h3>{crop.name}</h3><p>{crop.niche} · {titleCase(crop.productType)}</p></div>
        <div className="titleBadges"><StatusBadge value={crop.status} />{crop.podCandidate && <span className="podFlag">POD candidate</span>}</div>
      </div>
      <nav className="workflowStepper" aria-label="Listing workflow">
        {workflowSteps.map((step, index) => (
          <button
            className={`${workflowStep === step.key ? "active" : ""} ${step.done ? "done" : ""}`}
            key={step.key}
            onClick={() => setWorkflowStep(step.key)}
          >
            <span>{step.done ? "✓" : index + 1}</span>
            {step.label}
          </button>
        ))}
      </nav>
      {notice && <div className="successNotice">{notice}</div>}

      <article className="panel cropBrief">
        <div className="panelHeader"><div><p className="eyebrow">1 · Brief</p><h3>What are we growing?</h3></div></div>
        <div className="briefGrid">
          <div><span>Target customer</span><p>{crop.targetCustomer || "Not set"}</p></div>
          <div><span>Aesthetic / style</span><p>{crop.aestheticNotes || "Not set"}</p></div>
          <div className="spanTwo"><span>Prompt template</span><p>{crop.promptTemplate || "Not set"}</p></div>
        </div>
      </article>

      <article className="panel">
        <div className="panelHeader"><div><p className="eyebrow">Create</p><h3>Generate images</h3></div><div className="inlineActions"><label className="importButton">Add reference<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => importImage(event, false, true)} /></label><label className="importButton">Upload image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => importImage(event, false, false)} /></label><label className="importButton">Add mockup<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => importImage(event, true, false)} /></label></div></div>
        <form className="batchGenerator" onSubmit={generateBatch}>
          <label>Provider<select value={batchForm.provider} onChange={(event) => setBatchForm({ ...batchForm, provider: event.target.value, model: event.target.value === "openai" ? "gpt-image-2" : event.target.value === "mock" ? "local-mock-v1" : batchForm.model })}><option value="openai">OpenAI (real)</option><option value="mock">Local mock</option><option value="gemini">Gemini (stub)</option><option value="manual">Manual / imported</option></select></label>
          <label>Model<input value={batchForm.model} onChange={(event) => setBatchForm({ ...batchForm, model: event.target.value })} /></label>
          <label>Batch size<input type="number" min="1" max="10" value={batchForm.batchSize} onChange={(event) => setBatchForm({ ...batchForm, batchSize: event.target.value })} /></label>
          <label>Dimensions<select value={batchForm.dimensions} onChange={(event) => setBatchForm({ ...batchForm, dimensions: event.target.value })}><option>1024x1536</option><option>1536x1024</option><option>1024x1024</option></select></label>
          <label>Quality<select value={batchForm.quality} onChange={(event) => setBatchForm({ ...batchForm, quality: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label className="spanTwo">Prompt<textarea value={batchForm.prompt} onChange={(event) => setBatchForm({ ...batchForm, prompt: event.target.value })} /></label>
          <label className="spanTwo">Negative prompt<input value={batchForm.negativePrompt} onChange={(event) => setBatchForm({ ...batchForm, negativePrompt: event.target.value })} /></label>
          {cropAssets.some((asset) => asset.isReference) && <div className="spanTwo assetPicker"><span>Reference inputs</span>{cropAssets.filter((asset) => asset.isReference).map((asset) => <label className="checkLabel" key={asset.id}><input type="checkbox" checked={(batchForm.referenceAssetIds || []).includes(asset.id)} onChange={(event) => setBatchForm({ ...batchForm, referenceAssetIds: event.target.checked ? [...(batchForm.referenceAssetIds || []), asset.id] : (batchForm.referenceAssetIds || []).filter((id) => id !== asset.id) })} />{asset.fileName}</label>)}</div>}
          <button className="primaryButton" type="submit" disabled={generating || (batchForm.provider === "openai" && !integrationStatus?.openai?.configured)}>{generating ? "Generating…" : batchForm.provider === "manual" ? "Create Batch" : "Generate Images"}</button>
        </form>
        {generating && (
          <ElapsedProgress
            label={batchForm.provider === "openai" ? "Generating images with OpenAI" : "Generating images"}
            elapsed={genElapsed}
            expectedSeconds={60}
          />
        )}
        {(crop.styleLearnings || []).some((learning) => learning.active !== false) && (
          <p className="smallMuted learningsNote">✨ {(crop.styleLearnings || []).filter((learning) => learning.active !== false).length} style learning(s) will be folded into this batch&rsquo;s prompt — manage them in &ldquo;Critique &amp; style learnings&rdquo; below.</p>
        )}
        <div className="batchStrip">
          {cropBatches.map((batch) => <div key={batch.id}><StatusBadge value={batch.status} /><strong>{batch.provider} · {batch.model}</strong><span>{batch.quantity} images · {money(batch.estimatedCost)}</span></div>)}
          {!cropBatches.length && <EmptyState message="No Seed Batches yet." />}
        </div>
      </article>

      <article className="panel">
        <div className="panelHeader"><div><p className="eyebrow">Review</p><h3>Choose images</h3></div></div>
        <div className="assetGrid">
          {cropAssets.filter((asset) => !asset.isReference).map((asset) => (
            <div className={`assetCard asset-${engineDesignStatus(asset)}`} key={asset.id}>
              <img src={`${API_BASE}${asset.publicUrl}`} alt={`${crop.name} ${asset.fileName}`} />
              <div className="assetBody"><div className="rowBetween"><StatusBadge value={engineDesignStatus(asset)} /><small>{asset.provider}</small></div><strong>{asset.fileName}</strong><small>{asset.model} · {asset.dimensions}</small></div>
              {asset.isReference ? <div className="referenceNote">Reference input · never exported or published</div> : <div className="assetActions"><button onClick={() => updateAsset(asset.id, "approved")}>Approve</button><button onClick={() => updateAsset(asset.id, "rejected")}>Reject</button><button onClick={() => remixAsset(asset)} title="Generates a new batch — this spends credits">Remix (generates)</button></div>}
            </div>
          ))}
          {!cropAssets.length && <EmptyState message="Generate or import a Seed Batch to begin review." />}
        </div>
      </article>

      <details className="panel critiquePanel workflowDetails">
        <summary>Improve rejected images</summary>
        <div className="panelHeader">
          <div><p className="eyebrow">Improve · compounding loop</p><h3>Critique rejects &amp; style learnings</h3></div>
          <span className="smallMuted">{cropAssets.filter((asset) => !asset.isReference && engineDesignStatus(asset) === "rejected").length} rejected · learnings auto-apply to new batches</span>
        </div>

        <div className="critiqueAction">
          <label className="smallLabel spanTwo">Why did you reject them? (optional — a reason sharpens the critique)
            <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="e.g. text appeared, background too busy, off-brand colors" />
          </label>
          <button
            className="primaryButton"
            disabled={critiquing || !cropAssets.some((asset) => !asset.isReference && engineDesignStatus(asset) === "rejected") || !integrationStatus?.openai?.configured}
            onClick={runCritique}
          >
            {critiquing ? "Critiquing…" : "Critique rejects & improve prompt"}
          </button>
        </div>
        {!integrationStatus?.openai?.configured && <p className="smallMuted">Add OPENAI_API_KEY to .env.local to enable critique.</p>}

        {critiquing && (
          <ElapsedProgress
            label="Improving the prompt from rejected images"
            elapsed={critElapsed}
            expectedSeconds={45}
          />
        )}

        {critiqueResult && (
          <div className="critiqueResult">
            <div className="detailBox"><strong>Critique{critiqueResult.imagesUsed ? ` (${critiqueResult.imagesUsed} image(s) analyzed)` : " (text-only)"}</strong><p>{critiqueResult.critique}</p></div>
            {critiqueResult.improvedPrompt && (
              <div className="detailBox">
                <div className="rowBetween"><strong>Improved prompt</strong><button className="secondaryButton" onClick={applyImprovedPrompt}>Use this prompt ↑</button></div>
                <p>{critiqueResult.improvedPrompt}</p>
              </div>
            )}
            {critiqueResult.negativePromptAdditions?.length > 0 && (
              <div className="detailBox"><strong>Suggested negative-prompt additions</strong><p>{critiqueResult.negativePromptAdditions.join(", ")}</p></div>
            )}
          </div>
        )}

        <div className="learningsBlock">
          <div className="rowBetween">
            <strong>Style learnings ({(crop.styleLearnings || []).filter((learning) => learning.active !== false).length} active)</strong>
            <span className="smallMuted">Applied to every new batch for this crop. ● active · ○ muted.</span>
          </div>
          <div className="learningChips">
            {(crop.styleLearnings || []).map((learning) => (
              <span className={`learningChip ${learning.active === false ? "off" : ""}`} key={learning.id}>
                <button className="learningToggle" onClick={() => toggleLearning(learning)} title={learning.active === false ? "muted — click to activate" : "active — click to mute"}>{learning.active === false ? "○" : "●"}</button>
                <span>{learning.text}</span>
                {learning.source === "manual" && <em className="learningSrc">yours</em>}
                <button className="learningDelete" onClick={() => deleteLearning(learning)} title="delete">×</button>
              </span>
            ))}
            {!(crop.styleLearnings || []).length && <EmptyState message="No learnings yet. Reject some images and run a critique — the rules it finds accumulate here and steer future batches." />}
          </div>
          <div className="inlineActions learningAdd">
            <input value={manualLearning} onChange={(event) => setManualLearning(event.target.value)} placeholder="Add your own rule (e.g. always transparent background, no text)" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualLearning(); } }} />
            <button className="ghostButton" disabled={!manualLearning.trim()} onClick={addManualLearning}>Add rule</button>
          </div>
        </div>
      </details>

      <article className="panel">
        <div className="panelHeader"><div><p className="eyebrow">4 · Listing Draft</p><h3>Build the Etsy offer</h3></div>{!listing && <button className="primaryButton" onClick={createListing}>Create Listing Draft</button>}</div>
        {listing && listingForm ? (
          <form className="listingForm" onSubmit={saveListing}>
            <label>Listing preset
              <select value={listingForm.presetId || ""} onChange={(event) => applyListingPreset(event.target.value)}>
                <option value="">Choose a preset</option>
                {etsyListingPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </select>
            </label>
            <div className="presetSummary"><span>Category</span><strong>{String(listingForm.taxonomyPath || "Choose a preset").split(">").pop().trim()}</strong></div>
            <label className="spanTwo">Title<input value={listingForm.title} onChange={(event) => setListingForm({ ...listingForm, title: event.target.value })} /></label>
            <label className="spanTwo">Description<textarea value={listingForm.description} onChange={(event) => setListingForm({ ...listingForm, description: event.target.value })} /></label>
            <label className="spanTwo">Tags<input value={listingForm.tags} onChange={(event) => setListingForm({ ...listingForm, tags: event.target.value })} /></label>
            <details className="spanTwo advancedFields">
              <summary>Advanced listing details</summary>
              <div className="advancedFieldsGrid">
                <label>Product type<select value={listingForm.productType} onChange={(event) => setListingForm({ ...listingForm, productType: event.target.value })}><option value="digital_download">Digital download</option><option value="printable">Printable</option><option value="sticker_sheet">Sticker sheet</option><option value="wall_art">Wall art</option></select></label>
                <label>Price<input type="number" min="0" step="0.01" value={listingForm.price} onChange={(event) => setListingForm({ ...listingForm, price: event.target.value })} /></label>
                <div className="taxonomyPicker"><span>Etsy category</span><div className="inlineActions"><input value={taxonomyQuery} onChange={(event) => setTaxonomyQuery(event.target.value)} placeholder="Search categories" /><button className="ghostButton" type="button" onClick={loadTaxonomy}>Load Etsy categories</button></div>{taxonomyOptions.length > 0 ? <select required value={listingForm.taxonomyId || ""} onChange={(event) => setListingForm({ ...listingForm, taxonomyId: event.target.value })}><option value="">Choose a category</option>{taxonomyOptions.filter((option) => option.name.toLowerCase().includes(taxonomyQuery.toLowerCase())).slice(0, 100).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select> : <input inputMode="numeric" required value={listingForm.taxonomyId || ""} onChange={(event) => setListingForm({ ...listingForm, taxonomyId: event.target.value })} placeholder="Load categories or enter an ID" />}</div>
                <label>Quantity<input type="number" min="1" value={listingForm.quantity || 1} onChange={(event) => setListingForm({ ...listingForm, quantity: event.target.value })} /></label>
                <label className="spanTwo">Materials / format notes<textarea value={listingForm.materials} onChange={(event) => setListingForm({ ...listingForm, materials: event.target.value })} /></label>
                <label className="spanTwo">AI disclosure<textarea required value={listingForm.aiDisclosure} onChange={(event) => setListingForm({ ...listingForm, aiDisclosure: event.target.value })} /></label>
              </div>
            </details>
            <div className="spanTwo assetPicker"><span>Final files attached</span>{cropAssets.filter((asset) => ["approved", "final"].includes(asset.status) && !asset.isMockup).map((asset) => <label className="checkLabel" key={asset.id}><input type="checkbox" checked={(listingForm.assetIds || []).includes(asset.id)} onChange={(event) => setListingForm({ ...listingForm, assetIds: event.target.checked ? [...(listingForm.assetIds || []), asset.id] : (listingForm.assetIds || []).filter((id) => id !== asset.id) })} />{asset.fileName}</label>)}</div>
            {cropAssets.some((asset) => asset.isMockup) && <div className="spanTwo assetPicker"><span>Mockups</span>{cropAssets.filter((asset) => asset.isMockup).map((asset) => <label className="checkLabel" key={asset.id}><input type="checkbox" checked={(listingForm.mockupAssetIds || []).includes(asset.id)} onChange={(event) => setListingForm({ ...listingForm, mockupAssetIds: event.target.checked ? [...(listingForm.mockupAssetIds || []), asset.id] : (listingForm.mockupAssetIds || []).filter((id) => id !== asset.id) })} />{asset.fileName}</label>)}</div>}
            <div className="spanTwo listingActions"><button className="primaryButton" type="submit">Save & Continue</button><button className="ghostButton" type="button" onClick={exportListing}>Export files</button></div>
            {listing.exportPath && <p className="spanTwo exportPath">Last export: {listing.exportPath}</p>}
          </form>
        ) : !listing ? <EmptyState message="Approve at least one asset, then create the Etsy listing draft." /> : null}
      </article>

      <article className="panel pipelinePanel">
        <div className="panelHeader"><div><p className="eyebrow">Etsy</p><h3>Publish</h3></div><StatusBadge value={latestPipeline?.status || "not_run"} /></div>
        {pipelineBusy && <ElapsedProgress label={pipelineLabel} elapsed={pipelineElapsed} expectedSeconds={35} />}
        <div className="pipelineReadiness">
          <div><span>OpenAI</span><strong>{integrationStatus?.openai?.configured ? "Configured" : "Needs key"}</strong></div>
          <div><span>Etsy</span><strong>{integrationStatus?.etsy?.authorized ? integrationStatus.etsy.shopName || "Authorized" : "Not connected"}</strong></div>
          <div><span>Remote listing</span><strong>{listing?.externalListingId || "Not created"}</strong></div>
          <div><span>Remote state</span><strong>{listing?.externalState || "Local only"}</strong></div>
        </div>
        {latestPipeline?.steps?.length > 0 && <details className="pipelineDetails"><summary>Technical details</summary><div className="pipelineSteps">{latestPipeline.steps.map((step) => <div key={step.name}><StatusBadge value={step.status} /><strong>{titleCase(step.name)}</strong><small>{step.error || step.reason || step.url || ""}</small></div>)}</div></details>}
        {(listing?.externalEditUrl || listing?.externalListingUrl) && <a href={listing.externalEditUrl || listing.externalListingUrl} target="_blank" rel="noreferrer">Open Etsy draft in the listing editor ↗</a>}
        <div className="publishControls">
          <div>
            <strong>Create or repair Etsy draft</strong>
            <p className="smallMuted">Uploads the preview and customer file, sets the listing to a download, and always stops before activation.</p>
          </div>
          <button className="primaryButton" disabled={!listing || !integrationStatus?.etsy?.authorized || listing?.externalState === "active"} onClick={runListingPipeline}>{listing?.externalListingId ? "Resume / Verify Digital Draft" : "Create Verified Digital Draft"}</button>
        </div>
        {listing?.externalListingId && listing?.externalState !== "active" && (
          <div className="activationGate">
            <div>
              <strong>Publish listing</strong>
              <p className="smallMuted">Open the draft above and check its price, preview, digital file, title, description, category, and AI disclosure.</p>
            </div>
            <label className="checkLabel"><input type="checkbox" checked={draftReviewed} onChange={(event) => setDraftReviewed(event.target.checked)} />I reviewed this exact draft in Etsy.</label>
            <label>Type <strong>PUBLISH {listing.externalListingId}</strong> to confirm
              <input value={publishConfirmation} onChange={(event) => setPublishConfirmation(event.target.value)} placeholder={`PUBLISH ${listing.externalListingId}`} />
            </label>
            <button className="dangerButton" disabled={!draftReviewed || publishConfirmation !== `PUBLISH ${listing.externalListingId}`} onClick={activateListing}>Activate and Verify Live</button>
            <p className="smallMuted">Activation makes the listing public and may incur Etsy’s listing fee. There is no automatic activation inside the draft pipeline.</p>
          </div>
        )}
        {listing?.externalState === "active" && <div className="successNotice">This Etsy listing is verified active.</div>}
      </article>

      <article className="panel">
        <div className="panelHeader"><div><p className="eyebrow">6 · Performance</p><h3>Track signal, then decide</h3></div>{latestPerformance && <div className="recommendation"><span>Recommendation</span><strong>{crop.recommendation || "Remix"}</strong></div>}</div>
        <div className="performanceSummary"><div><span>Conversion</span><strong>{conversionRate}%</strong></div><div><span>Profit estimate</span><strong>{money(profit)}</strong></div><div><span>Decision</span><strong>{crop.decision || crop.recommendation || "Needs signal"}</strong></div></div>
        <form className="performanceForm" onSubmit={savePerformance}>
          {[["views", "Views"], ["favorites", "Favorites"], ["clicks", "Clicks"], ["orders", "Orders"], ["revenue", "Revenue"], ["spend", "Spend"]].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step={key === "revenue" || key === "spend" ? "0.01" : "1"} value={performanceForm[key]} onChange={(event) => setPerformanceForm({ ...performanceForm, [key]: event.target.value })} /></label>)}
          <label className="spanTwo">Performance notes<textarea value={performanceForm.notes} onChange={(event) => setPerformanceForm({ ...performanceForm, notes: event.target.value })} /></label>
          <button className="primaryButton" type="submit">Save Snapshot & Recommend</button>
        </form>
        <div className="decisionButtons"><span>Set final crop decision:</span>{["Repeat", "Remix", "Expand to POD", "Kill"].map((decision) => <button className={crop.decision === decision ? "active" : ""} key={decision} onClick={async () => { try { await runEtsyAction(`/api/crops/${crop.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, status: decision === "Kill" ? "archived" : crop.status }) }); setNotice(`Decision saved: ${decision}`); } catch { /* parent shows error */ } }}>{decision === "Repeat" ? "Replant" : decision === "Kill" ? "Compost" : decision}</button>)}</div>
      </article>
    </section>
  );
}

function DashboardScreen({
  stats,
  summary,
  contentItems,
  topPerformer,
  getAccount,
  getFormat,
  setActiveScreen,
  updateContentItem,
}) {
  return (
    <section className="screen">
      <div className="statGrid">
        <StatCard
          label="Streams"
          value={`${stats.activeStreams}/${stats.streams}`}
          hint="active crops"
        />
        <StatCard label="Plots" value={stats.accounts} hint="accounts & shops" />
        <StatCard label="Plantings" value={stats.batches} hint="batches" />
        <StatCard label="Harvests" value={stats.contentItems} hint="assets" />
        <StatCard label="Needs Tending" value={stats.needsYou} hint="your call" />
        <StatCard label="Revenue" value={`$${stats.revenue}`} hint="all time" />
      </div>

      <div className="twoColumn">
        <div className="panel">
          <div className="panelHeader">
            <h3>Needs Tending</h3>
            <p>Only exceptions and judgment calls should appear here.</p>
          </div>

          <div className="postList">
            {!summary && <EmptyState message="Loading dashboard..." />}

            {summary && summary.needsYou.length === 0 && (
              <EmptyState message="All tended 🌱 Nothing needs your judgment right now." />
            )}

            {summary &&
              summary.needsYou.map((item) => (
                <article
                  className="needCard"
                  key={item.contentItemId || item.experimentId}
                >
                  <h4>{item.topic}</h4>
                  <p>{item.account}</p>
                  <p>{item.reason}</p>

                  <div className="inlineActions">
                    <button
                      className="primaryButton"
                      onClick={() => setActiveScreen("Studio")}
                    >
                      Open Planting Shed
                    </button>
                  </div>
                </article>
              ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <h3>Best Crop</h3>
            <p>Quick check-in for what is currently growing best.</p>
          </div>

          {!topPerformer && (
            <EmptyState message="No published content with metrics yet." />
          )}

          {topPerformer && (
            <article className="topPerformer">
              <ContentMeta
                item={topPerformer}
                account={getAccount(topPerformer.accountId)}
                format={getFormat(topPerformer.formatId)}
              />

              <h4>{topPerformer.topic}</h4>
              <p>{topPerformer.hook}</p>

              <div className="metricPills">
                <span>{topPerformer.metrics.views} views</span>
                <span>{topPerformer.metrics.likes} likes</span>
                <span>{topPerformer.metrics.comments} comments</span>
                <span>${topPerformer.metrics.revenue} revenue</span>
              </div>

              <div className="inlineActions">
                <button
                  className="secondaryButton"
                  onClick={() =>
                    updateContentItem(topPerformer.id, { decision: "remix" })
                  }
                >
                  Mark Remix
                </button>

                <button
                  className="primaryButton"
                  onClick={() =>
                    updateContentItem(topPerformer.id, { decision: "repeat" })
                  }
                >
                  Mark Repeat
                </button>
              </div>
            </article>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <h3>Fresh Harvests</h3>
          <p>The newest generated assets across all plots.</p>
        </div>

        <div className="contentPreviewGrid">
          {contentItems.slice(0, 6).map((item) => (
            <ContentPreviewCard
              key={item.id}
              item={item}
              account={getAccount(item.accountId)}
              format={getFormat(item.formatId)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function StreamsScreen({
  incomeStreams,
  accounts,
  batches,
  createIncomeStream,
  updateIncomeStream,
}) {
  const [streamForm, setStreamForm] = useState({
    name: "",
    streamType: "short_video_account",
    platform: "",
    goal: "",
  });

  async function submitStream(event) {
    event.preventDefault();

    if (!streamForm.name.trim()) {
      return;
    }

    await createIncomeStream({
      name: streamForm.name.trim(),
      streamType: streamForm.streamType,
      platform: streamForm.platform.trim(),
      goal: streamForm.goal.trim(),
      status: "testing",
    });

    setStreamForm({
      name: "",
      streamType: "short_video_account",
      platform: "",
      goal: "",
    });
  }

  return (
    <section className="screen studioGrid">
      <div className="panel createPanel">
        <div className="panelHeader">
          <h3>Plant a Stream</h3>
          <p>
            A stream is one monetization lane — a crop type. New streams start
            in testing until they earn their place.
          </p>
        </div>

        <form className="createForm" onSubmit={submitStream}>
          <label>
            Name
            <input
              value={streamForm.name}
              onChange={(event) =>
                setStreamForm({ ...streamForm, name: event.target.value })
              }
              placeholder="Etsy Sticker Garden"
            />
          </label>

          <label>
            Stream type
            <select
              value={streamForm.streamType}
              onChange={(event) =>
                setStreamForm({ ...streamForm, streamType: event.target.value })
              }
            >
              {STREAM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Platform
            <input
              value={streamForm.platform}
              onChange={(event) =>
                setStreamForm({ ...streamForm, platform: event.target.value })
              }
              placeholder="Etsy, YouTube, TikTok..."
            />
          </label>

          <label>
            Goal
            <textarea
              value={streamForm.goal}
              onChange={(event) =>
                setStreamForm({ ...streamForm, goal: event.target.value })
              }
              placeholder="What should this crop grow into?"
            />
          </label>

          <button className="primaryButton formSubmit" type="submit">
            Plant Stream
          </button>
        </form>
      </div>

      <div className="panel widePanel">
        <div className="panelHeader">
          <h3>Your Crops</h3>
          <p>
            Every income stream on the farm, with its plots and plantings.
            Short-form content is fully working today; other crop types are
            tracked manually until their modules arrive.
          </p>
        </div>

        <div className="postList">
          {incomeStreams.length === 0 && (
            <EmptyState message="No streams yet. Plant your first crop on the left." />
          )}

          {incomeStreams.map((stream) => {
            const streamAccounts = accounts.filter(
              (account) => account.incomeStreamId === stream.id
            );

            const streamBatches = batches.filter(
              (batch) => batch.incomeStreamId === stream.id
            );

            return (
              <article className="libraryCard streamCard" key={stream.id}>
                <div className="rowBetween">
                  <div>
                    <p className="eyebrow">{titleCase(stream.streamType)}</p>
                    <h4>{stream.name}</h4>
                  </div>

                  <label className="smallLabel">
                    Status
                    <select
                      value={stream.status}
                      onChange={(event) =>
                        updateIncomeStream(stream.id, {
                          status: event.target.value,
                        })
                      }
                    >
                      {STREAM_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {titleCase(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {stream.goal && (
                  <div className="detailBox">
                    <strong>Goal</strong>
                    <p>{stream.goal}</p>
                  </div>
                )}

                <div className="libraryMeta">
                  <span>{stream.platform || "No platform yet"}</span>
                  <span>{streamAccounts.length} plots</span>
                  <span>{streamBatches.length} plantings</span>
                </div>

                {streamAccounts.length > 0 && (
                  <div className="detailBox">
                    <strong>Plots</strong>
                    <p>
                      {streamAccounts
                        .map((account) => account.name)
                        .join(" · ")}
                    </p>
                  </div>
                )}

                {stream.notes && <p className="smallMuted">{stream.notes}</p>}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StudioScreen({
  accounts,
  formats,
  batches,
  contentItems,
  batchForm,
  setBatchForm,
  createBatch,
  getAccount,
  getFormat,
  getBatch,
  updateContentItem,
}) {
  return (
    <section className="screen studioGrid">
      <div className="panel createPanel">
        <div className="panelHeader">
          <h3>Plant a Batch</h3>
          <p>
            Generates placeholder content items for now. Later this plugs into AI
            generation.
          </p>
        </div>

        <form className="createForm" onSubmit={createBatch}>
          <label>
            Plot (account / shop / channel)
            <select
              value={batchForm.accountId}
              onChange={(event) =>
                setBatchForm({ ...batchForm, accountId: event.target.value })
              }
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {account.platform}
                </option>
              ))}
            </select>
          </label>

          <label>
            Format
            <select
              value={batchForm.formatId}
              onChange={(event) =>
                setBatchForm({ ...batchForm, formatId: event.target.value })
              }
            >
              {formats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.name} — {format.defaultTargetLengthSeconds}s
                </option>
              ))}
            </select>
          </label>

          <div className="formRow">
            <label>
              Quantity
              <input
                type="number"
                min="1"
                max="50"
                value={batchForm.quantity}
                onChange={(event) =>
                  setBatchForm({ ...batchForm, quantity: event.target.value })
                }
              />
            </label>

            <label>
              Length, seconds
              <input
                type="number"
                min="5"
                max="180"
                value={batchForm.targetLengthSeconds}
                onChange={(event) =>
                  setBatchForm({
                    ...batchForm,
                    targetLengthSeconds: event.target.value,
                  })
                }
              />
            </label>
          </div>

          <label>
            Automation mode
            <select
              value={batchForm.automationMode}
              onChange={(event) =>
                setBatchForm({
                  ...batchForm,
                  automationMode: event.target.value,
                })
              }
            >
              <option value="manual">Manual</option>
              <option value="assisted">Assisted</option>
              <option value="autopilot">Autopilot</option>
            </select>
          </label>

          <label>
            Batch goal
            <textarea
              value={batchForm.goal}
              onChange={(event) =>
                setBatchForm({ ...batchForm, goal: event.target.value })
              }
            />
          </label>

          <button className="primaryButton formSubmit" type="submit">
            Plant Batch
          </button>
        </form>

        <div className="miniDivider" />

        <div className="panelHeader compactHeader">
          <h3>Recent Plantings</h3>
        </div>

        <div className="postList">
          {batches.slice(0, 4).map((batch) => (
            <article className="backendListItem" key={batch.id}>
              <strong>{batch.goal}</strong>
              <p>
                {batch.quantity} items · {batch.targetLengthSeconds}s ·{" "}
                {batch.automationMode}
              </p>
            </article>
          ))}
        </div>
      </div>

      <div className="pipeline">
        {PIPELINE_STATUSES.map((status) => (
          <PipelineColumn
            key={status}
            status={status}
            items={contentItems.filter((item) => item.status === status)}
            getAccount={getAccount}
            getFormat={getFormat}
            getBatch={getBatch}
            updateContentItem={updateContentItem}
          />
        ))}
      </div>
    </section>
  );
}

function PipelineColumn({
  status,
  items,
  getAccount,
  getFormat,
  getBatch,
  updateContentItem,
}) {
  return (
    <section className="pipelineColumn">
      <div className="pipelineHeader">
        <h3>{titleCase(status)}</h3>
        <span>{items.length}</span>
      </div>

      <div className="postList">
        {items.length === 0 && (
          <EmptyState message={`No ${status} content items.`} />
        )}

        {items.map((item) => (
          <StudioItemCard
            key={item.id}
            item={item}
            account={getAccount(item.accountId)}
            format={getFormat(item.formatId)}
            batch={getBatch(item.batchId)}
            updateContentItem={updateContentItem}
          />
        ))}
      </div>
    </section>
  );
}

function StudioItemCard({ item, account, format, batch, updateContentItem }) {
  return (
    <article className="experimentCard">
      <ContentMeta item={item} account={account} format={format} />

      <h4>{item.topic}</h4>
      <p className="hookText">{item.hook}</p>

      <div className="detailBox">
        <strong>Script</strong>
        <p>{item.script || "No script yet."}</p>
      </div>

      <div className="detailBox">
        <strong>Batch</strong>
        <p>{batch?.goal || "No batch"}</p>
      </div>

      <label className="smallLabel">
        Final file path
        <input
          value={item.finalFilePath || ""}
          onChange={(event) =>
            updateContentItem(item.id, { finalFilePath: event.target.value })
          }
          placeholder="demo/generated/final-video.mp4"
        />
      </label>

      {["approved", "scheduled"].includes(item.status) && (
        <label className="smallLabel">
          Schedule time
          <input
            type="datetime-local"
            value={item.scheduledAt || ""}
            onChange={(event) =>
              updateContentItem(item.id, { scheduledAt: event.target.value })
            }
          />
        </label>
      )}

      <div className="cardActions">
        {item.status === "draft" && (
          <>
            <button
              className="secondaryButton"
              onClick={() =>
                updateContentItem(item.id, {
                  status: "review",
                  approvalRequired: true,
                })
              }
            >
              Send to Review
            </button>

            <button
              className="primaryButton"
              onClick={() =>
                updateContentItem(item.id, {
                  status: "approved",
                  approvalRequired: false,
                  riskFlags: [],
                  finalFilePath:
                    item.finalFilePath || `demo/generated/${item.id}.mp4`,
                })
              }
            >
              Auto-ready Demo
            </button>
          </>
        )}

        {item.status === "review" && (
          <>
            <button
              className="ghostButton"
              onClick={() =>
                updateContentItem(item.id, {
                  status: "draft",
                  approvalRequired: false,
                })
              }
            >
              Needs Edit
            </button>

            <button
              className="primaryButton"
              onClick={() =>
                updateContentItem(item.id, {
                  status: "approved",
                  approvalRequired: false,
                  riskFlags: [],
                })
              }
            >
              Approve
            </button>
          </>
        )}

        {item.status === "approved" && (
          <button
            className="secondaryButton"
            onClick={() =>
              updateContentItem(item.id, {
                status: "scheduled",
                scheduledAt: item.scheduledAt || getDefaultScheduleTime(),
              })
            }
          >
            Schedule
          </button>
        )}

        {item.status === "scheduled" && (
          <button
            className="primaryButton"
            onClick={() =>
              updateContentItem(item.id, {
                status: "published",
                publishedAt: new Date().toISOString(),
              })
            }
          >
            Mark Published
          </button>
        )}

        {item.status === "published" && (
          <button
            className="primaryButton"
            onClick={() =>
              updateContentItem(item.id, {
                status: "analyzed",
              })
            }
          >
            Mark Analyzed
          </button>
        )}

        <button
          className="ghostButton"
          onClick={() =>
            updateContentItem(item.id, {
              decision: "kill",
              status: "analyzed",
            })
          }
        >
          Kill
        </button>
      </div>
    </article>
  );
}

function LibraryScreen({ accounts, formats, batches }) {
  return (
    <section className="screen">
      <div className="threeColumn">
        <div className="panel">
          <div className="panelHeader">
            <h3>Plots</h3>
            <p>Each plot is an account, shop, or channel where a crop grows.</p>
          </div>

          <div className="postList">
            {accounts.map((account) => (
              <article className="libraryCard" key={account.id}>
                <p className="eyebrow">{account.platform}</p>
                <h4>{account.name}</h4>
                <p>{account.category}</p>

                <div className="libraryMeta">
                  <span>{account.automationMode}</span>
                  <span>{account.targetPostsPerWeek}/week</span>
                  <span>{account.status}</span>
                </div>

                <div className="detailBox">
                  <strong>Notes</strong>
                  <p>{account.notes}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <h3>Formats</h3>
            <p>Reusable recipes for repeatable content and products.</p>
          </div>

          <div className="postList">
            {formats.map((format) => (
              <article className="libraryCard" key={format.id}>
                <p className="eyebrow">Format</p>
                <h4>{format.name}</h4>

                <div className="libraryMeta">
                  <span>{format.qualityStatus}</span>
                  <span>{format.automationMode}</span>
                  <span>{format.defaultTargetLengthSeconds}s</span>
                </div>

                <div className="detailBox">
                  <strong>Notes</strong>
                  <p>{format.notes}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <h3>Plantings</h3>
            <p>Each planting is one generated batch of assets.</p>
          </div>

          <div className="postList">
            {batches.map((batch) => (
              <article className="libraryCard" key={batch.id}>
                <p className="eyebrow">{batch.status}</p>
                <h4>{batch.goal}</h4>

                <div className="libraryMeta">
                  <span>{batch.quantity} items</span>
                  <span>{batch.targetLengthSeconds}s</span>
                  <span>{batch.automationMode}</span>
                </div>

                <p className="smallMuted">{batch.id}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PerformanceScreen({
  contentItems,
  getAccount,
  getFormat,
  updateContentItem,
  updateMetric,
}) {
  const performanceItems = contentItems.filter((item) =>
    ["published", "analyzed"].includes(item.status)
  );

  return (
    <section className="screen">
      <div className="panel widePanel">
        <div className="panelHeader">
          <h3>Crop Report</h3>
          <p>
            Manual metrics for now. Later this will come from platform APIs and
            revenue connectors. Decide what to replant, remix, or leave fallow.
          </p>
        </div>

        <div className="postList">
          {performanceItems.length === 0 && (
            <EmptyState message="No published content yet. Mark scheduled content as published first." />
          )}

          {performanceItems.map((item) => (
            <article className="performanceCard" key={item.id}>
              <div className="postMain">
                <ContentMeta
                  item={item}
                  account={getAccount(item.accountId)}
                  format={getFormat(item.formatId)}
                />

                <h4>{item.topic}</h4>
                <p>{item.hook}</p>

                <div className="metricGrid">
                  {[
                    ["views", "Views"],
                    ["likes", "Likes"],
                    ["comments", "Comments"],
                    ["shares", "Shares"],
                    ["saves", "Saves"],
                    ["followsGained", "Follows"],
                    ["revenue", "Revenue"],
                  ].map(([metricKey, label]) => (
                    <label key={metricKey}>
                      {label}
                      <input
                        type="number"
                        value={item.metrics?.[metricKey] || 0}
                        onChange={(event) =>
                          updateMetric(item, metricKey, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="performanceActions">
                <label className="smallLabel">
                  Decision
                  <select
                    value={item.decision || ""}
                    onChange={(event) =>
                      updateContentItem(item.id, {
                        decision: event.target.value,
                      })
                    }
                  >
                    <option value="">No decision yet</option>
                    {DECISIONS.map((decision) => (
                      <option key={decision} value={decision}>
                        {titleCase(decision)}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="primaryButton"
                  onClick={() => updateContentItem(item.id, { decision: "repeat" })}
                >
                  Repeat
                </button>

                <button
                  className="secondaryButton"
                  onClick={() => updateContentItem(item.id, { decision: "remix" })}
                >
                  Remix
                </button>

                <button
                  className="ghostButton"
                  onClick={() => updateContentItem(item.id, { decision: "kill" })}
                >
                  Kill
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContentPreviewCard({ item, account, format }) {
  return (
    <article className="libraryCard">
      <ContentMeta item={item} account={account} format={format} />

      <h4>{item.topic}</h4>
      <p>{item.hook}</p>

      <div className="detailBox">
        <strong>Preview</strong>
        <p>{item.finalFilePath || "No final file attached yet."}</p>
      </div>

      <div className="metricPills">
        <span>{item.targetLengthSeconds}s</span>
        <span>score {item.qualityScore}</span>
        <span>{titleCase(item.status)}</span>
      </div>
    </article>
  );
}

function ContentMeta({ item, account, format }) {
  return (
    <div className="experimentMeta">
      <span>{account?.name || "Unknown account"}</span>
      <span>{format?.name || "Unknown format"}</span>
      <span>{titleCase(item.status)}</span>
      <span>{item.targetLengthSeconds}s</span>
      {item.scheduledAt && <span>{formatDateTime(item.scheduledAt)}</span>}
    </div>
  );
}

function BackendPanel({ title, children }) {
  return (
    <article className="backendPanel">
      <h4>{title}</h4>
      {children}
    </article>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <article className="statCard">
      <p>{label}</p>
      <strong>{value}</strong>
      {hint && <span className="statHint">{hint}</span>}
    </article>
  );
}
// --- Full-aspect design review modal --------------------------------------
// Opens a design at true aspect ratio with all its metadata and the review
// controls. Approve here means "accepted for listing use" — there is no
// separate "final" step (merged concept).
function ImageReviewModal({ design, crop, presets, marketplaceAccounts, onClose, onReview, onRemixRequest, onCompile }) {
  const [notes, setNotes] = useState(design?.notes || "");
  const [remixReason, setRemixReason] = useState(design?.remixReason || "");
  const [presetId, setPresetId] = useState(presets?.[0]?.id || "");
  const [accountId, setAccountId] = useState(marketplaceAccounts?.[0]?.id || "");

  if (!design) return null;
  const status = engineDesignStatus(design);
  const approved = status === "approved";
  const imageUrl = `${API_BASE}${design.publicUrl}`;

  return (
    <div className="reviewModalOverlay" onClick={onClose}>
      <div className="reviewModal" onClick={(event) => event.stopPropagation()}>
        <div className="reviewModalImageWrap">
          <img className="reviewModalImage" src={imageUrl} alt={design.fileName} />
        </div>

        <div className="reviewModalSide">
          <div className="rowBetween">
            <StatusBadge value={status} />
            <button className="ghostButton" onClick={onClose}>Close</button>
          </div>

          <h3>{crop?.name || design.fileName}</h3>

          <dl className="metaList">
            <div><dt>Filename</dt><dd>{design.fileName}</dd></div>
            <div><dt>Design ID</dt><dd>{design.id}</dd></div>
            <div><dt>Batch ID</dt><dd>{design.batchId || "—"}</dd></div>
            <div><dt>Source</dt><dd>{(design.source || design.provider || "—")}{design.sourceModel || design.model ? ` · ${design.sourceModel || design.model}` : ""}</dd></div>
            <div><dt>Dimensions</dt><dd>{design.dimensions || "source"}</dd></div>
            <div><dt>IP risk</dt><dd>{titleCase(design.ipRiskStatus || "unreviewed")}</dd></div>
            <div><dt>Quality</dt><dd>{titleCase(design.qualityStatus || "unreviewed")}</dd></div>
          </dl>

          {design.prompt && (
            <div className="detailBox"><strong>Prompt / metadata</strong><p>{design.prompt}</p></div>
          )}
          {design.parentDesignId && (
            <div className="detailBox"><strong>Remixed from</strong><p>{design.parentDesignId}{design.remixReason ? ` · ${design.remixReason}` : ""}</p></div>
          )}

          <label className="smallLabel">Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

          <div className="reviewModalActions">
            <button className="primaryButton" onClick={() => onReview({ status: "approved", notes })}>Approve</button>
            <button className="secondaryButton" onClick={() => onReview({ status: "needs_edit", notes })}>Needs edit</button>
            <button className="dangerButton" onClick={() => onReview({ status: "rejected", notes })}>Reject</button>
          </div>

          <div className="reviewModalRemix">
            <label className="smallLabel">Remix reason
              <input value={remixReason} onChange={(event) => setRemixReason(event.target.value)} placeholder="e.g. warmer palette, bolder outline" />
            </label>
            <button className="ghostButton" onClick={() => onRemixRequest({ remixReason })}>Request remix</button>
            <p className="smallMuted">Marks intent only — no generation runs and no credits are spent.</p>
          </div>

          {approved && presets?.length > 0 && (
            <div className="reviewModalCompile">
              <p className="eyebrow">Compile to listing</p>
              <label className="smallLabel">Preset
                <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
                  {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </select>
              </label>
              <label className="smallLabel">Marketplace account
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                  {marketplaceAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.platform})</option>)}
                </select>
              </label>
              <button className="primaryButton" onClick={() => onCompile({ presetId, accountId })}>Compile draft listing</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Dashboard: actionable work across all lands ---------------------------
const NAV_FOR_SECTION_KEY = {
  designs_awaiting_review: "Designs",
  designs_ready_for_pod: "Pod",
  blog_needs_review: "Blog",
  blog_ready_to_publish: "Blog",
  blog_needs_update: "Blog",
  blog_missing_seo: "Blog",
  blog_can_become_products: "Blog",
  blog_repurpose_queue: "Blog",
  pod_plans_missing_info: "Pod",
  pod_ready_for_printful: "Pod",
  pod_needs_attention: "Pod",
  listings_ready_to_publish: "Listings",
  publish_failed: "Listings",
  orders_need_attention: "Orders",
  channels_blocked: "Channels",
};

function DashboardSection({ eyebrow, title, items, emptyMessage, setActiveScreen }) {
  return (
    <article className="panel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="needsGrid twoWide">
        {!items?.length && <EmptyState message={emptyMessage} />}
        {items?.map((item) => (
          <button
            key={item.key}
            className="needsCard"
            onClick={() => setActiveScreen(NAV_FOR_SECTION_KEY[item.key] || "Dashboard")}
          >
            <span className="needsCount">{item.count}</span>
            <span className="needsLabel">
              {item.label}
              {item.detail && <small className="needsDetail">{item.detail}</small>}
            </span>
            <span aria-hidden="true" className="needsArrow">→</span>
          </button>
        ))}
      </div>
    </article>
  );
}

function EngineDashboardScreen({ engineDashboard, channels, setActiveScreen }) {
  const sections = engineDashboard?.sections || {};
  const counts = engineDashboard?.counts || {};
  const featuredChannels = [...channels]
    .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))
    .slice(0, 5);

  return (
    <section className="screen">
      <div className="farmHero">
        <div>
          <p className="eyebrow">Auto Farmland · multi-land engine</p>
          <h3>What needs you right now.</h3>
          <p>
            Blog Land is open for planting today. eBay direct is blocked and Etsy is
            pending — so the engine routes physical products through Printful and
            grows content while approvals catch up.
          </p>
        </div>
        <button className="primaryButton" onClick={() => setActiveScreen("Blog")}>
          Open Blog Land
        </button>
      </div>

      <div className="statGrid">
        <StatCard label="Seeds" value={counts.seeds ?? 0} hint="ideas to grow" />
        <StatCard label="Blog posts" value={counts.blogPosts ?? 0} hint="Blog Land" />
        <StatCard label="POD plans" value={counts.podPlans ?? 0} hint="Printful → eBay" />
        <StatCard label="Designs" value={counts.designs ?? 0} hint="asset library" />
        <StatCard label="Listings" value={counts.listings ?? 0} hint="direct marketplaces" />
      </div>

      <div className="landStrip">
        {featuredChannels.map((channel) => (
          <button className="landChip" key={channel.key} onClick={() => setActiveScreen("Channels")}>
            <strong>{channel.name}</strong>
            <StatusBadge value={channel.status} />
          </button>
        ))}
        <button className="landChip landChipMore" onClick={() => setActiveScreen("Channels")}>
          <strong>All lands</strong>
          <span className="smallMuted">{channels.length} channels →</span>
        </button>
      </div>

      <div className="twoColumn">
        <DashboardSection
          eyebrow="Approve & judge"
          title="Needs Review"
          items={sections.needsReview}
          emptyMessage="Nothing waiting for review."
          setActiveScreen={setActiveScreen}
        />
        <DashboardSection
          eyebrow="Push it out"
          title="Ready to Publish"
          items={sections.readyToPublish}
          emptyMessage="Nothing ready to publish yet — approve a draft first."
          setActiveScreen={setActiveScreen}
        />
      </div>
      <div className="twoColumn">
        <DashboardSection
          eyebrow="Blockers & gaps"
          title="Needs Attention"
          items={sections.needsAttention}
          emptyMessage="No blockers. All lands are tended."
          setActiveScreen={setActiveScreen}
        />
        <DashboardSection
          eyebrow="Compound the wins"
          title="Growth Opportunities"
          items={sections.growthOpportunities}
          emptyMessage="Publish something first — repurposing ideas appear here."
          setActiveScreen={setActiveScreen}
        />
      </div>
    </section>
  );
}

// --- Design Review: grid + full-aspect modal ------------------------------
function DesignsScreen({ assets, crops, productPresets, marketplaceAccounts, runEngineAction }) {
  const reviewable = assets.filter((asset) => !asset.isReference && asset.status !== "reference");
  const [statusFilter, setStatusFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [cropFilter, setCropFilter] = useState("");
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState("");

  const filtered = reviewable.filter((asset) => {
    const status = engineDesignStatus(asset);
    return (
      (!statusFilter || status === statusFilter) &&
      (!batchFilter || asset.batchId === batchFilter) &&
      (!cropFilter || asset.cropId === cropFilter)
    );
  });
  const openDesign = reviewable.find((asset) => asset.id === openId) || null;
  const cropOf = (asset) => crops.find((crop) => crop.id === asset?.cropId) || null;
  const batchIds = [...new Set(reviewable.map((asset) => asset.batchId).filter(Boolean))];
  const usedCropIds = [...new Set(reviewable.map((asset) => asset.cropId).filter(Boolean))];

  async function review(design, body) {
    try {
      const result = await runEngineAction(`/api/designs/${design.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setNotice(result.message);
      if (body.status && body.status !== "approved") setOpenId(null);
    } catch { /* parent shows error */ }
  }
  async function remixRequest(design, body) {
    try {
      const result = await runEngineAction(`/api/designs/${design.id}/remix-request`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setNotice(result.message); setOpenId(null);
    } catch { /* parent shows error */ }
  }
  async function compile(design, { presetId, accountId }) {
    try {
      const result = await runEngineAction(`/api/listings/compile`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: design.id, presetId, marketplaceAccountId: accountId }),
      });
      setNotice(`${result.message} SKU: ${result.listing.sku}`); setOpenId(null);
    } catch { /* parent shows error */ }
  }

  return (
    <section className="screen">
      <div className="farmHero compactFarmHero">
        <div>
          <p className="eyebrow">Asset library</p>
          <h3>Design Review</h3>
          <p>Open any design at full aspect ratio, then approve, reject, request an edit, or request a remix. Approved designs can be compiled into listings.</p>
        </div>
      </div>

      {notice && <div className="successNotice">{notice}</div>}

      <div className="panel filterBar">
        <label>Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            {DESIGN_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
          </select>
        </label>
        <label>Batch
          <select value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)}>
            <option value="">All batches</option>
            {batchIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>Crop
          <select value={cropFilter} onChange={(event) => setCropFilter(event.target.value)}>
            <option value="">All crops</option>
            {usedCropIds.map((id) => <option key={id} value={id}>{crops.find((crop) => crop.id === id)?.name || id}</option>)}
          </select>
        </label>
        <label>Showing<input readOnly value={`${filtered.length} of ${reviewable.length}`} /></label>
      </div>

      <div className="designGrid">
        {filtered.map((design) => (
          <button key={design.id} className={`designCard design-${engineDesignStatus(design)}`} onClick={() => setOpenId(design.id)}>
            <div className="designThumbWrap">
              <img className="designThumb" src={`${API_BASE}${design.publicUrl}`} alt={design.fileName} loading="lazy" />
            </div>
            <div className="designCardBody">
              <StatusBadge value={engineDesignStatus(design)} />
              <strong title={design.fileName}>{design.fileName}</strong>
              <small>{cropOf(design)?.name || design.cropId}</small>
            </div>
          </button>
        ))}
        {!filtered.length && <EmptyState message="No designs match these filters. Generate or import a batch in Etsy Studio." />}
      </div>

      {openDesign && (
        <ImageReviewModal
          design={openDesign}
          crop={cropOf(openDesign)}
          presets={productPresets.filter((preset) => preset.platform === "ebay")}
          marketplaceAccounts={marketplaceAccounts}
          onClose={() => setOpenId(null)}
          onReview={(body) => review(openDesign, body)}
          onRemixRequest={(body) => remixRequest(openDesign, body)}
          onCompile={(body) => compile(openDesign, body)}
        />
      )}
    </section>
  );
}

// --- Batches overview ------------------------------------------------------
function BatchesScreen({ batches, assets, listings, crops }) {
  const rows = batches.map((batch) => {
    const batchAssets = assets.filter((asset) => asset.batchId === batch.id && !asset.isReference);
    const approvedIds = new Set(batchAssets.filter((asset) => engineDesignStatus(asset) === "approved").map((asset) => asset.id));
    const converted = listings.filter((listing) => approvedIds.has(listing.designId)).length;
    return {
      batch,
      crop: crops.find((crop) => crop.id === batch.cropId),
      generated: batchAssets.length,
      approved: batchAssets.filter((asset) => engineDesignStatus(asset) === "approved").length,
      rejected: batchAssets.filter((asset) => engineDesignStatus(asset) === "rejected").length,
      remixed: batchAssets.filter((asset) => engineDesignStatus(asset) === "remix_requested").length,
      converted,
    };
  });

  return (
    <section className="screen">
      <div className="farmHero compactFarmHero">
        <div><p className="eyebrow">Plantings</p><h3>Batches</h3><p>Every generation or import run, with how many designs were kept and turned into listings.</p></div>
      </div>
      <div className="panel widePanel">
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>Batch</th><th>Crop</th><th>Provider</th><th>Generated</th><th>Approved</th><th>Rejected</th><th>Remix</th><th>Listings</th></tr></thead>
            <tbody>
              {rows.map(({ batch, crop, generated, approved, rejected, remixed, converted }) => (
                <tr key={batch.id}>
                  <td><code>{batch.id}</code></td>
                  <td>{crop?.name || batch.cropId || "—"}</td>
                  <td>{batch.provider || "—"}</td>
                  <td>{generated}</td><td>{approved}</td><td>{rejected}</td><td>{remixed}</td><td>{converted}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="8"><EmptyState message="No batches yet." /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// --- Product Presets -------------------------------------------------------
function PresetsScreen({ productPresets, crops = [], assets = [], runEngineAction, embedded = false, onBack, backLabel, groupByPlatform = true, hideBack = false, onEditModeChange, onRunComplete }) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);
  const [notice, setNotice] = useState("");
  const [carouselIndexes, setCarouselIndexes] = useState({});
  const [contextDraft, setContextDraft] = useState("");
  const [generatingPreset, setGeneratingPreset] = useState(false);
  const [runningPreset, setRunningPreset] = useState(false);
  const [importingPreset, setImportingPreset] = useState(false);
  const [studioNotice, setStudioNotice] = useState("");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [showRejectedAssets, setShowRejectedAssets] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewNotice, setPreviewNotice] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewBuiltSignature, setPreviewBuiltSignature] = useState("");
  const [generationOptions, setGenerationOptions] = useState({ context: "", batchSize: 4, dimensions: "1024x1536", quality: "medium" });
  const presetEditing = Boolean(form);

  useEffect(() => {
    onEditModeChange?.(presetEditing);
    return () => onEditModeChange?.(false);
  }, [presetEditing, onEditModeChange]);

  function startEdit(preset) {
    const strategy = preset.creativeStrategy || {};
    const policy = preset.automationPolicy || {};
    const specificProductType = (preset.supportedProductTypes || []).findLast((type) => !["digital_download", "printable", "pod_candidate"].includes(type));
    setEditingId(preset.id);
    setContextDraft("");
    setStudioNotice("");
    setReviewOpen(false);
    setReviewIndex(0);
    setShowRejectedAssets(false);
    setPreviewOpen(false);
    setPreviewData(null);
    setPreviewNotice("");
    setGenerationOptions((current) => ({ ...current, context: strategy.subjects?.[0] || "" }));
    setForm({
      ...preset,
      productType: specificProductType || preset.productType || "digital_download",
      tags: (preset.tags || []).join(", "),
      subjectPool: (strategy.subjects || []).join(", "),
      creativeDirection: strategy.creativeDirection || "",
      variationInstructions: strategy.variationInstructions || "Change the composition, poses, accessories, and supporting details on every run.",
      cooldownRuns: strategy.cooldownRuns ?? 7,
      explorationPercent: strategy.explorationPercent ?? 25,
      minViewsBeforeBias: strategy.minViewsBeforeBias ?? 100,
      similarityThreshold: strategy.similarityThreshold ?? 0.82,
      referenceRoles: { ...(preset.referenceRoles || {}) },
      dailyLimit: policy.dailyLimit ?? 1,
      minQualityScore: policy.minQualityScore ?? 85,
      estimatedCostUsd: policy.estimatedCostUsd ?? 0.2,
      operationalStatus: presetStatus(preset),
      sourceMode: preset.sourceMode || "import",
      galleryTemplate: preset.galleryTemplate || ["hero", "included", "details", "formats", "usage", "license"],
      requiredAssetCount: preset.packageRules?.requiredAssetCount ?? 1,
      packageFormats: (preset.packageRules?.formats || ["PNG", "JPG"]).join(", "),
      fileNamePattern: preset.packageRules?.fileNamePattern || "artwork-{index}",
      outputDimensions: preset.packageRules?.outputDimensions || "source",
      folderStructure: preset.packageRules?.folderStructure || "artwork + license",
      productionAssetIds: [...(preset.production?.assetIds || [])],
      license: preset.license || "Personal use",
      licenseInstructions: preset.licenseInstructions || "",
    });
  }
  async function save(event) {
    event.preventDefault();
    await savePreset(true);
  }
  async function savePreset(closeAfterSave = false) {
    try {
      const {
        subjectPool, creativeDirection, variationInstructions, cooldownRuns,
        explorationPercent, minViewsBeforeBias, similarityThreshold,
        dailyLimit, minQualityScore, estimatedCostUsd, operationalStatus,
        requiredAssetCount, packageFormats, fileNamePattern, outputDimensions, folderStructure, productionAssetIds,
        automationPolicy: ignoredAutomationPolicy, ...presetFields
      } = form;
      void ignoredAutomationPolicy;
      const result = await runEngineAction(`/api/presets/${editingId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...presetFields,
          price: Number(form.price),
          tags: String(form.tags || "").split(",").map((value) => value.trim().slice(0, 20)).filter(Boolean).slice(0, 13),
          creativeStrategy: {
            subjects: String(subjectPool || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
            creativeDirection,
            variationInstructions,
            cooldownRuns: Number(cooldownRuns),
            explorationPercent: Number(explorationPercent),
            minViewsBeforeBias: Number(minViewsBeforeBias),
            similarityThreshold: Number(similarityThreshold),
          },
          referenceRoles: form.referenceRoles || {},
          galleryTemplate: form.galleryTemplate,
          packageRules: {
            requiredAssetCount: Number(requiredAssetCount),
            formats: String(packageFormats || "PNG, JPG").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean),
            fileNamePattern,
            outputDimensions,
            folderStructure,
          },
          production: { ...(editingPreset?.production || {}), assetIds: productionAssetIds },
        }),
      });
      await runEngineAction(`/api/automation/presets/${editingId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyLimit: Number(dailyLimit),
          minQualityScore: Number(minQualityScore),
          estimatedCostUsd: Number(estimatedCostUsd),
        }),
      });
      const original = productPresets.find((preset) => preset.id === editingId);
      const currentStatus = original?.automationPolicy?.certificationStatus || "experimental";
      if (operationalStatus === "Discarded" && currentStatus !== "paused") {
        await runEngineAction(`/api/automation/presets/${editingId}/certify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetStatus: "paused" }) });
      } else if (operationalStatus === "Testing" && currentStatus === "paused") {
        await runEngineAction(`/api/automation/presets/${editingId}/certify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetStatus: "experimental" }) });
      }
      setNotice(result.message || "Preset saved.");
      if (closeAfterSave) { setEditingId(null); setForm(null); }
      return true;
    } catch { return false; }
  }

  async function runPreset() {
    if (runningPreset) return;
    setRunningPreset(true);
    setStudioNotice("");
    const saved = await savePreset(false);
    if (!saved) { setRunningPreset(false); return; }
    try {
      const result = await runEngineAction(`/api/presets/${editingId}/run`, { method: "POST" });
      setStudioNotice(result.message || "Preset package is ready.");
      onRunComplete?.(result.listing);
    } catch { /* parent shows error */ }
    finally { setRunningPreset(false); }
  }

  function presetStatus(preset) {
    const policy = preset.automationPolicy || {};
    const status = policy.certificationStatus || "experimental";
    if (status === "paused") return "Discarded";
    if (status === "autonomous" && policy.enabled) return "Auto";
    return "Testing";
  }

  function selectedProductType(preset) {
    const specific = (preset.supportedProductTypes || []).findLast((type) => !["digital_download", "printable", "pod_candidate"].includes(type));
    return titleCase(specific || preset.productType || "Product");
  }

  function presetReferences(preset) {
    const cropIds = new Set(crops.filter((crop) => crop.etsyPresetId === preset.id || crop.productPresetId === preset.id).map((crop) => crop.id));
    return assets.filter((asset) => cropIds.has(asset.cropId) && asset.isReference && asset.publicUrl);
  }

  function presetDescription(preset) {
    const crop = crops.find((item) => item.etsyPresetId === preset.id || item.productPresetId === preset.id);
    const custom = crop?.aestheticNotes || crop?.description || crop?.targetCustomer;
    if (custom) return String(custom).slice(0, 150);
    return `Visual direction and listing rules for ${selectedProductType(preset).toLowerCase()} products.`;
  }

  function cycleReference(presetId, count, direction = 1) {
    if (count < 2) return;
    setCarouselIndexes((current) => ({ ...current, [presetId]: ((current[presetId] || 0) + direction + count) % count }));
  }

  function updateReferenceRole(assetId, role) {
    setForm((current) => {
      const referenceRoles = { ...(current.referenceRoles || {}) };
      if (role) referenceRoles[assetId] = role;
      else delete referenceRoles[assetId];
      return { ...current, referenceRoles };
    });
  }

  function addContexts(value) {
    const additions = String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (!additions.length) return;
    setForm((current) => {
      const existing = String(current.subjectPool || "").split(",").map((item) => item.trim()).filter(Boolean);
      return { ...current, subjectPool: [...new Set([...existing, ...additions])].join(", ") };
    });
    setContextDraft("");
  }

  function removeContext(value) {
    setForm((current) => ({
      ...current,
      subjectPool: String(current.subjectPool || "").split(",").map((item) => item.trim()).filter((item) => item && item !== value).join(", "),
    }));
  }

  const presetGroups = groupByPlatform
    ? Object.entries(productPresets.reduce((groups, preset) => {
      const key = preset.platform || "other";
      return { ...groups, [key]: [...(groups[key] || []), preset] };
    }, {}))
    : [[null, productPresets]];
  const editingPreset = productPresets.find((preset) => preset.id === editingId);
  const editingReferences = editingPreset ? presetReferences(editingPreset) : [];
  const contextTags = form ? String(form.subjectPool || "").split(",").map((item) => item.trim()).filter(Boolean) : [];
  const editingCrop = editingPreset ? crops.find((crop) => crop.etsyPresetId === editingPreset.id || crop.productPresetId === editingPreset.id) : null;
  const generatedPresetAssets = editingCrop
    ? assets.filter((asset) => asset.cropId === editingCrop.id && !asset.isReference && !asset.isMockup && asset.provider !== "manual" && asset.publicUrl).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    : [];
  const rejectedPresetAssets = generatedPresetAssets.filter((asset) => asset.status === "rejected");
  const visibleGeneratedAssets = showRejectedAssets ? generatedPresetAssets : generatedPresetAssets.filter((asset) => asset.status !== "rejected");
  const productionAssets = form
    ? (form.productionAssetIds || [])
      .map((id) => assets.find((asset) => asset.id === id))
      .filter((asset) => asset && (form.sourceMode === "api" ? asset.provider !== "manual" : asset.provider === "manual"))
    : [];
  const reviewAsset = visibleGeneratedAssets[reviewIndex] || null;

  async function generateFromPreset() {
    if (!editingCrop) { setStudioNotice("Assign a crop to this preset before generating."); return; }
    const context = generationOptions.context || contextTags[0] || "original subject";
    const references = editingReferences.filter((asset) => form.referenceRoles?.[asset.id]);
    const referenceNotes = references.map((asset) => `Use reference ${editingReferences.indexOf(asset) + 1} for ${String(form.referenceRoles[asset.id]).toLowerCase()} guidance only.`).join("\n");
    const prompt = [
      form.creativeDirection || editingCrop.promptTemplate,
      `Create a new ${context} design.`,
      form.variationInstructions,
      "Make the composition visibly different from every previous result. Do not copy specific characters or layouts from the references.",
      referenceNotes,
    ].filter(Boolean).join("\n\n");
    setGeneratingPreset(true);
    setStudioNotice("");
    try {
      const result = await runEngineAction(`/api/crops/${editingCrop.id}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          model: "gpt-image-2",
          batchSize: Number(generationOptions.batchSize),
          prompt,
          negativePrompt: "copied composition, duplicate design, watermark, logo, signature, illegible text, low resolution",
          dimensions: generationOptions.dimensions,
          quality: generationOptions.quality,
          referenceAssetIds: references.map((asset) => asset.id),
        }),
      });
      setStudioNotice(result.message || "Images generated.");
      setReviewIndex(0);
    } catch { /* parent shows error */ }
    finally { setGeneratingPreset(false); }
  }

  async function reviewPresetAsset(asset, status) {
    if (!asset) return;
    try {
      const result = await runEngineAction(`/api/assets/${asset.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      setForm((current) => ({
        ...current,
        productionAssetIds: status === "approved"
          ? [...new Set([...(current.productionAssetIds || []), asset.id])]
          : (current.productionAssetIds || []).filter((id) => id !== asset.id),
      }));
      setStudioNotice(result.message || `Image ${status}.`);
      if (status === "rejected" && !showRejectedAssets) setReviewOpen(false);
    } catch { /* parent shows error */ }
  }

  function fileDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read the image."));
      reader.readAsDataURL(file);
    });
  }

  async function importPresetFiles(event, replaceAssetId = "") {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!editingCrop || !files.length) return;
    setImportingPreset(true);
    setStudioNotice("");
    try {
      const importedIds = [];
      for (const file of files) {
        const dataUrl = await fileDataUrl(file);
        const result = await runEngineAction("/api/assets/import", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cropId: editingCrop.id, fileName: file.name, dataUrl, status: "approved" }),
        });
        importedIds.push(result.asset.id);
      }
      setForm((current) => {
        const currentIds = [...(current.productionAssetIds || [])];
        const nextIds = replaceAssetId
          ? currentIds.flatMap((id) => id === replaceAssetId ? importedIds.slice(0, 1) : [id])
          : [...currentIds, ...importedIds];
        return { ...current, productionAssetIds: [...new Set(nextIds)] };
      });
      setStudioNotice(`${importedIds.length} artwork file${importedIds.length === 1 ? "" : "s"} added.`);
    } catch { /* parent shows error */ }
    finally { setImportingPreset(false); }
  }

  function moveProductionAsset(assetId, direction) {
    setForm((current) => {
      const ids = [...(current.productionAssetIds || [])];
      const index = ids.indexOf(assetId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return current;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      return { ...current, productionAssetIds: ids };
    });
  }

  function previewPayload() {
    return {
      name: form.name,
      productType: form.productType,
      sourceMode: form.sourceMode,
      galleryTemplate: form.galleryTemplate,
      titlePattern: form.titlePattern,
      price: Number(form.price),
      license: form.license,
      licenseInstructions: form.licenseInstructions,
      productionAssetIds: form.productionAssetIds || [],
      packageRules: {
        requiredAssetCount: Number(form.requiredAssetCount),
        formats: String(form.packageFormats || "PNG, JPG").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean),
        fileNamePattern: form.fileNamePattern,
        outputDimensions: form.outputDimensions,
        folderStructure: form.folderStructure,
      },
      creativeStrategy: {
        ...(editingPreset?.creativeStrategy || {}),
        subjects: String(form.subjectPool || "").split(",").map((value) => value.trim()).filter(Boolean),
      },
      production: {
        ...(editingPreset?.production || {}),
        context: generationOptions.context || contextTags[0] || editingCrop?.name || "",
      },
    };
  }

  const previewSignature = form ? JSON.stringify(previewPayload()) : "";

  async function buildPresetPreview() {
    if (previewLoading) return;
    const payload = previewPayload();
    const signature = JSON.stringify(payload);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/presets/${editingId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Preview could not be built.");
      setPreviewData(result.preview);
      setPreviewBuiltSignature(signature);
      setPreviewIndex(0);
    } catch (error) {
      setPreviewNotice(error.message || "Preview could not be built.");
    } finally {
      setPreviewLoading(false);
    }
  }

  function renderMinimalPresetEditor() {
    const sourceAssets = form.sourceMode === "import" ? productionAssets : visibleGeneratedAssets;
    const galleryOptions = [["hero", "Hero cover"], ["included", "What’s included"], ["details", "Detail crops"], ["formats", "File formats"], ["usage", "Usage / mockup"], ["license", "License / instructions"]];
    return (
      <form className="presetRecipeEditor presetMinimalEditor" onSubmit={save}>
        <div className="presetWorkflowLayout">
          <div className="presetWorkflowFields">
            <div className="presetCoreFields">
              <label>Preset name<input value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Product type<select value={form.productType || "digital_download"} onChange={(event) => setForm({ ...form, productType: event.target.value })}><option value="digital_download">Digital product</option><option value="journal_page">Journal page</option><option value="sticker_sheet">Sticker sheet</option><option value="wall_art">Wall art</option></select></label>
              <label>Source<select value={form.sourceMode} onChange={(event) => setForm({ ...form, sourceMode: event.target.value })}><option value="import">Import Assets</option><option value="api">API Generate</option></select></label>
            </div>

            <div className="presetSimpleField"><span>Listing gallery template</span><div className="galleryTemplateChoices">{galleryOptions.map(([key, label]) => <label key={key}><input type="checkbox" checked={(form.galleryTemplate || []).includes(key)} onChange={(event) => setForm({ ...form, galleryTemplate: event.target.checked ? [...(form.galleryTemplate || []), key] : (form.galleryTemplate || []).filter((item) => item !== key) })} />{label}</label>)}</div></div>

            <div className="presetMinimalGroup"><strong>Etsy listing defaults</strong><div className="presetCoreFields"><label>Price<input type="number" min="0.01" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label><label>Category ID<input value={form.taxonomyId || ""} onChange={(event) => setForm({ ...form, taxonomyId: event.target.value })} /></label><label>License<input value={form.license} onChange={(event) => setForm({ ...form, license: event.target.value })} /></label></div><label>Title<input value={form.titlePattern || "{subject} | Digital Download"} onChange={(event) => setForm({ ...form, titlePattern: event.target.value })} /></label><label>Description<textarea value={form.descriptionTemplate || ""} onChange={(event) => setForm({ ...form, descriptionTemplate: event.target.value })} /></label><label>Tags<input value={form.tags || ""} onChange={(event) => setForm({ ...form, tags: event.target.value })} /></label></div>

            <details className="presetAdvanced"><summary>Advanced</summary><div>
              <label>Required assets<input type="number" min="1" value={form.requiredAssetCount} onChange={(event) => setForm({ ...form, requiredAssetCount: event.target.value })} /></label>
              <label>Formats<input value={form.packageFormats} onChange={(event) => setForm({ ...form, packageFormats: event.target.value })} /></label>
              <label>Output dimensions<input value={form.outputDimensions} onChange={(event) => setForm({ ...form, outputDimensions: event.target.value })} /></label>
              <label>File naming<input value={form.fileNamePattern} onChange={(event) => setForm({ ...form, fileNamePattern: event.target.value })} /></label>
              <label>Folder / ZIP structure<input value={form.folderStructure} onChange={(event) => setForm({ ...form, folderStructure: event.target.value })} /></label>
              <label>License instructions<textarea value={form.licenseInstructions} onChange={(event) => setForm({ ...form, licenseInstructions: event.target.value })} /></label>
              {form.sourceMode === "api" && <>
                <label>Aesthetics<textarea value={form.creativeDirection} onChange={(event) => setForm({ ...form, creativeDirection: event.target.value })} /></label>
                <label>Variations<textarea value={form.variationInstructions} onChange={(event) => setForm({ ...form, variationInstructions: event.target.value })} /></label>
                <label>Context<div className="contextTagEditor">{contextTags.map((tag) => <span className="contextTag" key={tag}>{tag}<button type="button" onClick={() => removeContext(tag)} aria-label={`Remove ${tag}`}>×</button></span>)}<input aria-label="Add context" value={contextDraft} onChange={(event) => { const value = event.target.value; if (value.includes(",")) { const parts = value.split(","); addContexts(parts.slice(0, -1).join(",")); setContextDraft(parts.at(-1)); } else setContextDraft(value); }} onKeyDown={(event) => { if (["Enter", ","].includes(event.key)) { event.preventDefault(); addContexts(contextDraft); } }} onBlur={() => addContexts(contextDraft)} /></div></label>
                <div className="presetGenerateControls"><label>Context<select value={generationOptions.context} onChange={(event) => setGenerationOptions({ ...generationOptions, context: event.target.value })}><option value="">Choose</option>{contextTags.map((tag) => <option key={tag}>{tag}</option>)}</select></label><label>Images<select value={generationOptions.batchSize} onChange={(event) => setGenerationOptions({ ...generationOptions, batchSize: event.target.value })}>{[1, 2, 3, 4].map((count) => <option key={count}>{count}</option>)}</select></label><label>Size<select value={generationOptions.dimensions} onChange={(event) => setGenerationOptions({ ...generationOptions, dimensions: event.target.value })}><option>1024x1536</option><option>1536x1024</option><option>1024x1024</option></select></label><label>Quality<select value={generationOptions.quality} onChange={(event) => setGenerationOptions({ ...generationOptions, quality: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div>
                <button type="button" className="ghostButton" disabled={generatingPreset || !contextTags.length} onClick={generateFromPreset}>{generatingPreset ? "Generating…" : "Generate with API"}</button>
              </>}
            </div></details>
          </div>

          <aside className="presetAssetPane" aria-label="Preset artwork">
            <div className="presetAssetPaneHeader"><strong>Artwork</strong><div>{form.sourceMode === "api" && rejectedPresetAssets.length > 0 && <button type="button" className="ghostButton" onClick={() => { setShowRejectedAssets((current) => !current); setReviewOpen(false); setReviewIndex(0); }}>{showRejectedAssets ? "Hide rejected" : `View rejected (${rejectedPresetAssets.length})`}</button>}{form.sourceMode === "import" && <label className="ghostButton presetImportButton">{importingPreset ? "Adding…" : "Add assets"}<input type="file" multiple disabled={importingPreset || runningPreset} accept="image/png,image/jpeg" onChange={importPresetFiles} /></label>}</div></div>
            {studioNotice && <p className="presetStudioNotice">{studioNotice}</p>}
            <div className="presetAssetList">
              {sourceAssets.map((asset, index) => <article key={asset.id} className="presetAssetRow"><button type="button" onClick={() => { if (form.sourceMode === "api") { setReviewIndex(index); setReviewOpen(true); } }} aria-label={`Open artwork ${index + 1}`}><img src={`${API_BASE}${asset.publicUrl}`} alt={`Artwork ${index + 1}`} /></button><div><span>{index + 1}</span>{form.sourceMode === "import" ? <div className="presetAssetTools"><button type="button" disabled={index === 0} onClick={() => moveProductionAsset(asset.id, -1)}>↑</button><button type="button" disabled={index === productionAssets.length - 1} onClick={() => moveProductionAsset(asset.id, 1)}>↓</button><label>Replace<input type="file" accept="image/png,image/jpeg" onChange={(event) => importPresetFiles(event, asset.id)} /></label><button type="button" onClick={() => setForm({ ...form, productionAssetIds: form.productionAssetIds.filter((id) => id !== asset.id) })}>Remove</button></div> : <span className={`presetAssetStatus status-${asset.status}`}>{titleCase(asset.status || "review")}</span>}</div></article>)}
              {!sourceAssets.length && <p className="presetAssetEmpty">No artwork selected.</p>}
            </div>
            {reviewOpen && reviewAsset && <div className="presetImageReview" role="dialog" aria-modal="true" aria-label="Generated image review"><button type="button" className="presetReviewClose" onClick={() => setReviewOpen(false)} aria-label="Close generated image">×</button><div className="presetReviewImageWrap"><img src={`${API_BASE}${reviewAsset.publicUrl}`} alt={`Generated result ${reviewIndex + 1}`} /></div><div className="presetReviewCarousel"><button type="button" onClick={() => setReviewIndex((reviewIndex - 1 + visibleGeneratedAssets.length) % visibleGeneratedAssets.length)} aria-label="Previous generated image">←</button><span>{reviewIndex + 1} / {visibleGeneratedAssets.length}</span><button type="button" onClick={() => setReviewIndex((reviewIndex + 1) % visibleGeneratedAssets.length)} aria-label="Next generated image">→</button></div><div className="presetReviewActions"><button type="button" className="dangerButton" onClick={() => reviewPresetAsset(reviewAsset, "rejected")}>Reject</button><button type="button" className="primaryButton" onClick={() => reviewPresetAsset(reviewAsset, "approved")}>Approve</button></div></div>}
          </aside>
        </div>
        <div className="listingActions presetEditorActions"><button type="button" className="entryBackButton" disabled={runningPreset} onClick={() => { setForm(null); setEditingId(null); }}>Back</button><button type="button" className="ghostButton" disabled={runningPreset || importingPreset} onClick={buildPresetPreview}>Preview</button><button type="submit" className="ghostButton" disabled={runningPreset}>Save</button><button type="button" className="primaryButton" disabled={runningPreset || importingPreset} onClick={runPreset}>{runningPreset ? "Building…" : "Run Preset"}</button></div>

        {previewOpen && <div className="presetPreviewBackdrop"><section className="presetPreviewModal" role="dialog" aria-modal="true" aria-label="Preset listing preview">
          <header><strong>Listing preview</strong><button type="button" onClick={() => setPreviewOpen(false)} aria-label="Close preview">×</button></header>
          {previewLoading ? <div className="presetPreviewLoading">Building preview…</div> : previewNotice ? <div className="presetPreviewError">{previewNotice}</div> : previewData && <>
            <div className="presetPreviewBody">
              <div className="presetPreviewGallery">
                <div className="presetPreviewImage"><img src={previewData.gallery[previewIndex]?.dataUrl} alt={`${previewData.gallery[previewIndex]?.key || "Listing"} preview`} /></div>
                <div className="presetPreviewControls"><button type="button" disabled={previewData.gallery.length < 2} onClick={() => setPreviewIndex((previewIndex - 1 + previewData.gallery.length) % previewData.gallery.length)} aria-label="Previous listing image">←</button><span>{previewIndex + 1} / {previewData.gallery.length}</span><button type="button" disabled={previewData.gallery.length < 2} onClick={() => setPreviewIndex((previewIndex + 1) % previewData.gallery.length)} aria-label="Next listing image">→</button></div>
              </div>
              <aside className="presetPreviewDetails">
                <div><span>Thumbnail crop</span><div className="presetThumbnailCrop"><img src={previewData.gallery[0]?.dataUrl} alt="Etsy thumbnail crop" /><i aria-hidden="true" /></div><small>Keep key artwork and text inside the dashed safe area.</small></div>
                <div><span>Title</span><h3>{previewData.title}</h3></div>
                <div><span>Price</span><strong>${previewData.price.toFixed(2)}</strong></div>
                <div><span>Package</span><p>{previewData.package.assetCount} artwork file{previewData.package.assetCount === 1 ? "" : "s"} · {previewData.package.formats.join(" + ")} · {previewData.package.outputDimensions}</p><small>{previewData.package.fileName} · {previewData.package.folderStructure}</small></div>
              </aside>
            </div>
          </>}
          <footer>{previewData && previewBuiltSignature !== previewSignature && <span>Preset changed. Refresh the preview.</span>}<div><button type="button" className="ghostButton" disabled={previewLoading} onClick={buildPresetPreview}>Regenerate Preview</button><button type="button" className="ghostButton" onClick={() => setPreviewOpen(false)}>Close</button><button type="button" className="primaryButton" onClick={() => setPreviewOpen(false)}>Edit</button></div></footer>
        </section></div>}
      </form>
    );
  }

  return (
    <section className={embedded ? "screen embeddedPresetManager" : "screen"}>
      {(!hideBack || form) && <div className="presetManagerToolbar">
        {form ? (
          <button type="button" className="entryBackButton" onClick={() => { setForm(null); setEditingId(null); }}>← Back to presets</button>
        ) : embedded ? (
          <button type="button" className="entryBackButton" onClick={onBack}>{backLabel || "← Back to collection"}</button>
        ) : <strong>Product presets</strong>}
      </div>}
      {notice && <div className="successNotice">{notice}</div>}
      {!form && <div className="presetParentList">
        {presetGroups.map(([platform, presets]) => (
          <section className="presetParentGroup" key={platform || "current-account"}>
            {platform && (
              <div className="presetParentHeading">
                <strong>{platform === "etsy" ? "Etsy shops" : platform === "ebay" ? "eBay shops" : titleCase(platform)}</strong>
                <span>{presets.length} preset{presets.length === 1 ? "" : "s"}</span>
              </div>
            )}
            <div className="presetCompactGrid">
              {presets.map((preset) => {
                const status = presetStatus(preset);
                const references = presetReferences(preset);
                const imageIndex = Math.min(carouselIndexes[preset.id] || 0, Math.max(references.length - 1, 0));
                const reference = references[imageIndex];
                return (
                  <article className="presetCompactCard" key={preset.id}>
                    <button
                      type="button"
                      className="presetCardOpen"
                      onClick={() => startEdit(preset)}
                      aria-label={`Open ${selectedProductType(preset)} preset`}
                    />
                    <header>
                      <h3>{selectedProductType(preset)}</h3>
                      <span className={`presetSimpleStatus status-${status.toLowerCase()}`}>{status}</span>
                    </header>
                    <div className="presetReferenceCarousel">
                      {reference ? (
                        <button type="button" onClick={() => cycleReference(preset.id, references.length)} aria-label={`Show next ${selectedProductType(preset)} reference image`}>
                          <img src={`${API_BASE}${reference.publicUrl}`} alt={`${selectedProductType(preset)} reference ${imageIndex + 1} of ${references.length}`} />
                        </button>
                      ) : <div className="presetReferenceEmpty">Reference image coming soon</div>}
                      {references.length > 1 && <div className="presetCarouselControls"><button type="button" onClick={() => cycleReference(preset.id, references.length, -1)} aria-label="Previous reference image">←</button><span>{imageIndex + 1}/{references.length}</span><button type="button" onClick={() => cycleReference(preset.id, references.length, 1)} aria-label="Next reference image">→</button></div>}
                    </div>
                    <p className="presetDescription">{presetDescription(preset)}</p>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>}

      {form && renderMinimalPresetEditor()}
      {form?.showLegacyEditor && (
        <form className="presetRecipeEditor" onSubmit={save}>
          <div className="presetStudioLayout">
            <div className="presetRecipeColumn">
          <section className="presetEditorSection presetIdentitySection">
            <div><span>Product</span><h3>{selectedProductType(form)}</h3></div>
            <label>Status<select value={form.operationalStatus} onChange={(event) => setForm({ ...form, operationalStatus: event.target.value })}><option>Testing</option><option disabled={form.operationalStatus !== "Auto"}>Auto</option><option>Discarded</option></select></label>
          </section>

          <section className="presetEditorSection">
            <label>Context<div className="contextTagEditor" onClick={(event) => event.currentTarget.querySelector("input")?.focus()}>{contextTags.map((tag) => <span className="contextTag" key={tag}>{tag}<button type="button" onClick={() => removeContext(tag)} aria-label={`Remove ${tag}`}>×</button></span>)}<input aria-label="Add context" value={contextDraft} onChange={(event) => { const value = event.target.value; if (value.includes(",")) { const parts = value.split(","); addContexts(parts.slice(0, -1).join(",")); setContextDraft(parts.at(-1)); } else setContextDraft(value); }} onKeyDown={(event) => { if (["Enter", ","].includes(event.key)) { event.preventDefault(); addContexts(contextDraft); } else if (event.key === "Backspace" && !contextDraft && contextTags.length) removeContext(contextTags.at(-1)); }} onBlur={() => addContexts(contextDraft)} /></div></label>
            <label>Aesthetics<textarea value={form.creativeDirection} onChange={(event) => setForm({ ...form, creativeDirection: event.target.value })} /></label>
            <label>Variations<textarea value={form.variationInstructions} onChange={(event) => setForm({ ...form, variationInstructions: event.target.value })} /></label>
            <div className="presetReferenceRoles">
              <strong>References</strong>
              {editingReferences.map((asset) => (
                <article key={asset.id}>
                  <img src={`${API_BASE}${asset.publicUrl}`} alt={asset.fileName} />
                  <div><select aria-label={`Role for reference ${editingReferences.indexOf(asset) + 1}`} value={form.referenceRoles?.[asset.id] || ""} onChange={(event) => updateReferenceRole(asset.id, event.target.value)}><option value="">Do not use</option><option>Style</option><option>Texture</option><option>Layout</option><option>Palette</option><option>Format</option></select></div>
                </article>
              ))}
              {!editingReferences.length && <p>No reference images are assigned to this preset’s crop yet.</p>}
            </div>
          </section>

          <section className="presetEditorSection">
            <header><div><span>Variation safeguards</span><h4>Prevent repetitive listings</h4></div></header>
            <div className="presetEditorGrid">
              <label>Subject cooldown<input type="number" min="0" max="50" value={form.cooldownRuns} onChange={(event) => setForm({ ...form, cooldownRuns: event.target.value })} /><small>Runs before a subject can repeat</small></label>
              <label>Explore new ideas<input type="number" min="0" max="100" value={form.explorationPercent} onChange={(event) => setForm({ ...form, explorationPercent: event.target.value })} /><small>Percent of runs reserved for exploration</small></label>
              <label>Evidence before bias<input type="number" min="0" value={form.minViewsBeforeBias} onChange={(event) => setForm({ ...form, minViewsBeforeBias: event.target.value })} /><small>Views required before sales influence selection</small></label>
              <label>Similarity limit<input type="number" min="0.5" max="0.99" step="0.01" value={form.similarityThreshold} onChange={(event) => setForm({ ...form, similarityThreshold: event.target.value })} /><small>Regeneration threshold for future image checks</small></label>
            </div>
          </section>

          <section className="presetEditorSection">
            <header><div><span>Etsy defaults</span><h4>Applied to every listing</h4></div></header>
            <div className="presetEditorGrid">
              <label>Price<input type="number" min="0.01" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
              <label>Category ID<input value={form.taxonomyId || ""} onChange={(event) => setForm({ ...form, taxonomyId: event.target.value })} /></label>
            </div>
            <label>Title pattern<input value={form.titlePattern || "{subject} | Original Digital Product"} onChange={(event) => setForm({ ...form, titlePattern: event.target.value })} /><small>Use {"{subject}"} where the selected subject belongs.</small></label>
            <label>Listing description<textarea value={form.descriptionTemplate || ""} onChange={(event) => setForm({ ...form, descriptionTemplate: event.target.value })} /></label>
            <label>Search tags<input value={form.tags || ""} onChange={(event) => setForm({ ...form, tags: event.target.value })} /><small>Up to 13 reusable tags. Subject-specific tags are added per run.</small></label>
          </section>

          <section className="presetEditorSection">
            <header><div><span>Automation</span><h4>Safe daily limits</h4></div></header>
            <div className="presetEditorGrid">
              <label>Listings per day<input type="number" min="1" max="25" value={form.dailyLimit} onChange={(event) => setForm({ ...form, dailyLimit: event.target.value })} /></label>
              <label>Minimum quality<input type="number" min="0" max="100" value={form.minQualityScore} onChange={(event) => setForm({ ...form, minQualityScore: event.target.value })} /></label>
              <label>Estimated image cost<input type="number" min="0" step="0.01" value={form.estimatedCostUsd} onChange={(event) => setForm({ ...form, estimatedCostUsd: event.target.value })} /></label>
            </div>
            <p className="presetSafetyNote">Automatic publishing remains locked. Testing jobs prepare and record the recipe without spending money or publishing externally.</p>
          </section>
            </div>

            <aside className="presetGenerationStudio" aria-label="Generate and review images">
              <header><div><span>Image studio</span><h3>Generate</h3></div></header>
              <div className="presetGenerateControls">
                <label>Context<select value={generationOptions.context} onChange={(event) => setGenerationOptions({ ...generationOptions, context: event.target.value })}><option value="">Choose</option>{contextTags.map((tag) => <option key={tag} value={tag}>{titleCase(tag)}</option>)}</select></label>
                <label>Images<select value={generationOptions.batchSize} onChange={(event) => setGenerationOptions({ ...generationOptions, batchSize: event.target.value })}>{[1, 2, 3, 4].map((count) => <option key={count}>{count}</option>)}</select></label>
                <label>Size<select value={generationOptions.dimensions} onChange={(event) => setGenerationOptions({ ...generationOptions, dimensions: event.target.value })}><option>1024x1536</option><option>1536x1024</option><option>1024x1024</option></select></label>
                <label>Quality<select value={generationOptions.quality} onChange={(event) => setGenerationOptions({ ...generationOptions, quality: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
              </div>
              <button type="button" className="primaryButton presetGenerateButton" disabled={generatingPreset || !editingCrop || !contextTags.length} onClick={generateFromPreset}>{generatingPreset ? "Generating…" : "Generate images"}</button>
              {studioNotice && <p className="presetStudioNotice">{studioNotice}</p>}
              <div className="presetGeneratedGrid">
                {generatedPresetAssets.map((asset, index) => (
                  <button type="button" key={asset.id} className={`presetGeneratedThumb status-${asset.status}`} onClick={() => { setReviewIndex(index); setReviewOpen(true); }} aria-label={`Open generated image ${index + 1}`}>
                    <img src={`${API_BASE}${asset.publicUrl}`} alt={`Generated result ${index + 1}`} />
                    <span>{titleCase(asset.status || "Review")}</span>
                  </button>
                ))}
                {!generatedPresetAssets.length && <div className="presetGeneratedEmpty">Generated images will appear here.</div>}
              </div>

              {reviewOpen && reviewAsset && (
                <div className="presetImageReview" role="dialog" aria-modal="true" aria-label="Generated image review">
                  <button type="button" className="presetReviewClose" onClick={() => setReviewOpen(false)} aria-label="Close generated image">×</button>
                  <div className="presetReviewImageWrap"><img src={`${API_BASE}${reviewAsset.publicUrl}`} alt={`Generated result ${reviewIndex + 1} of ${generatedPresetAssets.length}`} /></div>
                  <div className="presetReviewCarousel">
                    <button type="button" onClick={() => setReviewIndex((reviewIndex - 1 + generatedPresetAssets.length) % generatedPresetAssets.length)} aria-label="Previous generated image">←</button>
                    <span>{reviewIndex + 1} / {generatedPresetAssets.length}</span>
                    <button type="button" onClick={() => setReviewIndex((reviewIndex + 1) % generatedPresetAssets.length)} aria-label="Next generated image">→</button>
                  </div>
                  <div className="presetReviewActions"><button type="button" className="dangerButton" onClick={() => reviewPresetAsset(reviewAsset, "rejected")}>Reject</button><button type="button" className="primaryButton" onClick={() => reviewPresetAsset(reviewAsset, "approved")}>Approve</button></div>
                </div>
              )}
            </aside>
          </div>

          <div className="listingActions presetEditorActions">
            <button type="button" className="ghostButton" onClick={() => { setForm(null); setEditingId(null); }}>Back to presets</button>
            <button type="submit" className="primaryButton">Save preset</button>
          </div>
        </form>
      )}
    </section>
  );
}

// --- Listings --------------------------------------------------------------
function ListingsScreen({ listings, assets, productPresets, listingMetricsDaily, runEngineAction }) {
  const [notice, setNotice] = useState("");
  const designOf = (listing) => assets.find((asset) => asset.id === listing.designId);
  const presetOf = (listing) => productPresets.find((preset) => preset.id === listing.presetId);
  const rollup = (listingId) => listingMetricsDaily
    .filter((row) => row.listingId === listingId)
    .reduce((acc, row) => ({ orders: acc.orders + Number(row.orders || 0), revenue: acc.revenue + Number(row.grossRevenue || 0), views: acc.views + Number(row.views || 0) }), { orders: 0, revenue: 0, views: 0 });

  async function act(listing, path, verb) {
    try { const result = await runEngineAction(path, { method: "POST" }); setNotice(result.result?.message || result.message || `${verb} done.`); }
    catch { /* parent shows error */ }
  }
  async function markReady(listing) {
    try { const result = await runEngineAction(`/api/listings/${listing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ready_to_publish" }) }); setNotice(result.message); }
    catch { /* parent shows error */ }
  }

  const groups = [
    ["draft", "Draft"],
    ["ready_to_publish", "Ready to publish"],
    ["publishing", "Publishing"],
    ["published", "Published"],
    ["active", "Active"],
    ["publish_failed", "Failed"],
    ["needs_attention", "Needs attention"],
    ["ended", "Ended"], ["killed", "Killed"], ["archived", "Archived"],
  ];

  return (
    <section className="screen">
      <div className="farmHero compactFarmHero">
        <div><p className="eyebrow">Compiled offers</p><h3>Listings</h3><p>Draft listings are compiled from approved designs + presets. Publishing goes through the marketplace adapter — with no eBay credentials it honestly reports <code>publish_failed</code>, never a fake success.</p></div>
      </div>
      {notice && <div className="successNotice">{notice}</div>}

      {groups.filter(([status]) => listings.some((listing) => listing.status === status)).map(([status, label]) => (
        <article className="panel" key={status}>
          <div className="panelHeader"><div><p className="eyebrow">{listings.filter((listing) => listing.status === status).length} listing(s)</p><h3>{label}</h3></div></div>
          <div className="postList">
            {listings.filter((listing) => listing.status === status).map((listing) => {
              const perf = rollup(listing.id);
              return (
                <article className="listingRow" key={listing.id}>
                  <div className="listingMain">
                    <div className="rowBetween"><StatusBadge value={listing.status} /><code>{listing.sku}</code></div>
                    <strong>{listing.title}</strong>
                    <div className="libraryMeta">
                      <span>{listing.platform}</span>
                      <span>{money(listing.price)}</span>
                      <span>{presetOf(listing)?.name || listing.presetId}</span>
                      <span>design: {designOf(listing)?.fileName || listing.designId}</span>
                    </div>
                    <div className="libraryMeta">
                      <span>{perf.views} views</span><span>{perf.orders} orders</span><span>{money(perf.revenue)}</span>
                      {listing.killReviewDate && <span>60-day: {formatDateTime(listing.killReviewDate)}</span>}
                    </div>
                    {listing.publishedUrl && <a href={listing.publishedUrl} target="_blank" rel="noreferrer">Open listing ↗</a>}
                    {listing.remoteListingId && (
                      <div className="libraryMeta">
                        <span>{listing.remoteProvider} #{listing.remoteListingId} · remote: {listing.remoteStatus}</span>
                        {listing.etsyImageUploadStatus && <span>image: {listing.etsyImageUploadStatus}</span>}
                        {listing.lastPushedAt && <span>pushed {formatDateTime(listing.lastPushedAt)}</span>}
                        {listing.remoteEditUrl && <a href={listing.remoteEditUrl} target="_blank" rel="noreferrer">Edit on Etsy ↗</a>}
                      </div>
                    )}
                  </div>
                  <div className="listingActions verticalActions">
                    <button className="ghostButton" onClick={() => act(listing, `/api/listings/${listing.id}/validate`, "Validate")}>Validate</button>
                    {listing.status === "draft" && <button className="secondaryButton" onClick={() => markReady(listing)}>Mark ready</button>}
                    <button className="primaryButton" onClick={() => act(listing, `/api/listings/${listing.id}/publish`, "Publish")}>Publish</button>
                  </div>
                </article>
              );
            })}
          </div>
        </article>
      ))}
      {!listings.length && <EmptyState message="No listings yet. Approve a design in Design Review, then compile it into a listing." />}
    </section>
  );
}

// --- Channels & Lands: channel board + accounts + adapter status -----------
function ChannelsScreen({ channels, marketplaceAccounts, podAccounts, adapterStatus, etsyStatus, runEngineAction }) {
  const [notice, setNotice] = useState("");
  const sortedChannels = [...channels].sort(
    (a, b) => Number(a.priority || 99) - Number(b.priority || 99)
  );
  async function check(kind, account) {
    try {
      const path = kind === "marketplace" ? `/api/marketplace-accounts/${account.id}/check` : `/api/pod-accounts/${account.id}/check`;
      const result = await runEngineAction(path, { method: "POST" });
      setNotice(result.result?.message || "Checked.");
    } catch { /* parent shows error */ }
  }
  async function setChannelStatus(channel, status) {
    try {
      const result = await runEngineAction(`/api/channels/${channel.key}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      setNotice(result.message);
    } catch { /* parent shows error */ }
  }

  return (
    <section className="screen">
      <div className="farmHero compactFarmHero">
        <div><p className="eyebrow">Every land, honestly</p><h3>Channels &amp; Lands</h3><p>Blocked and waiting lands stay on the board instead of being deleted — this is why the engine starts with Blog Land and routes physical products through Printful.</p></div>
      </div>
      {notice && <div className="successNotice">{notice}</div>}

      <article className="panel widePanel">
        <div className="panelHeader"><div><p className="eyebrow">Priority order</p><h3>Land board</h3></div><span className="smallMuted">Statuses are tracked facts — update them as the world changes.</span></div>
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>#</th><th>Land</th><th>Kind</th><th>Status</th><th>Why / next step</th><th>Crops</th></tr></thead>
            <tbody>
              {sortedChannels.map((channel) => (
                <tr key={channel.key}>
                  <td>{channel.priority}</td>
                  <td><strong>{channel.name}</strong></td>
                  <td>{titleCase(channel.kind)}</td>
                  <td>
                    <select
                      className="inlineSelect"
                      value={channel.status}
                      onChange={(event) => setChannelStatus(channel, event.target.value)}
                    >
                      {CHANNEL_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{titleCase(status)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="detailCell">{channel.reason}{channel.notes ? ` — ${channel.notes}` : ""}</td>
                  <td className="detailCell">{(channel.crops || []).map(titleCase).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <EtsyConnectionPanel
        etsyStatus={etsyStatus}
        runEngineAction={runEngineAction}
      />

      <article className="panel">
        <div className="panelHeader"><div><p className="eyebrow">Selling lands</p><h3>Marketplace accounts</h3></div></div>
        <div className="connectionGrid">
          {marketplaceAccounts.map((account) => (
            <div className="connectionCard" key={account.id}>
              <div className="rowBetween"><strong>{account.name}</strong><StatusBadge value={account.status} /></div>
              <p>{titleCase(account.platform)} · {account.marketplaceId || "—"} · {account.env || ""}</p>
              <p className="smallMuted">{account.notes}</p>
              <button className="ghostButton" onClick={() => check("marketplace", account)}>Check connection</button>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panelHeader"><div><p className="eyebrow">Fulfillment</p><h3>POD accounts</h3></div></div>
        <div className="connectionGrid">
          {podAccounts.map((account) => (
            <div className="connectionCard" key={account.id}>
              <div className="rowBetween"><strong>{account.name}</strong><StatusBadge value={account.status} /></div>
              <p>{titleCase(account.provider)}</p>
              <p className="smallMuted">{account.notes}</p>
              <button className="ghostButton" onClick={() => check("pod", account)}>Check connection</button>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panelHeader"><div><p className="eyebrow">Adapters</p><h3>Live adapter status</h3></div><span className="smallMuted">Credentials read from .env.local only.</span></div>
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>Adapter</th><th>Kind</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {adapterStatus && Object.entries(adapterStatus.marketplaces || {}).map(([platform, state]) => (
                <tr key={`m-${platform}`}><td>{titleCase(platform)}</td><td>Marketplace</td><td><StatusBadge value={state.status} /></td><td className="detailCell">{state.message}</td></tr>
              ))}
              {adapterStatus && Object.entries(adapterStatus.pod || {}).map(([provider, state]) => (
                <tr key={`p-${provider}`}><td>{titleCase(provider)}</td><td>POD</td><td><StatusBadge value={state.status} /></td><td className="detailCell">{state.message}</td></tr>
              ))}
              {adapterStatus && Object.entries(adapterStatus.blog || {}).map(([target, state]) => (
                <tr key={`b-${target}`}><td>{titleCase(target)}</td><td>Blog</td><td><StatusBadge value={state.status} /></td><td className="detailCell">{state.message}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

// --- Orders ----------------------------------------------------------------
function OrdersScreen({ orders, listings }) {
  const listingOf = (order) => listings.find((listing) => listing.id === order.listingId);
  return (
    <section className="screen">
      <div className="farmHero compactFarmHero">
        <div><p className="eyebrow">Order router</p><h3>Orders</h3><p>When a marketplace order arrives it is matched to its SKU/design, routed to the POD provider, and tracking is uploaded back. No live orders yet.</p></div>
      </div>
      <div className="panel widePanel">
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>Order</th><th>Platform</th><th>Listing</th><th>POD status</th><th>Tracking</th><th>Net</th><th>Needs attention</th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td><code>{order.platformOrderId || order.id}</code></td>
                  <td>{order.platform}</td>
                  <td>{listingOf(order)?.title || order.listingId || "—"}</td>
                  <td>{titleCase(order.status || "new")}</td>
                  <td>{order.trackingNumber || "—"}</td>
                  <td>{money(order.netProfit)}</td>
                  <td>{order.needsAttentionReason || "—"}</td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan="7"><EmptyState message="No orders yet. Orders will appear here once a marketplace adapter is connected and syncing." /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// --- Metrics & 60-day Decisions -------------------------------------------
function MetricsDecisionsScreen({ engineDashboard, listings, decisions, runEngineAction }) {
  const dueForReview = engineDashboard?.dueForReview || [];
  const [metricForm, setMetricForm] = useState({ listingId: "", impressions: 0, views: 0, clicks: 0, favoritesOrWatchers: 0, orders: 0, grossRevenue: 0, platformFees: 0, podCost: 0, shippingCost: 0 });
  const [notice, setNotice] = useState("");
  const listingTitle = (id) => listings.find((listing) => listing.id === id)?.title || id;

  async function decide(listingId, decision) {
    try { const result = await runEngineAction(`/api/decisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, decision }) }); setNotice(result.message); }
    catch { /* parent shows error */ }
  }
  async function addMetric(event) {
    event.preventDefault();
    if (!metricForm.listingId) { setNotice("Choose a listing for the metric row."); return; }
    try { const result = await runEngineAction(`/api/metrics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metricForm) }); setNotice(result.message); }
    catch { /* parent shows error */ }
  }

  return (
    <section className="screen">
      <div className="farmHero compactFarmHero">
        <div><p className="eyebrow">Keep · kill · remix</p><h3>Metrics &amp; Decisions</h3><p>Weak performers are reviewed every 60 days. Nothing is deleted by default — decisions are logged and the review clock resets on keep/revise.</p></div>
      </div>
      {notice && <div className="successNotice">{notice}</div>}

      <article className="panel widePanel">
        <div className="panelHeader"><div><p className="eyebrow">{dueForReview.length} due</p><h3>60-day review queue</h3></div></div>
        <div className="postList">
          {dueForReview.map((item) => (
            <article className="decisionRow2" key={item.listingId}>
              <div>
                <strong>{listingTitle(item.listingId)}</strong>
                <small>{item.daysLive} days live · {item.totals.orders} orders · {item.totals.impressions} impressions</small>
                <p className="recommendationText">Recommendation: <strong>{titleCase(item.recommendation)}</strong> — {item.reason}</p>
              </div>
              <div className="decisionButtons">
                {DECISION_OPTIONS.map((decision) => (
                  <button key={decision} onClick={() => decide(item.listingId, decision)}>{titleCase(decision)}</button>
                ))}
              </div>
            </article>
          ))}
          {!dueForReview.length && <EmptyState message="No listings are due for a 60-day review yet." />}
        </div>
      </article>

      <div className="twoColumn">
        <article className="panel">
          <div className="panelHeader"><div><p className="eyebrow">Manual entry</p><h3>Add daily metrics</h3></div></div>
          <form className="performanceForm" onSubmit={addMetric}>
            <label className="spanTwo">Listing
              <select value={metricForm.listingId} onChange={(event) => setMetricForm({ ...metricForm, listingId: event.target.value })}>
                <option value="">Choose a listing</option>
                {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}
              </select>
            </label>
            {[["impressions", "Impressions"], ["views", "Views"], ["clicks", "Clicks"], ["favoritesOrWatchers", "Watchers"], ["orders", "Orders"], ["grossRevenue", "Gross revenue"], ["platformFees", "Platform fees"], ["podCost", "POD cost"], ["shippingCost", "Shipping cost"]].map(([key, label]) => (
              <label key={key}>{label}<input type="number" step="0.01" min="0" value={metricForm[key]} onChange={(event) => setMetricForm({ ...metricForm, [key]: event.target.value })} /></label>
            ))}
            <button className="primaryButton spanTwo" type="submit">Save metric row</button>
          </form>
        </article>

        <article className="panel">
          <div className="panelHeader"><div><p className="eyebrow">Log</p><h3>Recent decisions</h3></div></div>
          <div className="postList">
            {decisions.slice(0, 8).map((decision) => (
              <article className="backendListItem" key={decision.id}>
                <strong>{titleCase(decision.decision)}</strong>
                <p>{listingTitle(decision.listingId)}</p>
                <p className="smallMuted">was recommending {titleCase(decision.recommendationAtTime)} · {formatDateTime(decision.createdAt)}</p>
              </article>
            ))}
            {!decisions.length && <EmptyState message="No decisions logged yet." />}
          </div>
        </article>
      </div>
    </section>
  );
}

// --- Etsy Personal Access connection panel ----------------------------------
// Listing creation lives in the crop's digital pipeline so there is one path.
// Secrets never reach this component — the status endpoint returns booleans,
// expiry timestamps, and ids only.
function EtsyConnectionPanel({ etsyStatus, runEngineAction }) {
  const [notice, setNotice] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [settingsForm, setSettingsForm] = useState(null);
  const [taxonomyOptions, setTaxonomyOptions] = useState([]);
  const [taxonomyQuery, setTaxonomyQuery] = useState("sticker");
  const [resolver, setResolver] = useState({ shopUrl: "", shopName: "", shopId: "" });
  const [shopCandidates, setShopCandidates] = useState([]);

  const s = etsyStatus;
  const connected = Boolean(s?.oauth?.connected);
  const ready = s?.readiness?.status === "ready_for_draft_test";

  const settings = settingsForm ?? {
    shippingProfileId: s?.settings?.shippingProfileId || "",
    readinessStateId: s?.settings?.readinessStateId || "",
    taxonomyId: s?.settings?.taxonomyId || "",
    returnPolicyId: s?.settings?.returnPolicyId || "",
  };

  async function act(path, options, fallbackMessage) {
    setErrorDetail("");
    try {
      const result = await runEngineAction(path, options);
      setNotice(result.message || fallbackMessage || "Done.");
      return result;
    } catch (error) {
      setErrorDetail(error.message || "Etsy action failed.");
      return null;
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    await act("/api/etsy/settings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
    });
    setSettingsForm(null);
  }

  async function loadTaxonomy() {
    const result = await act("/api/integrations/etsy/taxonomy", {}, "Etsy categories loaded.");
    if (result) setTaxonomyOptions(flattenTaxonomy(result.results || result));
  }

  async function findShop() {
    setShopCandidates([]);
    const result = await act("/api/etsy/find-shop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopUrl: resolver.shopUrl, shopName: resolver.shopName }),
    });
    if (result) {
      setShopCandidates(result.candidates || []);
      const owned = (result.candidates || []).filter((candidate) => candidate.owned);
      const pick = owned[0] || (result.candidates?.length === 1 ? result.candidates[0] : null);
      if (pick) setResolver((current) => ({ ...current, shopId: pick.shopId }));
    }
  }

  async function validateShop(shopIdOverride) {
    const shopId = shopIdOverride ?? resolver.shopId;
    const result = await act("/api/etsy/validate-shop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId }),
    });
    if (result) setShopCandidates([]);
  }

  if (!s) {
    return (
      <article className="panel">
        <div className="panelHeader"><div><p className="eyebrow">Etsy · Personal Access</p><h3>Etsy connection</h3></div></div>
        <EmptyState message="Etsy status not loaded yet — refresh." />
      </article>
    );
  }

  return (
    <article className="panel etsyPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Etsy · Personal Access · your production shop</p>
          <h3>Etsy connection &amp; digital readiness</h3>
        </div>
        <StatusBadge value={s.readiness.status} />
      </div>
      {notice && <div className="successNotice">{notice}</div>}
      {errorDetail && <div className="backendError"><strong>Etsy error</strong><p>{errorDetail}</p></div>}

      <div className="twoColumn">
        <div>
          <dl className="metaList">
            <div><dt>Access level</dt><dd><StatusBadge value={s.accessLevel} /> (own shop only — no public app flow)</dd></div>
            <div><dt>Credentials</dt><dd>{s.credentialsPresent ? "Present (never displayed)" : `Missing: ${s.credentialsMissing.join(", ")}`}</dd></div>
            <div><dt>Redirect URI</dt><dd>{s.redirectUri || "not set"}</dd></div>
            <div><dt>Scopes</dt><dd>{s.scopes}</dd></div>
            <div><dt>OAuth</dt><dd>{connected ? `Connected (user ${s.oauth.userId || "?"})` : "Not connected"}</dd></div>
            <div><dt>Token</dt><dd>{connected ? `${s.oauth.expired ? "Expired — auto-refreshes on next call" : `Valid until ${formatDateTime(s.oauth.expiresAt)}`}` : "—"}</dd></div>
            <div><dt>Shop</dt><dd>{s.shop.id ? `#${s.shop.id} ${s.shop.name}` : "Not resolved"}</dd></div>
            <div><dt>Mode</dt><dd><StatusBadge value={s.testMode ? "test_mode_draft_only" : "draft"} /> create state: {s.createState}</dd></div>
          </dl>

          <div className="presetChecks etsyGates">
            {s.readiness.gates.map((gate) => (
              <span key={gate.key} className={gate.ok ? "ok" : "missing"} title={gate.detail}>{titleCase(gate.key)}</span>
            ))}
          </div>

          <div className="inlineActions etsyActions">
            {!connected && s.credentialsPresent && (
              <a className="primaryButton buttonLink" href={`${API_BASE}/api/auth/etsy/start`} target="_blank" rel="noreferrer">Connect Etsy</a>
            )}
            <button className="ghostButton" disabled={!connected} onClick={() => act("/api/etsy/test-connection", { method: "POST" })}>Test Connection</button>
            <button className="ghostButton" disabled={!connected} onClick={() => act("/api/etsy/resolve-shop", { method: "POST" })}>Resolve shop</button>
            <button className="ghostButton" disabled={!connected || !s.shop.id} onClick={() => act("/api/etsy/sync-setup", { method: "POST" })}>Sync shop setup</button>
            {connected && (
              <button className="dangerButton" onClick={() => act("/api/auth/etsy/disconnect", { method: "POST" })}>Disconnect</button>
            )}
          </div>
          {s.oauth.lastAuthError && <p className="missingFlag">Last auth error: {s.oauth.lastAuthError}</p>}
          {s.setup?.errors && Object.keys(s.setup.errors).length > 0 && (
            <p className="smallMuted">Setup sync issues: {Object.entries(s.setup.errors).map(([key, err]) => `${key}: ${err.message}`).join(" · ")}</p>
          )}
        </div>

        <form className="listingForm" onSubmit={saveSettings}>
          <div className="panelHeader compactHeader spanTwo"><h3>Shop setup</h3><span className="smallMuted">{s.setup?.syncedAt ? `Synced ${formatDateTime(s.setup.syncedAt)}` : "Not synced yet"}</span></div>
          <p className="spanTwo smallMuted">Digital downloads do not require shipping or processing profiles. Those synced values are retained only for future physical/POD products.</p>
          <div className="taxonomyPicker">
            <span>Taxonomy (category) ID</span>
            <div className="inlineActions">
              <input value={taxonomyQuery} onChange={(event) => setTaxonomyQuery(event.target.value)} placeholder="Search categories" />
              <button className="ghostButton" type="button" onClick={loadTaxonomy}>Load</button>
            </div>
            {taxonomyOptions.length ? (
              <select value={settings.taxonomyId} onChange={(event) => setSettingsForm({ ...settings, taxonomyId: event.target.value })}>
                <option value="">Choose a category</option>
                {taxonomyOptions.filter((option) => option.name.toLowerCase().includes(taxonomyQuery.toLowerCase())).slice(0, 100).map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            ) : (
              <input value={settings.taxonomyId} onChange={(event) => setSettingsForm({ ...settings, taxonomyId: event.target.value })} placeholder="e.g. 2078 — or load & search" />
            )}
          </div>
          <div className="spanTwo listingActions"><button className="secondaryButton" type="submit">Save Etsy settings</button></div>
        </form>
      </div>

      <div className="etsyDraftBox etsyResolverBox">
        <div className="panelHeader compactHeader">
          <h3>Manual shop resolver</h3>
          <span className="smallMuted">Use this when automatic resolution fails. A shop URL is never treated as a numeric id.</span>
        </div>
        <div className="listingForm">
          <label>Public Etsy shop URL
            <input
              value={resolver.shopUrl}
              onChange={(event) => setResolver({ ...resolver, shopUrl: event.target.value })}
              placeholder="https://www.etsy.com/shop/YourShopName"
            />
          </label>
          <label>Etsy shop name
            <input
              value={resolver.shopName}
              onChange={(event) => setResolver({ ...resolver, shopName: event.target.value })}
              placeholder="YourShopName"
            />
          </label>
          <label>Numeric shop ID
            <input
              inputMode="numeric"
              value={resolver.shopId}
              onChange={(event) => setResolver({ ...resolver, shopId: event.target.value })}
              placeholder="e.g. 12345678"
            />
          </label>
        </div>
        <div className="inlineActions">
          <button className="secondaryButton" disabled={!resolver.shopUrl && !resolver.shopName} onClick={findShop}>
            Find by URL / name
          </button>
          <button
            className="primaryButton"
            disabled={!connected || !/^\d+$/.test(resolver.shopId.trim())}
            title={connected ? "Checks the id against Etsy and confirms your token owns it" : "Connect Etsy first"}
            onClick={() => validateShop()}
          >
            Validate Numeric Shop ID &amp; save
          </button>
          <button className="ghostButton" disabled={!connected} onClick={() => act("/api/etsy/resolve-shop", { method: "POST" })}>
            Retry automatic (OAuth owner)
          </button>
        </div>
        {shopCandidates.length > 0 && (
          <div className="shopCandidates">
            {shopCandidates.map((candidate) => (
              <div className="shopCandidate" key={candidate.shopId}>
                <span>
                  <strong>#{candidate.shopId}</strong> {candidate.shopName}
                  {candidate.owned ? <span className="presetChecks"><span className="ok">owned by you</span></span> : <span className="presetChecks"><span className="missing">owner {candidate.ownerUserId || "?"}</span></span>}
                </span>
                <button className="ghostButton" onClick={() => { setResolver({ ...resolver, shopId: candidate.shopId }); validateShop(candidate.shopId); }}>
                  Use &amp; validate
                </button>
              </div>
            ))}
          </div>
        )}
        <details className="etsyDebug">
          <summary>Resolver debug info (safe — no tokens)</summary>
          <dl className="metaList">
            <div><dt>Granted scopes</dt><dd>{s.oauth.grantedScopes?.length ? s.oauth.grantedScopes.join(" ") : "none recorded"}</dd></div>
            <div><dt>shops_r present</dt><dd>{s.oauth.hasShopsRead ? "yes" : "NO — reconnect Etsy"}</dd></div>
            <div><dt>OAuth user id prefix</dt><dd>{s.oauth.userId || "—"}</dd></div>
            <div><dt>Stored shop_id</dt><dd>{s.shop.id ? `#${s.shop.id} (${s.shop.name || "unnamed"})` : "none"}</dd></div>
            <div><dt>Last endpoint</dt><dd>{s.resolverDebug?.endpoint || "no resolver attempt recorded"}</dd></div>
            <div><dt>Last HTTP status</dt><dd>{s.resolverDebug?.httpStatus ?? "—"} {s.resolverDebug?.at ? `· ${formatDateTime(s.resolverDebug.at)}` : ""}</dd></div>
            <div><dt>Note</dt><dd>{s.resolverDebug?.note || "—"}</dd></div>
          </dl>
          {s.resolverDebug?.body && <pre className="debugBody">{s.resolverDebug.body}</pre>}
        </details>
      </div>

      <div className="etsyDraftBox">
        <div className="panelHeader compactHeader"><h3>Digital listing handoff</h3><StatusBadge value={ready ? "ready" : s.readiness.status} /></div>
        <p>Connection and shop setup live here. Create, upload, verify, and activate digital listings from a crop’s <strong>Etsy Pipeline</strong> panel.</p>
        <p className="smallMuted">This removes the older physical-listing test path and keeps one auditable route for journaling pages and other downloads.</p>
      </div>
    </article>
  );
}

// --- Seeds: the idea layer of the engine ------------------------------------
function SeedsScreen({ seeds, blogPosts, podProductPlans, runEngineAction, openBlogPost }) {
  const [form, setForm] = useState({ title: "", niche: "", notes: "" });
  const [notice, setNotice] = useState("");

  async function createSeed(event) {
    event.preventDefault();
    if (!form.title.trim()) return;
    try {
      const result = await runEngineAction("/api/seeds", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      setNotice(result.message);
      setForm({ title: "", niche: "", notes: "" });
    } catch { /* parent shows error */ }
  }
  async function updateSeed(seed, updates) {
    try {
      const result = await runEngineAction(`/api/seeds/${seed.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
      });
      setNotice(result.message);
    } catch { /* parent shows error */ }
  }
  async function growBlogPost(seed) {
    try {
      const result = await runEngineAction(`/api/seeds/${seed.id}/blog-post`, { method: "POST" });
      setNotice(result.message);
      openBlogPost(result.post.id);
    } catch { /* parent shows error */ }
  }

  return (
    <section className="screen">
      <div className="farmHero compactFarmHero">
        <div><p className="eyebrow">Ideas & themes</p><h3>Seeds</h3><p>A seed is one core idea. Grow it into a blog post today; the same seed can later become pins, printables, or POD products.</p></div>
      </div>
      {notice && <div className="successNotice">{notice}</div>}

      <form className="panel filterBar seedForm" onSubmit={createSeed}>
        <label>New seed<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Aquarium algae troubleshooting" /></label>
        <label>Niche / theme<input value={form.niche} onChange={(event) => setForm({ ...form, niche: event.target.value })} placeholder="aquarium care" /></label>
        <label>Notes<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <button className="primaryButton" type="submit">Plant seed</button>
      </form>

      <div className="cropGrid">
        {seeds.map((seed) => {
          const seedPosts = blogPosts.filter((post) => post.seedId === seed.id);
          const seedPlans = podProductPlans.filter((plan) => plan.seedId === seed.id);
          return (
            <article className="cropCard presetCard" key={seed.id}>
              <div className="rowBetween">
                <StatusBadge value={seed.status || "idea"} />
                <select
                  className="inlineSelect"
                  value={seed.status || "idea"}
                  onChange={(event) => updateSeed(seed, { status: event.target.value })}
                >
                  {["idea", "active", "retired"].map((status) => (
                    <option key={status} value={status}>{titleCase(status)}</option>
                  ))}
                </select>
              </div>
              <h3>{seed.title}</h3>
              <p>{seed.niche || "No niche set"}</p>
              <div className="cropMeta">
                {(seed.targetCrops || []).map((crop) => <span key={crop}>{titleCase(crop)}</span>)}
              </div>
              <div className="cropMeta">
                <span>{seedPosts.length} blog post(s)</span>
                <span>{seedPlans.length} POD plan(s)</span>
              </div>
              {seed.notes && <p className="smallMuted">{seed.notes}</p>}
              <div className="inlineActions">
                <button className="primaryButton" onClick={() => growBlogPost(seed)}>Grow blog post</button>
                {seedPosts[0] && (
                  <button className="ghostButton" onClick={() => openBlogPost(seedPosts[0].id)}>Open latest</button>
                )}
              </div>
            </article>
          );
        })}
        {!seeds.length && <EmptyState message="No seeds yet. Plant your first idea above." />}
      </div>
    </section>
  );
}

// --- Blog Land: priority-1 channel, usable today -----------------------------
function blogChip(list, label) {
  return { label, count: list.length, ids: new Set(list.map((post) => post.id)) };
}

function BlogLandScreen({ blogPosts, seeds, assets, runEngineAction, selectedPostId, onSelectPost }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [notice, setNotice] = useState("");
  const post = blogPosts.find((entry) => entry.id === selectedPostId) || null;

  const now = new Date();
  const active = blogPosts.filter((entry) => entry.status !== "archived");
  const chips = [
    blogChip(blogPosts.filter((entry) => entry.status === "needs_review"), "Needs review"),
    blogChip(blogPosts.filter((entry) => ["approved", "ready_to_publish"].includes(entry.status)), "Ready to publish"),
    blogChip(
      blogPosts.filter(
        (entry) =>
          entry.status === "needs_update" ||
          (entry.status === "published" && entry.nextUpdateDate && new Date(entry.nextUpdateDate) <= now)
      ),
      "Needs update"
    ),
    blogChip(active.filter((entry) => !entry.title || !entry.slug || !entry.primaryKeyword), "Missing SEO basics"),
    blogChip(blogPosts.filter((entry) => entry.status === "published" && !entry.decisionStatus), "Can become products"),
  ];

  const filtered = blogPosts.filter((entry) => !statusFilter || entry.status === statusFilter);

  async function createPost() {
    try {
      const result = await runEngineAction("/api/blog/posts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Untitled post" }),
      });
      setNotice(result.message);
      onSelectPost(result.post.id);
    } catch { /* parent shows error */ }
  }

  if (post) {
    return (
      <BlogPostEditor
        key={post.id}
        post={post}
        seeds={seeds}
        assets={assets}
        runEngineAction={runEngineAction}
        onBack={() => onSelectPost(null)}
        notice={notice}
        setNotice={setNotice}
      />
    );
  }

  return (
    <section className="screen">
      <div className="farmHero compactFarmHero">
        <div><p className="eyebrow">Priority 1 · ready to start</p><h3>Blog Land</h3><p>The least blocked land. Draft locally, review, approve, then export markdown/HTML to any blog host — API publishing plugs in later.</p></div>
        <button className="primaryButton" onClick={createPost}>New blog post</button>
      </div>
      {notice && <div className="successNotice">{notice}</div>}

      <div className="chipRow">
        {chips.map((chip) => (
          <div className={`workChip ${chip.count ? "" : "workChipEmpty"}`} key={chip.label}>
            <strong>{chip.count}</strong>
            <span>{chip.label}</span>
          </div>
        ))}
      </div>

      <div className="panel filterBar">
        <label>Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            {BLOG_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
          </select>
        </label>
        <label>Showing<input readOnly value={`${filtered.length} of ${blogPosts.length}`} /></label>
      </div>

      <div className="panel widePanel">
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>Title</th><th>Status</th><th>Cluster</th><th>Keyword</th><th>Decision</th><th>Updated</th></tr></thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className="clickableRow" onClick={() => onSelectPost(entry.id)}>
                  <td><strong>{entry.title || "Untitled"}</strong>{!entry.slug && <span className="missingFlag"> no slug</span>}</td>
                  <td><StatusBadge value={entry.status} /></td>
                  <td>{entry.topicCluster || "—"}</td>
                  <td>{entry.primaryKeyword || <span className="missingFlag">missing</span>}</td>
                  <td>{entry.decisionStatus ? titleCase(entry.decisionStatus) : "—"}</td>
                  <td>{formatDateTime(entry.updatedAt)}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan="6"><EmptyState message="No posts match. Grow one from a Seed or create a new post." /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function BlogPostEditor({ post, seeds, assets, runEngineAction, onBack, notice, setNotice }) {
  const [form, setForm] = useState({
    ...post,
    secondaryKeywords: (post.secondaryKeywords || []).join(", "),
    internalLinks: (post.internalLinks || []).join("\n"),
    externalLinks: (post.externalLinks || []).join("\n"),
    monetizationLinks: (post.monetizationLinks || []).join("\n"),
  });
  const seed = seeds.find((entry) => entry.id === post.seedId);
  const imageAssets = assets.filter((asset) => !asset.isReference && asset.status !== "reference");
  const field = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  async function save(extra = {}) {
    try {
      const result = await runEngineAction(`/api/blog/posts/${post.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...extra }),
      });
      setNotice(result.message);
      return result;
    } catch { /* parent shows error */ }
  }
  async function decide(decision) {
    try {
      const result = await runEngineAction(`/api/blog/posts/${post.id}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
      });
      setNotice(result.message);
    } catch { /* parent shows error */ }
  }
  async function copyMarkdown() {
    try {
      const result = await runEngineAction(`/api/blog/posts/${post.id}/export?format=markdown`);
      await navigator.clipboard.writeText(result.content);
      setNotice("Markdown copied to clipboard.");
    } catch {
      setNotice("Clipboard unavailable — use Export Markdown instead.");
    }
  }
  async function exportFile(format) {
    try {
      const result = await runEngineAction(`/api/blog/posts/${post.id}/export?format=${format}&write=1`);
      setNotice(result.message);
    } catch { /* parent shows error */ }
  }

  return (
    <section className="screen">
      <button className="backButton" onClick={onBack}>← Blog Land</button>
      <div className="cropTitleRow">
        <div>
          <p className="eyebrow">{seed ? `Seed: ${seed.title}` : "Blog post"}</p>
          <h3>{form.title || "Untitled"}</h3>
          <p>/{form.slug || "no-slug"}</p>
        </div>
        <div className="titleBadges">
          <StatusBadge value={post.status} />
          {post.decisionStatus && <span className="podFlag">{titleCase(post.decisionStatus)}</span>}
        </div>
      </div>
      {notice && <div className="successNotice">{notice}</div>}

      <article className="panel">
        <div className="panelHeader">
          <div><p className="eyebrow">Export</p><h3>Ship it today</h3></div>
          <div className="inlineActions">
            <button className="secondaryButton" onClick={copyMarkdown}>Copy Markdown</button>
            <button className="secondaryButton" onClick={() => exportFile("markdown")}>Export Markdown</button>
            <button className="secondaryButton" onClick={() => exportFile("html")}>Export HTML</button>
            <button className="primaryButton" onClick={() => save()}>Save</button>
          </div>
        </div>
        <p className="smallMuted">Exports land in server/exports/blog/. Paste into your blog host, then set status to Published with the live URL.</p>
      </article>

      <form className="panel listingForm" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <label>Title<input value={form.title} onChange={field("title")} /></label>
        <label>Slug<input value={form.slug} onChange={field("slug")} placeholder="auto-generated from title" /></label>
        <label>Status
          <select value={form.status} onChange={field("status")}>
            {BLOG_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
          </select>
        </label>
        <label>Topic cluster<input value={form.topicCluster} onChange={field("topicCluster")} placeholder="aquarium care" /></label>
        <label>Primary keyword<input value={form.primaryKeyword} onChange={field("primaryKeyword")} /></label>
        <label>Secondary keywords (comma separated)<input value={form.secondaryKeywords} onChange={field("secondaryKeywords")} /></label>
        <label>Search intent
          <select value={form.searchIntent} onChange={field("searchIntent")}>
            <option value="">Not set</option>
            {SEARCH_INTENT_OPTIONS.map((intent) => <option key={intent} value={intent}>{titleCase(intent)}</option>)}
          </select>
        </label>
        <label>Audience<input value={form.audience} onChange={field("audience")} placeholder="first-time betta owners" /></label>
        <label className="spanTwo">Outline (markdown)<textarea rows="6" value={form.outline} onChange={field("outline")} /></label>
        <label className="spanTwo">Draft body (markdown)<textarea rows="16" className="draftBody" value={form.draftBody} onChange={field("draftBody")} /></label>
        <label className="spanTwo">Review notes<textarea rows="2" value={form.reviewNotes} onChange={field("reviewNotes")} /></label>
        <label className="spanTwo">Internal links (one per line)<textarea rows="2" value={form.internalLinks} onChange={field("internalLinks")} /></label>
        <label className="spanTwo">External links / sources (one per line)<textarea rows="2" value={form.externalLinks} onChange={field("externalLinks")} /></label>
        <label className="spanTwo">Monetization links (one per line)<textarea rows="2" value={form.monetizationLinks} onChange={field("monetizationLinks")} /></label>
        <label>Publish target
          <select value={form.publishTarget} onChange={field("publishTarget")}>
            {PUBLISH_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{titleCase(target)}</option>)}
          </select>
        </label>
        <label>Published URL<input value={form.publishedUrl} onChange={field("publishedUrl")} placeholder="https://…" /></label>
        <label>Next update date<input type="date" value={(form.nextUpdateDate || "").slice(0, 10)} onChange={field("nextUpdateDate")} /></label>
        <div className="spanTwo assetPicker">
          <span>Attached image assets</span>
          {imageAssets.slice(0, 24).map((asset) => (
            <label className="checkLabel" key={asset.id}>
              <input
                type="checkbox"
                checked={(form.assetIds || []).includes(asset.id)}
                onChange={(event) =>
                  setForm({
                    ...form,
                    assetIds: event.target.checked
                      ? [...(form.assetIds || []), asset.id]
                      : (form.assetIds || []).filter((id) => id !== asset.id),
                  })
                }
              />
              {asset.fileName}
            </label>
          ))}
          {!imageAssets.length && <small>Generate or import images in Etsy Studio to attach hero images.</small>}
        </div>
        <div className="spanTwo listingActions">
          <button className="primaryButton" type="submit">Save post</button>
        </div>
      </form>

      <article className="panel">
        <div className="panelHeader"><div><p className="eyebrow">What happens to this post next?</p><h3>Decision</h3></div></div>
        <div className="decisionButtons wrapButtons">
          {BLOG_DECISION_OPTIONS.map((decision) => (
            <button
              key={decision}
              className={post.decisionStatus === decision ? "active" : ""}
              onClick={() => decide(decision)}
            >
              {titleCase(decision)}
            </button>
          ))}
        </div>
        <p className="smallMuted">Timestamps — created {formatDateTime(post.createdAt)} · reviewed {post.lastReviewedAt ? formatDateTime(post.lastReviewedAt) : "never"} · published {post.publishedAt ? formatDateTime(post.publishedAt) : "not yet"}</p>
      </article>
    </section>
  );
}

// --- POD Land: Printful-mediated eBay lane -----------------------------------
function PodLandScreen({ podProductPlans, assets, seeds, channels, runEngineAction }) {
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState(null);
  const approvedDesigns = assets.filter(
    (asset) => !asset.isReference && ["approved", "final"].includes(asset.status)
  );
  const [createForm, setCreateForm] = useState({
    title: "", designId: "", productType: "sticker", price: 4.99, estimatedCost: 1.6, estimatedShipping: 0.85,
  });
  const podChannel = channels.find((channel) => channel.key === "printful_pod");
  const ebayDirect = channels.find((channel) => channel.key === "ebay_direct");
  const plan = podProductPlans.find((entry) => entry.id === editingId) || null;
  const designOf = (entry) => assets.find((asset) => asset.id === entry.designId);
  const nextStep = (entry) => (entry.manualSteps || []).find((step) => !step.done);

  async function createPlan(event) {
    event.preventDefault();
    try {
      const result = await runEngineAction("/api/pod-plans", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createForm),
      });
      setNotice(result.message);
      setEditingId(result.plan.id);
    } catch { /* parent shows error */ }
  }
  async function toggleStep(entry, index) {
    try {
      await runEngineAction(`/api/pod-plans/${entry.id}/toggle-step`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index }),
      });
    } catch { /* parent shows error */ }
  }
  async function patchPlan(entry, updates) {
    try {
      const result = await runEngineAction(`/api/pod-plans/${entry.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
      });
      setNotice(result.message);
    } catch { /* parent shows error */ }
  }

  return (
    <section className="screen">
      <div className="farmHero compactFarmHero">
        <div>
          <p className="eyebrow">Priority 2 · Printful-mediated eBay</p>
          <h3>POD Land</h3>
          <p>
            Auto Farmland prepares the design, copy, pricing, and margin; Printful's
            official eBay integration carries the product to eBay. No eBay developer
            account needed — the direct adapter stays parked as
            {" "}<StatusBadge value={ebayDirect?.status || "developer_account_blocked"} />.
          </p>
        </div>
      </div>
      {notice && <div className="successNotice">{notice}</div>}

      {podChannel && podChannel.status !== "active" && (
        <div className="panel setupCallout">
          <strong>Setup needed:</strong> {podChannel.reason} Track progress on the Channels board.
        </div>
      )}

      <form className="panel listingForm" onSubmit={createPlan}>
        <div className="panelHeader spanTwo"><div><p className="eyebrow">New plan</p><h3>Plan a POD product</h3></div></div>
        <label>Title<input value={createForm.title} onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })} placeholder="Garden Cat Sage Sticker" /></label>
        <label>Design (approved)
          <select value={createForm.designId} onChange={(event) => setCreateForm({ ...createForm, designId: event.target.value })}>
            <option value="">No design yet</option>
            {approvedDesigns.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName}</option>)}
          </select>
        </label>
        <label>Product type<input value={createForm.productType} onChange={(event) => setCreateForm({ ...createForm, productType: event.target.value })} /></label>
        <label>Price<input type="number" step="0.01" min="0" value={createForm.price} onChange={(event) => setCreateForm({ ...createForm, price: event.target.value })} /></label>
        <label>Estimated cost<input type="number" step="0.01" min="0" value={createForm.estimatedCost} onChange={(event) => setCreateForm({ ...createForm, estimatedCost: event.target.value })} /></label>
        <label>Estimated shipping<input type="number" step="0.01" min="0" value={createForm.estimatedShipping} onChange={(event) => setCreateForm({ ...createForm, estimatedShipping: event.target.value })} /></label>
        <div className="spanTwo listingActions"><button className="primaryButton" type="submit">Create plan</button></div>
      </form>

      <div className="postList">
        {podProductPlans.map((entry) => {
          const design = designOf(entry);
          const pending = nextStep(entry);
          return (
            <article className="listingRow" key={entry.id}>
              <div className="listingMain">
                <div className="rowBetween"><StatusBadge value={entry.status} /><span className="smallMuted">{entry.podProvider} → {entry.targetMarketplace}</span></div>
                <strong>{entry.title || "Untitled plan"}</strong>
                <div className="libraryMeta">
                  <span>{titleCase(entry.productType)}</span>
                  <span>{money(entry.price)}</span>
                  <span>margin {money(entry.estimatedMargin)} ({entry.estimatedMarginPct}%)</span>
                  <span>{design ? design.fileName : "no design linked"}</span>
                </div>
                <div className="libraryMeta">
                  <span>
                    Next step: {pending ? pending.label : "all steps done ✓"}
                  </span>
                </div>
                {entry.ebayListingUrl && <a href={entry.ebayListingUrl} target="_blank" rel="noreferrer">Open eBay listing ↗</a>}
              </div>
              <div className="listingActions verticalActions">
                <button className="ghostButton" onClick={() => setEditingId(editingId === entry.id ? null : entry.id)}>
                  {editingId === entry.id ? "Close" : "Open plan"}
                </button>
                <select
                  className="inlineSelect"
                  value={entry.status}
                  onChange={(event) => patchPlan(entry, { status: event.target.value })}
                >
                  {POD_PLAN_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
                </select>
              </div>
            </article>
          );
        })}
        {!podProductPlans.length && <EmptyState message="No POD plans yet. Approve a design, then plan its product above." />}
      </div>

      {plan && (
        <PodPlanEditor
          key={plan.id}
          plan={plan}
          design={designOf(plan)}
          seeds={seeds}
          toggleStep={toggleStep}
          patchPlan={patchPlan}
        />
      )}
    </section>
  );
}

function PodPlanEditor({ plan, design, toggleStep, patchPlan }) {
  const [form, setForm] = useState({ ...plan, tags: (plan.tags || []).join(", ") });
  const field = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const doneCount = (plan.manualSteps || []).filter((step) => step.done).length;

  return (
    <article className="panel">
      <div className="panelHeader">
        <div><p className="eyebrow">Plan detail</p><h3>{plan.title || "Untitled plan"}</h3></div>
        {design && <img className="planThumb" src={`${API_BASE}${design.publicUrl}`} alt={design.fileName} />}
      </div>

      <div className="twoColumn">
        <form className="listingForm" onSubmit={(event) => { event.preventDefault(); patchPlan(plan, form); }}>
          <label className="spanTwo">Title (eBay listing copy)<input value={form.title} onChange={field("title")} /></label>
          <label className="spanTwo">Description<textarea rows="6" value={form.description} onChange={field("description")} placeholder="Listing copy pasted into Printful/eBay" /></label>
          <label className="spanTwo">Tags / keywords (comma separated)<input value={form.tags} onChange={field("tags")} /></label>
          <label>Price<input type="number" step="0.01" min="0" value={form.price} onChange={field("price")} /></label>
          <label>Estimated cost<input type="number" step="0.01" min="0" value={form.estimatedCost} onChange={field("estimatedCost")} /></label>
          <label>Estimated shipping<input type="number" step="0.01" min="0" value={form.estimatedShipping} onChange={field("estimatedShipping")} /></label>
          <label>Printful product ID<input value={form.printfulProductId} onChange={field("printfulProductId")} placeholder="after upload" /></label>
          <label className="spanTwo">eBay listing URL<input value={form.ebayListingUrl} onChange={field("ebayListingUrl")} placeholder="after Printful syncs it" /></label>
          <label className="spanTwo">Notes<textarea rows="3" value={form.notes} onChange={field("notes")} /></label>
          <div className="spanTwo listingActions"><button className="primaryButton" type="submit">Save plan</button></div>
        </form>

        <div>
          <div className="panelHeader compactHeader"><h3>Manual checklist ({doneCount}/{(plan.manualSteps || []).length})</h3></div>
          <div className="checklist">
            {(plan.manualSteps || []).map((step, index) => (
              <label className={`checkItem ${step.done ? "done" : ""}`} key={step.step}>
                <input type="checkbox" checked={Boolean(step.done)} onChange={() => toggleStep(plan, index)} />
                <span>{step.label}</span>
              </label>
            ))}
          </div>
          <p className="smallMuted">
            These steps are honest manual work until a Printful API adapter automates
            them. Statuses never advance on their own.
          </p>
        </div>
      </div>
    </article>
  );
}

// --- Settings --------------------------------------------------------------
function SettingsScreen({ health, integrationStatus, adapterStatus, backendData, refreshAll, runEngineAction, embedded = false, onBack }) {
  const marketplaces = adapterStatus?.marketplaces || {};
  const pod = adapterStatus?.pod || {};
  const settings = backendData?.automationSettings || {};
  const [automationForm, setAutomationForm] = useState(() => ({
    enabled: Boolean(settings.enabled),
    schedulerEnabled: Boolean(settings.schedulerEnabled),
    executionMode: "shadow",
    timeZone: settings.timeZone || "America/Los_Angeles",
    runHourLocal: settings.runHourLocal ?? 9,
    dailyListingLimit: settings.dailyListingLimit ?? 1,
    dailyOpenAiBudgetUsd: settings.dailyOpenAiBudgetUsd ?? 5,
    maxRetries: settings.maxRetries ?? 2,
  }));
  const [automationNotice, setAutomationNotice] = useState("");
  const [preview, setPreview] = useState(null);

  function automationField(name) {
    return (event) => setAutomationForm((current) => ({
      ...current,
      [name]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));
  }

  async function saveAutomation(event) {
    event.preventDefault();
    try {
      const result = await runEngineAction("/api/automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(automationForm),
      });
      setAutomationNotice(result.message);
    } catch { /* parent shows error */ }
  }

  async function previewAutomation() {
    try {
      const result = await runEngineAction("/api/automation/preview", { method: "POST" });
      setPreview(result.preview);
      setAutomationNotice(result.message);
    } catch { /* parent shows error */ }
  }

  async function runShadowNow() {
    try {
      const result = await runEngineAction("/api/automation/run-now", { method: "POST" });
      setAutomationNotice(result.message);
      setPreview(result.execution || null);
    } catch { /* parent shows error */ }
  }
  return (
    <section className={embedded ? "screen embeddedToolScreen embeddedSettings" : "screen"}>
      <div className="farmHero compactFarmHero">
        {embedded && <button type="button" className="entryBackButton" onClick={onBack}>← Back to farm</button>}
        <div><p className="eyebrow">Configuration</p><h3>Settings</h3><p>Connection health, credentials, and local data. Credentials live only in <code>.env.local</code> — never in the app.</p></div>
        <div className="inlineActions">
          <button className="ghostButton" onClick={refreshAll}>Refresh</button>
        </div>
      </div>

      <div className="backendGrid">
        <form className="panel automationPanel" onSubmit={saveAutomation}>
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Daily pipeline</p>
              <h3>Shadow Automation</h3>
              <p>No image generation, Etsy drafts, publishing, or deactivation can occur in this mode.</p>
            </div>
            <StatusBadge value={automationForm.enabled ? "shadow" : "off"} />
          </div>
          {automationNotice && <div className="successNotice">{automationNotice}</div>}
          <div className="automationControls">
            <label className="checkItem"><input type="checkbox" checked={automationForm.enabled} onChange={automationField("enabled")} /><span>Enable global shadow automation</span></label>
            <label className="checkItem"><input type="checkbox" checked={automationForm.schedulerEnabled} onChange={automationField("schedulerEnabled")} /><span>Run daily while this computer is on</span></label>
            <label>Time zone<input value={automationForm.timeZone} onChange={automationField("timeZone")} /></label>
            <label>Run hour (0-23)<input type="number" min="0" max="23" value={automationForm.runHourLocal} onChange={automationField("runHourLocal")} /></label>
            <label>Daily listing limit<input type="number" min="1" max="25" value={automationForm.dailyListingLimit} onChange={automationField("dailyListingLimit")} /></label>
            <label>Daily OpenAI budget<input type="number" min="0" step="0.01" value={automationForm.dailyOpenAiBudgetUsd} onChange={automationField("dailyOpenAiBudgetUsd")} /></label>
            <label>Maximum retries<input type="number" min="0" max="10" value={automationForm.maxRetries} onChange={automationField("maxRetries")} /></label>
          </div>
          <div className="inlineActions">
            <button className="primaryButton" type="submit">Save safety controls</button>
            <button className="ghostButton" type="button" onClick={previewAutomation}>Preview today</button>
            <button className="secondaryButton" type="button" onClick={runShadowNow}>Queue + simulate now</button>
          </div>
          {preview && (
            <div className="detailBox automationPreview">
              <strong>Latest preview/result</strong>
              <pre>{JSON.stringify(preview, null, 2)}</pre>
            </div>
          )}
          <div className="jobList">
            {(backendData?.automationJobs || []).slice(0, 5).map((job) => (
              <div className="jobItem" key={job.id}>
                <div className="jobRow">
                  <StatusBadge value={job.status} />
                  <span>{job.presetName}</span>
                  <span>{job.dateKey}</span>
                  <span>{money(job.estimatedCostUsd)} estimate</span>
                </div>
                {job.result && (
                  <div className="jobResult">
                    <strong>{job.result.title}</strong>
                    <span>Category #{job.result.taxonomyId || "missing"}</span>
                    <span>{(job.result.tags || []).length} tags</span>
                    <span>{money(job.result.price)}</span>
                    <span className="safeProof">External actions: {job.result.externalActions || 0} | Actual spend: $0.00</span>
                  </div>
                )}
              </div>
            ))}
            {!(backendData?.automationJobs || []).length && <p className="smallMuted">No shadow jobs yet.</p>}
          </div>
        </form>
        <BackendPanel title="Backend">
          <p><strong>Status:</strong> {health?.ok ? "Connected" : "Not connected"}</p>
          <p><strong>Storage:</strong> {titleCase(health?.storage || "unknown")}</p>
          <p><strong>Message:</strong> {health?.message || "—"}</p>
        </BackendPanel>
        <BackendPanel title="Connections">
          <p><strong>OpenAI:</strong> {integrationStatus?.openai?.configured ? `Configured (${integrationStatus.openai.model})` : "Not configured"}</p>
          <p><strong>Etsy:</strong> {integrationStatus?.etsy?.authorized ? "Authorized" : integrationStatus?.etsy?.configured ? "Needs consent" : "Not configured"}</p>
        </BackendPanel>
        <BackendPanel title="Marketplace adapters">
          {Object.entries(marketplaces).map(([platform, state]) => (
            <p key={platform}><strong>{titleCase(platform)}:</strong> {titleCase(state.status)}</p>
          ))}
          {!Object.keys(marketplaces).length && <p>Not loaded.</p>}
        </BackendPanel>
        <BackendPanel title="POD adapters">
          {Object.entries(pod).map(([provider, state]) => (
            <p key={provider}><strong>{titleCase(provider)}:</strong> {titleCase(state.status)}</p>
          ))}
          {!Object.keys(pod).length && <p>Not loaded.</p>}
        </BackendPanel>
        <BackendPanel title="Local data">
          <p><strong>Seeds:</strong> {(backendData?.seeds || []).length}</p>
          <p><strong>Blog posts:</strong> {(backendData?.blogPosts || []).length}</p>
          <p><strong>POD plans:</strong> {(backendData?.podProductPlans || []).length}</p>
          <p><strong>Designs:</strong> {(backendData?.assets || []).length}</p>
          <p><strong>Listings:</strong> {(backendData?.listings || []).length}</p>
          <p><strong>Channels:</strong> {(backendData?.channels || []).length}</p>
        </BackendPanel>
        <BackendPanel title="Env placeholders">
          <p className="smallMuted">Blog: WORDPRESS_BASE_URL · WORDPRESS_USERNAME · WORDPRESS_APP_PASSWORD · GHOST_ADMIN_API_URL · GHOST_ADMIN_API_KEY</p>
          <p className="smallMuted">POD: PRINTFUL_API_TOKEN · PRINTIFY_API_TOKEN · PRINTIFY_SHOP_ID · GELATO_API_KEY</p>
          <p className="smallMuted">eBay (blocked): EBAY_DEVELOPER_ACCESS=granted unlocks EBAY_CLIENT_ID · EBAY_CLIENT_SECRET · EBAY_REDIRECT_URI · EBAY_REFRESH_TOKEN</p>
        </BackendPanel>
      </div>
    </section>
  );
}
function EmptyState({ message }) {
  return (
    <div className="emptyState">
      <p>{message}</p>
    </div>
  );
}

export default App;
