import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { appendCronJobJsonLog } from "../src/cron-job-log-file.js";

describe("cron-job-log-file", () => {
  let basePath: string;

  beforeEach(() => {
    basePath = mkdtempSync(join(tmpdir(), "cron-log-test-"));
  });

  afterEach(() => {
    rmSync(basePath, { recursive: true, force: true });
  });

  it("appends JSONL entries in the agent cron-log folder", () => {
    const first = appendCronJobJsonLog({
      agentFolderBasePath: basePath,
      agentAlias: "weather-agent",
      cronJobId: "job-123",
      entry: { runId: "run-1", status: "success" },
    });

    expect(first.error).toBeUndefined();
    expect(first.logFilePath).toBeDefined();
    expect(existsSync(first.logFilePath!)).toBe(true);

    appendCronJobJsonLog({
      agentFolderBasePath: basePath,
      agentAlias: "weather-agent",
      cronJobId: "job-123",
      entry: { runId: "run-2", status: "error" },
    });

    const content = readFileSync(first.logFilePath!, "utf-8").trimEnd();
    const lines = content.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ runId: "run-1", status: "success" });
    expect(JSON.parse(lines[1])).toEqual({ runId: "run-2", status: "error" });
    expect(first.logFilePath).toContain(".agents/weather-agent/cron-log/job-123.log");
  });

  it("returns error when workspace base path is not configured", () => {
    const result = appendCronJobJsonLog({
      agentAlias: "weather-agent",
      cronJobId: "job-123",
      entry: { runId: "run-1", status: "success" },
    });

    expect(result.logFilePath).toBeUndefined();
    expect(result.error).toBe("workspace not configured");
  });
});
