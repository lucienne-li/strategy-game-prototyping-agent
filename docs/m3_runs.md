# M3 B2/B3 Real-Model Runs

## First live run

- **Evidence source:** repository owner local run
- **B2 Agent status:** success
- **B3 Agent status:** success
- **Artifacts:** B2 modified its target file; B3 created its target file
- **External evaluation:** both failed
- **Shared error:** `ERR_ACCESS_DENIED: Access to this API has been restricted. Use --allow-fs-read to manage permissions.`

The failures are classified as evaluator infrastructure failures, not model task failures. The evaluator Node processes were granted the temporary workspace string, but on macOS a path under `/var/...` can resolve to `/private/var/...`. Node's permission check compared against the canonical path and rejected the import.

## Fix

`ToolExecutor` now canonicalizes the workspace with `realpath` before using it as:

- the child process `cwd`;
- `--allow-fs-read`;
- `--allow-fs-write`.

The permission scope remains the single benchmark workspace. Repository files, evaluator source, and other filesystem paths are not added to the allowlist.

## Required rerun

```bash
npm run b2:real
npm run b3:real
```

Record the model, Agent status, iterations, ordered Tool Calls, stdout, stderr, exit code, and external evaluator result for each rerun.
