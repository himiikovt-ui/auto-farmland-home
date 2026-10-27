# Auto Farmland — Product Spec

*Multi-channel passive income operating system. Last updated: July 2026.*

## What this is

Auto Farmland is a private, local-first engine for building, testing, tracking,
and scaling small passive/semi-passive internet income streams across many
channels. It is **not** an Etsy/eBay listing tool — marketplaces are just one
kind of land.

> Plant seeds, grow assets in batches, turn the best into outputs for each
> land, publish through adapters (or honest manual checklists), track
> performance, then keep / kill / remix / repurpose.

## The conceptual model

```text
Seed        the core idea or theme ("beginner betta tank checklist")
  → Batch   a group of generated/imported assets or content pieces
  → Asset   a reusable component (image, outline, PDF, mockup, clip)
  → Output  a publishable unit (blog post, POD product, listing, pin)
  → Channel / Land   where the output grows, gets discovered, earns
  → Adapter how Auto Farmland publishes/tracks that land (may be manual)
  → Metrics performance data per output
  → Decision keep · kill · remix · revise · repurpose · scale · archive
```

Data mapping: `seeds`, `batches`, `assets`, `channels` are stored collections;
**outputs are the union** of `blogPosts` + `podProductPlans` + `listings`
(+ legacy Etsy `listingDrafts`), served by `/api/outputs`.

## The land map (strategy as of July 2026)

| # | Land | Status | Why |
| - | ---- | ------ | --- |
| 1 | **Blog Land** | `ready_to_start` | Least blocked. Local draft pipeline + markdown/HTML export works today; WordPress/Ghost adapters plug in later. |
| 2 | **Printful → eBay Land** | `setup_needed` | Printful's official eBay integration carries POD products to eBay **without our own eBay developer account**. Manual checklist lane. |
| 3 | Gumroad Land | `not_started` | Digital products later; placeholder collection + adapter seam only. |
| 4 | Pinterest Land | `planned` | Repurposing target for posts/designs. |
| 5 | Etsy Land | `etsy_credentials_present` → ladder | **Personal Access granted**: OAuth (PKCE) against the owner's own shop, draft-first digital lane. Ladder: `personal_access_ready_for_oauth → etsy_credentials_present → etsy_connected → etsy_ready_for_draft_test`. No public multi-seller flow; activation requires a separate reviewed-draft confirmation. |
| 6 | Newsletter / Affiliate | `planned` | Layered onto Blog Land later. |
| 7 | Micro-tools Land | `planned` | Calculators, tiny utility pages. |
| 8 | **eBay (direct API)** | `developer_account_blocked` | Developer Program registration rejected. Adapter fully retained; unlock later with `EBAY_DEVELOPER_ACCESS=granted`. |
| 9 | TikTok / YouTube Shorts | `planned` | Later; content/discovery investment. |
| 10 | Amazon Seller Central | `planned` | Possible advanced adapter much later. |

Blocked/waiting lands are **modelled, never deleted** — the channel board
(`data.channels`, `/api/channels`) is why the app can explain "we start with
Blog Land."

## Blog Land (priority 1 — usable today)

Model: `blogPosts` — seedId, title, slug, topicCluster, primaryKeyword,
secondaryKeywords, searchIntent, audience, outline, draftBody (markdown),
status, reviewNotes, assetIds, internal/external/monetization links,
publishTarget, publishedUrl, created/updated/published/lastReviewed timestamps,
nextUpdateDate, decisionStatus.

Statuses: `idea → outline → draft → needs_review → approved →
ready_to_publish → published → needs_update → archived`.

Decisions: keep, update, expand, turn_into_pinterest_pins,
turn_into_gumroad_product, turn_into_printable, turn_into_video,
turn_into_product_listing, archive.

The v1 publish path is honest and local: **Copy Markdown / Export Markdown /
Export HTML** (files land in `server/exports/blog/`). Publishing status is
flipped by the human once the post is live, with its real URL. WordPress and
Ghost adapters exist as configured-state-aware placeholders.

