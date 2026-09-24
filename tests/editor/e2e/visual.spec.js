import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const evidenceRoot = fileURLToPath(new URL("../../../.local-writing-editor/browser-evidence/", import.meta.url));
const posts = [
  { name: "cozy-web", id: "notes:cozy-web", preview: "/cozy-web", text: "The predators here are the advertisers", imageAlt: "Layered diagram of the cozy web" },
  { name: "lodestone", id: "essays:lodestone", preview: "/lodestone", text: "briefly put aside the fact", imageAlt: "A lodestone with small pieces of metal" },
  { name: "growing-a-human", id: "essays:growing-a-human", preview: "/growing-a-human", text: "For the first few months of being pregnant", imageAlt: "An illustration of a baby in a womb" },
];
const viewports = [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }];

async function settleVisibleMedia(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images].filter((image) => image.getBoundingClientRect().top < innerHeight * 1.5);
    return Promise.all(images.map(async (image) => {
      const result = await Promise.race([
        image.decode().then(() => "loaded", () => "failed"),
        new Promise((resolve) => setTimeout(() => resolve("timed-out"), 5000)),
      ]);
      return { alt: image.alt, result, width: image.naturalWidth };
    }));
  });
}

async function measure(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const lineHeight = Number.parseFloat(style.lineHeight);
    return {
      fontFamily: style.fontFamily,
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight,
      marginBottom: Number.parseFloat(style.marginBottom),
      x: box.x,
      width: box.width,
      height: box.height,
      lines: Number.isFinite(lineHeight) && lineHeight > 0 ? Math.round(box.height / lineHeight) : null,
    };
  });
}

function assertTextParity(normal, editing, label) {
  assert.equal(editing.fontFamily, normal.fontFamily, `${label}: font family`);
  assert.ok(Math.abs(editing.fontSize - normal.fontSize) <= 0.5, `${label}: font size ${editing.fontSize} vs ${normal.fontSize}`);
  assert.ok(Math.abs(editing.lineHeight - normal.lineHeight) <= 1, `${label}: line height ${editing.lineHeight} vs ${normal.lineHeight}`);
  assert.ok(Math.abs(editing.width - normal.width) <= 4, `${label}: width ${editing.width} vs ${normal.width}`);
  assert.ok(Math.abs(editing.marginBottom - normal.marginBottom) <= 2,
    `${label}: paragraph spacing ${editing.marginBottom} vs ${normal.marginBottom}`);
  if (normal.lines !== null && editing.lines !== null) {
    assert.ok(Math.abs(editing.lines - normal.lines) <= 1, `${label}: line wrapping ${editing.lines} vs ${normal.lines}`);
  }
}

async function measureStyles(locator, properties) {
  return locator.evaluate((element, names) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return { ...Object.fromEntries(names.map((name) => [name, style[name]])),
      width: box.width, height: box.height };
  }, properties);
}

function assertStylesMatch(normal, editing, properties, label) {
  for (const property of properties) {
    const left = normal[property];
    const right = editing[property];
    const leftPixels = /^-?\d+(?:\.\d+)?px$/.test(left ?? "") ? Number.parseFloat(left) : null;
    const rightPixels = /^-?\d+(?:\.\d+)?px$/.test(right ?? "") ? Number.parseFloat(right) : null;
    if (leftPixels !== null && rightPixels !== null) {
      assert.ok(Math.abs(leftPixels - rightPixels) <= 2,
        `${label}: ${property} ${right} vs ${left}`);
    } else assert.equal(right, left, `${label}: ${property}`);
  }
  assert.ok(Math.abs(editing.width - normal.width) <= 4,
    `${label}: width ${editing.width} vs ${normal.width}`);
}

