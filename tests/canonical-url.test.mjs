import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import {
  CANONICAL_ORIGIN,
  buildCanonicalUrl,
  getEntryCanonicalPath,
  normalizeCanonicalPath,
} from "../src/utils/canonical.mjs";

const fromRoot = (path) => new URL(path, `${new URL(".", import.meta.url)}../`);

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name, `${directory.toString().replace(/\/$/, "")}/`);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:astro|[cm]?[jt]sx?|mdx)$/i.test(entry.name)) files.push(path);
  }
  return files;
}

test("keeps the Colophon MDX component outside the pages router", async () => {
  const pageFragment = fromRoot("src/pages/colophon/colophon-content.mdx");
  const componentFragment = fromRoot("src/components/unique/colophon/ColophonContent.mdx");

  await assert.rejects(stat(pageFragment), { code: "ENOENT" });
  const [content, page] = await Promise.all([
    readFile(componentFragment, "utf8"),
    readFile(fromRoot("src/pages/colophon/index.astro"), "utf8"),
  ]);

  for (const proseMarker of [
    "I designed and built this site myself.",
    "### Technologies & Techniques",
    "### Writing and Editing Content",
    "### Typography",
    "### Growth Stages",
    "### Custom Components",
    "Addiction by Design takes readers into the intriguing world of machine gambling",
  ]) {
    assert.ok(content.includes(proseMarker), `moved Colophon content is missing: ${proseMarker}`);
  }
  assert.match(page, /import Content from "\.\.\/\.\.\/components\/unique\/colophon\/ColophonContent\.mdx";/);
});

