import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { B4_REQUIRED_FILES, B4_REQUEST } from "../src/evaluation/b4-evaluator.js";
import { B2_FILE_NAME, B2_REQUEST } from "../src/evaluation/b2-evaluator.js";
import { B3_FILE_NAME, B3_REQUEST } from "../src/evaluation/b3-evaluator.js";
import { B4_REPAIR_TARGET_REQUEST } from "../src/evaluation/b4-repair-benchmark.js";

type TaskFixture = { request: string; targetFile: string };
type B4TaskFixture = { request: string; requiredFiles: string[] };
type B4RepairTaskFixture = {
  targetRequest: string;
  initialRequest: string;
  failureInjection: { actualEnemyHpAfterStrike: number };
};

async function loadFixture(path: string): Promise<TaskFixture> {
  return JSON.parse(await readFile(path, "utf8")) as TaskFixture;
}

test("B2 and B3 executable contracts match their repository fixtures", async () => {
  const b2 = await loadFixture("benchmarks/b2/task.json");
  assert.equal(b2.request, B2_REQUEST);
  assert.equal(b2.targetFile, B2_FILE_NAME);

  const b3 = await loadFixture("benchmarks/b3/task.json");
  assert.equal(b3.request, B3_REQUEST);
  assert.equal(b3.targetFile, B3_FILE_NAME);
});

test("B4 executable contract matches its repository fixture", async () => {
  const fixture = JSON.parse(await readFile("benchmarks/b4/task.json", "utf8")) as B4TaskFixture;
  assert.equal(fixture.request, B4_REQUEST);
  assert.deepEqual(fixture.requiredFiles, [...B4_REQUIRED_FILES]);
});

test("B4 repair variant freezes the intentional first-attempt defect", async () => {
  const fixture = JSON.parse(await readFile("benchmarks/b4-repair/task.json", "utf8")) as B4RepairTaskFixture;
  assert.equal(fixture.targetRequest, B4_REPAIR_TARGET_REQUEST);
  assert.match(fixture.initialRequest, /deliberately deals 5 damage/);
  assert.equal(fixture.failureInjection.actualEnemyHpAfterStrike, 15);
});
