import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@mdx-js/mdx";
import { test } from "@playwright/test";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";

import { createSourceDocument } from "../../../src/editor/source/document.mjs";
import { isProtected } from "../../../src/editor/source/source-ledger.mjs";
import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const evidenceRoot = fileURLToPath(new URL("../../../.local-writing-editor/browser-evidence/", import.meta.url));
const editMarker = "Corpus engine edit.";
const componentOnlyEssays = new Set([
  "src/content/essays/api.mdx",
  "src/content/essays/databases.mdx",
]);
const syntheticSources = {
  "synthetic/repeated-crlf.mdx": "\uFEFF---\r\ntitle: Repeated\r\ntype: note\r\n---\r\n\r\nEcho paragraph.\r\n\r\nEcho paragraph.\r\n",
  "synthetic/nested-unicode.mdx": [
    "---", "title: Nested", "type: note", "---", "",
    "<IntroParagraph>cafe\u0301 <Footnote idName={1}>A nested footnote. \u{1F331}</Footnote> tail.</IntroParagraph>", "",
  ].join("\n"),
  "synthetic/versioned-no-final-newline.mdx": [
    "---", "title: Versioned", "description: Exact source", "type: essay", "version: 2", "---", "",
    "A versioned paragraph without a final newline.",
  ].join("\n"),
  "synthetic/mixed-wiki.mdx": [
    "---", "title: Mixed wiki", "type: note", "---", "",
    "A literal \\[[same]] sits beside real [[same]].", "",
  ].join("\n"),
};

