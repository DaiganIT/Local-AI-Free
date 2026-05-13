import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createCronJobsDatabase } from "../src/cron-jobs-db.js";
import { createCronScheduler } from "../src/cron-scheduler.js";

describe("cron-scheduler", () => {
  let sqlite: Database.Database;
  let cronDb: ReturnType<typeof createCronJobsDatabase>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T10:00:00.000Z"));
    sqlite = new Database(":memory:");
    cronDb = createCronJobsDatabase(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs only due & enabled jobs", async () => {
    const dueEnabled = cronDb.createCronJob({
      agentId: "agent-1",
      targetCondition: "A",
      exitCondition: "B",
      reportCondition: "C",
      schedule: "* * * * *",
    });
    cronDb.updateCronJob(dueEnabled.id, { nextRunAt: "2026-05-13T09:59:00.000Z" });

    const dueDisabled = cronDb.createCronJob({
      agentId: "agent-1",
      targetCondition: "A",
      exitCondition: "B",
      reportCondition: "C",
      schedule: "* * * * *",
      enabled: false,
    });
    cronDb.updateCronJob(dueDisabled.id, { nextRunAt: "2026-05-13T09:59:00.000Z" });

    const futureEnabled = cronDb.createCronJob({
      agentId: "agent-1",
      targetCondition: "A",
      exitCondition: "B",
      reportCondition: "C",
      schedule: "* * * * *",
    });
    cronDb.updateCronJob(futureEnabled.id, { nextRunAt: "2026-05-13T10:30:00.000Z" });

    const runCronJob = vi.fn().mockResolvedValue(undefined);

    const scheduler = createCronScheduler({
      cronDb,
      pollIntervalMs: 1_000,
      runCronJob,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    expect(runCronJob).toHaveBeenCalledTimes(1);
    expect(runCronJob).toHaveBeenCalledWith(expect.objectContaining({ id: dueEnabled.id }));
  });

  it("does not overlap runs for the same job while in-flight", async () => {
    const dueEnabled = cronDb.createCronJob({
      agentId: "agent-1",
      targetCondition: "A",
      exitCondition: "B",
      reportCondition: "C",
      schedule: "* * * * *",
    });
    cronDb.updateCronJob(dueEnabled.id, { nextRunAt: "2026-05-13T09:59:00.000Z" });

    let resolveRun: (() => void) | undefined;
    const runCronJob = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve;
        }),
    );

    const scheduler = createCronScheduler({
      cronDb,
      pollIntervalMs: 1_000,
      runCronJob,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(runCronJob).toHaveBeenCalledTimes(1);

    resolveRun?.();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(1_000);
    scheduler.stop();

    expect(runCronJob).toHaveBeenCalledTimes(2);
  });
});
