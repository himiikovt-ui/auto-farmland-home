const { queueDailyJobs, runQueuedJobs, schedulerDue } = require("./jobRunner.cjs");

function startAutomationScheduler(deps, options = {}) {
  const intervalMs = Number(options.intervalMs || 60_000);
  let running = false;

  const tick = () => {
    if (running) return;
    running = true;
    try {
      const data = deps.readData();
      if (!schedulerDue(data)) return;
      const queued = queueDailyJobs(data, deps, { actor: "scheduler" });
      if (!queued.ok || !queued.queued.length) return;
      runQueuedJobs(data, deps, { actor: "scheduler" });
      deps.writeData(data);
    } catch (error) {
      console.error("Automation scheduler tick failed:", error.message);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}

module.exports = { startAutomationScheduler };
