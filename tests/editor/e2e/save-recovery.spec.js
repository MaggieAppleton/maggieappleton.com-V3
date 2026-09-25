import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const initialSource = (title) => `---
title: ${title}
description: Original description.
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

Original recovery paragraph.
`;

const protectedSource = `---
title: Protected recovery
description: Original description.
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

Original recovery paragraph.

{1 + 1}

Following paragraph.
`;

async function replaceParagraph(page, text) {
  const paragraph = page.getByRole("textbox", { name: "Article body" }).locator("p").first();
  await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.closest('[contenteditable="true"]').focus();
  });
  await page.keyboard.insertText(text);
}

async function refuseWrites(page) {
  const handler = (route) => route.request().method() === "PUT" ? route.abort("failed") : route.continue();
  await page.route("**/_editor/api/document**", handler);
  return () => page.unroute("**/_editor/api/document**", handler);
}

async function leave(page, action) {
  const accept = (dialog) => dialog.accept();
  page.on("dialog", accept);
  try { await action(); } finally { page.off("dialog", accept); }
}

test.describe("live save recovery", () => {
  let fixture;
  let server;
  const documents = {};

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    fixture = await createFixtureProject({ name: "editor-save-recovery" });
    for (const name of ["reload", "choice", "tabs", "cloned-tabs", "protected", "protected-conflict", "conflict", "restart", "storage", "navigation", "conversion", "metadata", "outside", "lost-response", "stale-poll"]) {
      const slug = `recovery-${name}-${randomUUID().slice(0, 8)}`;
      const path = `src/content/notes/${slug}.mdx`;
      await fixture.write(path, name.startsWith("protected") ? protectedSource : initialSource(`Recovery ${name}`));
      documents[name] = { id: `notes:${slug}`, path: fixture.resolve(path), preview: `/${slug}` };
    }
    // A controlled serialization fault in this owned copy exercises recovery of
    // the newer engine buffer without adding any test hook to the shipped code.
    const adapterPath = "src/editor/client/mdx-adapter/editor-adapter.mjs";
    const adapter = await readFile(fixture.resolve(adapterPath), "utf8");
    const anchor = "const bodySource = serializeSourceDocument";
    expect(adapter).toContain(anchor);
    await fixture.write(adapterPath, adapter.replace(anchor, `
      if (sourceDocument.metadata.title === "Recovery conversion"
          && JSON.stringify(exportBody()).includes("CONVERSION_FAILURE_MARKER")) {
        throw new Error("Controlled fixture conversion failure");
      }
      ${anchor}`));
    server = await startFixtureServer(fixture.root, { timeout: 120_000 });
  });

  test.afterAll(async () => {
    test.setTimeout(240_000);
    try { if (server) await server.stop(); }
    finally { if (fixture) await fixture.cleanup(); }
  });

  async function open(page, name) {
    await page.goto(`${server.origin}/_editor?documentId=${encodeURIComponent(documents[name].id)}`);
    await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
  }

  test("reload offers unsaved body and metadata, and restores both only after a choice", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "reload");
    const allowWrites = await refuseWrites(page);
    await replaceParagraph(page, "Recovered writing after a failed network request.");
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Recovered title");
    await page.getByRole("textbox", { name: "Description", exact: true }).fill("Recovered description.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    expect(await readFile(documents.reload.path, "utf8")).toBe(initialSource("Recovery reload"));

    await leave(page, () => page.reload());
    await expect(page.getByRole("textbox", { name: "Article body" })).toContainText("Original recovery paragraph.");
    await expect(page.getByRole("button", { name: "Recover browser version" })).toHaveCount(1);
    await page.getByRole("button", { name: "Recover browser version" }).click();
    await expect(page.getByRole("textbox", { name: "Article body" })).toContainText("Recovered writing after a failed network request.");
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveText("Recovered title");
    await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveText("Recovered description.");
    await allowWrites();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => readFile(documents.reload.path, "utf8")).toContain("Recovered writing after a failed network request.");
    await expect(page.getByRole("status")).toHaveText("Saved");
    const saved = await readFile(documents.reload.path, "utf8");
    expect(saved).toContain('title: "Recovered title"');
    expect(saved).toContain('description: "Recovered description."');
    await page.reload();
    await expect(page.getByRole("button", { name: "Recover browser version" })).toHaveCount(0);
  });

  test("choosing older recovery exposes newer current writing after reload", async ({ page, context }) => {
    test.setTimeout(180_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.origin });
    await open(page, "choice");
    await refuseWrites(page);
    await replaceParagraph(page, "Earlier unsaved browser writing.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    await leave(page, () => page.reload());
    await expect(page.getByRole("button", { name: "Recover browser version" })).toHaveCount(1);
    await replaceParagraph(page, "Newer current writing before recovery choice.");
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Newer current title");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    await page.getByRole("button", { name: "Recover browser version" }).click();
    await expect(page.getByRole("textbox", { name: "Article body" }))
      .toContainText("Earlier unsaved browser writing.");
    await expect(page.getByRole("button", { name: "Copy discarded version" })).toBeVisible();
    await page.getByRole("button", { name: "Copy discarded version" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toContain("Newer current writing before recovery choice.");
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toContain("Newer current title");
    await leave(page, () => page.reload());
    await expect(page.getByRole("button", { name: "Recover browser version" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Copy discarded version" })).toBeVisible();
    await page.getByRole("button", { name: "Copy discarded version" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toContain("Newer current writing before recovery choice.");
    expect(await readFile(documents.choice.path, "utf8")).toBe(initialSource("Recovery choice"));
  });

  test("two closed tabs keep distinct candidates for the same document", async ({ context }) => {
    test.setTimeout(180_000);
    const pages = [await context.newPage(), await context.newPage()];
    for (const [index, page] of pages.entries()) {
      await open(page, "tabs");
      await refuseWrites(page);
      await replaceParagraph(page, `Unsaved writing from tab ${index + 1}.`);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Couldn't save");
    }
    const records = await pages[0].evaluate(() => Object.entries(localStorage)
      .filter(([key]) => key.startsWith("local-writing-editor:v1:"))
      .map(([, value]) => JSON.parse(value)));
    expect(records.filter((record) => record.documentId === documents.tabs.id)).toHaveLength(2);
    expect(new Set(records.map((record) => record.writerId)).size).toBe(2);
    await Promise.all(pages.map((page) => page.close()));
    const reopened = await context.newPage();
    await open(reopened, "tabs");
    await expect(reopened.getByRole("button", { name: "Recover browser version" })).toHaveCount(2);
    expect(await readFile(documents.tabs.path, "utf8")).toBe(initialSource("Recovery tabs"));
  });

  test("an opener-created writing tab keeps both unsaved recovery copies", async ({ context }) => {
    test.setTimeout(180_000);
    const first = await context.newPage();
    await open(first, "cloned-tabs");
    const popupEvent = context.waitForEvent("page");
    await first.evaluate(() => window.open(location.href, "_blank"));
    const second = await popupEvent;
    await expect(second.getByRole("textbox", { name: "Article body" })).toBeVisible();
    for (const [index, page] of [first, second].entries()) {
      await refuseWrites(page);
      await replaceParagraph(page, `Unsaved writing from cloned tab ${index + 1}.`);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Couldn't save");
    }
    const records = await first.evaluate((documentId) => Object.entries(localStorage)
      .filter(([key]) => key.startsWith("local-writing-editor:v1:"))
      .map(([, value]) => JSON.parse(value))
      .filter((record) => record.documentId === documentId), documents["cloned-tabs"].id);
    expect(records).toHaveLength(2);
    expect(records.some((record) => record.source.includes("Unsaved writing from cloned tab 1."))).toBe(true);
    expect(records.some((record) => record.source.includes("Unsaved writing from cloned tab 2."))).toBe(true);
    expect(new Set(records.map((record) => record.writerId)).size).toBe(2);
    await Promise.all([first.close(), second.close()]);
    const reopened = await context.newPage();
    await open(reopened, "cloned-tabs");
    await expect(reopened.getByRole("button", { name: "Recover browser version" })).toHaveCount(2);
    await reopened.getByRole("button", { name: "Recover browser version" }).first().click();
    const moved = await reopened.evaluate((documentId) => Object.entries(localStorage)
      .filter(([key]) => key.startsWith("local-writing-editor:v1:"))
      .map(([, value]) => JSON.parse(value))
      .filter((record) => record.documentId === documentId), documents["cloned-tabs"].id);
    expect(moved).toHaveLength(2);
    expect(moved.some((record) => record.source.includes("Unsaved writing from cloned tab 1."))).toBe(true);
    expect(moved.some((record) => record.source.includes("Unsaved writing from cloned tab 2."))).toBe(true);
    expect(await readFile(documents["cloned-tabs"].path, "utf8")).toBe(initialSource("Recovery cloned-tabs"));
  });

  test("recovery after prose shifts protected MDX can be edited and saved", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "protected");
    const allowWrites = await refuseWrites(page);
    await replaceParagraph(page, "A much longer recovered paragraph than the original.");
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Recovered protected title");
    await page.getByRole("textbox", { name: "Description", exact: true }).fill("Recovered protected description.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    expect(await readFile(documents.protected.path, "utf8")).toBe(protectedSource);
    await leave(page, () => page.reload());
    await page.getByRole("button", { name: "Recover browser version" }).click();
    const body = page.getByRole("textbox", { name: "Article body" });
    await expect(body).toContainText("A much longer recovered paragraph than the original.");
    await expect(body.locator("[data-editor-protected-key]")).toContainText("2");
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveText("Recovered protected title");
    await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveText("Recovered protected description.");
    await replaceParagraph(page, "Further changes to the recovered paragraph.");
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Further recovered title");
    await page.getByRole("textbox", { name: "Description", exact: true }).fill("Further recovered description.");
    await allowWrites();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");
    const saved = await readFile(documents.protected.path, "utf8");
    expect(saved).toContain("Further changes to the recovered paragraph.\n\n{1 + 1}\n\nFollowing paragraph.");
    expect(saved).toContain('title: "Further recovered title"');
    expect(saved).toContain('description: "Further recovered description."');
    const response = await page.request.get(page.url());
    const html = await response.text();
    const protectedStart = saved.indexOf("{1 + 1}");
    expect(response.ok()).toBe(true);
    expect(html).toContain("<title>Further recovered title</title>");
    expect(html).toContain('name="description" content="Further recovered description."');
    expect(html).toMatch(/<p\b[^>]*>Further changes to the recovered paragraph\.<\/p>/);
    expect(html).toContain(`data-editor-start="${protectedStart}:${protectedStart + "{1 + 1}".length}"`);
    await page.reload();
    await expect(body).toContainText("Further changes to the recovered paragraph.");
    await expect(body.locator("[data-editor-protected-key]")).toContainText("2");
    await expect(page.getByRole("button", { name: "Recover browser version" })).toHaveCount(0);
  });

  test("conflict recovery never shows changed disk MDX as the browser's protected region", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "protected-conflict");
    await refuseWrites(page);
    await replaceParagraph(page, "Browser prose kept through a protected-content conflict.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    const outsideSource = protectedSource.replace("{1 + 1}", "{2 + 2}");
    await writeFile(documents["protected-conflict"].path, outsideSource);
    await leave(page, () => page.reload());
    await page.getByRole("button", { name: "Recover browser version" }).click();
    const body = page.getByRole("textbox", { name: "Article body" });
    await expect(body).toContainText("Browser prose kept through a protected-content conflict.");
    await expect(page.getByRole("status")).toHaveText("File changed elsewhere");
    await expect(body.locator("[data-editor-protected-key]")).toContainText("{1 + 1}");
    await expect(body.locator("[data-editor-protected-key]")).not.toContainText("4");
    expect(await readFile(documents["protected-conflict"].path, "utf8")).toBe(outsideSource);
  });

  test("title undo after acknowledgement remains a valid metadata patch", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "metadata");
    const title = page.getByRole("textbox", { name: "Title", exact: true });
    await title.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText('A quoted: "title" # fragment');
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => readFile(documents.metadata.path, "utf8"))
      .toContain('title: "A quoted: \\"title\\" # fragment"');
    await expect(page.getByRole("status")).toHaveText("Saved");
    await title.focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(title).toHaveText("Recovery metadata");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => readFile(documents.metadata.path, "utf8"))
      .toContain('title: "Recovery metadata"');
    await expect(page.getByRole("status")).toHaveText("Saved");
    const saved = await readFile(documents.metadata.path, "utf8");
    expect(saved.replace('title: "Recovery metadata"', "title: Recovery metadata"))
      .toBe(initialSource("Recovery metadata"));
  });

  test("a stale tab cannot overwrite a saved file and disk loading keeps its browser version", async ({ context }) => {
    test.setTimeout(180_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.origin });
    const first = await context.newPage();
    const second = await context.newPage();
    await open(first, "conflict");
    await open(second, "conflict");
    const allowWrites = await refuseWrites(second);
    await replaceParagraph(second, "Browser version from the stale tab.");
    await second.getByRole("button", { name: "Save", exact: true }).click();
    await expect(second.getByRole("status")).toHaveText("Couldn't save");
    await replaceParagraph(first, "Newest file saved by the first tab.");
    await first.getByRole("button", { name: "Save", exact: true }).click();
    await expect(first.getByRole("status")).toHaveText("Saved");
    await expect.poll(() => readFile(documents.conflict.path, "utf8")).toContain("Newest file saved by the first tab.");
    await allowWrites();
    await second.getByRole("button", { name: "Save", exact: true }).click();
    await expect(second.getByRole("status")).toHaveText("File changed elsewhere");
    await expect(second.getByRole("textbox", { name: "Article body" })).toContainText("Browser version from the stale tab.");
    await second.getByRole("button", { name: "Copy browser version", exact: true }).click();
    expect(await second.evaluate(() => navigator.clipboard.readText())).toContain("Browser version from the stale tab.");
    await leave(second, () => second.getByRole("button", { name: "Load disk version", exact: true }).click());
    await expect(second.getByRole("textbox", { name: "Article body" })).toContainText("Newest file saved by the first tab.");
    await second.getByRole("button", { name: "Copy discarded version", exact: true }).click();
    expect(await second.evaluate(() => navigator.clipboard.readText())).toContain("Browser version from the stale tab.");
    expect(await readFile(documents.conflict.path, "utf8")).not.toContain("Browser version from the stale tab.");
    await second.getByRole("button", { name: "Forget discarded version", exact: true }).click();
    await expect(second.getByRole("button", { name: "Copy discarded version", exact: true })).toHaveCount(0);
  });

  test("server restart renews authorization without replacing live text or ignoring a newer disk revision", async ({ page }) => {
    test.setTimeout(300_000);
    await open(page, "restart");
    const worktreeId = await page.locator("#local-editor-bootstrap").evaluate((element) =>
      JSON.parse(element.textContent).document.worktreeId);
    const editor = await page.getByRole("textbox", { name: "Article body" }).elementHandle();
    const port = server.port;
    const origin = server.origin;
    await server.stop();
    await replaceParagraph(page, "Writing continued while the server was stopped.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    server = await startFixtureServer(fixture.root, { port, timeout: 120_000 });
    expect(server.origin).toBe(origin);
    expect(await editor.evaluate((element) => element.isConnected)).toBe(true);
    await expect(page.getByRole("textbox", { name: "Article body" })).toContainText("Writing continued while the server was stopped.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => readFile(documents.restart.path, "utf8"), { timeout: 20_000 })
      .toContain("Writing continued while the server was stopped.");
    await expect(page.getByRole("status")).toHaveText("Saved");

    await server.stop();
    await replaceParagraph(page, "Second unsaved browser version.");
    const outsideSource = (await readFile(documents.restart.path, "utf8"))
      .replace("Writing continued while the server was stopped.", "Outside editor wrote the newest disk version.");
    await writeFile(documents.restart.path, outsideSource);
    server = await startFixtureServer(fixture.root, { port, timeout: 120_000 });
    expect(server.origin).toBe(origin);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("File changed elsewhere");
    expect(await editor.evaluate((element) => element.isConnected)).toBe(true);
    await expect(page.getByRole("textbox", { name: "Article body" })).toContainText("Second unsaved browser version.");
    expect(await readFile(documents.restart.path, "utf8")).toBe(outsideSource);

    await server.stop();
    server = await startFixtureServer(fixture.root, { timeout: 120_000 });
    expect(server.port).not.toBe(port);
    await leave(page, () => open(page, "restart"));
    const movedWorktreeId = await page.locator("#local-editor-bootstrap").evaluate((element) =>
      JSON.parse(element.textContent).document.worktreeId);
    expect(movedWorktreeId).toBe(worktreeId);
    await expect(page.getByRole("textbox", { name: "Article body" })).toContainText("Outside editor wrote the newest disk version.");
  });

  test("focus detects an outside change before new typing can overwrite it", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "outside");
    const outsideSource = initialSource("Recovery outside")
      .replace("Original recovery paragraph.", "Outside changes made while the editor was clean.");
    await writeFile(documents.outside.path, outsideSource);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("status")).toHaveText("File changed elsewhere");
    await replaceParagraph(page, "New browser writing after the outside change.");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByRole("status")).toHaveText("File changed elsewhere");
    expect(await readFile(documents.outside.path, "utf8")).toBe(outsideSource);
    await expect(page.getByRole("textbox", { name: "Article body" })).toContainText("New browser writing after the outside change.");
  });

  test("an older disk poll cannot conflict with a newer acknowledged save", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "stale-poll");
    let release;
    let captured;
    let returned;
    const gate = new Promise((resolve) => { release = resolve; });
    const capturedResponse = new Promise((resolve) => { captured = resolve; });
    const returnedResponse = new Promise((resolve) => { returned = resolve; });
    let delayed = false;
    await page.route("**/_editor/api/document**", async (route) => {
      if (route.request().method() !== "GET" || delayed) return route.continue();
      delayed = true;
      const response = await route.fetch();
      captured();
      await gate;
      await route.fulfill({ response });
      returned();
    });
    try {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await capturedResponse;
      await replaceParagraph(page, "New writing saved while an older poll was in flight.");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Saved");
      await expect.poll(() => readFile(documents["stale-poll"].path, "utf8"))
        .toContain("New writing saved while an older poll was in flight.");
      release();
      await returnedResponse;
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect(page.getByRole("status")).toHaveText("Saved");
      await replaceParagraph(page, "More writing after the obsolete poll returned.");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => readFile(documents["stale-poll"].path, "utf8"))
        .toContain("More writing after the obsolete poll returned.");
      await expect(page.getByRole("status")).toHaveText("Saved");
    } finally { release(); }
  });

  for (const unavailable of ["disabled", "full"]) {
    test(`storage ${unavailable} is visible while live writing remains saveable`, async ({ page, context }) => {
      test.setTimeout(180_000);
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.origin });
      await page.addInitScript((mode) => {
        if (mode === "disabled") {
          Object.defineProperty(window, "localStorage", {
            get() { throw new DOMException("Storage disabled for this test", "SecurityError"); },
          });
        } else {
          const originalSet = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key.startsWith("local-writing-editor:v1:")) {
              throw new DOMException("Storage quota exhausted for this test", "QuotaExceededError");
            }
            return originalSet.call(this, key, value);
          };
        }
      }, unavailable);
      await open(page, "storage");
      await expect(page.locator('astro-island[component-export="Agentation"]')).toHaveCount(0);
      await replaceParagraph(page, `Saveable writing while recovery storage is ${unavailable}.`);
      await expect(page.getByRole("alert")).toContainText(/recovery|storage/i);
      await expect(page.getByRole("button", { name: "Copy browser version", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Saved");
      await expect.poll(() => readFile(documents.storage.path, "utf8"))
        .toContain(`Saveable writing while recovery storage is ${unavailable}.`);
      if (unavailable === "disabled") {
        await refuseWrites(page);
        const browserText = "Keep this browser writing until it can be exported.";
        await replaceParagraph(page, browserText);
        const outsideSource = (await readFile(documents.storage.path, "utf8"))
          .replace(`Saveable writing while recovery storage is ${unavailable}.`, "A newer outside disk version.");
        await writeFile(documents.storage.path, outsideSource);
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(page.getByRole("status")).toHaveText("File changed elsewhere");
        await page.evaluate(() => {
          navigator.clipboard.writeText = async () => { throw new DOMException("Clipboard denied", "NotAllowedError"); };
        });
        await page.getByRole("button", { name: "Load disk version", exact: true }).click();
        await expect(page.getByRole("textbox", { name: "Article body" })).toContainText(browserText);
        await expect(page.getByRole("status")).toHaveText("File changed elsewhere");
        expect(await readFile(documents.storage.path, "utf8")).toBe(outsideSource);
        await expect(page.getByRole("button", { name: "Copy browser version", exact: true })).toHaveCount(1);
        await expect(page.getByRole("button", { name: "Download backup", exact: true })).toHaveCount(1);
        await expect(page.getByRole("button", { name: "Retry save", exact: true })).toHaveCount(0);
        const downloadBackup = async (expectedText) => {
          const downloaded = page.waitForEvent("download");
          await page.getByRole("button", { name: "Download backup", exact: true }).click();
          const backup = await downloaded;
          expect(await readFile(await backup.path(), "utf8")).toContain(expectedText);
        };
        await downloadBackup(browserText);
        const newerText = "New writing after the first backup.";
        await replaceParagraph(page, newerText);
        await page.getByRole("button", { name: "Load disk version", exact: true }).click();
        await expect(page.getByRole("textbox", { name: "Article body" })).toContainText(newerText);

        // A pending clipboard permission must not authorize discarding later typing.
        await page.evaluate(() => {
          navigator.clipboard.writeText = () => new Promise((resolve) => { window.finishBackup = resolve; });
        });
        await page.getByRole("button", { name: "Load disk version", exact: true }).click();
        await expect.poll(() => page.evaluate(() => typeof window.finishBackup)).toBe("function");
        const latestText = "Latest writing typed while the clipboard was pending.";
        await replaceParagraph(page, latestText);
        await page.evaluate(() => window.finishBackup());
        await expect(page.getByText("Writing changed while preparing a backup.", { exact: false })).toBeVisible();
        await expect(page.getByRole("textbox", { name: "Article body" })).toContainText(latestText);
        await page.evaluate(() => {
          navigator.clipboard.writeText = async () => { throw new DOMException("Clipboard denied", "NotAllowedError"); };
        });
        await downloadBackup(latestText);
        await leave(page, () => page.getByRole("button", { name: "Load disk version", exact: true }).click());
        await expect(page.getByRole("textbox", { name: "Article body" })).toContainText("A newer outside disk version.");
        expect(await readFile(documents.storage.path, "utf8")).toBe(outsideSource);
      }
    });
  }

  test("a failed conversion restores and exports newer engine text without overwriting valid disk source", async ({ page, context }) => {
    test.setTimeout(180_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.origin });
    await open(page, "conversion");
    const newerText = "Newer recoverable writing CONVERSION_FAILURE_MARKER.";
    await replaceParagraph(page, newerText);
    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    await expect(page.getByRole("alert")).toContainText("Controlled fixture conversion failure");
    expect(await readFile(documents.conversion.path, "utf8")).toBe(initialSource("Recovery conversion"));
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Title kept in the backup");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download backup", exact: true }).click();
    const backup = await readFile(await (await downloaded).path(), "utf8");
    expect(backup).toContain('title: "Title kept in the backup"');
    expect(backup).toContain("description: Original description.");
    expect(backup).toContain(newerText.replaceAll("_", "\\_"));
    await leave(page, () => page.reload());
    await expect(page.getByRole("button", { name: "Recover browser version" })).toHaveCount(1);
    await page.getByRole("button", { name: "Recover browser version" }).click();
    await expect(page.getByRole("textbox", { name: "Article body" })).toContainText(newerText);
    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    expect(await readFile(documents.conversion.path, "utf8")).toBe(initialSource("Recovery conversion"));
    await replaceParagraph(page, "Conversion repaired without losing the recovered writing.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => readFile(documents.conversion.path, "utf8"))
      .toContain("Conversion repaired without losing the recovered writing.");
    await expect(page.getByRole("status")).toHaveText("Saved");

    const conflictedText = "Newest unsaveable writing CONVERSION_FAILURE_MARKER.";
    await replaceParagraph(page, conflictedText);
    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    const outsideSource = (await readFile(documents.conversion.path, "utf8"))
      .replace("Conversion repaired without losing the recovered writing.", "An outside editor owns this disk version.");
    await writeFile(documents.conversion.path, outsideSource);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("status")).toHaveText("File changed elsewhere");
    await page.getByRole("button", { name: "Copy browser version", exact: true }).click();
    // Failed conversion exports the engine's recoverable Markdown snapshot.
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(conflictedText.replaceAll("_", "\\_"));
    await leave(page, () => page.getByRole("button", { name: "Load disk version", exact: true }).click());
    await expect(page.getByRole("textbox", { name: "Article body" })).toContainText("An outside editor owns this disk version.");
    await page.getByRole("button", { name: "Copy discarded version", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(conflictedText.replaceAll("_", "\\_"));
    expect(await readFile(documents.conversion.path, "utf8")).toBe(outsideSource);
  });

  test("navigation warns while a save is pending and cancellation retains the writing", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "navigation");
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/_editor/api/document**", async (route) => {
      if (route.request().method() === "PUT") await gate;
      await route.continue();
    });
    try {
      await replaceParagraph(page, "Keep this writing while the save is pending.");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Saving");
      const dialog = page.waitForEvent("dialog");
      const navigation = page.getByRole("link", { name: "Preview", exact: true }).click({ noWaitAfter: true });
      const warning = await dialog;
      expect(warning.type()).toBe("beforeunload");
      await warning.dismiss();
      await navigation;
      await expect(page.getByRole("textbox", { name: "Article body" })).toContainText("Keep this writing while the save is pending.");
      release();
      await expect.poll(() => readFile(documents.navigation.path, "utf8"))
        .toContain("Keep this writing while the save is pending.");
      await expect(page.getByRole("status")).toHaveText("Saved");
    } finally { release(); }
  });

  test("a lost acknowledgement retries its original candidate before newer writing when connection returns", async ({ page, context }) => {
    test.setTimeout(180_000);
    await open(page, "lost-response");
    const requests = [];
    await page.route("**/_editor/api/document**", async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        // The server committed the file; the browser never sees its acknowledgement.
        await route.abort("failed");
      } else await route.continue();
    });
    await replaceParagraph(page, "First candidate reached disk without an acknowledgement.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    await expect.poll(() => readFile(documents["lost-response"].path, "utf8"))
      .toContain("First candidate reached disk without an acknowledgement.");
    await context.setOffline(true);
    await replaceParagraph(page, "Newest writing continued while the connection was down.");
    await context.setOffline(false);
    await expect.poll(() => readFile(documents["lost-response"].path, "utf8"), { timeout: 20_000 })
      .toContain("Newest writing continued while the connection was down.");
    await expect(page.getByRole("status")).toHaveText("Saved");
    expect(requests.length).toBeGreaterThanOrEqual(3);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests.at(-1).source).toContain("Newest writing continued while the connection was down.");
  });
});
