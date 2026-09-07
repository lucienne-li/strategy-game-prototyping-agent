import type { AgentEvent, AgentModel, AgentRunResult } from "./types.js";
import { ToolExecutor } from "../runtime/tool-executor.js";

export type AgentLoopOptions = {
  model: AgentModel;
  executor: ToolExecutor;
  maxIterations?: number;
  maxToolCallsPerIteration?: number;
};

export async function runAgent(request: string, options: AgentLoopOptions): Promise<AgentRunResult> {
  const maxIterations = options.maxIterations ?? 6;
  const maxToolCallsPerIteration = options.maxToolCallsPerIteration ?? 8;
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error("maxIterations must be a positive integer");
  }
  if (!Number.isInteger(maxToolCallsPerIteration) || maxToolCallsPerIteration < 1) {
    throw new Error("maxToolCallsPerIteration must be a positive integer");
  }

  const events: AgentEvent[] = [];

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    let output;
    try {
      output = await options.model.next({ request, iteration, events });
    } catch (error) {
      return {
        status: "failure",
        message: error instanceof Error ? `model error: ${error.message}` : "model error",
        iterations: iteration,
        events
      };
    }

    if (output.type === "final") {
      return {
        status: output.status,
        message: output.message,
        iterations: iteration,
        events
      };
    }

    const calls = output.type === "tool_calls" ? output.calls : [output.call];
    if (calls.length === 0) {
      events.push({
        type: "tool_result",
        result: { tool: "unknown", ok: false, error: "model returned an empty tool call batch" }
      });
      continue;
    }
    if (calls.length > maxToolCallsPerIteration) {
      events.push({
        type: "tool_result",
        result: {
          tool: "unknown",
          ok: false,
          error: `model returned ${calls.length} tool calls; limit is ${maxToolCallsPerIteration} per iteration`
        }
      });
      continue;
    }

    for (const call of calls) {
      const execution = await options.executor.execute(call);
      if (execution.call) events.push({ type: "tool_call", call: execution.call });
      events.push({ type: "tool_result", result: execution.result });
    }
  }

  return {
    status: "max_iterations",
    message: `agent stopped after reaching the ${maxIterations} iteration limit`,
    iterations: maxIterations,
    events
  };
}
