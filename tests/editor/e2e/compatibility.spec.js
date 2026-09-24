import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const evidenceRoot = fileURLToPath(new URL("../../../.local-writing-editor/browser-evidence/", import.meta.url));

function editorUrl(origin, id) {
  return `${origin}/_editor?documentId=${encodeURIComponent(id)}`;
}

async function replacePhrase(page, scope, phrase, replacement) {
  await scope.evaluate((element, text) => {
    const editor = element.closest('[contenteditable="true"]');
    if (!editor) throw new Error("The article text is not editable");
    editor.focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const index = node.textContent.indexOf(text);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + text.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    throw new Error(`Cannot select ${JSON.stringify(text)} in article text`);
  }, phrase);
  await page.keyboard.insertText(replacement);
  await expect(page.getByRole("textbox", { name: "Article body" })).toContainText(replacement);
}

async function openEditor(page, origin, id) {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto(editorUrl(origin, id), { waitUntil: "domcontentloaded" });
  try {
    await expect(page.getByRole("region", { name: "Writing editor" })).toBeVisible();
    const textbox = page.getByRole("textbox", { name: "Article body" });
    await expect(textbox).toBeVisible();
    return textbox;
  } catch (error) {
    throw new Error(`${error.message}\nBrowser errors: ${browserErrors.join(" | ") || "none"}`);
  }
}

