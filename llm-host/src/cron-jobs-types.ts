export const CRON_JOB_RUN_STATUSES = ["success", "error", "skipped"] as const;

export type CronJobRunStatus = (typeof CRON_JOB_RUN_STATUSES)[number];

export interface CronJob {
  id: string;
  agentId: string;
  targetCondition: string;
  exitCondition: string;
  reportCondition: string;
  schedule: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface CreateCronJobPayload {
  agentId: string;
  targetCondition: string;
  exitCondition: string;
  reportCondition: string;
  schedule: string;
  enabled?: boolean;
}

export interface UpdateCronJobPayload {
  targetCondition?: string;
  exitCondition?: string;
  reportCondition?: string;
  schedule?: string;
  enabled?: boolean;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

export interface CronJobRunResult {
  cronJobId: string;
  status: CronJobRunStatus;
  startedAt: string;
  finishedAt: string;
  chatId?: string;
  error?: string;
}

export interface CronJobRunRow {
  id: string;
  cronJobId: string;
  agentId: string;
  status: CronJobRunStatus;
  startedAt: string;
  finishedAt: string;
  chatId: string | null;
  error: string | null;
  logFilePath: string | null;
  logWriteError: string | null;
  createdAt: string;
}

export interface CreateCronJobRunInput {
  cronJobId: string;
  status: CronJobRunStatus;
  startedAt: string;
  finishedAt: string;
  chatId?: string;
  error?: string;
  logFilePath?: string;
  logWriteError?: string;
}
