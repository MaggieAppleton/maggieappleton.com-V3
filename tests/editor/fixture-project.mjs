import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
  cp,
  mkdir,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const fixturePrefix = "maggie-local-writing-editor-";
const manifestName = ".local-writing-editor-fixture.json";
const excludedProjectEntries = new Set([
  ".git",
  ".local-writing-editor",
  ".writing-assist",
  ".astro",
  "dist",
  "node_modules",
]);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function fixturePath(projectRoot, path) {
  const resolved = resolve(projectRoot, path);
  assert.ok(
    resolved === projectRoot || resolved.startsWith(`${projectRoot}${sep}`),
    `fixture path escapes its project root: ${path}`,
  );
  return resolved;
}

async function writeManifest(projectRoot, update) {
  const manifestPath = join(projectRoot, manifestName);
  const current = JSON.parse(await readFile(manifestPath, "utf8"));
  const next = update(current);
  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

async function cloneDependencies(sourceRoot, projectRoot) {
  const source = join(sourceRoot, "node_modules");
  const destination = join(projectRoot, "node_modules");
  // Astro and Vite rebuild these caches while dev servers run. Copying them is
  // unnecessary and can make cp fail mid-copy, triggering a much slower retry.
  const cacheNames = new Set([".astro", ".vite"]);
  const entries = (await readdir(source)).filter((entry) => !cacheNames.has(entry));
  await mkdir(destination);
  try {
    await execFileAsync("cp", ["-cR", ...entries.map((entry) => join(source, entry)), destination]);
  } catch {
    await cp(source, destination, { recursive: true, dereference: true,
      force: true, mode: constants.COPYFILE_FICLONE,
      filter: (entry) => !cacheNames.has(relative(source, entry)) });
  }
}

/**
 * Creates an isolated full project copy for tests that can write content.
 * Content is copied, never linked to the worktree; dependencies are APFS-cloned
 * when possible so Astro sees a project-local node_modules path.
 */
export async function createFixtureProject({ name = "editor", sourceRoot = repositoryRoot } = {}) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), fixturePrefix));
  const projectRoot = join(temporaryRoot, "project");
  await cp(sourceRoot, projectRoot, {
    recursive: true,
    dereference: true,
    mode: constants.COPYFILE_FICLONE,
    filter: (entry) => {
      const localPath = relative(sourceRoot, entry);
      return !excludedProjectEntries.has(localPath)
        && (localPath === ".env.example" || !/^\.env(?:\.|$)/u.test(localPath));
    },
  });
  await cloneDependencies(sourceRoot, projectRoot);

  const manifest = {
    format: 1,
    name,
    createdAt: new Date().toISOString(),
    sourceRoot: await realpath(sourceRoot),
    ownedRoots: [projectRoot],
    createdFiles: [],
  };
  await writeFile(join(projectRoot, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const contentPath of ["src/content", "src/links.json", "src/internal-link-previews.json"]) {
    const stat = await lstat(fixturePath(projectRoot, contentPath));
    assert.equal(stat.isSymbolicLink(), false, `${contentPath} must be copied for editor tests`);
  }

  return {
    root: projectRoot,
    manifestPath: join(projectRoot, manifestName),
    resolve: (path) => fixturePath(projectRoot, path),
    async write(path, value) {
      const destination = fixturePath(projectRoot, path);
      await writeFile(destination, value);
      await writeManifest(projectRoot, (current) => ({
        ...current,
        createdFiles: [...new Set([...current.createdFiles, path])],
      }));
    },
    async cleanup() {
      await cleanupFixtureProject(projectRoot);
    },
  };
}

/** Removes only a temporary project that bears this harness's manifest. */
export async function cleanupFixtureProject(projectRoot) {
  const temporaryRoot = dirname(projectRoot);
  assert.equal(projectRoot, join(temporaryRoot, "project"));
  assert.ok(dirname(temporaryRoot) === tmpdir() && temporaryRoot.includes(fixturePrefix));
  const manifest = JSON.parse(await readFile(join(projectRoot, manifestName), "utf8"));
  assert.deepEqual(manifest.ownedRoots, [projectRoot]);
  await rm(temporaryRoot, { recursive: true, force: true });
}

export async function listFixtureFiles(projectRoot) {
  const result = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else result.push(relative(projectRoot, path));
    }
  };
  await visit(projectRoot);
  return result.sort();
}

