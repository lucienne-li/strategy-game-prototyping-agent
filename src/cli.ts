import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runAgent } from "./agent/agent-loop.js";
import { FakeHelloAgentModel } from "./agent/fake-model.js";
import { ToolExecutor } from "./runtime/tool-executor.js";

const workspace = path.resolve(process.argv[2] ?? "./agent-workspace");
const request = process.argv.slice(3).join(" ") || "Create a TypeScript file that prints hello agent and verify it.";
await mkdir(workspace, { recursive: true });

const result = await runAgent(request, {
  model: new FakeHelloAgentModel(),
  executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
  maxIterations: 6
});

console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === "success" ? 0 : 1;