const harnessPage = `---
---
<div id="corpus-editor-root"></div>
<script>
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { MDXEditor } from "@mdxeditor/editor";
  import "@mdxeditor/editor/style.css";
  import { RenderedRegionContext } from "../editor/client/mdx-adapter/protected-node.mjs";
  import { createEditorAdapter } from "../editor/client/mdx-adapter/editor-adapter.mjs";

  let root;
  let adapter;
  let editorRef;
  let entries;
  let baselineReady = false;
  let lastLoadMetrics = null;
  let delayedState = null;
  let lastCaptureError = null;
  const editorRoot = document.getElementById("corpus-editor-root");
  const errors = [];
  const onChangeEvents = [];

  async function load(path, diagnostic = false) {
    if (!entries) entries = await fetch("/__editor_corpus_sources.json").then((response) => response.json());
    const source = entries[path];
    if (typeof source !== "string") throw new Error("Missing corpus source: " + path);
    if (root) root.unmount();
    editorRoot.replaceChildren();
    errors.length = 0;
    onChangeEvents.length = 0;
    baselineReady = false;
    lastLoadMetrics = null;
    delayedState = null;
    lastCaptureError = null;
    const started = performance.now();
    adapter = createEditorAdapter({ source });
    editorRef = React.createRef();
    root = createRoot(editorRoot);
    root.render(React.createElement(RenderedRegionContext.Provider, { value: adapter.registry },
      React.createElement(MDXEditor, {
        ref: editorRef,
        markdown: adapter.markdown,
        plugins: adapter.plugins,
        additionalLexicalNodes: adapter.additionalLexicalNodes,
        onChange: (_markdown, initial) => {
          onChangeEvents.push({ initial: Boolean(initial) });
          if (initial) {
            try { adapter.captureBaseline(); baselineReady = adapter.baselineReady(); }
            catch (error) { lastCaptureError = String(error.stack ?? error); }
          }
        },
        onError: (error) => errors.push(error.message),
      })));
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      try {
        if (editorRoot.querySelector('[contenteditable="true"]') && !adapter.baselineReady()) {
          adapter.captureBaseline();
          baselineReady = adapter.baselineReady();
        }
        const exported = adapter.exportSource();
        if (attempt === 199) delayedState = { elapsedMs: Math.round(performance.now() - started),
          editable: Boolean(editorRoot.querySelector('[contenteditable="true"]')),
          editableTextLength: editorRoot.querySelector('[contenteditable="true"]')?.textContent?.length ?? null,
          baselineReady: adapter.baselineReady(), lastCaptureError,
          onChangeEvents: [...onChangeEvents], errors: [...errors] };
        if (baselineReady && editorRoot.querySelector('[contenteditable="true"]')) {
          lastLoadMetrics = { path, elapsedMs: Math.round(performance.now() - started), attempts: attempt + 1,
            delayedState, lastCaptureError, onChangeEvents: [...onChangeEvents], errors: [...errors] };
          return exported;
        }
      } catch (error) {
        lastCaptureError = String(error.stack ?? error);
        if (attempt === 199) delayedState = { elapsedMs: Math.round(performance.now() - started),
          editable: Boolean(editorRoot.querySelector('[contenteditable="true"]')),
          editableTextLength: editorRoot.querySelector('[contenteditable="true"]')?.textContent?.length ?? null,
          baselineReady: adapter.baselineReady(), lastCaptureError,
          onChangeEvents: [...onChangeEvents], errors: [...errors] };
        if (diagnostic && baselineReady && editorRoot.querySelector('[contenteditable="true"]')) {
          return { error: String(error.stack ?? error) };
        }
        if (attempt === 999) throw error;
      }
    }
    throw new Error("Editor did not mount: " + errors.join("; "));
  }

  window.corpusHarness = {
    load,
    exportBody: () => adapter.exportBody(),
    exportSource: () => adapter.exportSource(),
    insertEdit: () => editorRef.current.insertMarkdown("\\n\\nCorpus engine edit."),
    insertParagraph: () => editorRef.current.insertMarkdown("Corpus engine edit."),
    selectExistingText: () => {
      const editable = editorRoot.querySelector('[contenteditable="true"]');
      if (!editable) throw new Error("No editable engine root");
      editable.focus();
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('[contenteditable="false"], .editor-protected-node')) continue;
        const match = /[A-Za-z]{4,}/.exec(node.textContent);
        if (!match) continue;
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return match[0];
      }
      throw new Error("No ordinary editable text node in engine root");
    },
    wikiSelection: () => adapter.wiki.selectedTarget(),
    applyWikiTarget: (target) => adapter.wiki.applyTarget(target, adapter.wiki.selectedTarget()?.key),
    insertWikiTarget: (target) => adapter.wiki.applyTarget(target),
    selectParagraphEnd: () => {
      const editable = editorRoot.querySelector('[contenteditable="true"]');
      const paragraph = editable?.querySelector("p:last-child");
      if (!paragraph) throw new Error("No final editable paragraph");
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    },
    errors: () => [...errors],
    state: () => ({ baselineReady, lastLoadMetrics, delayedState, lastCaptureError, onChangeEvents: [...onChangeEvents],
      errors: [...errors], editable: Boolean(editorRoot.querySelector('[contenteditable="true"]')),
      rootChildCount: editorRoot.childElementCount, rootHtml: editorRoot.innerHTML.slice(0, 300) }),
  };
</script>`;

async function mdxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return mdxFiles(path);
    return entry.isFile() && entry.name.endsWith(".mdx") ? [path] : [];
  }));
  return groups.flat().sort();
}

