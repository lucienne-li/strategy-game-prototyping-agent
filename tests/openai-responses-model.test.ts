import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIResponsesModel } from "../src/model/openai-responses-model.js";

function responseWith(output: unknown[]): Response {
  return new Response(JSON.stringify({ output }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

test("reads credentials from the environment and converts a function call", async () => {
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer test-key");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, "test-model");
    assert.equal(JSON.stringify(body).includes("test-key"), false);
    return responseWith([
      {
        type: "function_call",
        name: "write_file",
        arguments: JSON.stringify({ path: "hello-agent.ts", content: 'console.log("hello agent");\n' })
      }
    ]);
  }) as typeof globalThis.fetch;
  const model = OpenAIResponsesModel.fromEnv({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    fetch: fakeFetch
  });

  const output = await model.next({ request: "create a file", iteration: 1, events: [] });
  assert.deepEqual(output, {
    type: "tool_call",
    call: { tool: "write_file", path: "hello-agent.ts", content: 'console.log("hello agent");\n' }
  });
  assert.equal(model.modelName, "test-model");
});

test("converts protocol-prefixed final text and rejects missing credentials", async () => {
  const fakeFetch = (async () =>
    responseWith([
      { type: "message", content: [{ type: "output_text", text: "SUCCESS: task verified" }] }
    ])) as typeof globalThis.fetch;
  const model = OpenAIResponsesModel.fromEnv({ env: { OPENAI_API_KEY: "test-key" }, fetch: fakeFetch });

  assert.deepEqual(await model.next({ request: "task", iteration: 1, events: [] }), {
    type: "final",
    status: "success",
    message: "task verified"
  });
  assert.throws(() => OpenAIResponsesModel.fromEnv({ env: {} }), /OPENAI_API_KEY/);
});

test("reports API failures without exposing the configured key", async () => {
  const fakeFetch = (async () => new Response("request rejected for secret-test-key", { status: 401 })) as typeof globalThis.fetch;
  const model = OpenAIResponsesModel.fromEnv({
    env: { OPENAI_API_KEY: "secret-test-key" },
    fetch: fakeFetch
  });

  await assert.rejects(
    () => model.next({ request: "task", iteration: 1, events: [] }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /OpenAI API returned 401/);
      assert.match(error.message, /\[REDACTED\]/);
      assert.equal(error.message.includes("secret-test-key"), false);
      return true;
    }
  );
});
