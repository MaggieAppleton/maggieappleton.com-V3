import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_ORIGIN,
  buildCanonicalUrl,
  getEntryCanonicalPath,
  normalizeCanonicalPath,
} from "../src/utils/canonical.mjs";

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
    ["https://maggieappleton.com/about?next=/a/../b", "/about", "https://maggieappleton.com/about"],
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
    "/a/./b",
    "/a/../b",
    "/a/%2e/b",
    "/a/%2E%2E/b",
    "https://maggieappleton.com/a/../b",
    "https://maggieappleton.com/a/%2e%2e/b",
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