function protectedRegions(source) {
  const parsed = createSourceDocument(source);
  const regions = [];
  function visit(node) {
    if (isProtected(node)) {
      regions.push([node.type, source.slice(node.position.start.offset, node.position.end.offset)]);
      return;
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(parsed.body);
  return regions;
}

function exactFrontmatter(source) {
  const parsed = createSourceDocument(source);
  return source.slice(0, parsed.frontmatter.region.closingStart + 3);
}

test.describe.serial("actual engine corpus", () => {
  let fixture;
  let server;
  let sources;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    await mkdir(evidenceRoot, { recursive: true });
    fixture = await createFixtureProject({ name: "actual-editor-corpus" });
    const files = [
      ...(await mdxFiles(fixture.resolve("src/content/essays"))),
      ...(await mdxFiles(fixture.resolve("src/content/notes"))),
    ];
    assert.equal(files.length, 116, "update the corpus count intentionally");
    sources = {
      ...Object.fromEntries(await Promise.all(files.map(async (path) =>
        [relative(fixture.root, path), await readFile(path, "utf8")]))),
      ...syntheticSources,
    };
    await fixture.write("src/pages/corpus-harness.astro", harnessPage);
    await fixture.write("public/__editor_corpus_sources.json", JSON.stringify(sources));
    server = await startFixtureServer(fixture.root, { timeout: 120_000 });
  });

  test.afterAll(async () => {
    test.setTimeout(240_000);
    try {
      if (server) {
        await server.stop();
        await copyFile(server.logPath, join(evidenceRoot, "corpus-server.log"));
      }
    } finally {
      if (fixture) await fixture.cleanup();
    }
  });

  test("one representative adapter transaction exposes source and AST diagnostics", async ({ page }) => {
    test.setTimeout(180_000);
    const paths = (process.env.CORPUS_DIAGNOSTIC_PATHS ?? "src/content/notes/cozy-web.mdx").split(",");
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(String(error.stack ?? error)));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    assert.equal((await page.goto(`${server.origin}/corpus-harness`, { waitUntil: "domcontentloaded" })).status(), 200);
    await page.waitForFunction(() => Boolean(window.corpusHarness));
    const diagnostics = [];
    for (const path of paths) {
      const diagnostic = { path, originalLength: sources[path].length };
      try {
        diagnostic.noOp = await page.evaluate((value) => window.corpusHarness.load(value, true), path);
        diagnostic.loadMetrics = await page.evaluate(() => window.corpusHarness.state().lastLoadMetrics);
        diagnostic.beforeBody = await page.evaluate(() => window.corpusHarness.exportBody());
        if (process.env.CORPUS_DIAGNOSTIC_NOOP_ONLY === "1") {
          diagnostics.push(diagnostic);
          continue;
        }
        if (process.env.CORPUS_DIAGNOSTIC_TEXT === "1" && !componentOnlyEssays.has(path)) {
          diagnostic.replacedText = await page.evaluate(() => window.corpusHarness.selectExistingText());
          await page.keyboard.insertText("CorpusEngineEdit");
        } else if (componentOnlyEssays.has(path)) {
          await page.locator('#corpus-editor-root [contenteditable="true"]').focus();
          await page.keyboard.press("ControlOrMeta+End");
          await page.evaluate(() => window.corpusHarness.insertParagraph());
        } else {
          await page.locator('#corpus-editor-root [contenteditable="true"]').focus();
          await page.keyboard.press("ControlOrMeta+End");
          await page.evaluate(() => window.corpusHarness.insertEdit());
        }
        await page.waitForFunction((marker) =>
          JSON.stringify(window.corpusHarness.exportBody()).includes(marker),
          process.env.CORPUS_DIAGNOSTIC_TEXT === "1" && !componentOnlyEssays.has(path)
            ? "CorpusEngineEdit" : editMarker);
        diagnostic.afterBody = await page.evaluate(() => window.corpusHarness.exportBody());
        diagnostic.afterSource = await page.evaluate(() => {
          try { return { source: window.corpusHarness.exportSource() }; }
          catch (error) { return { error: String(error.stack ?? error) }; }
        });
        diagnostic.errors = await page.evaluate(() => window.corpusHarness.errors());
      } catch (error) {
        diagnostic.harnessError = String(error.stack ?? error);
        diagnostic.harnessState = await page.evaluate(() => window.corpusHarness?.state());
      }
      diagnostic.browserErrors = [...browserErrors];
      diagnostics.push(diagnostic);
    }
    await writeFile(join(evidenceRoot, "corpus-representative-diagnostic.json"),
      `${JSON.stringify(diagnostics, null, 2)}\n`);
    if (process.env.CORPUS_DIAGNOSTIC_PATHS) return;
    const [diagnostic] = diagnostics;
    assert.equal(diagnostic.noOp, sources[diagnostic.path], `${diagnostic.path}: real editor no-op export changed bytes`);
    assert.equal(diagnostic.harnessError, undefined, `${diagnostic.path}: harness failed before source export`);
    assert.equal(diagnostic.afterSource?.error, undefined,
      `${diagnostic.path}: engine body could not serialize (${diagnostic.afterSource?.error})`);
    assert.match(diagnostic.afterSource.source, /Corpus engine edit\./);
  });

  test("one existing prose word changes through the real editor", async ({ page }) => {
    test.setTimeout(180_000);
    const path = "src/content/notes/cozy-web.mdx";
    assert.equal((await page.goto(`${server.origin}/corpus-harness`, { waitUntil: "domcontentloaded" })).status(), 200);
    await page.waitForFunction(() => Boolean(window.corpusHarness));
    assert.equal(await page.evaluate((value) => window.corpusHarness.load(value), path), sources[path]);
    const selected = await page.evaluate(() => window.corpusHarness.selectExistingText());
    assert.ok(selected.length >= 4);
    await page.keyboard.insertText("CorpusEngineEdit");
    const candidate = await page.waitForFunction(() => {
      const source = window.corpusHarness.exportSource();
      return source.includes("CorpusEngineEdit") ? source : false;
    }).then((handle) => handle.jsonValue());
    assert.equal(exactFrontmatter(candidate), exactFrontmatter(sources[path]));
    assert.deepEqual(protectedRegions(candidate), protectedRegions(sources[path]));
    await compile(candidate, { remarkPlugins: [[remarkFrontmatter, ["yaml"]], remarkGfm] });
  });

  test("mixed literal and real wiki tokens keep separate source provenance through engine edits", async ({ page }) => {
    test.setTimeout(180_000);
    const path = "synthetic/mixed-wiki.mdx";
    const original = syntheticSources[path];
    assert.equal((await page.goto(`${server.origin}/corpus-harness`, { waitUntil: "domcontentloaded" })).status(), 200);
    await page.waitForFunction(() => Boolean(window.corpusHarness));
    assert.equal(await page.evaluate((value) => window.corpusHarness.load(value), path), original);
    const links = page.locator("#corpus-editor-root .editor-wiki-link");
    assert.equal(await links.count(), 1, "only the unescaped token should be an editable wiki link");
    await links.first().click();
    await page.waitForFunction(() => window.corpusHarness.wikiSelection()?.target === "same");
    await page.evaluate(() => window.corpusHarness.applyWikiTarget("other"));
    const changed = await page.waitForFunction(() => {
      const source = window.corpusHarness.exportSource();
      return source.includes("[[other]]") ? source : false;
    }).then((handle) => handle.jsonValue());
    assert.equal(changed, original.replace("real [[same]]", "real [[other]]"));
    assert.ok(changed.includes("\\[[same]]"), "literal escaped token lost its source spelling");

    await page.evaluate(() => window.corpusHarness.selectParagraphEnd());
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.evaluate(() => window.corpusHarness.insertWikiTarget("new-target"));
    const inserted = await page.waitForFunction(() => {
      const source = window.corpusHarness.exportSource();
      return source.includes("[[new-target]]") ? source : false;
    }).then((handle) => handle.jsonValue());
    assert.ok(inserted.includes("\\[[same]]"));
    assert.ok(inserted.includes("[[other]]"));
    await compile(inserted, { remarkPlugins: [[remarkFrontmatter, ["yaml"]], remarkGfm] });
  });

  test("editing a bracket in an escaped literal wiki token leaves editable prose", async ({ page }) => {
    test.setTimeout(120_000);
    const path = "synthetic/mixed-wiki.mdx";
    assert.equal((await page.goto(`${server.origin}/corpus-harness`, { waitUntil: "domcontentloaded" })).status(), 200);
    await page.waitForFunction(() => Boolean(window.corpusHarness));
    assert.equal(await page.evaluate((value) => window.corpusHarness.load(value), path), syntheticSources[path]);
    await page.evaluate(() => {
      const editable = document.querySelector('#corpus-editor-root [contenteditable="true"]');
      const literal = [...editable.querySelectorAll('[data-lexical-text="true"]')]
        .find((element) => element.textContent === "[[same]]" && !element.closest(".editor-wiki-link"));
      if (!literal?.firstChild) throw new Error("No source-backed escaped literal token");
      editable.focus();
      const range = document.createRange();
      range.setStart(literal.firstChild, 0);
      range.setEnd(literal.firstChild, 1);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.insertText("x");
    await page.waitForFunction(() => {
      const text = document.querySelector('#corpus-editor-root [contenteditable="true"]')?.textContent ?? "";
      return text.includes("literal x[same]] sits") && !text.includes("literal [[same]] sits");
    }, undefined, { timeout: 5000 });
    const result = await page.evaluate(() => {
      try { return { source: window.corpusHarness.exportSource(), errors: window.corpusHarness.errors() }; }
      catch (error) { return { error: String(error.stack ?? error), errors: window.corpusHarness.errors() }; }
    });
    assert.equal(result.error, undefined, `edited escaped literal must serialize: ${result.error}`);
    assert.deepEqual(result.errors, []);
    await writeFile(join(evidenceRoot, "corpus-literal-bracket-source.mdx"), result.source);
    assert.notEqual(result.source, syntheticSources[path], "bracket deletion did not change source");
    assert.ok(!result.source.includes("\\[[same]]"), "deleted bracket remains in literal source");
    assert.ok(result.source.includes("x[same]]"), "edited literal text disappeared");
    assert.ok(result.source.includes("real [[same]]"), "adjacent real wiki link changed");
    await compile(result.source, { remarkPlugins: [[remarkFrontmatter, ["yaml"]], remarkGfm] });
  });

  test("baseline timing and component-only essays survive focused real-editor edits", async ({ page }) => {
    test.setTimeout(180_000);
    assert.equal((await page.goto(`${server.origin}/corpus-harness`, { waitUntil: "domcontentloaded" })).status(), 200);
    await page.waitForFunction(() => Boolean(window.corpusHarness));
    for (const path of ["src/content/notes/culinary-drift.mdx",
      "src/content/essays/api.mdx", "src/content/essays/databases.mdx"]) {
      const original = sources[path];
      assert.equal(await page.evaluate((value) => window.corpusHarness.load(value), path), original,
        `${path}: editor no-op export must be exact`);
      if (componentOnlyEssays.has(path)) {
        await page.locator('#corpus-editor-root [contenteditable="true"]').focus();
        await page.keyboard.press("ControlOrMeta+End");
        await page.evaluate(() => window.corpusHarness.insertParagraph());
      } else {
        await page.evaluate(() => window.corpusHarness.selectExistingText());
        await page.keyboard.insertText("CorpusEngineEdit");
      }
      const candidate = await page.waitForFunction((marker) => {
        const source = window.corpusHarness.exportSource();
        return source.includes(marker) ? source : false;
      }, componentOnlyEssays.has(path) ? editMarker : "CorpusEngineEdit")
        .then((handle) => handle.jsonValue());
      assert.equal(exactFrontmatter(candidate), exactFrontmatter(original));
      assert.deepEqual(protectedRegions(candidate), protectedRegions(original));
      await compile(candidate, { remarkPlugins: [[remarkFrontmatter, ["yaml"]], remarkGfm] });
    }
  });

  test("all 116 copied sources survive real MDXEditor import/export and one transaction", async ({ page }) => {
    test.setTimeout(900_000);
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(String(error.stack ?? error)));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    assert.equal((await page.goto(`${server.origin}/corpus-harness`, { waitUntil: "domcontentloaded" })).status(), 200);
    await page.waitForFunction(() => Boolean(window.corpusHarness));
    const outcomes = [];
    try {
      for (const [path, original] of Object.entries(sources).filter(([path]) => path.startsWith("src/content/"))) {
        const outcome = { path };
        const browserErrorStart = browserErrors.length;
        try {
          const noOp = await page.evaluate((value) => window.corpusHarness.load(value), path);
          assert.equal(noOp, original, `${path}: no-op export changed source bytes`);
          outcome.noOp = "pass";
          if (componentOnlyEssays.has(path)) {
            await page.locator('#corpus-editor-root [contenteditable="true"]').focus();
            await page.keyboard.press("ControlOrMeta+End");
            await page.evaluate(() => window.corpusHarness.insertParagraph());
            outcome.representativeEdit = "paragraph insertion";
          } else {
            outcome.replacedText = await page.evaluate(() => window.corpusHarness.selectExistingText());
            await page.keyboard.insertText("CorpusEngineEdit");
            outcome.representativeEdit = "existing editable text replacement";
          }
          const candidate = await page.waitForFunction((marker) => {
            const source = window.corpusHarness.exportSource();
            return source.includes(marker) ? source : false;
          }, outcome.representativeEdit === "paragraph insertion" ? editMarker : "CorpusEngineEdit")
            .then((handle) => handle.jsonValue());
          assert.notEqual(candidate, original);
          assert.equal(exactFrontmatter(candidate), exactFrontmatter(original),
            `${path}: frontmatter changed during body edit`);
          assert.deepEqual(protectedRegions(candidate), protectedRegions(original),
            `${path}: protected source changed during engine transaction`);
          await compile(candidate, { remarkPlugins: [[remarkFrontmatter, ["yaml"]], remarkGfm] });
          assert.deepEqual(await page.evaluate(() => window.corpusHarness.errors()), [],
            `${path}: MDXEditor reported an error`);
          assert.deepEqual(browserErrors.slice(browserErrorStart), [],
            `${path}: uncaught browser or internal editor error`);
          assert.equal(await readFile(fixture.resolve(path), "utf8"), original,
            `${path}: corpus harness wrote its source file`);
          outcome.transaction = "pass";
          outcome.compile = "pass";
        } catch (error) {
          outcome.error = String(error.stack ?? error);
        }
        outcomes.push(outcome);
      }
    } finally {
      await writeFile(join(evidenceRoot, "corpus-engine-outcomes.json"),
        `${JSON.stringify(outcomes, null, 2)}\n`);
    }
    assert.deepEqual(outcomes.filter((outcome) => outcome.error), [],
      "every copied source must import, export, transact, and compile");
  });

  test("synthetic repeated, CRLF, Unicode, nested, and versioned sources use the same engine seam", async ({ page }) => {
    test.setTimeout(120_000);
    assert.equal((await page.goto(`${server.origin}/corpus-harness`, { waitUntil: "domcontentloaded" })).status(), 200);
    await page.waitForFunction(() => Boolean(window.corpusHarness));
    for (const [path, original] of Object.entries(syntheticSources)) {
      const noOp = await page.evaluate((value) => window.corpusHarness.load(value), path);
      assert.equal(noOp, original, `${path}: no-op export changed bytes`);
      await page.evaluate(() => window.corpusHarness.selectExistingText());
      await page.keyboard.insertText("CorpusEngineEdit");
      const candidate = await page.waitForFunction((marker) => {
        const source = window.corpusHarness.exportSource();
        return source.includes(marker) ? source : false;
      }, "CorpusEngineEdit").then((handle) => handle.jsonValue());
      assert.equal(exactFrontmatter(candidate), exactFrontmatter(original));
      assert.deepEqual(protectedRegions(candidate), protectedRegions(original));
      await compile(candidate, { remarkPlugins: [[remarkFrontmatter, ["yaml"]], remarkGfm] });
      assert.deepEqual(await page.evaluate(() => window.corpusHarness.errors()), []);
    }
  });
});
