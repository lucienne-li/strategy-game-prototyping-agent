export type ReadFileCall = {
  tool: "read_file";
  path: string;
};

export type WriteFileCall = {
  tool: "write_file";
  path: string;
  content: string;
};

export type RunCommandCall = {
  tool: "run_command";
  command: string;
  args: string[];
  timeoutMs?: number;
};

export type ToolCall = ReadFileCall | WriteFileCall | RunCommandCall;

export type ToolResult = {
  tool: ToolCall["tool"] | "unknown";
  ok: boolean;
  content?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  error?: string;
};

export type AgentEvent =
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; result: ToolResult };

export type ModelContext = {
  request: string;
  iteration: number;
  events: readonly AgentEvent[];
};

export type ModelOutput =
  | { type: "tool_call"; call: unknown }
  | { type: "final"; status: "success" | "failure"; message: string };

export interface AgentModel {
  next(context: ModelContext): Promise<ModelOutput>;
}

export type AgentRunResult = {
  status: "success" | "failure" | "max_iterations";
  message: string;
  iterations: number;
  events: AgentEvent[];
};
