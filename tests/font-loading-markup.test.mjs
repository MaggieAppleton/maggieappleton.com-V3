import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("serves Lato locally without a Google font import", async () => {
  const css = await readFile("src/global.css", "utf8");
  assert.doesNotMatch(css, /fonts\.(googleapis|gstatic)\.com/);
  for (const [weight, file] of [["300", "Lato-Light.woff2"], ["400", "Lato-Regular.woff2"], ["700", "Lato-Bold.woff2"]]) {
    assert.match(css, new RegExp(`@font-face\\s*{[^}]*font-family:\\s*"Lato";[^}]*url\\("/fonts/${file}"\\)[^}]*font-weight:\\s*${weight};[^}]*font-display:\\s*swap;`));
    assert.ok((await stat(`public/fonts/${file}`)).size > 0);
  }
});

async function readBrowserArtifacts(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      contents.push(...(await readBrowserArtifacts(path)));
    } else if (path.endsWith(".js") || path.endsWith(".css")) {
      contents.push(await readFile(path, "utf8"));
    }
  }
  return contents;
}

test("emits homepage browser artifacts without Google font origins", async () => {
  const artifacts = [await readFile("dist/index.html", "utf8"), ...(await readBrowserArtifacts("dist/_astro"))];
  for (const artifact of artifacts) {
    assert.doesNotMatch(artifact, /fonts\.(googleapis|gstatic)\.com/);
  }
});
