import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  CANONICAL_ORIGIN,
  buildCanonicalUrl,
  getEntryCanonicalPath,
  normalizeCanonicalPath,
} from "../src/utils/canonical.mjs";

const fromRoot = (path) => new URL(path, `${new URL(".", import.meta.url)}../`);

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
