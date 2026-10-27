import { useEffect, useState } from "react";
import { PROJECT_PENS, PROJECT_STATUSES, PROJECT_TYPES } from "./farmViewModel";
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
        <span className="barnLabel"><strong>Production Barn</strong><small>Make &amp; review Etsy listings</small></span>
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

// The wool is drawn twice — a thicker brown pass, then the fill on top — so
// the overlapping puffs read as one fluffy outline.
const SHEEP_WOOL = [[100, 88, 30], [136, 76, 32], [172, 88, 30], [190, 112, 24], [152, 124, 30], [112, 124, 30], [82, 110, 24], [134, 104, 40], [204, 98, 11]];
const SHEEP_TUFT = [[46, 60, 11], [59, 53, 12], [73, 59, 11]];

function WoolPuffs({ puffs, className }) {
  return <g className={className}>{puffs.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}</g>;
}

function SheepArtwork({ type = "other" }) {
  return (
    <svg className={`sheepArtwork sheepType-${type}`} viewBox="0 0 250 180" aria-hidden="true">
      <ellipse className="cowShadow" cx="132" cy="162" rx="88" ry="12" />
      <path className="sheepLeg" d="M92 132h15v30H92Z" />
      <path className="sheepLeg" d="M118 138h15v26h-15Z" />
      <path className="sheepLeg" d="M156 138h15v26h-15Z" />
      <path className="sheepLeg" d="M180 130h15v30h-15Z" />
      <WoolPuffs puffs={SHEEP_WOOL} className="sheepWoolOutline" />
      <WoolPuffs puffs={SHEEP_WOOL} className="sheepWool" />
      <ellipse className="sheepEar" cx="31" cy="82" rx="15" ry="8" transform="rotate(-24 31 82)" />
      <ellipse className="sheepEar" cx="89" cy="82" rx="15" ry="8" transform="rotate(24 89 82)" />
      <ellipse className="sheepFace" cx="60" cy="92" rx="28" ry="33" />
      <WoolPuffs puffs={SHEEP_TUFT} className="sheepWoolOutline" />
      <WoolPuffs puffs={SHEEP_TUFT} className="sheepWool" />
      <circle className="cowEye" cx="49" cy="93" r="4.5" />
      <circle className="cowEye" cx="71" cy="93" r="4.5" />
      <circle className="sheepEyeShine" cx="50.5" cy="91.5" r="1.5" />
      <circle className="sheepEyeShine" cx="72.5" cy="91.5" r="1.5" />
      <ellipse className="sheepBlush" cx="42" cy="106" rx="6" ry="3.5" />
      <ellipse className="sheepBlush" cx="78" cy="106" rx="6" ry="3.5" />
      <path className="sheepMouth" d="M55 111c3 3 7 3 10 0" />
    </svg>
  );
}

function AnimalArtwork({ animal }) {
  return animal.animal === "cow" ? <CowArtwork skinIndex={animal.skinIndex} /> : <SheepArtwork type={animal.type} />;
}

function StatusChip({ status, label }) {
  return <span className={`statusChip status-${status}`}>{label}</span>;
}

function ProjectAnimal({ animal, onSelect }) {
  const needsHelp = animal.status === "stuck" || animal.warning;
  return (
    <button
      className={`accountCow projectAnimal animal-${animal.animal} status-${animal.status}`}
      onClick={() => onSelect(animal.id)}
      aria-label={`Open ${animal.name} (${animal.typeLabel}, ${animal.statusLabel})`}
    >
      {animal.focus && <span className="animalFocus" title="Focus project" aria-hidden="true">★</span>}
      {needsHelp && <span className="cowWarning" title="Needs attention" aria-hidden="true">!</span>}
      <span className="cowPortrait"><AnimalArtwork animal={animal} /></span>
      <span className="cowName">{animal.name}</span>
      <span className="cowMeta">
        <span className="platformBadge">{animal.typeLabel}</span>
        <StatusChip status={animal.status} label={animal.statusLabel} />
      </span>
      <span className={`animalNext ${animal.nextStep ? "" : "isEmpty"}`}>
        {animal.nextStep ? <><b>Next:</b> {animal.nextStep.text}</> : animal.accountOnly ? "Connected account" : "No next step yet"}
      </span>
    </button>
  );
}

