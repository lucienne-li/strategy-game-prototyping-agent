import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";

export function resolveWorkspaceFile(workspace: string, requestedPath: string): string {
  const root = realpathSync(workspace);
  if (path.isAbsolute(requestedPath)) {
    throw new Error("absolute paths are not allowed");
  }

  const target = path.resolve(root, requestedPath);
  const relative = path.relative(root, target);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("path must resolve to a file inside the workspace");
  }

  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error("symbolic links are not allowed in workspace file paths");
    }
  }

  return target;
}
