# Local writing editor decisions

## Current checkpoint

- Branch: `maggie/local-writing-editor`, starting at `a2593f37728b6ffb61231041b129622fe752acec` (current `origin/main`, 2026-09-24).
- Approved handoff extracted and all five SHA-256 entries verified before implementation.
- Baseline: dependency installation, all 66 existing tests, and the static build (195 pages) passed.
- The same-root MDXEditor adapter now passes the 116-document corpus, original-component rendering, shared history, recovery, draft creation and production-isolation checks. The seven writing checks, including rapid link-key regressions, also pass. Exact final committed-head results are recorded in the PR and local handoff record; see [verification.md](verification.md).
- Roles: Astra architecture/integration/delivery. Worker models match task complexity: Sol for harder implementation/testing/review, Terra or Luna for straightforward tasks. Workers share this isolated checkout and have separate file ownership.

## 2026-09-24 — Baseline and scope

Problem: planning documents are ignored and cannot be recovered from a checkout alone.

Decision: verify and extract the complete handoff into this worktree; retain a tracked execution record and ignored raw evidence under `.local-writing-editor/`. Preserve the supplied plans throughout delivery.

Evidence: all five manifest hashes matched before and after extraction. GitHub resolved the default branch to `main` at the starting SHA above. The worktree was clean and detached; a fresh feature branch was created without changing another branch or checkout.

Consequence: the approved product contract controls implementation; milestones are reporting checkpoints. Existing authored content has a SHA-256 inventory (`.local-writing-editor/content-baseline.json`, 173 files) and destructive tests use disposable copies.

## 2026-09-24 — Architecture boundaries

Problem: normal editor serializers cannot establish lossless MDX preservation, and React cannot directly render Astro components.

Decision: retain the four approved boundaries: source ledger/adapter, editing session, content-file service, and development-only Astro integration. Evaluate MDXEditor with executable transaction evidence before retaining it or using the authorized ProseMirror fallback. Use original Astro-rendered protected regions with source identity metadata rather than a parallel component catalogue.

Alternative: whole-document Markdown serialization or handwritten component substitutes. Rejected because both violate the approved contract.

Consequence: compatibility evidence must cover both source changes and the live rendered article before expanding the workflow. No engine choice has been made yet.

## 2026-09-24 — Model allocation update

Maggie superseded the fixed role/model assignment: choose models by task complexity. Existing Sol source/engine work, Terra baseline/source-test setup, and Luna focused seam inspection remain appropriate. Complex browser/concurrency testing and broad review will use Sol as needed; retain existing workers for suitable follow-ups.

## 2026-09-24 — Original component lifecycle and shared styles

Problem: imported Astro components do not forward arbitrary MDX marker props, protected charts initialize against original DOM IDs, and supported components use scoped CSS and client text transforms. Generic wrappers can also alter the article's grid layout.

Decision: base the rendering experiment on `render(entry)` and the existing `<Content components={components}>` path. Prove source-region markers without introducing layout boxes, retain the actual component DOM/lifecycle, and isolate article text transforms from the live editing surface. Share only the narrow style rules needed by editable equivalents.

Evidence: independent preflight in `.local-writing-editor/preflight-review.md`; current `GarminData.astro` initializes its D3 chart by element IDs, `IntroParagraph.astro` mutates text nodes, and the prose wrapper places direct children in a three-column grid. The wiki-link transform replaces text nodes without preserving their positions.

Consequence: engine choice remains contingent on nested editing/history and this real rendering proof. Source identity annotations need the authored AST before wiki-link transformation. Production must omit all annotation/editor paths.

## 2026-09-24 — Direct serializer rejected; identity adapter under test

Problem: MDXEditor 4.2.5's real browser import/export rewrites an untouched import's quotes and semicolon. Its initial Markdown path also trims input, so normal serialized output cannot meet byte-preservation requirements.

Decision: reject direct Markdown round trips and test the documented import/export visitors with Lexical node state for persistent region identities. If that cannot retain identities/history/rendering after at most two materially different adapter strategies, use the approved ProseMirror fallback.

