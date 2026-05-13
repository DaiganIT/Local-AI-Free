import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface AppendCronJobJsonLogInput {
  agentFolderBasePath?: string;
  agentAlias: string;
  cronJobId: string;
  entry: Record<string, unknown>;
}

export interface AppendCronJobJsonLogResult {
  logFilePath?: string;
  error?: string;
}

export function appendCronJobJsonLog(input: AppendCronJobJsonLogInput): AppendCronJobJsonLogResult {
  if (!input.agentFolderBasePath) {
    return { error: "workspace not configured" };
  }

  try {
    const logDir = join(input.agentFolderBasePath, ".agents", input.agentAlias, "cron-log");
    mkdirSync(logDir, { recursive: true });

    const filePath = join(logDir, `${input.cronJobId}.log`);
    appendFileSync(filePath, `${JSON.stringify(input.entry)}\n`, "utf-8");
    return { logFilePath: filePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to write cron log";
    return { error: message };
  }
}
