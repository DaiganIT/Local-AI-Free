import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createCronJobsDatabase } from "../src/cron-jobs-db.js";

describe("cron-jobs-db", () => {
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

  describe("init", () => {
    it("creates the cron_jobs table", () => {
      const table = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cron_jobs'")
        .get();

      expect(table).toBeDefined();
    });
  });

  describe("createCronJob", () => {
    it("creates a cron job with defaults", () => {
      const row = cronDb.createCronJob({
        agentId: "agent-1",
        targetCondition: "check API health",
        exitCondition: "stop when incident resolved",
        reportCondition: "report only if issues found",
        schedule: "0 9 * * *",
      });

      expect(row.id).toBeDefined();
      expect(row.agentId).toBe("agent-1");
      expect(row.enabled).toBe(true);
      expect(row.lastRunAt).toBeNull();
      expect(row.nextRunAt).toBeNull();
      expect(row.createdAt).toBeDefined();
      expect(row.updatedAt).toBeDefined();
    });

    it("supports enabled=false at creation time", () => {
      const row = cronDb.createCronJob({
        agentId: "agent-1",
        targetCondition: "check API health",
        exitCondition: "stop when incident resolved",
        reportCondition: "report only if issues found",
        schedule: "0 9 * * *",
        enabled: false,
      });

      expect(row.enabled).toBe(false);
    });

    it("validates required fields", () => {
      const base = {
        agentId: "agent-1",
        targetCondition: "check API health",
        exitCondition: "stop when incident resolved",
        reportCondition: "report only if issues found",
        schedule: "0 9 * * *",
      };

      expect(() => cronDb.createCronJob({ ...base, agentId: "" })).toThrow("missing required field: agentId");
      expect(() => cronDb.createCronJob({ ...base, targetCondition: "" })).toThrow("missing required field: targetCondition");
      expect(() => cronDb.createCronJob({ ...base, exitCondition: "" })).toThrow("missing required field: exitCondition");
      expect(() => cronDb.createCronJob({ ...base, reportCondition: "" })).toThrow("missing required field: reportCondition");
      expect(() => cronDb.createCronJob({ ...base, schedule: "" })).toThrow("missing required field: schedule");
    });
  });

  describe("getCronJob", () => {
    it("returns a cron job by id", () => {
      const created = cronDb.createCronJob({
        agentId: "agent-1",
        targetCondition: "check API health",
        exitCondition: "stop when incident resolved",
        reportCondition: "report only if issues found",
        schedule: "0 9 * * *",
      });

      const found = cronDb.getCronJob(created.id);
      expect(found?.id).toBe(created.id);
    });

    it("returns undefined when missing", () => {
      expect(cronDb.getCronJob("missing")).toBeUndefined();
    });
  });

  describe("listCronJobs", () => {
    it("lists all cron jobs ordered by created_at desc", () => {
      const a = cronDb.createCronJob({
        agentId: "agent-1",
        targetCondition: "a",
        exitCondition: "a",
        reportCondition: "a",
        schedule: "* * * * *",
      });
      vi.advanceTimersByTime(1000);
      const b = cronDb.createCronJob({
        agentId: "agent-2",
        targetCondition: "b",
        exitCondition: "b",
        reportCondition: "b",
        schedule: "* * * * *",
      });

      const rows = cronDb.listCronJobs();
      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe(b.id);
      expect(rows[1].id).toBe(a.id);
    });

    it("can filter by agentId", () => {
      cronDb.createCronJob({
        agentId: "agent-1",
        targetCondition: "a",
        exitCondition: "a",
        reportCondition: "a",
        schedule: "* * * * *",
      });
      const b = cronDb.createCronJob({
        agentId: "agent-2",
        targetCondition: "b",
        exitCondition: "b",
        reportCondition: "b",
        schedule: "* * * * *",
      });

      const rows = cronDb.listCronJobs("agent-2");
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(b.id);
    });
  });

  describe("updateCronJob", () => {
    it("updates provided fields including nextRunAt", () => {
      const created = cronDb.createCronJob({
        agentId: "agent-1",
        targetCondition: "check API health",
        exitCondition: "stop when incident resolved",
        reportCondition: "report only if issues found",
        schedule: "0 9 * * *",
      });

      vi.advanceTimersByTime(1000);

      const updated = cronDb.updateCronJob(created.id, {
        schedule: "*/5 * * * *",
        nextRunAt: "2026-05-14T09:00:00.000Z",
      });

      expect(updated.schedule).toBe("*/5 * * * *");
      expect(updated.nextRunAt).toBe("2026-05-14T09:00:00.000Z");
      expect(updated.updatedAt).not.toBe(created.updatedAt);
    });

    it("allows clearing nextRunAt with null", () => {
      const created = cronDb.createCronJob({
        agentId: "agent-1",
        targetCondition: "check API health",
        exitCondition: "stop when incident resolved",
        reportCondition: "report only if issues found",
        schedule: "0 9 * * *",
      });

      const updated = cronDb.updateCronJob(created.id, { nextRunAt: null });
      expect(updated.nextRunAt).toBeNull();
    });

    it("throws for unknown cron job", () => {
      expect(() => cronDb.updateCronJob("missing", { schedule: "* * * * *" })).toThrow("Cron job not found: missing");
    });

    it("validates non-empty string fields when provided", () => {
      const created = cronDb.createCronJob({
        agentId: "agent-1",
        targetCondition: "check API health",
        exitCondition: "stop when incident resolved",
        reportCondition: "report only if issues found",
        schedule: "0 9 * * *",
      });

      expect(() => cronDb.updateCronJob(created.id, { schedule: "" })).toThrow("missing required field: schedule");
      expect(() => cronDb.updateCronJob(created.id, { targetCondition: "" })).toThrow("missing required field: targetCondition");
    });
  });

  describe("setCronJobEnabled", () => {
    it("toggles enabled status", () => {
      const created = cronDb.createCronJob({
        agentId: "agent-1",
        targetCondition: "check API health",
        exitCondition: "stop when incident resolved",
        reportCondition: "report only if issues found",
        schedule: "0 9 * * *",
      });

      const disabled = cronDb.setCronJobEnabled(created.id, false);
      expect(disabled.enabled).toBe(false);

      const enabled = cronDb.setCronJobEnabled(created.id, true);
      expect(enabled.enabled).toBe(true);
    });
  });

  describe("deleteCronJob", () => {
    it("deletes cron job", () => {
      const created = cronDb.createCronJob({
        agentId: "agent-1",
        targetCondition: "check API health",
        exitCondition: "stop when incident resolved",
        reportCondition: "report only if issues found",
        schedule: "0 9 * * *",
      });

      cronDb.deleteCronJob(created.id);
      expect(cronDb.getCronJob(created.id)).toBeUndefined();
    });

    it("throws for missing cron job", () => {
      expect(() => cronDb.deleteCronJob("missing")).toThrow("Cron job not found: missing");
    });
  });
});
