import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentModel } from "../src/agent/types.js";
import { evaluateB4 } from "../src/evaluation/b4-evaluator.js";
import { runWithEvaluatorRepair } from "../src/repair/evaluator-repair-loop.js";
import { ToolExecutor } from "../src/runtime/tool-executor.js";
import {
  referenceGame,
  referenceIndex,
  referenceProjectScript,
  writeReferenceProject
} from "./fixtures/b4-reference.js";

const repairTask = "Create the same playable Browser + TypeScript card prototype as B4 and verify its build.";
const brokenGame = referenceGame.replace("enemyHp - 6", "enemyHp - 5");

function createRepairingModel(): AgentModel {
  return {
    async next(context) {
      const isRepair = context.request.includes("External evaluator result:");
      if (!isRepair && context.events.length === 0) {
        return {
          type: "tool_calls",
          calls: [
            { tool: "write_file", path: "index.html", content: referenceIndex },
            { tool: "write_file", path: "src/game.ts", content: brokenGame },
            { tool: "write_file", path: "project.mjs", content: referenceProjectScript },
            { tool: "run_command", command: "node", args: ["project.mjs", "build"] }
          ]
        };
      }
      if (!isRepair) return { type: "final", status: "success", message: "initial candidate built" };

      if (context.events.length === 0) {
        assert.match(context.request, /"passed": false/);
        assert.match(context.request, /enemyHp/);
        return { type: "tool_call", call: { tool: "read_file", path: "src/game.ts" } };
      }
      if (context.events.length === 2) {
        const observation = context.events[1];
        assert.equal(observation?.type, "tool_result");
        if (observation?.type === "tool_result") assert.match(observation.result.content ?? "", /enemyHp - 5/);
        return {
          type: "tool_calls",
          calls: [
            { tool: "write_file", path: "src/game.ts", content: referenceGame },
            { tool: "run_command", command: "node", args: ["project.mjs", "build"] }
          ]
        };
      }
      return { type: "final", status: "success", message: "strike damage repaired and rebuilt" };
    }
  };
}

test("evaluator feedback repairs the intentionally wrong B4 strike damage", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b4-repair-success-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const executor = new ToolExecutor({ workspace, allowedCommands: ["node"] });

  const result = await runWithEvaluatorRepair(repairTask, {
    model: createRepairingModel(),
    executor,
    evaluator: () => evaluateB4(workspace)
  });

  assert.equal(result.status, "success");
  assert.equal(result.repairsUsed, 1);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]?.phase, "initial");
  assert.equal(result.attempts[0]?.agentResult.status, "success");
  assert.equal(result.attempts[0]?.evaluation.passed, false);
  assert.equal(result.attempts[0]?.evaluation.filesValid, true);
  assert.equal(result.attempts[0]?.evaluation.buildArtifactMatches, true);
  assert.match(result.attempts[0]?.evaluation.stderr ?? "", /15/);
  assert.equal(result.attempts[1]?.phase, "repair");
  assert.match(result.attempts[1]?.request ?? "", /External evaluator result/);
  assert.deepEqual(
    result.attempts[1]?.agentResult.events
      .filter((event) => event.type === "tool_call")
      .map((event) => event.call.tool),
    ["read_file", "write_file", "run_command"]
  );
  assert.equal(result.finalEvaluation.passed, true);
  assert.equal(result.finalEvaluation.logicPassed, true);
  assert.equal(result.finalEvaluation.uiPassed, true);
  assert.equal(result.finalEvaluation.launchPassed, true);
  assert.match(await readFile(path.join(workspace, "src/game.ts"), "utf8"), /enemyHp - 6/);
});

test("repair loop preserves every failed attempt and stops at the repair limit", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b4-repair-limit-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  await writeReferenceProject(workspace);
  await writeFile(path.join(workspace, "src/game.ts"), brokenGame, "utf8");
  const executor = new ToolExecutor({ workspace, allowedCommands: ["node"] });
  await executor.execute({ tool: "run_command", command: "node", args: ["project.mjs", "build"] });
  const nonRepairingModel: AgentModel = {
    async next() {
      return { type: "final", status: "success", message: "made no changes" };
    }
  };

  const result = await runWithEvaluatorRepair(repairTask, {
    model: nonRepairingModel,
    executor,
    evaluator: () => evaluateB4(workspace),
    maxRepairs: 1
  });

  assert.equal(result.status, "repair_limit_reached");
  assert.equal(result.repairsUsed, 1);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts.every((attempt) => attempt.evaluation.passed === false), true);
  assert.equal(result.finalEvaluation.passed, false);
});

test("repair loop rejects an invalid maximum repair count", async () => {
  await assert.rejects(
    () =>
      runWithEvaluatorRepair("task", {
        model: createRepairingModel(),
        executor: {} as ToolExecutor,
        evaluator: async () => ({ passed: false }),
        maxRepairs: -1
      }),
    /maxRepairs must be a non-negative integer/
  );
});

test("a controlled initial request does not replace the repair target", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b4-repair-request-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const seenRequests: string[] = [];
  const model = createRepairingModel();
  const recordingModel: AgentModel = {
    async next(modelContext) {
      seenRequests.push(modelContext.request);
      return model.next(modelContext);
    }
  };

  const result = await runWithEvaluatorRepair(repairTask, {
    model: recordingModel,
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
    evaluator: () => evaluateB4(workspace),
    initialRequest: "Create the controlled candidate with the known five-damage defect."
  });

  assert.equal(result.status, "success");
  assert.equal(result.attempts[0]?.request, "Create the controlled candidate with the known five-damage defect.");
  assert.equal(result.attempts[1]?.request.includes(repairTask), true);
  assert.equal(seenRequests[0], "Create the controlled candidate with the known five-damage defect.");
});