function ProjectPen({ pen, onSelect, onAdd }) {
  return (
    <section className={`projectPen pen-${pen.key} ${pen.animals.length > 4 ? "penWide" : ""}`} aria-label={pen.label}>
      <header className="penSign">
        <strong>{pen.label}</strong>
        <small>{pen.hint} · {pen.animals.length}</small>
      </header>
      <div className="penAnimals">
        {pen.animals.map((animal) => <ProjectAnimal key={animal.id} animal={animal} onSelect={onSelect} />)}
        <button className="addAnimal" onClick={() => onAdd(pen.key)}>
          <span aria-hidden="true">+</span>
          Add {pen.key === "shops" ? "a shop" : pen.key === "channels" ? "a channel" : "an app or game"}
        </button>
      </div>
    </section>
  );
}

function FocusBoard({ focus, withoutNextStep, onOpen, onFinishStep }) {
  const [busyStep, setBusyStep] = useState(null);
  async function finish(item) {
    setBusyStep(item.step.id);
    try {
      await onFinishStep(item.projectId, item.step.id);
    } catch {
      // The step stays on the board; opening the project shows the error.
    } finally {
      setBusyStep(null);
    }
  }
  return (
    <section className="focusBoard" aria-labelledby="focus-board-title">
      <header>
        <h3 id="focus-board-title">Do next</h3>
        <small>One small step per project. Tick it when it's done.</small>
      </header>
      {focus.length ? (
        <ol>
          {focus.map((item) => (
            <li key={item.step.id}>
              <button
                className="focusTick"
                disabled={busyStep === item.step.id}
                onClick={() => finish(item)}
                aria-label={`Mark done: ${item.step.text}`}
                title="Mark done"
              >✓</button>
              <button className="focusOpen" onClick={() => onOpen(item.projectId)}>
                <strong>{item.step.text}</strong>
                <small>
                  {item.focus && <span className="focusStar" aria-label="Focus project">★ </span>}
                  {item.projectName} · <StatusChip status={item.status} label={item.statusLabel} />
                </small>
              </button>
            </li>
          ))}
        </ol>
      ) : <p className="focusEmpty">Nothing queued yet. Click any animal and add one small step.</p>}
      {withoutNextStep.length > 0 && (
        <button className="focusNudge" onClick={() => onOpen(withoutNextStep[0].id)}>
          {withoutNextStep.length} {withoutNextStep.length === 1 ? "project needs" : "projects need"} a next step — start with {withoutNextStep[0].name} →
        </button>
      )}
    </section>
  );
}

