# Post-level garden-tending report

## Goal

Experiment 5 should answer: “What should I fix or review on each post?” Each post appears once, with all of its recommendations gathered into a single expandable report.

## Information model

Replace the flat `finding` queue with post reports:

```js
{
  doc,
  recommendations: [{ id, category, label, origin, detail }]
}
```

Only posts with at least one recommendation appear. Recommendations retain their existing deterministic checks and saved Jev judgements, but are grouped into reader-facing categories:

- **Metadata:** missing description or weak title/description fit.
- **Classification:** growth-stage mismatch or suggested topics.
- **Connections:** no inbound links or suggested article relationships.
- **Freshness:** post has not been reviewed for more than two years.

`origin` remains `code` or `jev`, but is shown as secondary provenance beside an individual recommendation. It is not a top-level organizing concept.

## Interface

The section description explains that this is a post-by-post maintenance report and that it does not edit content.

Controls:

- Search label: **Find a post**.
- Category filter: **All recommendations**, **Metadata**, **Classification**, **Connections**, **Freshness**.
- Sort: **Most recommendations** or **Post title**.

The summary reports the number of posts needing review, not the number of flattened findings.

Each post is one expandable row. Its collapsed state shows the title, recommendation count, and category summary. Expanding it reveals every matching recommendation grouped by category. Each recommendation includes its concise action, a small `Rule` or `Jev` provenance label, and relevant confidence when one exists. The article link and raw inspector remain available inside the expanded report.

Changing the category filter keeps a post visible only when it has a recommendation in that category and shows only matching recommendations inside it. Search matches the post title and recommendation labels. Expansion does not navigate or change any source content.

## Ordering and states

The default order is descending recommendation count, then alphabetical title. No urgency score is invented. Title sorting is alphabetical.

The first 15 post reports render initially; **Show 15 more** extends the list. Empty search/filter results say that no posts match. Missing optional probability data omits the confidence reading rather than inventing one.

## Accessibility and responsive behavior

Expandable rows use native buttons with `aria-expanded` and an associated report region. Category headings preserve a readable hierarchy. All actions are keyboard accessible. On narrow screens, counts and category summaries wrap below the post title without horizontal overflow.

## Data and scope

This redesign uses the existing saved snapshot and deterministic checks. It does not call Jev again, add recommendations, change garden content, or alter Experiments 1–4.

## Verification

- Unit-test report grouping: one report per post and no duplicate document IDs.
- Test category assignment, filtering, default ordering, and alphabetical ordering.
- Server-render the component to verify one expandable control per report, accessible relationships, and provenance labels.
- Browser-check search, filters, sorting, expansion, normal layout, and 375×812 layout.
- Run `npm run test:jev`, `npm run jev:check`, and `git diff --check`. Do not run the image-heavy production build.
