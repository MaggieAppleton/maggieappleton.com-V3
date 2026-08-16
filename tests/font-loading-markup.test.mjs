import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("serves Lato locally without a Google font import", async () => {
  const css = await readFile("src/global.css", "utf8");
  assert.doesNotMatch(css, /fonts\.(googleapis|gstatic)\.com/);
  for (const [weight, file] of [["300", "Lato-Light.woff2"], ["400", "Lato-Regular.woff2"], ["700", "Lato-Bold.woff2"]]) {
    assert.match(css, new RegExp(`@font-face\\s*{[^}]*font-family:\\s*"Lato";[^}]*url\\("/fonts/${file}"\\)[^}]*font-weight:\\s*${weight};[^}]*font-display:\\s*swap;`));
    assert.ok((await stat(`public/fonts/${file}`)).size > 0);
  }
});
