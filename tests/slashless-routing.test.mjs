import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fromRoot = (path) => new URL(`../${path}`, import.meta.url);

async function readAstroConfig() {
  const source = await readFile(fromRoot("astro.config.mjs"), "utf8");
  const executableConfig = source
    .replace(/^import\s[\s\S]*?;\n/gm, "")
    .replace(/^export default /m, "return ");
  const noopPlugin = () => ({});

  return new Function(
    "defineConfig",
    "mdx",
    "react",
    "icon",
    "remarkWikiLink",
    "remarkLongBlockquote",
    executableConfig,
  )(
    (config) => config,
    noopPlugin,
    noopPlugin,
    noopPlugin,
    noopPlugin,
    noopPlugin,
  );
}

test("declares Astro's slashless route-generation contract", async () => {
  const config = await readAstroConfig();

  assert.equal(config.site, "https://maggieappleton.com");
  assert.equal(config.trailingSlash, "never");
});

test("uses Vercel's first-class trailing-slash redirect setting only", async () => {
  const config = JSON.parse(await readFile(fromRoot("vercel.json"), "utf8"));

  assert.equal(config.trailingSlash, false);
  assert.equal(config.site, undefined, "Vercel must not replace Astro's canonical-site owner");
  assert.equal(Object.hasOwn(config, "redirects"), false);
  assert.equal(Object.hasOwn(config, "routes"), false);
  assert.ok(Array.isArray(config.headers), "existing Vercel headers must remain configured");
});

test("documents the local-versus-deployed redirect evidence boundary", async () => {
  const readme = await readFile(fromRoot("README.md"), "utf8");

  assert.match(readme, /npm run build:local[\s\S]*before a separately authorized deployment/i);
  assert.match(readme, /fast verifier[\s\S]*local destinations/i);
  assert.match(readme, /Vercel(?: preview)? smoke test/i);
  assert.match(readme, /redirect/i);
  assert.match(readme, /2026-09-07-slashless-url-normalization\.md/);
});
