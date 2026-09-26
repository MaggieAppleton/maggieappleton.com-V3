# 04 · Margin checks

Five checks share one UI pattern: a coloured circle marker in the left margin, a hover card with a preview, and a pinned popover for resolving the issue, with suggestions, chat and Apply.

Depends on [00 · Foundation](00-foundation.md).

## The checks

| Check | Kind key | Target | Icon (Phosphor) | Colour token |
|---|---|---|---|---|
| Citation needed | `citation` | sentence | `Quotes` | `--color-sea-blue` |
| Hedging mismatch | `hedging` | sentence | `Scales` | `--color-purple` |
| Likely objection | `objection` | sentence | `Question` | `--color-bright-crimson` |
| Cliché / dead metaphor | `cliche` | sentence (with a phrase span once known) | `Recycle` | `--color-dark-sea-blue` |
| Mixed metaphor | `mixed-metaphor` | paragraph (block) | `Shuffle` | `--color-gold` (dark icon for contrast) |

- Tool id `checks`, `level: "sentence"`. It runs on dirty blocks.
- Each check has its own switch, and the enabled checks decide which questions are asked.
- **Marker stack order**, when several markers land on one line: citation, hedging, objection, cliché, mixed metaphor. Block-level markers align to the paragraph's first line.
- Quoted blocks and headings are never checked.

## Jev (one request per dirty block, fan-out)

- State:
  ```js
  { title, previous_paragraph, paragraph: "S1| …\nS2| …", links_in_paragraph: ["S2", …] }
  ```
  `links_in_paragraph` lists the sentences that already contain a link or footnote, detected in code from the Lexical nodes.
- Questions per sentence `S{n}`, sent only for the checks that are switched on:

| Key | Type | Instructions / criteria |
|---|---|---|
| `cite_S{n}` | noul | `Does S{n} state a specific factual or empirical claim that a careful reader would expect to be backed by a source?` |
| `certainty_S{n}` | score | `How certain is the wording of S{n}?` Levels 1–5: 1 "very tentative (might, perhaps, possibly)", 2 "hedged", 3 "neutral", 4 "confident", 5 "absolute (always, never, clearly, everyone)" |
| `contested_S{n}` | score | `How contested or uncertain is the idea in S{n} among informed people?` Levels 1–5: 1 "settled fact", 2 "widely accepted", 3 "debated", 4 "contested", 5 "highly speculative" |
| `objection_S{n}` | noul | `Would a sceptical expert reading S{n} immediately want to push back on it?` |
| `cliche_S{n}` | noul | `Does S{n} contain a cliché, stock phrase, or dead metaphor?` |

- Plus one question per block, `mixed_metaphor`: a `noul` asking `Does this paragraph combine two or more incompatible metaphors?`

### Mapping to annotations (code)

- **citation:** flag when `cite ≥ thresholds.citation` (default 0.7) **and** the sentence is not in `links_in_paragraph`.
  - Confidence is `cite`.
  - `data.reason` is the fixed text "This reads as a factual claim without a source."
- **hedging:** `gap = certainty.score − contested.score`, using each Score's probability-weighted value.
  - `gap ≥ +2`: `data.direction = "overclaiming"`.
  - `gap ≤ −2`: `data.direction = "over-hedging"`.
  - Only flag when both answers' `confidence ≥ thresholds.hedgingConfidence` (default 0.5).
  - Confidence is the minimum of the two confidences.
- **objection:** flag when `objection ≥ thresholds.objection` (default 0.7).
- **cliche:** flag when `cliche ≥ thresholds.cliche` (default 0.75). The phrase span isn't known yet (see below).
- **mixed-metaphor:** flag the block when `mixed_metaphor ≥ thresholds.mixedMetaphor` (default 0.75).

Keep the thresholds deliberately high. Unnecessary flags cost more than missed ones.

## Generation (on demand only)

Everything here uses the generate route, with `tool: "checks"` and `purpose` set to the kind. It is triggered on **hover** (for the card) and cached in memory per `annotation.id` + `unitHash`, so the pinned popover reuses the result.

