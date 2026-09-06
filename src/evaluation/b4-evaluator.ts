import { lstat, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { ToolExecutor } from "../runtime/tool-executor.js";

export const B4_REQUIRED_FILES = ["index.html", "src/game.ts", "project.mjs", "dist/game.js"] as const;
export const B4_REQUEST = [
  "Create a complete no-dependency Browser + TypeScript card prototype in the empty workspace.",
  "Create index.html with visible values whose element IDs are player-hp, player-energy, and enemy-hp, plus a button with ID strike-button.",
  "Create src/game.ts as browser-compatible TypeScript that exports createInitialState(), strike(state), and mountGame(document).",
  "Initial state is playerHp 20, playerEnergy 3, enemyHp 20. One Strike costs 1 energy and deals 6 enemy damage.",
  "mountGame must render the initial values and update the displayed energy and enemy HP when strike-button is clicked.",
  "Create project.mjs with build and serve modes. Build copies the browser-compatible TypeScript to dist/game.js. Serve hosts index.html and dist/game.js over HTTP; use PORT or 4173.",
  "index.html must load ./dist/game.js as a module. The source module may auto-mount in a real browser but must remain importable without a global document.",
  "Run node project.mjs build and inspect its observation before finishing. Use only the requested three source files; dist/game.js must be produced by the build."
].join(" ");

export type B4Evaluation = {
  passed: boolean;
  filesValid: boolean;
  buildArtifactMatches: boolean;
  logicPassed: boolean;
  uiPassed: boolean;
  launchPassed: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
};

export async function evaluateB4(workspace: string): Promise<B4Evaluation> {
  try {
    await assertRegularFiles(workspace);
    const [html, source, built] = await Promise.all([
      readFile(path.join(workspace, "index.html"), "utf8"),
      readFile(path.join(workspace, "src/game.ts"), "utf8"),
      readFile(path.join(workspace, "dist/game.js"), "utf8")
    ]);
    const buildArtifactMatches = source === built;
    if (!buildArtifactMatches) return failure("dist/game.js does not match src/game.ts", true, false);

    const evaluatorScript = createEvaluatorScript(html);
    const result = (
      await new ToolExecutor({ workspace, allowedCommands: ["node"], nodeFsAccess: "read-only" }).execute({
        tool: "run_command",
        command: "node",
        args: ["--input-type=module", "-e", evaluatorScript],
        timeoutMs: 10_000
      })
    ).result;
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    const behaviorPassed = result.ok && result.exitCode === 0 && stdout.trim() === "M4 evaluator passed" && stderr === "";
    if (!behaviorPassed) {
      return {
        passed: false,
        filesValid: true,
        buildArtifactMatches: true,
        logicPassed: false,
        uiPassed: false,
        launchPassed: false,
        stdout,
        stderr,
        exitCode: result.exitCode ?? null,
        error: result.error ?? "M4 behavior did not satisfy the contract"
      };
    }
    const launch = await verifyGeneratedServer(workspace);
    return {
      passed: launch.passed,
      filesValid: true,
      buildArtifactMatches: true,
      logicPassed: true,
      uiPassed: true,
      launchPassed: launch.passed,
      stdout,
      stderr,
      exitCode: result.exitCode ?? null,
      ...(launch.passed ? {} : { error: launch.error })
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : "M4 evaluation failed");
  }
}

async function assertRegularFiles(workspace: string): Promise<void> {
  for (const relativePath of B4_REQUIRED_FILES) {
    const stats = await lstat(path.join(workspace, relativePath));
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`${relativePath} must be a regular file`);
  }
}

function createEvaluatorScript(html: string): string {
  return [
    "import assert from 'node:assert/strict';",
    "const game = await import('./dist/game.js');",
    "assert.equal(typeof game.createInitialState, 'function');",
    "assert.equal(typeof game.strike, 'function');",
    "assert.equal(typeof game.mountGame, 'function');",
    "const initial = game.createInitialState();",
    "assert.deepEqual(initial, { playerHp: 20, playerEnergy: 3, enemyHp: 20 });",
    "assert.deepEqual(game.strike(initial), { playerHp: 20, playerEnergy: 2, enemyHp: 14 });",
    "const listeners = new Map();",
    "const elements = new Map(['player-hp','player-energy','enemy-hp','strike-button'].map((id) => [id, { textContent: '', disabled: false, addEventListener(type, listener) { listeners.set(`${id}:${type}`, listener); } }]));",
    "const fakeDocument = { getElementById(id) { return elements.get(id) ?? null; } };",
    "game.mountGame(fakeDocument);",
    "assert.equal(elements.get('player-hp').textContent, '20');",
    "assert.equal(elements.get('player-energy').textContent, '3');",
    "assert.equal(elements.get('enemy-hp').textContent, '20');",
    "const click = listeners.get('strike-button:click');",
    "assert.equal(typeof click, 'function');",
    "click();",
    "assert.equal(elements.get('player-hp').textContent, '20');",
    "assert.equal(elements.get('player-energy').textContent, '2');",
    "assert.equal(elements.get('enemy-hp').textContent, '14');",
    `const expectedHtml = ${JSON.stringify(html)};`,
    "for (const id of ['player-hp','player-energy','enemy-hp','strike-button']) assert.match(expectedHtml, new RegExp(`id\\\\s*=\\\\s*[\\\"']${id}[\\\"']`));",
    "const moduleTag = expectedHtml.match(/<script\\b[^>]*>/gi)?.find((tag) => /src\\s*=\\s*[\"']\\.\\/dist\\/game\\.js[\"']/i.test(tag));",
    "assert.ok(moduleTag); assert.match(moduleTag, /type\\s*=\\s*[\"']module[\"']/i);",
    "console.log('M4 evaluator passed');"
  ].join("\n");
}

async function verifyGeneratedServer(workspace: string): Promise<{ passed: boolean; error?: string }> {
  const canonicalWorkspace = realpathSync(workspace);
  const port = await reservePort();
  const child = spawn(
    process.execPath,
    ["--permission", `--allow-fs-read=${canonicalWorkspace}`, "project.mjs", "serve"],
    {
      cwd: canonicalWorkspace,
      shell: false,
      env: { PATH: process.env.PATH ?? "", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-2_000);
  });

  try {
    const base = `http://127.0.0.1:${port}`;
    let lastError = "server did not become reachable";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        const page = await fetch(`${base}/`);
        const moduleResponse = await fetch(`${base}/dist/game.js`);
        const pageText = await page.text();
        const moduleText = await moduleResponse.text();
        if (page.status === 200 && moduleResponse.status === 200 && pageText.includes("strike-button") && moduleText.includes("mountGame")) {
          return { passed: true };
        }
        lastError = `unexpected HTTP response: page=${page.status}, module=${moduleResponse.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { passed: false, error: stderr.trim() || lastError };
  } finally {
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once("close", () => resolve());
    });
  }
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to reserve evaluator port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function failure(error: string, filesValid = false, buildArtifactMatches = false): B4Evaluation {
  return {
    passed: false,
    filesValid,
    buildArtifactMatches,
    logicPassed: false,
    uiPassed: false,
    launchPassed: false,
    stdout: "",
    stderr: "",
    exitCode: null,
    error
  };
}