First niches: aquarium care, fishkeeping, cat care / cat allergy life, cozy
home organization, solo game dev, AI-assisted creator workflows, POD/digital
product experiment logs. Eight starter seeds ship in `data.seeds`.

## POD Land (priority 2 — Printful-mediated eBay)

Model: `podProductPlans` — seedId, designId, podProvider=`printful`,
targetMarketplace=`ebay`, productType, title, description, tags, price,
estimatedCost, estimatedShipping, **estimatedMargin (computed)**, status,
manualSteps (8-step checklist), printfulProductId, ebayListingUrl, notes.

Statuses: `draft → ready_for_printful → uploaded_to_printful →
synced_to_ebay → active_on_ebay` (+ `needs_attention`, `archived`).

Statuses never advance automatically — this lane is honest manual work until a
Printful API adapter automates steps.

## Etsy Land (Personal Access — draft-first digital lane)

Testing runs against the REAL shop, so safeguards are structural. The supported
crop pipeline creates a `type=download` draft, prepares a 2550×3300 300-DPI JPG,
uploads the preview and customer file, verifies the remote state, and stops.
Each remote upload has a stored checkpoint, so retrying does not duplicate an
already completed preview or file upload. Activation is a separate endpoint and
requires both a reviewed-draft checkbox and the exact typed confirmation
`PUBLISH <listing_id>`; the draft endpoint rejects old `autoPublish` requests.
Browser listing edits are allow-listed so stale forms cannot erase server-owned
remote ids or upload checkpoints. The older physical-draft route is renamed and
disabled unless an explicit legacy environment flag is set.

Readiness is computed locally as `credentials → oauth → scopes → auth_health →
shop → taxonomy`; digital downloads do not require shipping or processing
profiles. Only a genuine 401/403 (or token-refresh throw) sets `auth_failed`; a
404 for a wrong shop id does not. OAuth tokens live in
`server/secrets/etsy-oauth.json`, never in data.json and never in the UI.

**Shop resolution** never assumes OAuth user id == shop id. Two paths, both
storing the numeric `shop_id`:

- *Automatic (OAuth owner):* parses the numeric user-id prefix from the token
  and calls getShopByOwnerUserId (`GET /users/{user_id}/shops`). That endpoint
  returns a SINGLE Shop object — `asShopArray()` normalizes single-object,
  `{results:[]}`, and bare-array shapes alike (treating the single object as
  "no shops" was the original false `missing_shop_id`).
- *Manual resolver:* public shop URL → shop name (`parseShopNameFromUrl`, which
  never treats a URL as a numeric id) → numeric candidates via findShops
  (`/shops?shop_name=`), each tagged owned/not-owned; or paste a numeric id and
  Validate — confirms token access via getShop and refuses a shop owned by
  another Etsy user before saving.

`ETSY_DEFAULT_SHOP_ID`, when set, is validated for ownership rather than
trusted. Safe resolver debug (at `/api/etsy/status.resolverDebug`, never
tokens): granted scopes, `shops_r` present, parsed user-id prefix, last
endpoint attempted, last Etsy HTTP status + truncated body, and the stored
`shop_id`. `sync-setup` fetches shipping/readiness/return/section lists (each
failing independently) and, when the shop has none, tells the seller to create
a shipping + processing-time profile in Etsy's Shop Manager.

## Engine collections (SQLite, additive migrations)

Automation adds `automationSettings`, `automationJobs`, `automationRuns`, and
an immutable-style `auditLog`. Defaults are inert and shadow-only; no external
marketplace or image-generation action is performed by the scheduler yet.

`seeds`, `batches`, `assets` (designs), `blogPosts`, `podProductPlans`,
`gumroadProducts` (placeholder), `channels`, `listings` (direct marketplaces,
parked), `productPresets`, `marketplaceAccounts`, `podAccounts`, `orders`,
`listingMetricsDaily`, `decisions`, `critiques` — plus all legacy Studio OS /
Etsy collections, preserved. `migrateData()`/`ensureEngineData()` upgrade old
files in place; `engineSchemaVersion = 2`.

