import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

test("edits a slide transcript without changing the deck or publishing the draft", async ({ page }) => {
  test.setTimeout(240_000);
  const fixture = await createFixtureProject({ name: "talk-transcript" });
  let server;
  const path = "src/content/talks/editor-talk-fixture.mdx";
  const source = `---
title: Talk transcript fixture
description: Editing prose beside animated slides.
type: talk
startDate: 2026-10-16
updated: 2026-10-16
growthStage: seedling
topics: [Design]
conferences: []
cover: ../../images/posts/fortune-telling/13-title.webp
draft: true
---

import ScrollyTalkSection from "../../components/mdx/ScrollyTalkSection.astro";

<IntroParagraph>A talk introduction.</IntroParagraph>

<ScrollyTalkSection images={["/images/posts/fortune-telling/01-hello.webp", "/images/posts/fortune-telling/02-i-m-maggie.webp"]} revealSrc="/talk-decks/fortune-telling">

<div data-slide="0" data-source-slide="html/01-hello.html" data-fragment="-1">

{/* Keep this comment. */}

The first slide's transcript.

</div>

<div data-slide="1" data-source-slide="html/02-i-m-maggie.html" data-fragment="-1">

The second slide's transcript.

</div>

</ScrollyTalkSection>
`;
  try {
    await fixture.write(path, source);
    server = await startFixtureServer(fixture.root, { timeout: 120_000 });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${server.origin}/editor-talk-fixture`);
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
    const slide = page.locator('.editor-body [data-slide="1"]');
    const paragraph = slide.locator("p").first();
    await expect(paragraph).toHaveText("The second slide's transcript.");
    await paragraph.click();
    await paragraph.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await page.keyboard.insertText(" Revised in the editor.");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("A new paragraph for this slide.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const expected = source.replace("The second slide's transcript.",
      "The second slide's transcript. Revised in the editor.\n\nA new paragraph for this slide.");
    await expect.poll(() => readFile(fixture.resolve(path), "utf8")).toBe(expected);
    await page.reload();
    await expect(page.locator('.editor-body [data-slide="1"] p').last())
      .toHaveText("A new paragraph for this slide.");
    const frame = page.frames().find((frame) => frame.url().includes("/talk-decks/fortune-telling"));
    assert.ok(frame, "the real Reveal frame remains in editing mode");
    await frame.waitForFunction(() => window.deck?.isReady());
    await page.locator('.editor-body [data-slide="1"]').evaluate((element) =>
      window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - innerHeight * 0.4));
    await frame.waitForFunction(() => window.deck.getCurrentSlide()?.dataset.sourceSlide === "html/02-i-m-maggie.html");
    await page.setViewportSize({ width: 1000, height: 900 });
    await expect(page.locator('.editor-body .mobile-image[data-for-slide="1"]')).toBeVisible();
    await expect(page.locator(".draft-label")).toHaveText("Draft");
  } finally {
    try { if (server) await server.stop(); }
    finally { await fixture.cleanup(); }
  }
});
