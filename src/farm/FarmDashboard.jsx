import { useEffect, useState } from "react";
import "./FarmDashboard.css";

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function explainAccountWarning(warning) {
  if (/already attached/i.test(String(warning || ""))) {
    return {
      title: "The draft already has its download",
      message: "Auto Farmland tried to resume the Etsy draft, found the same file already attached, and stopped before creating a duplicate. Review the draft files; if they are complete, you can continue publishing.",
    };
  }
  return {
    title: "This account needs a quick review",
    message: "One automated step stopped before it could finish. Open the affected listing to see the safest next action.",
  };
}

function FarmMetricCloud({ metric, index }) {
  return (
    <div className={`farmMetricCloud cloud-${index + 1}`} aria-label={`${metric.label}: ${metric.display}`}>
      <span>{metric.label}</span>
      <strong className={metric.available ? "" : "unavailable"}>{metric.display}</strong>
      {metric.note && <small>{metric.note}</small>}
    </div>
  );
}

function SkyMetrics({ metrics }) {
  return (
    <section className="farmSky" aria-label="Global performance">
      <div className="decorCloud decorCloudOne" aria-hidden="true" />
      <div className="decorCloud decorCloudTwo" aria-hidden="true" />
      <div className="farmMetricClouds">
        {metrics.map((metric, index) => <FarmMetricCloud key={metric.key} metric={metric} index={index} />)}
      </div>
    </section>
  );
}

function BarnArtwork() {
  return (
    <svg viewBox="0 0 280 220" role="img" aria-label="Production barn">
      <path className="barnShadow" d="M34 198c41-26 171-28 220 0-58 20-167 20-220 0Z" />
      <path className="barnRoof" d="m24 83 116-70 116 70-20 25-96-56-96 56Z" />
      <path className="barnBody" d="M48 85h184v116H48Z" />
      <path className="barnLoft" d="M112 75h56v44h-56Z" />
      <path className="barnTrim" d="m116 79 48 36m0-36-48 36" />
      <path className="barnDoor" d="M95 126h90v75H95Z" />
      <path className="barnTrim" d="m101 132 78 63m0-63-78 63" />
      <path className="barnSilo" d="M211 75h30v126h-30Z" />
      <path className="barnSiloTop" d="M207 76c2-34 36-34 38 0Z" />
      <circle className="barnWindow" cx="140" cy="94" r="11" />
    </svg>
  );
}

function ProductionBarn({ onCreateListing, onReviewQueue, onViewPresets }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`productionBarn ${open ? "selected" : ""}`}>
      <button
        className="barnButton"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="barn-actions"
        title="Open the production barn"
      >
        <BarnArtwork />
        <span className="barnLabel"><strong>Production Barn</strong><small>Create, review, and prepare listings</small></span>
      </button>
      {open && (
        <div className="barnMenu" id="barn-actions">
          <button onClick={() => { setOpen(false); onCreateListing(); }}>Create new listing</button>
          <button onClick={() => { setOpen(false); onReviewQueue(); }}>Open review queue</button>
          <button onClick={() => { setOpen(false); onViewPresets(); }}>View presets</button>
        </div>
      )}
    </div>
  );
}

function FarmSignpost({ onCreateListing, onViewPresets, onOpenSettings, warningCount }) {
  return (
    <nav className="farmSignpost" aria-label="Farm destinations">
      <span className="signpostCap" aria-hidden="true" />
      <button className="signBoard signBoardCreate" onClick={onCreateListing}>
        <span>Create &amp; Publish</span>
        {warningCount > 0 && <strong aria-label={`${warningCount} listing needs attention`}>{warningCount}</strong>}
      </button>
      <button className="signBoard signBoardPresets" onClick={onViewPresets}>Listing Presets</button>
      <button className="signBoard signBoardSettings" onClick={onOpenSettings}>Settings</button>
      <span className="signpostPost" aria-hidden="true" />
      <span className="signpostGrass" aria-hidden="true" />
    </nav>
  );
}

