import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const input = path.resolve(args.input ?? "data_pipeline/scale/units.jsonl");
const output = path.resolve(args.output ?? "data_pipeline/scale/target-validation-v2.jsonl");
const units = parseJsonl(await readFile(input, "utf8"));
const results = units.map(validateTarget);
await writeFile(output, results.map((item) => JSON.stringify(item)).join("\n") + "\n", "utf8");
console.log(JSON.stringify({
  units: results.length,
  syntaxPassed: results.filter((item) => item.syntax === "pass").length,
  symbolPassed: results.filter((item) => item.symbol === "pass").length,
  behaviorPassed: results.filter((item) => item.behavior === "pass").length,
  behaviorNotEligible: results.filter((item) => item.behavior === "not_eligible").length,
}, null, 2));

function validateTarget(unit) {
  const syntaxErrors = delimiterErrors(unit.target);
  const declaration = new RegExp(`\\b(?:function|class)\\s+${escapeRegex(unit.symbol)}\\b`).test(unit.target);
  const result = {
    unit_id: unit.unit_id,
    target_sha256: unit.target_sha256,
    validator: "balanced-syntax-and-narrow-execution-v1",
    syntax: syntaxErrors.length === 0 ? "pass" : "fail",
    symbol: declaration ? "pass" : "fail",
    behavior: "not_eligible",
    reasons: [...syntaxErrors.map((error) => `syntax: ${error}`), ...(declaration ? [] : ["declared target symbol not found"])],
  };
  if (!declaration || syntaxErrors.length > 0) return result;

  // Execute only zero-argument functions whose body is a single literal return.
  // This is deliberately narrow: untrusted repository code is never broadly executed.
  const literal = unit.target.match(/\bfunction\s+\w+\s*\(\s*\)[^{]*\{\s*return\s+([\s\S]*?)\s*;?\s*\}\s*$/);
  if (literal) {
    const expression = literal[1].replace(/;\s*$/, "").trim();
    if (!isSafeLiteralExpression(expression)) return result;
    const expectedExecution = spawnSync(process.execPath, ["--permission", "-e", `console.log(JSON.stringify(${expression}))`], {
      encoding: "utf8", timeout: 1000, env: {},
    });
    if (expectedExecution.status !== 0 || expectedExecution.stderr !== "") return result;
    const functionExecution = spawnSync(process.execPath, ["--permission", "-e", `${unit.target.replace(/^\s*export\s+/, "")}\nconsole.log(JSON.stringify(${unit.symbol}()))`], {
      encoding: "utf8", timeout: 1000, env: {},
    });
    if (expectedExecution.status === 0 && functionExecution.status === 0 && functionExecution.stdout === expectedExecution.stdout && functionExecution.stderr === "") {
      result.behavior = "pass";
      result.behavior_test = { kind: "zero_argument_literal_or_object_return", expected_json: JSON.parse(expectedExecution.stdout) };
    } else {
      result.behavior = "fail";
      result.reasons.push(`deterministic behavior harness failed: ${functionExecution.error?.message ?? functionExecution.stderr.trim()}`);
    }
  }
  return result;
}

function delimiterErrors(source) {
  const stack = [];
  const pairs = { ")": "(", "]": "[", "}": "{" };
  let quote = null, lineComment = false, blockComment = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i], next = source[i + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i++; } continue; }
    if (quote) { if (char === "\\") { i++; continue; } if (char === quote) quote = null; continue; }
    if (char === "/" && next === "/") { lineComment = true; i++; continue; }
    if (char === "/" && next === "*") { blockComment = true; i++; continue; }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if ("([{".includes(char)) stack.push(char);
    else if (")]}".includes(char) && stack.pop() !== pairs[char]) return [`unbalanced delimiter ${char}`];
  }
  return stack.length ? ["unclosed delimiter"] : quote ? ["unclosed string"] : blockComment ? ["unclosed comment"] : [];
}
function isSafeLiteralExpression(source) { return !/[();`]|\b(?:new|this|function|class|await|yield|global|process|require|import)\b/.test(source) && !/[A-Za-z_$][\w$]*\s*\(/.test(source); }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function parseJsonl(value) { return value.split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
function parseArgs(values) { const result = {}; for (let i = 0; i < values.length; i += 2) result[values[i].replace(/^--/, "")] = values[i + 1]; return result; }
