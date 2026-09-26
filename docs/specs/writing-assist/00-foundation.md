# 00 · Foundation

This spec builds the shared infrastructure that every Writing Assist tool uses. It ships **no user-facing analysis**. When it lands, the Assist panel and the drawer shell exist, and a built-in `debug` tool proves the whole pipeline works end to end.

Read [README.md](README.md) first for the decisions every spec shares.

## Existing code to build on

- `src/editor/integration.mjs` injects dev-only routes. Add the assist routes here.
- `src/editor/routes/document.js` and `src/editor/server/request-guards.mjs` show the route pattern to copy: `assertEditorRequest`, `readEditorJson`, `editorJson` and `editorError`.
- `src/editor/client/mdx-adapter/editor-adapter.mjs` builds the MDXEditor `plugins` array. New Lexical-aware code goes in as `realmPlugin`s that use `addComposerChild$`. `selection-sync.mjs` is the template to follow.
- `src/editor/client/mdx-adapter/writing-jsx-node.mjs` defines `WRITING_COMPONENTS`, the set of components whose text is analysed.
- `src/editor/client/editor-dock.mjs` holds the dark pill (Preview, save status, Details). The Assist and Map buttons go here.
- `src/editor/client/mount.mjs` creates React roots for the editor and the dock.
- The tests are `npm run test:editor` (`node --test tests/editor/*.test.mjs`) and `npm run test:editor:e2e` (Playwright).

## File layout

```
src/editor/assist/
  config.mjs                 # per-tool provider, model, thresholds, enabled defaults
  shared/
    hash.mjs                 # stable text hashing (used by client and server)
    annotation.mjs           # annotation shape + helpers
  server/
    judge.mjs                # builds Jev requests from tool modules, applies thresholds
    providers/
      index.mjs              # createProvider(name) → { generate, stream }
      anthropic.mjs
      openai.mjs
      openai-compatible.mjs  # local models (Ollama, LM Studio)
    sidecar-store.mjs        # .writing-assist/ read/write, atomic rename
    tools/
      index.mjs              # registry: id → tool module
      debug.mjs              # foundation-only test tool
  routes/
    judge.js                 # POST /_editor/api/assist/judge
    generate.js              # POST /_editor/api/assist/generate
    sidecar.js               # GET/PUT /_editor/api/assist/sidecar
  client/
    sentence-model.mjs       # Lexical → blocks/sentences with ids + ranges
    scheduler.mjs            # two-speed dirty tracking, debounce, abort
    annotation-store.mjs     # current annotations, subscriptions, dismissal filtering
    assist-transport.mjs     # fetch wrappers for the three routes
    overlay/
      highlights.mjs         # CSS Custom Highlight API registration
      markers.mjs            # margin + end-of-sentence marker layer
      hit-test.mjs           # pointer → annotation lookup
    popover/
      HoverCard.mjs
      PinnedPopover.mjs      # header (icon, title, trash, X), body slot, chat, Apply
      ChatThread.mjs
    AssistPanel.mjs          # switches, opened from the dock
    Drawer.mjs               # right-hand slide-out shell with tab/segmented slot
    assist-plugin.mjs        # realmPlugin that wires everything into the editor
    assist.css
```

Keep files small and single-purpose, and follow the existing editor code style: `.mjs`, JavaScript, `React.createElement`, no JSX.

## Dependencies and environment

- Add `@typesafe-ai/sdk`, `@anthropic-ai/sdk` and `openai`. The `openai` package also serves the `openai-compatible` provider through a custom `baseURL`.
- Environment variables, read on the server only and never sent to the client:
  - `TYPESAFE_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `LOCAL_LLM_BASE_URL` (for example `http://localhost:11434/v1`)
  - `LOCAL_LLM_API_KEY` (optional)
  - `OPENAI_MODEL` (the OpenAI provider reports itself unavailable until this is set)
- Add `.writing-assist/` to `.gitignore`.
- Add a commented `.env.example` block listing these variables.

## Config (`config.mjs`)

One exported object. Tools read their own entry, and nothing else hard-codes models or thresholds.

```js
export const assistConfig = {
  judge: { model: "jev-latest" },
  providers: {
    anthropic: { defaultModel: "claude-sonnet-5" },
    openai: { defaultModel: process.env.OPENAI_MODEL ?? null },   // unavailable until set
    "openai-compatible": { defaultModel: "llama3.1" },
  },
  tools: {
    debug: { enabled: false, generator: { provider: "anthropic", model: "claude-haiku-4-5-20251001" } },
    // each later spec adds its entry here, e.g.
    // roles: { enabled: true, thresholds: { minShown: 0.10 } },
  },
  timing: { sentenceIdleMs: 1500, documentIdleMs: 8000 },
};
```