- **cliche**, JSON mode: given the sentence, return `{ phrase: "<exact substring>", reason: "<one short sentence>", suggestions: ["…", "…", "…"] }`.
  - Validate that `phrase` is an exact substring of the sentence, then set the annotation's `target` to the span (`start`, `end`) and underline it with a thin `--color-dark-sea-blue` highlight (`wa-cliche`).
  - Suggestions are replacements for the phrase only, not the whole sentence, and use British English.
- **hedging**, JSON mode: given the sentence and its direction, return `{ reason, rewrites: ["…", "…", "…"] }`. The rewrites recalibrate the certainty and otherwise keep the meaning and voice.
- **objection**, JSON mode: return `{ objection: "<the strongest objection in one or two sentences>" }`.
- **citation:** no generation on hover. The fixed reason is enough. Chat is available once pinned.
- **mixed-metaphor**, JSON mode: return `{ metaphors: ["…", "…"], reason }`, naming the clashing metaphors.

The system prompt for all of these: write in British English, match the author's plain, conversational voice, never add new claims, and keep suggestions short.

## Hover card (all checks)

- **Header:** the check's icon in its coloured circle, then the check name ("Cliché", "Hedging · overclaiming", "Likely objection", "Citation needed", "Mixed metaphor"). No confidence percentage and no actions.
- **Body:**
  - The reason in grey.
  - **cliche:** the first 2 suggestions as outlined rows.
  - **hedging:** the first rewrite.
  - **objection:** the objection text.
  - **mixed-metaphor:** the metaphors, listed.
- While generation is pending, show a single grey shimmer line. No text like "loading".

## Pinned popover (all checks)

- The standard header: icon, name, **Dismiss** (trash) and **Close** (X).
- Body by check:
  - **cliche:**
    - The reason, then all 3 suggestions as selectable rows. The first is selected by default, with a `--color-sea-blue` border.
    - Chat input.
    - **Apply** replaces the phrase span with the selected suggestion.
  - **hedging:**
    - The reason, then the 3 rewrites as selectable rows. Chat input.
    - **Apply** replaces the whole sentence with the selected rewrite.
  - **objection:**
    - The objection text, then chat, with the placeholder "Ask about this sentence…".
    - **Apply** appears only once a chat reply contains a `<rewrite>` for the sentence.
  - **citation:**
    - The reason, then chat, where Maggie can ask what kind of source would support the claim.
    - **No Apply.**
    - The chat system prompt must tell the model **never to invent specific citations, titles, URLs or statistics**. It may describe what kind of source to look for.
  - **mixed-metaphor:**
    - The metaphors and reason, then chat.
    - **Apply** appears when a reply contains a `<rewrite>`, which replaces the **whole paragraph** (only when the paragraph is all plain text, per the Apply rule in 00).
- If a chat reply's `<rewrite>` arrives while suggestion rows are showing, it becomes a new selected row at the top labelled "From chat".

## Assist panel

Adds four switches under "Markers": **Citation needed**, **Hedging**, **Objections**, and **Clichés & metaphors**. The last one controls both the cliché and mixed-metaphor checks. All four are on by default.

## Config

```js
checks: {
  enabled: { citation: true, hedging: true, objection: true, cliche: true },
  thresholds: { citation: 0.7, hedgingConfidence: 0.5, objection: 0.7, cliche: 0.75, mixedMetaphor: 0.75 },
  generator: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },       // hover suggestions
  chatGenerator: { provider: "anthropic", model: "claude-sonnet-5" },             // pinned chat
}
```
## Tests

- **Unit:**
  - Question building only includes enabled checks.
  - Citation is suppressed when the sentence has a link.
  - The hedging gap maths in both directions, and the confidence gate.
  - Thresholds are applied.
  - The cliché phrase is validated as an exact substring. If it isn't one, no span is set and no Apply is shown.
  - `<rewrite>` parsing.
- **E2E, with Jev and generate mocked:**
  - Each check's marker appears with the right icon and colour.
  - Two checks on one sentence stack in the documented order.
  - Hovering a cliché shows 2 suggestions and underlines the phrase.
  - Pin, pick the second suggestion, Apply: the phrase is replaced and the file saves.
  - Objection: Apply only appears after a mocked chat reply containing `<rewrite>`.
  - Citation never shows Apply.
  - Dismiss persists across a reload.
