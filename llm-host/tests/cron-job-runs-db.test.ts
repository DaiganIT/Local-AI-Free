import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createCronJobsDatabase } from "../src/cron-jobs-db.js";

describe("cron-job-runs-db", () => {
  let sqlite: Database.Database;
  let cronDb: ReturnType<typeof createCronJobsDatabase>;

  beforeEach(() => {
    vi.useFakeTimers();
    sqlite = new Database(":memory:");
    cronDb = createCronJobsDatabase(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates the cron_job_runs table", () => {
    const table = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cron_job_runs'")
      .get();

    expect(table).toBeDefined();
  });

  it("stores a cron run record in DB", () => {
    const job = cronDb.createCronJob({
      agentId: "agent-1",
      targetCondition: "check API health",
      exitCondition: "stop when incident resolved",
      reportCondition: "report only if issues found",
      schedule: "0 9 * * *",
    });

    const run = cronDb.createCronJobRun({
      cronJobId: job.id,
      status: "success",
      startedAt: "2026-05-14T09:00:00.000Z",
      finishedAt: "2026-05-14T09:00:05.000Z",
      chatId: "chat-1",
      logFilePath: ".agents/agent-1/cron-log/job-1.log",
    });

    expect(run.id).toBeDefined();
    expect(run.cronJobId).toBe(job.id);
    expect(run.agentId).toBe("agent-1");
    expect(run.status).toBe("success");
    expect(run.chatId).toBe("chat-1");
    expect(run.logFilePath).toContain("cron-log");
    expect(run.createdAt).toBeDefined();
  });

  it("stores disk log write errors without failing the run record", () => {
    const job = cronDb.createCronJob({
      agentId: "agent-1",
      targetCondition: "check API health",
      exitCondition: "stop when incident resolved",
      reportCondition: "report only if issues found",
      schedule: "0 9 * * *",
    });

    const run = cronDb.createCronJobRun({
      cronJobId: job.id,
      status: "error",
      startedAt: "2026-05-14T09:00:00.000Z",
      finishedAt: "2026-05-14T09:00:03.000Z",
      error: "agent execution failed",
      logWriteError: "EACCES: permission denied",
    });

    expect(run.status).toBe("error");
    expect(run.error).toBe("agent execution failed");
    expect(run.logWriteError).toContain("EACCES");
  });

  it("lists runs for a cron job ordered by started_at desc", () => {
    const job = cronDb.createCronJob({
      agentId: "agent-1",
      targetCondition: "check API health",
      exitCondition: "stop when incident resolved",
      reportCondition: "report only if issues found",
      schedule: "0 9 * * *",
    });

    const first = cronDb.createCronJobRun({
      cronJobId: job.id,
      status: "success",
      startedAt: "2026-05-14T09:00:00.000Z",
      finishedAt: "2026-05-14T09:00:05.000Z",
    });

    const second = cronDb.createCronJobRun({
      cronJobId: job.id,
      status: "skipped",
      startedAt: "2026-05-15T09:00:00.000Z",
      finishedAt: "2026-05-15T09:00:01.000Z",
    });

    const runs = cronDb.listCronJobRuns(job.id);
    expect(runs).toHaveLength(2);
    expect(runs[0].id).toBe(second.id);
    expect(runs[1].id).toBe(first.id);
  });

  it("throws when creating a run for an unknown cron job", () => {
    expect(() =>
      cronDb.createCronJobRun({
        cronJobId: "missing",
        status: "success",
        startedAt: "2026-05-14T09:00:00.000Z",
        finishedAt: "2026-05-14T09:00:05.000Z",
      })
    ).toThrow("Cron job not found: missing");
  });
});
