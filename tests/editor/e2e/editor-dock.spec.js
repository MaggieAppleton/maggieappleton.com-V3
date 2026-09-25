import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

function sourceFor(slug) {
  return `---
title: Dock fixture
description: A synthetic writing test draft.
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

${Array.from({ length: 80 }, (_, index) => `Scrollable paragraph ${index + 1}.`).join("\n\n")}
`;
}

test.describe.serial("writing editor dock", () => {
  let fixture;
  let server;
  let documentId;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    fixture = await createFixtureProject({ name: "editor-dock" });
    const slug = `editor-dock-${randomUUID().slice(0, 8)}`;
    documentId = `notes:${slug}`;
    await fixture.write(`src/content/notes/${slug}.mdx`, sourceFor(slug));
    server = await startFixtureServer(fixture.root, { timeout: 120_000 });
  });

  test.afterAll(async () => {
    test.setTimeout(240_000);
    try { if (server) await server.stop(); }
    finally { if (fixture) await fixture.cleanup(); }
  });

  test("stays fixed on a narrow long document and opens actionable save details without stealing focus", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${server.origin}/_editor?documentId=${encodeURIComponent(documentId)}`);
    const body = page.getByRole("textbox", { name: "Article body" });
    await expect(body).toBeVisible();
    const dock = page.locator(".editor-dock-pill");
    await expect(dock).toBeVisible();
    await expect(page.getByRole("button", { name: "Details" })).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, 800));
    const desktopShot = testInfo.outputPath("dock-normal-desktop.png");
    await page.screenshot({ path: desktopShot });
    await testInfo.attach("dock-normal-desktop.png", { path: desktopShot, contentType: "image/png" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const box = await dock.boundingBox();
    expect(box).not.toBeNull();
    expect(844 - (box.y + box.height)).toBeCloseTo(90, 0);
    const mobileShot = testInfo.outputPath("dock-normal-mobile.png");
    await page.screenshot({ path: mobileShot });
    await testInfo.attach("dock-normal-mobile.png", { path: mobileShot, contentType: "image/png" });

    await page.route("**/_editor/api/document", async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({
        error: { code: "fixture_save_rejected", message: "Fixture save rejected" },
      }) });
    });
    await body.focus();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" Unsaved dock writing.");
    await page.keyboard.press("ControlOrMeta+s");

    await expect(page.getByRole("status")).toHaveText("Couldn't save");
    await expect(body).toBeFocused();
    const panel = page.getByRole("region", { name: "Writing editor details" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Your latest changes couldn’t be saved. They’re still open here.");
    await expect(panel.getByRole("button", { name: "Copy writing" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Download backup" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Retry save" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Save issue" })).toHaveCSS("margin-top", "0px");
    const errorShot = testInfo.outputPath("dock-save-error-mobile.png");
    await page.screenshot({ path: errorShot });
    await testInfo.attach("dock-save-error-mobile.png", { path: errorShot, contentType: "image/png" });
    expect(await dock.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const desktopErrorShot = testInfo.outputPath("dock-save-error-desktop.png");
    await page.screenshot({ path: desktopErrorShot });
    await testInfo.attach("dock-save-error-desktop.png", { path: desktopErrorShot, contentType: "image/png" });

    await panel.getByRole("button", { name: "Copy writing" }).focus();
    await page.keyboard.press("Escape");
    const details = page.getByRole("button", { name: "Details" });
    await expect(details).toBeFocused();
    await details.click();
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Technical details")).toBeVisible();
    await page.unroute("**/_editor/api/document");
    await panel.getByRole("button", { name: "Retry save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeFocused();
    await expect(panel).toHaveCount(0);
  });

  test("an unavailable document keeps its explanation in the fixed dock", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}/_editor?documentId=notes%3Adoes-not-exist`);
    const dock = page.locator(".editor-fallback-dock");
    await expect(dock).toContainText("Writing editor unavailable");
    const box = await dock.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(844 - (box.y + box.height)).toBeCloseTo(90, 0);
    await expect(dock.getByRole("link", { name: "Back to drafts" })).toBeVisible();
  });

  test("captures the dock over a copied public article", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${server.origin}/_editor?documentId=notes%3Acozy-web`);
    const body = page.getByRole("textbox", { name: "Article body" });
    await expect(body).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 550));
    await page.screenshot({ path: testInfo.outputPath("cozy-web-dock.png") });
    await page.route("**/_editor/api/document", (route) => route.request().method() === "PUT"
      ? route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({
        error: { code: "fixture_save_rejected", message: "Fixture save rejected" },
      }) }) : route.continue());
    await body.focus();
    await page.keyboard.insertText("Draft edit. ");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByRole("region", { name: "Writing editor details" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 550));
    await page.screenshot({ path: testInfo.outputPath("cozy-web-dock-error.png") });
  });
});
