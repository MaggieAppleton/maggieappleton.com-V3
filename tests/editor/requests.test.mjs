import assert from "node:assert/strict";
import test from "node:test";

import {
  assertEditorRequest,
  readEditorJson,
} from "../../src/editor/server/request-guards.mjs";

const origin = "http://127.0.0.1:4321";
const token = "test-capability-token";
const guardOptions = { origin, token, methods: ["PUT", "POST"] };

function request(path = "/_editor/api/document", init = {}) {
  const { editorToken, ...requestInit } = init;
  const capability = Object.hasOwn(init, "editorToken") ? editorToken : token;
  return new Request(`${origin}${path}`, {
    ...requestInit,
    headers: {
      ...(capability === undefined ? {} : { "X-Local-Editor-Token": capability }),
      ...requestInit.headers,
    },
  });
}

async function assertStructuredError(operation, status) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.status, status);
    assert.equal(typeof error.code, "string");
    assert.ok(error.code.length > 0);
    return true;
  });
}

async function runGuardedWrite(candidate, write, readOptions) {
  await assertEditorRequest(candidate, guardOptions);
  const parsed = await readEditorJson(candidate, readOptions);
  await write(parsed);
}

test("allows a token-authenticated document GET on the configured loopback origin", async () => {
  const result = await assertEditorRequest(request(undefined, { method: "GET" }), guardOptions);
  assert.equal(result, undefined);
});

test("rejects a missing or wrong capability token without reaching a downstream write", async () => {
  for (const editorToken of [
    undefined,
    "wrong",
  ]) {
    let writes = 0;
    await assertStructuredError(() => runGuardedWrite(request(undefined, {
      method: "PUT",
      headers: { Origin: origin, "Content-Type": "application/json" },
      editorToken,
      body: JSON.stringify({ source: "changed" }),
    }), () => { writes += 1; }), 403);
    assert.equal(writes, 0);
  }
});

test("rejects a non-configured loopback host and port", async () => {
  for (const url of [
    "http://localhost:4321/_editor/api/document",
    "http://127.0.0.1:4322/_editor/api/document",
    "http://192.168.1.10:4321/_editor/api/document",
  ]) {
    await assertStructuredError(() => assertEditorRequest(new Request(url, {
      method: "GET",
      headers: { "X-Local-Editor-Token": token },
    }), guardOptions), 403);
  }
});

test("requires the exact configured Origin for writes and never calls the write spy when it differs", async () => {
  for (const writeOrigin of ["http://evil.example", "null", undefined]) {
    let writes = 0;
    const headers = {
      "Content-Type": "application/json",
      ...(writeOrigin === undefined ? {} : { Origin: writeOrigin }),
    };
    await assertStructuredError(() => runGuardedWrite(request(undefined, {
      method: "PUT",
      headers,
      body: JSON.stringify({ source: "changed" }),
    }), () => { writes += 1; }), 403);
    assert.equal(writes, 0);
  }
});

test("rejects disallowed methods and non-JSON writes before parsing or writing", async () => {
  for (const init of [
    { method: "DELETE", headers: { Origin: origin, "Content-Type": "application/json" } },
    { method: "PUT", headers: { Origin: origin, "Content-Type": "text/plain" } },
  ]) {
    let writes = 0;
    await assertStructuredError(() => runGuardedWrite(request(undefined, {
      ...init,
      body: "not json",
    }), () => { writes += 1; }), init.method === "DELETE" ? 405 : 415);
    assert.equal(writes, 0);
  }
});

test("parses a valid JSON stream and rejects malformed JSON without a downstream write", async () => {
  const valid = await readEditorJson(request(undefined, {
    method: "PUT",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ source: "valid" }),
  }));
  assert.deepEqual(valid, { source: "valid" });

  let writes = 0;
  await assertStructuredError(() => runGuardedWrite(request(undefined, {
    method: "PUT",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: "{not json}",
  }), () => { writes += 1; }), 400);
  assert.equal(writes, 0);
});

test("rejects an oversized streamed JSON body before a downstream write", async () => {
  const oversized = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"source":"0123456789"}'));
      controller.close();
    },
  });
  const candidate = request(undefined, {
    method: "PUT",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: oversized,
    duplex: "half",
  });
  let writes = 0;
  await assertStructuredError(() => runGuardedWrite(candidate, () => { writes += 1; }, { limit: 10 }), 413);
  assert.equal(writes, 0);
});

test("keeps the 413 result when cancellation of an oversized stream fails", async () => {
  const oversized = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"source":"0123456789"}'));
    },
    cancel() {
      throw new Error("intentional cancellation failure");
    },
  });
  const candidate = request(undefined, {
    method: "PUT",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: oversized,
    duplex: "half",
  });
  await assertStructuredError(() => readEditorJson(candidate, { limit: 10 }), 413);
});
