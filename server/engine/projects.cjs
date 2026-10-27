// Auto Farmland — the project board (every animal on the farm).
//
// A PROJECT is anything the owner is building or running: a shop, a social
// channel, an app, a game. Each one lives in a PEN on the farm and carries a
// status, an ordered list of next steps, and free-form notes. Shops are cows;
// everything that is created rather than sold through is a sheep.
//
// `linkedAccount` ties a project to a real integration (e.g. "etsy") so its
// animal can also show live listings, presets, and money.

const PROJECT_PENS = {
  shops: { key: "shops", label: "Shops", animal: "cow" },
  channels: { key: "channels", label: "Channels", animal: "sheep" },
  builds: { key: "builds", label: "Apps & Games", animal: "sheep" },
};

const PROJECT_TYPES = {
  etsy: { label: "Etsy", pen: "shops" },
  ebay: { label: "eBay", pen: "shops" },
  gumroad: { label: "Gumroad", pen: "shops" },
  shop: { label: "Shop", pen: "shops" },
  youtube: { label: "YouTube", pen: "channels" },
  tiktok: { label: "TikTok", pen: "channels" },
  instagram: { label: "Instagram", pen: "channels" },
  pinterest: { label: "Pinterest", pen: "channels" },
  blog: { label: "Blog", pen: "channels" },
  app: { label: "App", pen: "builds" },
  game: { label: "Game", pen: "builds" },
  website: { label: "Website", pen: "builds" },
  other: { label: "Other", pen: "builds" },
};

const PROJECT_STATUSES = ["idea", "planning", "building", "live", "resting", "stuck"];

const LINKABLE_ACCOUNTS = ["etsy", "ebay", "gumroad"];

