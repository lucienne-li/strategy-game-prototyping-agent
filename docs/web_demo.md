# Web Product MVP

## Purpose

The Web MVP adds a Bolt-style presentation layer around the existing Strategy Game Agent Runtime. It does not replace or fork the validated Model Adapter, Agent Loop, ToolExecutor, external evaluator, or evaluator-feedback repair loop.

## Bolt.new review and reuse boundary

The official `stackblitz/bolt.new` repository was reviewed at its current public `main` branch. It is MIT licensed. Its `Preview`, `FileTree`, `WorkbenchStore`, `FilesStore`, and terminal components depend on a Remix/React application, Nanostores, CodeMirror, WebContainer, Bolt's ActionRunner, and its message protocol.

Directly copying those modules would require replacing this repository's server-side workspace and execution boundary. The MVP therefore reuses Bolt's product patterns—not its Agent logic or a verbatim source module:

- two-pane Chat + Workbench layout;
- Preview/Files tabs and iframe refresh/address behavior;
- collapsible workbench-style file navigation reduced to a read-only file list;
- high-level action/progress stream instead of chain-of-thought;
- terminal-like observation summary.

The implementation is original and dependency-light. Bolt's model routes, MessageParser, ActionRunner, WorkbenchStore, WebContainer-backed FilesStore, CodeMirror editor, deployment integrations, and provider logic are bypassed. If browser-side execution becomes a measured product requirement later, WebContainer can be reconsidered separately.

Source reviewed: <https://github.com/stackblitz/bolt.new>. License: MIT, Copyright © 2024 StackBlitz, Inc.

## Local run

```bash
npm install
npm --prefix web start
```

Open <http://localhost:3000>.

Without `OPENAI_API_KEY`, only the clearly labeled **Demo Mode** is enabled. It runs a deterministic model through the existing Agent Loop and tools to create the verified Card Combat project. It does not represent a live model call.

To enable live generation:

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.6"
npm --prefix web start
```

The key is read only by the server-side `OpenAIResponsesModel`. `/api/config` exposes only whether live mode is available.

## Product flow

1. `POST /api/sessions` creates an isolated temporary workspace.
2. A reporting adapter wraps the existing Model and ToolExecutor and maps safe lifecycle/tool summaries to SSE; it never exposes chain-of-thought.
3. The existing Agent Loop creates files and runs `node project.mjs build`.
4. The existing B4 external evaluator checks the files, build artifact, logic, DOM contract, and launch behavior.
5. `/preview/:sessionId/` serves generated files into a sandboxed iframe. A server-injected bridge, which is not part of the generated project or ZIP, checks render/layout and performs one Strike interaction. The server derives `passed` from all check fields rather than trusting a client-provided aggregate.
6. Files can be inspected through read-only endpoints. Download creates an in-memory ZIP from generated workspace files only; dotfiles, dependencies, evaluator source, logs, secrets, and internal artifacts are never copied into the workspace or archive.

## Deployment

`Dockerfile` and `render.yaml` provide the smallest deployment path for a stateful Node/container service. Sessions use ephemeral `/tmp` workspaces, which is sufficient for the MVP but not durable storage.

On Render:

1. Create a new Blueprint and select this GitHub repository and `feature/web-product` while reviewing the feature branch; use `main` after the branch is merged.
2. Render detects `render.yaml` and builds the Docker service.
3. Leave `OPENAI_API_KEY` unset for Demo Mode, or add it as a secret environment variable to enable Live Model mode.
4. Open the generated `onrender.com` URL and run the Card Combat acceptance flow.

No browser bundle or API response contains the key. Do not commit a `.env` file.
