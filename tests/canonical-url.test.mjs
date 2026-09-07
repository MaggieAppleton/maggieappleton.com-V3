import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
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