test.describe.serial("real article compatibility", () => {
  let fixture;
  let server;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    await mkdir(evidenceRoot, { recursive: true });
    fixture = await createFixtureProject({ name: "editor-compatibility" });
    server = await startFixtureServer(fixture.root, { timeout: 120_000 });
  });

  test.afterAll(async () => {
    test.setTimeout(240_000);
    try {
      if (server) {
        await server.stop();
        await copyFile(server.logPath, join(evidenceRoot, "compatibility-server.log"));
      }
    } finally {
      if (fixture) await fixture.cleanup();
    }
  });

  test("the original Astro image, grid, and Garmin interaction render inside the editor", async ({ page }) => {
    test.setTimeout(240_000);
    await openEditor(page, server.origin, "essays:growing-a-human");

    const image = page.getByRole("img", { name: "An illustration of a baby in a womb" }).first();
    await expect(image).toBeVisible();
    assert.ok(await image.evaluate((element) => element.complete && element.naturalWidth > 0), "original local image did not load");

    const grid = page.locator(".grid-container").first();
    await expect(grid).toBeVisible();
    assert.equal(await grid.evaluate((element) => getComputedStyle(element).display), "grid");
    await expect(grid.locator("img")).toHaveCount(4);

    const chart = page.locator("#garmin-chart svg").first();
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toBeVisible();
    await expect(chart.locator("path.line-hr, path.line-sleep, path.line-stress")).toHaveCount(3);
    const hoverTarget = chart.locator('rect[style*="pointer-events"]');
    await hoverTarget.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const hoverPoint = await hoverTarget.evaluate((element) => {
      const box = element.getBoundingClientRect();
      for (let y = Math.max(100, box.top + 20); y < Math.min(innerHeight - 80, box.bottom - 20); y += 40) {
        for (let x = box.left + 20; x < Math.min(innerWidth - 20, box.right - 20); x += 40) {
          if (document.elementFromPoint(x, y) === element) return { x, y };
        }
      }
      throw new Error("The original Garmin hover area has no reachable pointer target");
    });
    await page.mouse.move(hoverPoint.x, hoverPoint.y);
    await expect(page.locator("#garmin-tooltip .tooltip-date")).toBeVisible();
    await page.screenshot({ path: join(evidenceRoot, "garmin-interaction.png"), animations: "disabled" });
  });

  test("opening an authored wiki link keeps the original article clean", async ({ page }) => {
    const path = fixture.resolve("src/content/notes/cozy-web.mdx");
    const original = await readFile(path, "utf8");
    const writes = [];
    await page.route("**/_editor/api/document", async (route) => {
      if (route.request().method() === "PUT") writes.push(route.request().postData());
      await route.continue();
    });
    const editor = await openEditor(page, server.origin, "notes:cozy-web");
    await expect(editor.locator(".editor-wiki-link").filter({ hasText: "[[Neologisms]]" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Saved");
    await page.waitForTimeout(1_000);
    assert.deepEqual(writes, [], "initial wiki transform submitted an unintended save");
    await expect(page.getByRole("status")).toHaveText("Saved");
    assert.equal(await readFile(path, "utf8"), original);
  });

  test("paragraph and nested footnote edits preserve every unrelated MDX byte and shared undo", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const path = fixture.resolve("src/content/essays/lodestone.mdx");
    const original = await readFile(path, "utf8");
    const editor = await openEditor(page, server.origin, "essays:lodestone");
    const paragraph = editor.locator("p").filter({ hasText: /mostly net (good|beneficial)/ }).first();
    const footnote = editor.locator('[data-writing-component="Footnote"]')
      .filter({ hasText: /To spoil the surprise|For this example/ }).first();
    await expect(paragraph).toBeVisible();
    await expect(footnote).toBeVisible();

    await replacePhrase(page, paragraph, "mostly net good", "mostly net beneficial");
    await replacePhrase(page, footnote, "To spoil the surprise", "For this example");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");

    const expected = original.replace("mostly net good", "mostly net beneficial")
      .replace("To spoil the surprise", "For this example");
    await expect.poll(() => readFile(path, "utf8")).toBe(expected);
    await editor.focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(footnote).toContainText("To spoil the surprise");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(paragraph).toContainText("mostly net good");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(paragraph).toContainText("mostly net beneficial");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(footnote).toContainText("For this example");
    await writeFile(join(evidenceRoot, "lodestone-source-after-save.mdx"), expected);
  });

  test("saving while typing retains the live editor, caret, scroll, newest text, and preview", async ({ browser }) => {
    test.setTimeout(300_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const preview = await context.newPage();
    const path = fixture.resolve("src/content/essays/growing-a-human.mdx");
    const original = await readFile(path, "utf8");
    let releaseSave;
    let signalSaveStarted;
    const saveGate = new Promise((resolve) => { releaseSave = resolve; });
    const saveStarted = new Promise((resolve) => { signalSaveStarted = resolve; });
    let held = false;

    try {
      await page.route("**/_editor/api/document", async (route) => {
        if (route.request().method() === "PUT" && !held) {
          held = true;
          signalSaveStarted();
          await saveGate;
        }
        await route.continue();
      });
      await preview.goto(`${server.origin}/growing-a-human`, { waitUntil: "domcontentloaded" });
      const editor = await openEditor(page, server.origin, "essays:growing-a-human");
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images]
          .filter((image) => image.getClientRects().length
            && image.getBoundingClientRect().top < innerHeight * 1.5)
          .map((image) => Promise.race([
            image.decode().catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 5_000)),
          ])));
      });
      const paragraph = editor.locator("p").filter({ hasText: /first few months of being pregnant|early months of being pregnant/ }).first();
      await paragraph.scrollIntoViewIfNeeded();
      const editorNode = await editor.elementHandle();

      await replacePhrase(page, paragraph, "first few months", "early months");
      await page.getByRole("button", { name: "Save" }).click();
      await saveStarted;
      assert.equal(await readFile(path, "utf8"), original, "the held request wrote before release");

      const typingStarted = Date.now();
      await replacePhrase(page, paragraph, "Surely pregnant means pregnant?", "Surely this means pregnant?");
      const typingMilliseconds = Date.now() - typingStarted;
      const caretNode = await page.evaluateHandle(() => window.getSelection()?.anchorNode);
      const caretOffset = await page.evaluate(() => window.getSelection()?.anchorOffset);
      const scrollY = await page.evaluate(() => window.scrollY);
      releaseSave();

      await expect(page.getByRole("status")).toHaveText("Saved");
      const expected = original.replace("first few months", "early months")
        .replace("Surely pregnant means pregnant?", "Surely this means pregnant?");
      await expect.poll(() => readFile(path, "utf8")).toBe(expected);
      await expect(preview.locator("article.prose-wrapper")).toContainText("Surely this means pregnant?");
      assert.ok(await editorNode.evaluate((node) => node.isConnected && node === document.querySelector('[role="textbox"][aria-label="Article body"]')), "editor DOM instance changed after save");
      assert.ok(await caretNode.evaluate((node) => node === window.getSelection()?.anchorNode), "caret node changed after save");
      assert.equal(await page.evaluate(() => window.getSelection()?.anchorOffset), caretOffset, "caret offset changed after save");
      const savedScrollY = await page.evaluate(() => window.scrollY);
      assert.ok(Math.abs(savedScrollY - scrollY) <= 2, `scroll jumped after save: ${scrollY} -> ${savedScrollY}`);
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+z");
      await expect(paragraph).toContainText("Surely pregnant means pregnant?");

      await writeFile(join(evidenceRoot, "typing-metrics.json"), `${JSON.stringify({
        document: "essays:growing-a-human",
        millisecondsIncludingPlaywrightInput: typingMilliseconds,
        userAgent: await page.evaluate(() => navigator.userAgent),
        characters: "Surely this means pregnant?".length,
        scrollBeforeSave: scrollY,
        scrollAfterSave: savedScrollY,
      }, null, 2)}\n`);
    } finally {
      releaseSave?.();
      await context.close();
    }
  });
});
