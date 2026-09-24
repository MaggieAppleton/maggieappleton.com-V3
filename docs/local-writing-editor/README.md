# Local writing editor

The editor is a local writing surface for notes and essays, including drafts and existing versions. MDX files remain the source of truth. Use your usual Git workflow to review, commit, and publish changes.

## Run locally

```sh
npm ci
npm run dev
```

Open the loopback URL printed by Astro. Choose **Edit** on a note or essay, or **New draft** on the local drafts page. The editor is available only during development; production builds and previews do not provide editing or file-writing routes.

## Write and save

Edit the title, description, and article text in place. Paragraphs, headings, lists, blockquotes, bold, italic, inline code, and links support ordinary rich-text editing. Use Cmd/Ctrl+B for bold, Cmd/Ctrl+I for italic, Cmd/Ctrl+E for inline code, and Cmd/Ctrl+K to insert or edit a link.

Start a paragraph with `#` through `####`, `-`, or `>` followed by Space for a heading, list or quote. Use Tab and Shift+Tab to indent and outdent list items. Selecting an ordinary link shows its URL and an action to open it.

To insert a wiki link, place the caret and choose **Wiki link**. To retarget one, select its text first. Known targets offer **Open target**. Wiki links keep their `[[target]]` syntax.

Existing intro paragraphs, footnotes, and audience notes support editing their prose. Images, code blocks, tables, embeds, illustrations, and other components retain their real presentation and are protected against accidental changes. Their properties and internal content remain read-only.

Autosave runs after 750 ms without an edit. **Save** or Cmd/Ctrl+S saves immediately. The status distinguishes unsaved work, an in-flight save, saved work, save failures, and a file changed elsewhere. An active writing tab keeps its editor instance through saves and server restarts. Development code changes require an intentional reload of that tab.

Saving body text does not change publication dates, growth stage, draft status, or version metadata. Changing a title does not rename its file.

## Conflicts and recovery

If another editor or browser tab changes the file, automatic saves stop. **Load disk version** first copies your browser version to the clipboard; if that copy fails, your live writing stays open. When recovery storage is available, the discarded browser version also remains available to copy after loading the file. The editor does not merge or force-overwrite conflicting files.

Recovery candidates are stored locally for each worktree, document, and writing tab. Reopening offers unsaved candidates and checks them against the current file. A recovery-storage failure is shown explicitly; keep the tab open or export the buffer until it is saved. Browser storage belongs to the browser origin, so changing the development port may make earlier candidates unavailable at the new address.

## New drafts

Choose note or essay, enter a title, and confirm the proposed filename. Essays also need a description and an existing repository cover. New files start as drafts at the seedling growth stage with today's local calendar dates. Filename and route collisions are rejected without overwriting an existing file.

## Verify changes

```sh
node --test tests/*.test.mjs tests/*.test.js
npm run test:editor
npm run test:editor:e2e
npm run verify:html
npm run build:local
git diff --check
```

Browser tests use disposable project copies and their own loopback servers. They must never write through symlinks to authored content. See [verification.md](verification.md) for acceptance evidence and [decisions.md](decisions.md) for architecture decisions.

Component insertion/property editing, asset uploads, other content collections, general metadata editing, automatic merging, writing suggestions, and publishing controls are outside this release.