## Sentence model (`client/sentence-model.mjs`)

This module turns the Lexical editor state into an ordered list of analysable blocks and sentences, and rebuilds it inside a Lexical `registerUpdateListener`.

- **Blocks:**
  - Top-level paragraphs, headings and list items, plus the text inside `WritingJsxNode`s whose name is in `WRITING_COMPONENTS`.
  - Quote nodes and quote components become blocks with `quoted: true`. They are passed to document-level tools but never annotated.
  - Skip code blocks, `ProtectedNode`s and all other JSX.
- **Sentences:**
  - Split each block's text content with `new Intl.Segmenter("en-GB", { granularity: "sentence" })`. Trim the segments and drop empty ones.
  - Headings are one sentence each.
- **IDs:**
  - `sentence.hash = hash(normalisedText)`, where normalising collapses whitespace.
  - `sentence.id = \`${hash}:${occurrence}\``, where `occurrence` counts identical sentences earlier in the document. This keeps IDs stable across unrelated edits.
  - Blocks get `block.hash` and `block.id` the same way.
- **Ranges:**
  - For each sentence, store enough to build a DOM `Range` on demand: the Lexical text node keys and offsets at its start and end.
  - Expose `rangeFor(sentenceId)` and `rangeForSpan(sentenceId, startChar, endChar)`. The second is for phrase-level annotations such as clichés and links.
  - Ranges are rebuilt after every Lexical update. Never cache DOM nodes across updates.
- **Output shape:**

```js
{ blocks: [{ id, hash, kind: "paragraph"|"heading"|"listitem"|"writing"|"quote", quoted, index, sentences: [{ id, hash, text, index }] }] }
```

- `index` is the block's position among analysable blocks. The UI displays `¶${index + 1}`.
- Expose `changedSince(previousModel)`, which returns the block IDs whose hash changed.

## Scheduler (`client/scheduler.mjs`)

- Each tool module on the client declares `level: "sentence" | "document"`.
- **Sentence level:** when a block's hash changes, mark it dirty. After `sentenceIdleMs` with no edits, send one judge request covering every dirty block, for every enabled sentence-level tool.
- **Document level:** after `documentIdleMs` with no edits, or when a tool asks for a run (for example the drawer opening), send one judge request for the whole document for every enabled document-level tool.
- A new edit to a block aborts any in-flight request that covers it (`AbortController`). The results of an aborted or outdated request are discarded if the hashes they were computed for no longer match.
- Switching a tool on triggers an immediate run. Switching it off clears its annotations.
- The first run after mount analyses the whole document, and sidecar cache hits make it instant.

## Judge route (`POST /_editor/api/assist/judge`)

Request:

```js
{ documentId, tools: ["roles", ...], blocks: [...sentence-model blocks...], scope: "blocks"|"document", blockIds?: [...] }
```

Server flow (`server/judge.mjs`):

1. Look up each tool module in `server/tools/index.mjs`. A tool module has this interface:
   ```js
   {
     id, version,                 // bump version when prompts change (invalidates cache)
     level: "sentence"|"document",
     buildRequests(ctx) → [{ key, state, questions }],   // ctx = { blocks, targetBlockIds, title, config }
     mapAnswers(ctx, key, answers) → Annotation[],
   }
   ```
2. For each built request, compute `cacheKey = hash(tool.id, tool.version, model, JSON(state), JSON(questions))`. Serve cache hits from the sidecar.
3. Send cache misses to Jev through `@typesafe-ai/sdk` (`client.systemOne({ model, state, questions })`), with independent requests in parallel. **Fan out:** put as many questions as possible into a single request against the same state, rather than one request per question.
4. Write new results to the sidecar cache, run `mapAnswers`, and drop annotations that fail the tool's thresholds.
5. Respond with `{ annotations: Annotation[], errors: [{ tool, message }] }`. A failure in one tool never fails the others.

**Jev state conventions**, which every tool follows (see `/concepts/state`, `/cookbooks/semantic_find` and the jaggedness notes):
- State is an object.
- Sentences appear with ID tags in the form `S12| sentence text`, using a short per-request index that maps back to the real sentence ID on the server.
- Include only the context the decision needs: usually the target paragraph, the paragraph before it, and the post title. Irrelevant context lowers accuracy.
- Phrase questions positively and literally. Avoid double negatives.
- Never ask Jev to count, compare dates, or generate text. Do all counting in code.

**Annotation shape** (`shared/annotation.mjs`):

```js
{
  id,              // `${tool}:${target}:${kind}`
  tool, kind,      // e.g. "roles"/"claim", "checks"/"cliche"
  target: { type: "sentence"|"block"|"span", sentenceId?, blockId?, start?, end? },
  unitHash,        // hash of the sentence/block text it was computed on
  confidence,      // 0–1, from Jev
  data,            // tool-specific payload (probabilities, related ids, etc.)
}
```