## Image generation & the critique→improve loop

Images are generated by OpenAI (`gpt-image-2`) from a prompt + optional
reference images, reviewed, then approved/rejected. Because the image model
can't be fine-tuned from your rejections, improvement happens on the **prompt,
negative prompt, and references** — the leverage you actually have. The
compounding loop: reject images (a reason helps) → **Critique rejects & improve**
sends the rejected raster images + prompt + reason to a vision model
(`OPENAI_CRITIQUE_MODEL`, default `gpt-4.1-mini`; `server/services/imageCritique.cjs`)
which returns a critique, an improved prompt, negative-prompt additions, and
durable **style learnings**. Learnings persist on the crop (`styleLearnings`,
toggleable/deletable, plus manual ones you add) and are **automatically folded
into every subsequent batch's prompt** (opt out per batch), so quality
compounds across rounds. Honest throughout: an unavailable critique model
surfaces the real error; OpenAI 429s auto-retry with a clear message; and a
live spinner + elapsed timer shows generation/critique progress.

## Adapters (`server/adapters/`)

- `blog/` — BlogPublishAdapter + wordpress/ghost placeholders (env-aware).
- `marketplaces/` — MarketplaceAdapter + **ebayAdapter (retained, reports
  `developer_account_blocked`)**, etsy + gumroad placeholders.
- `pod/` — PodAdapter + printful (practical eBay path), printify, gelato.

Rules: no fake API success, explicit statuses (`not_configured`,
`missing_credentials`, `needs_auth`, `developer_account_blocked`,
`publish_failed`), credentials only in `.env.local`.

## Key routes (beyond the legacy set)

```text
/api/engine/dashboard            sections: needsReview / readyToPublish /
                                 needsAttention / growthOpportunities
/api/engine/adapters/status      marketplaces + pod + blog, honest states
/api/seeds (+ /:id, /:id/blog-post)
/api/blog/posts (+ /:id, /:id/decision, /:id/export, /:id/publish)
/api/blog/dashboard
/api/pod-plans (+ /:id, /:id/toggle-step)
/api/channels (+ /:key)
/api/outputs                     unified view over all publishable units
/api/auth/etsy/{start,callback}  OAuth 2 + PKCE (S256, CSRF state)
/api/auth/etsy/disconnect        deletes tokens, keeps saved settings
/api/etsy/status                 readiness ladder (local-only, safe to poll)
/api/etsy/{test-connection,resolve-shop,sync-setup,settings}
/api/etsy/listings/create-draft  DRAFT + one image; duplicate-guarded
```

## UI

**Farm home (project board).** Every shop, channel, app, and game is a
`projects` record: name, type, status (`idea · planning · building · live ·
resting · stuck`), ordered `nextSteps` (`{ text, done, doneAt }`), notes,
links, `focus`, `stuckReason`, and an optional `linkedAccount` (`etsy`,
`ebay`, `gumroad`). Type decides the pen (Shops = cows; Channels and Apps &
Games = sheep). The **Do next** board shows the first open step of up to five
projects (focus → stuck → building → live → planning → idea; resting is
skipped). Step changes go through small per-step routes
(`/api/projects/:id/steps[/:stepId[/move]]`) so rapid ticks never overwrite
each other. The starter farm is seeded once (`projectsSeeded` flag).

Nav groups — **Grow**: Dashboard, Seeds, Batches, Designs & Assets ·
**Lands**: Blog Land, POD Land, Listings/Products, Etsy Studio ·
**Manage**: Channels & Lands, Product Presets, Orders, Metrics & Decisions,
Settings. Future lands live on the Channels board rather than as empty
screens.

## Constraints (standing rules)

- Local-first; nothing requires eBay developer access or Etsy approval.
- Never fake external API success; blocked ≠ deleted.
- Preserve image batch/review, Etsy studio, and legacy data on every migration.
- Etsy is one land among many, never the center.
- Cozy naming stays in the UI layer; internal keys stay technical.
