# Local writing editor verification

## Test environment and baseline

Worktree: `maggie/local-writing-editor`, based on `a2593f37728b6ffb61231041b129622fe752acec`. Node 24.10.0, Astro 5.1.3, React 18.3.1, MDXEditor 4.2.5, Lexical 0.48.0 and Playwright 1.63.0.

Before implementation, `npm ci` installed 851 packages, all 66 existing Node tests passed, and `npm run build:local` built 195 pages in 725.47 seconds, including 8,296 image variants. All five supplied handoff hashes were verified. Raw evidence lives in ignored `.local-writing-editor/`; implementation decisions are tracked in [decisions.md](decisions.md).

Browser tests use disposable project copies, copied writable content and dependencies, independent loopback ports, and owned process-group cleanup. They never write through symlinks to the original content. A dependency-symlink baseline attempt failed because Astro resolved style modules outside the fixture; copying dependencies fixed the harness. A controlled timeout check also verifies that an expired build stops its owned child process.

## Acceptance evidence

The table records focused acceptance evidence. The final integrated commands, exit codes, exact tested commit and remote PR verification are recorded separately in `.local-writing-editor/final-handoff.json` and the PR description after committing the implementation. Passing focused checks does not replace that final run.

| Gate | Evidence | Status |
| --- | --- | --- |
| S1 / S3: source preservation | Exact no-op bytes, targeted prose and YAML edits, protected JSX/imports/expressions, repeated identities, Unicode, escapes/entities, BOM/CRLF and missing terminal newline. The source/helper/corpus/validator checks pass, including the ordinary-link title regression (29 source cases). | Focused checks pass. |
| S2: actual editor corpus | All 116 notes/essays are enumerated, including 19 drafts. Actual engine import/export checks no-op bytes, representative supported edits, unchanged frontmatter/protected source and MDX compilation. | 116/116 pass after the wiki fixes, with no uncaught browser or editor errors. |
| F1–F3: persistence and request guards | Revision checks, atomic replacement, idempotent retry, simultaneous saves, injected filesystem failures, outside edits and symlink/path rejection. Four live HTTP cases exercise successful persistence plus host/origin/token/method/type/size rejection, no-store and no-CORS. | Focused checks pass. |
| R1: session state | 25 deterministic cases cover debounce, one in-flight request, generation-specific acknowledgement, undo, stale responses, uncertain retries, conflicts, composition and recovery failures. | Focused checks pass. |
| R2: live recovery | 16 browser cases cover reload, separate closed-tab and opener-created tab candidates, metadata undo, conflicts, server restart/token renewal, changed-port worktree identity, outside changes, stale polling across a PUT, denied/full storage, conversion failure, pending navigation, lost acknowledgement, shifted protected source, same-offset protected disk changes and preserving newer work when choosing an older recovery copy. | The original 12 cases and four added review regressions pass in focused runs; final integrated results are recorded separately. |
| B1: writing | Paragraph operations pass. Heading/list shortcuts, ordinary and wiki links, formatting and paste are checked through keyboard input, saved source and normal preview. | Integrated 7/7 pass, including rapid link-selection/Enter/Backspace regressions. |
| B2: protected content | Five cases cover boundary traversal/deletion, cross-region Backspace/Delete/Cut and synthetic drop. Ordinary typing immediately before protected inline content is saved. Supported nested prose uses the shared undo history. | Integrated 5/5 pass. |
| B3: long-document continuity | Real long content retains the editor DOM, caret, scroll, newest writing and undo after delayed saves and watcher activity; a normal preview shows the saved result. | Focused check passes. |
| B4: keyboard and composition | Labelled controls, visible keyboard focus, save status and synthetic Japanese composition. No autosave occurs during composition. | Focused check passes. |
| D1: draft creation | Note and essay creation, metadata/cover validation, editing/saving, unchanged filename after title edit, restart/discovery/reopen, collision suffix and configured-origin handoff. Service tests cover retry/concurrent creation and invalid paths. | Browser 4/4 and service 13/13 pass. |
| V1: visual comparison | Normal/editor pairs for cozy-web, lodestone and growing-a-human at 1440×1000 and 768×1024 compare fonts, wrapping, spacing, drop caps, footnotes, images, grids and full-width regions. | Six pairs pass, with the public desktop pair refreshed after the final link style change. |
| V2: original components | The real Garmin chart, its pointer interaction, local images and nested layout render in place. A nested Footnote edit preserves surrounding source and shares body undo/redo. | Focused checks pass. |
| P1: production isolation | Disposable sentinel draft, successful production build, output scan, public feeds/sitemap, absent editor handlers and unchanged files after write attempts. | Integration 2/2 pass, including successful build. |
| P2: existing site | All 66 original tests pass. `verify:html` passes 26 routes, including publication/version/draft routing and normal pages. | Focused checks pass. |
| I1: integrity | All 172 original authored MDX/JSON files still match baseline hashes. The one other inventoried file, `src/content/config.ts`, intentionally reuses shared schema factories. | 172 authored files match the baseline; final audit is recorded separately. |

