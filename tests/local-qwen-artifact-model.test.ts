import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAgent } from "../src/agent/agent-loop.js";
import { ScaffoldedArtifactAgentModel, type ArtifactGenerator } from "../src/model/local-qwen-artifact-model.js";
import { ToolExecutor } from "../src/runtime/tool-executor.js";

test("artifact scaffold maps one model artifact to existing ordered tools", async () => {
  const generator: ArtifactGenerator = { async generate() { return { files: [
    { path: "src/game.ts", content: "export const hp = 20;\n" },
    { path: "project.mjs", content: "import{mkdir,copyFile}from'node:fs/promises';await mkdir('dist',{recursive:true});await copyFile('src/game.ts','dist/game.js');\n" }
  ] }; } };
  const workspace = await mkdtemp(path.join(os.tmpdir(), "artifact-model-"));
  const result = await runAgent("create a project", { model: new ScaffoldedArtifactAgentModel(generator),
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }), maxIterations: 4, maxToolCallsPerIteration: 8 });
  assert.equal(result.status, "success");
  assert.deepEqual(result.events.filter((event) => event.type === "tool_call").map((event) => event.call.tool),
    ["write_file", "write_file", "run_command"]);
  assert.equal(await readFile(path.join(workspace, "dist/game.js"), "utf8"), "export const hp = 20;\n");
});

test("artifact scaffold reads an existing modification target before generation", async () => {
  let observed = "";
  const generator: ArtifactGenerator = { async generate(_request, files) {
    observed = files[0]?.content ?? "";
    return { files: [{ path: "energy.ts", content: "export const energy = 2;\n" }] };
  } };
  const workspace = await mkdtemp(path.join(os.tmpdir(), "artifact-modification-"));
  const executor = new ToolExecutor({ workspace, allowedCommands: ["node"] });
  await executor.execute({ tool: "write_file", path: "energy.ts", content: "export const energy = 3;\n" });
  const result = await runAgent("Read energy.ts and reduce energy.", { model: new ScaffoldedArtifactAgentModel(generator),
    executor, maxIterations: 4, maxToolCallsPerIteration: 8 });
  assert.equal(result.status, "success");
  assert.equal(observed, "export const energy = 3;\n");
  assert.deepEqual(result.events.filter((event) => event.type === "tool_call").map((event) => event.call.tool), ["read_file", "write_file"]);
});
