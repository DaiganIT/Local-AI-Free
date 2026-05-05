import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWriteAgentsMdTool } from "../src/tools/write-agents-md.js";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
  };
});

import { writeFileSync } from "fs";

describe("createWriteAgentsMdTool", () => {
  beforeEach(() => {
    vi.mocked(writeFileSync).mockClear();
  });

  it("creates a tool with correct name and description", () => {
    const tool = createWriteAgentsMdTool("/tmp/base", "my-agent");
    expect(tool.name).toBe("write_agents_md");
    expect(tool.label).toBe("Write AGENTS.md");
    expect(tool.description).toContain("AGENTS.md");
  });

  it("has a parameters schema with a content field", () => {
    const tool = createWriteAgentsMdTool("/tmp/base", "my-agent");
    expect(tool.parameters).toBeDefined();
    // TypeBox schema structure
    const schema = tool.parameters as any;
    expect(schema.type).toBe("object");
    expect(schema.properties.content).toBeDefined();
    expect(schema.properties.content.type).toBe("string");
  });

  it("writes content to the correct AGENTS.md path", async () => {
    const tool = createWriteAgentsMdTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { content: "You are a pirate." });

    expect(writeFileSync).toHaveBeenCalledWith(
      "/data/agents/.agents/my-agent/AGENTS.md",
      "You are a pirate.",
      "utf-8",
    );
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "AGENTS.md updated successfully.",
    });
    expect(result.details.path).toBe("/data/agents/.agents/my-agent/AGENTS.md");
  });

  it("overwrites the file with new content", async () => {
    const tool = createWriteAgentsMdTool("/data/agents", "test-bot");

    await tool.execute("call-1", { content: "First version" });
    await tool.execute("call-2", { content: "Second version" });

    expect(writeFileSync).toHaveBeenCalledTimes(2);
    expect(vi.mocked(writeFileSync).mock.calls[1][1]).toBe("Second version");
  });

  it("returns error message instead of crashing when writeFileSync fails", async () => {
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const tool = createWriteAgentsMdTool("/data/agents", "test-bot");
    const result = await tool.execute("call-1", { content: "New content" });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Failed to write AGENTS.md: EACCES: permission denied.",
    });
    // Tool still returns details so the agent knows which path failed
    expect(result.details.path).toBe("/data/agents/.agents/test-bot/AGENTS.md");
  });
});