async function captureRegionPair(normal, editing, normalTarget, editingTarget, prefix, name) {
  await normalTarget.scrollIntoViewIfNeeded();
  await editingTarget.scrollIntoViewIfNeeded();
  await settleVisibleMedia(normal);
  await settleVisibleMedia(editing);
  await normal.screenshot({ path: join(evidenceRoot, `${prefix}-${name}-normal.png`), animations: "disabled" });
  await editing.screenshot({ path: join(evidenceRoot, `${prefix}-${name}-editing.png`), animations: "disabled" });
}

test.describe("published article and writing surface visual parity", () => {
  let fixture;
  let server;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    await mkdir(evidenceRoot, { recursive: true });
    fixture = await createFixtureProject({ name: "editor-visual" });
    server = await startFixtureServer(fixture.root, { timeout: 120_000 });
  });

  test.afterAll(async () => {
    test.setTimeout(240_000);
    try {
      if (server) {
        await server.stop();
        await copyFile(server.logPath, join(evidenceRoot, "visual-server.log"));
      }
    } finally {
      if (fixture) await fixture.cleanup();
    }
  });

  for (const post of posts) for (const viewport of viewports) {
    test(`${post.name} at ${viewport.width}×${viewport.height}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const normal = await context.newPage();
      const editing = await context.newPage();
      const prefix = `${post.name}-${viewport.width}`;

      try {
        await normal.goto(`${server.origin}${post.preview}`, { waitUntil: "domcontentloaded" });
        await editing.goto(`${server.origin}/_editor?documentId=${encodeURIComponent(post.id)}`, { waitUntil: "domcontentloaded" });
        await expect(editing.getByRole("region", { name: "Writing editor" })).toBeVisible();
        const editor = editing.getByRole("textbox", { name: "Article body" });
        await expect(editor).toBeVisible();

        const normalMedia = await settleVisibleMedia(normal);
        const editorMedia = await settleVisibleMedia(editing);
        const normalBody = normal.locator("article.prose-wrapper p").filter({ hasText: post.text }).first();
        const editingBody = editor.locator("p").filter({ hasText: post.text }).first();
        await expect(normalBody).toBeVisible();
        await expect(editingBody).toBeVisible();

        const metrics = {
          normal: { title: await measure(normal.locator(".header-section h1").first()), body: await measure(normalBody), media: normalMedia },
          editing: { title: await measure(editing.locator(".header-section h1").first()), body: await measure(editingBody), media: editorMedia },
        };
        await writeFile(join(evidenceRoot, `${prefix}-metrics.json`), `${JSON.stringify(metrics, null, 2)}\n`);
        assertTextParity(metrics.normal.title, metrics.editing.title, `${prefix} title`);
        assertTextParity(metrics.normal.body, metrics.editing.body, `${prefix} body`);

        const dropCapProperties = ["fontFamily", "fontSize", "lineHeight", "float", "marginRight", "position"];
        const normalDropCap = normal.locator("p.intro-paragraph .drop-cap").first();
        const editingDropCap = editor.locator('[data-writing-component="IntroParagraph"] .drop-cap').first();
        await expect(normalDropCap).toBeVisible();
        await expect(editingDropCap).toBeVisible();
        const dropCapStyles = {
          normal: await measureStyles(normalDropCap, dropCapProperties),
          editing: await measureStyles(editingDropCap, dropCapProperties),
        };
        assertStylesMatch(dropCapStyles.normal, dropCapStyles.editing,
          dropCapProperties, `${prefix} intro drop cap`);
        await writeFile(join(evidenceRoot, `${prefix}-drop-cap.json`),
          `${JSON.stringify(dropCapStyles, null, 2)}\n`);

        await normal.screenshot({ path: join(evidenceRoot, `${prefix}-normal.png`), animations: "disabled" });
        await editing.screenshot({ path: join(evidenceRoot, `${prefix}-editing.png`), animations: "disabled" });

        const normalImage = normal.getByRole("img", { name: new RegExp(post.imageAlt, "i") }).first();
        const editingImage = editing.getByRole("img", { name: new RegExp(post.imageAlt, "i") }).first();
        await captureRegionPair(normal, editing, normalImage, editingImage, prefix, "image");
        const imageState = {
          normal: await normalImage.evaluate((element) => ({ width: element.naturalWidth, displayed: element.getBoundingClientRect().width })),
          editing: await editingImage.evaluate((element) => ({ width: element.naturalWidth, displayed: element.getBoundingClientRect().width })),
        };
        if (post.name !== "cozy-web") {
          assert.ok(imageState.normal.width > 0 && imageState.editing.width > 0, `${prefix}: local image did not render`);
          assert.ok(Math.abs(imageState.normal.displayed - imageState.editing.displayed) <= 4, `${prefix}: image width drift`);
        }
        await writeFile(join(evidenceRoot, `${prefix}-image.json`), `${JSON.stringify(imageState, null, 2)}\n`);

        if (post.name === "growing-a-human") {
          const normalChart = normal.locator("#garmin-chart svg").first();
          const editingChart = editor.locator("#garmin-chart svg").first();
          await expect(editingChart).toBeVisible();
          await captureRegionPair(normal, editing, normalChart, editingChart, prefix, "garmin");
          const normalGrid = normal.locator(".grid-container").first();
          const editingGrid = editor.locator(".grid-container").first();
          await expect(editingGrid).toBeVisible();
          await captureRegionPair(normal, editing, normalGrid, editingGrid, prefix, "grid");
          const widths = { normal: (await normalGrid.boundingBox()).width, editing: (await editingGrid.boundingBox()).width };
          assert.ok(Math.abs(widths.normal - widths.editing) <= 4, `${prefix}: full-width grid drift`);
          await writeFile(join(evidenceRoot, `${prefix}-grid.json`), `${JSON.stringify(widths, null, 2)}\n`);
        }
        if (post.name === "lodestone") {
          const assumedProperties = ["display", "flexDirection", "gap", "paddingTop", "paddingRight",
            "marginLeft", "marginRight", "borderTopWidth", "borderTopColor", "fontFamily"];
          const normalAudience = normal.locator(".assumed-audience").first();
          const editingAudience = editing.locator('[data-writing-component="AssumedAudience"]').first();
          const audienceStyles = {
            normal: await measureStyles(normalAudience, assumedProperties),
            editing: await measureStyles(editingAudience, assumedProperties),
          };
          assertStylesMatch(audienceStyles.normal, audienceStyles.editing,
            assumedProperties, `${prefix} AssumedAudience`);
          await writeFile(join(evidenceRoot, `${prefix}-audience.json`),
            `${JSON.stringify(audienceStyles, null, 2)}\n`);
          await captureRegionPair(normal, editing, normalAudience, editingAudience, prefix, "audience");

          const footnoteProperties = ["display", "float", "position", "marginRight", "fontSize",
            "lineHeight", "borderLeftWidth", "paddingLeft"];
          const normalFootnote = normal.locator(".footnote-container .footnote").first();
          const editingFootnote = editing.locator('[data-writing-component="Footnote"] .footnote').first();
          if (viewport.width <= 1420) {
            await normal.locator(".footnote-container label.footnote-number").first().click();
            await editing.locator('[data-writing-component="Footnote"] label.footnote-number').first().click();
            await expect(normalFootnote).toBeVisible();
            await expect(editingFootnote).toBeVisible();
          }
          const footnoteStyles = {
            normal: await measureStyles(normalFootnote, footnoteProperties),
            editing: await measureStyles(editingFootnote, footnoteProperties),
          };
          assertStylesMatch(footnoteStyles.normal, footnoteStyles.editing,
            footnoteProperties, `${prefix} Footnote`);
          await writeFile(join(evidenceRoot, `${prefix}-footnote.json`),
            `${JSON.stringify(footnoteStyles, null, 2)}\n`);
          await captureRegionPair(
            normal,
            editing,
            normal.locator(".footnote-container").first(),
            editing.locator('[data-writing-component="Footnote"]').first(),
            prefix,
            "footnote",
          );
        }
      } finally {
        await context.close();
      }
    });
  }
});
