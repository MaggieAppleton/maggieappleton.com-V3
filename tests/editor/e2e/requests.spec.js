import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const jsonType = "application/json";

function documentUrl(origin, documentId) {
  const url = new URL("/_editor/api/document", origin);
  if (documentId !== undefined) url.searchParams.set("documentId", documentId);
  return url;
}

function rawLoopbackGet(server, bootstrap, documentId, host) {
  const url = documentUrl(server.origin, documentId);
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest({
      hostname: "127.0.0.1",
      port: server.port,
      path: `${url.pathname}${url.search}`,
      headers: { Host: host, "X-Local-Editor-Token": bootstrap.token },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        resolveRequest(new Response(Buffer.concat(chunks), { status: response.statusCode, headers }));
      });
    });
    request.once("error", rejectRequest);
    request.end();
  });
}

function parseBootstrap(html) {
  const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find((match) => /\bid=["']local-editor-bootstrap["']/i.test(match[1]));
  assert.ok(script, "editor page must expose the local-editor bootstrap script");
  const bootstrap = JSON.parse(script[2]);
  assert.equal(typeof bootstrap.token, "string");
  assert.ok(bootstrap.token.length > 0);
  assert.equal(typeof bootstrap.origin, "string");
  return bootstrap;
}

function assertPrivateResponseHeaders(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  for (const header of [
    "access-control-allow-origin",
    "access-control-allow-credentials",
    "access-control-allow-methods",
  ]) assert.equal(response.headers.get(header), null, `${header} must not be emitted`);
}

async function assertApiError(response, status, code) {
  assert.equal(response.status, status);
  assertPrivateResponseHeaders(response);
  const body = await response.json();
  assert.equal(body.error?.code, code);
  assert.equal(typeof body.error?.message, "string");
}

test.describe.serial("editor HTTP request guards", () => {
  let fixture;
  let server;
  let bootstrap;
  let documentId;
  let sourcePath;
  let persistedSource;
  let malformedDocumentId;
  let malformedSource;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    const slug = `editor-http-${randomUUID().slice(0, 8)}`;
    documentId = `notes:${slug}`;
    malformedDocumentId = `notes:${slug}-malformed`;
    fixture = await createFixtureProject({ name: "editor-http-guards" });
    sourcePath = fixture.resolve(`src/content/notes/${slug}.mdx`);
    persistedSource = `---
title: HTTP guard fixture
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

Original synthetic note.\n`;
    await fixture.write(`src/content/notes/${slug}.mdx`, persistedSource);
    malformedSource = `${persistedSource}\n<UnclosedComponent`;
    await fixture.write(`src/content/notes/${slug}-malformed.mdx`, malformedSource);
    server = await startFixtureServer(fixture.root, { timeout: 120_000 });
    const editor = await fetch(`${server.origin}/_editor?documentId=${encodeURIComponent(documentId)}`);
    assert.equal(editor.status, 200);
    bootstrap = parseBootstrap(await editor.text());
    assert.equal(bootstrap.origin, server.origin);
  });

  test.afterAll(async () => {
    test.setTimeout(240_000);
    try {
      if (server) await server.stop();
    } finally {
      if (fixture) await fixture.cleanup();
    }
  });

  async function apiGet(id = documentId, headers = {}) {
    return fetch(documentUrl(server.origin, id), {
      headers: { "X-Local-Editor-Token": bootstrap.token, ...headers },
    });
  }

  async function apiPut(options = {}) {
    const id = options.id ?? documentId;
    const token = Object.hasOwn(options, "token") ? options.token : bootstrap.token;
    const origin = Object.hasOwn(options, "origin") ? options.origin : bootstrap.origin;
    const contentType = Object.hasOwn(options, "contentType") ? options.contentType : jsonType;
    const method = options.method ?? "PUT";
    const { body, headers = {} } = options;
    const requestHeaders = {
      ...(token === undefined ? {} : { "X-Local-Editor-Token": token }),
      ...(origin === undefined ? {} : { Origin: origin }),
      ...(contentType === undefined ? {} : { "Content-Type": contentType }),
      ...headers,
    };
    return fetch(documentUrl(server.origin), {
      method,
      headers: requestHeaders,
      body: body ?? JSON.stringify({
        documentId: id,
        baseRevision: "deliberately-invalid-for-guard-tests",
        requestId: `request-${randomUUID()}`,
        source: "Rejected source must never reach the file store.",
      }),
    });
  }

  async function rejected(response, status, code) {
    await assertApiError(await response, status, code);
    assert.equal(await readFile(sourcePath, "utf8"), persistedSource, "rejected HTTP request changed fixture content");
  }

  test("bootstraps the no-identity drafts page and raw-reads malformed indexed source", async () => {
    test.setTimeout(240_000);
    const drafts = await fetch(`${server.origin}/_editor`);
    assert.equal(drafts.status, 200);
    assert.equal(drafts.headers.get("cache-control"), "no-store");
    const draftsHtml = await drafts.text();
    assert.ok(draftsHtml.includes('href="/drafts"'));
    assert.ok(draftsHtml.includes("Open drafts or start a new draft"));
    const noIdentity = parseBootstrap(draftsHtml);
    assert.equal(noIdentity.origin, server.origin);
    assert.equal(noIdentity.token, bootstrap.token);
    assert.equal(noIdentity.documentId, null);
    assert.equal(noIdentity.document, undefined);

    const malformed = await apiGet(malformedDocumentId);
    assert.equal(malformed.status, 200);
    assertPrivateResponseHeaders(malformed);
    const document = await malformed.json();
    assert.equal(document.source, malformedSource);
    assert.equal(typeof document.parseError, "string");
    assert.ok(document.parseError.length > 0);
  });

  test("wires the bootstrap capability to real document GET and PUT persistence", async () => {
    test.setTimeout(240_000);
    const current = await apiGet();
    assert.equal(current.status, 200);
    assertPrivateResponseHeaders(current);
    const document = await current.json();
    assert.equal(document.documentId, documentId);
    assert.equal(document.source, persistedSource);
    assert.equal(typeof document.revision, "string");

    const candidate = persistedSource.replace("Original synthetic note.", "Persisted synthetic note.");
    const save = await apiPut({
      body: JSON.stringify({
        documentId,
        baseRevision: document.revision,
        requestId: `valid-${randomUUID()}`,
        source: candidate,
      }),
    });
    assert.equal(save.status, 200);
    assertPrivateResponseHeaders(save);
    const saved = await save.json();
    assert.equal(saved.documentId, documentId);
    assert.equal(saved.unchanged, false);
    assert.equal(typeof saved.revision, "string");
    persistedSource = candidate;
    await expect.poll(() => readFile(sourcePath, "utf8")).toBe(candidate);
  });

  test("rejects unknown, unsupported, traversal, and hostile Host identities without writes", async () => {
    test.setTimeout(240_000);
    await rejected(apiGet("notes:not-indexed"), 404, "document_missing");
    await rejected(apiGet("patterns:not-supported"), 400, "invalid_document_id");
    await rejected(apiGet("notes:../escape"), 400, "invalid_document_id");
    await rejected(apiGet("notes:%2e%2e%2fescape"), 400, "invalid_document_id");
    await rejected(rawLoopbackGet(server, bootstrap, documentId, `localhost:${server.port}`), 403, "forbidden_origin");
    await rejected(rawLoopbackGet(server, bootstrap, documentId, `192.168.1.10:${server.port}`), 403, "forbidden_origin");
  });

  test("rejects invalid write capabilities, origins, methods, content, and size without writes", async () => {
    test.setTimeout(240_000);
    await rejected(apiPut({ token: "wrong-capability" }), 403, "invalid_editor_token");
    await rejected(apiPut({ origin: "http://evil.example" }), 403, "forbidden_write_origin");
    await rejected(apiPut({ origin: "null" }), 403, "forbidden_write_origin");
    await rejected(apiPut({ origin: undefined }), 403, "forbidden_write_origin");
    await rejected(apiPut({ method: "POST" }), 405, "method_not_allowed");
    await rejected(apiPut({ contentType: "text/plain", body: "not JSON" }), 415, "unsupported_content_type");
    await rejected(apiPut({
      body: JSON.stringify({
        documentId,
        baseRevision: "oversized",
        requestId: `oversized-${randomUUID()}`,
        source: "x".repeat(10 * 1024 * 1024 + 1),
      }),
    }), 413, "request_too_large");
  });
});
