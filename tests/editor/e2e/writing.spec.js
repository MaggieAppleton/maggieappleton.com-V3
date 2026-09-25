import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

function editorUrl(origin, documentId) {
  return `${origin}/_editor?documentId=${encodeURIComponent(documentId)}`;
}

async function selectText(page, scope, phrase) {
  await scope.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const index = node.textContent.indexOf(wanted);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + wanted.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    throw new Error(`Could not select ${JSON.stringify(wanted)}`);
  }, phrase);
}

async function selectAcrossParagraphs(body, firstPhrase, secondPhrase) {
  await body.evaluate((element, [first, second]) => {
    const paragraphs = [...element.querySelectorAll("p")];
    const textNode = (phrase) => paragraphs.flatMap((paragraph) => {
      const nodes = [];
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) nodes.push(node);
      return nodes;
    }).find((node) => node.textContent.includes(phrase));
    const firstNode = textNode(first);
    const secondNode = textNode(second);
    if (!firstNode || !secondNode) throw new Error("Could not create a cross-paragraph selection");
    const range = document.createRange();
    range.setStart(firstNode, firstNode.textContent.indexOf(first));
    range.setEnd(secondNode, secondNode.textContent.indexOf(second) + second.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, [firstPhrase, secondPhrase]);
}

async function moveCaretToStart(page, scope, phrase) {
  await scope.focus();
  await scope.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const index = node.textContent.indexOf(wanted);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    throw new Error(`Could not place caret before ${JSON.stringify(wanted)}`);
  }, phrase);
}

