# 03 · Argument map

A right-hand drawer that shows the argument's structure in two views, toggled by a segmented control:

- **Structure:** a tree of thesis, claims, and their support.
- **Flow:** a paragraph-by-paragraph spine in reading order.

Clicking any item jumps to that sentence in the editor.

Depends on [00 · Foundation](00-foundation.md) (drawer shell, `jumpTo`) and [01 · Sentence roles](01-sentence-roles.md).

## The model: what Jev decides and what code builds

Jev answers narrow questions. Code assembles the tree.

- Tool id `argument-map`, `level: "document"`.
- It runs when the drawer opens, and after `documentIdleMs` while the drawer is open. **It does not run while the drawer is closed.**
- The state and questions below are for **non-quoted, non-heading blocks**. Headings appear in the Flow view as section dividers. Quoted blocks are included in the state, marked `[quote]`, and count as evidence.

### Request A: thesis and paragraph jobs (one request)

- State:
  ```js
  { title, paragraphs: "P1| full text\nP2| …" }
  ```
  If the document is too large to send in full, send each paragraph's first two sentences plus its main sentence (see Request B).
- Questions:
  - `thesis_paragraph`: `choice` over `P1…Pn`, with the instructions `Which paragraph states the central thesis of the whole piece?`
  - For each paragraph, `job_P{i}`: a `choice` asking `What job does paragraph P{i} do in the overall argument?` The options:
    - `thesis`: states the central thesis
    - `claim`: makes a main supporting claim
    - `support`: gives evidence or examples for a claim made elsewhere
    - `concession`: acknowledges or answers a counterpoint
    - `framing`: introduction, context, transition, or conclusion
    - `off_thread`: a tangent that does not advance the thesis
  - For each paragraph `P{i}` with `i ≥ 2`, `parent_P{i}`: a `choice` asking `Which earlier paragraph does P{i} most directly support, develop, or respond to?` The options are `none` plus `P1…P{i-1}`, capped at 255 nearest.
  - For each paragraph, `advances_P{i}`: a `noul` asking `Does P{i} advance the central thesis of the piece?`

### Request B: the main sentence of each paragraph (one request, fan-out)

- State: `{ paragraphs }`, with every sentence tagged `P{i}.S{j}| …`.
- For each paragraph, `main_P{i}`: a `choice` over that paragraph's sentence tags, asking `Which sentence carries the main point of paragraph P{i}?`

Requests A and B run in parallel.

### Assembly (code)

- **Thesis node:** the main sentence of `thesis_paragraph`'s winner.
- **Paragraph nodes:** each paragraph becomes a node labelled with its main sentence text. Its `job` and `parent` come from the answers above.
  - If `parent` is `none` or has probability below `thresholds.parent` (default 0.4), attach the node to the thesis. The exception is `framing` and `off_thread` nodes, which stay unattached.
  - A paragraph is **off-thread** if its job is `off_thread`, or if `advances < thresholds.advances` (default 0.35) and its job is not `framing`.
- **Sentence-level support:** inside every `claim` or `thesis` paragraph, the sentences whose role (spec 01) is `evidence` or `example` become child leaves of that paragraph's node, shown with a role swatch.
- **Unsupported claim:** a `claim` node with no `support` child paragraphs and no evidence or example leaves. The UI marks it "No supporting evidence".
- Ties and low confidence: use the highest-probability answer. Never show probabilities in the map.

Cache results through the judge route as normal. Only re-run requests whose state changed.

## Drawer UI

- Registers two drawer views, **Structure** and **Flow**, with `registerDrawerView`. The segmented control sits in the drawer header between the title "Argument" and the X button. The last-used view is remembered in `localStorage` (`writing-assist:map-view`).
- The dock's **Map** button toggles the drawer.
- Every node row is a button. Clicking it calls `jumpTo(mainSentenceId)` (for leaves, the leaf sentence). Hover gives a subtle background. The drawer stays open.
- Loading: the first run shows a quiet skeleton of three or four grey bars, with no spinner text. Later runs keep the old map visible and swap in the new one in place.
- Empty state: if there are fewer than 3 analysed paragraphs, show a single short line, "Not enough to map yet."

### Structure view

- An indented tree. Each child level is indented 14px, with a 1px `--color-gray-200` guide line on the left.
- The root row is the **thesis**, on a salmon tint background (`--color-salmon` at about 14%), with its paragraph label on the right.
- Each row: an 8px role swatch (the colour of its main sentence's role from spec 01), the label (main sentence text, clamped to 2 lines), and `¶{n}` right-aligned in small grey text.
- Children of a node: its child paragraphs in document order, then its evidence and example leaves.
- An unsupported claim gets a child row "⚠ No supporting evidence" in `--color-bright-crimson`. The row is not clickable.
- At the bottom, a muted row "Off-thread: ¶6, ¶13". Each label is a clickable link to that paragraph.

### Flow view

- One row per analysed paragraph, in reading order, separated by 1px dividers. Headings appear as small uppercase grey section dividers.
- Each row has:
  - Left column: `¶{n}`, small and grey.
  - The job label, uppercase and small, coloured to match its role family: thesis and claim salmon, support green, concession teal, framing grey, off-thread muted grey.
  - After the label, a small grey relation: `→ supports ¶{parent}`, or for concessions, `↩ answers ¶{parent}`.
  - An `· unsupported` flag in crimson where it applies.
  - The main sentence text, clamped to 2 lines. Off-thread rows use muted text.
  - A **role strip**: a row of small bars, one per sentence in the paragraph, coloured by role (tints as in spec 01, at a slightly stronger mix), with a maximum width of about 120px.
- Clicking a row jumps to the paragraph's main sentence.

## Assist panel

The map is controlled by the dock's Map button, not a switch. Once this spec lands, the Map button is enabled.

## Config

```js
"argument-map": { thresholds: { parent: 0.4, advances: 0.35 } }
```

## Tests

- **Unit, pure assembly** (with fixture Jev answers):
  - The thesis is chosen correctly.
  - A low-confidence parent falls back to the thesis.
  - Framing and off-thread nodes stay unattached.
  - Evidence and example sentences become leaves.
  - An unsupported claim is detected.
  - Off-thread uses the `advances` threshold.
  - Off-thread and framing paragraphs are never flagged unsupported.
- **E2E, with Jev mocked:**
  - The Map button opens the drawer and Structure renders the expected tree.
  - The toggle switches to Flow, and the choice is remembered after a reload.
  - Clicking a row moves the caret to the right sentence.
  - Editing while the drawer is open updates the map in place after the idle delay.
  - Nothing is requested while the drawer is closed.
