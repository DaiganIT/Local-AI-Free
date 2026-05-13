import Database from "better-sqlite3";
import { now, uuid } from "./utils.js";
import {
  CRON_JOB_RUN_STATUSES,
  type CronJob,
  type CronJobRunRow,
  type CreateCronJobPayload,
  type CreateCronJobRunInput,
  type UpdateCronJobPayload,
  type CronJobRunStatus,
} from "./cron-jobs-types.js";

export interface CronJobsDb {
  createCronJob(input: CreateCronJobPayload): CronJob;
  getCronJob(id: string): CronJob | undefined;
  listCronJobs(agentId?: string): CronJob[];
  updateCronJob(id: string, input: UpdateCronJobPayload): CronJob;
  setCronJobEnabled(id: string, enabled: boolean): CronJob;
  deleteCronJob(id: string): void;

  createCronJobRun(input: CreateCronJobRunInput): CronJobRunRow;
  listCronJobRuns(cronJobId: string): CronJobRunRow[];
}

interface RawCronJob {
  id: string;
  agent_id: string;
  target_condition: string;
  exit_condition: string;
  report_condition: string;
  schedule: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface RawCronJobRun {
  id: string;
  cron_job_id: string;
  agent_id: string;
  status: CronJobRunStatus;
  started_at: string;
  finished_at: string;
  chat_id: string | null;
  error: string | null;
  log_file_path: string | null;
  log_write_error: string | null;
  created_at: string;
}

function toCronJob(raw: RawCronJob): CronJob {
  return {
    id: raw.id,
    agentId: raw.agent_id,
    targetCondition: raw.target_condition,
    exitCondition: raw.exit_condition,
    reportCondition: raw.report_condition,
    schedule: raw.schedule,
    enabled: raw.enabled === 1,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    lastRunAt: raw.last_run_at,
    nextRunAt: raw.next_run_at,
  };
}

function toCronJobRun(raw: RawCronJobRun): CronJobRunRow {
  return {
    id: raw.id,
    cronJobId: raw.cron_job_id,
    agentId: raw.agent_id,
    status: raw.status,
    startedAt: raw.started_at,
    finishedAt: raw.finished_at,
    chatId: raw.chat_id,
    error: raw.error,
    logFilePath: raw.log_file_path,
    logWriteError: raw.log_write_error,
    createdAt: raw.created_at,
  };
}

function ensureRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing required field: ${fieldName}`);
  }
  return value;
}

function ensureOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  return ensureRequiredString(value, fieldName);
}

function ensureRunStatus(value: unknown): CronJobRunStatus {
  if (typeof value !== "string" || !CRON_JOB_RUN_STATUSES.includes(value as CronJobRunStatus)) {
    throw new Error("invalid run status");
  }
  return value as CronJobRunStatus;
}

const CREATE_CRON_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS cron_jobs (
    id                TEXT PRIMARY KEY,
    agent_id          TEXT NOT NULL CHECK(length(agent_id) > 0),
    target_condition  TEXT NOT NULL CHECK(length(target_condition) > 0),
    exit_condition    TEXT NOT NULL CHECK(length(exit_condition) > 0),
    report_condition  TEXT NOT NULL CHECK(length(report_condition) > 0),
    schedule          TEXT NOT NULL CHECK(length(schedule) > 0),
    enabled           INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    last_run_at       TEXT,
    next_run_at       TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
`;

const CREATE_CRON_JOB_RUNS_TABLE = `
  CREATE TABLE IF NOT EXISTS cron_job_runs (
    id              TEXT PRIMARY KEY,
    cron_job_id     TEXT NOT NULL CHECK(length(cron_job_id) > 0),
    agent_id        TEXT NOT NULL CHECK(length(agent_id) > 0),
    status          TEXT NOT NULL CHECK(status IN ('success', 'error', 'skipped')),
    started_at      TEXT NOT NULL,
    finished_at     TEXT NOT NULL,
    chat_id         TEXT,
    error           TEXT,
    log_file_path   TEXT,
    log_write_error TEXT,
    created_at      TEXT NOT NULL
  );
`;

const CREATE_CRON_JOBS_AGENT_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent_date ON cron_jobs(agent_id, created_at DESC);
`;

const CREATE_CRON_JOB_RUNS_JOB_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_date ON cron_job_runs(cron_job_id, started_at DESC);
`;

export function createCronJobsDatabase(db: Database.Database): CronJobsDb {
  db.exec(CREATE_CRON_JOBS_TABLE);
  db.exec(CREATE_CRON_JOB_RUNS_TABLE);
  db.exec(CREATE_CRON_JOBS_AGENT_INDEX);
  db.exec(CREATE_CRON_JOB_RUNS_JOB_INDEX);

  const insertStmt = db.prepare(
    "INSERT INTO cron_jobs (id, agent_id, target_condition, exit_condition, report_condition, schedule, enabled, last_run_at, next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const getByIdStmt = db.prepare("SELECT * FROM cron_jobs WHERE id = ?");
  const listStmt = db.prepare("SELECT * FROM cron_jobs ORDER BY created_at DESC");
  const listByAgentStmt = db.prepare("SELECT * FROM cron_jobs WHERE agent_id = ? ORDER BY created_at DESC");
  const deleteStmt = db.prepare("DELETE FROM cron_jobs WHERE id = ?");

  const insertRunStmt = db.prepare(
    "INSERT INTO cron_job_runs (id, cron_job_id, agent_id, status, started_at, finished_at, chat_id, error, log_file_path, log_write_error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const getRunByIdStmt = db.prepare("SELECT * FROM cron_job_runs WHERE id = ?");
  const listRunsByCronJobStmt = db.prepare(
    "SELECT * FROM cron_job_runs WHERE cron_job_id = ? ORDER BY started_at DESC"
  );

  return {
    createCronJob(input: CreateCronJobPayload): CronJob {
      const agentId = ensureRequiredString(input.agentId, "agentId");
      const targetCondition = ensureRequiredString(input.targetCondition, "targetCondition");
      const exitCondition = ensureRequiredString(input.exitCondition, "exitCondition");
      const reportCondition = ensureRequiredString(input.reportCondition, "reportCondition");
      const schedule = ensureRequiredString(input.schedule, "schedule");

      const ts = now();
      const id = uuid();
      const enabled = input.enabled === undefined ? 1 : input.enabled ? 1 : 0;

      insertStmt.run(
        id,
        agentId,
        targetCondition,
        exitCondition,
        reportCondition,
        schedule,
        enabled,
        null,
        null,
        ts,
        ts,
      );

      const raw = getByIdStmt.get(id) as RawCronJob;
      return toCronJob(raw);
    },

    getCronJob(id: string): CronJob | undefined {
      const raw = getByIdStmt.get(id) as RawCronJob | undefined;
      return raw ? toCronJob(raw) : undefined;
    },

    listCronJobs(agentId?: string): CronJob[] {
      const rows = agentId
        ? (listByAgentStmt.all(agentId) as RawCronJob[])
        : (listStmt.all() as RawCronJob[]);
      return rows.map(toCronJob);
    },

    updateCronJob(id: string, input: UpdateCronJobPayload): CronJob {
      const existing = getByIdStmt.get(id) as RawCronJob | undefined;
      if (!existing) {
        throw new Error(`Cron job not found: ${id}`);
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      const targetCondition = ensureOptionalString(input.targetCondition, "targetCondition");
      if (targetCondition !== undefined) {
        fields.push("target_condition = ?");
        values.push(targetCondition);
      }

      const exitCondition = ensureOptionalString(input.exitCondition, "exitCondition");
      if (exitCondition !== undefined) {
        fields.push("exit_condition = ?");
        values.push(exitCondition);
      }

      const reportCondition = ensureOptionalString(input.reportCondition, "reportCondition");
      if (reportCondition !== undefined) {
        fields.push("report_condition = ?");
        values.push(reportCondition);
      }

      const schedule = ensureOptionalString(input.schedule, "schedule");
      if (schedule !== undefined) {
        fields.push("schedule = ?");
        values.push(schedule);
      }

      if (input.enabled !== undefined) {
        fields.push("enabled = ?");
        values.push(input.enabled ? 1 : 0);
      }

      if (input.lastRunAt !== undefined) {
        if (input.lastRunAt !== null) {
          ensureRequiredString(input.lastRunAt, "lastRunAt");
        }
        fields.push("last_run_at = ?");
        values.push(input.lastRunAt);
      }

      if (input.nextRunAt !== undefined) {
        if (input.nextRunAt !== null) {
          ensureRequiredString(input.nextRunAt, "nextRunAt");
        }
        fields.push("next_run_at = ?");
        values.push(input.nextRunAt);
      }

      fields.push("updated_at = ?");
      values.push(now());
      values.push(id);

      const sql = `UPDATE cron_jobs SET ${fields.join(", ")} WHERE id = ?`;
      db.prepare(sql).run(...values);

      const raw = getByIdStmt.get(id) as RawCronJob;
      return toCronJob(raw);
    },

    setCronJobEnabled(id: string, enabled: boolean): CronJob {
      return this.updateCronJob(id, { enabled });
    },

    deleteCronJob(id: string): void {
      const result = deleteStmt.run(id);
      if (result.changes === 0) {
        throw new Error(`Cron job not found: ${id}`);
      }
    },

    createCronJobRun(input: CreateCronJobRunInput): CronJobRunRow {
      const cronJobId = ensureRequiredString(input.cronJobId, "cronJobId");
      const status = ensureRunStatus(input.status);
      const startedAt = ensureRequiredString(input.startedAt, "startedAt");
      const finishedAt = ensureRequiredString(input.finishedAt, "finishedAt");

      const cronJob = getByIdStmt.get(cronJobId) as RawCronJob | undefined;
      if (!cronJob) {
        throw new Error(`Cron job not found: ${cronJobId}`);
      }

      const id = uuid();
      const createdAt = now();
      insertRunStmt.run(
        id,
        cronJobId,
        cronJob.agent_id,
        status,
        startedAt,
        finishedAt,
        input.chatId ?? null,
        input.error ?? null,
        input.logFilePath ?? null,
        input.logWriteError ?? null,
        createdAt,
      );

      const raw = getRunByIdStmt.get(id) as RawCronJobRun;
      return toCronJobRun(raw);
    },

    listCronJobRuns(cronJobId: string): CronJobRunRow[] {
      const rows = listRunsByCronJobStmt.all(cronJobId) as RawCronJobRun[];
      return rows.map(toCronJobRun);
    },
  };
}
