import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { handleRequest } from "../src/request-handler.js";
import { createDatabase } from "../src/agents-db.js";
import { createCronJobsDatabase } from "../src/cron-jobs-db.js";

describe("cron-job handlers", () => {
  let sqliteDb: Database.Database;
  let db: ReturnType<typeof createDatabase>;
  let cronDb: ReturnType<typeof createCronJobsDatabase>;
  let chatResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sqliteDb = new Database(":memory:");
    db = createDatabase(sqliteDb);
    cronDb = createCronJobsDatabase(sqliteDb);
    chatResponse = vi.fn();
  });

  it("creates a cron job when action is create-cron-job", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-cron-job",
      payload: {
        agentId: "agent-1",
        targetCondition: "Check London Tube API",
        exitCondition: "No incidents",
        reportCondition: "Always report",
        schedule: "0 9 * * *",
        enabled: true,
      },
      id: "cron-1",
      send,
      db,
      cronDb,
      chatResponse,
    });

    expect(result).toHaveLength(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      agentId: "agent-1",
      targetCondition: "Check London Tube API",
      exitCondition: "No incidents",
      reportCondition: "Always report",
      schedule: "0 9 * * *",
      enabled: true,
    });
  });

  it("returns validation error when create-cron-job payload is missing schedule", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-cron-job",
      payload: {
        agentId: "agent-1",
        targetCondition: "Check London Tube API",
        exitCondition: "No incidents",
        reportCondition: "Always report",
      },
      id: "cron-2",
      send,
      db,
      cronDb,
      chatResponse,
    });

    expect(result).toHaveLength(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: schedule");
  });

  it("lists cron jobs when action is list-cron-jobs", () => {
    cronDb.createCronJob({
      agentId: "agent-1",
      targetCondition: "A",
      exitCondition: "B",
      reportCondition: "C",
      schedule: "0 9 * * *",
    });
    cronDb.createCronJob({
      agentId: "agent-2",
      targetCondition: "D",
      exitCondition: "E",
      reportCondition: "F",
      schedule: "0 10 * * *",
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-cron-jobs",
      payload: { agentId: "agent-1" },
      id: "cron-3",
      send,
      db,
      cronDb,
      chatResponse,
    });

    expect(result).toHaveLength(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject([
      expect.objectContaining({ agentId: "agent-1" }),
    ]);
  });

  it("updates a cron job when action is update-cron-job", () => {
    const created = cronDb.createCronJob({
      agentId: "agent-1",
      targetCondition: "A",
      exitCondition: "B",
      reportCondition: "C",
      schedule: "0 9 * * *",
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "update-cron-job",
      payload: {
        cronJobId: created.id,
        schedule: "0 10 * * *",
        enabled: false,
      },
      id: "cron-4",
      send,
      db,
      cronDb,
      chatResponse,
    });

    expect(result).toHaveLength(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      id: created.id,
      schedule: "0 10 * * *",
      enabled: false,
    });
  });

  it("deletes a cron job when action is delete-cron-job", () => {
    const created = cronDb.createCronJob({
      agentId: "agent-1",
      targetCondition: "A",
      exitCondition: "B",
      reportCondition: "C",
      schedule: "0 9 * * *",
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-cron-job",
      payload: { cronJobId: created.id },
      id: "cron-5",
      send,
      db,
      cronDb,
      chatResponse,
    });

    expect(result).toHaveLength(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true });
    expect(cronDb.getCronJob(created.id)).toBeUndefined();
  });
});
