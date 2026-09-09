import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { resolveWorkspaceFile } from "../runtime/workspace.js";
import { SessionManager, type WebMode } from "./session-manager.js";
import { createZip } from "./zip.js";

const PUBLIC_ROOT = path.resolve(process.cwd(), "web/public");
const MAX_BODY_BYTES = 32_000;

export function createWebProductServer(manager = new SessionManager()) {
  return createServer(async (request, response) => {
    try {
      await route(request, response, manager);
    } catch (error) {
      if (!response.headersSent) json(response, 500, { error: error instanceof Error ? error.message : "request failed" });
      else response.end();
    }
  });
}

async function route(request: IncomingMessage, response: ServerResponse, manager: SessionManager): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/api/health") return json(response, 200, { ok: true });
  if (request.method === "GET" && url.pathname === "/api/config") return json(response, 200, { liveAvailable: manager.liveAvailable, demoAvailable: true });

  if (request.method === "POST" && url.pathname === "/api/sessions") {
    const payload = await body(request) as { request?: unknown; mode?: unknown };
    if (typeof payload.request !== "string" || payload.request.trim().length < 8 || payload.request.length > 8_000) {
      return json(response, 400, { error: "request must be between 8 and 8000 characters" });
    }
    const mode: WebMode = payload.mode === "live" ? "live" : "demo";
    try {
      const session = await manager.create(payload.request.trim(), mode);
      return json(response, 201, manager.publicView(session));
    } catch (error) {
      return json(response, 409, { error: error instanceof Error ? error.message : "session could not start" });
    }
  }

  const sessionRoute = url.pathname.match(/^\/api\/sessions\/([a-f0-9-]+)(?:\/(events|files|file|visual|download))?$/);
  if (sessionRoute) {
    const session = manager.get(sessionRoute[1]!);
    if (!session) return json(response, 404, { error: "session not found" });
    const action = sessionRoute[2];
    if (request.method === "GET" && !action) return json(response, 200, manager.publicView(session));
    if (request.method === "GET" && action === "events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      response.write(": connected\n\n");
      manager.subscribe(session, response);
      return;
    }
    if (request.method === "GET" && action === "files") return json(response, 200, { files: await manager.files(session) });
    if (request.method === "GET" && action === "file") {
      const filePath = url.searchParams.get("path") ?? "";
      return json(response, 200, { path: filePath, content: await manager.file(session, filePath) });
    }
    if (request.method === "POST" && action === "visual") {
      const result = await body(request) as Record<string, unknown>;
      const passed = result.rendered === true && result.nonBlank === true && result.controlsVisible === true
        && result.noObviousOverflow === true && result.interactionPassed === true;
      manager.reportVisual(session, {
        passed,
        rendered: result.rendered === true,
        nonBlank: result.nonBlank === true,
        controlsVisible: result.controlsVisible === true,
        noObviousOverflow: result.noObviousOverflow === true,
        interactionPassed: result.interactionPassed === true,
        ...(typeof result.error === "string" ? { error: result.error.slice(0, 300) } : {})
      });
      return json(response, 200, { accepted: true });
    }
    if (request.method === "GET" && action === "download") {
      const files = await manager.files(session);
      if (files.length === 0) return json(response, 409, { error: "project is not ready" });
      const zip = await createZip(session.workspace, files);
      response.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="strategy-game-${session.id.slice(0, 8)}.zip"`,
        "content-length": zip.length,
        "cache-control": "no-store"
      });
      response.end(zip);
      return;
    }
    return json(response, 405, { error: "method not allowed" });
  }

  const previewRoute = url.pathname.match(/^\/preview\/([a-f0-9-]+)(?:\/(.*))?$/);
  if (request.method === "GET" && previewRoute) {
    const session = manager.get(previewRoute[1]!);
    if (!session) return text(response, 404, "Preview session not found");
    const relative = decodeURIComponent(previewRoute[2] || "index.html");
    const file = resolveWorkspaceFile(session.workspace, relative);
    const stats = await lstat(file);
    if (!stats.isFile() || stats.isSymbolicLink()) return text(response, 404, "Preview file not found");
    let data: Buffer | string = await readFile(file);
    if (relative === "index.html") data = injectPreviewBridge(data.toString("utf8"), session.id);
    response.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store", "access-control-allow-origin": "*" });
    response.end(data);
    return;
  }

  if (request.method === "GET") {
    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = resolveWorkspaceFile(PUBLIC_ROOT, requested);
    const stats = await lstat(file);
    if (stats.isFile() && !stats.isSymbolicLink()) {
      response.writeHead(200, {
        "content-type": contentType(file),
        "cache-control": requested === "index.html" ? "no-store" : "public, max-age=3600",
        "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; connect-src 'self'"
      });
      response.end(await readFile(file));
      return;
    }
  }
  text(response, 404, "Not found");
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body is too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("request body must be valid JSON");
  }
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function text(response: ServerResponse, status: number, value: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(value);
}

function contentType(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".ts")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "text/plain; charset=utf-8";
}

function injectPreviewBridge(html: string, sessionId: string): string {
  const bridge = `<script>(()=>{const send=(phase)=>{const ids=['player-hp','player-energy','enemy-hp','strike-button'];const elements=ids.map(id=>document.getElementById(id));const visible=elements.every(element=>{if(!element)return false;const box=element.getBoundingClientRect();const style=getComputedStyle(element);return box.width>0&&box.height>0&&box.left>=0&&box.right<=innerWidth&&style.display!=='none'&&style.visibility!=='hidden'});parent.postMessage({type:'strategy-preview-check',sessionId:${JSON.stringify(sessionId)},phase,rendered:Boolean(document.body&&document.body.innerText.trim()),controlsVisible:visible,noObviousOverflow:document.documentElement.scrollWidth<=innerWidth+1,energy:elements[1]?.textContent?.trim(),enemyHp:elements[2]?.textContent?.trim()},'*')};addEventListener('DOMContentLoaded',()=>{setTimeout(()=>{send('before');document.getElementById('strike-button')?.click();setTimeout(()=>send('after'),100)},100)})})()</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${bridge}</body>`) : `${html}${bridge}`;
}