## Generate route (`POST /_editor/api/assist/generate`)

- Request: `{ tool, purpose, messages: [{ role, content }], system?, json?: boolean, stream?: boolean }`.
- The server picks `provider` and `model` from `assistConfig.tools[tool].generator`, so the client never chooses a model. When `purpose === "chat"` and the tool also defines `chatGenerator`, that one is used instead.
- **Providers** (`server/providers/*`) all implement:
  ```js
  generate({ model, system, messages, json }) → Promise<{ text }>
  stream({ model, system, messages, signal }) → AsyncIterable<string>
  ```
  - `json: true` asks for a single JSON object. The server validates it before responding.
  - `openai-compatible` is the `openai` SDK with `baseURL: LOCAL_LLM_BASE_URL`.
- When `stream: true`, respond with a `text/event-stream` of text chunks. Otherwise respond with JSON `{ text }` or `{ json }`.
- A missing API key gives `503 { error: { code: "provider_unavailable", provider } }`.
- Add a `GET /_editor/api/assist/status` response (in the same route file or a small separate one) reporting which providers and Jev are configured. The Assist panel uses it.

## Sidecar store (`server/sidecar-store.mjs`, route `sidecar.js`)

- The path is `.writing-assist/<collection>/<id>.json`, resolved through the existing `document-index` so that only known document IDs are accepted. Writes use a temp file and a rename, like `file-store.mjs`.
- The file shape:
  ```js
  {
    version: 1,
    documentId,
    dismissals: [{ tool, kind, unitHash, dismissedAt }],
    cache: { [cacheKey]: { answers, model, createdAt } },
  }
  ```
- The route handles `GET ?documentId=` (dismissals only) and `PUT` (add or remove a dismissal). The judge route reads and writes the cache on the server side.
- Cap the cache at about 5,000 entries per document by dropping the oldest `createdAt`.

## Rendering

Rendering must never touch Lexical nodes. Everything is drawn from DOM `Range`s built by the sentence model.

**Highlights** (`overlay/highlights.mjs`):
- Use the CSS Custom Highlight API: `CSS.highlights.set(name, new Highlight(...ranges))`, styled through `::highlight(name)` in `assist.css`.
- Each visual class, for example `wa-role-claim` or `wa-link`, is one named highlight. Rebuild the affected highlights after every Lexical update and every annotation change.
- The highlight API only supports `background-color`, `color` and `text-decoration`. Design within those limits.

**Markers** (`overlay/markers.mjs`):
- An absolutely positioned layer, a sibling of the editor's content-editable inside `.prose-wrapper`, with `pointer-events: none`. Only the markers themselves take pointer events.
- **Margin markers** are 22px circles in the left margin, vertically aligned to the first line box of their target: `range.getClientRects()[0]`, converted into the layer's coordinates. When several markers land on the same line they stack vertically with a 4px gap, in a fixed tool order.
- **End marks** are 17px circles placed just after the last line box of the target sentence.
- Reposition on Lexical update, resize (`ResizeObserver` on the wrapper), and font load. The layer scrolls with the content, so scroll needs no handling.
- Markers are `<button>`s with an `aria-label` such as "Cliché: tip of the iceberg".

**Hit testing** (`overlay/hit-test.mjs`):
- Highlights have no DOM events. Track `pointermove` on the editor root, throttled to animation frames.
- Map the point to a caret position with `document.caretPositionFromPoint`, falling back to `caretRangeFromPoint`, and find the annotation whose range contains it.
- This drives hover cards for sentence-level highlights (roles) and span highlights (links).

## Popover system (`client/popover/*`)

- **HoverCard:**
  - Opens after about 250 ms of hovering a highlight or marker. Closes on leave, with about 150 ms of grace so the pointer can move into the card.
  - Content comes from the tool. No actions and no instructional text.
  - Position it with Floating UI or simple manual positioning against the target's bounding rect, flipping when there isn't room.
- **PinnedPopover:**
  - Opens when a marker or highlight is clicked, if the tool supports pinning. Only one can be open at a time; opening another replaces it.
  - **Header:** tool icon in a coloured circle, title, then **Dismiss** (Phosphor `Trash`, tooltip "Dismiss") and **Close** (Phosphor `X`, `aria-label` "Close") at the top right.
  - **Body:** a slot for the tool's content.
  - **ChatThread** (optional per tool):
    - A thread of messages plus a single-line input with the placeholder "Ask about this sentence…" (the tool can change the wording).
    - Replies stream in from the generate route. The context sent is the post title, the target text, its paragraph, and the tool's reason for flagging it.
    - If a reply contains a `<rewrite>…</rewrite>` block, that text becomes the pending Apply value.
    - The thread lives only in memory and is not saved.
  - **Footer:** a primary **Apply** button at the bottom right, shown only when the tool provides an apply value.
  - Keyboard: Esc closes, focus moves into the popover on open and returns to the target on close.
