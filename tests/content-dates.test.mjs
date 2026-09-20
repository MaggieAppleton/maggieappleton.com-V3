import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { z } from "astro/zod";
import { createSitemapRecords } from "../src/utils/sitemap.mjs";

test("content schemas reject authored calendar rollover before sitemap date coercion", async () => {
  // Resolve Astro's virtual export to its real implementations, without starting a server.
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins: [{
      name: "content-schema-test",
      resolveId: (id) => id === "astro:content" ? "\0astro:content" : undefined,
      load: (id) => id === "\0astro:content"
        ? 'export { defineCollection } from "astro/content/runtime"; export { z } from "astro/zod";'
        : undefined,
    }],
  });
  try {
    const { collections } = await vite.ssrLoadModule("/src/content/config.ts");
    for (const [collection, type] of [["essays", "essay"], ["notes", "note"], ["patterns", "pattern"], ["talks", "talk"]]) {
      const schema = collections[collection].schema({ image: () => z.string() });
      const authored = {
        title: "Calendar fixture", description: "Calendar fixture", type,
        cover: "cover.png", topics: [], conferences: [], growthStage: "budding",
        startDate: "2026-01-01", updated: "2024-02-29",
      };
      const records = (data) => createSitemapRecords({
        staticPaths: [], entries: [{ collection, id: "calendar-fixture", data: schema.parse(data) }],
      });
      assert.deepEqual(records(authored), [{ loc: "https://maggieappleton.com/calendar-fixture", lastmod: "2024-02-29" }]);
      assert.deepEqual(records({ ...authored, updated: "2026-03-01T00:30:00+01:00" }), [
        { loc: "https://maggieappleton.com/calendar-fixture", lastmod: "2026-02-28" },
      ]);
      assert.deepEqual(records({ ...authored, updated: new Date("2024-02-29") }), [
        { loc: "https://maggieappleton.com/calendar-fixture", lastmod: "2024-02-29" },
      ]);
      for (const updated of ["2026-02-31", "2025-02-29", "1900-02-29", "2026-04-31T12:00:00Z"]) {
        assert.throws(() => records({ ...authored, updated }), /Invalid authored calendar date/, `${collection}: ${updated}`);
      }
      assert.throws(() => records({ ...authored, startDate: "2026-02-31" }), /Invalid authored calendar date/);
    }
  } finally {
    await vite.close();
  }
});
