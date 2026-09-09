import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createWebProductServer } from "../src/web/server.js";

test("Web MVP completes the Demo Mode card vertical slice and downloads a clean ZIP", async (context) => {
  const server = createWebProductServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;

  const home = await fetch(base);
  const html = await home.text();
  assert.equal(home.status, 200);
  assert.match(html, /DEMO MODE/);
  assert.doesNotMatch(html, /OPENAI_API_KEY/);
  assert.match(html, /sandbox="allow-scripts"/);
  assert.doesNotMatch(html, /allow-same-origin/);

  const created = await fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "demo", request: "Create the verified Card Combat demo with a working Strike action." })
  });
  assert.equal(created.status, 201);
  const session = await created.json() as { id: string };

  const files = await waitForFiles(base, session.id);
  assert.deepEqual(files, ["dist/game.js", "index.html", "project.mjs", "src/game.ts"]);
  const preview = await fetch(`${base}/preview/${session.id}/`);
  assert.equal(preview.status, 200);
  const previewHtml = await preview.text();
  assert.match(previewHtml, /strike-button/);
  assert.match(previewHtml, /strategy-preview-check/);
  const module = await fetch(`${base}/preview/${session.id}/dist/game.js`);
  assert.match(await module.text(), /enemyHp - 6/);

  await waitForPreview(base, session.id);
  const visual = await fetch(`${base}/api/sessions/${session.id}/visual`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passed: true, rendered: true, nonBlank: true, controlsVisible: true, noObviousOverflow: true, interactionPassed: true })
  });
  assert.equal(visual.status, 200);

  const completed = await waitForCompletion(base, session.id);
  assert.equal(completed.status, "success");
  assert.equal(completed.mode, "demo");
  assert.equal(completed.evaluation?.passed, true);
  assert.equal(completed.evaluation?.visualPassed, true);
  assert.ok(completed.events.some((event: { label: string }) => event.label === "Preview ready"));
  assert.ok(completed.events.some((event: { label: string }) => event.label === "Complete"));

  const download = await fetch(`${base}/api/sessions/${session.id}/download`);
  const zip = Buffer.from(await download.arrayBuffer());
  assert.equal(download.status, 200);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const archiveText = zip.toString("utf8");
  for (const file of files) assert.match(archiveText, new RegExp(file.replace(".", "\\.")));
  assert.doesNotMatch(archiveText, /OPENAI_API_KEY|b4-evaluator|agent-benchmark/);
  assert.doesNotMatch(archiveText, /strategy-preview-check/);

  const traversal = await fetch(`${base}/preview/${session.id}/%2e%2e%2fREADME.md`);
  assert.notEqual(traversal.status, 200);
  assert.doesNotMatch(await traversal.text(), /Strategy Game Prototyping Agent/);
});

async function waitForFiles(base: string, id: string): Promise<string[]> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${base}/api/sessions/${id}/files`);
    const value = await response.json() as { files: string[] };
    if (value.files.includes("dist/game.js")) return value.files;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("demo files were not generated");
}

async function waitForPreview(base: string, id: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${base}/api/sessions/${id}`);
    const value = await response.json() as { events: Array<{ label: string }> };
    if (value.events.some((event) => event.label === "Preview ready")) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("preview did not become ready");
}

async function waitForCompletion(base: string, id: string): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${base}/api/sessions/${id}`);
    const value = await response.json();
    if (value.status !== "running") return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("demo session did not finish");
}
