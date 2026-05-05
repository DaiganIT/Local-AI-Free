/**
 * Agent runner — wraps @mariozechner/pi-agent-core's Agent class
 * with an ollama model so that agents can run the full tool-calling loop.
 *
 * Currently returns a final result only (no streaming to client).
 */
import { join } from "node:path";
import { Agent } from "@mariozechner/pi-agent-core";
import {
  createReadTool,
  createBashTool,
  createEditTool,
  createWriteTool,
  createGrepTool,
  createFindTool,
  createLsTool,
} from "@mariozechner/pi-coding-agent";
import type { ImageContent } from "@mariozechner/pi-ai";
import { registerOllamaApi, createOllamaModel } from "./providers/ollama.js";
import { createWriteAgentsMdTool } from "./tools/write-agents-md.js";
import { createReadAttachmentTool } from "./tools/read-attachment.js";

// Register once at module load
registerOllamaApi();

/** Valid pi built-in tool names */
const VALID_TOOL_NAMES = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;

type PiToolName = (typeof VALID_TOOL_NAMES)[number];

/** Map tool name → factory function */
const TOOL_FACTORIES: Record<PiToolName, (cwd: string) => any> = {
  read: createReadTool,
  bash: createBashTool,
  edit: createEditTool,
  write: createWriteTool,
  grep: createGrepTool,
  find: createFindTool,
  ls: createLsTool,
};

/**
 * Resolve an array of tool names into pi AgentTool instances.
 * Invalid names are silently skipped.
 */
export function resolveTools(toolNames: string[], cwd: string): any[] {
  return toolNames
    .filter((name): name is PiToolName => name in TOOL_FACTORIES)
    .map((name) => TOOL_FACTORIES[name](cwd));
}

export interface AgentRunInput {
  /** Ollama model id, e.g. "qwen3:8b". */
  modelId: string;
  /** Ollama base URL (defaults to process.env.OLLAMA_HOST). */
  baseUrl: string;
  /** System prompt for this run. */
  systemPrompt: string;
  /** Ollama model context window (for thinking budget hints). */
  contextWindow?: number;
  /** Conversation history (user/assistant messages, no system). */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** User prompt to send. */
  prompt: string;
  /** Images to pass to the model (for vision-capable models). */
  images?: ImageContent[];
  /**
   * Workspace root where per-agent dirs live under `.agents/<alias>/`
   * (same layout as `write_agents_md`, logs, etc.).
   */
  agentFolderBasePath?: string;
  /** Agent alias; with `agentFolderBasePath`, pi tools use `.agents/<alias>` as cwd. */
  agentAlias?: string;
  /** Names of pi built-in tools to enable (e.g. ["read", "bash", "edit", "write"]). */
  toolNames?: string[];
  /** Workspace directory path — when set, pi tools use this as cwd instead of the agent's personal folder. */
  workspacePath?: string;
  /**
   * Optional callback for streaming agent events.
   * When provided, the runner subscribes to the Agent and forwards
   * each AgentEvent to this callback in real-time.
   */
  onEvent?: (event: any) => void;
  /**
   * Optional AbortSignal — when aborted, calls agent.abort() to stop generation.
   * The agent loop will stop and return partial content.
   */
  signal?: AbortSignal;
}

export interface AgentRunResult {
  /** Generated response text (concatenated from all text blocks). */
  content: string;
  /** Prompt tokens consumed. */
  promptTokens: number;
  /** Completion tokens generated. */
  completionTokens: number;
  /** Whether the run was aborted mid-generation. */
  aborted?: boolean;
}

/**
 * Run the agent loop: user prompt → (tool calls × N) → final answer.
 * Returns the complete text response and token stats.
 */
