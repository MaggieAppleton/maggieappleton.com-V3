import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(
  new URL("../src/components/mdx/InstagramFrameLink.astro", import.meta.url),
  "utf8",
).catch(() => "");

assert.match(component, /target="_blank"/);
assert.match(component, /rel="noreferrer"/);
assert.match(component, /aria-label=/);
assert.match(component, /:hover.*\.play-button/s);
assert.match(component, /:focus-visible.*\.play-button/s);
