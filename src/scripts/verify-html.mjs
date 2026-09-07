import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

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

function assertSafeRoutePath(routePath) {
  if (/(?:^|\/)(?:_image|og)(?:[/?#]|$)|\.(?:avif|gif|jpe?g|png|webp|svg)(?:[?#]|$)/i.test(routePath)) {
    throw new Error(`${routePath}: image route is not allowed`);
  }
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
    assertSafeRoutePath(route.path);
    const response = await fetchImpl(buildURL(baseURL, route.path));
    const body = await response.text();
    if (route.kind === "html") assertHTMLResponse(route, response, body);
    else if (route.kind === "xml") assertXMLResponse(route, response, body);
    else throw new Error(`${route.path}: unsupported route kind ${route.kind}`);
    results.push({ path: route.path, status: response.status });
  }
  return results;
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