export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const { modelId, baseUrl, systemPrompt, prompt, messages, contextWindow } = input;

  const model = createOllamaModel({
    id: modelId,
    baseUrl,
    contextWindow: contextWindow ?? 0,
  });

  // Build tools array
  const tools: any[] = [];
  if (input.agentFolderBasePath && input.agentAlias) {
    tools.push(createWriteAgentsMdTool(input.agentFolderBasePath, input.agentAlias));
    tools.push(createReadAttachmentTool(input.agentFolderBasePath, input.agentAlias));
  }
  if (input.workspacePath) {
    tools.push(createReadAttachmentTool(input.workspacePath));
  }
  if (input.toolNames && input.toolNames.length > 0) {
    const cwd =
      input.workspacePath
      ?? (input.agentFolderBasePath && input.agentAlias
        ? join(input.agentFolderBasePath, ".agents", input.agentAlias)
        : (input.agentFolderBasePath ?? process.cwd()));
    tools.push(...resolveTools(input.toolNames, cwd));
  }

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
    },
  });

  // Rehydrate conversation history into the agent
  for (const m of messages) {
    if (m.role === "user") {
      agent.state.messages.push({
        role: "user",
        content: m.content,
        timestamp: Date.now(),
      });
    } else {
      // Assistant messages need the full pi-ai shape
      agent.state.messages.push({
        role: "assistant",
        content: [{ type: "text", text: m.content }],
        api: "ollama",
        provider: "ollama",
        model: modelId,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      });
    }
  }

  // Wire abort signal to agent.abort()
  if (input.signal) {
    if (input.signal.aborted) {
      // Already aborted before we started
      return { content: "", promptTokens: 0, completionTokens: 0, aborted: true };
    }
    input.signal.addEventListener("abort", () => {
      agent.abort();
    }, { once: true });
  }

  // Subscribe to agent events if onEvent callback is provided
  let unsubscribe: (() => void) | undefined;
  if (input.onEvent) {
    unsubscribe = agent.subscribe((event: any) => {
      input.onEvent!(event);
    });
  }

  // Run the loop (prompt → LLM → tool calls → LLM → ... → done)
  console.log(`[agent-runner] Prompting model=${modelId} with ${messages.length} history messages, ${tools.length} tools, ${input.images?.length ?? 0} images`);
  try {
    if (input.images && input.images.length > 0) {
      await agent.prompt(prompt, input.images);
    } else {
      await agent.prompt(prompt);
    }

    // Wait for the agent to fully settle
    await agent.waitForIdle();
  } finally {
    // Always unsubscribe to avoid leaks
    unsubscribe?.();
  }

  // Log all messages after the loop for debugging
  const allMessages = agent.state.messages as any[];

  // Extract the final assistant response text (narrow down from AgentMessage union)
  const lastAssistant = [...allMessages]
    .filter((m: any) => m.role === "assistant" && Array.isArray(m.content))
    .pop() as any;

  if (!lastAssistant) {
    throw new Error("No assistant message found after agent loop");
  }

  // If the model was aborted, return partial content
  if (lastAssistant.stopReason === "aborted") {
    const textBlocks = lastAssistant.content.filter((b: any) => b.type === "text");
    const content = textBlocks.map((b: any) => b.text).join("");
    const usage = lastAssistant.usage ?? {};
    console.log(`[agent-runner] Agent was aborted. Partial content length: ${content.length}`);
    return {
      content,
      promptTokens: usage.input ?? 0,
      completionTokens: usage.output ?? 0,
      aborted: true,
    };
  }

  // If the model returned an error, throw with the error details
  if (lastAssistant.stopReason === "error") {
    const errorMsg = lastAssistant.errorMessage
      ?? "Model returned an error with no text content";
    console.error(`[agent-runner] Model error: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // Concatenate all text blocks — pi-ai stores thinking and text separately
  const textBlocks = lastAssistant.content.filter((b: any) => b.type === "text");
  const thinkingBlocks = lastAssistant.content.filter((b: any) => b.type === "thinking");
  const toolUseBlocks = lastAssistant.content.filter((b: any) => b.type === "tool_use");
  const content = textBlocks.map((b: any) => b.text).join("");

  console.log(`[agent-runner] Done: ${allMessages.length} messages, ${textBlocks.length} text, ${thinkingBlocks.length} thinking, ${toolUseBlocks.length} tool_use`);

  if (content.length === 0) {
    console.warn(`[agent-runner] Empty response: textBlocks=0, thinkingBlocks=${thinkingBlocks.length}, toolUseBlocks=${toolUseBlocks.length}, stopReason=${lastAssistant.stopReason}`);
  }

  const usage = lastAssistant.usage ?? {};

  return {
    content,
    promptTokens: usage.input ?? 0,
    completionTokens: usage.output ?? 0,
  };
}