function cleanText(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanUrl(value) {
  const url = cleanText(value, 500);
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function makeStep(text, makeId, nowIso, done = false) {
  return {
    id: makeId("step"),
    text: cleanText(text, 300),
    done: Boolean(done),
    createdAt: nowIso(),
    doneAt: done ? nowIso() : null,
  };
}

// Applies allow-listed fields from a request body onto a project. Unknown
// fields and server-owned ids are ignored so stale forms cannot clobber them.
function applyProjectFields(project, body) {
  const errors = [];
  if (body.name !== undefined) {
    const name = cleanText(body.name, 80);
    if (!name) errors.push("A project needs a name.");
    else project.name = name;
  }
  if (body.type !== undefined) {
    if (!PROJECT_TYPES[body.type]) errors.push(`Unknown project type: ${body.type}`);
    else project.type = body.type;
  }
  if (body.status !== undefined) {
    if (!PROJECT_STATUSES.includes(body.status)) errors.push(`Unknown project status: ${body.status}`);
    else project.status = body.status;
  }
  if (body.linkedAccount !== undefined) {
    const linked = body.linkedAccount || null;
    if (linked && !LINKABLE_ACCOUNTS.includes(linked)) errors.push(`Unknown account link: ${linked}`);
    else project.linkedAccount = linked;
  }
  if (body.url !== undefined) project.url = cleanUrl(body.url);
  if (body.codeUrl !== undefined) project.codeUrl = cleanUrl(body.codeUrl);
  if (body.notes !== undefined) project.notes = cleanText(body.notes, 20000);
  if (body.stuckReason !== undefined) project.stuckReason = cleanText(body.stuckReason, 1000);
  if (body.focus !== undefined) project.focus = Boolean(body.focus);
  return errors;
}

function createProject(body, makeId, nowIso) {
  const project = {
    id: makeId("project"),
    name: "",
    type: "other",
    status: "idea",
    linkedAccount: null,
    url: "",
    codeUrl: "",
    notes: "",
    stuckReason: "",
    focus: false,
    nextSteps: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const errors = applyProjectFields(project, { name: "", ...body });
  if (!body.linkedAccount && LINKABLE_ACCOUNTS.includes(project.type)) project.linkedAccount = project.type;
  const firstStep = cleanText(body.firstStep, 300);
  if (firstStep) project.nextSteps.push(makeStep(firstStep, makeId, nowIso));
  return { project, errors };
}

// Starter farm, written once. Steps are suggestions the owner can edit; the
// apps & games come from the owner's own repositories.
function seedProjects(makeId, nowIso) {
  const github = (repo) => `https://github.com/himiikovt-ui/${repo}`;
  const starters = [
    {
      name: "Etsy shop",
      type: "etsy",
      status: "building",
      linkedAccount: "etsy",
      focus: true,
      steps: [
        "Connect Etsy in Settings (if it isn't connected yet)",
        "Make one new listing in the Production Barn",
        "Review the draft in Etsy and publish it",
      ],
    },
    {
      name: "Etsy shop #2",
      type: "etsy",
      status: "idea",
      linkedAccount: null,
      steps: ["Pick what this second shop will sell", "Choose a shop name"],
    },
    {
      name: "eBay",
      type: "ebay",
      status: "stuck",
      linkedAccount: "ebay",
      stuckReason: "eBay rejected the developer account, so Farmland can't post to eBay directly. Printful's eBay connection is the way around it.",
      steps: [
        "Create a free Printful account",
        "Connect your eBay store inside Printful",
        "Upload your first design to Printful",
      ],
    },
    {
      name: "Gumroad",
      type: "gumroad",
      status: "idea",
      linkedAccount: "gumroad",
      steps: ["Decide on the first digital product", "Create the Gumroad account"],
    },
    {
      name: "YouTube channel",
      type: "youtube",
      status: "planning",
      focus: true,
      steps: [
        "Pick the channel name and topic",
        "Make the profile picture and banner",
        "Write the script for video #1",
        "Record and upload video #1",
      ],
    },
    {
      name: "TikTok",
      type: "tiktok",
      status: "idea",
      steps: ["Claim your username", "Plan 3 short video ideas"],
    },
    {
      name: "Instagram",
      type: "instagram",
      status: "idea",
      steps: ["Claim your username", "Plan your first 3 posts"],
    },
    { name: "Lazy Girl Meal Planner", type: "app", status: "building", codeUrl: github("lazy-girl-meal-planner") },
    { name: "Little Nest", type: "app", status: "building", codeUrl: github("little-nest") },
    { name: "Nibble Puddle", type: "game", status: "building", codeUrl: github("nibble-puddle") },
    { name: "Cat Catch", type: "game", status: "building", codeUrl: github("cat-catch-godot") },
    { name: "Shrimp Collecting", type: "game", status: "building", codeUrl: github("shrimp-collecting") },
    { name: "Raccoon Ramen", type: "game", status: "building", codeUrl: github("raccoon-ramen") },
    { name: "Moss Maze", type: "game", status: "building", codeUrl: github("moss-maze") },
    { name: "Sky Hop", type: "game", status: "building", codeUrl: github("sky-hop") },
  ];
  return starters.map(({ steps = [], ...fields }) => {
    const { project } = createProject(fields, makeId, nowIso);
    project.nextSteps = steps.map((text) => makeStep(text, makeId, nowIso));
    return project;
  });
}

// Called from ensureEngineData. The `projectsSeeded` flag (a root value, not
// a collection) keeps the starter farm from reappearing after the owner
// deletes every project — an empty collection is not stored at all.
function ensureProjects(data, makeId, nowIso) {
  if (!Array.isArray(data.projects)) data.projects = [];
  if (!data.projectsSeeded) {
    if (!data.projects.length) data.projects = seedProjects(makeId, nowIso);
    data.projectsSeeded = true;
  }
  return data;
}

module.exports = {
  PROJECT_PENS,
  PROJECT_TYPES,
  PROJECT_STATUSES,
  LINKABLE_ACCOUNTS,
  applyProjectFields,
  createProject,
  makeStep,
  seedProjects,
  ensureProjects,
};
