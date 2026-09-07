# Fast HTML Verifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, offline-safe HTML smoke verifier that exercises representative Astro routes without triggering the site's 7,779-image static generation phase.

**Architecture:** A single ESM script owns reusable response assertions, readiness polling, route verification, Astro process startup, and reliable cleanup. Unit tests exercise every helper through injected fetch, clock, spawn, and kill dependencies; the package command then runs the same script against the real Astro development server without following image URLs.

**Tech Stack:** Node.js 23 built-ins (`node:assert`, `node:child_process`, `node:events`, `node:test`, Fetch API), Astro 5 development server, npm scripts.

**Spec:** `docs/superpowers/specs/2026-09-07-seo-aeo-programme-design.md`

## Global Constraints

- Do not modify `astro.config.mjs`, the production image service, `build`, `build:local`, or deployment behaviour.
- The verifier starts Astro on `127.0.0.1:4322` by default; `VERIFY_HTML_PORT` may override it only with an integer from 1024 through 65535.
- The verifier requests page and XML route URLs only. It never follows or directly requests `/_image`, `/og`, or raster image URLs.
- The default route set must avoid content with `TweetEmbed` so a normal run remains deterministic without third-party embed requests.
- Current pages need only at least one canonical link. Exactly one canonical is deliberately deferred to P2.
- P0a must not claim static-route completeness, production redirect behaviour, image correctness, image optimization correctness, third-party embed availability, or a production build.
- All implementation stays in `/private/tmp/maggie-seo-aeo-p0a` on branch `codex/seo-aeo-fast-html`; the dirty primary checkout remains untouched.

## File structure

- Create `src/scripts/verify-html.mjs`: route manifest, response assertions, readiness polling, verifier orchestration, Astro child-process lifecycle, and CLI entrypoint.
- Create `tests/verify-html.test.mjs`: unit coverage for every exported helper using local fixtures and injected dependencies; it must not start Astro.
- Modify `package.json`: expose `npm run verify:html`.
- Modify `README.md`: document the fast verifier, its limits, and when `npm run build:local` is still required.

---

### Task 1: Route manifest and response contracts

**Files:**
- Create: `src/scripts/verify-html.mjs`
- Create: `tests/verify-html.test.mjs`

**Interfaces:**
- Consumes: the built-in Fetch `Response` shape (`status`, `headers.get()`, `text()`).
- Produces: `DEFAULT_HOST`, `DEFAULT_PORT`, `ROUTES`, `parsePort(value)`, `buildURL(baseURL, routePath)`, `assertHTMLResponse(route, response, body)`, `assertXMLResponse(route, response, body)`, and `verifyRoutes(options)`.
- `verifyRoutes({ baseURL, routes, fetchImpl })` returns an array of `{ path, status }` in manifest order and rejects on the first invalid response.

- [ ] **Step 1: Write the failing response-contract tests**

Create `tests/verify-html.test.mjs` with Node's test runner. Cover the port bounds, route-manifest invariants, URL joining, passing HTML/XML fixtures, every required failure, manifest order, and the no-image-request contract:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PORT,
  ROUTES,
  assertHTMLResponse,
  assertXMLResponse,
  buildURL,
  parsePort,
  verifyRoutes,
} from "../src/scripts/verify-html.mjs";

const html = (title = "Maggie Appleton") =>
  `<!doctype html><html><head><title>${title}</title><link rel="canonical" href="https://maggieappleton.com/"></head><body><main><h1>${title}</h1></main></body></html>`;
const response = (body, contentType = "text/html", status = 200) =>
  new Response(body, { status, headers: { "content-type": contentType } });

test("parses only unprivileged TCP ports", () => {
  assert.equal(parsePort(undefined), DEFAULT_PORT);
  assert.equal(parsePort("4323"), 4323);
  for (const value of ["", "abc", "4322.5", "1023", "65536"]) {
    assert.throws(() => parsePort(value), /VERIFY_HTML_PORT/);
  }
});

