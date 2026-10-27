const { applyProjectFields, createProject, makeStep } = require("./projects.cjs");

// Project board routes. Steps have their own small endpoints so quick clicks
// (tick, tick, tick) never overwrite each other with a stale full list.
function registerProjectRoutes(app, deps) {
  const { readData, writeData, makeId, nowIso } = deps;

  const send404 = (response, what) =>
    response.status(404).json({ ok: false, error: `${what} not found.` });

  function findProject(data, id) {
    return (data.projects || []).find((project) => project.id === id);
  }

  function findStep(project, stepId) {
    return (project.nextSteps || []).find((step) => step.id === stepId);
  }

  function touch(project) {
    project.updatedAt = nowIso();
  }

  app.get("/api/projects", (request, response) => {
    response.json(readData().projects || []);
  });

  app.post("/api/projects", (request, response) => {
    const data = readData();
    const { project, errors } = createProject(request.body || {}, makeId, nowIso);
    if (errors.length) {
      response.status(400).json({ ok: false, error: errors.join(" ") });
      return;
    }
    data.projects = [...(data.projects || []), project];
    writeData(data);
    response.json({ ok: true, message: `${project.name} moved onto the farm.`, project });
  });

  app.patch("/api/projects/:id", (request, response) => {
    const data = readData();
    const project = findProject(data, request.params.id);
    if (!project) return send404(response, "Project");
    const errors = applyProjectFields(project, request.body || {});
    if (errors.length) {
      response.status(400).json({ ok: false, error: errors.join(" ") });
      return;
    }
    touch(project);
    writeData(data);
    response.json({ ok: true, message: `${project.name} updated.`, project });
  });

  app.delete("/api/projects/:id", (request, response) => {
    const data = readData();
    const project = findProject(data, request.params.id);
    if (!project) return send404(response, "Project");
    data.projects = data.projects.filter((entry) => entry.id !== project.id);
    writeData(data);
    response.json({ ok: true, message: `${project.name} left the farm.` });
  });

  // ------------------------------ Next steps --------------------------------
  app.post("/api/projects/:id/steps", (request, response) => {
    const data = readData();
    const project = findProject(data, request.params.id);
    if (!project) return send404(response, "Project");
    const step = makeStep(request.body?.text, makeId, nowIso);
    if (!step.text) {
      response.status(400).json({ ok: false, error: "A step needs some words." });
      return;
    }
    project.nextSteps = [...(project.nextSteps || []), step];
    touch(project);
    writeData(data);
    response.json({ ok: true, message: "Step added.", project });
  });

  app.patch("/api/projects/:id/steps/:stepId", (request, response) => {
    const data = readData();
    const project = findProject(data, request.params.id);
    if (!project) return send404(response, "Project");
    const step = findStep(project, request.params.stepId);
    if (!step) return send404(response, "Step");
    if (request.body?.text !== undefined) {
      const text = String(request.body.text).trim().slice(0, 300);
      if (!text) {
        response.status(400).json({ ok: false, error: "A step needs some words." });
        return;
      }
      step.text = text;
    }
    if (request.body?.done !== undefined) {
      step.done = Boolean(request.body.done);
      step.doneAt = step.done ? nowIso() : null;
    }
    touch(project);
    writeData(data);
    response.json({ ok: true, message: step.done ? "Nice — step done!" : "Step updated.", project });
  });

  app.post("/api/projects/:id/steps/:stepId/move", (request, response) => {
    const data = readData();
    const project = findProject(data, request.params.id);
    if (!project) return send404(response, "Project");
    const steps = project.nextSteps || [];
    const from = steps.findIndex((step) => step.id === request.params.stepId);
    if (from < 0) return send404(response, "Step");
    // "top" makes a step the one to do next; "up"/"down" swap with the
    // nearest unfinished neighbour so finished steps never get in the way.
    const direction = request.body?.direction;
    const [step] = steps.splice(from, 1);
    if (direction === "top") {
      steps.unshift(step);
    } else {
      const open = steps.map((entry, index) => ({ entry, index })).filter(({ entry }) => !entry.done);
      const before = open.filter(({ index }) => index < from);
      const after = open.filter(({ index }) => index >= from);
      let to = from;
      if (direction === "up" && before.length) to = before[before.length - 1].index;
      if (direction === "down" && after.length) to = after[0].index + 1;
      steps.splice(to, 0, step);
    }
    project.nextSteps = steps;
    touch(project);
    writeData(data);
    response.json({ ok: true, message: "Steps reordered.", project });
  });

  app.delete("/api/projects/:id/steps/:stepId", (request, response) => {
    const data = readData();
    const project = findProject(data, request.params.id);
    if (!project) return send404(response, "Project");
    if (!findStep(project, request.params.stepId)) return send404(response, "Step");
    project.nextSteps = project.nextSteps.filter((step) => step.id !== request.params.stepId);
    touch(project);
    writeData(data);
    response.json({ ok: true, message: "Step removed.", project });
  });
}

module.exports = { registerProjectRoutes };