async function moveCaretToEnd(scope) {
  await scope.focus();
  await scope.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last;
    let node;
    while ((node = walker.nextNode())) last = node;
    if (!last) throw new Error("Could not place caret at editor end");
    const range = document.createRange();
    range.setStart(last, last.textContent.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

async function openEditor(page, origin, documentId) {
  await page.goto(editorUrl(origin, documentId), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Writing editor" })).toBeVisible();
  const body = page.getByRole("textbox", { name: "Article body" });
  await expect(body).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  return body;
}

async function appendParagraph(page, body, value) {
  await moveCaretToEnd(body);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(value);
}

async function appendMarkdownShortcut(page, body, marker, value) {
  await moveCaretToEnd(body);
  await page.keyboard.press("Enter");
  await page.keyboard.type(marker, { delay: 15 });
  await page.waitForTimeout(50);
  await page.keyboard.press("Space");
  await page.waitForTimeout(75);
  await page.keyboard.type(value, { delay: 15 });
  await page.waitForTimeout(50);
}

async function save(page, diagnosticPath) {
  await page.getByRole("button", { name: "Save" }).click();
  try {
    await expect(page.getByRole("status")).toHaveText("Saved");
  } catch (error) {
    if (diagnosticPath) {
      const diagnostic = await page.evaluate(() => {
        const editor = document.querySelector('[role="textbox"][aria-label="Article body"]');
        return {
          status: document.querySelector('[role="status"]')?.textContent,
          alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent),
          bodyText: editor?.textContent,
          outline: [...editor?.querySelectorAll("h1, h2, h3, h4, blockquote, ul, ol, li, p") ?? []]
            .map((item) => ({ tag: item.tagName.toLowerCase(), text: item.textContent, depth: item.closest("li") ? 1 : 0 })),
        };
      });
      await writeFile(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`);
    }
    throw error;
  }
}

test.describe.serial("writing commands on a synthetic draft", () => {
  let fixture;
  let server;
  let documents;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    fixture = await createFixtureProject({ name: "editor-writing" });
    const suffix = randomUUID().slice(0, 8);
    documents = {};
    for (const name of ["paragraphs", "formatting", "linkEnter", "linkBackspace", "links", "marks", "composition"]) {
      const slug = `editor-writing-${name.toLowerCase()}-${suffix}`;
      documents[name] = {
        documentId: `notes:${slug}`,
        previewPath: `/${slug}`,
        sourcePath: fixture.resolve(`src/content/notes/${slug}.mdx`),
      };
      const authoredWikiLink = name === "links" ? "\nExisting [[AI Rent]] link.\n" : "";
      await fixture.write(`src/content/notes/${slug}.mdx`, `---
title: Writing fixture
description: A synthetic writing test draft.
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

First editable paragraph.

Second editable paragraph.
${authoredWikiLink}
`);
    }
    server = await startFixtureServer(fixture.root, { timeout: 120_000 });
  });

  test.afterAll(async ({}, testInfo) => {
    test.setTimeout(240_000);
    try {
      if (server) {
        await server.stop();
        await testInfo.attach("fixture-server.log", { path: server.logPath, contentType: "text/plain" });
      }
    } finally {
      if (fixture) await fixture.cleanup();
    }
  });

  test("types, splits and joins paragraphs, and replaces a cross-paragraph selection", async ({ page }) => {
    test.setTimeout(240_000);
    const { documentId, previewPath, sourcePath } = documents.paragraphs;
    const body = await openEditor(page, server.origin, documentId);
    const first = body.locator("p").filter({ hasText: "First editable paragraph." }).first();
    await selectText(page, first, "editable");
    await page.keyboard.insertText("changed");
    await selectAcrossParagraphs(body, "First changed paragraph.", "Second editable paragraph.");
    await page.keyboard.insertText("cross-paragraph selection");
    await appendParagraph(page, body, "Split join paragraph.");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("Joined paragraph.");
    await moveCaretToStart(page, body, "Joined paragraph.");
    await page.keyboard.press("Backspace");
    await expect(body).toContainText("cross-paragraph selection");
    await expect(page.getByRole("status")).toHaveText(/Unsaved|Saved/);
    await save(page);
    await expect.poll(() => readFile(sourcePath, "utf8")).toMatch(/cross-paragraph selection[\s\S]*Split join paragraph\.Joined paragraph\./);
    await page.goto(`${server.origin}${previewPath}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("article")).toContainText("cross-paragraph selection");
    await expect(page.locator("article")).toContainText("Split join paragraph.Joined paragraph.");
  });

  test("uses Markdown shortcuts for headings, nested lists, and blockquotes", async ({ page }) => {
    test.setTimeout(240_000);
    const { documentId, previewPath, sourcePath } = documents.formatting;
    const body = await openEditor(page, server.origin, documentId);
    for (const [level, text] of [[1, "Heading one"], [2, "Heading two"], [3, "Heading three"], [4, "Heading four"]]) {
      await appendMarkdownShortcut(page, body, "#".repeat(level), text);
      await expect(body.locator(`h${level}`).last()).toContainText(text);
    }
    await appendMarkdownShortcut(page, body, ">", "Quoted writing.");
    await expect(body.locator("blockquote")).toContainText("Quoted writing.");
    await appendMarkdownShortcut(page, body, "-", "Parent item");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("Nested item");
    await page.keyboard.press("Tab");
    await expect(body.locator("ul > li > ul > li")).toContainText("Nested item");
    await page.keyboard.press("Shift+Tab");
    await expect(body.locator("ul > li")).toContainText(["Parent item", "Nested item"]);
    await save(page, ".local-writing-editor/writing-format-save-diagnostic.json");
    await expect.poll(() => readFile(sourcePath, "utf8")).toMatch(/# Heading one[\s\S]*## Heading two[\s\S]*### Heading three[\s\S]*#### Heading four[\s\S]*> Quoted writing\.[\s\S]*- Parent item[\s\S]*- Nested item/);
    await page.goto(`${server.origin}${previewPath}`, { waitUntil: "domcontentloaded" });
    for (const text of ["Heading one", "Heading two", "Heading three", "Heading four", "Quoted writing."]) {
      await expect(page.locator("article")).toContainText(text);
    }
  });

  test("keeps a just-created default-title link when ArrowRight and Enter immediately create the next paragraph", async ({ page }) => {
    test.setTimeout(240_000);
    const { documentId, sourcePath } = documents.linkEnter;
    const body = await openEditor(page, server.origin, documentId);
    const target = `${server.origin}/cozy-web`;
    await appendParagraph(page, body, "Immediate link text.");
    await body.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Immediate link text.");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "URL", exact: true }).fill(target);
    await dialog.getByRole("button", { name: "Set URL", exact: true }).click();

    // Keep this native collapse-and-Enter sequence contiguous: it reproduces the
    // selection race that used to remove the link from the editor's model.
    await body.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("Paragraph after immediate link.");

    const link = body.locator(`a[href="${target}"]`);
    await expect(link).toContainText("Immediate link text.");
    await expect(body.locator("p").last()).toHaveText("Paragraph after immediate link.");
    await save(page);
    await expect.poll(() => readFile(sourcePath, "utf8")).toContain(`[Immediate link text.](${target})`);
    await expect.poll(() => readFile(sourcePath, "utf8")).toMatch(/\[Immediate link text\.\]\([^\n]+\)\n\nParagraph after immediate link\./);
  });

  test("keeps a just-created default-title link when ArrowRight and Backspace delete its final character", async ({ page }) => {
    test.setTimeout(240_000);
    const { documentId, sourcePath } = documents.linkBackspace;
    const body = await openEditor(page, server.origin, documentId);
    const target = `${server.origin}/cozy-web`;
    await appendParagraph(page, body, "Immediate backspace text.");
    await body.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Immediate backspace text.");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "URL", exact: true }).fill(target);
    await dialog.getByRole("button", { name: "Set URL", exact: true }).click();

    // This mirrors the native collapsed-caret path above without a helper or delay.
    await body.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Backspace");

    const link = body.locator(`a[href="${target}"]`);
    await expect(link).toContainText("Immediate backspace text");
    await expect(link).not.toContainText("Immediate backspace text.");
    await save(page);
    await expect.poll(() => readFile(sourcePath, "utf8")).toContain(`[Immediate backspace text](${target})`);
  });

  test("edits ordinary links while preserving authored wiki links", async ({ page }) => {
    test.setTimeout(240_000);
    const { documentId, previewPath, sourcePath } = documents.links;
    const body = await openEditor(page, server.origin, documentId);
    const ordinaryLinkTarget = `${server.origin}/cozy-web`;
    await appendParagraph(page, body, "Ordinary link text.");
    await body.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Ordinary link text.");
    await page.keyboard.press("ControlOrMeta+k");
    const linkDialog = page.getByRole("dialog");
    const url = linkDialog.getByRole("textbox", { name: "URL", exact: true });
    await expect(url).toBeVisible();
    await url.fill(ordinaryLinkTarget);
    await linkDialog.getByRole("button", { name: "Set URL", exact: true }).click();
    const ordinaryLink = body.locator(`a[href="${ordinaryLinkTarget}"]`);
    await expect(ordinaryLink).toContainText("Ordinary link text.");
    const wiki = body.locator(".editor-wiki-link");
    await expect(wiki).toContainText("[[AI Rent]]");
    await save(page);
    await expect.poll(() => readFile(sourcePath, "utf8")).toContain(`[Ordinary link text.](${ordinaryLinkTarget})`);
    await ordinaryLink.click();
    const linkPreview = page.getByTestId("link-dialog-preview");
    await expect(linkPreview).toHaveAttribute("href", ordinaryLinkTarget);
    const [ordinaryTargetPage] = await Promise.all([
      page.waitForEvent("popup", { timeout: 10_000 }),
      linkPreview.click(),
    ]);
    await ordinaryTargetPage.waitForLoadState("domcontentloaded");
    await expect(ordinaryTargetPage).toHaveURL(/\/cozy-web$/);
    await ordinaryTargetPage.close();

    await save(page);
    await expect.poll(() => readFile(sourcePath, "utf8")).toContain(`[Ordinary link text.](${ordinaryLinkTarget})`);
    await expect.poll(() => readFile(sourcePath, "utf8")).toContain("Existing [[AI Rent]] link.");
    await page.goto(`${server.origin}${previewPath}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`article a[href="${ordinaryLinkTarget}"]`)).toContainText("Ordinary link text.");
    await expect(page.locator("article")).toContainText("AI Rent");
  });

  test("applies keyboard marks and retains plain and rich pasted prose without foreign font styles", async ({ page, context }) => {
    test.setTimeout(240_000);
    const { documentId, previewPath, sourcePath } = documents.marks;
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.origin });
    const body = await openEditor(page, server.origin, documentId);
    await appendParagraph(page, body, "");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.insertText("Bold words");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.insertText(" ");
    await page.keyboard.press("ControlOrMeta+i");
    await page.keyboard.insertText("italic words");
    await page.keyboard.press("ControlOrMeta+i");
    await page.keyboard.insertText(" ");
    await page.keyboard.press("ControlOrMeta+e");
    await page.keyboard.insertText("code words");
    await page.keyboard.press("ControlOrMeta+e");

    await page.evaluate(async () => navigator.clipboard.writeText("Plain pasted prose"));
    await page.keyboard.press("ControlOrMeta+v");
    await page.evaluate(async () => navigator.clipboard.write([
      new ClipboardItem({ "text/html": new Blob(["<section style='font-family: Papyrus; font-size: 48px'><p><strong>Rich bold prose</strong></p><ul><li><em>Rich italic item</em></li></ul></section>"], { type: "text/html" }), "text/plain": new Blob(["Rich bold prose\nRich italic item"], { type: "text/plain" }) }),
    ]));
    await page.keyboard.press("ControlOrMeta+v");
    await save(page, ".local-writing-editor/writing-marks-save-diagnostic.json");
    await expect.poll(() => readFile(sourcePath, "utf8")).toMatch(/\*\*Bold words\*\*/);
    await expect.poll(() => readFile(sourcePath, "utf8")).toMatch(/\*italic words\*/);
    await expect.poll(() => readFile(sourcePath, "utf8")).toMatch(/`code words`/);
    await expect.poll(() => readFile(sourcePath, "utf8")).toMatch(/Plain pasted prose[\s\S]*\*\*Rich bold prose\*\*[\s\S]*\*Rich italic item\*/);
    assert.doesNotMatch(await readFile(sourcePath, "utf8"), /Papyrus|font-family|font-size|<section/i);
    await page.goto(`${server.origin}${previewPath}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("article")).toContainText("Rich bold prose");
    await expect(page.locator("article")).toContainText("Rich italic item");
  });

  test("supports keyboard save with labelled controls and completed synthetic composition input", async ({ page }) => {
    test.setTimeout(240_000);
    const { documentId, previewPath, sourcePath } = documents.composition;
    const body = await openEditor(page, server.origin, documentId);
    const writesDuringComposition = [];
    page.on("request", (request) => {
      if (request.method() === "PUT" && new URL(request.url()).pathname === "/_editor/api/document") {
        writesDuringComposition.push(request);
      }
    });
    await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Description" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    await body.focus();
    await body.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "", bubbles: true }));
      element.dispatchEvent(new CompositionEvent("compositionupdate", { data: "こんにちは", bubbles: true }));
    });
    await page.keyboard.insertText("こんにちは");
    await page.waitForTimeout(850);
    expect(writesDuringComposition).toHaveLength(0);
    await body.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionend", { data: "こんにちは", bubbles: true }));
    });
    const preview = page.getByRole("link", { name: "Preview" });
    await preview.focus();
    await page.keyboard.press("Tab");
    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeFocused();
    await expect(saveButton).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Saved");
    await expect.poll(() => readFile(sourcePath, "utf8")).toContain("こんにちは");
    await page.goto(`${server.origin}${previewPath}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("article")).toContainText("こんにちは");
  });
});