Evidence: executable browser probe under `.local-writing-editor/engine-spike/`; source regression tests initially exposed a BOM-relative parser offset that truncated a terminal emoji, now fixed. The initial 11 source cases pass, with broader structural/corpus coverage in progress.

Consequence: a passing pure-source suite does not establish engine compatibility. Keep real engine transaction and rendering tests as the gate.

## 2026-09-24 — Nested history gate

Problem: MDXEditor's documented visitors and Lexical NodeState preserve source identities through real paragraph and nested-footnote edits, but the default shared nested editor loses usable undo after the footnote blurs. Undo works while it remains focused; subsequent blur/refocus leaves the DOM and exported source unchanged.

Decision: try the second materially different MDXEditor adapter strategy: represent supported writing components as custom Lexical ElementNodes in one document using public node and visitor registration. If it fails the same acceptance gate, switch to ProseMirror.

Evidence: `.local-writing-editor/engine-spike/transaction-probe.mjs`. No engine approval is recorded yet.

Consequence: shared body history is a release requirement. Fixing source preservation alone cannot justify shipping the nested-editor failure.

## 2026-09-24 — Source review and identity provenance

Problem: independent review reproduced a moved bullet item retaining its old list marker, writable supported-component attributes, and a pasted clone taking the original node's identity when inserted before it. Existing tests did not cover these cases.

Decision: reject changes to existing component wrappers/properties; validate supported semantics after candidate reparse; render moved list items in their new parent context. Ruling: duplicate original source identities are ambiguous and must be rejected by the source seam rather than resolved by traversal order. The engine assigns fresh identities to actual pasted/split nodes using node provenance.

Evidence: exact reproductions in `.local-writing-editor/source-review/report.md`; regression tests and fixes are in progress.

Consequence: normal UI paste must remain available, so identity assignment belongs at the engine transaction boundary as well as validation at serialization. Incorrect provenance would risk changing an untouched block's authored syntax.

## 2026-09-24 — Browser-safe source seam

Problem: gray-matter requires Buffer and prevented browser-side candidate serialization/recovery.

Decision: use browser-safe js-yaml on the exact frontmatter substring for metadata interpretation, retaining YAML syntax-tree ranges for targeted patches.

Evidence: metadata equality against gray-matter across all 116 notes/essays, including legacy tab-indented aliases; Vite browser import and no-op source serialization pass.

Consequence: one source implementation serves browser and server without per-keystroke conversion requests or a Buffer polyfill.

## 2026-09-24 — Semantic validation follow-through

Independent re-review confirmed all three original source defects fixed. It then reproduced a false rejection for adjacent text nodes that the Markdown parser coalesces, and identified ordered-list reordering as a remaining safe-but-unsupported operation. Both are being fixed before the source foundation is accepted. Request guards passed scoped security review; oversized-body responses must retain 413 even if stream cancellation itself fails.

## 2026-09-24 — Source foundation accepted

The third focused re-review passed the bounded pure-source contract and code-quality checks. Contextual list rendering retains destination marker style, punctuation, start value, and nesting; unsupported structural changes fail rather than silently corrupting source. Fresh validation before commit: 25 source tests, two 116-file corpus tests, eight request-guard tests, and all 66 existing tests pass. Astro remains 5.1.3 and React 18.3.1; candidate MDXEditor is 4.2.5. The actual engine corpus, paste provenance, original component rendering, saving/session lifecycle, and production isolation remain separate unfinished acceptance gates.

## 2026-09-24 — Atomic persistence boundaries

The service serializes its own writes, checks content revisions before validation and again after temporary-file sync, and atomically replaces the indexed file. Deterministic tests passed for simultaneous clients, stale queued work, outside edits during validation and after temporary writing, symlink swaps, failure recovery, and lost-response retries. A separate process can still write in the narrow interval between the final content check and the OS rename; this is not an OS compare-and-swap guarantee. No database or intrusive cross-process locks are introduced. Raw evidence: `.local-writing-editor/file-store-races-report.md`.

