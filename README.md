# Auto Farmland

A private, local-first, multi-channel passive income operating system. Each
**land** is a channel (blog, Printful→eBay, Etsy, Gumroad, Pinterest…); each
**crop** is a repeatable output type. Blog Land is the priority-1 channel and
is usable today; see `AUTO_FARMLAND.md` for the full land map and strategy.

## The farm: every project in one place

The home screen shows **all** of your projects as animals in three pens:

- **Shops** (cows): Etsy, eBay, Gumroad, other stores
- **Channels** (sheep): YouTube, TikTok, Instagram, Pinterest, blog
- **Apps & Games** (sheep): apps, games, websites, anything else you build

Click an animal to see its status (Idea → Planning → Building → Live, or
Resting / Stuck), the one step to **do next**, the steps after that, and
notes. The wooden **Do next** board picks one step from each project, with
★ focus projects first, then stuck ones. Use the dashed **+ Add** spot in a
pen to add a new project. A shop linked to a real account (the Etsy shop)
also shows its listings, presets, and money.

Projects live in the `projects` collection (`server/engine/projects.cjs`,
routes in `server/engine/projectRoutes.cjs`). A starter farm is written once;
deleting projects never brings it back.

## Etsy v1 loop

1. Open the Etsy Farm and plant a Crop.
2. Generate a mock Seed Batch or import local images.
3. Approve, reject, remix, and mark Sprouts as final.
4. Create and edit an Etsy listing draft, including AI disclosure.
5. Export the Harvest as a local listing package.
6. Enter manual performance and choose Repeat, Remix, Expand to POD, or Kill.

The existing short-form content workflow remains available under **Legacy
Content Farm** while the Etsy path becomes the primary product.

## Run locally

Use two terminals from this folder:

```powershell
npm.cmd run server   # backend (node server/index.cjs)
npm.cmd run dev      # frontend (vite)
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`.
After pulling engine changes, restart the backend so the new routes load, then
hard-refresh the browser.

## The multi-land engine

```text
Seed → Batch → Asset → Output → Channel/Land → Adapter → Metrics → Decision
```

Current land statuses (tracked on the Channels board, never deleted):
Blog `ready_to_start` · Printful→eBay `setup_needed` · Gumroad `not_started`
· **Etsy: Personal Access** (draft-first digital listing lane; ladder
`personal_access_ready_for_oauth → etsy_credentials_present → etsy_connected
→ etsy_ready_for_draft_test`, managed on Channels & Lands) · **eBay direct API
`developer_account_blocked`** (Developer Program registration rejected —
adapter retained; set `EBAY_DEVELOPER_ACCESS=granted` if access opens) ·
Pinterest/TikTok/YouTube/newsletter/affiliate/micro-tools `planned`.

### Etsy Personal Access digital pipeline

Register the exact callback `http://localhost:4000/api/auth/etsy/callback` on
the Etsy app, then in **Channels & Lands → Etsy connection**: Connect Etsy →
Test Connection → Resolve shop → Sync shop setup → choose a taxonomy. Digital
downloads do not require shipping or processing profiles. Listing creation then
happens in **Etsy Farm → Crop → Etsy Pipeline**: create/verify the digital draft,
open it in Etsy for inspection, check the review box, and type the listing-specific
confirmation before the separate activation action is enabled. Tokens stay in
`server/secrets/`; Etsy error bodies surface in the UI without exposing tokens.

### Start Blog Land today

1. Open **Seeds** — 8 starter seeds are preloaded (aquarium care, cat care,
   solo game dev, POD experiment log…). Click **Grow blog post**.
2. Write in the **Blog Land** editor: keywords, cluster, intent, outline,
   markdown draft, links. Statuses: idea → outline → draft → needs_review →
   approved → ready_to_publish → published → needs_update.
3. **Copy Markdown / Export Markdown / Export HTML** (files under
   `server/exports/blog/`), paste into any blog host, then mark the post
   published with its real URL. Decision buttons cover keep/update/expand and
   repurposing (pins, printable, Gumroad product, video, product listing).

### POD Land (Printful-mediated eBay)

Plan a product from an approved design: title/description/tags, price, cost,
shipping, **auto-computed margin**, and an 8-step manual checklist
(Printful account → eBay store connection → upload → sync → paste the live
URL back). Statuses: draft → ready_for_printful → uploaded_to_printful →
synced_to_ebay → active_on_ebay. Nothing auto-advances; no fake API success.

