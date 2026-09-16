import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  PAGE_DESCRIPTIONS,
  assertP8DescriptionLength,
  describeNow,
  describeSmidgeon,
  describeTopic,
  isMeaningfulDescription,
  requirePageDescription,
} from "../src/utils/descriptions.mjs";
import { createSiteIdentityGraph, SITE_IDENTITY } from "../src/utils/siteIdentity.mjs";

const expectedDescriptions = {
  home: "Maggie Appleton's digital garden of visual essays, notes, and patterns about programming, design, anthropology, and software.",
  about: "Designer, anthropologist, and mediocre developer.",
  garden: "A growing collection of essays, notes, talks, podcasts, and half-baked explorations, gathered and tended over time.",
  essays: "Opinionated, longform narrative writing with an agenda, collected in Maggie Appleton's digital garden.",
  notes: "Loose, unopinionated notes on things Maggie Appleton doesn't entirely understand yet.",
  patterns: "A catalogue of design patterns gathered from Maggie Appleton's own observations and research.",
  talks: "Occasional talks on visual programming, cultural anthropology, design tactics, software narratives, and the effects of thoughtless AI.",
  podcasts: "Interviews and casual chats on digital gardening, artificial intelligence, and metaphors, gathered from various podcasts.",
  now: "A sporadically updated log of what Maggie Appleton is reading, exploring, and thinking about.",
  smidgeons: "A stream of interesting links, papers, and tiny thoughts – roughly what Maggie Appleton is reading and thinking about.",
  library: "Books Maggie Appleton has read that significantly influenced how she sees the world.",
  antilibrary: "Books Maggie Appleton likes the idea of having read, collected in the site's antilibrary.",
  colophon: "How Maggie Appleton's digital garden was made, from its tools and typography to its content and visual design.",
};

test("publishes the approved shared descriptions with P8 length policy", async () => {
  assert.deepEqual(PAGE_DESCRIPTIONS, expectedDescriptions);
  assert.equal(Object.hasOwn(PAGE_DESCRIPTIONS, "hireMe"), false);
  const longDescriptions = Object.entries(PAGE_DESCRIPTIONS).filter(([key]) => key !== "about");
  assert.equal(new Set(longDescriptions.map(([, value]) => value)).size, longDescriptions.length);
  for (const [key, value] of longDescriptions) {
    assert.equal(isMeaningfulDescription(value, SITE_IDENTITY.websiteDescription), true, key);
    assert.ok([...value].length >= DESCRIPTION_MIN_LENGTH, key);
    assert.ok([...value].length <= DESCRIPTION_MAX_LENGTH, key);
    assert.equal(assertP8DescriptionLength(value, key), value);
  }
  assert.equal(PAGE_DESCRIPTIONS.about, "Designer, anthropologist, and mediocre developer.");
  assert.equal(isMeaningfulDescription(PAGE_DESCRIPTIONS.about, SITE_IDENTITY.websiteDescription), true);

  const hireMe = await readFile(new URL("../src/content/pages/hire-me.mdx", import.meta.url), "utf8");
  const hireDescription = hireMe.match(/^description:\s*["']([^"']+)["']$/m)?.[1];
  assert.equal(isMeaningfulDescription(hireDescription, SITE_IDENTITY.websiteDescription), true);
  assert.ok([...hireDescription].length >= DESCRIPTION_MIN_LENGTH);
  assert.ok([...hireDescription].length <= DESCRIPTION_MAX_LENGTH);
  assert.equal(new Set([...longDescriptions.map(([, value]) => value), hireDescription]).size, longDescriptions.length + 1);
});

test("composes bounded topic, Now, and Smidgeon descriptions without truncation", () => {
  assert.equal(
    describeTopic("Web Development"),
    "Essays, notes, patterns, and Smidgeons related to Web Development, gathered from Maggie Appleton's digital garden.",
  );
  assert.equal(
    describeNow("August 2026"),
    "A snapshot of what Maggie Appleton was reading, exploring, and thinking about in August 2026.",
  );
  assert.equal(
    describeSmidgeon("Common Misconceptions in AI"),
    "A smidgeon from Maggie Appleton's reading stream – an interesting link, paper, or tiny thought: Common Misconceptions in AI.",
  );
  for (const fn of [describeTopic, describeNow, describeSmidgeon]) {
    for (const value of [undefined, "", "   ", "...", SITE_IDENTITY.websiteDescription]) {
      assert.throws(() => fn(value), /meaningful/i);
    }
  }
  assert.throws(() => describeNow("x".repeat(200)), RangeError);
  assert.throws(() => describeSmidgeon("x".repeat(200)), RangeError);
  assert.throws(() => describeTopic("x".repeat(200)), RangeError);
});

