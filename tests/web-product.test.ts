import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createWebProductServer } from "../src/web/server.js";

test("Web learning activity builds, validates with a simulated browser report, and downloads a clean ZIP", async (context) => {
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
  assert.match(html, /GUIDED PRACTICE/);
  assert.match(html, /Python · Training/);
  assert.match(html, /Learning goal/);
  assert.doesNotMatch(html, /OPENAI_API_KEY/);
  assert.match(html, /sandbox="allow-scripts"/);
  assert.doesNotMatch(html, /allow-same-origin/);

  for (const body of [{mode:'demo',request:''},{mode:'unknown',request:'An activity request'}]) {
    const invalid = await fetch(`${base}/api/sessions`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal(invalid.status,400);
  }
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
  assert.doesNotMatch(previewHtml, /strategy-preview-check/);
  assert.match(previewHtml, /Check prediction/);
  assert.match(previewHtml, /Restart round/);
  const checkPreview = await fetch(`${base}/preview/${session.id}/?check=1`);
  assert.match(await checkPreview.text(), /strategy-preview-check/);
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

test('learning activity validates predictions, explains exhausted energy, and restarts cleanly', async () => {
  const { DEMO_GAME } = await import('../src/web/demo-project.js');
  const game = await import(`data:text/javascript;base64,${Buffer.from(DEMO_GAME).toString('base64')}`);
  const ids = ['player-hp','player-energy','enemy-hp','strike-button','battle-log','restart-button','prediction','prediction-feedback','check-prediction','reflection'];
  const listeners = new Map<string, () => void>();
  const elements = new Map(ids.map(id => [id, {
    textContent:'', value:'', disabled:false, attributes: new Map<string,string>(),
    addEventListener(type: string, callback: () => void) { listeners.set(`${id}:${type}`,callback); },
    setAttribute(name: string,value: string) { this.attributes.set(name,value); },
    removeAttribute(name: string) { this.attributes.delete(name); }, focus() {}
  }]));
  game.mountGame({getElementById:(id: string) => elements.get(id)});
  const check = listeners.get('check-prediction:click')!;
  const prediction = elements.get('prediction')!;
  const feedback = elements.get('prediction-feedback')!;
  for (const value of ['', '-1','21','1.5']) {
    prediction.value = value; check();
    assert.match(feedback.textContent,/whole number from 0 to 20/);
    assert.equal(prediction.attributes.get('aria-invalid'),'true');
  }
  prediction.value = '0'; check(); assert.match(feedback.textContent,/Not quite/);
  prediction.value = '2'; check(); assert.match(feedback.textContent,/Correct/);
  const strike = listeners.get('strike-button:click')!;
  strike(); strike(); strike(); strike();
  assert.equal(elements.get('enemy-hp')!.textContent,'2');
  assert.equal(elements.get('player-energy')!.textContent,'0');
  assert.equal(elements.get('strike-button')!.disabled,true);
  assert.match(elements.get('battle-log')!.textContent,/Round complete/);
  elements.get('reflection')!.value='My reflection';
  listeners.get('restart-button:click')!();
  assert.equal(elements.get('player-energy')!.textContent,'3');
  assert.equal(elements.get('enemy-hp')!.textContent,'20');
  assert.equal(elements.get('strike-button')!.disabled,false);
  assert.equal(elements.get('reflection')!.value,'');
  assert.equal(prediction.value,'');
  assert.equal(feedback.textContent,'');
});