The corpus has 22 essays and 94 notes; 113 contain JSX and 70 contain wiki links. It has no nested source versions, so version identity uses synthetic fixtures. Every serialized full save request fits the 10 MiB limit; the largest is 56,589 bytes. Corpus compilation does not claim 116 independent Astro runtime renders; representative rendering and the production build are separate gates.

## Reproduced failures and verified corrections

- Source edits preserve the authored spelling of untouched escapes, character references and repeated text. Validation accepts only narrow equivalent quote/list AST forms and rejects ambiguous identities or changed protected components.
- A poll begun before a PUT could return afterward and falsely report an external conflict. The transport now invalidates observations spanning its own writes; a controlled browser regression proves subsequent typing still saves.
- Explicit disk replacement exports the live buffer first. If clipboard access fails, writing remains open. Conversion failures retain the newest engine Markdown snapshot for recovery and export.
- New draft creation waits for Astro's content loader and renderer before navigation. The wait includes a finite response-body timeout and retains the request ID for safe retry. Empty editor caret paragraphs no longer cause an otherwise valid first save to fail.
- Production-like Chromium runs exposed an internal MDXEditor serializer that did not recognise custom wiki nodes. Both the internal serializer and source serializer now register those node types; the complete 116-file corpus rerun passes with explicit browser/editor error assertions.
- The mobile prose and intro drop-cap rules use the site's different breakpoint boundaries. Shared Footnote/Audience styles and the component map prevent separate rendering implementations from drifting.
- A preset editor capability is cleared before checking the dev host, so non-loopback startup cannot inherit a usable editor origin/token.
- Empty ordinary-link titles now compare as absent only for link nodes, and the stock URL field has a native accessible label. Native selection changes are synchronized before link insertion and the confirmed rapid Enter/Backspace/Delete cases; regression tests preserve linked prose through immediate key sequences.

Independent review added regression coverage for inherited tab identities and protected-source recovery after offset changes. Both original browser cases failed before their fixes. The four focused recovery regressions and all 120 editor unit tests pass; a repeated-region source test covers nested writing components. Recovery-choice cases cover archival before replacement, storage failure, newer engine snapshots after conversion failure, and superseded save retries. An expanded WebKit run also caught new bootstrap source paired with an old Astro render after save. A bounded source/render agreement check and fresh public content imports fix that race; the regression checks rendered metadata, prose and protected markers before reload. A fingerprint regression distinguishes blank-line edits that shift protected offsets. Draft creation also checks the empty-body case: Astro omits an empty body field, so the loader comparison normalizes it to an empty string before checking the exact compiled fingerprint. Review and repro evidence is under `independent-sol-review/` and `recovery-fixes/`.

Evidence includes `source-text-review.md`, `integration-review.md`, `recovery-integrated.log/json`, `drafts-full-visibility.log`, `normal-html-integration.log`, `writing-full-final-5.log`, `drafts-approved-cover.log`, and paired screenshots/metrics under `browser-evidence/`, all beneath `.local-writing-editor/`.

## Practical limits

- Composition and drag/drop coverage use synthetic browser events, not a manual OS IME or native drag session. Chromium is the required baseline; the available WebKit reload/recovery smoke also passed in the focused run.
- The recorded 27-character replacement on the long article took 104 ms including Playwright input overhead in headless Chromium. This is not a per-keystroke latency benchmark.
- Reading views may apply typographic apostrophe transforms; editing retains authored characters. The editor toolbar intentionally adds vertical space, so visual checks compare relative article geometry.
- Active writing and draft-creation tabs suppress Vite reloads to preserve work. Development code changes require an intentional reload. Normal preview tabs continue to update.
- File replacement is atomic and checks revisions immediately before replacement, but is not an OS compare-and-swap against unrelated external processes. Recovery storage is browser-origin scoped; changing ports can make earlier candidates unavailable at the new origin.

## Final command surface

```sh
node --test tests/*.test.mjs tests/*.test.js
npm run test:editor
npm run test:editor:e2e
npm run verify:html
npm run build:local
git diff --check
```

The production test explicitly builds and serves its isolated fixture; a nonzero build fails acceptance. `build:local` avoids webmention refresh and deployment. Final handoff also checks the available WebKit smoke, all authored-content hashes, the full Git diff, required remote checks, the tested PR head and the rendered GitHub image attachment.
