# 06 · Link suggestions

Spots phrases in the draft that could link to other content on the site and underlines them with a dotted line. Applying a suggestion wraps the phrase in a standard Markdown link, `[phrase](/pathname)`, which the site already renders with its rich preview tooltip.

This spec **does not** create `[[wiki links]]`. They may be retired separately, and that's out of scope here.

Depends on [00 · Foundation](00-foundation.md).

## Link targets

- The source is `src/internal-link-previews.json`: a map from pathname to `{ title, description, aliases? }`.
- Load it on the server, in the judge route's tool module, and reload it when the file changes (by checking its mtime on each run).
- Exclude:
  - the current document's own pathname
  - `/`, `/about` and other non-content pages (keep only paths that belong to the notes, essays, patterns, talks, smidgeons and similar content collections; adapt this to how the JSON is actually keyed)
  - targets the document already links to anywhere
- **Growth stage:** if the preview data has no stage, look it up from the content collection frontmatter on the server. The popover shows the stage when it's known and leaves it out when it isn't.

## Pipeline

- Tool id `links`, `level: "document"`. It runs after `documentIdleMs`.
- It only works on non-heading, non-quoted blocks.

For each block that changed since the last run:

1. **Shortlist (code).**
   - Score every target against the block text with BM25, or simple TF-IDF, over `title + aliases + description`. Use en-GB lower-casing and strip stop words.
   - Keep the top 30 targets with a score above zero. If none, skip the block.
2. **Pick a target (Jev), one request per block.**
   - State: `{ paragraph, candidates: "T1| Title: description\nT2| …" }`.
   - `target`: a `choice` over `none` plus `T1…T30`. Instructions: `Which of these pages is the paragraph explicitly discussing, such that a reader would benefit from a link to it? Choose "none" if the paragraph only touches the topic in passing.`
   - Keep the top 2 targets whose probability is ≥ `thresholds.target` (default 0.4). If `none` wins, skip the block.
3. **Pick a phrase (code, then Jev)**, following the pre-parsed extraction pattern.
   - Code lists candidate spans in the block: n-grams of 1 to 6 words that start and end on a word boundary, don't cross sentence punctuation, aren't already inside a link, and don't begin or end with a stop word. Cap the list at 200, preferring spans that share words with the target's title or aliases.
   - Jev asks `phrase`: a `choice` over the spans (`N1…Nn`), with the instructions `Which phrase in the paragraph would best carry a link to "{title}"?`. Add a companion `noul`, `natural`: `Would linking this phrase to "{title}" read naturally to a reader?`
   - Accept the top span if its probability is ≥ `thresholds.phrase` (default 0.35) and `natural ≥ 0.5`.
4. **Deduplicate.** Suggest each target only once per document, at its first qualifying occurrence. Two suggestions can never overlap. If they do, keep the one with the higher target probability.

`mapAnswers` returns one annotation per accepted suggestion:

```js
{ tool: "links", kind: "link", target: { type: "span", sentenceId, start, end }, confidence, data: { targets: [{ pathname, title, description, stage? }] } }
```

- `data.targets` holds the accepted target plus the runner-up, if one passed. The first is the default.
- **Dismissal key:** `unitHash` is the hash of the sentence text, and `kind` is `link:${pathname}`, so dismissing one target doesn't hide a different target on the same sentence.

## Display

- A dotted underline on the phrase, in `--color-purple`, from the named highlight `wa-link`:
  ```css
  ::highlight(wa-link) { text-decoration: underline dotted var(--color-purple); text-decoration-thickness: 2px; text-underline-offset: 4px; }
  ```
  It must look right on top of a role tint.
- The hover card (from hit testing on the span) has the title "Link to" and, for each target, an outlined card with:
  - the growth stage, as a small uppercase coloured label, if known
  - the title in the serif font
  - a one-line description, truncated
- Click the underlined phrase to open the pinned popover:
  - **Header:** "Link to", Dismiss (trash) and Close (X).
  - **Body:** the same target cards, selectable, with the first selected and a purple border on the selected card.
  - **No chat.**
  - A primary button in the bottom right labelled **Link**. It wraps the span in a Lexical link node with `url = pathname` and the phrase text left unchanged, then closes. This is the Apply action for this tool.
- Link insertion uses the editor's existing link support (`linkPlugin` / `@lexical/link`) so it serialises as `[phrase](/pathname)`. Check the saved MDX in the E2E test.

## Assist panel

Adds the switch **Link suggestions** under "Markers". It is off by default, because it's a finishing pass and more distracting while drafting.

## Config

```js
links: { enabled: false, shortlistSize: 30, thresholds: { target: 0.4, phrase: 0.35, natural: 0.5 } }
```

## Tests

- **Unit:**
  - Target exclusion (self, already linked, non-content pages).
  - BM25 shortlist ordering on a fixture.
  - The span enumerator's rules: no crossing punctuation, no spans already linked, no stop-word edges, the cap.
  - One suggestion per target, and no overlaps.
  - The dismissal key includes the pathname.
- **E2E, with Jev mocked:**
  - The phrase gets a dotted underline.
  - Hovering shows the target card.
  - Pin and Link: the saved file contains `[end-user programming](/end-user-programming)`, and the phrase text is unchanged.
  - Dismiss persists.
  - The switch is off by default.
