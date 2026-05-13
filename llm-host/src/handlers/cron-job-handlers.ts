import type { CronJobsDb } from "../cron-jobs-db.js";
import type { UpdateCronJobPayload } from "../cron-jobs-types.js";
import { sendResponse } from "../send-response.js";
import { validateRequired } from "../utils.js";

export function handleCreateCronJob(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  cronDb: CronJobsDb | undefined,
): void {
  if (!cronDb) {
    sendResponse(send, id, undefined, "cron jobs database not available");
    return;
  }

  const err = validateRequired(payload, ["agentId", "targetCondition", "exitCondition", "reportCondition", "schedule"]);
  if (err) {
    sendResponse(send, id, undefined, err);
    return;
  }

  try {
    const cronJob = cronDb.createCronJob({
      agentId: payload.agentId as string,
      targetCondition: payload.targetCondition as string,
      exitCondition: payload.exitCondition as string,
      reportCondition: payload.reportCondition as string,
      schedule: payload.schedule as string,
      enabled: payload.enabled as boolean | undefined,
    });
    sendResponse(send, id, cronJob);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to create cron job";
    sendResponse(send, id, undefined, message);
  }
}

export function handleListCronJobs(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  cronDb: CronJobsDb | undefined,
): void {
  if (!cronDb) {
    sendResponse(send, id, undefined, "cron jobs database not available");
    return;
  }

  const agentId = typeof payload.agentId === "string" && payload.agentId.trim() !== ""
    ? payload.agentId
    : undefined;

  const rows = cronDb.listCronJobs(agentId);
  sendResponse(send, id, rows);
}

export function handleUpdateCronJob(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  cronDb: CronJobsDb | undefined,
): void {
  if (!cronDb) {
    sendResponse(send, id, undefined, "cron jobs database not available");
    return;
  }

  const err = validateRequired(payload, ["cronJobId"]);
  if (err) {
    sendResponse(send, id, undefined, err);
    return;
  }

  const updateInput: UpdateCronJobPayload = {};

  if ("targetCondition" in payload) updateInput.targetCondition = payload.targetCondition as string;
  if ("exitCondition" in payload) updateInput.exitCondition = payload.exitCondition as string;
  if ("reportCondition" in payload) updateInput.reportCondition = payload.reportCondition as string;
  if ("schedule" in payload) updateInput.schedule = payload.schedule as string;
  if ("enabled" in payload) updateInput.enabled = payload.enabled as boolean;
  if ("lastRunAt" in payload) updateInput.lastRunAt = payload.lastRunAt as string | null;
  if ("nextRunAt" in payload) updateInput.nextRunAt = payload.nextRunAt as string | null;

  try {
    const updated = cronDb.updateCronJob(payload.cronJobId as string, updateInput);
    sendResponse(send, id, updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to update cron job";
    sendResponse(send, id, undefined, message);
  }
}

export function handleDeleteCronJob(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  cronDb: CronJobsDb | undefined,
): void {
  if (!cronDb) {
    sendResponse(send, id, undefined, "cron jobs database not available");
    return;
  }

  const err = validateRequired(payload, ["cronJobId"]);
  if (err) {
    sendResponse(send, id, undefined, err);
    return;
  }

  try {
    cronDb.deleteCronJob(payload.cronJobId as string);
    sendResponse(send, id, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to delete cron job";
    sendResponse(send, id, undefined, message);
  }
}
