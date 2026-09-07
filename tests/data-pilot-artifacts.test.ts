import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("M6 pilot manifests and JSONL samples pass the offline artifact validator", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, ["data_pipeline/validate-pilot.mjs"], {
    cwd: process.cwd()
  });
  assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(stdout), {
    repositories: 5,
    extractedUnits: 8,
    acceptedSamples: 7,
    rejectedSamples: 1,
    exactDuplicateTargets: 0,
    passed: true
  });
});
