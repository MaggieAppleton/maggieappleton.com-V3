import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer as createHTTPServer } from "node:http";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  ROUTES,
  assertHTMLResponse,
  assertPortAvailable,
  assertRobotsResponse,
  assertSitemapResponse,
  assertXMLResponse,
  buildURL,
  parsePort,
  runVerifier,
  stopDevServer,
  verifyRoutes,
  waitForChildReady,
  waitForExit,
  waitForServer,
} from "../src/scripts/verify-html.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

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
  assert.equal(ROUTES.length, 12);
  assert.deepEqual(ROUTES.at(-1), { path: "/robots.txt", kind: "robots", bodyIncludes: "User-agent:" });
  assert.equal(new Set(ROUTES.map(({ path }) => path)).size, ROUTES.length);
  for (const route of ROUTES) {
    assert.match(route.path, /^\//);
    assert.ok(["html", "xml", "robots", "sitemap"].includes(route.kind));
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

test("supports robots, JSON-LD, sitemap, and expected body contracts", () => {
  const robots = { path: "/robots.txt", kind: "robots", bodyIncludes: "User-agent:" };
  assert.doesNotThrow(() => assertRobotsResponse(robots, response("User-agent: *\nAllow: /", "text/plain"), "User-agent: *\nAllow: /"));
  assert.throws(() => assertRobotsResponse(robots, response("Allow: /", "text/plain"), "Allow: /"), /User-agent/);

  const schemaRoute = { path: "/schema", kind: "html", jsonLD: true, bodyIncludes: "Useful body text" };
  const schemaBody = html().replace("</body>", "<p>Useful body text</p><script type=\"application/ld+json\">{\"@context\":\"https://schema.org\"}</script></body>");
  assert.doesNotThrow(() => assertHTMLResponse(schemaRoute, response(schemaBody), schemaBody));
  const invalidSchema = schemaBody.replace("{\"@context\":\"https://schema.org\"}", "{");
  assert.throws(() => assertHTMLResponse(schemaRoute, response(invalidSchema), invalidSchema), /JSON|Unexpected/);
  assert.throws(() => assertHTMLResponse(schemaRoute, response(html()), html()), /Useful body text/);

  const sitemap = { path: "/sitemap.xml", kind: "sitemap" };
  const sitemapBody = "<?xml version=\"1.0\"?><urlset><url><loc>https://maggieappleton.com/</loc></url></urlset>";
  assert.doesNotThrow(() => assertSitemapResponse(sitemap, response(sitemapBody, "application/xml"), sitemapBody));
  assert.throws(() => assertSitemapResponse(sitemap, response("<urlset />", "application/xml"), "<urlset />"), /url/);
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

test("refuses redirects before an image endpoint can be requested", async () => {
  let imageRequests = 0;
  const server = createHTTPServer((request, reply) => {
    if (request.url === "/safe") {
      reply.writeHead(302, { location: "/_image?href=fixture" });
      reply.end();
      return;
    }
    if (request.url?.startsWith("/_image")) imageRequests += 1;
    reply.writeHead(200, { "content-type": "image/png" });
    reply.end("image");
  });
  await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
  const { port } = server.address();
  try {
    await assert.rejects(() => verifyRoutes({
      baseURL: `http://${DEFAULT_HOST}:${port}`,
      routes: [{ path: "/safe", kind: "html" }],
    }), /redirect/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(imageRequests, 0);
});

test("uses manual redirect handling for readiness and route requests", async () => {
  const options = [];
  await waitForServer({
    baseURL: "http://127.0.0.1:4322",
    child: { exitCode: null },
    fetchImpl: async (_, requestOptions) => {
      options.push(requestOptions);
      return new Response("User-agent: *");
    },
    sleep: async () => assert.fail("a successful readiness probe should not sleep"),
  });
  await verifyRoutes({
    baseURL: "http://127.0.0.1:4322",
    routes: [{ path: "/about", kind: "html" }],
    fetchImpl: async (_, requestOptions) => {
      options.push(requestOptions);
      return response(html());
    },
  });
  assert.deepEqual(options.map(({ redirect }) => redirect), ["manual", "manual"]);
});

test("rejects supplied image routes before fetching them", async () => {
  let fetchCalls = 0;
  for (const path of ["/_image", "/_image?href=card", "/og", "/og?slug=card", "/images/card.png?width=1200"]) {
    await assert.rejects(() => verifyRoutes({
      baseURL: "http://127.0.0.1:4322",
      routes: [{ path, kind: "html" }],
      fetchImpl: async () => {
        fetchCalls += 1;
        return response(html());
      },
    }), /image route/i);
  }
  assert.equal(fetchCalls, 0);
});

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

test("probes the static robots endpoint instead of the homepage during readiness", async () => {
  const requested = [];
  await waitForServer({
    baseURL: "http://127.0.0.1:4322",
    child: { exitCode: null },
    fetchImpl: async (url) => {
      requested.push(url);
      return new Response("User-agent: *");
    },
    sleep: async () => assert.fail("a successful readiness probe should not sleep"),
  });
  assert.deepEqual(requested, ["http://127.0.0.1:4322/robots.txt"]);
  assert.notEqual(requested[0], "http://127.0.0.1:4322");
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

test("maps a concrete occupied loopback port and releases the listener", async () => {
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, DEFAULT_HOST, resolve));
  const { port } = listener.address();
  try {
    await assert.rejects(() => assertPortAvailable({ host: DEFAULT_HOST, port }), /already in use/);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
});

test("cleans wait-for-exit listeners and timers on exit and timeout", async () => {
  for (const outcome of ["exit", "timeout"]) {
    const child = new EventEmitter();
    child.exitCode = null;
    let timeoutCallback;
    const cleared = [];
    const waiting = waitForExit(child, 2_000, {
      setTimeoutImpl: (callback) => {
        timeoutCallback = callback;
        return outcome;
      },
      clearTimeoutImpl: (timeout) => cleared.push(timeout),
    });
    assert.equal(child.listenerCount("exit"), 1);
    if (outcome === "exit") child.emit("exit", 0);
    else timeoutCallback();
    assert.equal(await waiting, outcome === "exit");
    assert.equal(child.listenerCount("exit"), 0);
    assert.deepEqual(cleared, [outcome]);
  }
});

test("resolves owned-child readiness from Astro output", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const ready = waitForChildReady(child);
  child.stdout.emit("data", Buffer.from("astro v5 ready in 42 ms\n"));
  await ready;
  assert.equal(child.stdout.listenerCount("data"), 0);
  assert.equal(child.stderr.listenerCount("data"), 0);
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

test("uses child.kill when Windows cannot signal a process group", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  const signals = [];
  child.kill = (signal) => signals.push(signal);
  await stopDevServer(child, {
    platform: "win32",
    killImpl: () => assert.fail("Windows should use child.kill"),
    waitForExitImpl: async () => true,
  });
  assert.deepEqual(signals, ["SIGTERM"]);
});

test("runs the verifier with its manifest and reports every result", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  let spawnCall;
  let readinessCall;
  let verificationCall;
  let stopped = 0;
  const messages = [];
  const routes = [{ path: "/about", kind: "html" }];
  const results = await runVerifier({
    host: "127.0.0.1",
    port: 4322,
    routes,
    assertPortAvailableImpl: async () => {},
    spawnImpl: (...args) => {
      spawnCall = args;
      return child;
    },
    waitForChildReadyImpl: async () => {},
    waitForServerImpl: async (options) => { readinessCall = options; },
    verifyRoutesImpl: async (options) => {
      verificationCall = options;
      return [{ path: "/about", status: 200 }];
    },
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log: (message) => messages.push(message), error() {} },
  });
  assert.deepEqual(results, [{ path: "/about", status: 200 }]);
  assert.equal(spawnCall[0], process.platform === "win32" ? "npm.cmd" : "npm");
  assert.deepEqual(spawnCall[1], ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4322", "--strictPort"]);
  assert.equal(spawnCall[2].cwd, repoRoot);
  assert.equal(spawnCall[2].detached, process.platform !== "win32");
  assert.deepEqual(spawnCall[2].stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(readinessCall.baseURL, "http://127.0.0.1:4322");
  assert.equal(readinessCall.child, child);
  assert.deepEqual(verificationCall, { baseURL: "http://127.0.0.1:4322", routes });
  assert.deepEqual(messages, ["✓ 200 /about", "Verified 1 routes without requesting images."]);
  assert.equal(stopped, 1);
});

test("fails before spawning when an occupied-port preflight loses the startup race", async () => {
  let spawnCalls = 0;
  let preflightCall;
  await assert.rejects(() => runVerifier({
    port: 4322,
    assertPortAvailableImpl: async (options) => {
      preflightCall = options;
      throw new Error("Port 4322 is already in use");
    },
    spawnImpl: () => {
      spawnCalls += 1;
      return new EventEmitter();
    },
    logger: { log() {}, error() {} },
  }), /already in use/);
  assert.equal(spawnCalls, 0);
  assert.deepEqual(preflightCall, { host: "127.0.0.1", port: 4322 });
});

test("interrupts active verification and removes signal listeners", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  const signals = new EventEmitter();
  let stopped = 0;
  const verification = runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForChildReadyImpl: async () => {},
    waitForServerImpl: async () => new Promise(() => {}),
    verifyRoutesImpl: async () => [],
    stopDevServerImpl: async () => { stopped += 1; },
    signalTarget: signals,
    logger: { log() {}, error() {} },
  });
  await Promise.resolve();
  assert.equal(signals.listenerCount("SIGINT"), 1);
  assert.equal(signals.listenerCount("SIGTERM"), 1);
  signals.emit("SIGINT");
  await assert.rejects(() => verification, /interrupted by SIGINT/);
  assert.equal(stopped, 1);
  assert.equal(signals.listenerCount("SIGINT"), 0);
  assert.equal(signals.listenerCount("SIGTERM"), 0);
});

test("does not verify a stale responder before the spawned child becomes ready", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let routeVerificationCalls = 0;
  let stopped = 0;
  const verification = runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForServerImpl: async () => {},
    waitForChildReadyImpl: async () => new Promise(() => {}),
    verifyRoutesImpl: async () => { routeVerificationCalls += 1; },
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log() {}, error() {} },
  });
  await Promise.resolve();
  child.exitCode = 1;
  child.emit("exit", 1);
  await assert.rejects(() => verification, /exited with code 1/);
  assert.equal(routeVerificationCalls, 0);
  assert.equal(stopped, 1);
});

