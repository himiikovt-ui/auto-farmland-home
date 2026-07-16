const fs = require("fs");
const path = require("path");
const {
  BLOG_STATUS,
  BLOG_STATUSES,
  BLOG_DECISIONS,
  POD_PLAN_STATUS,
  POD_PLAN_STATUSES,
} = require("./status.cjs");
const { CHANNEL_STATUSES } = require("./channels.cjs");

// Land routes: Seeds, Blog Land, POD Land (Printful-mediated eBay), Channels,
// and the unified Outputs view. Like engine/routes.cjs, this module never
// opens the store itself — index.cjs owns readData/writeData.

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Accept arrays as-is; split strings on a separator. Keeps PATCH bodies
// forgiving (the UI sends comma/newline separated text).
function toList(value, separator) {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  return String(value)
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// --- Markdown / HTML export -------------------------------------------------

function buildMarkdown(post) {
  const frontmatter = [
    "---",
    `title: "${String(post.title || "Untitled").replace(/"/g, '\\"')}"`,
    `slug: ${post.slug || ""}`,
    post.topicCluster ? `topic_cluster: ${post.topicCluster}` : null,
    post.primaryKeyword ? `primary_keyword: ${post.primaryKeyword}` : null,
    (post.secondaryKeywords || []).length
      ? `secondary_keywords: [${post.secondaryKeywords.join(", ")}]`
      : null,
    post.searchIntent ? `search_intent: ${post.searchIntent}` : null,
    post.audience ? `audience: ${post.audience}` : null,
    `status: ${post.status}`,
    `date: ${(post.publishedAt || post.updatedAt || "").slice(0, 10)}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const body = String(post.draftBody || "").trim()
    ? post.draftBody
    : String(post.outline || "").trim()
      ? `> Outline only — draft body not written yet.\n\n${post.outline}`
      : "_No content yet._";

  const linkSections = [];
  const linkBlock = (title, links) => `\n## ${title}\n\n${links.map((link) => `- ${link}`).join("\n")}`;
  if ((post.internalLinks || []).length) linkSections.push(linkBlock("Internal links", post.internalLinks));
  if ((post.externalLinks || []).length) linkSections.push(linkBlock("External links / sources", post.externalLinks));
  if ((post.monetizationLinks || []).length)
    linkSections.push(linkBlock("Monetization links", post.monetizationLinks));

  // Don't duplicate the H1 when the draft body already opens with one.
  const heading = /^\s*#\s/.test(body) ? "" : `# ${post.title || "Untitled"}\n\n`;
  return `${frontmatter}\n\n${heading}${body}\n${linkSections.join("\n")}\n`;
}

// Minimal, dependency-free markdown → HTML for the export path. Handles
// headings, lists, bold/italic/code, and links. Not a full CommonMark parser.
function markdownToHtml(markdown) {
  const withoutFrontmatter = markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
  const escapeHtml = (value) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (value) =>
    value
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

  const lines = escapeHtml(withoutFrontmatter).split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let inList = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const listItem = line.match(/^\s*[-*]\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (listItem) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(listItem[1])}</li>`);
    } else if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
    } else if (!line.trim()) {
      flushParagraph();
      closeList();
    } else {
      closeList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  closeList();
  return html.join("\n");
}

// --- POD plan helpers --------------------------------------------------------

// The manual/semi-automated Printful → eBay checklist. Auto Farmland prepares
// everything; a human (or later, the Printful API) walks these steps.
function defaultPrintfulEbaySteps() {
  return [
    "Create or verify the Printful account",
    "Connect the eBay store inside Printful (Stores → Add store → eBay)",
    "Create the Printful product and upload the design file",
    "Choose variants/sizes and confirm Printful production cost",
    "Paste this plan's title, description, and tags into the product",
    "Set the eBay retail price and confirm the margin estimate",
    "Push/sync the product from Printful to eBay",
    "Paste the live eBay listing URL back into this plan",
  ].map((label, index) => ({ step: index + 1, label, done: false }));
}

function withMargin(plan) {
  const price = Number(plan.price || 0);
  const cost = Number(plan.estimatedCost || 0);
  const shipping = Number(plan.estimatedShipping || 0);
  const margin = Number((price - cost - shipping).toFixed(2));
  return {
    ...plan,
    estimatedMargin: margin,
    estimatedMarginPct: price > 0 ? Number(((margin / price) * 100).toFixed(1)) : 0,
  };
}

// --- Route registration -------------------------------------------------------

function registerLandRoutes(app, deps) {
  const { readData, writeData, makeId, nowIso, adapters, exportsDir } = deps;

  const send404 = (response, what) =>
    response.status(404).json({ ok: false, error: `${what} not found.` });

  // ============================== Seeds =====================================
  app.get("/api/seeds", (request, response) => {
    response.json(readData().seeds || []);
  });

  app.post("/api/seeds", (request, response) => {
    const data = readData();
    if (!String(request.body.title || "").trim()) {
      response.status(400).json({ ok: false, error: "A seed needs a title." });
      return;
    }
    const seed = {
      id: makeId("seed"),
      title: String(request.body.title).trim(),
      niche: request.body.niche || "",
      targetCrops: toList(request.body.targetCrops, ",") || [],
      status: request.body.status || "idea",
      notes: request.body.notes || "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    data.seeds.unshift(seed);
    writeData(data);
    response.json({ ok: true, message: "Seed planted.", seed });
  });

  app.patch("/api/seeds/:id", (request, response) => {
    const data = readData();
    const index = (data.seeds || []).findIndex((seed) => seed.id === request.params.id);
    if (index < 0) return send404(response, "Seed");
    const updates = { ...request.body };
    if (updates.targetCrops != null) updates.targetCrops = toList(updates.targetCrops, ",");
    data.seeds[index] = {
      ...data.seeds[index],
      ...updates,
      id: data.seeds[index].id,
      updatedAt: nowIso(),
    };
    writeData(data);
    response.json({ ok: true, message: "Seed saved.", seed: data.seeds[index] });
  });

  // Grow a blog post from a seed (Blog Land is the priority-1 crop).
  app.post("/api/seeds/:id/blog-post", (request, response) => {
    const data = readData();
    const seed = (data.seeds || []).find((entry) => entry.id === request.params.id);
    if (!seed) return send404(response, "Seed");
    const post = createBlogPost(data, { seedId: seed.id, title: seed.title, topicCluster: seed.niche });
    writeData(data);
    response.json({ ok: true, message: `Blog post created from "${seed.title}".`, post });
  });

  // ============================ Blog Land ===================================

  function createBlogPost(data, fields = {}) {
    const title = String(fields.title || "Untitled post").trim();
    const post = {
      id: makeId("post"),
      seedId: fields.seedId || "",
      title,
      slug: slugify(fields.slug || title),
      topicCluster: fields.topicCluster || "",
      primaryKeyword: fields.primaryKeyword || "",
      secondaryKeywords: [],
      searchIntent: fields.searchIntent || "",
      audience: fields.audience || "",
      outline: fields.outline || "",
      draftBody: fields.draftBody || "",
      status: BLOG_STATUS.IDEA,
      reviewNotes: "",
      assetIds: [],
      internalLinks: [],
      externalLinks: [],
      monetizationLinks: [],
      publishTarget: fields.publishTarget || "local_markdown",
      publishedUrl: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      publishedAt: "",
      lastReviewedAt: "",
      nextUpdateDate: "",
      decisionStatus: "",
    };
    data.blogPosts.unshift(post);
    return post;
  }

  app.get("/api/blog/posts", (request, response) => {
    response.json(readData().blogPosts || []);
  });

  app.post("/api/blog/posts", (request, response) => {
    const data = readData();
    const post = createBlogPost(data, request.body || {});
    writeData(data);
    response.json({ ok: true, message: "Blog post created.", post });
  });

  app.patch("/api/blog/posts/:id", (request, response) => {
    const data = readData();
    const post = (data.blogPosts || []).find((entry) => entry.id === request.params.id);
    if (!post) return send404(response, "Blog post");

    const body = request.body || {};
    if (body.status && !BLOG_STATUSES.includes(body.status)) {
      response.status(400).json({ ok: false, error: `Invalid blog status: ${body.status}` });
      return;
    }

    const updates = { ...body };
    // Normalize list-ish fields sent as text.
    if (updates.secondaryKeywords != null) updates.secondaryKeywords = toList(updates.secondaryKeywords, ",");
    ["internalLinks", "externalLinks", "monetizationLinks"].forEach((field) => {
      if (updates[field] != null) updates[field] = toList(updates[field], "\n");
    });
    if (updates.assetIds != null && !Array.isArray(updates.assetIds)) {
      updates.assetIds = toList(updates.assetIds, ",");
    }
    // Slug hygiene: keep it a slug; derive from title when cleared.
    if (updates.slug != null) updates.slug = slugify(updates.slug);
    const nextTitle = updates.title != null ? updates.title : post.title;
    if (!updates.slug && !post.slug && nextTitle) updates.slug = slugify(nextTitle);

    Object.assign(post, updates, { id: post.id, updatedAt: nowIso() });

    if (body.status === BLOG_STATUS.PUBLISHED && !post.publishedAt) {
      post.publishedAt = nowIso();
    }
    if (body.reviewNotes != null || ["approved", "needs_update"].includes(body.status)) {
      post.lastReviewedAt = nowIso();
    }

    writeData(data);
    response.json({ ok: true, message: "Blog post saved.", post });
  });

  // Blog decisions include repurposing (turn_into_*). Logged, never deleted.
  app.post("/api/blog/posts/:id/decision", (request, response) => {
    const data = readData();
    const post = (data.blogPosts || []).find((entry) => entry.id === request.params.id);
    if (!post) return send404(response, "Blog post");
    const decision = request.body.decision;
    if (!BLOG_DECISIONS.includes(decision)) {
      response.status(400).json({ ok: false, error: `Invalid blog decision: ${decision}` });
      return;
    }
    const record = {
      id: makeId("decision"),
      kind: "blog_post",
      refId: post.id,
      listingId: "",
      decision,
      reason: request.body.reason || "",
      createdAt: nowIso(),
    };
    data.decisions.unshift(record);
    post.decisionStatus = decision;
    if (decision === "archive") post.status = BLOG_STATUS.ARCHIVED;
    if (decision === "update" || decision === "expand") post.status = BLOG_STATUS.NEEDS_UPDATE;
    post.updatedAt = nowIso();
    writeData(data);
    response.json({ ok: true, message: `Decision logged: ${decision}.`, post, decision: record });
  });

  // Export a post as markdown or HTML. `?write=1` also writes the file to
  // exports/blog/ so it can be dropped into any static site or CMS.
  app.get("/api/blog/posts/:id/export", (request, response) => {
    const data = readData();
    const post = (data.blogPosts || []).find((entry) => entry.id === request.params.id);
    if (!post) return send404(response, "Blog post");

    const format = request.query.format === "html" ? "html" : "markdown";
    const markdown = buildMarkdown(post);
    const content = format === "html" ? markdownToHtml(markdown) : markdown;

    let filePath = "";
    if (String(request.query.write) === "1") {
      const folder = path.join(exportsDir, "blog");
      fs.mkdirSync(folder, { recursive: true });
      const fileName = `${post.slug || post.id}.${format === "html" ? "html" : "md"}`;
      filePath = path.join(folder, fileName);
      fs.writeFileSync(filePath, content, "utf8");
    }

    response.json({
      ok: true,
      format,
      content,
      path: filePath,
      message: filePath ? `Exported ${format} to ${filePath}` : `Rendered ${format}.`,
    });
  });

  // Publish through the target's adapter. local_markdown is the REAL v1 path
  // (writes a file); wordpress/ghost honestly report their unconfigured state.
  // Status is never auto-flipped to published — the human confirms the post is
  // actually live and records the URL.
  app.post("/api/blog/posts/:id/publish", async (request, response) => {
    const data = readData();
    const post = (data.blogPosts || []).find((entry) => entry.id === request.params.id);
    if (!post) return send404(response, "Blog post");

    const target = request.body.target || post.publishTarget || "local_markdown";
    if (target === "local_markdown" || target === "static_site") {
      const folder = path.join(exportsDir, "blog");
      fs.mkdirSync(folder, { recursive: true });
      const filePath = path.join(folder, `${post.slug || post.id}.md`);
      fs.writeFileSync(filePath, buildMarkdown(post), "utf8");
      response.json({
        ok: true,
        target,
        path: filePath,
        message: `Markdown written to ${filePath}. Post it on your site, then mark the post published with its real URL.`,
      });
      return;
    }

    const adapter = adapters.getBlogPublisher(target);
    if (!adapter) {
      response.status(400).json({ ok: false, error: `No blog adapter for target ${target}.` });
      return;
    }
    const result = await adapter.publishPost(post);
    response.json({ ok: result.ok, target, result });
  });

  // Blog Land dashboard buckets (also folded into /api/engine/dashboard).
  app.get("/api/blog/dashboard", (request, response) => {
    const data = readData();
    const posts = data.blogPosts || [];
    const active = posts.filter((post) => post.status !== "archived");
    const now = new Date();
    response.json({
      needsReview: posts.filter((post) => post.status === "needs_review").map((post) => post.id),
      readyToPublish: posts
        .filter((post) => ["approved", "ready_to_publish"].includes(post.status))
        .map((post) => post.id),
      needsUpdate: posts
        .filter(
          (post) =>
            post.status === "needs_update" ||
            (post.status === "published" && post.nextUpdateDate && new Date(post.nextUpdateDate) <= now)
        )
        .map((post) => post.id),
      missingSeo: active
        .filter((post) => !post.title || !post.slug || !post.primaryKeyword)
        .map((post) => post.id),
      canBecomeProducts: posts
        .filter((post) => post.status === "published" && !post.decisionStatus)
        .map((post) => post.id),
      counts: { total: posts.length, active: active.length },
    });
  });

  // ======================= POD Land (Printful → eBay) =======================
  app.get("/api/pod-plans", (request, response) => {
    response.json(readData().podProductPlans || []);
  });

  app.post("/api/pod-plans", (request, response) => {
    const data = readData();
    const body = request.body || {};
    const design = body.designId
      ? (data.assets || []).find((asset) => asset.id === body.designId)
      : null;
    if (body.designId && !design) return send404(response, "Design");

    const plan = withMargin({
      id: makeId("podplan"),
      seedId: body.seedId || "",
      designId: design ? design.id : "",
      podProvider: "printful",
      targetMarketplace: "ebay",
      productType: body.productType || "sticker",
      title: body.title || (design ? `${design.fileName.replace(/\.[a-z]+$/i, "")} sticker` : ""),
      description: body.description || "",
      tags: toList(body.tags, ",") || [],
      price: Number(body.price || 4.99),
      estimatedCost: Number(body.estimatedCost || 1.6),
      estimatedShipping: Number(body.estimatedShipping || 0.85),
      status: POD_PLAN_STATUS.DRAFT,
      manualSteps: defaultPrintfulEbaySteps(),
      printfulProductId: "",
      ebayListingUrl: "",
      notes: body.notes || "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    data.podProductPlans.unshift(plan);
    writeData(data);
    response.json({ ok: true, message: "POD product plan created.", plan });
  });

  app.patch("/api/pod-plans/:id", (request, response) => {
    const data = readData();
    const index = (data.podProductPlans || []).findIndex((plan) => plan.id === request.params.id);
    if (index < 0) return send404(response, "POD plan");
    const body = { ...request.body };
    if (body.status && !POD_PLAN_STATUSES.includes(body.status)) {
      response.status(400).json({ ok: false, error: `Invalid POD plan status: ${body.status}` });
      return;
    }
    if (body.tags != null) body.tags = toList(body.tags, ",");
    data.podProductPlans[index] = withMargin({
      ...data.podProductPlans[index],
      ...body,
      id: data.podProductPlans[index].id,
      podProvider: data.podProductPlans[index].podProvider,
      updatedAt: nowIso(),
    });
    writeData(data);
    response.json({ ok: true, message: "POD plan saved.", plan: data.podProductPlans[index] });
  });

  app.post("/api/pod-plans/:id/toggle-step", (request, response) => {
    const data = readData();
    const plan = (data.podProductPlans || []).find((entry) => entry.id === request.params.id);
    if (!plan) return send404(response, "POD plan");
    const index = Number(request.body.index);
    if (!Number.isInteger(index) || index < 0 || index >= (plan.manualSteps || []).length) {
      response.status(400).json({ ok: false, error: "Invalid step index." });
      return;
    }
    plan.manualSteps[index].done = !plan.manualSteps[index].done;
    plan.manualSteps[index].doneAt = plan.manualSteps[index].done ? nowIso() : "";
    plan.updatedAt = nowIso();
    writeData(data);
    response.json({ ok: true, message: "Checklist updated.", plan });
  });

  // ============================== Channels ==================================
  app.get("/api/channels", (request, response) => {
    const channels = [...(readData().channels || [])].sort(
      (a, b) => Number(a.priority || 99) - Number(b.priority || 99)
    );
    response.json(channels);
  });

  app.patch("/api/channels/:key", (request, response) => {
    const data = readData();
    const channel = (data.channels || []).find((entry) => entry.key === request.params.key);
    if (!channel) return send404(response, "Channel");
    if (request.body.status && !CHANNEL_STATUSES.includes(request.body.status)) {
      response.status(400).json({ ok: false, error: `Invalid channel status: ${request.body.status}` });
      return;
    }
    ["status", "reason", "notes", "priority"].forEach((field) => {
      if (request.body[field] != null) channel[field] = request.body[field];
    });
    channel.updatedAt = nowIso();
    writeData(data);
    response.json({ ok: true, message: `${channel.name} updated.`, channel });
  });

  // =============================== Outputs ==================================
  // Unified view over every publishable unit — no duplicate table, computed
  // from blogPosts + podProductPlans + engine listings + legacy Etsy drafts.
  app.get("/api/outputs", (request, response) => {
    const data = readData();
    const outputs = [
      ...(data.blogPosts || []).map((post) => ({
        kind: "blog_post",
        channel: "blog",
        id: post.id,
        title: post.title,
        status: post.status,
        url: post.publishedUrl || "",
        updatedAt: post.updatedAt,
      })),
      ...(data.podProductPlans || []).map((plan) => ({
        kind: "pod_product",
        channel: "printful_pod",
        id: plan.id,
        title: plan.title,
        status: plan.status,
        url: plan.ebayListingUrl || "",
        updatedAt: plan.updatedAt,
      })),
      ...(data.listings || []).map((listing) => ({
        kind: "marketplace_listing",
        channel: listing.platform === "ebay" ? "ebay_direct" : listing.platform,
        id: listing.id,
        title: listing.title,
        status: listing.status,
        url: listing.publishedUrl || "",
        updatedAt: listing.updatedAt,
      })),
      ...(data.listingDrafts || []).map((draft) => ({
        kind: "etsy_listing_draft",
        channel: "etsy",
        id: draft.id,
        title: draft.title,
        status: draft.status,
        url: draft.externalListingUrl || "",
        updatedAt: draft.updatedAt,
      })),
    ];
    response.json(outputs);
  });
}

module.exports = { registerLandRoutes };
