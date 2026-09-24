import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const inline = '<span data-fixture="protected-inline">INLINE REGION</span>';
const block = '<aside data-fixture="protected-block">BLOCK REGION</aside>';
const source = `---
title: Protected content fixture
description: Synthetic protected inline and block content.
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

<IntroParagraph>Opening prose.<Footnote idName="fixture-footnote">Nested footnote prose.</Footnote></IntroParagraph>

Before ${inline} after.

${block}

Closing editable paragraph.
`;

test.describe("protected inline and block content", () => {
  let fixture;
  let server;
  let documentId;
  let sourcePath;
  const documents = [];
  let nextDocument = 0;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    fixture = await createFixtureProject({ name: "editor-protected-content" });
    for (let index = 0; index < 5; index++) {
      const slug = `protected-${randomUUID().slice(0, 8)}`;
      const relative = `src/content/notes/${slug}.mdx`;
      documents.push({ documentId: `notes:${slug}`, sourcePath: fixture.resolve(relative) });
      await fixture.write(relative, source);
    }
    server = await startFixtureServer(fixture.root, { timeout: 120_000 });
  });

  test.beforeEach(() => {
    ({ documentId, sourcePath } = documents[nextDocument++]);
  });

  test.afterAll(async () => {
    test.setTimeout(240_000);
    try { if (server) await server.stop(); }
    finally { if (fixture) await fixture.cleanup(); }
  });

  async function open(page) {
    await page.goto(`${server.origin}/_editor?documentId=${encodeURIComponent(documentId)}`);
    const body = page.getByRole("textbox", { name: "Article body" });
    await expect(body).toBeVisible();
    await expect(body.locator('[data-fixture="protected-inline"]')).toHaveText("INLINE REGION");
    await expect(body.locator('[data-fixture="protected-block"]')).toHaveText("BLOCK REGION");
    return body;
  }

  async function intact(page, body) {
    await expect(body.locator('[data-fixture="protected-inline"]')).toHaveCount(1);
    await expect(body.locator('[data-fixture="protected-block"]')).toHaveCount(1);
    await expect(body.locator('[data-fixture="protected-inline"]')).toHaveText("INLINE REGION");
    await expect(body.locator('[data-fixture="protected-block"]')).toHaveText("BLOCK REGION");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");
    const saved = await readFile(sourcePath, "utf8");
    expect(saved).toContain(inline);
    expect(saved).toContain(block);
  }

  async function edge(target, side) {
    await target.evaluate((element, where) => {
      const body = element.closest('[contenteditable="true"]');
      body.focus();
      const host = element.closest(".editor-protected-node");
      const range = document.createRange();
      if (where === "before") range.setStartBefore(host);
      else range.setStartAfter(host);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }, side);
  }

  async function spanningSelection(body) {
    await body.evaluate((element) => {
      element.focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let first;
      let last;
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes("Before ")) first = node;
        if (node.textContent.includes("Closing editable paragraph.")) last = node;
      }
      if (!first || !last) throw new Error("Protected selection fixture text is missing");
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(last, last.textContent.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }

  test("caret traversal and boundary deletion keep the original protected regions", async ({ page }) => {
    test.setTimeout(180_000);
    const body = await open(page);
    for (const type of ["inline", "block"]) {
      const target = body.locator(`[data-fixture="protected-${type}"]`);
      await edge(target, "before");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowLeft");
      await edge(target, "before");
      await page.keyboard.press("Delete");
      await intact(page, body);
      await edge(target, "after");
      await page.keyboard.press("Backspace");
      await intact(page, body);
    }
    await edge(body.locator('[data-fixture="protected-inline"]'), "before");
    await page.keyboard.insertText("Writing beside the component. ");
    await expect(body).toContainText("Writing beside the component.");
    await intact(page, body);
    expect(await readFile(sourcePath, "utf8")).toContain(`Writing beside the component. ${inline}`);
  });

  for (const operation of ["Backspace", "Delete", "ControlOrMeta+x"]) {
    test(`a cross-region ${operation} selection cannot erase protected content`, async ({ page, context }) => {
      test.setTimeout(180_000);
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.origin });
      const body = await open(page);
      await spanningSelection(body);
      await page.keyboard.press(operation);
      await intact(page, body);
    });
  }

  test("a synthetic text drop over a protected selection cannot flatten it", async ({ page }) => {
    test.setTimeout(180_000);
    const body = await open(page);
    await spanningSelection(body);
    const transfer = await page.evaluateHandle(() => {
      const value = new DataTransfer();
      value.setData("text/plain", "Dropped ordinary prose");
      value.setData("text/html", "<p>Dropped ordinary prose</p>");
      return value;
    });
    await body.dispatchEvent("drop", { dataTransfer: transfer });
    await intact(page, body);
  });
});
