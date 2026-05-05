import { writeFileSync } from "fs";
import { join } from "path";

export interface LastRunLog {
  agentName: string;
  model: string;
  prompt: string;
  response: string;
  promptTokens: number;
  completionTokens: number;
  timestamp: string;
}

/**
 * Write a token-efficient last-run log as a markdown file.
 * Overwrites on each run so only the latest is kept.
 */
export function writeLastRunLog(basePath: string, alias: string, log: LastRunLog): void {
  const filePath = join(basePath, ".agents", alias, "last-run.md");
  const content = [
    `# Last Run: ${log.agentName}`,
    ``,
    `- **Model**: ${log.model}`,
    `- **Time**: ${log.timestamp}`,
    `- **Tokens**: ${log.promptTokens} in / ${log.completionTokens} out`,
    ``,
    `## Prompt`,
    ``,
    log.prompt,
    ``,
    `## Response`,
    ``,
    log.response,
    ``,
  ].join("\n");
  writeFileSync(filePath, content, "utf-8");
}

export interface LastErrorLog {
  agentName: string;
  model: string;
  prompt: string;
  error: string;
  timestamp: string;
}

/**
 * Write a last-error log as a markdown file.
 * Overwrites on each error so only the latest is kept.
 */
export function writeLastErrorLog(basePath: string, alias: string, log: LastErrorLog): void {
  const filePath = join(basePath, ".agents", alias, "last-error.md");
  const content = [
    `# Last Error: ${log.agentName}`,
    ``,
    `- **Model**: ${log.model}`,
    `- **Time**: ${log.timestamp}`,
    ``,
    `## Prompt`,
    ``,
    log.prompt,
    ``,
    `## Error`,
    ``,
    log.error,
    ``,
  ].join("\n");
  writeFileSync(filePath, content, "utf-8");
}
