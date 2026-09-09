import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateB4 } from "../src/evaluation/b4-evaluator.js";
import { passingVisualEvaluator, writeReferenceProject } from "./fixtures/b4-reference.js";

const evaluateReferenceB4 = (workspace: string) => evaluateB4(workspace, { visualEvaluator: passingVisualEvaluator });

test("B4 evaluator rejects a missing project", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b4-missing-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));

  const evaluation = await evaluateReferenceB4(workspace);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.filesValid, false);
});

test("B4 evaluator verifies build output, card logic, UI interaction, and HTTP launch", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b4-evaluator-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  await writeReferenceProject(workspace);

  const evaluation = await evaluateReferenceB4(workspace);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.filesValid, true);
  assert.equal(evaluation.buildArtifactMatches, true);
  assert.equal(evaluation.logicPassed, true);
  assert.equal(evaluation.uiPassed, true);
  assert.equal(evaluation.launchPassed, true);
  assert.equal(evaluation.visualPassed, true);
  assert.equal(evaluation.stdout.trim(), "M4 evaluator passed");
  assert.equal(evaluation.stderr, "");
  assert.equal(evaluation.exitCode, 0);
});

test("B4 evaluator does not downgrade a failed visual interaction to a pass", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b4-visual-failure-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  await writeReferenceProject(workspace);
  const evaluation = await evaluateB4(workspace, {
    visualEvaluator: async () => ({
      passed: false,
      rendered: true,
      nonBlank: true,
      controlsVisible: true,
      noObviousOverflow: true,
      interactionPassed: false,
      error: "interaction state did not change"
    })
  });
  assert.equal(evaluation.launchPassed, true);
  assert.equal(evaluation.visualPassed, false);
  assert.equal(evaluation.passed, false);
  assert.match(evaluation.error ?? "", /interaction state/);
});

test("B4 evaluator rejects a stale or fabricated build artifact", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b4-stale-build-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  await writeReferenceProject(workspace);
  await writeFile(path.join(workspace, "dist/game.js"), "export const stale = true;\n", "utf8");

  const evaluation = await evaluateReferenceB4(workspace);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.filesValid, true);
  assert.equal(evaluation.buildArtifactMatches, false);
});

test("B4 evaluator rejects a project whose generated server cannot launch", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b4-launch-failure-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  await writeReferenceProject(workspace);
  await writeFile(path.join(workspace, "project.mjs"), "throw new Error('server broken');\n", "utf8");

  const evaluation = await evaluateReferenceB4(workspace);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.logicPassed, true);
  assert.equal(evaluation.uiPassed, true);
  assert.equal(evaluation.launchPassed, false);
  assert.match(evaluation.error ?? "", /server broken/);
});

test("B4 launch may rebuild dist but cannot write outside the workspace", async (context) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "agent-b4-launch-boundary-"));
  context.after(() => rm(parent, { recursive: true, force: true }));
  const workspace = path.join(parent, "workspace");
  await mkdir(workspace);
  await writeReferenceProject(workspace);
  await writeFile(
    path.join(workspace, "project.mjs"),
    [
      "import { writeFile } from 'node:fs/promises';",
      "await writeFile('../outside.txt', 'denied');"
    ].join("\n"),
    "utf8"
  );

  const evaluation = await evaluateReferenceB4(workspace);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.logicPassed, true);
  assert.equal(evaluation.uiPassed, true);
  assert.equal(evaluation.launchPassed, false);
  assert.match(evaluation.error ?? "", /ERR_ACCESS_DENIED/);
  await assert.rejects(() => access(path.join(parent, "outside.txt")), /ENOENT/);
});