The initial 173-file inventory contains 167 authored MDX files, five authored JSON data files, and `src/content/config.ts`. Schema extraction intentionally edits that one configuration file; the final writing-integrity audit must verify the 172 authored MDX/JSON files byte-for-byte and review schema code separately.

### Save policy and canonical file paths

The file service requires real candidate validation. It shares the site’s note/essay schema factories, permits only title/description YAML patches and supported prose transformations, compares protected source and supported component wrappers in occurrence order, and checks that essay covers are real decodable files in the approved cover directory. The index rejects duplicate identities and multiple identities for one physical file. Its write target is always the canonical scanned file, including when Astro supplies a symlink alias.

### Active editor reload handling

Vite’s documented HMR notifications provide no reload veto, and the installed client also reloads automatically after a server restart. An isolated browser probe confirmed that an editor-only WebSocket capture listener can stop reload/update/close events before Vite handles them, while ordinary preview tabs continue reloading. The guard restores the native WebSocket constructor immediately after capturing the Vite socket. This freezes development-code HMR in the active writing tab until intentional navigation/reload; HTTP revision checks and capability renewal remain the session’s responsibility. The real Astro editor still needs the same browser proof. Evidence: `.local-writing-editor/hmr-spike/`; reference: [Vite HMR API](https://vite.dev/guide/api-hmr).

### Equivalent structural exports

MDXEditor exports a newly entered blockquote as direct phrasing children, while remark reparses the same source with one paragraph wrapper. It also omits an unordered list's parser-inserted `start: null`. Candidate validation now compares these two narrow equivalent forms without relaxing component, protected-source or multi-paragraph structure checks. A direct regression and fresh source/corpus/validator suite pass 37/37; the browser formatting gate remains separate.

### Preserve authored spelling during text edits

Decoded text cannot be safely located by matching substrings in Markdown: repeated text is ambiguous, escapes differ from visible characters, and two edits can surround an unchanged literal wiki token. The text-source helper maps decoded offsets to source atoms for backslash escapes, character references and Unicode. It applies ordered edit hunks while retaining untouched spellings. Supported JSX prose explicitly accounts for indentation removed by MDX parsing.

Every splice must decode back to the requested text; ambiguous or oversized transformations fail before saving. Newly typed syntax is escaped in context, and the source seam still reparses the complete candidate before accepting it. Independent review reproduced repeated-text and disjoint-edit failures in earlier approaches; the helper regressions and fresh source/corpus/validator checks pass 48/48. Browser wiki import/export remains a separate integration gate.

### Public editor exports and wiki tokens

Wiki links use distinct editor nodes for actual links and authored escaped literals. Both the source serializer and MDXEditor's internal Markdown serializer must know those types; omitting the internal handlers caused an uncaught editor crash. Incomplete tokens return to plain text when edited. The full 116-file actual-engine corpus now passes byte-identical no-ops, supported edits and compilation with explicit browser-error checks.

MDXEditor's list visitor supplies optional fields as explicit `undefined`, whereas the Markdown parser supplies `null`. JSON diagnostics hid this distinction. Validation now treats those two absent values equivalently only for list `start` and item `checked`; ordered starts, checkbox values and all other structural comparisons retain their meaning. An explicit-undefined regression and independent source review cover this correction.

### Stock link dialog accessibility

The stock dialog rendered its URL label without a matching input ID. A small public composer-child plugin associates that existing label with its input inside the editor's own popup container and disconnects its observer on cleanup. The browser check now finds the field by its exact accessible name. The stock dialog, keyboard command and submission behavior remain in place.

### Optional titles on ordinary links

The stock link form exports an empty title when none was entered, while Markdown reparses an omitted title as `null`. The source comparison now treats empty, null and undefined titles as absent only on link nodes. Nonempty titles and other node types remain strict. The exact serialization regression passes, and the browser workflow saves the default untitled link before testing its open action and wiki links.

### Keyboard selection timing

A real keyboard trace showed native selected text while both Lexical and MDXEditor's cached selection still held the preceding caret. The stock Cmd/Ctrl+K dialog then inserted the URL as anchor text. A narrow public composer-child command synchronizes a noncollapsed native range inside the active editable root before the stock shortcut runs. It skips composition, read-only state and selections outside that root, and keeps the existing dialog and link behavior. Browser acceptance covers selected-text linking, saving, and opening the target.

The same lag could leave Lexical selecting a newly created link after ArrowRight had collapsed the browser caret. An immediate Enter then removed that link. Backspace and Delete reproduced the same loss; ordinary typing already respected the native caret. The command repairs this specific native-collapsed/Lexical-noncollapsed range mismatch before unmodified Enter, Backspace and Delete. Protected node selections retain their existing handling. Mounted browser regressions cover the delayed-selection event ordering.

### Recovery identity and protected content

An independent review reproduced two recovery defects: opener-created tabs inherited the same writer ID from sessionStorage and overwrote one recovery key; rebuilding edited Markdown against the old adapter lost protected-node identities when preceding text changed length.

Each mounted writer now gets a fresh identity. Reopening discovers prior candidates, and restoring a candidate transfers its record only after the new record is stored successfully, preserving unrelated and newer records. Selecting an older candidate first archives any current unsaved writing, including a newer engine snapshot after conversion failure. An archive failure stops the replacement before changing the live session. Recovery rebuilds the adapter from the recovered source and carries protected-region identities back to the original rendered nodes. A source-signature check prevents a same-offset disk change from displaying the wrong protected content during a conflict. Metadata and composition handlers use the current adapter; each remounted body receives its accessibility label and initial source baseline.

Regression coverage includes two real opener-created tabs, continued prose/title/description editing after protected-content recovery, saving and reopening, a same-offset protected disk conflict, and repeated protected regions inside nested writing components. The original failures and focused fixes are recorded in `.local-writing-editor/recovery-fixes/`; final acceptance and the independent re-review are recorded separately.

### Match source and rendering before mounting

An expanded WebKit recovery check reproduced a rapid-save/reload race: the bootstrap contained the saved file while Astro still supplied the previous entry and compiled article. The changed protected-region offsets then left the editor empty.

The local route now waits for the current file, Astro entry, and compiled article fingerprint to agree, rereading the file before accepting the result. It resolves `astro:content` through a fresh public import on each attempt because a static import can retain the earlier data-store snapshot. The existing development-only remark plugin supplies the compiled-source fingerprint. Both sides hash the exact MDX compiler input from the public `@astrojs/markdown-remark` parser, preserving whitespace and frontmatter padding that determine protected-region offsets; trimming those bytes would hide a blank-line-only mismatch. The wait is bounded; a mismatch shows a reloadable message instead of mounting inconsistent content. No content-refresh bridge or private cache mutation is used.

The regression checks rendered title, description, prose, and the protected marker after saving, then reloads into a working editor. The first WebKit failure and diagnostic probes are retained under `.local-writing-editor/recovery-fixes/`.

### Paragraph-end spaces after deleting formatting

Deleting nested bold and italic prose left three ASCII spaces at a paragraph's end. The source-preserving serializer emitted them literally, but Markdown parsing discarded them. The strict structure comparison therefore rejected an otherwise valid edit with “Edited source changed the requested MDX structure.” This was a conversion bug, not invalid writing.

Changed paragraphs now encode terminal text spaces as character references. Their decoded text survives parsing without introducing a hard break; unchanged source, nonbreaking spaces and authored hard breaks retain their bytes. The source regression reproduces the original failure before the fix. A separate real-editor test covers deleting formatted text, exporting, and reopening; the engine replaces that fixture's paragraph identity, so the source regression remains the direct proof of the failing path.

### Docked controls and recovery

Editor controls live in a fixed dark pill 90px above the viewport bottom. Its details panel opens upward for errors, conflicts and recovery without taking focus from writing. Errors use actionable copy, with technical details available in the same panel. Wiki-link authoring controls are removed; existing wiki links remain supported.

Loading a conflicting disk version requires a copy or download of the current browser version. Backup authorization matches its source and edit generation. The clipboard fallback rechecks live state after the asynchronous copy, so edits made while permission is pending cannot be silently discarded.
