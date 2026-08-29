import type { AgentModel, ModelContext, ModelOutput, ToolCall } from "../agent/types.js";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6";
const DEFAULT_TIMEOUT_MS = 60_000;

type OpenAIResponsesModelOptions = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

type JsonRecord = Record<string, unknown>;

const tools = [
  {
    type: "function",
    name: "read_file",
    description: "Read a UTF-8 text file inside the task workspace.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Workspace-relative file path." } },
      required: ["path"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "write_file",
    description: "Create or replace a UTF-8 text file inside the task workspace.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path." },
        content: { type: "string", description: "Complete file contents." }
      },
      required: ["path", "content"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "run_command",
    description: "Run an allowlisted executable in the task workspace without a shell.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Allowlisted executable name." },
        args: { type: "array", items: { type: "string" }, description: "Argument vector; do not include shell syntax." }
      },
      required: ["command", "args"],
      additionalProperties: false
    },
    strict: true
  }
] as const;

const instructions = [
  "You are a minimal coding agent operating in a temporary task workspace.",
  "Use only the supplied tools and make at most one tool call in each response.",
  "All file paths must be relative to the workspace. The only executable currently allowed is node.",
  "Inspect tool observations before deciding whether the task succeeded.",
  "When the task is complete, respond without a tool call and start the text with SUCCESS:.",
  "If the task cannot be completed, respond without a tool call and start the text with FAILURE:.",
  "Do not claim that execution passed unless an observation provides supporting output and exit code."
].join(" ");

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderContext(context: ModelContext): string {
  return JSON.stringify(
    {
      user_request: context.request,
      iteration: context.iteration,
      event_history: context.events
    },
    null,
    2
  );
}

function parseToolCall(item: JsonRecord): ToolCall {
  const name = item.name;
  if (name !== "read_file" && name !== "write_file" && name !== "run_command") {
    throw new Error(`model requested unsupported tool: ${String(name)}`);
  }
  if (typeof item.arguments !== "string") {
    throw new Error("model tool arguments must be a JSON string");
  }

  let args: unknown;
  try {
    args = JSON.parse(item.arguments);
  } catch {
    throw new Error("model returned invalid JSON tool arguments");
  }
  if (!isRecord(args)) throw new Error("model tool arguments must decode to an object");
  return { tool: name, ...args } as ToolCall;
}

function extractOutputText(output: readonly unknown[]): string | undefined {
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

export class OpenAIResponsesModel implements AgentModel {
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly request: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  private constructor(apiKey: string, modelName: string, request: typeof globalThis.fetch, timeoutMs: number) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  static fromEnv(options: OpenAIResponsesModelOptions = {}): OpenAIResponsesModel {
    const env = options.env ?? process.env;
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    const modelName = env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("model timeout must be a positive integer");
    return new OpenAIResponsesModel(apiKey, modelName, options.fetch ?? globalThis.fetch, timeoutMs);
  }

  async next(context: ModelContext): Promise<ModelOutput> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;

    try {
      response = await this.request(RESPONSES_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.modelName,
          instructions,
          input: [{ role: "user", content: [{ type: "input_text", text: renderContext(context) }] }],
          tools,
          tool_choice: "auto"
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`OpenAI request timed out after ${this.timeoutMs} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const details = (await response.text()).replaceAll(this.apiKey, "[REDACTED]").replace(/\s+/g, " ").slice(0, 500);
      throw new Error(`OpenAI API returned ${response.status}${details ? `: ${details}` : ""}`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.output)) {
      throw new Error("OpenAI response is missing the output array");
    }

    const functionCalls = payload.output.filter(
      (item): item is JsonRecord => isRecord(item) && item.type === "function_call"
    );
    if (functionCalls.length > 1) {
      throw new Error("model returned multiple tool calls; M2 supports one call per iteration");
    }
    if (functionCalls.length === 1) {
      return { type: "tool_call", call: parseToolCall(functionCalls[0]) };
    }

    const text = extractOutputText(payload.output)?.trim();
    if (!text) throw new Error("OpenAI response contained neither a tool call nor final text");
    if (text.startsWith("SUCCESS:")) return { type: "final", status: "success", message: text.slice(8).trim() };
    if (text.startsWith("FAILURE:")) return { type: "final", status: "failure", message: text.slice(8).trim() };
    throw new Error("final model response must begin with SUCCESS: or FAILURE:");
  }
}