function CowArtwork({ skinIndex = 0 }) {
  return (
    <svg className={`cowArtwork cowSkin${skinIndex % 4}`} viewBox="0 0 250 180" aria-hidden="true">
      <ellipse className="cowShadow" cx="124" cy="160" rx="91" ry="13" />
      <path className="cowTail" d="M202 78c28-22 27 18 17 30" />
      <ellipse className="cowBody" cx="127" cy="101" rx="78" ry="48" />
      <path className="cowSpot cowSpotOne" d="M88 63c22-9 42 3 42 23-5 20-37 16-48 0-5-8-1-18 6-23Z" />
      <path className="cowSpot cowSpotTwo" d="M151 101c19-18 49-6 47 15-4 21-35 26-49 11-8-8-6-18 2-26Z" />
      <path className="cowLeg" d="M76 127h20l-3 36H75Z" />
      <path className="cowLeg" d="M158 130h21l4 33h-21Z" />
      <path className="cowHoof" d="M73 158h23v9H73Z" />
      <path className="cowHoof" d="M160 158h25v9h-25Z" />
      <path className="cowNeck" d="M50 77c22-15 48-5 55 22l-20 39-37-14Z" />
      <ellipse className="cowHead" cx="55" cy="83" rx="40" ry="34" />
      <path className="cowEar" d="M25 65 4 55c-3 20 9 29 25 24Z" />
      <path className="cowEar" d="m82 64 20-12c4 18-7 29-24 27Z" />
      <path className="cowHorn" d="M30 54c-9-18 5-23 14-7" />
      <path className="cowHorn" d="M70 49c9-15 23-8 14 8" />
      <ellipse className="cowMuzzle" cx="50" cy="96" rx="27" ry="17" />
      <circle className="cowEye" cx="39" cy="76" r="4" />
      <circle className="cowEye" cx="67" cy="75" r="4" />
      <circle className="cowNostril" cx="40" cy="98" r="3" />
      <circle className="cowNostril" cx="59" cy="98" r="3" />
    </svg>
  );
}

function AccountCow({ account, onSelect }) {
  return (
    <button
      className={`accountCow status-${account.connectionStatus}`}
      onClick={() => onSelect(account)}
      aria-label={`Open ${account.platformLabel} account: ${account.name}`}
    >
      <span className="cowPortrait"><CowArtwork skinIndex={account.skinIndex} /></span>
      <span className="cowName">{account.name}</span>
      <span className="cowMeta">
        <span className="platformBadge">{account.platformLabel}</span>
        <span className="cowConnection"><i aria-hidden="true" />{account.connectionLabel}</span>
      </span>
      {account.warning && <span className="cowWarning" title="Needs attention" aria-label="Needs attention">!</span>}
    </button>
  );
}

function FarmEmptyState({ onConnectAccount }) {
  return (
    <div className="emptyPasture">
      <CowArtwork skinIndex={3} />
      <div>
        <h3>Your pasture is ready.</h3>
        <p>Connect a selling account and its cow will move in here.</p>
        <button onClick={onConnectAccount}>Connect your first account</button>
      </div>
    </div>
  );
}

function AccountPasture({ accounts, onSelectAccount, onConnectAccount }) {
  return (
    <section className="accountPasture" aria-label="Connected accounts">
      {accounts.length ? (
        <div className="cowRow">
          {accounts.map((account) => <AccountCow key={account.id} account={account} onSelect={onSelectAccount} />)}
        </div>
      ) : <FarmEmptyState onConnectAccount={onConnectAccount} />}
    </section>
  );
}