test("requires explicit meaningful page metadata and enforces Unicode bounds", () => {
  for (const value of [undefined, null, "", "  ", "...", SITE_IDENTITY.websiteDescription]) {
    assert.throws(
      () => requirePageDescription(value, "/example", SITE_IDENTITY.websiteDescription),
      /\/example: page metadata requires a meaningful explicit description/,
    );
  }
  assert.equal(requirePageDescription("  A useful description.  ", "ctx", "generic"), "A useful description.");
  assert.throws(() => assertP8DescriptionLength("x".repeat(79), "short"), RangeError);
  assert.throws(() => assertP8DescriptionLength("x".repeat(161), "long"), RangeError);
  assert.equal(assertP8DescriptionLength("🙂".repeat(80), "unicode"), "🙂".repeat(80));
});

test("uses the P5 Site identity as the only generic description source", async () => {
  const source = await readFile(new URL("../src/utils/descriptions.mjs", import.meta.url), "utf8");
  assert.match(source, /import\s*\{\s*SITE_IDENTITY\s*\}\s*from\s*["']\.\/siteIdentity\.mjs["']/);
  assert.match(source, /SITE_IDENTITY\.websiteDescription/);
  assert.doesNotMatch(source, /GENERIC_SITE_DESCRIPTION/);
  assert.equal(createSiteIdentityGraph()["@graph"][0].description, SITE_IDENTITY.websiteDescription);
  assert.equal(isMeaningfulDescription(SITE_IDENTITY.websiteDescription, SITE_IDENTITY.websiteDescription), false);
});

test("Layout has one explicit resolved description path", async () => {
  const source = await readFile(new URL("../src/layouts/Layout.astro", import.meta.url), "utf8");
  assert.match(source, /isMeaningfulDescription/);
  assert.match(source, /requirePageDescription/);
  assert.match(source, /requirePageDescription\(\s*desc\s*,\s*canonicalURL\s*,\s*SITE_IDENTITY\.websiteDescription/s);
  assert.match(source, /const resolvedDescription\s*=\s*normalizedPageMetadata !== false/s);
  assert.match(source, /description=\{resolvedDescription\}/);
  assert.match(source, /description:\s*resolvedDescription/);
  assert.match(source, /optional:[\s\S]*description:\s*resolvedDescription/);
  assert.doesNotMatch(source, /DEFAULT_DESCRIPTION|desc\s*\|\|\s*DEFAULT_DESCRIPTION/);
});

test("all static and topic page metadata calls use the approved source map", async () => {
  const pages = {
    index: "home", about: "about", garden: "garden", essays: "essays", notes: "notes",
    patterns: "patterns", talks: "talks", podcasts: "podcasts", now: "now", smidgeons: "smidgeons",
    library: "library", antilibrary: "antilibrary",
  };
  for (const [file, key] of Object.entries(pages)) {
    const source = await readFile(new URL(`../src/pages/${file}.astro`, import.meta.url), "utf8");
    assert.match(source, /PAGE_DESCRIPTIONS/);
    assert.match(source, new RegExp(`desc=\\{PAGE_DESCRIPTIONS\\.${key}\\}`));
  }
  const colophon = await readFile(new URL("../src/pages/colophon/index.astro", import.meta.url), "utf8");
  assert.match(colophon, /PAGE_DESCRIPTIONS\.colophon/);
  assert.match(colophon, /desc=\{PAGE_DESCRIPTIONS\.colophon\}/);
  const topic = await readFile(new URL("../src/pages/topics/[topic].astro", import.meta.url), "utf8");
  assert.match(topic, /describeTopic/);
  assert.match(topic, /const description\s*=\s*describeTopic\(topicName\)/);
  assert.match(topic, /desc=\{description\}/);
  const hire = await readFile(new URL("../src/pages/hire-me.astro", import.meta.url), "utf8");
  assert.match(hire, /getEntry\(["']pages["'],\s*["']hire-me["']\)/);
  assert.match(hire, /desc=\{page\.data\.description\}/);
});

test("Now and Smidgeon detail layouts use public-only local-title descriptions", async () => {
  const now = await readFile(new URL("../src/pages/now-[slug]/[...rest].astro", import.meta.url), "utf8");
  assert.match(now, /describeNow/);
  assert.match(now, /const description\s*=\s*isPublicEntry\(entry\)[\s\S]*describeNow\(entry\.data\.title\)/);
  assert.match(now, /desc=\{description\}/);
  const smidgeon = await readFile(new URL("../src/layouts/SmidgeonLayout.astro", import.meta.url), "utf8");
  assert.match(smidgeon, /describeSmidgeon/);
  assert.match(smidgeon, /const description\s*=\s*isPublicEntry\(entry\)[\s\S]*describeSmidgeon\(frontmatter\.title\)/);
  assert.match(smidgeon, /desc=\{description\}/);
  for (const source of [now, smidgeon]) {
    assert.match(source, /type:\s*["']webpage["']/);
    assert.doesNotMatch(source, /type:\s*["']article["']/);
  }
  const post = await readFile(new URL("../src/layouts/PostLayout.astro", import.meta.url), "utf8");
  assert.match(post, /desc=\{frontmatter\.description\}/);
});

function parseFrontmatter(source) {
  const fence = source.match(/^---\n([\s\S]*?)\n---/);
  const values = {};
  for (const line of fence?.[1].split("\n") ?? []) {
    const match = line.match(/^(title|description|draft):\s*(?:"([^"]*)"|'([^']*)'|(true|false))\s*$/);
    if (match) values[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return values;
}

async function contentFiles(collection) {
  const root = new URL(`../src/content/${collection}/`, import.meta.url);
  const names = await readdir(root, { recursive: true });
  return names.filter((name) => name.endsWith(".mdx")).map((name) => join(root.pathname, name));
}

test("public Article frontmatter is meaningful, unique, and contains only the four approved repairs", async () => {
  const repairs = {
    "src/content/notes/ai-profilepics.mdx": "An illustrated note on novelty oil paintings, cheap aesthetics, and the effect of generative AI on portraiture.",
    "src/content/notes/post-pull-request.mdx": "A sketch of agentic software work beyond pull requests, with lighter review checkpoints, richer context, and an audit trail.",
    "src/content/patterns/visual-expressions.mdx": "A design pattern for making formulas and expressions easier to read and edit through labelled visual structure.",
    "src/content/talks/tools-thought-talk.mdx": "A talk about tools for thought as cultural practices: their history, social assumptions, and what designers build around them.",
  };
  const seen = new Map();
  for (const collection of ["essays", "notes", "patterns", "talks"]) {
    for (const path of await contentFiles(collection)) {
      const source = await readFile(path, "utf8");
      const data = parseFrontmatter(source);
      if (data.draft === "true") continue;
      assert.equal(isMeaningfulDescription(data.description, SITE_IDENTITY.websiteDescription), true, path);
      assert.ok(data.description, path);
      if (seen.has(data.description)) assert.fail(`duplicate description: ${path} and ${seen.get(data.description)}`);
      seen.set(data.description, path);
    }
  }
  for (const [relative, expected] of Object.entries(repairs)) {
    const source = await readFile(new URL(`../${relative}`, import.meta.url), "utf8");
    assert.equal(parseFrontmatter(source).description, expected, relative);
    assertP8DescriptionLength(expected, relative);
  }
  assert.equal(parseFrontmatter(await readFile(new URL("../src/content/notes/ai-profilepics.mdx", import.meta.url), "utf8")).draft, "true");
  assert.equal(parseFrontmatter(await readFile(new URL("../src/content/notes/post-pull-request.mdx", import.meta.url), "utf8")).draft, "true");
  assert.equal(parseFrontmatter(await readFile(new URL("../src/content/patterns/visual-expressions.mdx", import.meta.url), "utf8")).draft, "true");
  const synthetic = parseFrontmatter("---\ndescription: \"...\"\n---\nbody description: \"good\"");
  assert.equal(synthetic.description, "...");
});