async function availableLoopbackPort() {
  const server = createServer();
  server.listen({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  return port;
}

async function waitForReady(origin, markerPath, marker, child, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Fixture server exited before readiness (${child.exitCode})`);
    try {
      const response = await fetch(`${origin}/${markerPath}`, { redirect: "error" });
      if (response.status === 200 && await response.text() === marker) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Fixture server did not become ready at ${origin}: ${lastError?.message ?? "timeout"}`);
}

async function runFixtureCommand(projectRoot, executable, args) {
  const child = spawn(executable, args, { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const [code] = await once(child, "exit");
  if (code !== 0) {
    const error = new Error(`Fixture setup command failed (${executable} ${args.join(" ")}):\n${output}`);
    error.output = output;
    throw error;
  }
  return output;
}

async function runFixtureBuild(projectRoot, timeout) {
  const child = spawn("npm", ["run", "build:local"], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  const record = (chunk) => { output += chunk.toString(); };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  let timeoutId;
  const isRunning = () => child.exitCode === null && child.signalCode === null;
  const result = await Promise.race([
    once(child, "exit").then(([code, signal]) => ({ code, signal })),
    new Promise((resolveTimeout) => {
      timeoutId = setTimeout(() => resolveTimeout({ timedOut: true }), timeout);
    }),
  ]);
  clearTimeout(timeoutId);
  if (result.timedOut) {
    if (isRunning()) {
      const exited = once(child, "exit");
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      await Promise.race([exited, delay(5_000)]);
      if (isRunning()) {
        try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      }
      if (isRunning()) await exited;
    }
    const error = new Error(`Fixture production build exceeded ${timeout} ms`);
    error.output = output;
    throw error;
  }
  if (result.code !== 0) {
    const error = new Error(`Fixture production build failed (${result.code ?? result.signal}):\n${output}`);
    error.output = output;
    throw error;
  }
  return output;
}

/** Builds a copied fixture with a unique static marker for production readiness. */
export async function buildFixtureProject(projectRoot, { timeout = 840_000 } = {}) {
  const logDirectory = fixturePath(projectRoot, ".local-writing-editor");
  const logPath = join(logDirectory, "fixture-production-build.log");
  const markerPath = `.production-fixture-${randomUUID()}.txt`;
  const marker = randomUUID();
  await mkdir(logDirectory, { recursive: true });
  await writeFile(fixturePath(projectRoot, join("public", markerPath)), marker);
  let output = "";
  try {
    output = await runFixtureBuild(projectRoot, timeout);
  } catch (error) {
    output = error.output ?? String(error);
    await writeFile(logPath, output);
    error.logPath = logPath;
    throw error;
  }
  await writeFile(logPath, output);
  await writeManifest(projectRoot, (current) => ({
    ...current,
    createdFiles: [...new Set([...current.createdFiles, ".local-writing-editor/fixture-production-build.log", `public/${markerPath}`])],
  }));
  return { exitCode: 0, logPath, markerPath, marker };
}

/** Starts an owned Astro preview of an already-built fixture. */
export async function startFixturePreview(projectRoot, build, { timeout } = {}) {
  assert.ok(build?.markerPath && build?.marker, "Production preview needs a successful fixture build");
  const port = await availableLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const logDirectory = fixturePath(projectRoot, ".local-writing-editor");
  const logPath = join(logDirectory, "fixture-production-preview.log");
  await mkdir(logDirectory, { recursive: true });
  const child = spawn(process.execPath, [join(projectRoot, "node_modules/astro/astro.js"), "preview", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  const record = (chunk) => { output += chunk.toString(); };
  child.stdout.on("data", record);
  child.stderr.on("data", record);

  try {
    await waitForReady(origin, build.markerPath, build.marker, child, timeout);
  } catch (error) {
    await stopFixtureServer(child, port);
    await writeFile(logPath, output);
    throw error;
  }
  await writeFile(logPath, output);
  await writeManifest(projectRoot, (current) => ({
    ...current,
    createdFiles: [...new Set([...current.createdFiles, ".local-writing-editor/fixture-production-preview.log"])],
  }));
  return {
    origin,
    port,
    process: child,
    logPath,
    async stop() {
      await stopFixtureServer(child, port);
      await writeFile(logPath, output);
    },
  };
}

/**
 * Starts a development server for a fixture on its own loopback port.
 * Only this spawned process is stopped by the returned `stop` function.
 */
export async function startFixtureServer(projectRoot, { timeout, port: requestedPort } = {}) {
  if (requestedPort !== undefined) {
    assert.ok(Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65_536, "Fixture server port must be a valid TCP port");
    assert.ok(await portIsFree(requestedPort), `Fixture server port ${requestedPort} is already in use`);
  }
  const port = requestedPort ?? await availableLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const logDirectory = fixturePath(projectRoot, ".local-writing-editor");
  const logPath = join(logDirectory, "fixture-server.log");
  const markerPath = `.editor-fixture-${randomUUID()}.txt`;
  const marker = randomUUID();
  await mkdir(logDirectory, { recursive: true });
  await writeFile(fixturePath(projectRoot, join("public", markerPath)), marker);
  let output = await runFixtureCommand(projectRoot, process.execPath, ["src/scripts/generate-links.js"]);
  output += await runFixtureCommand(projectRoot, process.execPath, [join("node_modules/tsx/dist/cli.mjs"), "src/scripts/generate-topics.ts"]);
  const child = spawn(process.execPath, [join(projectRoot, "node_modules/astro/astro.js"), "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const record = (chunk) => { output += chunk.toString(); };
  child.stdout.on("data", record);
  child.stderr.on("data", record);

  try {
    await waitForReady(origin, markerPath, marker, child, timeout);
  } catch (error) {
    await stopFixtureServer(child, port);
    await writeFile(logPath, output);
    throw error;
  }
  await writeFile(logPath, output);
  await writeManifest(projectRoot, (current) => ({
    ...current,
    createdFiles: [...new Set([...current.createdFiles, ".local-writing-editor/fixture-server.log", `public/${markerPath}`])],
  }));

  return {
    origin,
    port,
    process: child,
    logPath,
    async stop() {
      await stopFixtureServer(child, port);
      await writeFile(logPath, output);
    },
  };
}

async function portIsFree(port) {
  const server = createServer();
  try {
    server.listen({ host: "127.0.0.1", port });
    await once(server, "listening");
    return true;
  } catch (error) {
    if (error.code === "EADDRINUSE") return false;
    throw error;
  } finally {
    if (server.listening) await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
}

async function stopFixtureServer(child, port) {
  if (child.exitCode !== null) return;
  const exited = once(child, "exit");
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([exited, delay(5_000)]);
  if (child.exitCode === null) process.kill(-child.pid, "SIGKILL");
  if (child.exitCode === null) await once(child, "exit");
  const deadline = Date.now() + 5_000;
  while (!(await portIsFree(port))) {
    if (Date.now() >= deadline) throw new Error(`Fixture server process group left port ${port} open`);
    await delay(100);
  }
}
