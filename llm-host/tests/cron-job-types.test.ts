import { describe, it, expect, expectTypeOf } from "vitest";
import { CRON_JOB_RUN_STATUSES } from "../src/cron-jobs-types.js";
import type {
  CronJob,
  CreateCronJobPayload,
  UpdateCronJobPayload,
  CronJobRunResult,
} from "../src/cron-jobs-types.js";

describe("cron job contract types", () => {
  it("defines required fields for create payload", () => {
    const payload: CreateCronJobPayload = {
      agentId: "agent-1",
      targetCondition: "Check London Tube status",
      exitCondition: "Stop when service disruption is resolved",
      reportCondition: "Report only when disruption exists",
      schedule: "0 9 * * *",
    };

    expect(payload.agentId).toBe("agent-1");
    expect(payload.schedule).toBe("0 9 * * *");
    expectTypeOf(payload.enabled).toEqualTypeOf<boolean | undefined>();
  });

  it("allows partial updates", () => {
    const payload: UpdateCronJobPayload = {
      enabled: false,
      nextRunAt: null,
    };

    expect(payload.enabled).toBe(false);
    expect(payload.nextRunAt).toBeNull();
    expectTypeOf(payload.schedule).toEqualTypeOf<string | undefined>();
  });

  it("defines stored cron job entity shape", () => {
    const job: CronJob = {
      id: "cron-1",
      agentId: "agent-1",
      targetCondition: "Check London Tube status",
      exitCondition: "Stop when service disruption is resolved",
      reportCondition: "Report only when disruption exists",
      schedule: "0 9 * * *",
      enabled: true,
      createdAt: "2026-05-13T08:00:00.000Z",
      updatedAt: "2026-05-13T08:00:00.000Z",
      lastRunAt: null,
      nextRunAt: "2026-05-14T09:00:00.000Z",
    };

    expect(job.enabled).toBe(true);
    expect(job.nextRunAt).toContain("T");
  });

  it("exposes supported scheduler run statuses", () => {
    expect(CRON_JOB_RUN_STATUSES).toEqual(["success", "error", "skipped"]);
  });

  it("defines scheduler run result shape", () => {
    const result: CronJobRunResult = {
      cronJobId: "cron-1",
      status: "success",
      startedAt: "2026-05-14T09:00:00.000Z",
      finishedAt: "2026-05-14T09:00:05.000Z",
      chatId: "chat-1",
    };

    expect(result.status).toBe("success");
    expectTypeOf(result.error).toEqualTypeOf<string | undefined>();
  });
});
