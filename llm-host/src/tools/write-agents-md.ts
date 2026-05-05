/**
 * write_agents_md tool — allows the agent to overwrite its own AGENTS.md
 * instructions file. The agent can use this when the user asks it to change
 * its behavior or personality.
 */
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "typebox";
import { writeFileSync } from "fs";
import { join } from "path";

const WriteAgentsMdParams = Type.Object({
  content: Type.String({
    description: "The full new content of the AGENTS.md file. Will overwrite the existing file.",
  }),
});

export type WriteAgentsMdParams = typeof WriteAgentsMdParams;

/**
 * Create a write_agents_md tool for the given agent folder path.
 * The tool writes the provided content to $basePath/.agents/$alias/AGENTS.md.
 */
export function createWriteAgentsMdTool(
  agentFolderBasePath: string,
  agentAlias: string,
): AgentTool<WriteAgentsMdParams, { path: string }> {
  return {
    name: "write_agents_md",
    label: "Write AGENTS.md",
    description:
      "Overwrite your AGENTS.md instructions file. Use this when the user asks you to change your behavior, personality, or instructions. The file will be completely replaced with the new content you provide.",
    parameters: WriteAgentsMdParams,
    async execute(
      _toolCallId: string,
      params: { content: string },
      _signal?: AbortSignal,
    ): Promise<AgentToolResult<{ path: string }>> {
      const filePath = join(agentFolderBasePath, ".agents", agentAlias, "AGENTS.md");
      console.log(`[write_agents_md] writing ${params.content.length} chars to ${filePath}`);
      try {
        writeFileSync(filePath, params.content, "utf-8");
        console.log(`[write_agents_md] OK`);
        return {
          content: [{ type: "text", text: "AGENTS.md updated successfully." }],
          details: { path: filePath },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[write_agents_md] ERROR: ${message}`);
        return {
          content: [{ type: "text", text: `Failed to write AGENTS.md: ${message}.` }],
          details: { path: filePath },
        };
      }
    },
  };
}
