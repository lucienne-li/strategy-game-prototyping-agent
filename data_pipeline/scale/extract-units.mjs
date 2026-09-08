import crypto from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const checkoutRoot = path.resolve(required(args, "checkout-root"));
const repositoryManifest = path.resolve(args.repositories ?? "data_pipeline/scale/repositories.jsonl");
const output = path.resolve(args.output ?? "data_pipeline/scale/units.jsonl");
const limitPerRepo = Number(args["limit-per-repo"] ?? 36);
const targetTotal = Number(args.target ?? 500);
const repositories = parseJsonl(await readFile(repositoryManifest, "utf8")).filter((item) => item.status === "accepted");
const seenTargets = new Set();
const all = [];

for (const repository of repositories) {
  const root = path.join(checkoutRoot, repository.checkout);
  const files = await findTypeScriptFiles(root);
  const candidates = [];
  for (const filename of files) {
    const sourceText = await readFile(filename, "utf8");
    for (const extracted of extractUnits(sourceText)) {
      const relative = path.relative(root, filename).split(path.sep).join("/");
      const score = relevanceScore(`${relative} ${extracted.name} ${extracted.code}`, repository.category);
      if (score < 2) continue;
      const normalized = normalize(extracted.code);
      const digest = sha256(normalized);
      if (seenTargets.has(digest)) continue;
      const start = lineAt(sourceText, extracted.start);
      const end = lineAt(sourceText, extracted.end);
      candidates.push({ ...extracted, relative, start, end, score, digest, normalized });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.code.length - b.code.length || a.relative.localeCompare(b.relative));
  for (const unit of candidates.slice(0, limitPerRepo)) {
    seenTargets.add(unit.digest);
    all.push({
      schema_version: "1.0",
      unit_id: `scale-${slug(repository.repo)}-${String(all.length + 1).padStart(4, "0")}`,
      repository: repository.repo,
      repository_family_id: repository.family_id,
      category: repository.category,
      commit: repository.commit,
      license: repository.license.spdx_id,
      source_path: unit.relative,
      source_lines: `${unit.start}-${unit.end}`,
      symbol: unit.name,
      kind: unit.kind,
      granularity: unit.kind === "class" ? "G2" : "G1",
      signature: unit.signature,
      provided_symbols: referencedSymbols(unit.code, unit.name),
      relevance_score: unit.score,
      target_sha256: sha256(unit.code.trim()),
      target: unit.code.trim() + "\n"
    });
  }
}

const selected = all.sort((a, b) => b.relevance_score - a.relevance_score || a.unit_id.localeCompare(b.unit_id)).slice(0, targetTotal);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, selected.map((item) => JSON.stringify(item)).join("\n") + "\n", "utf8");
const byRepo = Object.fromEntries(repositories.map((repo) => [repo.repo, selected.filter((unit) => unit.repository === repo.repo).length]));
console.log(JSON.stringify({ accepted_repositories: repositories.length, extracted: all.length, selected: selected.length, by_repo: byRepo, output }, null, 2));

function extractUnits(sourceText) {
  const result = [];
  const pattern = /(?:^|\n)([ \t]*(?:(?:export|default|declare|abstract)\s+)*(?:(?:async)\s+)?(?:function\s+([A-Za-z_$][\w$]*)\s*[^;{]*|class\s+([A-Za-z_$][\w$]*)[^;{]*)\{)/gm;
  for (const match of sourceText.matchAll(pattern)) {
    const declaration = match[1];
    const name = match[2] ?? match[3];
    const kind = match[2] ? "function" : "class";
    const declarationStart = match.index + match[0].indexOf(declaration);
    const open = declarationStart + declaration.lastIndexOf("{");
    const close = matchingBrace(sourceText, open);
    if (close < 0) continue;
    const code = sourceText.slice(declarationStart, close + 1).trim();
    const lines = code.split("\n").length;
    if (code.length < 100 || code.length > 3000 || lines < 4 || lines > 100) continue;
    if (/\b(TODO|FIXME|throw new Error\(["']not implemented)/i.test(code)) continue;
    result.push({ name, kind, signature: declaration.slice(0, declaration.lastIndexOf("{")).replace(/\s+/g, " ").trim().slice(0, 500), code, start: declarationStart, end: close });
  }
  return result;
}

function matchingBrace(text, open) {
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index++; } continue; }
    if (quote) {
      if (char === "\\") { index++; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index++; continue; }
    if (char === "/" && next === "*") { blockComment = true; index++; continue; }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    if (char === "}" && --depth === 0) return index;
  }
  return -1;
}

function relevanceScore(text, category) {
  const lower = text.toLowerCase();
  const common = ["game", "player", "enemy", "turn", "round", "damage", "health", "score", "move", "position", "target", "attack", "action", "state", "random"];
  const card = ["card", "deck", "hand", "draw", "discard", "shuffle", "mana", "energy"];
  const tactics = ["grid", "tile", "path", "unit", "range", "distance", "neighbor", "battle", "combat"];
  const tower = ["tower", "wave", "projectile", "creep", "spawn", "cooldown", "upgrade", "defense"];
  let score = common.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
  const specific = category === "card" ? card : category === "tactics" ? tactics : tower;
  score += 2 * specific.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
  return score;
}

function referencedSymbols(code, ownName) {
  const identifiers = code.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
  const ignored = new Set([ownName, "const", "let", "var", "function", "class", "return", "if", "else", "for", "while", "new", "this", "true", "false", "null", "undefined", "number", "string", "boolean", "void", "export", "default", "public", "private", "protected", "static", "readonly", "async", "await", "Math", "Array", "Object", "String", "Number", "Set", "Map", "Promise"]);
  return [...new Set(identifiers.filter((name) => /^[A-Z]/.test(name) && !ignored.has(name)))].slice(0, 12);
}

async function findTypeScriptFiles(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist", "build", "coverage", "vendor", "generated"].includes(entry.name)) continue;
      const item = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(item);
      else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") && !/\.(test|spec)\.ts$/.test(entry.name) && !/config/i.test(entry.name)) result.push(item);
    }
  }
  if ((await stat(root)).isDirectory()) await visit(root);
  return result;
}

function normalize(value) { return value.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim(); }
function lineAt(value, offset) { return value.slice(0, offset).split("\n").length; }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function parseJsonl(value) { return value.split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
function required(values, name) { if (!values[name]) throw new Error(`--${name} is required`); return values[name]; }
function parseArgs(values) { const result = {}; for (let i = 0; i < values.length; i += 2) result[values[i].replace(/^--/, "")] = values[i + 1]; return result; }