function ListingsTab({ account, onOpenListing }) {
  const groups = [
    ["active", "Active"],
    ["draft", "Drafts"],
    ["needs_attention", "Needs attention"],
    ["local", "Local only"],
  ];
  return (
    <div className="entryTabPanel" role="tabpanel">
      {groups.map(([status, label]) => {
        const listings = account.listings.filter((listing) => listing.status === status);
        if (!listings.length) return null;
        return (
          <section className="entrySection" key={status}>
            <h4>{label}</h4>
            <div className="entryListingList">
              {listings.map((listing) => (
                <button key={listing.id} onClick={() => onOpenListing(listing)}>
                  <span><strong>{listing.title}</strong><small>{listing.warning || listing.cropName}</small></span>
                  <span className={`entryStatus status-${listing.status}`}>{listing.status.replaceAll("_", " ")}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {!account.listings.length && <p className="emptyCopy">No listings have been created for this account.</p>}
    </div>
  );
}

function FarmToolPopup({ label, onClose, children }) {
  return (
    <div className="entryBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="accountEntry farmToolPopup" role="dialog" aria-modal="true" aria-label={label}>
        <button className="entryClose" onClick={onClose} aria-label={`Close ${label}`}>×</button>
        <div className="entryToolBody">{children}</div>
      </aside>
    </div>
  );
}

const PERFORMANCE_RANGES = [
  { id: "hourly", label: "Hourly", buckets: 24, step: 60 * 60 * 1000 },
  { id: "daily", label: "Daily", buckets: 7, step: 24 * 60 * 60 * 1000 },
  { id: "weekly", label: "Weekly", buckets: 8, step: 7 * 24 * 60 * 60 * 1000 },
  { id: "monthly", label: "Monthly", buckets: 12, step: 30 * 24 * 60 * 60 * 1000 },
  { id: "yearly", label: "Yearly", buckets: 5, step: 365 * 24 * 60 * 60 * 1000 },
  { id: "ytd", label: "YTD", buckets: new Date().getMonth() + 1, step: 30 * 24 * 60 * 60 * 1000 },
];

function performanceForRange(account, rangeId) {
  const range = PERFORMANCE_RANGES.find((item) => item.id === rangeId) || PERFORMANCE_RANGES[1];
  const now = Date.now();
  const start = range.id === "ytd" ? new Date(new Date().getFullYear(), 0, 1).getTime() : now - range.buckets * range.step;
  const snapshots = (account.performanceSnapshots || []).filter((row) => {
    const at = new Date(row.createdAt).getTime();
    return Number.isFinite(at) && at >= start && at <= now;
  });
  const listings = account.listings.filter((listing) => {
    const at = new Date(listing.updatedAt).getTime();
    return Number.isFinite(at) && at >= start && at <= now;
  });
  const values = Array.from({ length: range.buckets }, () => 0);
  snapshots.forEach((row) => {
    const at = new Date(row.createdAt).getTime();
    const index = Math.min(range.buckets - 1, Math.max(0, Math.floor((at - start) / ((now - start) / range.buckets))));
    values[index] += Number(row.revenue || 0);
  });
  return {
    values,
    tracked: snapshots.length > 0,
    revenue: snapshots.reduce((sum, row) => sum + Number(row.revenue || 0), 0),
    views: snapshots.reduce((sum, row) => sum + Number(row.views || 0), 0),
    orders: snapshots.reduce((sum, row) => sum + Number(row.orders || 0), 0),
    listings: listings.length,
  };
}

function RevenueChart({ values, tracked }) {
  const width = 300;
  const height = 92;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * width},${height - 8 - (value / max) * (height - 22)}`).join(" ");
  return (
    <div className={`revenueChart ${tracked ? "" : "isEmpty"}`} aria-label={tracked ? "Revenue chart" : "No revenue data for this period"}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true" preserveAspectRatio="none">
        <line x1="0" y1="30" x2={width} y2="30" />
        <line x1="0" y1="60" x2={width} y2="60" />
        <polygon points={`0,${height} ${points} ${width},${height}`} />
        <polyline points={points} />
      </svg>
      {!tracked && <span>No sales data yet</span>}
    </div>
  );
}

function accountTransactions(account) {
  const snapshotEntries = (account.performanceSnapshots || []).flatMap((snapshot) => {
    const entries = [];
    if (Number(snapshot.revenue || 0)) entries.push({
      id: `${snapshot.id}-revenue`,
      createdAt: snapshot.createdAt,
      description: "Sales revenue",
      amount: Number(snapshot.revenue),
      source: "Performance record",
    });
    if (Number(snapshot.spend || 0)) entries.push({
      id: `${snapshot.id}-spend`,
      createdAt: snapshot.createdAt,
      description: "Shop expense",
      amount: -Math.abs(Number(snapshot.spend)),
      source: "Performance record",
    });
    return entries;
  });
  return [...(account.manualTransactions || []), ...snapshotEntries]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function AccountCharacterSheet({ account, onReviewError }) {
  const [rangeId, setRangeId] = useState("daily");
  const [showStatement, setShowStatement] = useState(false);
  const [showError, setShowError] = useState(false);
  const handle = `@${String(account.name || "shop").replace(/^@/, "")}`;
  const performance = performanceForRange(account, rangeId);
  const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  const display = (value) => performance.tracked ? String(value) : "—";
  const transactions = accountTransactions(account);
  const moneyIn = transactions.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  const moneyOut = Math.abs(transactions.filter((row) => row.amount < 0).reduce((sum, row) => sum + row.amount, 0));
  const balance = moneyIn - moneyOut;
  const errorCopy = account.warning ? explainAccountWarning(account.warning) : null;
  return (
    <aside className="accountCharacter" aria-label={`${account.platformLabel} shop identity and stats`}>
      <button className={`moneyBalance ${balance < 0 ? "negative" : "positive"}`} onClick={() => setShowStatement(true)} aria-label={`Open money statement. Balance ${money(balance)}`}>
        <span aria-hidden="true">$</span><strong>{money(balance)}</strong>
      </button>
      {showStatement && (
        <section className="moneyStatement" role="dialog" aria-modal="false" aria-label="Shop money statement">
          <div className="statementHeader">
            <div><small>Shop balance</small><strong className={balance < 0 ? "negative" : "positive"}>{money(balance)}</strong></div>
            <button onClick={() => setShowStatement(false)} aria-label="Close money statement">×</button>
          </div>
          <div className="statementTotals">
            <span>Money in <strong>{money(moneyIn)}</strong></span>
            <span>Money out <strong>−{money(moneyOut)}</strong></span>
          </div>
          <div className="statementRows">
            {transactions.map((row) => (
              <article key={row.id}>
                <div><strong>{row.description}</strong><small>{formatDate(row.createdAt)} · {row.source}</small></div>
                <strong className={row.amount < 0 ? "negative" : "positive"}>{row.amount < 0 ? "−" : "+"}{money(Math.abs(row.amount))}</strong>
              </article>
            ))}
            {!transactions.length && <p>No money activity recorded yet.</p>}
          </div>
        </section>
      )}
      <div className="characterCow"><CowArtwork skinIndex={account.skinIndex} /></div>
      {errorCopy && (
        <>
          <button className="cowErrorButton" onClick={() => setShowError(true)} aria-label="Open account error">!</button>
          {showError && (
            <section className="cowErrorPanel" role="dialog" aria-modal="false" aria-label="Account error details">
              <div className="cowErrorHeader"><strong>Needs attention</strong><button onClick={() => setShowError(false)} aria-label="Close error details">×</button></div>
              <strong>{errorCopy.title}</strong>
              <p>{errorCopy.message}</p>
              {onReviewError && <button className="cowErrorReview" onClick={() => { setShowError(false); onReviewError(); }}>Review listing</button>}
              <details><summary>Technical details</summary><code>{account.warning}</code></details>
            </section>
          )}
        </>
      )}
      {account.shopUrl ? (
        <a id="account-entry-title" className="characterHandle" href={account.shopUrl} target="_blank" rel="noreferrer">{handle}<span aria-hidden="true">↗</span></a>
      ) : <h3 id="account-entry-title" className="characterHandle">{handle}</h3>}
      <p className="characterStatus"><span className={`connectionPip status-${account.connectionStatus}`} />Status: <strong>Active</strong></p>
      <div className="characterStats" aria-label="Account statistics">
        <div><span>Revenue</span><strong>{performance.tracked ? money(performance.revenue) : "—"}</strong></div>
        <div><span>Views</span><strong>{display(performance.views)}</strong></div>
        <div><span>Orders</span><strong>{display(performance.orders)}</strong></div>
        <div><span>Listings</span><strong>{performance.listings}</strong></div>
      </div>
      <section className="characterPerformance" aria-label="Revenue performance">
        <div className="chartRangeTabs" role="group" aria-label="Revenue time range">
          {PERFORMANCE_RANGES.map((range) => <button key={range.id} className={rangeId === range.id ? "active" : ""} aria-pressed={rangeId === range.id} onClick={() => setRangeId(range.id)}>{range.label}</button>)}
        </div>
        <RevenueChart values={performance.values} tracked={performance.tracked} />
      </section>
      <div className="accountTechnicalMeta" aria-hidden="true">
        <span>{account.connectionLabel}</span>
        <span>Connected {formatDate(account.connectedAt)}</span>
        <span>Last sync: {formatDate(account.lastSuccessfulSync)}</span>
      </div>
    </aside>
  );
}

function AccountCollectionEntry({ account, onClose, onOpenListing, renderPresetManager, renderListingReview }) {
  const [tab, setTab] = useState("presets");
  const [page, setPage] = useState("account");
  const [reviewListing, setReviewListing] = useState(null);
  const [presetFullscreen, setPresetFullscreen] = useState(false);
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const tabs = ["presets", "listings"];
  const affectedListing = account.listings.find((listing) => listing.status === "needs_attention");
  function openListingInsideCollection(listing) {
    if (!renderListingReview) {
      onOpenListing(listing);
      return;
    }
    setReviewListing(listing);
    setPage("listing");
  }
  return (
    <div className="entryBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside
        className="accountEntry accountGameEntry"
        role="dialog"
        aria-modal="true"
        aria-label={presetFullscreen ? `${account.name} preset studio` : undefined}
        aria-labelledby={presetFullscreen ? undefined : "account-entry-title"}
      >
        <button className="entryClose" onClick={onClose} aria-label="Close account entry">×</button>
        <div className={`accountGameLayout ${presetFullscreen ? "presetFullscreen" : ""}`}>
          {!presetFullscreen && <AccountCharacterSheet account={account} onReviewError={affectedListing ? () => openListingInsideCollection(affectedListing) : null} />}
          <section className="accountGameContent">
            {page === "listing" ? (
              <div className="entryListingReviewBody">
                {reviewListing && renderListingReview?.({ listing: reviewListing, onBack: () => setPage("account") })}
              </div>
            ) : <>
              {!presetFullscreen && <div className="entryTabs" role="tablist" aria-label="Account details">
                {tabs.map((name) => <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}</button>)}
              </div>}
              <div className={`entryBody ${presetFullscreen ? "presetFullscreenBody" : ""}`}>
                {tab === "listings" && <ListingsTab account={account} onOpenListing={openListingInsideCollection} />}
                {tab === "presets" && (
                  <div className="entryTabPanel entryDirectPresets" role="tabpanel">
                    {renderPresetManager?.({
                      platform: account.platform,
                      hideBack: true,
                      onEditModeChange: setPresetFullscreen,
                      onRunComplete: (listing) => {
                        setPresetFullscreen(false);
                        openListingInsideCollection({ id: listing.id, cropId: listing.cropId, status: "local" });
                      },
                    })}
                  </div>
                )}
              </div>
            </>}
          </section>
        </div>
      </aside>
    </div>
  );
}

export default function FarmDashboard({ model, error, onCreateListing, onReviewQueue, onViewPresets, onConnectAccount, onOpenListing, renderPresetManager, renderListingReview, renderCreatePublish, renderCropWorkflow, renderSettings, warningCount = 0 }) {
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [toolView, setToolView] = useState(null);
  if (model.loading) return <div className="farmLoading" role="status"><span /><p>Opening the farm…</p></div>;
  if (error) return <div className="farmError" role="alert"><h2>The gate is stuck.</h2><p>{error}</p><button onClick={onConnectAccount}>Open settings</button></div>;

  function openCreateTool() {
    if (renderCreatePublish) setToolView({ type: "create", label: "Create and publish" });
    else onCreateListing();
  }

  function openPresetsTool() {
    if (renderPresetManager) setToolView({ type: "presets", label: "Listing presets" });
    else onViewPresets();
  }

  function openSettingsTool() {
    if (renderSettings) setToolView({ type: "settings", label: "Settings" });
    else onConnectAccount();
  }

  function openReviewTool() {
    if (renderCropWorkflow && model.reviewCropId) {
      setToolView({ type: "crop", label: "Review queue", cropId: model.reviewCropId, initialStep: "review" });
    } else onReviewQueue();
  }

  function openCropTool(cropId, initialStep = null) {
    if (renderCropWorkflow) setToolView({ type: "crop", label: "Listing workflow", cropId, initialStep });
    else onOpenListing({ cropId, status: initialStep || "listing" });
  }

  function renderToolContent() {
    if (!toolView) return null;
    const onBack = () => setToolView(null);
    if (toolView.type === "create") return renderCreatePublish?.({ onBack, onOpenCrop: openCropTool });
    if (toolView.type === "presets") return renderPresetManager?.({ onBack, backLabel: "← Back to farm" });
    if (toolView.type === "settings") return renderSettings?.({ onBack });
    if (toolView.type === "crop") return renderCropWorkflow?.({ cropId: toolView.cropId, initialStep: toolView.initialStep, onBack, backLabel: "← Back to farm" });
    return null;
  }

  return (
    <section className="farmDashboard">
      <div className="farmScene">
        <SkyMetrics metrics={model.metrics} />
        <div className="farmHills" aria-hidden="true"><span /><span /></div>
        <div className="farmGround">
          <div className="farmWorkyard">
            <FarmSignpost
              onCreateListing={openCreateTool}
              onViewPresets={openPresetsTool}
              onOpenSettings={openSettingsTool}
              warningCount={warningCount}
            />
            <ProductionBarn onCreateListing={openCreateTool} onReviewQueue={openReviewTool} onViewPresets={openPresetsTool} />
          </div>
          <AccountPasture accounts={model.accounts} onSelectAccount={setSelectedAccount} onConnectAccount={openSettingsTool} />
          <div className="farmFence" aria-hidden="true" />
        </div>
      </div>
      {selectedAccount && (
        <AccountCollectionEntry
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
          onOpenListing={onOpenListing}
          renderPresetManager={renderPresetManager}
          renderListingReview={renderListingReview}
        />
      )}
      {toolView && (
        <FarmToolPopup label={toolView.label} onClose={() => setToolView(null)}>
          {renderToolContent()}
        </FarmToolPopup>
      )}
    </section>
  );
}