test("marks the standalone diagram preview as non-indexable", async () => {
  const source = await readFile(fromRoot("src/pages/diagram-preview.astro"), "utf8");
  const metaTags = [...source.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag);
  const robotsMetaTags = metaTags.filter((tag) => /\bname\s*=\s*["']robots["']/i.test(tag));
  const canonicalLinkTags = [...source.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => /\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["']/i.test(tag));

  assert.equal(robotsMetaTags.length, 1, "Diagram Preview must have exactly one robots meta tag");
  assert.match(robotsMetaTags[0], /\bcontent\s*=\s*["']noindex, nofollow["']/i);
  assert.equal(canonicalLinkTags.length, 0, "Diagram Preview must not declare a canonical link");
});

test("normalizes canonical paths and builds canonical-origin URLs", () => {
  assert.equal(CANONICAL_ORIGIN, "https://maggieappleton.com");

  for (const [input, expectedPath, expectedUrl] of [
    ["/", "/", "https://maggieappleton.com/"],
    ["/about", "/about", "https://maggieappleton.com/about"],
    ["/about/", "/about", "https://maggieappleton.com/about"],
    ["/nested/path///", "/nested/path", "https://maggieappleton.com/nested/path"],
    ["/About/%7ECase/?source=verify#section", "/About/%7ECase", "https://maggieappleton.com/About/%7ECase"],
    ["/api-v1", "/api-v1", "https://maggieappleton.com/api-v1"],
    ["/api-v2", "/api-v2", "https://maggieappleton.com/api-v2"],
    ["/now-2026-08", "/now-2026-08", "https://maggieappleton.com/now-2026-08"],
    ["/now/archive/2026-08/", "/now/archive/2026-08", "https://maggieappleton.com/now/archive/2026-08"],
    ["https://maggieappleton.com/about/?source=verify#section", "/about", "https://maggieappleton.com/about"],
    ["https://maggieappleton.com:443/nested/path/?source=verify#section", "/nested/path", "https://maggieappleton.com/nested/path"],
  ]) {
    assert.equal(normalizeCanonicalPath(input), expectedPath, input);
    assert.equal(buildCanonicalUrl(input), expectedUrl, input);
  }
});

test("rejects inputs outside the canonical path contract", () => {
  for (const input of [
    undefined,
    null,
    "",
    "   ",
    "about",
    "../about",
    "//evil.test/about",
    "https://evil.test/about",
    "http://maggieappleton.com/about",
    "https://maggieappleton.com:444/about",
    "https://user:mypassword@maggieappleton.com/about",
    "ftp://maggieappleton.com/about",
    "mailto:maggie@example.test",
    "/about\\path",
    "/about\u0000",
    "https://maggieappleton.com/about\n",
  ]) {
    assert.throws(() => normalizeCanonicalPath(input), TypeError, String(input));
    assert.throws(() => buildCanonicalUrl(input), TypeError, String(input));
  }
});

test("derives entry canonical paths only for genuine folder-versioned publications", () => {
  const versionedEssay = {
    collection: "essays",
    id: "essay/essay-v1.mdx",
    data: { version: 1 },
  };
  const ordinaryVersionLikeEssay = {
    collection: "essays",
    id: "api-v1.mdx",
    data: { version: 1 },
  };
  const nowEntry = {
    collection: "now",
    id: "now-2026-08.mdx",
    data: { version: 2 },
  };

  assert.equal(getEntryCanonicalPath(versionedEssay, "/v1/essay"), "/essay");
  assert.equal(getEntryCanonicalPath(versionedEssay, "/essay"), "/essay");
  assert.equal(getEntryCanonicalPath(ordinaryVersionLikeEssay, "/api-v1/"), "/api-v1");
  assert.equal(getEntryCanonicalPath(nowEntry, "/now-2026-08/"), "/now-2026-08");
  assert.equal(getEntryCanonicalPath(undefined, "/nested/path///?source=verify"), "/nested/path");
});

test("canonical helpers are deterministic and do not mutate entries", () => {
  const entry = {
    collection: "notes",
    id: "a-nested-note/a-nested-note-v2.mdx",
    data: { version: 2 },
  };
  const before = structuredClone(entry);
  const input = "/v2/a-nested-note/?source=verify#section";

  const first = getEntryCanonicalPath(entry, input);
  const second = getEntryCanonicalPath(entry, input);
  assert.equal(first, "/a-nested-note");
  assert.equal(second, first);
  assert.equal(typeof first, "string");
  assert.deepEqual(entry, before);
  assert.equal(input, "/v2/a-nested-note/?source=verify#section");
});

test("Layout is the sole canonical-tag owner and PostLayout supplies only canonical identity", async () => {
  const [layout, postLayout, files] = await Promise.all([
    readFile(fromRoot("src/layouts/Layout.astro"), "utf8"),
    readFile(fromRoot("src/layouts/PostLayout.astro"), "utf8"),
    sourceFiles(fromRoot("src")),
  ]);
  const sourceByFile = await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")]));
  const matchingSourceFiles = (pattern) => sourceByFile
    .filter(([, source]) => pattern.test(source))
    .map(([file]) => file.pathname.replace(/^.*\/src\//, "src/"));
  const astroSEOImporters = sourceByFile
    .filter(([, source]) => /from\s+["']astro-seo["']/.test(source))
    .map(([file]) => file.pathname.replace(/^.*\/src\//, "src/"));
  const literalCanonicalLinks = sourceByFile
    .filter(([, source]) => /<link\b(?=[^>]*\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["'])[^>]*>/i.test(source))
    .map(([file]) => file.pathname.replace(/^.*\/src\//, "src/"));

  assert.deepEqual(astroSEOImporters, ["src/layouts/Layout.astro"]);
  assert.deepEqual(literalCanonicalLinks, []);
  assert.deepEqual(matchingSourceFiles(/\bgetCanonicalUrlFromEntry\b/), []);
  assert.deepEqual(matchingSourceFiles(/\bgetCanonicalUrl\b/), []);
  assert.deepEqual(matchingSourceFiles(/\bcanonicalURL=/), []);
  assert.match(layout, /import\s*\{\s*buildCanonicalUrl\s*\}\s*from\s*["']\.\.\/utils\/canonical\.mjs["'];/);
  assert.match(layout, /canonicalPath\?:\s*string;/);
  assert.doesNotMatch(layout, /canonicalURL\?:\s*string;/);
  assert.match(layout, /const canonicalURL\s*=\s*buildCanonicalUrl\(canonicalPath\s*\?\?\s*Astro\.url\.pathname\);/);
  assert.equal((layout.match(/<SEO\b[\s\S]*?\bcanonical=\{canonicalURL\}/g) ?? []).length, 1);
  assert.match(layout, /basic:\s*\{[\s\S]*?url:\s*canonicalURL,/);
  assert.match(layout, /new URL\(canonicalURL\)\.pathname/);

  assert.match(postLayout, /import\s*\{\s*getEntryCanonicalPath\s*\}\s*from\s*["']\.\.\/utils\/canonical\.mjs["'];/);
  assert.match(postLayout, /const canonicalPath\s*=\s*getEntryCanonicalPath\(entry,\s*Astro\.url\.pathname\);/);
  assert.match(postLayout, /<Layout[\s\S]*?canonicalPath=\{canonicalPath\}/);
  assert.doesNotMatch(postLayout, /canonicalURL=/);
  assert.doesNotMatch(postLayout, /getCanonicalUrlFromEntry|new URL\(/);
  assert.equal(execFileSync("git", ["diff", "--name-only", "--", "node_modules/astro-seo"], { encoding: "utf8" }).trim(), "");
});
