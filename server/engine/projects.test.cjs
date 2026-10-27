const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const { createProject, ensureProjects, PROJECT_TYPES } = require("./projects.cjs");
const { registerProjectRoutes } = require("./projectRoutes.cjs");

let sequence = 0;
const makeId = (prefix) => `${prefix}-${++sequence}`;
const nowIso = () => "2026-10-27T00:00:00.000Z";

test("seeds the starter farm once and never re-seeds after everything is deleted", () => {
  const data = ensureProjects({}, makeId, nowIso);
  assert.ok(data.projects.length > 5);
  assert.equal(data.projectsSeeded, true);
  assert.ok(data.projects.every((project) => PROJECT_TYPES[project.type]));
  const ids = data.projects.flatMap((project) => [project.id, ...project.nextSteps.map((step) => step.id)]);
  assert.equal(new Set(ids).size, ids.length);

  // An empty collection is not stored, so it reads back as missing.
  const reloaded = ensureProjects({ projectsSeeded: true }, makeId, nowIso);
  assert.deepEqual(reloaded.projects, []);
});

test("keeps existing projects when the seed flag is absent", () => {
  const existing = [{ id: "project-mine", name: "Mine", type: "game", nextSteps: [] }];
  const data = ensureProjects({ projects: existing }, makeId, nowIso);
  assert.deepEqual(data.projects.map((project) => project.id), ["project-mine"]);
});

test("validates new projects and links marketplace types to their account", () => {
  assert.deepEqual(createProject({ name: "  " }, makeId, nowIso).errors, ["A project needs a name."]);
  assert.match(createProject({ name: "X", type: "spaceship" }, makeId, nowIso).errors[0], /Unknown project type/);

  const { project, errors } = createProject({ name: "eBay", type: "ebay", url: "ebay.com/str/me", firstStep: "Open Printful" }, makeId, nowIso);
  assert.deepEqual(errors, []);
  assert.equal(project.linkedAccount, "ebay");
  assert.equal(project.url, "https://ebay.com/str/me");
  assert.deepEqual(project.nextSteps.map((step) => step.text), ["Open Printful"]);
});

async function withServer(data, run) {
  const app = express();
  app.use(express.json());
  registerProjectRoutes(app, { readData: () => data, writeData: () => {}, makeId, nowIso });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    await run(call);
  } finally {
    server.close();
  }
}

test("step routes add, finish, reorder, and remove steps", async () => {
  const data = { projects: [] };
  await withServer(data, async (call) => {
    const created = await call("POST", "/api/projects", { name: "Sky Hop", type: "game" });
    assert.equal(created.status, 200);
    const id = created.body.project.id;

    for (const text of ["one", "two", "three"]) await call("POST", `/api/projects/${id}/steps`, { text });
    const [one, two, three] = data.projects[0].nextSteps;

    await call("PATCH", `/api/projects/${id}/steps/${one.id}`, { done: true });
    assert.equal(data.projects[0].nextSteps[0].done, true);
    assert.equal(data.projects[0].nextSteps[0].doneAt, nowIso());

    // "up" skips over the finished step instead of swapping with it.
    await call("POST", `/api/projects/${id}/steps/${two.id}/move`, { direction: "up" });
    assert.deepEqual(data.projects[0].nextSteps.map((step) => step.text), ["one", "two", "three"]);
    await call("POST", `/api/projects/${id}/steps/${three.id}/move`, { direction: "up" });
    assert.deepEqual(data.projects[0].nextSteps.map((step) => step.text), ["one", "three", "two"]);
    await call("POST", `/api/projects/${id}/steps/${two.id}/move`, { direction: "top" });
    assert.deepEqual(data.projects[0].nextSteps.map((step) => step.text), ["two", "one", "three"]);

    await call("DELETE", `/api/projects/${id}/steps/${one.id}`);
    assert.deepEqual(data.projects[0].nextSteps.map((step) => step.text), ["two", "three"]);

    const bad = await call("PATCH", `/api/projects/${id}`, { status: "exploded" });
    assert.equal(bad.status, 400);
    const ok = await call("PATCH", `/api/projects/${id}`, { status: "stuck", stuckReason: "Need art", id: "hijack" });
    assert.equal(ok.body.project.status, "stuck");
    assert.equal(ok.body.project.id, id);

    await call("DELETE", `/api/projects/${id}`);
    assert.equal(data.projects.length, 0);
  });
});
