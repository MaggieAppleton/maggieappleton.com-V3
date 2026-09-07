import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import rss from "@astrojs/rss";
import { normalizeCanonicalPath } from "../src/utils/canonical.mjs";

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

test("normalizes only the four internal feed-item link builders", async () => {
  const source = await readFile(fromRoot("src/utils/feedPublication.mjs"), "utf8");

  assert.match(source, /import\s*\{\s*normalizeCanonicalPath\s*\}\s*from\s*["']\.\/canonical\.mjs["'];/);
  assert.equal((source.match(/link:\s*normalizeCanonicalPath\(/g) ?? []).length, 4);
});

const xmlElementContents = (xml, element) => [
  ...xml.matchAll(new RegExp(`<${element}\\b[^>]*>([\\s\\S]*?)</${element}>`, "gi")),
].map(([, content]) => content.trim());

const serializedRssUrls = async (options) => {
  const xml = await (await rss(options)).text();
  const [channel] = xmlElementContents(xml, "channel");
  assert.ok(channel, "serialized RSS must include one channel");
  const channelLinks = xmlElementContents(channel, "link");
  const items = xmlElementContents(channel, "item").map((item) => ({
    link: xmlElementContents(item, "link")[0],
    guid: xmlElementContents(item, "guid")[0],
  }));

  return { channelLink: channelLinks[0], items };
};

test("proves the RSS serializer defaults to slashful channel and item URLs", async () => {
  const { channelLink, items } = await serializedRssUrls({
    title: "Test feed",
    description: "Test description",
    site: "https://example.test",
    items: [{ title: "An item", link: "/slashless-item" }],
  });

  assert.equal(channelLink, "https://example.test/");
  assert.equal(items[0].link, "https://example.test/slashless-item/");
  assert.equal(items[0].guid, "https://example.test/slashless-item/");
});

test("keeps RSS channel, link, and guid URLs slashless when configured", async () => {
  const { channelLink, items } = await serializedRssUrls({
    title: "Test feed",
    description: "Test description",
    site: "https://example.test",
    trailingSlash: false,
    items: [
      { title: "Flat", link: "/flat-item" },
      { title: "Nested", link: "/nested/item" },
    ],
  });

  assert.equal(channelLink, "https://example.test");
  assert.deepEqual(items.map(({ link }) => link), [
    "https://example.test/flat-item",
    "https://example.test/nested/item",
  ]);
  assert.deepEqual(items.map(({ guid }) => guid), [
    "https://example.test/flat-item",
    "https://example.test/nested/item",
  ]);
});

test("configures both feed endpoints to preserve slashless serialization", async () => {
  for (const path of ["src/pages/rss.xml.js", "src/pages/smidgeons.xml.js"]) {
    const source = await readFile(fromRoot(path), "utf8");
    assert.equal((source.match(/\btrailingSlash\s*:\s*false\b/g) ?? []).length, 1, `${path} must configure RSS trailingSlash: false`);
  }
});

test("makes generated backlink targets root-relative and slashless", async () => {
  const source = await readFile(fromRoot("src/components/layouts/Backlinks.astro"), "utf8");

  assert.match(source, /import\s*\{\s*normalizeCanonicalPath\s*\}\s*from\s*["']\.\.\/\.\.\/utils\/canonical\.mjs["'];/);
  assert.match(source, /href=\{normalizeCanonicalPath\(`\/\$\{backlink\.slug\}`\)\}/);

  for (const [slug, expected] of [
    ["flat-post", "/flat-post"],
    ["nested/essay", "/nested/essay"],
    ["api-v2", "/api-v2"],
  ]) {
    assert.equal(normalizeCanonicalPath(`/${slug}`), expected);
  }
});

test("keeps generated link-map slugs unprefixed and slashless", async () => {
  const linkMaps = JSON.parse(await readFile(fromRoot("src/links.json"), "utf8"));
  const entries = Object.values(linkMaps).flatMap((entry) => [
    entry,
    ...(entry.outboundLinks ?? []),
    ...(entry.inboundLinks ?? []),
  ]);

  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.equal(typeof entry.slug, "string");
    assert.ok(entry.slug.length > 0);
    assert.equal(entry.slug.startsWith("/"), false);
    assert.equal(entry.slug.endsWith("/"), false);
  }
});

test("retains the scoped slashless-link and Webmention compatibility contracts", async () => {
  const sources = Object.fromEntries(await Promise.all([
    "src/plugins/remark-wiki-link.js",
    "src/components/layouts/navbar/MainNavLinks.astro",
    "src/pages/topics/[topic].astro",
    "src/components/layouts/VersionDropdown.astro",
    "src/components/layouts/VersionWarning.astro",
    "src/components/layouts/WebMentions.astro",
    ...["EssayCard", "NoteCard", "PatternCard", "TalkCard", "NowCard", "SmidgeonCard"].map(
      (name) => `src/components/cards/${name}.astro`,
    ),
  ].map(async (path) => [path, await readFile(fromRoot(path), "utf8")])));

  assert.match(sources["src/plugins/remark-wiki-link.js"], /value:\s*`\/\$\{matchedPost\.slug\}`/);

  const navbarPaths = [...sources["src/components/layouts/navbar/MainNavLinks.astro"].matchAll(/href="(\/[^"?#]*)"/g)]
    .map(([, href]) => href);
  assert.ok(navbarPaths.length > 0);
  assert.ok(navbarPaths.every((href) => href === "/" || !href.endsWith("/")));

  assert.match(sources["src/pages/topics/[topic].astro"], /href="\/garden"/);
  assert.match(sources["src/pages/topics/[topic].astro"], /slug=\{`now-\$\{post\.id\}`\}/);
  for (const name of ["EssayCard", "NoteCard", "PatternCard", "TalkCard", "NowCard", "SmidgeonCard"]) {
    assert.match(sources[`src/components/cards/${name}.astro`], /href=\{`\/\$\{slug\}`\}/);
  }
  assert.match(sources["src/components/layouts/VersionDropdown.astro"], /\? `\/\$\{versionInfo\.baseSlug\}`\s*:\s*`\/v\$\{versionNum\}\/\$\{versionInfo\.baseSlug\}`/);
  assert.match(sources["src/components/layouts/VersionWarning.astro"], /const latestUrl = `\/\$\{versionInfo\.baseSlug\}`/);

  const webMentions = sources["src/components/layouts/WebMentions.astro"];
  for (const variant of [
    "target === baseUrl",
    "target === `${baseUrl}/`",
    "target === `${baseUrl}.mdx`",
    "target === `${baseUrl}.mdx/`",
    "target.startsWith(`${baseUrl}?`)",
  ]) {
    assert.ok(webMentions.includes(variant), `WebMention compatibility variant missing: ${variant}`);
  }
});
