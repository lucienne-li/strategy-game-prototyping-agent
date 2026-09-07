import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const allowedLicenses = new Set(["MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0"]);
const repositorySchema = JSON.parse(await readFile(new URL("./manifests/repository.schema.json", import.meta.url), "utf8"));
const manifests = await readJsonl(new URL("./manifests/pilot-repositories.jsonl", import.meta.url));
const accepted = await readJsonl(new URL("./samples/accepted.jsonl", import.meta.url));
const rejected = await readJsonl(new URL("./samples/rejected.jsonl", import.meta.url));

assert(manifests.length === 5, `expected 5 repository manifests, found ${manifests.length}`);
assert(accepted.length + rejected.length === 8, "expected 8 extracted code units");
assert(
  JSON.stringify(repositorySchema.properties?.license?.properties?.spdx_id?.enum) === JSON.stringify([...allowedLicenses]),
  "repository schema license allowlist differs from validator policy",
);

const manifestByRepo = new Map();
for (const manifest of manifests) {
  assert(manifest.schema_version === "0.1", "unsupported manifest schema version");
  assert(typeof manifest.repository_id === "string" && manifest.repository_id.includes("/"), "invalid repository_id");
  assert(/^https:\/\/github\.com\//.test(manifest.url), `invalid repository URL for ${manifest.repository_id}`);
  assert(/^[0-9a-f]{40}$/.test(manifest.commit_sha), `invalid commit for ${manifest.repository_id}`);
  assert(allowedLicenses.has(manifest.license?.spdx_id), `license rejected for ${manifest.repository_id}`);
  assert(manifest.license?.verified === true, `license not verified for ${manifest.repository_id}`);
  assert(manifest.build?.exit_code === 0 && String(manifest.build.status).startsWith("passed"), `build not passed for ${manifest.repository_id}`);
  assert(manifest.duplicate?.is_fork === false, `fork rejected for ${manifest.repository_id}`);
  assert(!manifestByRepo.has(manifest.repository_id), `duplicate repository ${manifest.repository_id}`);
  manifestByRepo.set(manifest.repository_id, manifest);
}

const ids = new Set();
const hashes = new Set();
for (const sample of [...accepted, ...rejected]) {
  assert(!ids.has(sample.sample_id), `duplicate sample id ${sample.sample_id}`);
  ids.add(sample.sample_id);
  assert(manifestByRepo.has(sample.metadata?.source_repo), `unknown source repository for ${sample.sample_id}`);
  assert(manifestByRepo.get(sample.metadata.source_repo).commit_sha === sample.metadata.source_commit, `commit mismatch for ${sample.sample_id}`);
  assert(["G1", "G2"].includes(sample.metadata?.granularity), `pilot granularity rejected for ${sample.sample_id}`);
  assert(sample.messages?.length === 2 && sample.messages[0]?.role === "user" && sample.messages[1]?.role === "assistant", `invalid messages for ${sample.sample_id}`);
  assert(sample.messages[0].content.trim().length > 0 && sample.messages[1].content.trim().length > 0, `empty instruction or target for ${sample.sample_id}`);
  const digest = createHash("sha256").update(sample.messages[1].content.replaceAll("\r\n", "\n").trim()).digest("hex");
  assert(digest === sample.target?.content_sha256, `target hash mismatch for ${sample.sample_id}`);
  assert(!hashes.has(digest), `exact duplicate target ${sample.sample_id}`);
  hashes.add(digest);
}

for (const sample of accepted) {
  assert(sample.metadata.quality?.alignment === "pass", `alignment failed for accepted sample ${sample.sample_id}`);
  assert(sample.metadata.quality?.granularity_match === "pass", `granularity failed for accepted sample ${sample.sample_id}`);
  assert(sample.metadata.quality?.solvability === "pass", `solvability failed for accepted sample ${sample.sample_id}`);
}

for (const sample of rejected) {
  assert(sample.metadata?.status === "rejected", `missing rejected status for ${sample.sample_id}`);
  assert(Array.isArray(sample.metadata?.rejection_reasons) && sample.metadata.rejection_reasons.length > 0, `missing rejection reason for ${sample.sample_id}`);
}

console.log(JSON.stringify({ repositories: manifests.length, extractedUnits: accepted.length + rejected.length, acceptedSamples: accepted.length, rejectedSamples: rejected.length, exactDuplicateTargets: 0, passed: true }));

async function readJsonl(url) {
  const content = await readFile(url, "utf8");
  return content.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${url.pathname}:${index + 1}: ${error instanceof Error ? error.message : "invalid JSON"}`);
    }
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
