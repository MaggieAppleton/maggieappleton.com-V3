# Sentence-level epistemic linter

## Goal

Replace the linter’s paragraph-row interface with readable article text whose sentences carry independent Jev annotations.

## Data

Split every extracted paragraph into stable sentence units with IDs such as `p3-s2`. Evaluate each sentence independently while supplying its neighbouring sentences as context. Store one `epistemic` row per sentence:

```js
{
  sentenceId: 'p3-s2',
  paragraphId: 'p3',
  kind: Choice,
  needsCitation: Noul,
  qualification: Noul
}
```

The claim-type mark appears only when the chosen type’s probability is at least `0.5`. Citation and qualification marks use their own independent `0.5` thresholds. A sentence can therefore have no type colour but still carry either review mark.

## Interface

Render the selected entry as article-like headings and paragraphs rather than a list of buttons. Each annotated sentence is an inline, keyboard-focusable span.

- Claim type: soft background using the existing seven-colour key.
- Citation needed: crimson wavy underline.
- Qualification needed: amber dotted underline.
- Hover or keyboard focus: a compact tooltip with the chosen type probability, citation probability, and qualification probability.
- Image descriptions retain their visible source label.
- The review selector changes which marks are emphasised without removing surrounding article text.

Low-confidence sentences remain plain. The legend names colours and both line styles. Raw saved evaluations remain available through the existing inspector.

## Boundaries

Sentence splitting is a deterministic shared helper used by generation, validation, and rendering. The UI never calls Jev and never converts paragraph judgements into sentence judgements. Existing garden content is not edited. Regeneration uses the exact-request cache and only the epistemic phase.

## Verification

Test sentence IDs, punctuation preservation, independent thresholds, tooltip text, snapshot completeness, keyboard focus, desktop hover, mobile layout, and no horizontal overflow. Avoid the site’s image-heavy production build; use focused tests and the running dev server.