function AddProjectDialog({ initialPen, onCreate, onClose }) {
  const firstType = Object.keys(PROJECT_TYPES).find((type) => PROJECT_TYPES[type].pen === initialPen) || "app";
  const [name, setName] = useState("");
  const [type, setType] = useState(firstType);
  const [status, setStatus] = useState("idea");
  const [firstStep, setFirstStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setProblem("Give it a name first.");
      return;
    }
    setBusy(true);
    setProblem("");
    try {
      await onCreate({ name, type, status, firstStep });
      onClose();
    } catch (error) {
      setProblem(error.message || "Could not add it. Is the backend running?");
      setBusy(false);
    }
  }
  return (
    <div className="entryBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="accountEntry addProjectDialog" role="dialog" aria-modal="true" aria-labelledby="add-project-title" onSubmit={submit}>
        <button type="button" className="entryClose" onClick={onClose} aria-label="Close">×</button>
        <h3 id="add-project-title">Add to your farm</h3>
        <label className="projectField">
          <span>Name</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Cozy Sticker Shop" maxLength={80} />
        </label>
        <fieldset className="projectField">
          <legend>What is it?</legend>
          {PROJECT_PENS.map((pen) => (
            <div className="chipGroup" key={pen.key}>
              <small>{pen.label}</small>
              <div>
                {Object.entries(PROJECT_TYPES).filter(([, info]) => info.pen === pen.key).map(([key, info]) => (
                  <button type="button" key={key} className={`choiceChip ${type === key ? "active" : ""}`} aria-pressed={type === key} onClick={() => setType(key)}>{info.label}</button>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
        <StatusPicker value={status} onChange={setStatus} />
        <label className="projectField">
          <span>First tiny step <small>(optional)</small></span>
          <input value={firstStep} onChange={(event) => setFirstStep(event.target.value)} placeholder="e.g. Pick a name" maxLength={300} />
        </label>
        {problem && <p className="projectProblem" role="alert">{problem}</p>}
        <button className="primaryFarmButton" disabled={busy}>{busy ? "Adding…" : "Add to farm"}</button>
      </form>
    </div>
  );
}

function StatusPicker({ value, onChange, disabled }) {
  return (
    <fieldset className="projectField statusPicker">
      <legend>Status</legend>
      <div>
        {PROJECT_STATUSES.map((status) => (
          <button
            type="button"
            key={status.key}
            className={`choiceChip statusChoice status-${status.key} ${value === status.key ? "active" : ""}`}
            aria-pressed={value === status.key}
            title={status.hint}
            disabled={disabled}
            onClick={() => onChange(status.key)}
          >{status.label}</button>
        ))}
      </div>
    </fieldset>
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

function ProjectCharacterSheet({ animal }) {
  const total = animal.openSteps.length + animal.doneSteps.length;
  const percent = total ? Math.round((animal.doneSteps.length / total) * 100) : 0;
  return (
    <aside className="accountCharacter projectCharacter" aria-label={`${animal.name} overview`}>
      <div className="characterCow"><AnimalArtwork animal={animal} /></div>
      <h3 id="account-entry-title" className="characterHandle">{animal.name}</h3>
      <p className="characterStatus">
        <span className="platformBadge">{animal.typeLabel}</span>
        <StatusChip status={animal.status} label={animal.statusLabel} />
      </p>
      <div className="projectProgress" aria-label={`${animal.doneSteps.length} of ${total} steps done`}>
        <span><strong>{animal.doneSteps.length}</strong> of {total} steps done</span>
        <i><b style={{ width: `${percent}%` }} /></i>
      </div>
      <div className="projectLinks">
        {animal.url && <a href={animal.url} target="_blank" rel="noreferrer">Open it ↗</a>}
        {animal.codeUrl && <a href={animal.codeUrl} target="_blank" rel="noreferrer">Code ↗</a>}
      </div>
      <p className="projectTouched">Last touched {formatDate(animal.updatedAt)}</p>
    </aside>
  );
}

// Wraps an action so the card can show a small inline problem instead of the
// whole farm switching to an error screen.
function useProjectAction() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  async function run(action) {
    setBusy(true);
    setProblem("");
    try {
      return await action();
    } catch (error) {
      setProblem(error.message || "That didn't save. Is the backend running?");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, problem, run };
}

function StepRow({ animal, step, actions, run, busy, isFirst, isLast }) {
  // The row is keyed by its saved text, so a fresh save resets this draft.
  const [text, setText] = useState(step.text);
  function saveText() {
    const trimmed = text.trim();
    if (!trimmed) setText(step.text);
    else if (trimmed !== step.text) run(() => actions.updateStep(animal.id, step.id, { text: trimmed }));
  }
  return (
    <li className="stepRow">
      <input
        type="checkbox"
        checked={false}
        disabled={busy}
        onChange={() => run(() => actions.updateStep(animal.id, step.id, { done: true }))}
        aria-label={`Mark done: ${step.text}`}
      />
      <input
        className="stepText"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={saveText}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        aria-label="Step text"
        maxLength={300}
      />
      <span className="stepTools">
        <button type="button" disabled={busy || isFirst} onClick={() => run(() => actions.moveStep(animal.id, step.id, "up"))} aria-label={`Move up: ${step.text}`} title="Move up">↑</button>
        <button type="button" disabled={busy || isLast} onClick={() => run(() => actions.moveStep(animal.id, step.id, "down"))} aria-label={`Move down: ${step.text}`} title="Move down">↓</button>
        <button type="button" disabled={busy} onClick={() => run(() => actions.removeStep(animal.id, step.id))} aria-label={`Remove: ${step.text}`} title="Remove">×</button>
      </span>
    </li>
  );
}

function NextStepsTab({ animal, actions, onOpenSettings }) {
  const { busy, problem, run } = useProjectAction();
  const [newStep, setNewStep] = useState("");
  const [cheer, setCheer] = useState("");
  const [stuckReason, setStuckReason] = useState(animal.stuckReason || "");
  const [next, ...later] = animal.openSteps;

  async function addStep(event) {
    event.preventDefault();
    if (!newStep.trim()) return;
    const result = await run(() => actions.addStep(animal.id, newStep));
    if (result) setNewStep("");
  }

  async function finishNext() {
    const result = await run(() => actions.updateStep(animal.id, next.id, { done: true }));
    if (result) {
      setCheer("Nice work! That's one less thing.");
      window.setTimeout(() => setCheer(""), 3000);
    }
  }

  if (animal.accountOnly) {
    return (
      <div className="entryTabPanel" role="tabpanel">
        <p className="entryInfo">This account is connected but isn't on your project list yet. Add it to track its status and next steps.</p>
        <button className="primaryFarmButton" disabled={busy} onClick={() => run(() => actions.create({ name: animal.name, type: animal.type, status: "live", linkedAccount: animal.linkedAccount, url: animal.url }))}>
          Track this account
        </button>
        {problem && <p className="projectProblem" role="alert">{problem}</p>}
      </div>
    );
  }

  return (
    <div className="entryTabPanel projectPlan" role="tabpanel">
      <div className="planTopRow">
        <StatusPicker value={animal.status} disabled={busy} onChange={(status) => run(() => actions.update(animal.id, { status }))} />
        <button
          type="button"
          className={`focusToggle ${animal.focus ? "active" : ""}`}
          aria-pressed={Boolean(animal.focus)}
          disabled={busy}
          onClick={() => run(() => actions.update(animal.id, { focus: !animal.focus }))}
          title="Focus projects go to the top of the Do next board"
        >★ {animal.focus ? "Focus project" : "Make it a focus"}</button>
      </div>

      {animal.linkedAccount === "etsy" && !animal.account && (
        <div className="entryInfo projectHint">
          <span>Etsy isn't connected to Farmland yet, so listings and sales won't show here.</span>
          {onOpenSettings && <button type="button" onClick={onOpenSettings}>Open settings</button>}
        </div>
      )}

      {animal.status === "stuck" && (
        <label className="projectField stuckBox">
          <span>What's blocking it?</span>
          <textarea
            value={stuckReason}
            onChange={(event) => setStuckReason(event.target.value)}
            onBlur={() => stuckReason !== (animal.stuckReason || "") && run(() => actions.update(animal.id, { stuckReason }))}
            placeholder="Write it down — naming the blocker is half the fix."
            rows={2}
          />
        </label>
      )}

      {next ? (
        <section className="doNextCard" aria-label="Do this next">
          <span>Do this next</span>
          <strong>{next.text}</strong>
          <button type="button" className="doneButton" disabled={busy} onClick={finishNext}>✓ Done!</button>
        </section>
      ) : (
        <section className="doNextCard isEmpty" aria-label="No next step">
          <span>Do this next</span>
          <strong>{cheer ? "All caught up!" : "What's the very next tiny step?"}</strong>
          <small>Small is good: "open the file", "write the title", "pick a color".</small>
        </section>
      )}
      {cheer && <p className="projectCheer" role="status">{cheer}</p>}
      {problem && <p className="projectProblem" role="alert">{problem}</p>}

      <form className="addStepForm" onSubmit={addStep}>
        <input value={newStep} onChange={(event) => setNewStep(event.target.value)} placeholder={next ? "Add another step…" : "Type the next tiny step…"} aria-label="New step" maxLength={300} />
        <button disabled={busy || !newStep.trim()}>Add step</button>
      </form>

      {later.length > 0 && (
        <section className="entrySection">
          <h4>After that</h4>
          <ol className="stepList">
            {later.map((step, index) => (
              <StepRow key={`${step.id}:${step.text}`} animal={animal} step={step} actions={actions} run={run} busy={busy} isFirst={false} isLast={index === later.length - 1} />
            ))}
          </ol>
        </section>
      )}

      {animal.doneSteps.length > 0 && (
        <details className="doneSteps">
          <summary>Finished ({animal.doneSteps.length})</summary>
          <ul>
            {animal.doneSteps.map((step) => (
              <li key={step.id}>
                <input type="checkbox" checked disabled={busy} onChange={() => run(() => actions.updateStep(animal.id, step.id, { done: false }))} aria-label={`Undo: ${step.text}`} />
                <span>{step.text}</span>
                <small>{formatDate(step.doneAt)}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DetailsTab({ animal, actions, onRemoved }) {
  const { busy, problem, run } = useProjectAction();
  const [form, setForm] = useState({ name: animal.name, type: animal.type, url: animal.url || "", codeUrl: animal.codeUrl || "", notes: animal.notes || "" });
  const [saved, setSaved] = useState(false);
  const field = (key) => (event) => { setSaved(false); setForm((value) => ({ ...value, [key]: event.target.value })); };
  async function save(event) {
    event.preventDefault();
    if (await run(() => actions.update(animal.id, form))) setSaved(true);
  }
  async function remove() {
    if (!window.confirm(`Remove ${animal.name} from the farm? Its steps and notes will be deleted.`)) return;
    if (await run(() => actions.remove(animal.id))) onRemoved();
  }
  return (
    <form className="entryTabPanel projectDetails" role="tabpanel" onSubmit={save}>
      <label className="projectField"><span>Name</span><input value={form.name} onChange={field("name")} maxLength={80} /></label>
      <label className="projectField">
        <span>Type</span>
        <select value={form.type} onChange={field("type")}>
          {PROJECT_PENS.map((pen) => (
            <optgroup key={pen.key} label={pen.label}>
              {Object.entries(PROJECT_TYPES).filter(([, info]) => info.pen === pen.key).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="projectField"><span>Link <small>(shop, channel, or store page)</small></span><input value={form.url} onChange={field("url")} placeholder="https://" /></label>
      <label className="projectField"><span>Code link <small>(GitHub)</small></span><input value={form.codeUrl} onChange={field("codeUrl")} placeholder="https://github.com/…" /></label>
      <label className="projectField">
        <span>Notes <small>(brain dump — ideas, links, reminders)</small></span>
        <textarea value={form.notes} onChange={field("notes")} rows={7} />
      </label>
      {problem && <p className="projectProblem" role="alert">{problem}</p>}
      <div className="detailsActions">
        <button className="primaryFarmButton" disabled={busy}>{saved ? "Saved ✓" : "Save changes"}</button>
        <button type="button" className="removeProjectButton" disabled={busy} onClick={remove}>Remove from farm</button>
      </div>
    </form>
  );
}

function ProjectEntry({ animal, actions, onClose, onOpenListing, onOpenSettings, renderPresetManager, renderListingReview }) {
  const account = animal.account;
  const [tab, setTab] = useState("next steps");
  const [page, setPage] = useState("project");
  const [reviewListing, setReviewListing] = useState(null);
  const [presetFullscreen, setPresetFullscreen] = useState(false);
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const tabs = ["next steps", ...(animal.accountOnly ? [] : ["details"]), ...(account ? ["listings", "presets"] : [])];
  const affectedListing = account?.listings.find((listing) => listing.status === "needs_attention");
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
        aria-label={presetFullscreen ? `${animal.name} preset studio` : undefined}
        aria-labelledby={presetFullscreen ? undefined : "account-entry-title"}
      >
        <button className="entryClose" onClick={onClose} aria-label="Close project">×</button>
        <div className={`accountGameLayout ${account ? "" : "projectLayout"} ${presetFullscreen ? "presetFullscreen" : ""}`}>
          {!presetFullscreen && (account
            ? <AccountCharacterSheet account={account} onReviewError={affectedListing ? () => openListingInsideCollection(affectedListing) : null} />
            : <ProjectCharacterSheet animal={animal} />)}
          <section className="accountGameContent">
            {page === "listing" ? (
              <div className="entryListingReviewBody">
                {reviewListing && renderListingReview?.({ listing: reviewListing, onBack: () => setPage("project") })}
              </div>
            ) : <>
              {!presetFullscreen && <div className="entryTabs" role="tablist" aria-label="Project details">
                {tabs.map((name) => <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}</button>)}
              </div>}
              <div className={`entryBody ${presetFullscreen ? "presetFullscreenBody" : ""}`}>
                {tab === "next steps" && <NextStepsTab key={animal.id} animal={animal} actions={actions} onOpenSettings={onOpenSettings} />}
                {tab === "details" && <DetailsTab key={animal.id} animal={animal} actions={actions} onRemoved={onClose} />}
                {tab === "listings" && account && <ListingsTab account={account} onOpenListing={openListingInsideCollection} />}
                {tab === "presets" && account && (
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

export default function FarmDashboard({ model, error, projectActions, onCreateListing, onReviewQueue, onViewPresets, onConnectAccount, onOpenListing, renderPresetManager, renderListingReview, renderCreatePublish, renderCropWorkflow, renderSettings, warningCount = 0 }) {
  // Keep the id, not the object, so the open card follows fresh data after
  // every save.
  const [selectedId, setSelectedId] = useState(null);
  const [addingToPen, setAddingToPen] = useState(null);
  const [toolView, setToolView] = useState(null);
  if (model.loading) return <div className="farmLoading" role="status"><span /><p>Opening the farm…</p></div>;
  if (error) return <div className="farmError" role="alert"><h2>The gate is stuck.</h2><p>{error}</p><button onClick={onConnectAccount}>Open settings</button></div>;

  const selectedAnimal = model.animals.find((animal) => animal.id === selectedId) || null;

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

  async function createProject(fields) {
    const result = await projectActions.create(fields);
    if (result?.project) setSelectedId(result.project.id);
    return result;
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
          <FocusBoard
            focus={model.focus}
            withoutNextStep={model.withoutNextStep}
            onOpen={setSelectedId}
            onFinishStep={(projectId, stepId) => projectActions.updateStep(projectId, stepId, { done: true })}
          />
          <div className="projectPens">
            {model.pens.map((pen) => <ProjectPen key={pen.key} pen={pen} onSelect={setSelectedId} onAdd={setAddingToPen} />)}
          </div>
        </div>
      </div>
      {selectedAnimal && (
        <ProjectEntry
          key={selectedAnimal.id}
          animal={selectedAnimal}
          actions={{ ...projectActions, create: createProject }}
          onClose={() => setSelectedId(null)}
          onOpenListing={onOpenListing}
          onOpenSettings={() => { setSelectedId(null); openSettingsTool(); }}
          renderPresetManager={renderPresetManager}
          renderListingReview={renderListingReview}
        />
      )}
      {addingToPen && <AddProjectDialog initialPen={addingToPen} onCreate={createProject} onClose={() => setAddingToPen(null)} />}
      {toolView && (
        <FarmToolPopup label={toolView.label} onClose={() => setToolView(null)}>
          {renderToolContent()}
        </FarmToolPopup>
      )}
    </section>
  );
}