### Under the hood

- **Adapters** (`server/adapters/`): blog (WordPress/Ghost placeholders),
  marketplaces (eBay retained-but-blocked, Etsy/Gumroad placeholders), POD
  (Printful/Printify/Gelato). Honest statuses only: `not_configured`,
  `missing_credentials`, `needs_auth`, `developer_account_blocked`,
  `publish_failed`.
- **Schema** (`server/engine/schema.cjs`): additive migrations —
  `seeds`, `blogPosts`, `podProductPlans`, `channels`, `gumroadProducts`
  join the earlier engine collections; all legacy data is preserved
  (`engineSchemaVersion: 2`).
- **Dashboard** (`/api/engine/dashboard`): Needs Review · Ready to Publish ·
  Needs Attention (incl. blocked channels) · Growth Opportunities.
- Direct-marketplace machinery (presets, listing compiler, 60-day decision
  engine) is parked but intact for when eBay/Etsy access opens. Env
  credentials live in `.env.local` only (see `.env.example`).

Live application data now lives in SQLite at
`server/data/auto-farmland.sqlite`; imported/generated assets remain in
`server/assets/`, and Etsy packages remain in `server/exports/etsy/`. On the
first SQLite start, an existing `server/data/data.json` is imported once and a
`data.json.pre-sqlite-backup` copy is retained. The JSON file is no longer
written during normal operation. Set `AUTO_FARMLAND_STORAGE_DIR` to use another
storage root for isolated development or tests. `AUTO_FARMLAND_DB_FILE` can
override the database path relative to that root.

The backend boundary is split into `server/config/` (runtime paths),
`server/storage/` (SQLite persistence), `server/security/` (local OAuth secret
files), `server/engine/` (routes/schema/policy state), `server/services/`
(business rules), and `server/adapters/` (external channels). The API still
uses the same data shape while storage is migrated, which keeps the working
Etsy draft pipeline compatible.

### Shadow automation

The first daily-runner layer lives in `server/automation/`. Global automation
and the scheduler default to **off**, execution is locked to **shadow**, and
every preset begins **experimental** and disabled. A preset advances through
Experimental -> Candidate -> Canary -> Autonomous; only Canary/Autonomous
presets may enter the daily queue. Shadow jobs enforce daily quotas, estimated
OpenAI budgets, retries, and date/preset dedupe keys, then produce a simulated
listing plan with `externalActions: 0`. Draft creation, activation,
auto-publishing, and 60-day auto-deactivation remain hard-locked until the
shadow/canary path is certified.

## Provider boundary

`server/imageProviders.cjs` defines the `ImageProvider` contract and provider
registry. OpenAI uses `gpt-image-2` for real prompt generation and
reference-image edits when configured. A separate local mock and manual
PNG/JPEG/WebP import remain available for offline testing. Provider credentials
and calls live in the server layer—never in renderer/frontend code.

## Live integration setup

Copy `.env.example` to `.env.local` and add the OpenAI and Etsy credentials.
The real `.env.local` and OAuth token files under `server/secrets/` are ignored.
Etsy OAuth requires an exact registered callback ending in:

```text
/api/auth/etsy/callback
```

The Etsy Farm screen shows connection readiness and opens the Etsy PKCE consent
flow. A checkpointed pipeline prepares a 2550×3300, 300-DPI customer JPG,
creates the Etsy draft, uploads its preview and digital file, sets it to a
download, and always stops for review. Activation is a separate action requiring
the operator to confirm that the exact remote draft was reviewed in Etsy. Upload
checkpoints make a retry reuse completed remote steps instead of duplicating them.

Digital listing presets autofill the Etsy taxonomy and merge up to 13 Etsy-safe
tags while preserving custom tags. Seeded presets use current seller-taxonomy
leaves for Journal Templates (`12475`), Digital Prints (`2078`), and Stickers
(`1326`). The category path is stored beside each id so the mapping can be
audited and refreshed if Etsy changes its taxonomy.

## Etsy export package

Each export includes `final-images/`, `mockup-images/`, `listing.json`,
`listing.md`, `tags.txt`, `ai_disclosure.txt`, and `cost_summary.json`.
