import assert from "node:assert/strict";
import test from "node:test";
import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  PAGE_DESCRIPTIONS,
  assertDescriptionLength,
  describeNow,
  describeSmidgeon,
  describeTopic,
  isMeaningfulDescription,
  requirePageDescription,
} from "../src/utils/descriptions.mjs";
import { SITE_IDENTITY } from "../src/utils/siteIdentity.mjs";

test("shared page descriptions are meaningful, bounded, and distinct", () => {
  const entries = Object.entries(PAGE_DESCRIPTIONS);
  assert.equal(new Set(entries.map(([, value]) => value)).size, entries.length);

  for (const [key, value] of entries) {
    assert.equal(isMeaningfulDescription(value, SITE_IDENTITY.websiteDescription), true, key);
    assert.ok([...value].length <= DESCRIPTION_MAX_LENGTH, key);
    if (key !== "about") assert.ok([...value].length >= DESCRIPTION_MIN_LENGTH, key);
  }
});

test("dynamic descriptions reject placeholders and overlong titles", () => {
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
    assert.throws(() => fn("x".repeat(200)), RangeError);
  }
});

test("explicit descriptions enforce meaningful Unicode bounds", () => {
  for (const value of [undefined, null, "", "  ", "...", SITE_IDENTITY.websiteDescription]) {
    assert.throws(() => requirePageDescription(value, "/example", SITE_IDENTITY.websiteDescription));
  }
  assert.equal(requirePageDescription("  A useful description.  ", "ctx", "generic"), "A useful description.");
  assert.throws(() => assertDescriptionLength("x".repeat(79), "short"), RangeError);
  assert.throws(() => assertDescriptionLength("x".repeat(161), "long"), RangeError);
  assert.equal(assertDescriptionLength("🙂".repeat(80), "unicode"), "🙂".repeat(80));
});
