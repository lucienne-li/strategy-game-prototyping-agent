import type { AgentModel, ModelContext, ModelOutput } from "./types.js";

export class FakeHelloAgentModel implements AgentModel {
  async next(context: ModelContext): Promise<ModelOutput> {
    const results = context.events.filter((event) => event.type === "tool_result");

    if (results.length === 0) {
      return {
        type: "tool_call",
        call: {
          tool: "write_file",
          path: "hello-agent.ts",
          content: 'console.log("hello agent");\n'
        }
      };
    }

    if (results.length === 1) {
      if (!results[0].result.ok) {
        return { type: "final", status: "failure", message: `write failed: ${results[0].result.error}` };
      }
      return {
        type: "tool_call",
        call: { tool: "run_command", command: "node", args: ["hello-agent.ts"] }
      };
    }

    const runResult = results.at(-1)?.result;
    if (runResult?.ok && runResult.stdout?.trim() === "hello agent") {
      return { type: "final", status: "success", message: "Created and verified hello-agent.ts." };
    }

    return {
      type: "final",
      status: "failure",
      message: `verification failed: ${runResult?.error ?? runResult?.stderr ?? "unexpected output"}`
    };
  }
}