test("defines unique non-image routes with supported kinds", () => {
  assert.equal(new Set(ROUTES.map(({ path }) => path)).size, ROUTES.length);
  for (const route of ROUTES) {
    assert.match(route.path, /^\//);
    assert.ok(["html", "xml"].includes(route.kind));
    assert.doesNotMatch(route.path, /(?:\/_image|\/og(?:\/|\.|$)|\.(?:avif|gif|jpe?g|png|webp|svg)$)/i);
  }
});

test("joins route paths to one base URL", () => {
  assert.equal(buildURL("http://127.0.0.1:4322/", "/about"), "http://127.0.0.1:4322/about");
});

test("accepts valid HTML and rejects each missing contract", async () => {
  const route = { path: "/about", kind: "html", title: "About Maggie Appleton" };
  assert.doesNotThrow(() => assertHTMLResponse(route, response(html(route.title)), html(route.title)));
  assert.throws(() => assertHTMLResponse(route, response("no", "text/plain"), "no"), /text\/html/);
  assert.throws(() => assertHTMLResponse(route, response(html(), "text/html", 404), html()), /status 200/);
  for (const [body, message] of [
    [html().replace(/<title>[\s\S]*?<\/title>/, ""), /title/],
    [html().replace(/<main>[\s\S]*?<\/main>/, ""), /main/],
    [html().replace(/<h1>[\s\S]*?<\/h1>/, ""), /h1/],
    [html().replace(/<link rel="canonical"[^>]*>/, ""), /canonical/],
    [html("Wrong title"), /About Maggie Appleton/],
  ]) assert.throws(() => assertHTMLResponse(route, response(body), body), message);
});

test("accepts RSS XML and rejects invalid XML responses", () => {
  const route = { path: "/rss.xml", kind: "xml" };
  const body = "<?xml version=\"1.0\"?><rss><channel><item /></channel></rss>";
  assert.doesNotThrow(() => assertXMLResponse(route, response(body, "application/xml"), body));
  assert.throws(() => assertXMLResponse(route, response(body, "text/plain"), body), /xml/);
  assert.throws(() => assertXMLResponse(route, response("<rss />", "application/xml"), "<rss />"), /item/);
});

test("verifies routes in order without fetching image URLs", async () => {
  const requested = [];
  const routes = [
    { path: "/", kind: "html", title: "Maggie Appleton" },
    { path: "/rss.xml", kind: "xml" },
  ];
  const results = await verifyRoutes({
    baseURL: "http://127.0.0.1:4322",
    routes,
    fetchImpl: async (url) => {
      requested.push(url);
      return url.endsWith(".xml")
        ? response("<rss><channel><item /></channel></rss>", "application/xml")
        : response(html());
    },
  });
  assert.deepEqual(results, [{ path: "/", status: 200 }, { path: "/rss.xml", status: 200 }]);
  assert.deepEqual(requested, ["http://127.0.0.1:4322/", "http://127.0.0.1:4322/rss.xml"]);
  assert.ok(requested.every((url) => !/(?:\/_image|\/og|\.(?:avif|gif|jpe?g|png|webp|svg)$)/i.test(url)));
});
```

- [ ] **Step 2: Run the new test and confirm the missing module failure**

Run: `node --test tests/verify-html.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/scripts/verify-html.mjs`.

- [ ] **Step 3: Implement the manifest and response helpers**

Create `src/scripts/verify-html.mjs`. Use `node:assert/strict` for actionable failures and export this exact initial manifest:

```js
import assert from "node:assert/strict";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4322;
export const ROUTES = Object.freeze([
  { path: "/", kind: "html", title: "Maggie Appleton" },
  { path: "/about", kind: "html", title: "About Maggie Appleton" },
  { path: "/garden", kind: "html", title: "The Garden of Maggie Appleton" },
  { path: "/essays", kind: "html", title: "Essays by Maggie Appleton" },
  { path: "/notes", kind: "html", title: "Notes by Maggie Appleton" },
  { path: "/patterns", kind: "html", title: "Patterns by Maggie Appleton" },
  { path: "/topics/web-development", kind: "html" },
  { path: "/websecurity", kind: "html" },
  { path: "/api", kind: "html" },
  { path: "/rss.xml", kind: "xml" },
  { path: "/smidgeons.xml", kind: "xml" },
]);

export function parsePort(value) {
  if (value === undefined) return DEFAULT_PORT;
  if (!/^\d+$/.test(value)) throw new Error("VERIFY_HTML_PORT must be an integer from 1024 through 65535");
  const port = Number(value);
  if (port < 1024 || port > 65535) throw new Error("VERIFY_HTML_PORT must be an integer from 1024 through 65535");
  return port;
}

export function buildURL(baseURL, routePath) {
  return new URL(routePath, `${baseURL.replace(/\/+$/, "")}/`).toString();
}

export function assertHTMLResponse(route, response, body) {
  assert.equal(response.status, 200, `${route.path}: expected status 200, received ${response.status}`);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i, `${route.path}: expected text/html`);
  const title = body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  assert.ok(title, `${route.path}: expected a non-empty title`);
  assert.match(body, /<main(?:\s|>)/i, `${route.path}: expected a main landmark`);
  assert.match(body, /<h1(?:\s|>)/i, `${route.path}: expected an h1`);
  assert.match(body, /<link\b[^>]*\brel=["']canonical["'][^>]*>/i, `${route.path}: expected a canonical link`);
  if (route.title) assert.ok(title.includes(route.title), `${route.path}: expected title to include ${route.title}`);
}

export function assertXMLResponse(route, response, body) {
  assert.equal(response.status, 200, `${route.path}: expected status 200, received ${response.status}`);
  assert.match(response.headers.get("content-type") ?? "", /xml/i, `${route.path}: expected an XML content type`);
  assert.match(body, /<rss(?:\s|>)/i, `${route.path}: expected an rss element`);
  assert.match(body, /<item(?:\s|\/|>)/i, `${route.path}: expected at least one item`);
}

export async function verifyRoutes({ baseURL, routes = ROUTES, fetchImpl = globalThis.fetch }) {
  const results = [];
  for (const route of routes) {
    const response = await fetchImpl(buildURL(baseURL, route.path));
    const body = await response.text();
    if (route.kind === "html") assertHTMLResponse(route, response, body);
    else if (route.kind === "xml") assertXMLResponse(route, response, body);
    else throw new Error(`${route.path}: unsupported route kind ${route.kind}`);
    results.push({ path: route.path, status: response.status });
  }
  return results;
}
```

- [ ] **Step 4: Run the focused and complete Node suites**

Run: `node --test tests/verify-html.test.mjs`

Expected: all verifier tests PASS.

Run: `node --test tests/*.test.mjs`

Expected: all existing and verifier tests PASS.

- [ ] **Step 5: Commit the response-contract unit**

```bash
git add src/scripts/verify-html.mjs tests/verify-html.test.mjs
git commit -m "test: define fast HTML verification contracts"
```

### Task 2: Astro lifecycle, package command, and documentation

**Files:**
- Modify: `src/scripts/verify-html.mjs`
- Modify: `tests/verify-html.test.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1's `parsePort`, `verifyRoutes`, `DEFAULT_HOST`, `DEFAULT_PORT`, and `ROUTES` exports.
- Produces: `assertPortAvailable(options)`, `waitForServer(options)`, `stopDevServer(child, options)`, and `runVerifier(options)` plus the public command `npm run verify:html`.
- Before spawning, `runVerifier()` exclusively preflights the host/port and fails if a listener already owns it; it then derives the repository root from `import.meta.url`, spawns `npm run dev`, verifies every manifest route, prints one success line per route, and stops the entire detached process group in `finally`.
- A SIGINT or SIGTERM rejects the active readiness or verification stage, then cleanup runs once in `finally`. `verifyRoutes()` rejects supplied `/_image`, `/og`, and raster-image paths before fetching them.
- Readiness polling requests only the static `/robots.txt` endpoint. The manifest still explicitly verifies `/` immediately afterward, so SSR failures reject the command without repeated aborted homepage compilations during startup.

- [ ] **Step 1: Add failing lifecycle and orchestration tests**

Extend `tests/verify-html.test.mjs` with injected, clock-free lifecycle tests, including an occupied-port preflight that proves spawning does not begin, a signal-target test that proves interruption rejects promptly and removes listeners, and a readiness test that proves only `http://127.0.0.1:4322/robots.txt` is requested rather than the homepage. Also prove `verifyRoutes()` rejects supplied image paths before any fetch call:

```js
import { EventEmitter } from "node:events";
import { runVerifier, stopDevServer, waitForServer } from "../src/scripts/verify-html.mjs";

test("waits through transient failures until the server responds", async () => {
  let calls = 0;
  await waitForServer({
    baseURL: "http://127.0.0.1:4322",
    child: { exitCode: null },
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw new Error("not ready");
      return new Response("ready");
    },
    sleep: async () => {},
    now: (() => { let value = 0; return () => value += 100; })(),
    timeoutMs: 1000,
  });
  assert.equal(calls, 3);
});

test("fails readiness when Astro exits or times out", async () => {
  await assert.rejects(() => waitForServer({
    baseURL: "http://127.0.0.1:4322",
    child: { exitCode: 1 },
    fetchImpl: async () => new Response("ready"),
  }), /exited/);
  await assert.rejects(() => waitForServer({
    baseURL: "http://127.0.0.1:4322",
    child: { exitCode: null },
    fetchImpl: async () => { throw new Error("not ready"); },
    sleep: async () => {},
    now: (() => { let value = 0; return () => value += 1000; })(),
    timeoutMs: 500,
  }), /30 seconds|timed out/);
});

test("stops a Unix process group and escalates only when needed", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  child.kill = () => assert.fail("group signalling should be used on Unix");
  const signals = [];
  await stopDevServer(child, {
    platform: "darwin",
    killImpl: (pid, signal) => signals.push([pid, signal]),
    waitForExitImpl: async () => false,
  });
  assert.deepEqual(signals, [[-99, "SIGTERM"], [-99, "SIGKILL"]]);
});

test("always stops the child when route verification fails", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  let stopped = 0;
  await assert.rejects(() => runVerifier({
    port: 4322,
    spawnImpl: () => child,
    waitForServerImpl: async () => {},
    verifyRoutesImpl: async () => { throw new Error("bad route"); },
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log() {}, error() {} },
  }), /bad route/);
  assert.equal(stopped, 1);
});

test("surfaces spawn errors and still stops the child", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  let stopped = 0;
  const verification = runVerifier({
    port: 4322,
    spawnImpl: () => child,
    waitForServerImpl: async () => new Promise(() => {}),
    verifyRoutesImpl: async () => [],
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log() {}, error() {} },
  });
  queueMicrotask(() => child.emit("error", new Error("spawn failed")));
  await assert.rejects(() => verification, /spawn failed/);
  assert.equal(stopped, 1);
});
```

- [ ] **Step 2: Run the focused test and confirm the reliability-regression failures**

Run: `node --test tests/verify-html.test.mjs`

Expected before this correction: FAIL because supplied image routes are fetched, occupied-port preflight does not stop spawning, and an injected signal target receives no interrupt listener.

- [ ] **Step 3: Implement readiness, cleanup, orchestration, and CLI behaviour**

Extend `src/scripts/verify-html.mjs` with:

```js
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function assertSafeRoutePath(routePath) {
  if (/(?:^|\/)(?:_image|og)(?:[/?#]|$)|\.(?:avif|gif|jpe?g|png|webp|svg)(?:[?#]|$)/i.test(routePath)) {
    throw new Error(`${routePath}: image route is not allowed`);
  }
}

export function assertPortAvailable({ host, port, createServerImpl = createServer }) {
  return new Promise((resolve, reject) => {
    const server = createServerImpl();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") reject(new Error(`Port ${port} is already in use`));
      else reject(error);
    });
    server.listen({ host, port, exclusive: true }, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
}

export async function waitForServer({
  baseURL,
  child,
  fetchImpl = globalThis.fetch,
  sleep = delay,
  now = Date.now,
  timeoutMs = 30_000,
  pollMs = 100,
}) {
  const deadline = now() + timeoutMs;
  const readinessURL = buildURL(baseURL, "/robots.txt");
  while (now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Astro dev exited with code ${child.exitCode} before it became ready`);
    try {
      const response = await fetchImpl(readinessURL, { signal: AbortSignal.timeout(750) });
      if (response.ok) return;
    } catch {}
    await sleep(pollMs);
  }
  throw new Error("Astro dev timed out after 30 seconds");
}

async function waitForExit(child, timeoutMs = 2_000) {
  if (child.exitCode !== null) return true;
  return Promise.race([
    once(child, "exit").then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
}

export async function stopDevServer(child, {
  platform = process.platform,
  killImpl = process.kill,
  waitForExitImpl = waitForExit,
} = {}) {
  if (!child || child.exitCode !== null) return;
  const signal = (name) => {
    if (platform !== "win32" && child.pid) killImpl(-child.pid, name);
    else child.kill(name);
  };
  try { signal("SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  if (await waitForExitImpl(child, 2_000)) return;
  try { signal("SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  await waitForExitImpl(child, 2_000);
}

export async function runVerifier({
  host = DEFAULT_HOST,
  port = parsePort(process.env.VERIFY_HTML_PORT),
  routes = ROUTES,
  spawnImpl = spawn,
  assertPortAvailableImpl = assertPortAvailable,
  waitForServerImpl = waitForServer,
  verifyRoutesImpl = verifyRoutes,
  stopDevServerImpl = stopDevServer,
  signalTarget = process,
  logger = console,
} = {}) {
  const baseURL = `http://${host}:${port}`;
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  await assertPortAvailableImpl({ host, port });
  const child = spawnImpl(npmCommand, ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"], {
    cwd: repoRoot,
    env: { ...process.env },
    detached: process.platform !== "win32",
    stdio: "inherit",
  });
  const spawnFailure = new Promise((_, reject) => child.once("error", reject));
  let rejectInterruption;
  const interrupted = new Promise((_, reject) => { rejectInterruption = reject; });
  let stopPromise;
  const stop = () => stopPromise ??= stopDevServerImpl(child);
  const onSignal = (signal) => rejectInterruption(new Error(`Verifier interrupted by ${signal}`));
  const onSIGINT = () => onSignal("SIGINT");
  const onSIGTERM = () => onSignal("SIGTERM");
  signalTarget.once("SIGINT", onSIGINT);
  signalTarget.once("SIGTERM", onSIGTERM);
  try {
    await Promise.race([waitForServerImpl({ baseURL, child }), spawnFailure, interrupted]);
    const results = await Promise.race([verifyRoutesImpl({ baseURL, routes }), interrupted]);
    for (const result of results) logger.log(`✓ ${result.status} ${result.path}`);
    logger.log(`Verified ${results.length} routes without requesting images.`);
    return results;
  } finally {
    signalTarget.removeListener("SIGINT", onSIGINT);
    signalTarget.removeListener("SIGTERM", onSIGTERM);
    await stop();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runVerifier().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
```

When implementing, retain the Task 1 imports and exports. This Task 2 correction supersedes the earlier `verifyRoutes` loop example: call `assertSafeRoutePath(route.path)` before `fetchImpl`, and reject `/_image`, `/og`, and raster-image paths with an `image route` error before any request. Add a unit test for the Windows `child.kill()` fallback and passing `runVerifier` coverage for the exact spawn command, working directory suffix, `--strictPort`, route forwarding, result logging, and single cleanup call. The new tests must additionally cover an occupied-port preflight that forwards `{ host, port }` and prevents spawn, plus an injected SIGINT that rejects readiness and removes both signal listeners.

- [ ] **Step 4: Add the package command and limits documentation**

Add this script to `package.json` without altering existing commands:

```json
"verify:html": "node src/scripts/verify-html.mjs"
```

Add a `## Verification` section to `README.md` documenting:

```markdown
## Verification

`npm run verify:html` starts Astro locally and checks representative HTML and XML routes without requesting images. Use it for fast metadata, content, and route smoke checks.

This verifier does not prove static route completeness, production redirects, image correctness or optimisation, third-party embed availability, or a production build. Run `npm run build:local` for image-related changes and before deployment; keep Astro's asset cache between full builds when possible.
```

- [ ] **Step 5: Run focused tests, the complete suite, and the real verifier**

Run: `node --test tests/verify-html.test.mjs`

Expected: all verifier unit tests PASS.

Run: `node --test tests/*.test.mjs`

Expected: all Node tests PASS.

Run: `npm run verify:html`

Expected: eleven `✓ 200 <path>` lines followed by `Verified 11 routes without requesting images.`; the command exits zero and port 4322 no longer accepts connections afterward.

Run: `git status --short`

Expected: only `README.md`, `package.json`, `src/scripts/verify-html.mjs`, `tests/verify-html.test.mjs`, and this plan file are changed or untracked. Generated link/topic data must not appear unless its content genuinely changed; if it does, inspect and exclude unrelated generator drift.

- [ ] **Step 6: Commit the lifecycle and public command**

```bash
git add README.md package.json src/scripts/verify-html.mjs tests/verify-html.test.mjs docs/superpowers/plans/2026-09-07-fast-html-verifier.md
git commit -m "chore: add fast HTML verification command"
```

### Task 3: Branch-wide verification and PR evidence

**Files:**
- Modify: none unless review finds a defect.
- Verify: all P0a files and generated runtime behaviour.

**Interfaces:**
- Consumes: the `npm run verify:html` command from Task 2.
- Produces: review evidence that P0a meets the design specification without changing production image/build behaviour.

- [ ] **Step 1: Confirm the production configuration and scripts are untouched**

Run: `git diff fef18b34bd13e0fe0bb73fff4758b5b78c7e5af2 -- astro.config.mjs deploy.sh`

Expected: no output.

Run: `node -e 'const p=require("./package.json"); if(p.scripts.build!=="node src/scripts/generate-links.js && tsx src/scripts/generate-topics.ts && node src/scripts/get-webmentions.js && astro build"||p.scripts["build:local"]!=="node src/scripts/generate-links.js && tsx src/scripts/generate-topics.ts && astro build") process.exit(1)'`

Expected: exit 0.

- [ ] **Step 2: Re-run final verification from a clean stopped-server state**

Run: `node --test tests/*.test.mjs && npm run verify:html`

Expected: all tests and eleven route checks PASS; the verifier terminates its server.

- [ ] **Step 3: Inspect the complete branch diff**

Run: `git diff --check fef18b34bd13e0fe0bb73fff4758b5b78c7e5af2..HEAD`

Expected: no output.

Run: `git diff --stat fef18b34bd13e0fe0bb73fff4758b5b78c7e5af2..HEAD && git status --short`

Expected: the stat names only the planned five files and the worktree is clean.

- [ ] **Step 4: Record final review evidence**

The final review report must state:

```text
Spec: P0a fast HTML verification harness
Base: fef18b34bd13e0fe0bb73fff4758b5b78c7e5af2
Tests: node --test tests/*.test.mjs
Runtime: npm run verify:html (11 routes, no image requests)
Production image/build configuration: unchanged
Known boundary: not a static production build or image/redirect verification
```

No code commit is expected for this verification-only task unless the independent review requires a fix.