test("interrupts route verification on SIGTERM and removes signal listeners", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  const signals = new EventEmitter();
  let routeVerificationStarted;
  const routeVerification = new Promise((resolve) => { routeVerificationStarted = resolve; });
  let stopped = 0;
  const verification = runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForChildReadyImpl: async () => {},
    waitForServerImpl: async () => {},
    verifyRoutesImpl: async () => {
      routeVerificationStarted();
      return new Promise(() => {});
    },
    stopDevServerImpl: async () => { stopped += 1; },
    signalTarget: signals,
    logger: { log() {}, error() {} },
  });
  await routeVerification;
  signals.emit("SIGTERM");
  await assert.rejects(() => verification, /interrupted by SIGTERM/);
  assert.equal(stopped, 1);
  assert.equal(signals.listenerCount("SIGINT"), 0);
  assert.equal(signals.listenerCount("SIGTERM"), 0);
});

test("fails route verification when the spawned child exits", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  let routeVerificationStarted;
  const routeVerification = new Promise((resolve) => { routeVerificationStarted = resolve; });
  let stopped = 0;
  const verification = runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForChildReadyImpl: async () => {},
    waitForServerImpl: async () => {},
    verifyRoutesImpl: async () => {
      routeVerificationStarted();
      return new Promise(() => {});
    },
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log() {}, error() {} },
  });
  await routeVerification;
  child.exitCode = 1;
  child.emit("exit", 1);
  await assert.rejects(() => verification, /exited with code 1/);
  assert.equal(stopped, 1);
});

test("always stops the child when route verification fails", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  let stopped = 0;
  await assert.rejects(() => runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForChildReadyImpl: async () => {},
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
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForChildReadyImpl: async () => new Promise(() => {}),
    waitForServerImpl: async () => new Promise(() => {}),
    verifyRoutesImpl: async () => [],
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log() {}, error() {} },
  });
  queueMicrotask(() => child.emit("error", new Error("spawn failed")));
  await assert.rejects(() => verification, /spawn failed/);
  assert.equal(stopped, 1);
});
