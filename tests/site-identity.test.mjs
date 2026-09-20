import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_ID,
  SITE_IDENTITY,
  WEBSITE_ID,
  createSiteIdentityGraph,
  serializeJsonLd,
} from "../src/utils/siteIdentity.mjs";
import { expectedSiteIdentity } from "./fixtures/site-identity.mjs";

test("creates only the stable, minimal Site and Person identity graph", () => {
  assert.equal(WEBSITE_ID, expectedSiteIdentity["@graph"][0]["@id"]);
  assert.equal(PERSON_ID, expectedSiteIdentity["@graph"][1]["@id"]);
  assert.deepEqual(createSiteIdentityGraph(), expectedSiteIdentity);
});

test("freezes identity facts and every graph level", () => {
  const graph = createSiteIdentityGraph();
  for (const value of [
    SITE_IDENTITY,
    SITE_IDENTITY.sameAs,
    graph,
    graph["@graph"],
    ...graph["@graph"],
    graph["@graph"][0].author,
    graph["@graph"][0].publisher,
    graph["@graph"][1].sameAs,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => { graph["@graph"][1].name = "Invented"; }, TypeError);
  assert.deepEqual(createSiteIdentityGraph(), expectedSiteIdentity);
});

test("serializes safe, parseable JSON-LD", () => {
  const source = { value: "</script><x>\u2028\u2029" };
  const serialized = serializeJsonLd(source);
  assert.deepEqual(JSON.parse(serialized), source);
  assert.doesNotMatch(serialized, /[<\u2028\u2029]/);
  assert.match(serialized, /\\u003c\/script>\\u003c/);
  assert.match(serialized, /\\u2028/);
  assert.match(serialized, /\\u2029/);
});
