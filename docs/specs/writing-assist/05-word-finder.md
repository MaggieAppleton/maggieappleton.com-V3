# 05 · Word finder

Select a word or a whole phrase and get alternatives, ranked by how well they fit the sentence and (optionally) what you mean.

Depends on [00 · Foundation](00-foundation.md).

## Trigger

- Only a **non-collapsed selection** inside a single analysed block can open it: one word or a phrase. It stays hidden for collapsed selections, selections across blocks, and selections over more than about 12 words.
- There are two ways to open it:
  1. A small floating dark pill button labelled **Find words** (Phosphor `MagnifyingGlass` plus the label), placed just above the selection's end. It appears about 300 ms after the selection settles, and disappears when the selection collapses or changes. It reuses the dock pill styling at a smaller size. If MDXEditor already shows a selection toolbar, add the button to it instead of creating a second floating element.
  2. The keyboard shortcut **⌘⇧K** (Ctrl+Shift+K elsewhere). Make sure it doesn't clash with the link shortcut ⌘K that `selection-sync.mjs` already handles.
- This is an on-demand tool, not a background one. It has no Assist panel switch. It's available whenever Jev and its generator are configured.

## Popover

It opens as a pinned popover anchored to the selection.

- **Header:** the title "Find words" and a Close (X) button. **No Dismiss**, because there is nothing to dismiss.
- **Meaning input:** a single-line input with the placeholder "What do you mean?". It's optional and focused on open. Pressing Enter re-runs generation and ranking with the meaning included.
- **Candidates:** up to 6 rows. Each row shows:
  - the candidate in the serif body font, at the body size
  - a short grey gloss under it, 2 to 4 words describing the difference ("gentle longing", "deeper, heavier")
  - a thin sea-blue fit meter on the right, whose width is the candidate's probability divided by the top candidate's probability
- The first row is selected by default. Clicking a row selects it, and double-clicking applies it immediately.
- Arrow keys move the selection. Enter in the list applies. Esc closes.
- **Apply** (bottom right) replaces the selected text with the chosen candidate, following the Apply rule in 00.
- **Loading:** grey shimmer rows. There is no chat in this popover.

## Pipeline

1. **Generate candidates** through the generate route, in JSON mode, with `tool: "word-finder"`.
   - Input: the full sentence with the selection wrapped in `⟦…⟧`, the paragraph, and the meaning if one was given.
   - Output: `{ candidates: [{ text, gloss }] }`, 12 to 15 candidates.
   - If the selection is a single word, candidates are single words or tight compounds. If it's a phrase, candidates are phrases of similar length.
   - Use British English. Don't include the original text.
2. **Rank with Jev** in one request.
   - State: `{ sentence_with_marker, paragraph, intended_meaning? }`.
   - One `choice` question, `best_fit`: `Which replacement for the marked text best fits the sentence and the intended meaning, reading naturally in British English?` The criteria are the candidates keyed `C1…Cn`, with each candidate's text as the value.
   - A second `choice`, `best_fit_meaning`, is sent only when a meaning is given: `Which replacement most precisely expresses: "{meaning}"?` over the same options.
   - The final score is `best_fit` when there's no meaning, and `0.5·best_fit + 0.5·best_fit_meaning` when there is one.
3. Sort by score and show the top 6.

Cache results in memory by the sentence hash, the selection offsets and the meaning.

## Config

```js
"word-finder": { maxShown: 6, generator: { provider: "anthropic", model: "claude-sonnet-5" } }
```

## Tests

- **Unit:**
  - Selection eligibility rules (collapsed, cross-block, word limit).
  - Candidate validation drops duplicates and the original text.
  - Score blending with and without a meaning.
  - The meter is normalised to the top candidate.
- **E2E, with generate and Jev mocked:**
  - Selecting a word shows the Find words button, and clicking it opens the popover with ranked rows.
  - ⌘⇧K opens it too.
  - Typing a meaning and pressing Enter re-ranks the rows.
  - Apply replaces the selection and the file saves.
  - A phrase selection returns phrase candidates.
  - Esc closes and puts focus back in the editor.
