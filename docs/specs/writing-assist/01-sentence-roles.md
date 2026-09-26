# 01 · Sentence roles

Every analysed sentence gets a soft colour tint showing the job it does in the argument. Hovering a sentence shows the split between roles, for example "60% Opinion, 30% Claim".

Depends on [00 · Foundation](00-foundation.md).

## Roles

The order below is fixed. It sets the tie-break rule and the legend order.

| # | Role | Key | Meaning (also the Jev option description) | Token |
|---|------|-----|--------------------------------------------|-------|
| 1 | Claim | `claim` | Asserts that something is true about the world | `--color-salmon` |
| 2 | Opinion | `opinion` | A value judgement, preference or personal stance | `--color-gold` |
| 3 | Evidence | `evidence` | Data, research findings, or a cited source | `--color-status-success` |
| 4 | Example | `example` | A concrete instance, case, or anecdote | `--color-sea-blue` |
| 5 | Qualification | `qualification` | Limits, narrows or adds conditions to a claim | `--color-purple` |
| 6 | Speculation | `speculation` | A possibility, prediction, or "what if" | `--color-bright-crimson` |
| 7 | Concession | `concession` | Acknowledges a counterpoint or limitation of the author's view | mix of `--color-dark-sea-blue` and `--color-status-success` (teal) |
| 8 | Framing | `framing` | Context, definition, signposting, or transition | `--color-gray-400` |

## Jev

- Tool id `roles`, `level: "sentence"`.
- **One request per dirty block.**
  - State:
    ```js
    { title, previous_paragraph, paragraph: "S1| …\nS2| …" }
    ```
    `previous_paragraph` is untagged context.
  - Questions: one `choice` per sentence, keyed `role_S{n}`.
    - Instructions: `What job does sentence S{n} do in this paragraph's argument?`
    - Criteria: the 8 role keys, each with its meaning from the table.
- Headings are skipped. They get no role.
- `mapAnswers` returns one annotation per sentence:
  ```js
  { tool: "roles", kind: <assigned role>, target: { type: "sentence", sentenceId }, confidence, data: { probabilities } }
  ```

**Assigned role** is the role with the highest probability. **On an exact tie**, use the role that comes first in the table order. Never show an "uncertain" or "mixed" state: every analysed sentence gets exactly one colour.

## Display

- Each role is one named highlight, `wa-role-<key>`, with this style:
  ```css
  ::highlight(wa-role-claim) { background-color: color-mix(in srgb, var(--color-salmon) 20%, transparent); }
  ```
- Gold is a pale token, so use about 44% for it to reach the same visual weight. Tune it by eye so all eight look equally soft.
- Tokens come from `src/global.css`, so dark mode follows automatically. Check the dark-mode result and raise the dark mix by a few percent if a tint disappears.
- Quoted blocks and headings get no tint.

## Hover card

- A compact card, about 200px wide.
- One row per role at **≥ 10%** probability, sorted from highest to lowest.
- Each row: a coloured bar (width proportional to the probability, in the role's colour at full strength), then the percentage (tabular numerals, rounded), then the role name.
- Roles under 10% are **not shown at all**: no "Other" row. The shown percentages don't need to add up to 100.
- No title, actions or instructional text.
- Roles don't pin. Clicking a role-tinted sentence just places the caret, as normal.

## Assist panel

- Adds the switch **Sentence roles** under "Highlights". It is on by default.
- When the switch is on, the panel also shows a legend: a small swatch and name for each of the eight roles, in table order.

## Config

```js
roles: { enabled: true, thresholds: { minShown: 0.10 } }
```

## Exported for other tools

Expose `getRole(sentenceId) → { role, probabilities } | null` from the client annotation store. Specs 02 and 03 use it.

## Tests

- **Unit:**
  - Question building (tag mapping, one choice per sentence).
  - `mapAnswers` tie-break: `{ opinion: 0.5, claim: 0.5 }` gives `claim`, and `{ example: 0.4, evidence: 0.4, … }` gives `evidence`.
  - Hover rows filter out anything under 10%.
- **E2E, with Jev mocked:**
  - A paragraph of three sentences gets three different tints (assert with `CSS.highlights.get(...)` range counts).
  - Hovering shows the expected rows.
  - Editing one sentence re-analyses only that paragraph.
  - Switching roles off clears every highlight.