- **Dismiss** writes to the sidecar (`tool`, `kind`, `unitHash`), removes the annotation immediately, and closes the popover. The annotation store filters out dismissed annotations every time it recomputes.
- **Apply** runs `editor.update()` to replace the target range's text with the new text, then closes the popover.
  - It is only offered when the target range lies entirely within plain text nodes, meaning no links, inline code or wiki tokens. Formatting (bold, italic) inside the range may be lost, and that is acceptable.
  - Autosave picks the change up as normal, and Lexical history makes it undoable.
- Motion: short, subtle fades and scales (about 120–160 ms), and none under `prefers-reduced-motion`.

## Dock: Assist panel and Map button

- Add two buttons to the pill in `editor-dock.mjs`, after a divider:
  - **Assist** (Phosphor `Sparkle` plus the label) toggles the Assist panel.
  - **Map** (Phosphor `TreeStructure` plus the label) toggles the drawer. It is disabled until spec 03 registers a drawer view.
- The **Assist panel** reuses the `.editor-dock-panel` styling and opens above the pill.
  - Grouped switches:
    - **Highlights:** Sentence roles
    - **Markers:** Repetition, Citation needed, Hedging, Objections, Clichés & metaphors, Link suggestions
  - Tools register their own switch. For now, the foundation shows only `debug`, and only when `config.tools.debug.enabled` is set.
  - A tool that is unavailable (missing key, according to `/status`) shows a disabled switch with a short reason ("Needs TYPESAFE_API_KEY").
  - Switch state is saved in `localStorage` under `writing-assist:tools`, inside try/catch. The defaults come from `config.tools[id].enabled`.

## Drawer shell (`client/Drawer.mjs`)

- A right-hand drawer, 360px wide, full viewport height, sliding in over the page. It does not reflow the prose.
- The header holds the title, an optional segmented-control slot for views registered by tools, and a Phosphor `X` close button.
- It exposes `registerDrawerView({ id, label, render })`. Spec 03 registers its Structure and Flow views.
- It also exposes a shared `jumpTo(sentenceId)`: scroll the sentence to about a third of the way down the viewport, place the caret at its start, and briefly pulse its highlight (about 600 ms, not under reduced motion).

## Debug tool (foundation only)

- `server/tools/debug.mjs` asks one Noul per sentence: "Does sentence S{n} mention a colour?"
- The client shows a margin marker (Phosphor `Bug`) on sentences scoring ≥ 0.5.
  - The hover card shows the probability.
  - The pinned popover has chat and an Apply that uppercases the sentence.
- This exercises the whole pipeline: judge, sidecar cache and dismissals, generate with streaming, markers, hover card, pinned popover, Dismiss and Apply. Hide it behind `config.tools.debug.enabled` (default `false`) and leave it in the codebase as a test fixture.

## Tests

- **Unit tests** (`tests/editor/assist-*.test.mjs`, `node --test`):
  - Sentence segmentation of en-GB prose, including abbreviations ("e.g.", "Dr.") and quotes. Hash and occurrence ID stability when an unrelated paragraph changes.
  - The scheduler's debounce, abort and stale-result rejection (fake timers).
  - Judge: cache key stability, cache hit and miss, threshold filtering, one tool failing while others succeed. Use a mocked Jev client with recorded fixture responses.
  - The provider adapters' request shaping (mocked SDKs) and the missing-key error.
  - The sidecar store: atomic write, rejection of unknown document IDs, dismissal round trip, cache cap.
- **E2E** (Playwright, following the existing `playwright.editor.config.mjs`), with the assist routes mocked at the network layer:
  - Turn on `debug` and check a marker appears on the right sentence.
  - Hover shows the card; click pins it.
  - Dismiss removes the marker, and it stays gone after a reload.
  - Apply changes the text and the save status goes back to saved.
  - Esc closes the popover.
  - The drawer opens and closes.
- **Manual check:** run `npm run dev` with real keys, turn on `debug`, and confirm it works against the live Jev and Anthropic APIs.

## Acceptance

- `npm run test:editor` and `npm run test:editor:e2e` pass.
- `npm run build` succeeds and the production output contains no assist code or routes.
- With every tool switched off, the editor behaves exactly as it does today.
- Saved MDX is byte-identical to what the editor produced before this change, whatever annotations are showing.
