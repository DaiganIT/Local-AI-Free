import type { CronJobsDb } from "./cron-jobs-db.js";
import type { CronJob } from "./cron-jobs-types.js";
import { now as nowIso } from "./utils.js";

export interface CronSchedulerOptions {
  cronDb: Pick<CronJobsDb, "listCronJobs">;
  pollIntervalMs: number;
  runCronJob: (job: CronJob) => Promise<void>;
  now?: () => string;
  onError?: (error: unknown, job: CronJob) => void;
}

export interface CronScheduler {
  start(): void;
  stop(): void;
}

function isDue(job: CronJob, nowMs: number): boolean {
  if (!job.enabled || !job.nextRunAt) {
    return false;
  }

  const nextRunAtMs = Date.parse(job.nextRunAt);
  if (Number.isNaN(nextRunAtMs)) {
    return false;
  }

  return nextRunAtMs <= nowMs;
}

export function createCronScheduler(options: CronSchedulerOptions): CronScheduler {
  if (!Number.isFinite(options.pollIntervalMs) || options.pollIntervalMs <= 0) {
    throw new Error("pollIntervalMs must be > 0");
  }

  const getNow = options.now ?? nowIso;
  const runningJobIds = new Set<string>();

  let interval: ReturnType<typeof setInterval> | null = null;
  let pollInFlight = false;

  const pollDueJobs = () => {
    if (pollInFlight) {
      return;
    }

    pollInFlight = true;
    try {
      const nowMs = Date.parse(getNow());
      const dueJobs = options.cronDb
        .listCronJobs()
        .filter((job) => isDue(job, nowMs))
        .sort((a, b) => Date.parse(a.nextRunAt as string) - Date.parse(b.nextRunAt as string));

      for (const job of dueJobs) {
        if (runningJobIds.has(job.id)) {
          continue;
        }

        runningJobIds.add(job.id);

        void options
          .runCronJob(job)
          .catch((error) => {
            options.onError?.(error, job);
          })
          .finally(() => {
            runningJobIds.delete(job.id);
          });
      }
    } finally {
      pollInFlight = false;
    }
  };

  return {
    start(): void {
      if (interval !== null) {
        return;
      }

      interval = setInterval(pollDueJobs, options.pollIntervalMs);
      pollDueJobs();
    },

    stop(): void {
      if (interval === null) {
        return;
      }

      clearInterval(interval);
      interval = null;
    },
  };
}
